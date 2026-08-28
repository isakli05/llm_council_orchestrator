import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scoreRun, normalizeForTermMatch } from './score';
import { containsWholeTerm } from './constraints';
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
 *
 * Corpus note (2026-08-28 substitution): the greenfield intents are the
 * owner-directed anonymized real-workload paraphrases; the hand-built grounded
 * fixtures below are re-pinned to those intents. Explicit forbidden lists now
 * live on ET-02 (asorti) and ET-12 (POS, payment gateway).
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

/** Push a synthetic accepted decision (commitment surface) onto a bundle. */
function pushDecision(b: SpecBundle, claimId: string, decision: string): void {
  b.decisions.push({
    claim_id: claimId,
    decision,
    rationale: 'test vector',
    evidence: [],
    confidence: 0.9,
    impact: 'medium',
    assumptions: [],
    alternatives: [],
    status: 'accepted',
  } as SpecBundle['decisions'][number]);
}

/**
 * A HAND-BUILT end-to-end grounded bundle for ET-01 (dual B2B enrollment)
 * over the pet-clinic base: requirement statements carry the constraints, the
 * fixture's own task->req refs provide coverage, test cases are appended on
 * the covering tasks, and the fixture's `exit 0` verifications are judgeable.
 * This is what a faithful model output looks like to the checker.
 */
function groundedEt01(): SpecBundle {
  const b = genericBundleFor(task('ET-01'), 'pet-clinic');
  b.requirements[0]!.statement =
    'The platform shall support the self-service application form where a new customer submits company details.';
  b.requirements[1]!.statement =
    'An administrator shall issue an approve or reject decision on each submitted application form, and may also create accounts manually for existing customers.';
  b.requirements[2]!.statement =
    'Every enrollment path shall end in the same customer account record, whichever of the two paths produced it.';
  // REQ-0001 (C1 application form) — covering task TASK-0001.
  b.tasks[0]!.tests[0]!.cases.push(
    'the application form captures the new customer company details for self-service enrollment',
  );
  // REQ-0002 (C2 administrator, C3 approve, C4 reject) — covering task TASK-0002.
  b.tasks[1]!.tests[0]!.cases.push(
    'an administrator issues an approve or reject decision on each submitted application',
  );
  return b;
}

/**
 * A grounded ET-02 bundle (campaign pre-order window) over pet-clinic — the
 * forbidden-list control for vector 7.
 */
function groundedEt02(): SpecBundle {
  const b = genericBundleFor(task('ET-02'), 'pet-clinic');
  b.requirements[0]!.statement =
    'During a seasonal campaign the pre-order system shall stay open for a fixed window.';
  b.requirements[1]!.statement =
    'Within the campaign window a customer may order any quantity per size, with no forced size assortment.';
  b.requirements[2]!.statement =
    'The campaign window shall close automatically at its fixed end date.';
  b.tasks[0]!.tests[0]!.cases.push('the pre-order window stays open for the whole campaign');
  b.tasks[1]!.tests[0]!.cases.push('a customer may order any quantity per size during the campaign');
  return b;
}

/** Grounded ET-04 (customization MOQ gate, minimum >= 150) over pet-clinic. */
function groundedEt04(modify?: (b: SpecBundle) => void): SpecBundle {
  const b = genericBundleFor(task('ET-04'), 'pet-clinic');
  b.requirements[0]!.statement =
    'The customization module shall unlock only when the customer meets the minimum order quantity of 150 units.';
  b.requirements[1]!.statement =
    'Below 150 units the customization module shall stay locked for that customer.';
  b.requirements[2]!.statement =
    'The locked or unlocked state of the customization module shall be visible to the customer.';
  b.tasks[0]!.tests[0]!.cases.push(
    'the customization module unlocks only at the minimum order quantity of 150 units',
  );
  b.tasks[1]!.tests[0]!.cases.push('below 150 units the customization module stays locked');
  modify?.(b);
  return b;
}

/**
 * Grounded ET-07 (customer-named fabric stock, == 70) over todo-api. The
 * `statement` argument replaces REQ-0001's statement so numeric vectors can
 * vary only the anchor prose.
 */
