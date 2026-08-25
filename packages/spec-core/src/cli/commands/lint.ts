import { compileSpecDir } from '../../compiler/compile';
import { lintBundle, RULES } from '../../lint/engine';
import { compileFailedOutput } from './compile';

export interface LintResult {
  /** 0 clean or warnings-only, 1 lint errors, 2 compile failure. */
  code: number;
  output: string;
}

/**
 * `lco lint <dir>`: compile, then lint the bundle and render the findings.
 *
 * Pure command core — no console, no clock, no process.exit: the wrapper
 * prints `output` and returns `code`. Output contract: `lint OK: …` on a
 * clean run; a `RULE\tSEVERITY\tPATH\tMESSAGE` table (errors before
 * warnings) plus the error/warning tally otherwise.
 */
export async function cmdLint(dir: string): Promise<LintResult> {
  const result = await compileSpecDir(dir);
  if (!result.ok || !result.bundle) {
    return { code: 2, output: compileFailedOutput(result.errors) };
  }

  const lint = lintBundle(result.bundle);
  if (lint.errors.length === 0 && lint.warnings.length === 0) {
    return { code: 0, output: `lint OK: 0 errors, 0 warnings (${RULES.length} rules)` };
  }

  const lines = [
    'RULE\tSEVERITY\tPATH\tMESSAGE',
    ...[...lint.errors, ...lint.warnings].map(
      (f) => `${f.rule}\t${f.severity}\t${f.path || '<root>'}\t${f.message}`,
    ),
    `${lint.errors.length} error(s), ${lint.warnings.length} warning(s)`,
  ];
  return { code: lint.errors.length > 0 ? 1 : 0, output: lines.join('\n') };
}
