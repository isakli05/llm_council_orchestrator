import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createOpenAiCompatibleLlm } from './openai-compatible';
import type { OpenAiCompatibleConfig } from './openai-compatible';

/**
 * Branch-coverage companions to openai-compatible.test.ts, same injected-
 * fetchImpl harness (no network, no keys, deterministic): endpoint joining,
 * transport-error classification (non-Error throws, fetch causes), the
 * zero-attempt fail-closed shape, malformed-success handling, and permissive
 * provenance decoding.
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

/** Baseline config; tests override fields per case. */
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

/** The retry path console.errors per failed attempt — keep the log clean. */
let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function firstCallUrl(fetchImpl: unknown): string {
  return ((fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0] as unknown as [string, RequestInit])[0];
}

describe('createOpenAiCompatibleLlm — endpoint join', () => {
  it('a base that already carries /chat/completions is used VERBATIM (no double append)', async () => {
    const fetchImpl = vi.fn(async () => okBody());
    const full = 'https://gw.example.test/v1/chat/completions';
    await createOpenAiCompatibleLlm(baseConfig({ fetchImpl, baseUrl: full })).complete('p');
    expect(firstCallUrl(fetchImpl)).toBe(full);
  });

  it('a base with trailing slashes is normalized then joined exactly once', async () => {
    const fetchImpl = vi.fn(async () => okBody());
    await createOpenAiCompatibleLlm(baseConfig({ fetchImpl, baseUrl: 'https://gw.example.test/v1///' })).complete('p');
    expect(firstCallUrl(fetchImpl)).toBe('https://gw.example.test/v1/chat/completions');
  });
});

describe('createOpenAiCompatibleLlm — transport-error classification', () => {
  it('a NON-Error rejection is still a retryable transport error: retried, then reported by String()', async () => {
    const fetchImpl = vi.fn(async () => {
      throw 'kaboom-string'; // not an Error instance
    });
    vi.useFakeTimers();
    const llm = createOpenAiCompatibleLlm(baseConfig({ fetchImpl, maxAttempts: 2, backoffMs: [1] }));
    const promise = llm.complete('p');
    promise.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(1);
    await expect(promise).rejects.toThrow(/LLM HTTP request to .* failed: kaboom-string \(after 2 attempts\)/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('a fetch cause with code AND message is surfaced in the error ([cause: CODE message])', async () => {
    const fetchImpl = vi.fn(async () => {
      throw Object.assign(new TypeError('fetch failed'), {
        cause: { code: 'ENETUNREACH', message: 'network is unreachable' },
      });
    });
    const llm = createOpenAiCompatibleLlm(baseConfig({ fetchImpl, maxAttempts: 1 }));
    await expect(llm.complete('p')).rejects.toThrow(
      /\[cause: ENETUNREACH network is unreachable\] \(after 1 attempts\)/,
    );
  });

  it('a cause with a code but NO message renders bare ([cause: ETIMEDOUT])', async () => {
    const fetchImpl = vi.fn(async () => {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ETIMEDOUT' } });
    });
    const llm = createOpenAiCompatibleLlm(baseConfig({ fetchImpl, maxAttempts: 1 }));
    await expect(llm.complete('p')).rejects.toThrow(/\[cause: ETIMEDOUT\] \(after 1 attempts\)/);
    // the diagnostic line carries the code too, with no trailing message text
    expect(errorSpy.mock.calls.map((c) => c.join(' ')).join('\n')).toMatch(/\[cause: ETIMEDOUT\]/);
  });

  it('a cause WITHOUT a code is labeled unknown; its message still shows', async () => {
    const fetchImpl = vi.fn(async () => {
      throw Object.assign(new TypeError('fetch failed'), { cause: { message: 'socket hang up' } });
    });
    const llm = createOpenAiCompatibleLlm(baseConfig({ fetchImpl, maxAttempts: 1 }));
    await expect(llm.complete('p')).rejects.toThrow(/\[cause: unknown socket hang up\]/);
  });

  it('a plain Error with no cause produces NO cause part', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const llm = createOpenAiCompatibleLlm(baseConfig({ fetchImpl, maxAttempts: 1 }));
    await expect(llm.complete('p')).rejects.toThrow(/failed: fetch failed \(after 1 attempts\)/);
    const msg = errorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(msg).not.toContain('[cause:');
  });
});

describe('createOpenAiCompatibleLlm — give-up without any transport evidence', () => {
  it('maxAttempts: 0 fails closed BEFORE any fetch, with the no-last-error message', async () => {
    const fetchImpl = vi.fn(async () => okBody());
    const llm = createOpenAiCompatibleLlm(baseConfig({ fetchImpl, maxAttempts: 0 }));
    await expect(llm.complete('p')).rejects.toThrow('LLM HTTP request failed (after 0 attempts)');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('createOpenAiCompatibleLlm — malformed success is terminal, never retried', () => {
  it('a 2xx whose body is not JSON fails closed with the not-JSON message', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('definitely { not json', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    await expect(createOpenAiCompatibleLlm(baseConfig({ fetchImpl })).complete('p')).rejects.toThrow(
      /response was not JSON/,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('a 2xx JSON object with NO choices key is refused (own-property read), not invented', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: 'g1', usage: { prompt_tokens: 1, completion_tokens: 1 } }));
    await expect(createOpenAiCompatibleLlm(baseConfig({ fetchImpl })).complete('p')).rejects.toThrow(
      /missing choices\[0\]\.message\.content/,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('createOpenAiCompatibleLlm — permissive provenance decoding', () => {
  it('openrouter_metadata.endpoints that is not an object is ignored (no crash, no provider)', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        choices: [{ message: { content: 'x' } }],
        openrouter_metadata: { attempt: 1, endpoints: 'garbage-not-an-object' },
      }),
    );
    const res = await createOpenAiCompatibleLlm(baseConfig({ fetchImpl })).complete('p');
    expect(res.provenance?.fallbackObserved).toBe(false);
    expect(res.provenance?.upstreamProvider).toBeUndefined();
  });

  it('a top-level provider {name} answers upstreamProvider when openrouter metadata did not', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        choices: [{ message: { content: 'x' } }],
        provider: { name: 'AcmeGateway' },
      }),
    );
    const res = await createOpenAiCompatibleLlm(baseConfig({ fetchImpl })).complete('p');
    expect(res.provenance?.upstreamProvider).toBe('AcmeGateway');
  });

  it('a top-level provider of the WRONG TYPE is ignored permissively (no crash)', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        choices: [{ message: { content: 'x' } }],
        provider: 'acme-not-an-object',
      }),
    );
    const res = await createOpenAiCompatibleLlm(baseConfig({ fetchImpl })).complete('p');
    expect(res.provenance?.upstreamProvider).toBeUndefined();
  });

  it('an openrouter selected endpoint WINS over a top-level provider object', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        choices: [{ message: { content: 'x' } }],
        openrouter_metadata: {
          endpoints: { available: [{ provider: 'Vendor', selected: true }] },
        },
        provider: { name: 'LoserProvider' },
      }),
    );
    const res = await createOpenAiCompatibleLlm(baseConfig({ fetchImpl })).complete('p');
    expect(res.provenance?.upstreamProvider).toBe('Vendor');
  });

  it('a top-level provider with an EMPTY name is treated as unknown', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        choices: [{ message: { content: 'x' } }],
        provider: { name: '' },
      }),
    );
    const res = await createOpenAiCompatibleLlm(baseConfig({ fetchImpl })).complete('p');
    expect(res.provenance?.upstreamProvider).toBeUndefined();
  });
});
