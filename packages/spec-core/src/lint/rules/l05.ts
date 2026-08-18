import type { LintRule } from '../engine';
import type { LintFinding } from '../types';

/**
 * L05_INTERFACE_MISMATCH: a task may only change interface symbols that are
 * declared in `contracts[].symbol`; an undeclared change breaks every other
 * consumer — error on the owning task id.
 */
export const rule: LintRule = {
  id: 'L05_INTERFACE_MISMATCH',
  check(b) {
    const declared = new Set(b.contracts.map((c) => c.symbol));
    const findings: LintFinding[] = [];
    for (const task of b.tasks) {
      for (const change of task.interface_changes) {
        if (declared.has(change.symbol)) continue;
        findings.push({
          rule: 'L05_INTERFACE_MISMATCH',
          severity: 'error',
          path: task.task_id,
          message: `task ${task.task_id} changes the interface symbol '${change.symbol}' which is not declared in any contract`,
        });
      }
    }
    return findings;
  },
};
