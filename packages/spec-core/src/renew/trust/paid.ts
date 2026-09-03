import { createOpenAiCompatibleLlm } from '../../llm/openai-compatible';
import type { OpenAiCompatibleConfig } from '../../llm/openai-compatible';
import type { LlmAdapter } from '../../eval/llm/adapter';
import { createBudgetLedger, type BudgetLedger } from '../../eval/budget';
import { domainDigest } from './canonical';
import { TrustPaidError } from './errors';

/**
 * Trust Kernel — ResolvedPaidOperation (third-audit S3-C-03, S3-H-05,
 * S3-H-06, S3-H-07, S3-H-10).
 *
 * ONE immutable resolved route represents the EXACT paid operation that is
 * authorized, budgeted, serialized, sent, and accounted. Before this module:
 * consent digests bound NAMES (a profile name before the profile resolved;
 * only `LCO_LLM_MODEL` on the legacy route) while base URL, max tokens, and
 * arbitrary extra body resolved later or never; the recovery cap measured
 * the PROMPT STRING while the transport added the JSON envelope, model
 * field, and extra body around it (and the validation retry was uncapped);
 * and ledgers were doubled (transport charges + pipeline re-charges) or
 * disconnected (two instances; none for the legacy MCP adapter).
 *
 * The contract:
 *   1. RESOLVE FIRST — every effectual route field (gateway, base URL,
 *      model, max tokens, extra body, routing, budget envelope) resolves
 *      into an immutable route BEFORE consent is computed or transport is
 *      constructed. Consent digests the CANONICAL route (S3-H-07/H-10);
 *      nothing effectful may change after authorization without a new digest.
 *   2. ONE LEDGER, SINGLE CHARGE — the operation owns the single ledger; the
 *      transport charges each fetch exactly once (its pre-fetch charge);
 *      completion-level accounting charges ONLY when an adapter does not
 *      self-report attempts (`accountCompletionAttempts`). Double charging
 *      and disconnected ledgers are structurally gone.
 *   3. ACTUAL WIRE BYTES — the transport's single serialization point invokes
 *      the operation's hook with the exact request bytes; the cap is
 *      enforced THERE (initial call and every validation retry alike, since
 *      both go through complete()) and a refusal means ZERO transport calls.
 *      The measured byte count is recorded for usage accounting.
 *
 * Secrets: the API key VALUE never enters the route, its digest, or any
 * record — only the env-var NAME is captured for diagnosis.
 */

/** The immutable effectual route of one paid operation (secret-free). */
export interface ResolvedPaidRoute {
  origin: 'named-profile' | 'legacy-env';
  /** Display lineage only — NEVER a consent input by itself. */
  profileName?: string;
  gateway: string;
  baseUrl: string;
  model: string;
  maxTokens?: number;
  extraBody?: Record<string, unknown>;
  routingMode: string;
  /** Env var NAME the key was read from (diagnosis only). */
  apiKeyEnvName: string;
  /** The budget envelope bound at resolution. */
  budget: { maxAttempts: number; wallMs?: number };
}

/**
 * Resolve the LEGACY-ENV route (S3-H-07): base URL, model, max tokens, and
 * extra body ALL resolve here — historically only the model reached the
 * consent digest while the rest resolved inside the adapter afterwards.
 */
