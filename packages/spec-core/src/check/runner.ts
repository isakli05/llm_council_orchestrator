import { exec } from 'node:child_process';
import { existsSync, mkdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import type { SpecBundle } from '../schemas';
import { acquireSpecRootLock, swapFilesAtomically } from '../storage/revision';
import { assertNoSymlinkBelow, isInside, PathEscapeError } from '../storage/paths';
import { parseExpect } from './expect';
import { redactSecrets } from './redact';

// The expect grammar is defined ONCE in ./expect (BACK-004) and shared with
// lint L14; re-exported here for the existing import surface.
export { parseExpect } from './expect';

/**
 * Verification-command runner — the `lco check` core.
 *
 * Security model (binding):
 *   - `yes: false` (the CLI default) is a DRY RUN: NO command is ever handed
 *     to the executor, nothing is written. The dry table is the preview of
 *     what `--yes` would run — an HONEST preview (BACK-004): an expectation
 *     the runner could not judge surfaces as `UNPARSEABLE-EXPECT` and fails
 *     the run (code 1) in dry mode too, exactly as it would under `--yes`.
 *     Only judgeable entries are labeled `DRY`; a dry exit 0 certifies that
 *     every contract is judgeable.
 *   - `yes: true` executes each TaskContract verification command via the
 *     injected Executor (production: child_process.exec, cwd = the spec root,
 *     killed at `timeoutMs`, default 60s).
 *   - Fail-closed judgement: the expected exit code is ONLY what the first
 *     `exit N` match in the `expect` description yields (the shared
 *     ./expect grammar). If `parseExpect` cannot produce a number, the
 *     command is NOT executed — running something whose result cannot be
 *     judged would be success theater. The outcome is
 *     `UNPARSEABLE-EXPECT` and counts as a failure.
 *   - `TIMEOUT` (executor killed the process) counts as a failure; a mismatched
 *     exit code is `FAIL`.
 *
 * Evidence: under `yes: true` ONE NEW run-addressed JSON file per task is
 * written to `<dir>/spec/evidence/<TASK-ID>-check-<RUN>.json` — `{task_id,
 * checkedAt, checks: [...]}` with one entry per verification command
 * (executed or skipped: a skipped entry is recorded with status
 * UNPARSEABLE-EXPECT, because the file is the audit trail of what `--yes`
 * did). DRY writes nothing, ever.
 *
 * EVIDENCE HARDENING (SEC-004): `<RUN>` is a deterministic run id built from
 * the INJECTED nowIso + the task id + a collision counter, so each check run
 * writes a NEW file and a rerun can never erase the previous audit trail;
 * files are created with mode 0600 (owner-only — output tails may carry
 * secrets); and every captured output passes the best-effort redaction pass
 * in ./redact BEFORE it is kept in memory or on disk.
 *
 * WRITE CONTAINMENT (SEC-003): the evidence write refuses a `spec/` or
 * `spec/evidence/` that is a symlink (writes never follow symlinks below the
 * spec root) and requires the evidence dir to resolve inside the resolved
 * root. A refusal throws before anything is written.
 *
 * Exit-code mapping: every outcome PASS or DRY -> 0; any FAIL / TIMEOUT /
 * UNPARSEABLE-EXPECT (dry included) -> 1; an unknown `opts.task` id -> 2 with
 * no outcomes (the CLI prints the unknown-task message).
 */

export interface CheckOutcome {
  taskId: string;
  command: string;
  expect: string;
  expectedExit: number | null;
  actualExit: number | null;
  status: 'PASS' | 'FAIL' | 'TIMEOUT' | 'UNPARSEABLE-EXPECT' | 'DRY';
  durationMs: number;
  outputTail: string;
}

/**
 * Runs one command and reports how it ended. `stdout` carries the COMBINED
 * stdout+stderr text (the interface's single output channel); `exit` is the
 * process exit code, or null when none could be observed; `timedOut` is true
 * only when the process was killed by the timeout.
 */
export type Executor = (
  cmd: string,
  cwd: string,
  timeoutMs: number,
) => Promise<{ exit: number | null; stdout: string; timedOut: boolean }>;

export interface RunChecksOptions {
  /** Restrict the run to one task id (unknown id -> { code: 2, outcomes: [] }). */
  task?: string;
  /** false (dry run) -> nothing executes; true -> commands run. */
  yes: boolean;
  /** Per-command kill timeout; default {@link DEFAULT_TIMEOUT_MS}. */
  timeoutMs?: number;
  /** Timestamp stamped into evidence files (injected — the core reads no clock). */
  nowIso: string;
  /** Executor override (tests inject fakes; default: the child_process wrapper). */
  exec?: Executor;
}

export interface RunChecksResult {
  /** 0 all PASS/DRY, 1 any FAIL/TIMEOUT/UNPARSEABLE-EXPECT, 2 unknown --task. */
  code: number;
  outcomes: CheckOutcome[];
  /**
   * Absolute paths of the evidence files THIS run wrote (`--yes` only, in
   * task order; empty for dry runs and the unknown-task refusal).
   */
  evidenceFiles: string[];
}

/** Kill hanging verification commands after this long (per command). */
export const DEFAULT_TIMEOUT_MS = 60_000;

/** outputTail length — the tail of the combined (redacted) output kept as evidence. */
export const OUTPUT_TAIL_LIMIT = 500;

/** Evidence file mode (SEC-004): owner-only — tails may carry secrets. */
export const EVIDENCE_FILE_MODE = 0o600;

/**
 * Extract the expected exit code from an `expect` description — the shared
 * grammar in ./expect: the FIRST `/exit (\d+)/` match wins, no match -> null
 * (unjudgeable, fail-closed). Prose like 'exit code 0, all cases pass'
 * deliberately yields null: 'exit' there is not followed by digits.
 * (parseExpect itself now lives in ./expect; see the re-export above.)
 */

/**
 * The production Executor: child_process.exec with a hard timeout, never
 * rejecting — every ending (success, nonzero exit, spawn error, timeout kill)
 * resolves to the Executor result so judgement stays in runChecks.
 *
 * exec (a shell) is deliberate: TaskContract verification commands are shell
 * command strings by schema design (`pnpm vitest run tests/x.test.ts`). The
 * injection surface is exactly what the security model governs — a DRY RUN
 * default where nothing executes, and explicit `--yes` as the operator's
 * opt-in to run the spec's own commands.
 */
export function execCommand(
  cmd: string,
  cwd: string,
  timeoutMs: number,
): Promise<{ exit: number | null; stdout: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    exec(cmd, { cwd, timeout: timeoutMs }, (err, stdout, stderr) => {
      const combined = `${stdout ?? ''}${stderr ?? ''}`;
      if (!err) {
        resolve({ exit: 0, stdout: combined, timedOut: false });
        return;
      }
      // Node kills the child itself when the timeout fires (error.killed).
      // A kill by any signal is treated as TIMEOUT: under this runner the
      // timeout is the only kill source, and conflating a killed process
      // with a judged exit code would be fail-open.
      const timedOut = err.killed === true || typeof err.signal === 'string';
      const exit = timedOut || typeof err.code !== 'number' ? null : err.code;
      resolve({ exit, stdout: combined, timedOut });
    });
  });
}

