import { describe, it, expect, afterEach } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PathEscapeError,
  assertNoSymlinkBelow,
  assertNotSymlink,
  assertWritableSpecDir,
  checkMcpDir,
  effectiveMcpRoot,
  isInside,
  resolveNearestExisting,
  tryRealpath,
} from './paths';

const tmpDirs: string[] = [];

function freshDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  tmpDirs.length = 0;
});

// --- isInside: realpath comparison, never prefix-string ----------------------------

describe('isInside', () => {
  it('identity: a path is inside itself', () => {
    expect(isInside('/a/b', '/a/b')).toBe(true);
  });

  it('a proper subpath is inside', () => {
    expect(isInside('/a/b', '/a/b/c/d.json')).toBe(true);
  });

  it('a sibling sharing a textual prefix is NOT inside (the string-prefix bug)', () => {
    expect(isInside('/a/b', '/a/bc')).toBe(false);
    expect(isInside('/a/b', '/a/b-evil')).toBe(false);
  });

  it('a parent is not inside its child', () => {
    expect(isInside('/a/b/c', '/a/b')).toBe(false);
  });
});

// --- tryRealpath / resolveNearestExisting -------------------------------------------

describe('tryRealpath', () => {
  it('resolves an existing path (symlinks followed)', () => {
    const real = freshDir('spec-core-paths-real-');
    const link = join(real, '..', 'paths-link-' + Date.now()); // sibling of real
    symlinkSync(real, link);
    tmpDirs.push(link);
    expect(tryRealpath(link)).toBe(tryRealpath(real));
  });

  it('undefined for a missing path (ENOENT is not an error)', () => {
    expect(tryRealpath(join(freshDir('spec-core-paths-missing-'), 'nope'))).toBeUndefined();
  });
});

describe('resolveNearestExisting', () => {
  it('existing dir -> its realpath', () => {
    const real = freshDir('spec-core-paths-res-');
    expect(resolveNearestExisting(real)).toBe(tryRealpath(real));
  });

  it('missing tail rejoined onto the nearest existing ancestor', () => {
    const real = freshDir('spec-core-paths-anc-');
    const resolved = resolveNearestExisting(join(real, 'a', 'b', 'c'));
    expect(resolved).toBe(join(tryRealpath(real)!, 'a', 'b', 'c'));
  });

  it('a symlinked ancestor is RESOLVED (legitimate reorganization normalizes)', () => {
    const real = freshDir('spec-core-paths-org-');
    const holder = freshDir('spec-core-paths-holder-');
    const link = join(holder, 'link');
    symlinkSync(real, link);
    // link/x/y exists? no — but link resolves to real, so the nearest existing
    // ancestor of link/x is real (via the symlink), not the holder.
    expect(resolveNearestExisting(join(link, 'x'))).toBe(join(tryRealpath(real)!, 'x'));
  });
});

// --- write-side symlink refusal -----------------------------------------------------

describe('assertNoSymlinkBelow', () => {
  it('a real tree passes (no false positives)', () => {
    const root = freshDir('spec-core-paths-clean-');
    mkdirSync(join(root, 'spec', 'evidence'), { recursive: true });
    expect(() => assertNoSymlinkBelow(root, ['spec', 'evidence'])).not.toThrow();
  });

  it('missing components pass (nothing to follow yet)', () => {
    const root = freshDir('spec-core-paths-absent-');
    expect(() => assertNoSymlinkBelow(root, ['spec', 'manifest.json'])).not.toThrow();
  });

  it('a symlinked DIRECTORY component is refused, naming the link (dir variant)', () => {
    const root = freshDir('spec-core-paths-dirlink-');
    const elsewhere = freshDir('spec-core-paths-elsewhere-');
    symlinkSync(elsewhere, join(root, 'spec'));
    try {
      assertNoSymlinkBelow(root, ['spec', 'evidence']);
      expect.unreachable('must refuse a symlinked spec dir');
    } catch (err) {
      expect(err).toBeInstanceOf(PathEscapeError);
      expect((err as PathEscapeError).path).toBe(join(root, 'spec'));
      expect((err as Error).message).toContain('symlink');
    }
  });

  it('a symlinked FILE target is refused, naming the link (file variant)', () => {
    const root = freshDir('spec-core-paths-filelink-');
    mkdirSync(join(root, 'spec'));
    const target = join(root, 'outside-manifest.json');
    writeFileSync(target, '{}');
    symlinkSync(target, join(root, 'spec', 'manifest.json'));
    try {
      assertNoSymlinkBelow(root, ['spec', 'manifest.json']);
      expect.unreachable('must refuse a symlinked write target');
    } catch (err) {
      expect(err).toBeInstanceOf(PathEscapeError);
      expect((err as PathEscapeError).path).toBe(join(root, 'spec', 'manifest.json'));
    }
  });

  it('a symlink pointing INSIDE the root is still refused for writes (no-follow)', () => {
    const root = freshDir('spec-core-paths-innerlink-');
    mkdirSync(join(root, 'spec'));
    writeFileSync(join(root, 'spec', 'real-tasks.json'), '[]');
    symlinkSync(join(root, 'spec', 'real-tasks.json'), join(root, 'spec', 'tasks.json'));
    expect(() => assertNoSymlinkBelow(root, ['spec', 'tasks.json'])).toThrow(PathEscapeError);
  });
});

