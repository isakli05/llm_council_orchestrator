/**
 * Trust Kernel groundwork (S4-M-02) — the PURE overlay/parity store-record
 * leaf: schemas, types, id helpers, and the strict fail-closed parsers.
 *
 * `renew/overlay/overlay.ts` and `renew/parity/ledger.ts` are domain modules
 * (persist wrappers, folds, gates) that import the trust kernel downward.
 * `trust/state.ts` needs only the RECORD CONTRACTS and PARSERS from them;
 * those live here so the kernel's dependency edge lands on pure data
 * definitions, not on domain modules. No trust imports, no fs.
 */
import { z } from 'zod';
import { CodeAnchorPayloadSchema } from '../../schemas/evidence';

// --- overlay ---------------------------------------------------------------------------

/** The audit-approved relation vocabulary (STEP 7) — do not extend speculatively. */
export const OVERLAY_RELATIONS = [
  'renewal_risk',
  'business_rule',
  'parity_required',
  'replacement_target',
  'migration_priority',
  'deprecated_candidate',
  'target_component',
  'behavior_preserve',
  'behavior_change',
  'security_risk',
  'data_migration',
  'manual_review',
  'uncertain_behavior',
] as const;

export type OverlayRelation = (typeof OVERLAY_RELATIONS)[number];

export const OverlayEntityRefSchema = z
  .object({
    node_id: z.string().min(1).max(500).optional(),
    path: z.string().min(1).max(1_000),
    symbol: z.string().min(1).max(500).optional(),
  })
  .strict();

export const OverlayRecordSchema = z
  .object({
    id: z.string().regex(/^OVL-\d{4}$/),
    relation: z.enum(OVERLAY_RELATIONS),
    subject: OverlayEntityRefSchema,
    value: z.string().min(1).max(4_000).optional(),
    anchors: z.array(CodeAnchorPayloadSchema).min(1).max(20),
    snapshot_id: z.string().regex(/^RSN-[0-9a-f]{16}$/),
    confidence: z.enum(['low', 'medium', 'high']),
    status: z.enum(['active', 'stale', 'superseded']),
    lineage: z
      .object({
        analysis_id: z.string().regex(/^AN-\d{4}$/).optional(),
        decision_id: z.string().min(1).max(100).optional(),
        approval_id: z.string().min(1).max(100).optional(),
      })
      .strict(),
    note: z.string().max(4_000).optional(),
  })
  .strict();

export const OverlayStoreSchema = z
  .object({
    schema_version: z.literal(1),
    snapshot_id: z.string().regex(/^RSN-[0-9a-f]{16}$/),
    records: z.array(OverlayRecordSchema),
  })
  .strict();

export type OverlayRecord = z.infer<typeof OverlayRecordSchema>;
export type OverlayStore = z.infer<typeof OverlayStoreSchema>;

export function emptyOverlay(snapshotId: string): OverlayStore {
  return { schema_version: 1, snapshot_id: snapshotId, records: [] };
}

export function nextOverlayId(existingIds: readonly string[]): string {
  let max = 0;
  for (const id of existingIds) {
    const m = /^OVL-(\d{4})$/.exec(id);
    if (m) max = Math.max(max, Number.parseInt(m[1], 10));
  }
  return `OVL-${String(max + 1).padStart(4, '0')}`;
}

export type OverlayLoad =
  | { ok: true; store: OverlayStore }
  | { ok: false; code: 'overlay_missing' | 'overlay_corrupt'; message: string };

/** Pure parse+validate of overlay.json TEXT (schema + duplicate-state checks). */
export function parseOverlayStore(text: string): OverlayLoad {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    return { ok: false, code: 'overlay_corrupt', message: `overlay.json is not valid JSON (${(e as Error).message})` };
  }
  const parsed = OverlayStoreSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue.path.join('.');
    return {
      ok: false,
      code: 'overlay_corrupt',
      message: `overlay.json failed schema validation (${where ? `${where}: ` : ''}${issue.message})`,
    };
  }
  // M-02: duplicate record ids and duplicate ACTIVE (relation, subject) pairs
  // are corrupt state, not silent last-write-wins.
  const seenIds = new Set<string>();
  const seenActive = new Set<string>();
  for (const rec of parsed.data.records) {
    if (seenIds.has(rec.id)) {
      return { ok: false, code: 'overlay_corrupt', message: `overlay.json contains duplicate record id ${rec.id} — refusing ambiguous state` };
    }
    seenIds.add(rec.id);
    if (rec.status === 'active') {
      const key = `${rec.relation}|${rec.subject.path}${rec.subject.symbol ?? ''}`;
      if (seenActive.has(key)) {
        return { ok: false, code: 'overlay_corrupt', message: `overlay.json contains duplicate active ${rec.relation} record for ${rec.subject.path} — resolve the conflict explicitly` };
      }
      seenActive.add(key);
    }
  }
  return { ok: true, store: parsed.data };
}

