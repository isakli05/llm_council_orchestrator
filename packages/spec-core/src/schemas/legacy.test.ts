import { describe, it, expect } from 'vitest';
import { LegacyPackageSchema } from './legacy';

const validLegacy = {
  as_is_summary: 'Monolith with manual deploy.',
  preserve_change_drop: [
    {
      behavior: 'CSV import accepts duplicate rows',
      decision: 'change',
      rationale: 'Causes silent data loss.',
      evidence: ['E-0001'],
    },
  ],
};

describe('LegacyPackageSchema', () => {
  it('accepts a full legacy package', () => {
    expect(LegacyPackageSchema.parse(validLegacy)).toBeTruthy();
  });
  it('accepts every documented decision value', () => {
    for (const decision of ['preserve', 'change', 'drop']) {
      expect(LegacyPackageSchema.parse({
        ...validLegacy,
        preserve_change_drop: [{ ...validLegacy.preserve_change_drop[0], decision }],
      })).toBeTruthy();
    }
  });
  it('rejects an empty legacy block: presence requires the COMPLETE package (PROD-005 strict-when-present)', () => {
    // The audit's failure scenario: hand-author `legacy: {}` and get a
    // schema-valid meaningless package. An empty block is noise — absence is
    // the only "no legacy package" spelling.
    expect(() => LegacyPackageSchema.parse({})).toThrow();
  });
  it('rejects a partial package (as_is_summary alone)', () => {
    expect(() => LegacyPackageSchema.parse({ as_is_summary: 'x' })).toThrow();
  });
  it('rejects a partial package (preserve_change_drop alone, no as_is_summary)', () => {
    expect(() => LegacyPackageSchema.parse({
      preserve_change_drop: validLegacy.preserve_change_drop,
    })).toThrow();
  });
  it('still validates present fields: empty preserve_change_drop rejected (fail-closed)', () => {
    expect(() => LegacyPackageSchema.parse({ ...validLegacy, preserve_change_drop: [] })).toThrow();
  });
  it('still validates present fields: unknown decision rejected', () => {
    expect(() => LegacyPackageSchema.parse({
      ...validLegacy,
      preserve_change_drop: [{ ...validLegacy.preserve_change_drop[0], decision: 'rewrite' }],
    })).toThrow();
  });
  it('still validates present fields: entry without rationale rejected', () => {
    const { rationale: _r, ...entry } = validLegacy.preserve_change_drop[0];
    expect(() => LegacyPackageSchema.parse({
      ...validLegacy,
      preserve_change_drop: [entry],
    })).toThrow();
  });
  it('still validates present fields: empty as_is_summary rejected', () => {
    expect(() => LegacyPackageSchema.parse({ ...validLegacy, as_is_summary: '' })).toThrow();
  });
});
