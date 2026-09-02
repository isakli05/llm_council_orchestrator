/**
 * Clarification/approval trust invariants (TRACK F): canonical CHANGE
 * rulings round-trip (H-08), approval records self-verify on load (F3),
 * review revalidates the source state (H-09), and approval references in
 * parity resolve to verified, authorizing records (F4).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  cmdRenewInit,
  cmdRenewAnalyze,
  cmdRenewReview,
  type RenewCapabilities,
} from '../cli/commands/renew';
import { StaticGraphProvider } from './intel/fixture-provider';
import { parseGraphText } from './intel/graph-reader';
import { singleRoutePlan } from '../llm/plan';
import type { LlmAdapter, LlmResponse } from '../eval/llm/adapter';
import {
  applyApprovalToParity,
  canonicalRuling,
  emptyParity,
  parityGate,
} from './parity/ledger';
import { buildRenewalApprovalRecord, loadRenewalApproval, renewalApprovalDigest, type RenewalApprovalRecord } from './clarify/approvals';

const tmpDirs: string[] = [];
function freshDir(p: string): string {
  const dir = mkdtempSync(join(tmpdir(), p));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
  tmpDirs.length = 0;
});

const sha = (s: string | Buffer) => `sha256:${createHash('sha256').update(s).digest('hex')}`;
const FIXTURE_SRC = join(__dirname, '..', '..', 'fixtures', 'legacy-app');

function graphCaps(): RenewCapabilities {
  const g = parseGraphText(readFileSync(join(FIXTURE_SRC, 'graph-fixture.json'), 'utf8'));
  if (!g.ok) throw new Error(g.message);
  return {
    nowIso: () => '2026-09-02T12:00:00.000Z',
    provider: () => new StaticGraphProvider(g.graph, '0.9.50'),
    gitCommit: () => undefined,
  };
}

function makeTarget(): string {
  const target = freshDir('lco-clr-target-');
  cpSync(join(FIXTURE_SRC, 'src'), join(target, 'src'), { recursive: true });
  cpSync(join(FIXTURE_SRC, 'package.json'), join(target, 'package.json'));
  return target;
}

describe('canonical ruling language (H-08 / S2-C-05)', () => {
  it('only the canonical option ids authorize — prose NEVER maps (free text cannot rule)', () => {
    // S2-C-05: rulingFromApprovedText is deleted; the ONLY text→ruling mapping
    // left in the system is this pure identity check on canonical option ids.
    expect(canonicalRuling('preserve')).toBe('preserve');
    expect(canonicalRuling('change')).toBe('change');
    expect(canonicalRuling('drop')).toBe('drop');
    // Prose that used to keyword-match — and once authorized DROP — must not.
    expect(canonicalRuling('Preserve current behavior; verify parity during migration')).toBeUndefined();
    expect(canonicalRuling('keep it as-is')).toBeUndefined();
    expect(canonicalRuling('Drop the behavior as unused')).toBeUndefined();
    expect(canonicalRuling('remove this dead path')).toBeUndefined();
    expect(canonicalRuling('maybe look at it later')).toBeUndefined();
    expect(canonicalRuling(undefined)).toBeUndefined();
  });

  it('a CHANGE approval actually produces a change ruling in the ledger', () => {
    const store = emptyParity('RSN-aaaaaaaaaaaaaaaa');
    store.records.push({
      id: 'PAR-0001',
      behavior: 'Discount applies under threshold.',
      ruling: 'unresolved',
      evidence: [{ kind: 'code_anchor', anchor: { path: 'src/pricing.ts', content_hash: sha('x') } }],
      snapshot_id: 'RSN-aaaaaaaaaaaaaaaa',
      decision_claim_id: 'PAR-0001',
    } as never);
    const record = buildRenewalApprovalRecord(
      {
        decisions: [
          {
            claim_id: 'PAR-0001',
            kind: 'parity',
            selected_option: 'change',
            free_text: 'Change the behavior deliberately; capture the new intent',
            evidence: { source: 'test', answer_text: 'change', hash: sha('change') },
          },
        ],
      },
      { approvalId: 'APPR-0001', sessionId: 's', roundCount: 1, approvedAt: '2026-09-02T12:00:00.000Z', snapshotId: 'RSN-aaaaaaaaaaaaaaaa' },
    );
    const result = applyApprovalToParity(store, record);
    expect(result.stillUnresolved).toHaveLength(0);
    expect(store.records[0]!.ruling).toBe('change');
    expect(store.records[0]!.approval_id).toBe('APPR-0001');
    expect(store.records[0]!.support_status).toBe('human_confirmed');
  });
});

describe('approval record self-verification (F3)', () => {
  const buildRecord = () =>
    buildRenewalApprovalRecord(
      {
        decisions: [
          {
            claim_id: 'PAR-0001',
            kind: 'parity',
            selected_option: 'Preserve current behavior',
            evidence: { source: 'test', answer_text: 'Preserve current behavior', hash: sha('Preserve current behavior') },
          },
        ],
      },
      { approvalId: 'APPR-0001', sessionId: 's', roundCount: 1, approvedAt: '2026-09-02T12:00:00.000Z', snapshotId: 'RSN-aaaaaaaaaaaaaaaa' },
    );

  it('a well-formed record loads verified', () => {
    const dir = freshDir('lco-appr-');
    writeFileSync(join(dir, 'APPR-0001.json'), JSON.stringify(buildRecord()));
    const r = loadRenewalApproval(join(dir, 'APPR-0001.json'));
    expect(r.ok).toBe(true);
  });

  it('a tampered content_digest is refused', () => {
    const dir = freshDir('lco-appr-');
    const rec = buildRecord() as unknown as Record<string, unknown>;
    rec.content_digest = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';
    writeFileSync(join(dir, 'APPR-0001.json'), JSON.stringify(rec));
    const r = loadRenewalApproval(join(dir, 'APPR-0001.json'));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('digest_mismatch');
  });

  it('tampered answer TEXT is refused (digest or evidence hash catches it)', () => {
    const dir = freshDir('lco-appr-');
    const rec = buildRecord() as unknown as RenewalApprovalRecord;
    rec.decisions[0]!.evidence.answer_text = 'Drop everything instead';
    // Keep the digest CONSISTENT with the tampered decisions (v2 binds ALL
    // authority fields) so the per-decision evidence-hash layer is the one
    // that fires (both layers must detect).
    rec.content_digest = renewalApprovalDigest({
      schema_version: rec.schema_version,
      approval_id: rec.approval_id,
      session_id: rec.session_id,
      round_count: rec.round_count,
      ...(rec.project_name !== undefined ? { project_name: rec.project_name } : {}),
      ...(rec.snapshot_id !== undefined ? { snapshot_id: rec.snapshot_id } : {}),
      decisions: rec.decisions,
    });
    writeFileSync(join(dir, 'APPR-0001.json'), JSON.stringify(rec));
    const r = loadRenewalApproval(join(dir, 'APPR-0001.json'));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('evidence_mismatch');
  });

  it('a tampered authority field (snapshot_id) is refused by the v2 digest (S2-C-04)', () => {
    const dir = freshDir('lco-appr-');
    const rec = buildRecord() as unknown as RenewalApprovalRecord;
    rec.snapshot_id = 'RSN-ffffffffffffffff'; // moved authority to another state
    writeFileSync(join(dir, 'APPR-0001.json'), JSON.stringify(rec));
    const r = loadRenewalApproval(join(dir, 'APPR-0001.json'));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('digest_mismatch');
  });
});

describe('approval referential integrity at the gate (F4 / C-08)', () => {
  const anchor = { path: 'src/pricing.ts', content_hash: sha('x') };

  it('a FABRICATED approval id blocks planning instead of authorizing', () => {
    const store = emptyParity('RSN-aaaaaaaaaaaaaaaa');
    store.records.push({
      id: 'PAR-0001',
      behavior: 'b',
      ruling: 'drop',
      rationale: 'r',
      approval_id: 'APPR-9999',
      evidence: [{ kind: 'code_anchor', anchor }],
      snapshot_id: 'RSN-aaaaaaaaaaaaaaaa',
    } as never);
    const gate = parityGate(store, '/nonexistent-root-for-anchors', {
      loadApproval: () => undefined, // APPR-9999 does not exist
      activeSnapshot: 'RSN-aaaaaaaaaaaaaaaa',
    });
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.blockers[0]!.reason).toMatch(/APPR-9999 does not exist/);
  });

  it('an approval from ANOTHER snapshot does not authorize the ruling', () => {
    const record = buildRenewalApprovalRecord(
      {
        decisions: [
          {
            claim_id: 'PAR-0001',
            kind: 'parity',
            selected_option: 'drop', // canonical — the snapshot binding is the ONLY blocker
            evidence: { source: 't', answer_text: 'drop', hash: sha('drop') },
          },
        ],
      },
      { approvalId: 'APPR-0001', sessionId: 's', roundCount: 1, approvedAt: 't', snapshotId: 'RSN-bbbbbbbbbbbbbbbb' },
    );
    const store = emptyParity('RSN-aaaaaaaaaaaaaaaa');
    store.records.push({
      id: 'PAR-0001',
      behavior: 'b',
      ruling: 'drop',
      rationale: 'r',
      approval_id: 'APPR-0001',
      evidence: [{ kind: 'code_anchor', anchor }],
      snapshot_id: 'RSN-aaaaaaaaaaaaaaaa',
    } as never);
    const gate = parityGate(store, '/nonexistent-root-for-anchors', {
      loadApproval: () => record,
      activeSnapshot: 'RSN-aaaaaaaaaaaaaaaa',
    });
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.blockers[0]!.reason).toMatch(/bound to snapshot RSN-b/);
  });

  it('an approval that authorizes a DIFFERENT ruling than the entry blocks', () => {
    const record = buildRenewalApprovalRecord(
      {
        decisions: [
          {
            claim_id: 'PAR-0001',
            kind: 'parity',
            selected_option: 'preserve', // canonical preserve cannot authorize entry ruling 'drop'
            evidence: { source: 't', answer_text: 'preserve', hash: sha('preserve') },
          },
        ],
      },
      { approvalId: 'APPR-0001', sessionId: 's', roundCount: 1, approvedAt: 't', snapshotId: 'RSN-aaaaaaaaaaaaaaaa' },
    );
    const store = emptyParity('RSN-aaaaaaaaaaaaaaaa');
    store.records.push({
      id: 'PAR-0001',
      behavior: 'b',
      ruling: 'drop',
      rationale: 'r',
      approval_id: 'APPR-0001',
      evidence: [{ kind: 'code_anchor', anchor }],
      snapshot_id: 'RSN-aaaaaaaaaaaaaaaa',
    } as never);
    const gate = parityGate(store, '/nonexistent-root-for-anchors', {
      loadApproval: () => record,
      activeSnapshot: 'RSN-aaaaaaaaaaaaaaaa',
    });
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.blockers[0]!.reason).toMatch(/does not authorize THIS ruling|authorizes/);
  });
});

describe('review revalidates source state (H-09)', () => {
  it('review refuses entry on a stale snapshot (zero writes)', async () => {
    const target = makeTarget();
    const project = freshDir('lco-clr-proj-');
    const caps = graphCaps();
    expect((await cmdRenewInit({ dir: project, target, name: 'clr' }, caps)).code).toBe(0);
    // Mutate AFTER init: the snapshot is stale.
    writeFileSync(join(target, 'src', 'inventory.ts'), 'export const CHANGED = 1;\n');
    const r = await cmdRenewReview({ dir: project, answersPath: '/nonexistent' }, caps);
    expect(r.code).not.toBe(0);
    expect(r.output).toMatch(/snapshot is stale/);
  });

  it('headless CHANGE answers rule parity change end-to-end through plan (C-08/C-09 precheck)', async () => {
    const target = makeTarget();
    const project = freshDir('lco-clr-e2e-');
    const caps = graphCaps();
    expect((await cmdRenewInit({ dir: project, target, name: 'clr2' }, caps)).code).toBe(0);

    const ordersPath = join(target, 'src', 'orders.ts');
    const scripted: LlmAdapter = {
      complete: async (): Promise<LlmResponse> => ({
        text: JSON.stringify({
          hypotheses: [
            {
              id: 'BHV-0001',
              statement: 'Order accepted flag is always true.',
              category: 'business_rule',
              confidence: 'high',
              anchors: [{ path: 'src/orders.ts', content_hash: sha(readFileSync(ordersPath)) }],
              rationale: 'source',
            },
          ],
          uncertainties: [],
          coverage_notes: [],
        }),
      }),
    };
    const analyzeCaps: RenewCapabilities = {
      ...caps,
      llm: () => singleRoutePlan(scripted, { gateway: 'scripted', providerKind: 'openai-compatible', requestedModel: 'fixture-llm' }),
    };
    expect((await cmdRenewAnalyze({ dir: project }, analyzeCaps)).code).toBe(0);

    // Headless review: CHANGE the behavior (canonical option id) + select a strategy.
    const answers = {
      answers: [
        { decisionId: 'PAR-0001', kind: 'option', selectedOption: 'change' },
        { decisionId: 'STG-0001', kind: 'option', selectedOption: 'strangler' },
      ],
    };
    const answersPath = join(project, 'answers.json');
    writeFileSync(answersPath, JSON.stringify(answers));
    const review = await cmdRenewReview({ dir: project, answersPath }, caps);
    expect(review.code).toBe(0);

    const parity = JSON.parse(readFileSync(join(project, '.lco', 'renewal', 'parity.json'), 'utf8')) as {
      records: { ruling: string }[];
    };
    expect(parity.records[0]!.ruling).toBe('change');

    // The approval record exists and is snapshot-bound.
    const approvals = readdirSync(join(project, 'approvals')).filter((f) => f.endsWith('.json'));
    expect(approvals.length).toBeGreaterThan(0);
    const approval = JSON.parse(readFileSync(join(project, 'approvals', approvals[0]!), 'utf8')) as { snapshot_id?: string };
    expect(approval.snapshot_id).toMatch(/^RSN-/);

    expect(existsSync(join(project, '.lco', 'renewal', 'strategy.json'))).toBe(true);
  });
});
