import { describe, expect, it } from 'vitest';
import {
  assertSupportPolicy,
  contextBundleDigest,
  resolveCitation,
  sealContextBundle,
  type SealedContext,
  type SuppliedContextSlice,
} from './evidence';
import { TrustCitationError } from './errors';
import { sha256Content } from './canonical';
import type { ContextBundle } from '../context/bundle';

const SNAP = 'RSN-deadbeefdeadbeef';
const PROJECT = 'legacy-renewal';

/** The standard two-slice supply: src/a.ts lines 1–2 of 50 (slice) and
 *  src/b.ts lines 1–80 of 80 (whole file). */
function slices(): SuppliedContextSlice[] {
  return [
    { path: 'src/a.ts', whole_file_hash: 'sha256:aa', start_line: 1, end_line: 2, text: 'line1\nline2\n', file_line_count: 50 },
    { path: 'src/b.ts', whole_file_hash: 'sha256:bb', start_line: 1, end_line: 80, text: 'full\n'.repeat(80), file_line_count: 80 },
  ];
}

function bundle(): SealedContext {
  return sealContextBundle({ projectName: PROJECT, snapshotId: SNAP, slices: slices(), items: [] });
}

describe('evidence: context bundle sealing (S4-H-02)', () => {
  it('assigns stable CTX ids in order; whole-file detection is exact', () => {
    const b = bundle();
    expect(b.records.map((r) => r.context_id)).toEqual(['CTX-0001', 'CTX-0002']);
    expect(b.records[0].whole_file_supplied).toBe(false); // 1–2 of 50
    expect(b.records[1].whole_file_supplied).toBe(true); // 1–80 of 80
  });

  it('dedups identical windows; binds node ids onto the shared record', () => {
    const b = sealContextBundle({
      projectName: PROJECT,
      snapshotId: SNAP,
      slices: [
        { path: 'src/a.ts', whole_file_hash: 'sha256:aa', start_line: 1, end_line: 2, text: 'x\n', file_line_count: 50 },
        { path: 'src/a.ts', whole_file_hash: 'sha256:aa', start_line: 1, end_line: 2, text: 'x\n', file_line_count: 50, node_id: 'node_a' },
        { path: 'src/a.ts', whole_file_hash: 'sha256:aa', start_line: 10, end_line: 20, text: 'y\n', file_line_count: 50 },
      ],
      items: [],
    });
    expect(b.records).toHaveLength(2);
    expect(b.records[0].node_id).toBe('node_a');
  });

  it('recomputes slice hashes from the server-owned text — a caller hash is never accepted', () => {
    // The seal API has NO hash input: the hash exists only as the digest of
    // the supplied rendered bytes. Assert exactly that (S4-H-02: the stored
    // hash is derived, never decorative).
    const b = sealContextBundle({
      projectName: PROJECT,
      snapshotId: SNAP,
      slices: [{ path: 'x.ts', whole_file_hash: 'sha256:aa', start_line: 1, end_line: 2, text: 'exact-bytes', file_line_count: 9 }],
      items: [],
    });
    expect(b.records[0].slice_text_hash).toBe(sha256Content('exact-bytes'));
  });

  it('the bundle identity is a recomputable digest over the ordered slice facts', () => {
    const b = bundle();
    expect(contextBundleDigest(b)).toBe(b.identity.bundle_id);
    // any slice-fact change changes the bundle id
    const changed = sealContextBundle({
      projectName: PROJECT,
      snapshotId: SNAP,
      slices: [slices()[0]!, { ...slices()[1]!, text: 'different\n' }],
      items: [],
    });
    expect(changed.identity.bundle_id).not.toBe(b.identity.bundle_id);
  });
});

