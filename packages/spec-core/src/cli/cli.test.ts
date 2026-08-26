import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from './index';
import { compileSpecDir } from '../compiler/compile';
import { artifactHashes } from '../compiler/hash';

const FIXTURES = join(__dirname, '../../fixtures');

/** Section files written under spec/ (test_files is derived from tasks, not read from disk). */
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

function loadBundle(rel: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(FIXTURES, rel), 'utf8')) as Record<string, unknown>;
}

const tmpDirs: string[] = [];

function makeSpecRoot(bundle: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), 'spec-core-cli-'));
  tmpDirs.push(root);
  const spec = join(root, 'spec');
  mkdirSync(spec);
  for (const name of [...SECTION_FILES, 'legacy'] as const) {
    if (bundle[name] === undefined) continue;
    writeFileSync(join(spec, `${name}.json`), JSON.stringify(bundle[name], null, 2));
  }
  return root;
}

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  tmpDirs.length = 0;
});

function stdout(): string {
  return logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
}

function stderr(): string {
  return errorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
}


const SHA =
  'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

/**
 * Inline fully-conforming bundle (T7): pet-clinic remains the compile-level
 * fixture, but the lint/freeze/change happy paths need a lint-clean bundle
 * before T8 conforms the fixtures (L13/L14).
 */
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

describe('runCli: usage errors (exit 2)', () => {
  it('no arguments -> usage on stderr', async () => {
    await expect(runCli([])).resolves.toBe(2);
    expect(stderr()).toContain('usage');
  });

  it('unknown command -> usage on stderr', async () => {
    await expect(runCli(['froze', '/tmp'])).resolves.toBe(2);
    expect(stderr()).toContain('unknown command');
  });

  it('command without <dir> -> usage on stderr', async () => {
    await expect(runCli(['compile'])).resolves.toBe(2);
    expect(stderr()).toContain('missing');
  });

  it('extra arguments after <dir> -> exit 2', async () => {
    await expect(runCli(['compile', '/tmp', 'junk'])).resolves.toBe(2);
  });
});

describe('runCli: help and version (UX-002)', () => {
  it('--help with no command -> full usage on stdout, exit 0, stderr silent', async () => {
    await expect(runCli(['--help'])).resolves.toBe(0);
    expect(stdout()).toContain('usage:');
    expect(stdout()).toContain('commands:');
    expect(stderr()).toBe('');
  });

  it('-h with no command -> same overview as --help', async () => {
    await expect(runCli(['-h'])).resolves.toBe(0);
    expect(stdout()).toContain('usage:');
    expect(stderr()).toBe('');
  });

  it('--version -> the REAL package.json version on stdout (bump-proof), exit 0', async () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8')) as {
      version: string;
    };
    await expect(runCli(['--version'])).resolves.toBe(0);
    expect(stdout().trim()).toBe(pkg.version);
    expect(stderr()).toBe('');
  });

  it("init --help -> init's own help BEFORE init validation, exit 0", async () => {
    // No <dir>, no profile: --help must short-circuit before any validation
    // of the command's own arguments.
    await expect(runCli(['init', '--help'])).resolves.toBe(0);
    expect(stdout()).toContain('init');
    expect(stdout()).toContain('scaffold');
    expect(stderr()).toBe('');
  });

  it('init -h -> same as init --help', async () => {
    await expect(runCli(['init', '-h'])).resolves.toBe(0);
    expect(stdout()).toContain('init');
    expect(stderr()).toBe('');
  });

  it("compile --help -> help even though compile's <dir> is missing", async () => {
    await expect(runCli(['compile', '--help'])).resolves.toBe(0);
    expect(stdout()).toContain('compile');
    expect(stderr()).toBe('');
  });

  it('every command has command-specific help (exit 0, mentions the command)', async () => {
    const commands = [
      'compile',
      'lint',
      'freeze',
      'verify',
      'change',
      'trace',
      'plan',
      'init',
      'check',
      'generate',
    ];
    for (const command of commands) {
      logSpy.mockClear();
      const code = await runCli([command, '--help']);
      expect(code, `lco ${command} --help`).toBe(0);
      expect(stdout(), `lco ${command} --help`).toContain(command);
      expect(stderr(), `lco ${command} --help`).toBe('');
    }
  });

  it("plan --help teaches the refusal contract (T7), not the old warn-only one", async () => {
    // Since T7 (BACK-006 lint-clean gate) plan REFUSES a bundle with unknown
    // depends_on references: exit 2, missing id named in the structured
    // refusal. Pin the help to that contract so USAGE can never regress to
    // teaching the unsafe pre-T7 "warn but do not block" behavior.
    await expect(runCli(['plan', '--help'])).resolves.toBe(0);
    expect(stdout()).not.toContain('warn but do not block');
    expect(stdout()).toContain('refuses (exit 2)');
    expect(stdout()).toContain('lco lint');
    expect(stderr()).toBe('');
  });

  it('unknown command with --help stays an error -> exit 2', async () => {
    await expect(runCli(['bogus', '--help'])).resolves.toBe(2);
    expect(stderr()).toContain('unknown command');
  });

  it('unknown flag on a known command stays a usage error -> exit 2', async () => {
    await expect(runCli(['init', '/tmp/lco-never-written', '--halp'])).resolves.toBe(2);
    expect(stderr()).toContain('unexpected argument');
  });
});

