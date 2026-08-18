import type { LintRule } from '../engine';
import type { LintFinding } from '../types';

/**
 * L08_UNRESOLVED_LEAK: unresolved or blocking material must not leak into a
 * linted spec — one error per trigger: each UNRESOLVED decision (path = DEC
 * id) plus each nonzero manifest counter (path = 'manifest').
 */
export const rule: LintRule = {
  id: 'L08_UNRESOLVED_LEAK',
  check(b) {
    const findings: LintFinding[] = [];

    for (const dec of b.decisions) {
      if (dec.status !== 'UNRESOLVED') continue;
      findings.push({
        rule: 'L08_UNRESOLVED_LEAK',
        severity: 'error',
        path: dec.claim_id,
        message: `decision ${dec.claim_id} still has status 'UNRESOLVED'`,
      });
    }

    if (b.manifest.unresolved_count > 0) {
      findings.push({
        rule: 'L08_UNRESOLVED_LEAK',
        severity: 'error',
        path: 'manifest',
        message: `manifest.unresolved_count is ${b.manifest.unresolved_count} (> 0): unresolved items leaked into the spec`,
      });
    }

    if (b.manifest.blocking_count > 0) {
      findings.push({
        rule: 'L08_UNRESOLVED_LEAK',
        severity: 'error',
        path: 'manifest',
        message: `manifest.blocking_count is ${b.manifest.blocking_count} (> 0): blocking items leaked into the spec`,
      });
    }
    return findings;
  },
};
