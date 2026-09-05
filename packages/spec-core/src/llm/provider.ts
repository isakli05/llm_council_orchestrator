/**
 * Provider-layer vocabulary shared by every gateway adapter (the ONE transport
 * in openai-compatible.ts plus the per-kind factories in openrouter.ts /
 * routellm.ts). Pure types + documented defaults — no IO, no env, no clock.
 *
 * Honesty rules that travel with these types:
 *  - every provenance field except `gateway`/`providerKind`/`requestedModel`
 *    is OPTIONAL because providers report identity inconsistently;
 *  - absent means UNKNOWN — never rendered as an empty string or zero;
 *  - `cost` is provider-REPORTED cost only. LCO ships no price catalogue and
 *    never estimates (a future estimator must live above this layer and label
 *    itself).
 */

/** The gateway kinds LCO knows how to configure (no vendor SDKs — one transport). */
export type ProviderKind =
  | 'openai-compatible'
  | 'openrouter'
  | 'routellm';

/** Runtime-checkable list of ProviderKind (fail-closed config validation). */
export const PROVIDER_KINDS: readonly ProviderKind[] = [
  'openai-compatible',
  'openrouter',
  'routellm',
] as const;

/**
 * Routing mode (owner spec §5/§6):
 *  - 'product'    — reliability/availability mode: provider fallback for the
 *                   same requested model is allowed, resolved identity is
 *                   recorded, availability wins.
 *  - 'evaluation' — reproducibility mode: exact model, provider fallback
 *                   disabled where the gateway supports it, upstream pinned
 *                   when configured, automatic-router models prohibited.
 */
export type RoutingMode = 'product' | 'evaluation';

/**
 * Identity/provenance of one completion as the provider reported it.
 * All optional fields are omitted when the provider did not report them —
 * consumers must render `unknown`, never a fabricated value.
 */
export interface LlmProvenance {
  /** Configured gateway NAME (the provider key in lco.config.json, or 'legacy-env'). */
  gateway: string;
  providerKind: ProviderKind;
  /** The model LCO requested (config/role model). */
  requestedModel: string;
  /** The model that actually served the request, when reported (OpenRouter: response `model`). */
  resolvedModel?: string;
  /** The upstream provider that served the request, when reported (OpenRouter: openrouter_metadata selected endpoint). */
  upstreamProvider?: string;
  /** Provider request/generation id, when reported. */
  requestId?: string;
  /** Provider-reported monetary cost. Absent = unknown — never zero, never estimated here. */
  cost?: { amount: number; currency: string };
  /** The provider reported that the successful attempt came AFTER fallback attempts. */
  fallbackObserved?: boolean;
}

/**
 * Token detail accounting beyond in/out, as providers report it
 * (OpenAI-compatible usage.prompt_tokens_details / completion_tokens_details).
 * Absent = unknown.
 */
export interface LlmUsageDetails {
  reasoningTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

/**
 * Default base URLs — the ONLY provider endpoints LCO names. Both verified
 * 2026-08-30 against current official sources (openrouter openapi.json servers;
 * the RouteLLM developer-platform page); both overridable in lco.config.json.
 */
export const OPENROUTER_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
export const ROUTELLM_DEFAULT_BASE_URL = 'https://routellm.abacus.ai/v1';
