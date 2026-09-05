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
import { CodeAnchorPayloadSchema } from '../../schemas/evidence';
import { authorizedWrite } from '../trust/fs';
import { verifyAnchor, type CodeAnchorInput } from '../anchors/verifier';
import type { AnalysisRecord } from '../recovery/schemas';
import type { RenewalApprovalRecord } from '../clarify/approvals';
import { canonicalRuling } from '../trust/authority';
import { assertSupportPolicy } from '../trust/evidence';

export { CANONICAL_PARITY_RULINGS, canonicalRuling } from '../trust/authority';
export type { CanonicalParityRuling } from '../trust/authority';
import {
  ParityEntrySchema,
  emptyParity,
  nextParityId,
  type ParityEntry,
  type ParityStore,
} from '../core/store-records';

export {
  ParityEvidenceSchema,
  ParityEntrySchema,
  ParityStoreSchema,
  emptyParity,
  nextParityId,
  parseParityStore,
} from '../core/store-records';
export type { ParityEntry, ParityStore, ParityLoad } from '../core/store-records';

export type NewParityEntry = Omit<ParityEntry, 'id' | 'ruling' | 'snapshot_id'> & {
  ruling?: ParityEntry['ruling'];
};

export function addParityEntry(store: ParityStore, entry: NewParityEntry): ParityEntry {
  // INV-D3: the semantic identity of a parity entry is its BEHAVIOR — one
  // behavior, one entry, ever (two active authorities for one behavior are
  // ambiguous by definition and rejected at load). Re-adding an existing
  // behavior is idempotent: the existing entry stands (its ruling — possibly
  // a human one — is never replaced by a re-analysis).
  const existing = store.records.find((r) => r.behavior === entry.behavior);
  if (existing !== undefined) return existing;
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
  // INV-C: a human ruling is the only support validation V1 performs.
  rec.support_status = 'human_confirmed';
  ParityEntrySchema.parse(rec); // invariants re-checked
}

export interface ApplyApprovalResult {
  updated: string[]; // entry ids touched
  stillUnresolved: string[]; // ids whose approved answer did not carry a canonical ruling
}

/**
 * INV-D2 (S2-C-05): a parity ruling is authorized ONLY by the CANONICAL
 * option id a human selected — 'preserve' | 'change' | 'drop' — never by
 * interpreting free text ("do not drop; preserve" must never become DROP).
 * Any other answer (free text, prose option, missing) leaves the entry
 * UNRESOLVED, visibly, with the recorded answer — ambiguity blocks, it never
 * guesses. This is the ONLY text→ruling mapping in the system and it is a
 * pure identity check, not a parser.
 */

/**
 * Fold an approval record into the ledger.
 *
 * INV-B5 human-authority precedence: only STILL-UNRESOLVED entries, entries
 * re-folded from the SAME approval (idempotent retry), or entries previously
 * ruled by an approval (a NEWER human approval may supersede an older one)
 * are touched. A headless ruling (recorded human act without approval
 * lineage) is never silently overwritten — its ordering vs this approval is
 * unknowable, so it stands.
 *
 * INV-D2: only canonical selected_option ids rule (see canonicalRuling);
 * non-canonical answers are recorded and stay unresolved.
 */
export function applyApprovalToParity(store: ParityStore, approvalRec: RenewalApprovalRecord): ApplyApprovalResult {
  const byClaim = new Map(approvalRec.decisions.map((d) => [d.claim_id, d]));
  const updated: string[] = [];
  const stillUnresolved: string[] = [];
  for (const rec of store.records) {
    const ruledByApproval = rec.ruling !== 'unresolved' && rec.approval_id !== undefined;
    const sameApproval = rec.approval_id === approvalRec.approval_id;
    if (rec.ruling !== 'unresolved' && !ruledByApproval && !sameApproval) continue; // headless ruling — precedence kept
    // INV-D2 (verifier finding): a PARITY ruling is carried ONLY by a decision
    // on THIS entry's own claim id (rec.id). Linked claims (UNC/OVL context,
    // or a hand-edited PAR→PAR link) NEVER transfer authority — one human
    // answer rules exactly the behavior it was asked about.
    const decision = byClaim.get(rec.id);
    if (decision === undefined) continue;
    const answer = decision.selected_option ?? decision.free_text ?? '';
    const ruling = canonicalRuling(decision.selected_option);

    if (ruling === undefined) {
      // Non-canonical answer: recorded, visible, and BLOCKING — a
      // preserve/change/drop ruling requires the canonical option id.
      rec.ruling = 'unresolved';
      rec.rationale = `approval ${approvalRec.approval_id} answered "${answer}" — not a canonical preserve/change/drop option; rule it explicitly`;
      rec.approval_id = approvalRec.approval_id;
      updated.push(rec.id);
      stillUnresolved.push(rec.id);
      ParityEntrySchema.parse(rec);
      continue;
    }
    rec.ruling = ruling;
    rec.rationale = `approved: canonical '${ruling}'${decision.free_text !== undefined ? ` (${decision.free_text})` : ''}`;
    rec.approval_id = approvalRec.approval_id;
    // INV-C: a human ruling is the only support validation V1 performs.
    rec.support_status = 'human_confirmed';
    updated.push(rec.id);
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
      // INV-D2: authorization compares the CANONICAL option id on the entry's
      // OWN claim decision — the same identity check as the fold, never
      // free-text interpretation, never a linked claim's decision.
      const decision = approval.decisions.find((d) => d.claim_id === rec.id);
      if (decision === undefined) {
        blockers.push({ id: rec.id, reason: `approval ${rec.approval_id} contains no decision for this entry (${rec.decision_claim_id ?? rec.id})` });
        continue;
      }
      const authorized = canonicalRuling(decision.selected_option);
      if (authorized !== rec.ruling) {
        blockers.push({ id: rec.id, reason: `approval ${rec.approval_id} does not authorize '${rec.ruling}' (its canonical option is '${authorized ?? 'none'}') — the approval does not authorize THIS ruling` });
        continue;
      }
    }
    // Verifier C-2 + S4-M-01 (bypass 4 closed): the support axis is
    // LOAD-BEARING through the KERNEL policy — assertSupportPolicy is the
    // ONE implementation ('unvalidated' may hypothesize, never feed
    // planning; 'contradicted' authorizes nothing; machine stages never set
    // human_confirmed themselves). Runs AFTER approval-reference integrity
    // so the more specific authority blockers surface first.
    try {
      assertSupportPolicy('planning_input', rec.support_status, `ruling '${rec.ruling}' on ${rec.id}`);
    } catch (e) {
      blockers.push({
        id: rec.id,
        reason:
          `${(e as Error).message} (support_status: ${rec.support_status ?? 'unrecorded'}) — ` +
          `re-run the review so the approval sets it; a ruled entry without recorded human confirmation is not plannable`,
      });
      continue;
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

/** Trusted persist (trust/fs authorized atomic write); stable id ordering on disk. */
export function persistParity(projectDir: string, path: string, store: ParityStore): PersistParityResult {
  const sorted: ParityStore = { ...store, records: [...store.records].sort((a, b) => (a.id < b.id ? -1 : 1)) };
  authorizedWrite({ projectDir, path, content: `${JSON.stringify(sorted, null, 2)}\n` });
  return { ok: true, path };
}
