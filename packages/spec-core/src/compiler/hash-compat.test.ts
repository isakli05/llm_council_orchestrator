import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileSpecDir } from './compile';
import { artifactHashes, legacySectionHash } from './hash';
import { verifyFrozen } from './verify';
import { cmdFreeze } from '../cli/commands/freeze';
import { cmdVerify } from '../cli/commands/verify';
import { ManifestSchema } from '../schemas/manifest';
import type { SpecBundle } from '../schemas';

/**
 * INV-H1 / S2-H-08 regression matrix: frozen-spec backward compatibility
 * across hash algorithm versions.
 *
 * The defect: v1 artifact hashes were sha256(JSON.stringify(section, null,2))
 * over the ZOD-PARSED bundle, so a spec frozen by an older build (whose zod
 * ordered keys differently) verified as `drifted` under a newer build even
 * when semantically unchanged. The fix: v2 canonical (key-sorted) hashing for
 * new freezes + a compatibility rule in verify that judges pre-v2 stored
 * hashes against the section AS PARSED FROM FILE (rawSections), never against
 * the current build's zod ordering.
 */

const FIXTURES = join(__dirname, '../../fixtures');
const PRE_RENEWAL_FIXTURE = join(FIXTURES, 'pre-renewal-frozen-spec');
const NOW = '2026-09-02T00:00:00Z';
const SHA = `sha256:${'a'.repeat(64)}`;

const HASHED_KEYS = [
  'intent',
  'glossary',
  'assumptions',
  'evidence',
  'requirements',
  'decisions',
  'contracts',
  'tasks',
] as const;

/** Required section files under spec/ (manifest included; legacy optional). */
const SECTION_FILES = [
  'manifest',
  'intent',
  'glossary',
  'assumptions',
  'evidence',
  'requirements',
  'decisions',
  'contracts',
  'tasks',
] as const;

function loadBundle(rel: string): SpecBundle & Record<string, unknown> {
  return JSON.parse(readFileSync(join(FIXTURES, rel), 'utf8')) as SpecBundle &
    Record<string, unknown>;
}

/**
 * Deterministic NON-canonical key order: rotate every object's keys (first key
 * moves to the end), recursively. Never the identity for >=2 keys, and unlike
 * reversal it does not land on the sorted order for objects with >2 keys — a
 * faithful stand-in for "the key order some other build's serializer produced".
 */
function rotateKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(rotateKeys);
  if (value !== null && typeof value === 'object') {
    const src = value as Record<string, unknown>;
    const [first, ...rest] = Object.keys(src);
    const out: Record<string, unknown> = {};
    for (const key of rest) out[key] = rotateKeys(src[key]);
    if (first !== undefined) out[first] = rotateKeys(src[first]);
    return out;
  }
  return value;
}

/** Minimal bundle that compiles, lints clean, and freezes (same shape the CLI
 * e2e tests freeze). `test_files` is derived by compile, never written. */
function conformingBundle(): Record<string, unknown> {
  return {
    manifest: {
      spec_schema: 'lco-spec/1.0',
      spec_version: 1,
      project: { name: 'mini', mode: 'greenfield' },
      complexity_profile: 'p-mini',
      evidence_snapshot: { pack_hash: SHA, collected_at: '2026-08-27T00:00:00Z' },
      state: 'draft',
      council_run: { run_id: 't', config_fingerprint: 't' },
      artifact_hashes: {},
      unresolved_count: 0,
      blocking_count: 0,
      target_runtime: { platform: 'node', stack: 'ts' },
    },
    intent: { statement: 's', normalized: 'n' },
    glossary: [{ term: 'Term', definition: 'd' }],
    assumptions: [],
    evidence: [{ id: 'E-0001', kind: 'user_input', source: 's', hash: SHA }],
    requirements: [
      {
        id: 'REQ-0001',
        statement: 'must work',
        priority: 'must',
        evidence: ['E-0001'],
        acceptance_refs: ['TST-0001'],
        terms_used: [],
      },
    ],
    decisions: [
      {
        claim_id: 'DEC-0001',
        decision: 'd',
        rationale: 'r',
        evidence: ['E-0001'],
        confidence: 1,
        impact: 'low',
        assumptions: [],
        alternatives: [],
        status: 'accepted',
      },
    ],
    contracts: [],
    tasks: [
      {
        task_id: 'TASK-0001',
        title: 't',
        purpose: 'p',
        refs: { requirements: ['REQ-0001'], architecture: [], decisions: ['DEC-0001'] },
        depends_on: [],
        preconditions: ['c'],
        permitted_scope: ['src/**'],
        protected: [],
        interface_changes: [],
        invariants: ['i'],
        instructions: 'do',
        tests: [{ id: 'TST-0001', kind: 'unit', file: 'a.test.ts', cases: ['REQ-0001: works'] }],
        verification: [{ command: 'node --version', expect: 'exit 0' }],
        acceptance: ['a'],
        rollback: 'r',
        completion_evidence: { required: ['test_summary'] },
        risk: { level: 'low', note: '' },
        complexity: 'xs',
      },
    ],
  };
}

