import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runPipeline, stripJsonFences } from './runner';
import type { LlmAdapter, LlmResponse } from './llm/adapter';
import { EVAL_TASKS } from './tasks';
import type { EvalTask, EvalTaskId } from './tasks';
import type { SpecBundle } from '../schemas';

const NOW = '2026-08-18T12:00:00Z';

// T7: the mock bundle base was the pet-clinic fixture; fixtures conform to
// L13/L14 only in T8, and these pipeline tests (BACK-001 monotonicity,
// BACK-008 retry, call accounting) must keep protecting those semantics NOW —
// so the base is an inline fully-conforming bundle (lint-clean, judgeable
// expects, test ids). Every mutation below applies identically.
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

/** pet-clinic fixture re-intented for ET-01 (URL shortener CLI, p-mini greenfield). */
function et01Bundle(): SpecBundle {
  const b = structuredClone(PET_CLINIC);
  b.intent = {
    statement:
      'URL shortening CLI: 7-char alphanumeric-with-dash codes, single SQLite file, shorten/stats/resolve subcommands, click counting, exit 3 on unknown code.',
    normalized: 'url shortener cli: shorten, stats, resolve; sqlite; click counts',
  };
  b.manifest.project = { name: 'url-shortener-cli', mode: 'greenfield' };
  b.manifest.complexity_profile = 'p-mini';
  return b;
}

/** pet-clinic fixture re-intented for ET-13 with an unresolved leak (L08 fodder). */
function et13UnresolvedBundle(): SpecBundle {
  const b = structuredClone(PET_CLINIC);
  b.intent = {
    statement:
      'Small-shop stock tool; database undecided, report types unknown, user count and concurrency model undecided.',
    normalized: 'stock tracking tool; db/reports/users undecided',
  };
  b.manifest.project = { name: 'stock-tool', mode: 'greenfield' };
  b.manifest.complexity_profile = 'p-mini';
  b.decisions[0]!.status = 'UNRESOLVED';
  b.manifest.unresolved_count = 1;
  return b;
}

/** et01Bundle stamped as an independent council proposal A (sentinel via council_run). */
function proposalAJson(): string {
  const b = et01Bundle();
  b.manifest.council_run = { run_id: 'sentinel-proposal-a-7q4z', config_fingerprint: 'cfg-x' };
  return JSON.stringify(b);
}

/**
 * Counting scripted LLM: records every prompt, counts every call, and returns
 * deterministic per-call usage (in 10*n / out 5*n) so token accounting is
 * arithmetic, not guesswork. Throws on any call beyond the script — the runner
 * must never trigger one.
 */
function makeLlm(responses: string[]): {
  llm: LlmAdapter;
  calls: () => number;
  prompts: string[];
} {
  let n = 0;
  const prompts: string[] = [];
  const llm: LlmAdapter = {
    async complete(prompt: string): Promise<LlmResponse> {
      n += 1;
      prompts.push(prompt);
      const text = responses[n - 1];
      if (text === undefined) {
        throw new Error(`test-llm: unexpected call #${n} (script has ${responses.length})`);
      }
      return { text, usage: { in_tokens: 10 * n, out_tokens: 5 * n } };
    },
  };
  return { llm, calls: () => n, prompts };
}

