import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  LIFECYCLE_STATES,
  LIFECYCLE_TRANSITIONS,
  checkTransition,
  lifecycleStateFindings,
  validateFreeze,
  validateGenerationOutput,
  validateChangeSource,
} from './lifecycle';
import { freeze } from './freeze';
import { applyChangeSet } from './changeset';
import type { SpecBundle } from '../schemas';
import type { LintResult } from '../lint/types';

const FIXTURES = join(__dirname, '../../fixtures');
const NOW = '2026-08-18T12:00:00Z';
const CHANGED_AT = '2026-08-18T14:30:00Z';

function loadBundle(rel: string): SpecBundle {
  return JSON.parse(readFileSync(join(FIXTURES, rel), 'utf8')) as SpecBundle;
}

const cleanLint: LintResult = { errors: [], warnings: [], summary: {} };

/** pet-clinic with only the manifest.state field flipped (counters stay 0). */
function inState(state: SpecBundle['manifest']['state']): SpecBundle {
  const b = structuredClone(loadBundle('good/pet-clinic/bundle.json'));
  b.manifest.state = state;
  return b;
}

/** A real frozen bundle: pet-clinic passed through freeze() (hashes pinned). */
function frozenBundle(): SpecBundle {
  const result = freeze(loadBundle('good/pet-clinic/bundle.json'), cleanLint, NOW);
  expect(result.ok).toBe(true);
  return result.bundle!;
}

