import { describe, it, expect } from 'vitest';
import { LINT_RULES } from './types';

describe('LINT_RULES', () => {
  it('has exactly 10 rules', () => {
    expect(LINT_RULES).toHaveLength(10);
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
