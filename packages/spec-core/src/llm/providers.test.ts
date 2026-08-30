import { describe, it, expect, vi } from 'vitest';
import { toOpenRouterConfig, toRouteLlmConfig, toGenericConfig, buildRoleAdapter } from './providers';
import type { ResolvedRole } from '../config/llm-config';
import { createOpenAiCompatibleLlm } from './openai-compatible';
import type { OpenAiCompatibleConfig } from './openai-compatible';

/**
 * Provider factories: ResolvedRole (lco.config.json) → transport config.
 * Verified against current official OpenRouter semantics (2026-08-30:
 * openapi.json ProviderPreferences + provider-selection doc; router-metadata
 * doc for X-OpenRouter-Metadata) and the RouteLLM developer-platform page.
 */

function role(overrides: Partial<ResolvedRole> = {}): ResolvedRole {
  return {
    gateway: 'openrouter',
    providerKind: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    model: 'anthropic/claude-opus-5',
    structuredOutput: 'off',
    ...overrides,
  };
}

/** Drive one completion through a transport config with a fake fetch. */
async function send(config: OpenAiCompatibleConfig): Promise<{ body: Record<string, unknown>; headers: Record<string, string> }> {
  const fetchImpl = vi.fn(async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: 'x' } }] }), { status: 200 }),
  );
  const llm = createOpenAiCompatibleLlm({ ...config, fetchImpl });
  await llm.complete('p');
  const [url, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0] as unknown as [string, RequestInit];
  return {
    body: JSON.parse(init.body as string) as Record<string, unknown>,
    headers: init.headers as Record<string, string>,
  };
}

describe('toOpenRouterConfig', () => {
  it('product mode: no provider routing key, metadata header on, bearer auth', async () => {
    const { body, headers } = await send(
      toOpenRouterConfig(role(), 'test-key', {}),
    );
    expect(body.provider).toBeUndefined();
    expect(body.model).toBe('anthropic/claude-opus-5');
    expect(headers.authorization).toBe('Bearer test-key');
    // object keys keep configured casing (wire headers are case-insensitive)
    expect(headers['X-OpenRouter-Metadata']).toBe('enabled');
  });

  it('evaluation mode: allow_fallbacks=false (no silent model substitution)', async () => {
    const { body } = await send(
      toOpenRouterConfig(role(), 'k', { routingMode: 'evaluation' }),
    );
    expect(body.provider).toEqual({ allow_fallbacks: false });
  });

  it('evaluation mode + providerOnly/providerOrder pins map to official fields', async () => {
    const only = await send(
      toOpenRouterConfig(role({ providerOnly: ['anthropic'] }), 'k', { routingMode: 'evaluation' }),
    );
    expect(only.body.provider).toEqual({ allow_fallbacks: false, only: ['anthropic'] });
    const order = await send(
      toOpenRouterConfig(role({ providerOrder: ['anthropic', 'google'] }), 'k', { routingMode: 'evaluation' }),
    );
    expect(order.body.provider).toEqual({ allow_fallbacks: false, order: ['anthropic', 'google'] });
  });

  it('product mode ignores pins? no — pins still pin (explicit config wins), but fallbacks stay allowed', async () => {
    const { body } = await send(
      toOpenRouterConfig(role({ providerOrder: ['anthropic'] }), 'k', { routingMode: 'product' }),
    );
    expect(body.provider).toEqual({ order: ['anthropic'] });
  });

  it('config headers (HTTP-Referer/X-Title) ride along; authorization stays forced', async () => {
    const { headers } = await send(
      toOpenRouterConfig(role({ headers: { 'HTTP-Referer': 'https://example.test', 'X-Title': 'lco' } }), 'k', {}),
    );
    expect(headers['HTTP-Referer']).toBe('https://example.test');
    expect(headers['X-Title']).toBe('lco');
    expect(headers['X-OpenRouter-Metadata']).toBe('enabled');
    expect(headers.authorization).toBe('Bearer k');
  });

  it('structuredOutput required → response_format json_schema + require_parameters', async () => {
    const { body } = await send(
      toOpenRouterConfig(
        role({ structuredOutput: 'required' }),
        'k',
        { routingMode: 'evaluation' },
      ),
    );
    const provider = body.provider as Record<string, unknown>;
    expect(provider.require_parameters).toBe(true);
    const rf = body.response_format as { type: string; json_schema: { name: string; strict: boolean } };
    expect(rf.type).toBe('json_schema');
    expect(rf.json_schema.name).toBe('spec_bundle');
    expect(rf.json_schema.strict).toBe(false);
  });

  it('baseUrl override is honored', async () => {
    const config = toOpenRouterConfig(role({ baseUrl: 'https://or-mirror.example.test/v1' }), 'k', {});
    expect(config.baseUrl).toBe('https://or-mirror.example.test/v1');
  });

  it('usage.cost → credits cost extractor', () => {
    const config = toOpenRouterConfig(role(), 'k', {});
    expect(config.costExtractor).toBeDefined();
    expect(config.costExtractor?.({ cost: 0.5 })).toEqual({ amount: 0.5, currency: 'credits' });
    expect(config.costExtractor?.({})).toBeUndefined();
    expect(config.costExtractor?.({ cost: '0.5' })).toBeUndefined();
  });
});

