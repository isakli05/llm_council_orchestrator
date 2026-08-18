import { describe, it, expect } from 'vitest';
import { DecisionSchema } from './decisions';

const validDecision = {
  claim_id: 'DEC-0001',
  decision: 'Use Zod as the IR schema layer',
  rationale: 'Type inference plus runtime validation in one artifact.',
  evidence: ['E-0001'],
  confidence: 0.8,
  impact: 'medium',
  assumptions: ['zod stays maintained'],
  alternatives: [{ option: 'ajv', rejected_because: 'no static inference' }],
  status: 'accepted',
};

describe('DecisionSchema', () => {
  it('accepts a valid decision', () => {
    expect(DecisionSchema.parse(validDecision)).toBeTruthy();
  });
  it('accepts UNRESOLVED status', () => {
    expect(DecisionSchema.parse({ ...validDecision, status: 'UNRESOLVED' }).status).toBe('UNRESOLVED');
  });
  it('accepts every documented status', () => {
    for (const status of ['proposed', 'accepted', 'rejected', 'UNRESOLVED']) {
      expect(DecisionSchema.parse({ ...validDecision, status }).status).toBe(status);
    }
  });
  it('rejects invalid claim_id format', () => {
    expect(() => DecisionSchema.parse({ ...validDecision, claim_id: 'DECISION-0001' })).toThrow();
  });
  it('accepts rationale at exactly 2000 chars but rejects 2001', () => {
    expect(DecisionSchema.parse({ ...validDecision, rationale: 'x'.repeat(2000) })).toBeTruthy();
    expect(() => DecisionSchema.parse({ ...validDecision, rationale: 'x'.repeat(2001) })).toThrow();
  });
  it('rejects confidence above 1', () => {
    expect(() => DecisionSchema.parse({ ...validDecision, confidence: 1.5 })).toThrow();
  });
  it('rejects confidence below 0', () => {
    expect(() => DecisionSchema.parse({ ...validDecision, confidence: -0.1 })).toThrow();
  });
  it('accepts confidence bounds 0 and 1', () => {
    expect(DecisionSchema.parse({ ...validDecision, confidence: 0 })).toBeTruthy();
    expect(DecisionSchema.parse({ ...validDecision, confidence: 1 })).toBeTruthy();
  });
  it('rejects unknown impact', () => {
    expect(() => DecisionSchema.parse({ ...validDecision, impact: 'critical' })).toThrow();
  });
  it('rejects unknown status', () => {
    expect(() => DecisionSchema.parse({ ...validDecision, status: 'maybe' })).toThrow();
  });
  it('accepts an empty alternatives list', () => {
    expect(DecisionSchema.parse({ ...validDecision, alternatives: [] })).toBeTruthy();
  });
});
