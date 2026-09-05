import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertDisjointRealRoots,
  assertNoSymlinkBelow,
  checkMcpDir,
  PathEscapeError,
  readContainmentError,
  resolveContainedOutputPath,
  tryRealpath,
} from './paths';

/**
 * Branch-coverage remediation for the path-safety gates: the refusal and
 * rethrow arms that the happy-path tests never drive. All setups are real
 * filesystem state (no mocks, no races): a self-referential symlink makes
 * realpath fail ELOOP — a resolution error that is NOT ENOENT — and a path
 * whose PARENT is a regular file makes lstat/stat fail ENOTDIR.
 */

const tmpDirs: string[] = [];

function freshDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

/** A symlink pointing at itself: every realpath/stat below it fails ELOOP. */
function selfLoop(dir: string, name: string): string {
  const loop = join(dir, name);
  symlinkSync(loop, loop);
  return loop;
}

afterEach(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  tmpDirs.length = 0;
});

// --- tryRealpath: ENOENT is absence; every OTHER fs error propagates -----------------

describe('tryRealpath: non-ENOENT errors are never swallowed', () => {
  it('a symlink LOOP rethrows ELOOP (not undefined — a broken resolution is not "missing")', () => {
    const dir = freshDir('spec-core-bc-loop-');
    const loop = selfLoop(dir, 'loop');
    try {
      tryRealpath(loop);
      throw new Error('unreachable');
    } catch (err) {
      expect((err as NodeJS.ErrnoException).code).toBe('ELOOP');
    }
  });

  it('a path whose parent is a FILE rethrows ENOTDIR', () => {
    const dir = freshDir('spec-core-bc-notdir-');
    const file = join(dir, 'plainfile');
    writeFileSync(file, 'not a directory');
    try {
      tryRealpath(join(file, 'child'));
      throw new Error('unreachable');
    } catch (err) {
      expect((err as NodeJS.ErrnoException).code).toBe('ENOTDIR');
    }
  });
});

// --- readContainmentError: all four verdicts of the read gate ------------------------

describe('readContainmentError', () => {
  it('an ABSENT path is contained by definition (null — the compiler owns "missing file")', () => {
    const root = freshDir('spec-core-bc-rce-absent-');
    expect(readContainmentError(realpathSync(root), join(root, 'spec', 'missing.json'))).toBeNull();
  });

  it('a real file inside the root is contained (null)', () => {
    const root = freshDir('spec-core-bc-rce-inside-');
    mkdirSync(join(root, 'spec'));
    writeFileSync(join(root, 'spec', 'tasks.json'), '[]');
    expect(readContainmentError(realpathSync(root), join(root, 'spec', 'tasks.json'))).toBeNull();
  });

  it('a symlinked section file resolving OUTSIDE the root is a named path escape', () => {
    const root = freshDir('spec-core-bc-rce-escape-');
    const outside = freshDir('spec-core-bc-rce-out-');
    const victim = join(outside, 'secret.json');
    writeFileSync(victim, '{"x":1}');
    const link = join(root, 'tasks.json');
    symlinkSync(victim, link);

    const message = readContainmentError(realpathSync(root), link);
    expect(message).toContain('path escape');
    expect(message).toContain(realpathSync(root));
    expect(message).toContain(realpathSync(victim));
  });

  it('a path that cannot be RESOLVED (ELOOP) is treated as an escape, never as contained', () => {
    const root = freshDir('spec-core-bc-rce-unresolvable-');
    const loop = selfLoop(root, 'loop');
    const message = readContainmentError(realpathSync(root), loop);
    expect(message).toContain('cannot resolve');
    expect(message).toContain('treated as a path escape');
  });
});

// --- assertNoSymlinkBelow: lstat errors other than ENOENT ---------------------------

