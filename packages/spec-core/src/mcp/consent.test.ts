import { describe, it, expect, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  EXEC_OPT_IN_ENV,
  EXEC_ROOT_ENV,
  GENERATE_OPT_IN_ENV,
  execOptInFromEnv,
  execRootFromEnv,
  generateOptInFromEnv,
  generateConsentDigest,
  mcpExecBoundary,
  checkPreviewDigest,
  scrubbedEnv,
  scrubbedExecutor,
  authorizeExecution,
  refuseGenerateConsentMissing,
  refuseGenerateNotOptedIn,
} from './consent';
import { loadBundleAtLevel } from '../compiler/validation';
import { cmdFreeze } from '../cli/commands/freeze';
import type { SpecBundle } from '../schemas';
import type { TaskContract } from '../schemas';

const NOW = '2026-08-25T12:00:00Z';
const SHA =
  'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

/** Section files written under spec/ (mirrors server.test.ts / check.test.ts). */
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

const tmpDirs: string[] = [];

function freshRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(root);
  return root;
}

function makeSpecRoot(bundle: Record<string, unknown>): string {
  const root = freshRoot('spec-core-consent-');
  const spec = join(root, 'spec');
  mkdirSync(spec);
  for (const name of [...SECTION_FILES, 'legacy'] as const) {
    if (bundle[name] === undefined) continue;
    writeFileSync(join(spec, `${name}.json`), JSON.stringify(bundle[name], null, 2));
  }
  return root;
}

/** Rewrite TASK-0001's verification on disk (stays schema-valid). */
function patchTask1Verification(
  root: string,
  entries: Array<{ command: string; expect: string }>,
): void {
  const file = join(root, 'spec', 'tasks.json');
  const tasks = JSON.parse(require('node:fs').readFileSync(file, 'utf8')) as TaskContract[];
  tasks[0].verification = entries;
  writeFileSync(file, JSON.stringify(tasks, null, 2), 'utf8');
}

/** Inline fully-conforming bundle (same shape as server.test.ts). */
function inlineConforming(): Record<string, unknown> {
  return {
    manifest: {
      spec_schema: 'lco-spec/1.0',
      spec_version: 1,
      project: { name: 'mini', mode: 'greenfield' },
      complexity_profile: 'p-mini',
      evidence_snapshot: { pack_hash: SHA, collected_at: '2026-08-27T00:00:00Z' },
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
    evidence: [{ id: 'E-0001', kind: 'user_input', source: 's', hash: SHA }],
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
        tests: [
          { id: 'TST-0001', kind: 'unit', file: 'a.test.ts', cases: ['REQ-0001: works'] },
        ],
        verification: [{ command: 'node --version', expect: 'exit 0' }],
        acceptance: ['a'],
        rollback: 'r',
        completion_evidence: { required: ['test_summary'] },
        risk: { level: 'low', note: '' },
        complexity: 'xs',
      },
    ],
    test_files: ['a.test.ts'],
  };
}


/** inlineConforming() plus a second lint-clean task (TASK-0002 runs `node -v`). */
function inlineTwoTask(): Record<string, unknown> {
  const bundle = inlineConforming();
  const t1 = (bundle.tasks as Array<Record<string, unknown>>)[0];
  (bundle.tasks as Array<Record<string, unknown>>).push({
    ...t1,
    task_id: 'TASK-0002',
    // disjoint permitted_scope: L12 rejects overlapping scopes with no
    // dependency edge between the two tasks.
    permitted_scope: ['lib/**'],
    tests: [{ id: 'TST-0002', kind: 'unit', file: 'b.test.ts', cases: ['REQ-0001: works 2'] }],
    verification: [{ command: 'node -v', expect: 'exit 0' }],
  });
  return bundle;
}

/** A lint-clean LOADED bundle from a real tmp spec root (the handler's load path). */
async function loadedBundle(
  bundle: Record<string, unknown>,
): Promise<{ root: string; bundle: SpecBundle }> {
  const root = makeSpecRoot(bundle);
  const loaded = await loadBundleAtLevel(root, 'lint-clean');
  expect(loaded.ok).toBe(true);
  return { root, bundle: (loaded as { ok: true; bundle: SpecBundle }).bundle };
}

