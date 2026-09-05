/**
 * Renewal approval records (STEP 8): the pluggable approved-artifact schema
 * the audit called for (03 §B.6 point c) — approvals embed RENEWAL decisions
 * (strategy selection, uncertainty rulings, overlay reviews) with canonical,
 * locally-hashed user evidence, instead of a SpecBundle. Immutable, 0600,
 * same APPR-NNNN lineage discipline as the spec workspace.
 *
 * TRUST KERNEL (S3-C-04): the record schema, authority digest v3 (REQUIRED
 * project/snapshot scope, referential-integrity validation) and the builder
 * live in trust/authority.ts — the ONE implementation. This module keeps the
 * file-level operations (id allocation, immutable write via trust/fs) and
 * re-exports the kernel surface for existing imports.
 */
import { readdirSync } from 'node:fs';

import { join } from 'node:path';
import { z } from 'zod';
import { authorizedCreateExclusive, authorizedRead } from '../trust/fs';
import {
  RenewalApprovalRecordSchema,
  buildRenewalApprovalRecord,
  renewalApprovalDigest,
  validateRenewalApproval,
  type ApprovalDecision,
  type RenewalApprovalRecord,
} from '../trust/authority';

export { RenewalApprovalRecordSchema, buildRenewalApprovalRecord, renewalApprovalDigest };
export type { ApprovalDecision, RenewalApprovalRecord };

const RenewalDecisionSetSchema = z
  .object({ decisions: z.array(RenewalApprovalRecordSchema.shape.decisions.element).min(1) })
  .strict();
export type RenewalDecisionSet = z.infer<typeof RenewalDecisionSetSchema>;

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

/** Immutable write-once record via the trusted exclusive-create primitive. */
export function writeRenewalApproval(
  projectDir: string,
  approvalsDir: string,
  record: RenewalApprovalRecord,
): WriteApprovalResult {
  const path = join(approvalsDir, `${record.approval_id}.json`);
  try {
    authorizedCreateExclusive({ projectDir, path, content: `${JSON.stringify(record, null, 2)}\n` });
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { code?: string };
    if (err.code === 'record_exists') {
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
  | { ok: false; code: 'approval_missing' | 'approval_corrupt' | 'digest_mismatch' | 'evidence_mismatch' | 'id_mismatch' | 'project_mismatch' | 'snapshot_mismatch'; message: string };

/**
 * Self-verifying load (kernel-validated): reads the record and passes it
 * through trust/authority.validateRenewalApproval — v3 schema, authority
 * digest, per-decision evidence hashes. v2 (optional-scope) records fail
 * closed as pre-release dev state: re-run the review to re-approve.
 */
export function loadRenewalApproval(projectDir: string, path: string): RenewalApprovalLoad {
  let text: string;
  try {
    // S4-M-01 (B1 closure): trusted approval reads go through the authorized
    // reader (chain-validated) — never raw readFileSync.
    text = authorizedRead({ projectDir, path });
  } catch {
    return { ok: false, code: 'approval_missing', message: `approval record not found: ${path}` };
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    return { ok: false, code: 'approval_corrupt', message: `approval record is not valid JSON (${(e as Error).message})` };
  }
  try {
    return { ok: true, record: validateRenewalApproval({ record: value, sourceLabel: `approval record ${path}` }) };
  } catch (e) {
    const err = e as Error & { code?: string };
    const code = (['digest_mismatch', 'evidence_mismatch', 'id_mismatch', 'project_mismatch', 'snapshot_mismatch'] as const).includes(
      err.code as never,
    )
      ? (err.code as RenewalApprovalLoad extends { ok: false; code: infer C } ? C : never)
      : 'approval_corrupt';
    return { ok: false, code, message: err.message };
  }
}
