#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { cmdCompile } from '../cli/commands/compile';
import { cmdLint } from '../cli/commands/lint';
import { cmdFreeze } from '../cli/commands/freeze';
import { cmdVerify } from '../cli/commands/verify';
import { cmdTrace } from '../cli/commands/trace';
import { cmdPlan } from '../cli/commands/plan';
import { cmdCheck } from '../cli/commands/check';
import {
  authorizeExecution,
  checkPreviewDigest,
  consentDigestLine,
  loadCheckBundle,
  mcpExecBoundary,
  refuseServerNotOptedIn,
  scrubbedExecutor,
  YES_REMOVED_MESSAGE,
  type ExecBoundary,
} from './consent';

/**
 * `lco-mcp` — a minimal MCP server over line-delimited JSON-RPC 2.0 on stdio,
 * exposing the spec-core engine as the 7 read/write tools.
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
  /** SEC-002 execution consent: { digest } matching the dry-run preview. */
  consent?: { digest: string };
}

/** Every core normalizes to this — the tool result text is `output` + exit code. */
interface CoreResult {
  code: number;
  output: string;
}

interface ToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
  /** Optional argument names this tool accepts (beyond the required `dir`). */
  optional: ReadonlyArray<'task' | 'json' | 'consent'>;
  /** `nowIso` is the server-boundary clock, read once per tool call. */
  run: (input: ToolInput, nowIso: string, boundary: ExecBoundary) => Promise<CoreResult>;
}

const DIR_PROPERTY = {
  type: 'string',
  description: 'path to the spec root — the directory that contains spec/',
} as const;

const TOOLS: readonly ToolDef[] = [
  {
    name: 'lco_compile',
    description:
      'Compile and validate the spec/ tree under dir; reports section counts or the compile errors.',
    inputSchema: { type: 'object', properties: { dir: DIR_PROPERTY }, required: ['dir'] },
    optional: [],
    run: (input) => cmdCompile(input.dir),
  },
  {
    name: 'lco_lint',
    description:
      'Compile and lint the spec under dir; returns the rule findings table (isError when lint errors exist).',
    inputSchema: { type: 'object', properties: { dir: DIR_PROPERTY }, required: ['dir'] },
    optional: [],
    run: (input) => cmdLint(input.dir),
  },
  {
    name: 'lco_freeze',
    description:
      'Gate-check (lint, unresolved, blocking, UNRESOLVED decisions) and freeze the spec, rewriting spec/manifest.json with artifact hashes.',
    inputSchema: { type: 'object', properties: { dir: DIR_PROPERTY }, required: ['dir'] },
    optional: [],
    run: (input, nowIso) => cmdFreeze(input.dir, nowIso),
  },
  {
    name: 'lco_verify',
    description:
      'Verify a frozen spec by re-hashing its sections against manifest.artifact_hashes (drift detection).',
    inputSchema: { type: 'object', properties: { dir: DIR_PROPERTY }, required: ['dir'] },
    optional: [],
    run: (input) => cmdVerify(input.dir),
  },
  {
    name: 'lco_trace',
    description:
      'Traceability report for the spec under dir: per-requirement task links, test links, orphans, coverage.',
    inputSchema: { type: 'object', properties: { dir: DIR_PROPERTY }, required: ['dir'] },
    optional: [],
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
    },
    optional: ['json'],
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
        consent: {
          type: 'object',
          description:
            'execution consent: { digest } — the "consent digest" value from the dry-run ' +
            'preview of the SAME task selection. Honored only on an LCO_MCP_ALLOW_EXEC=1 ' +
            'server with a frozen, hash-verified, lint-clean spec; commands then run ' +
            'with a scrubbed environment.',
          properties: {
            digest: {
              type: 'string',
              description: 'sha256:<64 lowercase hex> preview digest being approved',
            },
          },
          required: ['digest'],
          additionalProperties: false,
        },
      },
      required: ['dir'],
    },
    optional: ['task', 'consent'],
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
];

const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t] as const));

/** JSON type of each optional argument, for fail-closed validation. */
const OPTIONAL_ARG_TYPES = { task: 'string', json: 'boolean', consent: 'object' } as const;

// --- JSON-RPC plumbing -------------------------------------------------------------

type JsonRpcId = string | number | null;

function resultResponse(id: JsonRpcId, result: unknown): string {
  return JSON.stringify({ jsonrpc: '2.0', id, result });
}

function errorResponse(id: JsonRpcId, code: number, message: string): string {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
}

/** Per-call server-boundary options for {@link handleRpcLine} (tests inject both). */
export interface HandleRpcOptions {
  /** Overrides the env-derived execution opt-in (LCO_MCP_ALLOW_EXEC). */
  allowExec?: boolean;
  /** The environment to derive the boundary from (default: process.env). */
  env?: NodeJS.ProcessEnv;
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
 * The execution-consent boundary (SEC-002) is derived per call from the
 * environment (mcpExecBoundary) unless `options.allowExec` overrides the
 * opt-in — the env read lives at this boundary, like the clock, never in a
 * command core.
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
  // contract the CLI wrapper holds for freeze/change/check/init. The SEC-002
  // execution boundary (env opt-in + workspace pin) is derived HERE too; the
  // explicit options.allowExec override exists for tests and library callers.
  const nowIso = new Date().toISOString();
  const envBoundary = mcpExecBoundary(options?.env ?? process.env);
  const boundary: ExecBoundary =
    options?.allowExec === undefined
      ? envBoundary
      : { ...envBoundary, allowExec: options.allowExec };
  let result: CoreResult;
  try {
    result = await tool.run(input.value, nowIso, boundary);
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
    if (key !== 'dir' && !(tool.optional as readonly string[]).includes(key)) {
      // SEC-002: `yes` is refused by NAME with the actionable opt-in path —
      // not a generic unknown-argument error — because it is the parameter an
      // injected client will reach for first.
      if (key === 'yes') return invalid(YES_REMOVED_MESSAGE);
      return invalid(`unknown argument '${key}'`);
    }
  }
  for (const key of tool.optional) {
    if (!(key in args)) continue;
    const arg = args[key];
    const expected = OPTIONAL_ARG_TYPES[key];
    if (key === 'consent') {
      if (!isPlainObject(arg)) {
        return invalid("'consent' must be an object: { digest: string }");
      }
      const keys = Object.keys(arg);
      if (keys.length !== 1 || keys[0] !== 'digest') {
        return invalid("'consent' must have exactly one key: digest (unknown keys are rejected)");
      }
      const digest = arg.digest;
      if (typeof digest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(digest)) {
        return invalid(
          "'consent.digest' must be a sha256:<64 lowercase hex> digest — the exact " +
            "'consent digest' value printed by the dry-run preview",
        );
      }
      value.consent = { digest };
      continue;
    }
    if (typeof arg !== expected) {
      return invalid(`'${key}' must be ${expected === 'string' ? 'a string' : 'a boolean'}`);
    }
    if (key === 'task') value.task = arg as string;
    else value.json = arg as boolean;
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
