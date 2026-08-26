import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { freeze } from './freeze';
import { artifactHashes } from './hash';
import type { SpecBundle } from '../schemas';
import type { LintResult } from '../lint/types';

const FIXTURES = join(__dirname, '../../fixtures');
const NOW = '2026-08-18T12:00:00Z';

function loadBundle(rel: string): SpecBundle {
  return JSON.parse(readFileSync(join(FIXTURES, rel), 'utf8')) as SpecBundle;
}

const cleanLint: LintResult = { errors: [], warnings: [], summary: {} };

function lintWithErrors(...errors: LintResult['errors']): LintResult {
  return { errors, warnings: [], summary: { total: errors.length } };
}

describe('freeze: success path', () => {
  it('freezes a clean pet-clinic bundle with a clean lint result', () => {
    const result = freeze(loadBundle('good/pet-clinic/bundle.json'), cleanLint, NOW);

    expect(result.ok).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.bundle).toBeDefined();
    expect(result.bundle!.manifest.state).toBe('frozen');
    expect(result.bundle!.manifest.frozen_at).toBe(NOW);
    expect(result.bundle!.manifest.spec_version).toBe(1); // freeze does not bump the version
  });

  it('embeds artifact_hashes consistent with artifactHashes() of the frozen bundle', () => {
    const result = freeze(loadBundle('good/pet-clinic/bundle.json'), cleanLint, NOW);

    const frozen = result.bundle!;
    expect(frozen.manifest.artifact_hashes).toEqual(artifactHashes(frozen));
    expect(Object.keys(frozen.manifest.artifact_hashes).sort()).toEqual(
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

  it('includes the legacy hash when the bundle carries a legacy package', () => {
    const result = freeze(loadBundle('good/legacy-crm/bundle.json'), cleanLint, NOW);
    expect(result.ok).toBe(true);
    expect(result.bundle!.manifest.artifact_hashes.legacy).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('does not mutate the input bundle', () => {
    const input = loadBundle('good/pet-clinic/bundle.json');
    const snapshot = JSON.stringify(input);

    freeze(input, cleanLint, NOW);

    expect(JSON.stringify(input)).toBe(snapshot);
    expect(input.manifest.state).toBe('draft');
  });
});

describe('freeze: gate failures (fail-closed)', () => {
  it('rejects fixtures/bad/unresolved with human-readable UNRESOLVED reasons', () => {
    const result = freeze(loadBundle('bad/unresolved/bundle.json'), cleanLint, NOW);

    expect(result.ok).toBe(false);
    expect(result.bundle).toBeUndefined();
    expect(result.reasons.length).toBeGreaterThan(0);
    // The fixture violates two gates: unresolved_count=1 and a DEC with status UNRESOLVED.
    expect(result.reasons.some((r) => r.includes('unresolved_count'))).toBe(true);
    expect(result.reasons.some((r) => r.includes('UNRESOLVED'))).toBe(true);
    expect(result.reasons.some((r) => r.includes('DEC-0002'))).toBe(true);
  });

  it('rejects when lint reports errors, even on a clean bundle', () => {
    const lint = lintWithErrors({
      rule: 'L01_UNDEFINED_TERM',
      severity: 'error',
      path: 'glossary',
      message: 'term **Owner** is not defined in the glossary',
    });

    const result = freeze(loadBundle('good/pet-clinic/bundle.json'), lint, NOW);

    expect(result.ok).toBe(false);
    expect(result.bundle).toBeUndefined();
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.reasons.some((r) => r.includes('L01_UNDEFINED_TERM'))).toBe(true);
  });

  it('rejects when manifest.blocking_count > 0', () => {
    const bundle = loadBundle('good/pet-clinic/bundle.json');
    bundle.manifest.blocking_count = 1;

    const result = freeze(bundle, cleanLint, NOW);

    expect(result.ok).toBe(false);
    expect(result.bundle).toBeUndefined();
    expect(result.reasons.some((r) => r.includes('blocking_count'))).toBe(true);
  });

  it('rejects when a decision has status UNRESOLVED but unresolved_count understates it', () => {
    const bundle = loadBundle('good/pet-clinic/bundle.json');
    bundle.manifest.unresolved_count = 0;
    bundle.decisions.push({
      claim_id: 'DEC-0099',
      decision: 'placeholder',
      rationale: 'count says zero but this decision is unresolved',
      evidence: [],
      confidence: 0.1,
      impact: 'low',
      assumptions: [],
      alternatives: [],
      status: 'UNRESOLVED',
    });

    const result = freeze(bundle, cleanLint, NOW);

    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.includes('DEC-0099'))).toBe(true);
  });

  it('lists EVERY violated gate, not just the first one', () => {
    const lint = lintWithErrors({
      rule: 'L02_ORPHAN_REQUIREMENT',
      severity: 'error',
      path: 'requirements[2]',
      message: 'requirement is not referenced by any task',
    });
    const bundle = loadBundle('bad/unresolved/bundle.json');
    bundle.manifest.blocking_count = 3;

    const result = freeze(bundle, lint, NOW);

    expect(result.ok).toBe(false);
    // All four gates are violated: lint errors, unresolved_count, blocking_count, UNRESOLVED decision.
    expect(result.reasons.length).toBe(4);
    expect(result.reasons.some((r) => r.includes('L02_ORPHAN_REQUIREMENT'))).toBe(true);
    expect(result.reasons.some((r) => r.includes('unresolved_count'))).toBe(true);
    expect(result.reasons.some((r) => r.includes('blocking_count'))).toBe(true);
    expect(result.reasons.some((r) => r.includes('UNRESOLVED'))).toBe(true);
  });
});

describe('freeze: determinism', () => {
  it('two identical calls produce byte-for-byte identical results', () => {
    const a = freeze(loadBundle('good/pet-clinic/bundle.json'), cleanLint, NOW);
    const b = freeze(loadBundle('good/pet-clinic/bundle.json'), cleanLint, NOW);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('the timestamp only affects frozen_at, never the artifact hashes', () => {
    const a = freeze(loadBundle('good/pet-clinic/bundle.json'), cleanLint, NOW);
    const b = freeze(loadBundle('good/pet-clinic/bundle.json'), cleanLint, '2027-01-01T00:00:00Z');

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(a.bundle!.manifest.frozen_at).toBe(NOW);
    expect(b.bundle!.manifest.frozen_at).toBe('2027-01-01T00:00:00Z');
    expect(a.bundle!.manifest.artifact_hashes).toEqual(b.bundle!.manifest.artifact_hashes);
  });
});

describe('freeze: lifecycle transition gate (BACK-002)', () => {
  /** pet-clinic with only manifest.state flipped; counters stay 0 and lint is clean. */
  function inState(state: SpecBundle['manifest']['state']): SpecBundle {
    const b = loadBundle('good/pet-clinic/bundle.json');
    b.manifest.state = state;
    return b;
  }

  function frozenPetClinic(): SpecBundle {
    const result = freeze(loadBundle('good/pet-clinic/bundle.json'), cleanLint, NOW);
    expect(result.ok).toBe(true);
    return result.bundle!;
  }

  // Audit BACK-002 (b): a blocked manifest with zero counters used to pass
  // every existing gate and freeze. The lifecycle gate must reject it.
  it("rejects freezing a 'blocked' bundle even with clean lint and zero counters", () => {
    const result = freeze(inState('blocked'), cleanLint, NOW);

    expect(result.ok).toBe(false);
    expect(result.bundle).toBeUndefined();
    expect(result.reasons.some((r) => r.includes("'blocked'"))).toBe(true);
    expect(result.reasons.some((r) => r.includes('draft'))).toBe(true);
  });

  it("rejects freezing 'superseded' and 'reviewed' bundles", () => {
    for (const state of ['superseded', 'reviewed'] as const) {
      const result = freeze(inState(state), cleanLint, NOW);
      expect(result.ok).toBe(false);
      expect(result.reasons.some((r) => r.includes(`'${state}'`))).toBe(true);
    }
  });

  // Audit BACK-002 (c): re-freezing an already-frozen spec used to re-pin
  // hand-edited sections under the SAME version, laundering the drift.
  it('rejects re-freezing an already-frozen bundle and directs to lco change', () => {
    const result = freeze(frozenPetClinic(), cleanLint, NOW);

    expect(result.ok).toBe(false);
    expect(result.bundle).toBeUndefined();
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.reasons.some((r) => r.includes("'frozen'"))).toBe(true);
    expect(result.reasons.some((r) => r.toLowerCase().includes('change'))).toBe(true);
  });

  it('rejects a draft with frozen_at residue', () => {
    const b = inState('draft');
    b.manifest.frozen_at = NOW;
    const result = freeze(b, cleanLint, NOW);

    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.includes('frozen_at'))).toBe(true);
  });

  it('rejects impossible version provenance (v1 with pinned hashes; v2 without any)', () => {
    const flippedBack = frozenPetClinic();
    flippedBack.manifest.state = 'draft';
    delete flippedBack.manifest.frozen_at;
    const r1 = freeze(flippedBack, cleanLint, NOW);
    expect(r1.ok).toBe(false);
    expect(r1.reasons.some((r) => r.includes('spec_version is 1'))).toBe(true);

    const orphan = loadBundle('good/pet-clinic/bundle.json');
    orphan.manifest.spec_version = 2;
    const r2 = freeze(orphan, cleanLint, NOW);
    expect(r2.ok).toBe(false);
    expect(r2.reasons.some((r) => r.includes('spec_version is 2'))).toBe(true);
  });

  it('still freezes the legitimate post-change draft (v2 with prior pinned hashes)', async () => {
    const { applyChangeSet } = await import('./changeset');
    const changed = applyChangeSet(
      frozenPetClinic(),
      { id: 'cs-f1', rationale: 'freeze gate probe', modified_tasks: [{ task_id: 'TASK-0001', patch: { title: 'Retitled' } }] },
      NOW,
    );
    expect(changed.ok).toBe(true);

    const reFrozen = freeze(changed.bundle!, cleanLint, NOW);
    expect(reFrozen.ok).toBe(true);
    expect(reFrozen.bundle!.manifest.spec_version).toBe(2); // freeze never bumps the version
  });
});
