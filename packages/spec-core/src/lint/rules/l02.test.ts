import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lintBundle } from '../engine';
import type { SpecBundle } from '../../schemas';

const FIXTURES = join(__dirname, '../../../fixtures');

function loadBundle(rel: string): SpecBundle {
  return JSON.parse(readFileSync(join(FIXTURES, rel), 'utf8')) as SpecBundle;
}

describe('L02_ORPHAN_REQUIREMENT', () => {
  it('fires exactly L02 on the L02 vector (orphan REQ id in the message)', () => {
    const result = lintBundle(loadBundle('bad/L02/bundle.json'));

    expect(result.errors.length).toBeGreaterThan(0);
    expect(new Set(result.errors.map((f) => f.rule))).toEqual(
      new Set(['L02_ORPHAN_REQUIREMENT']),
    );
    expect(result.errors.some((f) => f.message.includes('REQ-0003'))).toBe(true);
  });

  it('reports the orphan requirement id as the finding path', () => {
    const result = lintBundle(loadBundle('bad/L02/bundle.json'));

    expect(result.errors.map((f) => f.path)).toEqual(['REQ-0003']);
  });
});
