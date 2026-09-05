import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BudgetExceededError,
  MAX_COMPLETIONS,
  DEFAULT_WALL_SLACK_MS,
  createBudgetLedger,
  worstCaseAttempts,
  worstCaseWallMs,
  resolveRunBudget,
} from './budget';
import { runPipeline } from './runner';
import type { LlmAdapter, LlmResponse } from './llm/adapter';
import type { SpecBundle } from '../schemas';
import {
  HTTP_MAX_ATTEMPTS_PER_COMPLETION,
  HTTP_REQUEST_TIMEOUT_MS,
  HTTP_BACKOFF_TOTAL_MS,
} from './llm/http';

/**
 * UX-001 (T11): run-level budgets, cancellation, and the honest request
 * envelope. The envelope numbers here are derived from the CODE constants
 * (http transport retry + the runner's validation-retry structure) — and the
 * README table is pinned to the same constants so the documented envelope
 * can never silently drift from the code that enforces it.
 */

const NOW = '2026-08-26T12:00:00Z';

/** Lint-clean p-mini bundle from the good-fixture corpus (same source report.ts uses). */
function et01Bundle(): SpecBundle {
  return JSON.parse(
    readFileSync(join(__dirname, '../../fixtures/good/pet-clinic/bundle.json'), 'utf8'),
  ) as SpecBundle;
}

// --- envelope math (from code constants) ----------------------------------

describe('request envelope — derived from code constants', () => {
  it('worst-case attempts = max completions x HTTP attempts per completion (24 single / 48 council, 2026-08-28 transport hardening)', () => {
    expect(HTTP_MAX_ATTEMPTS_PER_COMPLETION).toBe(8);
    expect(MAX_COMPLETIONS.single).toBe(3);
    expect(MAX_COMPLETIONS.council).toBe(6);
    expect(worstCaseAttempts('single')).toBe(3 * 8);
    expect(worstCaseAttempts('council')).toBe(6 * 8);
  });

  it('worst-case wall = completions x (8 x 600s timeout + 472s total backoff)', () => {
    expect(HTTP_REQUEST_TIMEOUT_MS).toBe(600_000);
    expect(HTTP_BACKOFF_TOTAL_MS).toBe(2_000 + 5_000 + 15_000 + 30_000 + 60_000 + 120_000 + 240_000);
    const perCompletion = 8 * 600_000 + 472_000; // 5272s (2026-08-28: 600s request ceiling)
    expect(worstCaseWallMs('single')).toBe(3 * perCompletion);
    expect(worstCaseWallMs('council')).toBe(6 * perCompletion);
  });

  it('MAX_COMPLETIONS matches the runner structure: single reaches 3 completions, council 6', async () => {
    // single worst case: schema-fail -> schema-retry ok -> fixable lint -> lint retry ok.
    const lintDirty = et01Bundle();
    lintDirty.tasks = []; // every requirement becomes an L02 orphan -> fixable lint error
    const schemaOkAfterRetry = 'no, not json';
    const { llm: singleLlm, calls: singleCalls } = makeLlm([
      schemaOkAfterRetry,
      JSON.stringify(lintDirty),
      JSON.stringify(et01Bundle()),
    ]);
    const singleOut = await runPipeline({ intent: 'i', profile: 'p-mini' }, 'single', singleLlm, NOW);
    expect(singleOut.kind).toBe('spec');
    expect(singleCalls()).toBe(MAX_COMPLETIONS.single);

    // council worst case: classifier + proposal A retry + final chain of 3.
    const classifier = JSON.stringify({ profile: 'p-mini', must_be_blocked: false });
    const proposalA = JSON.stringify(et01Bundle());
    const { llm: councilLlm, calls: councilCalls } = makeLlm([
      classifier,
      schemaOkAfterRetry,
      proposalA,
      schemaOkAfterRetry,
      JSON.stringify(lintDirty),
      JSON.stringify(et01Bundle()),
    ]);
    const councilOut = await runPipeline(
      { intent: 'i', profile: 'p-mini' },
      'council',
      councilLlm,
      NOW,
    );
    expect(councilOut.kind).toBe('spec');
    expect(councilCalls()).toBe(MAX_COMPLETIONS.council);
  });

  it('README cost-envelope table is pinned to the same constants (data-driven doc)', () => {
    const readme = readFileSync(join(__dirname, '../../README.md'), 'utf8');
    const singleWall = Math.round(worstCaseWallMs('single') / 1000);
    const councilWall = Math.round(worstCaseWallMs('council') / 1000);
    expect(readme).toContain(`= **${worstCaseAttempts('single')}**`);
    expect(readme).toContain(`= **${worstCaseAttempts('council')}**`);
    expect(readme).toContain(`${singleWall} saniye`);
    expect(readme).toContain(`${councilWall} saniye`);
  });
});

// --- budget resolution ------------------------------------------------------

