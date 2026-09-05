import { describe, it, expect, vi, afterEach } from 'vitest';
import { createOpenAiCompatibleLlm } from './openai-compatible';
import type { OpenAiCompatibleConfig } from './openai-compatible';
import { createBudgetLedger, BudgetExceededError } from '../eval/budget';

/**
 * The ONE reusable OpenAI-compatible transport, tested with an INJECTED
 * fetchImpl — no network, no keys, deterministic. The legacy env behavior on
 * top of it is pinned by eval/llm/http.test.ts (which stays untouched).
 */

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    statusText: status === 200 ? 'OK' : 'Internal Server Error',
    headers: { 'content-type': 'application/json' },
  });
}

const okBody = () =>
  jsonResponse({
    choices: [{ message: { content: 'hello' } }],
    usage: { prompt_tokens: 3, completion_tokens: 2 },
  });

/** Baseline config for the generic kind; tests override fields per case. */
function baseConfig(overrides: Partial<OpenAiCompatibleConfig> = {}): OpenAiCompatibleConfig {
  return {
    gateway: 'glm',
    providerKind: 'openai-compatible',
    baseUrl: 'https://gw.example.test/v1',
    apiKey: 'test-key-not-a-real-secret',
    model: 'test-model-x',
    fetchImpl: vi.fn(async () => okBody()),
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('createOpenAiCompatibleLlm — request assembly', () => {
  it('POSTs {base}/chat/completions with bearer auth and the configured model', async () => {
    const fetchImpl = vi.fn(async () => okBody());
    const llm = createOpenAiCompatibleLlm(baseConfig({ fetchImpl }));
    await llm.complete('p');
    const [url, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://gw.example.test/v1/chat/completions');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer test-key-not-a-real-secret');
    expect(headers['content-type']).toBe('application/json');
    const body = JSON.parse(init.body as string) as { model: string; messages: unknown[] };
    expect(body.model).toBe('test-model-x');
    expect(body.messages).toEqual([{ role: 'user', content: 'p' }]);
  });

  it('extraHeaders ride along but can NEVER override authorization or content-type', async () => {
    const fetchImpl = vi.fn(async () => okBody());
    const llm = createOpenAiCompatibleLlm(
      baseConfig({
        fetchImpl,
        extraHeaders: {
          'x-app': 'lco',
          'x-title': 'lco-spec',
          // hostile/self-inflicted overrides must not win:
          authorization: 'Bearer attacker',
          'content-type': 'text/plain',
        },
      }),
    );
    await llm.complete('p');
    const headers = ((fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0] as unknown as [
      string,
      RequestInit,
    ])[1].headers as Record<string, string>;
    expect(headers['x-app']).toBe('lco');
    expect(headers.authorization).toBe('Bearer test-key-not-a-real-secret');
    expect(headers['content-type']).toBe('application/json');
  });

  it('max_tokens from call opts wins, then config maxTokens; extraBody merges LAST', async () => {
    const fetchImpl = vi.fn(async () => okBody());
    const llm = createOpenAiCompatibleLlm(
      baseConfig({ fetchImpl, maxTokens: 9000, extraBody: { temperature: 0.2, model: 'evil-override' } }),
    );
    await llm.complete('p', { max_tokens: 512 });
    const body = JSON.parse(
      ((fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0] as unknown as [string, RequestInit])[1]
        .body as string,
    ) as Record<string, unknown>;
    // call-site cap wins over the gateway default…
    expect(body.max_tokens).toBe(512);
    // …and extraBody merges last (provider escape hatch semantics), EXCEPT
    // the identity-critical fields LCO pins: model stays the configured one.
    expect(body.model).toBe('test-model-x');
    expect(body.temperature).toBe(0.2);
  });
});

describe('createOpenAiCompatibleLlm — response parsing + provenance', () => {
  it('extracts provenance: id, resolved model, openrouter_metadata selected endpoint + attempt', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        id: 'gen-test123',
        model: 'vendor/actual-model',
        choices: [{ message: { content: 'x' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
        openrouter_metadata: {
          requested: 'vendor/model',
          attempt: 2,
          endpoints: { available: [{ provider: 'Vendor', model: 'vendor/actual-model', selected: true }] },
        },
      }),
    );
    const llm = createOpenAiCompatibleLlm(
      baseConfig({ fetchImpl, providerKind: 'openrouter', gateway: 'openrouter', model: 'vendor/model' }),
    );
    const res = await llm.complete('p');
    expect(res.provenance).toMatchObject({
      gateway: 'openrouter',
      providerKind: 'openrouter',
      requestedModel: 'vendor/model',
      resolvedModel: 'vendor/actual-model',
      upstreamProvider: 'Vendor',
      requestId: 'gen-test123',
      fallbackObserved: true, // openrouter_metadata.attempt = 2 (>1 ⇒ fallback)
    });
  });

  it('absent identity fields stay ABSENT (unknown, never blank/zero)', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ choices: [{ message: { content: 'x' } }] }),
    );
    const res = await createOpenAiCompatibleLlm(baseConfig({ fetchImpl })).complete('p');
    expect(res.provenance).toEqual({
      gateway: 'glm',
      providerKind: 'openai-compatible',
      requestedModel: 'test-model-x',
    });
    expect(res.provenance?.resolvedModel).toBeUndefined();
    expect(res.provenance?.upstreamProvider).toBeUndefined();
    expect(res.provenance?.cost).toBeUndefined();
  });

  it('openrouter_metadata.attempt = 1 ⇒ fallbackObserved false; malformed metadata is ignored permissively', async () => {
    const attempt1 = vi.fn(async () =>
      jsonResponse({
        id: 'g1',
        choices: [{ message: { content: 'x' } }],
        openrouter_metadata: { attempt: 1, endpoints: { available: 'garbage-not-an-array' } },
      }),
    );
    const res = await createOpenAiCompatibleLlm(baseConfig({ fetchImpl: attempt1 })).complete('p');
    expect(res.provenance?.fallbackObserved).toBe(false);
    expect(res.provenance?.upstreamProvider).toBeUndefined(); // permissive decode, no crash
  });

  it('extracts usageDetails (reasoning/cache) when the provider reports them', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        choices: [{ message: { content: 'x' } }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          prompt_tokens_details: { cached_tokens: 4, cache_write_tokens: 2 },
          completion_tokens_details: { reasoning_tokens: 3 },
        },
      }),
    );
    const res = await createOpenAiCompatibleLlm(baseConfig({ fetchImpl })).complete('p');
    expect(res.usageDetails).toEqual({ reasoningTokens: 3, cacheReadTokens: 4, cacheWriteTokens: 2 });
    expect(res.usage).toEqual({ in_tokens: 10, out_tokens: 5 });
  });

  it('usageDetails omitted when the provider reports none', async () => {
    const res = await createOpenAiCompatibleLlm(baseConfig()).complete('p');
    expect(res.usageDetails).toBeUndefined();
  });

  it('costExtractor maps provider-reported cost (never invented)', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        choices: [{ message: { content: 'x' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.0123 },
      }),
    );
    const res = await createOpenAiCompatibleLlm(
      baseConfig({
        fetchImpl,
        costExtractor: (u) => {
          const cost = (u as { cost?: unknown }).cost;
          return typeof cost === 'number' ? { amount: cost, currency: 'credits' } : undefined;
        },
      }),
    ).complete('p');
    expect(res.provenance?.cost).toEqual({ amount: 0.0123, currency: 'credits' });
  });

  it('costExtractor returning undefined leaves cost unknown', async () => {
    const res = await createOpenAiCompatibleLlm(
      baseConfig({ costExtractor: () => undefined }),
    ).complete('p');
    expect(res.provenance?.cost).toBeUndefined();
  });

  it('reports transport latency for the completion (incl. retries)', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(okBody());
    vi.useFakeTimers();
    let fakeNow = 0;
    const llm = createOpenAiCompatibleLlm(baseConfig({ fetchImpl, nowMs: () => fakeNow }));
    const promise = llm.complete('p');
    fakeNow += 2_000; // the backoff sleep is part of the wall latency
    await vi.advanceTimersByTimeAsync(2_000);
    const res = await promise;
    expect(res.latencyMs).toBe(2_000);
  });
});

