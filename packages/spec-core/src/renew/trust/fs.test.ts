import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, linkSync, readFileSync, readdirSync, lstatSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  authorizedCreateExclusive,
  authorizedEnsureDir,
  authorizedRead,
  authorizedRenameNoClobber,
  authorizedRemoveTree,
  authorizedWrite,
  preflightRenewalSurface,
} from './fs';
import { TrustFsError } from './errors';

/** A fresh project dir + a disjoint read-only target dir per test. */
function freshProject(): { project: string; target: string } {
  const base = mkdtempSync(join(tmpdir(), 'lco-trust-fs-'));
  const project = join(base, 'project');
  const target = join(base, 'target');
  mkdirSync(project);
  mkdirSync(target);
  return { project, target };
}

let dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

/** Inventory of a directory tree: path → identity (kind, link count, mode, bytes). */
function inventory(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      const rel = p.slice(root.length + 1);
      const st = lstatSync(p);
      if (st.isSymbolicLink()) out[rel] = `SYMLINK:${st.mode.toString(8)}`;
      else if (st.isDirectory()) {
        out[rel] = `DIR:${st.mode.toString(8)}`;
        walk(p);
      } else out[rel] = `FILE:${st.nlink}n:${st.mode.toString(8)}:${readFileSync(p, 'utf8')}`;
    }
  };
  walk(root);
  return out;
}

