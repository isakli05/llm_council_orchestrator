import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { artifactHashes, sha256Content } from './hash';
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

describe('artifactHashes', () => {
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

  it('is byte-exact: sha256 of JSON.stringify(section, null, 2)', () => {
    const bundle = loadBundle('good/pet-clinic/bundle.json');
    const hashes = artifactHashes(bundle);
    for (const key of HASHED_KEYS) {
      const expected =
        'sha256:' + createHash('sha256').update(JSON.stringify(bundle[key], null, 2)).digest('hex');
      expect(hashes[key]).toBe(expected);
    }
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

  // CARRY-FORWARD: the drift fixture's non-tampered manifest hashes were
  // generated with exactly sha256:hex(sha256(JSON.stringify(section, null, 2))).
  // Reproducing them byte-for-byte is what makes drift detection possible.
  it('reproduces every non-tasks hash in fixtures/bad/drift byte-for-byte, and differs on tasks', () => {
    const drift = loadBundle('bad/drift/bundle.json');
    const hashes = artifactHashes(drift);
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
