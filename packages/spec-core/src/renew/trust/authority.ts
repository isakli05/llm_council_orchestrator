import { z } from 'zod';
import { sha256Content } from './canonical';
import { domainDigest } from './canonical';
import { TrustAuthorityError } from './errors';

/**
 * Trust Kernel — AuthorityGrant (third-audit S3-C-04, S3-H-08; reopening
 * C-08/S2-C-04).
 *
 * Human authority is STRUCTURED CAPABILITY DATA, never text. The previous
 * digest (v2) bound every field that was PRESENT — but scope
 * (`project_name`, `snapshot_id`) was optional, omitted fields fell out of
 * the digest, the gate never compared the loaded record's own id to the
 * reference that resolved it, and no consumer compared the record's project
 * to the active project. A self-consistent, digest-valid, UNSCOPED record
 * filed under a referenced filename could therefore authorize canonical
 * DROP.
 *
 * v3 closes the class:
 *   - scope is REQUIRED (`project_name`, `snapshot_id`) and digest-bound;
 *   - `validateRenewalApproval` enforces referential integrity: the loaded
 *     record's `approval_id` MUST equal the reference that resolved it, and
 *     when an active context is supplied, project AND snapshot MUST join
 *     it — mismatch is a typed refusal, never a silent pass;
 *   - answer-text evidence stays hash-bound per decision;
 *   - v2 records fail closed (pre-release dev-state policy, identical to
 *     the v1→v2 transition: re-approve after refresh).
 *
 * Destructive decisions continue to rule ONLY through canonical structured
 * option ids (`preserve` | `change` | `drop`) — free text explains, it
 * never authorizes. Strategy selection via the workspace must resolve a
 * real approval; the `--strategy` CLI flag is a human action at the CLI
 * boundary and is labeled as such everywhere it is rendered.
 */

export const RENEWAL_APPROVAL_DIGEST_VERSION = 3;

const Sha256 = z.string().regex(/^sha256:[0-9a-f]{64}$/);

const ApprovalDecisionSchema = z
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

export const RenewalApprovalRecordSchema = z
  .object({
    schema_version: z.literal(1),
    approval_id: z.string().regex(/^APPR-\d{4}$/),
    session_id: z.string().min(1),
    round_count: z.number().int().positive(),
    approved_at: z.string().min(1),
    // v3: scope is REQUIRED — an unscoped grant is unrepresentable.
    project_name: z.string().min(1).max(200),
    snapshot_id: z.string().regex(/^RSN-[0-9a-f]{16}$/),
    decisions: z.array(ApprovalDecisionSchema).min(1),
    content_digest: Sha256,
  })
  .strict();

export type RenewalApprovalRecord = z.infer<typeof RenewalApprovalRecordSchema>;
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

/** Authority-bearing fields — everything that changes WHO/WHAT is authorized. */
type AuthorityBody = Omit<RenewalApprovalRecord, 'approved_at' | 'content_digest'>;

function authorityBody(record: RenewalApprovalRecord): AuthorityBody {
  const { approved_at: _approvedAt, content_digest: _digest, ...body } = record;
  return body;
}

/**
 * Canonical authority digest v3: domain-separated (an approval digest can
 * never be reinterpreted by another trust domain), version-tagged, and over
 * the COMPLETE authority body — decisions explicitly projected and sorted
 * by claim_id so list order never changes authorization bytes.
 */
export function renewalApprovalDigest(record: RenewalApprovalRecord): `sha256:${string}` {
  const body = authorityBody(record);
  const payload = {
    schema_version: body.schema_version,
    approval_id: body.approval_id,
    session_id: body.session_id,
    round_count: body.round_count,
    project_name: body.project_name,
    snapshot_id: body.snapshot_id,
    decisions: [...body.decisions]
      .sort((a, b) => (a.claim_id < b.claim_id ? -1 : 1))
      .map((d) => ({
        claim_id: d.claim_id,
        kind: d.kind,
        selected_option: d.selected_option,
        free_text: d.free_text,
        evidence: d.evidence,
      })),
  };
  return domainDigest('LCO:AUTHORITY', RENEWAL_APPROVAL_DIGEST_VERSION, payload);
}

