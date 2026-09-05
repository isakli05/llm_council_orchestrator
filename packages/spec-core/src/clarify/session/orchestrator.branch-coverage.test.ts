import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SpecBundle } from '../../schemas';
import type { LlmAdapter, LlmResponse } from '../../eval/llm/adapter';
import { createBudgetLedger } from '../../eval/budget';
import { createClarifySession, sessionLedgerEnvelope } from './orchestrator';

/**
 * Branch-coverage companions to orchestrator.test.ts: guard arms and failure
 * routings the happy-path lifecycle suite never reaches — the no-clobber
 * precondition, the pre-round snapshot, op guards outside their states, the
 * mid-round cancel win, transport (not model) failures inside submit/apply,
 * terminal-cancel idempotence, the budget-exhaustion rethrow out of
 * enrichment, and the honest 'replaced' mapping when a change's target
 * vanishes. Scripted fake adapters only; no paid calls; injected clock.
 */

const NOW = '2026-09-01T12:00:00Z';
const SHA = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

function bundle(): SpecBundle {
  return {
    manifest: {
      spec_schema: 'lco-spec/1.0',
      spec_version: 1,
      project: { name: 'textile-b2b', mode: 'greenfield' },
      complexity_profile: 'p-mini',
      evidence_snapshot: { pack_hash: SHA, collected_at: NOW },
      state: 'draft',
      council_run: { run_id: 't', config_fingerprint: 't' },
      artifact_hashes: {},
      unresolved_count: 0,
      blocking_count: 0,
      target_runtime: { platform: 'node', stack: 'ts' },
    },
    intent: { statement: 'A B2B ordering platform for textile dealers.', normalized: 'n' },
    glossary: [],
    assumptions: [],
    evidence: [{ id: 'E-0001', kind: 'user_input', source: 'intent', hash: SHA }],
    requirements: [
      { id: 'REQ-0001', statement: 'Dealers can browse the product catalogue.', priority: 'must', evidence: ['E-0001'], acceptance_refs: ['TST-0001'], terms_used: [] },
    ],
    decisions: [
      {
        claim_id: 'DEC-0001', decision: 'Orders require approval.', rationale: 'r', evidence: ['E-0001'],
        confidence: 1, impact: 'medium', assumptions: [], alternatives: [], status: 'accepted',
      },
    ],
    contracts: [],
    tasks: [
      {
        task_id: 'TASK-0001', title: 'Catalogue', purpose: 'p',
        refs: { requirements: ['REQ-0001'], architecture: [], decisions: ['DEC-0001'] },
        depends_on: [], preconditions: ['c'], permitted_scope: ['src/**'], protected: [], interface_changes: [],
        invariants: ['i'], instructions: 'do',
        tests: [{ id: 'TST-0001', kind: 'unit', file: 'a.test.ts', cases: ['REQ-0001: works'] }],
        verification: [{ command: 'node --version', expect: 'exit 0' }],
        acceptance: ['a'], rollback: 'r', completion_evidence: { required: ['test_summary'] },
        risk: { level: 'low', note: '' }, complexity: 'xs',
      },
    ],
    test_files: ['a.test.ts'],
  } as unknown as SpecBundle;
}

/** Blocked by one UNRESOLVED decision (L08 material), manifest state 'draft'. */
function blockedBundle(ids: [string, string][], extraAlternatives = false): SpecBundle {
  const b = bundle();
  b.manifest.unresolved_count = ids.length;
  b.tasks = b.tasks.map((t) => ({ ...t, refs: { ...t.refs, decisions: [] } }));
  b.decisions = ids.map(([id, question], i) => ({
    ...b.decisions[0]!,
    claim_id: id,
    decision: question,
    impact: 'high',
    alternatives: extraAlternatives && i === 0
      ? [{ option: 'first confirmed order gets priority', rejected_because: 'the other customer sees an out-of-stock message' }]
      : [],
    status: 'UNRESOLVED' as const,
  }));
  return b;
}

/** Scripts completions in order; an exhausted queue THROWS (transport failure). */
function scriptedLlm(responses: string[]): LlmAdapter & { calls: string[]; queue: (more: string[]) => void } {
  const pending = [...responses];
  const calls: string[] = [];
  return {
    calls,
    queue: (more: string[]) => {
      pending.push(...more);
    },
    async complete(prompt: string): Promise<LlmResponse> {
      calls.push(prompt);
      const text = pending.shift();
      if (text === undefined) throw new Error(`unexpected call #${calls.length}`);
      return { text, usage: { in_tokens: 1, out_tokens: 1 } };
    },
  };
}

const OPTS = {
  intent: 'I need a B2B ordering platform for textile dealers.',
  profile: 'p-mini' as const,
  variant: 'single' as const,
  nowIso: () => NOW,
  sessionId: 's-test',
};

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lco-orch-bc-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function sessionWith(responses: string[], enrich = false) {
  const llm = scriptedLlm(responses);
  const session = createClarifySession({ ...OPTS, dir, llm, enrich });
  return { session, llm };
}

