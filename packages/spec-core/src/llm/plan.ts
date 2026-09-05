import type { LlmAdapter } from '../eval/llm/adapter';
import type { ProviderKind } from './provider';

/**
 * Role-aware LLM routing (owner spec §3). The pipeline consumes a PLAN: for
 * each pipeline ROLE it gets the adapter that serves it plus the route's
 * identity (named gateway + requested model — enough for provenance and
 * per-role accounting, none of the provider mechanics).
 *
 * A plain LlmAdapter normalizes to "the same route for every role" via
 * singleRoutePlan, which is exactly the historical behavior: one configured
 * model serves the whole run. The runner therefore stays provider-agnostic —
 * gateway/model selection happens below orchestration, in the config/plan
 * layer (llm-config.ts builds real plans; tests inject per-role spies).
 */

export type LlmRole =
  | 'single'
  | 'classifier'
  | 'proposal_a'
  | 'proposal_b'
  | 'judge'
  | 'renew_recover';

/** Every role the current pipeline topologies can ask for. */
export const LLM_ROLES: readonly LlmRole[] = [
  'single',
  'classifier',
  'proposal_a',
  'proposal_b',
  'judge',
  'renew_recover',
] as const;

export interface LlmRoute {
  adapter: LlmAdapter;
  identity: {
    /** Configured gateway NAME ('glm', 'openrouter', … or 'legacy-env'). */
    gateway: string;
    providerKind: ProviderKind;
    /** The model this route requests (per-role model selection). */
    requestedModel: string;
  };
}

export interface LlmPlan {
  forRole(role: LlmRole): LlmRoute;
}

/**
 * Normalize a plain adapter into a plan: the same route for every role —
 * the historical single-model topology. Identity defaults to the explicit
 * 'unknown' marker when the caller has none (mocks): unknown is honest, an
 * invented gateway name is not.
 */
export function singleRoutePlan(
  adapter: LlmAdapter,
  identity?: LlmRoute['identity'],
): LlmPlan {
  const resolved: LlmRoute['identity'] = identity ?? {
    gateway: 'unknown',
    providerKind: 'openai-compatible',
    requestedModel: 'unknown',
  };
  return { forRole: () => ({ adapter, identity: resolved }) };
}

/** Structural check: anything with a callable forRole is a plan. */
export function isLlmPlan(x: unknown): x is LlmPlan {
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof (x as { forRole?: unknown }).forRole === 'function'
  );
}
