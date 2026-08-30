import { describe, it, expect } from 'vitest';
import { parseLlmConfig, resolveProfile } from './llm-config';

/**
 * lco.config.json — named reusable providers + council profiles (owner spec
 * §7). Fail-closed validation: unknown keys rejected, secrets-by-VALUE
 * rejected (only env-var NAMES live in config), references must resolve,
 * role sets must match the topology, and reproducible (evaluation) profiles
 * cannot use gateway auto-routers.
 */

const VALID = JSON.stringify({
  llm: {
    providers: {
      glm: {
        type: 'openai-compatible',
        baseUrl: 'https://api.z.ai/v1',
        apiKeyEnv: 'LCO_LLM_API_KEY',
        maxTokens: 16000,
        extraBody: { thinking: { type: 'disabled' } },
      },
      openrouter: {
        type: 'openrouter',
        apiKeyEnv: 'OPENROUTER_API_KEY',
        routing: { providerOnly: ['anthropic'] },
      },
      routellm: {
        type: 'routellm',
        apiKeyEnv: 'ABACUS_ROUTELLM_API_KEY',
      },
    },
    profiles: {
      'glm-single': {
        variant: 'single',
        roles: { single: { provider: 'glm', model: 'glm-5.3' } },
      },
      'glm-council-fused': {
        variant: 'council',
        topology: 'fused',
        roles: {
          classifier: { provider: 'glm', model: 'glm-5.3' },
          proposal_a: { provider: 'glm', model: 'glm-5.3' },
          judge: { provider: 'glm', model: 'glm-5.3' },
        },
      },
      'frontier-heterogeneous-openrouter': {
        variant: 'council',
        topology: 'decomposed',
        routingMode: 'evaluation',
        roles: {
          classifier: { provider: 'openrouter', model: 'google/gemini-3.7-flash' },
          proposal_a: { provider: 'openrouter', model: 'anthropic/claude-opus-5' },
          proposal_b: { provider: 'openrouter', model: 'x-ai/grok-4.6' },
          judge: { provider: 'openrouter', model: 'openai/gpt-5.6-sol' },
        },
      },
      'same-model-decomposed': {
        variant: 'council',
        topology: 'decomposed',
        roles: {
          classifier: { provider: 'glm', model: 'glm-5.3' },
          proposal_a: { provider: 'glm', model: 'glm-5.3' },
          proposal_b: { provider: 'glm', model: 'glm-5.3' },
          judge: { provider: 'glm', model: 'glm-5.3' },
        },
      },
    },
  },
});

describe('parseLlmConfig — happy paths', () => {
  it('parses the full valid document and resolves every profile', () => {
    const parsed = parseLlmConfig(VALID);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    for (const name of [
      'glm-single',
      'glm-council-fused',
      'frontier-heterogeneous-openrouter',
      'same-model-decomposed',
    ]) {
      const r = resolveProfile(parsed.config, name);
      expect(r.ok).toBe(true);
    }
  });

  it('resolves defaults: openrouter/routellm base URLs, fused topology, product routing, structuredOutput off', () => {
    const parsed = parseLlmConfig(VALID);
    if (!parsed.ok) return;
    const fused = resolveProfile(parsed.config, 'glm-council-fused');
    expect(fused.ok && fused.resolved.topology).toBe('fused');
    expect(fused.ok && fused.resolved.routingMode).toBe('product');
    const frontier = resolveProfile(parsed.config, 'frontier-heterogeneous-openrouter');
    if (!frontier.ok) return;
    expect(frontier.resolved.roles.judge.baseUrl).toBe('https://openrouter.ai/api/v1');
    expect(frontier.resolved.roles.classifier.structuredOutput).toBe('off');
    expect(frontier.resolved.routingMode).toBe('evaluation');
  });

  it('carries provider-level routing pins into resolved roles', () => {
    const parsed = parseLlmConfig(VALID);
    if (!parsed.ok) return;
    const frontier = resolveProfile(parsed.config, 'frontier-heterogeneous-openrouter');
    if (!frontier.ok) return;
    expect(frontier.resolved.roles.proposal_a.providerOnly).toEqual(['anthropic']);
  });
});

