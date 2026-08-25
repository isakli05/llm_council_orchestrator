import { z } from 'zod';

export const GlossaryEntrySchema = z
  .object({
    term: z.string().trim().min(1),
    definition: z.string().trim().min(1),
  })
  .strict();
