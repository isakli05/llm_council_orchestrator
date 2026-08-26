import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lintBundle } from '../engine';
import type { SpecBundle } from '../../schemas';

const FIXTURES = join(__dirname, '../../../fixtures');

function loadBundle(rel: string): SpecBundle {
  return JSON.parse(readFileSync(join(FIXTURES, rel), 'utf8')) as SpecBundle;
}

describe('L05_INTERFACE_MISMATCH', () => {
  it('fires exactly L05 on the L05 vector (the undeclared symbol in the message)', () => {
    const result = lintBundle(loadBundle('bad/L05/bundle.json'));

    expect(result.errors.length).toBeGreaterThan(0);
    expect(new Set(result.errors.map((f) => f.rule))).toEqual(
      new Set(['L05_INTERFACE_MISMATCH']),
    );
    expect(result.errors.some((f) => f.message.includes('createUser'))).toBe(true);
  });

  it('reports the owning task id as the finding path', () => {
    const result = lintBundle(loadBundle('bad/L05/bundle.json'));

    expect(result.errors.map((f) => f.path)).toEqual(['TASK-0002']);
  });
});
