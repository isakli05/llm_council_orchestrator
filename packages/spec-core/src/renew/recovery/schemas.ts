/**
 * Recovery contracts (STEP 6). The LLM output schema deliberately has NO
 * status/trust field: trust is ASSIGNED by the pipeline after deterministic
 * anchor verification — the model never labels its own claims as confirmed.
 */
import { z } from 'zod';
import { CodeAnchorPayloadSchema } from '../../schemas/evidence';
import { CitationClaimSchema } from '../trust/evidence';

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

/**
 * S3-H-01 (trust kernel): the MODEL-SIDE anchor is a CITATION CLAIM — a
 * context id the server supplied (plus an optional subrange NARROWING).
 * Model-authored paths/hashes/node ids are not trusted coordinates; the wire
 * schema does not carry them. The pipeline resolves claims through
 * trust/evidence.resolveCitation into the persisted CodeAnchorPayload.
 */
export const RecoveryHypothesisSchema = z
  .object({
    id: Id('BHV'),
    statement: z.string().min(1).max(2_000),
    category: z.enum(RECOVERY_CATEGORIES),
    confidence: z.enum(['low', 'medium', 'high']),
    anchors: z.array(CitationClaimSchema).min(1).max(20),
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
    anchors: z.array(CitationClaimSchema).min(1).max(20),
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

/**
 * INV-C (S2-C-02): what an anchor verification PROVES. `ok` means PROVENANCE
 * — the cited bytes exist at the cited state (hash recompute, supplied-node
 * and range coherence). It says NOTHING about whether the source semantically
 * SUPPORTS the claim: no deterministic algorithm proves business-rule
 * entailment from code, and the system never pretends otherwise. `scope`
 * states how claim-specific the anchor is — a whole-file anchor (no node, no
 * range) proves the file was supplied, not that any particular statement in
 * it backs the claim.
 */
export const AnchorScopeSchema = z.enum(['whole_file', 'range', 'node_range']);
export type AnchorScope = z.infer<typeof AnchorScopeSchema>;

/**
 * INV-C: semantic support status of a promoted claim — always distinct from
 * provenance. V1 contract: machine-recovered hypotheses are 'unvalidated'
 * (the pipeline never sets 'validated' — it cannot know); a human parity
 * ruling sets 'human_confirmed'; 'contradicted' is reserved for future
 * explicit contradiction evidence.
 */
export const SupportStatusSchema = z.enum(['unvalidated', 'human_confirmed', 'contradicted']);

export const AnchorResultSchema = z
  .object({
    path: z.string(),
    ok: z.boolean(),
    /** Provenance scope of the verified anchor (INV-C). */
    scope: AnchorScopeSchema,
    code: z.string().optional(),
  })
  .strict();
export type AnchorResult = z.infer<typeof AnchorResultSchema>;

/** A promoted claim's anchors are the SERVER-RESOLVED citations (path,
 *  whole-file hash, contained range, node binding) — never the model's raw
 *  context-id claims (S3-H-01: resolution happens in trust/evidence). */
export const VerifiedHypothesisSchema = RecoveryHypothesisSchema.omit({ anchors: true })
  .extend({
    anchors: z.array(CodeAnchorPayloadSchema).min(1).max(20),
    status: z.literal('hypothesized'),
    anchor_results: z.array(AnchorResultSchema),
    /** INV-C: semantic support is NOT machine-validated in V1 — ever. */
    support_status: SupportStatusSchema,
  })
  .strict();

export const VerifiedUncertaintySchema = RecoveryUncertaintySchema.omit({ anchors: true })
  .extend({
    anchors: z.array(CodeAnchorPayloadSchema).min(1).max(20),
    anchor_results: z.array(AnchorResultSchema),
  })
  .strict();

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
    /** Wall-clock duration of the paid portion (ms) when measurable. */
    latency_ms: z.number().int().nonnegative().optional(),
    /** Byte size of the final assembled prompt (the paid payload). */
    prompt_bytes: z.number().int().nonnegative().optional(),
    /** Provider-reported cost in its own currency, when reported. */
    cost: z.number().nonnegative().optional(),
    currency: z.string().min(1).max(10).optional(),
    /** Resolved model actually serving the role (when the transport reports
     * one that differs from the requested route identity). */
    resolved_model: z.string().min(1).optional(),
    /** Upstream provider that served the request, when reported (INV-F). */
    upstream_provider: z.string().min(1).optional(),
    /** Provider request/generation id, when reported (INV-F). */
    request_id: z.string().min(1).optional(),
    /** Provider-reported reasoning/cache token detail, when available. */
    reasoning_tokens: z.number().int().nonnegative().optional(),
    cache_read_tokens: z.number().int().nonnegative().optional(),
    cache_write_tokens: z.number().int().nonnegative().optional(),
    /** True when the transport failed before returning a usable response —
     * spend happened but no content was produced (honest failure trail). */
    transport_failed: z.boolean().optional(),
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
        /** L4 output redactions applied before persistence (C-07). */
        output_redactions: z.number().int().nonnegative().optional(),
      })
      .strict(),
    outcome: z.enum(['validated', 'blocked_schema', 'blocked_stale', 'transport_failed', 'blocked_insufficient_context', 'blocked_empty', 'blocked_prompt_budget']),
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
    /** Why a blocked_stale run refused promotion (C-10). */
    staleness_reasons: z.array(z.string()).max(20).optional(),
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
