import { z } from 'zod';
import { EvidenceIdSchema, RequirementIdSchema, TestIdSchema } from './common';

export const RequirementSchema = z
  .object({
    id: RequirementIdSchema,
    statement: z.string().trim().min(1),
    priority: z.enum(['must', 'should', 'could']),
    evidence: z.array(EvidenceIdSchema).min(1),
    /**
     * TST-NNNN references to the acceptance test entries that prove this
     * requirement. Tests live on tasks as `tasks[].tests[]`; an entry may
     * carry an optional `id: TST-NNNN` and acceptance_refs must resolve
     * against that id set — the closure layer (lint L13) rejects a
     * requirement whose acceptance test does not exist, so the reference is
     * REAL resolvability, not a decorative convention.
     */
    acceptance_refs: z.array(TestIdSchema).min(1),
    /** L01: '**Terim**' işaretli kelimeler; lint glossary ile karşılaştırır */
    terms_used: z.array(z.string()).default([]),
  })
  .strict();