describe('runCli compile', () => {
  it('good pet-clinic spec dir -> exit 0 with per-section summary', async () => {
    const root = makeSpecRoot(loadBundle('good/pet-clinic/bundle.json'));

    await expect(runCli(['compile', root])).resolves.toBe(0);
    expect(stdout()).toContain('pet-clinic');
    expect(stdout()).toContain('requirements');
    expect(stdout()).toContain('tasks');
  });

  it('schema-invalid fixture -> exit 2 with the zod issue surfaced', async () => {
    const root = makeSpecRoot(loadBundle('bad/schema-invalid/bundle.json'));

    await expect(runCli(['compile', root])).resolves.toBe(2);
    expect(stdout()).toContain('manifest.spec_version');
  });

  it('missing section files -> exit 2 with missing-file errors', async () => {
    const root = makeSpecRoot({});

    await expect(runCli(['compile', root])).resolves.toBe(2);
    expect(stdout()).toContain('missing file');
  });
});

describe('runCli lint', () => {
  it('good (inline conforming) spec dir -> exit 0, zero findings reported', async () => {
    const root = makeSpecRoot(inlineConforming());

    await expect(runCli(['lint', root])).resolves.toBe(0);
    expect(stdout()).toContain('lint OK');
  });

  // Deferred from Task 6: the RULES registry was empty there, so the
  // lint-failure exit path could not be exercised until the rules landed.
  it('L02 fixture spec dir -> exit 1 with L02_ORPHAN_REQUIREMENT in the table', async () => {
    const root = makeSpecRoot(loadBundle('bad/L02/bundle.json'));

    await expect(runCli(['lint', root])).resolves.toBe(1);
    expect(stdout()).toContain('L02_ORPHAN_REQUIREMENT');
    expect(stdout()).toContain('REQ-0003');
  });

  it('compile failure short-circuits lint -> exit 2', async () => {
    const root = makeSpecRoot(loadBundle('bad/schema-invalid/bundle.json'));

    await expect(runCli(['lint', root])).resolves.toBe(2);
  });
});

describe('runCli freeze', () => {
  it('good (inline conforming) spec dir -> exit 0 and spec/manifest.json written frozen', async () => {
    const root = makeSpecRoot(inlineConforming());

    await expect(runCli(['freeze', root])).resolves.toBe(0);
    expect(stdout()).toContain('manifest.json');

    const manifest = JSON.parse(readFileSync(join(root, 'spec', 'manifest.json'), 'utf8'));
    expect(manifest.state).toBe('frozen');
    expect(manifest.frozen_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);

    // The written manifest must round-trip: recompiled sections hash to the stored values.
    const recompiled = await compileSpecDir(root);
    expect(recompiled.ok).toBe(true);
    expect(manifest.artifact_hashes).toEqual(artifactHashes(recompiled.bundle!));
  });

  it('freeze then verify on the same dir -> verify exit 0', async () => {
    const root = makeSpecRoot(inlineConforming());

    await expect(runCli(['freeze', root])).resolves.toBe(0);
    await expect(runCli(['verify', root])).resolves.toBe(0);
    expect(stdout()).toContain('verify OK');
  });

  it('unresolved fixture -> exit 1 with freeze reasons on stdout', async () => {
    const root = makeSpecRoot(loadBundle('bad/unresolved/bundle.json'));

    await expect(runCli(['freeze', root])).resolves.toBe(1);
    expect(stdout()).toContain('unresolved_count');
    expect(stdout()).toContain('UNRESOLVED');
  });

  it('compile failure short-circuits freeze -> exit 2', async () => {
    const root = makeSpecRoot(loadBundle('bad/schema-invalid/bundle.json'));

    await expect(runCli(['freeze', root])).resolves.toBe(2);
  });

  // BACK-002 (c): freeze must not launder tampered frozen content. A frozen
  // v1 whose sections were hand-edited must NOT be re-pinnable under the same
  // version — verify keeps reporting the drift until a changeset (v2) is used.
  it('re-freezing a drifted frozen spec -> exit 1, version and hashes NOT re-pinned, verify still fails', async () => {
    const root = makeSpecRoot(inlineConforming());

    await expect(runCli(['freeze', root])).resolves.toBe(0);
    const manifestBefore = JSON.parse(readFileSync(join(root, 'spec', 'manifest.json'), 'utf8'));

    // Tamper: hand-edit a frozen section file (outside any changeset).
    const tasks = JSON.parse(readFileSync(join(root, 'spec', 'tasks.json'), 'utf8'));
    tasks[0].title = 'TAMPERED outside the change envelope';
    writeFileSync(join(root, 'spec', 'tasks.json'), JSON.stringify(tasks, null, 2), 'utf8');

    // Verify still catches the drift.
    await expect(runCli(['verify', root])).resolves.toBe(1);
    expect(stdout()).toContain('tasks');

    // Freeze must refuse: the manifest is still frozen at v1 — no laundering.
    await expect(runCli(['freeze', root])).resolves.toBe(1);
    expect(stdout()).toContain("'frozen'");
    expect(stdout()).toContain('change');

    // The refusal wrote nothing: version unchanged, hashes not re-pinned.
    const manifestAfter = JSON.parse(readFileSync(join(root, 'spec', 'manifest.json'), 'utf8'));
    expect(manifestAfter).toEqual(manifestBefore);
    expect(manifestAfter.spec_version).toBe(1);
    expect(manifestAfter.state).toBe('frozen');

    // And verify STILL fails — the drift was not blessed away.
    await expect(runCli(['verify', root])).resolves.toBe(1);
  });
});

