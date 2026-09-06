import { describe, expect, it, vi } from 'vitest';
import {
  MAX_RECOVERY_WIRE_BYTES,
  accountCompletionAttempts,
  createPaidOperation,
  resolveLegacyEnvRoute,
  resolvedRouteDigest,
} from './paid';
import { TrustPaidError } from './errors';
import type { ResolvedRole } from '../../config/llm-config';

function noopLedger(): BudgetLedger {
  let attempts = 0;
  return {
    chargeAttempts: (n: number) => {
      attempts += n;
      if (attempts > 100) throw new Error('over');
    },
    ensureAttemptAdmissible: () => {},
    chargeTokens: () => {},
    checkWall: () => {},
    snapshot: () => ({ attempts, tokens: 0, wallMs: 0 }),
  } as unknown as BudgetLedger;
}

describe('paid: legacy-env route resolves EVERY effectual field (S3-H-07)', () => {
  it('resolves base URL, model, max tokens, and extra body in one shot', () => {
    const route = resolveLegacyEnvRoute(
      {
        LCO_LLM_BASE_URL: 'https://gw.example/v1',
        LCO_LLM_MODEL: 'm-1',
        LCO_LLM_MAX_TOKENS: '4096',
        LCO_LLM_EXTRA_BODY: '{"temperature": 0.2}',
      },
      { maxAttempts: 8 },
    );
    expect(route.model).toBe('m-1');
    expect(route.maxTokens).toBe(4096);
    expect(route.extraBody).toEqual({ temperature: 0.2 });
    expect(route.budget.maxAttempts).toBe(8);
  });

  it('missing base URL or model fails closed', () => {
    expect(() => resolveLegacyEnvRoute({ LCO_LLM_MODEL: 'm' }, { maxAttempts: 1 })).toThrowError(TrustPaidError);
    expect(() => resolveLegacyEnvRoute({ LCO_LLM_BASE_URL: 'https://x' }, { maxAttempts: 1 })).toThrowError(TrustPaidError);
  });

  it('route digests separate every effectual mutation (resolve-then-digest)', () => {
    const base = {
      LCO_LLM_BASE_URL: 'https://gw.example/v1',
      LCO_LLM_MODEL: 'm-1',
    };
    const d = resolvedRouteDigest(resolveLegacyEnvRoute(base, { maxAttempts: 8 }));
    const cases: NodeJS.ProcessEnv[] = [
      { ...base, LCO_LLM_MODEL: 'm-2' },
      { ...base, LCO_LLM_BASE_URL: 'https://other.example/v1' },
      { ...base, LCO_LLM_MAX_TOKENS: '2048' },
      { ...base, LCO_LLM_EXTRA_BODY: '{"temperature": 1}' },
    ];
    for (const env of cases) {
      expect(resolvedRouteDigest(resolveLegacyEnvRoute(env, { maxAttempts: 8 }))).not.toBe(d);
    }
    // identical resolution → identical digest (deterministic)
    expect(resolvedRouteDigest(resolveLegacyEnvRoute({ ...base }, { maxAttempts: 8 }))).toBe(d);
  });
});

