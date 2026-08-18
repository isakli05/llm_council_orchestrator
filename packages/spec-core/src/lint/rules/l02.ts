import type { LintRule } from '../engine';
import type { LintFinding } from '../types';

/**
 * L02_ORPHAN_REQUIREMENT: a requirement id that appears in no
 * `tasks[].refs.requirements` will never be delivered — error on the req id.
 */
export const rule: LintRule = {
  id: 'L02_ORPHAN_REQUIREMENT',
  check(b) {
    const referenced = new Set(b.tasks.flatMap((t) => t.refs.requirements));
    const findings: LintFinding[] = [];
    for (const req of b.requirements) {
      if (referenced.has(req.id)) continue;
      findings.push({
        rule: 'L02_ORPHAN_REQUIREMENT',
        severity: 'error',
        path: req.id,
        message: `requirement ${req.id} is an orphan: no task references it in refs.requirements`,
      });
    }
    return findings;
  },
};