/** The same root after a real freeze (cmdFreeze rewrites manifest.state + hashes). */
async function frozenLoadedBundle(
  bundle: Record<string, unknown>,
): Promise<{ root: string; bundle: SpecBundle }> {
  const root = makeSpecRoot(bundle);
  const frozen = await cmdFreeze(root, NOW);
  expect(frozen.code).toBe(0);
  const loaded = await loadBundleAtLevel(root, 'lint-clean');
  expect(loaded.ok).toBe(true);
  return { root, bundle: (loaded as { ok: true; bundle: SpecBundle }).bundle };
}

afterEach(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  tmpDirs.length = 0;
});

// --- server-start opt-in flag -----------------------------------------------------

describe('execOptInFromEnv', () => {
  it(`'${EXEC_OPT_IN_ENV}=1' and ONLY '1' opts in (fail-closed)`, () => {
    expect(execOptInFromEnv({ [EXEC_OPT_IN_ENV]: '1' })).toBe(true);
    expect(execOptInFromEnv({ [EXEC_OPT_IN_ENV]: '0' })).toBe(false);
    expect(execOptInFromEnv({ [EXEC_OPT_IN_ENV]: 'true' })).toBe(false);
    expect(execOptInFromEnv({ [EXEC_OPT_IN_ENV]: '' })).toBe(false);
    expect(execOptInFromEnv({ [EXEC_OPT_IN_ENV]: '01' })).toBe(false);
    expect(execOptInFromEnv({})).toBe(false);
  });

  it('mcpExecBoundary: default env -> execution disabled, no exec root pin', () => {
    expect(mcpExecBoundary({})).toEqual({ allowExec: false, execRoot: undefined });
  });
});

// --- workspace pinning -------------------------------------------------------------

describe('execRootFromEnv', () => {
  it('unset/empty -> undefined (no pin)', () => {
    expect(execRootFromEnv({})).toBeUndefined();
    expect(execRootFromEnv({ [EXEC_ROOT_ENV]: '' })).toBeUndefined();
    expect(execRootFromEnv({ [EXEC_ROOT_ENV]: '   ' })).toBeUndefined();
  });

  it('set -> resolved absolute path', () => {
    expect(execRootFromEnv({ [EXEC_ROOT_ENV]: '/tmp/somewhere' })).toBe('/tmp/somewhere');
  });
});

// --- environment scrubbing ---------------------------------------------------------

describe('scrubbedEnv', () => {
  it('keeps ONLY the allowlist (PATH, HOME, LANG, LC_ALL, TMPDIR + Windows keys), drops everything else', () => {
    const env = {
      PATH: '/usr/bin',
      HOME: '/home/op',
      LANG: 'C.UTF-8',
      LC_ALL: 'C.UTF-8',
      TMPDIR: '/tmp',
      // everything below MUST be dropped:
      LCO_LLM_API_KEY: 'sk-secret',
      LCO_LLM_BASE_URL: 'https://llm.internal',
      LCO_LLM_MODEL: 'gpt-x',
      NODE_OPTIONS: '--require=/evil.js',
      [EXEC_OPT_IN_ENV]: '1',
      AWS_SECRET_ACCESS_KEY: 'x',
      GITHUB_TOKEN: 'y',
      SSH_AUTH_SOCK: '/run/ssh',
      NPM_TOKEN: 'z',
      CI: 'true',
    };
    expect(scrubbedEnv(env)).toEqual({
      PATH: '/usr/bin',
      HOME: '/home/op',
      LANG: 'C.UTF-8',
      LC_ALL: 'C.UTF-8',
      TMPDIR: '/tmp',
    });
  });

  it('absent allowlist keys are simply not present (no empty strings)', () => {
    expect(scrubbedEnv({ PATH: '/bin' })).toEqual({ PATH: '/bin' });
    expect(scrubbedEnv({ TMPDIR: '' })).toEqual({});
  });
});

