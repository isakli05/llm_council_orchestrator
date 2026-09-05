import { z } from 'zod';
import { PROVIDER_KINDS, OPENROUTER_DEFAULT_BASE_URL, ROUTELLM_DEFAULT_BASE_URL } from '../llm/provider';
import type { ProviderKind, RoutingMode } from '../llm/provider';
import type { LlmRole } from '../llm/plan';
import type { CouncilTopology } from '../eval/budget';

/**
 * lco.config.json — named reusable providers + generation profiles (owner
 * spec §7). Pure parse/validate/resolve: no IO, no env access, no clock. The
 * CLI/MCP boundaries read the file text and hand it here.
 *
 * SECURITY SHAPE (binding):
 *  - NO SECRETS IN CONFIG. Providers carry `apiKeyEnv` — the NAME of an
 *    environment variable — never a value. A raw key pasted where the name
 *    belongs fails validation (the env-name grammar rejects it), and an
 *    `apiKey`-shaped field is an unknown key → rejected outright.
 *  - Everything strict: unknown keys are errors, references must resolve,
 *    role sets must match the topology exactly.
 *
 * REPRODUCIBILITY (§5/§6): `routingMode: "evaluation"` profiles must pin
 * explicit models — gateway auto-routers (routellm's `route-llm`) are
 * rejected so an "auto router" can never sneak into a scientific comparison.
 * Product profiles may use them (documented as non-reproducible).
 */

/** Env-var NAME grammar: uppercase, digits, underscore; ≤64 chars. A pasted
 * secret value (whitespace, '=', lowercase, slashes, length) cannot match. */
const ENV_NAME = /^[A-Z][A-Z0-9_]{0,63}$/;

/**
 * Provider base URLs: http(s) ONLY, and never a link-local/metadata endpoint.
 * A shared/cloned lco.config.json must not be able to redirect the operator's
 * real bearer key to an arbitrary scheme (javascript:/file:/data: pass zod's
 * .url()) or at cloud metadata (169.254.169.254 et al.). Loopback/private
 * hosts are allowed on purpose: local OpenAI-compatible gateways are a
 * legitimate deployment (review F3 — scheme+metadata guard, config-trust
 * hardening; the config remains operator-owned trust input).
 */
const LINK_LOCAL_PREFIXES = ['169.254.', 'fe80:', 'fe90:', 'fea0:', 'feb0:'];
const METADATA_HOSTS = new Set(['metadata.google.internal', 'metadata.goog']);

const BaseUrlSchema = z
  .string()
  .url()
  .superRefine((v, ctx) => {
    let u: URL;
    try {
      u = new URL(v);
    } catch {
      return; // zod's .url() already rejected it
    }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `baseUrl scheme must be http(s) — '${u.protocol}' is refused (fail fast, never retried)`,
      });
      return;
    }
    // IPv6 literals keep their brackets in URL.hostname — strip before matching.
    const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (METADATA_HOSTS.has(host) || LINK_LOCAL_PREFIXES.some((p) => host.startsWith(p))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `baseUrl host '${host}' is a link-local/metadata endpoint — refused (credential-exfiltration hardening)`,
      });
    }
  });

/**
 * Config header names: RFC 7230 token grammar, and NEVER authorization or
 * content-type — LCO forces those itself; a mixed-case config copy would
 * survive as a second key and corrupt the request (review F4).
 */
const HEADER_NAME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;
const HeaderNameSchema = z
  .string()
  .min(1)
  .regex(HEADER_NAME, 'header names must be RFC 7230 tokens')
  .refine(
    (n) => n.toLowerCase() !== 'authorization' && n.toLowerCase() !== 'content-type',
    "LCO sets authorization and content-type itself — they cannot be configured per provider",
  );

const ProviderTypeSchema = z.enum(PROVIDER_KINDS as [ProviderKind, ...ProviderKind[]]);

const OpenRouterRoutingSchema = z
  .object({
    /**
     * Allow-list of upstream provider slugs (OpenRouter provider.only —
     * restrictive in BOTH modes: a request that cannot be served inside the
     * list fails rather than routing outside it).
     */
    providerOnly: z.array(z.string().min(1)).min(1).optional(),
    /**
     * Preference ORDER of upstream provider slugs (OpenRouter provider.order
     * — tries in this order; in product mode fallbacks beyond the list stay
     * allowed, in evaluation mode the factory adds allow_fallbacks:false so
     * the list is exhaustive).
     */
    providerOrder: z.array(z.string().min(1)).min(1).optional(),
  })
  .strict();

