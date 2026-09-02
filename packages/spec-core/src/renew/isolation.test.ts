/**
 * Filesystem isolation invariants (TRACK A of the release-blocker
 * remediation): the LCO project and the analyzed target are DISJOINT real
 * path domains, export outputs are root-contained + no-clobber, MCP renewal
 * read-only tools perform no writes, and failed inits never mutate the
 * target (byte/mode/symlink-invariant tree hash).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cmdRenewInit, cmdRenewExport, type RenewCapabilities } from '../cli/commands/renew';
import { StaticGraphProvider } from './intel/fixture-provider';
import { parseGraphText } from './intel/graph-reader';

const tmpDirs: string[] = [];
function freshDir(p: string): string {
  const dir = mkdtempSync(join(tmpdir(), p));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
  tmpDirs.length = 0;
});

const FIXTURE_SRC = join(__dirname, '..', '..', 'fixtures', 'legacy-app');

function graphCaps(): RenewCapabilities {
  const graphParsed = parseGraphText(readFileSync(join(FIXTURE_SRC, 'graph-fixture.json'), 'utf8'));
  if (!graphParsed.ok) throw new Error(graphParsed.message);
  return {
    nowIso: () => '2026-09-02T12:00:00.000Z',
    provider: () => new StaticGraphProvider(graphParsed.graph, '0.9.50'),
    gitCommit: () => undefined,
  };
}

/** Make a realistic target: tracked-looking content + read-only file + symlinks. */
function makeTarget(): string {
  const target = freshDir('lco-iso-target-');
  cpSync(join(FIXTURE_SRC, 'src'), join(target, 'src'), { recursive: true });
  cpSync(join(FIXTURE_SRC, 'package.json'), join(target, 'package.json'));
  writeFileSync(join(target, 'untracked.txt'), 'untracked\n');
  chmodSync(join(target, 'src', 'inventory.ts'), 0o444);
  symlinkSync('inventory.ts', join(target, 'src', 'internal-link.ts'));
  symlinkSync('/etc/hostname', join(target, 'outside-link.txt'));
  return target;
}

/**
 * Full-tree inventory hash: file bytes + relative paths + modes + symlink
 * targets + directory entries. Any mutation the product could make changes it.
 */
function treeHash(root: string): string {
  const h = createHash('sha256');
  const walk = (abs: string, rel: string): void => {
    const entries = readdirSync(abs, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const ent of entries) {
      const childRel = rel === '' ? ent.name : `${rel}/${ent.name}`;
      const childAbs = join(abs, ent.name);
      h.update(`E:${childRel}\n`);
      const st = lstatSync(childAbs);
      if (ent.isSymbolicLink()) {
        h.update(`L:${st.mode.toString(8)}:${readlinkSync(childAbs)}\n`);
      } else if (ent.isFile()) {
        h.update(`F:${st.mode.toString(8)}:${createHash('sha256').update(readFileSync(childAbs)).digest('hex')}\n`);
      } else if (ent.isDirectory()) {
        h.update(`D:${st.mode.toString(8)}\n`);
        walk(childAbs, childRel);
      } else {
        h.update(`O:${st.mode.toString(8)}\n`);
      }
    }
  };
  walk(root, '');
  return h.digest('hex');
}

describe('project/target disjointness (C-01)', () => {
  it('exact same directory refused; target byte/mode/link-immutable', async () => {
    const target = makeTarget();
    const before = treeHash(target);
    const caps = graphCaps();
    const r = await cmdRenewInit({ dir: target, target }, caps);
    expect(r.code).not.toBe(0);
    expect(r.output).toMatch(/same directory|disjoint/i);
    expect(treeHash(target)).toBe(before);
  });

  it('project inside target refused; target immutable', async () => {
    const target = makeTarget();
    const before = treeHash(target);
    const r = await cmdRenewInit({ dir: join(target, 'sub'), target }, graphCaps());
    expect(r.code).not.toBe(0);
    expect(r.output).toMatch(/inside the analyzed target|disjoint/i);
    expect(treeHash(target)).toBe(before);
    expect(existsSync(join(target, 'sub'))).toBe(false);
  });

  it('target inside project refused; target immutable', async () => {
    const project = freshDir('lco-iso-proj-');
    const target = makeTarget();
    mkdirSync(join(project, 't'), { recursive: true });
    cpSync(join(FIXTURE_SRC, 'src'), join(project, 't', 'src'), { recursive: true });
    const before = treeHash(join(project, 't'));
    const r = await cmdRenewInit({ dir: project, target: join(project, 't') }, graphCaps());
    expect(r.code).not.toBe(0);
    expect(r.output).toMatch(/inside the (project|LCO)|disjoint/i);
    expect(treeHash(join(project, 't'))).toBe(before);
  });

  it('../ textual alias to the same real path refused', async () => {
    const target = makeTarget();
    const before = treeHash(target);
    const alias = join(target, 'src', '..', 'src', '..');
    const r = await cmdRenewInit({ dir: alias, target }, graphCaps());
    expect(r.code).not.toBe(0);
    expect(treeHash(target)).toBe(before);
  });

  it('symlink alias to the target refused (project path resolves into target)', async () => {
    const target = makeTarget();
    const holder = freshDir('lco-iso-holder-');
    symlinkSync(target, join(holder, 'alias'));
    const before = treeHash(target);
    const r = await cmdRenewInit({ dir: join(holder, 'alias'), target }, graphCaps());
    expect(r.code).not.toBe(0);
    expect(treeHash(target)).toBe(before);
  });

  it('symlinked TARGET resolving into the project refused', async () => {
    const project = freshDir('lco-iso-proj2-');
    mkdirSync(join(project, 'code'), { recursive: true });
    cpSync(join(FIXTURE_SRC, 'src'), join(project, 'code', 'src'), { recursive: true });
    const holder = freshDir('lco-iso-holder2-');
    symlinkSync(join(project, 'code'), join(holder, 'target-link'));
    const before = treeHash(join(project, 'code'));
    const r = await cmdRenewInit({ dir: project, target: join(holder, 'target-link') }, graphCaps());
    expect(r.code).not.toBe(0);
    expect(treeHash(join(project, 'code'))).toBe(before);
  });

  it('relative vs absolute alias of the same directory refused', async () => {
    const target = makeTarget();
    const before = treeHash(target);
    // `.` and explicit absolute form of the same dir must alias to the same
    // real path — the join normalizes to `target` exactly.
    const alias = join(target, '.');
    const r = await cmdRenewInit({ dir: target, target: alias }, graphCaps());
    expect(r.code).not.toBe(0);
    expect(treeHash(target)).toBe(before);
  });

  it('a properly separated init still succeeds (no over-refusal)', async () => {
    const target = makeTarget();
    const project = freshDir('lco-iso-ok-');
    const r = await cmdRenewInit({ dir: project, target, name: 'iso-ok' }, graphCaps());
    expect(r.code).toBe(0);
    expect(existsSync(join(project, '.lco', 'renewal', 'project.json'))).toBe(true);
  });
});