// --- parity ----------------------------------------------------------------------------

export const ParityEvidenceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('code_anchor'), anchor: CodeAnchorPayloadSchema }).strict(),
  z
    .object({ kind: z.literal('user_decision'), claim_id: z.string().regex(/^(UNC|OVL|STG)-\d{4}$/) })
    .strict(),
]);

export const ParityEntrySchema = z
  .object({
    id: z.string().regex(/^PAR-\d{4}$/),
    behavior: z.string().min(1).max(2_000),
    ruling: z.enum(['preserve', 'change', 'drop', 'unresolved']),
    rationale: z.string().min(1).max(4_000).optional(),
    evidence: z.array(ParityEvidenceSchema).min(1).max(20),
    snapshot_id: z.string().regex(/^RSN-[0-9a-f]{16}$/),
    source_analysis: z.string().regex(/^AN-\d{4}$/).optional(),
    /** The clarification claim whose approved answer rules this entry. */
    decision_claim_id: z.string().regex(/^(UNC|OVL|PAR)-\d{4}$/).optional(),
    approval_id: z.string().regex(/^APPR-\d{4}$/).optional(),
    /**
     * INV-C: semantic support status of the underlying claim — DISTINCT from
     * provenance (the anchors' byte verification). 'unvalidated' is the honest
     * default for machine-recovered behavior (no deterministic algorithm
     * proves business-rule entailment from code); a human ruling sets
     * 'human_confirmed'. Absent = unvalidated (pre-field records).
     */
    support_status: z.enum(['unvalidated', 'human_confirmed', 'contradicted']).optional(),
    note: z.string().max(4_000).optional(),
  })
  .strict()
  .superRefine((e, ctx) => {
    if (e.ruling !== 'unresolved' && e.rationale === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `a ${e.ruling} ruling requires a rationale` });
    }
    if (e.ruling === 'drop' && e.approval_id === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'a DROP ruling requires explicit approval lineage (destructive acts are human)' });
    }
  });

export const ParityStoreSchema = z
  .object({
    schema_version: z.literal(1),
    snapshot_id: z.string().regex(/^RSN-[0-9a-f]{16}$/),
    records: z.array(ParityEntrySchema),
  })
  .strict();

export type ParityEntry = z.infer<typeof ParityEntrySchema>;
export type ParityStore = z.infer<typeof ParityStoreSchema>;

export function emptyParity(snapshotId: string): ParityStore {
  return { schema_version: 1, snapshot_id: snapshotId, records: [] };
}

export function nextParityId(ids: readonly string[]): string {
  let max = 0;
  for (const id of ids) {
    const m = /^PAR-(\d{4})$/.exec(id);
    if (m) max = Math.max(max, Number.parseInt(m[1], 10));
  }
  return `PAR-${String(max + 1).padStart(4, '0')}`;
}

export type ParityLoad =
  | { ok: true; store: ParityStore }
  | { ok: false; code: 'parity_missing' | 'parity_corrupt'; message: string };

/** Pure parse+validate of parity.json TEXT (schema + duplicate-authority checks). */
export function parseParityStore(text: string): ParityLoad {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    return { ok: false, code: 'parity_corrupt', message: `parity.json is not valid JSON (${(e as Error).message})` };
  }
  const parsed = ParityStoreSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      code: 'parity_corrupt',
      message: `parity.json failed schema validation (${issue.path.join('.')}: ${issue.message})`,
    };
  }
  // M-03 + S2-M-02 (INV-D3): duplicate ids AND semantically duplicate entries
  // — two records for the SAME behavior on one store, whatever their ids or
  // rulings — are duplicated authority and corrupt state. Never silently
  // resolved, never first-wins.
  const seenIds = new Set<string>();
  const byBehavior = new Map<string, { id: string; ruling: string }>();
  for (const rec of parsed.data.records) {
    if (seenIds.has(rec.id)) {
      return { ok: false, code: 'parity_corrupt', message: `parity.json contains duplicate entry id ${rec.id} — refusing ambiguous state` };
    }
    seenIds.add(rec.id);
    const existing = byBehavior.get(rec.behavior);
    if (existing !== undefined) {
      if (existing.ruling !== rec.ruling) {
        return {
          ok: false,
          code: 'parity_corrupt',
          message: `parity.json holds contradictory rulings for the same behavior (${existing.id}: ${existing.ruling} vs ${rec.id}: ${rec.ruling}) — resolve the conflict explicitly`,
        };
      }
      return {
        ok: false,
        code: 'parity_corrupt',
        message: `parity.json holds semantically duplicate entries for the same behavior (${existing.id} and ${rec.id}, both '${rec.ruling}') — two active authorities for one behavior are ambiguous; dedupe explicitly`,
      };
    }
    byBehavior.set(rec.behavior, { id: rec.id, ruling: rec.ruling });
  }
  return { ok: true, store: parsed.data };
}
