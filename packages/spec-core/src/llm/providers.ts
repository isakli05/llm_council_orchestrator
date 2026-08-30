import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { LlmAdapter } from '../eval/llm/adapter';
import type { BudgetLedger } from '../eval/budget';
import { createOpenAiCompatibleLlm } from './openai-compatible';
import type { OpenAiCompatibleConfig, CostExtractor } from './openai-compatible';
import type { ResolvedRole } from '../config/llm-config';
import type { RoutingMode } from './provider';

/**
 * Provider factories: one ResolvedRole (lco.config.json) → one transport
 * config. This is the ONLY place provider-specific request semantics exist —
 * the runner and the transport stay provider-agnostic.
 *
 * OpenRouter facts below verified 2026-08-30 against the authoritative
 * sources the owner named: openrouter.ai/openapi.json (ProviderPreferences,
 * ChatResult), docs/guides/routing/provider-selection.md, and
 * docs/guides/features/router-metadata.md.
 */

/**
 * The machine-generated SpecBundle JSON Schema (the same artifact the prompts
 * embed and the validator enforces) — payload for provider-enforced
 * structured output when a role opts in (§15). strict:false because the
 * schema's conditionals exceed what gateways validate faithfully; the
 * DETERMINISTIC validator remains the binding gate either way.
 */
const SPEC_SCHEMA_TEXT: string = readFileSync(
  path.resolve(__dirname, '../../generated/spec-schema.json'),
  'utf8',
);

/** OpenRouter reports usage.cost in credits (usage-accounting doc, 2026-08-30). */
const openRouterCost: CostExtractor = (usage) => {
  const cost = (usage as { cost?: unknown }).cost;
  return typeof cost === 'number' ? { amount: cost, currency: 'credits' } : undefined;
};

/** Per-call context the factories need beyond the role itself. */
export interface RoleCallContext {
  routingMode: RoutingMode;
}

/**
 * OpenRouter:
 *  - always sends `X-OpenRouter-Metadata: enabled` (per-request observability
 *    opt-in; surfaces openrouter_metadata on responses — does NOT alter
 *    routing) so provenance (requested/resolved model, selected upstream,
 *    fallback-occurred) is recorded rather than unknown;
 *  - evaluation mode: `provider.allow_fallbacks:false` (no silent upstream
 *    substitution) + configured pins via the official `only`/`order` fields;
 *    `require_parameters:true` when the role requests structured output;
 *  - product mode: documented defaults (fallbacks allowed); explicit pins
 *    still apply because they are deliberate operator configuration;
 *  - provider-reported cost (credits) extracted when present.
 */
export function toOpenRouterConfig(
  role: ResolvedRole,
  apiKey: string,
  ctx: RoleCallContext,
): OpenAiCompatibleConfig {
  const providerRouting: Record<string, unknown> = {};
  if (role.providerOnly !== undefined) providerRouting.only = role.providerOnly;
  if (role.providerOrder !== undefined) providerRouting.order = role.providerOrder;
  if (ctx.routingMode === 'evaluation') {
    providerRouting.allow_fallbacks = false;
    if (role.structuredOutput === 'required') providerRouting.require_parameters = true;
  }

  const extraBody: Record<string, unknown> = { ...(role.extraBody ?? {}) };
  if (Object.keys(providerRouting).length > 0) extraBody.provider = providerRouting;
  if (role.structuredOutput === 'required') {
    extraBody.response_format = {
      type: 'json_schema',
      json_schema: { name: 'spec_bundle', strict: false, schema: JSON.parse(SPEC_SCHEMA_TEXT) },
    };
  }

  return {
    gateway: role.gateway,
    providerKind: 'openrouter',
    baseUrl: role.baseUrl,
    apiKey,
    model: role.model,
    ...(role.maxTokens !== undefined ? { maxTokens: role.maxTokens } : {}),
    extraBody,
    extraHeaders: {
      'X-OpenRouter-Metadata': 'enabled',
      ...(role.headers ?? {}),
    },
    costExtractor: openRouterCost,
  };
}

/**
 * Abacus RouteLLM: plain OpenAI-compatible mapping on the documented base
 * URL. No upstream provider routing (the gateway does not expose pinning —
 * resolved upstream identity stays UNKNOWN, recorded honestly) and no
 * provider-reported cost. Model IDs are runtime-discovered via `lco models`
 * (GET /v1/models); the config layer already bans the 'route-llm' auto-router
 * in evaluation profiles.
 */
export function toRouteLlmConfig(
  role: ResolvedRole,
  apiKey: string,
  _ctx: RoleCallContext,
): OpenAiCompatibleConfig {
  return {
    gateway: role.gateway,
    providerKind: 'routellm',
    baseUrl: role.baseUrl,
    apiKey,
    model: role.model,
    ...(role.maxTokens !== undefined ? { maxTokens: role.maxTokens } : {}),
    ...(role.extraBody !== undefined ? { extraBody: role.extraBody } : {}),
    ...(role.headers !== undefined ? { extraHeaders: role.headers } : {}),
  };
}

/** Generic OpenAI-compatible: transparent pass-through (the legacy LCO_LLM_* path's kin). */
export function toGenericConfig(role: ResolvedRole, apiKey: string): OpenAiCompatibleConfig {
  return {
    gateway: role.gateway,
    providerKind: 'openai-compatible',
    baseUrl: role.baseUrl,
    apiKey,
    model: role.model,
    ...(role.maxTokens !== undefined ? { maxTokens: role.maxTokens } : {}),
    ...(role.extraBody !== undefined ? { extraBody: role.extraBody } : {}),
    ...(role.headers !== undefined ? { extraHeaders: role.headers } : {}),
  };
}

/**
 * Build one role's adapter, resolving its API key from the environment BY
 * NAME (config carries names, never values). FAIL-CLOSED: a missing, blank,
 * or whitespace-only key is an error naming the variable — LCO never invents
 * or borrows a key. The ledger is shared with the run (per-attempt charging
 * across every role of the council).
 */
export function buildRoleAdapter(
  role: ResolvedRole,
  env: NodeJS.ProcessEnv,
  ctx: RoleCallContext & { budget?: BudgetLedger },
): LlmAdapter {
  const raw = env[role.apiKeyEnv];
  const apiKey = raw?.trim();
  if (apiKey === undefined || apiKey === '') {
    throw new Error(
      `llm profile role needs ${role.apiKeyEnv} (gateway '${role.gateway}', model '${role.model}') — ` +
        'set the environment variable; lco.config.json stores the NAME, never the value',
    );
  }
  const base: OpenAiCompatibleConfig =
    role.providerKind === 'openrouter'
      ? toOpenRouterConfig(role, apiKey, ctx)
      : role.providerKind === 'routellm'
        ? toRouteLlmConfig(role, apiKey, ctx)
        : toGenericConfig(role, apiKey);
  return createOpenAiCompatibleLlm({ ...base, ...(ctx.budget !== undefined ? { budget: ctx.budget } : {}) });
}
