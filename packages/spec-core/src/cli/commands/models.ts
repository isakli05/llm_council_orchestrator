import { parseLlmConfig } from '../../config/llm-config';
import { OPENROUTER_DEFAULT_BASE_URL, ROUTELLM_DEFAULT_BASE_URL } from '../../llm/provider';

/**
 * `lco models` — lightweight provider catalog discovery (owner spec §16):
 * lists available models WITHOUT performing any paid inference. One GET to
 * the provider's models endpoint, single attempt, short timeout, no retries,
 * no completions. The catalogue changes; this command is how users find the
 * EXACT current API ids (display names are never API ids — §6).
 *
 * Cost honesty: pricing shown is whatever the endpoint reports, per-token;
 * absent fields render `Unknown` (never 0, never guessed). Nothing here is
 * hardcoded into the compiler — no model allowlists, no price tables.
 */

/** Response size sanity ceiling: catalogues are large but bounded (OpenRouter
 * ~0.6 MB at 396 models on 2026-08-30); 8 MB is a hostile-input guard. */
export const MAX_CATALOG_BYTES = 8 * 1024 * 1024;

export const MODELS_REQUEST_TIMEOUT_MS = 10_000;

/** One normalized catalog row — only fields the endpoint actually reported. */
export interface ModelCatalogEntry {
  id: string;
  name?: string;
  contextLength?: number;
  /** Per-token prices as reported (strings in OpenRouter's catalog). */
  pricingPrompt?: string;
  pricingCompletion?: string;
  supportedParameters?: string[];
}

export interface ModelsOptions {
  /** Provider name from lco.config.json (mutually exclusive with builtin). */
  providerName?: string;
  /** Built-in provider: 'openrouter' | 'routellm' (no config needed). */
  builtin?: 'openrouter' | 'routellm';
  /** Config file text (the boundary reads the file; pure core stays IO-free). */
  configText?: string;
  env: NodeJS.ProcessEnv;
  limit?: number;
  fetchImpl?: typeof fetch;
}

export interface ModelsResult {
  code: number;
  output: string;
  /** Machine-readable rows (also embedded in --json output by the wrapper). */
  entries?: ModelCatalogEntry[];
}

/** Built-in provider definitions (documented conventions; keys by env NAME). */
const BUILTIN_PROVIDERS = {
  openrouter: {
    baseUrl: OPENROUTER_DEFAULT_BASE_URL,
    apiKeyEnv: 'OPENROUTER_API_KEY',
    label: 'openrouter (builtin)',
  },
  routellm: {
    baseUrl: ROUTELLM_DEFAULT_BASE_URL,
    apiKeyEnv: 'ABACUS_ROUTELLM_API_KEY',
    label: 'routellm (builtin)',
  },
} as const;

function fmt(v: string | number | undefined): string {
  return v !== undefined ? String(v) : 'Unknown';
}

/** Parse a /models response permissively (data[] or a bare array; unknown fields ignored). */
export function parseCatalog(payload: unknown): ModelCatalogEntry[] {
  const container = payload as { data?: unknown } | unknown[] | null;
  const list = Array.isArray(container)
    ? container
    : container !== null && typeof container === 'object' && Array.isArray((container as { data?: unknown }).data)
      ? ((container as { data: unknown[] }).data)
      : undefined;
  if (list === undefined) return [];
  const out: ModelCatalogEntry[] = [];
  for (const raw of list) {
    if (typeof raw !== 'object' || raw === null) continue;
    const m = raw as Record<string, unknown>;
    if (typeof m.id !== 'string' || m.id === '') continue;
    const pricing =
      typeof m.pricing === 'object' && m.pricing !== null ? (m.pricing as Record<string, unknown>) : undefined;
    const entry: ModelCatalogEntry = { id: m.id };
    if (typeof m.name === 'string') entry.name = m.name;
    if (typeof m.context_length === 'number') entry.contextLength = m.context_length;
    if (pricing !== undefined && typeof pricing.prompt === 'string') entry.pricingPrompt = pricing.prompt;
    if (pricing !== undefined && typeof pricing.completion === 'string') entry.pricingCompletion = pricing.completion;
    if (Array.isArray(m.supported_parameters)) {
      const params = m.supported_parameters.filter((p): p is string => typeof p === 'string');
      if (params.length > 0) entry.supportedParameters = params;
    }
    out.push(entry);
  }
  return out;
}

