import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lintBundle } from '../engine';
import type { SpecBundle } from '../../schemas';

const FIXTURES = join(__dirname, '../../../fixtures');

function loadBundle(rel: string): SpecBundle {
  return JSON.parse(readFileSync(join(FIXTURES, rel), 'utf8')) as SpecBundle;
}

describe('L08_UNRESOLVED_LEAK', () => {
  it('fires exactly L08 on the L08 vector (the UNRESOLVED decision id in the message)', () => {
    const result = lintBundle(loadBundle('bad/L08/bundle.json'));

    expect(result.errors.length).toBeGreaterThan(0);
    expect(new Set(result.errors.map((f) => f.rule))).toEqual(
      new Set(['L08_UNRESOLVED_LEAK']),
    );
    expect(result.errors.some((f) => f.message.includes('DEC-0002'))).toBe(true);
  });

  it('reports one finding per trigger: the decision id and the manifest counters', () => {
    const result = lintBundle(loadBundle('bad/L08/bundle.json'));

    // DEC-0002 is UNRESOLVED and manifest.unresolved_count is 1
    expect(result.errors.map((f) => f.path).sort()).toEqual(['DEC-0002', 'manifest']);
  });
});

describe('L08_UNRESOLVED_LEAK — lifecycle state consistency (BACK-002)', () => {
  /** pet-clinic with only manifest.state flipped; counters stay 0. */
  function inState(state: string): SpecBundle {
    const b = loadBundle('good/pet-clinic/bundle.json');
    b.manifest.state = state as SpecBundle['manifest']['state'];
    return b;
  }

  // Audit BACK-002 (b): a blocked manifest with zero counters used to lint
  // clean and then freeze. L08 must flag the unsubstantiated 'blocked' state.
  it("fires on 'blocked' with zero counters and no UNRESOLVED decision (unsubstantiated block)", () => {
    const result = lintBundle(inState('blocked'));

    const l08 = result.errors.filter((f) => f.rule === 'L08_UNRESOLVED_LEAK');
    expect(l08.length).toBe(1);
    expect(l08[0]!.path).toBe('manifest');
    expect(l08[0]!.message).toContain('blocked');
  });

  it("does not add the unsubstantiated-block finding when unresolved material exists", () => {
    const b = inState('blocked');
    b.manifest.unresolved_count = 1;

    // The EXISTING counter-leak finding still fires (correct: counters must be
    // zero in any state) — but not the new unsubstantiated-state finding: the
    // blocked claim is backed by real unresolved material.
    const result = lintBundle(b);
    expect(result.errors.some((f) => f.message.includes('no unresolved material'))).toBe(false);
    expect(result.errors.some((f) => f.message.includes('unresolved_count'))).toBe(true);
  });

  it("fires on the schema-vestigial state 'reviewed' (outside the lifecycle)", () => {
    const result = lintBundle(inState('reviewed'));

    const l08 = result.errors.filter((f) => f.rule === 'L08_UNRESOLVED_LEAK');
    expect(l08.length).toBe(1);
    expect(l08[0]!.message).toContain('reviewed');
  });

  it('fires on frozen_without_stamp / draft_with_stamp inconsistencies', () => {
    const stale = inState('draft');
    stale.manifest.frozen_at = '2026-08-18T12:00:00Z';
    expect(lintBundle(stale).errors.some((f) => f.rule === 'L08_UNRESOLVED_LEAK')).toBe(true);
  });

  it('still returns zero errors for the clean good fixtures (no lifecycle false positives)', () => {
    const result = lintBundle(loadBundle('good/pet-clinic/bundle.json'));
    expect(result.errors).toEqual([]);
  });
});