describe('the transition table (single source of truth)', () => {
  it('declares exactly the four lifecycle states', () => {
    expect([...LIFECYCLE_STATES].sort()).toEqual(['blocked', 'draft', 'frozen', 'superseded']);
  });

  it('declares exactly one transition per operation, each with documented guards', () => {
    const ops = LIFECYCLE_TRANSITIONS.map((t) => t.op);
    expect(ops.sort()).toEqual(['change', 'freeze', 'generate']);
    for (const t of LIFECYCLE_TRANSITIONS) {
      if (t.op === 'generate') {
        expect(t.from).toEqual([]); // creation: no source state
      } else {
        expect(t.from.length).toBeGreaterThan(0); // explicit source states
        for (const s of t.from) expect(LIFECYCLE_STATES).toContain(s);
      }
      expect(LIFECYCLE_STATES).toContain(t.to);
      expect(t.guards.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(10);
    }
  });

  it('the freeze transition is draft -> frozen ONLY (no other source state)', () => {
    const rule = LIFECYCLE_TRANSITIONS.find((t) => t.op === 'freeze')!;
    expect(rule.from).toEqual(['draft']);
    expect(rule.to).toBe('frozen');
  });

  it('the change transition is frozen -> draft ONLY (the sole version advancer)', () => {
    const rule = LIFECYCLE_TRANSITIONS.find((t) => t.op === 'change')!;
    expect(rule.from).toEqual(['frozen']);
    expect(rule.to).toBe('draft');
  });
});

describe('checkTransition: pure table lookup', () => {
  it('legal lookups pass', () => {
    expect(checkTransition('freeze', 'draft').ok).toBe(true);
    expect(checkTransition('change', 'frozen').ok).toBe(true);
  });

  it('every illegal lookup fails with a reason naming the transition and the current state', () => {
    for (const state of ['frozen', 'blocked', 'superseded', 'reviewed'] as const) {
      const r = checkTransition('freeze', state);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.reason).toContain('freeze');
        expect(r.reason).toContain(`'${state}'`);
        expect(r.reason).toContain('draft');
      }
    }
    for (const state of ['draft', 'blocked', 'superseded', 'reviewed'] as const) {
      const r = checkTransition('change', state);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toContain('frozen');
    }
  });

  it('is deterministic: identical inputs give byte-identical results', () => {
    const a = checkTransition('freeze', 'frozen');
    const b = checkTransition('freeze', 'frozen');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('validateFreeze: the freeze precondition (transition + guards)', () => {
  it('accepts a clean draft (v1, empty hashes)', () => {
    expect(validateFreeze(loadBundle('good/pet-clinic/bundle.json'), cleanLint)).toEqual([]);
  });

  it('accepts a legitimate post-change draft (v2, hashes pinned by the prior freeze)', () => {
    const changed = applyChangeSet(
      frozenBundle(),
      { id: 'cs-l1', rationale: 'lifecycle probe', modified_tasks: [{ task_id: 'TASK-0001', patch: { title: 'New title' } }] },
      CHANGED_AT,
    );
    expect(changed.ok).toBe(true);
    expect(validateFreeze(changed.bundle!, cleanLint)).toEqual([]);
  });

  // Audit BACK-002 (c): freeze must not launder a frozen spec's content.
  it('rejects re-freezing an already-frozen bundle and points at lco change', () => {
    const reasons = validateFreeze(frozenBundle(), cleanLint);
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons.some((r) => r.includes("'frozen'"))).toBe(true);
    expect(reasons.some((r) => r.toLowerCase().includes('change'))).toBe(true);
  });

  // Audit BACK-002 (b): blocked must not be freezable.
  it('rejects freezing a blocked bundle even with zero counters and clean lint', () => {
    const reasons = validateFreeze(inState('blocked'), cleanLint);
    expect(reasons.some((r) => r.includes("'blocked'"))).toBe(true);
  });

  it('rejects freezing superseded and reviewed bundles', () => {
    expect(validateFreeze(inState('superseded'), cleanLint).length).toBeGreaterThan(0);
    expect(validateFreeze(inState('reviewed'), cleanLint).length).toBeGreaterThan(0);
  });

  it('rejects a draft that still carries frozen_at (freeze residue)', () => {
    const b = structuredClone(loadBundle('good/pet-clinic/bundle.json'));
    b.manifest.frozen_at = NOW;
    const reasons = validateFreeze(b, cleanLint);
    expect(reasons.some((r) => r.includes('frozen_at'))).toBe(true);
  });

  it('rejects a v1 draft with pinned hashes (impossible provenance: only freeze pins, and freeze requires v>1 to come from change)', () => {
    const b = frozenBundle();
    b.manifest.state = 'draft'; // hand-flip back to draft, keep the pinned hashes
    delete b.manifest.frozen_at;
    const reasons = validateFreeze(b, cleanLint);
    expect(reasons.some((r) => r.includes('spec_version is 1'))).toBe(true);
  });

  it('rejects a v2 draft with empty hashes (no prior freeze — version cannot have advanced)', () => {
    const b = structuredClone(loadBundle('good/pet-clinic/bundle.json'));
    b.manifest.spec_version = 2;
    const reasons = validateFreeze(b, cleanLint);
    expect(reasons.some((r) => r.includes('spec_version is 2'))).toBe(true);
  });

  it('keeps the classic guards: lint errors, counters, UNRESOLVED decisions', () => {
    const b = structuredClone(loadBundle('bad/unresolved/bundle.json'));
    const reasons = validateFreeze(b, cleanLint);
    expect(reasons.some((r) => r.includes('unresolved_count'))).toBe(true);
    expect(reasons.some((r) => r.includes('UNRESOLVED'))).toBe(true);

    const lint = {
      errors: [{ rule: 'L01_UNDEFINED_TERM', severity: 'error', path: 'glossary', message: 'x' }],
      warnings: [],
      summary: {},
    } as LintResult;
    expect(validateFreeze(loadBundle('good/pet-clinic/bundle.json'), lint).length).toBeGreaterThan(0);
  });
});

describe('validateChangeSource: the change precondition', () => {
  it('accepts a frozen bundle', () => {
    expect(validateChangeSource(frozenBundle())).toEqual([]);
  });

  it('rejects draft, blocked, superseded, and reviewed bundles', () => {
    for (const state of ['draft', 'blocked', 'superseded', 'reviewed'] as const) {
      const reasons = validateChangeSource(inState(state));
      expect(reasons.length).toBeGreaterThan(0);
      expect(reasons.some((r) => r.includes('frozen'))).toBe(true);
    }
  });
});

describe('validateGenerationOutput: the generation contract', () => {
  it('accepts a proper draft output (state draft, requested profile, v1, no freeze residue)', () => {
    expect(validateGenerationOutput(loadBundle('good/pet-clinic/bundle.json'), 'p-mini')).toEqual([]);
  });

  // Audit BACK-002 (a): a model claiming state 'frozen' must be rejected.
  it("rejects manifest.state 'frozen' (and 'blocked', 'superseded', 'reviewed') with an actionable reason", () => {
    for (const state of ['frozen', 'blocked', 'superseded', 'reviewed'] as const) {
      const reasons = validateGenerationOutput(inState(state), 'p-mini');
      expect(reasons.length).toBeGreaterThan(0);
      expect(reasons.some((r) => r.includes("'draft'") && r.includes(`'${state}'`))).toBe(true);
    }
  });

  it('rejects a complexity_profile that does not match the requested profile', () => {
    const b = structuredClone(loadBundle('good/pet-clinic/bundle.json')); // p-mini
    const reasons = validateGenerationOutput(b, 'p-standard');
    expect(reasons.some((r) => r.includes('p-standard') && r.includes('p-mini'))).toBe(true);
  });

  // Audit BACK-002 (d): version bumps outside the change envelope.
  it('rejects spec_version != 1 (a new spec starts at v1; versions advance only via lco change)', () => {
    const b = structuredClone(loadBundle('good/pet-clinic/bundle.json'));
    b.manifest.spec_version = 7;
    const reasons = validateGenerationOutput(b, 'p-mini');
    expect(reasons.some((r) => r.includes('spec_version'))).toBe(true);
  });

  it('rejects freeze residue on a generated bundle (frozen_at, artifact_hashes)', () => {
    const b = structuredClone(loadBundle('good/pet-clinic/bundle.json'));
    b.manifest.frozen_at = NOW;
    expect(validateGenerationOutput(b, 'p-mini').some((r) => r.includes('frozen_at'))).toBe(true);

    const h = frozenBundle();
    const pinned = structuredClone(loadBundle('good/pet-clinic/bundle.json'));
    pinned.manifest.artifact_hashes = h.manifest.artifact_hashes;
    expect(validateGenerationOutput(pinned, 'p-mini').some((r) => r.includes('artifact_hashes'))).toBe(true);
  });
});

describe('lifecycleStateFindings: state-internal consistency (L08 feed)', () => {
  it('returns no findings for every good fixture (all draft/v1/empty hashes)', () => {
    for (const rel of ['pet-clinic', 'todo-api', 'session-service', 'legacy-crm', 'embed-cli']) {
      expect(lifecycleStateFindings(loadBundle(`good/${rel}/bundle.json`))).toEqual([]);
    }
    expect(lifecycleStateFindings(frozenBundle())).toEqual([]);
  });

  // Audit BACK-002 (b): blocked with zero counters is an internally invalid state.
  it("flags 'blocked' with zero counters and no UNRESOLVED decision as unsubstantiated", () => {
    const findings = lifecycleStateFindings(inState('blocked'));
    expect(findings.length).toBe(1);
    expect(findings[0]!.message).toContain('blocked');
    expect(findings[0]!.message).toContain('unresolved');
  });

  it("does not flag 'blocked' when unresolved material exists", () => {
    const b = inState('blocked');
    b.manifest.unresolved_count = 1;
    expect(lifecycleStateFindings(b)).toEqual([]);
  });

  it("flags the schema-vestigial state 'reviewed' as outside the lifecycle", () => {
    const findings = lifecycleStateFindings(inState('reviewed'));
    expect(findings.length).toBe(1);
    expect(findings[0]!.message).toContain('reviewed');
  });

  it('flags frozen without frozen_at, and non-frozen with frozen_at', () => {
    const noStamp = frozenBundle();
    delete noStamp.manifest.frozen_at;
    expect(lifecycleStateFindings(noStamp).some((f) => f.message.includes('frozen_at'))).toBe(true);

    const staleStamp = structuredClone(loadBundle('good/pet-clinic/bundle.json'));
    staleStamp.manifest.frozen_at = NOW;
    expect(lifecycleStateFindings(staleStamp).some((f) => f.message.includes('frozen_at'))).toBe(true);
  });
});

describe('lifecycle module: determinism and purity', () => {
  it('repeated calls return byte-identical results (no clock, no env)', () => {
    const b = inState('blocked');
    const a = JSON.stringify(validateFreeze(b, cleanLint));
    const c = JSON.stringify(validateFreeze(b, cleanLint));
    expect(a).toBe(c);
    expect(JSON.stringify(lifecycleStateFindings(b))).toBe(JSON.stringify(lifecycleStateFindings(structuredClone(b))));
  });
});
