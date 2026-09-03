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
import type { FileManifest } from '../ingest/workspace-copy';
import type { ProjectSnapshot } from '../core/snapshot-record';

// S4-M-02 (closure): the schema, deterministic identity, create/reload, and
// the LCO:SNAPSHOT domain digest moved to the PURE `renew/core/snapshot-record`
// leaf so `trust/state` depends on the record contract, not on this domain
// module. Re-exported here for the existing import surface.
export {
  SnapshotFileEntrySchema,
  ProjectSnapshotSchema,
  createSnapshot,
  deriveSnapshotId,
  reloadSnapshot,
  snapshotIdentityPayload,
} from '../core/snapshot-record';
export type { ProjectSnapshot, SnapshotInputs, SnapshotReload } from '../core/snapshot-record';
export type { FileManifest, FileManifestEntry } from '../ingest/workspace-copy';

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
// Trust Kernel: the strict manifest parser and identity digests live in
// src/renew/trust/structural.ts (ONE implementation). Re-exported here for
// the snapshot module's existing import surface.
export type { GraphManifestParse } from '../trust/structural';
export { parseGraphManifestStrict } from '../trust/structural';
import { parseGraphManifestStrict as strictParse } from '../trust/structural';


