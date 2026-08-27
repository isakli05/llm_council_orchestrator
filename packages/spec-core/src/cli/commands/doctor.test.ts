import { describe, it, expect, afterEach } from 'vitest';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  cmdDoctor,
  checkNodeVersion,
  checkProviderEnv,
  checkMcpFlags,
  checkBudgetEnv,
  checkWritePath,
  checkLock,
  checkSpecDir,
  checkBins,
  checkSchemaFreshness,
  SchemaToolchainUnavailableError,
  FALLBACK_ENGINES_FLOOR,
  parseEnginesFloor,
  type DoctorOptions,
} from './doctor';
import { LOCK_FILE } from '../../storage/revision';

/** chmod-based DAC blocks only non-root users; the skip is named, never silent. */
const RUNNING_AS_ROOT = (process.getuid?.() ?? 1000) === 0;

const tmpDirs: string[] = [];
afterEach(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  tmpDirs.length = 0;
});

function tmpRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), `spec-core-doctor-${prefix}-`));
  tmpDirs.push(root);
  return root;
}

/** A distinctive stand-in secret: if its VALUE (or its length) ever reaches
 *  doctor output, these tests fail by literal string containment. */
const SECRET = 'sk-DOCTOR-SECRET-9f1e2d3c4b5a6f7e8d9c';
const SECRET_LENGTH = String(SECRET.length); // "39" — also never allowed

const NOW_ISO = '2026-08-27T12:00:00Z';

/**
 * Deterministic environment snapshot for the full-flow tests. packageRoot is
 * the REAL package root: pretest builds dist/ (bins check -> ok) and
 * regenerates generated/spec-schema.json (schema check -> ok), the same
 * stance as src/build/bin-contract.test.ts.
 */
const BASE_OPTS: DoctorOptions = {
  env: {},
  nodeVersion: 'v22.17.0',
  nowIso: NOW_ISO,
  packageRoot: join(__dirname, '../../..'),
};

const CHECK_NAMES = [
  'node',
  'provider-env',
  'mcp-flags',
  'budget-env',
  'write',
  'lock',
  'spec',
  'bins',
  'schema',
] as const;

