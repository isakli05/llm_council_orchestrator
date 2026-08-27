import { EVAL_TASKS } from './tasks';
import type { RunScore } from './score';

/**
 * PRE-REGISTERED CLAIM CRITERION (I-2, 2026-08-27 review): the paired exact
 * sign test the live-eval pre-registration names as criterion 6 — the ONLY
 * statistic that decides the council-advantage CLAIM. The CLI exit code and
 * the G4 summed-assertion line are NOT that decision; this module is.
 *
 * Pure and exact: binomial arithmetic over tiny n only (the corpus has 12
 * greenfield tasks x a handful of repeats; factorials/CDF sums are exact in
 * doubles here and no libraries are used or needed).
 *
 * Registered decision rule (pre-registration criterion 6, verbatim semantics):
 *   - Paired unit: one (greenfield task, repeat) pair.
 *   - Discordant pair: exactly one of {single, council} is a full intent-pass
 *     (`intentPassed` true). Concordant pairs (ties) are EXCLUDED — they
 *     carry no evidence about which variant wins.
 *   - Statistic: one-sided exact sign test (binomial, p0 = 0.5), H1:
 *     P(council wins) > 0.5. meetsCriterion = discordant >= 10 AND
 *     pOneSidedExact < 0.05. Fewer than 10 discordant pairs is INCONCLUSIVE
 *     (reported not-met), never a pass.
 *   - Uncertainty: exact Clopper-Pearson 95% CI for the council-win
 *     proportion among discordant pairs, reported regardless of outcome
 *     (alongside the two-sided exact p for transparency).
 */

/** One paired comparison: did the variant fully pass intent fidelity on this (task, repeat)? */
export interface SignPair {
  council: boolean;
  single: boolean;
}

/** One paired outcome as derived from runs (kept identifiable for per-task spread reporting). */
export interface PairedOutcome {
  taskId: string;
  repeat: number;
  councilPassed: boolean;
  singlePassed: boolean;
}

export interface SignTestResult {
  /** Paired units evaluated (before tie exclusion). */
  pairs: number;
  /** Discordant pairs — the sign test's n. */
  discordant: number;
  /** Concordant pairs (ties), excluded from the test. */
  concordant: number;
  /** Discordant pairs the council side won (single failed intent). */
  councilWins: number;
  /** Discordant pairs the single side won. */
  singleWins: number;
  /** P(X >= councilWins | n = discordant, p0 = 0.5) — the registered decision statistic. */
  pOneSidedExact: number;
  /** Exact two-sided p (small-p method: both tails with pmf <= pmf(k)). */
  pTwoSidedExact: number;
  /** Exact Clopper-Pearson 95% CI for councilWins/discordant. */
  ci95ClopperPearson: { lower: number; upper: number };
  /** The registered decision: discordant >= 10 AND pOneSidedExact < 0.05. */
  meetsCriterion: boolean;
}

/** Minimum discordant pairs the pre-registration demands before an effect can be claimed. */
export const MIN_DISCORDANT_PAIRS = 10;

/** Registered one-sided alpha. */
export const SIGN_TEST_ALPHA = 0.05;

/** Exact binomial coefficient (n is tiny; multiplicative form stays integral via careful ordering). */
function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let c = 1;
  for (let i = 0; i < k; i += 1) c = (c * (n - i)) / (i + 1);
  return Math.round(c);
}

function binomialPmf(k: number, n: number, p: number): number {
  if (k < 0 || k > n) return 0;
  return choose(n, k) * p ** k * (1 - p) ** (n - k);
}

/** P(X >= k | n, p): the binomial survival function as an exact CDF sum. */
function binomialTail(k: number, n: number, p: number): number {
  let sum = 0;
  for (let i = Math.max(0, k); i <= n; i += 1) sum += binomialPmf(i, n, p);
  return Math.min(1, sum);
}

/** P(X <= k | n, p): the binomial CDF as an exact sum. */
function binomialCdf(k: number, n: number, p: number): number {
  let sum = 0;
  for (let i = 0; i <= Math.min(n, k); i += 1) sum += binomialPmf(i, n, p);
  return Math.min(1, sum);
}

