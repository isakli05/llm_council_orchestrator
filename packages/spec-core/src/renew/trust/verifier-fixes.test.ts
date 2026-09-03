import { describe, expect, it } from 'vitest';
import { buildRenewalApprovalRecord, validateRenewalApproval } from './authority';
import { createHash } from 'node:crypto';

const sha = (t: string) => `sha256:${createHash('sha256').update(t, 'utf8').digest('hex')}`;

describe('verifier-fix regressions (A–F wave)', () => {
  it('C-5: a decision kind that disagrees with its claim prefix is schema-refused', () => {
    const base = {
      approval_id: 'APPR-0001',
      session_id: 's',
      round_count: 1,
      approved_at: '2026-09-03T00:00:00Z',
      project_name: 'p',
      snapshot_id: 'RSN-0123456789abcdef',
      decisions: [
        {
          claim_id: 'PAR-0001',
          kind: 'uncertainty' as never, // wrong kind for the prefix
          selected_option: 'drop',
          evidence: { source: 's', answer_text: 'drop', hash: sha('drop') },
        },
      ],
    };
    expect(() => buildRenewalApprovalRecord(base)).toThrow();
    expect(() => validateRenewalApproval({ record: { ...base, content_digest: 'x' } })).toThrow();
  });

  it('C-2: a ruled parity entry without human-confirmed support blocks the gate (support axis load-bearing)', async () => {
    const { parityGate } = await import('../parity/ledger');
    const { emptyParity, addParityEntry, setRuling } = await import('../parity/ledger');
    const store = emptyParity('RSN-0123456789abcdef');
    addParityEntry(store, { behavior: 'b', evidence: [{ kind: 'code_anchor', anchor: { path: 'a.ts', content_hash: sha('a') } }] });
    // hand-rule WITHOUT approval: setRuling sets human_confirmed; simulate a
    // legacy/hand-edited ruled entry by writing the field off afterwards.
    setRuling(store, 'PAR-0001', { ruling: 'drop', rationale: 'r', approvalId: 'APPR-0001' });
    const tampered = JSON.parse(JSON.stringify(store));
    delete tampered.records[0].support_status;
    delete tampered.records[0].approval_id;
    const gate = parityGate(tampered, '/nonexistent-target', { loadApproval: () => undefined, activeSnapshot: 'RSN-0123456789abcdef' });
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.blockers.some((b) => /lacks human-confirmed support/.test(b.reason))).toBe(true);
  });

  it('C-4: duplicate model claim ids are a schema failure (never a silent merge)', async () => {
    const { RecoveryOutputSchema } = await import('../recovery/schemas');
    const dup = {
      hypotheses: [
        { id: 'BHV-0001', statement: 'a', category: 'business_rule', confidence: 'high', anchors: [{ context_id: 'CTX-0001' }], rationale: 'r' },
        { id: 'BHV-0001', statement: 'b', category: 'business_rule', confidence: 'high', anchors: [{ context_id: 'CTX-0001' }], rationale: 'r' },
      ],
      uncertainties: [],
      coverage_notes: [],
    };
    expect(RecoveryOutputSchema.safeParse(dup).success).toBe(false);
  });
});
