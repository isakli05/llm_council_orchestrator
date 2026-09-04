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
    // Verifier A-F4: renew plan --freeze reaches cmdFreeze's spec writes.
    join(PKG, 'src', 'cli', 'commands', 'freeze.ts'),
    join(PKG, 'src', 'mcp', 'server.ts'),
  ];
  return files.filter((f) => existsSync(f));
}

/** Write/mutate primitives no renewal-surface file may use directly —
 *  Sync AND promises forms, with-or-without a space before the paren, plus
 *  the whole fs.promises / node:fs/promises surface and dynamic code
 *  primitives (verifier F-1/A-F4). trust/fs.ts and storage/revision.ts are
 *  outside the scanned surface — they ARE the authorized implementors. */
const WRITE_PRIMITIVES = [
  'writeFileSync(',
  'writeFileSync (',
  'writeFile(',
  'writeFile (',
  'renameSync(',
  'rename(',
  'unlinkSync(',
  'unlink(',
  'rmSync(',
  'rm(',
  'appendFileSync(',
  'appendFile(',
  'truncateSync(',
  'truncate(',
  'linkSync(',
  'mkdirSync(',
  'mkdir(',
  'openSync(',
  'open(',
  'cpSync(',
  'cp(',
  'copyFileSync(',
  'copyFile(',
  'createWriteStream(',
  'fs.promises',
  "from 'node:fs/promises'",
  `require("node:fs")`,
  "require('node:fs')",
  "import('node:fs",
  'import("node:fs',
  "import { promises } from 'node:fs'",
  'import { promises } from "node:fs"',
  'import{promises',
  'eval(',
  'new Function(',
  'Function(',
];

