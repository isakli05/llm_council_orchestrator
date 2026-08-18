export const LINT_RULES = [
  'L01_UNDEFINED_TERM',
  'L02_ORPHAN_REQUIREMENT',
  'L03_TASK_TEST_FILE_UNKNOWN',
  'L04_CYCLIC_TASK_DEPS',
  'L05_INTERFACE_MISMATCH',
  'L06_DUPLICATE_ID',
  'L07_MISSING_NFR_BUDGET',
  'L08_UNRESOLVED_LEAK',
  'L10_TRACEABILITY_GAP',
  'L12_SCOPE_OVERLAP',
] as const;

export type LintRuleId = (typeof LINT_RULES)[number];

export interface LintFinding {
  rule: LintRuleId;
  severity: 'error' | 'warning';
  path: string;
  message: string;
}

export interface LintResult {
  errors: LintFinding[];
  warnings: LintFinding[];
  summary: Record<string, number>;
}
