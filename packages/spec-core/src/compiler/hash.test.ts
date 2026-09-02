import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { artifactHashes, canonicalJson, legacyArtifactHashes, sha256Content } from './hash';
import type { SpecBundle } from '../schemas';

const FIXTURES = join(__dirname, '../../fixtures');

function loadBundle(rel: string): SpecBundle {
  return JSON.parse(readFileSync(join(FIXTURES, rel), 'utf8')) as SpecBundle;
}

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

/** Recursively reverse every object's key order — a deterministic stand-in
 * for "the key order some other build's serializer produced". */
function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value !== null && typeof value === 'object') {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).reverse()) out[key] = reverseKeys(src[key]);
    return out;
  }
  return value;
}

describe('sha256Content', () => {
  it('hashes the known vector "hello" to its real sha256', () => {
    // Verified with: echo -n hello | sha256sum
    // => 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
    expect(sha256Content('hello')).toBe(
      'sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });

  it('returns the sha256:<64 lowercase hex> format', () => {
    expect(sha256Content('')).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(sha256Content('lco-spec')).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('is deterministic for identical input', () => {
    expect(sha256Content('same input')).toBe(sha256Content('same input'));
  });

  it('is sensitive to a single character', () => {
    expect(sha256Content('hello')).not.toBe(sha256Content('hellp'));
    expect(sha256Content('hello')).not.toBe(sha256Content('hello '));
  });
});

describe('canonicalJson', () => {
  it('sorts object keys lexicographically, recursively', () => {
    expect(canonicalJson({ b: 1, a: { d: true, c: [3, 1, 2] } })).toBe(
      JSON.stringify({ a: { c: [3, 1, 2], d: true }, b: 1 }, null, 2),
    );
  });

  it('preserves array element order (only object keys are sorted)', () => {
    const canonical = JSON.parse(canonicalJson([{ z: 1, a: 2 }, { y: 0, b: 1 }])) as Array<
      Record<string, unknown>
    >;
    expect(Object.keys(canonical[0]!)).toEqual(['a', 'z']);
    expect(Object.keys(canonical[1]!)).toEqual(['b', 'y']);
    expect(canonicalJson(['x', 'a', 'm'])).toBe(JSON.stringify(['x', 'a', 'm'], null, 2));
  });

  it('is invariant under any object key reordering (hash v2 stability)', () => {
    const a = { x: { q: 1, p: 2 }, z: [{ n: 1, m: 2 }] };
    const b = { z: [{ m: 2, n: 1 }], x: { p: 2, q: 1 } };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(sha256Content(canonicalJson(a))).toBe(sha256Content(canonicalJson(b)));
  });

  it('pretty-prints with the same 2-space form the v1 serialization used', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(JSON.stringify({ a: 2, b: 1 }, null, 2));
  });

  it('leaves already-sorted input byte-identical to JSON.stringify(value, null, 2)', () => {
    const sorted = { a: { b: [1, { c: 2 }] }, z: null };
    expect(canonicalJson(sorted)).toBe(JSON.stringify(sorted, null, 2));
  });
});

describe('artifactHashes (v2 — canonical)', () => {
  it('is deterministic: the same bundle hashes identically twice', () => {
    const bundle = loadBundle('good/pet-clinic/bundle.json');
    expect(artifactHashes(bundle)).toEqual(artifactHashes(bundle));
  });

  it('hashes exactly the eight hashed sections (no manifest, no test_files)', () => {
    const hashes = artifactHashes(loadBundle('good/pet-clinic/bundle.json'));
    expect(Object.keys(hashes).sort()).toEqual([...HASHED_KEYS].sort());
  });

  it('includes legacy when the bundle carries it', () => {
    const bundle = loadBundle('good/legacy-crm/bundle.json');
    const hashes = artifactHashes(bundle);
    expect(Object.keys(hashes).sort()).toEqual([...HASHED_KEYS, 'legacy'].sort());
    expect(hashes.legacy).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('is byte-exact: sha256 of canonicalJson(section)', () => {
    const bundle = loadBundle('good/pet-clinic/bundle.json');
    const hashes = artifactHashes(bundle);
    for (const key of HASHED_KEYS) {
      const expected =
        'sha256:' + createHash('sha256').update(canonicalJson(bundle[key])).digest('hex');
      expect(hashes[key]).toBe(expected);
    }
  });

  // INV-H1 core: the v2 hash of a section is independent of the key order
  // any producer (zod version, file, hand edit) happens to impose on it.
  it('is key-order independent: reversing every object key order changes no hash', () => {
    const bundle = loadBundle('good/pet-clinic/bundle.json');
    const baseline = artifactHashes(bundle);
    const reordered = { ...bundle } as Record<string, unknown>;
    for (const key of HASHED_KEYS) {
      reordered[key] = reverseKeys(bundle[key]);
    }
    expect(artifactHashes(reordered as unknown as SpecBundle)).toEqual(baseline);
  });

  it('a single-character change flips only the touched section hash', () => {
    const bundle = loadBundle('good/pet-clinic/bundle.json');
    const baseline = artifactHashes(bundle);

    const intentEdit = structuredClone(bundle);
    intentEdit.intent.statement = intentEdit.intent.statement.replace('s', 'S');
    const intentHashes = artifactHashes(intentEdit);
    expect(intentHashes.intent).not.toBe(baseline.intent);
    for (const key of HASHED_KEYS) {
      if (key !== 'intent') expect(intentHashes[key]).toBe(baseline[key]);
    }

    const taskEdit = structuredClone(bundle);
    taskEdit.tasks[0].title = taskEdit.tasks[0].title + '!';
    const taskHashes = artifactHashes(taskEdit);
    expect(taskHashes.tasks).not.toBe(baseline.tasks);
    for (const key of HASHED_KEYS) {
      if (key !== 'tasks') expect(taskHashes[key]).toBe(baseline[key]);
    }
  });

  // CARRY-FORWARD (v1 side): the drift fixture's non-tampered manifest hashes
  // were generated with exactly sha256:hex(sha256(JSON.stringify(section,
  // null, 2))) — v1-era, key-order-dependent bytes. legacyArtifactHashes
  // reproducing them byte-for-byte over the sections as they sit in the
  // fixture file is what lets verify's compatibility rule accept pre-v2
  // freezes while the tampered tasks section still drifts.
  it('legacyArtifactHashes reproduces every non-tasks hash in fixtures/bad/drift byte-for-byte, and differs on tasks', () => {
    const drift = loadBundle('bad/drift/bundle.json');
    const hashes = legacyArtifactHashes(drift);
    const stored = drift.manifest.artifact_hashes;

    for (const key of HASHED_KEYS) {
      if (key === 'tasks') continue;
      expect(hashes[key]).toBe(stored[key]);
    }
    // The seeded drift: the tasks section was tampered with without updating
    // the manifest hash for it.
    expect(hashes.tasks).not.toBe(stored.tasks);
  });
});

describe('legacyArtifactHashes (v1 — compat only)', () => {
  it('is byte-exact v1: sha256 of JSON.stringify(section, null, 2) in the given key order', () => {
    const bundle = loadBundle('good/pet-clinic/bundle.json');
    const hashes = legacyArtifactHashes(bundle);
    for (const key of HASHED_KEYS) {
      const expected =
        'sha256:' +
        createHash('sha256').update(JSON.stringify(bundle[key], null, 2)).digest('hex');
      expect(hashes[key]).toBe(expected);
    }
  });

  it('is key-order DEPENDENT — the v1 defect that v2 canonical hashing removes', () => {
    const bundle = loadBundle('good/pet-clinic/bundle.json');
    const baseline = legacyArtifactHashes(bundle);
    const reordered = { ...bundle } as Record<string, unknown>;
    reordered.tasks = reverseKeys(bundle.tasks);
    expect(legacyArtifactHashes(reordered as unknown as SpecBundle).tasks).not.toBe(
      baseline.tasks,
    );
  });
});
