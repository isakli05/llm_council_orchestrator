/**
 * ProjectSnapshot — the identity layer binding renewal analysis to a specific
 * source state (audit 16 §C, 20 §2.3).
 *
 * A snapshot is (git commit when available) + a per-file content-hash index +
 * the Graphify graph manifest identity. Git SHA alone is NOT trusted as
 * freshness: dirty/untracked files and non-git trees all diverge from HEAD, so
 * the hash index is the ground truth and the commit is extra identity.
 *
 * `snapshot_id` derives from the identity fields ONLY (never `created_at`):
 * the same tree produces the same id across runs — idempotent by construction.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { FileManifest } from '../ingest/workspace-copy';

export type { FileManifest, FileManifestEntry } from '../ingest/workspace-copy';

const Sha256 = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export const SnapshotFileEntrySchema = z
  .object({ path: z.string().min(1), sha256: Sha256 })
  .strict();

export const ProjectSnapshotSchema = z
  .object({
    schema_version: z.literal(1),
    snapshot_id: z.string().regex(/^RSN-[0-9a-f]{16}$/),
    /** Injected-clock timestamp; excluded from identity. */
    created_at: z.string().min(1),
    target: z
      .object({
        root_realpath: z.string().min(1),
        repo_kind: z.enum(['git', 'plain']),
        git_commit: z.string().min(1).optional(),
      })
      .strict(),
    graph: z
      .object({
        graphify_version: z.string().min(1),
        manifest_digest: Sha256,
        manifest_entries: z.number().int().nonnegative(),
        node_count: z.number().int().nonnegative(),
        edge_count: z.number().int().nonnegative(),
        /** sha256 over the graph.json BYTES — structural graph content binding
         * (C-04): a schema-valid mutation of graph content cannot stay fresh. */
        graph_digest: Sha256,
      })
      .strict(),
    /** Sorted by path. */
    files: z.array(SnapshotFileEntrySchema),
    files_truncated: z.boolean(),
  })
  .strict();

export type ProjectSnapshot = z.infer<typeof ProjectSnapshotSchema>;

export interface SnapshotInputs {
  rootRealpath: string;
  repoKind: 'git' | 'plain';
  gitCommit?: string;
  files: FileManifest;
  filesTruncated: boolean;
  graph: { graphifyVersion: string; nodeCount: number; edgeCount: number; graphDigest: string };
  graphManifest: { digest: string; entries: number };
  nowIso: string;
}

/** The canonical identity payload of a snapshot's stable content. */
function identityPayload(p: {
  target: { root_realpath: string; repo_kind: 'git' | 'plain'; git_commit?: string };
  files: FileManifest;
  graph: {
    graphify_version: string;
    node_count: number;
    edge_count: number;
    manifest_digest: string;
    manifest_entries: number;
    graph_digest: string;
  };
}): string {
  return JSON.stringify({
    root: p.target.root_realpath,
    repo_kind: p.target.repo_kind,
    git_commit: p.target.git_commit ?? null,
    files: p.files,
    graph: {
      version: p.graph.graphify_version,
      nodes: p.graph.node_count,
      edges: p.graph.edge_count,
      manifest_digest: p.graph.manifest_digest,
      manifest_entries: p.graph.manifest_entries,
      graph_digest: p.graph.graph_digest,
    },
  });
}

/** Deterministic identity over the stable content of the snapshot. */
export function deriveSnapshotId(snapshot: Omit<ProjectSnapshot, 'snapshot_id' | 'schema_version' | 'created_at' | 'files_truncated'> & { files: FileManifest }): string {
  return `RSN-${createHash('sha256').update(identityPayload(snapshot), 'utf8').digest('hex').slice(0, 16)}`;
}

