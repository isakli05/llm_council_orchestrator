import { z } from 'zod';
import { sha256Content, domainDigest } from './canonical';
import { TrustCitationError } from './errors';
import type { ContextItem } from '../context/bundle';

/**
 * Trust Kernel — EvidenceCitation (third-audit S3-H-01, reopening C-03/S2-C-02).
 *
 * The model may NEVER widen trusted provenance beyond the exact source
 * material the server supplied. Before this module, the prompt carried a
 * `path → whole-file-hash` table and the model answered with trusted
 * coordinates (`path`, `content_hash`, `start_line`, `end_line`, `node_id`);
 * the pipeline then verified only that (path, hash) appeared on SOME
 * supplied slice and that the claimed range was possible SOMEWHERE in the
 * whole current file — so a model shown lines 1–2 could claim lines 10–10
 * and receive `ok:true / scope:range`, and that range flowed into parity
 * and generated code_anchor evidence (completed T3-1 runtime evidence).
 *
 * The kernel contract inverts control:
 *
 *   1. BEFORE the model call, the server assigns every supplied file slice
 *      an immutable, in-memory `CTX-NNNN` context record capturing the
 *      EXACT supplied material: path, whole-file hash, the slice's line
 *      window and its content hash, whether the WHOLE file was supplied,
 *      and the optional node binding.
 *   2. The model cites `context_id` (+ optionally NARROWS the line range).
 *      Model-authored paths/hashes/node ids are not trusted coordinates —
 *      the wire schema does not carry them.
 *   3. `resolveCitation` is the ONLY constructor of trusted anchors: the
 *      cited record must exist in THIS analysis's record set, and any
 *      claimed subrange must be CONTAINED within the supplied window. The
 *      server computes the resulting anchor. Widening is unrepresentable.
 *
 * Provenance vs semantic support stays a separate axis (INV-C): a resolved
 * citation is PROVENANCE (the cited bytes were supplied and are current);
 * it is never semantic support. `support_status` transitions remain
 * machine-unsettable past 'unvalidated'; only a human ruling sets
 * 'human_confirmed'. `assertSupportPolicy` makes the support axis
 * LOAD-BEARING for planning/destructive use instead of decorative.
 */

/**
 * A server-created, immutable record of EXACTLY what was supplied. S4-H-02:
 * the record is IDENTITY-BOUND — project, snapshot, and the sealed context
 * bundle it belongs to. A record from another project/snapshot/request can
 * never resolve: the joins are enforced by resolveCitation against the
 * ACTIVE bundle, not trusted from the record's own fields.
 */
export interface ContextRecord {
  context_id: string; // CTX-0001… (stable, per analysis run)
  /** The renewal project this record was supplied under (S4-H-02 join). */
  project_name: string;
  /** The snapshot the supplied bytes were verified against (S4-H-02 join). */
  snapshot_id: string;
  /** The sealed bundle this record belongs to (S4-H-02 join). */
  bundle_id: string;
  path: string; // repo-relative POSIX path of the source file
  whole_file_hash: string; // sha256 of the whole file (as verified on disk)
  start_line: number; // supplied window start (1-based, inclusive)
  end_line: number; // supplied window end (1-based, inclusive)
  /** sha256 of the supplied slice text — RECOMPUTED at seal time from the
   *  server-owned rendered bytes, never accepted from the caller. */
  slice_text_hash: string;
  /** True only when the supplied window covers the ENTIRE file. */
  whole_file_supplied: boolean;
  /** Node bound at supply time (its source_file matched the slice path). */
  node_id?: string;
}

