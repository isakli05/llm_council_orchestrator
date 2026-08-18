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
 */

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

  // Endpoint join: accept a base that already carries /chat/completions,
  // otherwise append it to the base (trailing slashes stripped).
  const endpoint = baseUrl.endsWith('/chat/completions')
    ? baseUrl
    : `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

  return {
    async complete(prompt: string, opts?: LlmCompleteOptions): Promise<LlmResponse> {
      let res: Response;
      try {
        res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            ...(opts?.max_tokens !== undefined ? { max_tokens: opts.max_tokens } : {}),
          }),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`LLM HTTP request to ${endpoint} failed: ${msg}`);
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        const excerpt = body.slice(0, 300);
        throw new Error(`LLM HTTP ${res.status} ${res.statusText}: ${excerpt}`);
      }

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
    },
  };
}
