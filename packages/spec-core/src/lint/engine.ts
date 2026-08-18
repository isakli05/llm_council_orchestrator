import type { SpecBundle } from '../schemas';
import type { LintFinding, LintResult, LintRuleId } from './types';

/**
 * A lint rule: scans a compiled bundle and reports findings tagged with its
 * own rule id. Task 7 implements the rule bodies in `src/lint/rules/`.
 */
export interface LintRule {
  id: LintRuleId;
  check(bundle: SpecBundle): LintFinding[];
}

/**
 * Rule registry. Task 7 registers L01..L12 here.
 *
 * The engine is honest with an empty registry: zero registered rules produce
 * the empty result — not a fake pass — because every finding below can only
 * originate from a registered rule's `check`.
 */
export const RULES: LintRule[] = [];

/**
 * Run every registered rule over the bundle and bucket the findings:
 * `errors` / `warnings` by each finding's severity, `summary` as a
 * per-rule-id finding count. Deterministic: rule registration order drives
 * finding order; no clock, filesystem, or environment access.
 */
export function lintBundle(b: SpecBundle): LintResult {
  const errors: LintFinding[] = [];
  const warnings: LintFinding[] = [];
  const summary: Record<string, number> = {};

  for (const rule of RULES) {
    const findings = rule.check(b);
    summary[rule.id] = findings.length;
    for (const finding of findings) {
      if (finding.severity === 'error') {
        errors.push(finding);
      } else {
        warnings.push(finding);
      }
    }
  }

  return { errors, warnings, summary };
}
