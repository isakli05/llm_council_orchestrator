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

    expect(result.errors.length).toBeGreaterThan(0);
    expect(new Set(result.errors.map((f) => f.rule))).toEqual(
      new Set(['L07_MISSING_NFR_BUDGET']),
    );
    // carry-forward: the report layer matches findings by the 'NFR' substring
    expect(result.errors.every((f) => f.message.includes('NFR'))).toBe(true);
  });

  it('reports manifest as the finding path', () => {
    const result = lintBundle(loadBundle('bad/L07/bundle.json'));

    expect(result.errors.map((f) => f.path)).toEqual(['manifest']);
  });
});