describe('paid: wire-byte cap over the SERIALIZED request (S3-H-05)', () => {
  function recordingFetch(seen: string[]): typeof fetch {
    return (async (_url: unknown, init?: RequestInit) => {
      seen.push(String(init?.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), {
        status: 200,
      });
    }) as unknown as typeof fetch;
  }

  it('measures the exact serialized bytes (envelope included), records them, and transports under the cap', async () => {
    const seen: string[] = [];
    const op = createPaidOperation({
      route: resolveLegacyEnvRoute({ LCO_LLM_BASE_URL: 'https://gw.example/v1', LCO_LLM_MODEL: 'm-1', LCO_LLM_EXTRA_BODY: '{"temperature": 0.5}' }, { maxAttempts: 1 }),
      apiKey: 'k',
      wireByteCap: 10_000,
      fetchImpl: recordingFetch(seen),
    });
    const res = await op.adapter.complete('hello');
    expect(res.text).toBe('ok');
    expect(seen).toHaveLength(1);
    const wire = seen[0];
    expect(wire).toContain('"model":"m-1"'); // envelope IS in the measured bytes
    expect(wire).toContain('"temperature":0.5');
    expect(op.lastWireBytes()).toBe(Buffer.byteLength(wire, 'utf8'));
  });

  it('over the cap → typed refusal with ZERO transport calls', async () => {
    const seen: string[] = [];
    const op = createPaidOperation({
      route: resolveLegacyEnvRoute({ LCO_LLM_BASE_URL: 'https://gw.example/v1', LCO_LLM_MODEL: 'm-1' }, { maxAttempts: 1 }),
      apiKey: 'k',
      wireByteCap: 10, // anything serialized exceeds this
      fetchImpl: recordingFetch(seen),
    });
    await expect(op.adapter.complete('hello')).rejects.toMatchObject({ code: 'request_over_budget' });
    expect(seen).toHaveLength(0);
  });

  it('boundary: AT the cap passes; ABOVE by one byte refuses', async () => {
    const seen: string[] = [];
    const prompt = 'x'.repeat(32);
    // First measure with a huge cap to learn the serialized size.
    const probe = createPaidOperation({
      route: resolveLegacyEnvRoute({ LCO_LLM_BASE_URL: 'https://gw.example/v1', LCO_LLM_MODEL: 'm' }, { maxAttempts: 1 }),
      apiKey: 'k',
      fetchImpl: recordingFetch(seen),
    });
    await probe.adapter.complete(prompt);
    const exact = probe.lastWireBytes()!;
    const mk = (cap: number) =>
      createPaidOperation({
        route: resolveLegacyEnvRoute({ LCO_LLM_BASE_URL: 'https://gw.example/v1', LCO_LLM_MODEL: 'm' }, { maxAttempts: 1 }),
        apiKey: 'k',
          wireByteCap: cap,
        fetchImpl: recordingFetch(seen),
      });
    const at = mk(exact);
    await expect(at.adapter.complete(prompt)).resolves.toBeTruthy();
    const above = mk(exact - 1);
    await expect(above.adapter.complete(prompt)).rejects.toMatchObject({ code: 'request_over_budget' });
  });

  it('a LONGER validation-retry prompt is capped again (same boundary, second complete())', async () => {
    const seen: string[] = [];
    const probe = createPaidOperation({
      route: resolveLegacyEnvRoute({ LCO_LLM_BASE_URL: 'https://gw.example/v1', LCO_LLM_MODEL: 'm' }, { maxAttempts: 1 }),
      apiKey: 'k',
      fetchImpl: recordingFetch(seen),
    });
    await probe.adapter.complete('short');
    const shortBytes = probe.lastWireBytes()!;
    const op = createPaidOperation({
      route: resolveLegacyEnvRoute({ LCO_LLM_BASE_URL: 'https://gw.example/v1', LCO_LLM_MODEL: 'm' }, { maxAttempts: 1 }),
      apiKey: 'k',
      wireByteCap: shortBytes, // admits the first prompt, must refuse the retry-expanded one
      fetchImpl: recordingFetch(seen),
    });
    await expect(op.adapter.complete('short')).resolves.toBeTruthy();
    await expect(op.adapter.complete('short + validation issues ' + 'y'.repeat(256))).rejects.toMatchObject({
      code: 'request_over_budget',
    });
  });
});

describe('paid: single-charge accounting (S3-H-06)', () => {
  it('charges completion attempts ONLY when the adapter did not self-report', () => {
    let charged = 0;
    const ledger = {
      chargeAttempts: (n: number) => {
        charged += n;
      },
    } as unknown as BudgetLedger;
    accountCompletionAttempts(ledger, { attempts: 2 });
    expect(charged).toBe(0); // self-reported: the transport already charged
    accountCompletionAttempts(ledger, {});
    expect(charged).toBe(1); // legacy adapter without attempts
  });
});

