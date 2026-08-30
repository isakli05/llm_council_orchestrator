import { describe, it, expect, vi } from 'vitest';
import { cmdModels, parseCatalog } from './models';

/**
 * lco models — free catalog discovery, deterministic fake fetch, no paid
 * calls. Unknown pricing renders Unknown (never 0). Keys resolve by env NAME;
 * missing key → clean refusal before any request.
 */

const ENV = { OPENROUTER_API_KEY: 'or-key', ABACUS_ROUTELLM_API_KEY: 'rl-key' };

const CATALOG = {
  data: [
    {
      id: 'anthropic/claude-opus-5',
      name: 'Anthropic: Claude Opus 5',
      context_length: 200000,
      pricing: { prompt: '0.000015', completion: '0.000075' },
      supported_parameters: ['response_format', 'structured_outputs'],
    },
    { id: 'x-ai/grok-4.6', pricing: { prompt: '0.000002' } },
    { id: 'bare-model' },
  ],
};

function okFetch(payload = CATALOG): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } }),
  ) as unknown as typeof fetch;
}

describe('parseCatalog', () => {
  it('extracts id/name/context/pricing/support permissively; unknown fields ignored', () => {
    const rows = parseCatalog(CATALOG);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      id: 'anthropic/claude-opus-5',
      contextLength: 200000,
      pricingPrompt: '0.000015',
      pricingCompletion: '0.000075',
      supportedParameters: ['response_format', 'structured_outputs'],
    });
    expect(rows[1]!.pricingCompletion).toBeUndefined();
    expect(rows[2]!.pricingPrompt).toBeUndefined();
  });

  it('rejects garbage shapes with an empty list (fail-closed, no invention)', () => {
    expect(parseCatalog(null)).toEqual([]);
    expect(parseCatalog({})).toEqual([]);
    expect(parseCatalog({ data: 'nope' })).toEqual([]);
    expect(parseCatalog({ data: [{ no: 'id' }] })).toEqual([]);
  });
});

describe('cmdModels', () => {
  it('lists built-in openrouter models with reported pricing; Unknown for absent fields', async () => {
    const r = await cmdModels({ builtin: 'openrouter', env: ENV, fetchImpl: okFetch() });
    expect(r.code).toBe(0);
    expect(r.output).toContain('anthropic/claude-opus-5');
    expect(r.output).toContain('prompt 0.000015 / completion 0.000075');
    expect(r.output).toContain('bare-model');
    expect(r.output).toMatch(/completion Unknown/);
    expect(r.output).not.toContain('or-key');
  });

  it('missing key env → clean exit 2 naming the var, ZERO requests', async () => {
    const fetchImpl = vi.fn();
    const r = await cmdModels({ builtin: 'openrouter', env: {}, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r.code).toBe(2);
    expect(r.output).toContain('OPENROUTER_API_KEY');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('named provider from config (generic with baseUrl) uses the configured endpoint', async () => {
    const configText = JSON.stringify({
      llm: {
        providers: { gw: { type: 'openai-compatible', baseUrl: 'https://gw.example.test/v1', apiKeyEnv: 'GW_KEY' } },
        profiles: { p: { variant: 'single', roles: { single: { provider: 'gw', model: 'm' } } } },
      },
    });
    const fetchImpl = okFetch({ data: [{ id: 'local-model' }] });
    const r = await cmdModels({
      providerName: 'gw',
      configText,
      env: { GW_KEY: 'k' },
      fetchImpl,
    });
    expect(r.code).toBe(0);
    expect(r.output).toContain('local-model');
    expect(r.output).toContain('gw (openai-compatible)');
  });

  it('malformed catalog JSON → exit 2', async () => {
    const bad = vi.fn(async () => new Response('<html>not json</html>', { status: 200 })) as unknown as typeof fetch;
    const r = await cmdModels({ builtin: 'routellm', env: ENV, fetchImpl: bad });
    expect(r.code).toBe(2);
    expect(r.output).toMatch(/not valid JSON/);
  });

  it('HTTP failure → exit 2 with status, no retry', async () => {
    let calls = 0;
    const failing = vi.fn(async () => {
      calls += 1;
      return new Response('{"error":"nope"}', { status: 503 });
    }) as unknown as typeof fetch;
    const r = await cmdModels({ builtin: 'openrouter', env: ENV, fetchImpl: failing });
    expect(r.code).toBe(2);
    expect(r.output).toContain('503');
    expect(calls).toBe(1);
  });

  it('limit truncates the listing; entries carry the full normalized set', async () => {
    const r = await cmdModels({ builtin: 'openrouter', env: ENV, limit: 2, fetchImpl: okFetch() });
    expect(r.code).toBe(0);
    expect(r.output).toContain('showing 2');
    expect(r.entries).toHaveLength(3);
  });

  it('no provider selection → actionable usage error', async () => {
    const r = await cmdModels({ env: ENV });
    expect(r.code).toBe(2);
    expect(r.output).toContain('--provider');
  });
});
