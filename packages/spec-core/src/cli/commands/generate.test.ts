import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cmdGenerate, lintRejections } from './generate';
import { runPipeline } from '../../eval/runner';
import type { LlmAdapter, LlmResponse } from '../../eval/llm/adapter';
import { SpecBundleSchema, type SpecBundle } from '../../schemas';
import { compileSpecDir } from '../../compiler/compile';
import { runCli } from '../index';

const NOW = '2026-08-25T12:00:00Z';

// T7: the mock-output bases were the pet-clinic/session-service fixtures;
// fixtures conform to L13/L14 only in T8, and these pipeline tests (gates,
// retries, BACK-008) must stay green — so the bases are inline conforming
// bundles of the same shapes (p-mini / lint-clean p-standard with an NFR
// budget + contract). All derived assertions reference these constants.
const SHA =
  'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

const task = (n: 1 | 2, refs: string[], deps: string[], scope: string, file: string, cases: string[]) => ({
  task_id: `TASK-000${n}`,
  title: `task ${n}`,
  purpose: 'p',
  refs: { requirements: refs, architecture: [], decisions: ['DEC-0001'] },
  depends_on: deps,
  preconditions: ['c'],
  permitted_scope: [scope],
  protected: [],
  interface_changes: [],
  invariants: ['i'],
  instructions: 'do',
  tests: [{ id: `TST-000${n}`, kind: 'unit' as const, file, cases }],
  verification: [{ command: 'node --version', expect: 'exit 0' }],
  acceptance: ['a'],
  rollback: 'r',
  completion_evidence: { required: ['test_summary' as const] },
  risk: { level: 'low' as const, note: '' },
  complexity: 'xs' as const,
});

const baseManifest = (name: string, profile: 'p-mini' | 'p-standard') => ({
  spec_schema: 'lco-spec/1.0',
  spec_version: 1,
  project: { name, mode: 'greenfield' },
  complexity_profile: profile,
  evidence_snapshot: { pack_hash: SHA, collected_at: '2026-08-25T12:00:00Z' },
  state: 'draft',
  council_run: { run_id: 't', config_fingerprint: 't' },
  artifact_hashes: {},
  unresolved_count: 0,
  blocking_count: 0,
  target_runtime: { platform: 'node', stack: 'ts' },
});

const PET_CLINIC = {
  manifest: baseManifest('pet-clinic', 'p-mini'),
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
      status: 'accepted' as const,
    },
  ],
  contracts: [],
  tasks: [task(1, ['REQ-0001'], [], 'src/**', 'a.test.ts', ['REQ-0001: works'])],
  test_files: ['a.test.ts'],
} as unknown as SpecBundle;

/** Lint-clean p-standard bundle — the valid output for a p-standard request
 * (carries the OPS- NFR budget L07 requires above p-mini, a contract, and a
 * second task chained on TASK-0001). */
const SESSION_SERVICE = {
  manifest: baseManifest('session-service', 'p-standard'),
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
    {
      id: 'OPS-0001',
      statement: 'NFR: response p95 under 300ms',
      priority: 'must' as const,
      evidence: ['E-0001'],
      acceptance_refs: ['TST-0002'],
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
      status: 'accepted' as const,
    },
  ],
  contracts: [
    { id: 'CON-0001', kind: 'ts-signature' as const, symbol: 'api(): void', definition: 'd' },
  ],
  tasks: [
    task(1, ['REQ-0001'], [], 'src/one/**', 'a.test.ts', ['REQ-0001: works']),
    task(2, ['OPS-0001'], ['TASK-0001'], 'src/two/**', 'b.test.ts', ['OPS-0001: budget holds']),
  ],
  test_files: ['a.test.ts', 'b.test.ts'],
} as unknown as SpecBundle;

/** The 9 required section files (mirrors what init writes and compile reads). */
const SECTION_FILES = [
  'manifest',
  'intent',
  'glossary',
  'assumptions',
  'evidence',
  'requirements',
  'decisions',
  'contracts',
  'tasks',
] as const;

/** Fixture-derived valid, lint-clean bundle (the PET_CLINIC builder pattern from runner.test.ts). */
function validBundle(): SpecBundle {
  return structuredClone(PET_CLINIC);
}

/** Lint-clean p-standard bundle (the valid output shape for a p-standard request). */
function pStandardBundle(): SpecBundle {
  return structuredClone(SESSION_SERVICE);
}

/** pet-clinic fixture with an unresolved decision leak (et13UnresolvedBundle pattern). */
function unresolvedBundle(): SpecBundle {
  const b = structuredClone(PET_CLINIC);
  b.decisions[0]!.status = 'UNRESOLVED';
  b.manifest.unresolved_count = 1;
  return b;
}

/** Schema-valid but lint-dirty: tasks emptied → every requirement is an L02 orphan. */
function lintDirtyBundle(): SpecBundle {
  const b = structuredClone(PET_CLINIC);
  b.tasks = [];
  b.test_files = [];
  return b;
}

/**
 * Counting scripted LLM (the runner.test.ts makeLlm pattern): records every
 * prompt, counts every call, deterministic per-call usage. Throws on any call
 * beyond the script — generate must never trigger one.
 */
function makeLlm(responses: string[]): { llm: LlmAdapter; calls: () => number; prompts: string[] } {
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

const tmpDirs: string[] = [];

function makeTmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

// ---------------------------------------------------------------------------
// runCli-level output capture (the cli.test.ts spy pattern)
// ---------------------------------------------------------------------------
let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  tmpDirs.length = 0;
});

function stdout(): string {
  return logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
}

function stderr(): string {
  return errorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
}

