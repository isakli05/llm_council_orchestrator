import { describe, expect, it } from 'vitest';
import { assignContextRecords, assertSupportPolicy, resolveCitation, type ContextRecord } from './evidence';
import { TrustCitationError } from './errors';

function records(): ContextRecord[] {
  return assignContextRecords([
    { path: 'src/a.ts', whole_file_hash: 'sha256:aa', start_line: 1, end_line: 2, slice_text_hash: 'sha256:s1', file_line_count: 50 },
    { path: 'src/b.ts', whole_file_hash: 'sha256:bb', start_line: 1, end_line: 80, slice_text_hash: 'sha256:s2', file_line_count: 80 },
  ]);
}

describe('evidence: context record assignment', () => {
  it('assigns stable CTX ids in order; whole-file detection is exact', () => {
    const rs = records();
    expect(rs.map((r) => r.context_id)).toEqual(['CTX-0001', 'CTX-0002']);
    expect(rs[0].whole_file_supplied).toBe(false); // 1–2 of 50
    expect(rs[1].whole_file_supplied).toBe(true); // 1–80 of 80
  });

  it('dedups identical windows; binds node ids onto the shared record', () => {
    const rs = assignContextRecords([
      { path: 'src/a.ts', whole_file_hash: 'sha256:aa', start_line: 1, end_line: 2, slice_text_hash: 'sha256:s1', file_line_count: 50 },
      { path: 'src/a.ts', whole_file_hash: 'sha256:aa', start_line: 1, end_line: 2, slice_text_hash: 'sha256:s1', file_line_count: 50, node_id: 'node_a' },
      { path: 'src/a.ts', whole_file_hash: 'sha256:aa', start_line: 10, end_line: 20, slice_text_hash: 'sha256:s3', file_line_count: 50 },
    ]);
    expect(rs).toHaveLength(2);
    expect(rs[0].node_id).toBe('node_a');
  });
});

describe('evidence: citation resolution — the S3-H-01 / T3-1 matrix', () => {
  it('THE T3-1 REPRO: supplied 1–2, claimed 10–10 → range_outside_context (ok:true/scope:range is unrepresentable)', () => {
    expect(() =>
      resolveCitation(records(), { context_id: 'CTX-0001', start_line: 10, end_line: 10 }),
    ).toThrowError(TrustCitationError);
    try {
      resolveCitation(records(), { context_id: 'CTX-0001', start_line: 10, end_line: 10 });
    } catch (e) {
      expect((e as TrustCitationError).code).toBe('range_outside_context');
    }
  });

  it('a subrange inside the supplied window resolves to server-computed coordinates', () => {
    const c = resolveCitation(records(), { context_id: 'CTX-0001', start_line: 2, end_line: 2 });
    expect(c.path).toBe('src/a.ts');
    expect(c.content_hash).toBe('sha256:aa');
    expect(c.start_line).toBe(2);
    expect(c.end_line).toBe(2);
    expect(c.scope).toBe('range');
  });

  it('partially-overlapping and escaped ranges refuse', () => {
    expect(() => resolveCitation(records(), { context_id: 'CTX-0001', start_line: 1, end_line: 5 })).toThrow();
    expect(() => resolveCitation(records(), { context_id: 'CTX-0001', start_line: 0, end_line: 2 })).toThrow();
    expect(() => resolveCitation(records(), { context_id: 'CTX-0001', start_line: 2, end_line: 1 })).toThrow();
  });

  it('no subrange on a SLICE record cites the supplied window as range — never whole_file', () => {
    const c = resolveCitation(records(), { context_id: 'CTX-0001' });
    expect(c.scope).toBe('range');
    expect(c.start_line).toBe(1);
    expect(c.end_line).toBe(2);
  });

  it('no subrange on a WHOLE-FILE record is a whole_file citation', () => {
    const c = resolveCitation(records(), { context_id: 'CTX-0002' });
    expect(c.scope).toBe('whole_file');
  });

  it('foreign / fabricated / stale context ids refuse (unknown_context)', () => {
    expect(() => resolveCitation(records(), { context_id: 'CTX-9999' })).toThrowError(TrustCitationError);
    try {
      resolveCitation(records(), { context_id: 'CTX-9999' });
    } catch (e) {
      expect((e as TrustCitationError).code).toBe('unknown_context');
    }
  });

  it('node-bound records yield node_range scope', () => {
    const rs = assignContextRecords([
      { path: 'src/a.ts', whole_file_hash: 'sha256:aa', start_line: 1, end_line: 2, slice_text_hash: 'sha256:s1', file_line_count: 50, node_id: 'node_a' },
    ]);
    const c = resolveCitation(rs, { context_id: 'CTX-0001', start_line: 1, end_line: 2 });
    expect(c.scope).toBe('node_range');
    expect(c.node_id).toBe('node_a');
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