/**
 * Build a digest-valid record (the ONLY constructor — free text stays
 * context, the structured selection stays the act).
 */
export function buildRenewalApprovalRecord(args: {
  approval_id: string;
  session_id: string;
  round_count: number;
  approved_at: string;
  project_name: string;
  snapshot_id: string;
  decisions: ApprovalDecision[];
}): RenewalApprovalRecord {
  const sorted = [...args.decisions].sort((a, b) => (a.claim_id < b.claim_id ? -1 : 1));
  const record: RenewalApprovalRecord = {
    schema_version: 1,
    approval_id: args.approval_id,
    session_id: args.session_id,
    round_count: args.round_count,
    approved_at: args.approved_at,
    project_name: args.project_name,
    snapshot_id: args.snapshot_id,
    decisions: sorted,
    content_digest: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
  };
  record.content_digest = renewalApprovalDigest(record);
  return record;
}

/** The active context a grant must join before it authorizes anything. */
export interface ActiveAuthorityScope {
  projectName: string;
  snapshotId: string;
}

/**
 * Full referential-integrity validation (S3-C-04). Checks, in order:
 *   1. schema shape (strict; v2's optional-scope shape no longer parses);
 *   2. `expectedApprovalId` — the loaded record's own id MUST equal the
 *      reference that resolved it (filename/reference joins fail CLOSED);
 *   3. digest v3 over the complete authority body;
 *   4. per-decision answer-text evidence hash;
 *   5. active-scope join — record project AND snapshot must equal the
 *      active project/snapshot when a context is supplied.
 * Throws `TrustAuthorityError`; returns the validated record otherwise.
 */
export function validateRenewalApproval(args: {
  record: unknown;
  expectedApprovalId?: string;
  activeScope?: ActiveAuthorityScope;
  sourceLabel?: string;
}): RenewalApprovalRecord {
  const label = args.sourceLabel ?? 'approval record';
  const parsed = RenewalApprovalRecordSchema.safeParse(args.record);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue.path.join('.');
    throw new TrustAuthorityError(
      'approval_corrupt',
      `${label} is not a valid v3 renewal approval${where ? ` (${where})` : ''}: ${issue.message}` +
        ` — if this is a pre-v3 record from an earlier development build, re-run the review to re-approve`,
      args.expectedApprovalId,
    );
  }
  const record = parsed.data;
  if (args.expectedApprovalId !== undefined && record.approval_id !== args.expectedApprovalId) {
    throw new TrustAuthorityError(
      'id_mismatch',
      `${label} carries approval_id ${record.approval_id} but was resolved through reference ` +
        `${args.expectedApprovalId} — an approval may only authorize through its OWN identity`,
      args.expectedApprovalId,
    );
  }
  const recomputed = renewalApprovalDigest(record);
  if (recomputed !== record.content_digest) {
    throw new TrustAuthorityError(
      'digest_mismatch',
      `${label} failed its authority digest (stored ${record.content_digest}, recomputed ${recomputed}) — ` +
        `any authority-bearing tamper refuses the whole record`,
      record.approval_id,
    );
  }
  for (const decision of record.decisions) {
    if (sha256Content(decision.evidence.answer_text) !== decision.evidence.hash) {
      throw new TrustAuthorityError(
        'evidence_mismatch',
        `${label}: decision ${decision.claim_id} evidence hash does not match its answer text`,
        record.approval_id,
      );
    }
  }
  if (args.activeScope !== undefined) {
    if (record.project_name !== args.activeScope.projectName) {
      throw new TrustAuthorityError(
        'project_mismatch',
        `${label} was granted for project '${record.project_name}' but the active project is ` +
          `'${args.activeScope.projectName}' — a grant only authorizes within its own project`,
        record.approval_id,
      );
    }
    if (record.snapshot_id !== args.activeScope.snapshotId) {
      throw new TrustAuthorityError(
        'snapshot_mismatch',
        `${label} was granted for snapshot ${record.snapshot_id} but the active snapshot is ` +
          `${args.activeScope.snapshotId} — a grant only authorizes within its own snapshot`,
        record.approval_id,
      );
    }
  }
  return record;
}

