import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SpecBundle } from '../../schemas';
import type { LlmAdapter, LlmResponse } from '../../eval/llm/adapter';
import { createClarifySession, MAX_CLARIFY_ROUNDS } from './orchestrator';

/**
 * §14 (multi-round), §12 (contradictions), §13 (conditionals), §17–§21
 * (review → change sets → approval), §30 (failure states) — the server-owned
 * orchestrator. All LLM traffic is scripted fake adapters; no paid calls.
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

/** A bundle blocked by one/two UNRESOLVED decisions (L08 material). The
 * manifest state stays 'draft' — the generation contract — exactly like the
 * runner's own clarify tests: the unresolved MATERIAL is what L08 blocks on. */
function blockedBundle(ids: [string, string][], extraAlternatives = false): SpecBundle {
  const b = bundle();
  b.manifest.unresolved_count = ids.length;
  // keep referential closure intact (tasks must not reference dropped decisions — L13)
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

/** Scripts completions in order; records every prompt; later responses can be queued. */
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
  dir = mkdtempSync(join(tmpdir(), 'lco-orch-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function sessionWith(responses: string[], enrich = false) {
  const llm = scriptedLlm(responses);
  const session = createClarifySession({
    ...OPTS,
    dir,
    llm,
    enrich,
  });
  return { session, llm };
}

/** Queue MORE scripted responses onto an existing session's adapter. */
function queueOn(llm: LlmAdapter & { queue: (more: string[]) => void }, more: string[]): void {
  llm.queue(more);
}

describe('initial round', () => {
  it('a clean first pass goes straight to review (no unnecessary questionnaire)', async () => {
    const { session } = await sessionWith([JSON.stringify(bundle())]);
    await session.runInitialRound();
    const snap = session.snapshot();
    expect(snap.state).toBe('FINAL_REVIEW');
    expect(snap.questions).toEqual([]);
    expect(snap.review?.sections.length).toBeGreaterThan(0);
    expect(snap.review?.reviewVersion).toBe(1);
  });

  it('a blocked first round surfaces questions with Layer-0 previews', async () => {
    const { session } = await sessionWith([JSON.stringify(blockedBundle([['DEC-0004', 'Who gets the last fabric when two dealers order at once?']]))]);
    await session.runInitialRound();
    const snap = session.snapshot();
    expect(snap.state).toBe('CLARIFICATION_REQUIRED');
    expect(snap.questions).toHaveLength(1);
    expect(snap.questions[0]!.claimId).toBe('DEC-0004');
    expect(snap.progress).toEqual({ resolved: 0, remaining: 1, newlyDiscovered: 1 });
  });

  it('a blocked round WITHOUT clarifiable material fails the session honestly (nothing written)', async () => {
    const { session } = await sessionWith(['not json at all', 'still not json']);
    await session.runInitialRound();
    const snap = session.snapshot();
    expect(snap.state).toBe('FAILED');
    expect(snap.failure?.reason.length).toBeGreaterThan(0);
    expect(existsSync(join(dir, 'spec'))).toBe(false);
  });

  it('an adapter/infra failure propagates to FAILED (never guessed continuation)', async () => {
    const llm: LlmAdapter = { async complete() { throw new Error('connection refused'); } };
    const session = createClarifySession({ ...OPTS, dir, llm });
    await session.runInitialRound();
    expect(session.snapshot().state).toBe('FAILED');
    expect(existsSync(join(dir, 'spec'))).toBe(false);
  });
});

describe('multi-round clarification (§14 — every round is explicit user action)', () => {
  it('answers wrap EVERY prompt of the re-run as verbatim evidence (canonical channel)', async () => {
    const clean = JSON.stringify(bundle());
    const { session, llm } = await sessionWith([
      JSON.stringify(blockedBundle([['DEC-0004', 'Who gets the last fabric?']])),
      clean,
    ]);
    await session.runInitialRound();
    const r = await session.submitAnswers([
      { decisionId: 'DEC-0004', kind: 'other', freeText: 'The first confirmed order gets priority; the other dealer is told immediately.' },
    ]);
    expect(r.ok).toBe(true);
    expect(session.snapshot().state).toBe('FINAL_REVIEW');
    // the re-run prompt carried the verbatim answer + hash + binding rules
    const secondPrompt = llm.calls[1]!;
    expect(secondPrompt).toContain('The first confirmed order gets priority; the other dealer is told immediately.');
    expect(secondPrompt).toContain('authoritative user evidence');
    expect(secondPrompt).toContain('ONLY the decision it names');
    // and the protocol is attributed
    expect(session.snapshot().promptProtocol).toContain('answers');
  });

  it('new questions discovered in round 2 are distinguished; contradictions are surfaced, not silently re-asked', async () => {
    const round1 = JSON.stringify(blockedBundle([['DEC-0004', 'Who gets the last fabric?']]));
    const round2 = JSON.stringify(
      (() => {
        const b = blockedBundle([
          ['DEC-0004', 'Who gets the last fabric?'],
          ['DEC-0007', 'Who may approve an order?'],
        ]);
        return b;
      })(),
    );
    const round3 = JSON.stringify(bundle());
    const { session } = await sessionWith([round1, round2, round3]);
    await session.runInitialRound();
    await session.submitAnswers([{ decisionId: 'DEC-0004', kind: 'other', freeText: 'First confirmed order gets priority always.' }]);
    let snap = session.snapshot();
    expect(snap.state).toBe('CLARIFICATION_REQUIRED');
    expect(snap.round).toBe(2);
    expect(snap.progress).toEqual({ resolved: 1, remaining: 2, newlyDiscovered: 1 });
    // DEC-0004 answered but resurfaced → contradicted
    const q4 = snap.questions.find((q) => q.claimId === 'DEC-0004')!;
    expect(q4.status).toBe('contradicted');
    const q7 = snap.questions.find((q) => q.claimId === 'DEC-0007')!;
    expect(q7.status).toBe('open');

    // user corrects the conflicting answer and answers the new question
    const r = await session.submitAnswers([
      { decisionId: 'DEC-0004', kind: 'other', freeText: 'Priority applies except for pre-paid dealers, who always win.' },
      { decisionId: 'DEC-0007', kind: 'other', freeText: 'Any company administrator may approve an order.' },
    ]);
    expect(r.ok).toBe(true);
    snap = session.snapshot();
    expect(snap.state).toBe('FINAL_REVIEW');
    expect(snap.progress.resolved).toBe(2);
  });

  it('an invalid submission stores nothing and keeps the questions on screen', async () => {
    const { session } = await sessionWith([JSON.stringify(blockedBundle([['DEC-0004', 'Who gets the last fabric?']]))]);
    await session.runInitialRound();
    const bad = await session.submitAnswers([{ decisionId: 'DEC-0004', kind: 'other', freeText: 'short' }]);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain('DEC-0004');
    expect(session.snapshot().state).toBe('CLARIFICATION_REQUIRED');
  });

  it(`non-convergence caps out at ${MAX_CLARIFY_ROUNDS} rounds and fails honestly (nothing written)`, async () => {
    const blocked = JSON.stringify(blockedBundle([['DEC-0004', 'Who gets the last fabric?']]));
    const responses = Array<string>(MAX_CLARIFY_ROUNDS + 2).fill(blocked);
    const { session } = await sessionWith(responses);
    await session.runInitialRound();
    for (let i = 0; i < MAX_CLARIFY_ROUNDS; i++) {
      const r = await session.submitAnswers([{ decisionId: 'DEC-0004', kind: 'other', freeText: `attempt number ${i} with a real answer this time.` }]);
      if (session.snapshot().state === 'FAILED') break;
      expect(r.ok).toBe(true);
    }
    const snap = session.snapshot();
    expect(snap.state).toBe('FAILED');
    expect(snap.failure?.reason.join(' ')).toContain('round');
    expect(existsSync(join(dir, 'spec'))).toBe(false);
  });
});

describe('topology independence (§2 — clarification is a product concern)', () => {
  it('a DECOMPOSED-council session drives the same lifecycle (classifier → A∥B → judge)', async () => {
    const classifier = JSON.stringify({ profile: 'p-mini', must_be_blocked: false });
    const q = JSON.stringify(blockedBundle([['DEC-0004', 'Who gets the last fabric?']]));
    const clean = JSON.stringify(bundle());
    // decomposed shaping: classifier + proposal A + proposal B + judge per round
    const llm = scriptedLlm([classifier, q, q, q, classifier, clean, clean, clean]);
    const session = createClarifySession({
      ...OPTS, dir, llm, variant: 'council' as const, topology: 'decomposed' as const,
    });
    await session.runInitialRound();
    expect(session.snapshot().state).toBe('CLARIFICATION_REQUIRED');
    expect(session.snapshot().questions[0]!.claimId).toBe('DEC-0004');
    const r = await session.submitAnswers([
      { decisionId: 'DEC-0004', kind: 'other', freeText: 'First confirmed order gets priority, always.' },
    ]);
    expect(r.ok).toBe(true);
    expect(session.snapshot().state).toBe('FINAL_REVIEW');
    // decomposed runs attribute to the v4 lineage (answers still wrap every
    // prompt — the historical v4 protocol string, unchanged by design)
    expect(session.snapshot().promptProtocol).toBe('lco-prompts/v4');
  });
});

describe('enrichment (§11 — previews without per-click calls)', () => {
  it('runs once per question round and swaps Layer-0 previews for validated ones', async () => {
    const enrich = JSON.stringify({
      items: [
        {
          claimId: 'DEC-0004',
          context: 'Two dealers may want the same fabric.',
          options: [{ option: 'first confirmed order gets priority', outcomePreview: 'The first confirmed dealer takes the stock; the second is told it is gone.' }],
        },
      ],
    });
    const blocked = JSON.stringify(
      (() => {
        const b = blockedBundle([['DEC-0004', 'Who gets the last fabric?']], true);
        return b;
      })(),
    );
    const { session, llm } = await sessionWith([blocked, enrich], true);
    await session.runInitialRound();
    const q = session.snapshot().questions[0]!;
    expect(q.options[0]!.preview.source).toBe('enriched');
    expect(q.context).toBeDefined();
    // exactly ONE enrichment call for the round, AFTER the generation call
    expect(llm.calls).toHaveLength(2);
    expect(llm.calls[1]!).toContain('lco-clarify/enrich-v1');
    expect(session.snapshot().promptProtocol).toContain('lco-clarify/enrich-v1');
  });

  it('malformed enrichment degrades to Layer-0 previews (never blocks answering)', async () => {
    const blocked = JSON.stringify(blockedBundle([['DEC-0004', 'Who gets the last fabric?']], true));
    const { session } = await sessionWith([blocked, 'garbage not json'], true);
    await session.runInitialRound();
    const snap = session.snapshot();
    expect(snap.state).toBe('CLARIFICATION_REQUIRED'); // still asking
    expect(snap.questions[0]!.options[0]!.preview.source).toBe('bundle');
  });
});

describe('review change sets (appendix — multi-change transactions)', () => {
  async function atReview() {
    const clean = JSON.stringify(bundle());
    const { session, llm } = await sessionWith([clean]);
    await session.runInitialRound();
    return { session, llm, review: session.snapshot().review! };
  }

  function changeFor(review: { sections: { segments: { segmentId: string; contentHash: string }[] }[] }, instruction: string) {
    const seg = review.sections.flatMap((s) => s.segments).find((s) => s.segmentId === 'SEG-REQ-0001')!;
    return {
      changeId: 'CHG-0001',
      segmentId: 'SEG-REQ-0001',
      selectedText: 'Dealers can browse the product catalogue',
      segmentContentHash: seg.contentHash,
      instruction,
    };
  }
  it('applies a change set in ONE regeneration, maps outcomes, and bumps the review version', async () => {
    const { session, llm, review } = await atReview();
    const regenerated = bundle();
    regenerated.requirements[0]!.statement = 'Dealers browse the catalogue with live stock levels.';
    queueOn(llm, [JSON.stringify(regenerated)]);
    const r = await session.applyChangeSet({ reviewVersion: 1, changes: [changeFor(review, 'Show live stock levels too.')] });
    expect(r.ok).toBe(true);
    const snap = session.snapshot();
    expect(snap.state).toBe('FINAL_REVIEW');
    expect(snap.review!.reviewVersion).toBe(2);
    expect(snap.lastChangeOutcome!.changes[0]!.outcome).toBe('incorporated');
    // the canonical id survived (id stability rule asserted on the new review)
    expect(snap.review!.sections.some((s) => s.segments.some((seg) => seg.segmentId === 'SEG-REQ-0001'))).toBe(true);
  });

  it('a change set that reopens clarification routes back to questions with needs_decisions', async () => {
    const { session, llm, review } = await atReview();
    const reopened = blockedBundle([['DEC-0009', 'Which dealers may see live stock levels?']]);
    queueOn(llm, [JSON.stringify(reopened)]);
    const r = await session.applyChangeSet({ reviewVersion: 1, changes: [changeFor(review, 'Only some dealers see stock levels.')] });
    expect(r.ok).toBe(true);
    const snap = session.snapshot();
    expect(snap.state).toBe('CLARIFICATION_REQUIRED');
    expect(snap.lastChangeOutcome!.changes[0]!.outcome).toBe('needs_decisions');
    expect(snap.questions[0]!.claimId).toBe('DEC-0009');
  });

  it('a stale change set is rejected transactionally (review unchanged)', async () => {
    const { session, review } = await atReview();
    const stale = changeFor(review, 'Show live stock levels too.');
    stale.segmentContentHash = SHA; // wrong hash
    const r = await session.applyChangeSet({ reviewVersion: 1, changes: [stale] });
    expect(r.ok).toBe(false);
    expect(session.snapshot().state).toBe('FINAL_REVIEW');
    expect(session.snapshot().review!.reviewVersion).toBe(1);
    expect(session.snapshot().lastChangeOutcome).toBeUndefined();
  });

  it('a failed regeneration fails the session without writing anything (transactional)', async () => {
    const { session, llm, review } = await atReview();
    queueOn(llm, ['not json', 'still not json']);
    await session.applyChangeSet({ reviewVersion: 1, changes: [changeFor(review, 'Show live stock levels too.')] });
    const snap = session.snapshot();
    expect(snap.state).toBe('FAILED');
    expect(existsSync(join(dir, 'spec'))).toBe(false);
  });
});

describe('approval (§21 — explicit, immutable baseline)', () => {
  it('approves from FINAL_REVIEW, writes spec/ + approvals + answers export; refuses with pending changes', async () => {
    const clean = JSON.stringify(bundle());
    const { session } = await sessionWith([clean]);
    await session.runInitialRound();
    // refuse while the client declares unsubmitted pending changes
    const refused = await session.approve({ pendingChangeIds: ['CHG-9'] });
    expect(refused.ok).toBe(false);
    const r = await session.approve({ pendingChangeIds: [] });
    expect(r.ok).toBe(true);
    expect(session.snapshot().state).toBe('APPROVED');
    expect(existsSync(join(dir, 'spec', 'manifest.json'))).toBe(true);
    expect(existsSync(join(dir, 'approvals', 'APPR-0001.json'))).toBe(true);
    expect(existsSync(join(dir, 'clarify-answers.json'))).toBe(true);
    const record = JSON.parse(readFileSync(join(dir, 'approvals', 'APPR-0001.json'), 'utf8')) as { revision: number; specId: string };
    expect(record.revision).toBe(1);
    expect(record.specId).toMatch(/^SPEC-[0-9a-f]{16}$/);
  });

  it('a second approve cycle creates revision 2 with parent lineage', async () => {
    const clean = JSON.stringify(bundle());
    const edited = bundle();
    edited.requirements[0]!.statement = 'Updated statement for the second revision.';
    const { session, llm } = await sessionWith([clean]);
    await session.runInitialRound();
    await session.approve({ pendingChangeIds: [] });
    queueOn(llm, [JSON.stringify(edited)]);
    await session.applyChangeSet({
      reviewVersion: session.snapshot().review!.reviewVersion,
      changes: [{
        changeId: 'CHG-1',
        segmentId: 'SEG-REQ-0001',
        selectedText: 'Dealers can browse the product catalogue',
        segmentContentHash: session.snapshot().review!.sections.flatMap((s) => s.segments).find((s) => s.segmentId === 'SEG-REQ-0001')!.contentHash,
        instruction: 'Reword the catalogue requirement.',
      }],
    });
    const r = await session.approve({ pendingChangeIds: [] });
    expect(r.ok).toBe(true);
    const v2 = JSON.parse(readFileSync(join(dir, 'approvals', 'APPR-0002.json'), 'utf8')) as { revision: number; parentRevision?: number };
    expect(v2.revision).toBe(2);
    expect(v2.parentRevision).toBe(1);
  });

  it('approval is refused outside FINAL_REVIEW (never on mere completion)', async () => {
    const { session } = await sessionWith([JSON.stringify(blockedBundle([['DEC-0004', 'Who gets the last fabric?']]))]);
    await session.runInitialRound();
    const r = await session.approve({ pendingChangeIds: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('review');
    expect(existsSync(join(dir, 'spec'))).toBe(false);
  });
});

describe('cancel + usage accounting (§30/§36)', () => {
  it('cancel from a live session writes nothing and is terminal', async () => {
    const { session } = await sessionWith([JSON.stringify(blockedBundle([['DEC-0004', 'Who?']]))]);
    await session.runInitialRound();
    session.cancel('user closed the terminal');
    expect(session.snapshot().state).toBe('CANCELLED');
    expect(existsSync(join(dir, 'spec'))).toBe(false);
  });

  it('usage accumulates honestly across rounds (unknown stays unknown)', async () => {
    const llm: LlmAdapter = {
      calls: 0,
      async complete(): Promise<LlmResponse> {
        (this as { calls: number }).calls += 1;
        return { text: JSON.stringify(bundle()), usage: undefined };
      },
    } as unknown as LlmAdapter;
    const session = createClarifySession({ ...OPTS, dir, llm });
    await session.runInitialRound();
    const usage = session.snapshot().usage;
    expect(usage.calls).toBeGreaterThanOrEqual(1);
    expect(usage.usageKnown).toBe(false); // provider reported nothing — unknown, not zero
  });
});
