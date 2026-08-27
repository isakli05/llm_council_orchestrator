import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scoreRun, normalizeForTermMatch } from './score';
import { runPipeline } from './runner';
import { createMockLlm } from './llm/mock';
import type { MockScript } from './llm/mock';
import { renderGateReport, buildMockScripts, runMockEval } from './report';
import { EVAL_TASKS } from './tasks';
import type { EvalTask, EvalTaskId, IntentConstraint, ConstraintTraceAssertion } from './tasks';
import type { SpecBundle } from '../schemas';

/**
 * RESIDUAL PROD-003: the CONSTRAINT_TRACE assertion model replaces plain
 * MENTIONS_TERMS term-presence scoring. Where a term is GROUNDED now decides
 * pass/fail: a constraint only scores when it is carried by an actual
 * requirement statement, that requirement is covered by a task, the task
 * carries a related test case and a judgeable verification contract, numeric
 * relations retain their declared operator/value, and declared forbidden
 * inventions are absent from the bundle's commitment surfaces.
 *
 * This file holds (a) corpus soundness for the frozen constraint declarations
 * and (b) the nine required adversarial vectors. Each vector is a cheat that
 * PASSES term-presence scoring and must FAIL here.
 */

const NOW = '2026-08-18T12:00:00Z';
const FIXTURES = join(__dirname, '../../fixtures/good');
const U = { in: 10, out: 5, calls: 1 };

function loadFixture(name: string): SpecBundle {
  return JSON.parse(readFileSync(join(FIXTURES, name, 'bundle.json'), 'utf8')) as SpecBundle;
}

function task(id: EvalTaskId): EvalTask {
  const t = EVAL_TASKS.find((x) => x.id === id);
  if (!t) throw new Error(`unknown task ${id}`);
  return t;
}

function greenfield(): EvalTask[] {
  return EVAL_TASKS.filter((t) => t.kind === 'greenfield');
}

/** The task's CONSTRAINT_TRACE assertion (greenfield tasks carry exactly one). */
function traceOf(t: EvalTask): ConstraintTraceAssertion {
  const a = t.assertions.find((x) => x.type === 'CONSTRAINT_TRACE') as ConstraintTraceAssertion | undefined;
  if (!a) throw new Error(`${t.id} carries no CONSTRAINT_TRACE`);
  return a;
}

/** The pre-PROD-003-residual derivation: a raw good fixture with only
 * intent/project/profile swapped — structurally valid, lint-clean, unfaithful. */
function genericBundleFor(t: EvalTask, fixture: string): SpecBundle {
  const b = structuredClone(loadFixture(fixture));
  b.intent = { statement: t.intent, normalized: t.intent.slice(0, 80) };
  b.manifest.project = { name: `eval-${t.id.toLowerCase()}`, mode: 'greenfield' };
  b.manifest.complexity_profile = t.profile;
  return b;
}

function specOutcome(t: EvalTask, bundle: SpecBundle) {
  return scoreRun(t, { kind: 'spec' as const, variant: 'single' as const, bundle, usage: U }, U);
}

const failureCodes = (t: EvalTask, bundle: SpecBundle): string[] =>
  specOutcome(t, bundle).constraintFailures.map((f) => `${f.constraint}:${f.code}`);

/**
 * A HAND-BUILT end-to-end grounded bundle for ET-01 over the pet-clinic base:
 * requirement statements carry the constraints, the fixture's own task->req
 * refs provide coverage, test cases are appended on the covering tasks, and
 * the fixture's `exit 0` verifications are judgeable. This is what a faithful
 * model output looks like to the checker.
 */
function groundedEt01(): SpecBundle {
  const b = genericBundleFor(task('ET-01'), 'pet-clinic');
  b.requirements[0]!.statement =
    'The tool shall store every short URL and its click count in a single sqlite database file inside the project directory, with no network access of any kind.';
  b.requirements[1]!.statement =
    'Short codes shall be exactly 7 characters drawn from letters, digits, and the hyphen.';
  b.requirements[2]!.statement =
    'The tool shall provide shorten, stats, and resolve subcommands; resolve exits with exit code 3 for an unknown code.';
  // REQ-0001 (C1 sqlite, C4 7-char live on REQ-0002) — covering task TASK-0001.
  b.tasks[0]!.tests[0]!.cases.push(
    'the sqlite database file is created in the project directory before any command runs',
  );
  // REQ-0002 covered by TASK-0002 → C4 (7) test case there.
  b.tasks[1]!.tests[0]!.cases.push('generated codes are exactly 7 characters long');
  // REQ-0003 covered by TASK-0003 → C2 (shorten) + C3 (resolve).
  b.tasks[2]!.tests[0]!.cases.push('the shorten command creates a new code and resolve returns the long URL');
  return b;
}