export function resolveLegacyEnvRoute(env: NodeJS.ProcessEnv, defaults: { maxAttempts: number; wallMs?: number }): ResolvedPaidRoute {
  const baseUrl = env.LCO_LLM_BASE_URL;
  const model = env.LCO_LLM_MODEL;
  if (baseUrl === undefined || baseUrl === '' || model === undefined || model === '') {
    throw new TrustPaidError(
      'route_unresolved',
      'legacy LLM route is not configured: LCO_LLM_BASE_URL and LCO_LLM_MODEL must both be set (fail-closed; no default endpoint)',
    );
  }
  let maxTokens: number | undefined;
  const rawMax = env.LCO_LLM_MAX_TOKENS;
  if (rawMax !== undefined && rawMax !== '') {
    const n = Number.parseInt(rawMax, 10);
    if (!Number.isFinite(n) || n <= 0) {
      throw new TrustPaidError('route_unresolved', `LCO_LLM_MAX_TOKENS is not a positive integer (${rawMax})`);
    }
    maxTokens = n;
  }
  let extraBody: Record<string, unknown> | undefined;
  const rawExtra = env.LCO_LLM_EXTRA_BODY;
  if (rawExtra !== undefined && rawExtra !== '') {
    try {
      const parsed = JSON.parse(rawExtra);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        extraBody = parsed as Record<string, unknown>;
      } else {
        throw new TrustPaidError('route_unresolved', 'LCO_LLM_EXTRA_BODY must be a JSON object');
      }
    } catch (err) {
      if (err instanceof TrustPaidError) throw err;
      throw new TrustPaidError('route_unresolved', `LCO_LLM_EXTRA_BODY is not valid JSON (${(err as Error).message})`);
    }
  }
  return deepFreezeRoute({
    origin: 'legacy-env',
    gateway: 'legacy-env',
    baseUrl,
    model,
    ...(maxTokens !== undefined ? { maxTokens } : {}),
    ...(extraBody !== undefined ? { extraBody } : {}),
    routingMode: 'single',
    apiKeyEnvName: 'LCO_LLM_API_KEY',
    budget: { maxAttempts: defaults.maxAttempts, ...(defaults.wallMs !== undefined ? { wallMs: defaults.wallMs } : {}) },
  });
}

/**
 * Resolve a named-profile route from an already-built transport config (the
 * config builders in llm/providers.ts are pure env+role → config functions;
 * the kernel reads the ROUTE FACTS out of the resolved config — resolution
 * happens once, here, before consent or adapter construction).
 */
export function routeFromConfig(args: {
  config: OpenAiCompatibleConfig;
  origin: 'named-profile' | 'legacy-env';
  profileName?: string;
  routingMode: string;
  apiKeyEnvName: string;
  budget: { maxAttempts: number; wallMs?: number };
}): ResolvedPaidRoute {
  // S4-H-03: DEEP-clone everything — the caller keeps its original objects
  // and any later mutation of them must not be able to reach this value.
  return deepFreezeRoute({
    origin: args.origin,
    ...(args.profileName !== undefined ? { profileName: args.profileName } : {}),
    gateway: args.config.gateway,
    baseUrl: args.config.baseUrl,
    model: args.config.model,
    ...(args.config.maxTokens !== undefined ? { maxTokens: args.config.maxTokens } : {}),
    ...(args.config.extraBody !== undefined ? { extraBody: structuredClone(args.config.extraBody) } : {}),
    routingMode: args.routingMode,
    apiKeyEnvName: args.apiKeyEnvName,
    budget: { maxAttempts: args.budget.maxAttempts, ...(args.budget.wallMs !== undefined ? { wallMs: args.budget.wallMs } : {}) },
  });
}

/** Deep-clone then deep-freeze a route value (S4-H-03: callers keep mutable
 *  originals; the ROUTE is the kernel's own immutable snapshot). */
