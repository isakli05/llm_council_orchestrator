/**
 * Pure CLI parsing/usage layer (split from index.ts, T23): the USAGE text,
 * the command grammar, and parseArgs — all pure functions of argv with no
 * process access (no env reads, no clock, no I/O). index.ts stays the thin
 * entry: env/file reads at the boundary, runCli dispatch, error wrapping.
 */
import {
  DEFAULT_GENERATE_VARIANT,
  normalizeIntent,
  MAX_INTENT_CHARS,
  MAX_INTENT_FILE_CHARS,
} from './commands/generate';
import {
  MAX_COMPLETIONS,
  worstCaseAttempts,
  DEFAULT_WALL_SLACK_MS,
} from '../eval/budget';
import {
  HTTP_MAX_ATTEMPTS_PER_COMPLETION,
  HTTP_REQUEST_TIMEOUT_MS,
  HTTP_BACKOFF_TOTAL_MS,
} from '../eval/llm/http';
import type { RunBudgetSpec } from '../eval/budget';

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
                               executes (cwd <dir>, killed at --timeout-ms, default 60000,
                               or at the 1 MiB per-stream output cap) and its exit code is
                               compared to the first 'exit N' in the expect description —
                               an expect without a judgeable 'exit N' is UNPARSEABLE-EXPECT
                               and is never executed (fail-closed). A killed command is
                               never judged on an exit code: timeout/signal death -> TIMEOUT,
                               output-cap overflow -> OUTPUT-CAP (distinct labels, both
                               fail-closed).
                               Evidence per task: spec/evidence/<TASK-ID>-check-<RUN>.json
                               (run-addressed, immutable, mode 0600; reruns never overwrite
                               earlier evidence; output tails are redacted best-effort).
                               Exit 0 all PASS/DRY, 1 any FAIL/TIMEOUT/OUTPUT-CAP/UNPARSEABLE
  generate <dir> --intent <text> | --intent-file <path>
                               [--variant single|council] [--profile p-mini|p-standard]
                               [--max-attempts N] [--max-tokens N] [--max-wall-ms N]
                               [--llm-profile <name>]
                               [--answers <file>] [--interactive] [--no-open]
                               compile a natural-language intent into a spec/ draft via
                               a live LLM (requires LCO_LLM_BASE_URL, LCO_LLM_API_KEY and
                               LCO_LLM_MODEL env vars; fails closed without them).
                               --llm-profile selects a NAMED profile from
                               <dir>/lco.config.json: providers (openai-compatible,
                               openrouter, routellm; api keys referenced by env-var
                               NAME, never stored) + per-role models — including
                               heterogeneous councils (classifier/proposal_a/
                               proposal_b/judge each with its own gateway+model) and
                               the decomposed topology (independent proposals A∥B →
                               judge; EXPERIMENTAL like all council generation).
                               Profile and --variant must agree; without the flag the
                               legacy LCO_LLM_* single-model path runs unchanged.
                               --answers <file> applies ONE headless clarification
                               round from a {"DEC-0000": "answer"} file (§12;
                               CI/scripts/reproducible runs).
                               --interactive opens the BROWSER clarification
                               workspace instead: LCO asks its unresolved-business
                               questions there (suggested options + consequence
                               previews + your own rules), re-checks the spec
                               after each round, shows a final Project Behavior
                               Review you can annotate with change requests, and
                               writes spec/ ONLY at your explicit approval
                               (loopback-only local server; token in the URL
                               fragment; nothing written on cancel/abandon;
                               --no-open skips launching a browser and prints
                               the URL). Mutually exclusive with --answers.
                               Works with every variant/profile/topology —
                               clarification is a product concern, not a
                               provider concern.
                               Defaults: variant ${DEFAULT_GENERATE_VARIANT}, profile
                               p-standard — council is explicit (--variant council).
                               COST ENVELOPE (an HTTP attempt is a request, NOT a
                               completion): each completion may cost up to
                               ${HTTP_MAX_ATTEMPTS_PER_COMPLETION} attempts (${HTTP_REQUEST_TIMEOUT_MS / 1000}s timeout each,
                               ${HTTP_BACKOFF_TOTAL_MS / 1000}s total backoff). Worst case: single
                               ${MAX_COMPLETIONS.single} completions x ${HTTP_MAX_ATTEMPTS_PER_COMPLETION} = ${worstCaseAttempts('single')} requests,
                               council ${MAX_COMPLETIONS.council} x ${HTTP_MAX_ATTEMPTS_PER_COMPLETION} = ${worstCaseAttempts('council')}. Run budgets abort the run
                               with BUDGET_EXCEEDED (nothing written) when total attempts,
                               tokens (in+out, provider-reported), or wall time cross the
                               cap; defaults are the envelope worst case (attempts +0,
                               wall +${DEFAULT_WALL_SLACK_MS / 1000}s) — override with --max-attempts,
                               --max-tokens, --max-wall-ms or LCO_GENERATE_MAX_ATTEMPTS,
                               LCO_GENERATE_MAX_TOKENS, LCO_GENERATE_MAX_WALL_MS. --intent
                               is trimmed and rejected when blank or over ${MAX_INTENT_CHARS}
                               chars BEFORE any paid call; --intent-file is the long-intent
                               path (trim + blank check + a ${MAX_INTENT_FILE_CHARS}-char
                               sanity ceiling, no inline cap). The evidence
                               gate decides: blocked intent -> exit 1 with reasons, nothing
                               written; lint-clean spec -> spec/ section files written,
                               exit 0. Refuses (exit 2) if <dir>/spec already exists;
                               --intent and --intent-file are mutually exclusive.
  doctor [dir] [--json]        runtime environment diagnostics (field tool; CLI-only,
                               no MCP tool): one line per check —
                               [name] ok/warn/fail/skip: detail — remedy: ... — and
                               NEVER an env VALUE or length, only set/unset. Checks:
                               node version (engines >=22), LCO_LLM_* provider env
                               (presence + validity; mock is the default adapter),
                               LCO_MCP_* consent flags (exactly '1' opts in),
                               LCO_GENERATE_MAX_* budget env, write/lock/atomic-
                               rename probe in <dir> (default: the current directory;
                               a probe file is created and removed — nothing else is
                               touched), spec/ compile summary when <dir>/spec exists,
                               dist bin self-check (shebang + exec mode; skipped
                               without dist/), generated/spec-schema.json freshness
                               (warn only). FAIL = broken capability (unwritable dir,
                               broken bins, non-compiling spec) -> exit 1; WARN =
                               unconfigured optional (live LLM env, budget overrides)
                               -> exit 0; --json emits {"checks":[{name,status,
                               detail,remedy?}...],"healthy":bool}
  models --provider <name> [--config <path>] [--json] [--limit N]

  renew <sub> <dir>            Legacy Renewal V1 (analysis + planning, no execution)
                               init <dir> --target <repo> · refresh · status [--json] ·
                               analyze (PAID — makes LLM calls) · review [--answers f |
                               --interactive] · plan [--strategy s --strategy-rationale t]
                               [--freeze] · export [--out f]
                               list a provider's CURRENT model catalogue (FREE
                               models endpoint only — one GET, no completion,
                               no retry). <name> is either a provider from
                               lco.config.json (--config path, default
                               ./lco.config.json) or a built-in: openrouter
                               (OPENROUTER_API_KEY) or routellm
                               (ABACUS_ROUTELLM_API_KEY). Prints exact API ids
                               — display names are never API ids — with
                               per-token pricing and context as reported;
                               Unknown = not reported (never 0). The catalogue
                               changes: use this, not stale doc screenshots.

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

