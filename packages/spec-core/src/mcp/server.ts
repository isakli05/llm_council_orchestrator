#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { cmdCompile } from '../cli/commands/compile';
import { cmdLint } from '../cli/commands/lint';
import { cmdFreeze } from '../cli/commands/freeze';
import { cmdVerify } from '../cli/commands/verify';
import { cmdTrace } from '../cli/commands/trace';
import { cmdPlan } from '../cli/commands/plan';
import { cmdCheck } from '../cli/commands/check';
import { cmdInit } from '../cli/commands/init';
import {
  cmdGenerate,
  DEFAULT_GENERATE_VARIANT,
  DEFAULT_GENERATE_PROFILE,
  MAX_INTENT_CHARS,
} from '../cli/commands/generate';
import { cmdChange } from '../cli/commands/change';
import type { ChangeSet } from '../compiler/changeset';
import {
  authorizeExecution,
  checkPreviewDigest,
  consentDigestLine,
  generateConsentDigest,
  generateOptInFromEnv,
  loadCheckBundle,
  mcpExecBoundary,
  refuseGenerateConsentMissing,
  refuseGenerateDigestMismatch,
  refuseGenerateNotOptedIn,
  refuseServerNotOptedIn,
  scrubbedExecutor,
  YES_REMOVED_MESSAGE,
  type ExecBoundary,
  type GenerateProfile,
  type GenerateVariant,
} from './consent';
import type { LlmAdapter } from '../eval/llm/adapter';

/**
 * `lco-mcp` — a minimal MCP server over line-delimited JSON-RPC 2.0 on stdio,
 * exposing the spec-core engine as the 10 read/write/create tools.
 *
 * STDOUT PURITY (binding, anti-F18): stdout carries NOTHING but one
 * `JSON.stringify`-ed JSON-RPC response per line. Every diagnostic — a caught
 * command-core throw, an unhandled line error — goes to stderr via
 * console.error. The command cores themselves are console-free (pure,
 * structured results), so the only stdout writes in this process are the
 * response lines written by the bin wiring below.
 *
 * EXECUTION CONSENT (binding, SEC-002): the default server surface has NO
 * command execution — `lco_check` previews (dry) and advertises a consent
 * digest. Execution additionally requires the operator's server-start opt-in
 * (`LCO_MCP_ALLOW_EXEC=1`), a frozen+hash-verified+lint-clean spec, and a
 * `consent.digest` matching the dry-run preview — and then runs with a
 * scrubbed environment. See ./consent for the boundary's four layers.
 *
 * PAID-CALL CONSENT (binding, PROD-004): `lco_generate` spends real LLM
 * calls, so it never runs on a request's say-so alone. Generation requires
 * the operator's server-start opt-in (`LCO_MCP_ALLOW_GENERATE=1`, exactly 1,
 * independent of the exec flag) AND a `consent.digest` matching the digest
 * the consent-missing refusal advertises for the SAME {intent, profile,
 * variant}. Without the full chain: structured refusal, ZERO LLM calls.
 * `lco_init`/`lco_change` are local and free — no consent chain, but the
 * same shared cores as the CLI (no-clobber; validate-complete-candidate-
 * then-persist under the per-root revision lock).
 *
 * Structure: `handleRpcLine` is the testable core (line in -> response line
 * out, or null for notifications); the `require.main` block is the bin wiring
 * (readline over stdin, write responses to stdout).
 */

const PROTOCOL_VERSION = '2025-06-18';
const SERVER_NAME = 'lco-mcp';
const SERVER_VERSION = '0.1.0';

// --- tool surface ----------------------------------------------------------------