const tmpDirs: string[] = [];

/** Real tmp spec dir; `order: 'rotate'` writes every section file with rotated
 * key order (same semantics, different bytes than the in-memory order). */
function makeSpecRoot(
  bundle: Record<string, unknown>,
  opts: { order?: 'identity' | 'rotate'; skip?: readonly string[] } = {},
): string {
  const root = mkdtempSync(join(tmpdir(), 'spec-core-hash-compat-'));
  tmpDirs.push(root);
  const spec = join(root, 'spec');
  mkdirSync(spec);
  for (const name of [...SECTION_FILES, 'legacy'] as const) {
    if (opts.skip?.includes(name)) continue;
    if (bundle[name] === undefined) continue;
    const section = opts.order === 'rotate' ? rotateKeys(bundle[name]) : bundle[name];
    writeFileSync(join(spec, `${name}.json`), JSON.stringify(section, null, 2));
  }
  return root;
}

/** Simulate a PRE-V2 freeze: pin v1 legacy hashes of the sections as they sit
 * in their files (the bytes the freezing build saw), no `hash_version`. */
async function freezeLegacyStyle(root: string): Promise<void> {
  const compiled = await compileSpecDir(root);
  expect(compiled.ok).toBe(true);
  const stored: Record<string, string> = {};
  for (const key of [...HASHED_KEYS, 'legacy'] as const) {
    const raw = compiled.rawSections![key];
    if (raw !== undefined) stored[key] = legacySectionHash(raw);
  }
  const manifest = JSON.parse(readFileSync(join(root, 'spec', 'manifest.json'), 'utf8'));
  manifest.state = 'frozen';
  manifest.frozen_at = '2026-01-01T00:00:00Z';
  manifest.artifact_hashes = stored;
  writeFileSync(join(root, 'spec', 'manifest.json'), JSON.stringify(manifest, null, 2));
}

afterEach(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  tmpDirs.length = 0;
});

describe('hash v2 compatibility matrix (INV-H1 / S2-H-08)', () => {
  it('(a) LEGACY-COMPAT: a pre-v2 frozen spec with reordered-key files verifies exit 0', async () => {
    // legacy-crm carries the optional legacy section; files written with a
    // rotated (non-canonical, non-zod) key order, frozen "by the old build".
    const root = makeSpecRoot(loadBundle('good/legacy-crm/bundle.json'), { order: 'rotate' });
    await freezeLegacyStyle(root);

    await expect(cmdVerify(root)).resolves.toMatchObject({ code: 0 });

    // Defect reproduction (S2-H-08): WITHOUT the raw sections the same bundle
    // drifts — the legacy fallback would hash the current zod ordering.
    const recompiled = await compileSpecDir(root);
    expect(verifyFrozen(recompiled.bundle!).ok).toBe(false);
  });

  it('(b) LEGACY-COMPAT: a REAL semantic change to the pre-v2 freeze drifts', async () => {
    const root = makeSpecRoot(loadBundle('good/legacy-crm/bundle.json'), { order: 'rotate' });
    await freezeLegacyStyle(root);

    const tasks = JSON.parse(readFileSync(join(root, 'spec', 'tasks.json'), 'utf8'));
    tasks[0].title = 'semantically different';
    writeFileSync(join(root, 'spec', 'tasks.json'), JSON.stringify(tasks, null, 2));

    const result = await cmdVerify(root);
    expect(result.code).toBe(1);
    expect(result.output).toContain('tasks');
  });

  it('(c) NEW v2: freeze stamps hash_version 2 + canonical hashes; reordered files verify; a change drifts', async () => {
    const root = makeSpecRoot(conformingBundle());
    expect((await cmdFreeze(root, NOW)).code).toBe(0);

    const manifest = JSON.parse(readFileSync(join(root, 'spec', 'manifest.json'), 'utf8'));
    expect(manifest.hash_version).toBe(2);

    // Same-build consistency: the stored hashes are the v2 canonical hashes of
    // the recompiled bundle.
    const recompiled = await compileSpecDir(root);
    expect(recompiled.ok).toBe(true);
    expect(manifest.artifact_hashes).toEqual(artifactHashes(recompiled.bundle!));

    // Key order in the section files is irrelevant under v2: rewriting every
    // section with rotated keys leaves the spec verified.
    for (const name of SECTION_FILES) {
      if (name === 'manifest') continue;
      const section = JSON.parse(readFileSync(join(root, 'spec', `${name}.json`), 'utf8'));
      writeFileSync(
        join(root, 'spec', `${name}.json`),
        JSON.stringify(rotateKeys(section), null, 2),
      );
    }
    await expect(cmdVerify(root)).resolves.toMatchObject({ code: 0 });

    // A real semantic change still drifts (strict mode, canonical only).
    const tasks = JSON.parse(readFileSync(join(root, 'spec', 'tasks.json'), 'utf8'));
    tasks[0].title = 'semantically different';
    writeFileSync(join(root, 'spec', 'tasks.json'), JSON.stringify(tasks, null, 2));
    const drifted = await cmdVerify(root);
    expect(drifted.code).toBe(1);
    expect(drifted.output).toContain('tasks');
  });

  it('(d) compileSpecDir rawSections carry the FILE key order, not zod\'s', async () => {
    const bundle = conformingBundle();
    const rootA = makeSpecRoot(bundle); // in-memory (schema-like) order
    const rootB = makeSpecRoot(bundle, { order: 'rotate' }); // same semantics, rotated bytes

    const a = await compileSpecDir(rootA);
    const b = await compileSpecDir(rootB);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);

    // rawSections reproduce the file bytes exactly — key order included.
    for (const name of SECTION_FILES) {
      const bytes = readFileSync(join(rootB, 'spec', `${name}.json`), 'utf8');
      expect(JSON.stringify(b.rawSections![name])).toBe(JSON.stringify(JSON.parse(bytes)));
    }

    // The zod-parsed bundle is order-normalized: identical for both dirs and
    // keyed in the SCHEMA's order, while each dir's raw sections keep that
    // dir's own file order.
    expect(a.bundle).toEqual(b.bundle);
    expect(Object.keys(a.bundle!.tasks[0])).toEqual(Object.keys(b.bundle!.tasks[0]));
    expect(JSON.stringify(a.rawSections!.tasks)).not.toBe(JSON.stringify(b.rawSections!.tasks));
    expect(Object.keys(b.bundle!.tasks[0])).not.toEqual(Object.keys(b.rawSections!.tasks[0]));
  });
});

