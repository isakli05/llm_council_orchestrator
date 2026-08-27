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

  it('generated/spec-schema.json is BYTE-EXACT with what build regenerates (TEST-002)', () => {
    // Existence is not freshness: this is the release gate that makes a stale
    // committed artifact fail locally AND in CI. The regeneration must use the
    // exact serialization the exporter uses (JSON.stringify, 2-space, no
    // trailing newline) so only real schema drift can differ.
    const regenerated = JSON.stringify(
      zodToJsonSchema(SpecBundleSchema as unknown as Parameters<typeof zodToJsonSchema>[0], 'SpecBundle'),
      null,
      2,
    );
    const committed = readFileSync(GENERATED_PATH, 'utf8');
    if (committed !== regenerated) {
      // Actionable failure: tell the developer exactly how to fix it.
      throw new Error(
        'generated/spec-schema.json is STALE — it does not byte-match the schema ' +
          'built from current source (TEST-002). Regenerate and commit:\n' +
          '  pnpm --filter ./packages/spec-core build\n' +
          '  git add packages/spec-core/generated/spec-schema.json && git commit\n' +
          `(committed ${committed.length} bytes, expected ${regenerated.length} bytes)`,
      );
    }
    expect(committed).toBe(regenerated);
  });
});