/** Normalized arguments after fail-closed validation. */
interface ToolInput {
  dir: string;
  task?: string;
  json?: boolean;
  /** SEC-002 execution consent / PROD-004 paid-call consent: { digest }. */
  consent?: { digest: string };
  /** PROD-004 lco_init/lco_generate: the CLI profile contract. */
  profile?: GenerateProfile;
  /** PROD-004 lco_init: the project name for the scaffold manifest. */
  name?: string;
  /** PROD-004 lco_generate: the natural-language intent (required there). */
  intent?: string;
  /** PROD-004 lco_generate: the cost axis (single default; council explicit — see generate.ts). */
  variant?: GenerateVariant;
  /** PROD-004 lco_change: the inline CLI change envelope (plain object at the
   *  parse layer; the authoritative strict check is ChangeSetSchema in the core). */
  changeset?: ChangeSet;
}

/** Every core normalizes to this — the tool result text is `output` + exit code. */
interface CoreResult {
  code: number;
  output: string;
}

/**
 * The per-call server boundary handed to every tool run: T9's execution
 * boundary (allowExec/execRoot) plus the PROD-004 paid-call capability and
 * the test/library adapter injection. Like the clock, these are read ONCE
 * per tool call at the RPC layer — never in a command core, never from the
 * request arguments (a request cannot spoof its own capability: those keys
 * are unknown arguments, refused with -32602).
 */
interface CallContext extends ExecBoundary {
  /** Paid generation may be honored at all (LCO_MCP_ALLOW_GENERATE=1). */
  allowGenerate: boolean;
  /**
   * Wall-clock provider (UX-001): read at the RPC boundary like nowIso, and
   * handed to cmdGenerate so the run's wall budget can be enforced without
   * the command core ever reading a clock itself.
   */
  nowMs?: () => number;
  /** Mock adapter injected by tests/library callers; production leaves it
   *  unset and cmdGenerate resolves createHttpLlm() fail-closed. */
  llm?: LlmAdapter;
}

interface ToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
    /** Advertised strictness: the parse layer rejects every unknown key. */
    additionalProperties: false;
  };
  /** Argument names accepted beyond `dir` (validated fail-closed by ARG_SPECS). */
  args: readonly ArgName[];
  /** Required arguments beyond `dir` (a subset of args). */
  requiredArgs?: readonly ArgName[];
  /** `nowIso` is the server-boundary clock, read once per tool call. */
  run: (input: ToolInput, nowIso: string, call: CallContext) => Promise<CoreResult>;
}

const DIR_PROPERTY = {
  type: 'string',
  description: 'path to the spec root — the directory that contains spec/ (created on init/generate)',
} as const;

/** The { digest } consent object, shared by lco_check (exec) and lco_generate (paid call). */
const CONSENT_PROPERTY = (description: string) => ({
  type: 'object',
  description,
  properties: {
    digest: {
      type: 'string',
      description: 'sha256:<64 lowercase hex> digest being approved',
    },
  },
  required: ['digest'],
  additionalProperties: false,
});

