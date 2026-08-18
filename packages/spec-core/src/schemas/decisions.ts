import { z } from 'zod';
import { IdSchema, ImpactLevelSchema } from './common';

export const DecisionSchema = z.object({
  claim_id: IdSchema,
  decision: z.string().min(1),
  /** ≤~200 kelime */
  rationale: z.string().max(2000),
  evidence: z.array(IdSchema),
  confidence: z.number().min(0).max(1),
  impact: ImpactLevelSchema,
  assumptions: z.array(z.string()),
  alternatives: z
    .array(z.object({ option: z.string(), rejected_because: z.string() }))
    .min(0),
  status: z.enum(['proposed', 'accepted', 'rejected', 'UNRESOLVED']),
});