/** A session parked at FINAL_REVIEW v1 with one answerable requirement segment. */
async function atReview() {
  const { session, llm } = await sessionWith([JSON.stringify(bundle())]);
  await session.runInitialRound();
  const review = session.snapshot().review!;
  const seg = review.sections.flatMap((s) => s.segments).find((s) => s.segmentId === 'SEG-REQ-0001')!;
  const change = {
    changeId: 'CHG-0001',
    segmentId: 'SEG-REQ-0001',
    selectedText: 'Dealers can browse the product catalogue',
    segmentContentHash: seg.contentHash,
    instruction: 'Show live stock levels too.',
  };
  return { session, llm, review, change };
}

describe('construction and the pre-round snapshot', () => {
  it('sessionLedgerEnvelope scales attempts/tokens by rounds (x2 with enrichment) and wall by rounds alone', () => {
    const withTokens = sessionLedgerEnvelope({
      variant: 'single', topology: 'fused', enrich: true, maxRounds: 2, hasClock: false,
      overrides: { maxAttempts: 3, maxTokens: 100 },
    });
    // 3 attempts x (2 rounds x 2 enrichment headroom); the token cap rides the same scale
    expect(withTokens).toEqual({ maxAttempts: 12, maxTokens: 400 });
    const withWall = sessionLedgerEnvelope({
      variant: 'single', topology: 'fused', enrich: false, maxRounds: 3, hasClock: true,
      overrides: { maxAttempts: 2, maxWallMs: 1_000 },
    });
    // wall time scales with rounds only — it is not doubled by the enrichment call
    expect(withWall).toEqual({ maxAttempts: 6, maxWallMs: 3_000 });
  });

  it('an interactive session refuses a directory that already has spec/ (no-clobber, defense in depth)', () => {
    mkdirSync(join(dir, 'spec'), { recursive: true });
    expect(() => createClarifySession({ ...OPTS, dir, llm: scriptedLlm([]) })).toThrow(
      /refusing to start: .*already exists/,
    );
  });

  it('a snapshot before the first round is honest: STARTING, nothing projected, zero usage', () => {
    const session = createClarifySession({ ...OPTS, dir, llm: scriptedLlm([JSON.stringify(bundle())]) });
    const snap = session.snapshot();
    expect(snap.state).toBe('STARTING');
    expect(snap.round).toBe(0);
    expect(snap.questions).toEqual([]);
    expect(snap.progress).toEqual({ resolved: 0, remaining: 0, newlyDiscovered: 0 });
    expect(snap.review).toBeUndefined();
    expect(snap.lastChangeOutcome).toBeUndefined();
    expect(snap.failure).toBeUndefined();
    expect(snap.projectName).toBeUndefined();
    expect(snap.promptProtocol).toBe('');
    expect(snap.usage).toEqual({ in: 0, out: 0, calls: 0, attempts: 0, callsWithoutUsage: 0, usageKnown: true, promptBytes: 0 });
  });
});