function deepFreezeRoute(route: ResolvedPaidRoute): ResolvedPaidRoute {
  const clone = structuredClone(route) as ResolvedPaidRoute;
  return deepFreeze(clone) as ResolvedPaidRoute;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

/**
 * The canonical consent digest of a resolved route — domain-separated and
 * version-tagged; two profiles that share a NAME but resolve different
 * routes produce different digests, and a route field that changes after
 * authorization changes the digest (S3-H-07/H-10).
 */
/** Own-property read (V3 re-verifier residual): optional route fields must
 *  be the route's OWN values — never prototype-injected phantoms. */
function ownField<T>(holder: object, key: string): T | undefined {
  return Object.hasOwn(holder, key) ? (holder as Record<string, unknown>)[key] as T | undefined : undefined;
}

export function resolvedRouteDigest(route: ResolvedPaidRoute): `sha256:${string}` {
  return domainDigest('LCO:CONSENT', 1, {
    origin: route.origin,
    gateway: route.gateway,
    baseUrl: route.baseUrl,
    model: route.model,
    maxTokens: ownField<number>(route, 'maxTokens') ?? null,
    extraBody: ownField<Record<string, unknown>>(route, 'extraBody') ?? null,
    routingMode: route.routingMode,
    budget: route.budget,
  });
}

/** The recovery boundary's wire cap: over the SERIALIZED REQUEST bytes. */
export const MAX_RECOVERY_WIRE_BYTES = 1_000_000;

/** What one paid operation exposes for accounting and consent lineage. */
export interface PaidOperation {
  readonly route: ResolvedPaidRoute;
  readonly routeDigest: `sha256:${string}`;
  /** THE one ledger for this operation (transport + completion accounting). */
  readonly ledger: BudgetLedger;
  /** The transport adapter (wire-measured, capped). */
  readonly adapter: LlmAdapter;
  /** Bytes of the most recent serialized request (set per complete() call). */
  lastWireBytes(): number | undefined;
}

/**
 * THE paid-operation constructor (S4-H-03 closure). The caller's route input
 * is DEEP-CLONED into the operation's own frozen internal snapshot — caller
 * mutation of any original object (extraBody, routing, gateway, budget, ...)
 * can never reach the transported state. The LEDGER IS DERIVED from the
 * frozen route's budget inside this constructor (an externally supplied,
 * differently-budgeted ledger is unrepresentable — the API takes none). The
 * digest is computed from the exact frozen value the transport consumes.
 * `wireByteCap` undefined = measuring only (non-renewal consumers keep their
 * documented envelope policy); every renewal paid path passes a cap.
 */
export function createPaidOperation(args: {
  route: ResolvedPaidRoute;
  apiKey: string;
  wireByteCap?: number;
  fetchImpl?: typeof fetch;
  nowMs?: () => number;
}): PaidOperation {
  const route = deepFreezeRoute(args.route);
  const ledger = createBudgetLedger(
    {
      maxAttempts: route.budget.maxAttempts,
      ...(route.budget.wallMs !== undefined ? { maxWallMs: route.budget.wallMs } : {}),
    },
    { nowMs: args.nowMs ?? (() => Date.now()) },
  );
  let lastWireBytes: number | undefined;
  const label = `${route.gateway}/${route.model}`;
  // S4-H-03 (V3 verifier): the transport consumes a PRIVATE second clone of
  // the frozen route — never the shared op.route object. deepFreeze cannot
  // pin exotic internal slots (e.g. a Date's [[DateValue]]), so a consumer
  // mutating op.route's internals must not be able to reach the wire; the
  // transported state stays pinned to construction time = digest time.
  // Optional fields are materialized as OWN properties (undefined when
  // absent) so prototype-chain lookups at complete() time cannot inject
  // extraBody/maxTokens/extraHeaders/fetch/cost behavior.
  const wireRoute = structuredClone(route);
  const adapter = createOpenAiCompatibleLlm({
    gateway: wireRoute.gateway,
    providerKind: 'openai-compatible',
    baseUrl: wireRoute.baseUrl,
    apiKey: args.apiKey,
    model: wireRoute.model,
    // V3 re-verifier residual (a): own-property reads only — a prototype-
    // injected phantom cannot reach the wire or the digest.
    maxTokens: Object.hasOwn(wireRoute, 'maxTokens') ? wireRoute.maxTokens : undefined,
    extraBody: Object.hasOwn(wireRoute, 'extraBody') ? wireRoute.extraBody : undefined,
    extraHeaders: undefined,
    costExtractor: undefined,
    budget: ledger,
    fetchImpl: args.fetchImpl,
    nowMs: args.nowMs,
    onSerializedWire: (requestBody: string) => {
      const bytes = Buffer.byteLength(requestBody, 'utf8');
      lastWireBytes = bytes;
      if (args.wireByteCap !== undefined && bytes > args.wireByteCap) {
        throw new TrustPaidError(
          'request_over_budget',
          `serialized ${label} request is ${bytes} bytes, over the ${args.wireByteCap}-byte wire cap — ` +
            `refused BEFORE transport (zero paid calls); shrink the analysis scope`,
        );
      }
    },
  });
  return {
    route,
    routeDigest: resolvedRouteDigest(route),
    ledger,
    adapter,
    lastWireBytes: () => lastWireBytes,
  };
}

/**
 * The single-charge completion accounting contract (S3-H-06): the transport
 * charges every fetch it makes; completion-level accounting charges ONLY
 * when the adapter did not self-report attempts. Calling this instead of an
 * unconditional charge removes the double-charge class entirely.
 */
export function accountCompletionAttempts(ledger: BudgetLedger | undefined, res: { attempts?: number }): void {
  if (res.attempts === undefined) ledger?.chargeAttempts(1);
}
