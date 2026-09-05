import { describe, it, expect } from 'vitest';
import { runPipeline } from './runner';
import type { PipelineOutcome } from './runner';
import type { LlmAdapter, LlmResponse } from './llm/adapter';
import type { LlmPlan, LlmRole } from '../llm/plan';
import { EVAL_TASKS } from './tasks';
import type { EvalTask, EvalTaskId } from './tasks';
import type { SpecBundle } from '../schemas';

/**
 * The DECOMPOSED council topology (owner spec §2/§18): classifier →
 * INDEPENDENT proposal A ∥ proposal B → judge over the VALIDATED proposals.
 * Degradation matrix, independence, judge-input integrity, monotonic
 * blocking, and per-role accounting are pinned here.
 */

const NOW = '2026-08-18T12:00:00Z';

const PET_CLINIC = {
  manifest: {
    spec_schema: 'lco-spec/1.0',
    spec_version: 1,
    project: { name: 'url-shortener-cli', mode: 'greenfield' },
    complexity_profile: 'p-mini',
    evidence_snapshot: {
      pack_hash: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      collected_at: '2026-08-18T12:00:00Z',
    },
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
  evidence: [
    {
      id: 'E-0001',
      kind: 'user_input',
      source: 's',
      hash: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    },
  ],
  requirements: [
    {
      id: 'REQ-0001',
      statement: 'must work',
      priority: 'must',
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
      impact: 'low',
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
      tests: [{ id: 'TST-0001', kind: 'unit', file: 'a.test.ts', cases: ['REQ-0001: works'] }],
      verification: [{ command: 'node --version', expect: 'exit 0' }],
      acceptance: ['a'],
      rollback: 'r',
      completion_evidence: { required: ['test_summary'] },
      risk: { level: 'low', note: '' },
      complexity: 'xs',
    },
  ],
  test_files: ['a.test.ts'],
} as unknown as SpecBundle;

function task(id: EvalTaskId): EvalTask {
  const t = EVAL_TASKS.find((x) => x.id === id);
  if (!t) throw new Error(`unknown task ${id}`);
  return t;
}

function et01Bundle(): SpecBundle {
  const b = structuredClone(PET_CLINIC);
  b.intent = {
    statement:
      'URL shortening CLI: 7-char alphanumeric-with-dash codes, single SQLite file, shorten/stats/resolve subcommands, click counting, exit 3 on unknown code.',
    normalized: 'url shortener cli: shorten, stats, resolve; sqlite; click counts',
  };
  return b;
}

const CLASSIFIER_OK = JSON.stringify({ profile: 'p-mini', must_be_blocked: false });
const CLASSIFIER_BLOCK = JSON.stringify({ profile: 'p-mini', must_be_blocked: true });
const BUNDLE_OK = () => JSON.stringify(et01Bundle());
const NOT_A_BUNDLE = 'this is not json {{{';

/**
 * Per-role scripted plan for the decomposed topology. `scripts` maps each
 * role to its ordered responses; every prompt is recorded per role.
 */
function decomposedPlan(scripts: Partial<Record<LlmRole, string[]>>): {
  plan: LlmPlan;
  prompts: Record<string, string[]>;
} {
  const prompts: Record<string, string[]> = {};
  const adapters: Partial<Record<LlmRole, LlmAdapter>> = {};
  for (const role of Object.keys(scripts) as LlmRole[]) {
    const script = scripts[role]!;
    let cursor = 0;
    prompts[role] = [];
    adapters[role] = {
      async complete(prompt: string): Promise<LlmResponse> {
        cursor += 1;
        prompts[role]!.push(prompt);
        const text = script[cursor - 1];
        if (text === undefined) {
          throw new Error(`role ${role}: unexpected call #${cursor} (script has ${script.length})`);
        }
        return { text, usage: { in_tokens: 10 * cursor, out_tokens: 5 * cursor } };
      },
    };
  }
  return {
    plan: {
      forRole(r) {
        const adapter = adapters[r];
        if (!adapter) throw new Error(`no adapter for role ${r}`);
        return {
          adapter,
          identity: { gateway: `gw-${r}`, providerKind: 'openai-compatible', requestedModel: `m-${r}` },
        };
      },
    },
    prompts,
  };
}

describe('decomposed council — happy path', () => {
  it('classifier → independent A ∥ B → judge with BOTH validated proposals', async () => {
    const { plan, prompts } = decomposedPlan({
      classifier: [CLASSIFIER_OK],
      proposal_a: [BUNDLE_OK()],
      proposal_b: [BUNDLE_OK()],
      judge: [BUNDLE_OK()],
    });
    const out = await runPipeline(task('ET-01'), 'council', plan, NOW, undefined, {
      topology: 'decomposed',
    });
    expect(out.kind).toBe('spec');
    if (out.kind !== 'spec') return;
    expect(out.degradedRoles).toBeUndefined();
    expect(out.councilDegraded).toBeUndefined();
    // judge saw both proposals verbatim
    expect(prompts.judge![0]).toContain('PROPOSAL A (verbatim');
    expect(prompts.judge![0]).toContain('PROPOSAL B (verbatim');
    // B never saw A (independence)
    expect(prompts.proposal_b![0]).not.toContain('PROPOSAL A');
    // per-role accounting covers all four roles
    expect(Object.keys(out.usage.byRole ?? {}).sort()).toEqual([
      'classifier',
      'judge',
      'proposal_a',
      'proposal_b',
    ]);
  });

  it('same-model decomposed council (one adapter for all roles) is the same flow', async () => {
    let n = 0;
    const llm: LlmAdapter = {
      async complete(): Promise<LlmResponse> {
        n += 1;
        const text = n === 1 ? CLASSIFIER_OK : BUNDLE_OK();
        return { text, usage: { in_tokens: 1, out_tokens: 1 } };
      },
    };
    const out = await runPipeline(task('ET-01'), 'council', llm, NOW, undefined, {
      topology: 'decomposed',
    });
    expect(out.kind).toBe('spec');
    expect(n).toBe(4); // classifier + A + B + judge — B2-capable topology
  });
});

describe('decomposed council — degradation matrix (§18)', () => {
  it('A valid, B invalid twice → judge sees ONLY A; degradedRoles=[proposal_b]; B text withheld', async () => {
    const { plan, prompts } = decomposedPlan({
      classifier: [CLASSIFIER_OK],
      proposal_a: [BUNDLE_OK()],
      proposal_b: [NOT_A_BUNDLE, NOT_A_BUNDLE], // both attempts fail schema
      judge: [BUNDLE_OK()],
    });
    const out = await runPipeline(task('ET-01'), 'council', plan, NOW, undefined, {
      topology: 'decomposed',
    });
    expect(out.kind).toBe('spec');
    if (out.kind !== 'spec') return;
    expect(out.degradedRoles).toEqual(['proposal_b']);
    // B's unvalidated text NEVER reached the judge
    for (const p of prompts.judge!) {
      expect(p).not.toContain(NOT_A_BUNDLE);
      expect(p).toContain('proposal_b failed schema validation');
    }
  });

  it('A invalid twice, B valid → mirror: degradedRoles=[proposal_a]', async () => {
    const { plan } = decomposedPlan({
      classifier: [CLASSIFIER_OK],
      proposal_a: [NOT_A_BUNDLE, NOT_A_BUNDLE],
      proposal_b: [BUNDLE_OK()],
      judge: [BUNDLE_OK()],
    });
    const out = await runPipeline(task('ET-01'), 'council', plan, NOW, undefined, {
      topology: 'decomposed',
    });
    expect(out.kind).toBe('spec');
    if (out.kind === 'spec') expect(out.degradedRoles).toEqual(['proposal_a']);
  });

  it('both legs invalid → judge alone; degradedRoles=[proposal_a, proposal_b]', async () => {
    const { plan, prompts } = decomposedPlan({
      classifier: [CLASSIFIER_OK],
      proposal_a: [NOT_A_BUNDLE, NOT_A_BUNDLE],
      proposal_b: [NOT_A_BUNDLE, NOT_A_BUNDLE],
      judge: [BUNDLE_OK()],
    });
    const out = await runPipeline(task('ET-01'), 'council', plan, NOW, undefined, {
      topology: 'decomposed',
    });
    expect(out.kind).toBe('spec');
    if (out.kind !== 'spec') return;
    expect(out.degradedRoles).toEqual(['proposal_a', 'proposal_b']);
    expect(prompts.judge![0]).toContain('BOTH proposal legs failed');
    for (const p of prompts.judge!) {
      expect(p).not.toContain(NOT_A_BUNDLE);
    }
  });

  it('a single invalid attempt RETRIES once before degrading (bounded retry parity with fused)', async () => {
    const { plan } = decomposedPlan({
      classifier: [CLASSIFIER_OK],
      proposal_a: [NOT_A_BUNDLE, BUNDLE_OK()], // first bad, retry good
      proposal_b: [BUNDLE_OK()],
      judge: [BUNDLE_OK()],
    });
    const out = await runPipeline(task('ET-01'), 'council', plan, NOW, undefined, {
      topology: 'decomposed',
    });
    expect(out.kind).toBe('spec');
    if (out.kind === 'spec') expect(out.degradedRoles).toBeUndefined();
  });

  it('judge invalid after retries → blocked outcome (never a degraded success)', async () => {
    const { plan } = decomposedPlan({
      classifier: [CLASSIFIER_OK],
      proposal_a: [BUNDLE_OK()],
      proposal_b: [BUNDLE_OK()],
      judge: [NOT_A_BUNDLE, NOT_A_BUNDLE, NOT_A_BUNDLE], // schema retry + lint retry exhausted
    });
    const out = await runPipeline(task('ET-01'), 'council', plan, NOW, undefined, {
      topology: 'decomposed',
    });
    expect(out.kind).toBe('blocked');
  });

  it('degraded blocked outcomes carry degradedRoles too', async () => {
    const { plan } = decomposedPlan({
      classifier: [CLASSIFIER_OK],
      proposal_a: [NOT_A_BUNDLE, NOT_A_BUNDLE],
      proposal_b: [NOT_A_BUNDLE, NOT_A_BUNDLE],
      judge: [NOT_A_BUNDLE, NOT_A_BUNDLE, NOT_A_BUNDLE],
    });
    const out = await runPipeline(task('ET-01'), 'council', plan, NOW, undefined, {
      topology: 'decomposed',
    });
    expect(out.kind).toBe('blocked');
    if (out.kind === 'blocked') expect(out.degradedRoles).toEqual(['proposal_a', 'proposal_b']);
  });
});

describe('decomposed council — blocking evidence is monotonic (BACK-001 (a) preserved)', () => {
  it('classifier must_be_blocked=true blocks even when the judge returns a clean bundle', async () => {
    const { plan } = decomposedPlan({
      classifier: [CLASSIFIER_BLOCK],
      proposal_a: [BUNDLE_OK()],
      proposal_b: [BUNDLE_OK()],
      judge: [BUNDLE_OK()],
    });
    const out = await runPipeline(task('ET-01'), 'council', plan, NOW, undefined, {
      topology: 'decomposed',
    });
    expect(out.kind).toBe('blocked');
    if (out.kind === 'blocked') {
      expect(out.reasons.some((r) => r.includes('BLOCKED_EARLIER_EVIDENCE'))).toBe(true);
    }
  });

  it('malformed classifier verdict blocks immediately', async () => {
    const { plan } = decomposedPlan({
      classifier: ['{"nonsense": true}'],
      proposal_a: [BUNDLE_OK()],
      proposal_b: [BUNDLE_OK()],
      judge: [BUNDLE_OK()],
    });
    const out = await runPipeline(task('ET-01'), 'council', plan, NOW, undefined, {
      topology: 'decomposed',
    });
    expect(out.kind).toBe('blocked');
    if (out.kind === 'blocked') {
      expect(out.reasons[0]).toContain('classifier output failed schema validation');
    }
  });
});

describe('decomposed council — prompt protocol', () => {
  it('the outcome records the v4 protocol identity', async () => {
    const { plan } = decomposedPlan({
      classifier: [CLASSIFIER_OK],
      proposal_a: [BUNDLE_OK()],
      proposal_b: [BUNDLE_OK()],
      judge: [BUNDLE_OK()],
    });
    const out = (await runPipeline(task('ET-01'), 'council', plan, NOW, undefined, {
      topology: 'decomposed',
    })) as Extract<PipelineOutcome, { kind: 'spec' }>;
    expect(out.promptProtocol).toBe('lco-prompts/v4');
  });
});