const TOOLS: readonly ToolDef[] = [
  {
    name: 'lco_compile',
    description:
      'Compile and validate the spec/ tree under dir; reports section counts or the compile errors.',
    inputSchema: { type: 'object', properties: { dir: DIR_PROPERTY }, required: ['dir'], additionalProperties: false },
    args: [],
    run: (input) => cmdCompile(input.dir),
  },
  {
    name: 'lco_lint',
    description:
      'Compile and lint the spec under dir; returns the rule findings table (isError when lint errors exist).',
    inputSchema: { type: 'object', properties: { dir: DIR_PROPERTY }, required: ['dir'], additionalProperties: false },
    args: [],
    run: (input) => cmdLint(input.dir),
  },
  {
    name: 'lco_freeze',
    description:
      'Gate-check (lint, unresolved, blocking, UNRESOLVED decisions) and freeze the spec, rewriting spec/manifest.json with artifact hashes.',
    inputSchema: { type: 'object', properties: { dir: DIR_PROPERTY }, required: ['dir'], additionalProperties: false },
    args: [],
    run: (input, nowIso) => cmdFreeze(input.dir, nowIso),
  },
  {
    name: 'lco_verify',
    description:
      'Verify a frozen spec by re-hashing its sections against manifest.artifact_hashes (drift detection).',
    inputSchema: { type: 'object', properties: { dir: DIR_PROPERTY }, required: ['dir'], additionalProperties: false },
    args: [],
    run: (input) => cmdVerify(input.dir),
  },
  {
    name: 'lco_trace',
    description:
      'Traceability report for the spec under dir: per-requirement task links, test links, orphans, coverage.',
    inputSchema: { type: 'object', properties: { dir: DIR_PROPERTY }, required: ['dir'], additionalProperties: false },
    args: [],
    run: async (input) => {
      const r = await cmdTrace(input.dir);
      return { code: r.code, output: r.report };
    },
  },
  {
    name: 'lco_plan',
    description:
      'Topological execution plan (deterministic Kahn); json=true emits machine-readable {order, tasks}.',
    inputSchema: {
      type: 'object',
      properties: {
        dir: DIR_PROPERTY,
        json: { type: 'boolean', description: 'emit machine-readable {order, tasks} JSON instead of the human table' },
      },
      required: ['dir'],
      additionalProperties: false,
    },
    args: ['json'],
    run: (input) => cmdPlan(input.dir, { json: input.json ?? false }),
  },
  {
    name: 'lco_check',
    description:
      'Preview TaskContract verification commands (DRY RUN — nothing executes) and ' +
      'advertise the consent digest. Execution happens ONLY when the server was ' +
      'started with LCO_MCP_ALLOW_EXEC=1 AND the spec is frozen+hash-verified+ ' +
      'lint-clean AND consent.digest matches the dry-run preview digest (SEC-002).',
    inputSchema: {
      type: 'object',
      properties: {
        dir: DIR_PROPERTY,
        task: { type: 'string', description: 'restrict the run to one task id (e.g. TASK-0001) — the consent digest is bound to the selection' },
        consent: CONSENT_PROPERTY(
          'execution consent: { digest } — the "consent digest" value from the dry-run ' +
            'preview of the SAME task selection. Honored only on an LCO_MCP_ALLOW_EXEC=1 ' +
            'server with a frozen, hash-verified, lint-clean spec; commands then run ' +
            'with a scrubbed environment.',
        ),
      },
      required: ['dir'],
      additionalProperties: false,
    },
    args: ['task', 'consent'],
    run: async (input, nowIso, boundary) => {
      // ONE load per request, shared by the preview, the gate, and the run —
      // no re-load (and so no TOCTOU window) between authorization and
      // execution. A compile/lint refusal is T7's actionable output, verbatim.
      const loaded = await loadCheckBundle(input.dir);
      if (!loaded.ok) return { code: loaded.code, output: loaded.output };
      const { bundle } = loaded;

      // DRY PREVIEW (the default surface): the shared check core at yes:false
      // plus the consent digest this server would require to execute.
      if (input.consent === undefined) {
        const digest = checkPreviewDigest(bundle, input.task);
        const dry = await cmdCheck(input.dir, {
          task: input.task,
          yes: false,
          nowIso,
          bundle,
        });
        return { code: dry.code, output: `${dry.output}\n${consentDigestLine(digest)}` };
      }

      // EXECUTION: all four SEC-002 layers must hold.
      if (!boundary.allowExec) {
        return { code: 2, output: refuseServerNotOptedIn() };
      }
      const auth = authorizeExecution(
        bundle,
        input.dir,
        input.task,
        input.consent.digest,
        boundary.execRoot,
      );
      if (!auth.ok) {
        return { code: auth.code, output: auth.output };
      }
      return cmdCheck(input.dir, {
        task: input.task,
        yes: true,
        nowIso,
        bundle,
        exec: scrubbedExecutor,
      });
    },
  },
  {
    name: 'lco_init',
    description:
      'Scaffold a WORKING minimal EXAMPLE spec/ under dir (draft/v1) — NO-CLOBBER: if ' +
      'dir/spec already exists the call refuses (isError, exit 2) and never touches ' +
      'disk. Same core as `lco init`; profile/name mirror the CLI flags ' +
      '(defaults p-mini / my-project). The scaffold compiles, lints clean, and freezes as-is.',
    inputSchema: {
      type: 'object',
      properties: {
        dir: DIR_PROPERTY,
        profile: {
          type: 'string',
          enum: ['p-mini', 'p-standard'],
          description: 'complexity profile of the scaffold (default p-mini)',
        },
        name: {
          type: 'string',
          description: 'project name written into the manifest (default my-project)',
        },
      },
      required: ['dir'],
      additionalProperties: false,
    },
    args: ['profile', 'name'],
    run: async (input, nowIso) => {
      // Thin wrapper over the pure core — the same output texts the CLI
      // wrapper prints (the handler IS the MCP-side wrapper).
      const profile = input.profile ?? 'p-mini';
      const name = input.name ?? 'my-project';
      const result = await cmdInit(input.dir, { profile, name, nowIso });
      if (result.code === 2) {
        return {
          code: 2,
          output:
            `refusing to overwrite existing spec/ at ${input.dir}: ` +
            `remove it first or choose another directory`,
        };
      }
      return {
        code: 0,
        output: [
          `initialized ${input.dir}/spec (profile ${profile}, ${name}) with ${result.files.length} section files:`,
          ...result.files.map((file) => `  ${file}`),
          'the scaffold is a WORKING EXAMPLE spec: it compiles, lints clean, and freezes ' +
            'as-is — replace every EXAMPLE entry with your own content',
        ].join('\n'),
      };
    },
  },
  {
    name: 'lco_generate',
    description:
      'Compile a natural-language intent into a spec/ draft via PAID LLM calls (PROD-004). ' +
      'Requires the operator opt-in LCO_MCP_ALLOW_GENERATE=1 AND consent.digest equal to ' +
      'the digest this tool advertises in its consent-missing refusal for the SAME ' +
      '{intent, profile, variant} — any other request: structured refusal, ZERO LLM calls. ' +
      'Same gates as the CLI (no-clobber, evidence gate, defensive lint, draft/v1 output). ' +
      'The server uses a live LLM only from its own LCO_LLM_* env; keys are never invented.',
    inputSchema: {
      type: 'object',
      properties: {
        dir: DIR_PROPERTY,
        intent: {
          type: 'string',
          description:
            'natural-language intent — exactly the text sent to the LLM; part of the consent digest',
        },
        variant: {
          type: 'string',
          enum: ['single', 'council'],
          description:
            'single (default; up to 3 completions/12 HTTP attempts) or council (up to 6/24) — part of the consent digest',
        },
        profile: {
          type: 'string',
          enum: ['p-mini', 'p-standard'],
          description: 'complexity profile (default p-standard; part of the consent digest)',
        },
        consent: CONSENT_PROPERTY(
          'paid-call consent: { digest } — the "consent digest" value the refusal for the ' +
            'SAME {intent, profile, variant} advertised. Honored only on an ' +
            'LCO_MCP_ALLOW_GENERATE=1 server; without it the request spends nothing.',
        ),
      },
      required: ['dir', 'intent'],
      additionalProperties: false,
    },
    args: ['intent', 'variant', 'profile', 'consent'],
    requiredArgs: ['intent'],
    run: async (input, nowIso, call) => {
      // PROD-004 consent chain — every refusal happens BEFORE any adapter is
      // constructed or invoked: zero LLM calls by construction. Defaults come
      // from the ONE shared source (commands/generate.ts): single is the
      // conservative default (UX-001 ruling); council is explicit.
      const profile = input.profile ?? DEFAULT_GENERATE_PROFILE;
      const variant = input.variant ?? DEFAULT_GENERATE_VARIANT;
      const expected = generateConsentDigest(input.intent!, profile, variant);

      // 1. No consent: the actionable refusal IS the preview — it carries
      //    this request's digest (there is no dry-run work worth exit 0).
      if (input.consent === undefined) {
        return { code: 2, output: refuseGenerateConsentMissing(expected) };
      }
      // 2. Server-start opt-in (exactly '1'; independent of LCO_MCP_ALLOW_EXEC).
      if (!call.allowGenerate) {
        return { code: 2, output: refuseGenerateNotOptedIn() };
      }
      // 3. Consent bound to the recomputed effectual content.
      if (input.consent.digest !== expected) {
        return { code: 2, output: refuseGenerateDigestMismatch(input.consent.digest, expected) };
      }
      // Full chain: the shared generate core. call.llm is the boundary-injected
      // (test/library) adapter; when unset cmdGenerate resolves createHttpLlm()
      // itself and throws fail-closed without LCO_LLM_* env (never invents keys).
      return cmdGenerate(input.dir, {
        intent: input.intent!,
        variant,
        profile,
        nowIso,
        llm: call.llm,
        nowMs: call.nowMs,
      });
    },
  },
  {
    name: 'lco_change',
    description:
      'Apply a changeset (the CLI change envelope, INLINE as an object) to a FROZEN spec: ' +
      'the complete candidate is validated (compile + strict envelope + lint) BEFORE ' +
      'anything persists — a lint-invalid changeset is refused (isError) with the spec ' +
      'byte-identical and retryable. On success: spec_version +1, state draft. Same ' +
      'atomic per-root-locked core as `lco change`.',
    inputSchema: {
      type: 'object',
      properties: {
        dir: DIR_PROPERTY,
        changeset: {
          type: 'object',
          description:
            'the CLI change envelope, inline: { id, rationale, modified_tasks?: [{task_id, patch}], ' +
            'removed_task_ids?, added_requirements? } — strict: unknown keys are rejected',
        },
      },
      required: ['dir', 'changeset'],
      additionalProperties: false,
    },
    args: ['changeset'],
    requiredArgs: ['changeset'],
    run: async (input, nowIso) => {
      // The shared change core: file path (CLI) or inline object (here) both
      // land in one validate-complete-candidate-then-persist pipeline.
      const r = await cmdChange(input.dir, input.changeset!, nowIso);
      return {
        code: r.code,
        output:
          r.details.length > 0
            ? `${r.summary}\n${r.details.map((d) => `  ${d}`).join('\n')}`
            : r.summary,
      };
    },
  },
];

