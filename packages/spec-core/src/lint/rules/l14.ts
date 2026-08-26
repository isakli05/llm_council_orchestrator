import type { LintRule } from '../engine';
import type { LintFinding } from '../types';
import { isJudgeableExpect, EXPECT_GRAMMAR_DOC } from '../../check/expect';

/**
 * L14_UNPARSEABLE_EXPECT (BACK-004): every `tasks[].verification[].expect`
 * must be a string the check runner can JUDGE — decided by the single shared
 * grammar (check/expect.ts), which the runner itself parses with. Before this
 * rule a spec could compile, lint clean, and freeze with prose expects the
 * runner could never parse; dry-check then hid the failure until --yes.
 *
 * Chosen at LINT (not schema): shape stays compile's job, so already-stored
 * bundles still compile/verify/trace, while every lint-clean consumer
 * (freeze, plan, check) refuses unjudgeable contracts — and dry-check
 * additionally surfaces them as failures at run time (honest preview).
 */
export const rule: LintRule = {
  id: 'L14_UNPARSEABLE_EXPECT',
  check(b) {
    const findings: LintFinding[] = [];
    for (const task of b.tasks) {
      for (const entry of task.verification) {
        if (isJudgeableExpect(entry.expect)) continue;
        findings.push({
          rule: 'L14_UNPARSEABLE_EXPECT',
          severity: 'error',
          path: task.task_id,
          message: `verification expect '${entry.expect}' is unparseable — ${EXPECT_GRAMMAR_DOC}`,
        });
      }
    }
    return findings;
  },
};
