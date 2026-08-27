import { z } from 'zod';
import { EvidenceIdSchema, Sha256Schema } from './common';
import { INPUT_CEILINGS as C } from './limits';

export const EvidenceItemSchema = z
  .object({
    id: EvidenceIdSchema,
    kind: z.enum(['user_input', 'code', 'runtime', 'doc', 'constraint']),
    source: z.string().min(1).max(C.charsFilePath, 'evidence source exceeds the length ceiling (input ceiling)'),
    hash: Sha256Schema,
  })
  .strict();
