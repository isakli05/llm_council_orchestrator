import { z } from 'zod';
import { AssumptionIdSchema, EvidenceIdSchema, IdSchema } from './common';
import { ManifestSchema } from './manifest';
import { IntentSchema } from './intent';
import { GlossaryEntrySchema } from './glossary';
import { EvidenceItemSchema } from './evidence';
import { RequirementSchema } from './requirements';
import { DecisionSchema } from './decisions';
import { ContractSchema } from './contracts';
import { TaskContractSchema } from './tasks';
import { LegacyPackageSchema } from './legacy';

// SPEC_SCHEMA_VERSION and the version policy live in ./version (PROD-005):
// the single place the literal exists; re-exported here for the public API.
export * from './version';
export * from './common';
export * from './manifest';
export * from './intent';
export * from './glossary';
export * from './evidence';
export * from './requirements';
export * from './decisions';
export * from './contracts';
export * from './tasks';
export * from './legacy';

export const SpecBundleSchema = z
  .object({
    manifest: ManifestSchema,
    intent: IntentSchema,
    glossary: z.array(GlossaryEntrySchema),
    assumptions: z.array(
      z
        .object({
          id: AssumptionIdSchema,
          statement: z.string().min(1),
          evidence: z.array(EvidenceIdSchema),
          impact_if_wrong: z.string().min(1),
        })
        .strict(),
    ),
    evidence: z.array(EvidenceItemSchema),
    requirements: z.array(RequirementSchema),
    decisions: z.array(DecisionSchema),
    contracts: z.array(ContractSchema),
    tasks: z.array(TaskContractSchema),
    /** L03: task.tests[].file bu kayıt defterinde olmalı */
    test_files: z.array(z.string().min(1)),
    legacy: LegacyPackageSchema.optional(),
  })
  .strict();
export type SpecBundle = z.infer<typeof SpecBundleSchema>;

export const TraceEdgeSchema = z
  .object({
    from: IdSchema,
    to: IdSchema,
    kind: z.enum(['req-task', 'task-test', 'dec-task', 'evidence-req']),
  })
  .strict();
export type TraceEdge = z.infer<typeof TraceEdgeSchema>;
