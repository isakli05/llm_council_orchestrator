import { z } from 'zod';
import { DecisionIdSchema, EvidenceIdSchema, ImpactLevelSchema } from './common';
import { INPUT_CEILINGS as C } from './limits';

export const DecisionSchema = z
  .object({
    claim_id: DecisionIdSchema,
    decision: z.string().trim().min(1),
    /** ≤~200 kelime — bilinçli olarak trim edilmez (arıza notu serbest biçimli) */
    rationale: z.string().max(2000),
    evidence: z.array(EvidenceIdSchema).max(C.decisionEvidenceRefs, `a decision carries over ${C.decisionEvidenceRefs} evidence refs (input ceiling)`),
    confidence: z.number().min(0).max(1),
    impact: ImpactLevelSchema,
    assumptions: z.array(z.string()),
    alternatives: z
      .array(
        z
          .object({ option: z.string(), rejected_because: z.string() })
          .strict(),
      )
      .min(0),
    status: z.enum(['proposed', 'accepted', 'rejected', 'UNRESOLVED']),
  })
  .strict();
