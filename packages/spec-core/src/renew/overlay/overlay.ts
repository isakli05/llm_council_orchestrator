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
 */
import { z } from 'zod';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { CodeAnchorPayloadSchema } from '../../schemas/evidence';
import { verifyAnchor, type CodeAnchorInput } from '../anchors/verifier';

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

/** Atomic persist: staged temp file + rename; stable id ordering on disk. */
export function persistOverlay(path: string, store: OverlayStore): PersistResult {
  const sorted: OverlayStore = {
    ...store,
    records: [...store.records].sort((a, b) => (a.id < b.id ? -1 : 1)),
  };
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(sorted, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, path);
  return { ok: true, path };
}

export type OverlayLoad =
  | { ok: true; store: OverlayStore }
  | { ok: false; code: 'overlay_missing' | 'overlay_corrupt'; message: string };

/** D2: missing is NOT corrupt — callers give missing domain-specific init
 * semantics; existing+corrupt always stops the operation.
 * @deprecated TRUST KERNEL: trusted reads route through
 * trust/state.loadActiveState (authorizedRead + this parser). */
export function loadOverlay(path: string): OverlayLoad {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') return { ok: false, code: 'overlay_missing', message: `no overlay store at ${path}` };
    return { ok: false, code: 'overlay_corrupt', message: `overlay.json unreadable (${err.message})` };
  }
  return parseOverlayStore(text);
}

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