/** The identity of the EXACT context supplied to one paid operation (S4-H-02). */
export interface ContextBundleIdentity {
  /** 2 = S5-M-01: the digest payload now covers the FULL item list (every
   *  model-visible field of every kind), not only the slice records. */
  schema_version: 2;
  project_name: string;
  snapshot_id: string;
  /** domainDigest('LCO:PAID_CONTEXT', 2, …) over the ordered records' slice
   *  facts AND the full ordered item list — substituting, splicing, editing,
   *  or reordering any record or item (node/edge/fact/file_slice) changes
   *  it. The BUNDLE's model-visible payload cannot change without changing
   *  it. Request framing rendered around the bundle (run context such as
   *  nowIso and scope) is a SEPARATE identity domain, deliberately not
   *  digest-covered here: scope is consent-bound (LCO:CONSENT v1) on MCP and
   *  a compile-time pin on the CLI; run time persists as plaintext
   *  created_at (see runRecovery — the persisted context_digest is audit
   *  lineage, not total model-input identity). */
  bundle_id: `sha256:${string}`;
  /** The structural epoch the supplied graph/node context came from (when
   *  graph context participated in the bundle). */
  structural?: { manifest_digest: `sha256:${string}`; graph_digest: `sha256:${string}` };
}

/** A SEALED context bundle: identity + the immutable records and items it
 *  covers. The items are carried so the digest is recomputable (S5-M-01:
 *  membership proof over the ENTIRE model-visible BUNDLE payload — request
 *  framing is outside the identity by design). */
export interface SealedContext {
  identity: ContextBundleIdentity;
  records: readonly ContextRecord[];
  /** The full item list the digest covers (frozen at seal time). */
  items: readonly ContextItem[];
}

/**
 * Post-PR5 I4: memoized digest of SEALED bundles, keyed by reference.
 * Written ONLY inside `sealContextBundle` after the final freeze — a sealed
 * bundle is deep-frozen, so a cached digest can never go stale. Anything
 * else (a tampered copy, a hand-built lookalike, a JSON-round-tripped thawed
 * bundle) is a different reference and takes the FULL recompute path, so
 * tamper detection is structurally preserved. NEVER cache on read: a naive
 * read-side cache would mask post-cache mutation of a thawed bundle riding a
 * stolen identity (demonstrated during investigation — forbidden shape).
 */
const bundleDigestCache = new WeakMap<SealedContext, `sha256:${string}`>();

/** One server-owned supplied slice — the rendered text IS the authority. */
export interface SuppliedContextSlice {
  path: string;
  start_line: number;
  end_line: number;
  /** The EXACT rendered text the model will see (post-redaction) — the
   *  slice hash is recomputed from these bytes; a caller-supplied
   *  slice_text_hash is never accepted. */
  text: string;
  whole_file_hash: string;
  file_line_count: number;
  node_id?: string;
}

/** The payload a bundle digest covers: the slice records AND the full item
 *  list (S5-M-01 — nodes, edges, facts, and file_slice metadata like
 *  redactions are model-visible and MUST be identity-bound). One domain,
 *  one version, one payload schema (the canonical-layer contract). */
function bundleDigestPayload(
  identity: { project_name: string; snapshot_id: string; structural?: { manifest_digest: `sha256:${string}`; graph_digest: `sha256:${string}` } },
  records: ReadonlyArray<Omit<ContextRecord, 'bundle_id'>>,
  items: ReadonlyArray<ContextItem>,
): { project_name: string; snapshot_id: string; structural: unknown; records: unknown[]; items: unknown[] } {
  return {
    project_name: identity.project_name,
    snapshot_id: identity.snapshot_id,
    structural: identity.structural ?? null,
    records: records.map((r) => ({
      context_id: r.context_id,
      path: r.path,
      whole_file_hash: r.whole_file_hash,
      start_line: r.start_line,
      end_line: r.end_line,
      slice_text_hash: r.slice_text_hash,
      whole_file_supplied: r.whole_file_supplied,
      ...(r.node_id !== undefined ? { node_id: r.node_id } : {}),
    })),
    // No defensive clone here: canonicalJson (the only consumer) never
    // mutates, and the caller's frozen seal items arrive already isolated —
    // cloning per payload assembly cost one full copy per citation resolution.
    items: items as unknown[],
  };
}

