import type { LintRule } from '../engine';
import type { LintFinding } from '../types';
import { closureFindings } from '../../compiler/closure';

/**
 * L13_BROKEN_REFERENCE (BACK-003): referential closure — every evidence,
 * decision, requirement, test reference and task dependency must resolve to
 * an entity that exists in the bundle. The rule is a thin surface over the
 * shared closure validator (compiler/closure.ts, the T4-lifecycle pattern):
 * one semantic phase, one lint id. Errors, one finding per dangling
 * reference, path = the referencing entity.
 *
 * Consequences downstream: freeze refuses (lint gate); plan and check refuse
 * (they load at the 'lint-clean' validation level — see compiler/validation)
 * — in particular an unknown depends_on id BLOCKS machine plans instead of
 * scheduling the task ready-now.
 */
export const rule: LintRule = {
  id: 'L13_BROKEN_REFERENCE',
  check(b) {
    return closureFindings(b).map(
      (finding): LintFinding => ({
        rule: 'L13_BROKEN_REFERENCE',
        severity: 'error',
        path: finding.path,
        message: `${finding.code.toLowerCase().replace(/_/g, ' ')}: ${finding.message}`,
      }),
    );
  },
};