profiles: p-mini and p-standard are the only selectable profiles. The schema's
  p-legacy (and p-critical) are EXPERIMENTAL, schema-only declarations: no
  transformation semantics exist, generate/init cannot select them, and the
  only path to a legacy spec is a hand-authored COMPLETE spec/legacy.json
  (an empty or partial legacy block is a schema error). Schema version
  policy: a spec/manifest.json spec_schema other than 'lco-spec/1.0' is
  rejected with a distinct error naming the fix — see the README section
  "Şema Sürümü ve Uyumluluk Politikası (lco-spec/1.x)"

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
  'doctor',
  'models',
  'renew',
] as const;
type Command = (typeof COMMANDS)[number];
type SingleDirCommand = Exclude<Command, 'change' | 'init' | 'plan' | 'check' | 'generate' | 'doctor' | 'models' | 'renew'>;
type InitProfile = 'p-mini' | 'p-standard';
type GenerateVariant = 'single' | 'council';

export type ParseResult =
  | { error: string }
  | { help: true }
  | { version: true }
  | { commandHelp: Command }
  | { renewSubHelp: (typeof RENEW_SUBS)[number] }
  | { command: SingleDirCommand; dir: string }
  | { command: 'change'; dir: string; changesetPath: string }
  | { command: 'plan'; dir: string; json: boolean }
  | { command: 'doctor'; dir: string; json: boolean }
  | { command: 'init'; dir: string; profile: InitProfile; name: string }
  | { command: 'check'; dir: string; task?: string; yes: boolean; timeoutMs?: number }
  | {
      command: 'models';
      /** A named provider from lco.config.json, or a built-in: openrouter|routellm. */
      provider: string;
      /** Config path for named providers (default ./lco.config.json at the boundary). */
      configPath?: string;
      json: boolean;
      limit?: number;
    }
  | {
      command: 'generate';
      dir: string;
      /** Exactly one of intent/intentFile is present (parseArgs enforces it). */
      intent?: string;
      intentFile?: string;
      variant: GenerateVariant;
      profile: InitProfile;
      /** Budget flag overrides (validated positive ints); env vars resolve at the runCli boundary. */
      budget?: RunBudgetSpec;
      /** Named LLM profile from <dir>/lco.config.json (§7); resolved at the runCli boundary. */
      llmProfile?: string;
      /** Answers file path for the clarification loop (§12); read at the runCli boundary. */
      answersFile?: string;
      /** EXPLICIT opt-in to the browser clarification workspace (owner spec 2026-09-01 §3). */
      interactive?: boolean;
      /** Suppress opening the browser for --interactive (URL still printed). */
      noOpen?: boolean;
    }
  | { command: 'renew'; renew: RenewParsedArgs };