const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t] as const));

// --- JSON-RPC plumbing -------------------------------------------------------------

type JsonRpcId = string | number | null;

function resultResponse(id: JsonRpcId, result: unknown): string {
  return JSON.stringify({ jsonrpc: '2.0', id, result });
}

function errorResponse(id: JsonRpcId, code: number, message: string): string {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
}

/** Per-call server-boundary options for {@link handleRpcLine} (tests inject these). */
export interface HandleRpcOptions {
  /** Overrides the env-derived execution opt-in (LCO_MCP_ALLOW_EXEC). */
  allowExec?: boolean;
  /** Overrides the env-derived paid-generation opt-in (LCO_MCP_ALLOW_GENERATE). */
  allowGenerate?: boolean;
  /** The environment to derive the boundary from (default: process.env). */
  env?: NodeJS.ProcessEnv;
  /**
   * LLM adapter for lco_generate, injected by tests/library callers (the
   * mock-first path). Production leaves it unset: cmdGenerate resolves
   * createHttpLlm() fail-closed from the server's own LCO_LLM_* env.
   */
  llm?: LlmAdapter;
  /** Wall-clock provider override (UX-001); default `() => Date.now()` at the boundary. */
  nowMs?: () => number;
}

/**
 * Handle ONE stdio line of JSON-RPC 2.0.
 *
 * Returns the response line (a `JSON.stringify` string — no embedded
 * newlines), or null when the line must produce NO response (notifications:
 * requests without an `id`, and every `notifications/*` method). This core
 * never writes to stdout and never rejects — malformed input yields error
 * responses, and a thrown command core becomes an isError tool result.
 *
 * The capability boundaries are derived per call from the environment
 * (mcpExecBoundary + generateOptInFromEnv) unless `options.allowExec` /
 * `options.allowGenerate` override the opt-ins, and `options.llm` injects the
 * (test/library) adapter — the env read lives at this boundary, like the
 * clock, never in a command core.
 */
