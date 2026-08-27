import type { LintRule } from '../types';
import type { LintFinding } from '../types';

/**
 * L07_MISSING_NFR_BUDGET: profiles above p-mini must carry at least one
 * requirement whose statement matches /NFR:/i. Without a measurable NFR
 * budget there is nothing to hold an implementation against — error on
 * 'manifest'.
 */
export const rule: LintRule = {
  id: 'L07_MISSING_NFR_BUDGET',
  check(b) {
    const profile = b.manifest.complexity_profile;
    if (profile === 'p-mini') return [];

    const hasBudget = b.requirements.some((r) => /NFR:/i.test(r.statement));
    if (hasBudget) return [];

    return [
      {
        rule: 'L07_MISSING_NFR_BUDGET',
        severity: 'error',
        path: 'manifest',
        message:
          `complexity_profile '${profile}' requires an NFR budget but no requirement ` +
          `statement matches /NFR:/i; add an NFR: budget requirement or rescope to p-mini`,
      },
    ];
  },
};
