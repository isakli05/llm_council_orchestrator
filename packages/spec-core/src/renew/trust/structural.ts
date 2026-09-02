import { createHash } from 'node:crypto';
import { parseGraphText } from '../intel/graph-reader';
import { TrustStructuralError } from './errors';

/**
 * Trust Kernel — StructuralIdentity.
 *
 * THE single authoritative acceptance boundary for Graphify-derived
 * structural state (third-audit S3-M-01, S3-L-03). Graphify remains an
 * EXTERNAL, pinned, replaceable subprocess (locked forensic decision — it
 * is never vendored into the kernel); this module consumes its OUTPUT and
 * decides, strictly and totally, what structural identity the rest of the
 * product may rely on.
 *
 * Strictness rules (each previously violated somewhere):
 *   - an absent, blank, non-JSON, non-object, or EMPTY `{}` manifest is a
 *     typed refusal — malformed state never becomes "empty healthy state";
 *   - a malformed ENTRY (scalar, missing/empty ast_hash) is equally fatal;
 *   - a graph.json with duplicate node ids or dangling links is invalid —
 *     id-keyed consumers are lossy on duplicates;
 *   - identity digests exist ONLY over strictly-parsed state. The old
 *     non-strict fallback (`digest of []` on parse failure) is DELETED:
 *     mid-call freshness used to compare against that fallback, which made
 *     correctness depend on the fallback HAPPENING to differ (S3-L-03).
 *
 * Totality (S3-M-01): the health vocabulary is a REQUIRED discriminant on
 * every result shape — a probe failure is 'probe_unavailable', never a
 * statusless success-shaped object; a healthy report always says 'healthy'.
 */

/** The manifest identity: sorted [path, ast_hash] pairs, volatile fields out. */
export interface ManifestIdentity {
  digest: `sha256:${string}`;
  entries: number;
}

export type GraphManifestParse =
  | { ok: true; identity: ManifestIdentity }
  | { ok: false; code: 'manifest_missing' | 'manifest_invalid'; message: string };

/**
 * Strict Graphify manifest acceptance (moved from snapshot.ts — one
 * implementation, kernel-owned). The manifest contract is
 * `{ <path>: { ast_hash: <non-empty string>, …volatile } }` with at least
 * one entry for any built graph.
 */
export function parseGraphManifestStrict(text: string | undefined): GraphManifestParse {
  if (text === undefined || text.trim() === '') {
    return {
      ok: false,
      code: 'manifest_missing',
      message: 'graphify-out/manifest.json is absent — the graph workspace is incomplete; rebuild it (lco renew refresh)',
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return {
      ok: false,
      code: 'manifest_invalid',
      message: `graphify-out/manifest.json is not valid JSON (${(e as Error).message}) — rebuild it (lco renew refresh)`,
    };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {
      ok: false,
      code: 'manifest_invalid',
      message: 'graphify-out/manifest.json is not an object mapping paths to entries — rebuild it (lco renew refresh)',
    };
  }
  const rawEntries = Object.entries(parsed as Record<string, unknown>);
  if (rawEntries.length === 0) {
    return {
      ok: false,
      code: 'manifest_invalid',
      message: 'graphify-out/manifest.json has no entries ({}) — a built graph always records at least one file; rebuild it (lco renew refresh)',
    };
  }
  const entries: [string, string][] = [];
  for (const [path, value] of rawEntries) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return {
        ok: false,
        code: 'manifest_invalid',
        message: `graphify-out/manifest.json entry for ${path} is not an object — the manifest contract is {path: {ast_hash: string}}; rebuild it (lco renew refresh)`,
      };
    }
    const astHash = (value as { ast_hash?: unknown }).ast_hash;
    if (typeof astHash !== 'string' || astHash === '') {
      return {
        ok: false,
        code: 'manifest_invalid',
        message: `graphify-out/manifest.json entry for ${path} has no non-empty string ast_hash — identity over a malformed entry is garbage; rebuild it (lco renew refresh)`,
      };
    }
    entries.push([path, astHash]);
  }
  entries.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return {
    ok: true,
    identity: {
      digest: `sha256:${createHash('sha256').update(JSON.stringify(entries), 'utf8').digest('hex')}`,
      entries: entries.length,
    },
  };
}

/**
 * The full structural identity of a graph workspace, or a typed refusal.
 * STRICT on BOTH inputs: the manifest must parse per
 * {@link parseGraphManifestStrict} and the graph.json text must parse per
 * the strict node-link validator (duplicate ids / dangling links refuse).
 * There is no fallback digest — a caller holding a refusal holds NO
 * identity, and comparing "unknown" against "recorded" can only block.
 */
export function structuralIdentity(args: {
  manifestText: string | undefined;
  graphText: string;
}): { ok: true; identity: StructuralIdentity } | { ok: false; code: string; message: string } {
  const manifest = parseGraphManifestStrict(args.manifestText);
  if (!manifest.ok) return manifest;
  const graph = parseGraphText(args.graphText);
  if (!graph.ok) return graph;
  return {
    ok: true,
    identity: {
      manifest_digest: manifest.identity.digest,
      manifest_entries: manifest.identity.entries,
      graph_digest: `sha256:${createHash('sha256').update(args.graphText, 'utf8').digest('hex')}`,
      node_count: graph.graph.nodes.length,
      edge_count: graph.graph.edges.length,
    },
  };
}

/** The trusted structural identity snapshot/state carry. */
export interface StructuralIdentity {
  manifest_digest: `sha256:${string}`;
  manifest_entries: number;
  graph_digest: `sha256:${string}`;
  node_count: number;
  edge_count: number;
}

/**
 * THROWING variant for callers inside trust flows that treat any malformed
 * structural state as a hard refusal (identity-bearing reads).
 */
export function requireStructuralIdentity(args: {
  manifestText: string | undefined;
  graphText: string;
  source?: string;
}): StructuralIdentity {
  const r = structuralIdentity(args);
  if (!r.ok) {
    throw new TrustStructuralError(r.code, `${args.source ? `${args.source}: ` : ''}${r.message}`);
  }
  return r.identity;
}

// --- Total graph health discriminant (S3-M-01) -----------------------------------------

/**
 * REQUIRED on every graph-health-shaped result. 'probe_unavailable' covers
 * probe/tool failures that are NOT a verdict about graph state (the third
 * audit found generic probe failures returning no status at all while
 * success shapes could render "healthy" with zero manifest entries).
 */
export type StructuralHealthState =
  | 'healthy'
  | 'missing'
  | 'malformed'
  | 'incompatible'
  | 'probe_unavailable';

/**
 * The total health result: `state` is required on BOTH arms. A failure
 * always says WHICH failure state it is; a success is always explicitly
 * 'healthy' — "ok with status undefined / zero entries" is unrepresentable.
 */
export type StructuralHealthResult =
  | {
      ok: true;
      state: 'healthy';
      provider_version: string;
      node_count: number;
      edge_count: number;
      languages: string[];
      communities: number;
      manifest_digest: string;
      manifest_entries: number;
      warnings: string[];
    }
  | {
      ok: false;
      state: Exclude<StructuralHealthState, 'healthy'>;
      code: string;
      message: string;
      stderr?: string;
      hint?: string;
    };