export async function handleRpcLine(
  line: string,
  options?: HandleRpcOptions,
): Promise<string | null> {
  let msg: unknown;
  try {
    msg = JSON.parse(line);
  } catch {
    return errorResponse(null, -32700, 'Parse error: line is not valid JSON');
  }
  if (msg === null || typeof msg !== 'object' || Array.isArray(msg)) {
    return errorResponse(null, -32600, 'Invalid Request: expected a JSON-RPC 2.0 request object');
  }
  const req = msg as { id?: unknown; method?: unknown };
  const hasId = 'id' in req;
  const id = hasId ? (req.id as JsonRpcId) : null;

  if (typeof req.method !== 'string' || req.method === '') {
    // Malformed requests are only answered when they carry an id.
    return hasId ? errorResponse(id, -32600, 'Invalid Request: missing method') : null;
  }

  // Notifications never get a response — by protocol when they lack an id,
  // and by convention for the whole notifications/* namespace (initialize
  // handshake messages arrive both ways depending on the client).
  if (!hasId || req.method.startsWith('notifications/')) {
    return null;
  }

  switch (req.method) {
    case 'initialize':
      return resultResponse(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      });
    case 'tools/list':
      return resultResponse(id, {
        tools: TOOLS.map(({ name, description, inputSchema }) => ({
          name,
          description,
          inputSchema,
        })),
      });
    case 'tools/call':
      return handleToolsCall(req as { id: JsonRpcId; params?: unknown }, id, options);
    default:
      return errorResponse(id, -32601, `Method not found: ${req.method}`);
  }
}

