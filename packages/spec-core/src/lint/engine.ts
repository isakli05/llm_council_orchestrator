import type { SpecBundle } from '../schemas';
import type { LintFinding, LintResult, LintRuleId } from './types';
import { rule as l01 } from './rules/l01';
import { rule as l02 } from './rules/l02';
import { rule as l03 } from './rules/l03';
import { rule as l04 } from './rules/l04';
import { rule as l05 } from './rules/l05';
import { rule as l06 } from './rules/l06';
import { rule as l07 } from './rules/l07';
import { rule as l08 } from './rules/l08';
import { rule as l10 } from './rules/l10';
import { rule as l12 } from './rules/l12';
import { rule as l13 } from './rules/l13';
import { rule as l14 } from './rules/l14';

/**
 * A lint rule: scans a compiled bundle and reports findings tagged with its
 * own rule id. Rule bodies live in `src/lint/rules/`.
 */
export interface LintRule {
  id: LintRuleId;
  check(bundle: SpecBundle): LintFinding[];
}

/**
 * Rule registry: the evidence-gate rules L01..L08, L10, L12 plus the
 * semantic-closure rules L13 (referential closure) and L14 (judgeable expect)
 * (L09/L11 are schema-layer checks, not lint rules). Registration order
 * drives finding order in `lintBundle` results.
 */
export const RULES: LintRule[] = [
  l01,
  l02,
  l03,
  l04,
  l05,
  l06,
  l07,
  l08,
  l10,
  l12,
  l13,
  l14,
];

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
