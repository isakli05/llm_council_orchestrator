import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lintBundle } from '../engine';
import type { SpecBundle } from '../../schemas';

const FIXTURES = join(__dirname, '../../../fixtures');

function loadBundle(rel: string): SpecBundle {
  return JSON.parse(readFileSync(join(FIXTURES, rel), 'utf8')) as SpecBundle;
}

describe('L10_TRACEABILITY_GAP', () => {
  it('fires exactly L10 on the L10 vector (the untested REQ id in the message)', () => {
    const result = lintBundle(loadBundle('bad/L10/bundle.json'));

    expect(result.errors.length).toBeGreaterThan(0);
    expect(new Set(result.errors.map((f) => f.rule))).toEqual(
      new Set(['L10_TRACEABILITY_GAP']),
    );
    expect(result.errors.some((f) => f.message.includes('REQ-0002'))).toBe(true);
  });

  it('reports the untraced requirement id as the finding path', () => {
    const result = lintBundle(loadBundle('bad/L10/bundle.json'));

    expect(result.errors.map((f) => f.path)).toEqual(['REQ-0002']);
  });

  it('does NOT fire for a requirement referenced by no task (that is L02, not L10)', () => {
    // bad/L02: REQ-0003 is referenced by no task at all — L10 must stay silent.
    const result = lintBundle(loadBundle('bad/L02/bundle.json'));

    expect(result.summary['L10_TRACEABILITY_GAP']).toBe(0);
    expect(result.errors.some((f) => f.rule === 'L10_TRACEABILITY_GAP')).toBe(false);
  });
});