/**
 * The models command core. Pure except the single fetch (fetchImpl injected
 * by tests; the boundary passes nothing → global fetch). Errors are exit-2
 * messages naming the variable/endpoint — never key values.
 */
export async function cmdModels(opts: ModelsOptions): Promise<ModelsResult> {
  // Resolve the provider definition: builtin shorthand or named config provider.
  let baseUrl: string;
  let apiKeyEnv: string;
  let label: string;
  if (opts.builtin !== undefined) {
    const b = BUILTIN_PROVIDERS[opts.builtin];
    baseUrl = b.baseUrl;
    apiKeyEnv = b.apiKeyEnv;
    label = b.label;
  } else if (opts.providerName !== undefined) {
    if (opts.configText === undefined) {
      return { code: 2, output: `--provider ${opts.providerName} needs lco.config.json (pass --config <path> or run from the project dir)` };
    }
    const parsed = parseLlmConfig(opts.configText);
    if (!parsed.ok) return { code: 2, output: parsed.error };
    const provider = parsed.config.llm.providers[opts.providerName];
    if (provider === undefined) {
      return {
        code: 2,
        output: `unknown provider '${opts.providerName}' (configured: ${Object.keys(parsed.config.llm.providers).join(', ') || 'none'})`,
      };
    }
    baseUrl =
      provider.baseUrl !== undefined
        ? provider.baseUrl
        : provider.type === 'openrouter'
          ? OPENROUTER_DEFAULT_BASE_URL
          : ROUTELLM_DEFAULT_BASE_URL;
    apiKeyEnv = provider.apiKeyEnv;
    label = `${opts.providerName} (${provider.type})`;
  } else {
    return { code: 2, output: 'pass --provider <name> (from lco.config.json) or --provider openrouter|routellm (built-in)' };
  }

  const apiKey = opts.env[apiKeyEnv]?.trim();
  if (apiKey === undefined || apiKey === '') {
    return {
      code: 2,
      output: `models listing for ${label} needs ${apiKeyEnv} — set the environment variable and retry (no request was made)`,
    };
  }

  const doFetch = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(`${baseUrl.replace(/\/+$/, '')}/models`, {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(MODELS_REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { code: 2, output: `models request to ${baseUrl}/models failed: ${msg} (single attempt, no retry)` };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return { code: 2, output: `models request returned HTTP ${res.status}: ${body.slice(0, 200)}` };
  }
  const raw = await res.text();
  if (raw.length > MAX_CATALOG_BYTES) {
    return { code: 2, output: `models catalog exceeds the ${MAX_CATALOG_BYTES}-byte sanity ceiling — refusing to parse` };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { code: 2, output: `models catalog is not valid JSON: ${msg}` };
  }
  const entries = parseCatalog(payload);
  if (entries.length === 0) {
    return { code: 2, output: 'models catalog carried no recognizable entries (expected {data:[{id,…}]})' };
  }

  const shown = opts.limit !== undefined ? entries.slice(0, opts.limit) : entries;
  const lines = [
    `${label}: ${entries.length} model(s)${opts.limit !== undefined ? ` (showing ${shown.length})` : ''} — per-token pricing as reported; Unknown = not reported (never 0)`,
    ...shown.map(
      (m) =>
        `  ${m.id}${m.name !== undefined ? ` — ${m.name}` : ''} | prompt ${fmt(m.pricingPrompt)} / completion ${fmt(m.pricingCompletion)} | context ${fmt(m.contextLength)}`,
    ),
  ];
  return { code: 0, output: lines.join('\n'), entries };
}
