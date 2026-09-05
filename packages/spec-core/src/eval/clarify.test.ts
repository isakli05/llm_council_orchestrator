import { describe, it, expect } from 'vitest';
import { runPipeline } from './runner';
import type { LlmAdapter, LlmResponse } from './llm/adapter';
import { EVAL_TASKS } from './tasks';
import type { EvalTask, EvalTaskId } from './tasks';
import type { SpecBundle } from '../schemas';
import { parseAnswersFile } from './answers';
import { withUserAnswers } from './prompts-v4';

/**
 * §11/§12 — clarification questions on blocked outcomes + the answers loop.
 * Only a schema- AND lifecycle-valid candidate blocked by UNRESOLVED
 * decisions yields clarifications; everything else stays a raw blocked
 * outcome. Answers wrap prompts as verbatim user evidence.
 */

const NOW = '2026-08-18T12:00:00Z';
const SHA = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

const BASE = {
  manifest: {
    spec_schema: 'lco-spec/1.0',
    spec_version: 1,
    project: { name: 'stock-tool', mode: 'greenfield' },
    complexity_profile: 'p-mini',
    evidence_snapshot: { pack_hash: SHA, collected_at: '2026-08-18T12:00:00Z' },
    state: 'draft',
    council_run: { run_id: 't', config_fingerprint: 't' },
    artifact_hashes: {},
    unresolved_count: 0,
    blocking_count: 0,
    target_runtime: { platform: 'node', stack: 'ts' },
  },
  intent: { statement: 's', normalized: 'n' },
  glossary: [{ term: 'Term', definition: 'd' }],
  assumptions: [],
  evidence: [{ id: 'E-0001', kind: 'user_input' as const, source: 's', hash: SHA }],
  requirements: [
    {
      id: 'REQ-0001',
      statement: 'must work',
      priority: 'must' as const,
      evidence: ['E-0001'],
      acceptance_refs: ['TST-0001'],
      terms_used: [],
    },
  ],
  decisions: [
    {
      claim_id: 'DEC-0001',
      decision: 'd',
      rationale: 'r',
      evidence: ['E-0001'],
      confidence: 1,
      impact: 'low' as const,
      assumptions: [],
      alternatives: [],
      status: 'accepted',
    },
  ],
  contracts: [],
  tasks: [
    {
      task_id: 'TASK-0001',
      title: 't',
      purpose: 'p',
      refs: { requirements: ['REQ-0001'], architecture: [], decisions: ['DEC-0001'] },
      depends_on: [],
      preconditions: ['c'],
      permitted_scope: ['src/**'],
      protected: [],
      interface_changes: [],
      invariants: ['i'],
      instructions: 'do',
      tests: [{ id: 'TST-0001', kind: 'unit' as const, file: 'a.test.ts', cases: ['REQ-0001: works'] }],
      verification: [{ command: 'node --version', expect: 'exit 0' }],
      acceptance: ['a'],
      rollback: 'r',
      completion_evidence: { required: ['test_summary' as const] },
      risk: { level: 'low' as const, note: '' },
      complexity: 'xs' as const,
    },
  ],
  test_files: ['a.test.ts'],
} as unknown as SpecBundle;

function task(id: EvalTaskId): EvalTask {
  const t = EVAL_TASKS.find((x) => x.id === id);
  if (!t) throw new Error(`unknown task ${id}`);
  return t;
}

/** A bundle with TWO unresolved decisions carrying user-facing question text.
 * State stays 'draft' (the lifecycle generation contract) — the unresolved
 * material itself is what L08 blocks on. */
function unresolvedBundle(): SpecBundle {
  const b = structuredClone(BASE);
  b.manifest.unresolved_count = 2;
  b.decisions = [
    {
      ...b.decisions[0]!,
      claim_id: 'DEC-0004',
      decision:
        'If two customers try to complete the remaining quantity for the same fabric at the same time, what should the system do — accept both orders, or give priority to the first confirmed one?',
      impact: 'high',
      alternatives: [
        { option: 'first confirmed order gets priority', rejected_because: 'the other customer sees an out-of-stock message' },
        { option: 'accept both and split the stock', rejected_because: 'risks selling more than available' },
      ],
      status: 'UNRESOLVED',
    },
    {
      ...b.decisions[0]!,
      claim_id: 'DEC-0007',
      decision: 'When a customer creates an order, should stock be reserved immediately or only after you approve the order?',
      impact: 'medium',
      alternatives: [],
      status: 'UNRESOLVED',
    },
  ];
  return b;
}

function makeLlm(responses: string[]): LlmAdapter {
  let n = 0;
  return {
    async complete(): Promise<LlmResponse> {
      n += 1;
      const text = responses[n - 1];
      if (text === undefined) throw new Error(`unexpected call #${n}`);
      return { text, usage: { in_tokens: 1, out_tokens: 1 } };
    },
  };
}

