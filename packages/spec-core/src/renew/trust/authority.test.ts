import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  STRATEGY_CLAIM_ID,
  buildRenewalApprovalRecord,
  canonicalRuling,
  renewalApprovalDigest,
  validateRenewalApproval,
  verifyStrategyAuthority,
  type ApprovalDecision,
  type RenewalApprovalRecord,
} from './authority';
import { TrustAuthorityError } from './errors';

const SCOPE = { projectName: 'payments', snapshotId: 'RSN-0123456789abcdef' };

function decision(over: Partial<ApprovalDecision> = {}): ApprovalDecision {
  return {
    claim_id: 'PAR-0001',
    kind: 'parity',
    selected_option: 'drop',
    free_text: 'approved decommission',
    evidence: { source: 'workspace', answer_text: 'Drop it.', hash: 'placeholder' },
    ...over,
  };
}

function record(over: Partial<Parameters<typeof buildRenewalApprovalRecord>[0]> = {}): RenewalApprovalRecord {
  const args = {
    approval_id: 'APPR-0001',
    session_id: 'sess-1',
    round_count: 1,
    approved_at: '2026-09-03T00:00:00Z',
    project_name: SCOPE.projectName,
    snapshot_id: SCOPE.snapshotId,
    decisions: [decision()],
    ...over,
  };
  // evidence hash must match its text (the builder contract)
  const decisions = args.decisions.map((d) => ({
    ...d,
    evidence: {
      ...d.evidence,
      hash: `sha256:${createHash('sha256').update(d.evidence.answer_text, 'utf8').digest('hex')}`,
    },
  }));
  return buildRenewalApprovalRecord({ ...args, decisions });
}

describe('authority: digest v3 binds the complete authority body', () => {
  it('one-field-at-a-time mutation matrix invalidates the stored digest', () => {
    const base = record();
    const mutants: Array<[string, (r: RenewalApprovalRecord) => RenewalApprovalRecord]> = [
      ['approval_id', (r) => ({ ...r, approval_id: 'APPR-0002' })],
      ['session_id', (r) => ({ ...r, session_id: 'sess-2' })],
      ['round_count', (r) => ({ ...r, round_count: 2 })],
      ['project_name', (r) => ({ ...r, project_name: 'other-project' })],
      ['snapshot_id', (r) => ({ ...r, snapshot_id: 'RSN-fedcba9876543210' })],
      ['decision option', (r) => ({ ...r, decisions: [decision({ selected_option: 'preserve' })] })],
      ['decision claim', (r) => ({ ...r, decisions: [decision({ claim_id: 'PAR-0002' })] })],
      ['decision text', (r) => ({ ...r, decisions: [decision({ free_text: 'changed' })] })],
      ['evidence source', (r) => ({ ...r, decisions: [decision({ evidence: { source: 'cli', answer_text: 'Drop it.', hash: 'sha256:x' } })] })],
    ];
    for (const [name, mutate] of mutants) {
      expect(() => validateRenewalApproval({ record: mutate(base), expectedApprovalId: 'APPR-0001' }), name).toThrowError(
        TrustAuthorityError,
      );
    }
  });

  it('decision LIST ORDER never changes the digest (sorted projection)', () => {
    const a = record();
    const b = record({ decisions: [decision(), decision({ claim_id: 'PAR-0002', kind: 'parity' })] });
    const reversed = { ...b, decisions: [...b.decisions].reverse() };
    expect(renewalApprovalDigest(reversed)).toBe(renewalApprovalDigest(b));
    expect(a.content_digest).not.toBe(b.content_digest);
  });

  it('a valid record passes full validation with its expected reference', () => {
    const r = record();
    const validated = validateRenewalApproval({ record: r, expectedApprovalId: 'APPR-0001', activeScope: SCOPE });
    expect(validated.approval_id).toBe('APPR-0001');
  });
});

