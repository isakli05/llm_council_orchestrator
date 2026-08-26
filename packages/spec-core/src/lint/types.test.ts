import { describe, it, expect } from 'vitest';
import { LINT_RULES } from './types';

describe('LINT_RULES', () => {
  it('has exactly 12 rules', () => {
    // T7 (BACK-003/BACK-004): +L13_BROKEN_REFERENCE, +L14_UNPARSEABLE_EXPECT.
    expect(LINT_RULES).toHaveLength(12);
  });
  it('has unique ids', () => {
    expect(new Set(LINT_RULES).size).toBe(LINT_RULES.length);
  });
  it('ids follow the Lxx_NAME shape', () => {
    for (const rule of LINT_RULES) {
      expect(rule).toMatch(/^L\d{2}_[A-Z_]+$/);
    }
  });
});
