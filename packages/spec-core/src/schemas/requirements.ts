import { z } from 'zod';
import { IdSchema } from './common';

export const RequirementSchema = z
  .object({
    id: IdSchema,
    statement: z.string().trim().min(1),
    priority: z.enum(['must', 'should', 'could']),
    evidence: z.array(IdSchema).min(1),
    /** TST id'leri */
    acceptance_refs: z.array(IdSchema).min(1),
    /** L01: '**Terim**' işaretli kelimeler; lint glossary ile karşılaştırır */
    terms_used: z.array(z.string()).default([]),
  })
  .strict();
