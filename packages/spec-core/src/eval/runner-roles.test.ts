import { describe, it, expect } from 'vitest';
import { runPipeline } from './runner';
import type { PipelineOutcome } from './runner';
import type { LlmAdapter, LlmResponse } from './llm/adapter';
import { EVAL_TASKS } from './tasks';
import type { EvalTask, EvalTaskId } from './tasks';
import type { SpecBundle } from '../schemas';
import { runPipeline as runPipelineTyped } from './runner';
import type { LlmPlan, LlmRole } from '../llm/plan';

/**
 * Role-aware routing in the pipeline (owner spec §3): a PLAN routes each role
 * to its own adapter; a plain adapter keeps the historical behavior. Fused
 * council's logical call structure (classifier → proposal A → fused judge)
 * must be IDENTICAL under both — this file pins that + the per-role usage
 * slice (§13).
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

/**
 * Per-role scripted plan: each role gets its own recording adapter with its
 * own script. Calls beyond a role's script throw (fail-closed, no invention).
 */
function rolePlan(scripts: Partial<Record<LlmRole, string[]>>): {
  plan: LlmPlan;
  promptsByRole: Record<string, string[]>;
  callsByRole: Record<string, number>;
} {
  const promptsByRole: Record<string, string[]> = {};
  const callsByRole: Record<string, number> = {};
  const adapters: Partial<Record<LlmRole, LlmAdapter>> = {};
  for (const role of Object.keys(scripts) as LlmRole[]) {
    const script = scripts[role]!;
    let cursor = 0;
    promptsByRole[role] = [];
    callsByRole[role] = 0;
    adapters[role] = {
      async complete(prompt: string): Promise<LlmResponse> {
        cursor += 1;
        promptsByRole[role]!.push(prompt);
        callsByRole[role] = callsByRole[role]! + 1;
        const text = script[cursor - 1];
        if (text === undefined) {
          throw new Error(`role ${role}: unexpected call #${cursor} (script has ${script.length})`);
        }
        return { text, usage: { in_tokens: 10 * cursor, out_tokens: 5 * cursor } };
      },
    };
  }
  const plan: LlmPlan = {
    forRole(r) {
      const adapter = adapters[r];
      if (adapter === undefined) {
        throw new Error(`role ${r} has no adapter in this plan`);
      }
      return {
        adapter,
        identity: {
          gateway: `gw-${r}`,
          providerKind: r === 'judge' ? 'openrouter' : 'routellm',
          requestedModel: `model-${r}`,
        },
      };
    },
  };
  return { plan, promptsByRole, callsByRole };
}

