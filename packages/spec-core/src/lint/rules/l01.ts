import type { LintRule } from '../types';
import type { LintFinding } from '../types';

/**
 * L01_UNDEFINED_TERM: every `requirements[].terms_used` entry must exist as a
 * glossary term. A requirement leaning on an undefined word cannot be
 * accepted consistently, so this is an error on the requirement id.
 */
export const rule: LintRule = {
  id: 'L01_UNDEFINED_TERM',
  check(b) {
    const known = new Set(b.glossary.map((g) => g.term));
    const findings: LintFinding[] = [];
    for (const req of b.requirements) {
      for (const term of req.terms_used) {
        if (known.has(term)) continue;
        findings.push({
          rule: 'L01_UNDEFINED_TERM',
          severity: 'error',
          path: req.id,
          message: `requirement ${req.id} uses the term '${term}' which is not defined in the glossary`,
        });
      }
    }
    return findings;
  },
};