export type RenewParsedArgs =
  | { sub: 'init'; dir: string; target: string; name?: string }
  | { sub: 'refresh'; dir: string }
  | { sub: 'status'; dir: string; json: boolean }
  | { sub: 'analyze'; dir: string; llmProfile?: string; budget?: { maxAttempts?: number; maxTokens?: number; maxWallMs?: number } }
  | { sub: 'review'; dir: string; answersFile?: string; interactive: boolean; noOpen: boolean }
  | { sub: 'plan'; dir: string; strategy?: string; strategyRationale?: string; freeze: boolean }
  | { sub: 'export'; dir: string; out?: string };

export function parseArgs(argv: string[]): ParseResult {
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
    // L-01: `renew <sub> --help` prints the SUBCOMMAND's own help (the
    // generic family block otherwise repeated stale `models` prose).
    if (command === 'renew' && (RENEW_SUBS as readonly string[]).includes(rest[0] ?? '')) {
      return { renewSubHelp: rest[0] as (typeof RENEW_SUBS)[number] };
    }
    // Same cast idiom as the SingleDirCommand return below: COMMANDS.includes
    // above guarantees the literal, but does not narrow `string` for TS.
    return { commandHelp: command as Command };
  }
  if (command === 'renew') {
    return parseRenew(rest);
  }
  // doctor is the one command whose <dir> is OPTIONAL (defaults to the
  // current directory); models takes no dir at all — every other command
  // keeps the missing-dir error.
  if (rest.length === 0 && command !== 'doctor' && command !== 'models') {
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
  if (command === 'doctor') {
    // `lco doctor` (cwd), `lco doctor <dir>`, `lco doctor --json`, and the
    // combinations; anything else is a usage error. A leading '--' token is
    // never taken as a directory name.
    let dir: string | undefined;
    let json = false;
    for (const arg of rest) {
      if (arg === '--json') {
        json = true;
      } else if (dir === undefined && !arg.startsWith('--')) {
        dir = arg;
      } else {
        return { error: `unexpected argument for 'doctor': ${arg}` };
      }
    }
    return { command: 'doctor', dir: dir ?? '.', json };
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
  if (command === 'models') {
    // `lco models --provider <name> [--config <path>] [--json] [--limit N]` —
    // the one command besides generate that talks to a network endpoint (the
    // FREE models listing; never a completion).
    let provider: string | undefined;
    let configPath: string | undefined;
    let json = false;
    let limit: number | undefined;
    for (let i = 0; i < rest.length; i++) {
      const flag = rest[i];
      if (flag === '--provider') {
        const value = rest[++i];
        if (value === undefined || value === '') {
          return { error: 'missing value for --provider' };
        }
        if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) {
          return { error: `invalid --provider ${value}: expected a provider name (letters, digits, . _ -)` };
        }
        provider = value;
      } else if (flag === '--config') {
        const value = rest[++i];
        if (value === undefined || value === '') {
          return { error: 'missing value for --config' };
        }
        configPath = value;
      } else if (flag === '--json') {
        json = true;
      } else if (flag === '--limit') {
        const value = rest[++i];
        const n = Number(value);
        if (!Number.isInteger(n) || n <= 0) {
          return { error: `invalid --limit ${String(value)}: expected a positive integer` };
        }
        limit = n;
      } else {
        return { error: `unexpected argument for 'models': ${flag}` };
      }
    }
    if (provider === undefined) {
      return { error: "missing --provider <name> (a lco.config.json provider, or a built-in: openrouter, routellm)" };
    }
    return { command: 'models', provider, ...(configPath !== undefined ? { configPath } : {}), json, ...(limit !== undefined ? { limit } : {}) };
  }
  if (command === 'generate') {
    const [dir, ...flags] = rest;
    let intent: string | undefined;
    let intentFile: string | undefined;
    // UX-001 ruling: single is the conservative default; the constant lives
    // in commands/generate.ts — the ONE place the default is chosen.
    let variant: GenerateVariant = DEFAULT_GENERATE_VARIANT;
    let profile: InitProfile = 'p-standard';
    const budget: RunBudgetSpec = {};
    let sawBudgetFlag = false;
    let llmProfile: string | undefined;
    let answersFile: string | undefined;
    let interactive = false;
    let noOpen = false;
    const budgetFlag = (name: 'maxAttempts' | 'maxTokens' | 'maxWallMs', raw: string | undefined, flag: string): string | null => {
      const n = Number(raw);
      if (!Number.isInteger(n) || n <= 0) {
        return `invalid ${flag} ${String(raw)}: expected a positive integer`;
      }
      budget[name] = n;
      return null;
    };
    for (let i = 0; i < flags.length; i++) {
      const flag = flags[i];
      if (flag === '--intent') {
        const value = flags[++i];
        if (value === undefined || value === '') {
          return { error: 'missing value for --intent' };
        }
        // UX-004 preflight: normalize (trim, parity with --intent-file) and
        // refuse blank/oversized intents at PARSE time — before any IO, env
        // access, or adapter construction. A bad invocation costs nothing.
        const normalized = normalizeIntent(value);
        if (!normalized.ok) {
          return { error: `--intent ${normalized.error}` };
        }
        intent = normalized.intent;
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
      } else if (flag === '--max-attempts' || flag === '--max-tokens' || flag === '--max-wall-ms') {
        sawBudgetFlag = true;
        const name = flag === '--max-attempts' ? 'maxAttempts' : flag === '--max-tokens' ? 'maxTokens' : 'maxWallMs';
        const err = budgetFlag(name, flags[++i], flag);
        if (err) return { error: err };
      } else if (flag === '--llm-profile') {
        const value = flags[++i];
        if (value === undefined || value === '') {
          return { error: 'missing value for --llm-profile' };
        }
        if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) {
          return { error: `invalid --llm-profile ${value}: expected a profile name (letters, digits, . _ -)` };
        }
        llmProfile = value;
      } else if (flag === '--answers') {
        const value = flags[++i];
        if (value === undefined || value === '') {
          return { error: 'missing value for --answers' };
        }
        answersFile = value;
      } else if (flag === '--interactive') {
        interactive = true;
      } else if (flag === '--no-open') {
        noOpen = true;
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
    if (interactive && answersFile !== undefined) {
      return {
        error: '--interactive and --answers are two different answer channels: --interactive opens the browser workspace (many rounds, in-session), --answers applies one headless round from a file — pass exactly one',
      };
    }
    return {
      command: 'generate',
      dir,
      intent,
      intentFile,
      variant,
      profile,
      ...(sawBudgetFlag ? { budget } : {}),
      ...(llmProfile !== undefined ? { llmProfile } : {}),
      ...(answersFile !== undefined ? { answersFile } : {}),
      ...(interactive ? { interactive: true } : {}),
      ...(noOpen ? { noOpen: true } : {}),
    };
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
export function commandHelp(command: Command): string {
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

export { USAGE };


const RENEW_SUBS = ['init', 'refresh', 'status', 'analyze', 'review', 'plan', 'export'] as const;
type RenewSub = (typeof RENEW_SUBS)[number];

/** M-04: per-subcommand grammar — allowed/required flags, value vs boolean
 * flags, exclusivity and dependency rules. No global allowlist: a flag that
 * does not belong to THIS subcommand is an error, not noise. */
interface RenewGrammar {
  valueFlags: readonly string[];
  boolFlags: readonly string[];
  required?: readonly string[];
  conflicts?: readonly (readonly [string, string])[];
  requiresWith?: readonly (readonly [string, string])[]; // [flag, prerequisite]
}

const RENEW_GRAMMAR: Record<RenewSub, RenewGrammar> = {
  init: {
    valueFlags: ['--target', '--name'],
    boolFlags: [],
    required: ['--target'],
  },
  refresh: { valueFlags: [], boolFlags: [] },
  status: { valueFlags: [], boolFlags: ['--json'] },
  analyze: {
    valueFlags: ['--llm-profile', '--max-attempts', '--max-tokens', '--max-wall-ms'],
    boolFlags: [],
  },
  review: {
    valueFlags: ['--answers'],
    boolFlags: ['--interactive', '--no-open'],
    conflicts: [['--answers', '--interactive']],
    requiresWith: [['--no-open', '--interactive']],
  },
  plan: { valueFlags: ['--strategy', '--strategy-rationale'], boolFlags: ['--freeze'] },
  export: { valueFlags: ['--out'], boolFlags: [] },
};

/** L-01: per-subcommand help — specific usage + honest command-class labels. */
const RENEW_HELP: Record<RenewSub, string> = {
  init: [
    'usage: lco renew init <dir> --target <legacy-repo> [--name <name>]',
    '',
    'OFFLINE · deterministic · writes LCO state only (never the target).',
    'Scaffolds the renewal project, snapshots the target (content hashes +',
    'graph identity), and builds the Graphify graph in the guarded copy.',
    '  <dir>           the LCO renewal project directory (must be OUTSIDE the target)',
    '  --target        the analyzed legacy repository (read-only)',
    '  --name          project name (default: legacy-renewal)',
  ].join('\n'),
  refresh: [
    'usage: lco renew refresh <dir>',
    '',
    'OFFLINE · deterministic · writes LCO state only.',
    'Re-snapshots the target and SUPERSEDES prior overlay/parity/strategy',
    '(archived under their old snapshot id); analyses/approvals are kept as',
    'history. Re-analyze (PAID) and re-select strategy afterwards.',
  ].join('\n'),
  status: [
    'usage: lco renew status <dir> [--json]',
    '',
    'OFFLINE · read-only.',
    'Snapshot freshness, graph state, active analyses, overlay/parity state,',
    'strategy, and plan presence.',
    '  --json   machine-readable output',
  ].join('\n'),
  analyze: [
    'usage: lco renew analyze <dir> [--llm-profile <name>] [--max-attempts N]',
    '                      [--max-tokens N] [--max-wall-ms N]',
    '',
    'PAID — makes real LLM calls through role renew_recover.',
    'Requires a fresh snapshot; verifies Graphify first; re-checks source',
    'state AFTER the call (mid-call mutations block promotion).',
    '  --llm-profile    named profile from the operator config (variant: renewal)',
    '  --max-attempts   budget ceiling on paid attempts',
    '  --max-tokens     budget ceiling on tokens',
    '  --max-wall-ms    budget ceiling on wall-clock time',
  ].join('\n'),
  review: [
    'usage: lco renew review <dir> (--interactive [--no-open] | --answers <file>)',
    '',
    'INTERACTIVE (browser workspace) or HEADLESS — human decisions either way.',
    'Rulings and the strategy selection are human acts recorded immutably.',
    '  --interactive   open the clarification workspace in a browser',
    '  --no-open       with --interactive: print the URL, do not open a browser',
    '  --answers       headless twin: {"answers":[{decisionId,kind,selectedOption|freeText}]}',
  ].join('\n'),
  plan: [
    'usage: lco renew plan <dir> [--strategy <s> --strategy-rationale <text>] [--freeze]',
    '',
    'OFFLINE · deterministic · writes the spec (LCO state only).',
    'Refuses on stale state, unresolved parity, unverified approvals, or',
    'schema-invalid candidates (nothing is written on refusal).',
    '  --strategy              explicit strategy (in_place|strangler|full_rewrite|',
    '                          service_extraction|framework_migration|language_migration)',
    '  --strategy-rationale    required with --strategy (a human act, explained)',
    '  --freeze                freeze the written plan as an immutable revision',
  ].join('\n'),
  export: [
    'usage: lco renew export <dir> [--out <file>]',
    '',
    'OFFLINE · read-only unless --out is given.',
    'Renders the modernization report as markdown. --out must land inside',
    'the project root and never overwrites an existing file.',
  ].join('\n'),
};

/** L-01: the per-subcommand help text for `lco renew <sub> --help`. */
export function renewSubHelp(sub: RenewSub): string {
  return `${RENEW_HELP[sub]}\n\n(run \`lco --help\` for the full command overview)`;
}

function parseRenew(rest: string[]): ParseResult {
  const err = (message: string): ParseResult => ({ error: message });
  const [sub, dir, ...flags] = rest;
  if (sub === undefined || !(RENEW_SUBS as readonly string[]).includes(sub)) {
    return err(`renew requires a subcommand (${RENEW_SUBS.join(' | ')})`);
  }
  if (dir === undefined || dir === '' || dir.startsWith('--')) {
    return err(`renew ${sub} requires the LCO project <dir> as its first argument (the analyzed repo is --target on init)`);
  }
  const grammar = RENEW_GRAMMAR[sub as RenewSub];
  const allowed = new Set([...grammar.valueFlags, ...grammar.boolFlags]);

  // Every flag must belong to THIS subcommand (M-04: no global allowlist).
  for (const f of flags) {
    if (f.startsWith('--') && !allowed.has(f)) {
      return err(`flag ${f} is not valid for 'renew ${sub}' (allowed: ${[...allowed].sort().join(' ') || 'none'})`);
    }
  }
  // Value flags need real values — a missing value or one that is itself a
  // flag is an error, never an ambiguity.
  const flag = (name: string): string | undefined => {
    const i = flags.indexOf(name);
    if (i === -1) return undefined;
    const value = flags[i + 1];
    if (value === undefined || value.startsWith('--')) {
      return undefined;
    }
    return value;
  };
  for (const name of grammar.valueFlags) {
    const i = flags.indexOf(name);
    if (i !== -1 && flag(name) === undefined) {
      return err(`${name} requires a value for 'renew ${sub}'`);
    }
  }
  const has = (name: string): boolean => flags.includes(name);
  for (const required of grammar.required ?? []) {
    if (!has(required)) {
      return err(`renew ${sub} requires ${required} (see: lco renew ${sub} --help)`);
    }
  }
  for (const [a, b] of grammar.conflicts ?? []) {
    if (has(a) && has(b)) {
      return err(`'renew ${sub}': ${a} and ${b} are mutually exclusive (interactive browser session or headless answers — pick one)`);
    }
  }
  for (const [flagName, prerequisite] of grammar.requiresWith ?? []) {
    if (has(flagName) && !has(prerequisite)) {
      return err(`'renew ${sub}': ${flagName} is only meaningful with ${prerequisite}`);
    }
  }

  const numericFlag = (name: string): number | undefined => {
    const raw = flag(name);
    if (raw === undefined) return undefined;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0 || String(n) !== raw.trim()) {
      return -1; // signal: present but invalid
    }
    return n;
  };

  switch (sub as RenewSub) {
    case 'init': {
      const target = flag('--target')!;
      return { command: 'renew', renew: { sub: 'init', dir, target, ...(flag('--name') !== undefined ? { name: flag('--name') } : {}) } };
    }
    case 'refresh':
      return { command: 'renew', renew: { sub: 'refresh', dir } };
    case 'status':
      return { command: 'renew', renew: { sub: 'status', dir, json: has('--json') } };
    case 'analyze': {
      const budget: { maxAttempts?: number; maxTokens?: number; maxWallMs?: number } = {};
      for (const [name, key] of [
        ['--max-attempts', 'maxAttempts'],
        ['--max-tokens', 'maxTokens'],
        ['--max-wall-ms', 'maxWallMs'],
      ] as const) {
        const n = numericFlag(name);
        if (n === -1) return err(`${name} requires a positive integer for 'renew analyze'`);
        if (n !== undefined) budget[key] = n;
      }
      return {
        command: 'renew',
        renew: {
          sub: 'analyze',
          dir,
          ...(flag('--llm-profile') !== undefined ? { llmProfile: flag('--llm-profile') } : {}),
          ...(Object.keys(budget).length > 0 ? { budget } : {}),
        },
      };
    }
    case 'review':
      return {
        command: 'renew',
        renew: {
          sub: 'review',
          dir,
          ...(flag('--answers') !== undefined ? { answersFile: flag('--answers') } : {}),
          interactive: has('--interactive'),
          noOpen: has('--no-open'),
        },
      };
    case 'plan':
      return {
        command: 'renew',
        renew: {
          sub: 'plan',
          dir,
          ...(flag('--strategy') !== undefined ? { strategy: flag('--strategy') } : {}),
          ...(flag('--strategy-rationale') !== undefined ? { strategyRationale: flag('--strategy-rationale') } : {}),
          freeze: has('--freeze'),
        },
      };
    case 'export':
      return { command: 'renew', renew: { sub: 'export', dir, ...(flag('--out') !== undefined ? { out: flag('--out') } : {}) } };
  }
}
