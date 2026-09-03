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
  return sealContextBundle({ projectName: PROJECT, snapshotId: SNAP, slices: slices() });
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
    });
    expect(changed.identity.bundle_id).not.toBe(b.identity.bundle_id);
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
    });
    const c = resolveCitation(b, { context_id: 'CTX-0001', start_line: 1, end_line: 2 });
    expect(c.scope).toBe('node_range');
    expect(c.node_id).toBe('node_a');
  });
});

describe('evidence: S4-H-02 — foreign / stale / substituted context matrix', () => {
  it('same context_id, WRONG SNAPSHOT refuses (context_snapshot_mismatch)', () => {
    const staleBundle = sealContextBundle({ projectName: PROJECT, snapshotId: 'RSN-00000000000000aa', slices: slices() });
    // The bundle identity says the ACTIVE snapshot; make the record claim the
    // old one by presenting a bundle whose identity was re-stamped — i.e. a
    // hand-assembled mismatch.
    const tampered: SealedContext = {
      identity: { ...staleBundle.identity, snapshot_id: SNAP },
      records: staleBundle.records,
    };
    expect(() => resolveCitation(tampered, { context_id: 'CTX-0001' })).toThrowError(TrustCitationError);
    try {
      resolveCitation(tampered, { context_id: 'CTX-0001' });
    } catch (e) {
      expect((e as TrustCitationError).code).toBe('context_snapshot_mismatch');
    }
  });

  it('same context_id, WRONG PROJECT refuses (context_project_mismatch)', () => {
    const foreign = sealContextBundle({ projectName: 'other-project', snapshotId: SNAP, slices: slices() });
    const tampered: SealedContext = {
      identity: { ...foreign.identity, project_name: PROJECT },
      records: foreign.records,
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
    const a = sealContextBundle({ projectName: PROJECT, snapshotId: SNAP, slices: [slices()[0]!] });
    const b = sealContextBundle({
      projectName: PROJECT,
      snapshotId: SNAP,
      slices: [{ path: 'src/c.ts', whole_file_hash: 'sha256:cc', start_line: 1, end_line: 9, text: 'c\n', file_line_count: 9 }],
    });
    const spliced: SealedContext = { identity: b.identity, records: a.records };
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
    const tampered: SealedContext = { identity: b.identity, records: [tamperedRecord, b.records[1]!] };
    expect(() => resolveCitation(tampered, { context_id: 'CTX-0001' })).toThrowError(TrustCitationError);
  });

  it('a SPLICED record set (extra record added after sealing) refuses', () => {
    const b = bundle();
    const extra = { ...b.records[0]!, context_id: 'CTX-0003' };
    const spliced: SealedContext = { identity: b.identity, records: [...b.records, extra] };
    expect(() => resolveCitation(spliced, { context_id: 'CTX-0003' })).toThrowError(TrustCitationError);
    try {
      resolveCitation(spliced, { context_id: 'CTX-0003' });
    } catch (e) {
      expect((e as TrustCitationError).code).toBe('context_bundle_mismatch');
    }
  });

  it('a STALE bundle (sealed before a refresh moved the snapshot) cannot resolve under the new identity', () => {
    const old = sealContextBundle({ projectName: PROJECT, snapshotId: 'RSN-1111111111111111', slices: slices() });
    // The old bundle is internally consistent — its snapshot join happens at
    // the PIPELINE boundary (deps.context vs req.snapshotId). The laundering
    // attack presents the old records under the CURRENT identity:
    const current = sealContextBundle({ projectName: PROJECT, snapshotId: SNAP, slices: slices() });
    const laundered: SealedContext = { identity: current.identity, records: old.records };
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
    const tampered: SealedContext = { identity: b.identity, records: [windowTampered, b.records[1]!] };
    expect(() => resolveCitation(tampered, { context_id: 'CTX-0001', start_line: 30, end_line: 35 })).toThrowError(TrustCitationError);
  });

  it('a foreign graph node bound onto a record breaks the bundle digest (structural context join)', () => {
    const withNode = sealContextBundle({
      projectName: PROJECT,
      snapshotId: SNAP,
      slices: [{ ...slices()[0]!, node_id: 'foreign_node' }],
    });
    const b = bundle();
    const tampered: SealedContext = { identity: b.identity, records: withNode.records };
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
