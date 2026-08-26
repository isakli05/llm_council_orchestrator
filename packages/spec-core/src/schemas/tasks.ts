import { z } from 'zod';
import {
  DecisionIdSchema,
  ImpactLevelSchema,
  RequirementIdSchema,
  TaskIdSchema,
  TestIdSchema,
} from './common';

/** 18 alanlık sözleşme */
export const TaskContractSchema = z
  .object({
    task_id: TaskIdSchema,
    title: z.string().trim().min(1),
    purpose: z.string().trim().min(1),
    refs: z
      .object({
        requirements: z.array(RequirementIdSchema),
        architecture: z.array(z.string()),
        decisions: z.array(DecisionIdSchema),
      })
      .strict(),
    depends_on: z.array(TaskIdSchema),
    preconditions: z.array(z.string()).min(1),
    /** glob path'ler */
    permitted_scope: z.array(z.string()).min(1),
    protected: z.array(z.string()),
    interface_changes: z.array(
      z
        .object({ symbol: z.string().min(1), file: z.string().min(1) })
        .strict(),
    ),
    invariants: z.array(z.string()).min(1),
    instructions: z.string().trim().min(1),
    tests: z
      .array(
        z
          .object({
            /**
             * Optional first-class test id (TST-NNNN): the anchor
             * `requirements[].acceptance_refs` resolves against (closure/L13).
             * Optional so pre-id stored bundles still compile; a referenced
             * test MUST carry one — an unresolvable acceptance_ref is a lint
             * error, which every lint-clean consumer (plan/check/freeze) gates on.
             */
            id: TestIdSchema.optional(),
            kind: z.enum(['unit', 'integration', 'property', 'e2e']),
            file: z.string().trim().min(1),
            cases: z.array(z.string().trim().min(1)).min(1),
          })
          .strict(),
      )
      .min(1),
    verification: z
      .array(
        z
          .object({
            command: z.string().trim().min(1),
            expect: z.string().trim().min(1),
          })
          .strict(),
      )
      .min(1),
    acceptance: z.array(z.string()).min(1),
    rollback: z.string().trim().min(1),
    completion_evidence: z
      .object({
        required: z
          .array(z.enum(['verification_outputs', 'test_summary', 'diff_scope_check']))
          .min(1),
      })
      .strict(),
    risk: z
      .object({ level: ImpactLevelSchema, note: z.string() })
      .strict(),
    complexity: z.enum(['xs', 's', 'm', 'l']),
  })
  .strict();
export type TaskContract = z.infer<typeof TaskContractSchema>;