// ---------------------------------------------------------------------------
// Fake env for runCli-level tests that reach createHttpLlm (http.test.ts pattern)
// ---------------------------------------------------------------------------
const FAKE_ENV = {
  LCO_LLM_BASE_URL: 'https://llm.example.test/v1',
  LCO_LLM_API_KEY: 'test-key-not-a-real-secret',
  LCO_LLM_MODEL: 'test-model-x',
} as const;

/** Stub all LCO_LLM_* vars with fakes (blank when omitted) so real machine env cannot leak in. */
function stubEnv(partial: Partial<typeof FAKE_ENV> = FAKE_ENV): void {
  const keys = [
    ...Object.keys(FAKE_ENV),
    'LCO_LLM_MAX_TOKENS',
    'LCO_LLM_EXTRA_BODY',
  ] as (keyof typeof FAKE_ENV | 'LCO_LLM_MAX_TOKENS' | 'LCO_LLM_EXTRA_BODY')[];
  for (const key of keys) {
    vi.stubEnv(key, partial[key as keyof typeof FAKE_ENV] ?? '');
  }
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    statusText: status === 200 ? 'OK' : 'Internal Server Error',
    headers: { 'content-type': 'application/json' },
  });
}

describe('cmdGenerate — spec outcome', () => {
  it('writes the 9 section files, returns 0, and the summary mentions name/profile/counts/variant/usage', async () => {
    const dir = makeTmp('spec-core-generate-ok-');
    const { llm } = makeLlm([JSON.stringify(validBundle())]);

    const result = await cmdGenerate(dir, {
      intent: 'build a small pet clinic scheduler',
      variant: 'single',
      profile: 'p-mini',
      nowIso: NOW,
      llm,
    });

    expect(result.code).toBe(0);

    // 9 section files, no test_files.json, no legacy.json.
    const specDir = join(dir, 'spec');
    const written = Object.keys(Object.fromEntries(SECTION_FILES.map((n) => [`${n}.json`, 0])))
      .filter((f) => existsSync(join(specDir, f)));
    expect(written).toHaveLength(9);
    expect(existsSync(join(specDir, 'test_files.json'))).toBe(false);

    const manifest = JSON.parse(readFileSync(join(specDir, 'manifest.json'), 'utf8'));
    expect(manifest.state).toBe('draft');
    expect(manifest.project.name).toBe('pet-clinic');

    const tasks = JSON.parse(readFileSync(join(specDir, 'tasks.json'), 'utf8'));
    expect(tasks).toEqual(PET_CLINIC.tasks);

    // Summary: project name, complexity_profile, REQ/TASK counts, variant, calls, tokens, next step.
    expect(result.output).toContain('pet-clinic');
    expect(result.output).toContain('p-mini');
    expect(result.output).toContain(`${PET_CLINIC.requirements.length} REQ`);
    expect(result.output).toContain(`${PET_CLINIC.tasks.length} TASK`);
    expect(result.output).toContain('single');
    expect(result.output).toContain('1');
    expect(result.output).toContain('10 in / 5 out tokens');
    // PERF-001: prompt cost is MEASURED, not estimated — the usage line names
    // the exact UTF-8 prompt bytes the run sent (schema embed included).
    expect(result.output).toMatch(/\d+ prompt bytes/);
    expect(result.output).toContain('state: draft');
    expect(result.output).toContain('lco lint');

    // The written tree is a real spec: it compiles as-is.
    const compiled = await compileSpecDir(dir);
    expect(compiled.ok).toBe(true);
  });

  it('council variant makes exactly 3 complete() calls', async () => {
    const dir = makeTmp('spec-core-generate-council-');
    const { llm, calls } = makeLlm([
      JSON.stringify({ profile: 'p-mini', must_be_blocked: false }),
      JSON.stringify(validBundle()),
      JSON.stringify(validBundle()),
    ]);

    const result = await cmdGenerate(dir, {
      intent: 'build a small pet clinic scheduler',
      variant: 'council',
      profile: 'p-mini',
      nowIso: NOW,
      llm,
    });

    expect(result.code).toBe(0);
    expect(result.output).toContain('council');
    expect(calls()).toBe(3);
    expect(existsSync(join(dir, 'spec', 'manifest.json'))).toBe(true);
  });

  // BACK-008: a twice-invalid proposal A degrades the council leg; the final
  // bundle is still fully gated (schema+lint+lifecycle), so generate WRITES it —
  // but the summary must say the independent-proposal leg collapsed.
  it('degraded council (proposal A invalid twice) → code 0, spec written, summary flags DEGRADED', async () => {
    const dir = makeTmp('spec-core-generate-degraded-');
    const { llm, calls, prompts } = makeLlm([
      JSON.stringify({ profile: 'p-mini', must_be_blocked: false }),
      'proposal A prose, not json',
      'proposal A retry, still not json',
      JSON.stringify(validBundle()),
    ]);

    const result = await cmdGenerate(dir, {
      intent: 'build a small pet clinic scheduler',
      variant: 'council',
      profile: 'p-mini',
      nowIso: NOW,
      llm,
    });

    expect(result.code).toBe(0);
    expect(calls()).toBe(4);
    expect(existsSync(join(dir, 'spec', 'manifest.json'))).toBe(true);
    expect(result.output).toContain('DEGRADED');
    expect(result.output).toContain('proposal A');
    // the merger prompt (4th call) carried none of the unvalidated prose
    expect(prompts[3]).not.toContain('proposal A prose, not json');
  });
});

describe('cmdGenerate — blocked outcome', () => {
  it('UNRESOLVED leak → code 1, reasons in output, and dir/spec ABSENT', async () => {
    const dir = makeTmp('spec-core-generate-blocked-');
    const { llm } = makeLlm([JSON.stringify(unresolvedBundle())]);

    const result = await cmdGenerate(dir, {
      intent: 'stock tool, database undecided',
      variant: 'single',
      profile: 'p-mini',
      nowIso: NOW,
      llm,
    });

    expect(result.code).toBe(1);
    expect(existsSync(join(dir, 'spec'))).toBe(false);
    expect(result.output).toContain('blocked');
    expect(result.output).toContain('L08_UNRESOLVED_LEAK');
    expect(result.output).toContain('DEC-0001');
  });
});

