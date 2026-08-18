import { z } from 'zod';
import { IdSchema, ImpactLevelSchema } from './common';

/** 15 alanlık sözleşme */
export const TaskContractSchema = z.object({
  task_id: IdSchema,
  title: z.string().min(1),
  purpose: z.string().min(1),
  refs: z.object({
    requirements: z.array(IdSchema),
    architecture: z.array(z.string()),
    decisions: z.array(IdSchema),
  }),
  depends_on: z.array(IdSchema),
  preconditions: z.array(z.string()).min(1),
  /** glob path'ler */
  permitted_scope: z.array(z.string()).min(1),
  protected: z.array(z.string()),
  interface_changes: z.array(
    z.object({ symbol: z.string().min(1), file: z.string().min(1) }),
  ),
  invariants: z.array(z.string()).min(1),
  instructions: z.string().min(1),
  tests: z
    .array(
      z.object({
        kind: z.enum(['unit', 'integration', 'property', 'e2e']),
        file: z.string().min(1),
        cases: z.array(z.string()).min(1),
      }),
    )
    .min(1),
  verification: z
    .array(z.object({ command: z.string().min(1), expect: z.string().min(1) }))
    .min(1),
  acceptance: z.array(z.string()).min(1),
  rollback: z.string().min(1),
  completion_evidence: z.object({
    required: z
      .array(z.enum(['verification_outputs', 'test_summary', 'diff_scope_check']))
      .min(1),
  }),
  risk: z.object({ level: ImpactLevelSchema, note: z.string() }),
  complexity: z.enum(['xs', 's', 'm', 'l']),
});
export type TaskContract = z.infer<typeof TaskContractSchema>;
