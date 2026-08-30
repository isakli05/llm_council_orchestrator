import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHttpLlm } from './http';
import { BudgetExceededError, createBudgetLedger } from '../budget';

/**
 * Unit tests with a stubbed global fetch — no real network, no real secrets.
 * Env values here are FAKE test fixtures (never printed from the real env).
 */

const FAKE_ENV = {
  LCO_LLM_BASE_URL: 'https://llm.example.test/v1',
  LCO_LLM_API_KEY: 'test-key-not-a-real-secret',
  LCO_LLM_MODEL: 'test-model-x',
} as const;

type FakeEnv = { [K in keyof typeof FAKE_ENV]: string };
type PartialFakeEnv = Partial<FakeEnv>;

/** Stub all three vars with fakes by default (blank when a key is omitted) so real machine env cannot leak in. */
function stubEnv(partial: PartialFakeEnv = FAKE_ENV): void {
  for (const key of Object.keys(FAKE_ENV) as (keyof FakeEnv)[]) {
    vi.stubEnv(key, partial[key] ?? '');
  }
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    statusText: status === 200 ? 'OK' : 'Internal Server Error',
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('createHttpLlm — fail-closed env handling', () => {
  it('throws when none of the LCO_LLM_* env vars are set', () => {
    stubEnv({});
    expect(() => createHttpLlm()).toThrow('live mode requires LCO_LLM_* env vars');
  });

  it.each(['LCO_LLM_BASE_URL', 'LCO_LLM_API_KEY', 'LCO_LLM_MODEL'] as const)(
    'throws when only %s is missing',
    (missing) => {
      const partial: PartialFakeEnv = { ...FAKE_ENV };
      delete partial[missing];
      stubEnv(partial);
      expect(() => createHttpLlm()).toThrow('live mode requires LCO_LLM_* env vars');
    },
  );

  it('throws on empty-string values (missing means unset OR blank)', () => {
    stubEnv({ ...FAKE_ENV, LCO_LLM_API_KEY: '' });
    expect(() => createHttpLlm()).toThrow('live mode requires LCO_LLM_* env vars');
  });
});

describe('createHttpLlm — chat/completions over stubbed fetch', () => {
  it('200 + usage → LlmResponse with prompt/completion tokens mapped to in/out', async () => {
    stubEnv();
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        choices: [{ message: { content: '{"ok":true}' } }],
        usage: { prompt_tokens: 101, completion_tokens: 57 },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const llm = createHttpLlm();
    const res = await llm.complete('prompt text');

    expect(res.text).toBe('{"ok":true}');
    expect(res.usage).toEqual({ in_tokens: 101, out_tokens: 57 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://llm.example.test/v1/chat/completions');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer test-key-not-a-real-secret');
    expect(headers['content-type']).toBe('application/json');
    const body = JSON.parse(init.body as string) as {
      model: string;
      messages: { role: string; content: string }[];
      max_tokens?: number;
    };
    expect(body.model).toBe('test-model-x');
    expect(body.messages).toEqual([{ role: 'user', content: 'prompt text' }]);
    expect(body.max_tokens).toBeUndefined();
  });

  it('forwards max_tokens when provided', async () => {
    stubEnv();
    const fetchMock = vi.fn(async () =>
      jsonResponse({ choices: [{ message: { content: 'x' } }] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const llm = createHttpLlm();
    await llm.complete('p', { max_tokens: 512 });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((JSON.parse(init.body as string) as { max_tokens: number }).max_tokens).toBe(512);
  });

  it('200 without a usage field → usage undefined (never invented)', async () => {
    stubEnv();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ choices: [{ message: { content: 'no usage here' } }] })),
    );
    const llm = createHttpLlm();
    const res = await llm.complete('p');
    expect(res.text).toBe('no usage here');
    expect(res.usage).toBeUndefined();
  });

  it('joins the URL robustly: trailing slash stripped, full endpoint not doubled', async () => {
    stubEnv({ ...FAKE_ENV, LCO_LLM_BASE_URL: 'https://llm.example.test/v1/' });
    const fetchMock = vi.fn(async () => jsonResponse({ choices: [{ message: { content: 'x' } }] }));
    vi.stubGlobal('fetch', fetchMock);
    const llm = createHttpLlm();
    await llm.complete('p');
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://llm.example.test/v1/chat/completions');
  });

  it('non-retryable non-2xx → throws immediately with the status and a body excerpt', async () => {
    stubEnv();
    const fetchMock = vi.fn(async () => jsonResponse({ error: { message: 'boom exploded: quota gone' } }, 402));
    vi.stubGlobal('fetch', fetchMock);
    const llm = createHttpLlm();
    await expect(llm.complete('p')).rejects.toThrow(/402/);
    await expect(llm.complete('p')).rejects.toThrow(/boom exploded: quota gone/);
    expect(fetchMock).toHaveBeenCalledTimes(2); // one per complete() — no retries on 402
  });

  it('retryable 5xx exhausted → throws with status after 8 attempts', async () => {
    stubEnv();
    const fetchMock = vi.fn(async () => jsonResponse({ error: { message: 'boom exploded: quota gone' } }, 500));
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    const llm = createHttpLlm();
    const promise = llm.complete('p');
    promise.catch(() => undefined);
    for (const ms of [2_000, 5_000, 15_000, 30_000, 60_000, 120_000, 240_000]) {
      await vi.advanceTimersByTimeAsync(ms);
    }
    await expect(promise).rejects.toThrow(/500.*after 8 attempts/s);
    await expect(promise).rejects.toThrow(/boom exploded: quota gone/);
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });

  it('2xx without choices[0].message.content → throws fail-closed instead of returning garbage', async () => {
    stubEnv();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ choices: [] })));
    const llm = createHttpLlm();
    await expect(llm.complete('p')).rejects.toThrow(/choices\[0\]\.message\.content|message\.content/);
  });
});

