import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { SpecBundleSchema } from '../schemas';
import type { SpecBundle } from '../schemas';
import { lintBundle } from '../lint/engine';
import { freeze } from '../compiler/freeze';
import { verifyFrozen } from '../compiler/verify';
import { scoreRun } from './score';
import type { RunScore } from './score';
import { EVAL_TASKS } from './tasks';
import type { EvalTask } from './tasks';
import { runPipeline } from './runner';
import type { PipelineVariant } from './runner';
import { createMockLlm } from './llm/mock';
import type { MockScript } from './llm/mock';
import { createHttpLlm } from './llm/http';
import { renderGateReport } from './render';
import { gateVerdict } from './gate';
import type { BadFixtureCapture, GateReportInput, GateVerdict } from './gate';

/**
 * Evidence-gate eval DRIVER (Task 11 binding): runs the corpora, captures the
 * fixtures, and orchestrates the report — the pure half of the old monolith
 * lives next door: gate COMPUTATION in ./gate.ts (calcs/verdict as data) and
 * RENDERING in ./render.ts (the markdown emitter). This module re-exports
 * both, so every existing `from './report'` import (run-eval.ts, the tests)
 * keeps resolving unchanged.
 *
 * PROD-003 honesty labels: the report separates structural passes from
 * intent-fidelity passes, aggregates per-task outcomes ACROSS repeats with
 * spread (mean/min/max), lists named intent misses, carries an explicitly
 * advisory (never gated) inventions section, and states what G4 does NOT
 * establish.
 *
 * Determinism: the mock path is a pure function of its input — no clock, no
 * randomness, no environment reads. `runEvalAll('live')` is the sole place a
 * clock is consulted (the runner's nowIso for live prompts); the timestamp
 * never reaches the rendered report. Repeated runs with MOCK adapters are
 * deterministic-by-construction (the scripts cannot vary); the repeats
 * mechanism exists for LIVE runs, where run-to-run variance is real.
 */

// --- stable re-export surface (the old report.ts owned these) -----------
export { gateVerdict, G1_REQUIRED_TOTAL } from './gate';
export type { BadFixtureCapture, GateReportInput, GateVerdict } from './gate';
export { renderGateReport } from './render';

/** Fixed timestamps so mock evidence and fixture capture are byte-reproducible. */
const MOCK_NOW = '2026-08-18T12:00:00Z';
const FIXTURE_FREEZE_NOW = '2026-08-18T00:00:00Z';

const FIXTURES_ROOT = join(__dirname, '../../fixtures');
const BAD = join(FIXTURES_ROOT, 'bad');
const GOOD = join(FIXTURES_ROOT, 'good');

/** Per-profile good-fixture pools for mock script derivation (kept profile-consistent so derived bundles lint clean). */
const P_MINI_FIXTURES = ['embed-cli', 'pet-clinic'] as const;
const P_STANDARD_FIXTURES = ['session-service', 'todo-api'] as const;

/** Deterministic mock usage per scripted call: token columns are arithmetic, not guesswork. */
const MOCK_USAGE = { in_tokens: 100, out_tokens: 50 } as const;

interface BadFixtureExpectation {
  expect: 'lint-error' | 'freeze-rejected' | 'verify-drift' | 'schema-error';
  rule?: string;
}

/**
 * G1 evidence: run every fixtures/bad vector through its expected gate layer —
 * lint-error → lintBundle fires the expected rule; schema-error → the bundle
 * fails SpecBundleSchema (equivalently: parse throws); freeze-rejected →
 * freeze rejects; verify-drift → verifyFrozen reports drift.
 */
export function captureBadFixtures(): BadFixtureCapture[] {
  const dirs = readdirSync(BAD)
    .filter((d) => !d.startsWith('.'))
    .sort();

  return dirs.map((id) => {
    const exp = JSON.parse(readFileSync(join(BAD, id, 'expected.json'), 'utf8')) as BadFixtureExpectation;
    const bundle = JSON.parse(readFileSync(join(BAD, id, 'bundle.json'), 'utf8')) as SpecBundle;

    let caught: boolean;
    switch (exp.expect) {
      case 'lint-error':
        caught = lintBundle(bundle).errors.some((f) => f.rule === exp.rule);
        break;
      case 'schema-error':
        caught = !SpecBundleSchema.safeParse(bundle).success;
        break;
      case 'freeze-rejected':
        caught = !freeze(bundle, lintBundle(bundle), FIXTURE_FREEZE_NOW).ok;
        break;
      case 'verify-drift':
        caught = verifyFrozen(bundle).drifted.length > 0;
        break;
      default:
        caught = false;
    }
    return { id, expect: exp.expect, caught };
  });
}

