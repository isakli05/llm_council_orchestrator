import type { LintRule } from '../types';
import type { LintFinding } from '../types';
import type { TaskContract } from '../../schemas';

/**
 * L10_TRACEABILITY_GAP: scoped to EXISTING req→task edges only. For each
 * requirement referenced by ≥1 task (task.refs.requirements), at least one of
 * its referencing tasks must have a test whose `cases[]` text contains the
 * REQ id — otherwise the edge exists but nothing verifies it.
 *
 * A requirement referenced by NO task is deliberately not L10's business:
 * that is L02_ORPHAN_REQUIREMENT, and firing here too would double-report the
 * L02 vector.
 */
export const rule: LintRule = {
  id: 'L10_TRACEABILITY_GAP',
  check(b) {
    const referencing = new Map<string, TaskContract[]>();
    for (const task of b.tasks) {
      for (const reqId of task.refs.requirements) {
        referencing.set(reqId, [...(referencing.get(reqId) ?? []), task]);
      }
    }

    const findings: LintFinding[] = [];
    for (const req of b.requirements) {
      const tasks = referencing.get(req.id) ?? [];
      if (tasks.length === 0) continue; // orphan — L02's job, not L10's

      const covered = tasks.some((t) =>
        t.tests.some((test) => test.cases.some((c) => c.includes(req.id))),
      );
      if (covered) continue;

      findings.push({
        rule: 'L10_TRACEABILITY_GAP',
        severity: 'error',
        path: req.id,
        message:
          `requirement ${req.id} is referenced by task(s) ` +
          `${tasks.map((t) => t.task_id).join(', ')} but no referencing task has a test case containing '${req.id}'`,
      });
    }
    return findings;
  },
};