/**
 * Exact Clopper-Pearson bounds by definition: `lower` solves
 * P(X >= k | lower) = alpha/2, `upper` solves P(X <= k | upper) = alpha/2.
 * Both are rewritten as INCREASING functions of p before bisection (the tail
 * decreases and the cdf increases in p) — 60 halvings ≈ 1e-18, each step an
 * exact CDF sum, no libraries. Degenerate cases by convention: k=0 → lower 0,
 * k=n → upper 1, n=0 → [0, 1].
 */
function clopperPearson95(k: number, n: number): { lower: number; upper: number } {
  const alphaHalf = 0.025;
  if (n === 0) return { lower: 0, upper: 1 };
  const lower =
    k === 0
      ? 0
      : bisect((p) => binomialTail(k, n, p) - alphaHalf, 0, 1); // tail decreasing ⇒ f increasing
  const upper =
    k === n
      ? 1
      : bisect((p) => alphaHalf - binomialCdf(k, n, p), 0, 1); // cdf increasing ⇒ negated f increasing
  return { lower, upper };
}

/** Root of a monotone-increasing function on [0,1] by bisection (60 halvings ≈ 1e-18). */
function bisect(f: (p: number) => number, lo: number, hi: number): number {
  let a = lo;
  let b = hi;
  for (let i = 0; i < 60; i += 1) {
    const mid = (a + b) / 2;
    if (f(mid) <= 0) a = mid;
    else b = mid;
  }
  return (a + b) / 2;
}

/** The registered paired sign test over (council, single) full-intent-pass flags. */
export function signTest(pairs: SignPair[]): SignTestResult {
  const discordantPairs = pairs.filter((p) => p.council !== p.single);
  const n = discordantPairs.length;
  const k = discordantPairs.filter((p) => p.council).length;

  // one-sided exact: P(X >= k | n, 0.5); n=0 degenerates to 1 (no test ran)
  const pOneSidedExact = n === 0 ? 1 : binomialTail(k, n, 0.5);
  // two-sided exact (small-p method): both tails with pmf <= pmf(k)
  let pTwoSidedExact = 1;
  if (n > 0) {
    const pk = binomialPmf(k, n, 0.5);
    let sum = 0;
    for (let i = 0; i <= n; i += 1) if (binomialPmf(i, n, 0.5) <= pk) sum += binomialPmf(i, n, 0.5);
    pTwoSidedExact = Math.min(1, sum);
  }

  const meetsCriterion = n >= MIN_DISCORDANT_PAIRS && pOneSidedExact < SIGN_TEST_ALPHA;

  return {
    pairs: pairs.length,
    discordant: n,
    concordant: pairs.length - n,
    councilWins: k,
    singleWins: n - k,
    pOneSidedExact,
    pTwoSidedExact,
    ci95ClopperPearson: clopperPearson95(k, n),
    meetsCriterion,
  };
}

/**
 * Build the pre-registered pairing from scored runs: one pair per (GREENFIELD
 * task, repeat) where BOTH variants have a run at that repeat — blocked tasks
 * have no council/single asymmetry to measure, and an unpaired repeat is
 * dropped, never guessed.
 */
export function pairedOutcomes(runs: RunScore[]): PairedOutcome[] {
  const greenfield = new Set<string>(
    EVAL_TASKS.filter((t) => !t.must_be_blocked).map((t) => t.id as string),
  );
  const byKey = new Map<string, { council?: RunScore; single?: RunScore }>();
  for (const r of runs) {
    if (!greenfield.has(r.taskId)) continue;
    const key = `${r.taskId}#${r.repeat}`;
    const slot = byKey.get(key) ?? {};
    if (r.variant === 'council') slot.council = r;
    else slot.single = r;
    byKey.set(key, slot);
  }
  return [...byKey.entries()]
    .filter(([, slot]) => slot.council !== undefined && slot.single !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, slot]) => ({
      taskId: key.split('#')[0]!,
      repeat: Number(key.split('#')[1]),
      councilPassed: slot.council!.intentPassed,
      singlePassed: slot.single!.intentPassed,
    }));
}

/** Render p-values without lying about magnitude (tiny p goes exponential, not 0.00000). */
export function formatP(p: number): string {
  return p > 0 && p < 0.0001 ? p.toExponential(2) : p.toFixed(5);
}