const ProviderSchema = z
  .object({
    type: ProviderTypeSchema,
    /**
     * Required for generic openai-compatible providers (LCO never invents an
     * endpoint); optional override for openrouter/routellm (documented
     * defaults apply). http(s) only; link-local/metadata hosts refused.
     */
    baseUrl: BaseUrlSchema.optional(),
    apiKeyEnv: z.string().regex(ENV_NAME, 'apiKeyEnv must be an ENVIRONMENT VARIABLE NAME (A-Z, 0-9, _; never a key value)'),
    /** Extra static request headers (e.g. OpenRouter HTTP-Referer/X-Title).
     * Names are RFC 7230 tokens; authorization/content-type are refused. */
    headers: z.record(HeaderNameSchema, z.string()).optional(),
    /** Default per-call generation cap for this provider. */
    maxTokens: z.number().int().positive().optional(),
    /** Provider escape hatch merged last into the body (model/messages pinned). */
    extraBody: z.record(z.unknown()).optional(),
    /** OpenRouter upstream routing pins (used by evaluation-mode profiles). */
    routing: OpenRouterRoutingSchema.optional(),
  })
  .strict()
  .superRefine((p, ctx) => {
    // Generic providers must name their endpoint — fail at parse time, not
    // deep inside a run. openrouter/routellm get documented defaults.
    if (p.type === 'openai-compatible' && p.baseUrl === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['baseUrl'],
        message: 'an openai-compatible provider must declare baseUrl — LCO never defaults a generic endpoint',
      });
    }
  });

const RoleSchema = z
  .object({
    provider: z.string().min(1),
    model: z.string().min(1),
    maxTokens: z.number().int().positive().optional(),
    /** Provider-enforced JSON Schema output. 'required' is legal only on the
     * decomposed (v4) topology — the v3 prompt lineage stays byte-frozen. */
    structuredOutput: z.enum(['off', 'required']).optional(),
  })
  .strict();

const VariantSchema = z.enum(['single', 'council', 'renewal']);

const ProfileSchema = z
  .object({
    variant: VariantSchema,
    /** Renewal only: no topology (a single recovery role). */
    /** Council only: 'fused' (historical, default) or 'decomposed' (v4). */
    topology: z.enum(['fused', 'decomposed']).optional(),
    /** 'product' (default; fallbacks allowed) or 'evaluation' (reproducible). */
    routingMode: z.enum(['product', 'evaluation']).optional(),
    roles: z.record(z.string().min(1), RoleSchema),
  })
  .strict();

export const LlmConfigSchema = z
  .object({
    llm: z
      .object({
        providers: z.record(z.string().min(1), ProviderSchema).refine((p) => Object.keys(p).length > 0, {
          message: 'llm.providers must declare at least one provider',
        }),
        profiles: z.record(z.string().min(1), ProfileSchema).refine((p) => Object.keys(p).length > 0, {
          message: 'llm.profiles must declare at least one profile',
        }),
      })
      .strict(),
  })
  .strict();

export type LlmConfig = z.infer<typeof LlmConfigSchema>;

/** Parse result: the typed config or one actionable error string. */
export type ParseResult = { ok: true; config: LlmConfig } | { ok: false; error: string };

function zodIssues(err: z.ZodError): string {
  return err.issues
    .slice(0, 5)
    .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
    .join('; ');
}

/** Parse + validate a lco.config.json document (pure; text in, result out). */
export function parseLlmConfig(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `lco.config.json is not valid JSON (${msg})` };
  }
  const parsed = LlmConfigSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: `lco.config.json is invalid: ${zodIssues(parsed.error)}` };
  }
  return { ok: true, config: parsed.data };
}

/** One role's fully-resolved route (everything the adapter factories need). */
export interface ResolvedRole {
  gateway: string;
  providerKind: ProviderKind;
  baseUrl: string;
  apiKeyEnv: string;
  model: string;
  maxTokens?: number;
  headers?: Record<string, string>;
  extraBody?: Record<string, unknown>;
  structuredOutput: 'off' | 'required';
  providerOnly?: string[];
  providerOrder?: string[];
}

export interface ResolvedProfile {
  name: string;
  variant: 'single' | 'council' | 'renewal';
  /** Present only for council profiles ('fused' default). */
  topology?: CouncilTopology;
  routingMode: RoutingMode;
  roles: Partial<Record<LlmRole, ResolvedRole>>;
}

/** Role sets each variant/topology requires — exactly these, no more.
 * H-04: 'renewal' is a first-class variant — exactly the renew_recover role —
 * so named Renewal profiles are validated, resolvable config, not casts. */