describe('assertNotSymlink', () => {
  it('a real (or absent) path passes; a symlink — even DANGLING — is refused', () => {
    const root = freshDir('spec-core-paths-notlink-');
    expect(() => assertNotSymlink(join(root, 'spec'), 'spec dir')).not.toThrow();
    mkdirSync(join(root, 'spec'));
    expect(() => assertNotSymlink(join(root, 'spec'), 'spec dir')).not.toThrow();
    // dangling: target does not exist — existsSync-style checks miss this.
    symlinkSync(join(root, 'nowhere'), join(root, 'dangling'));
    expect(() => assertNotSymlink(join(root, 'dangling'), 'spec dir')).toThrow(PathEscapeError);
  });
});

describe('assertWritableSpecDir', () => {
  it('a normal spec dir with normal files passes', () => {
    const root = freshDir('spec-core-paths-writable-');
    mkdirSync(join(root, 'spec'));
    writeFileSync(join(root, 'spec', 'manifest.json'), '{}');
    expect(() => assertWritableSpecDir(root, ['manifest.json', 'tasks.json'])).not.toThrow();
  });

  it('a symlinked manifest.json write target is refused even though rename would clobber it', () => {
    const root = freshDir('spec-core-paths-swap-');
    mkdirSync(join(root, 'spec'));
    const victim = freshDir('spec-core-paths-victim-');
    writeFileSync(join(victim, 'secret.json'), '{"x":1}');
    symlinkSync(join(victim, 'secret.json'), join(root, 'spec', 'manifest.json'));
    expect(() => assertWritableSpecDir(root, ['manifest.json'])).toThrow(PathEscapeError);
  });
});

// --- MCP allowed-root policy (SEC-003 residual: the root is MANDATORY) ---------------
//
// There is no unpinned, policy-free branch anymore: every call carries an
// EFFECTIVE root — LCO_MCP_EXEC_ROOT when the operator pinned the process,
// otherwise the server's working directory — and every dir must resolve
// inside it. The old "no pin: any dir" tests pinned the optional-policy
// defect the audit residual rejects and were replaced by their inverses.

describe('effectiveMcpRoot', () => {
  it('no pin -> the server working directory (source cwd)', () => {
    expect(effectiveMcpRoot(undefined, '/w/dir')).toEqual({ root: '/w/dir', source: 'cwd' });
  });

  it('pin set -> the pin value (source pin)', () => {
    expect(effectiveMcpRoot('/pinned', '/w/dir')).toEqual({ root: '/pinned', source: 'pin' });
  });

  it('defaults to the real process.cwd()', () => {
    expect(effectiveMcpRoot(undefined)).toEqual({ root: process.cwd(), source: 'cwd' });
  });
});