async function handleToolsCall(
  req: { id: JsonRpcId; params?: unknown },
  id: JsonRpcId,
  options?: HandleRpcOptions,
): Promise<string> {
  if (req.params !== undefined && !isPlainObject(req.params)) {
    return errorResponse(id, -32602, 'Invalid params for tools/call: expected an object');
  }
  const params = (req.params ?? {}) as Record<string, unknown>;
  const name = params.name;
  if (typeof name !== 'string' || name === '') {
    return errorResponse(
      id,
      -32602,
      "Invalid params for tools/call: 'name' must be a non-empty string",
    );
  }
  const tool = TOOL_BY_NAME.get(name);
  if (!tool) {
    return errorResponse(id, -32602, `Unknown tool: ${name}`);
  }
  if (params.arguments !== undefined && !isPlainObject(params.arguments)) {
    return errorResponse(id, -32602, `Invalid arguments for tool ${name}: expected an object`);
  }
  const args = (params.arguments ?? {}) as Record<string, unknown>;

  const input = parseToolInput(tool, args);
  if (!input.ok) {
    return errorResponse(id, -32602, input.message);
  }

  // Server boundary: the clock is read HERE, once per tool call — the same
  // contract the CLI wrapper holds for freeze/change/check/init/generate. The
  // SEC-002 execution boundary (env opt-in + workspace pin) and the PROD-004
  // paid-call opt-in are derived HERE too; the explicit options overrides
  // exist for tests and library callers. The REQUEST can never influence
  // these: allowExec/allowGenerate/llm/env in the arguments were already
  // refused as unknown arguments at the parse layer.
  const nowIso = new Date().toISOString();
  const env = options?.env ?? process.env;
  const envBoundary = mcpExecBoundary(env);
  const call: CallContext = {
    ...envBoundary,
    allowExec: options?.allowExec === undefined ? envBoundary.allowExec : options.allowExec,
    allowGenerate: options?.allowGenerate ?? generateOptInFromEnv(env),
    llm: options?.llm,
    // UX-001: same boundary-clock contract as nowIso — the wall budget's
    // time source, injected once per tool call (tests override via options).
    nowMs: options?.nowMs ?? (() => Date.now()),
  };
  let result: CoreResult;
  try {
    result = await tool.run(input.value, nowIso, call);
  } catch (err) {
    // BINDING: a command-core throw (an IO/environment failure — e.g. freeze
    // or check failing to write) must NEVER crash the server and NEVER reach
    // stdout. It becomes an isError tool result; the diagnostic goes to
    // stderr for the operator.
    const message = err instanceof Error ? err.message : String(err);
    console.error(`lco-mcp: tool ${name} failed: ${message}`);
    return resultResponse(id, {
      content: [{ type: 'text', text: `command failed: ${message}\nexit code: 2` }],
      isError: true,
    });
  }

  return resultResponse(id, {
    content: [{ type: 'text', text: `${result.output}\nexit code: ${result.code}` }],
    isError: result.code !== 0,
  });
}