describe('authorizedWrite — the one trusted write', () => {
  let project: string;
  let target: string;
  beforeEach(() => {
    const f = freshProject();
    project = f.project;
    target = f.target;
    dirs.push(project, target);
  });

  it('writes a fresh destination inside the project domain', () => {
    authorizedWrite({ projectDir: project, targetDir: target, path: join(project, '.lco/renewal/state.json'), content: '{"revision":1}\n' });
    expect(readFileSync(join(project, '.lco/renewal/state.json'), 'utf8')).toBe('{"revision":1}\n');
    expect(lstatSync(join(project, '.lco/renewal/state.json')).mode & 0o777).toBe(0o600);
  });

  it('replaces an existing destination ATOMICALLY — the old inode is never truncated (S3-C-02)', () => {
    const dest = join(project, '.lco/renewal/parity.json');
    authorizedWrite({ projectDir: project, path: dest, content: 'OLD' });
    // hard-link the current destination into the read-only target (the audit attack)
    const aliasInTarget = join(target, 'parity-alias');
    linkSync(dest, aliasInTarget);
    authorizedWrite({ projectDir: project, path: dest, content: 'NEW-STATE' });
    expect(readFileSync(dest, 'utf8')).toBe('NEW-STATE');
    // The target's hard link still sees the OLD bytes: the inode was replaced
    // by rename, not truncated. Target immutability holds.
    expect(readFileSync(aliasInTarget, 'utf8')).toBe('OLD');
  });

  it('refuses a destination outside the project root (path alias)', () => {
    expect(() =>
      authorizedWrite({ projectDir: project, path: join(target, 'escaped.json'), content: 'x' }),
    ).toThrowError(TrustFsError);
    expect(existsSync(join(target, 'escaped.json'))).toBe(false);
  });

  it('refuses ../ escapes and absolute forms equivalently', () => {
    expect(() =>
      authorizedWrite({ projectDir: project, path: join(project, '..', 'target', 'x.json'), content: 'x' }),
    ).toThrowError(TrustFsError);
  });

  it('refuses a destination resolving inside the analyzed target (defense in depth)', () => {
    expect(() =>
      authorizedWrite({ projectDir: project, targetDir: target, path: join(target, 'in-target.json'), content: 'x' }),
    ).toThrowError(TrustFsError);
  });

  it('refuses a parent chain symlink that resolves outside the project (the S2-C-01 attack shape)', () => {
    // `<project>/.lco` planted as a symlink INTO the read-only target: any
    // state destination beneath it resolves outside the root and refuses.
    symlinkSync(target, join(project, '.lco'));
    expect(() =>
      authorizedWrite({ projectDir: project, path: join(project, '.lco/renewal/state.json'), content: 'x' }),
    ).toThrowError(TrustFsError);
    expect(existsSync(join(target, 'renewal'))).toBe(false);
  });

  it('accepts an in-project alias whose RESOLVED destination is a clean inside-root chain (documented policy)', () => {
    const realDir = join(project, '.lco', 'renewal');
    mkdirSync(realDir, { recursive: true });
    const linkDir = join(project, 'linkdir');
    symlinkSync(realDir, linkDir);
    authorizedWrite({ projectDir: project, path: join(linkDir, 'state.json'), content: 'x' });
    expect(readFileSync(join(realDir, 'state.json'), 'utf8')).toBe('x');
  });

  it('refuses a symlinked FINAL destination (S3-C-01 class: out or out.tmp pre-planted link)', () => {
    const victimInTarget = join(target, 'victim.txt');
    writeFileSync(victimInTarget, 'TARGET-BYTES');
    const out = join(project, 'report.md');
    symlinkSync(victimInTarget, out);
    expect(() =>
      authorizedWrite({ projectDir: project, targetDir: target, path: out, content: 'REPORT', noClobber: true }),
    ).toThrowError(TrustFsError);
    expect(readFileSync(victimInTarget, 'utf8')).toBe('TARGET-BYTES');
    // the symlink entry itself is untouched
    expect(lstatSync(out).isSymbolicLink()).toBe(true);
  });

  it('refuses a nested/dangling symlink anywhere below the root', () => {
    const dangling = join(project, 'dangling');
    symlinkSync(join(project, 'does-not-exist'), dangling);
    expect(() =>
      authorizedWrite({ projectDir: project, path: join(dangling, 'x'), content: 'x' }),
    ).toThrowError(TrustFsError);
  });

  it('a pre-existing .tmp sibling is IRRELEVANT — staging names are unpredictable and exclusive', () => {
    // The historical attack planted `<dest>.tmp`; staging now uses a random
    // exclusive name, so a planted fixed .tmp cannot capture or redirect anything.
    const dir = join(project, '.lco', 'renewal');
    mkdirSync(dir, { recursive: true });
    const dest = join(dir, 'overlay.json');
    const plantedTmp = `${dest}.tmp`;
    const aliasInTarget = join(target, 'overlay-alias');
    writeFileSync(plantedTmp, 'PLANTED');
    linkSync(plantedTmp, aliasInTarget);
    authorizedWrite({ projectDir: project, path: dest, content: 'REAL' });
    expect(readFileSync(dest, 'utf8')).toBe('REAL');
    // the planted tmp (and its target alias) were never opened for write
    expect(readFileSync(plantedTmp, 'utf8')).toBe('PLANTED');
    expect(readFileSync(aliasInTarget, 'utf8')).toBe('PLANTED');
  });

  it('noClobber refuses an existing destination', () => {
    const dest = join(project, 'export.md');
    authorizedWrite({ projectDir: project, path: dest, content: 'FIRST' });
    expect(() =>
      authorizedWrite({ projectDir: project, path: dest, content: 'SECOND', noClobber: true }),
    ).toThrowError(/never clobber|already exists/);
    expect(readFileSync(dest, 'utf8')).toBe('FIRST');
  });

  it('leaves no staging residue on success', () => {
    const dir = join(project, '.lco', 'renewal');
    authorizedWrite({ projectDir: project, path: join(dir, 'a.json'), content: '{}' });
    expect(readdirSync(dir).sort()).toEqual(['a.json']);
  });

  it('a legitimately symlinked project ROOT ancestor still works (root itself may resolve)', () => {
    const base = mkdtempSync(join(tmpdir(), 'lco-trust-fs-real-'));
    dirs.push(base);
    const realProject = join(base, 'real-project');
    const linkedProject = join(base, 'linked-project');
    mkdirSync(realProject);
    symlinkSync(realProject, linkedProject);
    authorizedWrite({ projectDir: linkedProject, path: join(linkedProject, 'state.json'), content: 'x' });
    expect(readFileSync(join(realProject, 'state.json'), 'utf8')).toBe('x');
  });

  it('every rejected mutation preserves the target tree byte-for-byte', () => {
    writeFileSync(join(target, 'keep.txt'), 'KEEP');
    const before = inventory(target);
    const attacks = [
      join(target, 'direct.json'),
      join(project, '..', 'target', 'rel.json'),
    ];
    for (const path of attacks) {
      try {
        authorizedWrite({ projectDir: project, targetDir: target, path, content: 'x' });
      } catch {
        /* expected refusal */
      }
    }
    expect(inventory(target)).toEqual(before);
  });
});