export function createSnapshot(inputs: SnapshotInputs): ProjectSnapshot {
  const files = [...inputs.files].sort((a, b) => (a.path < b.path ? -1 : 1));
  return {
    schema_version: 1,
    snapshot_id: deriveSnapshotId({
      target: {
        root_realpath: inputs.rootRealpath,
        repo_kind: inputs.repoKind,
        ...(inputs.gitCommit !== undefined ? { git_commit: inputs.gitCommit } : {}),
      },
      files,
      graph: {
        graphify_version: inputs.graph.graphifyVersion,
        node_count: inputs.graph.nodeCount,
        edge_count: inputs.graph.edgeCount,
        manifest_digest: inputs.graphManifest.digest,
        manifest_entries: inputs.graphManifest.entries,
        graph_digest: inputs.graph.graphDigest,
      },
    }),
    created_at: inputs.nowIso,
    target: {
      root_realpath: inputs.rootRealpath,
      repo_kind: inputs.repoKind,
      ...(inputs.gitCommit !== undefined ? { git_commit: inputs.gitCommit } : {}),
    },
    graph: {
      graphify_version: inputs.graph.graphifyVersion,
      manifest_digest: inputs.graphManifest.digest,
      manifest_entries: inputs.graphManifest.entries,
      node_count: inputs.graph.nodeCount,
      edge_count: inputs.graph.edgeCount,
      graph_digest: inputs.graph.graphDigest,
    },
    files,
    files_truncated: inputs.filesTruncated,
  };
}

export type SnapshotReload =
  | { ok: true; snapshot: ProjectSnapshot }
  | { ok: false; code: 'snapshot_corrupt'; message: string };

/**
 * Load a stored snapshot FAIL-CLOSED and SELF-VERIFYING (C-04): the stored
 * `snapshot_id` is never trusted — it is recomputed from the stored identity
 * fields and compared. A tampered id, or tampered identity content that no
 * longer matches the id, is `snapshot_corrupt` (tamper-evident), not "fresh".
 */
export function reloadSnapshot(text: string): SnapshotReload {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    return { ok: false, code: 'snapshot_corrupt', message: `snapshot.json is not valid JSON (${(e as Error).message})` };
  }
  const parsed = ProjectSnapshotSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue.path.join('.');
    return {
      ok: false,
      code: 'snapshot_corrupt',
      message: `snapshot.json failed schema validation (${where ? `${where}: ` : ''}${issue.message})`,
    };
  }
  const s = parsed.data;
  const recomputed = deriveSnapshotId({
    target: s.target,
    files: s.files,
    graph: s.graph,
  });
  if (recomputed !== s.snapshot_id) {
    return {
      ok: false,
      code: 'snapshot_corrupt',
      message:
        `snapshot.json identity mismatch: stored snapshot_id ${s.snapshot_id} does not match the ` +
        `identity recomputed from its own content (${recomputed}) — the snapshot was tampered with or ` +
        `hand-edited. Run 'lco renew refresh <dir>' to rebuild trusted state.`,
    };
  }
  return { ok: true, snapshot: s };
}

// --- staleness -----------------------------------------------------------------

export type StalenessCode =
  | 'target_commit_changed'
  | 'file_changed'
  | 'file_added'
  | 'file_removed'
  | 'graph_manifest_changed'
  | 'graph_changed'
  | 'graph_missing'
  | 'graph_invalid';

export interface StalenessReason {
  code: StalenessCode;
  detail?: string;
  /** Bounded path list (first 20, sorted) + overflow count. */
  paths?: string[];
  more?: number;
}

export type Staleness = { status: 'fresh' } | { status: 'stale'; reasons: StalenessReason[] };

export interface StalenessCurrent {
  gitCommit?: string;
  files: FileManifest;
  graphManifestDigest: string;
  /** sha256 over the CURRENT graph.json bytes (C-04 — structural binding). */
  graphDigest?: string;
  graphPresent: boolean;
  graphValid?: boolean;
}

const PATH_LIST_LIMIT = 20;

function boundPaths(all: string[]): { paths: string[]; more: number } {
  const sorted = [...all].sort();
  return {
    paths: sorted.slice(0, PATH_LIST_LIMIT),
    more: Math.max(0, sorted.length - PATH_LIST_LIMIT),
  };
}

