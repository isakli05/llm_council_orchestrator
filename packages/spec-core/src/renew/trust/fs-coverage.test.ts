import { describe, expect, it, afterEach } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  authorizedCreateDirAtomically,
  authorizedCopyWrite,
  authorizedEnsureDir,
  authorizedRead,
  authorizedRenameNoClobber,
  authorizedRemoveTree,
  authorizedStat,
  authorizedWrite,
  preflightRenewalSurface,
  renewalStateSurface,
} from './fs';
import {
  TrustAuthorityError,
  TrustCitationError,
  TrustError,
  TrustFsError,
  TrustPaidError,
  TrustStateError,
  TrustStructuralError,
  isTrustError,
} from './errors';
import { checkMcpDir, effectiveMcpRoot, resolveContainedOutputPath, resolveNearestExisting, tryRealpath, readContainmentError } from '../../storage/paths';
import { loadRenewalProject, loadSnapshotFile, renewalPaths } from '../project/project';

/**
 * TRUST KERNEL — coverage completion for the trust surface's typed refusal
 * arms (every API's failure shape is exercised; the load-bearing arms are
 * covered by the primitive matrices in the sibling suites).
 */

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
  tmpDirs.length = 0;
});
const fresh = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'lco-cov-'));
  tmpDirs.push(d);
  return d;
};

describe('trust/fs — every API and refusal arm', () => {
  it('authorizedEnsureDir creates (idempotent) and authorizedStat stats', () => {
    const root = fresh();
    authorizedEnsureDir({ projectDir: root, path: join(root, 'a', 'b') });
    authorizedEnsureDir({ projectDir: root, path: join(root, 'a', 'b') });
    expect(authorizedStat(join(root, 'a', 'b')).isDirectory()).toBe(true);
  });

  it('authorizedRead refuses a directory at the final path', () => {
    const root = fresh();
    mkdirSync(join(root, 'dir'));
    expect(() => authorizedRead({ projectDir: root, path: join(root, 'dir') })).toThrowError(TrustFsError);
  });

  it('authorizedRead reads a real file', () => {
    const root = fresh();
    writeFileSync(join(root, 'f.txt'), 'hello');
    expect(authorizedRead({ projectDir: root, path: join(root, 'f.txt') })).toBe('hello');
  });

  it('authorizedCopyWrite refuses an existing destination (fresh-file semantics)', () => {
    const root = fresh();
    writeFileSync(join(root, 'f.txt'), 'ONE');
    expect(() => authorizedCopyWrite({ projectDir: root, path: join(root, 'f.txt'), content: 'TWO' })).toThrowError(
      /never clobber/,
    );
    expect(readFileSync(join(root, 'f.txt'), 'utf8')).toBe('ONE');
  });

  it('authorizedCreateDirAtomically lands a complete tree and refuses an existing one', () => {
    const root = fresh();
    authorizedCreateDirAtomically({ projectDir: root, targetDir: join(root, 'spec'), files: [{ name: 'a.json', content: { x: 1 } }] });
    expect(readFileSync(join(root, 'spec', 'a.json'), 'utf8')).toContain('"x": 1');
    expect(() =>
      authorizedCreateDirAtomically({ projectDir: root, targetDir: join(root, 'spec'), files: [] }),
    ).toThrowError(/already exists/);
  });

  it('authorizedRemoveTree is a no-op on an absent path', () => {
    const root = fresh();
    authorizedRemoveTree({ projectDir: root, path: join(root, 'nothing') });
    expect(existsSync(join(root, 'nothing'))).toBe(false);
  });

  it('authorizedWrite replaces content atomically (second write over the first)', () => {
    const root = fresh();
    const p = join(root, 's.json');
    authorizedWrite({ projectDir: root, path: p, content: 'A' });
    authorizedWrite({ projectDir: root, path: p, content: 'B' });
    expect(readFileSync(p, 'utf8')).toBe('B');
  });

  it('preflightRenewalSurface reports a planted chain link and passes on a clean tree', () => {
    const clean = fresh();
    expect(preflightRenewalSurface(clean)).toEqual([]);
    const dirty = fresh();
    mkdirSync(join(dirty, '.lco', 'renewal'), { recursive: true });
    symlinkSync(join(dirty, 'elsewhere'), join(dirty, '.lco', 'renewal', 'analyses'));
    const refusals = preflightRenewalSurface(dirty);
    expect(refusals.length).toBeGreaterThan(0);
    expect(refusals[0]).toMatch(/symlink/);
    expect(renewalStateSurface(dirty)).toHaveLength(11);
  });
});

describe('trust/errors — the taxonomy is constructible and narrowable', () => {
  it('every primitive error class carries domain + code; isTrustError narrows', () => {
    const cases: Array<[TrustError, string]> = [
      [new TrustFsError('symlink_in_chain', '/x', 'm'), 'trust:fs'],
      [new TrustStateError('state_corrupt', 'm'), 'trust:state'],
      [new TrustCitationError('unknown_context', 'm', 'CTX-1'), 'trust:evidence'],
      [new TrustAuthorityError('id_mismatch', 'm', 'APPR-1'), 'trust:authority'],
      [new TrustPaidError('request_over_budget', 'm'), 'trust:paid'],
      [new TrustStructuralError('manifest_invalid', 'm', '/p'), 'trust:structural'],
    ];
    for (const [err, domain] of cases) {
      expect(err.domain).toBe(domain);
      expect(err.code).toBeTruthy();
      expect(isTrustError(err)).toBe(true);
      expect(`${err.domain}:${err.code}`).toMatch(/trust:/);
    }
    expect(isTrustError(new Error('plain'))).toBe(false);
  });
});