describe('architecture: no trusted filesystem writes outside FilesystemCapability', () => {
  it('renewal-surface production files contain no direct write primitives', () => {
    // HONEST SCOPE (re-verifier M-2): this scan is an anti-accident TRIPWIRE,
    // not containment. It catches the static-import/call-site routes a
    // well-intentioned developer writes by accident. It does NOT catch:
    // capability detachment (const w = fs.writeFile; w(...)), named
    // destructuring from plain 'node:fs' (`import { promises } from
    // 'node:fs'` — E3), computed-member indirection, or write helpers
    // exported by non-scanned modules called from the surface (E4/E7/E8) —
    // those are inherent limits of a lexical scan; the typed kernel API and
    // code review are the containment for them. Dynamic-import routes
    // (import('node:fs'…) are banned as tokens.
    const violations: string[] = [];
    for (const file of renewalSurface()) {
      const text = readFileSync(file, 'utf8');
      for (const primitive of WRITE_PRIMITIVES) {
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
    // Verifier F-4: ban the IDENTIFIER anywhere (import-alias-proof) except
    // prose comments — renewal surfaces construct transports only through
    // the kernel entry points.
    const forbidden = ['createOpenAiCompatibleLlm', 'createHttpLlm'];
    // V5 gap 4: a direct paid fetch from the renewal surface bypasses the
    // operation (ledger/wire-cap) — ban the call token (fetchImpl params do
    // not match the bare call shape).
    const forbiddenCalls = [/(^|[^A-Za-z0-9_$.])fetch\(/];
    const violations: string[] = [];
    for (const file of renewalSurface()) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('*') || trimmed.startsWith('//')) return; // '/* parked */ code' is CODE (E9)
        for (const fn of forbidden) {
          if (line.includes(fn)) violations.push(`${REL(file)}:${i + 1}: ${fn}`);
        }
        for (const re of forbiddenCalls) {
          if (re.test(line)) violations.push(`${REL(file)}:${i + 1}: direct fetch( call`);
        }
      });
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('S4-H-03: the MCP renewal surface has NO provider-factory transport (every renewal route constructs createPaidOperation)', () => {
    // mcp/server.ts may use buildRoleAdapter ONLY outside renewal — but its
    // renewal tool migrated to the paid kernel; the identifier is absent
    // from the whole file by design. Non-renewal generate/clarify use the
    // llm-config layer, not the raw factory.
    const server = readFileSync(join(PKG, 'src', 'mcp', 'server.ts'), 'utf8');
    expect(server.includes('buildRoleAdapter('), 'mcp/server.ts must not construct adapter factories; renewal goes through createPaidOperation').toBe(false);
    // Both renewal boundaries construct through the operation.
    for (const rel of ['src/cli/index.ts', 'src/mcp/server.ts']) {
      const text = readFileSync(join(PKG, rel), 'utf8');
      expect(text, `${rel} must construct renewal transports through createPaidOperation`).toMatch(/createPaidOperation/);
    }
  });
});

/** S5-M-03 (Fifth Audit): newline-insensitive ad-hoc digest-idiom detector.
 *  The per-line form was evaded by splitting `sha256Content(` and
 *  `JSON.stringify(` across physical lines; this detector matches over a
 *  bounded window of adjacent code lines (comment lines excluded from the
 *  window), so a trivial multiline reformulation of the banned framing still
 *  trips it. The framing must be ADJACENT (only whitespace between the hash
 *  call and the stringify) — unrelated distant tokens never match. */
function adHocDigestViolations(rel: string, text: string): string[] {
  const lines = text.split('\n');
  const WINDOW = 4; // covers call-open → argument spans up to 3 lines down
  const out: string[] = [];
  lines.forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith('*') || t.startsWith('//')) return; // doc mentions are prose
    const window = lines
      .slice(i, i + WINDOW)
      .filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//'))
      .map((l) => l.replace(/\/\/.*$/, '')) // trailing comments don't break the idiom's adjacency
      .join('\n');
    const banned =
      /sha256Content\(\s*JSON\.stringify\(/.test(window) ||
      /createHash\([^)]*\)\s*\.\s*update\(\s*JSON\.stringify\(/.test(window);
    if (banned) out.push(`${rel}:${i + 1}: ad-hoc digest framing (multiline-aware)`);
  });
  return out;
}

describe('architecture: dependency direction + canonical ownership (S4-M-02)', () => {
  /** Extract static import specifiers from a source file. */
  function importSpecifiers(text: string): string[] {
    const out: string[] = [];
    for (const m of text.matchAll(/from '([^']+)'/g)) out.push(m[1]!);
    for (const m of text.matchAll(/from "([^"]+)"/g)) out.push(m[1]!);
    return out;
  }

  /** ALL module specifiers: static imports + require() + dynamic import(). */
  function allSpecifiers(text: string): string[] {
    const out = importSpecifiers(text);
    for (const m of text.matchAll(/require\('([^']+)'\)/g)) out.push(m[1]!);
    for (const m of text.matchAll(/require\("([^"]+)"\)/g)) out.push(m[1]!);
    for (const m of text.matchAll(/import\('([^']+)'\)/g)) out.push(m[1]!);
    for (const m of text.matchAll(/import\("([^"]+)"\)/g)) out.push(m[1]!);
    return out;
  }

  it('trust kernel modules never import upward (CLI/MCP/browser/command modules)', () => {
    // V5 gap 5: ban the bare module paths too (no trailing-segment requirement)
    const banned = ['../cli', "'../../mcp", '../mcp/', 'browser'];
    const violations: string[] = [];
    for (const file of productionFiles(join(PKG, 'src', 'renew', 'trust'))) {
      const text = readFileSync(file, 'utf8');
      for (const spec of importSpecifiers(text)) {
        for (const b of banned) {
          if (spec.includes(b) && !spec.includes('browser-assets')) {
            violations.push(`${REL(file)}: ${spec}`);
          }
        }
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('trust/state.ts participates in NO import cycle (walk the static import graph)', () => {
    const resolved = (fromFile: string, spec: string): string | undefined => {
      if (!spec.startsWith('.')) return undefined;
      const base = join(fromFile, '..', spec);
      for (const c of [`${base}.ts`, join(base, 'index.ts')]) {
        if (existsSync(c)) return c;
      }
      return undefined;
    };
    const seen = new Set<string>();
    const walk = (file: string, stack: string[]): string[] => {
      const key = file;
      if (stack.includes(key)) return [...stack.map((s) => REL(s)), REL(file)];
      if (seen.has(key)) return [];
      seen.add(key);
      const text = readFileSync(file, 'utf8');
      for (const spec of allSpecifiers(text)) {
        const target = resolved(file, spec);
        if (target === undefined) continue;
        const cycle = walk(target, [...stack, file]);
        if (cycle.length > 0) return cycle;
      }
      return [];
    };
    const cycle = walk(join(PKG, 'src', 'renew', 'trust', 'state.ts'), []);
    expect(cycle, `import cycle through trust/state: ${cycle.join(' -> ')}`).toEqual([]);
  });

  it('no ad-hoc trust-bearing digest idioms outside the canonical layer', () => {
    // S4-M-02: trust-bearing digests (snapshot/consent/authority/route/
    // bundle/binding) are domain digests. The raw JSON-stringify framing is
    // banned in production outside the canonical layer and its compiler
    // re-export.
    // structural.ts OWNS structural document identity (sorted manifest
    // entries / graph bytes / source set — blessed in the closure plan §8);
    // compiler/hash.ts is the frozen-spec byte-compat re-export.
    const allow = new Set(['src/renew/trust/canonical.ts', 'src/compiler/hash.ts', 'src/renew/trust/structural.ts']);
    const violations: string[] = [];
    for (const file of productionFiles(join(PKG, 'src'))) {
      if (allow.has(REL(file))) continue;
      violations.push(...adHocDigestViolations(REL(file), readFileSync(file, 'utf8')));
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('S5-M-03: the ad-hoc digest guard is NEWLINE-INSENSITIVE — the one-line and split/multiline reformulations both fail', () => {
    // The Fifth Audit proved the per-line matcher evadable: the planner's
    // config_fingerprint split `sha256Content(` and `JSON.stringify(` across
    // two physical lines and passed untouched. The detector must catch the
    // same idiom regardless of where the line breaks fall.
    const oneLine = 'const fp = sha256Content(JSON.stringify(cfg));';
    const splitTwoLine = 'const fp = sha256Content(\n  JSON.stringify(cfg),\n);';
    const multiline = 'const fp = sha256Content(\n  JSON.stringify({\n    a: 1,\n    b: 2,\n  }),\n);';
    const createHashSplit = "const d = createHash('sha256').update(\n  JSON.stringify(payload)\n).digest('hex');";
    const adjacentComment = 'const fp = sha256Content( // framing\n  JSON.stringify(cfg),\n);';
    const innocent = 'const h = sha256Content(canonicalJson(payload));';
    const innocentCreateHash = "const h = createHash('sha256').update(content, 'utf8').digest('hex');";
    for (const banned of [oneLine, splitTwoLine, multiline, createHashSplit, adjacentComment]) {
      expect(adHocDigestViolations('synthetic.ts', banned), `must flag: ${banned}`).toHaveLength(1);
    }
    for (const ok of [innocent, innocentCreateHash]) {
      expect(adHocDigestViolations('synthetic.ts', ok), `must NOT flag: ${ok}`).toHaveLength(0);
    }
  });
});

describe('architecture: one policy, one vocabulary, one reader per trust concern (S4-M-01)', () => {
  it('raw current-state file reads are absent from the project/snapshot domain modules (bypasses 1+2)', () => {
    for (const rel of ['src/renew/project/project.ts', 'src/renew/recovery/analysis-store.ts', 'src/renew/clarify/approvals.ts']) {
      const text = readFileSync(join(PKG, rel), 'utf8');
      expect(text.includes('readFileSync('), `${rel} must read through the authorized reader`).toBe(false);
    }
    // the trusted reads exist and are authorized
    const project = readFileSync(join(PKG, 'src', 'renew', 'project', 'project.ts'), 'utf8');
    expect(project).toMatch(/authorizedRead/);
  });

  it('ONE support policy: the human_confirmed planning rule lives only in trust/evidence.ts (bypass 4)', () => {
    const violations: string[] = [];
    for (const file of productionFiles(join(PKG, 'src'))) {
      if (REL(file) === 'src/renew/trust/evidence.ts') continue;
      const text = readFileSync(file, 'utf8');
      text.split('\n').forEach((line, i) => {
        const t = line.trim();
        if (t.startsWith('*') || t.startsWith('//')) return;
        if (line.includes("support_status !== 'human_confirmed'")) {
          violations.push(`${REL(file)}:${i + 1}: inline support-policy reimplementation`);
        }
      });
    }
    expect(violations, violations.join('\n')).toEqual([]);
    // and the parity gate consumes the kernel policy
    const ledger = readFileSync(join(PKG, 'src', 'renew', 'parity', 'ledger.ts'), 'utf8');
    expect(ledger).toMatch(/assertSupportPolicy/);
  });

  it('ONE canonical ruling vocabulary: CANONICAL_PARITY_RULINGS is defined only in trust/authority.ts (bypass 5)', () => {
    const violations: string[] = [];
    for (const file of productionFiles(join(PKG, 'src'))) {
      if (REL(file) === 'src/renew/trust/authority.ts') continue;
      const text = readFileSync(file, 'utf8');
      if (text.includes('const CANONICAL_PARITY_RULINGS')) violations.push(REL(file));
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('raw graph parsing outside the kernel is absent (bypass 8: parseGraphText only in graph-reader + trust/structural)', () => {
    const allow = new Set(['src/renew/intel/graph-reader.ts', 'src/renew/trust/structural.ts']);
    const violations: string[] = [];
    for (const file of productionFiles(join(PKG, 'src'))) {
      if (allow.has(REL(file))) continue;
      const text = readFileSync(file, 'utf8');
      text.split('\n').forEach((line, i) => {
        const t = line.trim();
        if (t.startsWith('*') || t.startsWith('//')) return;
        if (line.includes('parseGraphText(')) violations.push(`${REL(file)}:${i + 1}`);
      });
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('the transaction journal write-set API is the only multi-write commit path (S4-H-01: no write-performing commit callbacks)', () => {
    const state = readFileSync(join(PKG, 'src', 'renew', 'trust', 'state.ts'), 'utf8');
    expect(state).toContain('StateMutationPlan');
    expect(state).toContain('applyStateMutation');
    expect(state.includes('commit:'), 'the write-performing commit callback must not return').toBe(false);
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
