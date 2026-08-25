import { compileSpecDir } from '../../compiler/compile';
import { runChecks, type CheckOutcome, type Executor } from '../../check/runner';

export interface CheckResult {
  /** 0 all PASS/DRY, 1 any FAIL/TIMEOUT/UNPARSEABLE-EXPECT, 2 compile/unknown task. */
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
}

/**
 * `lco check <dir>`: compile the spec tree, then execute (or dry-run) every
 * TaskContract verification command and report the judged outcomes.
 *
 * Pure command core — no console, no process.exit, no clock: `nowIso` is
 * injected, the wrapper prints `output` and returns `code`. Compilation
 * failures are usage-class (code 2) and short-circuit before the runner;
 * an unknown `--task` id is also code 2 (the runner reports it as such).
 *
 * Output contract:
 *   DRY RUN — no commands executed; pass --yes to execute   <- only when !yes
 *   check: pet-clinic — 3 verification command(s)
 *   TASK\tCOMMAND\tEXPECT\tEXPECTED→ACTUAL\tSTATUS
 *   TASK-0001\tnode --version\texit 0\t0 → 0\tPASS
 *   summary: 1 pass, 0 fail, 0 dry
 *   (0 timeout, 0 unparseable-expect)
 *   evidence: <dir>/spec/evidence/TASK-0001-check.json      <- only when --yes
 */
export async function cmdCheck(dir: string, opts: CheckOptions): Promise<CheckResult> {
  const compiled = await compileSpecDir(dir);
  if (!compiled.ok || !compiled.bundle) {
    return {
      code: 2,
      output: [
        `compile FAILED with ${compiled.errors.length} error(s):`,
        ...compiled.errors.map((e) => `  ${e.path}: ${e.message}`),
      ].join('\n'),
    };
  }

  const run = await runChecks(compiled.bundle, dir, opts);
  if (run.code === 2) {
    return {
      code: 2,
      output: `unknown task: ${opts.task} (no such task_id in the compiled bundle)`,
    };
  }

  return {
    code: run.code,
    output: renderReport(compiled.bundle.manifest.project.name, run.outcomes, dir, opts.yes),
  };
}

/** Deterministic table + summary renderer over the runner's outcomes. */
function renderReport(
  projectName: string,
  outcomes: CheckOutcome[],
  dir: string,
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
  const fail = outcomes.length - pass - dry; // FAIL + TIMEOUT + UNPARSEABLE-EXPECT
  const timeouts = outcomes.filter((o) => o.status === 'TIMEOUT').length;
  const unparseable = outcomes.filter((o) => o.status === 'UNPARSEABLE-EXPECT').length;
  lines.push(`summary: ${pass} pass, ${fail} fail, ${dry} dry`);
  lines.push(`(${timeouts} timeout, ${unparseable} unparseable-expect)`);

  if (yes && outcomes.length > 0) {
    // Under --yes every outcome belongs to an executed/skipped check whose
    // task got an evidence file — name them so the trail is copy-pasteable.
    const files = [...new Set(outcomes.map((o) => o.taskId))].map(
      (taskId) => `${dir}/spec/evidence/${taskId}-check.json`,
    );
    lines.push(`evidence: ${files.join(', ')}`);
  }
  return lines.join('\n');
}

/** `0 → 0` for judged runs; `? → -` when either side was never determined. */
function expectedActual(o: CheckOutcome): string {
  const expected = o.expectedExit === null ? '?' : String(o.expectedExit);
  const actual =
    o.status === 'TIMEOUT' ? 'killed' : o.actualExit === null ? '-' : String(o.actualExit);
  return `${expected} → ${actual}`;
}
