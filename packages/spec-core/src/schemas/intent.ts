import { z } from 'zod';

export const IntentSchema = z
  .object({
    statement: z.string().trim().min(1),
    normalized: z.string().trim().min(1),
  })
  .strict();