describe('createOpenAiCompatibleLlm — transport policy parity with the legacy adapter', () => {
  it('retryable 5xx then success (backoff 2s/5s), attempts self-reported', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(okBody());
    vi.useFakeTimers();
    const llm = createOpenAiCompatibleLlm(baseConfig({ fetchImpl }));
    const promise = llm.complete('p');
    await vi.advanceTimersByTimeAsync(2_000);
    const res = await promise;
    expect(res.text).toBe('hello');
    expect(res.attempts).toBe(2);
  });

  it('non-retryable 4xx fails immediately with status + excerpt', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { message: 'quota gone' } }, 402));
    const llm = createOpenAiCompatibleLlm(baseConfig({ fetchImpl }));
    await expect(llm.complete('p')).rejects.toThrow(/LLM HTTP 402.*quota gone/s);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('a 2xx with unparseable/missing payload fails closed WITHOUT retry', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ choices: [] }));
    await expect(
      createOpenAiCompatibleLlm(baseConfig({ fetchImpl })).complete('p'),
    ).rejects.toThrow(/missing choices\[0\]\.message\.content/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('charges the ledger per attempt BEFORE the request and checks the wall between attempts', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 500));
    vi.useFakeTimers();
    const ledger = createBudgetLedger({ maxAttempts: 2 }, {});
    const llm = createOpenAiCompatibleLlm(baseConfig({ fetchImpl, budget: ledger }));
    const promise = llm.complete('p');
    promise.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(promise).rejects.toBeInstanceOf(BudgetExceededError);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(ledger.spent().attempts).toBe(2);
  });

  it('custom timeoutMs/attempts/backoff are honored (tight knobs for cheap models endpoints)', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 503));
    vi.useFakeTimers();
    const llm = createOpenAiCompatibleLlm(
      baseConfig({ fetchImpl, maxAttempts: 2, backoffMs: [10] }),
    );
    const promise = llm.complete('p');
    promise.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(10);
    await expect(promise).rejects.toThrow(/after 2 attempts/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
