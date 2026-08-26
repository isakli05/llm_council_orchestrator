#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cmdCompile } from './commands/compile';
import { cmdLint } from './commands/lint';
import { cmdFreeze } from './commands/freeze';
import { cmdVerify } from './commands/verify';
import { cmdChange } from './commands/change';
import { cmdTrace } from './commands/trace';
import { cmdPlan } from './commands/plan';
import { cmdInit } from './commands/init';
import { cmdCheck } from './commands/check';
import { cmdGenerate } from './commands/generate';

const USAGE = `usage: lco <command> <dir> [args]
       lco --help | -h | --version | <command> --help

options:
  --help, -h       print this overview (or the command's own help, with
                   \`lco <command> --help\`) to stdout and exit 0
  --version        print the lco-spec package version to stdout and exit 0

commands:
  compile <dir>                compile and validate the spec/ tree under <dir>
  lint <dir>                   compile + lint; prints a rule/severity/path/message table
  freeze <dir>                 gate-checked freeze; rewrites spec/manifest.json on success
  verify <dir>                 re-hash frozen sections and compare with manifest.artifact_hashes
  change <dir> <changeset.json>
                               apply a changeset to a FROZEN spec: validates the complete
                               candidate (compile + lint) BEFORE persisting, then bumps
                               spec_version, returns the spec to state draft and atomically
                               rewrites the changed spec/ sections — a lint-invalid change
                               exits 1 with NOTHING written (the frozen spec is untouched
                               and the same changeset stays retryable)
  trace <dir>                  traceability report (informational, exit 0): per-edge-kind
                               counts, per-requirement task links (TASK ✓test / ✗no-test-link),
                               orphan requirements (the L02 view), and coverage summary
  plan <dir> [--json]          topological execution plan (level-wise Kahn; ties within a
                               level broken lexicographically by task_id): numbered rows with
                               complexity, depends_on, verification, permitted_scope, and a
                               ready-now line of level-0 tasks. Requires a lint-clean
                               bundle: cyclic dependencies -> exit 1 with the unresolvable
                               tasks listed; any other lint error refuses (exit 2) — an
                               unknown depends_on reference is named in the refusal (run
                               \`lco lint\`); --json emits machine-readable
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
  generate <dir> --intent <text> | --intent-file <path>
                               [--variant single|council] [--profile p-mini|p-standard]
                               compile a natural-language intent into a spec/ draft via
                               a live LLM (requires LCO_LLM_BASE_URL, LCO_LLM_API_KEY and
                               LCO_LLM_MODEL env vars; fails closed without them).
                               Defaults: variant council, profile p-standard. COST NOTE:
                               council = 3 LLM calls (classifier + proposal + judge),
                               single = 1 call — council costs 3x. The evidence gate
                               decides: blocked intent -> exit 1 with reasons, nothing
                               written; lint-clean spec -> spec/ section files written,
                               exit 0. Refuses (exit 2) if <dir>/spec already exists;
                               --intent and --intent-file are mutually exclusive.

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

exit codes: 0 success, 1 lint/freeze/drift/check/gate failure, 2 usage or schema error`;

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
  'generate',
] as const;
type Command = (typeof COMMANDS)[number];
type SingleDirCommand = Exclude<Command, 'change' | 'init' | 'plan' | 'check' | 'generate'>;
type InitProfile = 'p-mini' | 'p-standard';
type GenerateVariant = 'single' | 'council';

type ParseResult =
  | { error: string }
  | { help: true }
  | { version: true }
  | { commandHelp: Command }
  | { command: SingleDirCommand; dir: string }
  | { command: 'change'; dir: string; changesetPath: string }
  | { command: 'plan'; dir: string; json: boolean }
  | { command: 'init'; dir: string; profile: InitProfile; name: string }
  | { command: 'check'; dir: string; task?: string; yes: boolean; timeoutMs?: number }
  | {
      command: 'generate';
      dir: string;
      /** Exactly one of intent/intentFile is present (parseArgs enforces it). */
      intent?: string;
      intentFile?: string;
      variant: GenerateVariant;
      profile: InitProfile;
    };

