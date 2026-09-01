import { describe, it, expect, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ParityEntrySchema,
  addParityEntry,
  applyApprovalToParity,
  emptyParity,
  loadParity,
  parityFromAnalyses,
  parityGate,
  parityProjection,
  persistParity,
  setRuling,
} from './ledger';
import type { AnalysisRecord } from '../recovery/schemas';
import type { RenewalApprovalRecord } from '../clarify/approvals';

const tmpDirs: string[] = [];
function freshDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'lco-par-'));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
  tmpDirs.length = 0;
});

const sha = (s: string) => `sha256:${createHash('sha256').update(s).digest('hex')}`;
const SNAP = 'RSN-deadbeefdeadbeef';
const ANCHOR = { path: 'src/orders.ts', content_hash: sha('orders bytes') };

function hypothesisAnalysis(): AnalysisRecord {
  return JSON.parse(
    JSON.stringify({
      schema_version: 1,
      analysis_id: 'AN-0001',
      snapshot_id: SNAP,
      created_at: '2026-09-02T00:00:00Z',
      role: 'renew_recover',
      model: { gateway: 't', provider_kind: 't', requested_model: 't' },
      prompt_protocol: 'lco-renew/recovery-v1',
      scope: { type: 'whole' },
      input: { context_digest: sha('x'), item_count: 1, slice_count: 1, truncated: false, warnings: [] },
      outcome: 'validated',
      validation: { schema_ok: true, retry_used: false, issues: [], anchors_total: 1, anchors_ok: 1, anchors_failed: 0 },
      promoted: {
        hypotheses: [
          {
            id: 'BHV-0001',
            statement: 'Orders under $25 incur a $4.95 small-order fee.',
            category: 'business_rule',
            confidence: 'medium',
            anchors: [ANCHOR],
            rationale: 'seen in source',
            status: 'hypothesized',
            anchor_results: [{ path: 'src/orders.ts', ok: true }],
          },
        ],
        uncertainties: [],
      },
      rejected: [],
      coverage_notes: [],
      usage: { calls: 1, attempts: 1, in_tokens: 1, out_tokens: 1, usage_known: true },
    }),
  ) as AnalysisRecord;
}

function approval(decisions: { claim_id: string; selected_option: string }[]): RenewalApprovalRecord {
  return {
    schema_version: 1,
    approval_id: 'APPR-0001',
    session_id: 's1',
    round_count: 1,
    approved_at: '2026-09-02T00:00:00Z',
    decisions: decisions.map((d) => ({
      claim_id: d.claim_id,
      kind: 'uncertainty',
      selected_option: d.selected_option,
      evidence: { source: 'renewal-clarify:s1/round1', answer_text: d.selected_option, hash: sha(d.selected_option) },
    })),
    content_digest: sha(JSON.stringify(decisions)),
  } as RenewalApprovalRecord;
}

function stageTarget(): string {
  const root = freshDir();
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src', 'orders.ts'), 'orders bytes');
  return root;
}

describe('parityFromAnalyses (discovered behavior NEVER silently drops)', () => {
  it('seeds one unresolved entry per promoted hypothesis, anchored to source', () => {
    const store = parityFromAnalyses([hypothesisAnalysis()], SNAP);
    expect(store.records).toHaveLength(1);
    const e = store.records[0];
    expect(e.id).toBe('PAR-0001');
    expect(e.ruling).toBe('unresolved');
    expect(e.behavior).toContain('small-order fee');
    expect(e.evidence[0]).toMatchObject({ kind: 'code_anchor' });
    expect(e.source_analysis).toBe('AN-0001');
  });
});

describe('ruling invariants', () => {
  it('a ruled entry REQUIRES a rationale', () => {
    expect(
      ParityEntrySchema.safeParse({
        id: 'PAR-0001',
        behavior: 'b',
        ruling: 'preserve',
        evidence: [{ kind: 'code_anchor', anchor: ANCHOR }],
        snapshot_id: SNAP,
      }).success,
    ).toBe(false);
  });

  it('DROP requires explicit approval lineage (the destructive act is human)', () => {
    const store = emptyParity(SNAP);
    addParityEntry(store, { behavior: 'b', evidence: [{ kind: 'code_anchor', anchor: ANCHOR }] });
    expect(() => setRuling(store, 'PAR-0001', { ruling: 'drop', rationale: 'unused' })).toThrow(/approval/i);
    expect(() =>
      setRuling(store, 'PAR-0001', { ruling: 'drop', rationale: 'unused', approvalId: 'APPR-0001' }),
    ).not.toThrow();
  });

  it('explicit setRuling records rationale + approval lineage', () => {
    const store = emptyParity(SNAP);
    addParityEntry(store, { behavior: 'b', evidence: [{ kind: 'code_anchor', anchor: ANCHOR }] });
    setRuling(store, 'PAR-0001', { ruling: 'preserve', rationale: 'revenue relevant', approvalId: 'APPR-0002' });
    expect(store.records[0]).toMatchObject({
      ruling: 'preserve',
      rationale: 'revenue relevant',
      approval_id: 'APPR-0002',
    });
  });
});