describe('paid: routeFromConfig + operation-bound wire cap', () => {
  it('routeFromConfig projects the config effectual route facts', async () => {
    const { routeFromConfig } = await import('./paid');
    const route = routeFromConfig({
      config: {
        gateway: 'openrouter',
        providerKind: 'openrouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'secret-value',
        model: 'm-1',
        maxTokens: 4096,
        extraBody: { temperature: 0.3 },
      },
      origin: 'named-profile',
      profileName: 'p1',
      routingMode: 'product',
      apiKeyEnvName: 'OR_KEY',
      budget: { maxAttempts: 8, wallMs: 900_000 },
    });
    expect(route.model).toBe('m-1');
    expect(route.maxTokens).toBe(4096);
    expect(route.extraBody).toEqual({ temperature: 0.3 });
    expect(route.budget.wallMs).toBe(900_000);
    // the API key VALUE never enters the route
    expect(JSON.stringify(route)).not.toContain('secret-value');
  });

  it('the OPERATION carries the wire cap (the standalone wireCap API was deleted with S4-H-03 — every renewal route constructs through createPaidOperation)', async () => {
    const { createPaidOperation, resolveLegacyEnvRoute } = await import('./paid');
    // A 1-byte cap: the operation's own serialized-wire gate refuses BEFORE
    // transport (the fetch impl counts calls — it must stay at zero).
    let fetches = 0;
    const fetchImpl = (async () => {
      fetches++;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const op = createPaidOperation({
      route: resolveLegacyEnvRoute({ LCO_LLM_BASE_URL: 'https://x', LCO_LLM_MODEL: 'm' }, { maxAttempts: 1 }),
      apiKey: 'k',
      wireByteCap: 1,
      fetchImpl,
    });
    await expect(op.adapter.complete('x'.repeat(100))).rejects.toThrowError(/request_over_budget|wire cap/);
    expect(fetches).toBe(0);
  });

  it('resolveLegacyEnvRoute fails closed on malformed env', async () => {
    const { resolveLegacyEnvRoute } = await import('./paid');
    expect(() => resolveLegacyEnvRoute({ LCO_LLM_BASE_URL: 'https://x', LCO_LLM_MODEL: 'm', LCO_LLM_MAX_TOKENS: 'zero' } as never, { maxAttempts: 1 })).toThrow();
    expect(() => resolveLegacyEnvRoute({ LCO_LLM_BASE_URL: 'https://x', LCO_LLM_MODEL: 'm', LCO_LLM_EXTRA_BODY: 'not json' } as never, { maxAttempts: 1 })).toThrow();
    expect(() => resolveLegacyEnvRoute({ LCO_LLM_BASE_URL: 'https://x', LCO_LLM_MODEL: 'm', LCO_LLM_EXTRA_BODY: '[1]' } as never, { maxAttempts: 1 })).toThrow(/JSON object/);
    // a non-named legacy budget default carries through
    const r = resolveLegacyEnvRoute({ LCO_LLM_BASE_URL: 'https://x', LCO_LLM_MODEL: 'm' }, { maxAttempts: 3, wallMs: 1000 });
    expect(r.budget).toEqual({ maxAttempts: 3, wallMs: 1000 });
  });
});

describe('paid: recovery wire cap constant', () => {
  it('keeps the 1MB boundary, now over wire bytes', () => {
    expect(MAX_RECOVERY_WIRE_BYTES).toBe(1_000_000);
  });
});

describe('paid: configured headers ride the renewal paid route (S5-M-02)', () => {
  function headerCapturingFetch(seen: Array<Record<string, string>>): typeof fetch {
    return (async (_url: unknown, init?: RequestInit) => {
      seen.push({ ...((init?.headers ?? {}) as Record<string, string>) });
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
  }

  it('PRE-FIX REPRODUCTION: a configured non-secret sentinel header reaches the actual paid transport', async () => {
    const { routeFromConfig, createPaidOperation } = await import('./paid');
    const { resolveRoleConfig } = await import('../../llm/providers');
    const role: ResolvedRole = {
      gateway: 'openrouter',
      providerKind: 'openrouter',
      baseUrl: 'https://gw.example/v1',
      apiKeyEnv: 'LCO_TEST_KEY',
      model: 'm-1',
      structuredOutput: 'off',
      headers: { 'HTTP-Referer': 'https://example.test', 'X-Title': 'lco-repro' },
    };
    const { config } = resolveRoleConfig(role, { LCO_TEST_KEY: 'k' }, { routingMode: 'product' });
    // the header exists in the resolved transport config...
    expect(config.extraHeaders).toMatchObject({ 'HTTP-Referer': 'https://example.test', 'X-Title': 'lco-repro' });
    const route = routeFromConfig({
      config,
      origin: 'named-profile',
      profileName: 'p1',
      routingMode: 'product',
      apiKeyEnvName: 'LCO_TEST_KEY',
      budget: { maxAttempts: 1 },
    });
    const seen: Array<Record<string, string>> = [];
    const op = createPaidOperation({ route, apiKey: 'k', wireByteCap: 10_000, fetchImpl: headerCapturingFetch(seen) });
    await op.adapter.complete('p');
    expect(seen).toHaveLength(1);
    const wireHeaders = seen[0]!;
    // ...but pre-fix it is dropped before the wire: the paid kernel resolves
    // the route without headers (ResolvedPaidRoute has no headers field) and
    // pins extraHeaders: undefined at transport construction.
    expect(wireHeaders['HTTP-Referer']).toBe('https://example.test');
    expect(wireHeaders['X-Title']).toBe('lco-repro');
  });

  function openRouterRole(headers?: Record<string, string>): ResolvedRole {
    return {
      gateway: 'openrouter',
      providerKind: 'openrouter',
      baseUrl: 'https://gw.example/v1',
      apiKeyEnv: 'LCO_TEST_KEY',
      model: 'm-1',
      structuredOutput: 'off',
      ...(headers !== undefined ? { headers } : {}),
    };
  }

  function paidWire(role: ResolvedRole): Promise<{ seen: Array<Record<string, string>>; op: { route: { headers?: Record<string, string> } } }> {
    return buildOp(role);
  }
  async function buildOp(role: ResolvedRole) {
    const { routeFromConfig, createPaidOperation } = await import('./paid');
    const { resolveRoleConfig } = await import('../../llm/providers');
    const { config } = resolveRoleConfig(role, { LCO_TEST_KEY: 'k' }, { routingMode: 'product' });
    const route = routeFromConfig({
      config,
      origin: 'named-profile',
      profileName: 'p1',
      routingMode: 'product',
      apiKeyEnvName: 'LCO_TEST_KEY',
      budget: { maxAttempts: 1 },
    });
    const seen: Array<Record<string, string>> = [];
    const op = createPaidOperation({ route, apiKey: 'k', wireByteCap: 10_000, fetchImpl: headerCapturingFetch(seen) });
    await op.adapter.complete('p');
    return { seen, op };
  }

  it('no configured headers → the wire carries only the pinned pair and the route has no headers field', async () => {
    // generic provider: no provider-default headers either — a truly bare route
    const { seen, op } = await paidWire({
      gateway: 'generic',
      providerKind: 'openai-compatible',
      baseUrl: 'https://gw.example/v1',
      apiKeyEnv: 'LCO_TEST_KEY',
      model: 'm-1',
      structuredOutput: 'off',
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({ 'content-type': 'application/json', authorization: 'Bearer k' });
    expect(Object.hasOwn(op.route, 'headers')).toBe(false);
  });

  it('single configured header rides the wire; provider default header rides alongside (existing merge semantics)', async () => {
    const { seen } = await paidWire(openRouterRole({ 'X-Title': 'solo' }));
    expect(seen[0]).toMatchObject({
      'X-OpenRouter-Metadata': 'enabled', // provider default from the config builder
      'X-Title': 'solo',
      'content-type': 'application/json',
      authorization: 'Bearer k',
    });
  });

  it('an operator-configured override of the provider default header reaches the wire (documented precedence)', async () => {
    const { seen } = await paidWire(openRouterRole({ 'X-OpenRouter-Metadata': 'disabled' }));
    expect(seen[0]!['X-OpenRouter-Metadata']).toBe('disabled');
  });

  it('transport receives the EXACT resolved headers (deep equality with the frozen route value)', async () => {
    const role = openRouterRole({ 'HTTP-Referer': 'https://example.test', 'X-Title': 'lco-repro', 'X-Custom-B': 'b1' });
    const { seen, op } = await paidWire(role);
    const expected = { ...op.route.headers, 'content-type': 'application/json', authorization: 'Bearer k' };
    expect(seen[0]).toEqual(expected);
  });

  it('header names are NOT case-normalized: differing case is a different consent (digest differs)', async () => {
    const { routeFromConfig, resolvedRouteDigest } = await import('./paid');
    const mk = (headers: Record<string, string>) => {
      const config = {
        gateway: 'openrouter',
        providerKind: 'openrouter' as const,
        baseUrl: 'https://gw.example/v1',
        apiKey: 'k',
        model: 'm-1',
        extraHeaders: headers,
      };
      return routeFromConfig({ config, origin: 'named-profile', routingMode: 'product', apiKeyEnvName: 'K', budget: { maxAttempts: 1 } });
    };
    const d1 = resolvedRouteDigest(mk({ 'X-Title': 'v' }));
    const d2 = resolvedRouteDigest(mk({ 'x-title': 'v' }));
    expect(d1).not.toBe(d2); // no silent case folding anywhere on the route
    expect(resolvedRouteDigest(mk({ 'X-Title': 'v' }))).toBe(d1); // deterministic
  });

  it('changing configured headers after authorization invalidates the consent digest (consent/wire equivalence)', async () => {
    const { routeFromConfig, resolvedRouteDigest } = await import('./paid');
    const mk = (headers: Record<string, string>) => {
      const config = {
        gateway: 'openrouter',
        providerKind: 'openrouter' as const,
        baseUrl: 'https://gw.example/v1',
        apiKey: 'k',
        model: 'm-1',
        extraHeaders: headers,
      };
      return routeFromConfig({ config, origin: 'named-profile', routingMode: 'product', apiKeyEnvName: 'K', budget: { maxAttempts: 1 } });
    };
    const d = resolvedRouteDigest(mk({ 'X-Title': 'v1' }));
    expect(resolvedRouteDigest(mk({ 'X-Title': 'v2' }))).not.toBe(d); // value changed
    expect(resolvedRouteDigest(mk({ 'X-Title': 'v1', 'X-Extra': 'e' }))).not.toBe(d); // set grew
  });

  it('the operation is immutable: mutating the caller config or the route after resolution cannot reach the wire', async () => {
    const { resolveRoleConfig } = await import('../../llm/providers');
    const { routeFromConfig } = await import('./paid');
    const role = openRouterRole({ 'X-Title': 'before' });
    const { config } = resolveRoleConfig(role, { LCO_TEST_KEY: 'k' }, { routingMode: 'product' });
    const route = routeFromConfig({ config, origin: 'named-profile', routingMode: 'product', apiKeyEnvName: 'LCO_TEST_KEY', budget: { maxAttempts: 1 } });
    // caller mutates its original objects after resolution — the route must not see it
    config.extraHeaders!['X-Title'] = 'after';
    config.extraHeaders!['X-Injected'] = 'evil';
    expect(route.headers).toEqual({ 'X-OpenRouter-Metadata': 'enabled', 'X-Title': 'before' });
    // the frozen route itself refuses mutation
    expect(() => {
      (route.headers as Record<string, string>)['X-Title'] = 'tampered';
    }).toThrow();
    const seen: Array<Record<string, string>> = [];
    const { createPaidOperation } = await import('./paid');
    const op = createPaidOperation({ route, apiKey: 'k', wireByteCap: 10_000, fetchImpl: headerCapturingFetch(seen) });
    await op.adapter.complete('p');
    expect(seen[0]!['X-Title']).toBe('before');
    expect(seen[0]!['X-Injected']).toBeUndefined();
    expect(seen[0]!['X-OpenRouter-Metadata']).toBe('enabled');
  });

  it('the retry path transports the SAME resolved headers on every attempt', async () => {
    let calls = 0;
    const seen: Array<Record<string, string>> = [];
    const flakyThenOk = (async (_url: unknown, init?: RequestInit) => {
      calls += 1;
      seen.push({ ...((init?.headers ?? {}) as Record<string, string>) });
      if (calls === 1) return new Response('boom', { status: 500 }); // retryable
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const { routeFromConfig, createPaidOperation } = await import('./paid');
    const { resolveRoleConfig } = await import('../../llm/providers');
    const { config } = resolveRoleConfig(openRouterRole({ 'HTTP-Referer': 'https://example.test', 'X-Title': 'lco-repro' }), { LCO_TEST_KEY: 'k' }, { routingMode: 'product' });
    const route = routeFromConfig({ config, origin: 'named-profile', routingMode: 'product', apiKeyEnvName: 'LCO_TEST_KEY', budget: { maxAttempts: 2 } });
    const op = createPaidOperation({ route, apiKey: 'k', wireByteCap: 10_000, fetchImpl: flakyThenOk });
    await op.adapter.complete('p');
    expect(calls).toBe(2);
    for (const h of seen) {
      expect(h['HTTP-Referer']).toBe('https://example.test');
      expect(h['X-Title']).toBe('lco-repro');
    }
  });

  it('transport failure diagnostics never include configured header values (no logging regression)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const failing = (async () => {
        throw new Error('connection refused');
      }) as unknown as typeof fetch;
      const { routeFromConfig, createPaidOperation } = await import('./paid');
      const { resolveRoleConfig } = await import('../../llm/providers');
      const { config } = resolveRoleConfig(openRouterRole({ 'X-Title': 'SECRET-TITLE-VALUE', 'HTTP-Referer': 'https://secret-referer.test' }), { LCO_TEST_KEY: 'k' }, { routingMode: 'product' });
      const route = routeFromConfig({ config, origin: 'named-profile', routingMode: 'product', apiKeyEnvName: 'LCO_TEST_KEY', budget: { maxAttempts: 1 } });
      const op = createPaidOperation({ route, apiKey: 'k', wireByteCap: 10_000, fetchImpl: failing });
      // attempt 1 fails at the socket → the transport diagnostic fires; the
      // ledger (1 attempt) then refuses attempt 2 → typed budget refusal.
      await expect(op.adapter.complete('p')).rejects.toThrow(/BUDGET_EXCEEDED|connection refused/);
      expect(errSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
      for (const [msg] of errSpy.mock.calls) {
        expect(String(msg)).not.toContain('SECRET-TITLE-VALUE');
        expect(String(msg)).not.toContain('secret-referer.test');
      }
    } finally {
      errSpy.mockRestore();
    }
  });
});
