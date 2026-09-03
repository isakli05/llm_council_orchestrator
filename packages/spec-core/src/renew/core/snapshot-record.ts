/**
 * Trust Kernel groundwork (S4-M-02) — the PURE snapshot-record leaf.
 *
 * Snapshot schema, deterministic identity, and the fail-closed self-verifying
 * reload moved out of `renew/snapshot/snapshot.ts` (which also carries the
 * staleness domain logic) so `trust/state.ts` can depend on the RECORD
 * CONTRACT downward instead of importing a domain module. The one permitted
 * trust import is `trust/canonical` — the CanonicalDigest leaf — because
 * snapshot identity IS a canonical-digest domain (S4-M-02: the ad-hoc
 * `createHash(JSON.stringify(...))` snapshot id is replaced by a
 * domain-separated versioned digest; the `RSN-<16hex>` id shape is kept).
 *
 * Compatibility policy (locked): snapshot identity bytes CHANGE with this
 * move, by design. Pre-closure snapshot.json files fail the reload
 * recomputation with the existing tamper-evident `snapshot_corrupt` refusal
 * whose remedy is `lco renew refresh` — pre-release dev state fails closed
 * and is rebuilt, never silently reinterpreted (same policy family as the
 * approval v2→v3 cutover).
 */
import { z } from 'zod';
import type { FileManifest } from '../ingest/workspace-copy';
import { domainDigest } from '../trust/canonical';

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
        /** S4-H-04: digest of the LCO StructuralBinding that proved the
         * manifest/graph pair came from ONE build (null only in synthetic
         * pre-binding contexts; real init/refresh always records one). */
        binding_digest: Sha256.nullable(),
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
  /** S4-H-04: the StructuralBinding LCO wrote after the build (present from
   *  Wave E onward; synthetic pre-binding contexts omit it and record null). */
  graphBinding?: { digest: string };
  nowIso: string;
}

/** The canonical identity payload of a snapshot's stable content (the value
 *  `LCO:SNAPSHOT` digests — field names are part of the contract). */
export function snapshotIdentityPayload(p: {
  target: { root_realpath: string; repo_kind: 'git' | 'plain'; git_commit?: string };
  files: FileManifest;
  graph: {
    graphify_version: string;
    node_count: number;
    edge_count: number;
    manifest_digest: string;
    manifest_entries: number;
    graph_digest: string;
    binding_digest?: string | null;
  };
}): Record<string, unknown> {
  return {
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
      binding_digest: p.graph.binding_digest ?? null,
    },
  };
}

/**
 * Deterministic identity over the stable content of the snapshot, as a
 * domain-separated versioned canonical digest (`LCO:SNAPSHOT` v1). The id
 * shape stays `RSN-<16hex>`; the hashed material is the canonical-domain
 * envelope (S4-M-02 — CanonicalDigest is authoritative for snapshot
 * identity).
 */
export function deriveSnapshotId(
  snapshot: Omit<ProjectSnapshot, 'snapshot_id' | 'schema_version' | 'created_at' | 'files_truncated'> & {
    files: FileManifest;
  },
): string {
  const digest = domainDigest('LCO:SNAPSHOT', 1, snapshotIdentityPayload(snapshot));
  return `RSN-${digest.slice('sha256:'.length, 'sha256:'.length + 16)}`;
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
        binding_digest: inputs.graphBinding?.digest ?? null,
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
      binding_digest: inputs.graphBinding?.digest ?? null,
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
 * fields and compared. A tampered id, tampered identity content, or a
 * pre-closure identity format (which recomputes differently under the
 * `LCO:SNAPSHOT` domain) is `snapshot_corrupt` with the refresh remedy —
 * never silently reinterpreted.
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
        `identity recomputed from its own content (${recomputed}) — the snapshot was tampered with, ` +
        `hand-edited, or predates the trust-kernel closure digest format. Run 'lco renew refresh <dir>' ` +
        `to rebuild trusted state.`,
    };
  }
  return { ok: true, snapshot: s };
}