describe('assertNoSymlinkBelow: lstat error propagation', () => {
  it('an ENOTDIR component rethrows the raw error (an environment failure, not a verdict)', () => {
    const root = freshDir('spec-core-bc-lstat-');
    writeFileSync(join(root, 'plainfile'), 'a file');
    // The walk descends INTO what is actually a file: lstat fails ENOTDIR —
    // the gate must surface it, not silently pass (absent) or mislabel it.
    try {
      assertNoSymlinkBelow(root, ['plainfile', 'sub']);
      throw new Error('unreachable');
    } catch (err) {
      expect(err).not.toBeInstanceOf(PathEscapeError);
      expect((err as NodeJS.ErrnoException).code).toBe('ENOTDIR');
    }
  });

  it('an EXISTING real dir with a MISSING final file passes (the absent-tail return)', () => {
    const root = freshDir('spec-core-bc-absenttail-');
    mkdirSync(join(root, 'spec'));
    expect(() => assertNoSymlinkBelow(root, ['spec', 'manifest.json'])).not.toThrow();
  });
});

// --- assertDisjointRealRoots: unresolvable roots refuse ------------------------------

describe('assertDisjointRealRoots', () => {
  it('a project root that cannot be resolved (ELOOP) refuses with the resolve failure', () => {
    const dir = freshDir('spec-core-bc-disjoint-');
    const target = freshDir('spec-core-bc-disjoint-t-');
    const loop = selfLoop(dir, 'loop');
    const check = assertDisjointRealRoots(loop, target);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.message).toContain('cannot resolve project/target roots');
  });

  it('a TARGET root that cannot be resolved (ELOOP) refuses the same way', () => {
    const constdir = freshDir('spec-core-bc-disjoint2-');
    const loop = selfLoop(constdir, 'loop');
    const check = assertDisjointRealRoots(constdir, loop);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.message).toContain('cannot resolve project/target roots');
  });
});

// --- resolveContainedOutputPath: resolution failures, target overlap, no-follow ------

describe('resolveContainedOutputPath', () => {
  it('a project root that cannot be resolved (ELOOP) refuses naming the project root', () => {
    const dir = freshDir('spec-core-bc-out-proj-');
    const loop = selfLoop(dir, 'loop');
    const check = resolveContainedOutputPath({ projectDir: loop, out: join(dir, 'report') });
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.message).toContain('cannot resolve project root');
  });

  it('an OUTPUT path that cannot be resolved (ELOOP) refuses naming the output path', () => {
    const project = freshDir('spec-core-bc-out-out-');
    const loop = selfLoop(project, 'loop');
    const check = resolveContainedOutputPath({ projectDir: project, out: loop });
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.message).toContain('cannot resolve output path');
  });

  it('an output resolving INSIDE the analyzed target refuses even though it is inside the project', () => {
    const project = freshDir('spec-core-bc-out-target-');
    const target = join(project, 'target');
    mkdirSync(target);
    const check = resolveContainedOutputPath({
      projectDir: project,
      targetReal: realpathSync(target),
      out: join(target, 'report.md'),
    });
    // Lexically inside the project (the first gate passes), but the target is
    // read-only — defense in depth on top of disjointness must refuse it.
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.message).toContain('inside the analyzed target');
  });

  it('an output inside the project but NOT inside the target passes with the resolved path', () => {
    const project = freshDir('spec-core-bc-out-ok-');
    const elsewhere = join(project, 'elsewhere');
    mkdirSync(elsewhere);
    const check = resolveContainedOutputPath({
      projectDir: project,
      targetReal: realpathSync(elsewhere),
      out: join(project, 'report.md'),
    });
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.path).toBe(join(realpathSync(project), 'report.md'));
  });

  it('the output itself being a DANGLING symlink refuses via the no-follow walk (it would resolve "inside")', () => {
    const project = freshDir('spec-core-bc-out-dangling-');
    const dangling = join(project, 'export');
    symlinkSync(join(project, 'nowhere'), dangling);
    // resolveNearestExisting falls back to the lexical path (realpath of a
    // dangling link is ENOENT), so containment alone would accept it — only
    // the no-follow component walk sees the link and refuses the write.
    const check = resolveContainedOutputPath({ projectDir: project, out: dangling });
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.message).toContain('symlink');
  });
});

// --- checkMcpDir: an unresolvable `dir` fails closed ---------------------------------

describe('checkMcpDir', () => {
  it('a dir that cannot be RESOLVED (ELOOP) is refused before any root comparison', () => {
    const holder = freshDir('spec-core-bc-mcp-');
    const pin = freshDir('spec-core-bc-mcp-pin-');
    const loop = selfLoop(holder, 'loop');
    const check = checkMcpDir(loop, { root: pin, source: 'pin' });
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.message).toContain('cannot resolve dir');
  });
});
