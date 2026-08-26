import { z } from 'zod';
import { EvidenceIdSchema, Sha256Schema } from './common';

export const EvidenceItemSchema = z
  .object({
    id: EvidenceIdSchema,
    kind: z.enum(['user_input', 'code', 'runtime', 'doc', 'constraint']),
    source: z.string().min(1),
    hash: Sha256Schema,
  })
  .strict();