describe('checkMcpDir', () => {
  it('cwd root: a dir inside the working directory is accepted and REALPATH-NORMALIZED', () => {
    const base = freshDir('spec-core-paths-cwd-');
    const real = mkdirSync(join(base, 'work'), { recursive: true });
    void real;
    const holder = freshDir('spec-core-paths-cwdhold-');
    const link = join(holder, 'link');
    symlinkSync(join(base, 'work'), link);
    const check = checkMcpDir(link, { root: base, source: 'cwd' });
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.dir).toBe(tryRealpath(join(base, 'work')));
  });

  it('cwd root: a dir OUTSIDE the working directory is refused naming the working directory', () => {
    const base = freshDir('spec-core-paths-cwdin-');
    const outside = freshDir('spec-core-paths-cwdout-');
    const check = checkMcpDir(outside, { root: base, source: 'cwd' });
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.message).toContain('working directory');
      expect(check.message).toContain(base);
    }
  });

  it('cwd root: a NOT-yet-existing dir INSIDE the working directory resolves via its nearest existing ancestor', () => {
    const base = freshDir('spec-core-paths-cwdcreate-');
    const check = checkMcpDir(join(base, 'new-spec-root'), { root: base, source: 'cwd' });
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.dir).toBe(join(tryRealpath(base)!, 'new-spec-root'));
  });

  it('cwd root that does not resolve -> fail closed for every dir', () => {
    const ghost = join(freshDir('spec-core-paths-cwdghost-'), 'deleted');
    const check = checkMcpDir(tmpdir(), { root: ghost, source: 'cwd' });
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.message).toContain('working directory');
  });

  it('pin set + dir inside -> accepted (normalized to the real root)', () => {
    const pin = freshDir('spec-core-paths-pinin-');
    const work = join(pin, 'work');
    mkdirSync(work);
    const check = checkMcpDir(work, { root: pin, source: 'pin' });
    expect(check.ok).toBe(true);
  });

  it('pin set + dir outside -> refused naming LCO_MCP_EXEC_ROOT', () => {
    const pin = freshDir('spec-core-paths-pinout-');
    const outside = freshDir('spec-core-paths-outside-');
    const check = checkMcpDir(outside, { root: pin, source: 'pin' });
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.message).toContain('LCO_MCP_EXEC_ROOT');
  });

  it('pin set + dir through a symlink that escapes the pin -> refused (realpath, not prefix)', () => {
    const pin = freshDir('spec-core-paths-pinescape-');
    const elsewhere = freshDir('spec-core-paths-elsewhere2-');
    // A link INSIDE the pin that resolves OUTSIDE it: the lexical path
    // `pin/escape-link` satisfies the OLD T9 prefix check
    // (resolve(dir).startsWith(resolve(execRoot))), but its realpath escapes —
    // only a realpath comparison refuses it.
    symlinkSync(elsewhere, join(pin, 'escape-link'));
    const check = checkMcpDir(join(pin, 'escape-link'), { root: pin, source: 'pin' });
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.message).toContain('LCO_MCP_EXEC_ROOT');
  });

  it('pin set + pin itself missing -> fail closed for every dir', () => {
    const check = checkMcpDir(tmpdir(), {
      root: join(tmpdir(), 'definitely-not-here-xyz'),
      source: 'pin',
    });
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.message).toContain('LCO_MCP_EXEC_ROOT');
  });

  it('pin set + pin resolves to a FILE (not a directory) -> fail closed for every dir', () => {
    const holder = freshDir('spec-core-paths-pinfile-');
    const file = join(holder, 'pin-is-a-file');
    writeFileSync(file, 'not a directory');
    const check = checkMcpDir(tmpdir(), { root: file, source: 'pin' });
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.message).toContain('LCO_MCP_EXEC_ROOT');
  });

  it('pin set + not-yet-existing dir INSIDE the pin -> accepted (init/generate creation path)', () => {
    const pin = freshDir('spec-core-paths-pincreate-');
    const check = checkMcpDir(join(pin, 'fresh'), { root: pin, source: 'pin' });
    expect(check.ok).toBe(true);
  });

  it('pin set + not-yet-existing dir OUTSIDE the pin -> refused', () => {
    const pin = freshDir('spec-core-paths-pinno-');
    const other = freshDir('spec-core-paths-other-');
    const check = checkMcpDir(join(other, 'fresh'), { root: pin, source: 'pin' });
    expect(check.ok).toBe(false);
  });

  it('empty dir is refused (never resolves)', () => {
    const check = checkMcpDir('', { root: process.cwd(), source: 'cwd' });
    expect(check.ok).toBe(false);
  });
});

// --- readdir sanity used by sibling tests (keeps this file self-contained) -----------

describe('PathEscapeError shape', () => {
  it('is a structured error: name + path + message name the link', () => {
    const err = new PathEscapeError('/a/b/spec', 'is a symlink');
    expect(err.name).toBe('PathEscapeError');
    expect(err.path).toBe('/a/b/spec');
    expect(err.message).toContain('/a/b/spec');
    expect(err.message).toContain('symlink');
  });
});