describe('runCli verify', () => {
  it('drift fixture -> exit 1 with the drifted key printed', async () => {
    const root = makeSpecRoot(loadBundle('bad/drift/bundle.json'));

    await expect(runCli(['verify', root])).resolves.toBe(1);
    expect(stdout()).toContain('tasks');
  });

  it('draft (unfrozen) spec dir -> exit 1 with manifest.state is not frozen', async () => {
    const root = makeSpecRoot(loadBundle('good/pet-clinic/bundle.json'));

    await expect(runCli(['verify', root])).resolves.toBe(1);
    expect(stdout()).toContain('manifest.state is not frozen');
  });

  it('compile failure short-circuits verify -> exit 2', async () => {
    const root = makeSpecRoot(loadBundle('bad/schema-invalid/bundle.json'));

    await expect(runCli(['verify', root])).resolves.toBe(2);
  });
});

describe('runCli change', () => {
  it('missing <changeset.json> argument -> usage on stderr', async () => {
    await expect(runCli(['change', '/tmp'])).resolves.toBe(2);
    expect(stderr()).toContain('changeset');
  });

  it('frozen spec + valid changeset -> exit 0, summary on stdout, files rewritten', async () => {
    const root = makeSpecRoot(inlineConforming());
    await expect(runCli(['freeze', root])).resolves.toBe(0);

    const csPath = join(root, 'changeset.json');
    writeFileSync(
      csPath,
      JSON.stringify({
        id: 'CP-0001',
        rationale: 't',
        modified_tasks: [{ task_id: 'TASK-0001', patch: { title: 'Updated title' } }],
      }),
    );

    await expect(runCli(['change', root, csPath])).resolves.toBe(0);
    expect(stdout()).toContain('spec_version 2');

    const manifest = JSON.parse(readFileSync(join(root, 'spec', 'manifest.json'), 'utf8'));
    expect(manifest.state).toBe('draft');
    expect(manifest.spec_version).toBe(2);
    expect('frozen_at' in manifest).toBe(false);
  });

  it('changeset against a draft spec -> exit 2 with the only-frozen reason', async () => {
    const root = makeSpecRoot(loadBundle('good/pet-clinic/bundle.json'));
    const csPath = join(root, 'changeset.json');
    writeFileSync(csPath, JSON.stringify({ id: 'CP-0001', rationale: 't' }));

    await expect(runCli(['change', root, csPath])).resolves.toBe(2);
    expect(stdout()).toContain('only a frozen spec can be changed');
  });
});

describe('runCli init', () => {
  it('fresh dir with --profile/--name -> exit 0, section files listed, scaffold compiles', async () => {
    const root = mkdtempSync(join(tmpdir(), 'spec-core-cli-init-'));
    tmpDirs.push(root);

    await expect(
      runCli(['init', root, '--profile', 'p-standard', '--name', 'wired-app']),
    ).resolves.toBe(0);
    expect(stdout()).toContain('spec/manifest.json');
    expect(stdout()).toContain('spec/tasks.json');

    // The wrapper-supplied nowIso landed in the manifest; the scaffold compiles.
    const compiled = await compileSpecDir(root);
    expect(compiled.ok).toBe(true);
    expect(compiled.bundle!.manifest.project.name).toBe('wired-app');
    expect(compiled.bundle!.manifest.complexity_profile).toBe('p-standard');
    expect(compiled.bundle!.manifest.evidence_snapshot.collected_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );
  });

  it('existing spec/ -> exit 2 with the refusal on stdout', async () => {
    const root = makeSpecRoot(loadBundle('good/pet-clinic/bundle.json'));

    await expect(runCli(['init', root])).resolves.toBe(2);
    expect(stdout()).toContain('refusing to overwrite existing spec/');
    // The existing spec was not touched: still the pet-clinic manifest.
    const manifest = JSON.parse(readFileSync(join(root, 'spec', 'manifest.json'), 'utf8'));
    expect(manifest.project.name).toBe('pet-clinic');
  });

  it('invalid --profile value -> usage on stderr, nothing written', async () => {
    const root = mkdtempSync(join(tmpdir(), 'spec-core-cli-init-bad-'));
    tmpDirs.push(root);

    await expect(runCli(['init', root, '--profile', 'p-huge'])).resolves.toBe(2);
    expect(stderr()).toContain('p-mini or p-standard');
    expect(existsSync(join(root, 'spec'))).toBe(false);
  });
});
