import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { EVAL_TASKS } from './tasks';
import { runPipeline } from './runner';
import type { PipelineVariant } from './runner';
import { scoreRun } from './score';
import type { RunScore } from './score';
import { createMockLlm } from './llm/mock';
import { createHttpLlm } from './llm/http';
import { buildMockScripts, captureBadFixtures, renderGateReport, gateVerdict } from './report';
import type { GateVerdict } from './report';
import { verifyCorpusLock } from './corpus-lock';
import { missingLiveEnv } from './run-eval';
import { EMITTED_SCHEMA, aggregateEmitted, renderAggregation } from './aggregate';
import type { EmittedOutcome } from './aggregate';

/**
 * LIVE-EXPERIMENT DRIVER (the owner-authorized run tooling; deterministic
 * code, no calls unless --variant live).
 *
 * Two modes:
 *
 *  RUN    live-experiment --variant mock|live --emit-dir <path>
 *                       [--run-index <n>] [--repeats <n>] [--report <path>]
 *         Runs the FULL corpus (all 20 tasks x {single, council}), scores
 *         every (task, variant, repeat) through the same runner/scorer the
 *         gate uses, and EMITS one JSON file per unit into --emit-dir with
 *         the full bundle + structured outcome + usage. Each file is written
 *         immediately after its run completes (crash-resilience: per-invocation
 *         repeats=1 keeps the blast radius of a crash to one unit, and every
 *         completed unit's artifacts persist on disk).
 *
 *  AGGREGATE  live-experiment --aggregate <dir1> <dir2> <dir3>
 *         Loads the emitted run directories (in the order given), re-bases
 *         repeat ordinals across directories, pairs greenfield units across
 *         variants exactly like sign-test's pairedOutcomes(), and prints the
 *         pre-registered signTest() verdict + cost totals (see ./aggregate.ts).
 *
 * The corpus lock is verified FIRST in run mode — the same pre-registration
 * enforcement every eval entrypoint applies. The mock variant reads no env
 * and no keys (deterministic plumbing verification only); live requires the
 * LCO_LLM_* environment (names checked here; values never logged).
 *
 * Exit codes (run mode): 0 PASS / PASS_DETERMINISTIC_ONLY, 1 FAIL, 2 usage or
 * configuration error. Aggregate mode: 0 with the report on stdout, 2 on
 * load/usage errors — the AGGREGATE exit code is NOT a claim verdict (the
 * sign-test criterion inside the report is).
 */

const USAGE = `usage: live-experiment --variant mock|live --emit-dir <path> [--run-index <n>] [--repeats <n>] [--report <path>]
       live-experiment --aggregate <dir1> <dir2> [<dir3> ...]

run mode:
  --variant mock|live  eval variant (mock reads no env, no keys; live requires LCO_LLM_*)
  --emit-dir <path>    directory for the emitted per-(task,variant,repeat) JSON files
  --run-index <n>      1-based ordinal of this invocation (recorded in each emitted file)
  --repeats <n>        runs per (task, variant), >= 1 (default 1 — per-invocation
                       repeats=1 is the pre-registered crash-resilient shape)
  --report <path>      gate report path for this invocation (default: <emit-dir>/gate-report.md)

aggregate mode:
  --aggregate <dirs>   two or more emitted run directories, in run order

exit codes: run — 0 PASS or PASS_DETERMINISTIC_ONLY, 1 FAIL, 2 usage/config;
            aggregate — 0 report printed, 2 usage/load error (never a claim verdict)`;

const MOCK_NOW = '2026-08-18T12:00:00Z'; // same fixed timestamp report.ts uses for mock evidence

export type ParsedExperimentArgs =
  | { error: string }
  | {
      mode: 'run';
      variant: 'mock' | 'live';
      emitDir: string;
      runIndex: number;
      repeats: number;
      reportPath: string;
    }
  | { mode: 'aggregate'; dirs: string[] };

