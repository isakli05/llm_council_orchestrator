import { resolve } from 'node:path';
import { runEvalAll } from './report';

/**
 * Executable entry for the evidence gate: `node dist/eval/run-eval.js`.
 *
 * Thin by design — argument parsing, live-env existence check, exit-code
 * mapping, and stdout lines live here; every piece of evidence computation
 * stays in ./report (runEvalAll) so the gate cannot be influenced by the
 * entry script.
 *
 * Exit codes: 0 PASS or PASS_DETERMINISTIC_ONLY, 1 FAIL, 2 usage or
 * configuration error (live variant without the LCO_LLM_* env refuses to
 * run half-configured rather than falling back to mock).
 */

const USAGE = `usage: run-eval [--variant mock|live] [--repeats <n>] [--report <path>]

options:
  --variant mock|live  eval variant (default: mock; mock reads no env, no keys)
  --repeats <n>        runs per (task, variant), >= 1 (default: 1; mock repeats
                       are deterministic-by-construction — spread matters live)
  --report <path>      gate report path (default: <repo>/audit-output/spec-core-gate-report.md)

exit codes: 0 PASS or PASS_DETERMINISTIC_ONLY, 1 FAIL, 2 usage or configuration error`;

const LIVE_ENV_VARS = ['LCO_LLM_BASE_URL', 'LCO_LLM_API_KEY', 'LCO_LLM_MODEL'] as const;

/**
 * Default report target: the repo-root audit-output/ directory (the
 * experiment's audit trail). dist/eval/run-eval.js sits four levels below the
 * repo root (eval -> dist -> spec-core -> packages), so ../../../.. resolves
 * to the root from the built location. Only names are read from the env —
 * values are never logged.
 */
export const DEFAULT_REPORT_PATH = resolve(
  __dirname,
  '../../../..',
  'audit-output',
  'spec-core-gate-report.md',
);

type ParsedArgs =
  | { error: string }
  | { variant: 'mock' | 'live'; repeats: number; reportPath: string };

export function parseArgs(argv: string[]): ParsedArgs {
  let variant: 'mock' | 'live' = 'mock';
  let repeats = 1;
  let reportPath: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--variant') {
      const value = argv[i + 1];
      if (value !== 'mock' && value !== 'live') {
        return {
          error:
            value === undefined
              ? '--variant expects mock or live'
              : `--variant expects mock or live, got: ${value}`,
        };
      }
      variant = value;
      i += 1;
    } else if (arg === '--repeats') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--') || !/^\d+$/.test(value)) {
        return { error: `--repeats expects an integer >= 1, got: ${value ?? 'nothing'}` };
      }
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1) {
        return { error: `--repeats expects an integer >= 1, got: ${value}` };
      }
      repeats = n;
      i += 1;
    } else if (arg === '--report') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        return { error: '--report expects a path' };
      }
      reportPath = value;
      i += 1;
    } else {
      return { error: `unknown argument: ${arg}` };
    }
  }

  return { variant, repeats, reportPath: reportPath ?? DEFAULT_REPORT_PATH };
}

/** Which of the three live-mode env vars are missing/blank (names only; values never leave here). */
export function missingLiveEnv(env: NodeJS.ProcessEnv): string[] {
  return LIVE_ENV_VARS.filter((name) => {
    const value = env[name];
    return value === undefined || value.trim() === '';
  });
}

/**
 * Functional entry core: never calls process.exit — the exit code is
 * returned, mirroring runCli in ../cli. `env` is injectable so tests never
 * touch the real environment.
 */
export async function runEvalCli(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  const parsed = parseArgs(argv);
  if ('error' in parsed) {
    console.error(`run-eval: ${parsed.error}`);
    console.error(USAGE);
    return 2;
  }

  if (parsed.variant === 'live') {
    const missing = missingLiveEnv(env);
    if (missing.length > 0) {
      console.error(
        `run-eval: live variant requires ${LIVE_ENV_VARS.join(', ')} to be set; missing: ${missing.join(', ')}`,
      );
      console.error(
        'run-eval: refusing to run half-configured — set them explicitly, e.g. ' +
          'LCO_LLM_BASE_URL=... LCO_LLM_API_KEY=... LCO_LLM_MODEL=... node dist/eval/run-eval.js --variant live',
      );
      return 2;
    }
  }

  // Live with env present lets createHttpLlm throw naturally inside
  // runEvalAll on any deeper misconfiguration — never swallowed here.
  const verdict = await runEvalAll({
    variant: parsed.variant,
    repeats: parsed.repeats,
    reportPath: parsed.reportPath,
  });

  console.log(`VERDICT: ${verdict}`);
  console.log(`report: ${parsed.reportPath}`);
  return verdict === 'FAIL' ? 1 : 0;
}

// Bin entry point (node dist/eval/run-eval.js). Guarded so importing
// runEvalCli (tests, library consumers) has no side effects.
if (typeof require !== 'undefined' && require.main === module) {
  void runEvalCli(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err: unknown) => {
      console.error(err);
      process.exit(2);
    },
  );
}