function loadGoodFixture(name: string): SpecBundle {
  return JSON.parse(readFileSync(join(GOOD, name, 'bundle.json'), 'utf8')) as SpecBundle;
}

function fixtureNameFor(task: EvalTask, corpusIndex: number): string {
  const pool = task.profile === 'p-mini' ? P_MINI_FIXTURES : P_STANDARD_FIXTURES;
  return pool[corpusIndex % pool.length]!;
}

/** Good fixture re-intented for a task: only intent, project name, and profile (same profile value) are swapped. */
function deriveBundle(task: EvalTask, base: SpecBundle): SpecBundle {
  const b = structuredClone(base);
  b.intent = { statement: task.intent, normalized: task.intent.slice(0, 80) };
  b.manifest.project = { name: `eval-${task.id.toLowerCase()}`, mode: 'greenfield' };
  b.manifest.complexity_profile = task.profile;
  return b;
}

/**
 * PROD-003: badge a derived greenfield bundle with its task's named intent
 * constraints (the MENTIONS_TERMS vocabulary) so the mock's final bundle faces
 * the same intent-fidelity assertions a live model's output faces. This is
 * honest plumbing, labeled as such: the mock cannot authored-be-faithful, it
 * is CONSTRUCTED to satisfy the assertion — the discriminating power of the
 * assertion itself is pinned by the adversarial tests (a raw unbadged fixture
 * fails every task's MENTIONS_TERMS) and by live runs.
 */
function badgeIntentConstraints(task: EvalTask, b: SpecBundle): SpecBundle {
  const terms = task.assertions
    .filter((a): a is Extract<EvalTask['assertions'][number], { type: 'MENTIONS_TERMS' }> => a.type === 'MENTIONS_TERMS')
    .flatMap((a) => a.terms);
  if (terms.length === 0) return b;
  b.tasks[0]!.instructions += ` Intent constraints honored verbatim: ${terms.join(', ')}.`;
  return b;
}

/** Blocked-path bundle: one UNRESOLVED decision + unresolved_count 1 → L08 fires → the runner blocks. */
function unresolvedBundle(task: EvalTask, base: SpecBundle): SpecBundle {
  const b = deriveBundle(task, base);
  b.decisions[0]!.status = 'UNRESOLVED';
  b.manifest.unresolved_count = 1;
  return b;
}

export interface MockEvalScripts {
  single: MockScript;
  council: MockScript;
}

/**
 * Mock scripts for the whole corpus. Both variants return the SAME final
 * bundle for a task — the point of the mock runs is exercising the scoring
 * machinery (now INCLUDING the PROD-003 intent assertions: greenfield finals
 * carry their task's named constraints via badgeIntentConstraints) and the
 * exact call-count accounting (single = 1 call, council = classifier +
 * proposal A + proposeB/judge = 3 calls), not model quality.
 */
export function buildMockScripts(): MockEvalScripts {
  const single: MockScript = { byTaskId: {} };
  const council: MockScript = { byTaskId: {} };

  EVAL_TASKS.forEach((task, i) => {
    const base = loadGoodFixture(fixtureNameFor(task, i));
    const greenfieldBundle = badgeIntentConstraints(task, deriveBundle(task, base));
    const finalBundle = task.must_be_blocked ? unresolvedBundle(task, base) : greenfieldBundle;

    // Council's intermediate proposal A: the same derivation, distinguishable
    // via its council_run stamp (embedded verbatim into call 3's prompt).
    const proposalA = badgeIntentConstraints(task, deriveBundle(task, base));
    proposalA.manifest.council_run = {
      run_id: `mock-${task.id}-proposal-a`,
      config_fingerprint: 'mock-eval',
    };

    const usage = { in_tokens: MOCK_USAGE.in_tokens, out_tokens: MOCK_USAGE.out_tokens };
    single.byTaskId[task.id] = [{ text: JSON.stringify(finalBundle), usage }];
    council.byTaskId[task.id] = [
      { text: JSON.stringify({ profile: task.profile, must_be_blocked: task.must_be_blocked }), usage },
      { text: JSON.stringify(proposalA), usage },
      { text: JSON.stringify(finalBundle), usage },
    ];
  });

  return { single, council };
}

