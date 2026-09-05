import { describe, it, expect } from 'vitest';
import type { LlmAdapter, LlmResponse } from '../eval/llm/adapter';
import { singleRoutePlan, isLlmPlan } from './plan';

/**
 * Role-aware routing (owner spec §3): the runner asks a plan for the route of
 * a ROLE; a plain adapter normalizes to "same route for every role". The
 * runner never sees provider details — only named gateways + requested models.
 */

/** Scripted adapter that records the prompts it served (for routing assertions). */
function spyAdapter(text: string): LlmAdapter & { prompts: string[] } {
  const prompts: string[] = [];
  return {
    prompts,
    async complete(prompt: string): Promise<LlmResponse> {
      prompts.push(prompt);
      return { text };
    },
  };
}

describe('singleRoutePlan', () => {
  it('returns the SAME route (adapter + identity) for every role', () => {
    const adapter = spyAdapter('x');
    const plan = singleRoutePlan(adapter, {
      gateway: 'glm',
      providerKind: 'openai-compatible',
      requestedModel: 'glm-5.3',
    });
    for (const role of ['single', 'classifier', 'proposal_a', 'proposal_b', 'judge'] as const) {
      const route = plan.forRole(role);
      expect(route.adapter).toBe(adapter);
      expect(route.identity.gateway).toBe('glm');
      expect(route.identity.requestedModel).toBe('glm-5.3');
    }
  });

  it('without identity, routes still resolve with an unattributed marker', () => {
    const plan = singleRoutePlan(spyAdapter('x'));
    expect(plan.forRole('judge').identity.gateway).toBe('unknown');
    expect(plan.forRole('judge').identity.requestedModel).toBe('unknown');
  });
});

describe('isLlmPlan', () => {
  it('recognizes plans and rejects plain adapters/other shapes', () => {
    const plan = singleRoutePlan(spyAdapter('x'));
    expect(isLlmPlan(plan)).toBe(true);
    expect(isLlmPlan(spyAdapter('x'))).toBe(false);
    expect(isLlmPlan(undefined)).toBe(false);
    expect(isLlmPlan({ forRole: 'not-a-function' })).toBe(false);
  });
});

describe('a heterogeneous plan', () => {
  it('serves each role from its own adapter — mixed gateways are just route data', () => {
    const classifier = spyAdapter('{"profile":"p-standard","must_be_blocked":false}');
    const a = spyAdapter('A');
    const b = spyAdapter('B');
    const judge = spyAdapter('J');
    const plan = {
      forRole: (role: 'single' | 'classifier' | 'proposal_a' | 'proposal_b' | 'judge') => {
        switch (role) {
          case 'classifier':
            return {
              adapter: classifier,
              identity: { gateway: 'routellm', providerKind: 'routellm' as const, requestedModel: 'gemini-3.7-flash' },
            };
          case 'proposal_a':
            return {
              adapter: a,
              identity: { gateway: 'openrouter', providerKind: 'openrouter' as const, requestedModel: 'anthropic/claude-opus-5' },
            };
          case 'proposal_b':
            return {
              adapter: b,
              identity: { gateway: 'openrouter', providerKind: 'openrouter' as const, requestedModel: 'x-ai/grok-4.6' },
            };
          default:
            return {
              adapter: judge,
              identity: { gateway: 'routellm', providerKind: 'routellm' as const, requestedModel: 'gpt-5.6-sol' },
            };
        }
      },
    };
    expect(isLlmPlan(plan)).toBe(true);
    expect(plan.forRole('classifier').adapter).toBe(classifier);
    expect(plan.forRole('proposal_a').identity.requestedModel).toBe('anthropic/claude-opus-5');
    expect(plan.forRole('proposal_b').identity.requestedModel).toBe('x-ai/grok-4.6');
    expect(plan.forRole('judge').identity.gateway).toBe('routellm');
  });
});