describe('toRouteLlmConfig', () => {
  it('plain OpenAI-compatible mapping; no provider routing, no cost extractor, no metadata header', async () => {
    const config = toRouteLlmConfig(
      role({
        gateway: 'routellm',
        providerKind: 'routellm',
        baseUrl: 'https://routellm.abacus.ai/v1',
        model: 'gpt-5.5',
      }),
      'k',
      {},
    );
    expect(config.gateway).toBe('routellm');
    expect(config.providerKind).toBe('routellm');
    expect(config.costExtractor).toBeUndefined();
    const { body, headers } = await send(config);
    expect(body.provider).toBeUndefined();
    expect(body.response_format).toBeUndefined();
    expect(headers['X-OpenRouter-Metadata']).toBeUndefined();
    expect(headers.authorization).toBe('Bearer k');
  });
});

describe('toGenericConfig', () => {
  it('transparent pass-through of the resolved role', () => {
    const config = toGenericConfig(
      role({
        gateway: 'glm',
        providerKind: 'openai-compatible',
        baseUrl: 'https://api.z.ai/v1',
        model: 'glm-5.3',
        maxTokens: 16000,
        extraBody: { thinking: { type: 'disabled' } },
      }),
      'k',
    );
    expect(config).toMatchObject({
      gateway: 'glm',
      providerKind: 'openai-compatible',
      baseUrl: 'https://api.z.ai/v1',
      model: 'glm-5.3',
      maxTokens: 16000,
      extraBody: { thinking: { type: 'disabled' } },
    });
    expect(config.costExtractor).toBeUndefined();
  });
});

describe('buildRoleAdapter — dispatch + fail-closed key resolution', () => {
  const envFull = { OPENROUTER_API_KEY: 'or-key', ABACUS_ROUTELLM_API_KEY: 'rl-key', LCO_LLM_API_KEY: 'glm-key' };

  it('builds the right transport per provider kind from the SAME env', () => {
    const or = buildRoleAdapter(role(), envFull, {});
    expect(or).toBeDefined();
    const rl = buildRoleAdapter(
      role({ providerKind: 'routellm', gateway: 'routellm', apiKeyEnv: 'ABACUS_ROUTELLM_API_KEY' }),
      envFull,
      {},
    );
    expect(rl).toBeDefined();
    const generic = buildRoleAdapter(
      role({ providerKind: 'openai-compatible', gateway: 'glm', apiKeyEnv: 'LCO_LLM_API_KEY' }),
      envFull,
      {},
    );
    expect(generic).toBeDefined();
  });

  it('missing or blank key env → fail-closed error naming the env var (never a default key)', () => {
    expect(() => buildRoleAdapter(role(), {}, {})).toThrow(/OPENROUTER_API_KEY/);
    expect(() => buildRoleAdapter(role(), { OPENROUTER_API_KEY: '' }, {})).toThrow(/OPENROUTER_API_KEY/);
    expect(() => buildRoleAdapter(role(), { OPENROUTER_API_KEY: '   ' }, {})).toThrow(/OPENROUTER_API_KEY/);
  });
});
