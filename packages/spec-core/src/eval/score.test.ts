import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scoreRun } from './score';
import { runPipeline } from './runner';
import type { PipelineOutcome } from './runner';
import type { LlmAdapter } from './llm/adapter';
import { EVAL_TASKS } from './tasks';
import type { EvalTask, EvalTaskId } from './tasks';
import type { SpecBundle } from '../schemas';

const NOW = '2026-08-18T12:00:00Z';

const PET_CLINIC = JSON.parse(
  readFileSync(join(__dirname, '../../fixtures/good/pet-clinic/bundle.json'), 'utf8'),
) as SpecBundle;

function task(id: EvalTaskId): EvalTask {
  const t = EVAL_TASKS.find((x) => x.id === id);
  if (!t) throw new Error(`unknown task ${id}`);
  return t;
}

function baseBundle(): SpecBundle {
  // pet-clinic adapted for ET-01 semantics: p-mini greenfield, 3 requirements,
  // 3 tasks (TASK-0001..0003) each referencing REQ-0001..0003 → full trace.
  const b = structuredClone(PET_CLINIC);
  b.manifest.project = { name: 'url-shortener-cli', mode: 'greenfield' };
  b.manifest.complexity_profile = 'p-mini';
  return b;
}

function specOutcome(bundle: SpecBundle, variant: PipelineOutcome['variant'] = 'single'): PipelineOutcome {
  return { kind: 'spec', variant, bundle, usage: { in: 10, out: 5, calls: 1 } };
}

function blockedOutcome(variant: PipelineOutcome['variant'] = 'single'): PipelineOutcome {
  return { kind: 'blocked', variant, reasons: ['L08_UNRESOLVED_LEAK [DEC-0001]: decision still UNRESOLVED'], usage: { in: 10, out: 5, calls: 1 } };
}

const U = { in: 10, out: 5, calls: 1 };

