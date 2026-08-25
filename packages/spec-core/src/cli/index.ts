import { cmdCompile } from './commands/compile';
import { cmdLint } from './commands/lint';
import { cmdFreeze } from './commands/freeze';
import { cmdVerify } from './commands/verify';
import { cmdChange } from './commands/change';
import { cmdTrace } from './commands/trace';
import { cmdPlan } from './commands/plan';
import { cmdInit } from './commands/init';
import { cmdCheck } from './commands/check';

const USAGE = `usage: lco <command> <dir> [args]

commands:
  compile <dir>                compile and validate the spec/ tree under <dir>
  lint <dir>                   compile + lint; prints a rule/severity/path/message table
  freeze <dir>                 gate-checked freeze; rewrites spec/manifest.json on success
  verify <dir>                 re-hash frozen sections and compare with manifest.artifact_hashes
  change <dir> <changeset.json>
                               apply a changeset to a FROZEN spec: bumps spec_version,
                               returns the spec to state draft, rewrites the changed
                               spec/ sections, then re-lints (new lint errors -> exit 1)
  trace <dir>                  traceability report (informational, exit 0): per-edge-kind
                               counts, per-requirement task links (TASK ✓test / ✗no-test-link),
                               orphan requirements (the L02 view), and coverage summary
  plan <dir> [--json]          topological execution plan (level-wise Kahn; ties within a
                               level broken lexicographically by task_id): numbered rows with
                               complexity, depends_on, verification, permitted_scope, and a
                               ready-now line of level-0 tasks; unknown depends_on references
                               warn but do not block; cyclic dependencies -> exit 1 with the
                               unresolvable tasks listed; --json emits machine-readable
                               {"order":[...],"tasks":{id:{title,complexity,depends_on,
                               verification,permitted_scope}}}
  init <dir> [--profile p-mini|p-standard] [--name <name>]
                               scaffold a WORKING minimal EXAMPLE spec/ under <dir> (defaults:
                               p-mini, my-project) — it compiles, lints clean, and freezes
                               as-is; replace the EXAMPLE content with your own. Refuses
                               (exit 2) if <dir>/spec already exists
  check <dir> [--task TASK-0001] [--yes] [--timeout-ms 60000]
                               run TaskContract verification commands. DRY RUN by default:
                               without --yes NOTHING is executed (status DRY, exit 0, the
                               table previews what --yes would run). With --yes each command
                               executes (cwd <dir>, killed at --timeout-ms, default 60000)
                               and its exit code is compared to the first 'exit N' in the
                               expect description — an expect without a judgeable 'exit N'
                               is UNPARSEABLE-EXPECT and is never executed (fail-closed).
                               Evidence per task: spec/evidence/<TASK-ID>-check.json.
                               Exit 0 all PASS/DRY, 1 any FAIL/TIMEOUT/UNPARSEABLE

changeset template (all three lists are optional; patch keys are strict — typos are rejected):
  {
    "id": "CP-0001",
    "rationale": "why this change is needed",
    "modified_tasks": [
      { "task_id": "TASK-0001", "patch": { "title": "Updated title" } }
    ],
    "removed_task_ids": ["TASK-0003"],
    "added_requirements": [
      { "id": "REQ-0009", "statement": "The system shall ...", "priority": "must",
        "evidence": ["E-0001"], "acceptance_refs": ["TST-0001"] }
    ]
  }

exit codes: 0 success, 1 lint/freeze/drift/check failure, 2 usage or schema error`;

const COMMANDS = [
  'compile',
  'lint',
  'freeze',
  'verify',
  'change',
  'trace',
  'plan',
  'init',
  'check',
] as const;
type Command = (typeof COMMANDS)[number];
type SingleDirCommand = Exclude<Command, 'change' | 'init' | 'plan' | 'check'>;
type InitProfile = 'p-mini' | 'p-standard';

type ParseResult =
  | { error: string }
  | { command: SingleDirCommand; dir: string }
  | { command: 'change'; dir: string; changesetPath: string }
  | { command: 'plan'; dir: string; json: boolean }
  | { command: 'init'; dir: string; profile: InitProfile; name: string }
  | { command: 'check'; dir: string; task?: string; yes: boolean; timeoutMs?: number };