describe('scrubbedExecutor', () => {
  it('executes with a scrubbed env: secrets set in process.env are NOT visible to the child', async () => {
    const probe = 'LCO_TEST_SCRUB_PROBE_SECRET';
    process.env[probe] = 'do-not-leak';
    try {
      // printenv exits 1 when the variable is absent — the scrub proof.
      const secret = await scrubbedExecutor(`printenv ${probe}`, process.cwd(), 10_000);
      expect(secret.exit).toBe(1);
      expect(secret.timedOut).toBe(false);

      // PATH survives the scrub (binary resolution still works).
      const path = await scrubbedExecutor('printenv PATH', process.cwd(), 10_000);
      expect(path.exit).toBe(0);
      expect(path.stdout).toContain('bin');
    } finally {
      delete process.env[probe];
    }
  }, 20_000);
});

// --- preview digest ----------------------------------------------------------------

describe('checkPreviewDigest', () => {
  it('is deterministic and matches the repo hashing idiom sha256(JSON.stringify(payload, null, 2))', async () => {
    const { bundle } = await loadedBundle(inlineConforming());
    const digest = checkPreviewDigest(bundle);

    // The exact expected value, computed by hand with the same idiom the
    // manifest artifact hashes use — pins BOTH the hash framing and the
    // payload shape {spec_version, tasks:[{task_id, verification:[{command,expect}]}]}.
    const payload = {
      spec_version: 1,
      tasks: [
        {
          task_id: 'TASK-0001',
          verification: [{ command: 'node --version', expect: 'exit 0' }],
        },
      ],
    };
    const expected =
      'sha256:' + createHash('sha256').update(JSON.stringify(payload, null, 2), 'utf8').digest('hex');
    expect(digest).toBe(expected);
    expect(digest).toBe(checkPreviewDigest(bundle)); // deterministic
  });

  it('the digest binds the SELECTION CONTENT: filtering changes it when the selected commands differ', async () => {
    const { bundle } = await loadedBundle(inlineTwoTask());
    // all tasks (2 commands) vs one task (1 command) — different content runs.
    expect(checkPreviewDigest(bundle, 'TASK-0001')).not.toBe(checkPreviewDigest(bundle));
    // two different single-task selections are different content.
    expect(checkPreviewDigest(bundle, 'TASK-0002')).not.toBe(checkPreviewDigest(bundle, 'TASK-0001'));
    // an unknown id selects nothing — the empty selection is its own digest.
    expect(checkPreviewDigest(bundle, 'TASK-9999')).not.toBe(checkPreviewDigest(bundle, 'TASK-0001'));
  });

  it('a changed command (same ids) changes the digest — the hash pins exactly what runs', async () => {
    const a = await loadedBundle(inlineConforming());
    const rootB = makeSpecRoot(inlineConforming());
    patchTask1Verification(rootB, [{ command: 'node -v', expect: 'exit 0' }]);
    const loadedB = await loadBundleAtLevel(rootB, 'lint-clean');
    expect(loadedB.ok).toBe(true);

    expect(checkPreviewDigest(a.bundle)).not.toBe(
      checkPreviewDigest((loadedB as { ok: true; bundle: SpecBundle }).bundle),
    );
  });
});

// --- authorizeExecution gate ---------------------------------------------------------

