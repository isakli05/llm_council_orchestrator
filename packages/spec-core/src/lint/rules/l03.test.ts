import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lintBundle } from '../engine';
import type { SpecBundle } from '../../schemas';

const FIXTURES = join(__dirname, '../../../fixtures');

function loadBundle(rel: string): SpecBundle {
  return JSON.parse(readFileSync(join(FIXTURES, rel), 'utf8')) as SpecBundle;
}

describe('L03_TASK_TEST_FILE_UNKNOWN', () => {
  it('fires exactly L03 on the L03 vector (unknown test file in the message)', () => {
    const result = lintBundle(loadBundle('bad/L03/bundle.json'));

    expect(result.errors.length).toBeGreaterThan(0);
    expect(new Set(result.errors.map((f) => f.rule))).toEqual(
      new Set(['L03_TASK_TEST_FILE_UNKNOWN']),
    );
    expect(
      result.errors.some((f) => f.message.includes('tests/session-revoke-v2.test.ts')),
    ).toBe(true);
  });

  it('reports the owning task id as the finding path', () => {
    const result = lintBundle(loadBundle('bad/L03/bundle.json'));

    expect(result.errors.map((f) => f.path)).toEqual(['TASK-0002']);
  });
});