function parseArgs(argv: string[]): ParseResult {
  if (argv.length === 0) {
    return { error: 'missing command' };
  }
  const [command, ...rest] = argv;
  if (!(COMMANDS as readonly string[]).includes(command)) {
    return { error: `unknown command: ${command}` };
  }
  if (rest.length === 0) {
    return { error: `missing <dir> argument for '${command}'` };
  }
  if (command === 'change') {
    if (rest.length === 1) {
      return { error: "missing <changeset.json> argument for 'change'" };
    }
    if (rest.length > 2) {
      return {
        error: `unexpected extra arguments after <changeset.json>: ${rest.slice(2).join(' ')}`,
      };
    }
    return { command: 'change', dir: rest[0], changesetPath: rest[1] };
  }
  if (command === 'plan') {
    const [dir, ...flags] = rest;
    let json = false;
    for (const flag of flags) {
      if (flag === '--json') {
        json = true;
      } else {
        return { error: `unexpected argument for 'plan': ${flag}` };
      }
    }
    return { command: 'plan', dir, json };
  }
  if (command === 'init') {
    const [dir, ...flags] = rest;
    let profile: InitProfile = 'p-mini';
    let name = 'my-project';
    for (let i = 0; i < flags.length; i++) {
      const flag = flags[i];
      if (flag === '--profile') {
        const value = flags[++i];
        if (value !== 'p-mini' && value !== 'p-standard') {
          return {
            error: `invalid --profile ${String(value)}: expected p-mini or p-standard`,
          };
        }
        profile = value;
      } else if (flag === '--name') {
        const value = flags[++i];
        if (value === undefined || value === '') {
          return { error: 'missing value for --name' };
        }
        name = value;
      } else {
        return { error: `unexpected argument for 'init': ${flag}` };
      }
    }
    return { command: 'init', dir, profile, name };
  }
  if (command === 'check') {
    const [dir, ...flags] = rest;
    let task: string | undefined;
    let yes = false;
    let timeoutMs: number | undefined;
    for (let i = 0; i < flags.length; i++) {
      const flag = flags[i];
      if (flag === '--task') {
        const value = flags[++i];
        if (value === undefined || value === '') {
          return { error: 'missing value for --task' };
        }
        task = value;
      } else if (flag === '--yes') {
        yes = true;
      } else if (flag === '--timeout-ms') {
        const value = flags[++i];
        const n = Number(value);
        if (!Number.isInteger(n) || n <= 0) {
          return {
            error: `invalid --timeout-ms ${String(value)}: expected a positive integer`,
          };
        }
        timeoutMs = n;
      } else {
        return { error: `unexpected argument for 'check': ${flag}` };
      }
    }
    return { command: 'check', dir, task, yes, timeoutMs };
  }
  if (rest.length > 1) {
    return { error: `unexpected extra arguments after <dir>: ${rest.slice(1).join(' ')}` };
  }
  return { command: command as SingleDirCommand, dir: rest[0] };
}

/**
 * Functional CLI core: never calls process.exit — the exit code is returned.
 *   0 success, 1 lint/freeze/drift failure, 2 usage/schema error.
 *
 * Every case is a thin wrapper over a pure command core in commands/: print
 * the core's structured output, return the core's code. The clock is read
 * HERE only (per call) and injected as nowIso — the cores stay deterministic.
 */
export async function runCli(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if ('error' in parsed) {
    console.error(`lco: ${parsed.error}`);
    console.error(USAGE);
    return 2;
  }

  switch (parsed.command) {
    case 'compile': {
      const result = await cmdCompile(parsed.dir);
      console.log(result.output);
      return result.code;
    }
    case 'lint': {
      const result = await cmdLint(parsed.dir);
      console.log(result.output);
      return result.code;
    }
    case 'freeze': {
      const result = await cmdFreeze(parsed.dir, new Date().toISOString());
      console.log(result.output);
      return result.code;
    }
    case 'verify': {
      const result = await cmdVerify(parsed.dir);
      console.log(result.output);
      return result.code;
    }
    case 'change': {
      // CLI boundary: the clock is read HERE only and injected as nowIso —
      // the command core stays deterministic (same pattern as freeze).
      const result = await cmdChange(parsed.dir, parsed.changesetPath, new Date().toISOString());
      console.log(result.summary);
      for (const line of result.details) {
        console.log(`  ${line}`);
      }
      return result.code;
    }
    case 'trace': {
      const result = await cmdTrace(parsed.dir);
      console.log(result.report);
      return result.code;
    }
    case 'plan': {
      const result = await cmdPlan(parsed.dir, { json: parsed.json });
      console.log(result.output);
      return result.code;
    }
    case 'check': {
      // CLI boundary: the clock is read HERE only and injected as nowIso
      // (same pattern as freeze/change/init) — the command core stays
      // deterministic. Evidence-write failures throw out of the core and
      // surface here as exit 2 (environment failure, like init's writes).
      let result;
      try {
        result = await cmdCheck(parsed.dir, {
          task: parsed.task,
          yes: parsed.yes,
          timeoutMs: parsed.timeoutMs,
          nowIso: new Date().toISOString(),
        });
      } catch (err) {
        console.error(`lco: check failed: ${(err as Error).message}`);
        return 2;
      }
      console.log(result.output);
      return result.code;
    }
    case 'init': {
      // CLI boundary: the clock is read HERE only and injected as nowIso
      // (same pattern as freeze/change) — the command core stays deterministic.
      let result;
      try {
        result = await cmdInit(parsed.dir, {
          profile: parsed.profile,
          name: parsed.name,
          nowIso: new Date().toISOString(),
        });
      } catch (err) {
        console.error(`lco: init failed: ${(err as Error).message}`);
        return 2;
      }
      if (result.code === 2) {
        console.log(
          `refusing to overwrite existing spec/ at ${parsed.dir}: ` +
            `remove it first or choose another directory`,
        );
        return 2;
      }
      console.log(
        `initialized ${parsed.dir}/spec (profile ${parsed.profile}, ` +
          `${parsed.name}) with ${result.files.length} section files:`,
      );
      for (const file of result.files) {
        console.log(`  ${file}`);
      }
      console.log(
        'the scaffold is a WORKING EXAMPLE spec: it compiles, lints clean, and freezes ' +
          'as-is — replace every EXAMPLE entry with your own content',
      );
      return 0;
    }
  }
}

// Bin entry point (`lco` -> dist/cli/index.js). Guarded so importing runCli
// (tests, library consumers) has no side effects.
if (typeof require !== 'undefined' && require.main === module) {
  void runCli(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err: unknown) => {
      console.error(err);
      process.exit(2);
    },
  );
}