describe('resolveRunBudget — defaults derived from the envelope', () => {
  it('clocked defaults: attempts = documented worst case (+0), wall = worst case + 60s slack, no token cap', () => {
    const b = resolveRunBudget('single', { hasClock: true });
    expect(b.maxAttempts).toBe(worstCaseAttempts('single'));
    expect(b.maxWallMs).toBe(worstCaseWallMs('single') + DEFAULT_WALL_SLACK_MS);
    expect(b.maxTokens).toBeUndefined();

    const c = resolveRunBudget('council', { hasClock: true });
    expect(c.maxAttempts).toBe(worstCaseAttempts('council'));
    expect(c.maxWallMs).toBe(worstCaseWallMs('council') + DEFAULT_WALL_SLACK_MS);
  });

  it('unclocked runs (plain library calls) keep the attempts cap but carry no wall default', () => {
    const b = resolveRunBudget('single', { hasClock: false });
    expect(b.maxAttempts).toBe(worstCaseAttempts('single'));
    expect(b.maxWallMs).toBeUndefined();
    // an explicit wall override survives resolution — and then REQUIRES a clock
    const explicit = resolveRunBudget('single', { hasClock: false, overrides: { maxWallMs: 5_000 } });
    expect(explicit.maxWallMs).toBe(5_000);
    expect(() => createBudgetLedger(explicit, {})).toThrow(/nowMs/);
  });

  it('explicit overrides win over the derived defaults', () => {
    const b = resolveRunBudget('single', { hasClock: true, overrides: { maxAttempts: 2, maxTokens: 5000, maxWallMs: 1000 } });
    expect(b).toEqual({ maxAttempts: 2, maxTokens: 5000, maxWallMs: 1000 });
  });
});

// --- ledger mechanics --------------------------------------------------------

describe('createBudgetLedger — caps and structured BUDGET_EXCEEDED', () => {
  it('attempts cap: charging past the cap throws BudgetExceededError naming spent vs limit', () => {
    const ledger = createBudgetLedger({ maxAttempts: 2 }, {});
    ledger.chargeAttempts(1);
    ledger.chargeAttempts(1);
    expect(() => ledger.chargeAttempts(1)).toThrow(BudgetExceededError);
    try {
      ledger.chargeAttempts(1);
    } catch (err) {
      const e = err as BudgetExceededError;
      expect(e.cap).toBe('attempts');
      expect(e.spent).toBe(3);
      expect(e.limit).toBe(2);
      expect(e.message).toContain('BUDGET_EXCEEDED (attempts)');
      expect(e.message).toContain('3');
      expect(e.message).toContain('2');
    }
  });

  it('tokens cap: cumulative in+out over the cap throws with the token detail', () => {
    const ledger = createBudgetLedger({ maxTokens: 100 }, {});
    ledger.chargeTokens({ in_tokens: 60, out_tokens: 20 }); // 80 <= 100 ok
    expect(() => ledger.chargeTokens({ in_tokens: 10, out_tokens: 20 })).toThrow(
      /BUDGET_EXCEEDED \(tokens\)/,
    );
  });

  it('wall cap: checkWall throws once the injected clock passes start + maxWallMs (never before)', () => {
    let fakeNow = 1_000_000;
    const ledger = createBudgetLedger({ maxWallMs: 5_000 }, { nowMs: () => fakeNow });
    ledger.checkWall(); // t=0 relative — fine
    fakeNow += 4_999;
    ledger.checkWall(); // still inside
    fakeNow += 2;
    expect(() => ledger.checkWall()).toThrow(/BUDGET_EXCEEDED \(wall\)/);
  });

  it('a wall budget without an injected clock is a construction error (cores never read the clock)', () => {
    expect(() => createBudgetLedger({ maxWallMs: 1_000 }, {})).toThrow(/nowMs/);
  });

  it('no wall budget: checkWall is a no-op even without a clock', () => {
    const ledger = createBudgetLedger({ maxAttempts: 1 }, {});
    expect(() => ledger.checkWall()).not.toThrow();
  });

  it('spent() reports the accumulated accounting', () => {
    const ledger = createBudgetLedger({ maxAttempts: 10, maxTokens: 1000 }, {});
    ledger.chargeAttempts(4);
    ledger.chargeTokens({ in_tokens: 100, out_tokens: 50 });
    expect(ledger.spent()).toEqual({ attempts: 4, tokensIn: 100, tokensOut: 50 });
  });
});

// --- runner integration --------------------------------------------------------

