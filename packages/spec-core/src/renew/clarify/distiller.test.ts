import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  RENEWAL_CLAIM_ID,
  distillRenewalQuestions,
  makeRenewalDriver,
  strategyQuestion,
} from './distiller';
import type { AnalysisRecord } from '../recovery/schemas';
import type { OverlayStore } from '../overlay/overlay';

const sha = (s: string) => `sha256:${createHash('sha256').update(s).digest('hex')}`;

function analysisWithUncertainty(): AnalysisRecord {
  return JSON.parse(
    JSON.stringify({
      schema_version: 1,
      analysis_id: 'AN-0001',
      snapshot_id: 'RSN-deadbeefdeadbeef',
      created_at: '2026-09-02T00:00:00Z',
      role: 'renew_recover',
      model: { gateway: 't', provider_kind: 't', requested_model: 't' },
      prompt_protocol: 'lco-renew/recovery-v1',
      scope: { type: 'whole' },
      input: { context_digest: sha('x'), item_count: 1, slice_count: 1, truncated: false, warnings: [] },
      outcome: 'validated',
      validation: { schema_ok: true, retry_used: false, issues: [], anchors_total: 1, anchors_ok: 1, anchors_failed: 0 },
      promoted: {
        hypotheses: [],
        uncertainties: [
          {
            id: 'UNC-0001',
            question: 'Should the small-order fee survive modernization unchanged?',
            impact: 'medium',
            options: [
              { option: 'Preserve the fee exactly', note: 'customers may rely on it' },
              { option: 'Revisit the threshold', note: 'the $25 cutoff is arbitrary' },
            ],
            anchors: [{ path: 'src/orders.ts', content_hash: sha('orders') }],
            anchor_results: [{ path: 'src/orders.ts', ok: true }],
          },
        ],
      },
      rejected: [],
      coverage_notes: [],
      usage: { calls: 1, attempts: 1, in_tokens: 1, out_tokens: 1, usage_known: true },
    }),
  ) as AnalysisRecord;
}

describe('strategyQuestion (human-only strategy selection)', () => {
  it('offers the six modeled strategies with consequence notes', () => {
    const q = strategyQuestion();
    expect(q.claimId).toBe('STG-0001');
    expect(RENEWAL_CLAIM_ID.test(q.claimId)).toBe(true);
    expect(q.alternatives).toHaveLength(6);
    expect(q.alternatives.every((a) => a.option.length > 0 && a.rejected_because.length > 0)).toBe(true);
  });
});

describe('distillRenewalQuestions', () => {
  it('turns promoted uncertainties into questions (notes become trade-off previews)', () => {
    const overlay: OverlayStore = { schema_version: 1, snapshot_id: 'RSN-deadbeefdeadbeef', records: [] };
    const questions = distillRenewalQuestions({ analyses: [analysisWithUncertainty()], overlay });
    expect(questions).toHaveLength(1);
    expect(questions[0].claimId).toBe('UNC-0001');
    expect(questions[0].question).toContain('small-order fee');
    expect(questions[0].alternatives[0]).toEqual({
      option: 'Preserve the fee exactly',
      rejected_because: 'customers may rely on it',
    });
  });

  it('adds review questions for manual_review / uncertain_behavior overlay records', () => {
    const overlay: OverlayStore = {
      schema_version: 1,
      snapshot_id: 'RSN-deadbeefdeadbeef',
      records: [
        {
          id: 'OVL-0002',
          relation: 'manual_review',
          subject: { path: 'src/inventory.ts', symbol: 'decrementStock' },
          anchors: [{ path: 'src/inventory.ts', content_hash: sha('inv') }],
          snapshot_id: 'RSN-deadbeefdeadbeef',
          confidence: 'low',
          status: 'active',
          lineage: {},
          note: 'side effects at restock time are not statically derivable',
        },
      ],
    };
    const questions = distillRenewalQuestions({ analyses: [], overlay });
    expect(questions).toHaveLength(1);
    expect(questions[0].claimId).toBe('OVL-0002');
    expect(questions[0].question).toContain('decrementStock');
    expect(questions[0].alternatives.length).toBeGreaterThanOrEqual(2);
  });
});

describe('makeRenewalDriver (deterministic round driver)', () => {
  const overlay: OverlayStore = { schema_version: 1, snapshot_id: 'RSN-deadbeefdeadbeef', records: [] };

  it('asks unanswered questions until none remain, then signals done', () => {
    const driver = makeRenewalDriver({ analyses: [analysisWithUncertainty()], overlay, includeStrategy: true });
    const first = driver.questionsFor(new Set());
    expect(first.questions.map((q) => q.claimId).sort()).toEqual(['STG-0001', 'UNC-0001']);
    expect(first.done).toBe(false);

    const afterBoth = driver.questionsFor(new Set(['STG-0001', 'UNC-0001']));
    expect(afterBoth.questions).toHaveLength(0);
    expect(afterBoth.done).toBe(true);
  });

  it('approvalPayload canonicalizes answers as locally-hashed user evidence', () => {
    const driver = makeRenewalDriver({ analyses: [analysisWithUncertainty()], overlay, includeStrategy: false });
    const payload = driver.approvalPayload(
      new Map([
        [
          'UNC-0001',
          { answer: { decisionId: 'UNC-0001', kind: 'option' as const, selectedOption: 'Preserve the fee exactly' }, appliedRound: 1 },
        ],
      ]),
      { sessionId: 'sess-1' },
    );
    expect(payload.decisions).toHaveLength(1);
    const d = payload.decisions[0];
    expect(d.claim_id).toBe('UNC-0001');
    expect(d.kind).toBe('uncertainty');
    expect(d.selected_option).toBe('Preserve the fee exactly');
    expect(d.evidence.source).toBe('renewal-clarify:sess-1/round1');
    expect(d.evidence.hash).toBe(sha(d.evidence.answer_text));
  });
});
