import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * T20 rider (TEST-003): the BOUNDARY half of the publish gate. The pure
 * decision table (src/release/readiness.ts) is suite-covered; this file
 * covers the wrapper's own plumbing — scripts/prepublish-check.js spawning
 * git, reading package.json, loading dist/release/readiness.js, and mapping
 * the decision to an exit code. It runs the real script (no injection)
 * against a THROWAWAY git repo so the repo checkout is never touched.
 *
 * The script resolves package.json and dist/ relative to ITS OWN location,
 * so only the GIT state comes from the cwd we control — which is exactly the
 * boundary under test. pretest builds dist/ before the suite, so the
 * readiness module is present (same contract as every dist-dependent test).
 */
describe('scripts/prepublish-check.js — spawn/exit-code boundary (T20)', () => {
  const tmpDirs: string[] = [];
  afterEach(() => {
    for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
    tmpDirs.length = 0;
  });

  const SCRIPT = join(__dirname, '../../scripts/prepublish-check.js');
  const PKG_VERSION = (
    JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8')) as {
      version: string;
    }
  ).version;

  /** git in the temp repo, with a throwaway identity (no global config). */
  function git(repo: string, ...args: string[]) {
    return spawnSync('git', ['-c', 'user.email=t@t.local', '-c', 'user.name=t', ...args], {
      cwd: repo,
      encoding: 'utf8',
    });
  }

  /** A fresh git repo with ONE committed file, optionally dirtied/tagged. */
  function makeRepo(opts: { dirty?: boolean; tag?: string }): string {
    const repo = mkdtempSync(join(tmpdir(), 'spec-core-prepublish-'));
    tmpDirs.push(repo);
    git(repo, 'init', '-q');
    writeFileSync(join(repo, 'placeholder.txt'), 'content\n');
    expect(git(repo, 'add', '-A').status).toBe(0);
    expect(git(repo, 'commit', '-q', '-m', 'test commit').status).toBe(0);
    if (opts.tag) expect(git(repo, 'tag', opts.tag).status).toBe(0);
    if (opts.dirty) writeFileSync(join(repo, 'uncommitted.txt'), 'dirt\n');
    return repo;
  }

  function runScript(repo: string) {
    return spawnSync(process.execPath, [SCRIPT], { cwd: repo, encoding: 'utf8' });
  }

  it('dirty tree (untracked file) -> exit 1 with a REFUSING message', () => {
    const repo = makeRepo({ dirty: true });
    const r = runScript(repo);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('REFUSING to publish');
    expect(r.stderr).toContain('dirty');
  }, 60_000);

  it('clean tree at exact tag v<pkg.version> -> exit 0 with the OK line', () => {
    const repo = makeRepo({ tag: `v${PKG_VERSION}` });
    const r = runScript(repo);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('prepublish-check: OK');
    expect(r.stdout).toContain(`v${PKG_VERSION}`);
    // The gate is read-only: the repo saw no new or changed files.
    expect(git(repo, 'status', '--porcelain').stdout.trim()).toBe('');
  }, 60_000);

  it('clean tree with NO tag -> exit 1 (the untagged refusal also plumbs through)', () => {
    const repo = makeRepo({});
    const r = runScript(repo);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('REFUSING to publish');
    expect(r.stderr).toContain('tag');
  }, 60_000);
});
