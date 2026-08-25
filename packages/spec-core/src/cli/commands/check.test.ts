import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import {
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
import { cmdCheck } from './check';
import { cmdInit } from './init';
import { runCli } from '../index';
import type { TaskContract } from '../../schemas';

const FIXTURES = join(__dirname, '../../../fixtures');
const NOW = '2026-08-25T12:00:00Z';

/** Section files written under spec/ (mirrors cli.test.ts). */
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

function freshRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(root);
  return root;
}

function makeSpecRoot(bundle: Record<string, unknown>): string {
  const root = freshRoot('spec-core-check-cmd-');
  const spec = join(root, 'spec');
  mkdirSync(spec);
  for (const name of [...SECTION_FILES, 'legacy'] as const) {
    if (bundle[name] === undefined) continue;
    writeFileSync(join(spec, `${name}.json`), JSON.stringify(bundle[name], null, 2));
  }
  return root;
}

/** An init'd p-mini scaffold in a fresh tmp dir (its TASK-0001 runs `node --version`). */
async function initRoot(prefix: string): Promise<string> {
  const root = freshRoot(prefix);
  const result = await cmdInit(root, { profile: 'p-mini', name: 'smoke-app', nowIso: NOW });
  expect(result.code).toBe(0);
  return root;
}

/** Rewrite TASK-0001's verification on disk (scaffold stays schema-valid). */
function patchTask1Verification(root: string, entries: Array<{ command: string; expect: string }>): void {
  const file = join(root, 'spec', 'tasks.json');
  const tasks = JSON.parse(readFileSync(file, 'utf8')) as TaskContract[];
  tasks[0].verification = entries;
  writeFileSync(file, JSON.stringify(tasks, null, 2), 'utf8');
}

function evidenceOf(root: string, taskId: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(root, 'spec', 'evidence', `${taskId}-check.json`), 'utf8')) as Record<string, unknown>;
}

afterEach(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  tmpDirs.length = 0;
});

// --- compile failure (exit 2) ----------------------------------------------------

describe('cmdCheck: compile failure', () => {
  it('schema-invalid dir -> code 2 with the compile errors in the output', async () => {
    const root = makeSpecRoot(loadBundle('bad/schema-invalid/bundle.json'));

    const result = await cmdCheck(root, { yes: false, nowIso: NOW });

    expect(result.code).toBe(2);
    expect(result.output).toContain('compile FAILED');
    expect(result.output).toContain('manifest.spec_version');
    expect(existsSync(join(root, 'spec', 'evidence'))).toBe(false);
  });
});

// --- DRY (default): table, no execution, no evidence ------------------------------

describe('cmdCheck: DRY RUN (default)', () => {
  it('pet-clinic -> code 0, loud dry-run banner, full command+expect table, no evidence', async () => {
    const root = makeSpecRoot(loadBundle('good/pet-clinic/bundle.json'));

    const result = await cmdCheck(root, { yes: false, nowIso: NOW });

    expect(result.code).toBe(0);
    expect(result.output).toContain('DRY RUN — no commands executed; pass --yes to execute');

    // The table carries every task's real command and expect text (derived
    // from the bundle, not hardcoded): the dry run IS the preview surface.
    const tasks = loadBundle('good/pet-clinic/bundle.json').tasks as TaskContract[];
    expect(result.output).toContain('TASK\tCOMMAND\tEXPECT\tEXPECTED→ACTUAL\tSTATUS');
    for (const t of tasks) {
      const v = t.verification[0];
      expect(result.output).toContain(`${t.task_id}\t${v.command}\t${v.expect}\t? → -\tDRY`);
    }
    // pet-clinic's 'exit code 0, ...' prose is not judgeable -> expected '?'.
    expect(result.output).toContain('0 pass, 0 fail, 3 dry');
    expect(existsSync(join(root, 'spec', 'evidence'))).toBe(false);
  });
});

// --- unknown task (exit 2) ---------------------------------------------------------

describe('cmdCheck: unknown --task', () => {
  it('unknown task id -> code 2 with an explicit unknown-task message', async () => {
    const root = await initRoot('spec-core-check-unknown-');

    const result = await cmdCheck(root, { task: 'TASK-9999', yes: false, nowIso: NOW });

    expect(result.code).toBe(2);
    expect(result.output).toContain('unknown task');
    expect(result.output).toContain('TASK-9999');
  });
});

// --- REAL-process smokes (--yes executes through the production Executor) ----------