describe('manifest.hash_version (additive optional field)', () => {
  const validManifest = conformingBundle().manifest as Record<string, unknown>;

  it('manifests WITHOUT hash_version still parse (every pre-v2 manifest)', () => {
    expect(validManifest.hash_version).toBeUndefined();
    expect(ManifestSchema.parse(validManifest)).toBeTruthy();
  });

  it('accepts hash_version: 2 (new freezes)', () => {
    expect(ManifestSchema.parse({ ...validManifest, hash_version: 2 })).toBeTruthy();
  });

  it('rejects non-positive and non-integer values (stamp is 2, never hand-authored)', () => {
    expect(() => ManifestSchema.parse({ ...validManifest, hash_version: 0 })).toThrow();
    expect(() => ManifestSchema.parse({ ...validManifest, hash_version: 1.5 })).toThrow();
  });
});


describe('S3-L-04: committed immutable pre-Renewal frozen fixture', () => {
  it('the genuine pre-Renewal artifact verifies unchanged (v1 legacy bytes, file key order)', async () => {
    const compiled = await compileSpecDir(PRE_RENEWAL_FIXTURE);
    expect(compiled.bundle).toBeTruthy();
    const result = verifyFrozen(compiled.bundle!, compiled.rawSections);
    expect(result.ok).toBe(true);
    expect(result.drifted).toEqual([]);
  });

  it('a one-value semantic mutation of the fixture DRIFTS', async () => {
    const mutated = mkdtempSync(join(tmpdir(), 'lco-pre-renewal-mut-'));
    try {
      mkdirSync(join(mutated, 'spec'), { recursive: true });
      for (const f of ['manifest', 'intent', 'glossary', 'assumptions', 'evidence', 'requirements', 'decisions', 'contracts', 'tasks']) {
        const src = readFileSync(join(PRE_RENEWAL_FIXTURE, 'spec', `${f}.json`), 'utf8');
        writeFileSync(join(mutated, 'spec', `${f}.json`), f === 'intent' ? src.replace('EXAMPLE intent', 'MUTATED intent') : src);
      }
      const compiled = await compileSpecDir(mutated);
      const result = verifyFrozen(compiled.bundle!, compiled.rawSections);
      expect(result.ok).toBe(false);
      expect(result.drifted).toContain('intent');
    } finally {
      rmSync(mutated, { recursive: true, force: true });
    }
  });
});