describe('createHttpLlm — transport retry policy', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // Response bodies are single-use — a factory, never a shared instance.
  const ok = () =>
    jsonResponse({
      choices: [{ message: { content: 'hello' } }],
      usage: { prompt_tokens: 3, completion_tokens: 2 },
    });

  it('retries transport errors and succeeds (fetch failed x2 then 200)', async () => {
    stubEnv();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(ok());
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    const adapter = createHttpLlm();
    const promise = adapter.complete('ping');
    // advance through the two backoff sleeps (2s, 5s)
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.advanceTimersByTimeAsync(5_000);
    const out = await promise;
    expect(out.text).toBe('hello');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('retries 5xx then 429 then succeeds', async () => {
    stubEnv();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse({}, 429))
      .mockResolvedValueOnce(ok());
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    const adapter = createHttpLlm();
    const promise = adapter.complete('ping');
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.advanceTimersByTimeAsync(5_000);
    const out = await promise;
    expect(out.text).toBe('hello');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry non-retryable 4xx (single attempt)', async () => {
    stubEnv();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('{"error":"unauthorized"}', { status: 401, statusText: 'Unauthorized' }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = createHttpLlm();
    await expect(adapter.complete('ping')).rejects.toThrow('LLM HTTP 401');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after 8 attempts with the transport error preserved', async () => {
    stubEnv();
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    const adapter = createHttpLlm();
    const promise = adapter.complete('ping');
    promise.catch(() => undefined);
    for (const ms of [2_000, 5_000, 15_000, 30_000, 60_000, 120_000, 240_000]) {
      await vi.advanceTimersByTimeAsync(ms);
    }
    await expect(promise).rejects.toThrow(
      /LLM HTTP request to .* failed: fetch failed \(after 8 attempts\)/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });
});

describe('createHttpLlm — run-budget accounting (UX-001)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // Response bodies are single-use — a factory, never a shared instance.
  const ok = () =>
    jsonResponse({
      choices: [{ message: { content: 'hello' } }],
      usage: { prompt_tokens: 3, completion_tokens: 2 },
    });

  it('a successful completion reports attempts=1 (the HTTP attempt tally unit)', async () => {
    stubEnv();
    vi.stubGlobal('fetch', vi.fn(async () => ok()));
    const llm = createHttpLlm();
    const res = await llm.complete('p');
    expect(res.attempts).toBe(1);
  });

  it('timed-out/failed attempts COUNT: two transport failures then success reports attempts=3', async () => {
    stubEnv();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(ok());
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    const llm = createHttpLlm();
    const promise = llm.complete('p');
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.advanceTimersByTimeAsync(5_000);
    const res = await promise;
    expect(res.attempts).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('with a ledger: each HTTP attempt charges it; exhausting the attempts cap aborts BEFORE the next fetch', async () => {
    stubEnv();
    const fetchMock = vi.fn(async () => jsonResponse({}, 500)); // always retryable
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    const ledger = createBudgetLedger({ maxAttempts: 2 }, {});
    const llm = createHttpLlm(ledger);
    const promise = llm.complete('p');
    promise.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(2_000); // attempt 1 -> backoff -> attempt 2
    await expect(promise).rejects.toBeInstanceOf(BudgetExceededError);
    await expect(promise).rejects.toThrow(/BUDGET_EXCEEDED \(attempts\)/);
    // the cap (2) stopped the 3rd fetch from ever being issued
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(ledger.spent().attempts).toBe(2);
  });

  it('with a ledger: the wall cap aborts between attempts (injected clock, no extra fetch)', async () => {
    stubEnv();
    const fetchMock = vi.fn(async () => jsonResponse({}, 500));
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    let fakeNow = 0;
    const ledger = createBudgetLedger({ maxWallMs: 1_000 }, { nowMs: () => fakeNow });
    const llm = createHttpLlm(ledger);
    const promise = llm.complete('p');
    promise.catch(() => undefined);
    fakeNow += 2_000; // the wall budget is blown while attempt 1 sleeps in backoff
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(promise).rejects.toThrow(/BUDGET_EXCEEDED \(wall\)/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('createHttpLlm — optional live tuning env (EXTRA_BODY, MAX_TOKENS)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function okFetch() {
    return vi.fn(async () =>
      jsonResponse({ choices: [{ message: { content: 'x' } }] }),
    );
  }

  /** Typed view of a stubbed fetch mock's calls. */
  function callsOf(mock: ReturnType<typeof vi.fn>): [string, RequestInit][] {
    return mock.mock.calls as unknown as [string, RequestInit][];
  }

  it('merges LCO_LLM_EXTRA_BODY into the request body (e.g. disable thinking)', async () => {
    stubEnv();
    vi.stubEnv('LCO_LLM_EXTRA_BODY', '{"thinking":{"type":"disabled"}}');
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);
    await createHttpLlm().complete('p');
    const body = JSON.parse(callsOf(fetchMock)[0][1].body as string) as Record<string, unknown>;
    expect(body.thinking).toEqual({ type: 'disabled' });
    expect(body.model).toBe(FAKE_ENV.LCO_LLM_MODEL);
  });

  it('includes LCO_LLM_MAX_TOKENS when set (and drops it when blank)', async () => {
    stubEnv();
    vi.stubEnv('LCO_LLM_MAX_TOKENS', '8000');
    let fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);
    await createHttpLlm().complete('p');
    expect((JSON.parse(callsOf(fetchMock)[0][1].body as string) as { max_tokens?: number }).max_tokens).toBe(8000);

    vi.stubEnv('LCO_LLM_MAX_TOKENS', '');
    fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);
    await createHttpLlm().complete('p');
    expect((JSON.parse(callsOf(fetchMock)[0][1].body as string) as { max_tokens?: number }).max_tokens).toBeUndefined();
  });

  it('fails closed on invalid LCO_LLM_EXTRA_BODY / MAX_TOKENS', () => {
    stubEnv();
    vi.stubEnv('LCO_LLM_EXTRA_BODY', '{not json');
    expect(() => createHttpLlm()).toThrow('LCO_LLM_EXTRA_BODY must be a JSON object');
    vi.stubEnv('LCO_LLM_EXTRA_BODY', '[1,2]');
    expect(() => createHttpLlm()).toThrow('LCO_LLM_EXTRA_BODY must be a JSON object');
    vi.stubEnv('LCO_LLM_EXTRA_BODY', '');
    vi.stubEnv('LCO_LLM_MAX_TOKENS', 'abc');
    expect(() => createHttpLlm()).toThrow('LCO_LLM_MAX_TOKENS must be a positive integer');
  });
});
