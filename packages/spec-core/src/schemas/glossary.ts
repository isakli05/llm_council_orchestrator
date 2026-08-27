import { z } from 'zod';
import { INPUT_CEILINGS as C } from './limits';

export const GlossaryEntrySchema = z
  .object({
    term: z.string().trim().min(1).max(C.charsTitle, 'a glossary term exceeds the length ceiling (input ceiling)'),
    definition: z.string().trim().min(1).max(C.charsPurpose, 'a glossary definition exceeds the length ceiling (input ceiling)'),
  })
  .strict();
