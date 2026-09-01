import { describe, it, expect, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildGuardedCopy, type FileManifest } from './workspace-copy';

const tmpDirs: string[] = [];

function freshDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

/** Stage a target repo from a path→content map (+ optional raw Buffer values). */
function stageTarget(files: Record<string, string | Buffer>): string {
  const root = freshDir('lco-target-');
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

const sha = (content: string | Buffer): string =>
  `sha256:${createHash('sha256').update(content).digest('hex')}`;

afterEach(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  tmpDirs.length = 0;
});

describe('buildGuardedCopy (single walk: hash manifest + LCO-owned copy)', () => {
  it('copies allowed files and produces a sorted sha256 manifest', () => {
    const target = stageTarget({
      'package.json': '{"name":"x"}',
      'src/b.ts': 'export const b = 2;\n',
      'src/a.ts': 'export const a = 1;\n',
    });
    const copyRoot = freshDir('lco-copy-');
    const r = buildGuardedCopy(target, copyRoot);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.manifest.map((e) => e.path)).toEqual(['package.json', 'src/a.ts', 'src/b.ts']);
    expect(r.manifest[1].sha256).toBe(sha('export const a = 1;\n'));
    expect(readFileSync(join(copyRoot, 'src/a.ts'), 'utf8')).toBe('export const a = 1;\n');
  });

  it('is deterministic across runs on the same tree', () => {
    const target = stageTarget({ 'x.ts': 'x', 'y/z.ts': 'z' });
    const m1 = buildGuardedCopy(target, freshDir('lco-copy-'));
    const m2 = buildGuardedCopy(target, freshDir('lco-copy-'));
    expect(m1.ok && m2.ok).toBe(true);
    if (!m1.ok || !m2.ok) return;
    expect(m1.manifest).toEqual(m2.manifest);
    expect(m1.excluded).toEqual(m2.excluded);
  });

  it('never copies or hashes denied files, and reports them by name', () => {
    const target = stageTarget({
      'src/app.ts': 'ok',
      '.env': 'SECRET=1',
      'config/credentials.json': '{"pw":"hunter2"}',
      'certs/server.key': '-----BEGIN PRIVATE KEY-----',
    });
    const copyRoot = freshDir('lco-copy-');
    const r = buildGuardedCopy(target, copyRoot);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.manifest.map((e) => e.path)).toEqual(['src/app.ts']);
    expect(existsSync(join(copyRoot, '.env'))).toBe(false);
    expect(r.excluded.denied.sort()).toEqual(['.env', 'certs/server.key', 'config/credentials.json']);
  });

  it('skips vendored/VCS directories entirely (not listed as files)', () => {
    const target = stageTarget({
      'src/i.ts': 'i',
      'node_modules/dep/index.js': 'dep',
      '.git/config': '[core]',
      'graphify-out/graph.json': '{}',
    });
    const r = buildGuardedCopy(target, freshDir('lco-copy-'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.manifest.map((e) => e.path)).toEqual(['src/i.ts']);
    expect(r.excluded.denied).toEqual([]); // directories are skipped, not denied-listed
  });

  it('excludes binary and oversize files with explicit categories', () => {
    const target = stageTarget({
      'assets/logo.dat': Buffer.concat([Buffer.from('PNG'), Buffer.from([0, 1, 2])]),
      'src/big.ts': 'x'.repeat(64),
    });
    const copyRoot = freshDir('lco-copy-');
    const r = buildGuardedCopy(target, copyRoot, { limits: { maxFileBytes: 32, maxFiles: 100, maxTotalBytes: 1024 * 1024 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.excluded.binary).toEqual(['assets/logo.dat']);
    expect(r.excluded.oversize).toEqual(['src/big.ts']);
    expect(r.manifest).toHaveLength(0);
  });

  it('does not follow symlinks — escapes and in-repo links alike', () => {
    const target = freshDir('lco-target-');
    mkdirSync(join(target, 'src'));
    writeFileSync(join(target, 'src/real.ts'), 'real');
    const outside = freshDir('lco-outside-');
    writeFileSync(join(outside, 'secret.txt'), 'outside secret');
    symlinkSync(join(outside, 'secret.txt'), join(target, 'escape.txt'));
    symlinkSync(join(target, 'src/real.ts'), join(target, 'src/alias.ts'));
    symlinkSync(outside, join(target, 'escape-dir'));

    const copyRoot = freshDir('lco-copy-');
    const r = buildGuardedCopy(target, copyRoot);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.manifest.map((e) => e.path)).toEqual(['src/real.ts']);
    expect(existsSync(join(copyRoot, 'escape.txt'))).toBe(false);
    expect(existsSync(join(copyRoot, 'escape-dir'))).toBe(false);
    expect(r.excluded.symlink.sort()).toEqual(['escape-dir', 'escape.txt', 'src/alias.ts']);
  });

  it('blocks with sizing guidance when the corpus cap is exceeded', () => {
    const target = stageTarget({ 'a.ts': 'a', 'b.ts': 'b', 'c.ts': 'c' });
    const r = buildGuardedCopy(target, freshDir('lco-copy-'), {
      limits: { maxFileBytes: 1024, maxFiles: 2, maxTotalBytes: 1024 * 1024 },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('corpus_too_large');
    expect(r.message).toMatch(/3 files|files/);
  });

  it('blocks when total bytes exceed the corpus cap', () => {
    const target = stageTarget({ 'a.ts': 'a'.repeat(600), 'b.ts': 'b'.repeat(600) });
    const r = buildGuardedCopy(target, freshDir('lco-copy-'), {
      limits: { maxFileBytes: 1024, maxFiles: 100, maxTotalBytes: 1024 },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('corpus_too_large');
  });

  it('fails closed when the target root does not exist', () => {
    const r = buildGuardedCopy(join(tmpdir(), 'lco-no-such-root-xyz'), freshDir('lco-copy-'));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('target_missing');
  });
});
