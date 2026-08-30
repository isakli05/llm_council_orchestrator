import { describe, it, expect } from 'vitest';
import {
  OPENROUTER_DEFAULT_BASE_URL,
  ROUTELLM_DEFAULT_BASE_URL,
  PROVIDER_KINDS,
} from './provider';

/**
 * Provider-layer constants and type surface (pure module — no IO, no env).
 */

describe('provider kinds + defaults', () => {
  it('exposes exactly the three supported provider kinds', () => {
    expect(PROVIDER_KINDS).toEqual(['openai-compatible', 'openrouter', 'routellm']);
  });

  it('OpenRouter default base URL is the current documented API base', () => {
    // Verified 2026-08-30 against https://openrouter.ai/openapi.json servers.
    expect(OPENROUTER_DEFAULT_BASE_URL).toBe('https://openrouter.ai/api/v1');
  });

  it('RouteLLM default base URL is the documented self-serve base', () => {
    // Verified 2026-08-30 against https://abacus.ai/help/developer-platform/route-llm/
    expect(ROUTELLM_DEFAULT_BASE_URL).toBe('https://routellm.abacus.ai/v1');
  });
});
