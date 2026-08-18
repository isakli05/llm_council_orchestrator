import { describe, it, expect } from 'vitest';
import {
  SpecStateSchema,
  ImpactLevelSchema,
  ComplexityProfileSchema,
  Sha256Schema,
  IdSchema,
} from './common';

const sha = (c: string) => `sha256:${c.repeat(64)}`;

describe('SpecStateSchema', () => {
  it('accepts all five states', () => {
    for (const state of ['draft', 'reviewed', 'frozen', 'superseded', 'blocked']) {
      expect(SpecStateSchema.parse(state)).toBe(state);
    }
  });
  it('rejects unknown state', () => {
    expect(() => SpecStateSchema.parse('active')).toThrow();
  });
});

describe('ImpactLevelSchema', () => {
  it('accepts low/medium/high', () => {
    for (const level of ['low', 'medium', 'high']) {
      expect(ImpactLevelSchema.parse(level)).toBe(level);
    }
  });
  it('rejects unknown level', () => {
    expect(() => ImpactLevelSchema.parse('critical')).toThrow();
  });
});

describe('ComplexityProfileSchema', () => {
  it('accepts all four profiles', () => {
    for (const p of ['p-mini', 'p-standard', 'p-legacy', 'p-critical']) {
      expect(ComplexityProfileSchema.parse(p)).toBe(p);
    }
  });
  it('rejects unknown profile', () => {
    expect(() => ComplexityProfileSchema.parse('mini')).toThrow();
  });
});

describe('Sha256Schema', () => {
  it('accepts sha256: + 64 lowercase hex', () => {
    expect(Sha256Schema.parse(sha('a'))).toBe(sha('a'));
  });
  it('rejects short hash', () => {
    expect(() => Sha256Schema.parse('sha256:abc')).toThrow();
  });
  it('rejects uppercase hex', () => {
    expect(() => Sha256Schema.parse(sha('A'))).toThrow();
  });
  it('rejects missing prefix', () => {
    expect(() => Sha256Schema.parse('a'.repeat(64))).toThrow();
  });
  it('rejects wrong algorithm prefix', () => {
    expect(() => Sha256Schema.parse(`sha1:${'a'.repeat(64)}`)).toThrow();
  });
});

describe('IdSchema', () => {
  it('accepts every documented prefix', () => {
    const ids = [
      'REQ-0001', 'DEC-0002', 'CON-0003', 'TASK-0004', 'TST-0005', 'E-0006',
      'AS-0007', 'GLS-0008', 'UX-0009', 'ARC-0010', 'DAT-0011', 'SEC-0012',
      'OPS-0013', 'LGC-0014',
    ];
    for (const id of ids) expect(IdSchema.parse(id)).toBe(id);
  });
  it('rejects fewer than four digits', () => {
    expect(() => IdSchema.parse('REQ-1')).toThrow();
  });
  it('rejects more than four digits', () => {
    expect(() => IdSchema.parse('REQ-12345')).toThrow();
  });
  it('rejects unknown prefix', () => {
    expect(() => IdSchema.parse('X-0001')).toThrow();
  });
  it('rejects non-digit segment', () => {
    expect(() => IdSchema.parse('E-000a')).toThrow();
  });
  it('rejects lowercase prefix', () => {
    expect(() => IdSchema.parse('req-0001')).toThrow();
  });
});
