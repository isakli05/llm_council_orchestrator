import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SpecBundleSchema } from './schemas';

const GOOD = join(__dirname, '../fixtures/good');

describe('good fixtures', () => {
  const dirs = readdirSync(GOOD).filter((d) => !d.startsWith('.')).sort();

  it('contains exactly the five planned bundles', () => {
    expect(dirs).toEqual(['embed-cli', 'legacy-crm', 'pet-clinic', 'session-service', 'todo-api']);
  });

  for (const d of dirs) {
    it(`${d} parses against SpecBundleSchema`, () => {
      const b = JSON.parse(readFileSync(join(GOOD, d, 'bundle.json'), 'utf8'));
      expect(() => SpecBundleSchema.parse(b)).not.toThrow();
    });
  }
});
