import { describe, it, expect } from 'vitest';
import { IntentSchema } from './intent';

const validIntent = { statement: 'Build a council orchestrator', normalized: 'build council orchestrator' };

describe('IntentSchema', () => {
  it('accepts a valid intent', () => {
    expect(IntentSchema.parse(validIntent)).toBeTruthy();
  });
  it('rejects empty statement', () => {
    expect(() => IntentSchema.parse({ ...validIntent, statement: '' })).toThrow();
  });
  it('rejects missing normalized', () => {
    expect(() => IntentSchema.parse({ statement: 's' })).toThrow();
  });
});