const REQUIRED_ROLES: Record<string, readonly LlmRole[]> = {
  single: ['single'],
  renewal: ['renew_recover'],
  'council:fused': ['classifier', 'proposal_a', 'judge'],
  'council:decomposed': ['classifier', 'proposal_a', 'proposal_b', 'judge'],
};

/** Resolve one named profile against the config (pure; fail-closed). */
export function resolveProfile(
  config: LlmConfig,
  name: string,
): { ok: true; resolved: ResolvedProfile } | { ok: false; error: string } {
  const profile = config.llm.profiles[name];
  if (profile === undefined) {
    return {
      ok: false,
      error: `unknown llm profile '${name}' (configured: ${Object.keys(config.llm.profiles).join(', ') || 'none'})`,
    };
  }

  const topology: CouncilTopology | undefined =
    profile.variant === 'council' ? (profile.topology ?? 'fused') : undefined;
  const required =
    profile.variant === 'renewal'
      ? REQUIRED_ROLES.renewal!
      : REQUIRED_ROLES[profile.variant === 'single' ? 'single' : `council:${topology}`]!;

  const given = Object.keys(profile.roles).sort();
  const expected = [...required].sort();
  if (given.length !== expected.length || given.some((r, i) => r !== expected[i])) {
    return {
      ok: false,
      error:
        `profile '${name}' (${profile.variant}${topology ? `/${topology}` : ''}) requires exactly the ` +
        `roles [${expected.join(', ')}] — got [${given.join(', ') || 'none'}]`,
    };
  }

  const routingMode: RoutingMode = profile.routingMode ?? 'product';
  const roles: Partial<Record<LlmRole, ResolvedRole>> = {};
  for (const role of required) {
    const roleCfg = profile.roles[role]!;
    const provider = config.llm.providers[roleCfg.provider];
    if (provider === undefined) {
      return {
        ok: false,
        error:
          `profile '${name}' role '${role}' references unknown provider '${roleCfg.provider}' ` +
          `(configured: ${Object.keys(config.llm.providers).join(', ') || 'none'})`,
      };
    }

    // Generic providers must name their endpoint (enforced at parse time);
    // openrouter/routellm fall back to their documented defaults.
    const baseUrl =
      provider.baseUrl !== undefined
        ? provider.baseUrl
        : provider.type === 'openrouter'
          ? OPENROUTER_DEFAULT_BASE_URL
          : ROUTELLM_DEFAULT_BASE_URL;

    // §6: no gateway auto-router in reproducible profiles.
    if (routingMode === 'evaluation' && provider.type === 'routellm' && roleCfg.model === 'route-llm') {
      return {
        ok: false,
        error:
          `profile '${name}' is routingMode 'evaluation' but role '${role}' uses routellm model 'route-llm' ` +
          '(the smart auto-router): reproducible profiles require EXPLICIT model ids — run `lco models` to ' +
          'see the current RouteLLM catalogue',
      };
    }

    // §15: structured outputs only on the decomposed (v4) lineage — the v3
    // prompt bytes are frozen and their behavior must not silently change.
    const structuredOutput = roleCfg.structuredOutput ?? 'off';
    if (structuredOutput === 'required' && topology !== 'decomposed') {
      return {
        ok: false,
        error:
          `profile '${name}' sets structuredOutput 'required' outside the decomposed topology — ` +
          'provider-enforced structured output is only supported on the v4 decomposed council lineage',
      };
    }

    roles[role] = {
      gateway: roleCfg.provider,
      providerKind: provider.type,
      baseUrl,
      apiKeyEnv: provider.apiKeyEnv,
      model: roleCfg.model,
      ...(roleCfg.maxTokens !== undefined
        ? { maxTokens: roleCfg.maxTokens }
        : provider.maxTokens !== undefined
          ? { maxTokens: provider.maxTokens }
          : {}),
      ...(provider.headers !== undefined ? { headers: provider.headers } : {}),
      ...(provider.extraBody !== undefined ? { extraBody: provider.extraBody } : {}),
      structuredOutput,
      ...(provider.routing?.providerOnly !== undefined
        ? { providerOnly: provider.routing.providerOnly }
        : {}),
      ...(provider.routing?.providerOrder !== undefined
        ? { providerOrder: provider.routing.providerOrder }
        : {}),
    };
  }

  return {
    ok: true,
    resolved: {
      name,
      variant: profile.variant,
      ...(topology !== undefined ? { topology } : {}),
      routingMode,
      roles,
    },
  };
}
