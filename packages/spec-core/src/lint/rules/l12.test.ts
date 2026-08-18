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

    expect(result.errors.length).toBeGreaterThan(0);
    expect(new Set(result.errors.map((f) => f.rule))).toEqual(
      new Set(['L12_SCOPE_OVERLAP']),
    );
    expect(result.errors.some((f) => f.message.includes('src/auth/**'))).toBe(true);
  });

  it('is an ERROR (isolation violation), with the task pair as the path', () => {
    const result = lintBundle(loadBundle('bad/L12/bundle.json'));

    expect(result.errors.every((f) => f.severity === 'error')).toBe(true);
    expect(result.errors.map((f) => f.path)).toEqual(['TASK-0001,TASK-0002']);
  });
});
