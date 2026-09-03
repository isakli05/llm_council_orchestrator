import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { parseGraphText } from '../intel/graph-reader';
import { authorizedWrite } from './fs';
import { domainDigest } from './canonical';
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
  /** When supplied, the pair must ALSO be the binding's pair (S4-H-04). */
  bindingText?: string;
  /** Optional identity joins the caller requires. */
  expected?: { graphifyVersion?: string; manifestDigest?: string; graphDigest?: string };
}): { ok: true; identity: StructuralIdentity } | { ok: false; code: string; message: string } {
  const manifest = parseGraphManifestStrict(args.manifestText);
  if (!manifest.ok) return manifest;
  const graph = parseGraphText(args.graphText);
  if (!graph.ok) return graph;
  // S4-H-04 — SOURCE-SET COHERENCE: every graph node's source_file must be a
  // manifest key with a recorded ast_hash. Graphify's real semantic: the
  // graph may reference only sources the manifest recorded for THIS build.
  // Separately-valid-but-different documents are no longer enough.
  const manifestKeys = new Set(Object.keys(JSON.parse(args.manifestText!) as Record<string, unknown>));
  for (const n of graph.graph.nodes) {
    if (n.source_file === undefined) continue;
    if (!manifestKeys.has(n.source_file)) {
      return {
        ok: false,
        code: 'coherence_failed',
        message:
          `the graph references source file '${n.source_file}' which the manifest does not record — ` +
          `the manifest and graph are from DIFFERENT builds; rebuild the workspace (lco renew refresh)`,
      };
    }
  }
  const graphDigest = `sha256:${createHash('sha256').update(args.graphText, 'utf8').digest('hex')}` as `sha256:${string}`;
  if (args.bindingText !== undefined) {
    const binding = coerceStructuralBinding(args.bindingText);
    if (!binding.ok) return binding;
    if (binding.binding.manifest_digest !== manifest.identity.digest || binding.binding.graph_digest !== graphDigest) {
      return {
        ok: false,
        code: 'coherence_failed',
        message:
          `the manifest/graph pair does not match the workspace's structural binding (binding: manifest ` +
          `${binding.binding.manifest_digest.slice(0, 19)}…/graph ${binding.binding.graph_digest.slice(0, 19)}…; ` +
          `artifacts differ) — the documents are from different builds; rebuild the workspace (lco renew refresh)`,
      };
    }
    if (binding.binding.source_set_digest !== sourceSetDigest(args.graphText)) {
      return {
        ok: false,
        code: 'coherence_failed',
        message: 'the graph source set does not match the structural binding — rebuild the workspace (lco renew refresh)',
      };
    }
  }
  if (args.expected?.manifestDigest !== undefined && args.expected.manifestDigest !== manifest.identity.digest) {
    return { ok: false, code: 'coherence_failed', message: 'the manifest digest differs from the expected structural identity' };
  }
  if (args.expected?.graphDigest !== undefined && args.expected.graphDigest !== graphDigest) {
    return { ok: false, code: 'coherence_failed', message: 'the graph digest differs from the expected structural identity' };
  }
  if (args.expected?.graphifyVersion !== undefined && args.bindingText !== undefined) {
    const binding = coerceStructuralBinding(args.bindingText);
    if (binding.ok && binding.binding.graphify_version !== args.expected.graphifyVersion) {
      return { ok: false, code: 'incompatible', message: `the workspace was built by graphify ${binding.binding.graphify_version} but ${args.expected.graphifyVersion} is expected` };
    }
  }
  return {
    ok: true,
    identity: {
      manifest_digest: manifest.identity.digest,
      manifest_entries: manifest.identity.entries,
      graph_digest: graphDigest,
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

// --- LCO StructuralBinding (S4-H-04) -----------------------------------------------------

/** The LCO-owned coherence record proving a manifest/graph pair came from
 *  ONE build. Graphify (0.9.50/0.9.53) exposes no cross-document build
 *  identity (the manifest is a per-path ast_hash map; the graph is a
 *  node-link document with built_at_commit and per-node source_file), so the
 *  kernel owns this binding: written immediately after a successful build
 *  validation, verified before any trusted structural use. Never model/user
 *  supplied. */
export interface StructuralBinding {
  schema_version: 1;
  /** Project the binding was built for (diagnostic; not a snapshot join). */
  project_name?: string;
  graphify_version: string;
  manifest_digest: `sha256:${string}`;
  graph_digest: `sha256:${string}`;
  /** Digest over the graph's sorted source-file set — the source-set join. */
  source_set_digest: `sha256:${string}`;
  created_at: string;
  /** domainDigest('LCO:STRUCTURE', 1, core fields) — integrity over the
   *  binding's own content; a hand-edited binding fails this recompute. */
  binding_digest: `sha256:${string}`;
}

/** Where the binding lives inside a built workspace. */
export function structuralBindingPath(workspaceRoot: string): string {
  return join(workspaceRoot, 'graphify-out', 'lco-binding.json');
}

function structuralBindingCore(b: Omit<StructuralBinding, 'binding_digest'>): `sha256:${string}` {
  return domainDigest('LCO:STRUCTURE', 1, {
    schema_version: b.schema_version,
    ...(b.project_name !== undefined ? { project_name: b.project_name } : {}),
    graphify_version: b.graphify_version,
    manifest_digest: b.manifest_digest,
    graph_digest: b.graph_digest,
    source_set_digest: b.source_set_digest,
    created_at: b.created_at,
  });
}

/** Digest over the graph's source-file SET (sorted, deduped). */
export function sourceSetDigest(graphText: string): `sha256:${string}` {
  const parsed = parseGraphText(graphText);
  if (!parsed.ok) throw new TrustStructuralError('graph_invalid', parsed.message);
  const files = new Set<string>();
  for (const n of parsed.graph.nodes) {
    if (n.source_file !== undefined) files.add(n.source_file);
  }
  return `sha256:${createHash('sha256').update(JSON.stringify([...files].sort()), 'utf8').digest('hex')}`;
}

/**
 * THE build-time constructor (S4-H-04): verify the manifest/graph pair
 * STRICTLY and COHERENTLY, then write the binding into the workspace. Called
 * by the LCO-controlled build path immediately after `graphify update`
 * succeeds — never from model or user input.
 */
export function computeStructuralBinding(args: {
  manifestText: string | undefined;
  graphText: string;
  graphifyVersion: string;
  projectName?: string;
  nowIso: string;
}): { ok: true; binding: StructuralBinding } | { ok: false; code: string; message: string } {
  const identity = structuralIdentity({ manifestText: args.manifestText, graphText: args.graphText });
  if (!identity.ok) return identity;
  const binding: StructuralBinding = {
    schema_version: 1,
    ...(args.projectName !== undefined ? { project_name: args.projectName } : {}),
    graphify_version: args.graphifyVersion,
    manifest_digest: identity.identity.manifest_digest,
    graph_digest: identity.identity.graph_digest,
    source_set_digest: sourceSetDigest(args.graphText),
    created_at: args.nowIso,
    binding_digest: '' as `sha256:${string}`,
  };
  binding.binding_digest = structuralBindingCore(binding);
  return { ok: true, binding };
}

export function bindStructuralArtifacts(args: {
  projectDir: string;
  workspaceRoot: string;
  manifestText: string | undefined;
  graphText: string;
  graphifyVersion: string;
  projectName?: string;
  nowIso: string;
}): { ok: true; binding: StructuralBinding } | { ok: false; code: string; message: string } {
  const computed = computeStructuralBinding(args);
  if (!computed.ok) return computed;
  authorizedWrite({
    projectDir: args.projectDir,
    path: structuralBindingPath(args.workspaceRoot),
    content: `${JSON.stringify(computed.binding, null, 2)}\n`,
    mode: 0o600,
  });
  return computed;
}

export type StructuralBindingParse =
  | { ok: true; binding: StructuralBinding }
  | { ok: false; code: 'binding_missing' | 'binding_corrupt' | 'binding_tampered'; message: string };

/** Parse + integrity-verify a binding (the binding's own digest must
 *  recompute — a hand-edited binding is REFUSED, never interpreted). */
export function coerceStructuralBinding(text: string | undefined): StructuralBindingParse {
  if (text === undefined || text.trim() === '') {
    return {
      ok: false,
      code: 'binding_missing',
      message: 'the workspace has no LCO structural binding (lco-binding.json) — it predates the trust-kernel closure or the build was torn; rebuild it (lco renew refresh)',
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, code: 'binding_corrupt', message: `lco-binding.json is not valid JSON (${(e as Error).message})` };
  }
  const b = parsed as StructuralBinding;
  if (
    b.schema_version !== 1 ||
    typeof b.graphify_version !== 'string' ||
    typeof b.manifest_digest !== 'string' ||
    typeof b.graph_digest !== 'string' ||
    typeof b.source_set_digest !== 'string' ||
    typeof b.created_at !== 'string' ||
    typeof b.binding_digest !== 'string'
  ) {
    return { ok: false, code: 'binding_corrupt', message: 'lco-binding.json does not match the binding contract' };
  }
  const { binding_digest, ...core } = b;
  if (structuralBindingCore(core) !== binding_digest) {
    return {
      ok: false,
      code: 'binding_tampered',
      message: 'the LCO structural binding failed integrity verification — it was hand-edited; rebuild the workspace (lco renew refresh)',
    };
  }
  return { ok: true, binding: b };
}

/**
 * THROWING variant for callers inside trust flows that treat any malformed
 * structural state as a hard refusal (identity-bearing reads).
 */
export function requireStructuralIdentity(args: {
  manifestText: string | undefined;
  graphText: string;
  /** REQUIRED (S4-H-04): load-bearing structural use consumes a BOUND pair. */
  bindingText: string | undefined;
  source?: string;
}): StructuralIdentity {
  if (args.bindingText === undefined) {
    throw new TrustStructuralError(
      'binding_missing',
      `${args.source ? `${args.source}: ` : ''}the workspace has no LCO structural binding (lco-binding.json) — ` +
        `it predates the trust-kernel closure or the build was torn; rebuild it (lco renew refresh)`,
    );
  }
  const r = structuralIdentity({ ...args, bindingText: args.bindingText });
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
  | 'probe_unavailable'
  | 'coherence_failed';

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