describe('evidence: S5-M-01 — identity must cover the ENTIRE model-visible BUNDLE payload (request framing excluded by design)', () => {
  // The standard one-slice + one-node bundle: identical file slices, a node
  // label that varies (node items ARE rendered to the model).
  const baseSlices: SuppliedContextSlice[] = [
    { path: 'src/a.ts', whole_file_hash: 'sha256:aa', start_line: 1, end_line: 2, text: 'line1\nline2\n', file_line_count: 50 },
  ];
  function mkBundle(label: string): ContextBundle {
    return {
      scope: { target: 'src' },
      items: [
        { kind: 'file_slice', path: 'src/a.ts', start_line: 1, end_line: 2, text: 'line1\nline2\n', content_hash: 'sha256:aa', redactions: 0, provenance: 'file-read' as const },
        { kind: 'node', node_id: 'n1', label, provenance: 'graph' as const },
      ],
      truncated: false,
      total_chars: 100,
      warnings: [],
    };
  }

  it('THE S5-M-01 CLOSURE: model-visible payloads differ → bundle_id differs (was identical pre-fix)', async () => {
    const { buildRecoveryPrompt } = await import('../recovery/prompts');
    const a = mkBundle('applyDiscount');
    const b = mkBundle('applySurcharge');
    // 1. the differing field IS presented to the model...
    const pa = buildRecoveryPrompt({ bundle: a, scope: a.scope, nowIso: '2026-09-06T00:00:00Z' });
    const pb = buildRecoveryPrompt({ bundle: b, scope: b.scope, nowIso: '2026-09-06T00:00:00Z' });
    expect(pa).not.toBe(pb);
    expect(pa).toContain('applyDiscount');
    expect(pb).toContain('applySurcharge');
    // 2. ...so the identity MUST differ: seal each bundle with ITS OWN items
    // (pre-fix both sealed identical — slice records only — and the ids were
    // equal while the visible payloads were not: the S5-M-01 defect).
    const sa = sealContextBundle({ projectName: PROJECT, snapshotId: SNAP, slices: baseSlices, items: a.items });
    const sb = sealContextBundle({ projectName: PROJECT, snapshotId: SNAP, slices: baseSlices, items: b.items });
    expect(sa.identity.bundle_id).not.toBe(sb.identity.bundle_id);
    // 3. each seal's membership proof still recomputes over records AND items
    expect(contextBundleDigest(sa)).toBe(sa.identity.bundle_id);
    expect(contextBundleDigest(sb)).toBe(sb.identity.bundle_id);
  });

  it('MUTATION MATRIX: every model-visible load-bearing mutation changes bundle_id', () => {
    const base = mkBundle('applyDiscount');
    const sealOf = (items: ContextBundle['items']) =>
      sealContextBundle({ projectName: PROJECT, snapshotId: SNAP, slices: baseSlices, items });
    const d0 = sealOf(base.items).identity.bundle_id;

    const slice = base.items[0] as Extract<ContextBundle['items'][number], { kind: 'file_slice' }>;
    const node = base.items[1] as Extract<ContextBundle['items'][number], { kind: 'node' }>;
    const cases: Array<[string, ContextBundle['items']]> = [
      ['node label', [slice, { ...node, label: 'other' }]],
      ['node id', [slice, { ...node, node_id: 'n2' }]],
      ['node optional field added (source_file)', [slice, { ...node, source_file: 'src/a.ts' }]],
      ['edge item added (model-visible)', [slice, node, { kind: 'edge', source: 'n1', target: 'n2', relation: 'calls', provenance: 'graph' }]],
      ['structural_fact text', [slice, node, { kind: 'structural_fact', text: 'fact-a', provenance: 'derived' }]],
      ['structural_fact text (different)', [slice, node, { kind: 'structural_fact', text: 'fact-b', provenance: 'derived' }]],
      ['file_slice text (records path — pre-existing coverage)', [{ ...slice, text: 'changed\n' }, node]],
      ['file_slice redactions (rendered metadata)', [{ ...slice, redactions: 3 }, node]],
      ['item ORDER (nodes before slices)', [node, slice]],
      ['item removed', [slice]],
    ];
    for (const [name, items] of cases) {
      expect(sealOf(items).identity.bundle_id, name).not.toBe(d0);
    }
  });

  it('NORMALIZATION: key-order-only item differences are semantic no-ops (identity stable)', () => {
    const base = mkBundle('applyDiscount');
    // same values, insertion order of object keys shuffled — canonicalization
    // sorts keys, so this is the documented safe equivalence
    const reordered: ContextBundle['items'] = [
      { provenance: 'file-read' as const, redactions: 0, content_hash: 'sha256:aa', text: 'line1\nline2\n', end_line: 2, start_line: 1, path: 'src/a.ts', kind: 'file_slice' as const },
      { provenance: 'graph' as const, label: 'applyDiscount', node_id: 'n1', kind: 'node' as const },
    ];
    const a = sealContextBundle({ projectName: PROJECT, snapshotId: SNAP, slices: baseSlices, items: base.items });
    const b = sealContextBundle({ projectName: PROJECT, snapshotId: SNAP, slices: baseSlices, items: reordered });
    expect(a.identity.bundle_id).toBe(b.identity.bundle_id);
  });

  it('Q4 EXCLUSION (documented): non-model-visible bundle ADMIN metadata is outside bundle identity', () => {
    // truncated / total_chars / warnings are never rendered to the model and
    // are persisted as plain record fields — mutating them does not (and must
    // not) change the identity of the model-visible payload. Items are the
    // identity domain.
    const a = sealContextBundle({ projectName: PROJECT, snapshotId: SNAP, slices: baseSlices, items: mkBundle('x').items });
    const b = sealContextBundle({ projectName: PROJECT, snapshotId: SNAP, slices: baseSlices, items: mkBundle('x').items });
    expect(a.identity.bundle_id).toBe(b.identity.bundle_id); // identical items → identical identity
  });
});


