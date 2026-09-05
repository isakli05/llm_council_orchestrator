import { setDefaultResultOrder } from 'node:dns';
import type { LlmAdapter, LlmCompleteOptions, LlmResponse } from '../eval/llm/adapter';
import type { BudgetLedger } from '../eval/budget';
import type { LlmProvenance, LlmUsageDetails, ProviderKind } from './provider';

// TRANSPORT (2026-08-28, carried over from the legacy adapter): force
// IPv4-first DNS ordering for this process. The live endpoint's zone carries
// AAAA records that are UNREACHABLE from the owner's network (instant
// ENETUNREACH); IPv4-first makes the healthy A records always precede them.
// Pure transport: no rubric, prompt, or scoring surface.
setDefaultResultOrder('ipv4first');

/**
 * The ONE reusable OpenAI-compatible chat/completions transport (multi-
 * provider architecture, 2026-08-30): every gateway LCO speaks — the legacy
 * `LCO_LLM_*` path, OpenRouter, Abacus RouteLLM, any generic OpenAI-compatible
 * endpoint — goes through THIS code. No vendor SDKs.
 *
 * It is the parameterized evolution of the former eval/llm/http.ts adapter;
 * that module remains as the fail-closed legacy-env wrapper over this one, so
 * its tested contract (error strings, retry policy, budget accounting) is
 * preserved verbatim here:
 *
 *  - transport failures (fetch errors) and transient statuses (429, 5xx) are
 *    retried up to `maxAttempts` (default HTTP_MAX_ATTEMPTS_PER_COMPLETION=8)
 *    with the default 2/5/15/30/60/120/240s backoff and a per-request
 *    `timeoutMs` (default 600s — live reasoning models legitimately hold
 *    non-streaming completions open for minutes);
 *  - non-retryable 4xx fails immediately (auth/protocol errors are never
 *    hammered); a 2xx with unparseable/missing payload fails closed WITHOUT
 *    retry (malformed success is a protocol bug, not a blip);
 *  - with a BudgetLedger: every HTTP attempt charges the ledger BEFORE the
 *    request is issued (a capped run never sends the next fetch) and the wall
 *    deadline is re-checked between attempts;
 *  - `attempts` on the response self-reports the true transport cost.
 *
 * Additions over the legacy adapter (all optional, backward compatible):
 *  - `extraHeaders` ride along but can NEVER override `authorization` or
 *    `content-type` (credential integrity);
 *  - `extraBody` merges LAST — except `model` and `messages`, which LCO pins:
 *    provider-specific knobs (thinking toggles, routing objects,
 *    response_format) pass through, but no body extra can silently substitute
 *    the model LCO configured (provenance/reproducibility);
 *  - response provenance is extracted permissively (id / model /
 *    openrouter_metadata selected endpoint / legacy provider.name — only when
 *    present and well-typed; ABSENT MEANS UNKNOWN, never blank or zero);
 *  - usage details (reasoning/cache tokens) and provider-reported cost (via
 *    `costExtractor`) are surfaced when reported;
 *  - `latencyMs` measures the whole complete() wall time (retries included)
 *    with the injected/real clock.
 */

/** Total HTTP attempts one complete() may make (transport retry ceiling). */
export const HTTP_MAX_ATTEMPTS_PER_COMPLETION = 8;
export const HTTP_BACKOFF_SCHEDULE_MS = [2_000, 5_000, 15_000, 30_000, 60_000, 120_000, 240_000] as const;
/** Per-request timeout (every attempt gets its own). */
export const HTTP_REQUEST_TIMEOUT_MS = 600_000;
/** Total backoff sleep between the 8 attempts of one exhausted completion. */
export const HTTP_BACKOFF_TOTAL_MS = HTTP_BACKOFF_SCHEDULE_MS.reduce((a, b) => a + b, 0);

/** Extracts a provider-reported cost from the raw usage object, if reported. */
export type CostExtractor = (usage: unknown) => { amount: number; currency: string } | undefined;

