import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lintBundle, RULES, type LintRule } from './engine';
import { LINT_RULES } from './types';
import type { SpecBundle } from '../schemas';

const FIXTURES = join(__dirname, '../../fixtures');

function loadBundle(rel: string): SpecBundle {
  return JSON.parse(readFileSync(join(FIXTURES, rel), 'utf8')) as SpecBundle;
}

describe('lint engine rule registry', () => {
  it('RULES registers exactly the ten lint rules, once each, in id order', () => {
    expect(RULES.map((r) => r.id)).toEqual([...LINT_RULES]);
  });

  it('a good bundle produces zero findings and an all-zero summary', () => {
    const result = lintBundle(loadBundle('good/pet-clinic/bundle.json'));

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.summary).toEqual(
      Object.fromEntries(LINT_RULES.map((id) => [id, 0])),
    );
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

      // the real L02 rule finds nothing on pet-clinic; the temp rule owns the
      // count because summary is keyed by rule id (last write wins)
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].path).toBe('requirements[1]');
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].severity).toBe('warning');
      expect(result.summary['L02_ORPHAN_REQUIREMENT']).toBe(2);
    } finally {
      RULES.pop();
    }
  });

  it('a rule that finds nothing contributes a zero count and no findings', () => {
    const rule: LintRule = { id: 'L06_DUPLICATE_ID', check: () => [] };
    RULES.push(rule);
    try {
      const result = lintBundle(loadBundle('good/pet-clinic/bundle.json'));

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.summary['L06_DUPLICATE_ID']).toBe(0);
    } finally {
      RULES.pop();
    }
  });
});
