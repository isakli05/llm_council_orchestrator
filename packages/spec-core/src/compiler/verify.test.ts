import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { verifyFrozen } from './verify';
import { freeze } from './freeze';
import { legacySectionHash } from './hash';
import type { SpecBundle } from '../schemas';
import type { LintResult } from '../lint/types';

const FIXTURES = join(__dirname, '../../fixtures');
const NOW = '2026-08-18T12:00:00Z';

function loadBundle(rel: string): SpecBundle {
  return JSON.parse(readFileSync(join(FIXTURES, rel), 'utf8')) as SpecBundle;
}

const cleanLint: LintResult = { errors: [], warnings: [], summary: {} };

describe('verifyFrozen', () => {
  it('detects the seeded drift in fixtures/bad/drift (stored tasks hash != recomputed)', () => {
    const result = verifyFrozen(loadBundle('bad/drift/bundle.json'));

    expect(result.ok).toBe(false);
    expect(result.drifted).toEqual(['tasks']);
  });

  it('accepts a bundle produced by freeze (freeze-then-verify round trip)', () => {
    const frozen = freeze(loadBundle('good/pet-clinic/bundle.json'), cleanLint, NOW);

    expect(frozen.ok).toBe(true);
    expect(verifyFrozen(frozen.bundle!)).toEqual({ ok: true, drifted: [] });
  });

  it('accepts a frozen legacy bundle (legacy hash key present on both sides)', () => {
    const frozen = freeze(loadBundle('good/legacy-crm/bundle.json'), cleanLint, NOW);

    expect(frozen.ok).toBe(true);
    expect(verifyFrozen(frozen.bundle!).ok).toBe(true);
  });

  it('flags a hash key missing from the stored side (frozen bundle, tasks entry removed)', () => {
    const frozen = freeze(loadBundle('good/pet-clinic/bundle.json'), cleanLint, NOW);
    delete frozen.bundle!.manifest.artifact_hashes.tasks;

    const result = verifyFrozen(frozen.bundle!);
    expect(result.ok).toBe(false);
    expect(result.drifted).toContain('tasks');
  });

  it('flags a hash key present only in the stored side (bogus legacy entry)', () => {
    const frozen = freeze(loadBundle('good/pet-clinic/bundle.json'), cleanLint, NOW);
    frozen.bundle!.manifest.artifact_hashes.legacy =
      'sha256:0000000000000000000000000000000000000000000000000000000000000000';

    const result = verifyFrozen(frozen.bundle!);
    expect(result.ok).toBe(false);
    expect(result.drifted).toContain('legacy');
  });

  it('a draft bundle with empty artifact_hashes drifts on every hash section', () => {
    // Documents the contract: verify targets FROZEN bundles. A draft manifest
    // records no hashes, so every hash section counts as drifted.
    const result = verifyFrozen(loadBundle('good/pet-clinic/bundle.json'));

    expect(result.ok).toBe(false);
    expect(result.drifted.sort()).toEqual(
      [
        'intent',
        'glossary',
        'assumptions',
        'evidence',
        'requirements',
        'decisions',
        'contracts',
        'tasks',
      ].sort(),
    );
  });

  it('reports notFrozen: true for a draft bundle (state is not frozen)', () => {
    const result = verifyFrozen(loadBundle('good/pet-clinic/bundle.json'));

    expect(result.notFrozen).toBe(true);
  });

  it('does not set notFrozen for a bundle produced by freeze', () => {
    const frozen = freeze(loadBundle('good/pet-clinic/bundle.json'), cleanLint, NOW);

    expect(frozen.ok).toBe(true);
    expect(verifyFrozen(frozen.bundle!).notFrozen).toBeUndefined();
  });

  it('reports notFrozen: true even when a draft manifest carries bogus pinned hashes', () => {
    // A non-frozen manifest could still hold a full (possibly fabricated) hash
    // set; the state flag must surface regardless of drift bookkeeping.
    const draft = loadBundle('good/pet-clinic/bundle.json');
    const pinned = freeze(loadBundle('good/pet-clinic/bundle.json'), cleanLint, NOW);
    draft.manifest.artifact_hashes = pinned.bundle!.manifest.artifact_hashes;

    const result = verifyFrozen(draft);
    expect(result.notFrozen).toBe(true);
    expect(result.ok).toBe(true); // hashes agree — drift alone would look clean
  });
});

// --- INV-H1: hash v2 compatibility ---------------------------------------------
//
// A pre-v2 freeze stored sha256(JSON.stringify(section, null, 2)) in the key
// order ITS build produced. The acceptance rule: a stored hash verifies when
// the v2 canonical hash matches, or (no hash_version >= 2 marker) when the
// legacy hash over the section AS PARSED FROM FILE (rawSections) matches.

