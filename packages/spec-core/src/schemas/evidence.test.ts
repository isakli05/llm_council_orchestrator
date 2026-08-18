import { describe, it, expect } from 'vitest';
import { EvidenceItemSchema } from './evidence';

const validEvidence = {
  id: 'E-0001',
  kind: 'user_input',
  source: 'interviews/session-1.md',
  hash: `sha256:${'c'.repeat(64)}`,
};

describe('EvidenceItemSchema', () => {
  it('accepts a valid evidence item', () => {
    expect(EvidenceItemSchema.parse(validEvidence)).toBeTruthy();
  });
  it('accepts every documented kind', () => {
    for (const kind of ['user_input', 'code', 'runtime', 'doc', 'constraint']) {
      expect(EvidenceItemSchema.parse({ ...validEvidence, kind })).toBeTruthy();
    }
  });
  it('rejects invalid id format', () => {
    expect(() => EvidenceItemSchema.parse({ ...validEvidence, id: 'EV-0001' })).toThrow();
    expect(() => EvidenceItemSchema.parse({ ...validEvidence, id: 'E-1' })).toThrow();
  });
  it('rejects unknown kind', () => {
    expect(() => EvidenceItemSchema.parse({ ...validEvidence, kind: 'rumor' })).toThrow();
  });
  it('rejects invalid hash', () => {
    expect(() => EvidenceItemSchema.parse({ ...validEvidence, hash: 'plain-text' })).toThrow();
  });
  it('rejects empty source', () => {
    expect(() => EvidenceItemSchema.parse({ ...validEvidence, source: '' })).toThrow();
  });
});