function parseArgs(argv: string[]): ParseResult {
  if (argv.length === 0) {
    return { error: 'missing command' };
  }
  const [command, ...rest] = argv;
  if (command === '--help' || command === '-h') {
    return { help: true };
  }
  if (command === '--version') {
    return { version: true };
  }
  if (!(COMMANDS as readonly string[]).includes(command)) {
    return { error: `unknown command: ${command}` };
  }
  // UX-002: --help/-h after a KNOWN command wins over everything else and is
  // checked BEFORE any validation of that command's arguments — `lco init
  // --help` prints help and exits 0; the flag is never consumed as a <dir>
  // name (the old behavior literally scaffolded a spec into ./--help/).
  // An unknown command still falls through to the usage error above.
  if (rest.includes('--help') || rest.includes('-h')) {
    // Same cast idiom as the SingleDirCommand return below: COMMANDS.includes
    // above guarantees the literal, but does not narrow `string` for TS.
    return { commandHelp: command as Command };
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
  if (command === 'generate') {
    const [dir, ...flags] = rest;
    let intent: string | undefined;
    let intentFile: string | undefined;
    let variant: GenerateVariant = 'council';
    let profile: InitProfile = 'p-standard';
    for (let i = 0; i < flags.length; i++) {
      const flag = flags[i];
      if (flag === '--intent') {
        const value = flags[++i];
        if (value === undefined || value === '') {
          return { error: 'missing value for --intent' };
        }
        intent = value;
      } else if (flag === '--intent-file') {
        const value = flags[++i];
        if (value === undefined || value === '') {
          return { error: 'missing value for --intent-file' };
        }
        intentFile = value;
      } else if (flag === '--variant') {
        const value = flags[++i];
        if (value !== 'single' && value !== 'council') {
          return { error: `invalid --variant ${String(value)}: expected single or council` };
        }
        variant = value;
      } else if (flag === '--profile') {
        const value = flags[++i];
        if (value !== 'p-mini' && value !== 'p-standard') {
          return {
            error: `invalid --profile ${String(value)}: expected p-mini or p-standard`,
          };
        }
        profile = value;
      } else {
        return { error: `unexpected argument for 'generate': ${flag}` };
      }
    }
    if (intent !== undefined && intentFile !== undefined) {
      return { error: '--intent and --intent-file are mutually exclusive: pass exactly one' };
    }
    if (intent === undefined && intentFile === undefined) {
      return { error: 'missing intent: pass --intent <text> or --intent-file <path>' };
    }
    return { command: 'generate', dir, intent, intentFile, variant, profile };
  }
  if (rest.length > 1) {
    return { error: `unexpected extra arguments after <dir>: ${rest.slice(1).join(' ')}` };
  }
  return { command: command as SingleDirCommand, dir: rest[0] };
}

/**
 * Command-specific help (UX-002): the command's own block, extracted from
 * USAGE at run time — USAGE stays the single hand-written source of truth,
 * so the per-command text can never drift from the overview. A block starts
 * at `  <command> ` and runs through its continuation lines (indented 7+
 * spaces); the next command's line, a section header, or a blank line ends it.
 */
function commandHelp(command: Command): string {
  const lines = USAGE.split('\n');
  const start = lines.findIndex((line) => line.startsWith(`  ${command} `));
  if (start === -1) {
    return USAGE; // defensive: USAGE lost the entry — fall back to the overview
  }
  let end = start + 1;
  while (end < lines.length && /^ {7,}\S/.test(lines[end])) {
    end++;
  }
  return (
    `usage: lco ${lines.slice(start, end).join('\n').trimStart()}\n\n` +
    '(run `lco --help` for the full command overview)'
  );
}

/**
 * Reads the version from the package's own package.json at RUN TIME — never
 * hardcoded, so a version bump needs no CLI change. src/cli and dist/cli sit
 * at the same depth under the package root, so the relative path holds both
 * for the repo build/test and for a packed install (npm always ships
 * package.json next to dist/).
 */
async function readVersion(): Promise<string> {
  const raw = await readFile(join(__dirname, '../../package.json'), 'utf8');
  const version = (JSON.parse(raw) as { version?: unknown }).version;
  if (typeof version !== 'string' || version === '') {
    throw new Error('package.json has no usable version field');
  }
  return version;
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
  if ('help' in parsed) {
    console.log(USAGE);
    return 0;
  }
  if ('version' in parsed) {
    console.log(await readVersion());
    return 0;
  }
  if ('commandHelp' in parsed) {
    console.log(commandHelp(parsed.commandHelp));
    return 0;
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
      // A live revision lock (LockHeldError) or an atomic-swap IO failure
      // THROWS out of the core (environment failure) — surface it as the
      // one-line exit-2 handler like init/check/generate, not the top-level
      // raw error dump.
      let result;
      try {
        result = await cmdFreeze(parsed.dir, new Date().toISOString());
      } catch (err) {
        console.error(`lco: freeze failed: ${(err as Error).message}`);
        return 2;
      }
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
    case 'generate': {
      // Wrapper edge: resolve --intent-file to the intent text HERE (IO stays
      // at the boundary); an unreadable or empty file is a usage error (2).
      let intent: string;
      if (parsed.intentFile !== undefined) {
        let raw: string;
        try {
          raw = await readFile(parsed.intentFile, 'utf8');
        } catch (err) {
          console.error(`lco: cannot read --intent-file ${parsed.intentFile}: ${(err as Error).message}`);
          return 2;
        }
        intent = raw.trim();
        if (intent === '') {
          console.error(`lco: --intent-file ${parsed.intentFile} is empty`);
          return 2;
        }
      } else {
        intent = parsed.intent!;
      }

      // CLI boundary: the clock is read HERE only and injected as nowIso
      // (same pattern as freeze/change/init/check). cmdGenerate resolves
      // createHttpLlm() itself and THROWS fail-closed when LCO_LLM_* env is
      // missing — that throw lands here as exit 2 with the env message.
      let result;
      try {
        result = await cmdGenerate(parsed.dir, {
          intent,
          variant: parsed.variant,
          profile: parsed.profile,
          nowIso: new Date().toISOString(),
        });
      } catch (err) {
        console.error(`lco: generate failed: ${(err as Error).message}`);
        return 2;
      }
      console.log(result.output);
      return result.code;
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
