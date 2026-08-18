import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { verifyFrozen } from './verify';
import { freeze } from './freeze';
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
