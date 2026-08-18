import { z } from 'zod';
import { IdSchema, Sha256Schema } from './common';

export const EvidenceItemSchema = z.object({
  id: IdSchema,
  kind: z.enum(['user_input', 'code', 'runtime', 'doc', 'constraint']),
  source: z.string().min(1),
  hash: Sha256Schema,
});
