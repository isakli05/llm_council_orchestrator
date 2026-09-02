/**
 * Branch tranche 3: renewal clarify-session state machine edges, pipeline
 * retry-time staleness, approval-fold combinations, and CLI grammar residuals.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRenewalClarifySession } from './clarify/session';
import { makeRenewalDriver } from './clarify/distiller';
import { buildRenewalApprovalRecord, renewalApprovalDigest } from './clarify/approvals';
import { runRecovery } from './recovery/pipeline';
import { singleRoutePlan } from '../llm/plan';
import type { LlmAdapter, LlmResponse } from '../eval/llm/adapter';
import type { ContextBundle } from './context/bundle';
import type { AnalysisRecord } from './recovery/schemas';
import { parseArgs } from '../cli/args';

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

describe('renewal clarify session state machine', () => {
  const driver = (includeStrategy = true) =>
    makeRenewalDriver({ analyses: [], overlay: { schema_version: 1, snapshot_id: 'RSN-aaaaaaaaaaaaaaaa', records: [] }, includeStrategy });

  const makeSession = (opts: Partial<Parameters<typeof createRenewalClarifySession>[0]> = {}) => {
    let approvals = 0;
    return createRenewalClarifySession({
      sessionId: 's-1',
      dir: freshDir('lco-sess-'),
      nowIso: () => '2026-09-02T12:00:00.000Z',
      driver: driver(),
      nextApprovalId: () => `APPR-${String(++approvals).padStart(4, '0')}`,
      writeApproval: () => ({ ok: true as const }),
      ...opts,
    });
  };

  it('initial round surfaces the strategy question; runInitialRound twice refuses', async () => {
    const session = makeSession();
    await session.runInitialRound();
    expect(session.snapshot().state).toBe('CLARIFICATION_REQUIRED');
    expect(session.snapshot().questions.map((q) => q.claimId)).toContain('STG-0001');
    await expect(session.runInitialRound()).rejects.toThrow(/already ran/);
  });

  it('answers out of state are refused; invalid claim ids are refused', async () => {
    const session = makeSession();
    const r = await session.submitAnswers([{ decisionId: 'STG-0001', kind: 'option', selectedOption: 'strangler' }]);
    expect(r.ok).toBe(false); // not in CLARIFICATION_REQUIRED yet
    await session.runInitialRound();
    const bad = await session.submitAnswers([{ decisionId: 'DEC-0001', kind: 'option', selectedOption: 'x' }]);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/not a recognized claim id|does not match a question/);
  });

  it('a full round: answer everything → FINAL_REVIEW → approve writes the record; usage stays zero', async () => {
    let written = 0;
    const session = makeSession({ writeApproval: () => { written++; return { ok: true as const }; } });
    await session.runInitialRound();
    const applied = await session.submitAnswers([{ decisionId: 'STG-0001', kind: 'option', selectedOption: 'strangler' }]);
    expect(applied.ok).toBe(true);
    expect(session.snapshot().state).toBe('FINAL_REVIEW');
    const approved = session.approve({ pendingChangeIds: [] });
    expect(approved.ok).toBe(true);
    expect(session.snapshot().state).toBe('APPROVED');
    expect(written).toBe(1);
    expect(session.snapshot().usage.calls).toBe(0); // no LLM anywhere in renewal clarify
  });

  it('approve with pending change requests or open questions refuses', async () => {
    const session = makeSession();
    await session.runInitialRound();
    expect(session.approve({ pendingChangeIds: ['CR-1'] }).ok).toBe(false);
    expect(session.approve({ pendingChangeIds: [] }).ok).toBe(false); // questions still open
    expect(session.snapshot().state).toBe('CLARIFICATION_REQUIRED');
  });

  it('applyChangeSet is refused (renewal has no review document)', async () => {
    const session = makeSession();
    const r = await session.applyChangeSet({} as never);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/change sets apply to spec behavior reviews/);
  });

  it('cancel transitions cleanly; a FAILED session cannot answer', async () => {
    const session = makeSession({ maxRounds: 1 });
    session.cancel('operator aborted');
    expect(session.snapshot().state).toBe('CANCELLED');
    expect(session.snapshot().failure?.reason[0]).toBe('operator aborted');
    const again = await session.submitAnswers([]);
    expect(again.ok).toBe(false);
  });

  it('an invalid option choice is refused and the questions stay open', async () => {
    const session = makeSession({ maxRounds: 1 });
    await session.runInitialRound();
    const invalid = await session.submitAnswers([{ decisionId: 'STG-0001', kind: 'option', selectedOption: 'not-offered' }]);
    expect(invalid.ok).toBe(false);
    expect(session.snapshot().state).toBe('CLARIFICATION_REQUIRED');
  });

  it('approval payload + digest round-trip through buildRenewalApprovalRecord', () => {
    const payload = { decisions: [{ claim_id: 'STG-0001', kind: 'strategy' as const, selected_option: 'strangler', evidence: { source: 't', answer_text: 'strangler', hash: sha('strangler') } }] };
    const record = buildRenewalApprovalRecord(payload, { approvalId: 'APPR-0001', sessionId: 's', roundCount: 1, approvedAt: 't', snapshotId: 'RSN-aaaaaaaaaaaaaaaa' });
    expect(record.snapshot_id).toBe('RSN-aaaaaaaaaaaaaaaa');
    // Digest v2 (S2-C-04): recomputation must pass the FULL authority body —
    // identity, snapshot binding, and decisions — not decisions alone.
    expect(
      renewalApprovalDigest({
        schema_version: record.schema_version,
        approval_id: record.approval_id,
        session_id: record.session_id,
        round_count: record.round_count,
        snapshot_id: record.snapshot_id,
        decisions: record.decisions,
      }),
    ).toBe(record.content_digest);
  });
});

describe('pipeline: staleness during the RETRY call also blocks (C-10 second bracket)', () => {
  const bundleOf = (hash: string): ContextBundle => ({
    scope: { type: 'whole' },
    items: [
      { kind: 'file_slice', path: 'src/a.ts', start_line: 1, end_line: 3, text: 'code\n', content_hash: hash, redactions: 0, provenance: 'file-read' },
    ],
    truncated: false,
    total_chars: 10,
    warnings: [],
  });

  it('first response invalid + source mutates before the retry → blocked_stale with retry_used', async () => {
    const target = freshDir('lco-pipe-');
    mkdirSync(join(target, 'src'), { recursive: true });
    const content = 'export const a = 1;\n';
    writeFileSync(join(target, 'src', 'a.ts'), content);
    const hash = sha(content);

    let calls = 0;
    const adapter: LlmAdapter = {
      complete: async (): Promise<LlmResponse> => {
        calls++;
        if (calls === 1) return { text: '{invalid first' };
        // Mutation lands between call 1 and the retry:
        writeFileSync(join(target, 'src', 'a.ts'), content + '// mutated\n');
        return { text: JSON.stringify({ hypotheses: [], uncertainties: [{ id: 'UNC-0001', question: 'q?', impact: 'low', options: [{ option: 'x' }, { option: 'y' }], anchors: [{ path: 'src/a.ts', content_hash: hash }] }], coverage_notes: [] }) };
      },
    };
    const persisted: AnalysisRecord[] = [];
    // Fresh after the first call, STALE after the retry — the mutation
    // lands between them (the second C-10 bracket).
    let checks = 0;
    const recheck = () => {
      checks++;
      return checks <= 1 ? ({ ok: true as const }) : { ok: false as const, reasons: ['file_changed'] };
    };
    const outcome = await runRecovery(
      { analysisId: 'AN-0001', snapshotId: 'RSN-deadbeefdeadbeef', scope: { type: 'whole' }, bundle: bundleOf(hash) },
      {
        llm: singleRoutePlan(adapter, { gateway: 'g', providerKind: 'openai-compatible', requestedModel: 'm' }),
        nowIso: 't',
        targetRoot: target,
        recheckFreshness: recheck,
        persist: (record) => { persisted.push(record); return { ok: true as const }; },
      },
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe('blocked_stale');
    expect(outcome.record.validation.retry_used).toBe(true);
    expect(persisted).toHaveLength(1);
  });

  it('an OK recheck during a healthy run does not block', async () => {
    const target = freshDir('lco-pipe2-');
    mkdirSync(join(target, 'src'), { recursive: true });
    const content = 'export const a = 1;\n';
    writeFileSync(join(target, 'src', 'a.ts'), content);
    const hash = sha(content);
    const adapter: LlmAdapter = {
      complete: async () => ({
        text: JSON.stringify({ hypotheses: [], uncertainties: [{ id: 'UNC-0001', question: 'q?', impact: 'low', options: [{ option: 'x' }, { option: 'y' }], anchors: [{ path: 'src/a.ts', content_hash: hash }] }], coverage_notes: [] }),
      }),
    };
    const outcome = await runRecovery(
      { analysisId: 'AN-0001', snapshotId: 'RSN-deadbeefdeadbeef', scope: { type: 'whole' }, bundle: bundleOf(hash) },
      {
        llm: singleRoutePlan(adapter, { gateway: 'g', providerKind: 'openai-compatible', requestedModel: 'm' }),
        nowIso: 't',
        targetRoot: target,
        recheckFreshness: () => ({ ok: true as const }),
        persist: () => ({ ok: true as const }),
      },
    );
    expect(outcome.ok).toBe(true);
  });
});

describe('CLI grammar residuals (args.ts renew branches)', () => {
  it('renew without a subcommand / with an unknown subcommand errors', () => {
    expect('error' in parseArgs(['renew'])).toBe(true);
    const r = parseArgs(['renew', 'frobnicate', '/tmp/p']);
    expect('error' in r && r.error).toMatch(/requires a subcommand/);
  });

  it('renew <sub> without a dir errors', () => {
    const r = parseArgs(['renew', 'status']);
    expect('error' in r && r.error).toMatch(/requires the LCO project <dir>/);
    const r2 = parseArgs(['renew', 'status', '--json']);
    expect('error' in r2 && r2.error).toMatch(/requires the LCO project <dir>/);
  });

  it('renew init without --target errors; --name value flows through', () => {
    const r = parseArgs(['renew', 'init', '/tmp/p']);
    expect('error' in r && r.error).toMatch(/requires --target/);
    const ok = parseArgs(['renew', 'init', '/tmp/p', '--target', '/repo', '--name', 'x']);
    expect('renew' in ok && (ok.renew as { name?: string }).name).toBe('x');
  });

  it('review --no-open alone (no --interactive, no --answers) errors on the prerequisite', () => {
    const r = parseArgs(['renew', 'review', '/tmp/p', '--no-open']);
    expect('error' in r && r.error).toMatch(/only meaningful with --interactive/);
  });

  it('unknown renew flag errors with the allowed list', () => {
    const r = parseArgs(['renew', 'refresh', '/tmp/p', '--force']);
    expect('error' in r && r.error).toMatch(/not valid for 'renew refresh'/);
  });
});