describe('authority: referential integrity fails CLOSED (S3-C-04)', () => {
  it('a record filed under a mismatched reference id refuses (id_mismatch)', () => {
    const r = record(); // carries APPR-0001
    expect(() => validateRenewalApproval({ record: r, expectedApprovalId: 'APPR-0009' })).toThrowError(TrustAuthorityError);
    try {
      validateRenewalApproval({ record: r, expectedApprovalId: 'APPR-0009' });
    } catch (e) {
      expect((e as TrustAuthorityError).code).toBe('id_mismatch');
    }
  });

  it('an unscoped (v2-shaped) record no longer parses — scope is required', () => {
    const r = record() as unknown as Record<string, unknown>;
    delete r.project_name;
    delete r.snapshot_id;
    try {
      validateRenewalApproval({ record: r });
      throw new Error('should have refused');
    } catch (e) {
      expect(e).toBeInstanceOf(TrustAuthorityError);
      expect((e as TrustAuthorityError).code).toBe('approval_corrupt');
    }
  });

  it('active-scope joins: wrong project or wrong snapshot refuses', () => {
    const r = record();
    expect(() => validateRenewalApproval({ record: r, activeScope: { ...SCOPE, projectName: 'other' } })).toThrowError(/project/);
    expect(() => validateRenewalApproval({ record: r, activeScope: { ...SCOPE, snapshotId: 'RSN-fedcba9876543210' } })).toThrowError(
      /snapshot/,
    );
  });

  it('answer-text evidence hash mismatch refuses — even when the digest is re-forged to match', () => {
    const r = record();
    // Digest-VALID body whose evidence hash does NOT match its own answer
    // text (the mutual-consistency gap the third audit named): a forger who
    // recomputes the outer digest still cannot pass the per-decision check.
    const inconsistent: RenewalApprovalRecord = {
      ...r,
      decisions: [
        { ...r.decisions[0], evidence: { ...r.decisions[0].evidence, hash: 'sha256:' + 'ab'.repeat(32) } },
      ],
    };
    inconsistent.content_digest = renewalApprovalDigest(inconsistent); // digest now "valid"
    expect(() => validateRenewalApproval({ record: inconsistent })).toThrowError(/evidence hash/);
    // and the naive tamper (text changed, nothing recomputed) still dies at the digest
    const naive = { ...r, decisions: [{ ...r.decisions[0], evidence: { ...r.decisions[0].evidence, answer_text: 'Preserve it.' } }] };
    expect(() => validateRenewalApproval({ record: naive })).toThrowError(TrustAuthorityError);
  });
});

describe('authority: canonical rulings stay exact', () => {
  it('only exact canonical ids rule; negation/keyword shapes never do', () => {
    expect(canonicalRuling('drop')).toBe('drop');
    expect(canonicalRuling('Do not drop; preserve')).toBeUndefined();
    expect(canonicalRuling('DROP')).toBeUndefined();
    expect(canonicalRuling('drop ')).toBeUndefined();
    expect(canonicalRuling(undefined)).toBeUndefined();
  });
});

describe('authority: workspace strategy verification (S3-H-08)', () => {
  it('a workspace selection resolves its approval, its scope, and its OWN structured choice', () => {
    const strat = {
      strategy: 'strangler' as const,
      rationale: 'incremental',
      selected_by: 'human' as const,
      selected_via: 'workspace' as const,
      approval_id: 'APPR-0001',
      selected_at: '2026-09-03T00:00:00Z',
      snapshot_id: SCOPE.snapshotId,
    };
    const approving = record({
      decisions: [decision({ claim_id: STRATEGY_CLAIM_ID, kind: 'strategy', selected_option: 'strangler' })],
    });
    expect(() =>
      verifyStrategyAuthority({
        decision: { ...strat, schema_version: 1 as const },
        resolveApproval: (id) => {
          if (id !== 'APPR-0001') throw new Error('wrong id');
          return validateRenewalApproval({ record: approving, expectedApprovalId: id, activeScope: SCOPE });
        },
        activeScope: SCOPE,
      }),
    ).not.toThrow();
  });

  it('an approval selecting a DIFFERENT strategy does not authorize the decision', () => {
    const strat = {
      schema_version: 1 as const,
      strategy: 'big_wrong' as never,
      rationale: 'x',
      selected_by: 'human' as const,
      selected_via: 'workspace' as const,
      approval_id: 'APPR-0001',
      selected_at: '2026-09-03T00:00:00Z',
      snapshot_id: SCOPE.snapshotId,
    };
    const approvingOther = record({
      decisions: [decision({ claim_id: STRATEGY_CLAIM_ID, kind: 'strategy', selected_option: 'in_place' })],
    });
    expect(() =>
      verifyStrategyAuthority({
        decision: strat,
        resolveApproval: () => validateRenewalApproval({ record: approvingOther, activeScope: SCOPE }),
        activeScope: SCOPE,
      }),
    ).toThrowError(TrustAuthorityError);
  });
});
