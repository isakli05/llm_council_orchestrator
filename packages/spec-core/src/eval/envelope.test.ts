import { describe, it, expect } from 'vitest';
import { computeCostEnvelope, renderCostEnvelopeTable, measurePromptSizes } from './envelope';
import { EVAL_TASKS } from './tasks';

/**
 * RESIDUAL PROD-003 (PART 3): the cost envelope the pre-registration cites is
 * COMPUTED, not transcribed — these tests pin the exact numbers against the
 * code constants so the doc cannot silently drift from the runner.
 */

describe('computeCostEnvelope — per-task envelope (UX-001 parity)', () => {
  const e = computeCostEnvelope(3);

  it('matches the corpus: 20 tasks, 12 greenfield, 8 must-block', () => {
    expect(e.tasks).toBe(EVAL_TASKS.length).toBe(20);
    expect(e.greenfield).toBe(12);
    expect(e.mustBlock).toBe(8);
  });

  it('pins the transport-hardened envelope (2026-08-28: 8 attempts/completion): single 1..3 completions / 8..24 attempts, council 3..6 / 24..48 per task', () => {
    const single = e.perVariant.find((v) => v.variant === 'single')!;
    const council = e.perVariant.find((v) => v.variant === 'council')!;
    expect(single.minCompletionsPerTask).toBe(1);
    expect(single.maxCompletionsPerTask).toBe(3);
    expect(single.minAttemptsPerTask).toBe(1);
    expect(single.maxAttemptsPerTask).toBe(24); // 3 completions x 8 transport attempts
    expect(council.minCompletionsPerTask).toBe(3);
    expect(council.maxCompletionsPerTask).toBe(6);
    expect(council.minAttemptsPerTask).toBe(3);
    expect(council.maxAttemptsPerTask).toBe(48); // 6 completions x 8 transport attempts
  });

  it('per-completion worst wall = 8 x 600s + 472s backoff = 5272s (2026-08-28 transport hardening, 600s ceiling)', () => {
    expect(e.httpMaxAttemptsPerCompletion).toBe(8);
    expect(e.httpRequestTimeoutSeconds).toBe(600);
    expect(e.perCompletionWorstWallSeconds).toBe(5272);
  });
});

describe('computeCostEnvelope — full corpus at 3 repeats', () => {
  const e = computeCostEnvelope(3);

  it('completions 240..540 and attempts 240..4320 (both variants, 20 tasks, 3 repeats)', () => {
    // min: single 1 + council 3 = 4 completions / 4 attempts per task per repeat
    expect(e.fullCorpus.minCompletions).toBe(20 * 3 * (1 + 3)).toBe(240);
    // max: 3 + 6 = 9 completions; attempts 24 + 48 = 72
    expect(e.fullCorpus.maxCompletions).toBe(20 * 3 * (3 + 6)).toBe(540);
    expect(e.fullCorpus.minAttempts).toBe(240);
    expect(e.fullCorpus.maxAttempts).toBe(20 * 3 * (24 + 48)).toBe(4320);
  });

  it('worst-case wall = 540 completions x 5272s = 2,846,880s ≈ 790.8h', () => {
    expect(e.fullCorpus.worstCaseWallSeconds).toBe(540 * 5272);
  });

  it('prompt sizes are measured, positive, and the bundle-producing templates dominate (schema embed)', () => {
    const sizes = measurePromptSizes();
    expect(sizes).toHaveLength(5);
    for (const s of sizes) {
      expect(s.minBytes, s.template).toBeGreaterThan(1_000);
      expect(s.maxBytes).toBeGreaterThanOrEqual(s.minBytes);
    }
    // the classifier prompt is small (no schema embed); every bundle-producing
    // prompt embeds the full JSON Schema, so it is an order of magnitude larger
    const classifier = sizes.find((s) => s.template.startsWith('classifySingle'))!;
    const proposer = sizes.find((s) => s.template.startsWith('propose '))!;
    expect(classifier.maxBytes).toBeLessThan(5_000);
    expect(proposer.minBytes).toBeGreaterThan(10_000);
    const biggest = sizes.reduce((a, b) => (b.maxBytes > a.maxBytes ? b : a));
    expect(biggest.template).toContain('proposeB');
  });

  it('the worst-case input-token lower bound is derived, not guessed (bytes/4 over max completions)', () => {
    const biggest = Math.max(...e.promptBytes.map((p) => p.maxBytes));
    expect(e.worstCasePromptTokensLowerBound).toBe(Math.round((540 * biggest) / 4));
  });
});

describe('renderCostEnvelopeTable', () => {
  it('emits the dimensions the pre-registration table cites', () => {
    const text = renderCostEnvelopeTable(computeCostEnvelope(3));
    expect(text).toContain('| logical completions per task | 1..3 | 3..6 |');
    expect(text).toContain('| HTTP attempts per task | 1..24 | 3..48 |');
    expect(text).toContain('logical completions: 240..540');
    expect(text).toContain('HTTP attempts: 240..4320');
    expect(text).toContain(`worst-case wall time: ${(2_846_880 / 3600).toFixed(1)}h`);
    expect(text).toContain('bytes/4 heuristic');
  });
});
