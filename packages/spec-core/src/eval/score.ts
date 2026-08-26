import { lintBundle } from '../lint/engine';
import { buildTrace } from '../lint/trace';
import type { EvalTask, DeterministicAssertion } from './tasks';
import type { PipelineOutcome, PipelineVariant } from './runner';

/**
 * Deterministic scoring of one pipeline outcome against a task's assertions
 * (Task 10 binding). No LLM judge anywhere: every assertion is a pure check
 * over the outcome (and, for spec outcomes, the bundle the runner already
 * schema-validated and lint-gated).
 */

export interface RunScore {
  taskId: string;
  variant: PipelineVariant;
  assertionsPassed: number;
  assertionsTotal: number;
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
  }
}

/** Score one outcome: assertion arithmetic + blocked-correctness + usage passthrough. */
export function scoreRun(task: EvalTask, outcome: PipelineOutcome, usage: RunUsage): RunScore {
  const assertionsPassed = task.assertions.filter((a) =>
    assertionPasses(a, task, outcome),
  ).length;

  const blockedCorrectly =
    outcome.kind === 'blocked' || outcome.kind === 'spec'
      ? (outcome.kind === 'blocked') === task.must_be_blocked
      : null;

  return {
    taskId: task.id,
    variant: outcome.variant,
    assertionsPassed,
    assertionsTotal: task.assertions.length,
    blockedCorrectly,
    councilDegraded: outcome.councilDegraded === true,
    inTokens: usage.in,
    outTokens: usage.out,
    calls: usage.calls,
    attempts: usage.attempts ?? usage.calls,
    usageKnown: usage.usageKnown !== false,
  };
}