export interface OpenAiCompatibleConfig {
  /** Gateway NAME for provenance (config key, or 'legacy-env' for the LCO_LLM_* path). */
  gateway: string;
  providerKind: ProviderKind;
  /** Endpoint base; `/chat/completions` is appended unless already present. */
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Default per-call generation cap (call-site opts win). */
  maxTokens?: number;
  /** Merged last into the request body — except model/messages, which are pinned. */
  extraBody?: Record<string, unknown>;
  /** Extra request headers; authorization/content-type are always forced. */
  extraHeaders?: Record<string, string>;
  /** Run budget: charged per attempt before issue; wall checked between attempts. */
  budget?: BudgetLedger;
  /** Fetch implementation (tests inject fakes); default: the global fetch at call time. */
  fetchImpl?: typeof fetch;
  /** Clock for latency + wall checks; default Date.now. */
  nowMs?: () => number;
  timeoutMs?: number;
  maxAttempts?: number;
  backoffMs?: readonly number[];
  /** Provider-reported cost extraction (OpenRouter usage.cost → credits). */
  costExtractor?: CostExtractor;
  /**
   * TRUST KERNEL (S3-H-05): invoked ONCE per complete() call, immediately
   * after the request object is serialized and BEFORE any fetch — the one
   * place the EXACT wire bytes exist before transport. A throw aborts the
   * completion with ZERO transport calls (over-budget refusals happen here,
   * before a single byte is paid for). Adapters constructed by
   * renew/trust/paid.ts install the measuring/capping hook; a bare adapter
   * without one is a consumer the architecture tests forbid on renewal
   * paths.
   */
  onSerializedWire?: (requestBody: string) => void;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Minimal permissive shape of an OpenAI-compatible response (unknown-narrowed on read). */
interface ChatResponse {
  choices?: { message?: { content?: unknown } }[];
  usage?: {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    prompt_tokens_details?: { cached_tokens?: unknown; cache_write_tokens?: unknown };
    completion_tokens_details?: { reasoning_tokens?: unknown };
  };
  id?: unknown;
  model?: unknown;
  provider?: { name?: unknown };
  openrouter_metadata?: {
    attempt?: unknown;
    endpoints?: { available?: unknown };
  };
}

/** Provenance as reported by THIS response — absent fields stay absent. */
function extractProvenance(config: OpenAiCompatibleConfig, data: ChatResponse): LlmProvenance {
  const provenance: LlmProvenance = {
    gateway: config.gateway,
    providerKind: config.providerKind,
    requestedModel: config.model,
  };
  if (Object.hasOwn(data, 'id') && typeof data.id === 'string' && data.id !== '') provenance.requestId = data.id;
  if (Object.hasOwn(data, 'model') && typeof data.model === 'string' && data.model !== '') provenance.resolvedModel = data.model;

  // OpenRouter router metadata (opt-in header set by the openrouter factory):
  // permissive decode, unknown fields ignored by design.
  const meta = Object.hasOwn(data, 'openrouter_metadata') ? data.openrouter_metadata : undefined;
  if (isPlainObject(meta)) {
    if (typeof meta.attempt === 'number') provenance.fallbackObserved = meta.attempt > 1;
    const available = isPlainObject(meta.endpoints) ? meta.endpoints.available : undefined;
    if (Array.isArray(available)) {
      const selected = available.find(
        (e) => isPlainObject(e) && e.selected === true && typeof e.provider === 'string',
      ) as { provider: string } | undefined;
      if (selected !== undefined) provenance.upstreamProvider = selected.provider;
    }
  }
  // Compatible fallback: some OpenAI-compatible gateways report a top-level
  // provider object. Only read when openrouter_metadata did not answer.
  if (provenance.upstreamProvider === undefined && Object.hasOwn(data, 'provider') && isPlainObject(data.provider)) {
    const name = data.provider.name;
    if (typeof name === 'string' && name !== '') provenance.upstreamProvider = name;
  }
  return provenance;
}

function extractUsageDetails(data: ChatResponse): LlmUsageDetails | undefined {
  const u = Object.hasOwn(data, 'usage') ? data.usage : undefined;
  if (!isPlainObject(u)) return undefined;
  const details: LlmUsageDetails = {};
  const read = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);
  const reasoning = read((u.completion_tokens_details as { reasoning_tokens?: unknown } | undefined)?.reasoning_tokens);
  const cached = read((u.prompt_tokens_details as { cached_tokens?: unknown } | undefined)?.cached_tokens);
  const cacheWrite = read((u.prompt_tokens_details as { cache_write_tokens?: unknown } | undefined)?.cache_write_tokens);
  if (reasoning !== undefined) details.reasoningTokens = reasoning;
  if (cached !== undefined) details.cacheReadTokens = cached;
  if (cacheWrite !== undefined) details.cacheWriteTokens = cacheWrite;
  return Object.keys(details).length > 0 ? details : undefined;
}

