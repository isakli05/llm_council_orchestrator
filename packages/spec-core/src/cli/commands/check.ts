import { loadBundleAtLevel } from '../../compiler/validation';
import { runChecks, type CheckOutcome, type Executor } from '../../check/runner';
import type { SpecBundle } from '../../schemas';

export interface CheckResult {
  /** 0 all PASS/DRY, 1 any FAIL/TIMEOUT/OUTPUT-CAP/UNPARSEABLE-EXPECT, 2 compile/lint rejection or unknown task. */
  code: number;
  output: string;
}

export interface CheckOptions {
  /** Restrict the run to one task id. */
  task?: string;
  /** false (default in the wrapper) -> DRY RUN: nothing executes. */
  yes: boolean;
  /** Per-command kill timeout (ms); default 60000 in the runner. */
  timeoutMs?: number;
  /** Injected clock (evidence `checkedAt`) — the core reads no clock itself. */
  nowIso: string;
  /** Executor override for tests; default: the child_process wrapper. */
  exec?: Executor;
  /**
   * A pre-loaded, lint-clean bundle (SEC-002): when set, the lint-clean load
   * is SKIPPED and THIS bundle is judged — the MCP consent boundary loads
   * once per request, authorizes against that exact object, and hands the
   * SAME object to the runner, so no re-load (no TOCTOU window) can sit
   * between authorization and execution. The CLI never passes this.
   */
  bundle?: SpecBundle;
}

/**
 * `lco check <dir>`: compile the spec tree, then execute (or dry-run) every
 * TaskContract verification command and report the judged outcomes.
 *
 * Pure command core — no console, no process.exit, no clock: `nowIso` is
 * injected, the wrapper prints `output` and returns `code`.
 *
 * VALIDATION LEVEL (BACK-006): check loads the bundle at 'lint-clean' — a
 * bundle with dangling references (L13) or unjudgeable verification
 * contracts (L14) is refused (code 2, actionable output) before anything
 * executes or previews, in dry mode as much as under --yes. Compilation and
 * lint rejections are usage-class (code 2); an unknown `--task` id is also
 * code 2 (the runner reports it as such).
 *
 * DRY remains the default and an HONEST preview (BACK-004): nothing executes
 * without --yes, and an unparseable expectation surfaces as
 * UNPARSEABLE-EXPECT/exit 1 in the dry table exactly as --yes would judge it.
 *
 * Output contract:
 *   DRY RUN — no commands executed; pass --yes to execute   <- only when !yes
 *   check: pet-clinic — 3 verification command(s)
 *   TASK\tCOMMAND\tEXPECT\tEXPECTED→ACTUAL\tSTATUS
 *   TASK-0001\tnode --version\texit 0\t0 → 0\tPASS
 *   summary: 1 pass, 0 fail, 0 dry
 *   (0 timeout, 0 output-cap, 0 unparseable-expect)
 *   evidence: <dir>/spec/evidence/TASK-0001-check-<RUN>.json <- only when --yes
 *     (RUN = run-addressed name from the runner: every check run writes a
 *      NEW immutable 0600 file; reruns never overwrite earlier evidence)
 */
export async function cmdCheck(dir: string, opts: CheckOptions): Promise<CheckResult> {
  let compiledBundle: SpecBundle;
  if (opts.bundle !== undefined) {
    // Caller-loaded (the MCP consent path, which already enforced 'lint-clean'
    // on this exact object — see CheckOptions.bundle). CLI callers always load.
    compiledBundle = opts.bundle;
  } else {
    const loaded = await loadBundleAtLevel(dir, 'lint-clean');
    if (!loaded.ok) {
      return { code: loaded.code, output: loaded.output };
    }
    compiledBundle = loaded.bundle;
  }

  const run = await runChecks(compiledBundle, dir, opts);
  if (run.code === 2) {
    return {
      code: 2,
      output: `unknown task: ${opts.task} (no such task_id in the compiled bundle)`,
    };
  }

  return {
    code: run.code,
    output: renderReport(compiledBundle.manifest.project.name, run.outcomes, run.evidenceFiles, opts.yes),
  };
}

/** Deterministic table + summary renderer over the runner's outcomes. */
function renderReport(
  projectName: string,
  outcomes: CheckOutcome[],
  evidenceFiles: string[],
  yes: boolean,
): string {
  const lines: string[] = [];
  if (!yes) {
    lines.push('DRY RUN — no commands executed; pass --yes to execute');
  }
  lines.push(`check: ${projectName} — ${outcomes.length} verification command(s)`);
  lines.push('TASK\tCOMMAND\tEXPECT\tEXPECTED→ACTUAL\tSTATUS');
  for (const o of outcomes) {
    lines.push(`${o.taskId}\t${o.command}\t${o.expect}\t${expectedActual(o)}\t${o.status}`);
  }

  const pass = outcomes.filter((o) => o.status === 'PASS').length;
  const dry = outcomes.filter((o) => o.status === 'DRY').length;
  const fail = outcomes.length - pass - dry; // FAIL + TIMEOUT + OUTPUT-CAP + UNPARSEABLE-EXPECT
  const timeouts = outcomes.filter((o) => o.status === 'TIMEOUT').length;
  // OPS-003: the cap is its own failure class in the breakdown — a noisy
  // command must not read as a hang.
  const outputCaps = outcomes.filter((o) => o.status === 'OUTPUT-CAP').length;
  const unparseable = outcomes.filter((o) => o.status === 'UNPARSEABLE-EXPECT').length;
  lines.push(`summary: ${pass} pass, ${fail} fail, ${dry} dry`);
  lines.push(`(${timeouts} timeout, ${outputCaps} output-cap, ${unparseable} unparseable-expect)`);

  if (yes && evidenceFiles.length > 0) {
    // The run-addressed files the runner actually wrote this run — the trail
    // is copy-pasteable and points at THIS run's evidence, never a stale name.
    lines.push(`evidence: ${evidenceFiles.join(', ')}`);
  }
  return lines.join('\n');
}

/** `0 → 0` for judged runs; `? → -` when either side was never determined. */
function expectedActual(o: CheckOutcome): string {
  const expected = o.expectedExit === null ? '?' : String(o.expectedExit);
  const killed = o.status === 'TIMEOUT' || o.status === 'OUTPUT-CAP';
  const actual = killed ? 'killed' : o.actualExit === null ? '-' : String(o.actualExit);
  return `${expected} → ${actual}`;
}
