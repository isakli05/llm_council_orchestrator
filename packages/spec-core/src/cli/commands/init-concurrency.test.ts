import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileSpecDir } from '../../compiler/compile';

/**
 * DATA-001 acceptance (a), against the REAL built CLI (`dist/cli/index.js` —
 * the `pretest` script rebuilds dist before vitest starts, the same contract
 * the bin-contract and MCP spawn tests rely on):
 *
 * Two simultaneous `lco init` processes on the SAME target must produce
 * exactly ONE success. Before the atomic-revision work both interleaved their
 * section writes and BOTH exited 0, leaving a corrupt manifest (an extra `}`)
 * that could not compile. The inverse is pinned here: one process exits 0,
 * the other exits 2 with a clean structured refusal (lock held OR spec/
 * already exists — both are correct serializations), and the surviving spec
 * compiles.
 */

const CLI_JS = join(__dirname, '../../../dist/cli/index.js');

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

interface ChildOutcome {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Run `node dist/cli/index.js <args>` to completion, capturing the streams. */
function runCli(args: string[]): Promise<ChildOutcome> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_JS, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  tmpDirs.length = 0;
});

describe('DATA-001 (a): two concurrent real `lco init` processes on one target', () => {
  it('exactly ONE succeeds; the other refuses cleanly; the spec compiles', async () => {
    const root = mkdtempSync(join(tmpdir(), 'spec-core-init-race-'));
    tmpDirs.push(root);

    // Fire both simultaneously; the lock (or the under-lock no-clobber
    // re-check) must serialize them no matter how the scheduler interleaves.
    const [first, second] = await Promise.all([
      runCli(['init', root, '--name', 'race-app']),
      runCli(['init', root, '--name', 'race-app']),
    ]);

    const codes = [first.code, second.code].sort();
    expect(codes).toEqual([0, 2]);

    // The loser's refusal is clean and structured — either the lock refusal
    // (stderr, `lco: init failed: ... locked ...`) or the under-lock no-clobber
    // refusal (stdout, `refusing to overwrite existing spec/`). Which one
    // depends on whether the loser arrived while the winner held the lock or
    // after it finished; both are correct serializations.
    const loser = first.code === 2 ? first : second;
    const loserOutput = `${loser.stdout}\n${loser.stderr}`;
    expect(loserOutput.toLowerCase()).toMatch(/lock|refus/);
    // It never claimed success.
    expect(loser.stdout).not.toContain('initialized');

    // The winner's output is the normal init summary.
    const winner = first.code === 0 ? first : second;
    expect(winner.stdout).toContain('initialized');
    expect(winner.stderr).toBe('');

    // The surviving spec is exactly the 9 section files, valid JSON, and
    // COMPILES — the audit's corrupt-manifest outcome is impossible.
    expect(readdirSync(join(root, 'spec')).sort()).toEqual(
      SECTION_FILES.map((n) => `${n}.json`).sort(),
    );
    expect(() => JSON.parse(readFileSync(join(root, 'spec', 'manifest.json'), 'utf8'))).not.toThrow();
    const compiled = await compileSpecDir(root);
    expect(
      compiled.ok,
      compiled.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
    ).toBe(true);

    // No writer residue at the spec root (lock + staging cleaned up).
    expect(readdirSync(root)).toEqual(['spec']);
    expect(existsSync(join(root, '.lco-revision.lock'))).toBe(false);
  });
});
