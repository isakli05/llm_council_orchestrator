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
  graph: { graphifyVersion: string; nodeCount: number; edgeCount: number };
  graphManifest: { digest: string; entries: number };
  nowIso: string;
}

/** Deterministic identity over the stable content of the snapshot. */
function identityDigest(inputs: SnapshotInputs, sortedFiles: FileManifest): string {
  const payload = JSON.stringify({
    root: inputs.rootRealpath,
    repo_kind: inputs.repoKind,
    git_commit: inputs.gitCommit ?? null,
    files: sortedFiles,
    graph: {
      version: inputs.graph.graphifyVersion,
      nodes: inputs.graph.nodeCount,
      edges: inputs.graph.edgeCount,
      manifest_digest: inputs.graphManifest.digest,
      manifest_entries: inputs.graphManifest.entries,
    },
  });
  return `RSN-${createHash('sha256').update(payload, 'utf8').digest('hex').slice(0, 16)}`;
}

export function createSnapshot(inputs: SnapshotInputs): ProjectSnapshot {
  const files = [...inputs.files].sort((a, b) => (a.path < b.path ? -1 : 1));
  return {
    schema_version: 1,
    snapshot_id: identityDigest(inputs, files),
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
    },
    files,
    files_truncated: inputs.filesTruncated,
  };
}

export type SnapshotReload =
  | { ok: true; snapshot: ProjectSnapshot }
  | { ok: false; code: 'snapshot_corrupt'; message: string };

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
  return { ok: true, snapshot: parsed.data };
}

// --- staleness -----------------------------------------------------------------

export type StalenessCode =
  | 'target_commit_changed'
  | 'file_changed'
  | 'file_added'
  | 'file_removed'
  | 'graph_manifest_changed'
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
  }

  return reasons.length > 0 ? { status: 'stale', reasons } : { status: 'fresh' };
}

// --- graph manifest identity -----------------------------------------------------

export interface GraphManifestIdentity {
  digest: string;
  entries: number;
}

/**
 * Stable digest over Graphify's manifest.json: volatile fields (mtime/seen)
 * are projected out; identity = sorted [path, ast_hash] pairs. An absent or
 * unparseable manifest digests as the explicit empty-list constant — honest
 * emptiness, never an error disguised as identity.
 */
export function digestGraphManifest(text: string): GraphManifestIdentity {
  let parsed: unknown;
  if (text.trim() !== '') {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }
  }
  const entries: [string, string][] = [];
  if (parsed !== undefined && typeof parsed === 'object' && !Array.isArray(parsed)) {
    for (const [path, value] of Object.entries(parsed as Record<string, unknown>)) {
      const astHash =
        value !== null && typeof value === 'object' && typeof (value as { ast_hash?: unknown }).ast_hash === 'string'
          ? (value as { ast_hash: string }).ast_hash
          : '';
      entries.push([path, astHash]);
    }
  }
  entries.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return {
    digest: `sha256:${createHash('sha256').update(JSON.stringify(entries), 'utf8').digest('hex')}`,
    entries: entries.length,
  };
}