/** The exact check order the human/JSON surfaces emit (pinned contract). */
describe('cmdDoctor: full flow', () => {
  it('healthy dir with unconfigured optional env -> exit 0 (warn is NOT a failure)', async () => {
    const root = tmpRoot('healthy');
    const result = await cmdDoctor(root, BASE_OPTS);
    expect(result.code).toBe(0);
    // Every check name appears, in order, as a bracketed line prefix.
    const prefixes = result.output
      .split('\n')
      .filter((l) => l.startsWith('['))
      .map((l) => l.slice(1, l.indexOf(']')));
    expect(prefixes).toEqual([...CHECK_NAMES]);
    // Unset LCO_LLM_* is a WARN (unconfigured optional), not a FAIL.
    expect(result.output).toContain('[provider-env] warn:');
    // ...and the exit contract holds: 0 = no FAIL, warn does not fail.
    expect(result.output).not.toContain(' fail:');
    expect(result.output).toMatch(/doctor: 9 checks — /);
  });

  it('json mode -> exactly one parseable {checks, healthy} object, same order', async () => {
    const root = tmpRoot('json');
    const result = await cmdDoctor(root, { ...BASE_OPTS, json: true });
    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.output) as {
      checks: Array<{ name: string; status: string; detail: string; remedy?: string }>;
      healthy: boolean;
    };
    expect(parsed.healthy).toBe(true);
    expect(parsed.checks.map((c) => c.name)).toEqual([...CHECK_NAMES]);
    for (const check of parsed.checks) {
      expect(typeof check.detail).toBe('string');
      expect(['ok', 'warn', 'fail', 'skip']).toContain(check.status);
    }
    const provider = parsed.checks.find((c) => c.name === 'provider-env')!;
    expect(provider.status).toBe('warn');
    expect(provider.remedy).toContain('LCO_LLM');
  });

  it('nonexistent dir -> [write] fail, [lock] skip, exit 1', async () => {
    const root = tmpRoot('missing');
    const result = await cmdDoctor(join(root, 'does-not-exist'), BASE_OPTS);
    expect(result.code).toBe(1);
    expect(result.output).toContain('[write] fail:');
    expect(result.output).toContain('directory does not exist');
    expect(result.output).toContain('[lock] skip:');
    // The nonexistent dir was NOT created as a side effect of diagnosing it.
    expect(existsSync(join(root, 'does-not-exist'))).toBe(false);
    const parsed = JSON.parse((await cmdDoctor(join(root, 'does-not-exist'), { ...BASE_OPTS, json: true })).output) as {
      healthy: boolean;
    };
    expect(parsed.healthy).toBe(false);
  });

  it.skipIf(RUNNING_AS_ROOT)('unwritable dir -> [write] fail + exit 1', async () => {
    const root = tmpRoot('ro');
    try {
      chmodSync(root, 0o555);
      const result = await cmdDoctor(root, BASE_OPTS);
      expect(result.code).toBe(1);
      expect(result.output).toContain('[write] fail:');
      expect(result.output).toContain('remedy:');
    } finally {
      chmodSync(root, 0o755);
    }
  });

  it('NEVER prints env values or lengths — presence wording only (secrets policy)', async () => {
    const root = tmpRoot('secrets');
    const env = {
      LCO_LLM_BASE_URL: 'https://base-do-not-print.example/v1',
      LCO_LLM_API_KEY: SECRET,
      LCO_LLM_MODEL: 'model-do-not-print',
      LCO_LLM_MAX_TOKENS: '4096',
      LCO_LLM_EXTRA_BODY: '{"thinking":{"type":"disabled"}}',
      LCO_MCP_EXEC_ROOT: root,
      LCO_GENERATE_MAX_WALL_MS: '900000',
    };
    const human = await cmdDoctor(root, { ...BASE_OPTS, env });
    const json = await cmdDoctor(root, { ...BASE_OPTS, env, json: true });
    for (const out of [human.output, json.output]) {
      expect(out).not.toContain('do-not-print');
      expect(out).not.toContain(SECRET);
      expect(out).not.toContain(SECRET_LENGTH); // no length leaks either
      expect(out).not.toContain('4096');
      expect(out).not.toContain('900000');
    }
    // Presence wording is the ok-path detail for the provider env.
    expect(human.output).toContain('[provider-env] ok:');
  });
});

describe('check: node version', () => {
  it('v22 / v24 meet the engines floor -> ok', () => {
    expect(checkNodeVersion('v22.0.0').status).toBe('ok');
    expect(checkNodeVersion('v24.14.0').status).toBe('ok');
    expect(checkNodeVersion('v22.0.0').detail).toContain('>=22');
  });

  it('below the floor -> warn with upgrade remedy (never a fail: the CLI still ran)', () => {
    const check = checkNodeVersion('v18.20.1');
    expect(check.status).toBe('warn');
    expect(check.detail).toContain('v18.20.1');
    expect(check.remedy).toContain('22');
  });

  it('unparseable version -> warn', () => {
    expect(checkNodeVersion('not-a-version').status).toBe('warn');
  });

  it('the floor is INJECTED: a higher floor flips the verdict for the same runtime', () => {
    expect(checkNodeVersion('v22.0.0', 24).status).toBe('warn');
    expect(checkNodeVersion('v24.0.0', 24).status).toBe('ok');
    expect(checkNodeVersion('v18.20.1', 18).status).toBe('ok');
  });

  it('cmdDoctor plumbs DoctorOptions.enginesFloor through to [node]', async () => {
    const root = tmpRoot('floor-plumb');
    const result = await cmdDoctor(root, { ...BASE_OPTS, enginesFloor: 24 });
    expect(result.output).toContain('[node] warn:');
    expect(result.output).toContain('>=24');
  });
});

