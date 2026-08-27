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
import { INPUT_CEILINGS as C } from './limits';

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
export * from './limits';

export const SpecBundleSchema = z
  .object({
    manifest: ManifestSchema,
    intent: IntentSchema,
    glossary: z.array(GlossaryEntrySchema).max(C.glossaryPerBundle, `glossary exceeds ${C.glossaryPerBundle} entries — split the spec (input ceiling)`),
    assumptions: z.array(
      z
        .object({
          id: AssumptionIdSchema,
          statement: z.string().min(1).max(C.charsPurpose, 'an assumption statement exceeds the length ceiling (input ceiling)'),
          evidence: z.array(EvidenceIdSchema).max(C.assumptionEvidenceRefs, `an assumption carries over ${C.assumptionEvidenceRefs} evidence refs (input ceiling)`),
          impact_if_wrong: z.string().min(1).max(C.charsPurpose, 'an impact_if_wrong exceeds the length ceiling (input ceiling)'),
        })
        .strict(),
    ).max(C.assumptionsPerBundle, `assumptions exceeds ${C.assumptionsPerBundle} entries — split the spec (input ceiling)`),
    evidence: z.array(EvidenceItemSchema).max(C.evidencePerBundle, `evidence exceeds ${C.evidencePerBundle} entries — consolidate or split the spec (input ceiling)`),
    requirements: z.array(RequirementSchema).max(C.requirementsPerBundle, `requirements exceeds ${C.requirementsPerBundle} entries — split the spec (input ceiling)`),
    decisions: z.array(DecisionSchema).max(C.decisionsPerBundle, `decisions exceeds ${C.decisionsPerBundle} entries — split the spec (input ceiling)`),
    contracts: z.array(ContractSchema).max(C.contractsPerBundle, `contracts exceeds ${C.contractsPerBundle} entries — split the spec (input ceiling)`),
    tasks: z.array(TaskContractSchema).max(C.tasksPerBundle, `bundle exceeds ${C.tasksPerBundle} tasks — split the spec into separately frozen bundles (input ceiling)`),
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