// --- fail-closed argument validation -------------------------------------------------
//
// One spec table for every non-dir argument on every tool. Wrong types,
// unknown keys, and missing required arguments are all -32602 refusals at
// THIS layer — the command cores only ever see normalized input.

/** Every argument name any tool accepts beyond `dir`. */
type ArgName =
  | 'task'
  | 'json'
  | 'consent'
  | 'profile'
  | 'variant'
  | 'name'
  | 'intent'
  | 'changeset';

/**
 * Validate one argument: returns the NORMALIZED value, or a per-argument
 * error message (without the tool prefix — parseToolInput adds it).
 */
type ArgValidator = (arg: unknown) => { ok: true; value: unknown } | { ok: false; message: string };

const isDigest = (v: unknown): v is string =>
  typeof v === 'string' && /^sha256:[0-9a-f]{64}$/.test(v);

const CONSENT_DIGEST_HINT =
  'must be a sha256:<64 lowercase hex> digest — the exact "consent digest" value ' +
  'the refusal/preview of the same content advertised';

const ARG_SPECS: Record<ArgName, ArgValidator> = {
  task: (arg) =>
    typeof arg === 'string'
      ? { ok: true, value: arg }
      : { ok: false, message: "'task' must be a string" },
  json: (arg) =>
    typeof arg === 'boolean'
      ? { ok: true, value: arg }
      : { ok: false, message: "'json' must be a boolean" },
  consent: (arg) => {
    if (!isPlainObject(arg)) return { ok: false, message: "'consent' must be an object: { digest: string }" };
    const keys = Object.keys(arg);
    if (keys.length !== 1 || keys[0] !== 'digest') {
      return { ok: false, message: "'consent' must have exactly one key: digest (unknown keys are rejected)" };
    }
    if (!isDigest(arg.digest)) {
      return { ok: false, message: `'consent.digest' ${CONSENT_DIGEST_HINT}` };
    }
    return { ok: true, value: { digest: arg.digest } };
  },
  profile: (arg) =>
    arg === 'p-mini' || arg === 'p-standard'
      ? { ok: true, value: arg }
      : { ok: false, message: "'profile' must be p-mini or p-standard" },
  variant: (arg) =>
    arg === 'single' || arg === 'council'
      ? { ok: true, value: arg }
      : { ok: false, message: "'variant' must be single or council" },
  name: (arg) =>
    typeof arg === 'string' && arg.trim() !== ''
      ? { ok: true, value: arg }
      : { ok: false, message: "'name' must be a non-empty string" },
  intent: (arg) => {
    if (typeof arg !== 'string' || arg.trim() === '') {
      return { ok: false, message: "'intent' must be a non-empty string" };
    }
    // UX-004: MCP's intent arg is an INLINE channel (there is no file channel
    // here) — the same generous 10k cap as the CLI's --intent applies.
    if (arg.trim().length > MAX_INTENT_CHARS) {
      return {
        ok: false,
        message: `'intent' is ${arg.trim().length} characters — inline intents are capped at ${MAX_INTENT_CHARS}`,
      };
    }
    return { ok: true, value: arg };
  },
  changeset: (arg) =>
    isPlainObject(arg)
      ? // Runtime authority is ChangeSetSchema.strict() inside the core; the
        // parse layer only guarantees plain-object-ness.
        { ok: true, value: arg as unknown as ChangeSet }
      : { ok: false, message: "'changeset' must be an object: the CLI change envelope, inline" },
};

