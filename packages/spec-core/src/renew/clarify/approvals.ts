/**
 * Renewal approval records (STEP 8): the pluggable approved-artifact schema
 * the audit called for (03 §B.6 point c) — approvals embed RENEWAL decisions
 * (strategy selection, uncertainty rulings, overlay reviews) with canonical,
 * locally-hashed user evidence, instead of a SpecBundle. Immutable, 0600,
 * same APPR-NNNN lineage discipline as the spec workspace.
 */
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha256Content } from '../../compiler/hash';

const Sha256 = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export const RenewalDecisionSchema = z
  .object({
    claim_id: z.string().regex(/^(UNC|OVL|STG|PAR)-\d{4}$/),
    kind: z.enum(['uncertainty', 'overlay_review', 'parity', 'strategy']),
    selected_option: z.string().min(1).max(500).optional(),
    free_text: z.string().min(1).max(4_000).optional(),
    evidence: z
      .object({
        source: z.string().min(1).max(200),
        answer_text: z.string().min(1).max(8_000),
        hash: Sha256, // sha256 of answer_text — computed locally, never by the model
      })
      .strict(),
  })
  .strict();

export const RenewalDecisionSetSchema = z
  .object({ decisions: z.array(RenewalDecisionSchema).min(1) })
  .strict();

export const RenewalApprovalRecordSchema = z
  .object({
    schema_version: z.literal(1),
    approval_id: z.string().regex(/^APPR-\d{4}$/),
    session_id: z.string().min(1),
    round_count: z.number().int().positive(),
    approved_at: z.string().min(1),
    project_name: z.string().min(1).optional(),
    /** F2/H-09: approvals bind to the snapshot they were given under — a
     * post-refresh approval must not rule a different source state. */
    snapshot_id: z.string().regex(/^RSN-[0-9a-f]{16}$/).optional(),
    decisions: z.array(RenewalDecisionSchema).min(1),
    content_digest: Sha256,
  })
  .strict();

export type RenewalDecision = z.infer<typeof RenewalDecisionSchema>;
export type RenewalDecisionSet = z.infer<typeof RenewalDecisionSetSchema>;
export type RenewalApprovalRecord = z.infer<typeof RenewalApprovalRecordSchema>;

/**
 * INV-D1 (S2-C-04, reopening C-08/H-09): the approval digest binds EVERY
 * authority-bearing field of the record — identity (approval/session/round),
 * the state it rules (project, snapshot), and the decisions themselves — over
 * one canonical, field-order-stable, versioned serialization. Changing ANY of
 * these fields moves authority to another state/decision and MUST invalidate
 * the digest. `approved_at` is deliberately excluded (not authority-bearing;
 * the answer evidence carries its own hash).
 *
 * v1 (decisions-only) digests are rejected at load: pre-remediation
 * development records fail closed with a re-approve instruction.
 */
export const RENEWAL_APPROVAL_DIGEST_VERSION = 2;

type AuthorityFields = Omit<RenewalApprovalRecord, 'approved_at' | 'content_digest'>;

export function renewalApprovalDigest(record: AuthorityFields): string {
  const canonical = {
    digest_version: RENEWAL_APPROVAL_DIGEST_VERSION,
    schema_version: record.schema_version,
    approval_id: record.approval_id,
    session_id: record.session_id,
    round_count: record.round_count,
    ...(record.project_name !== undefined ? { project_name: record.project_name } : {}),
    ...(record.snapshot_id !== undefined ? { snapshot_id: record.snapshot_id } : {}),
    decisions: [...record.decisions]
      .sort((a, b) => (a.claim_id < b.claim_id ? -1 : 1))
      .map((d) => ({
        claim_id: d.claim_id,
        kind: d.kind,
        ...(d.selected_option !== undefined ? { selected_option: d.selected_option } : {}),
        ...(d.free_text !== undefined ? { free_text: d.free_text } : {}),
        evidence: { source: d.evidence.source, answer_text: d.evidence.answer_text, hash: d.evidence.hash },
      })),
  };
  return sha256Content(JSON.stringify(canonical));
}

export interface BuildRenewalApprovalArgs {
  approvalId: string;
  sessionId: string;
  roundCount: number;
  approvedAt: string;
  projectName?: string;
  snapshotId?: string;
}

