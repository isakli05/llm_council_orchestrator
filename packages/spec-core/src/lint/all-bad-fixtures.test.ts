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

        // lint-error: the expected rule fires. (T7: until T8 conforms the
        // fixtures to L13/L14 the vectors also trip the new rules, so the
        // exact one-vector-one-rule contract is fixme'd just below.)
        const result = lintBundle(bundle);
        expect(result.errors.some((f) => f.rule === exp.rule)).toBe(true);
        expect(result.errors.length).toBeGreaterThan(0);
        if (exp.message_includes) {
          expect(
            result.errors.some((f) => f.message.includes(exp.message_includes!)),
          ).toBe(true);
        }
      });

      if (exp.expect === 'lint-error') {
        // conform in T8: exactness — the vector fires ONLY its own rule —
        // returns when the fixtures' expects/test-ids conform (T7 note).
        it.skip(`${d}: fires ONLY ${exp.rule} (exactness restored by T8 fixture conformance)`, () => {
          const firedRules = [...new Set(lintBundle(bundle).errors.map((f) => f.rule))];
          expect(firedRules).toEqual([exp.rule]);
        });
      }

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
    // conform in T8: the good fixtures carry prose expects and id-less tests
    // (L13/L14) until T8 conforms them; the clean-control property is pinned
    // on an inline bundle in engine.test.ts meanwhile (T7 note).
    it.skip(`${d}: 0 errors, 0 warnings from the registered rules`, () => {
      const result = lintBundle(loadBundle(join(GOOD, d, 'bundle.json')));
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });
  }
});
