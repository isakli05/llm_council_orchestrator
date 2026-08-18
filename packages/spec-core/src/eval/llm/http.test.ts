import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHttpLlm } from './http';

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

  it('non-2xx → throws with the status and a body excerpt', async () => {
    stubEnv();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: { message: 'boom exploded: quota gone' } }, 500)),
    );
    const llm = createHttpLlm();
    await expect(llm.complete('p')).rejects.toThrow(/500/);
    await expect(llm.complete('p')).rejects.toThrow(/boom exploded: quota gone/);
  });

  it('2xx without choices[0].message.content → throws fail-closed instead of returning garbage', async () => {
    stubEnv();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ choices: [] })));
    const llm = createHttpLlm();
    await expect(llm.complete('p')).rejects.toThrow(/choices\[0\]\.message\.content|message\.content/);
  });
});
