import { describe, it, expect, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {

  OVERLAY_RELATIONS,
  OverlayRecordSchema,
  OverlayStoreSchema,
  addOverlayRecord,
  emptyOverlay,
  evaluateOverlayStaleness,
  parseOverlayStore,
  markSuperseded,
  nextOverlayId,
  persistOverlay,
  type NewOverlayRecord,
} from './overlay';

/** Test-local raw fixture reader (production reads route through the kernel). */
const loadOverlayFile = (path: string) =>
  existsSync(path)
    ? parseOverlayStore(readFileSync(path, 'utf8'))
    : ({ ok: false as const, code: 'overlay_missing' as const, message: `no overlay store at ${path}` });


const tmpDirs: string[] = [];
function freshDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'lco-ovl-'));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
  tmpDirs.length = 0;
});

const sha = (s: string | Buffer) => `sha256:${createHash('sha256').update(s).digest('hex')}`;
const SNAP = 'RSN-deadbeefdeadbeef';

function baseRecord(overrides: Partial<NewOverlayRecord> = {}): NewOverlayRecord {
  return {
    id: 'OVL-0001',
    relation: 'business_rule',
    subject: { path: 'src/pricing.ts', symbol: 'applyDiscount' },
    value: '5% discount above $50',
    anchors: [{ path: 'src/pricing.ts', content_hash: sha('pricing bytes') }],
    snapshot_id: SNAP,
    confidence: 'medium',
    status: 'active',
    lineage: { analysis_id: 'AN-0001' },
    note: 'from recovery',
    ...overrides,
  };
}

describe('OverlayRecordSchema (13-relation vocabulary, anchored)', () => {
  it('accepts a well-formed record', () => {
    expect(OverlayRecordSchema.safeParse(baseRecord()).success).toBe(true);
  });

  it('rejects relations outside the audit-approved vocabulary', () => {
    const r = OverlayRecordSchema.safeParse({ ...baseRecord(), relation: 'legacy_analysis' });
    expect(r.success).toBe(false); // historical role names never return as relation kinds
    expect(OVERLAY_RELATIONS).toHaveLength(13);
  });

  it('requires at least one anchor (no free-floating claims)', () => {
    expect(OverlayRecordSchema.safeParse({ ...baseRecord(), anchors: [] }).success).toBe(false);
  });

  it('subject may carry a node_id, and lineage stays strict', () => {
    const ok = OverlayRecordSchema.safeParse({
      ...baseRecord(),
      subject: { node_id: 'src_pricing_applydiscount', path: 'src/pricing.ts' },
    });
    expect(ok.success).toBe(true);
    expect(
      OverlayRecordSchema.safeParse({ ...baseRecord(), lineage: { analysis_id: 'AN-0001', bogus: 1 } }).success,
    ).toBe(false);
  });
});

describe('overlay store (ids, ordering, atomic persistence, reload)', () => {
  it('assigns sequential ids and keeps records sorted on write (diffable)', () => {
    const store = emptyOverlay(SNAP);
    const added1 = addOverlayRecord(store, baseRecord({ id: '', relation: 'renewal_risk' }));
    const added2 = addOverlayRecord(store, baseRecord({ id: '', relation: 'security_risk' }));
    expect(added1.id).toBe('OVL-0001');
    expect(added2.id).toBe('OVL-0002');
    expect(store.records.map((r) => r.id)).toEqual(['OVL-0001', 'OVL-0002']);
    expect(OverlayStoreSchema.safeParse(store).success).toBe(true);
    expect(nextOverlayId(['OVL-0009'])).toBe('OVL-0010');
  });

  it('persists atomically and reloads byte-identically (no .tmp residue)', () => {
    const dir = freshDir();
    const path = join(dir, 'overlay.json');
    const store = emptyOverlay(SNAP);
    addOverlayRecord(store, baseRecord({ id: '' }));
    // Trust kernel: authorized write — the temp dir is the project root
    // (a file directly in projectDir authorizes; staging is unpredictable).
    expect(persistOverlay(dir, path, store)).toMatchObject({ ok: true });
    const loaded = loadOverlayFile(path);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(JSON.stringify(loaded.store)).toBe(JSON.stringify(store));
    expect(() => readFileSync(`${path}.tmp`)).toThrow();
  });

  it('a failed persist leaves the prior file byte-identical', () => {
    const dir = freshDir();
    const path = join(dir, 'overlay.json');
    const store = emptyOverlay(SNAP);
    addOverlayRecord(store, baseRecord({ id: '' }));
    persistOverlay(dir, path, store);
    const before = readFileSync(path, 'utf8');
    chmodSync(dir, 0o500); // make the dir unwritable
    try {
      const bigger = emptyOverlay(SNAP);
      addOverlayRecord(bigger, baseRecord({ id: '', relation: 'renewal_risk' }));
      expect(() => persistOverlay(dir, path, bigger)).toThrow();
      expect(readFileSync(path, 'utf8')).toBe(before);
    } finally {
      chmodSync(dir, 0o700);
    }
  });

  it('fails closed on corrupt overlay files', () => {
    const dir = freshDir();
    const path = join(dir, 'overlay.json');
    writeFileSync(path, '{nope');
    const r = loadOverlayFile(path);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('overlay_corrupt');
  });
});

describe('evaluateOverlayStaleness (derived, never silently trusted)', () => {
  function stageTarget(): string {
    const root = freshDir();
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'pricing.ts'), 'pricing bytes');
    writeFileSync(join(root, 'src', 'orders.ts'), 'orders bytes');
    return root;
  }

  it('active records with verifying anchors stay active', () => {
    const root = stageTarget();
    const store = emptyOverlay(SNAP);
    addOverlayRecord(store, baseRecord({ id: '' }));
    const r = evaluateOverlayStaleness(store, root);
    expect(r.store.records[0].status).toBe('active');
    expect(r.changed).toEqual([]);
  });

  it('source mutation flips the affected record to stale (by id)', () => {
    const root = stageTarget();
    const store = emptyOverlay(SNAP);
    addOverlayRecord(store, baseRecord({ id: '' }));
    addOverlayRecord(store, baseRecord({ id: '', relation: 'deprecated_candidate', subject: { path: 'src/orders.ts' }, anchors: [{ path: 'src/orders.ts', content_hash: sha('orders bytes') }] }));
    writeFileSync(join(root, 'src', 'pricing.ts'), 'pricing bytes MUTATED');
    const r = evaluateOverlayStaleness(store, root);
    expect(r.changed).toEqual(['OVL-0001']);
    expect(r.store.records[0].status).toBe('stale');
    expect(r.store.records[1].status).toBe('active');
  });

  it('staleness is derived: reverting the mutation restores active', () => {
    const root = stageTarget();
    const store = emptyOverlay(SNAP);
    addOverlayRecord(store, baseRecord({ id: '' }));
    writeFileSync(join(root, 'src', 'pricing.ts'), 'mutated');
    expect(evaluateOverlayStaleness(store, root).store.records[0].status).toBe('stale');
    writeFileSync(join(root, 'src', 'pricing.ts'), 'pricing bytes');
    expect(evaluateOverlayStaleness(store, root).store.records[0].status).toBe('active');
  });

  it('superseded is terminal — never reactivated by verification', () => {
    const root = stageTarget();
    const store = emptyOverlay(SNAP);
    const rec = addOverlayRecord(store, baseRecord({ id: '' }));
    markSuperseded(store, rec.id, 'OVL-0002');
    const r = evaluateOverlayStaleness(store, root);
    expect(r.store.records[0].status).toBe('superseded');
  });
});
