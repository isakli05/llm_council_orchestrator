/**
 * Parity ledger (STEP 9) — preserve/change/drop made operational (promoted
 * from the schema-only legacy seed, audit 20 §1). Every discovered behavior
 * enters as UNRESOLVED and BLOCKS plan finalization until a human rules it;
 * nothing ever silently defaults to DROP. DROP additionally requires explicit
 * approval lineage. Rulings update from renewal approval decisions (canonical
 * preserve/drop language maps; anything ambiguous stays unresolved, visibly),
 * or from an explicit headless ruling (setRuling — a recorded human act).
 *
 * Anchored evidence verifies against the live tree at gate time; stale
 * anchors block.
 */
import { z } from 'zod';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { CodeAnchorPayloadSchema } from '../../schemas/evidence';
import { verifyAnchor, type CodeAnchorInput } from '../anchors/verifier';
import type { AnalysisRecord } from '../recovery/schemas';
import type { RenewalApprovalRecord } from '../clarify/approvals';

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
    note: z.string().max(4_000).optional(),
  })
  .strict()
  .superRefine((e, ctx) => {
    if (e.ruling !== 'unresolved' && e.rationale === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `a ${e.ruling} ruling requires a rationale` });
    }
    if (e.ruling === 'unresolved' && e.rationale !== undefined && e.approval_id === undefined) {
      // rationale on unresolved is allowed ONLY as recorded approval text (note),
      // not as a ruling justification — enforced by callers, not the schema.
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

export type NewParityEntry = Omit<ParityEntry, 'id' | 'ruling' | 'snapshot_id'> & {
  ruling?: ParityEntry['ruling'];
};

export function addParityEntry(store: ParityStore, entry: NewParityEntry): ParityEntry {
  const full = ParityEntrySchema.parse({
    ruling: 'unresolved',
    ...entry,
    snapshot_id: store.snapshot_id,
    id: nextParityId(store.records.map((r) => r.id)),
  });
  store.records = [...store.records, full].sort((a, b) => (a.id < b.id ? -1 : 1));
  return full;
}

/** Seed: every promoted hypothesis becomes an UNRESOLVED entry (no silent drop). */
export function parityFromAnalyses(analyses: readonly AnalysisRecord[], snapshotId: string): ParityStore {
  const store = emptyParity(snapshotId);
  const sorted = [...analyses].sort((a, b) => (a.analysis_id < b.analysis_id ? -1 : 1));
  for (const analysis of sorted) {
    if (analysis.outcome !== 'validated') continue;
    for (const h of analysis.promoted.hypotheses) {
      addParityEntry(store, {
        behavior: h.statement,
        evidence: h.anchors.map((anchor) => ({ kind: 'code_anchor' as const, anchor })),
        source_analysis: analysis.analysis_id,
      });
    }
  }
  return store;
}

export interface SetRulingArgs {
  ruling: 'preserve' | 'change' | 'drop';
  rationale: string;
  approvalId?: string;
}

/** An explicit, recorded human ruling (headless twin of the workspace act). */
export function setRuling(store: ParityStore, id: string, args: SetRulingArgs): void {
  const rec = store.records.find((r) => r.id === id);
  if (rec === undefined) throw new Error(`unknown parity entry ${id}`);
  if (args.ruling === 'drop' && args.approvalId === undefined) {
    throw new Error('refusing DROP without explicit approval lineage — destructive rulings are human acts (pass the approval id)');
  }
  rec.ruling = args.ruling;
  rec.rationale = args.rationale;
  if (args.approvalId !== undefined) rec.approval_id = args.approvalId;
  ParityEntrySchema.parse(rec); // invariants re-checked
}

export interface ApplyApprovalResult {
  updated: string[]; // entry ids touched
  stillUnresolved: string[]; // ids whose approved text did not map to a ruling
}

/**
 * Fold an approval record into the ledger. CANONICAL language maps:
 * 'preserve'/'keep'/'retain' → preserve; 'change'/'chang(e|ing)' → change;
 * 'drop'/'remove'/'delete' → drop; anything else stays UNRESOLVED with the
 * approved text recorded — visible and blocking, never guessed. All three
 * rulings round-trip through the workspace and headless --answers paths.
 * DROP-via-approval carries the approval lineage by construction.
 */
export function rulingFromApprovedText(text: string): ParityEntry['ruling'] {
  const lower = text.toLowerCase();
  if (/\b(drop|remove|delete)\b/.test(lower)) return 'drop';
  if (/\b(preserve|keep|retain)\b/.test(lower)) return 'preserve';
  if (/\bchang(e|es|ed|ing)\b/.test(lower)) return 'change';
  return 'unresolved';
}

export function applyApprovalToParity(store: ParityStore, approvalRec: RenewalApprovalRecord): ApplyApprovalResult {
  const byClaim = new Map(approvalRec.decisions.map((d) => [d.claim_id, d]));
  const updated: string[] = [];
  const stillUnresolved: string[] = [];
  for (const rec of store.records) {
    // Match by the linked claim id, or by the entry's OWN id (PAR questions
    // the distiller derives directly from unresolved entries).
    const decision = byClaim.get(rec.decision_claim_id ?? '') ?? byClaim.get(rec.id);
    if (decision === undefined) continue;
    const text = decision.selected_option ?? decision.free_text ?? '';
    const ruling = rulingFromApprovedText(text);

    rec.ruling = ruling;
    rec.rationale = `approved: "${text}"`;
    rec.approval_id = approvalRec.approval_id;
    updated.push(rec.id);
    if (ruling === 'unresolved') stillUnresolved.push(rec.id);
    ParityEntrySchema.parse(rec);
  }
  return { updated: updated.sort(), stillUnresolved: stillUnresolved.sort() };
}

export interface ParityBlocker {
  id: string;
  reason: string;
}

export type ParityGate = { ok: true } | { ok: false; blockers: ParityBlocker[] };

/**
 * F4 — approval context for the parity gate: a VERIFIED loader (records whose
 * digest/evidence already revalidated) plus the active snapshot the rulings
 * must be bound to.
 */
export interface ParityGateApprovals {
  loadApproval: (approvalId: string) => RenewalApprovalRecord | undefined;
  activeSnapshot: string;
}

/** Plan-finalization precondition: resolved rulings AND verifying anchors AND approval lineage that actually authorizes each ruling. */
export function parityGate(store: ParityStore, targetRoot: string, approvals?: ParityGateApprovals): ParityGate {
  const blockers: ParityBlocker[] = [];
  for (const rec of store.records) {
    if (rec.ruling === 'unresolved') {
      blockers.push({ id: rec.id, reason: 'unresolved ruling — rule it preserve/change/drop (human act) before planning' });
      continue;
    }
    // F4: an approval_id is a REFERENCE, not authority — resolve and verify it.
    if (approvals !== undefined && rec.approval_id !== undefined) {
      const approval = approvals.loadApproval(rec.approval_id);
      if (approval === undefined) {
        blockers.push({ id: rec.id, reason: `approval ${rec.approval_id} does not exist — fabricated approval ids do not authorize rulings` });
        continue;
      }
      if (approval.snapshot_id !== undefined && approval.snapshot_id !== approvals.activeSnapshot) {
        blockers.push({ id: rec.id, reason: `approval ${rec.approval_id} is bound to snapshot ${approval.snapshot_id}, not the active ${approvals.activeSnapshot}` });
        continue;
      }
      const decision = approval.decisions.find((d) => d.claim_id === (rec.decision_claim_id ?? rec.id));
      if (decision === undefined) {
        blockers.push({ id: rec.id, reason: `approval ${rec.approval_id} contains no decision for this entry (${rec.decision_claim_id ?? rec.id})` });
        continue;
      }
      const authorized = rulingFromApprovedText(decision.selected_option ?? decision.free_text ?? '');
      if (authorized !== rec.ruling) {
        blockers.push({ id: rec.id, reason: `approval ${rec.approval_id} authorizes '${authorized}' but the entry is ruled '${rec.ruling}' — the approval does not authorize THIS ruling` });
        continue;
      }
    }
    for (const ev of rec.evidence) {
      if (ev.kind !== 'code_anchor') continue;
      const v = verifyAnchor(ev.anchor as CodeAnchorInput, targetRoot);
      if (!v.ok) {
        blockers.push({ id: rec.id, reason: `stale anchor (${ev.anchor.path}: ${v.code}) — refresh the snapshot and re-analyze` });
        break;
      }
    }
  }
  return blockers.length === 0 ? { ok: true } : { ok: false, blockers };
}

export interface ParityProjection {
  /** legacy.json preserve_change_drop items (evidence ids filled by the planner). */
  items: { behavior: string; decision: 'preserve' | 'change' | 'drop'; rationale: string }[];
  /** Anchors the planner must materialize as code_anchor evidence items. */
  anchors: { anchor: z.infer<typeof CodeAnchorPayloadSchema>; entryId: string }[];
}

/** Project RULED entries to the spec legacy package shape. Refuses unresolved. */
export function parityProjection(store: ParityStore): ParityProjection {
  const unresolved = store.records.filter((r) => r.ruling === 'unresolved');
  if (unresolved.length > 0) {
    throw new Error(
      `refusing to project a partial ledger: ${unresolved.length} unresolved entr${unresolved.length === 1 ? 'y' : 'ies'} (${unresolved
        .map((r) => r.id)
        .join(', ')}) — every behavior needs a preserve/change/drop ruling`,
    );
  }
  const items: ParityProjection['items'] = [];
  const anchors: ParityProjection['anchors'] = [];
  for (const rec of store.records) {
    items.push({
      behavior: rec.behavior,
      decision: rec.ruling as 'preserve' | 'change' | 'drop',
      rationale: rec.rationale ?? '',
    });
    for (const ev of rec.evidence) {
      if (ev.kind === 'code_anchor') {
        anchors.push({ anchor: { ...ev.anchor }, entryId: rec.id });
      }
    }
  }
  return { items, anchors };
}

export type PersistParityResult = { ok: true; path: string };

export function persistParity(path: string, store: ParityStore): PersistParityResult {
  const sorted: ParityStore = { ...store, records: [...store.records].sort((a, b) => (a.id < b.id ? -1 : 1)) };
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(sorted, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, path);
  return { ok: true, path };
}

export type ParityLoad = { ok: true; store: ParityStore } | { ok: false; code: 'parity_corrupt'; message: string };

export function loadParity(path: string): ParityLoad {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    return { ok: false, code: 'parity_corrupt', message: `parity.json unreadable/invalid JSON (${(e as Error).message})` };
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
  return { ok: true, store: parsed.data };
}
