import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { SpecBundleSchema } from './schemas';
import { LINT_RULES } from './lint/types';

const BAD = join(__dirname, '../fixtures/bad');

interface BadFixtureExpectation {
  expect: 'lint-error' | 'freeze-rejected' | 'verify-drift' | 'schema-error';
  rule?: string;
  message_includes?: string;
}

describe('bad fixtures', () => {
  const dirs = readdirSync(BAD).filter((d) => !d.startsWith('.')).sort();

  it('contains exactly the fifteen planned vectors', () => {
    expect(dirs).toEqual([
      'L01', 'L02', 'L03', 'L04', 'L05', 'L06', 'L07', 'L08', 'L09', 'L10',
      'L11', 'L12', 'drift', 'schema-invalid', 'unresolved',
    ]);
  });

  for (const d of dirs) {
    describe(d, () => {
      const expectedPath = join(BAD, d, 'expected.json');
      const bundlePath = join(BAD, d, 'bundle.json');

      it('has bundle.json and expected.json', () => {
        expect(existsSync(bundlePath)).toBe(true);
        expect(existsSync(expectedPath)).toBe(true);
      });

      const exp: BadFixtureExpectation = JSON.parse(readFileSync(expectedPath, 'utf8'));

      it('expected.json satisfies the BadFixtureExpectation contract', () => {
        expect(['lint-error', 'freeze-rejected', 'verify-drift', 'schema-error']).toContain(exp.expect);
        if (exp.expect === 'lint-error') {
          // rule is mandatory for lint-error and must match the directory name
          expect(exp.rule, 'lint-error requires rule').toBeTruthy();
          expect(LINT_RULES).toContain(exp.rule as never);
          expect(exp.rule!.startsWith(d), `${exp.rule} must match directory ${d}`).toBe(true);
        } else {
          expect(exp.rule, 'rule is only allowed for lint-error').toBeUndefined();
        }
      });

      if (exp.expect === 'schema-error') {
        it('bundle FAILS SpecBundleSchema.parse (schema layer)', () => {
          const b = JSON.parse(readFileSync(bundlePath, 'utf8'));
          expect(() => SpecBundleSchema.parse(b)).toThrow();
        });
      } else {
        it('bundle passes SpecBundleSchema.parse (fault is in lint/freeze/verify layer)', () => {
          const b = JSON.parse(readFileSync(bundlePath, 'utf8'));
          expect(() => SpecBundleSchema.parse(b)).not.toThrow();
        });
      }
    });
  }
});