/** Everything runEvalAll needs to render a report, before the live/mock distinction. */
export interface EvalEvidence {
  runs: RunScore[];
  badFixtureResults: BadFixtureCapture[];
  driftCaught: boolean;
  unresolvedFreezeRejected: boolean;
}

function finishEvidence(runs: RunScore[]): EvalEvidence {
  const badFixtureResults = captureBadFixtures();
  const driftCaught = badFixtureResults
    .filter((r) => r.expect === 'verify-drift')
    .every((r) => r.caught);
  const unresolvedFreezeRejected = badFixtureResults
    .filter((r) => r.expect === 'freeze-rejected')
    .every((r) => r.caught);
  return { runs, badFixtureResults, driftCaught, unresolvedFreezeRejected };
}

/**
 * Run all 20 tasks x {single, council} through the real runner with mock
 * adapters, `repeats` times per (task, variant). Deterministic, no env, no
 * clock. PROD-003: mock repeats are deterministic-by-construction (the script
 * cannot vary between repeats) — the mechanism (per-repeat scoring, spread,
 * aggregate gating) is what matters and is exercised identically by live runs.
 */
export async function runMockEval(opts: { repeats?: number } = {}): Promise<EvalEvidence> {
  const repeats = Math.max(1, opts.repeats ?? 1);
  const scripts = buildMockScripts();
  const runs: RunScore[] = [];
  for (const task of EVAL_TASKS) {
    for (const variant of ['single', 'council'] as PipelineVariant[]) {
      for (let rep = 1; rep <= repeats; rep += 1) {
        const llm = createMockLlm(scripts[variant], task.id); // fresh cursor per repeat
        const outcome = await runPipeline(task, variant, llm, MOCK_NOW);
        runs.push(scoreRun(task, outcome, outcome.usage, rep));
      }
    }
  }
  return finishEvidence(runs);
}

/**
 * Live run: one shared createHttpLlm() adapter (it throws here if the
 * LCO_LLM_* env is unset — fail-closed, caller's responsibility to set it),
 * `repeats` times per (task, variant) — live models DO vary run to run, so
 * the report aggregates per-task pass-rates with spread instead of one-shots.
 * The only clock read in the whole eval driver lives here: live prompts get a
 * real nowIso; the rendered report never sees it.
 */
async function runLiveEval(repeats: number): Promise<EvalEvidence> {
  const llm = createHttpLlm();
  const nowIso = new Date().toISOString();
  const runs: RunScore[] = [];
  for (const task of EVAL_TASKS) {
    for (const variant of ['single', 'council'] as PipelineVariant[]) {
      for (let rep = 1; rep <= repeats; rep += 1) {
        const outcome = await runPipeline(task, variant, llm, nowIso);
        runs.push(scoreRun(task, outcome, outcome.usage, rep));
      }
    }
  }
  return finishEvidence(runs);
}

/**
 * Drive the full evidence gate: all 20 tasks x both variants x `repeats`,
 * fixture capture, gate computation, optional markdown report file. Mock mode
 * is fully deterministic (PASS_DETERMINISTIC_ONLY when G1-G3 hold; mock
 * repeats are deterministic-by-construction — the spread mechanism is for live
 * runs); live mode requires the LCO_LLM_* env (createHttpLlm throws otherwise
 * — never invented).
 */
export async function runEvalAll(opts: {
  variant: 'mock' | 'live';
  repeats?: number;
  reportPath?: string;
}): Promise<GateVerdict> {
  const repeats = Math.max(1, opts.repeats ?? 1);
  const evidence = opts.variant === 'live' ? await runLiveEval(repeats) : await runMockEval({ repeats });
  const input: GateReportInput = { ...evidence, repeats, live: opts.variant === 'live' };

  if (opts.reportPath !== undefined) {
    const dir = dirname(opts.reportPath);
    if (dir && dir !== '.') mkdirSync(dir, { recursive: true });
    writeFileSync(opts.reportPath, renderGateReport(input), 'utf8');
  }

  return gateVerdict(input);
}
