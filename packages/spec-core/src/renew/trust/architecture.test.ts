import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * TRUST KERNEL — architecture bypass guards (Phase 6).
 *
 * The third audit's central lesson: a check that a consumer MAY run before
 * doing its own direct I/O will eventually be skipped, narrowed, or raced.
 * These tests fail the build when a trust-bearing Legacy Renewal path
 * regresses to direct primitives outside the kernel. They are semantic
 * import/call-site rules over PRODUCTION source (tests themselves are out of
 * scope), resilient to formatting and renames that keep the rules true.
 */

const PKG = join(__dirname, '..', '..', '..');

/** Recursively list production .ts files under a directory (no tests, no dist). */
function productionFiles(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...productionFiles(p));
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

const REL = (p: string) => relative(PKG, p).replace(/\\/g, '/');

/** The renewal trust surface: everything that participates in trusted
 *  renewal IO/decisions. The kernel itself (src/renew/trust/**) and the
 *  shared storage engines are excluded — they ARE the allowlist. */
function renewalSurface(): string[] {
  const files = [
    ...productionFiles(join(PKG, 'src', 'renew')).filter((f) => !REL(f).startsWith('src/renew/trust/')),
    join(PKG, 'src', 'cli', 'commands', 'renew.ts'),
    join(PKG, 'src', 'cli', 'commands', 'write-spec.ts'),
    join(PKG, 'src', 'mcp', 'server.ts'),
  ];
  return files.filter((f) => existsSync(f));
}

/** Write/mutate primitives no renewal-surface file may use directly.
 *  (trust/fs.ts and storage/revision.ts are outside the scanned surface —
 *  they ARE the authorized implementors.) */
const WRITE_PRIMITIVES = [
  'writeFileSync(',
  'renameSync(',
  'unlinkSync(',
  'rmSync(',
  'appendFileSync(',
  'truncateSync(',
  'truncate(',
  'linkSync(',
  'mkdirSync(',
  'openSync(',
  'cpSync(',
  'copyFileSync(',
];

describe('architecture: no trusted filesystem writes outside FilesystemCapability', () => {
  it('renewal-surface production files contain no direct write primitives', () => {
    const violations: string[] = [];
    for (const file of renewalSurface()) {
      const text = readFileSync(file, 'utf8');
      for (const primitive of WRITE_PRIMITIVES) {
        // scan line-wise for actionable messages
        text.split('\n').forEach((line, i) => {
          if (line.includes(primitive) && !line.trim().startsWith('*') && !line.trim().startsWith('//')) {
            violations.push(`${REL(file)}:${i + 1}: ${primitive.trim()} ${line.trim().slice(0, 80)}`);
          }
        });
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('the kernel write module and the storage engine are the only renewal write implementors', () => {
    const fs = readFileSync(join(PKG, 'src', 'renew', 'trust', 'fs.ts'), 'utf8');
    expect(fs).toContain('authorizedWrite');
    const rev = readFileSync(join(PKG, 'src', 'storage', 'revision.ts'), 'utf8');
    expect(rev).toContain('swapFilesAtomically');
  });
});

describe('architecture: paid transport only through ResolvedPaidOperation discipline', () => {
  it('renewal surfaces never construct a transport directly (kernel entry points only)', () => {
    const forbidden = ['createOpenAiCompatibleLlm(', 'createHttpLlm('];
    const violations: string[] = [];
    for (const file of renewalSurface()) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (line.trim().startsWith('*') || line.trim().startsWith('//')) return; // prose, not a call site
        for (const fn of forbidden) {
          if (line.includes(fn)) violations.push(`${REL(file)}:${i + 1}: ${fn}`);
        }
      });
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('every renewal transport construction carries the kernel wire hook', () => {
    // The named-profile path constructs through the provider factory; the
    // factory call must be accompanied by the kernel's wireCap import in the
    // same file (CLI boundary and MCP server).
    for (const rel of ['src/cli/index.ts', 'src/mcp/server.ts']) {
      const text = readFileSync(join(PKG, rel), 'utf8');
      if (text.includes('buildRoleAdapter(')) {
        expect(text, `${rel} must import the kernel wire hook`).toMatch(/wireCap/);
        expect(text, `${rel} must enforce the recovery wire cap`).toMatch(/MAX_RECOVERY_WIRE_BYTES/);
      }
    }
  });
});

describe('architecture: trusted state loads only through RenewalStateTransaction', () => {
  it('the deprecated raw loaders no longer exist in production source', () => {
    const banned = ['digestGraphManifest'];
    const violations: string[] = [];
    for (const file of productionFiles(join(PKG, 'src'))) {
      const text = readFileSync(file, 'utf8');
      for (const id of banned) {
        if (text.includes(id)) violations.push(`${REL(file)}: ${id}`);
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('trusted store loads in the command core come from the active-state view', () => {
    const renew = readFileSync(join(PKG, 'src', 'cli', 'commands', 'renew.ts'), 'utf8');
    expect(renew).toContain('loadActiveState');
    expect(renew).not.toContain('loadOverlay(');
    expect(renew).not.toContain('loadParity(');
  });
});

describe('architecture: authority only through AuthorityGrant', () => {
  it('the authority digest implementation exists only in trust/authority.ts', () => {
    const violations: string[] = [];
    for (const file of productionFiles(join(PKG, 'src'))) {
      const rel = REL(file);
      if (rel === 'src/renew/trust/authority.ts') continue;
      const text = readFileSync(file, 'utf8');
      if (text.includes('RENEWAL_APPROVAL_DIGEST_VERSION =')) violations.push(rel);
      if (text.includes('function renewalApprovalDigest')) violations.push(rel);
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });
});

describe('architecture: graphify identity only through StructuralIdentity', () => {
  it('no non-strict manifest digest fallback is reconstructable', () => {
    for (const file of productionFiles(join(PKG, 'src'))) {
      const text = readFileSync(file, 'utf8');
      expect(text.includes('JSON.stringify([]), \'utf8\')'), REL(file)).toBe(false);
    }
  });
});
