import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lintBundle } from '../engine';
import type { SpecBundle } from '../../schemas';

const FIXTURES = join(__dirname, '../../../fixtures');

function loadBundle(rel: string): SpecBundle {
  return JSON.parse(readFileSync(join(FIXTURES, rel), 'utf8')) as SpecBundle;
}

describe('L04_CYCLIC_TASK_DEPS', () => {
  it('fires exactly L04 on the L04 vector (a cycle member id in the message)', () => {
    const result = lintBundle(loadBundle('bad/L04/bundle.json'));

    expect(result.errors.length).toBeGreaterThan(0);
    expect(new Set(result.errors.map((f) => f.rule))).toEqual(
      new Set(['L04_CYCLIC_TASK_DEPS']),
    );
    expect(result.errors.some((f) => f.message.includes('TASK-0001'))).toBe(true);
  });

  it('reports the comma-joined cycle task ids as the finding path', () => {
    const result = lintBundle(loadBundle('bad/L04/bundle.json'));

    expect(result.errors.length).toBe(1);
    expect(result.errors[0].path).toBe('TASK-0001,TASK-0002');
  });
});