describe('runPipeline — role-aware routing over a plan (fused council unchanged logically)', () => {
  it('routes classifier/proposal_a/judge to their own adapters, same call structure', async () => {
    const { plan, promptsByRole, callsByRole } = rolePlan({
      classifier: [JSON.stringify({ profile: 'p-mini', must_be_blocked: false })],
      proposal_a: [JSON.stringify(et01Bundle())],
      // judge produces the final gated bundle directly (clean single attempt)
      judge: [JSON.stringify(et01Bundle())],
    });

    const out: PipelineOutcome = await runPipelineTyped(task('ET-01'), 'council', plan, NOW);

    expect(out.kind).toBe('spec');
    expect(callsByRole.classifier).toBe(1);
    expect(callsByRole.proposal_a).toBe(1);
    expect(callsByRole.judge).toBe(1);
    // Independence shape of the FUSED topology preserved: the judge prompt
    // carries proposal A verbatim; A never saw the classifier verdict.
    expect(promptsByRole.judge![0]).toContain('PROPOSAL A (verbatim');
    expect(promptsByRole.proposal_a![0]).not.toContain('must_be_blocked');
  });

  it('per-role usage slices match the totals and attribute gateway/model', async () => {
    const { plan } = rolePlan({
      classifier: [JSON.stringify({ profile: 'p-mini', must_be_blocked: false })],
      proposal_a: [JSON.stringify(et01Bundle())],
      judge: [JSON.stringify(et01Bundle())],
    });
    const out = await runPipeline(task('ET-01'), 'council', plan, NOW);
    expect(out.kind).toBe('spec');
    if (out.kind !== 'spec') return;
    const u = out.usage;
    expect(u.byRole).toBeDefined();
    const roles = Object.keys(u.byRole!).sort();
    expect(roles).toEqual(['classifier', 'judge', 'proposal_a']);
    const sum = Object.values(u.byRole!).reduce(
      (acc, r) => ({ calls: acc.calls + r!.calls, attempts: acc.attempts + r!.attempts, in: acc.in + r!.in, out: acc.out + r!.out }),
      { calls: 0, attempts: 0, in: 0, out: 0 },
    );
    expect(sum).toEqual({ calls: u.calls, attempts: u.attempts, in: u.in, out: u.out });
    expect(u.byRole!.judge!.gateway).toBe('gw-judge');
    expect(u.byRole!.judge!.requestedModel).toBe('model-judge');
  });

  it('single variant routes everything to the single role and still works', async () => {
    const { plan, callsByRole } = rolePlan({
      single: [JSON.stringify(et01Bundle())],
    });
    const out = await runPipeline(task('ET-01'), 'single', plan, NOW);
    expect(out.kind).toBe('spec');
    expect(callsByRole.single).toBe(1);
    if (out.kind === 'spec') {
      expect(Object.keys(out.usage.byRole!)).toEqual(['single']);
    }
  });

  it('usageKnown=false is per-role AND total when one role reports no usage', async () => {
    let cursor = 0;
    const plan: LlmPlan = {
      forRole: (r) => ({
        adapter: {
          async complete(): Promise<LlmResponse> {
            cursor += 1;
            // classifier (call 1) reports usage; proposal A (call 2) does not;
            // judge (call 3) reports usage.
            const withUsage = cursor !== 2;
            const text =
              cursor === 1
                ? JSON.stringify({ profile: 'p-mini', must_be_blocked: false })
                : JSON.stringify(et01Bundle());
            return { text, ...(withUsage ? { usage: { in_tokens: 7, out_tokens: 3 } } : {}) };
          },
        },
        identity: { gateway: 'g', providerKind: 'openai-compatible', requestedModel: 'm' },
      }),
    };
    const out = await runPipeline(task('ET-01'), 'council', plan, NOW);
    expect(out.kind).toBe('spec');
    if (out.kind !== 'spec') return;
    expect(out.usage.usageKnown).toBe(false);
    expect(out.usage.byRole!.proposal_a!.usageKnown).toBe(false);
    expect(out.usage.byRole!.classifier!.usageKnown).toBe(true);
    expect(out.usage.byRole!.judge!.usageKnown).toBe(true);
  });

  it('resolvedModels accumulate the provider-reported models per role', async () => {
    const { plan } = rolePlan({
      classifier: [JSON.stringify({ profile: 'p-mini', must_be_blocked: false })],
      proposal_a: [JSON.stringify(et01Bundle())],
      judge: [JSON.stringify(et01Bundle())],
    });
    // wrap the judge adapter to attach provenance
    const inner = plan.forRole('judge');
    const wrapped: LlmPlan = {
      forRole(r) {
        if (r !== 'judge') return plan.forRole(r);
        return {
          adapter: {
            async complete(prompt: string) {
              const res = await inner.adapter.complete(prompt);
              return { ...res, provenance: { gateway: 'openrouter', providerKind: 'openrouter' as const, requestedModel: 'm', resolvedModel: 'vendor/real-model' } };
            },
          },
          identity: inner.identity,
        };
      },
    };
    const out = await runPipeline(task('ET-01'), 'council', wrapped, NOW);
    expect(out.kind).toBe('spec');
    if (out.kind === 'spec') {
      expect(out.usage.byRole!.judge!.resolvedModels).toEqual(['vendor/real-model']);
      expect(out.usage.byRole!.classifier!.resolvedModels).toBeUndefined();
    }
  });

  it('a plain adapter (no plan) keeps the exact historical usage shape — no byRole', async () => {
    let n = 0;
    const llm: LlmAdapter = {
      async complete(): Promise<LlmResponse> {
        n += 1;
        const text =
          n === 1
            ? JSON.stringify({ profile: 'p-mini', must_be_blocked: false })
            : JSON.stringify(et01Bundle());
        return { text, usage: { in_tokens: 1, out_tokens: 1 } };
      },
    };
    const out = await runPipeline(task('ET-01'), 'council', llm, NOW);
    expect(out.kind).toBe('spec');
    if (out.kind === 'spec') {
      // A plain adapter has no role identity: the outcome keeps its exact
      // historical shape (no unknown/unknown noise slices).
      expect(out.usage.byRole).toBeUndefined();
    }
  });
});