describe('runPipeline — single variant', () => {
  it('(a) greenfield ET-01 + valid bundle JSON → kind spec, lint clean, exactly 1 call', async () => {
    const { llm, calls } = makeLlm([JSON.stringify(et01Bundle())]);
    const out = await runPipeline(task('ET-01'), 'single', llm, NOW);

    expect(out.kind).toBe('spec');
    expect(out.variant).toBe('single');
    if (out.kind === 'spec') {
      expect(out.bundle.manifest.project.name).toBe('url-shortener-cli');
      expect(out.bundle.manifest.state).toBe('draft');
      expect(out.bundle.requirements).toHaveLength(PET_CLINIC.requirements.length); // derived from the mock base, not hardcoded
    }
    expect(calls()).toBe(1);
    expect(out.usage).toEqual({ in: 10, out: 5, calls: 1 });
  });

  it('(a) accepts output wrapped in ```json fences', async () => {
    const fenced = '```json\n' + JSON.stringify(et01Bundle()) + '\n```';
    const { llm } = makeLlm([fenced]);
    const out = await runPipeline(task('ET-01'), 'single', llm, NOW);
    expect(out.kind).toBe('spec');
  });

  it('(b) ambiguous ET-13 + UNRESOLVED decision leak → blocked with L08 reasons', async () => {
    const { llm } = makeLlm([JSON.stringify(et13UnresolvedBundle())]);
    const out = await runPipeline(task('ET-13'), 'single', llm, NOW);

    expect(out.kind).toBe('blocked');
    if (out.kind === 'blocked') {
      const l08 = out.reasons.filter((r) => r.includes('L08_UNRESOLVED_LEAK'));
      // one error for the UNRESOLVED decision, one for manifest.unresolved_count > 0
      expect(l08).toHaveLength(2);
      expect(out.reasons.some((r) => r.includes('DEC-0001'))).toBe(true);
      expect(out.reasons.some((r) => r.includes('manifest.unresolved_count'))).toBe(true);
    }
    expect(out.usage).toEqual({ in: 10, out: 5, calls: 1 });
  });

  it('(c) garbage text → schema retry also garbage → blocked with schema-validation reason', async () => {
    const { llm, calls } = makeLlm([
      'I am sorry, I cannot produce that as JSON. Here is prose instead.',
      'Still prose, still not JSON.',
    ]);
    const out = await runPipeline(task('ET-01'), 'single', llm, NOW);

    expect(out.kind).toBe('blocked');
    expect(calls()).toBe(2);
    if (out.kind === 'blocked') {
      expect(out.reasons).toHaveLength(1);
      expect(out.reasons[0]).toMatch(/LLM output failed schema validation/);
    }
  });

  it('(c) valid JSON that is not a SpecBundle → schema retry also wrong → blocked', async () => {
    const { llm, calls } = makeLlm(['{"hello":"world"}', '{"still":"not a bundle"}']);
    const out = await runPipeline(task('ET-01'), 'single', llm, NOW);

    expect(out.kind).toBe('blocked');
    expect(calls()).toBe(2);
    if (out.kind === 'blocked') {
      expect(out.reasons[0]).toMatch(/LLM output failed schema validation/);
    }
  });

  it('propagates adapter errors instead of fabricating an outcome', async () => {
    const boom: LlmAdapter = {
      complete: async () => {
        throw new Error('provider down');
      },
    };
    await expect(runPipeline(task('ET-01'), 'single', boom, NOW)).rejects.toThrow('provider down');
  });

  // BACK-002 (a): the final bundle gate must reject a schema-valid,
  // lint-clean bundle whose manifest claims a non-draft lifecycle state —
  // generation output is always a fresh draft.
  it('lifecycle: schema-valid, lint-clean output with state "frozen" → blocked with a lifecycle reason', async () => {
    const frozenBundle = et01Bundle();
    frozenBundle.manifest.state = 'frozen';
    const { llm, calls } = makeLlm([JSON.stringify(frozenBundle)]);

    const out = await runPipeline(task('ET-01'), 'single', llm, NOW);

    expect(out.kind).toBe('blocked');
    expect(calls()).toBe(1); // lifecycle violations are terminal, not retried (retry policy is Task 5 scope)
    if (out.kind === 'blocked') {
      expect(out.reasons.join(' ')).toContain('draft');
      expect(out.reasons.join(' ')).toContain("'frozen'");
    }
  });

  // BACK-002 (d): version advance outside the changeset envelope.
  it('lifecycle: output claiming spec_version 7 → blocked (a new spec starts at v1)', async () => {
    const versioned = et01Bundle();
    versioned.manifest.spec_version = 7;
    const { llm } = makeLlm([JSON.stringify(versioned)]);

    const out = await runPipeline(task('ET-01'), 'single', llm, NOW);

    expect(out.kind).toBe('blocked');
    if (out.kind === 'blocked') expect(out.reasons.join(' ')).toContain('spec_version');
  });

  it('lifecycle: output with a mismatched complexity_profile → blocked', async () => {
    // session-service is a lint-clean p-standard bundle; ET-01 requests p-mini.
    const mismatched = JSON.parse(
      readFileSync(join(__dirname, '../../fixtures/good/session-service/bundle.json'), 'utf8'),
    ) as SpecBundle;
    const { llm } = makeLlm([JSON.stringify(mismatched)]);

    const out = await runPipeline(task('ET-01'), 'single', llm, NOW);

    expect(out.kind).toBe('blocked');
    if (out.kind === 'blocked') {
      expect(out.reasons.join(' ')).toContain('profile');
      expect(out.reasons.join(' ')).toContain('p-mini');
      expect(out.reasons.join(' ')).toContain('p-standard');
    }
  });
});