describe('authorizeExecution', () => {
  it('DRAFT spec -> refusal naming not-frozen, even with a matching digest', async () => {
    const { root, bundle } = await loadedBundle(inlineConforming());
    const digest = checkPreviewDigest(bundle);

    const auth = authorizeExecution(bundle, root, undefined, digest);
    expect(auth.ok).toBe(false);
    if (!auth.ok) {
      expect(auth.code).toBe(2);
      expect(auth.output).toContain('not frozen');
      expect(auth.output).toContain('draft');
      expect(auth.output).toContain('lco freeze');
    }
  });

  it('frozen but DRIFTED content -> refusal naming the drifted sections (consent cannot revive tampered content)', async () => {
    const root = makeSpecRoot(inlineConforming());
    expect((await cmdFreeze(root, NOW)).code).toBe(0);
    patchTask1Verification(root, [
      { command: "node -e \"require('fs').writeFileSync('DRIFTED.txt','1')\"", expect: 'exit 0' },
    ]);
    const loaded = await loadBundleAtLevel(root, 'lint-clean');
    expect(loaded.ok).toBe(true);
    const bundle = (loaded as { ok: true; bundle: SpecBundle }).bundle;

    // The client consents to the digest of the TAMPERED preview — the frozen
    // gate must still refuse (the manifest pins the pre-tamper hashes).
    const tamperedDigest = checkPreviewDigest(bundle);
    const auth = authorizeExecution(bundle, root, undefined, tamperedDigest);
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.output).toContain('drifted sections');
  });

  it('frozen+verified but WRONG digest -> refusal naming both digests', async () => {
    const { root, bundle } = await frozenLoadedBundle(inlineConforming());
    const carried = 'sha256:' + 'a'.repeat(64);

    const auth = authorizeExecution(bundle, root, undefined, carried);
    expect(auth.ok).toBe(false);
    if (!auth.ok) {
      expect(auth.output).toContain('digest mismatch');
      expect(auth.output).toContain(carried);
      expect(auth.output).toContain(checkPreviewDigest(bundle));
    }
  });

  it('frozen+verified+matching digest -> ok, echoing the expected digest', async () => {
    const { root, bundle } = await frozenLoadedBundle(inlineConforming());
    const digest = checkPreviewDigest(bundle);

    const auth = authorizeExecution(bundle, root, undefined, digest);
    expect(auth).toEqual({ ok: true, digest });
  });

  it('the digest binds the task filter: all-task digest does not authorize a filtered run of the same root', async () => {
    const { root, bundle } = await frozenLoadedBundle(inlineTwoTask());
    const allTasksDigest = checkPreviewDigest(bundle);

    const auth = authorizeExecution(bundle, root, 'TASK-0001', allTasksDigest);
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.output).toContain('digest mismatch');
  });

  it('execRoot pin: dirs outside the pinned workspace are refused; inside passes', async () => {
    const { root, bundle } = await frozenLoadedBundle(inlineConforming());
    const digest = checkPreviewDigest(bundle);

    // A REAL outside dir (not just a nonexistent path): a second tmp tree the
    // pin does not cover. Realpath containment must refuse it.
    const otherTree = mkdtempSync(join(tmpdir(), 'spec-core-consent-out-'));
    tmpDirs.push(otherTree);
    const outside = authorizeExecution(bundle, root, undefined, digest, otherTree);
    expect(outside.ok).toBe(false);
    if (!outside.ok) expect(outside.output).toContain('LCO_MCP_EXEC_ROOT');

    // A pin that does not exist at all fails closed for every request.
    const ghost = authorizeExecution(bundle, root, undefined, digest, '/definitely/elsewhere');
    expect(ghost.ok).toBe(false);
    if (!ghost.ok) expect(ghost.output).toContain('LCO_MCP_EXEC_ROOT');

    // A pin at the parent of the tmp root permits it (realpathed both sides).
    const inside = authorizeExecution(bundle, root, undefined, digest, join(root, '..'));
    expect(inside.ok).toBe(true);
  });

  it('execRoot pin is REALPATH containment: a dir under the pin via an escaping symlink is refused (SEC-003)', async () => {
    const { root, bundle } = await frozenLoadedBundle(inlineConforming());
    const digest = checkPreviewDigest(bundle);
    const pin = mkdtempSync(join(tmpdir(), 'spec-core-consent-pin-'));
    tmpDirs.push(pin);
    const movedRoot = join(pin, 'work');
    mkdirSync(movedRoot, { recursive: true });
    // The attack the OLD prefix-string check missed: a path that is
    // LEXICALLY under the pin but RESOLVES outside it via a symlink.
    const elsewhere = mkdtempSync(join(tmpdir(), 'spec-core-consent-far-'));
    tmpDirs.push(elsewhere);
    symlinkSync(elsewhere, join(pin, 'escape')); // lexical: pin/escape — resolves: elsewhere

    const escaped = authorizeExecution(bundle, join(pin, 'escape'), undefined, digest, pin);
    expect(escaped.ok).toBe(false);
    if (!escaped.ok) {
      expect(escaped.output).toContain('LCO_MCP_EXEC_ROOT');
      expect(escaped.output).toContain('symlink'); // the refusal names the mechanism
    }

    // And the honest inside case still passes.
    const inside = authorizeExecution(bundle, movedRoot, undefined, digest, pin);
    expect(inside.ok).toBe(true);
  });
});