describe('clarifications on blocked outcomes (§11)', () => {
  it('an L08-blocked valid bundle surfaces its UNRESOLVED decisions as questions', async () => {
    const llm = makeLlm([JSON.stringify(unresolvedBundle()), JSON.stringify(unresolvedBundle()), JSON.stringify(unresolvedBundle())]);
    const out = await runPipeline(task('ET-13'), 'single', llm, NOW);
    expect(out.kind).toBe('blocked');
    if (out.kind !== 'blocked') return;
    expect(out.clarifications).toHaveLength(2);
    expect(out.clarifications![0]).toMatchObject({
      claimId: 'DEC-0004',
      impact: 'high',
    });
    expect(out.clarifications![0]!.question).toContain('two customers');
    expect(out.clarifications![0]!.alternatives).toHaveLength(2);
    expect(out.clarifications![1]!.claimId).toBe('DEC-0007');
  });

  it('a schema-invalid candidate carries NO clarifications (malformed output never becomes a question)', async () => {
    const llm = makeLlm(['not json at all', 'still not json']);
    const out = await runPipeline(task('ET-01'), 'single', llm, NOW);
    expect(out.kind).toBe('blocked');
    if (out.kind === 'blocked') expect(out.clarifications).toBeUndefined();
  });

  it('a lifecycle-invalid candidate carries NO clarifications', async () => {
    const bad = structuredClone(BASE);
    bad.manifest.state = 'reviewed'; // fails the generation contract
    const llm = makeLlm([JSON.stringify(bad), JSON.stringify(bad)]);
    const out = await runPipeline(task('ET-01'), 'single', llm, NOW);
    expect(out.kind).toBe('blocked');
    if (out.kind === 'blocked') {
      expect(out.reasons[0]).toContain('reviewed');
      expect(out.clarifications).toBeUndefined();
    }
  });

  it('a classifier-monotonic block WITHOUT unresolved material carries none', async () => {
    const clean = structuredClone(BASE);
    const classifier = JSON.stringify({ profile: 'p-mini', must_be_blocked: true });
    // fused council: classifier + proposal A + fused judge = 3 calls
    const llm = makeLlm([classifier, JSON.stringify(clean), JSON.stringify(clean)]);
    const out = await runPipeline(task('ET-01'), 'council', llm, NOW);
    expect(out.kind).toBe('blocked');
    if (out.kind === 'blocked') {
      expect(out.reasons.some((r) => r.includes('BLOCKED_EARLIER_EVIDENCE'))).toBe(true);
      expect(out.clarifications).toBeUndefined();
    }
  });

  it('decomposed council blocked-by-unresolved carries them too', async () => {
    const classifier = JSON.stringify({ profile: 'p-mini', must_be_blocked: false });
    const q = JSON.stringify(unresolvedBundle());
    const llm = makeLlm([classifier, q, q, q, q, q, q, q]);
    const out = await runPipeline(task('ET-13'), 'council', llm, NOW, undefined, {
      topology: 'decomposed',
    });
    expect(out.kind).toBe('blocked');
    if (out.kind === 'blocked') expect(out.clarifications!.length).toBeGreaterThan(0);
  });
});

describe('the answers loop (§12)', () => {
  it('accepts a well-formed document; rejects bad keys, blank/oversized values, non-objects', () => {
    const good = parseAnswersFile('{"DEC-0004": "first order wins", "DEC-0007": "reserve immediately"}', 'answers:a.json');
    expect(good.ok).toBe(true);
    if (good.ok) {
      expect(good.answers).toHaveLength(2);
      expect(good.answers[0]!.claimId).toBe('DEC-0004');
      expect(good.answers[0]!.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(good.answers[0]!.source).toBe('answers:a.json');
    }
    expect(!parseAnswersFile('{"REQ-0001": "x"}', 'a').ok).toBe(true);
    expect(!parseAnswersFile('{"DEC-0004": ""}', 'a').ok).toBe(true);
    expect(!parseAnswersFile('[]', 'a').ok).toBe(true);
    expect(!parseAnswersFile('{}', 'a').ok).toBe(true);
    expect(!parseAnswersFile('nope', 'a').ok).toBe(true);
    const tooLong = 'x'.repeat(4001);
    expect(!parseAnswersFile('{"DEC-0004": ' + JSON.stringify(tooLong) + '}', 'a').ok).toBe(true);
  });

  it('answers wrap every prompt of the run (single variant: v3+answers protocol)', async () => {
    const prompts: string[] = [];
    let n = 0;
    const llm: LlmAdapter = {
      async complete(prompt: string): Promise<LlmResponse> {
        prompts.push(prompt);
        n += 1;
        const text = n === 1 ? JSON.stringify(unresolvedBundle()) : JSON.stringify(unresolvedBundle());
        return { text, usage: { in_tokens: 1, out_tokens: 1 } };
      },
    };
    const answers = parseAnswersFile('{"DEC-0004": "first confirmed order gets priority"}', 'answers:answers.json');
    expect(answers.ok).toBe(true);
    if (!answers.ok) return;
    const out = await runPipeline(task('ET-13'), 'single', llm, NOW, undefined, {
      answers: answers.answers,
    });
    expect(out.promptProtocol).toBe('lco-prompts/v3+answers-v1');
    // the answer (verbatim) + its hash ride in EVERY prompt of the run
    for (const p of prompts) {
      expect(p).toContain('first confirmed order gets priority');
      expect(p).toContain(answers.answers[0]!.hash);
      expect(p).toContain('ONLY the decision it names');
    }
  });

  it('withUserAnswers binding rules name the no-auto-erasure contract', () => {
    const answers = parseAnswersFile('{"DEC-0004": "x"}', 'a');
    if (!answers.ok) return;
    const text = withUserAnswers('BASE', answers.answers);
    expect(text).toContain('remain UNRESOLVED with the same claim_id');
    expect(text).toContain('NEW UNRESOLVED decisions');
  });
});
