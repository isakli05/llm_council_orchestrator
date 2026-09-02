import { describe, expect, it } from 'vitest';
import {
  MAX_RECOVERY_WIRE_BYTES,
  accountCompletionAttempts,
  createPaidOperation,
  resolveLegacyEnvRoute,
  resolvedRouteDigest,
} from './paid';
import { TrustPaidError } from './errors';
import type { BudgetLedger } from '../../eval/budget';

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
      ledger: noopLedger(),
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
      ledger: noopLedger(),
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
      ledger: noopLedger(),
      fetchImpl: recordingFetch(seen),
    });
    await probe.adapter.complete(prompt);
    const exact = probe.lastWireBytes()!;
    const mk = (cap: number) =>
      createPaidOperation({
        route: resolveLegacyEnvRoute({ LCO_LLM_BASE_URL: 'https://gw.example/v1', LCO_LLM_MODEL: 'm' }, { maxAttempts: 1 }),
        apiKey: 'k',
        ledger: noopLedger(),
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
      ledger: noopLedger(),
      fetchImpl: recordingFetch(seen),
    });
    await probe.adapter.complete('short');
    const shortBytes = probe.lastWireBytes()!;
    const op = createPaidOperation({
      route: resolveLegacyEnvRoute({ LCO_LLM_BASE_URL: 'https://gw.example/v1', LCO_LLM_MODEL: 'm' }, { maxAttempts: 1 }),
      apiKey: 'k',
      ledger: noopLedger(),
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

describe('paid: recovery wire cap constant', () => {
  it('keeps the 1MB boundary, now over wire bytes', () => {
    expect(MAX_RECOVERY_WIRE_BYTES).toBe(1_000_000);
  });
});
