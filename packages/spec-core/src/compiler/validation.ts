import { compileSpecDir } from './compile';
import { lintBundle } from '../lint/engine';
import type { SpecBundle } from '../schemas';
import type { LintResult } from '../lint/types';

/**
 * NAMED consumer validation levels (BACK-006).
 *
 * The audit found plan/trace/check compiling a spec tree and operating on the
 * result directly — so a schema-valid but semantically-invalid bundle (dangling
 * references, unjudgeable verification contracts, duplicate ids) drove a lossy
 * `plan --json`, an executable `check`, and a misleading trace. Levels make
 * each consumer's requirement explicit and centrally enforced:
 *
 *   'compile'     — shape-valid: sections parse, SpecBundleSchema passes,
 *                   task ids unique. The DIAGNOSTIC level: nothing is keyed
 *                   by referenced ids and nothing executes. Consumer: trace
 *                   (the human repair view — it must work ON broken specs).
 *   'lint-clean'  — compile + semantics: referential closure (L13) and
 *                   judgeable verification contracts (L14), i.e. zero lint
 *                   errors. The OPERATING level. Consumers: plan (its output
 *                   keys and schedules by id) and check (it executes the
 *                   spec's own commands; DRY previews them).
 *
 * Above these sits the product level frozen+verified (lint-clean + zero
 * counters + pinned hashes) — owned by freeze/verify (see compiler/lifecycle
 * and compiler/verify), not a bundle-loading concern.
 *
 * A refused load is actionable by contract: the output names the failing
 * level, every finding, and the command that explains them (`lco lint <dir>`).
 */
export const VALIDATION_LEVELS = ['compile', 'lint-clean'] as const;
export type ValidationLevel = (typeof VALIDATION_LEVELS)[number];

export type LevelLoadResult =
  | { ok: true; bundle: SpecBundle; lint: LintResult }
  | { ok: false; code: 2; output: string };

/** The actionable lint refusal text shared by every lint-clean consumer. */
export function lintRefusal(lint: LintResult, dir: string): string {
  return [
    `lint FAILED with ${lint.errors.length} error(s) — this command requires a ` +
      `lint-clean bundle (validation level 'lint-clean'); run \`lco lint ${dir}\` for the full report:`,
    ...lint.errors.map((f) => `  ${f.rule} at ${f.path || '<root>'}: ${f.message}`),
  ].join('\n');
}

/**
 * Load a spec directory at a declared level. Compile failures surface the
 * compile errors (code 2, never a bundle); at 'lint-clean' a bundle with lint
 * errors is refused the same way — a consumer never operates on a bundle below
 * its declared level. The lint RESULT is always returned on success so a
 * consumer that loads at 'compile' can still enforce 'lint-clean' itself
 * after its own bundle-specific verdicts (plan does this for cycles).
 */
export async function loadBundleAtLevel(
  dir: string,
  level: ValidationLevel,
): Promise<LevelLoadResult> {
  const compiled = await compileSpecDir(dir);
  if (!compiled.ok || !compiled.bundle) {
    return {
      ok: false,
      code: 2,
      output: [
        `compile FAILED with ${compiled.errors.length} error(s):`,
        ...compiled.errors.map((e) => `  ${e.path}: ${e.message}`),
      ].join('\n'),
    };
  }

  const lint = lintBundle(compiled.bundle);
  if (level === 'lint-clean' && lint.errors.length > 0) {
    return { ok: false, code: 2, output: lintRefusal(lint, dir) };
  }

  return { ok: true, bundle: compiled.bundle, lint };
}
