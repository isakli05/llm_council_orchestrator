import { EVAL_TASKS } from './tasks';
import type { RunScore } from './score';
import type { PipelineVariant } from './runner';

/**
 * Evidence-gate COMPUTATION (the pure half of the old report.ts): everything
 * the gate decides, as data — no rendering, no I/O, no clock, no env.
 *
 * Gate lines (the report's evidence-force statements):
 *   G1: bad-fixture capture rate — denominator 15 (plan-corrected): the 12
 *       L-vector directories (10 lint vectors + L09/L11 schema vectors) plus
 *       schema-invalid (schema layer), drift (verify layer), and unresolved
 *       (freeze layer).
 *   G2: drift detection — the drift fixture is caught by verifyFrozen.
 *   G3: ambiguous/conflicting tasks blocked — all 8 must_be_blocked corpus
 *       tasks produced blocked outcomes in every run (across all repeats).
 *   G4: only when live runs are provided — computed ONLY over
 *       intent-fidelity-passing runs (PROD-003): council assertion total
 *       strictly greater than single AND council token cost <= 3x single,
 *       with at least one faithful run on EACH side. The cost half requires
 *       COMPLETE provider usage across every run of every repeat: any run
 *       with unknown usage fails it (UX-003 — unknown is not zero cost).
 *
 * Determinism: a pure function of GateReportInput — repeated calls with the
 * same input yield the same GateCalcs. render.ts turns this data into text;
 * report.ts drives the evals that produce the input.
 */

/** One captured fixtures/bad vector: did its expected gate layer reject it? */
export interface BadFixtureCapture {
  id: string;
  expect: string;
  caught: boolean;
}

export interface GateReportInput {
  runs: RunScore[];
  badFixtureResults: BadFixtureCapture[];
  driftCaught: boolean;
  /** Brief-compatible extra: the unresolved fixture was rejected by freeze. False (when provided) fails G1. */
  unresolvedFreezeRejected?: boolean;
  /** G4 is rendered and enforced only when live runs are provided (mock evidence cannot substantiate G4). */
  live?: boolean;
  /** PROD-003: repeats per (task, variant) the runs aggregate (derived from runs when omitted). */
  repeats?: number;
}

export type GateVerdict = 'PASS' | 'FAIL' | 'PASS_DETERMINISTIC_ONLY';

/** G1 denominator: 12 L-vector dirs + schema-invalid + drift + unresolved (plan-corrected). */
export const G1_REQUIRED_TOTAL = 15;

export interface GateCalcs {
  g1Caught: number;
  g1Total: number;
  g1Pass: boolean;
  g2Pass: boolean;
  blockedCount: number;
  blockedTotal: number;
  g3Pass: boolean;
  /** PROD-003: structural-validity passes across all runs. */
  structuralPasses: number;
  /** PROD-003: intent-fidelity passes across all runs. */
  intentPasses: number;
  runsTotal: number;
  /** Faithful (intentPassed) runs per variant — G4's only contributors. */
  councilFaithfulRuns: number;
  singleFaithfulRuns: number;
  councilAssertions: number;
  singleAssertions: number;
  councilCost: number;
  singleCost: number;
  usageUnknownRuns: number;
  costKnown: boolean;
  g4Comparable: boolean;
  g4CostOk: boolean;
  g4Pass: boolean;
  detPass: boolean;
  verdict: GateVerdict;
}

export function calcs(r: GateReportInput): GateCalcs {
  const g1Caught = r.badFixtureResults.filter((x) => x.caught).length;
  const g1Total = r.badFixtureResults.length;
  const g1Pass =
    g1Total >= G1_REQUIRED_TOTAL &&
    g1Caught === g1Total &&
    r.unresolvedFreezeRejected !== false;

  const g2Pass = r.driftCaught === true;

  const mustBlock = EVAL_TASKS.filter((t) => t.must_be_blocked);
  let blockedCount = 0;
  for (const t of mustBlock) {
    const rs = r.runs.filter((x) => x.taskId === t.id);
    if (rs.length > 0 && rs.every((x) => x.blockedCorrectly === true)) blockedCount += 1;
  }
  const blockedTotal = mustBlock.length;
  const g3Pass = blockedCount === blockedTotal;

  const structuralPasses = r.runs.filter((x) => x.structuralPassed).length;
  const intentPasses = r.runs.filter((x) => x.intentPassed).length;
  const runsTotal = r.runs.length;

  // PROD-003: the council-advantage comparison is computed ONLY over
  // intent-fidelity-passing runs — a council that scores structural assertions
  // on unfaithful bundles is not "more correct", it is more verbose. Costs are
  // likewise summed over the faithful subsets, while complete usage is demanded
  // across EVERY run of every repeat (UX-003): an unknown anywhere makes the
  // whole comparison unevaluable. An empty faithful subset on either side is
  // NOT an advantage — there is nothing comparable.
  const faithful = (v: PipelineVariant) => r.runs.filter((x) => x.variant === v && x.intentPassed);
  const councilFaithful = faithful('council');
  const singleFaithful = faithful('single');
  const councilAssertions = councilFaithful.reduce((a, x) => a + x.assertionsPassed, 0);
  const singleAssertions = singleFaithful.reduce((a, x) => a + x.assertionsPassed, 0);
  const councilCost = councilFaithful.reduce((a, x) => a + x.inTokens + x.outTokens, 0);
  const singleCost = singleFaithful.reduce((a, x) => a + x.inTokens + x.outTokens, 0);
  // UX-003: a provider that reports no usage leaves the token sums PARTIAL —
  // "council 0 <= 3x single 0" is not cost evidence, so the cost half of G4
  // fails with a named reason when ANY contributing run has unknown usage.
  const usageUnknownRuns = r.runs.filter((x) => x.usageKnown === false).length;
  const costKnown = usageUnknownRuns === 0;
  const g4Comparable = councilFaithful.length > 0 && singleFaithful.length > 0;
  const g4CostOk = costKnown && g4Comparable && councilCost <= 3 * singleCost;
  const g4Pass = g4Comparable && councilAssertions > singleAssertions && g4CostOk;

  const detPass = g1Pass && g2Pass && g3Pass;
  const verdict: GateVerdict = !r.live
    ? detPass
      ? 'PASS_DETERMINISTIC_ONLY'
      : 'FAIL'
    : detPass && g4Pass
      ? 'PASS'
      : 'FAIL';

  return {
    g1Caught, g1Total, g1Pass, g2Pass, blockedCount, blockedTotal, g3Pass,
    structuralPasses, intentPasses, runsTotal,
    councilFaithfulRuns: councilFaithful.length, singleFaithfulRuns: singleFaithful.length,
    councilAssertions, singleAssertions, councilCost, singleCost,
    usageUnknownRuns, costKnown, g4Comparable, g4CostOk, g4Pass,
    detPass, verdict,
  };
}

/** The verdict as a pure function of the report input (shared by renderGateReport and runEvalAll). */
export function gateVerdict(r: GateReportInput): GateVerdict {
  return calcs(r).verdict;
}
