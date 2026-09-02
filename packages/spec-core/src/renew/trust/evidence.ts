import { z } from 'zod';
import { TrustCitationError } from './errors';

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

/** A server-created, immutable record of EXACTLY what was supplied. */
export interface ContextRecord {
  context_id: string; // CTX-0001… (stable, per analysis run)
  path: string; // repo-relative POSIX path of the source file
  whole_file_hash: string; // sha256 of the whole file (as verified on disk)
  start_line: number; // supplied window start (1-based, inclusive)
  end_line: number; // supplied window end (1-based, inclusive)
  slice_text_hash: string; // sha256 of the supplied slice text itself
  /** True only when the supplied window covers the ENTIRE file. */
  whole_file_supplied: boolean;
  /** Node bound at supply time (its source_file matched the slice path). */
  node_id?: string;
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
 * Assign context ids to supplied slices (pure; deterministic ordering).
 * Input: the slice facts the context provider assembled. Duplicate paths
 * with identical windows dedup to one record; different windows of the
 * same file are distinct records.
 */
export function assignContextRecords(
  slices: ReadonlyArray<{
    path: string;
    whole_file_hash: string;
    start_line: number;
    end_line: number;
    slice_text_hash: string;
    file_line_count: number;
    node_id?: string;
  }>,
): ContextRecord[] {
  const records: ContextRecord[] = [];
  const seen = new Map<string, ContextRecord>();
  let n = 0;
  for (const s of slices) {
    const key = `${s.path}|${s.whole_file_hash}|${s.start_line}|${s.end_line}`;
    const existing = seen.get(key);
    if (existing) {
      // same window: bind the node id if this supply carried one
      if (s.node_id !== undefined && existing.node_id === undefined) existing.node_id = s.node_id;
      continue;
    }
    n += 1;
    const rec: ContextRecord = {
      context_id: `CTX-${String(n).padStart(4, '0')}`,
      path: s.path,
      whole_file_hash: s.whole_file_hash,
      start_line: s.start_line,
      end_line: s.end_line,
      slice_text_hash: s.slice_text_hash,
      whole_file_supplied: s.start_line === 1 && s.end_line >= s.file_line_count,
      node_id: s.node_id,
    };
    seen.set(key, rec);
    records.push(rec);
  }
  return records;
}

/**
 * THE trusted-anchor constructor. Pure; throws typed refusals:
 *   - unknown_context        — the cited id is not in this record set
 *   - range_outside_context  — claimed lines escape the supplied window
 *   - not_whole_file         — a whole-file citation on a slice record
 *   - invalid_range          — start>end / non-positive
 * Any refusal means the anchor is NOT constructed — there is no fallback.
 */
export function resolveCitation(records: ReadonlyArray<ContextRecord>, claim: CitationClaim): ResolvedCitation {
  const record = records.find((r) => r.context_id === claim.context_id);
  if (record === undefined) {
    throw new TrustCitationError(
      'unknown_context',
      `cited context ${claim.context_id} was not supplied to this analysis — anchors may only cite ` +
        `server-supplied context items exactly`,
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
    // THE containment invariant (S3-H-01): the claimed subrange must lie
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