describe('engines floor source (review fix 2)', () => {
  it('parseEnginesFloor: ">=NN..." -> NN; anything else -> null (fallback signal)', () => {
    expect(parseEnginesFloor('>=22')).toBe(22);
    expect(parseEnginesFloor('>=18.0.0')).toBe(18);
    expect(parseEnginesFloor('>=20')).toBe(20);
    expect(parseEnginesFloor('^20')).toBeNull();
    expect(parseEnginesFloor('22')).toBeNull();
    expect(parseEnginesFloor('')).toBeNull();
  });

  it('DRIFT PIN: the real package.json engines parse equals the compiled fallback constant', () => {
    // The CLI boundary reads engines.node from package.json at RUN TIME (the
    // same file --version reads — npm always ships it); this pin makes the
    // fallback constant and package.json unable to drift apart silently, in
    // EITHER direction: bump engines without the constant (or vice versa)
    // and this test fails.
    const pkg = JSON.parse(
      readFileSync(join(__dirname, '../../../package.json'), 'utf8'),
    ) as { engines?: { node?: unknown } };
    expect(typeof pkg.engines?.node).toBe('string');
    expect(parseEnginesFloor(pkg.engines!.node as string)).toBe(FALLBACK_ENGINES_FLOOR);
  });
});

describe('check: provider env (presence only, never values)', () => {
  it('all three required set, optionals valid -> ok, names only', () => {
    const check = checkProviderEnv({
      LCO_LLM_BASE_URL: 'https://x.example',
      LCO_LLM_API_KEY: SECRET,
      LCO_LLM_MODEL: 'm',
    });
    expect(check.status).toBe('ok');
    expect(check.detail).toContain('set');
    expect(check.detail).not.toContain('https://x.example');
    expect(check.detail).not.toContain(SECRET);
  });

  it('nothing set -> warn naming the three unset vars (mock default is fine, live is not)', () => {
    const check = checkProviderEnv({});
    expect(check.status).toBe('warn');
    for (const name of ['LCO_LLM_BASE_URL', 'LCO_LLM_API_KEY', 'LCO_LLM_MODEL']) {
      expect(check.detail).toContain(name);
    }
  });

  it('partially set -> warn naming only the missing ones', () => {
    const check = checkProviderEnv({ LCO_LLM_API_KEY: SECRET });
    expect(check.status).toBe('warn');
    expect(check.detail).toContain('LCO_LLM_BASE_URL');
    expect(check.detail).toContain('LCO_LLM_MODEL');
    expect(check.detail).not.toContain(SECRET);
  });

  it('blank value counts as unset (createHttpLlm treats blank as missing)', () => {
    const check = checkProviderEnv({
      LCO_LLM_BASE_URL: '',
      LCO_LLM_API_KEY: 'k',
      LCO_LLM_MODEL: 'm',
    });
    expect(check.status).toBe('warn');
    expect(check.detail).toContain('LCO_LLM_BASE_URL');
  });

  it('garbage LCO_LLM_MAX_TOKENS -> warn naming the var, never the value', () => {
    const check = checkProviderEnv({
      LCO_LLM_BASE_URL: 'https://x.example',
      LCO_LLM_API_KEY: 'k',
      LCO_LLM_MODEL: 'm',
      LCO_LLM_MAX_TOKENS: 'garbage-tokens',
    });
    expect(check.status).toBe('warn');
    expect(check.detail).toContain('LCO_LLM_MAX_TOKENS');
    expect(check.detail).not.toContain('garbage-tokens');
  });

  it('LCO_LLM_EXTRA_BODY that is not a JSON object -> warn naming the var', () => {
    for (const bad of ['nope', '[1,2]', '"str"', 'null']) {
      const check = checkProviderEnv({
        LCO_LLM_BASE_URL: 'https://x.example',
        LCO_LLM_API_KEY: 'k',
        LCO_LLM_MODEL: 'm',
        LCO_LLM_EXTRA_BODY: bad,
      });
      expect(check.status, `EXTRA_BODY=${bad}`).toBe('warn');
      expect(check.detail).toContain('LCO_LLM_EXTRA_BODY');
    }
  });
});