describe('applyApprovalToParity (approval decisions drive rulings)', () => {
  it('canonical preserve/drop language maps to rulings with lineage', () => {
    const store = parityFromAnalyses([hypothesisAnalysis()], SNAP);
    // Link the entry to the decision by seeding the uncertainty path: the
    // entry is hypothesis-derived; the approval decides the linked question.
    store.records[0].decision_claim_id = 'UNC-0001';
    const r = applyApprovalToParity(store, approval([{ claim_id: 'UNC-0001', selected_option: 'Preserve the fee exactly' }]));
    expect(r.updated).toEqual(['PAR-0001']);
    expect(store.records[0].ruling).toBe('preserve');
    expect(store.records[0].approval_id).toBe('APPR-0001');
    expect(store.records[0].rationale).toContain('Preserve the fee exactly');
  });

  it('DROP language only maps with the word drop — never by omission', () => {
    const store = parityFromAnalyses([hypothesisAnalysis()], SNAP);
    store.records[0].decision_claim_id = 'UNC-0001';
    applyApprovalToParity(store, approval([{ claim_id: 'UNC-0001', selected_option: 'Drop the fee entirely' }]));
    expect(store.records[0].ruling).toBe('drop');
  });

  it('ambiguous approved text stays UNRESOLVED and visible (blocks, never guesses)', () => {
    const store = parityFromAnalyses([hypothesisAnalysis()], SNAP);
    store.records[0].decision_claim_id = 'UNC-0001';
    const r = applyApprovalToParity(store, approval([{ claim_id: 'UNC-0001', selected_option: 'Revisit the threshold later' }]));
    expect(r.updated).toEqual(['PAR-0001']);
    expect(store.records[0].ruling).toBe('unresolved');
    expect(store.records[0].rationale).toContain('Revisit the threshold later');
  });
});

describe('parityGate (plan finalization precondition)', () => {
  it('blocks on unresolved entries with actionable ids', () => {
    const store = parityFromAnalyses([hypothesisAnalysis()], SNAP);
    const root = stageTarget();
    const gate = parityGate(store, root);
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.blockers.some((b) => b.id === 'PAR-0001' && /unresolved/.test(b.reason))).toBe(true);
  });

  it('blocks on stale anchors (verified against the live tree)', () => {
    const store = parityFromAnalyses([hypothesisAnalysis()], SNAP);
    store.records[0].decision_claim_id = 'UNC-0001';
    applyApprovalToParity(store, approval([{ claim_id: 'UNC-0001', selected_option: 'Preserve it' }]));
    const root = stageTarget();
    writeFileSync(join(root, 'src', 'orders.ts'), 'CHANGED');
    const gate = parityGate(store, root);
    expect(gate.ok).toBe(false);
  });

  it('passes when every entry is ruled and anchored to current source', () => {
    const store = parityFromAnalyses([hypothesisAnalysis()], SNAP);
    store.records[0].decision_claim_id = 'UNC-0001';
    applyApprovalToParity(store, approval([{ claim_id: 'UNC-0001', selected_option: 'Preserve it' }]));
    expect(parityGate(store, stageTarget()).ok).toBe(true);
  });
});

describe('projection to the spec legacy package + persistence', () => {
  it('projects ruled entries to preserve_change_drop items', () => {
    const store = parityFromAnalyses([hypothesisAnalysis()], SNAP);
    store.records[0].decision_claim_id = 'UNC-0001';
    applyApprovalToParity(store, approval([{ claim_id: 'UNC-0001', selected_option: 'Preserve it' }]));
    const projection = parityProjection(store);
    expect(projection.items).toHaveLength(1);
    expect(projection.items[0]).toMatchObject({ behavior: expect.stringContaining('small-order'), decision: 'preserve' });
    expect(projection.anchors).toHaveLength(1); // evidence the planner must materialize as E- items
  });

  it('projection refuses unresolved entries (nothing partial)', () => {
    const store = parityFromAnalyses([hypothesisAnalysis()], SNAP);
    expect(() => parityProjection(store)).toThrow(/unresolved/);
  });

  it('persists atomically, reloads, and fails closed on corruption', () => {
    const dir = freshDir();
    const path = join(dir, 'parity.json');
    const store = parityFromAnalyses([hypothesisAnalysis()], SNAP);
    expect(persistParity(path, store)).toMatchObject({ ok: true });
    const loaded = loadParity(path);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.store.records).toHaveLength(1);
    writeFileSync(path, '{nope');
    expect(loadParity(path).ok).toBe(false);
  });
});
