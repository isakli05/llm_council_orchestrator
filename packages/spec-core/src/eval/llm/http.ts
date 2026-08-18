import type { LlmAdapter, LlmCompleteOptions, LlmResponse } from './adapter';

/**
 * OpenAI-compatible HTTP LLM adapter (chat/completions) built on the global
 * fetch — no vendor SDK, so it works against any compatible endpoint.
 *
 * FAIL-CLOSED CONFIG: `createHttpLlm()` reads LCO_LLM_BASE_URL,
 * LCO_LLM_API_KEY and LCO_LLM_MODEL from the environment AT CREATION TIME and
 * throws 'live mode requires LCO_LLM_* env vars' if ANY of the three is
 * missing or blank. It never invents a default endpoint, key, or model. The
 * adapter itself captures the resolved values and performs no further
 * environment access.
 *
 * Response handling: text comes from choices[0].message.content (missing
 * content → throw, never fabricate); usage is mapped from the OpenAI usage
 * field (prompt_tokens → in_tokens, completion_tokens → out_tokens) and is
 * `undefined` when the backend does not report it. Non-2xx → throw with the
 * HTTP status and a body excerpt. Transport errors propagate wrapped.
 *
 * TRANSPORT RETRY (live-run robustness): transport-level failures (fetch
 * 'fetch failed', timeouts) and transient statuses (429, 5xx) are retried up
 * to MAX_ATTEMPTS=4 total attempts with 2s/5s/10s backoff and a 180s
 * per-request timeout. Retrying the IDENTICAL request on infrastructure
 * errors does not alter experiment results (no partial answers are kept);
 * non-retryable 4xx fails immediately — auth/protocol errors are never
 * hammered. A 2xx with unparseable/missing payload still fails closed
 * WITHOUT retry (malformed success is a protocol bug, not a blip).
 */

const MAX_ATTEMPTS = 4;
const BACKOFF_MS = [2_000, 5_000, 10_000];
const REQUEST_TIMEOUT_MS = 180_000;

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Minimal shape of an OpenAI-compatible chat/completions response (unknown-narrowed on read). */
interface HttpChatResponse {
  choices?: { message?: { content?: unknown } }[];
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
}

export function createHttpLlm(): LlmAdapter {
  const baseUrl = process.env.LCO_LLM_BASE_URL;
  const apiKey = process.env.LCO_LLM_API_KEY;
  const model = process.env.LCO_LLM_MODEL;

  if (!baseUrl || !apiKey || !model) {
    throw new Error(
      'live mode requires LCO_LLM_* env vars (LCO_LLM_BASE_URL, LCO_LLM_API_KEY, LCO_LLM_MODEL)',
    );
  }

  // Optional live tuning (fail-closed on garbage — never silently ignored):
  // LCO_LLM_MAX_TOKENS caps generation (default when a call passes no opts);
  // LCO_LLM_EXTRA_BODY (JSON object) is merged last into the request body —
  // the generic escape hatch for provider-specific knobs, e.g. Z.AI
  // '{"thinking":{"type":"disabled"}}' to skip hidden reasoning on
  // non-streaming calls that would otherwise run minutes.
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

  // Endpoint join: accept a base that already carries /chat/completions,
  // otherwise append it to the base (trailing slashes stripped).
  const endpoint = baseUrl.endsWith('/chat/completions')
    ? baseUrl
    : `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

  return {
    async complete(prompt: string, opts?: LlmCompleteOptions): Promise<LlmResponse> {
      const requestBody = JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        ...(opts?.max_tokens !== undefined
          ? { max_tokens: opts.max_tokens }
          : envMaxTokens !== undefined
            ? { max_tokens: envMaxTokens }
            : {}),
        ...(extraBody ?? {}),
      });

      let lastError: Error | undefined;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (attempt > 1) await sleep(BACKOFF_MS[attempt - 2]);

        let res: Response;
        try {
          res = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${apiKey}`,
            },
            body: requestBody,
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          lastError = new Error(`LLM HTTP request to ${endpoint} failed: ${msg}`);
          continue; // transport error → retry
        }

        if (res.ok) {
          return parseSuccess(res);
        }

        const body = await res.text().catch(() => '');
        const excerpt = body.slice(0, 300);
        const httpError = new Error(`LLM HTTP ${res.status} ${res.statusText}: ${excerpt}`);
        if (isRetryableStatus(res.status)) {
          lastError = httpError;
          continue;
        }
        throw httpError; // non-retryable 4xx → fail fast
      }

      throw new Error(`${lastError?.message ?? 'LLM HTTP request failed'} (after ${MAX_ATTEMPTS} attempts)`);
    },
  };

  async function parseSuccess(res: Response): Promise<LlmResponse> {
    let data: HttpChatResponse;
    try {
      data = (await res.json()) as HttpChatResponse;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`LLM HTTP ${res.status} response was not JSON: ${msg}`);
    }

    const text = data.choices?.[0]?.message?.content;
    if (typeof text !== 'string') {
      throw new Error(
        'LLM HTTP response missing choices[0].message.content (fail-closed; refusing to invent output)',
      );
    }

    const u = data.usage;
    const usage =
      typeof u?.prompt_tokens === 'number' && typeof u?.completion_tokens === 'number'
        ? { in_tokens: u.prompt_tokens, out_tokens: u.completion_tokens }
        : undefined;

    return { text, usage };
  }
}