describe('check: MCP consent flags', () => {
  it('nothing set -> ok (conservative defaults, effect stated)', () => {
    const check = checkMcpFlags({}, () => true);
    expect(check.status).toBe('ok');
    expect(check.detail).toContain('LCO_MCP_ALLOW_EXEC unset');
    expect(check.detail).toContain('LCO_MCP_ALLOW_GENERATE unset');
    expect(check.detail).toContain('LCO_MCP_EXEC_ROOT unset');
  });

  it("exactly '1' opts in -> ok with the effect summary", () => {
    const check = checkMcpFlags(
      { LCO_MCP_ALLOW_EXEC: '1', LCO_MCP_ALLOW_GENERATE: '1' },
      () => true,
    );
    expect(check.status).toBe('ok');
    expect(check.detail).toContain('ON');
  });

  it("set but not exactly '1' -> warn (server treats it as NOT consented)", () => {
    const check = checkMcpFlags({ LCO_MCP_ALLOW_EXEC: 'yes' }, () => true);
    expect(check.status).toBe('warn');
    expect(check.detail).toContain('LCO_MCP_ALLOW_EXEC');
  });

  it('relative LCO_MCP_EXEC_ROOT -> warn (exec will refuse)', () => {
    const check = checkMcpFlags({ LCO_MCP_EXEC_ROOT: 'relative/path' }, () => true);
    expect(check.status).toBe('warn');
    expect(check.detail).toContain('not an absolute path');
    // No path value echoed either (uniform no-values policy).
    expect(check.detail).not.toContain('relative/path');
  });

  it('absolute but nonexistent LCO_MCP_EXEC_ROOT -> warn', () => {
    const check = checkMcpFlags({ LCO_MCP_EXEC_ROOT: '/definitely/not/here' }, () => false);
    expect(check.status).toBe('warn');
    expect(check.detail).toContain('does not exist');
  });

  it('absolute, existing LCO_MCP_EXEC_ROOT -> ok', () => {
    const check = checkMcpFlags({ LCO_MCP_EXEC_ROOT: '/some/root' }, () => true);
    expect(check.status).toBe('ok');
    expect(check.detail).toContain('absolute, exists');
  });
});

describe('check: generate budget env', () => {
  it('nothing set -> ok (envelope defaults apply)', () => {
    const check = checkBudgetEnv({});
    expect(check.status).toBe('ok');
    expect(check.detail).toContain('envelope defaults');
  });

  it('valid overrides -> ok naming the vars, not the numbers', () => {
    const check = checkBudgetEnv({
      LCO_GENERATE_MAX_ATTEMPTS: '12',
      LCO_GENERATE_MAX_TOKENS: '1000',
      LCO_GENERATE_MAX_WALL_MS: '60000',
    });
    expect(check.status).toBe('ok');
    expect(check.detail).toContain('LCO_GENERATE_MAX_ATTEMPTS');
    expect(check.detail).not.toContain('12');
  });

  it('garbage value -> warn naming the var, never the value', () => {
    const check = checkBudgetEnv({ LCO_GENERATE_MAX_TOKENS: 'garbage-budget' });
    expect(check.status).toBe('warn');
    expect(check.detail).toContain('LCO_GENERATE_MAX_TOKENS');
    expect(check.detail).not.toContain('garbage-budget');
  });
});