describe('scoreRun — arithmetic over all six assertion types', () => {
  it('greenfield ET-01 with a clean spec outcome scores 3/3 and blockedCorrectly true', () => {
    const s = scoreRun(task('ET-01'), specOutcome(baseBundle()), U);
    expect(s).toEqual({
      taskId: 'ET-01',
      variant: 'single',
      assertionsPassed: 3,
      assertionsTotal: 3,
      blockedCorrectly: true,
      councilDegraded: false,
      inTokens: 10,
      outTokens: 5,
      calls: 1,
    });
  });

  it('blocked ET-13 scores 2/2 (BLOCKED + STATE_IS_DRAFT_OR_BLOCKED both pass without a bundle)', () => {
    const s = scoreRun(task('ET-13'), blockedOutcome(), U);
    expect(s).toEqual({
      taskId: 'ET-13',
      variant: 'single',
      assertionsPassed: 2,
      assertionsTotal: 2,
      blockedCorrectly: true,
      councilDegraded: false,
      inTokens: 10,
      outTokens: 5,
      calls: 1,
    });
  });

  it('(e) ET-01 blocked by a garbage mock → blockedCorrectly false, 0/3 assertions', async () => {
    const garbage: LlmAdapter = {
      complete: async () => ({ text: 'garbage, not json' }),
    };
    const out = await runPipeline(task('ET-01'), 'single', garbage, NOW);
    const s = scoreRun(task('ET-01'), out, out.usage);

    expect(s.blockedCorrectly).toBe(false);
    expect(s.assertionsTotal).toBe(3);
    expect(s.assertionsPassed).toBe(0); // HAS_REQUIREMENTS / ACYCLIC / VERIFICATION all need a spec
  });

  it('BLOCKED assertion fails when a must-be-blocked task yields a spec', () => {
    // ET-13 assertions: [BLOCKED, STATE_IS_DRAFT_OR_BLOCKED]; draft state passes STATE,
    // but the pipeline failed to block → BLOCKED false, blockedCorrectly false.
    const s = scoreRun(task('ET-13'), specOutcome(baseBundle()), U);
    expect(s.assertionsTotal).toBe(2);
    expect(s.assertionsPassed).toBe(1);
    expect(s.blockedCorrectly).toBe(false);
  });

  it('STATE_IS_DRAFT_OR_BLOCKED fails on a spec whose manifest state is reviewed', () => {
    const b = baseBundle();
    b.manifest.state = 'reviewed';
    const s = scoreRun(task('ET-13'), specOutcome(b), U);
    expect(s.assertionsPassed).toBe(0); // BLOCKED false (spec) + STATE false (reviewed)
  });

  it('HAS_REQUIREMENTS fails below min (ET-07 needs 4, bundle has 3)', () => {
    // ET-07 (p-standard): HAS_REQUIREMENTS min 4 fails, TASKS_ACYCLIC and
    // TASKS_HAVE_VERIFICATION pass, TRACE_REQ_TASK_COVERED passes (3/3 reqs covered).
    const s = scoreRun(task('ET-07'), specOutcome(baseBundle()), U);
    expect(s.assertionsTotal).toBe(4);
    expect(s.assertionsPassed).toBe(3);
    expect(s.blockedCorrectly).toBe(true);
  });

  it('TASKS_ACYCLIC fails when depends_on contains a cycle', () => {
    const b = baseBundle();
    const t2 = b.tasks.find((t) => t.task_id === 'TASK-0002')!;
    const t3 = b.tasks.find((t) => t.task_id === 'TASK-0003')!;
    t2.depends_on = ['TASK-0003'];
    t3.depends_on = ['TASK-0001', 'TASK-0002'];
    const s = scoreRun(task('ET-01'), specOutcome(b), U);
    expect(s.assertionsPassed).toBe(2); // HAS_REQUIREMENTS + VERIFICATION only
  });

  it('TASKS_HAVE_VERIFICATION fails on an empty verification list (explicit check)', () => {
    const b = baseBundle();
    b.tasks[0]!.verification = [];
    const s = scoreRun(task('ET-01'), specOutcome(b), U);
    expect(s.assertionsPassed).toBe(2); // HAS_REQUIREMENTS + ACYCLIC only
  });

  it('TRACE_REQ_TASK_COVERED fails when one requirement has no req-task edge', () => {
    const b = baseBundle();
    const t3 = b.tasks.find((t) => t.task_id === 'TASK-0003')!;
    t3.refs.requirements = []; // REQ-0003 loses its only covering task
    const s = scoreRun(task('ET-08'), specOutcome(b), U);
    // ET-08: HAS_REQUIREMENTS(min 4, have 3) false, ACYCLIC true, VERIFICATION true, TRACE false
    expect(s.assertionsTotal).toBe(4);
    expect(s.assertionsPassed).toBe(2);
  });

  it('TRACE_REQ_TASK_COVERED fails vacuously-empty requirement sets (nothing to cover)', () => {
    const b = baseBundle();
    b.requirements = [];
    const s = scoreRun(task('ET-07'), specOutcome(b), U);
    expect(s.assertionsPassed).toBe(2); // ACYCLIC + VERIFICATION only
  });

  it('copies usage and variant through to the score', () => {
    const outcome = specOutcome(baseBundle(), 'council');
    const s = scoreRun(task('ET-01'), outcome, { in: 60, out: 30, calls: 3 });
    expect(s.variant).toBe('council');
    expect(s.inTokens).toBe(60);
    expect(s.outTokens).toBe(30);
    expect(s.calls).toBe(3);
  });

  // BACK-008: the degraded-council flag on the outcome must reach the score —
  // the gate report renders it so a collapsed independent-proposal leg cannot
  // masquerade as a full council run.
  it('maps councilDegraded from the outcome onto the score (both kinds; false when absent)', () => {
    const specDegraded = specOutcome(baseBundle(), 'council');
    specDegraded.councilDegraded = true;
    expect(scoreRun(task('ET-01'), specDegraded, U).councilDegraded).toBe(true);

    const blockedDegraded = blockedOutcome('council');
    blockedDegraded.councilDegraded = true;
    expect(scoreRun(task('ET-13'), blockedDegraded, U).councilDegraded).toBe(true);

    expect(scoreRun(task('ET-01'), specOutcome(baseBundle(), 'council'), U).councilDegraded).toBe(false);
    expect(scoreRun(task('ET-13'), blockedOutcome('council'), U).councilDegraded).toBe(false);
  });
});