describe('evidence: citation resolution — the S3-H-01 / T3-1 matrix (preserved)', () => {
  it('THE T3-1 REPRO: supplied 1–2, claimed 10–10 → range_outside_context (ok:true/scope:range is unrepresentable)', () => {
    expect(() =>
      resolveCitation(bundle(), { context_id: 'CTX-0001', start_line: 10, end_line: 10 }),
    ).toThrowError(TrustCitationError);
    try {
      resolveCitation(bundle(), { context_id: 'CTX-0001', start_line: 10, end_line: 10 });
    } catch (e) {
      expect((e as TrustCitationError).code).toBe('range_outside_context');
    }
  });

  it('a subrange inside the supplied window resolves to server-computed coordinates', () => {
    const c = resolveCitation(bundle(), { context_id: 'CTX-0001', start_line: 2, end_line: 2 });
    expect(c.path).toBe('src/a.ts');
    expect(c.content_hash).toBe('sha256:aa');
    expect(c.start_line).toBe(2);
    expect(c.end_line).toBe(2);
    expect(c.scope).toBe('range');
  });

  it('partially-overlapping and escaped ranges refuse', () => {
    expect(() => resolveCitation(bundle(), { context_id: 'CTX-0001', start_line: 1, end_line: 5 })).toThrow();
    expect(() => resolveCitation(bundle(), { context_id: 'CTX-0001', start_line: 0, end_line: 2 })).toThrow();
    expect(() => resolveCitation(bundle(), { context_id: 'CTX-0001', start_line: 2, end_line: 1 })).toThrow();
  });

  it('no subrange on a SLICE record cites the supplied window as range — never whole_file', () => {
    const c = resolveCitation(bundle(), { context_id: 'CTX-0001' });
    expect(c.scope).toBe('range');
    expect(c.start_line).toBe(1);
    expect(c.end_line).toBe(2);
  });

  it('no subrange on a WHOLE-FILE record is a whole_file citation', () => {
    const c = resolveCitation(bundle(), { context_id: 'CTX-0002' });
    expect(c.scope).toBe('whole_file');
  });

  it('foreign / fabricated / stale context ids refuse (unknown_context)', () => {
    expect(() => resolveCitation(bundle(), { context_id: 'CTX-9999' })).toThrowError(TrustCitationError);
    try {
      resolveCitation(bundle(), { context_id: 'CTX-9999' });
    } catch (e) {
      expect((e as TrustCitationError).code).toBe('unknown_context');
    }
  });

  it('node-bound records yield node_range scope', () => {
    const b = sealContextBundle({
      projectName: PROJECT,
      snapshotId: SNAP,
      slices: [{ path: 'src/a.ts', whole_file_hash: 'sha256:aa', start_line: 1, end_line: 2, text: 'x\n', file_line_count: 50, node_id: 'node_a' }],
      items: [],
    });
    const c = resolveCitation(b, { context_id: 'CTX-0001', start_line: 1, end_line: 2 });
    expect(c.scope).toBe('node_range');
    expect(c.node_id).toBe('node_a');
  });
});