describe('check: write path probe', () => {
  it('writable dir -> ok, and leaves NO residue (probe + lock cleaned up)', () => {
    const root = tmpRoot('write-ok');
    const before = readdirSync(root).sort();
    expect(checkWritePath(root).status).toBe('ok');
    expect(checkLock(root, NOW_ISO).status).toBe('ok');
    expect(readdirSync(root).sort()).toEqual(before);
  });

  it('nonexistent dir -> fail with a create-it remedy, dir NOT created', () => {
    const root = tmpRoot('write-missing');
    const missing = join(root, 'nope');
    const check = checkWritePath(missing);
    expect(check.status).toBe('fail');
    expect(check.remedy).toBeDefined();
    expect(existsSync(missing)).toBe(false);
  });

  it('path is a file, not a directory -> fail', () => {
    const root = tmpRoot('write-file');
    const file = join(root, 'afile');
    writeFileSync(file, 'x');
    expect(checkWritePath(file).status).toBe('fail');
  });

  it.skipIf(RUNNING_AS_ROOT)('unwritable dir -> fail (exclusive create gets EACCES)', () => {
    const root = tmpRoot('write-ro');
    try {
      chmodSync(root, 0o555);
      const check = checkWritePath(root);
      expect(check.status).toBe('fail');
      expect(check.detail).toContain('probe failed');
    } finally {
      chmodSync(root, 0o755);
    }
  });
});

describe('check: revision lock probe', () => {
  it('free root -> acquire + release, no lockfile residue', () => {
    const root = tmpRoot('lock-ok');
    const check = checkLock(root, NOW_ISO);
    expect(check.status).toBe('ok');
    expect(existsSync(join(root, LOCK_FILE))).toBe(false);
  });

  it('live foreign lock -> warn (busy, not broken) and the lock is left ALONE', () => {
    const root = tmpRoot('lock-held');
    writeFileSync(
      join(root, LOCK_FILE),
      JSON.stringify({ pid: 424242, acquiredAt: '2026-08-27T11:59:55Z' }), // 5s old: live
    );
    const check = checkLock(root, NOW_ISO);
    expect(check.status).toBe('warn');
    // doctor never breaks a live lock (stale-break is the writer module's job).
    expect(existsSync(join(root, LOCK_FILE))).toBe(true);
  });

  it('STALE foreign lock -> warn naming the holder + age, and the lock (evidence) is PRESERVED', () => {
    const root = tmpRoot('lock-stale');
    writeFileSync(
      join(root, LOCK_FILE),
      JSON.stringify({ pid: 424242, acquiredAt: '2026-08-27T11:59:00Z' }), // 60s old: stale
    );
    const check = checkLock(root, NOW_ISO);
    expect(check.status).toBe('warn');
    expect(check.detail).toContain('stale lock detected');
    expect(check.detail).toContain('424242'); // the (dead) holder's pid — the diagnosis
    expect(check.detail).toContain('60'); // its age in seconds
    // A diagnostic must never destroy the evidence it is diagnosing: a
    // default acquireSpecRootLock call would AUTO-BREAK this lock at 10s.
    expect(existsSync(join(root, LOCK_FILE))).toBe(true);
  });

  it('unparseable lock content -> warn (module mtime-fallback message), lock preserved', () => {
    const root = tmpRoot('lock-garbage');
    writeFileSync(join(root, LOCK_FILE), 'not-json{');
    const check = checkLock(root, NOW_ISO);
    expect(check.status).toBe('warn');
    expect(check.detail).toContain('unparseable');
    expect(existsSync(join(root, LOCK_FILE))).toBe(true);
  });

  it('cmdDoctor with a stale lock in <dir> -> exit 0 (warn), lock file intact afterwards', async () => {
    const root = tmpRoot('lock-stale-flow');
    writeFileSync(
      join(root, LOCK_FILE),
      JSON.stringify({ pid: 999123, acquiredAt: '2026-08-27T11:00:00Z' }), // 1h stale
    );
    const result = await cmdDoctor(root, { ...BASE_OPTS, nowIso: NOW_ISO });
    expect(result.code).toBe(0);
    expect(result.output).toContain('[lock] warn:');
    expect(result.output).toContain('stale lock detected');
    expect(existsSync(join(root, LOCK_FILE))).toBe(true);
  });

  it('explicit skip reason -> skip (write probe already failed)', () => {
    const check = checkLock('/anywhere', NOW_ISO, { skip: 'skipped — the write probe failed (see [write])' });
    expect(check.status).toBe('skip');
  });

  it('missing dir without skip -> skip', () => {
    const check = checkLock('/definitely/not/here', NOW_ISO);
    expect(check.status).toBe('skip');
  });
});