/**
 * Execute the verification commands of a compiled bundle against `dir`.
 *
 * Takes the ALREADY-COMPILED bundle (the CLI compiles first — compile failure
 * is a usage-class exit that never reaches this core). Tasks run in bundle
 * order, a task's verification entries in array order, one command at a time.
 * An evidence-write failure (permissions, full disk) throws for the wrapper
 * to report as exit 2 — an environment failure, never a spec judgement.
 */
export async function runChecks(
  bundle: SpecBundle,
  dir: string,
  opts: RunChecksOptions,
): Promise<RunChecksResult> {
  const selected = opts.task ? bundle.tasks.filter((t) => t.task_id === opts.task) : bundle.tasks;
  if (opts.task !== undefined && selected.length === 0) {
    return { code: 2, outcomes: [], evidenceFiles: [] };
  }

  const execFn = opts.exec ?? execCommand;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const outcomes: CheckOutcome[] = [];
  const evidenceFiles: string[] = [];

  for (const task of selected) {
    const taskOutcomes: CheckOutcome[] = [];
    for (const entry of task.verification) {
      const expectedExit = parseExpect(entry.expect);

      if (expectedExit === null) {
        // Fail-closed, dry included (BACK-004): an unjudgeable expectation is
        // a FAILURE even in the dry preview — never a silent DRY row — and
        // under --yes the command is NEVER executed.
        taskOutcomes.push({
          taskId: task.task_id,
          command: entry.command,
          expect: entry.expect,
          expectedExit: null,
          actualExit: null,
          status: 'UNPARSEABLE-EXPECT',
          durationMs: 0,
          outputTail: '',
        });
        continue;
      }

      if (!opts.yes) {
        taskOutcomes.push({
          taskId: task.task_id,
          command: entry.command,
          expect: entry.expect,
          expectedExit,
          actualExit: null,
          status: 'DRY',
          durationMs: 0,
          outputTail: '',
        });
        continue;
      }

      const startedAt = Date.now();
      const result = await execFn(entry.command, dir, timeoutMs);
      const status: CheckOutcome['status'] = result.timedOut
        ? 'TIMEOUT'
        : result.exit === expectedExit
          ? 'PASS'
          : 'FAIL';
      taskOutcomes.push({
        taskId: task.task_id,
        command: entry.command,
        expect: entry.expect,
        expectedExit,
        actualExit: result.exit,
        status,
        durationMs: Date.now() - startedAt,
        // SEC-004: redact BEFORE keeping — memory and disk share one trail.
        outputTail: tail(redactSecrets(result.stdout)),
      });
    }
    outcomes.push(...taskOutcomes);

    if (opts.yes && taskOutcomes.length > 0) {
      evidenceFiles.push(await writeEvidence(dir, task.task_id, opts.nowIso, taskOutcomes));
    }
  }

  const anyFailure = outcomes.some((o) => o.status !== 'PASS' && o.status !== 'DRY');
  return { code: anyFailure ? 1 : 0, outcomes, evidenceFiles };
}

