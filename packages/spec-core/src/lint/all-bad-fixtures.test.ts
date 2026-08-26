import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { lintBundle } from './engine';
import { SpecBundleSchema, type SpecBundle } from '../schemas';
import { freeze } from '../compiler/freeze';
import { verifyFrozen } from '../compiler/verify';

const FIXTURES = join(__dirname, '../../fixtures');
const BAD = join(FIXTURES, 'bad');
const GOOD = join(FIXTURES, 'good');

interface BadFixtureExpectation {
  expect: 'lint-error' | 'freeze-rejected' | 'verify-drift' | 'schema-error';
  rule?: string;
  message_includes?: string;
}

function loadBundle(path: string): SpecBundle {
  return JSON.parse(readFileSync(path, 'utf8')) as SpecBundle;
}

describe('all bad fixtures through the real lint/freeze/verify pipeline', () => {
  const dirs = readdirSync(BAD)
    .filter((d) => !d.startsWith('.'))
    .sort();

  it('covers every bad fixture directory', () => {
    expect(dirs.length).toBeGreaterThanOrEqual(15);
  });

  for (const d of dirs) {
    describe(d, () => {
      const exp: BadFixtureExpectation = JSON.parse(
        readFileSync(join(BAD, d, 'expected.json'), 'utf8'),
      );
      const bundle = loadBundle(join(BAD, d, 'bundle.json'));

      it(`expect=${exp.expect} holds`, () => {
        if (exp.expect === 'schema-error') {
          expect(() => SpecBundleSchema.parse(bundle)).toThrow();
          return;
        }

        if (exp.expect === 'verify-drift') {
          expect(verifyFrozen(bundle).drifted.length).toBeGreaterThan(0);
          return;
        }

        if (exp.expect === 'freeze-rejected') {
          const frozen = freeze(bundle, lintBundle(bundle), '2026-08-18T00:00:00Z');
          expect(frozen.ok).toBe(false);
          expect(frozen.reasons.length).toBeGreaterThan(0);
          return;
        }

        // lint-error: the vector fires its rule AND ONLY its rule — the
        // one-vector-one-rule exactness contract (restored by the T8 fixture
        // conformance: expects are grammar-conformant and every cited test
        // id exists, so L13/L14 stay silent on every bad vector).
        const result = lintBundle(bundle);
        const firedRules = [...new Set(result.errors.map((f) => f.rule))];
        expect(firedRules).toEqual([exp.rule]);
        expect(result.errors.length).toBeGreaterThan(0);
        if (exp.message_includes) {
          expect(
            result.errors.some((f) => f.message.includes(exp.message_includes!)),
          ).toBe(true);
        }
      });

      if (exp.expect === 'lint-error') {
        it('produces no warnings on a lint vector', () => {
          expect(lintBundle(bundle).warnings).toEqual([]);
        });
      }
    });
  }
});

describe('good bundles lint clean (hard requirement)', () => {
  const dirs = readdirSync(GOOD)
    .filter((d) => !d.startsWith('.'))
    .sort();

  it('covers all five good bundles', () => {
    expect(dirs).toEqual([
      'embed-cli',
      'legacy-crm',
      'pet-clinic',
      'session-service',
      'todo-api',
    ]);
  });

  for (const d of dirs) {
    it(`${d}: 0 errors, 0 warnings from the registered rules`, () => {
      const result = lintBundle(loadBundle(join(GOOD, d, 'bundle.json')));
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });
  }
});