export function parseExperimentArgs(argv: string[]): ParsedExperimentArgs {
  let variant: 'mock' | 'live' | undefined;
  let emitDir: string | undefined;
  let runIndex: number | undefined;
  let repeats = 1;
  let reportPath: string | undefined;
  let aggregate: string[] | undefined;

  const valueOf = (flag: string, i: number): string | undefined => {
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) {
      return undefined;
    }
    return v;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--aggregate') {
      const rest = argv.slice(i + 1);
      if (rest.length === 0 || rest.some((r) => r.startsWith('--'))) {
        return { error: '--aggregate expects one or more run directories' };
      }
      aggregate = rest;
      break;
    } else if (arg === '--variant') {
      const v = valueOf('--variant', i);
      if (v !== 'mock' && v !== 'live') {
        return { error: `--variant expects mock or live, got: ${v ?? 'nothing'}` };
      }
      variant = v;
      i += 1;
    } else if (arg === '--emit-dir') {
      const v = valueOf('--emit-dir', i);
      if (v === undefined) return { error: '--emit-dir expects a path' };
      emitDir = v;
      i += 1;
    } else if (arg === '--run-index') {
      const v = valueOf('--run-index', i);
      if (v === undefined || !/^[1-9]\d*$/.test(v)) {
        return { error: `--run-index expects an integer >= 1, got: ${v ?? 'nothing'}` };
      }
      runIndex = Number(v);
      i += 1;
    } else if (arg === '--repeats') {
      const v = valueOf('--repeats', i);
      if (v === undefined || !/^\d+$/.test(v) || Number(v) < 1) {
        return { error: `--repeats expects an integer >= 1, got: ${v ?? 'nothing'}` };
      }
      repeats = Number(v);
      i += 1;
    } else if (arg === '--report') {
      const v = valueOf('--report', i);
      if (v === undefined) return { error: '--report expects a path' };
      reportPath = v;
      i += 1;
    } else {
      return { error: `unknown argument: ${arg}` };
    }
  }

  if (aggregate !== undefined) {
    if (variant !== undefined || emitDir !== undefined || runIndex !== undefined || reportPath !== undefined || repeats !== 1) {
      return { error: '--aggregate cannot be combined with run-mode flags' };
    }
    return { mode: 'aggregate', dirs: aggregate };
  }

  if (variant === undefined) return { error: 'run mode requires --variant mock|live' };
  if (emitDir === undefined) return { error: 'run mode requires --emit-dir <path>' };
  return {
    mode: 'run',
    variant,
    emitDir,
    runIndex: runIndex ?? 1,
    repeats,
    reportPath: reportPath ?? resolve(emitDir, 'gate-report.md'),
  };
}

/** Filename of one emitted unit inside its run directory. */
export function emittedFileName(taskId: string, variant: PipelineVariant, repeat: number): string {
  return `${taskId}--${variant}--rep${repeat}.json`;
}

/**
 * Functional run core: full corpus x both variants x repeats, emitting one
 * JSON per unit. `nowIso` is injected (mock passes the fixed MOCK_NOW; the
 * CLI passes a real timestamp for live prompts only — the emitted files carry
 * no timestamps, so mock emissions are byte-deterministic).
 */