describe('runPipeline with a budget ledger — abort, no late calls', () => {
  const classifier = JSON.stringify({ profile: 'p-mini', must_be_blocked: false });
  const bundleJson = JSON.stringify(et01Bundle());

  it('attempts cap trips mid-run: BudgetExceededError propagates out of runPipeline and NO further calls happen', async () => {
    const { llm, calls } = makeLlm([classifier, bundleJson, bundleJson]);
    const ledger = createBudgetLedger({ maxAttempts: 2 }, {});
    // council: call 1 (classifier) + call 2 (proposal A) charged; the final
    // gated chain's 3rd charge exceeds the cap of 2.
    const promise = runPipeline({ intent: 'i', profile: 'p-mini' }, 'council', llm, NOW, ledger);
    await expect(promise).rejects.toBeInstanceOf(BudgetExceededError);
    await expect(promise).rejects.toThrow(/BUDGET_EXCEEDED \(attempts\)/);
    // cancellation is clean: after the rejection no further adapter calls
    // arrive (sequential pipeline — nothing resolves after the abort).
    await new Promise((r) => setTimeout(r, 0));
    expect(calls()).toBe(2);
  });

  it('token cap trips after a chargeTokens crossing', async () => {
    const { llm } = makeLlm([
      classifier,
      bundleJson,
      bundleJson,
      bundleJson,
    ]);
    const ledger = createBudgetLedger(
      { maxAttempts: 24, maxTokens: 60 }, // each mock call reports 10n/5n: 15+20=35, +25=60, +30=90 > 60
      {},
    );
    await expect(
      runPipeline({ intent: 'i', profile: 'p-mini' }, 'council', llm, NOW, ledger),
    ).rejects.toThrow(/BUDGET_EXCEEDED \(tokens\)/);
  });

  it('wall cap trips between calls with the injected clock', async () => {
    let fakeNow = 0;
    const classifier2 = classifier;
    // the adapter's calls are the clock: each completion "takes" 2s of wall
    // time, so after the first call the 1s budget is blown and the runner's
    // next checkWall aborts before issuing the second completion.
    let n = 0;
    const llm: LlmAdapter = {
      async complete(): Promise<LlmResponse> {
        n += 1;
        fakeNow += 2_000;
        return {
          text: n === 1 ? classifier2 : bundleJson,
          usage: { in_tokens: 10, out_tokens: 5 },
        };
      },
    };
    const ledger = createBudgetLedger({ maxWallMs: 1_000 }, { nowMs: () => fakeNow });
    await expect(
      runPipeline({ intent: 'i', profile: 'p-mini' }, 'council', llm, NOW, ledger),
    ).rejects.toThrow(/BUDGET_EXCEEDED \(wall\)/);
    expect(n).toBe(1); // the abort preceded the second paid call
  });
});

// --- helpers --------------------------------------------------------------------

/** The makeLlm pattern from runner.test.ts: scripted responses, per-call usage 10n/5n, counts calls. */
function makeLlm(responses: string[]): { llm: LlmAdapter; calls: () => number } {
  let n = 0;
  const llm: LlmAdapter = {
    async complete(prompt: string): Promise<LlmResponse> {
      n += 1;
      const text = responses[n - 1];
      if (text === undefined) {
        throw new Error(`test-llm: unexpected call #${n} (script has ${responses.length})`);
      }
      return { text, usage: { in_tokens: 10 * n, out_tokens: 5 * n } };
    },
  };
  return { llm, calls: () => n };
}

// --- topology-aware envelopes (multi-provider council) ---------------------------

describe('topology-aware budget envelopes', () => {
  it('decomposed council gets its own, larger completion/attempt/wall ceilings', async () => {
    const { maxCompletions } = await import('./budget');
    expect(maxCompletions('single')).toBe(3);
    expect(maxCompletions('single', 'decomposed')).toBe(3); // topology is council-only
    expect(maxCompletions('council')).toBe(6); // fused default (legacy call shape)
    expect(maxCompletions('council', 'fused')).toBe(6);
    expect(maxCompletions('council', 'decomposed')).toBe(8); // 1+2+2+3
    expect(worstCaseAttempts('council', 'decomposed')).toBe(8 * HTTP_MAX_ATTEMPTS_PER_COMPLETION);
    expect(worstCaseWallMs('council', 'decomposed')).toBe(
      8 * (HTTP_MAX_ATTEMPTS_PER_COMPLETION * HTTP_REQUEST_TIMEOUT_MS + HTTP_BACKOFF_TOTAL_MS),
    );
  });

  it('resolveRunBudget accepts an optional topology; legacy calls keep fused numbers', () => {
    const legacy = resolveRunBudget('council', { hasClock: false });
    const fused = resolveRunBudget('council', { hasClock: false }, 'fused');
    expect(legacy).toEqual(fused);
    const decomposed = resolveRunBudget('council', { hasClock: false }, 'decomposed');
    expect(decomposed.maxAttempts).toBe(8 * HTTP_MAX_ATTEMPTS_PER_COMPLETION);
    // explicit overrides still win over the topology default
    const pinned = resolveRunBudget('council', { hasClock: false, overrides: { maxAttempts: 4 } }, 'decomposed');
    expect(pinned.maxAttempts).toBe(4);
  });
});
