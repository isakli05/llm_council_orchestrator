/**
 * THE verification-expectation grammar (BACK-004) — the SINGLE shared
 * definition of what `tasks[].verification[].expect` strings the check runner
 * can judge.
 *
 * Before this module existed only inside the runner: schema/lint required a
 * non-empty string, so a spec could compile, lint, generate, and FREEZE with
 * `expect` prose the runner could never parse ("exit code 0, all cases pass")
 * — verification contracts that fail at their own verification layer. The
 * grammar now lives HERE and both sides consume it:
 *
 *   - lint rule L14_UNPARSEABLE_EXPECT rejects an expect string the runner
 *     could not parse (so plan/check/freeze — every lint-clean consumer —
 *     refuse to operate on unjudgeable contracts);
 *   - the check runner (check/runner.ts) parses/judges with `parseExpect`.
 *
 * Grammar: the FIRST `exit N` (decimal digits) in the string is the expected
 * exit code. `exit 0`, `suite passes with exit 0 and no diff`, and
 * `exit 1 for bad input` are judgeable. Prose like 'exit code 0, all cases
 * pass' is NOT — 'exit' there is not followed by digits — and neither is a
 * string with no exit token at all. Unjudgeable means unexecutable under
 * --yes (fail-closed in the runner) and a lint error (L14) upstream.
 */

/** The pattern both the lint rule and the runner evaluate. */
export const EXPECTED_EXIT_PATTERN = /exit (\d+)/;

/** True when the runner could extract an expected exit code from `expect`. */
export function isJudgeableExpect(expect: string): boolean {
  return EXPECTED_EXIT_PATTERN.test(expect);
}

/**
 * Extract the expected exit code: the FIRST `exit N` match wins, no match ->
 * null (unjudgeable — the runner must not execute the command).
 */
export function parseExpect(expect: string): number | null {
  const m = EXPECTED_EXIT_PATTERN.exec(expect);
  return m ? Number(m[1]) : null;
}

/** The grammar as teachable text (used verbatim in lint findings and prompts). */
export const EXPECT_GRAMMAR_DOC =
  "expect must state the expected exit code as 'exit N' (e.g. 'exit 0', " +
  "'exit 1') — the first 'exit N' in the string is the contract the runner " +
  'judges; prose like "exit code 0, all cases pass" is unparseable and can ' +
  'never be judged';