describe('cmdGenerate — lifecycle output gate (BACK-002)', () => {
  /** pet-clinic with a single manifest field overridden. */
  function withManifest(override: Partial<SpecBundle['manifest']>): SpecBundle {
    const b = validBundle();
    Object.assign(b.manifest, override);
    return b;
  }

  // Audit BACK-002 (a): a mock returning state:'frozen' used to be written to
  // disk with exit 0 (and verify then failed every section). Generate must
  // reject any non-draft generation output — freeze is a separate, later step.
  it("state:'frozen' output → code 1, NOTHING written, message names the illegal state", async () => {
    const dir = makeTmp('spec-core-generate-lifecycle-');
    const { llm } = makeLlm([JSON.stringify(withManifest({ state: 'frozen' }))]);

    const result = await cmdGenerate(dir, {
      intent: 'a small pet clinic scheduler',
      variant: 'single',
      profile: 'p-mini',
      nowIso: NOW,
      llm,
    });

    expect(result.code).toBe(1);
    expect(existsSync(join(dir, 'spec'))).toBe(false);
    expect(result.output).toContain('draft');
    expect(result.output).toContain("'frozen'");
  });

  it("state:'blocked' output → code 1 even with zero counters (the gate is the state itself)", async () => {
    const dir = makeTmp('spec-core-generate-lifecycle-blocked-');
    const { llm } = makeLlm([JSON.stringify(withManifest({ state: 'blocked' }))]);

    const result = await cmdGenerate(dir, {
      intent: 'a small pet clinic scheduler',
      variant: 'single',
      profile: 'p-mini',
      nowIso: NOW,
      llm,
    });

    expect(result.code).toBe(1);
    expect(existsSync(join(dir, 'spec'))).toBe(false);
  });

  // Audit BACK-002 (d): version bumps outside the change envelope.
  it('spec_version:7 output → code 1 (a new spec starts at v1; versions advance only via lco change)', async () => {
    const dir = makeTmp('spec-core-generate-lifecycle-v7-');
    const { llm } = makeLlm([JSON.stringify(withManifest({ spec_version: 7 }))]);

    const result = await cmdGenerate(dir, {
      intent: 'a small pet clinic scheduler',
      variant: 'single',
      profile: 'p-mini',
      nowIso: NOW,
      llm,
    });

    expect(result.code).toBe(1);
    expect(existsSync(join(dir, 'spec'))).toBe(false);
    expect(result.output).toContain('spec_version');
  });

  it('profile mismatch (p-mini bundle, p-standard requested) → code 1, nothing written', async () => {
    const dir = makeTmp('spec-core-generate-lifecycle-profile-');
    const { llm } = makeLlm([JSON.stringify(validBundle())]); // p-mini bundle

    const result = await cmdGenerate(dir, {
      intent: 'a bigger clinic platform',
      variant: 'single',
      profile: 'p-standard',
      nowIso: NOW,
      llm,
    });

    expect(result.code).toBe(1);
    expect(existsSync(join(dir, 'spec'))).toBe(false);
    expect(result.output).toContain('p-standard');
    expect(result.output).toContain('p-mini');
  });
});

describe('cmdGenerate — no-clobber', () => {
  it('existing dir/spec → code 2, contents untouched, LLM never called (checked before llm resolution)', async () => {
    const dir = makeTmp('spec-core-generate-clobber-');
    const spec = join(dir, 'spec');
    mkdirSync(spec);
    writeFileSync(join(spec, 'manifest.json'), 'sentinel-content', 'utf8');

    const { llm, calls } = makeLlm([JSON.stringify(validBundle())]);
    const result = await cmdGenerate(dir, {
      intent: 'anything',
      variant: 'single',
      profile: 'p-mini',
      nowIso: NOW,
      llm,
    });

    expect(result.code).toBe(2);
    expect(result.output).toContain('refusing to overwrite');
    expect(calls()).toBe(0);
    expect(readFileSync(join(spec, 'manifest.json'), 'utf8')).toBe('sentinel-content');

    // Ordering pin: the refusal wins even with NO llm and NO env (check #1 precedes llm resolution #2).
    const dir2 = makeTmp('spec-core-generate-clobber2-');
    mkdirSync(join(dir2, 'spec'));
    const refused = await cmdGenerate(dir2, {
      intent: 'anything',
      variant: 'single',
      profile: 'p-mini',
      nowIso: NOW,
    });
    expect(refused.code).toBe(2);
  });
});

describe('cmdGenerate — fail-closed LLM env', () => {
  it('no llm option + blank LCO_LLM_* env → cmdGenerate rejects with the createHttpLlm error', async () => {
    stubEnv({}); // all blank
    const dir = makeTmp('spec-core-generate-env-');

    await expect(
      cmdGenerate(dir, { intent: 'x', variant: 'single', profile: 'p-mini', nowIso: NOW }),
    ).rejects.toThrow('live mode requires LCO_LLM_* env vars');
    expect(existsSync(join(dir, 'spec'))).toBe(false);
  });

  it('runCli maps that throw to exit 2 with a clear env message on stderr', async () => {
    stubEnv({}); // all blank
    const dir = makeTmp('spec-core-generate-envcli-');

    await expect(runCli(['generate', dir, '--intent', 'x'])).resolves.toBe(2);
    expect(stderr()).toContain('generate failed');
    expect(stderr()).toContain('live mode requires LCO_LLM_* env vars');
    expect(existsSync(join(dir, 'spec'))).toBe(false);
  });
});

