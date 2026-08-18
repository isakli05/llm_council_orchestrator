import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { SpecBundleSchema } from './index';

const GENERATED_PATH = join(process.cwd(), 'generated', 'spec-schema.json');

describe('export-json-schema output contract', () => {
  it('converts SpecBundleSchema to JSON.parse-able JSON Schema', () => {
    // Tip zinciri köprüsü için bkz. export-json-schema.ts (zod/v3 vs zod ana zinciri).
    const schema = SpecBundleSchema as unknown as Parameters<typeof zodToJsonSchema>[0];
    const text = JSON.stringify(zodToJsonSchema(schema, 'SpecBundle'), null, 2);
    const parsed = JSON.parse(text) as { $ref?: string; definitions?: Record<string, unknown> };
    expect(parsed.$ref).toBe('#/definitions/SpecBundle');
    expect(parsed.definitions).toHaveProperty('SpecBundle');
  });

  it('generated/spec-schema.json exists (hard precondition) and is valid JSON', () => {
    // The artifact is committed by the build; a missing file must FAIL loudly,
    // not let this test pass vacuously.
    expect(existsSync(GENERATED_PATH)).toBe(true);
    const parsed = JSON.parse(readFileSync(GENERATED_PATH, 'utf8')) as { $ref?: string };
    expect(parsed.$ref).toBe('#/definitions/SpecBundle');
  });
});
