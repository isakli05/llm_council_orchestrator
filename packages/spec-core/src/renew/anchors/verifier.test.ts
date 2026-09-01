import { describe, it, expect, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyAnchor, verifyMany, type CodeAnchorInput } from './verifier';

const tmpDirs: string[] = [];

function freshDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

const sha = (content: string | Buffer): string =>
  `sha256:${createHash('sha256').update(content).digest('hex')}`;

afterEach(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  tmpDirs.length = 0;
});

describe('AnchorVerifier (recompute — never trust stored hashes)', () => {
  it('verifies an unchanged file', () => {
    const root = freshDir('lco-anchor-');
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src', 'orders.ts'), 'export const x = 1;\n');
    const r = verifyAnchor({ path: 'src/orders.ts', content_hash: sha('export const x = 1;\n') }, root);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.computed_hash).toBe(sha('export const x = 1;\n'));
  });

  it('detects a one-byte modification', () => {
    const root = freshDir('lco-anchor-');
    writeFileSync(join(root, 'a.ts'), 'abcdef');
    const r = verifyAnchor({ path: 'a.ts', content_hash: sha('abcdeX') }, root);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('hash_mismatch');
    expect(r.message).toMatch(/computed/);
  });

  it('detects deletion (and missing roots)', () => {
    const root = freshDir('lco-anchor-');
    const r = verifyAnchor({ path: 'gone.ts', content_hash: sha('x') }, root);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('file_missing');
  });

  it('rejects a symlink that escapes the target root', () => {
    const root = freshDir('lco-anchor-');
    const outside = freshDir('lco-outside-');
    writeFileSync(join(outside, 'secret.ts'), 'outside');
    mkdirSync(join(root, 'src'));
    symlinkSync(join(outside, 'secret.ts'), join(root, 'src', 'escape.ts'));
    const r = verifyAnchor({ path: 'src/escape.ts', content_hash: sha('outside') }, root);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('path_escape');
  });

  it('resolves an in-repo symlink to its real file (documented behavior)', () => {
    const root = freshDir('lco-anchor-');
    writeFileSync(join(root, 'real.ts'), 'content');
    symlinkSync(join(root, 'real.ts'), join(root, 'alias.ts'));
    const r = verifyAnchor({ path: 'alias.ts', content_hash: sha('content') }, root);
    expect(r.ok).toBe(true);
  });

  it('rejects path traversal and absolute paths outright', () => {
    const root = freshDir('lco-anchor-');
    writeFileSync(join(root, 'a.ts'), 'a');
    for (const bad of ['../a.ts', 'a/../../a.ts', '/etc/passwd', 'C:\\windows\\system32', 'a\\b.ts', '']) {
      const r = verifyAnchor({ path: bad, content_hash: sha('a') }, root);
      expect(r.ok, `path=${JSON.stringify(bad)}`).toBe(false);
      if (!r.ok) expect(r.code).toBe('invalid_path');
    }
  });

  it('rejects directories and non-regular files', () => {
    const root = freshDir('lco-anchor-');
    mkdirSync(join(root, 'pkg'));
    const r = verifyAnchor({ path: 'pkg', content_hash: sha('') }, root);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('not_a_regular_file');
  });

  it('does not verify an anchor against the WRONG project (same path, other root)', () => {
    const rootA = freshDir('lco-anchor-');
    const rootB = freshDir('lco-anchor-');
    mkdirSync(join(rootA, 'src'), { recursive: true });
    writeFileSync(join(rootA, 'src/feature.ts'), 'project A content');
    const r = verifyAnchor({ path: 'src/feature.ts', content_hash: sha('project A content') }, rootB);
    expect(r.ok).toBe(false);
  });

  it('property loop: random single-byte mutations are always detected', () => {
    const root = freshDir('lco-anchor-');
    const original = 'const total = priceOrder(items).total;\n';
    writeFileSync(join(root, 'pricing.ts'), original);
    // Deterministic LCG so the loop is reproducible.
    let seed = 0x2f6e2b1;
    const rand = (max: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % max;
    };
    for (let i = 0; i < 25; i++) {
      const bytes = Buffer.from(original, 'utf8');
      const pos = rand(bytes.length);
      bytes[pos] = (bytes[pos] + 1 + rand(250)) % 256;
      const mutated = bytes.toString('utf8');
      if (mutated === original) continue;
      writeFileSync(join(root, 'pricing.ts'), mutated); // mutate the SOURCE
      const r = verifyAnchor({ path: 'pricing.ts', content_hash: sha(original) }, root);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('hash_mismatch');
      writeFileSync(join(root, 'pricing.ts'), original); // restore for next round
    }
  });

  it('verifyMany reports per-anchor results and an honest allOk', () => {
    const root = freshDir('lco-anchor-');
    writeFileSync(join(root, 'good.ts'), 'good');
    writeFileSync(join(root, 'bad.ts'), 'bad');
    const anchors: CodeAnchorInput[] = [
      { path: 'good.ts', content_hash: sha('good') },
      { path: 'bad.ts', content_hash: sha('tampered') },
      { path: 'missing.ts', content_hash: sha('x') },
    ];
    const r = verifyMany(anchors, root);
    expect(r.all_ok).toBe(false);
    expect(r.results).toHaveLength(3);
    expect(r.results[0].ok).toBe(true);
    expect(r.results[1].ok && r.results[1].code).toBe(false);
    expect(r.results[2].ok).toBe(false);
  });
});