function et07Requirement(statement: string): SpecBundle {
  const b = genericBundleFor(task('ET-07'), 'todo-api');
  b.requirements[0]!.statement = statement;
  b.tasks[0]!.tests[0]!.cases.push('the customer-named stock holds the remaining fabric for a later order');
  return b;
}
const et07Control =
  'When a customer orders below the batch size, the remaining 70 units of fabric shall be held as customer-named stock usable on a later order of a different model.';

/** Grounded ET-12 (proforma + payment) over todo-api: C2 receipt (>= 65) on
 * REQ-0002 and C3 email on REQ-0003 are grounded unconditionally; the
 * `statement` argument replaces REQ-0001 (C1 proforma, >= 35) for the numeric
 * flip vectors. */
function et12Requirement(statement: string): SpecBundle {
  const b = genericBundleFor(task('ET-12'), 'todo-api');
  b.requirements[0]!.statement = statement;
  b.requirements[1]!.statement =
    'Shipment shall require the remaining 65 percent of the total, paid by bank transfer with the receipt uploaded by the customer.';
  b.requirements[2]!.statement =
    'All communication with the customer shall run by email.';
  b.tasks[0]!.tests[0]!.cases.push('the proforma invoice gates production on the deposit');
  b.tasks[1]!.tests[0]!.cases.push('shipment releases only after the remaining 65 percent is paid and the receipt is uploaded');
  b.tasks[2]!.tests[0]!.cases.push('every notification to the customer is sent by email');
  return b;
}
const et12Control =
  'The system shall generate a proforma invoice automatically and start production only after a 35 percent deposit.';

/**
 * SYNTHETIC checker-semantics tasks (local literals, NOT corpus members): the
 * 2026-08-28 corpus has no digit-anchored numeric constraint and no
 * number-adjacent unit term, so the two allowlist rules they pin
 * (digit-anchored => full intent allowlist; unit-adjacent => scoped allowlist)
 * are exercised through hand-built tasks carrying ids from the closed union.
 */
function syntheticDigitAnchoredTask(): EvalTask {
  return {
    id: 'ET-06',
    kind: 'greenfield',
    profile: 'p-mini',
    intent:
      'Passwords default to 16 characters; the --length flag accepts sizes from 8 through 128 characters.',
    must_be_blocked: false,
    assertions: [
      { type: 'HAS_REQUIREMENTS', min: 3 },
      { type: 'TASKS_ACYCLIC' },
      { type: 'TASKS_HAVE_VERIFICATION' },
      {
        type: 'CONSTRAINT_TRACE',
        constraints: [{ id: 'C1', terms: ['128'], numeric: { operator: '<=', value: 128 } }],
      },
    ],
  };
}

