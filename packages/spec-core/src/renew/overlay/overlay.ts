/**
 * LCO Renewal Overlay (STEP 7) — the LCO-owned modernization semantics layer.
 *
 * Graphify's structural graph is NEVER modified: modernization knowledge
 * lives here, as validated JSON records anchored to source state. Every
 * record carries ≥1 code anchor; staleness is DERIVED (recomputed against
 * the live tree) so a stale record reports stale instead of continuing as
 * trusted state. 'superseded' is the one manual/terminal status.
 *
 * Persistence: atomic (temp file + rename in the same directory), stable
 * ordering by id, strict schemas — diffable by design.
 *
 * Trust Kernel groundwork (S4-M-02): the schemas, types, id helpers, and
 * strict parsers now live in `renew/core/store-records.ts` (the PURE record
 * leaf the kernel depends on downward); this module keeps the domain
 * behavior (append/supersede/persist/staleness) and re-exports the record
 * surface unchanged for existing importers.
 */
import { authorizedWrite } from '../trust/fs';
import { verifyAnchor, type CodeAnchorInput } from '../anchors/verifier';
import {
  OverlayRecordSchema,
  type OverlayRecord,
  type OverlayStore,
  nextOverlayId,
} from '../core/store-records';

export {
  OVERLAY_RELATIONS,
  OverlayEntityRefSchema,
  OverlayRecordSchema,
  OverlayStoreSchema,
  emptyOverlay,
  nextOverlayId,
  parseOverlayStore,
} from '../core/store-records';
export type { OverlayRelation, OverlayRecord, OverlayStore, OverlayLoad } from '../core/store-records';

export type NewOverlayRecord = Omit<OverlayRecord, 'id'> & { id?: string };

/** Append a record (id auto-assigned when omitted); store stays id-sorted. */
export function addOverlayRecord(store: OverlayStore, record: NewOverlayRecord): OverlayRecord {
  const id = record.id && record.id !== '' ? record.id : nextOverlayId(store.records.map((r) => r.id));
  const full = OverlayRecordSchema.parse({ ...record, id });
  store.records = [...store.records, full].sort((a, b) => (a.id < b.id ? -1 : 1));
  return full;
}

/** Terminal: a superseded record never reactivates, even if its anchors verify. */
export function markSuperseded(store: OverlayStore, id: string, supersededBy?: string): void {
  const rec = store.records.find((r) => r.id === id);
  if (rec === undefined) throw new Error(`unknown overlay record ${id}`);
  rec.status = 'superseded';
  if (supersededBy !== undefined) {
    rec.note = `${rec.note !== undefined ? `${rec.note} ` : ''}[superseded by ${supersededBy}]`;
  }
}

export type PersistResult = { ok: true; path: string } | { ok: false; code: 'dir_missing'; message: string };

/** Trusted persist (trust/fs authorized atomic write); stable id ordering on disk. */
export function persistOverlay(projectDir: string, path: string, store: OverlayStore): PersistResult {
  const sorted: OverlayStore = {
    ...store,
    records: [...store.records].sort((a, b) => (a.id < b.id ? -1 : 1)),
  };
  authorizedWrite({ projectDir, path, content: `${JSON.stringify(sorted, null, 2)}\n` });
  return { ok: true, path };
}

export interface OverlayStalenessResult {
  store: OverlayStore; // with statuses recomputed
  changed: string[]; // ids whose status changed
}

/**
 * Derive staleness from CURRENT verification: re-hash every anchor against
 * the live target tree. active ⟷ stale follows verification (a reverted
 * mutation honestly reactivates); superseded is terminal.
 */
export function evaluateOverlayStaleness(store: OverlayStore, targetRoot: string): OverlayStalenessResult {
  const changed: string[] = [];
  const records = store.records.map((rec) => {
    if (rec.status === 'superseded') return rec;
    const allOk = rec.anchors.every((a) => verifyAnchor(a as CodeAnchorInput, targetRoot).ok);
    const next = allOk ? 'active' : 'stale';
    if (next !== rec.status) {
      changed.push(rec.id);
      return { ...rec, status: next } as OverlayRecord;
    }
    return rec;
  });
  return { store: { ...store, records }, changed: changed.sort() };
}
