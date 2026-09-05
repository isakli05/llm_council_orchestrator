import { describe, it, expect } from 'vitest';
import { parseLlmConfig, resolveProfile } from './llm-config';
import type { LlmConfig, ResolvedRole } from './llm-config';

/**
 * Branch-coverage companions to llm-config.test.ts, same pure parse/resolve
 * style: root-level zod issues rendered as <root>, the fused-topology default,
 * the none-fallbacks in reference diagnostics, and the role-resolution
 * precedence arms (role vs provider maxTokens, headers, providerOrder).
 */

const GLM = {
  type: 'openai-compatible',
  baseUrl: 'https://api.z.ai/v1',
  apiKeyEnv: 'LCO_LLM_API_KEY',
} as const;

describe('parseLlmConfig — issue rendering', () => {
  it('a root-level type error renders its zod path as <root>', () => {
    // valid JSON, wrong shape at the top: the issue path is empty → '<root>'
    const r = parseLlmConfig('123');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/<root>: /);
  });
});

describe('resolveProfile — council topology default', () => {
  it('a council profile with NO topology field resolves as fused', () => {
    const doc = JSON.stringify({
      llm: {
        providers: { glm: GLM },
        profiles: {
          unstated: {
            variant: 'council',
            roles: {
              classifier: { provider: 'glm', model: 'glm-5.3' },
              proposal_a: { provider: 'glm', model: 'glm-5.3' },
              judge: { provider: 'glm', model: 'glm-5.3' },
            },
          },
        },
      },
    });
    const parsed = parseLlmConfig(doc);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const r = resolveProfile(parsed.config, 'unstated');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.resolved.topology).toBe('fused');
  });

  it('an empty roles map reports "got [none]" in the role-set diagnostic', () => {
    const doc = JSON.stringify({
      llm: {
        providers: { glm: GLM },
        profiles: { hollow: { variant: 'council', roles: {} } },
      },
    });
    const parsed = parseLlmConfig(doc);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const r = resolveProfile(parsed.config, 'hollow');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/requires exactly the roles \[[^\]]+\] — got \[none\]/);
  });
});

describe('resolveProfile — none-fallbacks on empty reference maps', () => {
  // The schema refuses empty providers/profiles at parse time, but
  // resolveProfile is a pure exported function whose contract covers
  // hand-assembled configs — these pin the "configured: none" diagnostics.

  it('unknown profile against an EMPTY profiles map says (configured: none)', () => {
    const config: LlmConfig = { llm: { providers: { glm: { ...GLM } }, profiles: {} } };
    const r = resolveProfile(config, 'ghost');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/unknown llm profile 'ghost' \(configured: none\)/);
  });

  it('unknown provider against an EMPTY providers map says (configured: none)', () => {
    const config: LlmConfig = {
      llm: {
        providers: {},
        profiles: { p: { variant: 'single', roles: { single: { provider: 'ghost', model: 'm' } } } },
      },
    };
    const r = resolveProfile(config, 'p');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/references unknown provider 'ghost' \(configured: none\)/);
  });
});

describe('resolveProfile — per-role resolution precedence arms', () => {
  function resolveSingleRole(provider: Record<string, unknown>, role: Record<string, unknown>): ResolvedRole | undefined {
    const parsed = parseLlmConfig(
      JSON.stringify({
        llm: {
          providers: { glm: provider },
          profiles: { p: { variant: 'single', roles: { single: { provider: 'glm', model: 'm', ...role } } } },
        },
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return undefined;
    const r = resolveProfile(parsed.config, 'p');
    expect(r.ok).toBe(true);
    return r.ok ? r.resolved.roles.single : undefined;
  }

  it('role-level maxTokens WINS over the provider default; provider default applies when the role omits it', () => {
    const roleWins = resolveSingleRole({ ...GLM, maxTokens: 16000 }, { maxTokens: 999 });
    expect(roleWins?.maxTokens).toBe(999);
    const providerFills = resolveSingleRole({ ...GLM, maxTokens: 16000 }, {});
    expect(providerFills?.maxTokens).toBe(16000);
    const absent = resolveSingleRole({ ...GLM }, {});
    expect(absent && 'maxTokens' in absent).toBe(false); // unknown ≠ zero: key stays absent
  });

  it('provider headers ride into the resolved role only when declared', () => {
    const withHeaders = resolveSingleRole(
      { ...GLM, headers: { 'HTTP-Referer': 'https://x.test', 'X-Title': 'lco' } },
      {},
    );
    expect(withHeaders?.headers).toEqual({ 'HTTP-Referer': 'https://x.test', 'X-Title': 'lco' });
    const without = resolveSingleRole({ ...GLM }, {});
    expect(without && 'headers' in without).toBe(false);
  });

  it('routing providerOrder (and providerOnly) ride in only when declared', () => {
    const withPins = resolveSingleRole(
      { type: 'openrouter', apiKeyEnv: 'OPENROUTER_API_KEY', routing: { providerOnly: ['anthropic'], providerOrder: ['anthropic', 'openai'] } },
      {},
    );
    expect(withPins?.providerOnly).toEqual(['anthropic']);
    expect(withPins?.providerOrder).toEqual(['anthropic', 'openai']);
    const without = resolveSingleRole({ type: 'openrouter', apiKeyEnv: 'OPENROUTER_API_KEY' }, {});
    expect(without && 'providerOrder' in without).toBe(false);
  });
});
