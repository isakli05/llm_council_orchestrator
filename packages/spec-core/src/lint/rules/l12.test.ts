import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lintBundle } from '../engine';
import type { SpecBundle } from '../../schemas';

const FIXTURES = join(__dirname, '../../../fixtures');

function loadBundle(rel: string): SpecBundle {
  return JSON.parse(readFileSync(join(FIXTURES, rel), 'utf8')) as SpecBundle;
}

describe('L12_SCOPE_OVERLAP', () => {
  it('fires exactly L12 on the L12 vector (the overlapping glob in the message)', () => {
    const result = lintBundle(loadBundle('bad/L12/bundle.json'));
    // T7 (BACK-003/BACK-004): the bad-vector fixtures also trip the new
    // L13/L14 rules until T8 conforms them; scope this suite to the rule
    // under test — vector exactness (one vector, one rule) is re-pinned by
    // all-bad-fixtures.test.ts once T8 lands.
    const ruleErrors = result.errors.filter((f) => f.rule === 'L12_SCOPE_OVERLAP');

    expect(ruleErrors.length).toBeGreaterThan(0);
    expect(new Set(ruleErrors.map((f) => f.rule))).toEqual(
      new Set(['L12_SCOPE_OVERLAP']),
    );
    expect(ruleErrors.some((f) => f.message.includes('src/auth/**'))).toBe(true);
  });

  it('is an ERROR (isolation violation), with the task pair as the path', () => {
    const result = lintBundle(loadBundle('bad/L12/bundle.json'));
    // T7 (BACK-003/BACK-004): the bad-vector fixtures also trip the new
    // L13/L14 rules until T8 conforms them; scope this suite to the rule
    // under test — vector exactness (one vector, one rule) is re-pinned by
    // all-bad-fixtures.test.ts once T8 lands.
    const ruleErrors = result.errors.filter((f) => f.rule === 'L12_SCOPE_OVERLAP');

    expect(ruleErrors.every((f) => f.severity === 'error')).toBe(true);
    expect(ruleErrors.map((f) => f.path)).toEqual(['TASK-0001,TASK-0002']);
  });
});
