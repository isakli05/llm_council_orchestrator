import { describe, expect, it } from 'vitest';
import { BudgetExceededError } from '../../eval/budget';
import {
  createPaidOperation,
  resolveLegacyEnvRoute,
  resolvedRouteDigest,
  routeFromConfig,
  type ResolvedPaidRoute,
} from './paid';

/**
 * S4-H-03 — the immutable-operation matrix.
 *
 * The Fourth Audit proved two defects at this primitive: (A) mutating a
 * nested `extraBody` AFTER the digest was computed changed the serialized
 * wire request while `routeDigest` stayed at the consented value; (B) a
 * route budget of 1 attempt could be paired with an independently created
 * ledger allowing more. These tests mutate the CALLER's original objects
 * after operation construction and prove the wire and the identity cannot
 * move, and that the operation's OWN ledger enforces the digest-bound
 * budget (an external ledger is not an input the API accepts).
 */

function wireWitness(): { seen: string[]; fetchImpl: typeof fetch } {
  const seen: string[] = [];
  const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
    seen.push(String(init?.body));
    return new Response(
      JSON.stringify({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;
  return { seen, fetchImpl };
}

const BASE_ENV = {
  LCO_LLM_BASE_URL: 'https://gw.example/v1',
  LCO_LLM_MODEL: 'm-1',
  LCO_LLM_EXTRA_BODY: '{"temperature": 0.5, "nested": {"flag": false}}',
};

describe('S4-H-03 A: post-resolution caller mutation cannot alter wire behavior', () => {
  it('mutating the ORIGINAL caller-owned route/extraBody after construction leaves wire + digest unchanged', async () => {
    // The caller assembles its own mutable route value FIRST (the object the
    // audit mutated after consent) — including a nested extraBody object.
    const callerRoute: ResolvedPaidRoute = {
      origin: 'legacy-env',
      gateway: 'legacy-env',
      baseUrl: 'https://gw.example/v1',
      model: 'm-1',
      extraBody: { temperature: 0.5, nested: { flag: false } },
      routingMode: 'single',
      apiKeyEnvName: 'LCO_LLM_API_KEY',
      budget: { maxAttempts: 8 },
    };
    const { seen, fetchImpl } = wireWitness();
    const op = createPaidOperation({ route: callerRoute, apiKey: 'k', wireByteCap: 10_000, fetchImpl });
    const digestAtConstruction = op.routeDigest;

    // POST-consent mutations of the caller's ORIGINAL object…
    (callerRoute.extraBody as Record<string, unknown>).temperature = 99;
    (callerRoute.extraBody as { nested: Record<string, unknown> }).nested.flag = true;
    callerRoute.model = 'attacker-model';
    callerRoute.baseUrl = 'https://evil.example/v1';
    callerRoute.budget.maxAttempts = 999;
    callerRoute.routingMode = 'other';

    const res = await op.adapter.complete('hello');
    expect(res.text).toBe('ok');
    expect(seen).toHaveLength(1);
    const wire = seen[0]!;
    // …the wire still carries the CONSTRUCTED state, not the mutated one.
    expect(wire).toContain('"temperature":0.5');
    expect(wire).toContain('"flag":false');
    expect(wire).toContain('"model":"m-1"');
    expect(wire).not.toContain('attacker-model');
    expect(wire).not.toContain('evil.example');
    expect(op.routeDigest).toBe(digestAtConstruction);
    // and the frozen internal route is immutable even to us
    expect(() => {
      (op.route as { model: string }).model = 'nope';
    }).toThrow();
    expect(op.route.model).toBe('m-1');
  });

  it('mutating the CONFIG object after routeFromConfig cannot reach the route or the wire', async () => {
    const config = {
      gateway: 'openrouter',
      providerKind: 'openrouter' as const,
      baseUrl: 'https://or.example/v1',
      apiKey: 'k',
      model: 'm-2',
      extraBody: { provider: { order: ['a'] } },
    };
    const route = routeFromConfig({
      config,
      origin: 'named-profile',
      routingMode: 'evaluation',
      apiKeyEnvName: 'OR_KEY',
      budget: { maxAttempts: 4 },
    });
    // caller mutates its config afterwards
    (config.extraBody as Record<string, unknown>).provider = { order: ['evil'] };
    config.model = 'attacker-model';
    const { seen, fetchImpl } = wireWitness();
    const op = createPaidOperation({ route, apiKey: 'k', wireByteCap: 10_000, fetchImpl });
    await op.adapter.complete('hello');
    expect(seen[0]).toContain('"order":["a"]');
    expect(seen[0]).not.toContain('evil');
    expect(seen[0]).not.toContain('attacker-model');
  });

  it('routeFromConfig returns a deep-frozen value — nested mutation throws', () => {
    const route = routeFromConfig({
      config: { gateway: 'g', providerKind: 'openai-compatible' as const, baseUrl: 'https://x/v1', apiKey: 'k', model: 'm' },
      origin: 'named-profile',
      routingMode: 'single',
      apiKeyEnvName: 'K',
      budget: { maxAttempts: 1 },
    });
    expect(Object.isFrozen(route)).toBe(true);
    expect(Object.isFrozen(route.budget)).toBe(true);
    expect(() => {
      route.budget.maxAttempts = 99;
    }).toThrow();
  });

  it('the digest binds the exact transported state: two routes differing only in nested extraBody differ', () => {
    const a = resolveLegacyEnvRoute({ ...BASE_ENV }, { maxAttempts: 8 });
    const b = resolveLegacyEnvRoute(
      { ...BASE_ENV, LCO_LLM_EXTRA_BODY: '{"temperature": 0.5, "nested": {"flag": true}}' },
      { maxAttempts: 8 },
    );
    expect(resolvedRouteDigest(a)).not.toBe(resolvedRouteDigest(b));
  });
});

describe('S4-H-03 B: budget/ledger identity — one authority', () => {
  it('the operation OWNS its ledger, derived from the digest-bound budget: route budget 1 → a second transport attempt is refused', async () => {
    const { seen, fetchImpl } = wireWitness();
    const op = createPaidOperation({
      route: resolveLegacyEnvRoute(BASE_ENV, { maxAttempts: 1 }),
      apiKey: 'k',
      fetchImpl,
    });
    // The audit's exploit: an independently created ledger allowed more. The
    // constructor accepts NO ledger input — the only authority is op.ledger,
    // created from route.budget inside the kernel.
    const first = await op.adapter.complete('hello');
    expect(first.text).toBe('ok');
    expect(seen).toHaveLength(1);
    await expect(op.adapter.complete('again')).rejects.toBeInstanceOf(BudgetExceededError);
    expect(seen).toHaveLength(1); // the second call transported ZERO bytes
  });

  it('the owned ledger enforces the same budget through the pipeline-side ensure hook', () => {
    const op = createPaidOperation({
      route: resolveLegacyEnvRoute(BASE_ENV, { maxAttempts: 1 }),
      apiKey: 'k',
    });
    op.ledger.ensureAttemptAdmissible(); // first attempt fits
    op.ledger.chargeAttempts(1);
    expect(() => op.ledger.ensureAttemptAdmissible()).toThrow(BudgetExceededError);
  });

  it('wall-clock budgets carry from the route budget into the owned ledger', () => {
    const t0 = 1_000_000;
    let now = t0;
    const op = createPaidOperation({
      route: resolveLegacyEnvRoute(BASE_ENV, { maxAttempts: 8, wallMs: 5_000 }),
      apiKey: 'k',
      nowMs: () => now,
    });
    op.ledger.checkWall(); // within
    now = t0 + 6_000;
    expect(() => op.ledger.checkWall()).toThrow();
  });

  it('there is no reconstruction path: the digest the transport state yields IS the digest over the frozen route', () => {
    const op = createPaidOperation({
      route: resolveLegacyEnvRoute(BASE_ENV, { maxAttempts: 8 }),
      apiKey: 'k',
    });
    // Consent binds op.routeDigest; the transported state is op.route; the
    // digest is derived from exactly that value — not from a re-derived copy.
    expect(op.routeDigest).toBe(resolvedRouteDigest(op.route));
  });
});
