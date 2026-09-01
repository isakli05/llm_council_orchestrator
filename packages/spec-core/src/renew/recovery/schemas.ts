/**
 * Recovery contracts (STEP 6). The LLM output schema deliberately has NO
 * status/trust field: trust is ASSIGNED by the pipeline after deterministic
 * anchor verification — the model never labels its own claims as confirmed.
 */
import { z } from 'zod';
import { CodeAnchorPayloadSchema } from '../../schemas/evidence';

const Sha256 = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const Id = (prefix: string) => z.string().regex(new RegExp(`^${prefix}-\\d{4}$`));

export const RECOVERY_CATEGORIES = [
  'business_rule',
  'side_effect',
  'behavior_contract',
  'migration_risk',
  'security_sensitive',
  'data_behavior',
  'modernization_concern',
] as const;

// --- LLM output contract (validated; no status field by design) --------------

export const RecoveryHypothesisSchema = z
  .object({
    id: Id('BHV'),
    statement: z.string().min(1).max(2_000),
    category: z.enum(RECOVERY_CATEGORIES),
    confidence: z.enum(['low', 'medium', 'high']),
    anchors: z.array(CodeAnchorPayloadSchema).min(1).max(20),
    rationale: z.string().min(1).max(4_000),
  })
  .strict();

export const RecoveryUncertaintySchema = z
  .object({
    id: Id('UNC'),
    question: z.string().min(1).max(1_000),
    impact: z.enum(['low', 'medium', 'high']),
    options: z
      .array(
        z
          .object({ option: z.string().min(1).max(200), note: z.string().max(1_000).optional() })
          .strict(),
      )
      .min(2)
      .max(6),
    anchors: z.array(CodeAnchorPayloadSchema).min(1).max(20),
  })
  .strict();

export const RecoveryOutputSchema = z
  .object({
    hypotheses: z.array(RecoveryHypothesisSchema).max(100),
    uncertainties: z.array(RecoveryUncertaintySchema).max(50),
    coverage_notes: z.array(z.string().min(1).max(1_000)).max(20),
  })
  .strict();

export type RecoveryOutput = z.infer<typeof RecoveryOutputSchema>;
export type RecoveryHypothesis = z.infer<typeof RecoveryHypothesisSchema>;
export type RecoveryUncertainty = z.infer<typeof RecoveryUncertaintySchema>;

// --- persisted (immutable) analysis record -------------------------------------

export const AnchorResultSchema = z
  .object({
    path: z.string(),
    ok: z.boolean(),
    code: z.string().optional(),
  })
  .strict();
export type AnchorResult = z.infer<typeof AnchorResultSchema>;

export const VerifiedHypothesisSchema = RecoveryHypothesisSchema.extend({
  status: z.literal('hypothesized'),
  anchor_results: z.array(AnchorResultSchema),
}).strict();

export const VerifiedUncertaintySchema = RecoveryUncertaintySchema.extend({
  anchor_results: z.array(AnchorResultSchema),
}).strict();

export const RejectedItemSchema = z
  .object({
    id: z.string(),
    kind: z.enum(['hypothesis', 'uncertainty']),
    reasons: z.array(z.string()).max(20),
  })
  .strict();

export const AnalysisUsageSchema = z
  .object({
    calls: z.number().int().nonnegative(),
    attempts: z.number().int().nonnegative(),
    in_tokens: z.number().int().nonnegative(),
    out_tokens: z.number().int().nonnegative(),
    usage_known: z.boolean(),
  })
  .strict();

export const AnalysisRecordSchema = z
  .object({
    schema_version: z.literal(1),
    analysis_id: Id('AN'),
    snapshot_id: z.string().regex(/^RSN-[0-9a-f]{16}$/),
    created_at: z.string().min(1),
    role: z.literal('renew_recover'),
    model: z
      .object({
        gateway: z.string(),
        provider_kind: z.string(),
        requested_model: z.string(),
      })
      .strict(),
    prompt_protocol: z.string().min(1),
    scope: z.record(z.unknown()),
    input: z
      .object({
        context_digest: Sha256,
        item_count: z.number().int().nonnegative(),
        slice_count: z.number().int().nonnegative(),
        truncated: z.boolean(),
        warnings: z.array(z.string()).max(50),
      })
      .strict(),
    outcome: z.enum(['validated', 'blocked_schema']),
    validation: z
      .object({
        schema_ok: z.boolean(),
        retry_used: z.boolean(),
        issues: z.array(z.string()).max(20),
        anchors_total: z.number().int().nonnegative(),
        anchors_ok: z.number().int().nonnegative(),
        anchors_failed: z.number().int().nonnegative(),
      })
      .strict(),
    promoted: z
      .object({
        hypotheses: z.array(VerifiedHypothesisSchema),
        uncertainties: z.array(VerifiedUncertaintySchema),
      })
      .strict(),
    rejected: z.array(RejectedItemSchema),
    coverage_notes: z.array(z.string()).max(20),
    usage: AnalysisUsageSchema,
  })
  .strict();

export type AnalysisRecord = z.infer<typeof AnalysisRecordSchema>;
export type VerifiedHypothesis = z.infer<typeof VerifiedHypothesisSchema>;
export type VerifiedUncertainty = z.infer<typeof VerifiedUncertaintySchema>;