describe('operation guards outside their states', () => {
  it('submitAnswers outside CLARIFICATION_REQUIRED is refused without touching the adapter', async () => {
    const { session, llm } = await sessionWith([JSON.stringify(bundle())]);
    await session.runInitialRound(); // clean first pass -> FINAL_REVIEW, no questions open
    const r = await session.submitAnswers([
      { decisionId: 'DEC-0004', kind: 'other', freeText: 'First confirmed order gets priority, always.' },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('answers can only be submitted while questions are open (current state: FINAL_REVIEW)');
    expect(llm.calls).toHaveLength(1); // only the initial round ran — no re-run was started
  });

  it('applyChangeSet outside the review states is refused with the current state named', async () => {
    const { session, llm } = await sessionWith([JSON.stringify(blockedBundle([['DEC-0004', 'Who gets the last fabric?']]))]);
    await session.runInitialRound(); // CLARIFICATION_REQUIRED
    const r = await session.applyChangeSet({ reviewVersion: 1, changes: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('changes can only be applied from the final review (current state: CLARIFICATION_REQUIRED)');
    expect(llm.calls).toHaveLength(1);
  });

  it('a second runInitialRound is an internal error (the initial round ran once)', async () => {
    const { session } = await sessionWith([JSON.stringify(bundle())]);
    await session.runInitialRound();
    await expect(session.runInitialRound()).rejects.toThrow('internal: initial round already ran (state FINAL_REVIEW)');
  });
});

describe('infrastructure failures inside the round loop', () => {
  it('a transport failure while re-validating answers fails the session and reports ok:false (never a silent keep)', async () => {
    const { session } = await sessionWith([JSON.stringify(blockedBundle([['DEC-0004', 'Who gets the last fabric?']]))]);
    await session.runInitialRound();
    const r = await session.submitAnswers([
      { decisionId: 'DEC-0004', kind: 'other', freeText: 'First confirmed order gets priority, always.' },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('unexpected call'); // the adapter's queue ran dry: transport, not model output
    expect(session.snapshot().state).toBe('FAILED');
    expect(existsSync(join(dir, 'spec'))).toBe(false);
  });

  it('a transport failure during change regeneration fails the session transactionally (nothing written)', async () => {
    const { session, change } = await atReview();
    // nothing queued: the regeneration call itself dies (transport, not model output)
    const r = await session.applyChangeSet({ reviewVersion: 1, changes: [change] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('unexpected call');
    expect(session.snapshot().state).toBe('FAILED');
    expect(existsSync(join(dir, 'spec'))).toBe(false); // the approved baseline was never written
  });
});

describe('cancel semantics', () => {
  it('cancel on an already-terminal session is a no-op (FAILED stays FAILED, CANCELLED stays CANCELLED)', async () => {
    const dead = await sessionWith(['not json at all', 'still not json']);
    await dead.session.runInitialRound();
    expect(dead.session.snapshot().state).toBe('FAILED');
    dead.session.cancel('a late click');
    expect(dead.session.snapshot().state).toBe('FAILED'); // terminal states have no outgoing transitions

    const live = await sessionWith([JSON.stringify(blockedBundle([['DEC-0004', 'Who gets the last fabric?']]))]);
    await live.session.runInitialRound();
    live.session.cancel('owner closed the terminal');
    live.session.cancel('a duplicate cancel event');
    expect(live.session.snapshot().state).toBe('CANCELLED');
    expect(existsSync(join(dir, 'spec'))).toBe(false);
  });

  it('a cancel landing mid-round WINS: the late clean spec is never surfaced as a review', async () => {
    let session!: ReturnType<typeof createClarifySession>;
    const llm: LlmAdapter = {
      async complete(): Promise<LlmResponse> {
        session.cancel('owner closed the tab mid-round'); // lands while the round is in flight
        return { text: JSON.stringify(bundle()), usage: { in_tokens: 1, out_tokens: 1 } };
      },
    };
    session = createClarifySession({ ...OPTS, dir, llm });
    await session.runInitialRound(); // the outcome resolves AFTER the cancel
    const snap = session.snapshot();
    expect(snap.state).toBe('CANCELLED'); // the routing transition refuses a terminal session
    expect(snap.questions).toEqual([]); // nothing surfaced post-cancel
    expect(snap.failure).toBeUndefined(); // a cancel is not a failure
    expect(snap.usage.calls).toBe(1); // the completed call is still accounted for
  });
});

describe('enrichment failure routing', () => {
  it('an enrichment transport failure degrades to Layer-0 previews (answering is never blocked)', async () => {
    const blocked = JSON.stringify(blockedBundle([['DEC-0004', 'Who gets the last fabric?']], true));
    const { session, llm } = await sessionWith([blocked], true); // no enrich response queued
    await session.runInitialRound();
    const snap = session.snapshot();
    expect(snap.state).toBe('CLARIFICATION_REQUIRED');
    expect(snap.questions[0]!.options[0]!.preview.source).toBe('bundle'); // Layer-0 stays
    expect(llm.calls).toHaveLength(2); // the enrich call DID fire and died — degraded, not skipped
  });

  it('enrichment budget exhaustion is a hard abort (BUDGET_EXCEEDED), never a silent degrade', async () => {
    // the session arrives with one attempt already spent: the generation fits, the enrich call does not
    const ledger = createBudgetLedger({ maxAttempts: 2 }, {});
    ledger.chargeAttempts(1);
    const llm = scriptedLlm([JSON.stringify(blockedBundle([['DEC-0004', 'Who gets the last fabric?']]))]);
    const session = createClarifySession({ ...OPTS, dir, llm, enrich: true, sharedLedger: ledger });
    await session.runInitialRound();
    const snap = session.snapshot();
    expect(snap.state).toBe('FAILED');
    expect(snap.failure?.reason.join(' ')).toMatch(/BUDGET_EXCEEDED \(attempts\)/);
    expect(llm.calls).toHaveLength(1); // the generation ran; the enrich call was refused before firing
  });
});

describe('change-set outcome mapping', () => {
  it('a change whose canonical target vanished in regeneration is reported replaced, with an honest note', async () => {
    const { session, llm, change } = await atReview();
    // the regenerated bundle is still lint-clean but carries REQ-0002 where REQ-0001 used to be
    const regenerated = JSON.parse(JSON.stringify(bundle()).replaceAll('REQ-0001', 'REQ-0002')) as SpecBundle;
    llm.queue([JSON.stringify(regenerated)]);
    const r = await session.applyChangeSet({ reviewVersion: 1, changes: [change] });
    expect(r.ok).toBe(true);
    const snap = session.snapshot();
    expect(snap.state).toBe('FINAL_REVIEW');
    expect(snap.review!.reviewVersion).toBe(2);
    expect(snap.lastChangeOutcome).toEqual({
      reviewVersion: 1,
      changes: [{
        changeId: 'CHG-0001',
        segmentId: 'SEG-REQ-0001',
        outcome: 'replaced',
        note: expect.stringContaining('no longer exists in the new review'),
      }],
    });
    // the new review speaks the new id — the old segment is gone from the document too
    expect(snap.review!.sections.some((s) => s.segments.some((seg) => seg.segmentId === 'SEG-REQ-0001'))).toBe(false);
    expect(snap.review!.sections.some((s) => s.segments.some((seg) => seg.segmentId === 'SEG-REQ-0002'))).toBe(true);
  });
});