/** Fail-closed argument validation: wrong/unknown/missing arguments are rejected. */
function parseToolInput(
  tool: ToolDef,
  args: Record<string, unknown>,
): { ok: true; value: ToolInput } | { ok: false; message: string } {
  const invalid = (message: string): { ok: false; message: string } => ({
    ok: false,
    message: `Invalid arguments for tool ${tool.name}: ${message}`,
  });

  if (typeof args.dir !== 'string' || args.dir.trim() === '') {
    return invalid("'dir' must be a non-empty string");
  }
  const value: ToolInput = { dir: args.dir };

  for (const key of Object.keys(args)) {
    if (key === 'dir') continue;
    if (!(tool.args as readonly string[]).includes(key)) {
      // SEC-002: `yes` is refused by NAME with the actionable opt-in path —
      // not a generic unknown-argument error — because it is the parameter an
      // injected client will reach for first. This applies to EVERY tool,
      // including the PROD-004 creation surface.
      if (key === 'yes') return invalid(YES_REMOVED_MESSAGE);
      // Capability-shaped keys get a named refusal too: a request trying to
      // grant itself allowExec/allowGenerate/llm/env must learn that these
      // are server-boundary state, never request arguments.
      if (key === 'allowExec' || key === 'allowGenerate' || key === 'llm' || key === 'env') {
        return invalid(
          `unknown argument '${key}': capability/trust state is set by the OPERATOR at the ` +
            `server boundary (env flags / injected adapter), never by a request argument`,
        );
      }
      return invalid(`unknown argument '${key}'`);
    }
  }
  for (const key of tool.requiredArgs ?? []) {
    if (!(key in args)) return invalid(`missing required argument '${key}'`);
  }
  for (const key of tool.args) {
    if (!(key in args)) continue;
    const parsed = ARG_SPECS[key](args[key]);
    if (!parsed.ok) return invalid(parsed.message);
    (value as unknown as Record<string, unknown>)[key] = parsed.value;
  }
  return { ok: true, value };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// --- bin wiring (`lco-mcp` -> dist/mcp/server.js) -----------------------------------
//
// Guarded so importing handleRpcLine (tests, library consumers) has no side
// effects. readline splits stdin into lines; each line is handed to the RPC
// core and only its non-null responses are written — one JSON.stringify per
// response, one line each. EVERYTHING else (including the last-resort
// rejection handler) goes to stderr.

if (typeof require !== 'undefined' && require.main === module) {
  // A client that dies closes our stdout mid-write: swallow EPIPE and exit
  // quietly (an unhandled 'error' on the stdout socket would otherwise crash
  // with a stack trace). Anything else is a real stream error — rethrow.
  process.stdout.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EPIPE') process.exit(0);
    throw err;
  });

  const rl = createInterface({ input: process.stdin, terminal: false });
  rl.on('line', (line: string) => {
    const trimmed = line.trim();
    if (trimmed === '') return; // ignore blank keepalive lines
    void handleRpcLine(trimmed).then(
      (response) => {
        if (response !== null) process.stdout.write(`${response}\n`);
      },
      (err: unknown) => {
        // handleRpcLine itself never rejects; this is a belt-and-braces guard.
        console.error('lco-mcp: unhandled error while processing a line:', err);
      },
    );
  });
}