describe('evidence: S4-H-02 — foreign / stale / substituted context matrix', () => {
  it('same context_id, WRONG SNAPSHOT refuses (context_snapshot_mismatch)', () => {
    const staleBundle = sealContextBundle({ projectName: PROJECT, snapshotId: 'RSN-00000000000000aa', slices: slices(), items: [] });
    // The bundle identity says the ACTIVE snapshot; make the record claim the
    // old one by presenting a bundle whose identity was re-stamped — i.e. a
    // hand-assembled mismatch.
    const tampered: SealedContext = {
      identity: { ...staleBundle.identity, snapshot_id: SNAP },
      records: staleBundle.records,
      items: staleBundle.items,
    };
    expect(() => resolveCitation(tampered, { context_id: 'CTX-0001' })).toThrowError(TrustCitationError);
    try {
      resolveCitation(tampered, { context_id: 'CTX-0001' });
    } catch (e) {
      expect((e as TrustCitationError).code).toBe('context_snapshot_mismatch');
    }
  });

  it('same context_id, WRONG PROJECT refuses (context_project_mismatch)', () => {
    const foreign = sealContextBundle({ projectName: 'other-project', snapshotId: SNAP, slices: slices(), items: [] });
    const tampered: SealedContext = {
      identity: { ...foreign.identity, project_name: PROJECT },
      records: foreign.records,
      items: foreign.items,
    };
    expect(() => resolveCitation(tampered, { context_id: 'CTX-0001' })).toThrowError(TrustCitationError);
    try {
      resolveCitation(tampered, { context_id: 'CTX-0001' });
    } catch (e) {
      expect((e as TrustCitationError).code).toBe('context_project_mismatch');
    }
  });

  it('same snapshot, DIFFERENT BUNDLE: a record from another request cannot resolve', () => {
    // Two genuine bundles sealed for the same project+snapshot but different
    // slice sets: bundle A's records presented under bundle B's identity.
    const a = sealContextBundle({ projectName: PROJECT, snapshotId: SNAP, slices: [slices()[0]!], items: [] });
    const b = sealContextBundle({
      projectName: PROJECT,
      snapshotId: SNAP,
      slices: [{ path: 'src/c.ts', whole_file_hash: 'sha256:cc', start_line: 1, end_line: 9, text: 'c\n', file_line_count: 9 }],
      items: [],
    });
    const spliced: SealedContext = { identity: b.identity, records: a.records, items: b.items };
    expect(() => resolveCitation(spliced, { context_id: 'CTX-0001' })).toThrowError(TrustCitationError);
    try {
      resolveCitation(spliced, { context_id: 'CTX-0001' });
    } catch (e) {
      expect((e as TrustCitationError).code).toBe('context_bundle_mismatch');
    }
  });

  it('tampered slice hash (text unchanged) refuses — the stored hash is recomputed, not trusted', () => {
    const b = bundle();
    const tamperedRecord = { ...b.records[0]!, slice_text_hash: 'sha256:' + '0'.repeat(64), bundle_id: b.identity.bundle_id };
    const tampered: SealedContext = { identity: b.identity, records: [tamperedRecord, b.records[1]!], items: b.items };
    expect(() => resolveCitation(tampered, { context_id: 'CTX-0001' })).toThrowError(TrustCitationError);
  });

  it('a SPLICED record set (extra record added after sealing) refuses', () => {
    const b = bundle();
    const extra = { ...b.records[0]!, context_id: 'CTX-0003' };
    const spliced: SealedContext = { identity: b.identity, records: [...b.records, extra], items: b.items };
    expect(() => resolveCitation(spliced, { context_id: 'CTX-0003' })).toThrowError(TrustCitationError);
    try {
      resolveCitation(spliced, { context_id: 'CTX-0003' });
    } catch (e) {
      expect((e as TrustCitationError).code).toBe('context_bundle_mismatch');
    }
  });

  it('a STALE bundle (sealed before a refresh moved the snapshot) cannot resolve under the new identity', () => {
    const old = sealContextBundle({ projectName: PROJECT, snapshotId: 'RSN-1111111111111111', slices: slices(), items: [] });
    // The old bundle is internally consistent — its snapshot join happens at
    // the PIPELINE boundary (deps.context vs req.snapshotId). The laundering
    // attack presents the old records under the CURRENT identity:
    const current = sealContextBundle({ projectName: PROJECT, snapshotId: SNAP, slices: slices(), items: [] });
    const laundered: SealedContext = { identity: current.identity, records: old.records, items: current.items };
    try {
      resolveCitation(laundered, { context_id: 'CTX-0001' });
      throw new Error('should have refused');
    } catch (e) {
      expect(e).toBeInstanceOf(TrustCitationError);
      // the record's own snapshot stamp (RSN-1111…) joins against the current
      // identity first — the stale record is refused before anything resolves
      expect((e as TrustCitationError).code).toBe('context_snapshot_mismatch');
    }
  });

  it('whole-file hash valid but slice window foreign: window edits break the bundle digest', () => {
    const b = bundle();
    const windowTampered = { ...b.records[0]!, end_line: 40, bundle_id: b.identity.bundle_id };
    const tampered: SealedContext = { identity: b.identity, records: [windowTampered, b.records[1]!], items: b.items };
    expect(() => resolveCitation(tampered, { context_id: 'CTX-0001', start_line: 30, end_line: 35 })).toThrowError(TrustCitationError);
  });

  it('a foreign graph node bound onto a record breaks the bundle digest (structural context join)', () => {
    const withNode = sealContextBundle({
      projectName: PROJECT,
      snapshotId: SNAP,
      slices: [{ ...slices()[0]!, node_id: 'foreign_node' }],
      items: [],
    });
    const b = bundle();
    const tampered: SealedContext = { identity: b.identity, records: withNode.records, items: b.items };
    expect(() => resolveCitation(tampered, { context_id: 'CTX-0001' })).toThrowError(TrustCitationError);
  });
});