export function buildRenewalApprovalRecord(
  payload: RenewalDecisionSet,
  args: BuildRenewalApprovalArgs,
): RenewalApprovalRecord {
  const parsed = RenewalDecisionSetSchema.parse(payload);
  const body = {
    schema_version: 1 as const,
    approval_id: args.approvalId,
    session_id: args.sessionId,
    round_count: args.roundCount,
    ...(args.projectName !== undefined ? { project_name: args.projectName } : {}),
    ...(args.snapshotId !== undefined ? { snapshot_id: args.snapshotId } : {}),
    decisions: [...parsed.decisions].sort((a, b) => (a.claim_id < b.claim_id ? -1 : 1)),
  };
  return RenewalApprovalRecordSchema.parse({
    ...body,
    approved_at: args.approvedAt,
    content_digest: renewalApprovalDigest(body),
  });
}

export function nextRenewalApprovalId(approvalsDir: string): string {
  let max = 0;
  try {
    for (const f of readdirSync(approvalsDir)) {
      const m = /^APPR-(\d{4})\.json$/.exec(f);
      if (m) max = Math.max(max, Number.parseInt(m[1], 10));
    }
  } catch {
    // empty/missing dir → start at 1
  }
  return `APPR-${String(max + 1).padStart(4, '0')}`;
}

export type WriteApprovalResult = { ok: true; path: string } | { ok: false; code: 'already_exists'; message: string };

export function writeRenewalApproval(dir: string, record: RenewalApprovalRecord): WriteApprovalResult {
  const path = join(dir, `${record.approval_id}.json`);
  try {
    writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'EEXIST') {
      return {
        ok: false,
        code: 'already_exists',
        message: `renewal approval ${record.approval_id} already exists — approval records are immutable`,
      };
    }
    throw e;
  }
  return { ok: true, path };
}

export type RenewalApprovalLoad =
  | { ok: true; record: RenewalApprovalRecord }
  | { ok: false; code: 'approval_missing' | 'approval_corrupt' | 'digest_mismatch' | 'evidence_mismatch'; message: string };

/**
 * F3/H-09 — load an approval record SELF-VERIFYING: the stored
 * `content_digest` is recomputed from the stored decisions and compared, and
 * each decision's locally-hashed evidence (`evidence.hash` over
 * `answer_text`) is recomputed too. A tampered digest, tampered answer text,
 * or hand-written record fails closed — approval ids are never trusted as
 * strings.
 */
export function loadRenewalApproval(path: string): RenewalApprovalLoad {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return { ok: false, code: 'approval_missing', message: `approval record not found: ${path}` };
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    return { ok: false, code: 'approval_corrupt', message: `approval record is not valid JSON (${(e as Error).message})` };
  }
  const parsed = RenewalApprovalRecordSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, code: 'approval_corrupt', message: `approval record failed schema validation (${issue.path.join('.')}: ${issue.message})` };
  }
  const record = parsed.data;
  // INV-D1: recompute over ALL authority-bearing fields — any tampered
  // identity/state/decision field fails the digest, fail-closed.
  const recomputed = renewalApprovalDigest({
    schema_version: record.schema_version,
    approval_id: record.approval_id,
    session_id: record.session_id,
    round_count: record.round_count,
    ...(record.project_name !== undefined ? { project_name: record.project_name } : {}),
    ...(record.snapshot_id !== undefined ? { snapshot_id: record.snapshot_id } : {}),
    decisions: record.decisions,
  });
  if (recomputed !== record.content_digest) {
    return {
      ok: false,
      code: 'digest_mismatch',
      message: `approval ${record.approval_id} content digest does not match its decisions (stored ${record.content_digest.slice(0, 19)}…, recomputed ${recomputed.slice(0, 19)}…) — the record was tampered with or hand-edited`,
    };
  }
  for (const d of record.decisions) {
    const recomputedEvidence = `sha256:${createHash('sha256').update(d.evidence.answer_text, 'utf8').digest('hex')}`;
    if (recomputedEvidence !== d.evidence.hash) {
      return {
        ok: false,
        code: 'evidence_mismatch',
        message: `approval ${record.approval_id} decision ${d.claim_id}: evidence hash does not match its answer text — the record was tampered with`,
      };
    }
  }
  return { ok: true, record };
}