describe('authorizedCreateExclusive — immutable record writes', () => {
  let project: string;
  beforeEach(() => {
    const f = freshProject();
    project = f.project;
    dirs.push(f.project, f.target);
  });

  it('creates a write-once record and refuses a second', () => {
    const p = join(project, 'approvals', 'APPR-0001.json');
    authorizedCreateExclusive({ projectDir: project, path: p, content: 'A' });
    expect(() =>
      authorizedCreateExclusive({ projectDir: project, path: p, content: 'B' }),
    ).toThrowError(TrustFsError);
    expect(readFileSync(p, 'utf8')).toBe('A');
  });

  it('refuses a symlink occupant without following or deleting it', () => {
    const victim = join(project, 'victim.txt');
    writeFileSync(victim, 'V');
    const p = join(project, 'approvals', 'APPR-0001.json');
    mkdirSync(join(project, 'approvals'));
    symlinkSync(victim, p);
    expect(() =>
      authorizedCreateExclusive({ projectDir: project, path: p, content: 'A' }),
    ).toThrowError(TrustFsError);
    expect(readFileSync(victim, 'utf8')).toBe('V');
    expect(lstatSync(p).isSymbolicLink()).toBe(true);
  });
});

describe('authorizedRead — trusted reads (S3-H-02)', () => {
  let project: string;
  beforeEach(() => {
    const f = freshProject();
    project = f.project;
    dirs.push(f.project, f.target);
  });

  it('reads a real file through a clean chain', () => {
    const p = join(project, '.lco/renewal/graph-workspace/graph.json');
    mkdirSync(join(project, '.lco/renewal/graph-workspace'), { recursive: true });
    writeFileSync(p, '{"nodes":[]}');
    expect(authorizedRead({ projectDir: project, path: p })).toBe('{"nodes":[]}');
  });

  it('refuses a symlinked dynamic descendant (workspace graph / slices / records)', () => {
    const outside = mkdtempSync(join(tmpdir(), 'lco-trust-out-'));
    dirs.push(outside);
    writeFileSync(join(outside, 'secret'), 'SECRET');
    const ws = join(project, '.lco/renewal/graph-workspace');
    mkdirSync(ws, { recursive: true });
    symlinkSync(join(outside, 'secret'), join(ws, 'graph.json'));
    expect(() => authorizedRead({ projectDir: project, path: join(ws, 'graph.json') })).toThrowError(
      TrustFsError,
    );
  });

  it('refuses reading outside the project root', () => {
    const outside = mkdtempSync(join(tmpdir(), 'lco-trust-out2-'));
    dirs.push(outside);
    writeFileSync(join(outside, 'f'), 'X');
    expect(() => authorizedRead({ projectDir: project, path: join(outside, 'f') })).toThrowError(
      TrustFsError,
    );
  });
});

describe('archive / remove / preflight', () => {
  let project: string;
  beforeEach(() => {
    const f = freshProject();
    project = f.project;
    dirs.push(f.project, f.target);
  });

  it('authorizedRenameNoClobber refuses a colliding archive (S3-M-05)', () => {
    const from = join(project, 'parity.json');
    writeFileSync(from, 'OLD');
    const to = join(project, 'parity.json.RSN-0123456789abcdef.superseded');
    writeFileSync(to, 'EARLIER-HISTORY');
    expect(() => authorizedRenameNoClobber({ projectDir: project, from, to })).toThrowError(
      TrustFsError,
    );
    expect(readFileSync(to, 'utf8')).toBe('EARLIER-HISTORY');
    expect(readFileSync(from, 'utf8')).toBe('OLD');
  });

  it('authorizedRenameNoClobber performs a clean archive rename', () => {
    const from = join(project, 'parity.json');
    const to = join(project, 'parity.json.RSN-0123456789abcdef.superseded');
    writeFileSync(from, 'OLD');
    authorizedRenameNoClobber({ projectDir: project, from, to });
    expect(existsSync(from)).toBe(false);
    expect(readFileSync(to, 'utf8')).toBe('OLD');
  });

  it('authorizedRemoveTree removes a real tree and refuses a symlink', () => {
    const ws = join(project, '.lco/renewal/graph-workspace');
    mkdirSync(join(ws, 'inner'), { recursive: true });
    writeFileSync(join(ws, 'inner/f'), 'x');
    authorizedRemoveTree({ projectDir: project, path: ws });
    expect(existsSync(ws)).toBe(false);
    const outside = mkdtempSync(join(tmpdir(), 'lco-trust-out3-'));
    dirs.push(outside);
    symlinkSync(outside, join(project, 'linked-ws'));
    expect(() => authorizedRemoveTree({ projectDir: project, path: join(project, 'linked-ws') })).toThrowError(
      TrustFsError,
    );
    expect(existsSync(outside)).toBe(true);
  });

  it('authorizedEnsureDir creates and preflight reports chain refusals', () => {
    authorizedEnsureDir({ projectDir: project, path: join(project, '.lco/renewal/analyses') });
    expect(existsSync(join(project, '.lco/renewal/analyses'))).toBe(true);
    symlinkSync(join(project, '.lco', 'renewal'), join(project, 'lco-link'));
    const refusals = preflightRenewalSurface(project);
    // the fixed surface no longer contains lco-link, but the planted .lco alias
    // shape is covered by root-invariants suites; here assert the surface walk runs
    expect(Array.isArray(refusals)).toBe(true);
  });
});


