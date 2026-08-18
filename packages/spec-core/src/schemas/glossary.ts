import { z } from 'zod';

export const GlossaryEntrySchema = z.object({
  term: z.string().min(1),
  definition: z.string().min(1),
});