// ---------------------------------------------------------------------------
// Corpus soundness — the frozen constraint declarations are grounded in the
// intents themselves (the bundle is never asked for something the intent
// did not say, and forbidden lists are invention vectors, not intent terms)
// ---------------------------------------------------------------------------

describe('corpus soundness — frozen CONSTRAINT_TRACE declarations', () => {
  it('every greenfield task carries exactly one CONSTRAINT_TRACE with >= 2 constraints and unique ids', () => {
    for (const t of greenfield()) {
      const traces = t.assertions.filter((a) => a.type === 'CONSTRAINT_TRACE');
      expect(traces, t.id).toHaveLength(1);
      const cs = traceOf(t).constraints;
      expect(cs.length, `${t.id} needs >= 2 constraints`).toBeGreaterThanOrEqual(2);
      expect(new Set(cs.map((c) => c.id)).size, `${t.id} constraint ids must be unique`).toBe(cs.length);
      for (const c of cs) {
        expect(c.terms.length, `${t.id}/${c.id} needs >= 1 term`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('every constraint term is literally named by its own intent', () => {
    for (const t of greenfield()) {
      const intent = normalizeForTermMatch(t.intent);
      for (const c of traceOf(t).constraints) {
        for (const term of c.terms) {
          if (/^\d+$/.test(term)) {
            expect(
              new RegExp(`(^|[^a-z0-9])${term}([^a-z0-9]|$)`).test(intent),
              `${t.id}/${c.id}: numeric term '${term}' must appear as a standalone token in the intent`,
            ).toBe(true);
          } else {
            expect(intent, `${t.id}/${c.id}: term '${term}' must appear in the intent`).toContain(
              normalizeForTermMatch(term),
            );
          }
        }
      }
    }
  });

  it('every numeric constraint value appears as a token in its own intent', () => {
    for (const t of greenfield()) {
      const intent = normalizeForTermMatch(t.intent);
      for (const c of traceOf(t).constraints) {
        if (!c.numeric) continue;
        expect(
          new RegExp(`(^|[^a-z0-9])${c.numeric.value}([^a-z0-9]|$)`).test(intent),
          `${t.id}/${c.id}: numeric value ${c.numeric.value} must appear in the intent`,
        ).toBe(true);
      }
    }
  });

  it('forbidden terms are invention vectors: none appears in its own intent', () => {
    for (const t of greenfield()) {
      const intent = normalizeForTermMatch(t.intent);
      for (const f of traceOf(t).forbidden ?? []) {
        expect(
          intent.includes(normalizeForTermMatch(f)),
          `${t.id}: forbidden term '${f}' also appears in the intent — it would police intent wording, not inventions`,
        ).toBe(false);
      }
    }
  });

  it('blocked tasks carry no CONSTRAINT_TRACE (no bundle exists — the block IS the fidelity)', () => {
    for (const t of EVAL_TASKS.filter((x) => x.must_be_blocked)) {
      expect(t.assertions.filter((a) => a.type === 'CONSTRAINT_TRACE')).toHaveLength(0);
    }
  });

  it('no raw good fixture satisfies any greenfield task constraint set (a generic fixture cannot score)', () => {
    const poolOf = (t: EvalTask) =>
      t.profile === 'p-mini' ? ['embed-cli', 'pet-clinic'] : ['session-service', 'todo-api'];
    for (const t of greenfield()) {
      for (const name of poolOf(t)) {
        const b = structuredClone(loadFixture(name));
        b.intent = { statement: t.intent, normalized: t.intent.slice(0, 80) };
        const codes = failureCodes(t, b);
        expect(codes.length, `${t.id}: fixture ${name} unexpectedly satisfied the constraint trace`).toBeGreaterThan(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// The nine required adversarial vectors (RESIDUAL PROD-003)
// ---------------------------------------------------------------------------

describe('adversarial battery — nine required vectors', () => {
  it('1. generic valid fixture fails another intent\'s constraint set', () => {
    // one fully-grounded ET-01 bundle — passes its own trace…
    const bundle = groundedEt01();
    const own = specOutcome(task('ET-01'), bundle);
    expect(own.intentPassed).toBe(true);

    // …and fails ET-02's constraint set (markdown/html/2s are grounded nowhere)
    const foreign = specOutcome(task('ET-02'), bundle);
    expect(foreign.structuralPassed).toBe(true); // ET-02's structure checks still hold on this bundle
    expect(foreign.intentPassed).toBe(false);
    expect(foreign.constraintFailures.length).toBeGreaterThan(0);
    // and the raw fixture pool fails both intents outright
    for (const t of [task('ET-01'), task('ET-02')]) {
      expect(specOutcome(t, genericBundleFor(t, 'todo-api')).intentPassed).toBe(false);
    }
  });

  it('2. a single sentence dumping every keyword fails (the old badgeTerms cheat)', () => {
    const t = task('ET-01');
    const bundle = genericBundleFor(t, 'pet-clinic');
    const allTerms = traceOf(t).constraints.flatMap((c) => c.terms);
    // the keyword dump goes where term-presence scoring used to look: task instructions
    bundle.tasks[0]!.instructions += ` Intent constraints honored verbatim: ${allTerms.join(', ')}.`;
    const s = specOutcome(t, bundle);
    expect(s.intentPassed).toBe(false);
    // every constraint failed grounding: an instruction dump is not a requirement
    expect(new Set(s.constraintFailures.map((f) => f.code))).toEqual(
      new Set(['NOT_GROUNDED_IN_REQUIREMENT']),
    );
  });

  it('3. terms present only in glossary or intent echo fail', () => {
    const t = task('ET-01');
    const bundle = genericBundleFor(t, 'pet-clinic');
    // glossary-only carry: sqlite defined as a first-class concept, never used in a requirement
    bundle.glossary.push({ term: 'sqlite', definition: 'sqlite is the embedded database engine.' });
    bundle.glossary.push({ term: 'shorten', definition: 'the shorten command creates codes.' });
    // intent echo: intent.statement already quotes the whole intent verbatim
    const s = specOutcome(t, bundle);
    expect(s.intentPassed).toBe(false);
    // pet-clinic's own decision DOES say "SQLite" — decision-layer grounding must not count either
    expect(normalizeForTermMatch(bundle.decisions[0]!.decision)).toContain('sqlite');
    for (const c of traceOf(t).constraints) {
      expect(s.constraintFailures.map((f) => f.constraint)).toContain(c.id);
    }
  });

  it('4. correct requirement WITHOUT task/test trace fails (all three break vectors)', () => {
    const t = task('ET-01');

    // (a) no task references the grounding requirement
    const noTask = groundedEt01();
    for (const tk of noTask.tasks) tk.refs.requirements = tk.refs.requirements.filter((r) => r !== 'REQ-0002');
    expect(specOutcome(t, noTask).intentPassed).toBe(false);
    expect(failureCodes(t, noTask)).toContain('C4:NO_COVERING_TASK');

    // (b) covering task has no related test case
    const noTest = groundedEt01();
    noTest.tasks[1]!.tests[0]!.cases = ['the build passes'];
    expect(specOutcome(t, noTest).intentPassed).toBe(false);
    expect(failureCodes(t, noTest)).toContain('C4:NO_RELATED_TEST');

    // (c) covering task has a prose verification (no judgeable exit-code contract)
    const proseVerify = groundedEt01();
    proseVerify.tasks[1]!.verification = [{ command: 'run the test suite', expect: 'all cases pass' }];
    expect(specOutcome(t, proseVerify).intentPassed).toBe(false);
    expect(failureCodes(t, proseVerify)).toContain('C4:NO_JUDGEABLE_VERIFICATION');
  });

  it('5. correct end-to-end requirement->task->test grounding passes', () => {
    const s = specOutcome(task('ET-01'), groundedEt01());
    expect(s.constraintFailures).toEqual([]);
    expect(s.intentPassed).toBe(true);
    expect(s.structuralPassed).toBe(true);

    // and the constructed mock bundles (buildMockScripts) pass their own traces:
    // the plumbing faces exactly the assertions a live model output faces
    const scripts = buildMockScripts();
    for (const t of greenfield()) {
      const bundle = JSON.parse(scripts.single.byTaskId[t.id]![0]!.text) as SpecBundle;
      const ms = specOutcome(t, bundle);
      expect(ms.constraintFailures, `${t.id} mock bundle constraint failures: ${JSON.stringify(ms.constraintFailures)}`).toEqual([]);
      expect(ms.intentPassed, `${t.id} mock bundle must pass its constraint trace`).toBe(true);
    }
  });

  it('6. numeric constraints with wrong operator/value fail (both directions, off-value)', () => {
    // ET-06: default length == 16, --length between >= 8 and <= 128
    const grounded = (): SpecBundle => {
      const b = genericBundleFor(task('ET-06'), 'pet-clinic');
      b.requirements[0]!.statement =
        'Passwords shall default to 16 characters using cryptographic randomness.';
      b.requirements[1]!.statement =
        'The --length flag shall accept sizes between 8 and 128; --no-symbols excludes special characters.';
      b.tasks[0]!.tests[0]!.cases.push('default output is 16 characters');
      b.tasks[1]!.tests[0]!.cases.push('--length accepts 8 through 128 and --no-symbols drops symbols');
      return b;
    };

    // control: the faithful sentence passes
    expect(specOutcome(task('ET-06'), grounded()).intentPassed).toBe(true);

    // (a) off-value on a value-anchored constraint: default 12 instead of the
    // declared 16 — the anchor token itself vanished, so grounding is gone
    const offValue = grounded();
    offValue.requirements[0]!.statement =
      'Passwords shall default to 12 characters using cryptographic randomness.';
    expect(specOutcome(task('ET-06'), offValue).intentPassed).toBe(false);
    expect(failureCodes(task('ET-06'), offValue)).toContain('C3:NOT_GROUNDED_IN_REQUIREMENT');

    // (b) off-value on a unit-anchored constraint (ET-07 C3: 'ms' anchor,
    // declared < 300): the unit survives, the declared value does not
    const offValueUnit = genericBundleFor(task('ET-07'), 'todo-api');
    offValueUnit.requirements[0]!.statement =
      'The p95 end-to-end latency shall stay under 500 ms at 500 concurrent connections.';
    offValueUnit.tasks[0]!.tests[0]!.cases.push('p95 latency measured in ms stays under budget');
    expect(failureCodes(task('ET-07'), offValueUnit)).toContain('C3:NUMERIC_VALUE_MISSING');

    // (c) wrong direction, lower bound violated: a foreign 4 slips under the declared >= 8
    const lowSide = grounded();
    lowSide.requirements[1]!.statement =
      'The --length flag shall accept sizes between 8 and 128, with a hard floor of 4 when --no-symbols is set.';
    expect(failureCodes(task('ET-06'), lowSide)).toContain('C4:NUMERIC_RELATION_VIOLATED');

    // (d) wrong direction, upper bound violated: a foreign 400 exceeds the declared <= 128
    const highSide = grounded();
    highSide.requirements[1]!.statement =
      'The --length flag shall accept sizes between 8 and 128, or up to 400 in expert mode.';
    expect(failureCodes(task('ET-06'), highSide)).toContain('C5:NUMERIC_RELATION_VIOLATED');

    // (e) operator flip with re-scaled value: "at least 5" where the intent
    // said at most 3 (ET-12) — the declared 3 vanished with the flip
    const flip = genericBundleFor(task('ET-12'), 'todo-api');
    flip.requirements[0]!.statement =
      'Each member shall hold at least 5 active reservations at once.';
    flip.tasks[0]!.tests[0]!.cases.push('a member can hold 5 active reservations');
    expect(specOutcome(task('ET-12'), flip).intentPassed).toBe(false);
    expect(failureCodes(task('ET-12'), flip)).toContain('C3:NOT_GROUNDED_IN_REQUIREMENT');

    // (f) flip that KEEPS the declared 3 and relaxes it with a foreign 5 in
    // the same anchor sentence: value retained, direction violated
    const flipKeep = genericBundleFor(task('ET-12'), 'todo-api');
    flipKeep.requirements[0]!.statement =
      'Each member shall hold at most 3 active reservations, raised to 5 in premium tier.';
    flipKeep.tasks[0]!.tests[0]!.cases.push('a member holds at most 3 reservations');
    const keepCodes = failureCodes(task('ET-12'), flipKeep).filter((c) => c.startsWith('C3'));
    expect(keepCodes).toContain('C3:NUMERIC_RELATION_VIOLATED');
    expect(keepCodes).not.toContain('C3:NUMERIC_VALUE_MISSING');
  });

  it('7. forbidden/invented architectural decisions fail explicitly', () => {
    // ET-01 forbids network architecture (http/api/websocket/rest) on the commitment surfaces
    const invented = groundedEt01();
    invented.decisions.push({
      claim_id: 'DEC-9001',
      decision: 'The tool shall sync short codes to a cloud REST API for analytics.',
      rationale: 'product wants counts',
      evidence: [],
      confidence: 0.9,
      impact: 'medium',
      assumptions: [],
      alternatives: [],
      status: 'accepted',
    } as SpecBundle['decisions'][number]);
    const s = specOutcome(task('ET-01'), invented);
    expect(s.intentPassed).toBe(false);
    expect(failureCodes(task('ET-01'), invented)).toContain('FORBIDDEN:FORBIDDEN_PRESENT');
    expect(s.constraintFailures.find((f) => f.code === 'FORBIDDEN_PRESENT')!.detail).toMatch(/rest|api/);

    // a glossary concept naming the forbidden technology is an invention too
    const glossedInvented = groundedEt01();
    glossedInvented.glossary.push({ term: 'HTTP Sync', definition: 'background sync over http.' });
    expect(failureCodes(task('ET-01'), glossedInvented)).toContain('FORBIDDEN:FORBIDDEN_PRESENT');

    // ET-02 forbids external dependencies; an axios glossary term fails it
    const depInvented = genericBundleFor(task('ET-02'), 'pet-clinic');
    depInvented.requirements[0]!.statement = 'Input shall convert from markdown to html.';
    depInvented.requirements[1]!.statement = 'A 10 MB input file shall convert in under 2 seconds.';
    depInvented.requirements[2]!.statement = 'Only the language standard library shall be used.';
    depInvented.tasks[0]!.tests[0]!.cases.push('markdown converts to html');
    depInvented.tasks[1]!.tests[0]!.cases.push('a 10 MB file finishes in under 2 seconds');
    depInvented.tasks[2]!.tests[0]!.cases.push('no dependency beyond the standard library is imported');
    // control: faithful, passes
    expect(specOutcome(task('ET-02'), depInvented).intentPassed).toBe(true);
    // …until an invented external dependency appears as a first-class concept
    depInvented.glossary.push({ term: 'axios', definition: 'the http client used for fetches.' });
    expect(failureCodes(task('ET-02'), depInvented)).toContain('FORBIDDEN:FORBIDDEN_PRESENT');
  });

  it('8. ambiguous/conflicting intents still block monotonically (no regression)', async () => {
    // scored semantics: a correct block on a must-be-blocked task is full intent fidelity
    for (const id of ['ET-13', 'ET-18', 'ET-20'] as EvalTaskId[]) {
      const t = task(id);
      const blocked = scoreRun(
        t,
        { kind: 'blocked', variant: 'single', reasons: ['L08_UNRESOLVED_LEAK [DEC-0001]: x'], usage: U },
        U,
      );
      expect(blocked.blockedCorrectly).toBe(true);
      expect(blocked.intentPassed).toBe(true);
      expect(blocked.constraintFailures).toEqual([]);
    }

    // a spec produced for a must-be-blocked task is still an intent failure (under-block)
    const specOnBlocked = scoreRun(task('ET-18'), {
      kind: 'spec',
      variant: 'single',
      bundle: groundedEt01(),
      usage: U,
    }, U);
    expect(specOnBlocked.blockedCorrectly).toBe(false);
    expect(specOnBlocked.intentPassed).toBe(false);

    // through the real runner: the council classifier's blocking verdict stays
    // monotonic — a later clean (even fully-grounded) bundle cannot erase it
    const t = task('ET-13');
    const clean = groundedEt01();
    const scripts: MockScript = {
      byTaskId: {
        [t.id]: [
          { text: JSON.stringify({ profile: t.profile, must_be_blocked: true }), usage: { in_tokens: 5, out_tokens: 5 } },
          { text: JSON.stringify(clean), usage: { in_tokens: 10, out_tokens: 5 } },
          { text: JSON.stringify(clean), usage: { in_tokens: 10, out_tokens: 5 } },
        ],
      },
    };
    const outcome = await runPipeline(t, 'council', createMockLlm(scripts, t.id), NOW);
    expect(outcome.kind).toBe('blocked');
    expect(outcome.reasons.some((r) => r.includes('BLOCKED_EARLIER_EVIDENCE'))).toBe(true);
    const s = scoreRun(t, outcome, outcome.usage);
    expect(s.blockedCorrectly).toBe(true);
    expect(s.intentPassed).toBe(true);
  });

  it('9. mock reports identify constructed data and cannot substantiate live advantage', async () => {
    const evidence = await runMockEval();
    const text = renderGateReport({ ...evidence });

    // the mock verdict stays deterministic-only: G4 (council advantage) is live-only
    expect(text).toContain('VERDICT: PASS_DETERMINISTIC_ONLY');
    expect(text).not.toContain('- G4 (intent-fidelity-passing runs only)');
    // the constructed-data provenance is named: greenfield mock bundles are BUILT
    // to satisfy the constraint trace, they are not model-fidelity evidence
    expect(text).toContain('groundIntentConstraints');
    expect(text).toContain('not model-fidelity evidence');
    expect(text).toContain('cannot substantiate');
    // and the greenfield mock runs do pass their traces (the construction works),
    // so the honesty label is load-bearing, not decorative
    for (const t of greenfield()) {
      const run = evidence.runs.find((r) => r.taskId === t.id && r.variant === 'single')!;
      expect(run.intentPassed, `${t.id} mock run should pass its constructed trace`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Reviewer findings I-3 / I-4 (2026-08-27): numeric retention is broader than
// value-containing sentences, the intent allowlist is unit-scoped, and
// forbidden lists match on word boundaries. Pre-registration strengthening —
// no live results existed under any freeze when these vectors were added.
// ---------------------------------------------------------------------------

describe('adversarial battery — I-3 numeric retention scope, I-4 word-boundary forbidden lists', () => {
  /** ET-07 C3 fixture: a unit-anchored requirement ('ms', declared < 300) with test + judgeable chain intact. */
  function et07Requirement(statement: string): SpecBundle {
    const b = genericBundleFor(task('ET-07'), 'todo-api');
    b.requirements[0]!.statement = statement;
    b.tasks[0]!.tests[0]!.cases.push('p95 latency measured in ms stays under budget');
    return b;
  }
  const c3 = (b: SpecBundle): string[] => failureCodes(task('ET-07'), b).filter((c) => c.startsWith('C3'));

  it('I-3a: a SIBLING sentence re-scaling the bound in the anchor requirement fails (not only value-containing sentences are checked)', () => {
    // "under 300 ms." grounds C3; the sibling "up to 5000 ms" in the SAME
    // requirement carries the unit but a wrong-side foreign number
    const codes = c3(
      et07Requirement(
        'The p95 end-to-end latency shall stay under 300 ms. Burst traffic may take up to 5000 ms before shedding load.',
      ),
    );
    expect(codes).toContain('C3:NUMERIC_RELATION_VIOLATED');
    expect(codes).not.toContain('C3:NUMERIC_VALUE_MISSING');
  });

  it('I-3a control: a sibling ms sentence with a relation-consistent number passes', () => {
    expect(c3(et07Requirement('The p95 end-to-end latency shall stay under 300 ms. Health probes answer within 100 ms.'))).toEqual([]);
  });

  it('I-3b: an intent-named number in a FOREIGN unit context is NOT allowlisted (500 connections ≠ 500 ms)', () => {
    // the ET-07 intent names 500 — as a CONNECTION count, not adjacent to any
    // 'ms'; "degrading to 500 ms" is a re-scaling the allowlist must not rescue
    expect(
      c3(et07Requirement('The p95 end-to-end latency shall stay under 300 ms, degrading to 500 ms only under extreme load.')),
    ).toContain('C3:NUMERIC_RELATION_VIOLATED');
  });

  it('I-3b control: a number the intent itself expresses in the SAME unit context stays allowlisted', () => {
    // 300 appears adjacent to 'ms' in the intent ("300 ms'nin"), so restating
    // "300 ms" anywhere in the anchor sentences cannot false-fail
    expect(
      c3(et07Requirement('The p95 end-to-end latency shall stay under 300 ms; hard timeout at 300 ms with a stale-response flag.')),
    ).toEqual([]);
  });

  it('I-3b: digit-anchored constraints keep the full intent allowlist (term==value already pins the anchor)', () => {
    // ET-06 C5 (<= 128, term '128'): the intent's 16 (default length) restated
    // beside 128 is honest and must pass — 16 is intent-named, any context
    const b = genericBundleFor(task('ET-06'), 'pet-clinic');
    b.requirements[1]!.statement =
      'The --length flag shall accept sizes between 8 and 128; the default stays 16 characters.';
    b.tasks[1]!.tests[0]!.cases.push('--length accepts 8 through 128 around the 16 default');
    const codes = failureCodes(task('ET-06'), b).filter((c) => c.startsWith('C5'));
    expect(codes).toEqual([]);
  });

  it('I-4: forbidden terms match on unicode word boundaries — no substring false positives on honest specs', () => {
    // 'rest' must NOT match "restores"
    const restores = groundedEt01();
    restores.decisions.push({
      claim_id: 'DEC-9002',
      decision: 'The tool restores deleted short codes from a local backup file.',
      rationale: 'durability',
      evidence: [],
      confidence: 0.9,
      impact: 'medium',
      assumptions: [],
      alternatives: [],
      status: 'accepted',
    } as SpecBundle['decisions'][number]);
    expect(specOutcome(task('ET-01'), restores).intentPassed, "'rest' must not match 'restores'").toBe(true);

    // 'api' must NOT match "rapid" (glossary term on a commitment surface)
    const rapid = groundedEt01();
    rapid.glossary.push({ term: 'Rapid Mode', definition: 'skips click-count bookkeeping.' });
    expect(specOutcome(task('ET-01'), rapid).intentPassed, "'api' must not match 'rapid'").toBe(true);

    // 'http' does NOT match inside 'https' (documented rule: word-boundary
    // matching makes HTTPS out of scope for the 'http' forbidden term — a list
    // that wants to forbid HTTPS must name 'https' explicitly)
    const https = groundedEt01();
    https.glossary.push({ term: 'https mirror', definition: 'read-only mirror of the local file.' });
    expect(specOutcome(task('ET-01'), https).intentPassed, "'http' must not match 'https'").toBe(true);

    // derived forms are out of scope too: plural 'WebSockets' does not match 'websocket'
    const plural = groundedEt01();
    plural.glossary.push({ term: 'WebSockets note', definition: 'explicitly not used here.' });
    expect(specOutcome(task('ET-01'), plural).intentPassed, "'websocket' must not match 'WebSockets'").toBe(true);

    // control: the same list still catches a REAL standalone mention
    const invented = groundedEt01();
    invented.glossary.push({ term: 'REST API sync', definition: 'syncs to a cloud REST API.' });
    expect(failureCodes(task('ET-01'), invented)).toContain('FORBIDDEN:FORBIDDEN_PRESENT');
  });

  it('I-4: ET-02\'s forbidden \'express\' no longer false-positives on "expressions" (stdlib-honest prose)', () => {
    const b = genericBundleFor(task('ET-02'), 'pet-clinic');
    b.requirements[0]!.statement = 'Input shall convert from markdown to html.';
    b.requirements[1]!.statement = 'A 10 MB input file shall convert in under 2 seconds.';
    b.requirements[2]!.statement = 'Only the language standard library shall be used.';
    b.tasks[0]!.tests[0]!.cases.push('markdown converts to html');
    b.tasks[1]!.tests[0]!.cases.push('a 10 MB file finishes in under 2 seconds');
    b.tasks[2]!.tests[0]!.cases.push('no dependency beyond the standard library is imported');
    // honest prose using the word "expressions" on a commitment surface
    b.glossary.push({ term: 'inline expressions', definition: 'math expressions pass through verbatim.' });
    expect(specOutcome(task('ET-02'), b).intentPassed, "'express' must not match 'expressions'").toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Constraint declaration typing helpers (compile-time shape pin)
// ---------------------------------------------------------------------------

describe('IntentConstraint declarations', () => {
  it('numeric operators are the closed set and every task with numerics declares at least one bound', () => {
    const ops = new Set<string>(['==', '<=', '>=', '<', '>']);
    let tasksWithNumeric = 0;
    for (const t of greenfield()) {
      const cs: IntentConstraint[] = traceOf(t).constraints;
      const numeric = cs.filter((c) => c.numeric);
      if (numeric.length > 0) tasksWithNumeric += 1;
      for (const c of numeric) {
        expect(ops.has(c.numeric!.operator), `${t.id}/${c.id} unknown operator`).toBe(true);
        expect(Number.isFinite(c.numeric!.value)).toBe(true);
      }
    }
    expect(tasksWithNumeric).toBeGreaterThanOrEqual(6); // the corpus keeps real numeric coverage
  });
});
