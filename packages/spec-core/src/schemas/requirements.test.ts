import { describe, it, expect } from 'vitest';
import { RequirementSchema } from './requirements';

const validRequirement = {
  id: 'REQ-0001',
  statement: 'The system shall gate merges on evidence.',
  priority: 'must',
  evidence: ['E-0001'],
  acceptance_refs: ['TST-0001'],
  terms_used: ['Evidence'],
};

describe('RequirementSchema', () => {
  it('accepts a valid requirement', () => {
    expect(RequirementSchema.parse(validRequirement)).toBeTruthy();
  });
  it('defaults terms_used to empty array', () => {
    const { terms_used: _omitted, ...withoutTerms } = validRequirement;
    expect(RequirementSchema.parse(withoutTerms).terms_used).toEqual([]);
  });
  it('rejects invalid id format', () => {
    expect(() => RequirementSchema.parse({ ...validRequirement, id: 'R-0001' })).toThrow();
  });
  it('rejects unknown priority', () => {
    expect(() => RequirementSchema.parse({ ...validRequirement, priority: 'wont' })).toThrow();
  });
  it('rejects requirement without evidence (fail-closed core)', () => {
    expect(() => RequirementSchema.parse({ ...validRequirement, evidence: [] })).toThrow();
  });
  it('rejects requirement without acceptance_refs (fail-closed core)', () => {
    expect(() => RequirementSchema.parse({ ...validRequirement, acceptance_refs: [] })).toThrow();
  });
  it('rejects non-id evidence references', () => {
    expect(() => RequirementSchema.parse({ ...validRequirement, evidence: ['nope'] })).toThrow();
  });
  it('rejects empty statement', () => {
    expect(() => RequirementSchema.parse({ ...validRequirement, statement: '' })).toThrow();
  });
});
