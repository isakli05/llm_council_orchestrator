import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRenewalClarifySession } from './session';
import { makeRenewalDriver } from './distiller';
import type { AnalysisRecord } from '../recovery/schemas';
import type { OverlayStore } from '../overlay/overlay';
import { loadAnalysisRecords, persistAnalysisRecord } from '../recovery/analysis-store';

const emptyOverlay: OverlayStore = { schema_version: 1, snapshot_id: 'RSN-deadbeefdeadbeef', records: [] };

function uncertaintyAnalysis(): AnalysisRecord {
  const dir = mkdtempSync(join(tmpdir(), 'lco-sess-an-'));
  const record = JSON.parse(
    JSON.stringify({
      schema_version: 1,
      analysis_id: 'AN-0001',
      snapshot_id: 'RSN-deadbeefdeadbeef',
      created_at: '2026-09-02T00:00:00Z',
      role: 'renew_recover',
      model: { gateway: 't', provider_kind: 't', requested_model: 't' },
      prompt_protocol: 'lco-renew/recovery-v1',
      scope: { type: 'whole' },
      input: { context_digest: `sha256:${'a'.repeat(64)}`, item_count: 1, slice_count: 1, truncated: false, warnings: [] },
      outcome: 'validated',
      validation: { schema_ok: true, retry_used: false, issues: [], anchors_total: 1, anchors_ok: 1, anchors_failed: 0 },
      promoted: {
        hypotheses: [],
        uncertainties: [
          {
            id: 'UNC-0001',
            question: 'Keep the small-order fee?',
            impact: 'medium',
            options: [{ option: 'Preserve it' }, { option: 'Drop it' }],
            anchors: [{ path: 'src/orders.ts', content_hash: `sha256:${'b'.repeat(64)}` }],
            // INV-C: anchor results state their provenance scope.
            anchor_results: [{ path: 'src/orders.ts', ok: true, scope: 'whole_file' }],
          },
        ],
      },
      rejected: [],
      coverage_notes: [],
      usage: { calls: 1, attempts: 1, in_tokens: 1, out_tokens: 1, usage_known: true },
    }),
  ) as AnalysisRecord;
  rmSync(dir, { recursive: true, force: true });
  return record;
}

function makeSession(overrides: Record<string, unknown> = {}) {
  const written: unknown[] = [];
  const session = createRenewalClarifySession({
    sessionId: 'sess-1',
    dir: '/tmp/renewal-project',
    projectName: 'orders-crm',
    // Trust kernel: project/snapshot scope is REQUIRED (S3-C-04) — the
    // written approval binds to the fixture's snapshot.
    snapshotId: 'RSN-deadbeefdeadbeef',
    nowIso: () => '2026-09-02T00:00:00Z',
    driver: makeRenewalDriver({ analyses: [uncertaintyAnalysis()], overlay: emptyOverlay, includeStrategy: true }),
    nextApprovalId: () => 'APPR-0001',
    writeApproval: (record: unknown) => {
      written.push(record);
      return { ok: true };
    },
    ...overrides,
  });
  return { session, written };
}

