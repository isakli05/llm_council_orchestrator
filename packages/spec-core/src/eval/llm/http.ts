import type { LlmAdapter } from './adapter';
import type { BudgetLedger } from '../budget';
import {
  createOpenAiCompatibleLlm,
  HTTP_MAX_ATTEMPTS_PER_COMPLETION,
  HTTP_REQUEST_TIMEOUT_MS,
  HTTP_BACKOFF_TOTAL_MS,
} from '../../llm/openai-compatible';

// The transport implementation (retry policy, budget accounting, response
// parsing, provenance extraction) lives in ONE place: llm/openai-compatible.ts.
// This module is the backward-compatible LEGACY ENV wrapper: it reads the
// LCO_LLM_* environment at creation time, fails closed when the required trio
// is missing/blank, and hands a fully-resolved config to the shared transport.
// Its contract (env names, error strings, retry/budget behavior) is pinned by
// http.test.ts and consumed by the live eval entrypoints.

export {
  HTTP_MAX_ATTEMPTS_PER_COMPLETION,
  HTTP_REQUEST_TIMEOUT_MS,
  HTTP_BACKOFF_TOTAL_MS,
} from '../../llm/openai-compatible';

/**
 * OpenAI-compatible HTTP LLM adapter over the legacy LCO_LLM_* environment
 * (the GLM Coding Plan path — preserved unchanged).
 *
 * FAIL-CLOSED CONFIG: reads LCO_LLM_BASE_URL, LCO_LLM_API_KEY and
 * LCO_LLM_MODEL from the environment AT CREATION TIME and throws
 * 'live mode requires LCO_LLM_* env vars' if ANY of the three is missing or
 * blank. It never invents a default endpoint, key, or model.
 *
 * Optional live tuning (fail-closed on garbage — never silently ignored):
 * LCO_LLM_MAX_TOKENS caps generation; LCO_LLM_EXTRA_BODY (JSON object) is
 * merged into the request body — the generic escape hatch for
 * provider-specific knobs, e.g. Z.AI '{"thinking":{"type":"disabled"}}'.
 * Model and messages are pinned by the transport: EXTRA_BODY cannot
 * substitute the configured model.
 */
export function createHttpLlm(budget?: BudgetLedger): LlmAdapter {
  const baseUrl = process.env.LCO_LLM_BASE_URL;
  const apiKey = process.env.LCO_LLM_API_KEY;
  const model = process.env.LCO_LLM_MODEL;

  if (!baseUrl || !apiKey || !model) {
    throw new Error(
      'live mode requires LCO_LLM_* env vars (LCO_LLM_BASE_URL, LCO_LLM_API_KEY, LCO_LLM_MODEL)',
    );
  }

  let envMaxTokens: number | undefined;
  const rawMax = process.env.LCO_LLM_MAX_TOKENS;
  if (rawMax) {
    const n = Number(rawMax);
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error('LCO_LLM_MAX_TOKENS must be a positive integer');
    }
    envMaxTokens = n;
  }

  let extraBody: Record<string, unknown> | undefined;
  const rawExtra = process.env.LCO_LLM_EXTRA_BODY;
  if (rawExtra) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawExtra);
    } catch {
      throw new Error('LCO_LLM_EXTRA_BODY must be a JSON object');
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('LCO_LLM_EXTRA_BODY must be a JSON object');
    }
    extraBody = parsed as Record<string, unknown>;
  }

  return createOpenAiCompatibleLlm({
    gateway: 'legacy-env',
    providerKind: 'openai-compatible',
    baseUrl,
    apiKey,
    model,
    maxTokens: envMaxTokens,
    extraBody,
    budget,
  });
}