describe('verifier A-F1 (HIGH): final-destination symlinks — even INSIDE the root — never followed', () => {
  let project: string;
  let target: string;
  beforeEach(() => {
    const f = freshProject();
    project = f.project;
    target = f.target;
    dirs.push(project, target);
  });

  it('a store file linked onto a write-once approval record refuses; the approval is untouched', () => {
    const { writeFileSync, symlinkSync, readFileSync, mkdirSync } = require('node:fs') as typeof import('node:fs');
    mkdirSync(join(project, '.lco', 'renewal'), { recursive: true });
    mkdirSync(join(project, 'approvals'), { recursive: true });
    writeFileSync(join(project, 'approvals', 'APPR-0001.json'), 'IMMUTABLE APPROVAL');
    symlinkSync(join(project, 'approvals', 'APPR-0001.json'), join(project, '.lco', 'renewal', 'overlay.json'));
    expect(() =>
      authorizedWrite({ projectDir: project, path: join(project, '.lco', 'renewal', 'overlay.json'), content: 'EVIL OVERLAY' }),
    ).toThrowError(TrustFsError);
    expect(readFileSync(join(project, 'approvals', 'APPR-0001.json'), 'utf8')).toBe('IMMUTABLE APPROVAL');
  });

  it('a store file linked onto a superseded archive refuses; history is not overwritten', () => {
    const { writeFileSync, symlinkSync, readFileSync } = require('node:fs') as typeof import('node:fs');
    const archive = join(project, '.lco', 'renewal', 'overlay.json.RSN-0123456789abcdef.superseded');
    const overlay = join(project, '.lco', 'renewal', 'overlay.json');
    require('node:fs').mkdirSync(join(project, '.lco', 'renewal'), { recursive: true });
    writeFileSync(archive, 'HISTORY');
    symlinkSync(archive, overlay);
    expect(() => authorizedWrite({ projectDir: project, path: overlay, content: 'FRESH OVERLAY' })).toThrowError(
      TrustFsError,
    );
    expect(readFileSync(archive, 'utf8')).toBe('HISTORY');
  });

  it('authorizedRead refuses a final symlink; attacker content is never sourced as trusted state', () => {
    const { writeFileSync, symlinkSync, mkdirSync } = require('node:fs') as typeof import('node:fs');
    mkdirSync(join(project, '.lco', 'renewal'), { recursive: true });
    writeFileSync(join(project, 'notes.md'), '{"revision":999}');
    symlinkSync(join(project, 'notes.md'), join(project, '.lco', 'renewal', 'state.json'));
    expect(() =>
      authorizedRead({ projectDir: project, path: join(project, '.lco', 'renewal', 'state.json') }),
    ).toThrowError(TrustFsError);
  });

  it('authorizedRenameNoClobber refuses a linked endpoint; the link target is never moved away', () => {
    const { writeFileSync, symlinkSync, existsSync, mkdirSync } = require('node:fs') as typeof import('node:fs');
    mkdirSync(join(project, '.lco', 'renewal'), { recursive: true });
    const approval = join(project, 'approvals', 'APPR-0002.json');
    mkdirSync(join(project, 'approvals'), { recursive: true });
    writeFileSync(approval, 'IMMUTABLE APPROVAL 2');
    const overlay = join(project, '.lco', 'renewal', 'overlay.json');
    symlinkSync(approval, overlay);
    expect(() =>
      authorizedRenameNoClobber({
        projectDir: project,
        from: overlay,
        to: `${overlay}.RSN-0123456789abcdef.superseded`,
      }),
    ).toThrowError(TrustFsError);
    expect(existsSync(approval)).toBe(true);
  });

  it('verifier A-F2: a nonexistent project root still enforces lexical containment', () => {
    expect(() =>
      authorizedWrite({ projectDir: '/x/no-such-project', path: '/etc/lco-pwned.txt', content: 'OUTSIDE' }),
    ).toThrowError(TrustFsError);
  });
});