/** Section files under spec/ — mirrors the conforming inline bundle of cli.test.ts. */
const SHA =
  'sha256:e3b0c44298fc1c149afbf8c8996fb92427ae41e4649b934ca495991b7852b855';

function writeConformingSpec(root: string): void {
  const spec = join(root, 'spec');
  mkdirSync(spec);
  writeFileSync(
    join(spec, 'manifest.json'),
    JSON.stringify(
      {
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
      null,
      2,
    ),
  );
  writeFileSync(join(spec, 'intent.json'), JSON.stringify({ statement: 's', normalized: 'n' }, null, 2));
  writeFileSync(join(spec, 'glossary.json'), JSON.stringify([{ term: 'Term', definition: 'd' }], null, 2));
  writeFileSync(join(spec, 'assumptions.json'), JSON.stringify([], null, 2));
  writeFileSync(
    join(spec, 'evidence.json'),
    JSON.stringify([{ id: 'E-0001', kind: 'user_input', source: 's', hash: SHA }], null, 2),
  );
  writeFileSync(
    join(spec, 'requirements.json'),
    JSON.stringify(
      [
        {
          id: 'REQ-0001',
          statement: 'must work',
          priority: 'must',
          evidence: ['E-0001'],
          acceptance_refs: ['TST-0001'],
          terms_used: [],
        },
      ],
      null,
      2,
    ),
  );
  writeFileSync(
    join(spec, 'decisions.json'),
    JSON.stringify(
      [
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
      null,
      2,
    ),
  );
  writeFileSync(join(spec, 'contracts.json'), JSON.stringify([], null, 2));
  writeFileSync(
    join(spec, 'tasks.json'),
    JSON.stringify(
      [
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
      null,
      2,
    ),
  );
}

describe('check: spec dir compile summary', () => {
  it('no spec/ under dir -> skip (nothing to compile)', async () => {
    const root = tmpRoot('spec-none');
    const check = await checkSpecDir(root);
    expect(check.status).toBe('skip');
  });

  it('compiling spec -> ok with a one-line summary', async () => {
    const root = tmpRoot('spec-ok');
    writeConformingSpec(root);
    const check = await checkSpecDir(root);
    expect(check.status).toBe('ok');
    expect(check.detail).toContain('compiles');
  });

  it('broken spec -> FAIL with the first error and a lco-compile remedy', async () => {
    const root = tmpRoot('spec-bad');
    const spec = join(root, 'spec');
    mkdirSync(spec);
    writeFileSync(join(spec, 'manifest.json'), '{}'); // schema-rejected
    const check = await checkSpecDir(root);
    expect(check.status).toBe('fail');
    expect(check.detail).toContain('does not compile');
    expect(check.remedy).toContain('lco compile');
  });
});

describe('check: bin self-check (dist contract)', () => {
  function fakePackage(withShebang: boolean, mode: number): string {
    const pkg = tmpRoot(`pkg-${withShebang}-${mode.toString(8)}`);
    for (const rel of ['dist/cli/index.js', 'dist/mcp/server.js']) {
      const file = join(pkg, rel);
      mkdirSync(join(pkg, rel, '..'), { recursive: true });
      writeFileSync(file, withShebang ? '#!/usr/bin/env node\n' : 'console.log(1);\n');
      chmodSync(file, mode);
    }
    return pkg;
  }

  it('real package root (pretest-built dist) -> ok', () => {
    const check = checkBins(join(__dirname, '../../..'));
    expect(check.status).toBe('ok');
  });

  it('shebang + exec mode present -> ok (source run does not false-fail)', () => {
    expect(checkBins(fakePackage(true, 0o755)).status).toBe('ok');
  });

  it('missing shebang -> fail', () => {
    const pkg = fakePackage(false, 0o755);
    const check = checkBins(pkg);
    expect(check.status).toBe('fail');
    expect(check.detail).toContain("line 1 is not '#!/usr/bin/env node'");
  });

  it('non-executable mode -> fail (even for root: 0644 has no exec bit)', () => {
    const pkg = fakePackage(true, 0o644);
    const check = checkBins(pkg);
    expect(check.status).toBe('fail');
    expect(check.detail).toContain('executable');
  });

  it('no dist/ at all -> skip (source checkout; the check never false-fails)', () => {
    const check = checkBins(tmpRoot('pkg-empty'));
    expect(check.status).toBe('skip');
  });

  it('incomplete dist (one bin missing) -> fail', () => {
    const pkg = fakePackage(true, 0o755);
    rmSync(join(pkg, 'dist/mcp/server.js'));
    const check = checkBins(pkg);
    expect(check.status).toBe('fail');
    expect(check.detail).toContain('dist/mcp/server.js');
  });
});

describe('check: schema artifact freshness (WARN-only)', () => {
  it('real package root -> ok (pretest regenerates the committed artifact)', () => {
    const check = checkSchemaFreshness(join(__dirname, '../../..'));
    expect(check.status).toBe('ok');
  });

  it('stale artifact -> warn with a regenerate remedy', () => {
    const pkg = tmpRoot('schema-stale');
    mkdirSync(join(pkg, 'generated'));
    writeFileSync(join(pkg, 'generated/spec-schema.json'), '{"stale": true}');
    const check = checkSchemaFreshness(pkg, () => '{"fresh": true}');
    expect(check.status).toBe('warn');
    expect(check.remedy).toContain('build');
  });

  it('missing artifact -> warn', () => {
    const check = checkSchemaFreshness(tmpRoot('schema-missing'), () => '{}');
    expect(check.status).toBe('warn');
  });

  it('regenerator unavailable (packed install) -> skip, never fail', () => {
    const pkg = tmpRoot('schema-packed');
    mkdirSync(join(pkg, 'generated'));
    writeFileSync(join(pkg, 'generated/spec-schema.json'), '{}');
    const check = checkSchemaFreshness(pkg, () => {
      throw new SchemaToolchainUnavailableError();
    });
    expect(check.status).toBe('skip');
  });
});

describe('doctor output hygiene', () => {
  it('every human line is [name] status: detail — statuses only ok/warn/fail/skip', async () => {
    const root = tmpRoot('hygiene');
    const result = await cmdDoctor(root, BASE_OPTS);
    for (const line of result.output.split('\n').filter((l) => l.startsWith('['))) {
      expect(line).toMatch(/^\[[a-z-]+\] (ok|warn|fail|skip): /);
    }
  });

  it('remedy lines appear only on warn/fail checks', async () => {
    const root = tmpRoot('remedy');
    const result = await cmdDoctor(root, { ...BASE_OPTS, json: true });
    const parsed = JSON.parse(result.output) as {
      checks: Array<{ status: string; remedy?: string }>;
    };
    for (const check of parsed.checks) {
      if (check.status === 'ok' || check.status === 'skip') {
        expect(check.remedy).toBeUndefined();
      }
    }
  });

  it('the write probe works alongside an existing spec (no interference)', async () => {
    const root = tmpRoot('with-spec');
    writeConformingSpec(root);
    const before = readdirSync(root).sort();
    const result = await cmdDoctor(root, BASE_OPTS);
    expect(result.code).toBe(0);
    expect(result.output).toContain('[spec] ok:');
    expect(readdirSync(root).sort()).toEqual(before);
  });
});
