import { describe, it, expect } from 'vitest';
import { signTest, pairedOutcomes } from './sign-test';
import type { SignPair } from './sign-test';
import type { RunScore } from './score';

/**
 * I-2 (2026-08-27 review): the pre-registered decision rule (pre-registration
 * criterion 6) must exist as CODE, not just prose — a pure, tested function
 * whose verdict the live report renders and the council-advantage CLAIM is
 * bound to. Exact binomial arithmetic only (n is tiny, factorials are fine);
 * no libraries, no approximation.
 */

/** binomial pmf (test-side re-derivation: verifies the DEFINITION of the reported bounds) */
function pmf(k: number, n: number, p: number): number {
  let c = 1;
  for (let i = 0; i < k; i += 1) c = (c * (n - i)) / (i + 1);
  return c * p ** k * (1 - p) ** (n - k);
}

/** all-council-wins helper: k discordant pairs, ALL won by council, plus optional ties */
function pairs(k: number, tiesBothPass = 0, tiesBothFail = 0): SignPair[] {
  return [
    ...Array.from({ length: k }, () => ({ council: true, single: false })),
    ...Array.from({ length: tiesBothPass }, () => ({ council: true, single: true })),
    ...Array.from({ length: tiesBothFail }, () => ({ council: false, single: false })),
  ];
}

describe('signTest — exact one-sided sign test with Clopper-Pearson CI', () => {
  it('11 council wins of 20 discordant pairs → one-sided p ≈ 0.4119, criterion NOT met', () => {
    // 11 wins + 9 losses, interleaved so order cannot matter
    const input: SignPair[] = [
      ...pairs(11),
      ...Array.from({ length: 9 }, () => ({ council: false, single: true })),
    ];
    const r = signTest(input);
    expect(r.discordant).toBe(20);
    expect(r.councilWins).toBe(11);
    expect(r.singleWins).toBe(9);
    // P(X >= 11 | n=20, p=0.5) = 431910/1048576
    expect(r.pOneSidedExact).toBeCloseTo(431910 / 1048576, 6);
    // exact two-sided (small-p method): tails with pmf <= pmf(11), i.e. 2x the one-sided tail by symmetry
    expect(r.pTwoSidedExact).toBeCloseTo((2 * 431910) / 1048576, 6);
    expect(r.meetsCriterion).toBe(false);
  });

  it('16 council wins of 20 discordant pairs → one-sided p ≈ 0.005909, criterion MET', () => {
    const input: SignPair[] = [
      ...pairs(16),
      ...Array.from({ length: 4 }, () => ({ council: false, single: true })),
    ];
    const r = signTest(input);
    expect(r.discordant).toBe(20);
    expect(r.councilWins).toBe(16);
    // P(X >= 16 | n=20, p=0.5) = 6196/1048576
    expect(r.pOneSidedExact).toBeCloseTo(6196 / 1048576, 6);
    expect(r.pTwoSidedExact).toBeCloseTo((2 * 6196) / 1048576, 6);
    expect(r.meetsCriterion).toBe(true);
  });

  it('ties are EXCLUDED (concordant pairs drop out; they never dilute the test)', () => {
    // 16/20 discordant PLUS 10 concordant pairs — the verdict must be identical to 16/20 alone
    const r = signTest([...pairs(16, 5, 5), ...Array.from({ length: 4 }, () => ({ council: false, single: true }))]);
    expect(r.pairs).toBe(30);
    expect(r.concordant).toBe(10);
    expect(r.discordant).toBe(20);
    expect(r.councilWins).toBe(16);
    expect(r.pOneSidedExact).toBeCloseTo(6196 / 1048576, 6);
    expect(r.meetsCriterion).toBe(true);
  });

  it('fewer than 10 discordant pairs fails the criterion REGARDLESS of p (8/8 wins: p tiny, still NOT met)', () => {
    const r = signTest(pairs(8));
    expect(r.discordant).toBe(8);
    expect(r.councilWins).toBe(8);
    expect(r.pOneSidedExact).toBeCloseTo(1 / 256, 6); // 0.0039 < 0.05 …
    expect(r.meetsCriterion).toBe(false); // …but 8 < 10 discordants: inconclusive by pre-registration
  });

  it('zero discordant pairs → no test to run: p degenerate to 1, criterion NOT met, CI degenerates to [0,1]', () => {
    const r = signTest(pairs(0, 12));
    expect(r.discordant).toBe(0);
    expect(r.pOneSidedExact).toBe(1);
    expect(r.pTwoSidedExact).toBe(1);
    expect(r.ci95ClopperPearson).toEqual({ lower: 0, upper: 1 });
    expect(r.meetsCriterion).toBe(false);
  });

  it('the Clopper-Pearson 95% CI bounds satisfy their exact definition (coverage equations hold)', () => {
    const n = 20;
    const k = 16;
    // 16 council wins + 4 single wins = 20 discordant pairs
    const { ci95ClopperPearson: ci } = signTest([
      ...pairs(16),
      ...Array.from({ length: 4 }, () => ({ council: false, single: true })),
    ]);
    // sane ordering and containment first
    expect(ci.lower).toBeGreaterThan(0);
    expect(ci.upper).toBeLessThan(1);
    expect(ci.lower).toBeLessThan(k / n);
    expect(ci.upper).toBeGreaterThan(k / n);
    // exact definition: lower solves P(X >= k | p) = 0.025, upper solves P(X <= k | p) = 0.025
    let tailAtLower = 0;
    for (let i = k; i <= n; i += 1) tailAtLower += pmf(i, n, ci.lower);
    expect(tailAtLower).toBeCloseTo(0.025, 4);
    let cdfAtUpper = 0;
    for (let i = 0; i <= k; i += 1) cdfAtUpper += pmf(i, n, ci.upper);
    expect(cdfAtUpper).toBeCloseTo(0.025, 4);
  });

  it('degenerate win counts: k=0 pins lower at 0, k=n pins upper at 1', () => {
    // 12 discordant pairs, council loses ALL of them (k=0 council wins)
    const allLoss = signTest(Array.from({ length: 12 }, () => ({ council: false, single: true })));
    expect(allLoss.discordant).toBe(12);
    expect(allLoss.councilWins).toBe(0);
    expect(allLoss.ci95ClopperPearson.lower).toBe(0);
    expect(allLoss.ci95ClopperPearson.upper).toBeLessThan(1);
    const allWin = signTest(pairs(12)); // 12 discordant, 12 council wins
    expect(allWin.ci95ClopperPearson.lower).toBeGreaterThan(0);
    expect(allWin.ci95ClopperPearson.upper).toBe(1);
  });
});

