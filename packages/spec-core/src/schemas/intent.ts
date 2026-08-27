import { z } from 'zod';
import { INPUT_CEILINGS as C } from './limits';

export const IntentSchema = z
  .object({
    // The statement can echo a long user intent (the CLI input sanity ceiling
    // is 1_000_000 chars), so this prose ceiling is deliberately generous.
    statement: z.string().trim().min(1).max(C.charsStatement, `intent.statement exceeds ${C.charsStatement} characters (input ceiling)`),
    normalized: z.string().trim().min(1).max(C.charsStatement, `intent.normalized exceeds ${C.charsStatement} characters (input ceiling)`),
  })
  .strict();