export function createOpenAiCompatibleLlm(config: OpenAiCompatibleConfig): LlmAdapter {
  const maxAttempts = config.maxAttempts ?? HTTP_MAX_ATTEMPTS_PER_COMPLETION;
  const backoffMs = config.backoffMs ?? HTTP_BACKOFF_SCHEDULE_MS;
  const requestTimeoutMs = config.timeoutMs ?? HTTP_REQUEST_TIMEOUT_MS;
  const now = config.nowMs ?? (() => Date.now());

  // Endpoint join: accept a base that already carries /chat/completions,
  // otherwise append it to the base (trailing slashes stripped).
  const endpoint = config.baseUrl.endsWith('/chat/completions')
    ? config.baseUrl
    : `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;

  return {
    async complete(prompt: string, opts?: LlmCompleteOptions): Promise<LlmResponse> {
      // Body assembly precedence (explicit, single occurrence per key):
      //   extraBody first (provider escape hatch), then model/messages are
      //   pinned OVER it (no body extra can silently substitute the
      //   configured model or rewrite the conversation), then max_tokens
      //   (call-site opts > config default > extraBody's, if any).
      const body: Record<string, unknown> = {
        ...(config.extraBody ?? {}),
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
      };
      if (opts?.max_tokens !== undefined) body.max_tokens = opts.max_tokens;
      else if (config.maxTokens !== undefined) body.max_tokens = config.maxTokens;
      const requestBody = JSON.stringify(body);
      // TRUST KERNEL: measure/cap the ACTUAL serialized request (envelope,
      // model, messages, extra body included) before any transport attempt.
      config.onSerializedWire?.(requestBody);

      const startedAt = now();
      let lastError: Error | undefined;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        // UX-001: every HTTP request charges the run budget BEFORE it is
        // issued, and the wall deadline is re-checked between attempts.
        config.budget?.chargeAttempts(1);
        config.budget?.checkWall();

        if (attempt > 1) await sleep(backoffMs[Math.min(attempt - 2, backoffMs.length - 1)]);

        const attemptStart = now();
        const doFetch = config.fetchImpl ?? fetch;
        let res: Response;
        try {
          res = await doFetch(endpoint, {
            method: 'POST',
            headers: {
              ...(config.extraHeaders ?? {}),
              'content-type': 'application/json',
              authorization: `Bearer ${config.apiKey}`,
            },
            body: requestBody,
            signal: AbortSignal.timeout(requestTimeoutMs),
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          // TRANSPORT DIAGNOSTIC: surface the syscall cause; no secrets —
          // codes and timings only.
          const cause = (err as { cause?: { code?: string; message?: string } }).cause;
          const causePart = cause
            ? ` [cause: ${cause.code ?? 'unknown'}${cause.message ? ` ${cause.message.slice(0, 80)}` : ''}]`
            : '';
          lastError = new Error(`LLM HTTP request to ${endpoint} failed: ${msg}${causePart}`);
          console.error(
            `[live-transport] attempt ${attempt}/${maxAttempts} failed after ${now() - attemptStart}ms: ${err instanceof Error ? err.name : typeof err}: ${msg}${causePart}`,
          );
          continue; // transport error → retry
        }

        if (res.ok) {
          return parseSuccess(res, attempt, startedAt);
        }

        const body = await res.text().catch(() => '');
        const excerpt = body.slice(0, 300);
        const httpError = new Error(`LLM HTTP ${res.status} ${res.statusText}: ${excerpt}`);
        if (isRetryableStatus(res.status)) {
          lastError = httpError;
          continue;
        }
        throw httpError; // non-retryable 4xx → fail fast
      }

      throw new Error(`${lastError?.message ?? 'LLM HTTP request failed'} (after ${maxAttempts} attempts)`);
    },
  };

  async function parseSuccess(
    res: Response,
    attemptsUsed: number,
    startedAt: number,
  ): Promise<LlmResponse> {
    let data: ChatResponse;
    try {
      data = (await res.json()) as ChatResponse;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`LLM HTTP ${res.status} response was not JSON: ${msg}`);
    }

    // V3 re-verifier residual (b): response fields are read as OWN
    // properties only — prototype-injected phantoms cannot forge completions,
    // usage accounting, or provenance.
    const choices = Object.hasOwn(data, 'choices') ? data.choices : undefined;
    const text = choices?.[0]?.message?.content;
    if (typeof text !== 'string') {
      throw new Error(
        'LLM HTTP response missing choices[0].message.content (fail-closed; refusing to invent output)',
      );
    }

    const u = Object.hasOwn(data, 'usage') ? data.usage : undefined;
    const usage =
      typeof u?.prompt_tokens === 'number' && typeof u?.completion_tokens === 'number'
        ? { in_tokens: u.prompt_tokens, out_tokens: u.completion_tokens }
        : undefined;

    const provenance = extractProvenance(config, data);
    const cost = usage !== undefined ? config.costExtractor?.(data.usage) : undefined;
    if (cost !== undefined) provenance.cost = cost;

    // UX-001: the completion reports its true transport cost; PERF/§13: the
    // transport measures its own wall latency (cores stay clock-free).
    return {
      text,
      usage,
      attempts: attemptsUsed,
      provenance,
      ...(extractUsageDetails(data) !== undefined ? { usageDetails: extractUsageDetails(data) } : {}),
      latencyMs: now() - startedAt,
    };
  }
}
