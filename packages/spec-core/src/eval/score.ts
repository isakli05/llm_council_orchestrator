import { lintBundle } from '../lint/engine';
import { buildTrace } from '../lint/trace';
import type { SpecBundle } from '../schemas';
import type { EvalTask, DeterministicAssertion } from './tasks';
import type { PipelineOutcome, PipelineVariant } from './runner';
import { checkConstraintTrace, allUnGrounded } from './constraints';
import type { ConstraintFailure } from './constraints';

/**
 * Deterministic scoring of one pipeline outcome against a task's assertions
 * (Task 10 binding). No LLM judge anywhere: every assertion is a pure check
 * over the outcome (and, for spec outcomes, the bundle the runner already
 * schema-validated and lint-gated).
 *
 * PROD-003 splits every score into STRUCTURAL validity (every assertion except
 * CONSTRAINT_TRACE/BLOCKED) and INTENT fidelity (the CONSTRAINT_TRACE
 * assertion plus blocked-correctness). A structurally valid but unfaithful
 * bundle — the audit's "generic good fixture" — scores structuralPassed=true,
 * intentPassed=false, with the failed constraints named and the trace stage
 * that broke (RESIDUAL PROD-003: grounding, not term presence).
 */

/**
 * Normalize text for term matching (PROD-003): case-folded, Unicode combining
 * marks stripped (Turkish İ/i̇ vs I/i), interior whitespace collapsed — so
 * "Europe /  Istanbul" matches "europe istanbul" and "İstanbul" matches
 * "Istanbul". Deterministic, locale-free (NFKD is a pure data transform).
 */
