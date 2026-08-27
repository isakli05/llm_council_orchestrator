import type { LintRule } from '../types';
import type { LintFinding } from '../types';

/**
 * L03_TASK_TEST_FILE_UNKNOWN: every `tasks[].tests[].file` must be listed in
 * the bundle's `test_files` ledger — error on the owning task id.
 */
export const rule: LintRule = {
  id: 'L03_TASK_TEST_FILE_UNKNOWN',
  check(b) {
    const ledger = new Set(b.test_files);
    const findings: LintFinding[] = [];
    for (const task of b.tasks) {
      for (const test of task.tests) {
        if (ledger.has(test.file)) continue;
        findings.push({
          rule: 'L03_TASK_TEST_FILE_UNKNOWN',
          severity: 'error',
          path: task.task_id,
          message: `task ${task.task_id} declares the test file '${test.file}' which is not in the bundle test_files ledger`,
        });
      }
    }
    return findings;
  },
};