describe('createRenewalClarifySession (ClarifySession implementation)', () => {
  it('initial round surfaces the questions and reports progress', async () => {
    const { session } = makeSession();
    await session.runInitialRound();
    const snap = session.snapshot();
    expect(snap.state).toBe('CLARIFICATION_REQUIRED');
    expect(snap.questions.map((q) => q.claimId).sort()).toEqual(['STG-0001', 'UNC-0001']);
    expect(snap.progress).toEqual({ resolved: 0, remaining: 2, newlyDiscovered: 2 });
    expect(snap.usage.usageKnown).toBe(true); // zero LLM calls — honest zeros
    expect(snap.promptProtocol).toBe('lco-renew/clarify-v1');
  });

  it('rejects answers outside the renewal claim-id namespace (fail-closed validation)', async () => {
    const { session } = makeSession();
    await session.runInitialRound();
    const bad = await session.submitAnswers([
      { decisionId: 'DEC-0001', kind: 'option', selectedOption: 'Preserve it' },
    ]);
    expect(bad.ok).toBe(false);
    expect(session.snapshot().state).toBe('CLARIFICATION_REQUIRED'); // nothing applied
  });

  it('round-trips: answers → revalidation → review → approval → renewal state written', async () => {
    const { session, written } = makeSession();
    await session.runInitialRound();
    const applied = await session.submitAnswers([
      { decisionId: 'UNC-0001', kind: 'option', selectedOption: 'Preserve it' },
      { decisionId: 'STG-0001', kind: 'option', selectedOption: 'strangler' },
    ]);
    expect(applied.ok).toBe(true);
    const snap = session.snapshot();
    expect(snap.state).toBe('FINAL_REVIEW');
    expect(snap.progress).toEqual({ resolved: 2, remaining: 0, newlyDiscovered: 0 });

    const approved = session.approve({ pendingChangeIds: [] });
    expect(approved.ok).toBe(true);
    expect(session.snapshot().state).toBe('APPROVED');
    expect(written).toHaveLength(1);
    const record = written[0] as { decisions: { claim_id: string; selected_option?: string }[] };
    expect(record.decisions.map((d) => d.claim_id).sort()).toEqual(['STG-0001', 'UNC-0001']);
  });

  it('refuses approval while questions remain open', async () => {
    const { session } = makeSession();
    await session.runInitialRound();
    const r = session.approve({ pendingChangeIds: [] });
    expect(r.ok).toBe(false);
    expect(session.snapshot().state).toBe('CLARIFICATION_REQUIRED');
  });

  it('refuses approval with pending change requests', async () => {
    const { session } = makeSession();
    await session.runInitialRound();
    await session.submitAnswers([
      { decisionId: 'UNC-0001', kind: 'option', selectedOption: 'Preserve it' },
      { decisionId: 'STG-0001', kind: 'option', selectedOption: 'strangler' },
    ]);
    const r = session.approve({ pendingChangeIds: ['chg-1'] });
    expect(r.ok).toBe(false);
  });

  it('change sets are refused: renewal clarification has no review document', async () => {
    const { session } = makeSession();
    await session.runInitialRound();
    const r = await session.applyChangeSet({
      reviewVersion: 1,
      changes: [],
      confirmNoChanges: true,
    } as never);
    expect(r.ok).toBe(false);
  });

  it('cancel is honored from the questions state', async () => {
    const { session, written } = makeSession();
    await session.runInitialRound();
    session.cancel('testing');
    expect(session.snapshot().state).toBe('CANCELLED');
    expect(written).toHaveLength(0);
  });

  it('write failures surface as approval failures, never silent success', async () => {
    const { session } = makeSession({
      writeApproval: () => ({ ok: false, error: 'disk full' }),
    });
    await session.runInitialRound();
    await session.submitAnswers([
      { decisionId: 'UNC-0001', kind: 'option', selectedOption: 'Preserve it' },
      { decisionId: 'STG-0001', kind: 'option', selectedOption: 'strangler' },
    ]);
    const r = session.approve({ pendingChangeIds: [] });
    expect(r.ok).toBe(false);
    expect(session.snapshot().state).toBe('FINAL_REVIEW'); // not APPROVED
  });

  it('answers become canonical, locally-hashed user evidence in the approval payload', async () => {
    const { session, written } = makeSession();
    await session.runInitialRound();
    await session.submitAnswers([
      { decisionId: 'UNC-0001', kind: 'option', selectedOption: 'Preserve it' },
      { decisionId: 'STG-0001', kind: 'option', selectedOption: 'strangler' },
    ]);
    session.approve({ pendingChangeIds: [] });
    const record = written[0] as { decisions: { evidence: { source: string; hash: string } }[] };
    for (const d of record.decisions) {
      expect(d.evidence.source).toMatch(/^renewal-clarify:sess-1\/round\d+$/);
      expect(d.evidence.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    }
  });
});

describe('loadAnalysisRecords interop (analyses feed the distiller)', () => {
  it('loads persisted records for distillation', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lco-sess-store-'));
    try {
      persistAnalysisRecord(dir, dir, uncertaintyAnalysis());
      const loaded = loadAnalysisRecords(dir, dir);
      expect(loaded.records).toHaveLength(1);
      expect(loaded.records[0].promoted.uncertainties).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