describe('parseLlmConfig — fail-closed validation', () => {
  it('rejects malformed JSON with a parse error', () => {
    const r = parseLlmConfig('{not json');
    expect(!r.ok && r.error).toMatch(/not valid JSON/i);
  });

  it('rejects a raw secret VALUE in place of the env-var name', () => {
    const doc = JSON.stringify({
      llm: {
        providers: { or: { type: 'openrouter', apiKeyEnv: 'sk-or-v1-abc123def456' } },
        profiles: { p: { variant: 'single', roles: { single: { provider: 'or', model: 'm' } } } },
      },
    });
    const r = parseLlmConfig(doc);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/apiKeyEnv/);
  });

  it('rejects an apiKey FIELD (secrets never live in config)', () => {
    const doc = JSON.stringify({
      llm: {
        providers: { or: { type: 'openrouter', apiKey: 'sk-...' } },
        profiles: {},
      },
    });
    expect(parseLlmConfig(doc).ok).toBe(false);
  });

  it('rejects unknown keys everywhere (strict)', () => {
    const doc = JSON.parse(VALID) as Record<string, unknown>;
    const llm = (doc.llm as Record<string, unknown>) as never;
    (llm.providers as Record<string, unknown>).openrouter = {
      ...(llm.providers as Record<string, unknown>).openrouter,
      baseUrlOverrideTypo: 'x',
    };
    expect(parseLlmConfig(JSON.stringify(doc)).ok).toBe(false);
  });

  it('rejects an unknown provider kind', () => {
    const doc = JSON.stringify({
      llm: {
        providers: { x: { type: 'anthropic-native', apiKeyEnv: 'A', baseUrl: 'https://x' } },
        profiles: { p: { variant: 'single', roles: { single: { provider: 'x', model: 'm' } } } },
      },
    });
    expect(parseLlmConfig(doc).ok).toBe(false);
  });

  it('requires baseUrl for generic openai-compatible providers (no default endpoint)', () => {
    const doc = JSON.stringify({
      llm: {
        providers: { x: { type: 'openai-compatible', apiKeyEnv: 'A' } },
        profiles: { p: { variant: 'single', roles: { single: { provider: 'x', model: 'm' } } } },
      },
    });
    const r = parseLlmConfig(doc);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/baseUrl/);
  });

  it('rejects invalid env-var NAMES (lowercase/whitespace/too long)', () => {
    for (const bad of ['lowercase', 'WITH SPACE', 'A=B', 'x'.repeat(80)]) {
      const doc = JSON.stringify({
        llm: {
          providers: { x: { type: 'openrouter', apiKeyEnv: bad } },
          profiles: { p: { variant: 'single', roles: { single: { provider: 'x', model: 'm' } } } },
        },
      });
      expect(parseLlmConfig(doc).ok).toBe(false);
    }
  });
});

describe('resolveProfile — reference + role-set discipline', () => {
  it('rejects an unknown profile name and an unknown provider reference', () => {
    const parsed = parseLlmConfig(VALID);
    if (!parsed.ok) return;
    expect(resolveProfile(parsed.config, 'nope').ok).toBe(false);
    const doc = JSON.parse(VALID) as { llm: { providers: Record<string, unknown>; profiles: Record<string, unknown> } };
    (doc.llm.profiles.bad as Record<string, unknown>) = {
      variant: 'single',
      roles: { single: { provider: 'ghost', model: 'm' } },
    };
    const reparsed = parseLlmConfig(JSON.stringify(doc));
    expect(reparsed.ok).toBe(true);
    if (reparsed.ok) expect(resolveProfile(reparsed.config, 'bad').ok).toBe(false);
  });

  it('single profile requires exactly the single role', () => {
    const parsed = parseLlmConfig(VALID);
    if (!parsed.ok) return;
    const doc = JSON.parse(VALID) as { llm: { providers: unknown; profiles: Record<string, unknown> } };
    (doc.llm.profiles.badsingle as Record<string, unknown>) = {
      variant: 'single',
      roles: {
        single: { provider: 'glm', model: 'glm-5.3' },
        judge: { provider: 'glm', model: 'glm-5.3' },
      },
    };
    const reparsed = parseLlmConfig(JSON.stringify(doc));
    if (!reparsed.ok) return;
    const r = resolveProfile(reparsed.config, 'badsingle');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/role/i);
  });

  it('fused council requires classifier/proposal_a/judge and rejects proposal_b', () => {
    const doc = JSON.parse(VALID) as { llm: { providers: unknown; profiles: Record<string, unknown> } };
    (doc.llm.profiles.badfused as Record<string, unknown>) = {
      variant: 'council',
      topology: 'fused',
      roles: {
        classifier: { provider: 'glm', model: 'glm-5.3' },
        proposal_a: { provider: 'glm', model: 'glm-5.3' },
        // judge missing → rejected
      },
    };
    const parsed = parseLlmConfig(JSON.stringify(doc));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(resolveProfile(parsed.config, 'badfused').ok).toBe(false);

    (doc.llm.profiles.badfused2 as Record<string, unknown>) = {
      variant: 'council',
      topology: 'fused',
      roles: {
        classifier: { provider: 'glm', model: 'glm-5.3' },
        proposal_a: { provider: 'glm', model: 'glm-5.3' },
        judge: { provider: 'glm', model: 'glm-5.3' },
        proposal_b: { provider: 'glm', model: 'glm-5.3' }, // fused has no B leg
      },
    };
    const parsed2 = parseLlmConfig(JSON.stringify(doc));
    expect(parsed2.ok).toBe(true);
    if (parsed2.ok) expect(resolveProfile(parsed2.config, 'badfused2').ok).toBe(false);
  });

  it('decomposed council requires all four roles', () => {
    const doc = JSON.parse(VALID) as { llm: { providers: unknown; profiles: Record<string, unknown> } };
    (doc.llm.profiles.baddec as Record<string, unknown>) = {
      variant: 'council',
      topology: 'decomposed',
      roles: {
        classifier: { provider: 'glm', model: 'glm-5.3' },
        proposal_a: { provider: 'glm', model: 'glm-5.3' },
        judge: { provider: 'glm', model: 'glm-5.3' },
      },
    };
    const parsed = parseLlmConfig(JSON.stringify(doc));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(resolveProfile(parsed.config, 'baddec').ok).toBe(false);
  });
});

