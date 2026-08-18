import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lintBundle, RULES, type LintRule } from './engine';
import type { SpecBundle } from '../schemas';

const FIXTURES = join(__dirname, '../../fixtures');

function loadBundle(rel: string): SpecBundle {
  return JSON.parse(readFileSync(join(FIXTURES, rel), 'utf8')) as SpecBundle;
}

describe('lint engine with zero registered rules', () => {
  it('RULES starts empty (Task 7 registers L01..L12 here)', () => {
    expect(RULES).toHaveLength(0);
  });

  it('returns the empty LintResult shape for a good bundle', () => {
    expect(lintBundle(loadBundle('good/pet-clinic/bundle.json'))).toEqual({
      errors: [],
      warnings: [],
      summary: {},
    });
  });
});

describe('lint engine rule execution (temporary rule, restored after)', () => {
  it('runs every registered rule and buckets findings by severity with per-rule summary counts', () => {
    const rule: LintRule = {
      id: 'L02_ORPHAN_REQUIREMENT',
      check: () => [
        {
          rule: 'L02_ORPHAN_REQUIREMENT',
          severity: 'error',
          path: 'requirements[1]',
          message: 'requirement is not referenced by any task',
        },
        {
          rule: 'L02_ORPHAN_REQUIREMENT',
          severity: 'warning',
          path: 'requirements[2]',
          message: 'requirement referenced by no test case',
        },
      ],
    };
    RULES.push(rule);
    try {
      const result = lintBundle(loadBundle('good/pet-clinic/bundle.json'));

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].path).toBe('requirements[1]');
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].severity).toBe('warning');
      expect(result.summary).toEqual({ L02_ORPHAN_REQUIREMENT: 2 });
    } finally {
      RULES.pop();
    }
  });

  it('a rule that finds nothing contributes a zero count and no findings', () => {
    const rule: LintRule = { id: 'L06_DUPLICATE_ID', check: () => [] };
    RULES.push(rule);
    try {
      const result = lintBundle(loadBundle('good/pet-clinic/bundle.json'));

      expect(result).toEqual({ errors: [], warnings: [], summary: { L06_DUPLICATE_ID: 0 } });
    } finally {
      RULES.pop();
    }
  });
});
