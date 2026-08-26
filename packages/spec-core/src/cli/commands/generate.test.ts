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

const PET_CLINIC = JSON.parse(
  readFileSync(join(__dirname, '../../../fixtures/good/pet-clinic/bundle.json'), 'utf8'),
) as SpecBundle;

/** Lint-clean p-standard bundle — the valid output for a p-standard request
 * (pet-clinic is p-mini-shaped and fails L07's p-standard budget rule). */
const SESSION_SERVICE = JSON.parse(
  readFileSync(join(__dirname, '../../../fixtures/good/session-service/bundle.json'), 'utf8'),
) as SpecBundle;

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

  it('default variant is council (3 LLM calls) and default profile is p-standard', async () => {
    stubEnv();
    const dir = makeTmp('spec-core-generate-defaults-');

    const bodies: string[] = [];
    vi.stubGlobal(
      'fetch',
      async (_url: unknown, init?: { body?: string }): Promise<Response> => {
        const n = bodies.push(String(init?.body)); // 1-based call number
        const content =
          n === 1
            ? JSON.stringify({ profile: 'p-standard', must_be_blocked: false })
            : JSON.stringify(pStandardBundle());
        return jsonResponse({
          choices: [{ message: { content } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        });
      },
    );

    await expect(runCli(['generate', dir, '--intent', 'a scheduler tool'])).resolves.toBe(0);

    expect(bodies).toHaveLength(3); // council = classifier + proposal + judge
    const firstPrompt = (JSON.parse(bodies[0]!) as { messages: { content: string }[] })
      .messages[0]!.content;
    expect(firstPrompt).toContain('EXPECTED COMPLEXITY PROFILE: p-standard');
    expect(stdout()).toContain('council');
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