export function normalizeForTermMatch(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** ADVISORY (never gated, PROD-003): first-class concepts (glossary terms +
 * requirement terms_used) the task intent never named — plausible inventions,
 * surfaced for human review rather than failed on: a faithful spec in the other
 * language legitimately renames concepts (intent "kısa kod" → glossary "Short
 * Code"), so a hard rule would fail honest specs. */
export function advisoryInventions(task: EvalTask, outcome: PipelineOutcome): string[] {
  if (outcome.kind !== 'spec') return [];
  const intentText = normalizeForTermMatch(task.intent);
  const concepts = new Set<string>([
    ...outcome.bundle.glossary.map((g) => g.term),
    ...outcome.bundle.requirements.flatMap((r) => r.terms_used),
  ]);
  return [...concepts]
    .filter((c) => !intentText.includes(normalizeForTermMatch(c)))
    .sort();
}

export interface RunScore {
  taskId: string;
  variant: PipelineVariant;
  assertionsPassed: number;
  assertionsTotal: number;
  /**
   * PROD-003: 1-based repeat ordinal (runs may be repeated per task/variant to
   * expose variance; mock repeats are deterministic-by-construction, the
   * mechanism matters for live runs).
   */
  repeat: number;
  /**
   * PROD-003: every assertion EXCEPT CONSTRAINT_TRACE/BLOCKED passed — the
   * bundle is structurally valid. True for a generic-but-clean fixture; that
   * is exactly what the label is for.
   */
  structuralPassed: boolean;
  /**
   * PROD-003: every CONSTRAINT_TRACE assertion passed AND blockedCorrectly is
   * true (for must-be-blocked tasks the block itself is the fidelity). G4's
   * council-advantage comparison counts ONLY intentPassed runs.
   */
  intentPassed: boolean;
  /**
   * RESIDUAL PROD-003: named constraint-trace failures (constraint id + the
   * trace stage that broke + short evidence). Empty when intent grounding
   * holds; on blocked outcomes of greenfield tasks every constraint is listed
   * as NOT_GROUNDED (no bundle exists).
   */
  constraintFailures: ConstraintFailure[];
  /** ADVISORY inventions (never gated): unmentioned first-class concepts. */
  advisoryInventions: string[];
  /**
   * Did the pipeline's blocked/not-blocked behavior match the task's
   * expectation (`must_be_blocked`)? `null` is reserved for future outcome
   * kinds that are neither spec nor blocked; for both current kinds this is
   * always a boolean.
   */
  blockedCorrectly: boolean | null;
  /**
   * BACK-008: the council variant's independent-proposal leg collapsed
   * (proposal A failed schema validation on both attempts; the final bundle
   * came from the judge alone). Always false for 'single'. Surfaced by the
   * gate report so a degraded run cannot be read as a full council result.
   */
  councilDegraded: boolean;
  inTokens: number;
  outTokens: number;
  calls: number;
  /**
   * UX-001: transport attempts (including retried/timed-out ones) as opposed
   * to logical completions (`calls`). Defaults to `calls` for usages built
   * before the distinction existed.
   */
  attempts: number;
  /**
   * UX-003: false when any contributing response came back without provider
   * usage — the token numbers are then PARTIAL sums and must be rendered as
   * `unknown`; the G4 cost condition treats them as not satisfying the gate.
   */
  usageKnown: boolean;
}

/** Usage accounting as produced by runPipeline (sums over complete() calls). */
export interface RunUsage {
  in: number;
  out: number;
  calls: number;
  attempts?: number;
  callsWithoutUsage?: number;
  usageKnown?: boolean;
}

/**
 * Evaluate one assertion against the outcome.
 *
 * Edge semantics (binding):
 * - BLOCKED passes iff the task must be blocked AND the pipeline blocked it.
 *   A blocked outcome on a must-not-be-blocked task fails it (the pipeline
 *   over-blocked). A spec outcome on a must-be-blocked task also fails it.
 * - STATE_IS_DRAFT_OR_BLOCKED: a blocked outcome has no bundle — blocking is
 *   the strongest way to honor draft-or-blocked semantics, so it passes. For
 *   spec outcomes the manifest state itself must be 'draft' or 'blocked'
 *   (the runner never freezes; 'reviewed'/'frozen' here means the model
 *   overstepped and the assertion fails).
 * - HAS_REQUIREMENTS needs a spec outcome with >= min requirements.
 * - TASKS_ACYCLIC is asserted explicitly by re-running only L04 over the
 *   bundle. A spec outcome is already lint-clean (the runner blocks on any
 *   lint error), so this is an honest re-assertion of what L04 guarantees.
 * - TASKS_HAVE_VERIFICATION: the schema already guarantees min(1) per task;
 *   checked again explicitly for honesty (and to score hand-built outcomes
 *   that bypassed the schema).
 * - TRACE_REQ_TASK_COVERED: coverage = requirements with >= 1 outgoing
 *   req-task edge (via buildTrace) / total requirements; passes iff every
 *   requirement is covered. An empty requirement set is NOT covered — the
 *   evidence gate demands positive traceability.
 * - CONSTRAINT_TRACE (RESIDUAL PROD-003): spec outcome whose every declared
 *   intent constraint is grounded requirement -> covering task -> related
 *   test -> judgeable verification, with numeric relations retained and
 *   forbidden inventions absent from the commitment surfaces (constraints.ts).
 *   A blocked outcome fails it: a bundle that never existed grounded nothing.
 */
function assertionPasses(
  assertion: DeterministicAssertion,
  task: EvalTask,
  outcome: PipelineOutcome,
): boolean {
  switch (assertion.type) {
    case 'BLOCKED':
      return task.must_be_blocked && outcome.kind === 'blocked';
    case 'STATE_IS_DRAFT_OR_BLOCKED':
      if (outcome.kind === 'blocked') return true;
      return (
        outcome.bundle.manifest.state === 'draft' || outcome.bundle.manifest.state === 'blocked'
      );
    case 'HAS_REQUIREMENTS':
      return outcome.kind === 'spec' && outcome.bundle.requirements.length >= assertion.min;
    case 'TASKS_ACYCLIC':
      if (outcome.kind !== 'spec') return false;
      return lintBundle(outcome.bundle).errors.every(
        (f) => f.rule !== 'L04_CYCLIC_TASK_DEPS',
      );
    case 'TASKS_HAVE_VERIFICATION':
      return (
        outcome.kind === 'spec' &&
        outcome.bundle.tasks.every((t) => t.verification.length >= 1)
      );
    case 'TRACE_REQ_TASK_COVERED': {
      if (outcome.kind !== 'spec') return false;
      const bundle = outcome.bundle;
      if (bundle.requirements.length === 0) return false;
      const covered = new Set(
        buildTrace(bundle)
          .filter((e) => e.kind === 'req-task')
          .map((e) => e.from),
      );
      return bundle.requirements.every((r) => covered.has(r.id));
    }
    case 'CONSTRAINT_TRACE':
      return outcome.kind === 'spec' && constraintFailuresFor(task, outcome).length === 0;
  }
}

/**
 * The constraint-trace failures for this outcome (single source for both the
 * assertion verdict and the RunScore's named-failure list): spec outcomes are
 * checked against the bundle; blocked outcomes of greenfield tasks report
 * every constraint as ungrounded (no bundle exists to ground anything).
 */
function constraintFailuresFor(task: EvalTask, outcome: PipelineOutcome): ConstraintFailure[] {
  const traces = task.assertions.filter(
    (a): a is Extract<DeterministicAssertion, { type: 'CONSTRAINT_TRACE' }> => a.type === 'CONSTRAINT_TRACE',
  );
  if (traces.length === 0) return [];
  if (outcome.kind !== 'spec') return traces.flatMap(allUnGrounded);
  return traces.flatMap((a) => checkConstraintTrace(task, a, outcome.bundle));
}

/**
 * Score one outcome: assertion arithmetic + the PROD-003 structural/intent
 * split + blocked-correctness + usage passthrough.
 *
 * The split (which side an assertion belongs to is a recorded decision):
 * - INTENT assertions: CONSTRAINT_TRACE (the declared constraints were
 *   GROUNDED, not merely mentioned) and BLOCKED (the intent's demand to be
 *   blocked was honored). Both ask "did the outcome faithfully honor what the
 *   intent asked for".
 * - STRUCTURAL assertions: everything else (HAS_REQUIREMENTS, TASKS_ACYCLIC,
 *   TASKS_HAVE_VERIFICATION, TRACE_REQ_TASK_COVERED, STATE_IS_DRAFT_OR_BLOCKED)
 *   — "is the artifact well-formed". A generic clean bundle is structurally
 *   fine; the split exists precisely to expose that it may still be unfaithful.
 * - intentPassed = every intent assertion passes AND blockedCorrectly is true.
 *   For must-be-blocked tasks that reduces to blockedCorrectly — blocking an
 *   ambiguous intent IS fidelity to it. For greenfield tasks it reduces to
 *   grounded-constraints AND not-over-blocked.
 */
export function scoreRun(
  task: EvalTask,
  outcome: PipelineOutcome,
  usage: RunUsage,
  repeat = 1,
): RunScore {
  const isIntentAssertion = (a: DeterministicAssertion): boolean =>
    a.type === 'CONSTRAINT_TRACE' || a.type === 'BLOCKED';
  const structuralAssertions = task.assertions.filter((a) => !isIntentAssertion(a));
  const intentAssertions = task.assertions.filter(isIntentAssertion);

  const structuralPassed = structuralAssertions.every((a) => assertionPasses(a, task, outcome));
  const intentAssertionsPassed = intentAssertions.every((a) => assertionPasses(a, task, outcome));

  const blockedCorrectly =
    outcome.kind === 'blocked' || outcome.kind === 'spec'
      ? (outcome.kind === 'blocked') === task.must_be_blocked
      : null;

  return {
    taskId: task.id,
    variant: outcome.variant,
    assertionsPassed: task.assertions.filter((a) => assertionPasses(a, task, outcome)).length,
    assertionsTotal: task.assertions.length,
    repeat,
    structuralPassed,
    intentPassed: intentAssertionsPassed && blockedCorrectly === true,
    constraintFailures: constraintFailuresFor(task, outcome),
    advisoryInventions: advisoryInventions(task, outcome),
    blockedCorrectly,
    councilDegraded: outcome.councilDegraded === true,
    inTokens: usage.in,
    outTokens: usage.out,
    calls: usage.calls,
    attempts: usage.attempts ?? usage.calls,
    usageKnown: usage.usageKnown !== false,
  };
}