describe('verifyFrozen: hash v2 compatibility (INV-H1)', () => {
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

  /** Recursively reverse every object's key order — deterministic stand-in
   * for "the key order the freezing build's serializer produced". */
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

  /** The eight hashed sections with every key order reversed. */
  function reversedSections(b: SpecBundle): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of HASHED_KEYS) out[key] = reverseKeys(b[key]);
    return out;
  }

  /**
   * A pre-v2 frozen bundle: manifest.state frozen, NO hash_version marker,
   * and stored artifact_hashes = legacy v1 hashes over `rawSections` (the
   * bytes the freezing build saw). The bundle itself keeps its own (fixture)
   * key order, which differs from `rawSections`' order — the exact shape of
   * the S2-H-08 defect.
   */
  function legacyFrozenBundle(): { bundle: SpecBundle; rawSections: Record<string, unknown> } {
    const frozen = freeze(loadBundle('good/pet-clinic/bundle.json'), cleanLint, NOW);
    expect(frozen.ok).toBe(true);
    const bundle = frozen.bundle!;
    const rawSections = reversedSections(bundle);
    delete bundle.manifest.hash_version; // pre-v2 freeze: no marker
    for (const key of HASHED_KEYS) {
      bundle.manifest.artifact_hashes[key] = legacySectionHash(rawSections[key]);
    }
    return { bundle, rawSections };
  }

  it('LEGACY-COMPAT: accepts a pre-v2 freeze whose stored hashes match the RAW sections, not the bundle order', () => {
    const { bundle, rawSections } = legacyFrozenBundle();

    const result = verifyFrozen(bundle, rawSections);
    expect(result).toEqual({ ok: true, drifted: [] });
  });

  it('without rawSections the same pre-v2 freeze drifts (why verify passes the raw sections)', () => {
    const { bundle } = legacyFrozenBundle();

    const result = verifyFrozen(bundle);
    expect(result.ok).toBe(false);
    // Three sections cannot demonstrate the defect by construction: `intent`
    // and `glossary` have exactly two keys whose REVERSED order already IS the
    // sorted (canonical) order — the canonical check rescues them without any
    // raw section — and `contracts` is an empty array. The remaining five need
    // the raw file order: their legacy fallback (bundle key order) misses the
    // stored (raw key order) bytes — the S2-H-08 defect shape.
    expect(result.drifted.sort()).toEqual(
      ['assumptions', 'decisions', 'evidence', 'requirements', 'tasks'].sort(),
    );
  });

  it('a REAL semantic change drifts under the legacy rule (compat is not a free pass)', () => {
    const { bundle, rawSections } = legacyFrozenBundle();
    bundle.tasks[0].title = bundle.tasks[0].title + ' (edited)';
    rawSections.tasks = reverseKeys(bundle.tasks);

    const result = verifyFrozen(bundle, rawSections);
    expect(result.ok).toBe(false);
    expect(result.drifted).toEqual(['tasks']);
  });

  it('STRICT: with manifest.hash_version 2 a stored v1 hash is rejected even though the legacy hash matches', () => {
    const { bundle, rawSections } = legacyFrozenBundle();
    bundle.manifest.hash_version = 2; // v2 freezes are canonical-only

    const result = verifyFrozen(bundle, rawSections);
    expect(result.ok).toBe(false);
    // Three sections cannot drift here even under strict mode, by construction:
    // `intent` and `glossary` have exactly two keys whose REVERSED order is
    // already the sorted (canonical) order — their stored legacy hash IS the
    // canonical hash — and `contracts` is an empty array. Everything else is
    // rejected: strict mode accepts the canonical hash only.
    expect(result.drifted.sort()).toEqual(
      ['assumptions', 'evidence', 'requirements', 'decisions', 'tasks'].sort(),
    );
  });

  it('a v2 freeze verifies regardless of the raw sections\' key order (canonical invariance)', () => {
    const frozen = freeze(loadBundle('good/pet-clinic/bundle.json'), cleanLint, NOW);
    expect(frozen.ok).toBe(true);
    expect(frozen.bundle!.manifest.hash_version).toBe(2);

    const rawSections = reversedSections(frozen.bundle!);
    expect(verifyFrozen(frozen.bundle!, rawSections)).toEqual({ ok: true, drifted: [] });
    expect(verifyFrozen(frozen.bundle!)).toEqual({ ok: true, drifted: [] });
  });
});