describe('runPipeline — council variant', () => {
  const CLASSIFIER_OK = JSON.stringify({ profile: 'p-mini', must_be_blocked: false });

  it('(d) makes EXACTLY 3 calls and returns the final bundle as spec', async () => {
    const { llm, calls, prompts } = makeLlm([
      CLASSIFIER_OK,
      proposalAJson(),
      JSON.stringify(et01Bundle()),
    ]);
    const out = await runPipeline(task('ET-01'), 'council', llm, NOW);

    expect(out.kind).toBe('spec');
    expect(out.variant).toBe('council');
    expect(calls()).toBe(3);
    // usage sums across the three calls: in 10+20+30, out 5+10+15
    expect(out.usage).toEqual({ in: 60, out: 30, calls: 3 });
    expect(prompts).toHaveLength(3);
    // call 3 (proposeB+judge) receives proposal A's JSON verbatim
    expect(prompts[2]).toContain('sentinel-proposal-a-7q4z');
    // call 2 (independent proposal) does not see A
    expect(prompts[1]).not.toContain('sentinel-proposal-a-7q4z');
  });

  it('garbage FINAL output → schema retry also garbage → blocked after 4 calls', async () => {
    const { llm, calls } = makeLlm([
      CLASSIFIER_OK,
      proposalAJson(),
      'not json, sorry',
      'still not json',
    ]);
    const out = await runPipeline(task('ET-01'), 'council', llm, NOW);

    expect(out.kind).toBe('blocked');
    expect(calls()).toBe(4);
    if (out.kind === 'blocked') {
      expect(out.reasons[0]).toMatch(/LLM output failed schema validation/);
    }
  });

  it('garbage CLASSIFIER output → blocked (fail-closed on step 1, no further calls)', async () => {
    const { llm, calls } = makeLlm(['nope']);
    const out = await runPipeline(task('ET-01'), 'council', llm, NOW);

    expect(out.kind).toBe('blocked');
    expect(calls()).toBe(1);
    if (out.kind === 'blocked') {
      expect(out.reasons[0]).toMatch(/schema validation/);
    }
  });

  it('UNRESOLVED leak in the final council output → blocked with L08 reasons', async () => {
    const { llm } = makeLlm([
      JSON.stringify({ profile: 'p-mini', must_be_blocked: true }),
      proposalAJson(),
      JSON.stringify(et13UnresolvedBundle()),
    ]);
    const out = await runPipeline(task('ET-13'), 'council', llm, NOW);

    expect(out.kind).toBe('blocked');
    if (out.kind === 'blocked') {
      expect(out.reasons.some((r) => r.includes('L08_UNRESOLVED_LEAK'))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// BACK-001 / BACK-008 (audit 11-findings-register): blocking evidence must be
// MONOTONIC at the gate, unresolved material must survive retries, and a
// twice-invalid proposal A must degrade — not silently feed the merger.
// ---------------------------------------------------------------------------

/** pet-clinic bundle carrying an UNRESOLVED decision AND a fixable lint error
 * (tasks + test_files emptied → L02 orphan requirements): the audit's BACK-001
 * scenario-B pre-retry state — L08 material plus another lint error. */
function unresolvedPlusLintDirtyBundle(): SpecBundle {
  const b = et01Bundle();
  b.decisions[0]!.status = 'UNRESOLVED';
  b.manifest.unresolved_count = 1;
  b.tasks = [];
  b.test_files = [];
  return b;
}

/** Same pre-retry shape, but the unresolved material is COUNTER-ONLY (no
 * decision carries status UNRESOLVED — manifest.unresolved_count alone). */
function counterOnlyUnresolvedBundle(): SpecBundle {
  const b = et01Bundle();
  b.manifest.unresolved_count = 2;
  b.tasks = [];
  b.test_files = [];
  return b;
}

/** Retry output that KEEPS DEC-0001 unresolved and ADDS DEC-0002. */
function unresolvedAddedBundle(): SpecBundle {
  const b = et01Bundle();
  const added = structuredClone(b.decisions[0]!);
  added.claim_id = 'DEC-0002';
  added.decision = 'Second open point the retry surfaced.';
  b.decisions.push(added);
  b.decisions[0]!.status = 'UNRESOLVED';
  added.status = 'UNRESOLVED';
  b.manifest.unresolved_count = 2;
  return b;
}

describe('runPipeline — BACK-001 (a): blocking evidence is monotonic at the gate', () => {
  const CLASSIFIER_BLOCKED = JSON.stringify({ profile: 'p-mini', must_be_blocked: true });

  // The audit's exact runtime scenario: classifier blocked, merger clean,
  // generate used to exit 0. The clean final bundle must NOT overrule.
  it('classifier must_be_blocked=true + CLEAN final bundle → blocked, not spec', async () => {
    const { llm, calls } = makeLlm([
      CLASSIFIER_BLOCKED,
      proposalAJson(),
      JSON.stringify(et01Bundle()),
    ]);
    const out = await runPipeline(task('ET-18'), 'council', llm, NOW);

    expect(out.kind).toBe('blocked');
    expect(calls()).toBe(3); // the full council chain still runs; evidence is gathered, then combined
    if (out.kind === 'blocked') {
      expect(out.reasons.some((r) => r.includes('must_be_blocked=true'))).toBe(true);
      expect(out.reasons.some((r) => r.includes('monotonic'))).toBe(true);
    }
  });

  it('classifier blocked + final bundle ALSO blocked (L08) → both pieces of evidence carried', async () => {
    const { llm } = makeLlm([
      CLASSIFIER_BLOCKED,
      proposalAJson(),
      JSON.stringify(et13UnresolvedBundle()),
    ]);
    const out = await runPipeline(task('ET-13'), 'council', llm, NOW);

    expect(out.kind).toBe('blocked');
    if (out.kind === 'blocked') {
      expect(out.reasons.some((r) => r.includes('must_be_blocked=true'))).toBe(true);
      expect(out.reasons.some((r) => r.includes('L08_UNRESOLVED_LEAK'))).toBe(true);
    }
  });

  it('classifier must_be_blocked=false + clean final → spec (monotonicity does not over-block)', async () => {
    const { llm } = makeLlm([
      JSON.stringify({ profile: 'p-mini', must_be_blocked: false }),
      proposalAJson(),
      JSON.stringify(et01Bundle()),
    ]);
    const out = await runPipeline(task('ET-01'), 'council', llm, NOW);
    expect(out.kind).toBe('spec');
  });
});

describe('runPipeline — BACK-001 (b): unresolved IDs survive validation retries', () => {
  it('single: retry DROPS the previously-reported UNRESOLVED decision → blocked, RESOLUTION_MISSING naming DEC-0001', async () => {
    const { llm, calls } = makeLlm([
      JSON.stringify(unresolvedPlusLintDirtyBundle()),
      JSON.stringify(et01Bundle()), // retry is fully clean — the erasure
    ]);
    const out = await runPipeline(task('ET-13'), 'single', llm, NOW);

    expect(out.kind).toBe('blocked'); // was silently accepted before — the audit's scenario B
    expect(calls()).toBe(2);
    if (out.kind === 'blocked') {
      const missing = out.reasons.filter((r) => r.includes('RESOLUTION_MISSING'));
      expect(missing).toHaveLength(1);
      expect(missing[0]).toContain('DEC-0001');
    }
  });

  it('single: retry KEEPS the unresolved ID → still blocked via L08 (legitimate terminal), never RESOLUTION_MISSING', async () => {
    const { llm, calls } = makeLlm([
      JSON.stringify(unresolvedPlusLintDirtyBundle()),
      JSON.stringify(et13UnresolvedBundle()), // DEC-0001 kept, lint fixed
    ]);
    const out = await runPipeline(task('ET-13'), 'single', llm, NOW);

    expect(out.kind).toBe('blocked');
    expect(calls()).toBe(2);
    if (out.kind === 'blocked') {
      expect(out.reasons.some((r) => r.includes('L08_UNRESOLVED_LEAK'))).toBe(true);
      expect(out.reasons.some((r) => r.includes('RESOLUTION_MISSING'))).toBe(false);
    }
  });

  it('single: retry ADDS a new unresolved decision while keeping the old one → allowed (only dropping is fatal)', async () => {
    const { llm, calls } = makeLlm([
      JSON.stringify(unresolvedPlusLintDirtyBundle()),
      JSON.stringify(unresolvedAddedBundle()), // DEC-0001 kept, DEC-0002 added
    ]);
    const out = await runPipeline(task('ET-13'), 'single', llm, NOW);

    expect(out.kind).toBe('blocked');
    expect(calls()).toBe(2);
    if (out.kind === 'blocked') {
      expect(out.reasons.some((r) => r.includes('RESOLUTION_MISSING'))).toBe(false);
      expect(out.reasons.some((r) => r.includes('DEC-0002'))).toBe(true);
    }
  });

  it('single: retry clears COUNTER-ONLY unresolved material (no UNRESOLVED decision left) → RESOLUTION_MISSING on manifest', async () => {
    const { llm, calls } = makeLlm([
      JSON.stringify(counterOnlyUnresolvedBundle()),
      JSON.stringify(et01Bundle()), // retry zeroes unresolved_count — unnamed material erased
    ]);
    const out = await runPipeline(task('ET-13'), 'single', llm, NOW);

    expect(out.kind).toBe('blocked');
    expect(calls()).toBe(2);
    if (out.kind === 'blocked') {
      const missing = out.reasons.filter((r) => r.includes('RESOLUTION_MISSING'));
      expect(missing).toHaveLength(1);
      expect(missing[0]).toContain('manifest');
      expect(missing[0]).toContain('unresolved_count');
    }
  });

  it('council: the final-chain retry dropping unresolved material → blocked, RESOLUTION_MISSING naming DEC-0001', async () => {
    const { llm, calls } = makeLlm([
      JSON.stringify({ profile: 'p-mini', must_be_blocked: false }),
      proposalAJson(),
      JSON.stringify(unresolvedPlusLintDirtyBundle()),
      JSON.stringify(et01Bundle()), // merger retry silently "resolves" everything
    ]);
    const out = await runPipeline(task('ET-13'), 'council', llm, NOW);

    expect(out.kind).toBe('blocked');
    expect(calls()).toBe(4);
    if (out.kind === 'blocked') {
      const missing = out.reasons.filter((r) => r.includes('RESOLUTION_MISSING'));
      expect(missing).toHaveLength(1);
      expect(missing[0]).toContain('DEC-0001');
    }
  });
});

describe('runPipeline — BACK-008: proposal-A retry is revalidated', () => {
  const A_GARBAGE = 'sorry, proposal A is prose, not JSON';
  const A_GARBAGE_RETRY = 'still prose on the retry, still not a bundle';

  it('twice-invalid proposal A → run proceeds DEGRADED: spec carries councilDegraded, merger prompt EXCLUDES the invalid text', async () => {
    const { llm, calls, prompts } = makeLlm([
      JSON.stringify({ profile: 'p-mini', must_be_blocked: false }),
      A_GARBAGE,
      A_GARBAGE_RETRY,
      JSON.stringify(et01Bundle()),
    ]);
    const out = await runPipeline(task('ET-01'), 'council', llm, NOW);

    expect(out.kind).toBe('spec');
    expect(calls()).toBe(4); // classifier + A + A-retry + degraded merger
    if (out.kind === 'spec') {
      expect(out.councilDegraded).toBe(true);
    }
    // the merger call (4th: classifier, A, A-retry, merger) must NOT contain
    // the unvalidated prose (either attempt) ...
    expect(prompts[3]).not.toContain(A_GARBAGE);
    expect(prompts[3]).not.toContain(A_GARBAGE_RETRY);
    // ...and must identify itself as the degraded leg
    expect(prompts[3]).toMatch(/DEGRADED/i);
  });

  it('A fails once, retry VALID → full council: not degraded, retry JSON fed to the merger verbatim', async () => {
    const aRetry = et01Bundle();
    aRetry.manifest.council_run = { run_id: 'sentinel-a-retry-valid-3d7k', config_fingerprint: 'cfg-x' };
    const { llm, calls, prompts } = makeLlm([
      JSON.stringify({ profile: 'p-mini', must_be_blocked: false }),
      'not json for proposal A',
      JSON.stringify(aRetry),
      JSON.stringify(et01Bundle()),
    ]);
    const out = await runPipeline(task('ET-01'), 'council', llm, NOW);

    expect(out.kind).toBe('spec');
    expect(calls()).toBe(4);
    if (out.kind === 'spec') {
      expect(out.councilDegraded).not.toBe(true);
    }
    expect(prompts[3]).toContain('sentinel-a-retry-valid-3d7k');
  });

  it('twice-invalid proposal A whose (blocked) final output fails too → blocked carries councilDegraded', async () => {
    const { llm } = makeLlm([
      JSON.stringify({ profile: 'p-mini', must_be_blocked: false }),
      A_GARBAGE,
      A_GARBAGE_RETRY,
      'final output is also not json',
      'still not json',
    ]);
    const out = await runPipeline(task('ET-01'), 'council', llm, NOW);

    expect(out.kind).toBe('blocked');
    if (out.kind === 'blocked') {
      expect(out.councilDegraded).toBe(true);
      expect(out.reasons[0]).toMatch(/LLM output failed schema validation/);
    }
  });
});

describe('stripJsonFences', () => {
  it('returns plain JSON untouched', () => {
    expect(stripJsonFences('{"a":1}')).toBe('{"a":1}');
  });

  it('unwraps a ```json fence', () => {
    expect(stripJsonFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('unwraps a bare ``` fence', () => {
    expect(stripJsonFences('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('trims surrounding whitespace of unfenced text', () => {
    expect(stripJsonFences('  {"a":1}\n')).toBe('{"a":1}');
  });
});

describe('runPipeline — validation-informed retry (live attempt-4 fix)', () => {
  const unresolvedEt13 = () => {
    const b = et01Bundle(); // shape-compatible base
    b.manifest.unresolved_count = 1;
    b.decisions[0]!.status = 'UNRESOLVED';
    return b;
  };

  it('retries once on SCHEMA failure and accepts the corrected bundle (single, calls=2)', async () => {
    const { llm, calls } = makeLlm(['bu geçerli json değil', JSON.stringify(et01Bundle())]);
    const out = await runPipeline(task('ET-01'), 'single', llm, NOW);
    expect(out.kind).toBe('spec');
    expect(calls()).toBe(2);
  });

  it('does NOT retry when the only lint errors are L08 (legitimate UNRESOLVED block, calls=1)', async () => {
    const { llm, calls } = makeLlm([JSON.stringify(unresolvedEt13())]);
    const out = await runPipeline(task('ET-13'), 'single', llm, NOW);
    expect(out.kind).toBe('blocked');
    expect(calls()).toBe(1);
    if (out.kind === 'blocked') expect(out.reasons.join(' ')).toContain('L08');
  });

  it('retries once on non-L08 lint errors and accepts the fixed bundle (calls=2)', async () => {
    const broken = et01Bundle();
    broken.tasks = []; // guarantees L02 orphan requirements
    broken.test_files = [];
    const { llm, calls } = makeLlm([JSON.stringify(broken), JSON.stringify(et01Bundle())]);
    const out = await runPipeline(task('ET-01'), 'single', llm, NOW);
    expect(out.kind).toBe('spec');
    expect(calls()).toBe(2);
  });

  it('gives up after the schema retry (fail-closed) — blocked, calls=2', async () => {
    const { llm, calls } = makeLlm(['{ "half": true', 'hâlə json değil']);
    const out = await runPipeline(task('ET-01'), 'single', llm, NOW);
    expect(out.kind).toBe('blocked');
    expect(calls()).toBe(2);
    if (out.kind === 'blocked') expect(out.reasons[0]).toContain('schema validation');
  });
});