describe('evidence: support policy is load-bearing', () => {
  it('unvalidated support may hypothesize and request review — never plan or authorize destruction', () => {
    expect(() => assertSupportPolicy('hypothesis', 'unvalidated', 'x')).not.toThrow();
    expect(() => assertSupportPolicy('manual_review', 'unvalidated', 'x')).not.toThrow();
    expect(() => assertSupportPolicy('planning_input', 'unvalidated', 'x')).toThrowError(TrustCitationError);
    expect(() => assertSupportPolicy('destructive_rationale', 'unvalidated', 'x')).toThrowError(TrustCitationError);
  });

  it('absent support is unvalidated; contradicted authorizes nothing; human_confirmed is required for load-bearing use', () => {
    expect(() => assertSupportPolicy('planning_input', undefined, 'x')).toThrow();
    expect(() => assertSupportPolicy('hypothesis', 'contradicted', 'x')).toThrow();
    expect(() => assertSupportPolicy('planning_input', 'human_confirmed', 'x')).not.toThrow();
    expect(() => assertSupportPolicy('destructive_rationale', 'human_confirmed', 'x')).not.toThrow();
  });
});

describe('evidence: seal digests the SAME frozen clone it exposes (post-PR5 I2)', () => {
  it('a getter-equipped item cannot split the identity from the exposed bytes', () => {
    let accesses = 0;
    const dynamic = {
      kind: 'file_slice',
      path: 'src/a.ts',
      start_line: 1,
      end_line: 2,
      get text() {
        accesses += 1;
        return accesses === 1 ? 'FIRST-ACCESS\n' : 'LATER-ACCESS\n';
      },
      content_hash: 'sha256:cc',
    };
    const sealed = sealContextBundle({
      projectName: PROJECT,
      snapshotId: SNAP,
      slices: slices(),
      items: [dynamic] as never,
    });
    // The clone materializes the accessor ONCE (access #1) and the digest is
    // computed over that same frozen clone — pre-fix the digest read the raw
    // caller item (access #1) while the exposed clone carried access #2,
    // splitting identity from exposed bytes.
    expect(accesses).toBe(1);
    expect((sealed.items[0] as unknown as { text: string }).text).toBe('FIRST-ACCESS\n');
    expect(Object.isFrozen(sealed.items[0])).toBe(true);
    // Load-bearing invariant: membership proof over the EXPOSED value holds.
    expect(contextBundleDigest(sealed)).toBe(sealed.identity.bundle_id);
  });

  it('static items keep byte-identical digests after the reorder (stability)', () => {
    const items = [
      { kind: 'file_slice', path: 'src/a.ts', start_line: 1, end_line: 2, text: 'line1\nline2\n', content_hash: 'sha256:aa' },
      { kind: 'node', node_id: 'N-1', label: 'x', source_file: 'src/a.ts' },
    ] as never[];
    const a = sealContextBundle({ projectName: PROJECT, snapshotId: SNAP, slices: slices(), items });
    const b = sealContextBundle({ projectName: PROJECT, snapshotId: SNAP, slices: slices(), items });
    expect(a.identity.bundle_id).toBe(b.identity.bundle_id);
    expect(contextBundleDigest(a)).toBe(a.identity.bundle_id);
  });
});
