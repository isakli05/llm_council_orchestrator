import { describe, it, expect } from 'vitest';
import {
  SPEC_SCHEMA_VERSION,
  checkSpecSchemaVersion,
  SpecSchemaVersionFieldSchema,
} from './version';

describe('SPEC_SCHEMA_VERSION (single source of truth)', () => {
  it("is the only released schema version so far: 'lco-spec/1.0'", () => {
    // 1.0 is the FIRST and only 1.x minor; the compatibility policy in this
    // module governs FUTURE minors — there is no minor-version machinery to
    // test beyond this constant.
    expect(SPEC_SCHEMA_VERSION).toBe('lco-spec/1.0');
  });
});

describe('checkSpecSchemaVersion (PROD-005 policy validator)', () => {
  it('accepts the current version exactly', () => {
    expect(checkSpecSchemaVersion('lco-spec/1.0')).toEqual({ ok: true });
  });

  it('rejects a future MAJOR with a distinct, actionable error', () => {
    const v = checkSpecSchemaVersion('lco-spec/2.0');
    expect(v).toMatchObject({ ok: false, kind: 'unsupported-major' });
    if (!v.ok) {
      // Actionable: names the spec's version, the break (major), the range
      // this compiler reads, and scopes the migration-tool promise to the
      // major itself — never "there is a migration tool today".
      expect(v.message).toContain('lco-spec/2.0');
      expect(v.message).toMatch(/major/i);
      expect(v.message).toMatch(/1\.x/);
      expect(v.message).toMatch(/migration tool/i);
      expect(v.message).toMatch(/no(ne|)\b.*today|none exists today/i);
    }
  });

  it('rejects any other major the same way (10.3, 0.9)', () => {
    for (const bad of ['lco-spec/10.3', 'lco-spec/0.9']) {
      expect(checkSpecSchemaVersion(bad)).toMatchObject({
        ok: false,
        kind: 'unsupported-major',
      });
    }
  });

  it('rejects a NEWER 1.x minor distinctly: upgrade, read-compat, no hand-editing', () => {
    const v = checkSpecSchemaVersion('lco-spec/1.2');
    expect(v).toMatchObject({ ok: false, kind: 'newer-minor' });
    if (!v.ok) {
      expect(v.message).toContain('lco-spec/1.2');
      expect(v.message).toContain('lco-spec/1.0');
      expect(v.message).toMatch(/upgrade/i);
      expect(v.message).toMatch(/read-compat|compatible/i);
      expect(v.message).toMatch(/do not hand-edit/i);
    }
  });

  it('rejects malformed strings with the expected form named', () => {
    const malformed = [
      '1.0', // missing the lco-spec/ prefix
      'lco-spec/1', // missing the minor
      'lco-spec/v1.0', // v-prefix is not part of the form
      'lco-spec/1.0.0', // patch segment does not exist
      'lco-spec/2.x', // x is not a number
      'lco-spec/1.0 ', // trailing space
      'LCO-SPEC/1.0', // case-sensitive prefix
      '', // empty
    ];
    for (const bad of malformed) {
      const v = checkSpecSchemaVersion(bad);
      expect(v, `input ${JSON.stringify(bad)}`).toMatchObject({
        ok: false,
        kind: 'malformed',
      });
      if (!v.ok) {
        expect(v.message).toContain('lco-spec/<major>.<minor>');
      }
    }
  });

  it('rejects non-strings as malformed, quoting the received value', () => {
    for (const bad of [42, null, true, {}, ['lco-spec/1.0']]) {
      const v = checkSpecSchemaVersion(bad);
      expect(v, `input ${JSON.stringify(bad)}`).toMatchObject({
        ok: false,
        kind: 'malformed',
      });
    }
  });

  it('rejects a non-canonical rendering of a known version (leading-zero minor)', () => {
    // 'lco-spec/01.0' parses to major 1 minor 0 but is not the canonical
    // spelling; the schema demands the exact literal, so the error must say
    // HOW to write it, not claim an unknown version.
    const v = checkSpecSchemaVersion('lco-spec/01.0');
    expect(v).toMatchObject({ ok: false, kind: 'non-canonical' });
    if (!v.ok) {
      expect(v.message).toContain("exactly as 'lco-spec/1.0'");
    }
  });
});

describe('SpecSchemaVersionFieldSchema (zod wiring, single place)', () => {
  it('accepts only the current version at parse level', () => {
    expect(SpecSchemaVersionFieldSchema.safeParse('lco-spec/1.0').success).toBe(true);
    expect(SpecSchemaVersionFieldSchema.safeParse('lco-spec/2.0').success).toBe(false);
    expect(SpecSchemaVersionFieldSchema.safeParse('lco-spec/1.2').success).toBe(false);
    expect(SpecSchemaVersionFieldSchema.safeParse('nonsense').success).toBe(false);
  });

  it('surfaces the POLICY message, not a generic literal error', () => {
    const major = SpecSchemaVersionFieldSchema.safeParse('lco-spec/2.0');
    expect(major.success).toBe(false);
    if (!major.success) {
      expect(major.error.issues[0].message).toMatch(/major/i);
      expect(major.error.issues[0].message).not.toContain('Invalid literal value');
    }
    const malformed = SpecSchemaVersionFieldSchema.safeParse('nope');
    expect(malformed.success).toBe(false);
    if (!malformed.success) {
      expect(malformed.error.issues[0].message).toContain('lco-spec/<major>.<minor>');
    }
  });
});