function syntheticUnitAdjacentTask(): EvalTask {
  return {
    id: 'ET-07',
    kind: 'greenfield',
    profile: 'p-standard',
    // NOTE: 500 appears ADJACENT to the unit term 'ms' — only that adjacency
    // can allowlist a number that violates the declared < 300 relation
    intent: 'The p95 budget is 300 ms per request and bursts may briefly reach 500 ms.',
    must_be_blocked: false,
    assertions: [
      { type: 'HAS_REQUIREMENTS', min: 4 },
      { type: 'TASKS_ACYCLIC' },
      { type: 'TASKS_HAVE_VERIFICATION' },
      { type: 'TRACE_REQ_TASK_COVERED' },
      {
        type: 'CONSTRAINT_TRACE',
        constraints: [{ id: 'C1', terms: ['ms'], numeric: { operator: '<', value: 300 } }],
      },
    ],
  };
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

  it('forbidden terms are invention vectors: none appears in its own intent (word-boundary, mirroring enforcement)', () => {
    // 2026-08-28 corpus note: 'POS' (ET-12) sits as a substring inside the
    // honest intent word "deposit" — enforcement matches forbidden terms on
    // unicode word boundaries (containsWholeTerm), and the soundness rule
    // exists to pin exactly that enforcement, so the intent-side check uses
    // the same matcher: a forbidden term must not appear as a WHOLE WORD in
    // its own intent. Substring presence inside an unrelated intent word
    // neither trips enforcement nor polices intent wording.
    for (const t of greenfield()) {
      for (const f of traceOf(t).forbidden ?? []) {
        expect(
          containsWholeTerm(t.intent, f),
          `${t.id}: forbidden term '${f}' also appears as a whole word in the intent — it would police intent wording, not inventions`,
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

    // …and fails ET-02's constraint set (campaign/pre-order/quantity are grounded nowhere)
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
    // glossary-only carry: enrollment concepts defined as first-class, never used in a requirement
    bundle.glossary.push({ term: 'application form', definition: 'the self-service enrollment form.' });
    bundle.glossary.push({ term: 'administrator', definition: 'the staff role issuing decisions.' });
    // decision-layer carry must not ground either: an ACCEPTED decision naming the
    // term is a commitment surface, not the requirement that implements it
    pushDecision(bundle, 'DEC-9000', 'An administrator console shall list every pending enrollment application.');
    expect(normalizeForTermMatch(bundle.decisions[bundle.decisions.length - 1]!.decision)).toContain(
      'administrator',
    );
    // intent echo: intent.statement already quotes the whole intent verbatim
    const s = specOutcome(t, bundle);
    expect(s.intentPassed).toBe(false);
    for (const c of traceOf(t).constraints) {
      expect(s.constraintFailures.map((f) => f.constraint)).toContain(c.id);
    }
  });

  it('4. correct requirement WITHOUT task/test trace fails (all three break vectors)', () => {
    const t = task('ET-01');

    // (a) no task references the grounding requirement (REQ-0002 carries C2/C3/C4)
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

  it('6. numeric constraints with wrong operator/value fail (off-value, both directions, operator flip)', () => {
    // control: the faithful ET-04 (minimum >= 150) bundle passes
    expect(specOutcome(task('ET-04'), groundedEt04()).intentPassed).toBe(true);
    // control: the faithful ET-07 (stock == 70) bundle passes
    expect(specOutcome(task('ET-07'), et07Requirement(et07Control)).intentPassed).toBe(true);

    // (a) off-value on a term-anchored constraint: the declared 150 never
    // appears in any 'minimum' anchor sentence — the term grounds, the value
    // does not (NUMERIC_VALUE_MISSING, not mere un-grounding)
    const offValue = groundedEt04();
    offValue.requirements[0]!.statement =
      'The customization module shall unlock only when the customer meets the minimum order quantity of 120 units.';
    expect(specOutcome(task('ET-04'), offValue).intentPassed).toBe(false);
    expect(failureCodes(task('ET-04'), offValue)).toContain('C2:NUMERIC_VALUE_MISSING');

    // (b) off-value on the unit-anchored stock constraint (== 70): the unit
    // 'stock' survives, the declared 70 does not
    expect(failureCodes(task('ET-07'), et07Requirement(
      'The remaining 40 units of fabric shall be held as customer-named stock for a later order.',
    ))).toContain('C1:NUMERIC_VALUE_MISSING');

    // (c) wrong side, lower bound violated: a foreign 100 slips under the declared >= 150
    const lowSide = groundedEt04();
    lowSide.requirements[0]!.statement =
      'The customization module shall unlock only when the customer meets the minimum order quantity of 150 units, or 100 units for returning customers.';
    expect(failureCodes(task('ET-04'), lowSide)).toContain('C2:NUMERIC_RELATION_VIOLATED');

    // (d) equality violations in BOTH directions: a foreign 20 beside the
    // declared == 70 contradicts the exact held-stock amount
    expect(failureCodes(task('ET-07'), et07Requirement(
      'The remaining 70 units of fabric shall be held as customer-named stock for a later order, plus 20 units of sample stock.',
    ))).toContain('C1:NUMERIC_RELATION_VIOLATED');

    // (e) operator flip with re-scaled value: "after a 20 percent deposit"
    // where the intent demands 35 — the declared 35 vanished with the flip
    expect(failureCodes(task('ET-12'), et12Requirement(
      'The system shall generate a proforma invoice automatically and start production only after a 20 percent deposit.',
    ))).toContain('C1:NUMERIC_VALUE_MISSING');

    // (f) flip that KEEPS the declared 35 and relaxes it with a foreign 10 in
    // the same anchor sentence: value retained, direction violated
    const flipKeep = et12Requirement(
      'The proforma invoice shall start production after a deposit of at least 35 percent, reduced to 10 percent for VIP customers.',
    );
    const keepCodes = failureCodes(task('ET-12'), flipKeep).filter((c) => c.startsWith('C1'));
    expect(keepCodes).toContain('C1:NUMERIC_RELATION_VIOLATED');
    expect(keepCodes).not.toContain('C1:NUMERIC_VALUE_MISSING');
    expect(specOutcome(task('ET-12'), flipKeep).intentPassed).toBe(false);
  });

  it('7. forbidden/invented architectural decisions fail explicitly', () => {
    // ET-02 forbids assortment-pack inventions ('asorti'); control: faithful, passes
    const faithful = groundedEt02();
    expect(specOutcome(task('ET-02'), faithful).intentPassed).toBe(true);

    // …until an invented forced-assortment decision appears on a commitment surface
    const invented = groundedEt02();
    pushDecision(invented, 'DEC-9001', 'The pre-order module shall force balanced asorti packs per size.');
    const s = specOutcome(task('ET-02'), invented);
    expect(s.intentPassed).toBe(false);
    expect(failureCodes(task('ET-02'), invented)).toContain('FORBIDDEN:FORBIDDEN_PRESENT');
    expect(s.constraintFailures.find((f) => f.code === 'FORBIDDEN_PRESENT')!.detail).toMatch(/asorti/);

    // a glossary concept naming the forbidden invention is an invention too
    const glossedInvented = groundedEt02();
    glossedInvented.glossary.push({ term: 'asorti pack', definition: 'a forced per-size pack.' });
    expect(failureCodes(task('ET-02'), glossedInvented)).toContain('FORBIDDEN:FORBIDDEN_PRESENT');

    // ET-12 forbids POS / payment-gateway inventions; a POS glossary term fails it
    const posInvented = et12Requirement(et12Control);
    posInvented.glossary.push({ term: 'POS Terminal', definition: 'card payments at the counter.' });
    expect(failureCodes(task('ET-12'), posInvented)).toContain('FORBIDDEN:FORBIDDEN_PRESENT');
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
  /** ET-12 C1 fixture: a term-anchored requirement ('proforma', declared >= 35) with test + judgeable chain intact. */
  const c1 = (b: SpecBundle): string[] => failureCodes(task('ET-12'), b).filter((c) => c.startsWith('C1'));

  it('I-3a: a SIBLING sentence re-scaling the bound in the anchor requirement fails (not only value-containing sentences are checked)', () => {
    // "after a 35 percent deposit" grounds C1; the sibling "as low as 10
    // percent" in the SAME requirement restates the anchor term with a
    // wrong-side foreign number
    const codes = c1(
      et12Requirement(
        'The proforma invoice shall be issued on order completion with production after a 35 percent deposit. Repeat proforma invoices may accept deposits as low as 10 percent.',
      ),
    );
    expect(codes).toContain('C1:NUMERIC_RELATION_VIOLATED');
    expect(codes).not.toContain('C1:NUMERIC_VALUE_MISSING');
  });

  it('I-3a control: a sibling proforma sentence with a relation-consistent number passes', () => {
    expect(c1(et12Requirement(
      'The proforma invoice shall be issued on order completion with production after a 35 percent deposit. A second proforma reminder is issued once 40 percent of the total is paid.',
    ))).toEqual([]);
  });

  it('I-3b: an intent-named number in a FOREIGN unit context is NOT allowlisted (150 batches ≠ 150 stock)', () => {
    // the ET-07 intent names 150 — as a BATCH size, not adjacent to 'stock';
    // "replenished in batches of 150" inside the stock anchor sentence is a
    // re-scaling the allowlist must not rescue against == 70
    expect(
      failureCodes(task('ET-07'), et07Requirement(
        'The remaining 70 units of fabric shall be held as customer-named stock for a later order, replenished in batches of 150.',
      )).filter((c) => c.startsWith('C1')),
    ).toContain('C1:NUMERIC_RELATION_VIOLATED');
  });

  it('I-3b control: a number the intent itself expresses in the SAME unit context stays allowlisted (synthetic task)', () => {
    // the synthetic intent says "reach 500 ms" — 500 adjacent to the unit term
    // 'ms' — so restating "degrading to 500 ms" cannot false-fail even though
    // 500 violates the declared < 300
    const t = syntheticUnitAdjacentTask();
    const b = genericBundleFor(t, 'todo-api');
    b.requirements[0]!.statement =
      'The p95 latency shall stay under 300 ms, briefly degrading to 500 ms at peak load.';
    b.tasks[0]!.tests[0]!.cases.push('p95 latency measured in ms stays under budget');
    expect(specOutcome(t, b).intentPassed).toBe(true);

    // …while a number the intent never names in that unit context still fails
    const foreign = genericBundleFor(t, 'todo-api');
    foreign.requirements[0]!.statement =
      'The p95 latency shall stay under 300 ms, briefly degrading to 600 ms at peak load.';
    foreign.tasks[0]!.tests[0]!.cases.push('p95 latency measured in ms stays under budget');
    expect(failureCodes(t, foreign)).toContain('C1:NUMERIC_RELATION_VIOLATED');
  });

  it('I-3b: digit-anchored constraints keep the full intent allowlist (term==value already pins the anchor; synthetic task)', () => {
    // the synthetic intent's 16 (default length) restated beside 128 is
    // honest and must pass — 16 is intent-named, any context
    const t = syntheticDigitAnchoredTask();
    const b = genericBundleFor(t, 'pet-clinic');
    b.requirements[1]!.statement =
      'The --length flag shall accept sizes between 8 and 128; the default stays 16 characters.';
    b.tasks[1]!.tests[0]!.cases.push('--length accepts 8 through 128 around the 16 default');
    const codes = failureCodes(t, b).filter((c) => c.startsWith('C1'));
    expect(codes).toEqual([]);

    // control: a foreign 4 below the declared >= 8-style floor still violates
    // (here <= 128 with a wrong-side 400)
    const highSide = genericBundleFor(t, 'pet-clinic');
    highSide.requirements[1]!.statement =
      'The --length flag shall accept sizes between 8 and 128, or up to 400 in expert mode.';
    highSide.tasks[1]!.tests[0]!.cases.push('--length accepts 8 through 128');
    expect(failureCodes(t, highSide)).toContain('C1:NUMERIC_RELATION_VIOLATED');
  });

  it('I-4: forbidden terms match on unicode word boundaries — no substring false positives on honest specs', () => {
    // 'POS' must NOT match "positive" (glossary term on a commitment surface)
    const positive = et12Requirement(et12Control);
    positive.glossary.push({ term: 'Positive Balance', definition: 'credit shown to the customer.' });
    expect(specOutcome(task('ET-12'), positive).intentPassed, "'POS' must not match 'positive'").toBe(true);

    // derived forms are out of scope: plural 'payment gateways' does not match
    // 'payment gateway' (documented rule — a list wanting the plural names it)
    const plural = et12Requirement(et12Control);
    pushDecision(plural, 'DEC-9002', 'The checkout shall support payment gateways and bank transfers alike.');
    expect(
      specOutcome(task('ET-12'), plural).intentPassed,
      "'payment gateway' must not match 'payment gateways'",
    ).toBe(true);

    // control: the same lists still catch a REAL standalone mention
    const posHit = et12Requirement(et12Control);
    posHit.glossary.push({ term: 'POS Terminal', definition: 'card payments at the counter.' });
    expect(failureCodes(task('ET-12'), posHit)).toContain('FORBIDDEN:FORBIDDEN_PRESENT');

    const gatewayHit = et12Requirement(et12Control);
    pushDecision(gatewayHit, 'DEC-9003', 'Checkout shall run through the payment gateway.');
    expect(failureCodes(task('ET-12'), gatewayHit)).toContain('FORBIDDEN:FORBIDDEN_PRESENT');
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
    // the 2026-08-28 corpus carries numeric relations on ET-04 (>= 150),
    // ET-06 (>= 150), ET-07 (== 70) and ET-12 (>= 35, >= 65)
    expect(tasksWithNumeric).toBeGreaterThanOrEqual(4); // the corpus keeps real numeric coverage
  });
});
