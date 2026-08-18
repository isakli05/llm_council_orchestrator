import { z } from 'zod';

export const IntentSchema = z.object({
  statement: z.string().min(1),
  normalized: z.string().min(1),
});