export function evaluateStaleness(snapshot: ProjectSnapshot, current: StalenessCurrent): Staleness {
  const reasons: StalenessReason[] = [];

  if (
    snapshot.target.repo_kind === 'git' &&
    snapshot.target.git_commit !== undefined &&
    current.gitCommit !== undefined &&
    snapshot.target.git_commit !== current.gitCommit
  ) {
    reasons.push({
      code: 'target_commit_changed',
      detail: `HEAD moved: ${snapshot.target.git_commit.slice(0, 12)} → ${current.gitCommit.slice(0, 12)}`,
    });
  }

  const before = new Map(snapshot.files.map((f) => [f.path, f.sha256]));
  const now = new Map(current.files.map((f) => [f.path, f.sha256]));
  const changed: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];
  for (const [path, hash] of now) {
    const prev = before.get(path);
    if (prev === undefined) added.push(path);
    else if (prev !== hash) changed.push(path);
  }
  for (const path of before.keys()) {
    if (!now.has(path)) removed.push(path);
  }
  if (changed.length > 0) reasons.push({ code: 'file_changed', ...boundPaths(changed) });
  if (added.length > 0) reasons.push({ code: 'file_added', ...boundPaths(added) });
  if (removed.length > 0) reasons.push({ code: 'file_removed', ...boundPaths(removed) });

  if (!current.graphPresent) {
    reasons.push({
      code: 'graph_missing',
      detail: 'the Graphify graph for this target is absent — rebuild it (lco renew refresh)',
    });
  } else {
    if (current.graphValid === false) {
      reasons.push({ code: 'graph_invalid', detail: 'graph.json failed validation' });
    }
    if (current.graphManifestDigest !== snapshot.graph.manifest_digest) {
      reasons.push({ code: 'graph_manifest_changed', detail: 'the graph manifest no longer matches the snapshot' });
    }
    // C-04: bind the graph BYTES, not only the manifest projection — a
    // schema-valid edit to graph.json content (node labels, edges) is stale.
    if (current.graphDigest !== undefined && current.graphDigest !== snapshot.graph.graph_digest) {
      reasons.push({
        code: 'graph_changed',
        detail: 'graph.json content no longer matches the snapshot (structural graph digest differs)',
      });
    }
  }

  return reasons.length > 0 ? { status: 'stale', reasons } : { status: 'fresh' };
}

// --- graph manifest identity -----------------------------------------------------

export interface GraphManifestIdentity {
  digest: string;
  entries: number;
}

export type GraphManifestParse =
  | { ok: true; identity: GraphManifestIdentity }
  | { ok: false; code: 'manifest_missing' | 'manifest_invalid'; message: string };

/**
 * STRICT manifest parsing for load-bearing identity (H-11 + S2-H-06/INV-G1):
 * an absent or malformed manifest is a typed failure — it must never silently
 * become an "empty manifest" identity that a fresh snapshot could bless, and
 * a malformed ENTRY (scalar, missing/non-string/empty `ast_hash`, `{}` as the
 * whole manifest) is just as fatal: identity over garbage is garbage. The
 * Graphify manifest contract is `{ <path>: { ast_hash: <string>, …volatile } }`
 * with at least one entry for any built graph.
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
 * Stable digest over Graphify's manifest.json: volatile fields (mtime/seen)
 * are projected out; identity = sorted [path, ast_hash] pairs. Kept for
 * non-load-bearing projections; identity-bearing callers use
 * {@link parseGraphManifestStrict} (fail-closed).
 */
export function digestGraphManifest(text: string): GraphManifestIdentity {
  const strict = parseGraphManifestStrict(text);
  if (strict.ok) return strict.identity;
  // Explicit empty-list constant (non-load-bearing projections only).
  return { digest: `sha256:${createHash('sha256').update(JSON.stringify([]), 'utf8').digest('hex')}`, entries: 0 };
}