export async function runEmittingEval(opts: {
  variant: 'mock' | 'live';
  repeats: number;
  emitDir: string;
  runIndex: number;
  nowIso: string;
  /** Kept for interface completeness; the HTTP adapter reads process.env itself. */
  liveEnv?: NodeJS.ProcessEnv;
  /** undefined (default): <emit-dir>/gate-report.md; null: write no report. */
  reportPath?: string | null;
}): Promise<{ runs: RunScore[]; verdict: GateVerdict; emitDir: string; reportPath: string | null }> {
  // RESIDUAL PROD-003 (PART 2): every eval entrypoint verifies the freeze
  // before producing any evidence — this driver is no exception.
  verifyCorpusLock();

  mkdirSync(opts.emitDir, { recursive: true });
  const scripts = opts.variant === 'mock' ? buildMockScripts() : undefined;
  const httpLlm = opts.variant === 'live' ? createHttpLlm() : undefined; // reads process.env at creation, fail-closed

  const runs: RunScore[] = [];
  for (const task of EVAL_TASKS) {
    for (const variant of ['single', 'council'] as PipelineVariant[]) {
      for (let rep = 1; rep <= opts.repeats; rep += 1) {
        const llm =
          scripts !== undefined
            ? createMockLlm(scripts[variant], task.id) // fresh cursor per repeat
            : httpLlm!;
        const outcome = await runPipeline(task, variant, llm, opts.nowIso);
        const score = scoreRun(task, outcome, outcome.usage, rep);
        runs.push(score);

        const emitted: EmittedOutcome = {
          schema: EMITTED_SCHEMA,
          taskId: task.id as string,
          variant,
          repeat: rep,
          runIndex: opts.runIndex,
          task: {
            id: task.id as string,
            kind: task.kind,
            profile: task.profile,
            must_be_blocked: task.must_be_blocked,
          },
          outcome:
            outcome.kind === 'spec'
              ? { kind: 'spec', bundle: outcome.bundle, ...(outcome.councilDegraded ? { councilDegraded: true } : {}) }
              : { kind: 'blocked', reasons: outcome.reasons, ...(outcome.councilDegraded ? { councilDegraded: true } : {}) },
          score,
          usage: outcome.usage,
        };
        writeFileSync(
          resolve(opts.emitDir, emittedFileName(task.id, variant, rep)),
          `${JSON.stringify(emitted, null, 2)}\n`,
          'utf8',
        );
        // progress line per unit — the artifacts are already on disk
        console.log(
          `emitted ${task.id} ${variant} rep${rep}: ${outcome.kind}` +
            `${outcome.kind === 'blocked' ? ` (${outcome.reasons.length} reason(s))` : ''}` +
            ` intent=${score.intentPassed ? 'pass' : 'FAIL'} structural=${score.structuralPassed ? 'pass' : 'FAIL'}`,
        );
      }
    }
  }

  // the same fixture-gate evidence + verdict the standard gate report carries
  const badFixtureResults = captureBadFixtures();
  const input = {
    runs,
    badFixtureResults,
    driftCaught: badFixtureResults.filter((r) => r.expect === 'verify-drift').every((r) => r.caught),
    unresolvedFreezeRejected: badFixtureResults
      .filter((r) => r.expect === 'freeze-rejected')
      .every((r) => r.caught),
    repeats: opts.repeats,
    live: opts.variant === 'live',
  };
  const verdict = gateVerdict(input);

  let reportPath: string | null = null;
  if (opts.reportPath !== null) {
    reportPath = opts.reportPath ?? resolve(opts.emitDir, 'gate-report.md');
    const dir = dirname(reportPath);
    if (dir && dir !== '.') mkdirSync(dir, { recursive: true });
    writeFileSync(reportPath, renderGateReport(input), 'utf8');
  }

  return { runs, verdict, emitDir: opts.emitDir, reportPath };
}

/**
 * CLI entry core: never calls process.exit — the exit code is returned
 * (mirroring run-eval.ts). `env` is injectable so tests never touch the real
 * environment.
 */
export async function runExperimentCli(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
  nowIso: string = new Date().toISOString(),
): Promise<number> {
  const parsed = parseExperimentArgs(argv);
  if ('error' in parsed) {
    console.error(`live-experiment: ${parsed.error}`);
    console.error(USAGE);
    return 2;
  }

  if (parsed.mode === 'aggregate') {
    try {
      const aggregation = aggregateEmitted(parsed.dirs);
      console.log(renderAggregation(aggregation));
      return 0;
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      return 2;
    }
  }

  if (parsed.variant === 'live') {
    const missing = missingLiveEnv(env);
    if (missing.length > 0) {
      console.error(
        `live-experiment: live variant requires LCO_LLM_BASE_URL, LCO_LLM_API_KEY, LCO_LLM_MODEL to be set; missing: ${missing.join(', ')}`,
      );
      console.error('live-experiment: refusing to run half-configured — source the owner .env.local first');
      return 2;
    }
  }

  try {
    const { verdict, reportPath } = await runEmittingEval({
      variant: parsed.variant,
      repeats: parsed.repeats,
      emitDir: parsed.emitDir,
      runIndex: parsed.runIndex,
      nowIso: parsed.variant === 'live' ? nowIso : MOCK_NOW,
      liveEnv: env,
      reportPath: parsed.reportPath,
    });

    console.log(`VERDICT: ${verdict}`);
    console.log(`emit-dir: ${parsed.emitDir}`);
    console.log(`report: ${reportPath}`);
    return verdict === 'FAIL' ? 1 : 0;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 2;
  }
}

// Bin entry point (node dist/eval/live-experiment.js). Guarded so importing
// runExperimentCli (tests, library consumers) has no side effects.
if (typeof require !== 'undefined' && require.main === module) {
  void runExperimentCli(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err: unknown) => {
      console.error(err);
      process.exit(2);
    },
  );
}