describe('runCli generate — argument handling', () => {
  it('--intent-file content becomes the pipeline prompt intent (asserted via captured request body)', async () => {
    stubEnv();
    const dir = makeTmp('spec-core-generate-intentfile-');
    const intentPath = join(dir, 'intent.txt');
    writeFileSync(intentPath, 'INTENT-FILE-SENTINEL a small wiki engine with plain-text pages\n');

    const bodies: string[] = [];
    vi.stubGlobal(
      'fetch',
      async (_url: unknown, init?: { body?: string }): Promise<Response> => {
        bodies.push(String(init?.body));
        return jsonResponse({
          choices: [{ message: { content: JSON.stringify(pStandardBundle()) } }],
          usage: { prompt_tokens: 11, completion_tokens: 7 },
        });
      },
    );

    await expect(
      runCli(['generate', dir, '--intent-file', intentPath, '--variant', 'single']),
    ).resolves.toBe(0);

    expect(bodies).toHaveLength(1);
    const sent = JSON.parse(bodies[0]!) as { messages: { content: string }[] };
    expect(sent.messages[0]!.content).toContain('INTENT-FILE-SENTINEL');
    expect(existsSync(join(dir, 'spec', 'manifest.json'))).toBe(true);
    expect(stdout()).toContain('11 in / 7 out tokens');
  });

  it('default variant is single (1 LLM call) and default profile is p-standard (UX-001 ruling)', async () => {
    stubEnv();
    const dir = makeTmp('spec-core-generate-defaults-');

    const bodies: string[] = [];
    vi.stubGlobal(
      'fetch',
      async (_url: unknown, init?: { body?: string }): Promise<Response> => {
        bodies.push(String(init?.body));
        return jsonResponse({
          choices: [{ message: { content: JSON.stringify(pStandardBundle()) } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        });
      },
    );

    await expect(runCli(['generate', dir, '--intent', 'a scheduler tool'])).resolves.toBe(0);

    // single default: exactly ONE paid call; council is explicit (--variant council)
    expect(bodies).toHaveLength(1);
    const firstPrompt = (JSON.parse(bodies[0]!) as { messages: { content: string }[] })
      .messages[0]!.content;
    expect(firstPrompt).toContain('EXPECTED COMPLEXITY PROFILE: p-standard');
    expect(stdout()).toContain('single');
  });

  it('--intent and --intent-file together → exit 2', async () => {
    const dir = makeTmp('spec-core-generate-both-');
    const intentPath = join(dir, 'intent.txt');
    writeFileSync(intentPath, 'x\n');

    await expect(
      runCli(['generate', dir, '--intent', 'a', '--intent-file', intentPath]),
    ).resolves.toBe(2);
    expect(stderr()).toContain('--intent');
    expect(existsSync(join(dir, 'spec'))).toBe(false);
  });

  it('neither --intent nor --intent-file → exit 2', async () => {
    const dir = makeTmp('spec-core-generate-neither-');
    await expect(runCli(['generate', dir])).resolves.toBe(2);
    expect(stderr()).toContain('missing');
    expect(existsSync(join(dir, 'spec'))).toBe(false);
  });

  it('unreadable --intent-file → exit 2, nothing written', async () => {
    const dir = makeTmp('spec-core-generate-badfile-');
    const missing = join(dir, 'no-such-file.txt');

    await expect(runCli(['generate', dir, '--intent-file', missing])).resolves.toBe(2);
    expect(stderr()).toContain('cannot read');
    expect(existsSync(join(dir, 'spec'))).toBe(false);
  });

  it('invalid --variant value → exit 2 (usage)', async () => {
    const dir = makeTmp('spec-core-generate-badvariant-');
    await expect(runCli(['generate', dir, '--intent', 'x', '--variant', 'committee'])).resolves.toBe(
      2,
    );
    expect(stderr()).toContain('single or council');
  });

  it('invalid --profile value → exit 2 (usage)', async () => {
    const dir = makeTmp('spec-core-generate-badprofile-');
    await expect(runCli(['generate', dir, '--intent', 'x', '--profile', 'p-huge'])).resolves.toBe(2);
    expect(stderr()).toContain('p-mini or p-standard');
  });
});

describe('lintRejections — defensive lint re-check guard', () => {
  // DEFENSIVE BRANCH DOCUMENTATION: runPipeline only returns kind 'spec' after
  // its own lint gate (schema retry + non-L08 lint retry), so a 'spec' outcome
  // with lint errors is UNREACHABLE through the runner today. The guard exists
  // as defense in depth (future runner changes must not silently write a
  // lint-dirty spec/), so it is covered by this direct unit on the guard.
  it('flags a schema-valid but lint-dirty bundle (tasks emptied → L02 orphans)', () => {
    const dirty = lintDirtyBundle();
    expect(SpecBundleSchema.safeParse(dirty).success).toBe(true); // sanity: schema-valid

    const reasons = lintRejections(dirty);
    expect(reasons).not.toBeNull();
    expect(reasons!.some((r) => r.includes('L02_ORPHAN_REQUIREMENT'))).toBe(true);
  });

  it('returns null for a lint-clean bundle', () => {
    expect(lintRejections(validBundle())).toBeNull();
  });
});

describe('runPipeline — widened task parameter (compatibility edge)', () => {
  it('accepts a structural Pick<EvalTask, "intent" | "profile"> — no EvalTask-only fields needed', async () => {
    const { llm } = makeLlm([JSON.stringify(validBundle())]);
    const out = await runPipeline(
      { intent: 'inline intent object, not an EvalTask', profile: 'p-mini' },
      'single',
      llm,
      NOW,
    );
    expect(out.kind).toBe('spec');
  });
});

// ---------------------------------------------------------------------------
// UX-004 (T11): intent preflight — bad invocation costs NOTHING
// ---------------------------------------------------------------------------

describe('runCli generate — intent preflight (UX-004)', () => {
  function fetchSpy(): { calls: () => number } {
    let n = 0;
    vi.stubGlobal(
      'fetch',
      async (): Promise<Response> => {
        n += 1;
        return jsonResponse({ choices: [{ message: { content: 'x' } }] });
      },
    );
    return { calls: () => n };
  }

  it('whitespace-only --intent → exit 2 with an actionable message, ZERO adapter HTTP calls', async () => {
    stubEnv(); // live env fully faked — had an adapter been built, fetch would count
    const dir = makeTmp('spec-core-generate-wsintent-');
    const fetchMock = fetchSpy();

    await expect(runCli(['generate', dir, '--intent', '   '])).resolves.toBe(2);
    expect(stderr()).toContain('blank');
    expect(fetchMock.calls()).toBe(0);
    expect(existsSync(join(dir, 'spec'))).toBe(false);
  });

  it('oversized --intent (>10000 chars) → exit 2 pointing at --intent-file, ZERO adapter calls', async () => {
    stubEnv();
    const dir = makeTmp('spec-core-generate-bigintent-');
    const fetchMock = fetchSpy();

    await expect(
      runCli(['generate', dir, '--intent', 'x'.repeat(10_001)]),
    ).resolves.toBe(2);
    expect(stderr()).toContain('--intent-file');
    expect(fetchMock.calls()).toBe(0);
    expect(existsSync(join(dir, 'spec'))).toBe(false);
  });

  it('--intent is normalized (trimmed) before reaching the pipeline — parity with --intent-file', async () => {
    stubEnv();
    const dir = makeTmp('spec-core-generate-trim-');
    const bodies: string[] = [];
    vi.stubGlobal(
      'fetch',
      async (_url: unknown, init?: { body?: string }): Promise<Response> => {
        bodies.push(String(init?.body));
        return jsonResponse({
          choices: [{ message: { content: JSON.stringify(pStandardBundle()) } }],
          usage: { prompt_tokens: 3, completion_tokens: 2 },
        });
      },
    );

    await expect(
      runCli(['generate', dir, '--intent', '  padded intent sentinel  ']),
    ).resolves.toBe(0);
    const sent = (JSON.parse(bodies[0]!) as { messages: { content: string }[] })
      .messages[0]!.content;
    expect(sent).toContain('padded intent sentinel');
    expect(sent).not.toContain('  padded intent sentinel  '); // raw untrimmed never reaches the LLM
  });

  it('cmdGenerate preflights too (library/MCP edge): blank intent throws BEFORE adapter construction', async () => {
    stubEnv({}); // blank env: createHttpLlm would throw the env error if reached
    const dir = makeTmp('spec-core-generate-libpreflight-');
    await expect(
      cmdGenerate(dir, { intent: '   \t ', variant: 'single', profile: 'p-mini', nowIso: NOW }),
    ).rejects.toThrow(/intent/);
    await expect(
      cmdGenerate(dir, { intent: '   \t ', variant: 'single', profile: 'p-mini', nowIso: NOW }),
    ).rejects.not.toThrow(/live mode requires/); // the intent refusal wins — adapter never constructed
    expect(existsSync(join(dir, 'spec'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// UX-001 (T11): run budgets — attempts / tokens / wall, CLI flags + env
// ---------------------------------------------------------------------------

describe('cmdGenerate — run budgets (UX-001)', () => {
  const classifier = JSON.stringify({ profile: 'p-mini', must_be_blocked: false });

  it('opts.budget.maxAttempts=1 on council → BudgetExceededError aborts, NOTHING written', async () => {
    const dir = makeTmp('spec-core-generate-budget-');
    const { llm, calls } = makeLlm([classifier, JSON.stringify(validBundle())]);

    await expect(
      cmdGenerate(dir, {
        intent: 'a small pet clinic scheduler',
        variant: 'council',
        profile: 'p-mini',
        nowIso: NOW,
        llm,
        budget: { maxAttempts: 1 },
      }),
    ).rejects.toThrow(/BUDGET_EXCEEDED \(attempts\)/);
    expect(calls()).toBe(1); // only the classifier completed before the abort
    expect(existsSync(join(dir, 'spec'))).toBe(false);
  });

  it('wall budget trips between calls via the injected clock', async () => {
    const dir = makeTmp('spec-core-generate-wall-');
    let fakeNow = 0;
    let n = 0;
    // each completion "takes" 2s of wall time; after the first call the 1s
    // budget is blown and the runner's next checkWall aborts the run.
    const llm: LlmAdapter = {
      async complete(): Promise<LlmResponse> {
        n += 1;
        fakeNow += 2_000;
        return {
          text: n === 1 ? classifier : JSON.stringify(validBundle()),
          usage: { in_tokens: 10, out_tokens: 5 },
        };
      },
    };

    await expect(
      cmdGenerate(dir, {
        intent: 'a small pet clinic scheduler',
        variant: 'council',
        profile: 'p-mini',
        nowIso: NOW,
        llm,
        budget: { maxWallMs: 1_000 },
        nowMs: () => fakeNow,
      }),
    ).rejects.toThrow(/BUDGET_EXCEEDED \(wall\)/);
    expect(n).toBe(1);
    expect(existsSync(join(dir, 'spec'))).toBe(false);
  });

  it('a wall budget without an injected clock is refused (cores never read the clock)', async () => {
    const dir = makeTmp('spec-core-generate-nowallclock-');
    const { llm } = makeLlm([classifier]);
    await expect(
      cmdGenerate(dir, {
        intent: 'x',
        variant: 'council',
        profile: 'p-mini',
        nowIso: NOW,
        llm,
        budget: { maxWallMs: 1_000 },
      }),
    ).rejects.toThrow(/nowMs/);
  });

  it('runCli maps the abort to exit 2 with the structured BUDGET_EXCEEDED message', async () => {
    stubEnv();
    const dir = makeTmp('spec-core-generate-budgetcli-');
    vi.stubGlobal(
      'fetch',
      async (): Promise<Response> =>
        jsonResponse({
          choices: [{ message: { content: classifier } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
    );

    // council with an attempts cap of 1: the classifier call consumes it,
    // proposal A's charge aborts the run.
    await expect(
      runCli(['generate', dir, '--intent', 'x', '--variant', 'council', '--max-attempts', '1']),
    ).resolves.toBe(2);
    expect(stderr()).toContain('BUDGET_EXCEEDED (attempts)');
    expect(existsSync(join(dir, 'spec'))).toBe(false);
  });

  it('LCO_GENERATE_MAX_ATTEMPTS env override trips the same abort (flag-free path)', async () => {
    stubEnv();
    vi.stubEnv('LCO_GENERATE_MAX_ATTEMPTS', '1');
    const dir = makeTmp('spec-core-generate-budgetenv-');
    vi.stubGlobal(
      'fetch',
      async (): Promise<Response> =>
        jsonResponse({
          choices: [{ message: { content: classifier } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
    );

    await expect(
      runCli(['generate', dir, '--intent', 'x', '--variant', 'council']),
    ).resolves.toBe(2);
    expect(stderr()).toContain('BUDGET_EXCEEDED (attempts)');
  });

  it('invalid --max-attempts / env values are usage errors (exit 2, fail-closed)', async () => {
    const dir = makeTmp('spec-core-generate-badbudget-');
    await expect(
      runCli(['generate', dir, '--intent', 'x', '--max-attempts', '0']),
    ).resolves.toBe(2);
    expect(stderr()).toContain('--max-attempts');

    stubEnv();
    vi.stubEnv('LCO_GENERATE_MAX_WALL_MS', 'abc');
    await expect(runCli(['generate', dir, '--intent', 'x'])).resolves.toBe(2);
    expect(stderr()).toContain('LCO_GENERATE_MAX_WALL_MS');
  });
});

// ---------------------------------------------------------------------------
// UX-003 (T11): unknown usage is reported as unknown — never as zero
// ---------------------------------------------------------------------------

describe('cmdGenerate — unknown usage summaries (UX-003)', () => {
  it('provider reports no usage → spec summary says unknown tokens (not 0 in / 0 out)', async () => {
    const dir = makeTmp('spec-core-generate-unknown-');
    const llm: LlmAdapter = {
      async complete(): Promise<LlmResponse> {
        return { text: JSON.stringify(validBundle()) }; // no usage field
      },
    };

    const result = await cmdGenerate(dir, {
      intent: 'a small pet clinic scheduler',
      variant: 'single',
      profile: 'p-mini',
      nowIso: NOW,
      llm,
    });

    expect(result.code).toBe(0);
    expect(result.output).toContain('unknown');
    expect(result.output).not.toMatch(/\b0 in \/ 0 out\b/);
    expect(result.output).toContain('1 LLM call'); // call/attempt tally still shown
  });

  it('blocked summary with unknown usage also says unknown', async () => {
    const dir = makeTmp('spec-core-generate-unknownblocked-');
    const llm: LlmAdapter = {
      async complete(): Promise<LlmResponse> {
        return { text: JSON.stringify(unresolvedBundle()) }; // no usage
      },
    };

    const result = await cmdGenerate(dir, {
      intent: 'stock tool, database undecided',
      variant: 'single',
      profile: 'p-mini',
      nowIso: NOW,
      llm,
    });

    expect(result.code).toBe(1);
    expect(result.output).toContain('unknown');
    expect(result.output).not.toMatch(/\b0 in \/ 0 out\b/);
  });

  it('known usage still renders the numeric in/out tally with attempts', async () => {
    const dir = makeTmp('spec-core-generate-known-');
    const { llm } = makeLlm([JSON.stringify(validBundle())]);

    const result = await cmdGenerate(dir, {
      intent: 'a small pet clinic scheduler',
      variant: 'single',
      profile: 'p-mini',
      nowIso: NOW,
      llm,
    });

    expect(result.code).toBe(0);
    expect(result.output).toContain('10 in / 5 out tokens');
    expect(result.output).toContain('1 HTTP attempt'); // attempts distinguished from calls
  });
});

// ---------------------------------------------------------------------------
// T11 review fix: --intent-file is the documented escape hatch for long
// intents — trim + blank-only rejection applies, but NOT the inline 10k cap.
// ---------------------------------------------------------------------------

describe('runCli generate — intent-file length design (review fix)', () => {
  /** A valid intent longer than the inline cap: the escape hatch must accept it. */
  function longIntentFile(dir: string, chars: number): string {
    const path = join(dir, `intent-${chars}.txt`);
    const filler = 'with plain-text pages and strict evidence rules. ';
    const head = 'build a small wiki engine INTENT-FILE-LONG-SENTINEL ';
    const text = head + filler.repeat(Math.ceil((chars - head.length) / filler.length));
    writeFileSync(path, text.slice(0, chars), 'utf8');
    return path;
  }

  it('a >10k-char --intent-file with valid content is ACCEPTED (documented escape hatch)', async () => {
    stubEnv();
    const dir = makeTmp('spec-core-generate-longfile-');
    const intentPath = longIntentFile(dir, 10_500);

    const bodies: string[] = [];
    vi.stubGlobal(
      'fetch',
      async (_url: unknown, init?: { body?: string }): Promise<Response> => {
        bodies.push(String(init?.body));
        return jsonResponse({
          choices: [{ message: { content: JSON.stringify(pStandardBundle()) } }],
          usage: { prompt_tokens: 11, completion_tokens: 7 },
        });
      },
    );

    await expect(
      runCli(['generate', dir, '--intent-file', intentPath, '--variant', 'single']),
    ).resolves.toBe(0);
    expect(bodies).toHaveLength(1);
    const sent = (JSON.parse(bodies[0]!) as { messages: { content: string }[] })
      .messages[0]!.content;
    expect(sent).toContain('INTENT-FILE-LONG-SENTINEL'); // the long intent reached the pipeline
    expect(existsSync(join(dir, 'spec', 'manifest.json'))).toBe(true);
  });

  it('whitespace-only --intent-file → exit 2, ZERO adapter calls (parity with inline)', async () => {
    stubEnv();
    const dir = makeTmp('spec-core-generate-wsfile-');
    const intentPath = join(dir, 'blank.txt');
    writeFileSync(intentPath, '   \n\t  \n', 'utf8');
    let fetches = 0;
    vi.stubGlobal(
      'fetch',
      async (): Promise<Response> => {
        fetches += 1;
        return jsonResponse({ choices: [{ message: { content: 'x' } }] });
      },
    );

    await expect(runCli(['generate', dir, '--intent-file', intentPath])).resolves.toBe(2);
    expect(stderr()).toContain('blank');
    expect(fetches).toBe(0);
    expect(existsSync(join(dir, 'spec'))).toBe(false);
  });

  it('a --intent-file over the 1,000,000-char sanity ceiling → exit 2 naming the ceiling', async () => {
    stubEnv();
    const dir = makeTmp('spec-core-generate-hugefile-');
    const intentPath = longIntentFile(dir, 1_000_001);

    await expect(runCli(['generate', dir, '--intent-file', intentPath])).resolves.toBe(2);
    expect(stderr()).toContain('sanity ceiling');
    expect(stderr()).toContain('1000000');
    expect(existsSync(join(dir, 'spec'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// named LLM profiles (--llm-profile, §7) — heterogeneous councils end-to-end
// ---------------------------------------------------------------------------

import { parseLlmConfig, resolveProfile } from '../../config/llm-config';

const PROFILE_CONFIG = JSON.stringify({
  llm: {
    providers: {
      openrouter: { type: 'openrouter', apiKeyEnv: 'OPENROUTER_API_KEY' },
      routellm: { type: 'routellm', apiKeyEnv: 'ABACUS_ROUTELLM_API_KEY' },
    },
    profiles: {
      'frontier-heterogeneous': {
        variant: 'council',
        topology: 'decomposed',
        routingMode: 'evaluation',
        roles: {
          classifier: { provider: 'openrouter', model: 'google/gemini-3.7-flash' },
          proposal_a: { provider: 'openrouter', model: 'anthropic/claude-opus-5' },
          proposal_b: { provider: 'openrouter', model: 'x-ai/grok-4.6' },
          judge: { provider: 'routellm', model: 'gpt-5.6-sol' },
        },
      },
      'glm-single-x': {
        variant: 'single',
        roles: { single: { provider: 'routellm', model: 'glm-5.3' } },
      },
    },
  },
});

describe('cmdGenerate — named llm profile', () => {
  it('routes each role to its configured gateway/model (mixed-gateway council)', async () => {
    const dir = makeTmp('spec-core-generate-profile-');
    writeFileSync(join(dir, 'lco.config.json'), PROFILE_CONFIG);
    vi.stubEnv('OPENROUTER_API_KEY', 'or-key');
    vi.stubEnv('ABACUS_ROUTELLM_API_KEY', 'rl-key');

    const seenModels: string[] = [];
    const seenUrls: string[] = [];
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const body = JSON.parse((init?.body ?? '{}') as string) as { model: string };
      seenModels.push(body.model);
      seenUrls.push(String(url));
      if (body.model === 'google/gemini-3.7-flash') {
        return jsonResponse({ choices: [{ message: { content: JSON.stringify({ profile: 'p-mini', must_be_blocked: false }) } }] });
      }
      // p-mini valid bundle for the proposal/judge legs (matches profile p-mini)
      return jsonResponse({ choices: [{ message: { content: JSON.stringify(validBundle()) } }] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const parsed = parseLlmConfig(PROFILE_CONFIG);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const resolved = resolveProfile(parsed.config, 'frontier-heterogeneous');
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    const result = await cmdGenerate(dir, {
      intent: 'url shortener cli with sqlite and click counting',
      variant: 'council',
      profile: 'p-mini',
      nowIso: NOW,
      nowMs: () => 0,
      llmProfile: { name: 'frontier-heterogeneous', resolved: resolved.resolved },
    });

    expect(result.code).toBe(0);
    // heterogeneous routing actually happened: each role's model + its gateway endpoint
    expect(seenModels.sort()).toEqual([
      'anthropic/claude-opus-5',
      'google/gemini-3.7-flash',
      'gpt-5.6-sol',
      'x-ai/grok-4.6',
    ].sort());
    expect(seenUrls.some((u) => u.startsWith('https://routellm.abacus.ai/v1'))).toBe(true);
    expect(seenUrls.every((u) => u.startsWith('https://openrouter.ai/api/v1') || u.startsWith('https://routellm.abacus.ai/v1'))).toBe(true);
    // summary carries the per-role accounting + protocol + profile identity
    expect(result.output).toContain('role accounting:');
    expect(result.output).toContain('classifier [openrouter/google/gemini-3.7-flash]');
    expect(result.output).toContain('judge [routellm/gpt-5.6-sol]');
    expect(result.output).toContain('prompt protocol: lco-prompts/v4');
    expect(result.output).toContain('llm profile frontier-heterogeneous, topology decomposed, routing evaluation');
  });

  it('profile/variant disagreement fails closed with both named', async () => {
    const dir = makeTmp('spec-core-generate-profile-mismatch-');
    const parsed = parseLlmConfig(PROFILE_CONFIG);
    if (!parsed.ok) return;
    const resolved = resolveProfile(parsed.config, 'glm-single-x');
    if (!resolved.ok) return;
    await expect(
      cmdGenerate(dir, {
        intent: 'x',
        variant: 'council',
        profile: 'p-mini',
        nowIso: NOW,
        llmProfile: { name: 'glm-single-x', resolved: resolved.resolved },
      }),
    ).rejects.toThrow(/glm-single-x.*variant 'single'.*--variant council/);
  });

  it('missing key env → fail-closed error naming the env var (never a default key)', async () => {
    const dir = makeTmp('spec-core-generate-profile-nokey-');
    vi.stubEnv('OPENROUTER_API_KEY', '');
    vi.stubEnv('ABACUS_ROUTELLM_API_KEY', '');
    const parsed = parseLlmConfig(PROFILE_CONFIG);
    if (!parsed.ok) return;
    const resolved = resolveProfile(parsed.config, 'frontier-heterogeneous');
    if (!resolved.ok) return;
    await expect(
      cmdGenerate(dir, {
        intent: 'x',
        variant: 'council',
        profile: 'p-mini',
        nowIso: NOW,
        llmProfile: { name: 'frontier-heterogeneous', resolved: resolved.resolved },
      }),
    ).rejects.toThrow(/OPENROUTER_API_KEY/);
    expect(existsSync(join(dir, 'spec'))).toBe(false);
  });
});

describe('runCli generate — --llm-profile boundary', () => {
  it('flag parses and a missing config file is a clean exit 2 before any call', async () => {
    const dir = makeTmp('spec-core-generate-nocfg-');
    const code = await runCli(['generate', dir, '--intent', 'x', '--variant', 'council', '--llm-profile', 'nope']);
    expect(code).toBe(2);
    expect(stderr()).toMatch(/lco\.config\.json/);
    expect(existsSync(join(dir, 'spec'))).toBe(false);
  });

  it('a corrupt config is a clean exit 2 naming the problem', async () => {
    const dir = makeTmp('spec-core-generate-badcfg-');
    writeFileSync(join(dir, 'lco.config.json'), '{oops');
    const code = await runCli(['generate', dir, '--intent', 'x', '--llm-profile', 'p']);
    expect(code).toBe(2);
    expect(stderr()).toMatch(/not valid JSON/);
  });

  it('invalid profile-name charset is a parse-time usage error', async () => {
    expect((await runCli(['generate', 'd', '--intent', 'x', '--llm-profile', 'bad name!']))) as never;
  });
});

describe('cmdGenerate — clarification rendering (§10/§11/§25)', () => {
  it('blocked-by-unresolved renders QUESTIONS TO RESOLVE before reasons; nothing written', async () => {
    const dir = makeTmp('spec-core-generate-clarify-');
    const unresolved = structuredClone(PET_CLINIC);
    unresolved.manifest.project = { name: 'stock-tool', mode: 'greenfield' };
    unresolved.decisions[0]!.status = 'UNRESOLVED';
    unresolved.decisions[0]!.decision =
      'If two customers complete the same fabric quantity at once, should the first confirmed order win?';
    unresolved.decisions[0]!.impact = 'high';
    unresolved.decisions[0]!.alternatives = [
      { option: 'first confirmed wins', rejected_because: 'other customer sees out-of-stock' },
    ];
    unresolved.manifest.unresolved_count = 1;
    const { llm } = makeLlm([JSON.stringify(unresolved), JSON.stringify(unresolved)]);

    const result = await cmdGenerate(dir, {
      intent: 'stock tool with undecided concurrency behavior',
      variant: 'single',
      profile: 'p-mini',
      nowIso: NOW,
      llm,
    });
    expect(result.code).toBe(1);
    expect(result.output).toContain('GENERATION BLOCKED — USER DECISIONS REQUIRED');
    expect(result.output).toContain('Questions to resolve:');
    expect(result.output).toContain('DEC-0001 [impact: high]');
    expect(result.output).toContain('If two customers complete the same fabric quantity');
    expect(result.output).toContain('first confirmed wins');
    expect(result.output).toContain('--answers');
    // the questions section comes BEFORE the raw lint reasons
    expect(result.output.indexOf('Questions to resolve:')).toBeLessThan(result.output.indexOf('L08'));
    expect(existsSync(join(dir, 'spec'))).toBe(false);
  });

  it('blocked for non-question reasons keeps the plain reasons rendering', async () => {
    const dir = makeTmp('spec-core-generate-plainblocked-');
    const { llm } = makeLlm(['not json', 'also not json']);
    const result = await cmdGenerate(dir, {
      intent: 'x',
      variant: 'single',
      profile: 'p-mini',
      nowIso: NOW,
      llm,
    });
    expect(result.code).toBe(1);
    expect(result.output).not.toContain('Questions to resolve:');
  });

  it('--answers path: answers flow into the prompts as verbatim evidence', async () => {
    const dir = makeTmp('spec-core-generate-answers-');
    const { llm, prompts } = makeLlm([JSON.stringify(validBundle())]);
    const result = await cmdGenerate(dir, {
      intent: 'url shortener',
      variant: 'single',
      profile: 'p-mini',
      nowIso: NOW,
      llm,
      answers: [
        {
          claimId: 'DEC-0004',
          answer: 'the first confirmed order gets priority',
          source: 'answers:answers.json',
          hash: 'sha256:' + 'a'.repeat(64),
        },
      ],
    });
    expect(result.code).toBe(0);
    expect(prompts[0]).toContain('first confirmed order gets priority');
    expect(prompts[0]).toContain('USER ANSWERS');
    expect(result.output).toContain('prompt protocol: lco-prompts/v3+answers-v1');
  });
});