describe('cmdCheck --yes: real-process smokes', () => {
  it("init'd scaffold (`node --version`, expect `exit 0`) -> PASS, exit 0, evidence file written", async () => {
    const root = await initRoot('spec-core-check-smoke-version-');

    const result = await cmdCheck(root, { yes: true, nowIso: NOW });

    expect(result.code).toBe(0);
    expect(result.output).toContain('TASK-0001\tnode --version\texit 0\t0 → 0\tPASS');
    expect(result.output).toContain('1 pass, 0 fail, 0 dry');
    expect(result.output).toContain('spec/evidence/TASK-0001-check.json');

    const stored = evidenceOf(root, 'TASK-0001');
    expect(stored).toEqual({
      task_id: 'TASK-0001',
      checkedAt: NOW,
      checks: [
        {
          command: 'node --version',
          expect: 'exit 0',
          expectedExit: 0,
          actualExit: 0,
          status: 'PASS',
          durationMs: expect.any(Number),
          outputTail: expect.any(String),
        },
      ],
    });
    // The captured tail really is the process output (a node version string).
    const tail = (stored.checks as Array<{ outputTail: string }>)[0].outputTail;
    expect(tail).toMatch(/v\d+\.\d+/);
    expect(readdirSync(join(root, 'spec', 'evidence'))).toEqual(['TASK-0001-check.json']);
  });

  it('`node -e "process.exit(7)"` with expect `exit 7` -> PASS (nonzero codes are judgeable)', async () => {
    const root = await initRoot('spec-core-check-smoke-exit7-');
    patchTask1Verification(root, [{ command: 'node -e "process.exit(7)"', expect: 'exit 7' }]);

    const result = await cmdCheck(root, { yes: true, nowIso: NOW });

    expect(result.code).toBe(0);
    expect(result.output).toContain('7 → 7');
    expect(result.output).toContain('\tPASS');
    expect(evidenceOf(root, 'TASK-0001').checks).toHaveLength(1);
  });

  it('nonzero mismatch (`exit 3` vs expected 0) -> FAIL, exit 1', async () => {
    const root = await initRoot('spec-core-check-smoke-fail-');
    patchTask1Verification(root, [{ command: 'node -e "process.exit(3)"', expect: 'exit 0' }]);

    const result = await cmdCheck(root, { yes: true, nowIso: NOW });

    expect(result.code).toBe(1);
    expect(result.output).toContain('0 → 3\tFAIL');
    expect(result.output).toContain('0 pass, 1 fail, 0 dry');
    expect((evidenceOf(root, 'TASK-0001').checks as Array<{ status: string }>)[0].status).toBe('FAIL');
  });

  it('production executor kill: a hanging command at --timeout-ms 100 -> TIMEOUT, exit 1', async () => {
    const root = await initRoot('spec-core-check-smoke-timeout-');
    patchTask1Verification(root, [
      { command: 'node -e "setTimeout(() => {}, 30000)"', expect: 'exit 0' },
    ]);

    const started = Date.now();
    const result = await cmdCheck(root, { yes: true, timeoutMs: 100, nowIso: NOW });
    const wall = Date.now() - started;

    expect(result.code).toBe(1);
    expect(result.output).toContain('TIMEOUT');
    expect(wall).toBeLessThan(10_000); // killed at the timeout, not left hanging
    expect((evidenceOf(root, 'TASK-0001').checks as Array<{ status: string }>)[0].status).toBe('TIMEOUT');
  });
});

// --- runCli wiring -------------------------------------------------------------------

describe('runCli wiring: lco check <dir> [--task] [--yes] [--timeout-ms]', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function stdout(): string {
    return logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
  }

  it('DRY through the wrapper -> exit 0, banner printed, usage lists check', async () => {
    const root = makeSpecRoot(loadBundle('good/pet-clinic/bundle.json'));

    await expect(runCli(['check', root])).resolves.toBe(0);
    expect(stdout()).toContain('DRY RUN — no commands executed; pass --yes to execute');

    await expect(runCli([])).resolves.toBe(2);
    expect(errorSpy.mock.calls.map((c) => c.join(' ')).join('\n')).toContain('check <dir>');
  });

  it('--yes through the wrapper executes for real and returns the core code (init scaffold)', async () => {
    const root = await initRoot('spec-core-check-wired-');

    await expect(runCli(['check', root, '--yes'])).resolves.toBe(0);
    expect(stdout()).toContain('\tPASS');
    expect(existsSync(join(root, 'spec', 'evidence', 'TASK-0001-check.json'))).toBe(true);
  });

  it('--task filters (unknown id -> exit 2 through the wrapper)', async () => {
    const root = makeSpecRoot(loadBundle('good/pet-clinic/bundle.json'));
    await expect(runCli(['check', root, '--task', 'TASK-0001'])).resolves.toBe(0);
    expect(stdout()).toContain('TASK-0001');
    expect(stdout()).not.toContain('TASK-0002\t');

    await expect(runCli(['check', root, '--task', 'TASK-9999'])).resolves.toBe(2);
  });

  it('malformed flags -> usage errors (exit 2): unknown flag, missing --task value, bad --timeout-ms', async () => {
    const root = makeSpecRoot(loadBundle('good/pet-clinic/bundle.json'));
    await expect(runCli(['check', root, '--force'])).resolves.toBe(2);
    await expect(runCli(['check', root, '--task'])).resolves.toBe(2);
    await expect(runCli(['check', root, '--timeout-ms', 'soon'])).resolves.toBe(2);
    await expect(runCli(['check', root, '--timeout-ms', '0'])).resolves.toBe(2);
    await expect(runCli(['check'])).resolves.toBe(2);
  });
});