describe('pairedOutcomes — pairing the runs the pre-registration defines', () => {
  function run(taskId: string, variant: 'single' | 'council', repeat: number, intentPassed: boolean): RunScore {
    return {
      taskId,
      variant,
      assertionsPassed: 1,
      assertionsTotal: 1,
      repeat,
      structuralPassed: true,
      intentPassed,
      constraintFailures: [],
      advisoryInventions: [],
      blockedCorrectly: false,
      councilDegraded: false,
      inTokens: 0,
      outTokens: 0,
      calls: 1,
      attempts: 1,
      usageKnown: true,
    };
  }

  it('pairs GREENFIELD (task, repeat) units only — blocked tasks have no asymmetry to measure', () => {
    const runs = [
      run('ET-01', 'single', 1, true),
      run('ET-01', 'council', 1, true),
      run('ET-13', 'single', 1, false), // must-be-blocked: never paired
      run('ET-13', 'council', 1, false),
    ];
    const pairs = pairedOutcomes(runs);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toEqual({ taskId: 'ET-01', repeat: 1, councilPassed: true, singlePassed: true });
  });

  it('matches repeats exactly and drops unpaired repeats; feeds signTest end-to-end', () => {
    const runs: RunScore[] = [];
    // 3 repeats x 12 greenfield tasks; council passes everything, exactly 16
    // single runs fail (rep-1 fails all 12 tasks, rep-2 fails the first 4,
    // rep-3 fails none) → 16 discordant pairs, all council wins
    const greens = ['ET-01','ET-02','ET-03','ET-04','ET-05','ET-06','ET-07','ET-08','ET-09','ET-10','ET-11','ET-12'] as const;
    let fails = 0;
    for (let rep = 1; rep <= 3; rep += 1) {
      for (const t of greens) {
        const singleFails = rep === 1 || (rep === 2 && greens.indexOf(t) < 4);
        if (singleFails) fails += 1;
        runs.push(run(t, 'single', rep, !singleFails));
        runs.push(run(t, 'council', rep, true));
      }
    }
    expect(fails).toBe(16);
    // an unpaired repeat (council run missing) is dropped, not guessed
    runs.push(run('ET-01', 'single', 4, false));

    const pairs = pairedOutcomes(runs);
    expect(pairs).toHaveLength(36);
    expect(pairs.every((p) => p.repeat <= 3)).toBe(true);
    const r = signTest(pairs.map((p) => ({ council: p.councilPassed, single: p.singlePassed })));
    expect(r.discordant).toBe(16);
    expect(r.councilWins).toBe(16);
    expect(r.meetsCriterion).toBe(true);
  });
});
