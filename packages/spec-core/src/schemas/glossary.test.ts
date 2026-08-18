import { describe, it, expect } from 'vitest';
import { GlossaryEntrySchema } from './glossary';

describe('GlossaryEntrySchema', () => {
  it('accepts a valid entry', () => {
    expect(GlossaryEntrySchema.parse({ term: 'Council', definition: 'A panel of models' })).toBeTruthy();
  });
  it('rejects empty term', () => {
    expect(() => GlossaryEntrySchema.parse({ term: '', definition: 'd' })).toThrow();
  });
  it('rejects empty definition', () => {
    expect(() => GlossaryEntrySchema.parse({ term: 't', definition: '' })).toThrow();
  });
});