/** The canonical destructive/parity option ids — the ONLY text→ruling map. */
export const CANONICAL_PARITY_RULINGS = ['preserve', 'change', 'drop'] as const;
export type CanonicalParityRuling = (typeof CANONICAL_PARITY_RULINGS)[number];

/** Exact identity membership: canonical id or unresolved (never a keyword guess). */
export function canonicalRuling(option: string | undefined): CanonicalParityRuling | undefined {
  return CANONICAL_PARITY_RULINGS.find((r) => r === option);
}

// --- strategy authority (S3-H-08) -------------------------------------------------------

export const STRATEGY_CLAIM_ID = 'STG-0001';

export const MODERNIZATION_STRATEGIES = [
  'in_place',
  'strangler',
  'full_rewrite',
  'service_extraction',
  'framework_migration',
  'language_migration',
] as const;

export type ModernizationStrategy = (typeof MODERNIZATION_STRATEGIES)[number];

export const StrategyDecisionSchema = z
  .object({
    schema_version: z.literal(1),
    strategy: z.enum(MODERNIZATION_STRATEGIES),
    rationale: z.string().trim().min(1).max(4_000),
    /** Structural invariant: only humans select strategies. */
    selected_by: z.literal('human'),
    /** How the human acted: workspace approval or explicit CLI flag. */
    selected_via: z.enum(['workspace', 'flag']),
    /** REQUIRED when selected_via === 'workspace' — the approval that
     *  authorized the selection (schema-refined below; S3-H-08: unverified
     *  workspace authority is unrepresentable). */
    approval_id: z.string().regex(/^APPR-\d{4}$/).optional(),
    selected_at: z.string().min(1),
    snapshot_id: z.string().regex(/^RSN-[0-9a-f]{16}$/),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.selected_via === 'workspace' && d.approval_id === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['approval_id'],
        message:
          'a workspace strategy selection must carry the approval_id that authorized it — ' +
          'unverified workspace authority is unrepresentable (S3-H-08)',
      });
    }
  });

export type StrategyDecision = z.infer<typeof StrategyDecisionSchema>;

/**
 * Verify a strategy decision's authority: workspace selections must resolve
 * a valid approval (own identity, digest, evidence) that JOINS the active
 * scope AND carries a canonical selection of THIS strategy on the strategy
 * claim. Flag selections pass as CLI-boundary human actions (rendered as
 * such); there is no silent third path.
 */
export function verifyStrategyAuthority(args: {
  decision: StrategyDecision;
  resolveApproval: (approvalId: string) => RenewalApprovalRecord;
  activeScope: ActiveAuthorityScope;
}): void {
  if (args.decision.snapshot_id !== args.activeScope.snapshotId) {
    throw new TrustAuthorityError(
      'snapshot_mismatch',
      `strategy decision was made for snapshot ${args.decision.snapshot_id} but the active snapshot is ` +
        `${args.activeScope.snapshotId} — re-select the strategy after refresh`,
    );
  }
  if (args.decision.selected_via === 'flag') return; // CLI-boundary human action
  const approvalId = args.decision.approval_id!;
  const record = args.resolveApproval(approvalId);
  const decision = record.decisions.find((d) => d.claim_id === STRATEGY_CLAIM_ID);
  if (decision === undefined) {
    throw new TrustAuthorityError(
      'unresolved_approval',
      `approval ${approvalId} carries no strategy decision (${STRATEGY_CLAIM_ID}) — it cannot ` +
        `authorize a workspace strategy selection`,
      approvalId,
    );
  }
  if (decision.selected_option !== args.decision.strategy) {
    throw new TrustAuthorityError(
      'unresolved_approval',
      `approval ${approvalId} selected '${decision.selected_option ?? '(free text)'}' for the strategy ` +
        `claim but the decision records '${args.decision.strategy}' — the approval authorizes only ` +
        `its own structured selection`,
      approvalId,
    );
  }
}
