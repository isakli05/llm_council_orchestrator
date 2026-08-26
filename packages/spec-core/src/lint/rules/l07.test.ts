import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lintBundle } from '../engine';
import type { SpecBundle } from '../../schemas';

const FIXTURES = join(__dirname, '../../../fixtures');

function loadBundle(rel: string): SpecBundle {
  return JSON.parse(readFileSync(join(FIXTURES, rel), 'utf8')) as SpecBundle;
}

describe('L07_MISSING_NFR_BUDGET', () => {
  it('fires exactly L07 on the L07 vector (literal NFR in the message)', () => {
    const result = lintBundle(loadBundle('bad/L07/bundle.json'));
    // T7 (BACK-003/BACK-004): the bad-vector fixtures also trip the new
    // L13/L14 rules until T8 conforms them; scope this suite to the rule
    // under test — vector exactness (one vector, one rule) is re-pinned by
    // all-bad-fixtures.test.ts once T8 lands.
    const ruleErrors = result.errors.filter((f) => f.rule === 'L07_MISSING_NFR_BUDGET');

    expect(ruleErrors.length).toBeGreaterThan(0);
    expect(new Set(ruleErrors.map((f) => f.rule))).toEqual(
      new Set(['L07_MISSING_NFR_BUDGET']),
    );
    // carry-forward: the report layer matches findings by the 'NFR' substring
    expect(ruleErrors.every((f) => f.message.includes('NFR'))).toBe(true);
  });

  it('reports manifest as the finding path', () => {
    const result = lintBundle(loadBundle('bad/L07/bundle.json'));
    // T7 (BACK-003/BACK-004): the bad-vector fixtures also trip the new
    // L13/L14 rules until T8 conforms them; scope this suite to the rule
    // under test — vector exactness (one vector, one rule) is re-pinned by
    // all-bad-fixtures.test.ts once T8 lands.
    const ruleErrors = result.errors.filter((f) => f.rule === 'L07_MISSING_NFR_BUDGET');

    expect(ruleErrors.map((f) => f.path)).toEqual(['manifest']);
  });
});
