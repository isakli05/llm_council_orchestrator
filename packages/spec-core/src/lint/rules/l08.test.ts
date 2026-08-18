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