/** Last {@link OUTPUT_TAIL_LIMIT} chars of the combined output. */
function tail(text: string): string {
  return text.length <= OUTPUT_TAIL_LIMIT ? text : text.slice(text.length - OUTPUT_TAIL_LIMIT);
}

/**
 * The run id in an evidence file name: `<task>-check-<compact ISO>-<seq>.json`
 * where `<compact ISO>` is the INJECTED nowIso with `-.:` stripped (so the
 * name sorts chronologically and stays filesystem-clean) and `<seq>` is a
 * zero-padded counter bumped while the name is taken. Deterministic from the
 * injected clock + task id + directory state — no wall clock, no randomness
 * (the repo-wide boundary-clock contract).
 */
function evidenceRunName(evidenceDir: string, taskId: string, nowIso: string): string {
  const compactIso = nowIso.replace(/[-:.]/g, '');
  for (let seq = 1; ; seq++) {
    const name = `${taskId}-check-${compactIso}-${String(seq).padStart(3, '0')}.json`;
    if (!existsSync(join(evidenceDir, name))) return name;
  }
}

/**
 * Write ONE run's evidence for one task and return the file path.
 *
 * IMMUTABLE + RUN-ADDRESSED (SEC-004): every call writes a NEW file (a fresh
 * name picked under the per-root lock) — a rerun never overwrites the
 * previous audit trail, so a later PASS cannot erase an earlier failure.
 *
 * MODE 0600 (SEC-004): created owner-only (see EVIDENCE_FILE_MODE) — output
 * tails may contain secrets even after redaction (best-effort, not a
 * guarantee).
 *
 * CONTAINMENT (SEC-003): `spec` and `spec/evidence` must be REAL directories
 * (a symlink refuses the write, naming the link) and the evidence dir must
 * resolve inside the resolved spec root. Checked BEFORE any directory is
 * created, so a hostile tree sees zero writes.
 *
 * ATOMICITY (DATA-001): the file is staged and swapped into place with a
 * rename under the per-root revision lock — the write is all-or-nothing.
 */
async function writeEvidence(
  dir: string,
  taskId: string,
  nowIso: string,
  outcomes: CheckOutcome[],
): Promise<string> {
  // SEC-003, in order: verify spec/ and evidence/ BEFORE creating anything
  // through them. The pre-mkdir walk catches a DANGLING evidence symlink
  // (mkdir recursive would otherwise create the target through the link);
  // the post-mkdir walk catches a link to an existing directory.
  assertNoSymlinkBelow(dir, ['spec']);
  const evidenceDir = join(dir, 'spec', 'evidence');
  assertNoSymlinkBelow(dir, ['spec', 'evidence']);
  mkdirSync(evidenceDir, { recursive: true });
  assertNoSymlinkBelow(dir, ['spec', 'evidence']);
  const rootReal = realpathSync(dir);
  const evidenceReal = realpathSync(evidenceDir);
  if (!isInside(rootReal, evidenceReal)) {
    throw new PathEscapeError(
      evidenceDir,
      `resolves to ${evidenceReal}, outside the spec root ${rootReal}`,
    );
  }

  const lock = acquireSpecRootLock(dir, nowIso);
  try {
    const name = evidenceRunName(evidenceDir, taskId, nowIso);
    swapFilesAtomically(evidenceDir, [
      {
        name,
        mode: EVIDENCE_FILE_MODE,
        content: {
          task_id: taskId,
          checkedAt: nowIso,
          checks: outcomes.map((o) => ({
            command: o.command,
            expect: o.expect,
            expectedExit: o.expectedExit,
            actualExit: o.actualExit,
            status: o.status,
            durationMs: o.durationMs,
            outputTail: o.outputTail,
          })),
        },
      },
    ]);
    return join(evidenceDir, name);
  } finally {
    lock.release();
  }
}
