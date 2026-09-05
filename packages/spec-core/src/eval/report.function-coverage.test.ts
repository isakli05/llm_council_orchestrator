import { describe, expect, it } from 'vitest';
import { runEvalAll } from './report';

/**
 * Deterministic function-coverage hardening for the LIVE branch of the eval
 * driver: `runLiveEval` is reachable only through `runEvalAll({variant:
 * 'live'})`, and its first acts are the corpus-lock verification and the
 * fail-closed `createHttpLlm()` construction. With the LCO_LLM_* environment
 * absent the run REFUSES before a single request could be made — the
 * documented contract ("live mode requires LCO_LLM_* env vars ... never
 * invented"). This is the live driver's testable boundary: zero network,
 * zero paid calls, fully deterministic.
 */

const LIVE_ENV_KEYS = ['LCO_LLM_BASE_URL', 'LCO_LLM_API_KEY', 'LCO_LLM_MODEL'] as const;

describe('runEvalAll — live variant fails closed without the LCO_LLM_* environment', () => {
  it('rejects with the env-contract error before any call is made (env cleaned and restored around the run)', async () => {
    const saved: Record<string, string | undefined> = {};
    for (const key of LIVE_ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    try {
      await expect(runEvalAll({ variant: 'live', repeats: 1 })).rejects.toThrowError(/LCO_LLM_/);
    } finally {
      for (const key of LIVE_ENV_KEYS) {
        if (saved[key] !== undefined) process.env[key] = saved[key];
        else delete process.env[key];
      }
    }
  });
});