/**
 * THE context-bundle constructor (S4-H-02). Assigns context ids, RECOMPUTES
 * every slice hash from the server-owned rendered text (a caller's hash
 * field is data, never authority), derives the bundle identity as a
 * domain-separated canonical digest, and stamps each record with it. The
 * returned records are frozen. A hand-edited or foreign record set cannot
 * carry a valid bundle_id — resolveCitation recomputes it.
 *
 * Post-PR5 I3: the seal treats `slices` (records) and `items` as two
 * independently identity-bound lists BY DESIGN; their semantic coherence
 * (each file_slice item corresponds to its record) is owned by the CALLER —
 * the sole production site derives both sides from one array, an invariant
 * pinned by the architecture guard in architecture.test.ts.
 */
export function sealContextBundle(args: {
  projectName: string;
  snapshotId: string;
  slices: ReadonlyArray<SuppliedContextSlice>;
  /**
   * S5-M-01 (REQUIRED, fail-closed): the FULL item list of the bundle being
   * sealed — every kind (file_slice, node, edge, structural_fact), in order.
   * The bundle identity covers the bundle's entire model-visible payload
   * (request framing is outside the identity by design); there is no way to
   * seal a bundle whose items are not identity-bound. Items are deep-cloned
   * then frozen here — caller mutation cannot reach the seal.
   */
  items: ReadonlyArray<ContextItem>;
  structural?: { manifest_digest: `sha256:${string}`; graph_digest: `sha256:${string}` };
}): SealedContext {
  const base: Omit<ContextRecord, 'bundle_id'>[] = [];
  const seen = new Map<string, number>();
  let n = 0;
  for (const s of args.slices) {
    const key = `${s.path}|${s.whole_file_hash}|${s.start_line}|${s.end_line}`;
    const existingIdx = seen.get(key);
    if (existingIdx !== undefined) {
      // same window: bind the node id if this supply carried one
      const existing = base[existingIdx]!;
      if (s.node_id !== undefined && existing.node_id === undefined) existing.node_id = s.node_id;
      continue;
    }
    n += 1;
    base.push({
      context_id: `CTX-${String(n).padStart(4, '0')}`,
      project_name: args.projectName,
      snapshot_id: args.snapshotId,
      path: s.path,
      whole_file_hash: s.whole_file_hash,
      start_line: s.start_line,
      end_line: s.end_line,
      slice_text_hash: sha256Content(s.text),
      whole_file_supplied: s.start_line === 1 && s.end_line >= s.file_line_count,
      ...(s.node_id !== undefined ? { node_id: s.node_id } : {}),
    });
    seen.set(key, base.length - 1);
  }
  // Post-PR5 I2: clone+freeze FIRST, then digest the same frozen clone the
  // seal exposes — the identity can never diverge from the exposed items (a
  // getter-equipped item previously presented access #1 to the digest and
  // access #2 to the clone). For static items digest(clone) ===
  // digest(original) — canonical key-sorting normalizes insertion order, and
  // proxies/functions already threw at clone time — so every ordinary digest
  // is byte-unchanged.
  const frozenItems: ContextItem[] = args.items.map((item) => deepFreezeItem(structuredClone(item)));
  const bundle_id = domainDigest('LCO:PAID_CONTEXT', 2, bundleDigestPayload({ project_name: args.projectName, snapshot_id: args.snapshotId, ...(args.structural !== undefined ? { structural: args.structural } : {}) }, base, frozenItems));
  const records: ContextRecord[] = base.map((r) => Object.freeze({ ...r, bundle_id }));
  const sealed: SealedContext = Object.freeze({
    identity: Object.freeze({
      schema_version: 2 as const,
      project_name: args.projectName,
      snapshot_id: args.snapshotId,
      bundle_id,
      ...(args.structural !== undefined ? { structural: Object.freeze({ ...args.structural }) } : {}),
    }),
    records: Object.freeze(records),
    items: Object.freeze(frozenItems),
  });
  // Post-freeze, post-freeze-only write (I4): the reference-keyed cache entry
  // for THIS sealed instance — never on read, never for any other object.
  bundleDigestCache.set(sealed, bundle_id);
  return sealed;
}