describe('resolveProfile — reproducibility mode enforcement (§5/§6)', () => {
  it('evaluation mode + routellm + the route-llm auto-router → rejected', () => {
    const doc = JSON.parse(VALID) as { llm: { providers: unknown; profiles: Record<string, unknown> } };
    (doc.llm.profiles.routerEval as Record<string, unknown>) = {
      variant: 'single',
      routingMode: 'evaluation',
      roles: { single: { provider: 'routellm', model: 'route-llm' } },
    };
    const parsed = parseLlmConfig(JSON.stringify(doc));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const r = resolveProfile(parsed.config, 'routerEval');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/route-llm/);
  });

  it('product mode + route-llm is ALLOWED (documented as non-reproducible)', () => {
    const doc = JSON.parse(VALID) as { llm: { providers: unknown; profiles: Record<string, unknown> } };
    (doc.llm.profiles.routerProd as Record<string, unknown>) = {
      variant: 'single',
      roles: { single: { provider: 'routellm', model: 'route-llm' } },
    };
    const parsed = parseLlmConfig(JSON.stringify(doc));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(resolveProfile(parsed.config, 'routerProd').ok).toBe(true);
  });

  it('structuredOutput "required" is only legal on the decomposed (v4) topology', () => {
    const doc = JSON.parse(VALID) as { llm: { providers: unknown; profiles: Record<string, unknown> } };
    (doc.llm.profiles.strsingle as Record<string, unknown>) = {
      variant: 'single',
      roles: { single: { provider: 'glm', model: 'glm-5.3', structuredOutput: 'required' } },
    };
    const parsed = parseLlmConfig(JSON.stringify(doc));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(resolveProfile(parsed.config, 'strsingle').ok).toBe(false);
  });
});

describe('parseLlmConfig — baseUrl scheme + metadata hardening (review F3)', () => {
  function withBaseUrl(baseUrl: string): string {
    return JSON.stringify({
      llm: {
        providers: { x: { type: 'openai-compatible', baseUrl, apiKeyEnv: 'A' } },
        profiles: { p: { variant: 'single', roles: { single: { provider: 'x', model: 'm' } } } },
      },
    });
  }

  it('accepts https and http (local gateways are legitimate)', () => {
    expect(parseLlmConfig(withBaseUrl('https://gw.example.test/v1')).ok).toBe(true);
    expect(parseLlmConfig(withBaseUrl('http://localhost:8000/v1')).ok).toBe(true);
  });

  it('rejects non-http(s) schemes at parse time (no retried dead fetches)', () => {
    for (const bad of [
      'javascript:alert(1)',
      'file:///etc/passwd',
      'data:text/plain,hi',
      'chrome-extension://abc/v1',
    ]) {
      const r = parseLlmConfig(withBaseUrl(bad));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/http\(s\)/);
    }
  });

  it('rejects link-local and cloud-metadata endpoints (credential exfiltration)', () => {
    for (const bad of [
      'http://169.254.169.254/latest/meta-data',
      'https://169.254.170.2/v1',
      'http://metadata.google.internal/computeMetadata/v1',
      'http://[fe80::1]:8080/v1',
    ]) {
      const r = parseLlmConfig(withBaseUrl(bad));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/link-local\/metadata/);
    }
  });
});

describe('parseLlmConfig — header-name hardening (review F4)', () => {
  function withHeaders(headers: Record<string, string>): string {
    return JSON.stringify({
      llm: {
        providers: { x: { type: 'openrouter', apiKeyEnv: 'A', headers } },
        profiles: { p: { variant: 'single', roles: { single: { provider: 'x', model: 'm' } } } },
      },
    });
  }

  it('accepts normal provider headers (HTTP-Referer, X-Title)', () => {
    expect(parseLlmConfig(withHeaders({ 'HTTP-Referer': 'https://x', 'X-Title': 'lco' })).ok).toBe(true);
  });

  it('rejects authorization/content-type in ANY casing (duplicate-header corruption)', () => {
    for (const name of ['authorization', 'Authorization', 'AUTHORIZATION', 'content-type', 'Content-Type']) {
      expect(parseLlmConfig(withHeaders({ [name]: 'x' })).ok).toBe(false);
    }
  });

  it('rejects non-token header names (CRLF/space injection shapes)', () => {
    for (const name of ['Bad Header', 'a:b', 'a\nb']) {
      expect(parseLlmConfig(withHeaders({ [name]: 'x' })).ok).toBe(false);
    }
  });
});
