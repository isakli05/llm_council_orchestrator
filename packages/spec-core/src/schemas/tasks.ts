import { z } from 'zod';
import {
  DecisionIdSchema,
  ImpactLevelSchema,
  RequirementIdSchema,
  TaskIdSchema,
  TestIdSchema,
} from './common';
import { INPUT_CEILINGS as C } from './limits';

/** 18 alanlık sözleşme */
export const TaskContractSchema = z
  .object({
    task_id: TaskIdSchema,
    title: z.string().trim().min(1).max(C.charsTitle, `task title exceeds ${C.charsTitle} characters — shorten it (input ceiling)`),
    purpose: z.string().trim().min(1).max(C.charsPurpose, `task purpose exceeds ${C.charsPurpose} characters — shorten it (input ceiling)`),
    refs: z
      .object({
        requirements: z.array(RequirementIdSchema).max(C.refsPerTask, `tasks.refs.requirements exceeds ${C.refsPerTask} entries — split the task (input ceiling)`),
        architecture: z.array(z.string().max(C.charsFilePath, `an architecture ref exceeds ${C.charsFilePath} characters (input ceiling)`)).max(C.refsPerTask, `tasks.refs.architecture exceeds ${C.refsPerTask} entries — split the task (input ceiling)`),
        decisions: z.array(DecisionIdSchema).max(C.refsPerTask, `tasks.refs.decisions exceeds ${C.refsPerTask} entries — split the task (input ceiling)`),
      })
      .strict(),
    depends_on: z.array(TaskIdSchema).max(C.dependsOnPerTask, `depends_on exceeds ${C.dependsOnPerTask} entries — restructure the plan (input ceiling)`),
    preconditions: z.array(z.string().min(1).max(C.charsProseItem, 'a precondition exceeds the per-item length ceiling — shorten it (input ceiling)')).min(1).max(C.preconditionsPerTask, `preconditions exceeds ${C.preconditionsPerTask} entries — split the task (input ceiling)`),
    /** glob path'ler */
    permitted_scope: z.array(z.string().min(1).max(C.charsFilePath, 'a permitted_scope entry exceeds the length ceiling (input ceiling)')).min(1).max(C.scopeEntriesPerTask, `permitted_scope exceeds ${C.scopeEntriesPerTask} entries — narrow the scopes or split the task (input ceiling)`),
    protected: z.array(z.string().min(1).max(C.charsFilePath, 'a protected entry exceeds the length ceiling (input ceiling)')).max(C.protectedEntriesPerTask, `protected exceeds ${C.protectedEntriesPerTask} entries (input ceiling)`),
    interface_changes: z.array(
      z
        .object({ symbol: z.string().min(1).max(C.charsProseItem, 'interface_changes.symbol exceeds the length ceiling (input ceiling)'), file: z.string().min(1).max(C.charsFilePath, 'interface_changes.file exceeds the length ceiling (input ceiling)') })
        .strict(),
    ).max(C.interfaceChangesPerTask, `interface_changes exceeds ${C.interfaceChangesPerTask} entries — split the task (input ceiling)`),
    invariants: z.array(z.string().min(1).max(C.charsProseItem, 'an invariant exceeds the per-item length ceiling — shorten it (input ceiling)')).min(1).max(C.invariantsPerTask, `invariants exceeds ${C.invariantsPerTask} entries — split the task (input ceiling)`),
    instructions: z.string().trim().min(1).max(C.charsInstructions, `task instructions exceed ${C.charsInstructions} characters — shorten them (input ceiling)`),
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
            file: z.string().trim().min(1).max(C.charsFilePath, 'a tests entry file path exceeds the length ceiling (input ceiling)'),
            cases: z.array(z.string().trim().min(1).max(C.charsProseItem, 'a test case exceeds the per-item length ceiling (input ceiling)')).min(1).max(C.testCasesPerTest, `a tests entry exceeds ${C.testCasesPerTest} cases (input ceiling)`),
          })
          .strict(),
      )
      .min(1)
      .max(C.testsPerTask, `tests exceeds ${C.testsPerTask} entries — split the task (input ceiling)`),
    verification: z
      .array(
        z
          .object({
            command: z.string().trim().min(1).max(C.charsCommand, 'a verification command exceeds the length ceiling (input ceiling)'),
            expect: z.string().trim().min(1).max(C.charsCommand, 'a verification expect exceeds the length ceiling (input ceiling)'),
          })
          .strict(),
      )
      .min(1)
      .max(C.verificationPerTask, `verification exceeds ${C.verificationPerTask} entries — split the task (input ceiling)`),
    acceptance: z.array(z.string().min(1).max(C.charsProseItem, 'an acceptance item exceeds the per-item length ceiling (input ceiling)')).min(1).max(C.acceptancePerTask, `acceptance exceeds ${C.acceptancePerTask} entries — split the task (input ceiling)`),
    rollback: z.string().trim().min(1).max(C.charsRollback, `task rollback exceeds ${C.charsRollback} characters — shorten it (input ceiling)`),
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
