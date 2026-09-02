/**
 * STEP 8 exit gate: a modernization ambiguity round-trips through the REAL
 * clarification workspace (loopback server + token + state machine + approval)
 * — recovery UNRESOLVED → question → human decision → canonical evidence →
 * revalidation → approval record → renewal state written. No LLM anywhere.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startClarifyServer } from '../../server/http';
import { loadWorkspaceAssets } from '../../server/assets';
import { generateSessionToken } from '../../server/tokens';
import { createRenewalClarifySession } from './session';
import { makeRenewalDriver } from './distiller';
import { nextRenewalApprovalId, writeRenewalApproval } from './approvals';
import type { AnalysisRecord } from '../recovery/schemas';
import { AnalysisRecordSchema } from '../recovery/schemas';
import type { OverlayStore } from '../overlay/overlay';

const tmpDirs: string[] = [];
function freshDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'lco-rt-'));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
  tmpDirs.length = 0;
});

function analysis(): AnalysisRecord {
  return AnalysisRecordSchema.parse({
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
          question: 'Should the small-order fee survive modernization unchanged?',
          impact: 'medium',
          options: [{ option: 'Preserve the fee exactly' }, { option: 'Revisit the threshold' }],
          anchors: [{ path: 'src/orders.ts', content_hash: `sha256:${'b'.repeat(64)}` }],
          // INV-C: every anchor result states its provenance scope.
          anchor_results: [{ path: 'src/orders.ts', ok: true, scope: 'whole_file' }],
        },
      ],
    },
    rejected: [],
    coverage_notes: [],
    usage: { calls: 1, attempts: 1, in_tokens: 1, out_tokens: 1, usage_known: true },
  });
}

describe('renewal ambiguity round-trip through the real workspace', () => {
  it('question → answers → approval → immutable record on disk', async () => {
    const projectDir = freshDir();
    const approvalsDir = join(projectDir, 'approvals');
    mkdirSync(approvalsDir, { recursive: true });
    const overlay: OverlayStore = { schema_version: 1, snapshot_id: 'RSN-deadbeefdeadbeef', records: [] };

    const session = createRenewalClarifySession({
      sessionId: 'rt-1',
      dir: projectDir,
      projectName: 'orders-crm',
      nowIso: () => '2026-09-02T00:00:00Z',
      driver: makeRenewalDriver({ analyses: [analysis()], overlay, includeStrategy: true }),
      nextApprovalId: () => nextRenewalApprovalId(approvalsDir),
      writeApproval: (record) => {
        const id = nextRenewalApprovalId(approvalsDir);
        const result = writeRenewalApproval(approvalsDir, { ...record, approval_id: id });
        return result.ok ? { ok: true as const } : { ok: false as const, error: result.message };
      },
    });

    const token = generateSessionToken();
    const handle = await startClarifyServer({
      session,
      sessionId: 'rt-1',
      token,
      assets: loadWorkspaceAssets('rt-1'),
      inactivityMs: 60_000,
    });
    try {
      await handle.started;
      const api = (op: string) => `${handle.origin}/api/rt-1/${op}`;
      const headers = { 'content-type': 'application/json', 'x-lco-session': token };

      // 1. The uncertainty + strategy questions are served to the browser client.
      const snap1 = ((await (await fetch(api('session'), { headers })).json()) as { session: {
        state: string;
        questions: { claimId: string; options: { option: string }[] }[];
      } }).session;
      expect(snap1.state).toBe('CLARIFICATION_REQUIRED');
      expect(snap1.questions.map((q) => q.claimId).sort()).toEqual(['STG-0001', 'UNC-0001']);

      // 2. Human decisions — exactly the offered options.
      const submit = await fetch(api('round/apply'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          answers: [
            { decisionId: 'UNC-0001', kind: 'option', selectedOption: 'Preserve the fee exactly' },
            { decisionId: 'STG-0001', kind: 'option', selectedOption: 'strangler' },
          ],
        }),
      });
      expect(submit.status).toBe(200);

      // 3. Deterministic revalidation → review state, nothing open.
      const snap2 = ((await (await fetch(api('session'), { headers })).json()) as { session: {
        state: string;
        progress: { resolved: number; remaining: number };
      } }).session;
      expect(snap2.state).toBe('FINAL_REVIEW');
      expect(snap2.progress).toEqual({ resolved: 2, remaining: 0, newlyDiscovered: 0 });

      // 4. Explicit approval → immutable record on disk with canonical evidence.
      const approveRes = await fetch(api('approve'), {
        method: 'POST',
        headers,
        body: JSON.stringify({ pendingChangeIds: [] }),
      });
      expect(approveRes.status).toBe(200);

      const recordPath = join(approvalsDir, 'APPR-0001.json');
      const record = JSON.parse(readFileSync(recordPath, 'utf8')) as {
        approval_id: string;
        decisions: { claim_id: string; selected_option?: string; evidence: { source: string; hash: string } }[];
        content_digest: string;
      };
      expect(record.approval_id).toBe('APPR-0001');
      expect(record.decisions.map((d) => d.claim_id).sort()).toEqual(['STG-0001', 'UNC-0001']);
      const strategy = record.decisions.find((d) => d.claim_id === 'STG-0001');
      expect(strategy?.selected_option).toBe('strangler');
      for (const d of record.decisions) {
        expect(d.evidence.source).toMatch(/^renewal-clarify:rt-1\/round\d+$/);
        expect(d.evidence.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
      }

      // 5. Session rests in APPROVED; the approval is quiescent.
      const snap3 = ((await (await fetch(api('session'), { headers })).json()) as { session: { state: string } }).session;
      expect(snap3.state).toBe('APPROVED');
    } finally {
      await handle.close();
    }
  }, 30_000);

  it('unauthenticated requests never reach session state (token model inherited)', async () => {
    const projectDir = freshDir();
    const overlay: OverlayStore = { schema_version: 1, snapshot_id: 'RSN-deadbeefdeadbeef', records: [] };
    const session = createRenewalClarifySession({
      sessionId: 'rt-2',
      dir: projectDir,
      nowIso: () => '2026-09-02T00:00:00Z',
      driver: makeRenewalDriver({ analyses: [analysis()], overlay, includeStrategy: true }),
      nextApprovalId: () => 'APPR-0001',
      writeApproval: () => ({ ok: true }),
    });
    const handle = await startClarifyServer({
      session,
      sessionId: 'rt-2',
      token: generateSessionToken(),
      assets: loadWorkspaceAssets('rt-2'),
    });
    try {
      await handle.started;
      const res = await fetch(`${handle.origin}/api/rt-2/session`);
      expect(res.status).toBe(401);
    } finally {
      await handle.close();
    }
  }, 30_000);
});