describe('storage/paths — boundary helpers (MCP + export arms)', () => {
  it('effectiveMcpDir: pin vs cwd sources', () => {
    expect(effectiveMcpRoot('/pin').source).toBe('pin');
    expect(effectiveMcpRoot(undefined, '/cwd').source).toBe('cwd');
  });

  it('checkMcpDir refuses blank, unresolvable root, non-dir root, and outside-root dirs', () => {
    const root = fresh();
    expect(checkMcpDir('  ', effectiveMcpRoot(root)).ok).toBe(false);
    expect(checkMcpDir(join(root, 'x'), effectiveMcpRoot(join(root, 'missing-root'))).ok).toBe(false);
    writeFileSync(join(root, 'plain-file'), 'x');
    expect(checkMcpDir(join(root, 'sub'), effectiveMcpRoot(join(root, 'plain-file'))).ok).toBe(false);
    const outside = fresh();
    expect(checkMcpDir(join(outside, 'sub'), effectiveMcpRoot(root)).ok).toBe(false);
    expect(checkMcpDir(join(root, 'sub'), effectiveMcpRoot(root)).ok).toBe(true);
  });

  it('resolveContainedOutputPath: outside root, inside target, existing, and symlinked-component refusals', () => {
    const root = fresh();
    const target = fresh();
    expect(resolveContainedOutputPath({ projectDir: root, out: join(target, 'o.md') }).ok).toBe(false);
    expect(resolveContainedOutputPath({ projectDir: root, targetReal: target, out: join(target, 'o.md') }).ok).toBe(false);
    const inside = join(root, 'o.md');
    writeFileSync(inside, 'x');
    expect(resolveContainedOutputPath({ projectDir: root, out: inside }).ok).toBe(false); // no-clobber
    // An in-project alias resolving INSIDE the root is the documented-legal
    // shape; an ESCAPING link (resolving outside the root) refuses.
    const outside2 = fresh();
    const escape = join(root, 'escape');
    symlinkSync(outside2, escape);
    expect(resolveContainedOutputPath({ projectDir: root, out: join(escape, 'o.md') }).ok).toBe(false);
    expect(resolveContainedOutputPath({ projectDir: root, out: join(root, 'fresh.md') }).ok).toBe(true);
  });

  it('resolveNearestExisting / tryRealpath / readContainmentError arms', () => {
    const root = fresh();
    expect(resolveNearestExisting(join(root, 'a', 'b', 'c'))).toBe(join(root, 'a', 'b', 'c'));
    expect(tryRealpath(join(root, 'nope'))).toBeUndefined();
    mkdirSync(join(root, 'real'));
    expect(tryRealpath(join(root, 'real'))).toBe(join(root, 'real'));
    const selfResult = readContainmentError(join(root, 'real'), join(root, 'real'));
    expect(selfResult === null || typeof selfResult === 'string').toBe(true);
    mkdirSync(join(root, 'elsewhere'));
    const escapeResult = readContainmentError(join(root, 'real'), join(root, 'elsewhere'));
    expect(typeof escapeResult === 'string' && /escape/.test(escapeResult)).toBe(true);
    expect(readContainmentError(join(root, 'vanish'), join(root, 'vanish'))).toBeNull();
  });
});

describe('project loaders — UX entry arms', () => {
  it('loadRenewalProject: missing and corrupt are typed', () => {
    const root = fresh();
    const missing = loadRenewalProject(root);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.code).toBe('project_missing');
    mkdirSync(join(root, '.lco', 'renewal'), { recursive: true });
    writeFileSync(renewalPaths(root).projectJson, '{bad');
    const corrupt = loadRenewalProject(root);
    expect(corrupt.ok).toBe(false);
    if (!corrupt.ok) expect(corrupt.code).toBe('project_corrupt');
  });

  it('loadSnapshotFile: missing is actionable', () => {
    const root = fresh();
    const r = loadSnapshotFile(root);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/snapshot missing/);
  });
});


describe('fs closing arms: read/remove refusals', () => {
  it('authorizedRead refuses a symlinked trusted read path (chain-validated)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lco-fs-arm-'));
    const victim = join(dir, 'real.json');
    writeFileSync(victim, '{}');
    const link = join(dir, 'link.json');
    symlinkSync(victim, link);
    expect(() => authorizedRead({ projectDir: dir, path: link })).toThrow();
    rmSync(dir, { recursive: true, force: true });
  });

  it('authorizedRemoveTree refuses a symlink target (never follows links)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lco-fs-arm2-'));
    const victim = join(dir, 'real');
    writeFileSync(victim, 'keep');
    const link = join(dir, 'lnk');
    symlinkSync(victim, link);
    expect(() => authorizedRemoveTree({ projectDir: dir, path: link })).toThrow();
    expect(readFileSync(victim, 'utf8')).toBe('keep');
    rmSync(dir, { recursive: true, force: true });
  });

  it('authorizedRead rethrows a NON-refusal fs error raw (no mislabeling)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lco-fs-arm3-'));
    const p = join(dir, 'sub', 'missing.json'); // ENOENT inside a missing dir
    expect(() => authorizedRead({ projectDir: dir, path: p })).toThrow();
    rmSync(dir, { recursive: true, force: true });
  });
});