describe('export containment (C-02)', () => {
  async function initializedPair(): Promise<{ project: string; target: string; caps: RenewCapabilities }> {
    const target = makeTarget();
    const project = freshDir('lco-iso-exp-');
    const caps = graphCaps();
    const init = await cmdRenewInit({ dir: project, target, name: 'exp' }, caps);
    expect(init.code).toBe(0);
    return { project, target, caps };
  }

  it('refuses to write into the target (arbitrary overwrite blocked)', async () => {
    const { project, target, caps } = await initializedPair();
    const victim = join(target, "src", "orders.ts");
    const before = readFileSync(victim, 'utf8');
    const r = await cmdRenewExport({ dir: project, out: victim }, caps);
    expect(r.code).not.toBe(0);
    expect(r.output).toMatch(/outside the project|contain/i);
    expect(readFileSync(victim, 'utf8')).toBe(before);
  });

  it('refuses parent-escape (../) and absolute outside paths', async () => {
    const { project, caps } = await initializedPair();
    const outside = freshDir('lco-iso-out-');
    const r1 = await cmdRenewExport({ dir: project, out: join(project, '..', 'escape.md') }, caps);
    expect(r1.code).not.toBe(0);
    const r2 = await cmdRenewExport({ dir: project, out: join(outside, 'abs.md') }, caps);
    expect(r2.code).not.toBe(0);
    expect(existsSync(join(outside, 'abs.md'))).toBe(false);
  });

  it('refuses symlink output escape', async () => {
    const { project, caps } = await initializedPair();
    const outside = freshDir('lco-iso-out2-');
    symlinkSync(outside, join(project, 'escape-link.md'));
    const r = await cmdRenewExport({ dir: project, out: join(project, 'escape-link.md') }, caps);
    expect(r.code).not.toBe(0);
    expect(existsSync(join(outside, 'report.md'))).toBe(false);
  });

  it('no-clobber: existing file is never overwritten', async () => {
    const { project, caps } = await initializedPair();
    const out = join(project, 'report.md');
    writeFileSync(out, 'PRECIOUS\n');
    const r = await cmdRenewExport({ dir: project, out }, caps);
    expect(r.code).not.toBe(0);
    expect(r.output).toMatch(/exist|clobber|overwrite/i);
    expect(readFileSync(out, 'utf8')).toBe('PRECIOUS\n');
  });

  it('contained fresh output succeeds and is inside the project', async () => {
    const { project, caps } = await initializedPair();
    const out = join(project, 'reports', 'modernization.md');
    const r = await cmdRenewExport({ dir: project, out }, caps);
    expect(r.code).toBe(0);
    expect(existsSync(out)).toBe(true);
    expect(readFileSync(out, 'utf8').length).toBeGreaterThan(0);
  });

  it('no --out returns the report on stdout (read-only default)', async () => {
    const { project, caps } = await initializedPair();
    const r = await cmdRenewExport({ dir: project }, caps);
    expect(r.code).toBe(0);
    expect(r.output.length).toBeGreaterThan(0);
  });
});

describe('guarded copy permissions (M-05)', () => {
  it('guarded workspace files are 0600 and directories 0700 (POSIX)', async () => {
    const target = makeTarget();
    const project = freshDir('lco-iso-perm-');
    const r = await cmdRenewInit({ dir: project, target, name: 'perm' }, graphCaps());
    expect(r.code).toBe(0);
    const ws = join(project, '.lco', 'renewal', 'graph-workspace');
    expect((lstatSync(ws).mode & 0o777).toString(8)).toBe('700');
    const srcDir = join(ws, 'src');
    expect((lstatSync(srcDir).mode & 0o777).toString(8)).toBe('700');
    const f = join(srcDir, 'orders.ts');
    expect((lstatSync(f).mode & 0o777).toString(8)).toBe('600');
  });
});