/** Deep-freeze one cloned item (S5-M-01: the sealed items are immutable). */
function deepFreezeItem<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreezeItem((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

/**
 * Recompute a sealed bundle's digest from its records AND items — the
 * membership proof. A record set or item list that was spliced, substituted,
 * edited, or reordered (including its slice hashes) no longer recomputes to
 * the identity's bundle_id.
 */
export function contextBundleDigest(bundle: SealedContext): `sha256:${string}` {
  // Sealed instances resolve in O(1) from the seal-time cache (per-citation
  // recomputation previously cost ~0.5–0.7 ms each at scale — ~1.5 s per
  // 3,000-citation ceiling response). Miss = anything not produced by
  // sealContextBundle: recompute fully and DO NOT store (keeps tampered
  // lookalikes on the honest path).
  const cached = bundleDigestCache.get(bundle);
  if (cached !== undefined) return cached;
  return domainDigest('LCO:PAID_CONTEXT', 2, bundleDigestPayload(bundle.identity, bundle.records, bundle.items));
}

/** The server-computed trusted anchor payload (path/hash/range/node shape
 *  identical to the persisted CodeAnchorPayload — the kernel's term for it). */
export type TrustedAnchorPayload = {
  path: string;
  content_hash: string;
  start_line?: number;
  end_line?: number;
  node_id?: string;
};

/** The model-side citation claim: a context id, optionally narrowed. */
export const CitationClaimSchema = z
  .object({
    context_id: z.string().min(1).max(64),
    start_line: z.number().int().positive().optional(),
    end_line: z.number().int().positive().optional(),
  })
  .strict();
export type CitationClaim = z.infer<typeof CitationClaimSchema>;

/**
 * The server-computed trusted anchor (the persisted CodeAnchorPayload
 * shape — now ONLY ever constructed here).
 */
export interface ResolvedCitation {
  path: string;
  content_hash: string;
  start_line?: number;
  end_line?: number;
  node_id?: string;
  /** How much of the file this citation actually covers. */
  scope: 'whole_file' | 'range' | 'node_range';
  /** The context record the citation was resolved from (audit lineage). */
  context_id: string;
}

/**
 * THE trusted-anchor constructor (S4-H-02 contract). Operates ONLY under an
 * authoritative ACTIVE context bundle — the record list alone is no longer
 * an acceptable input, because it cannot prove project/snapshot/request
 * identity. Joins enforced, in order:
 *
 *   1. context_id ∈ the bundle's records              (unknown_context)
 *   2. the record's project === the bundle's project  (context_project_mismatch)
 *   3. the record's snapshot === the bundle's snapshot(context_snapshot_mismatch)
 *   4. the record's bundle_id === the identity's bundle_id AND the record
 *      set recomputes to that bundle_id               (context_bundle_mismatch)
 *   5. claimed subrange ⊆ the EXACT supplied window   (range_outside_context — T3-1)
 *
 * The slice hash was recomputed from the server-owned rendered bytes at
 * SEAL time; a substituted or hand-edited record set fails join 4.
 */
export function resolveCitation(active: SealedContext, claim: CitationClaim): ResolvedCitation {
  const record = active.records.find((r) => r.context_id === claim.context_id);
  if (record === undefined) {
    throw new TrustCitationError(
      'unknown_context',
      `cited context ${claim.context_id} was not supplied to this analysis — anchors may only cite ` +
        `server-supplied context items exactly`,
      claim.context_id,
    );
  }
  if (record.project_name !== active.identity.project_name) {
    throw new TrustCitationError(
      'context_project_mismatch',
      `cited context ${claim.context_id} belongs to project '${record.project_name}' but the active ` +
        `analysis runs under '${active.identity.project_name}' — a foreign context record cannot resolve`,
      claim.context_id,
    );
  }
  if (record.snapshot_id !== active.identity.snapshot_id) {
    throw new TrustCitationError(
      'context_snapshot_mismatch',
      `cited context ${claim.context_id} was supplied under snapshot ${record.snapshot_id} but the active ` +
        `snapshot is ${active.identity.snapshot_id} — a stale context record cannot resolve (refresh re-supplies)`,
      claim.context_id,
    );
  }
  if (record.bundle_id !== active.identity.bundle_id || contextBundleDigest(active) !== active.identity.bundle_id) {
    throw new TrustCitationError(
      'context_bundle_mismatch',
      `the active context bundle does not recomputably own context ${claim.context_id} — the record set ` +
        `was substituted, spliced, or edited after sealing`,
      claim.context_id,
    );
  }
  let start: number | undefined;
  let end: number | undefined;
  if (claim.start_line !== undefined || claim.end_line !== undefined) {
    start = claim.start_line ?? record.start_line;
    end = claim.end_line ?? record.end_line;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
      throw new TrustCitationError(
        'invalid_range',
        `cited range ${start}–${end} on ${record.context_id} is not a valid 1-based inclusive range`,
        record.context_id,
      );
    }
    // THE containment invariant (S3-H-01/T3-1): the claimed subrange must lie
    // within the EXACT window the server supplied — never merely "somewhere
    // in the file".
    if (start < record.start_line || end > record.end_line) {
      throw new TrustCitationError(
        'range_outside_context',
        `cited range ${start}–${end} escapes the supplied window ${record.start_line}–${record.end_line} ` +
          `of ${record.path} (${record.context_id}) — a citation can never cover bytes the model was not given`,
        record.context_id,
      );
    }
  }
  let scope: ResolvedCitation['scope'];
  if (record.node_id !== undefined && (start !== undefined || end !== undefined)) {
    scope = 'node_range';
  } else if (start !== undefined || end !== undefined) {
    scope = 'range';
  } else {
    if (!record.whole_file_supplied) {
      // No subrange claimed: the citation covers the SUPPLIED SLICE, which
      // is not the whole file — label it as a range of the supplied window
      // (never "whole_file").
      start = record.start_line;
      end = record.end_line;
      scope = 'range';
    } else {
      scope = 'whole_file';
    }
  }
  return {
    path: record.path,
    content_hash: record.whole_file_hash,
    start_line: start,
    end_line: end,
    node_id: record.node_id,
    scope,
    context_id: record.context_id,
  };
}

// --- support-status policy (INV-C load-bearing) -----------------------------------------

export const SupportStatusSchema = z.enum(['unvalidated', 'human_confirmed', 'contradicted']);
export type SupportStatus = z.infer<typeof SupportStatusSchema>;

/** What a support state may authorize. */
export type EvidenceRole =
  | 'hypothesis' // appear as a hypothesis / provisional risk
  | 'manual_review' // create a manual-review item / clarification request
  | 'planning_input' // feed the frozen migration plan as ruled behavior
  | 'destructive_rationale'; // rationale for a DROP-class ruling

/**
 * The load-bearing policy: provenance alone (support 'unvalidated') may
 * hypothesize and request review, but NEVER planning-input or destructive
 * rationale. 'contradicted' authorizes nothing. This is the rule the third
 * audit found decorative (parityGate never read support_status); consumers
 * MUST call this before relying on an entry.
 */
export function assertSupportPolicy(role: EvidenceRole, support: SupportStatus | undefined, what: string): void {
  const status: SupportStatus = support ?? 'unvalidated';
  const allowed: Record<EvidenceRole, SupportStatus[]> = {
    hypothesis: ['unvalidated', 'human_confirmed'],
    manual_review: ['unvalidated', 'human_confirmed', 'contradicted'],
    planning_input: ['human_confirmed'],
    destructive_rationale: ['human_confirmed'],
  };
  if (!allowed[role].includes(status)) {
    throw new TrustCitationError(
      'support_policy_violation',
      `${what}: evidence with support_status '${status}' cannot serve as ${role} — ` +
        `provenance-verified material requires a human ruling before it becomes load-bearing ` +
        `(the machine never validates semantic support)`,
    );
  }
}
