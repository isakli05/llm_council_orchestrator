import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lintBundle } from '../engine';
import type { SpecBundle } from '../../schemas';

const FIXTURES = join(__dirname, '../../../fixtures');

function loadBundle(rel: string): SpecBundle {
  return JSON.parse(readFileSync(join(FIXTURES, rel), 'utf8')) as SpecBundle;
}

describe('L01_UNDEFINED_TERM', () => {
  it('fires exactly L01 on the L01 vector (unknown glossary term in the message)', () => {
    const result = lintBundle(loadBundle('bad/L01/bundle.json'));

    expect(result.errors.length).toBeGreaterThan(0);
    expect(new Set(result.errors.map((f) => f.rule))).toEqual(
      new Set(['L01_UNDEFINED_TERM']),
    );
    expect(result.errors.some((f) => f.message.includes('Queue System'))).toBe(true);
  });

  it('reports the requirement id as the finding path', () => {
    const result = lintBundle(loadBundle('bad/L01/bundle.json'));

    expect(result.errors.every((f) => f.path === 'REQ-0002')).toBe(true);
  });
});