// --- paid-call consent: lco_generate (PROD-004, T10) ---------------------------------
//
// The same operator-grade pattern SEC-002 established for execution, applied
// to the OTHER irreversible resource: money. A request from a model must never
// by itself spend paid LLM calls — the operator opts the server in, and the
// request consents to a digest of exactly the effectual content {intent,
// profile, variant}.

describe('generateOptInFromEnv', () => {
  it(`${GENERATE_OPT_IN_ENV}=1 and ONLY '1' opts in (fail-closed, the exec idiom)`, () => {
    expect(generateOptInFromEnv({ [GENERATE_OPT_IN_ENV]: '1' })).toBe(true);
    expect(generateOptInFromEnv({ [GENERATE_OPT_IN_ENV]: '0' })).toBe(false);
    expect(generateOptInFromEnv({ [GENERATE_OPT_IN_ENV]: 'true' })).toBe(false);
    expect(generateOptInFromEnv({ [GENERATE_OPT_IN_ENV]: '' })).toBe(false);
    expect(generateOptInFromEnv({ [GENERATE_OPT_IN_ENV]: '01' })).toBe(false);
    expect(generateOptInFromEnv({})).toBe(false);
  });

  it('the two capability flags are INDEPENDENT: neither implies the other', () => {
    expect(generateOptInFromEnv({ [EXEC_OPT_IN_ENV]: '1' })).toBe(false);
    expect(execOptInFromEnv({ [GENERATE_OPT_IN_ENV]: '1' })).toBe(false);
  });
});

describe('generateConsentDigest', () => {
  it('deterministic, repo idiom sha256(JSON.stringify({intent, profile, variant}, null, 2)) — byte-pinned', () => {
    const digest = generateConsentDigest('build a small pet clinic scheduler', 'p-mini', 'council');

    // Hand-computed with the same framing the manifest artifact hashes use —
    // pins BOTH the hash idiom and the payload shape.
    const payload = {
      intent: 'build a small pet clinic scheduler',
      profile: 'p-mini',
      variant: 'council',
    };
    const expected =
      'sha256:' + createHash('sha256').update(JSON.stringify(payload, null, 2), 'utf8').digest('hex');
    expect(digest).toBe(expected);
    expect(generateConsentDigest('build a small pet clinic scheduler', 'p-mini', 'council')).toBe(
      digest,
    );
  });

  it('binds EVERY effectual component: intent, profile, or variant change → different digest', () => {
    const base = generateConsentDigest('an intent', 'p-mini', 'single');
    expect(generateConsentDigest('an intent!', 'p-mini', 'single')).not.toBe(base);
    expect(generateConsentDigest('an intent', 'p-standard', 'single')).not.toBe(base);
    expect(generateConsentDigest('an intent', 'p-mini', 'council')).not.toBe(base);
  });
});

describe('generate refusal texts', () => {
  it('refuseGenerateConsentMissing carries the digest, the flag, and the zero-calls statement', () => {
    const text = refuseGenerateConsentMissing(generateConsentDigest('x', 'p-mini', 'single'));
    expect(text).toContain(GENERATE_OPT_IN_ENV);
    expect(text).toMatch(/consent digest: sha256:[0-9a-f]{64}/);
    expect(text).toContain('ZERO LLM calls');
    expect(text).toContain('intent');
  });

  it('refuseGenerateNotOptedIn names the flag and stays actionable', () => {
    const text = refuseGenerateNotOptedIn();
    expect(text).toContain(GENERATE_OPT_IN_ENV);
    expect(text).toContain('ZERO LLM calls');
  });
});
