import { describe, expect, it } from 'vitest';
import { createPaidOperation, resolveLegacyEnvRoute } from './paid';

/**
 * Deterministic function-coverage hardening for the paid kernel's DEFAULT
 * boundary clock: `createPaidOperation` derives its ledger with
 * `nowMs: args.nowMs ?? (() => Date.now())` — the boundary default the
 * kernel owns when no clock is injected. A route whose budget carries a wall
 * cap makes the derived ledger read that default clock (wall-deadline
 * computation), and the operation still completes a wire-capped transport
 * through an injected local fetch — zero network, zero paid calls.
 */

describe('createPaidOperation — derived ledger with the DEFAULT boundary clock', () => {
  it('constructs with no injected nowMs, reads the default clock for the wall budget, and completes a wire-capped transport', async () => {
    let fetches = 0;
    const seenBodies: string[] = [];
    const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
      fetches += 1;
      seenBodies.push(String(init?.body));
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const op = createPaidOperation({
      route: resolveLegacyEnvRoute(
        { LCO_LLM_BASE_URL: 'https://gw.example/v1', LCO_LLM_MODEL: 'm-1' },
        { maxAttempts: 1, wallMs: 60_000 },
      ),
      apiKey: 'k',
      wireByteCap: 10_000,
      fetchImpl,
      // no nowMs: the kernel's own boundary default must be used
    });

    const res = await op.adapter.complete('hello');
    expect(res.text).toBe('ok');
    expect(fetches).toBe(1);
    // the serialized wire was measured EXACTLY — the measurement contract
    // (lastWireBytes is the byte length of the transported body)
    expect(op.lastWireBytes()).toBe(Buffer.byteLength(seenBodies[0]!, 'utf8'));
    expect(op.lastWireBytes()!).toBeGreaterThan(0);
  });
});
