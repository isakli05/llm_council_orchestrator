import { describe, it, expect, afterEach, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { handleRpcLine } from './server';
import { generateConsentDigest, EXEC_ROOT_ENV } from './consent';
import type { LlmAdapter, LlmResponse } from '../eval/llm/adapter';

const FIXTURES = join(__dirname, '../../fixtures');

/** Section files written under spec/ (mirrors cli.test.ts / check.test.ts). */
const SECTION_FILES = [
  'manifest',
  'intent',
  'glossary',
  'assumptions',
  'evidence',
  'requirements',
  'decisions',
  'contracts',
  'tasks',
] as const;

function loadBundle(rel: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(FIXTURES, rel), 'utf8')) as Record<string, unknown>;
}

const tmpDirs: string[] = [];

/**
 * SEC-003 residual: the DEFAULT allowed root of an unpinned server is now
 * realpath(process.cwd()) — mandatory, not optional. The suite therefore runs
 * with process.cwd() switched to a fresh base directory (beforeAll) and every
 * fixture spec root is created INSIDE it, so default-server calls exercise the
 * "inside the working directory" policy. `freshOutside` creates roots OUTSIDE
 * the base (siblings under the OS tmpdir) for the refusal tests.
 */
let cwdBase: string;
let prevCwd: string;

beforeAll(() => {
  prevCwd = process.cwd();
  cwdBase = mkdtempSync(join(tmpdir(), 'spec-core-mcp-cwd-'));
  process.chdir(cwdBase);
});

afterAll(() => {
  process.chdir(prevCwd);
  rmSync(cwdBase, { recursive: true, force: true });
});

function freshRoot(prefix: string): string {
  const root = mkdtempSync(join(cwdBase, prefix));
  tmpDirs.push(root);
  return root;
}

/** A root OUTSIDE the effective default root (a sibling of cwdBase, not under it). */
function freshOutside(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(root);
  return root;
}

function makeSpecRoot(bundle: Record<string, unknown>): string {
  const root = freshRoot('spec-core-mcp-');
  const spec = join(root, 'spec');
  mkdirSync(spec);
  for (const name of [...SECTION_FILES, 'legacy'] as const) {
    if (bundle[name] === undefined) continue;
    writeFileSync(join(spec, `${name}.json`), JSON.stringify(bundle[name], null, 2));
  }
  return root;
}

/** A full spec root OUTSIDE the effective default root (SEC-003 refusal fixtures). */
function makeOutsideSpecRoot(bundle: Record<string, unknown>): string {
  const root = freshOutside('spec-core-mcp-outside-');
  const spec = join(root, 'spec');
  mkdirSync(spec);
  for (const name of [...SECTION_FILES, 'legacy'] as const) {
    if (bundle[name] === undefined) continue;
    writeFileSync(join(spec, `${name}.json`), JSON.stringify(bundle[name], null, 2));
  }
  return root;
}

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // Anti-F18 guard at unit level too: the RPC core may NEVER touch stdout.
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  tmpDirs.length = 0;
});

/** handleRpcLine but asserting a response came back; parses it as JSON-RPC. */
async function rpc(
  line: string,
  options?: {
    allowExec?: boolean;
    allowGenerate?: boolean;
    env?: NodeJS.ProcessEnv;
    llm?: unknown;
    /** §17 named-profile config text (tests inject the operator's config). */
    llmConfigText?: string;
  },
): Promise<Record<string, any>> {
  const raw = await handleRpcLine(line, options);
  expect(raw).not.toBeNull();
  return JSON.parse(raw!) as Record<string, any>;
}

/** One tools/call as a typed convenience (the PROD-004 tool tests). */
async function callTool(
  name: string,
  args: Record<string, unknown>,
  options?: { allowExec?: boolean; allowGenerate?: boolean; env?: NodeJS.ProcessEnv; llm?: unknown; llmConfigText?: string },
): Promise<Record<string, any>> {
  return rpc(
    `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"${name}","arguments":${JSON.stringify(
      args,
    )}}}`,
    options,
  );
}

/** The tool result's text content (every tool returns exactly one text part). */
function text(res: Record<string, any>): string {
  return res.result.content[0].text as string;
}

/** Extract the consent digest any refusal/preview advertises. */
function digestFrom(textValue: string): string {
  const m = /consent digest: (sha256:[0-9a-f]{64})/.exec(textValue);
  expect(m, `output must advertise a consent digest, got: ${textValue}`).not.toBeNull();
  return m![1];
}

// --- initialize ----------------------------------------------------------------


const SHA =
  'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

/**
 * Inline fully-conforming bundle (T7): the MCP happy-path calls need a
 * lint-clean spec before T8 conforms the fixtures (L13/L14).
 */
function inlineConforming(): Record<string, unknown> {
  return {
    manifest: {
      spec_schema: 'lco-spec/1.0',
      spec_version: 1,
      project: { name: 'mini', mode: 'greenfield' },
      complexity_profile: 'p-mini',
      evidence_snapshot: { pack_hash: SHA, collected_at: '2026-08-27T00:00:00Z' },
      state: 'draft',
      council_run: { run_id: 't', config_fingerprint: 't' },
      artifact_hashes: {},
      unresolved_count: 0,
      blocking_count: 0,
      target_runtime: { platform: 'node', stack: 'ts' },
    },
    intent: { statement: 's', normalized: 'n' },
    glossary: [{ term: 'Term', definition: 'd' }],
    assumptions: [],
    evidence: [{ id: 'E-0001', kind: 'user_input', source: 's', hash: SHA }],
    requirements: [
      {
        id: 'REQ-0001',
        statement: 'must work',
        priority: 'must',
        evidence: ['E-0001'],
        acceptance_refs: ['TST-0001'],
        terms_used: [],
      },
    ],
    decisions: [
      {
        claim_id: 'DEC-0001',
        decision: 'd',
        rationale: 'r',
        evidence: ['E-0001'],
        confidence: 1,
        impact: 'low',
        assumptions: [],
        alternatives: [],
        status: 'accepted',
      },
    ],
    contracts: [],
    tasks: [
      {
        task_id: 'TASK-0001',
        title: 't',
        purpose: 'p',
        refs: { requirements: ['REQ-0001'], architecture: [], decisions: ['DEC-0001'] },
        depends_on: [],
        preconditions: ['c'],
        permitted_scope: ['src/**'],
        protected: [],
        interface_changes: [],
        invariants: ['i'],
        instructions: 'do',
        tests: [
          { id: 'TST-0001', kind: 'unit', file: 'a.test.ts', cases: ['REQ-0001: works'] },
        ],
        verification: [{ command: 'node --version', expect: 'exit 0' }],
        acceptance: ['a'],
        rollback: 'r',
        completion_evidence: { required: ['test_summary'] },
        risk: { level: 'low', note: '' },
        complexity: 'xs',
      },
    ],
    test_files: ['a.test.ts'],
  };
}

describe('handleRpcLine: initialize', () => {
  it('returns the fixed handshake shape with the id echoed', async () => {
    const res = await rpc('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}');

    expect(res.id).toBe(1);
    expect(res.result).toEqual({
      protocolVersion: '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'lco-mcp', version: '0.1.0' },
    });
  });
});

// --- notifications -------------------------------------------------------------

describe('handleRpcLine: notifications', () => {
  it('notifications/initialized (no id) -> null (no response)', async () => {
    expect(
      await handleRpcLine('{"jsonrpc":"2.0","method":"notifications/initialized"}'),
    ).toBeNull();
  });
});

// --- tools/list ----------------------------------------------------------------

describe('handleRpcLine: tools/list', () => {
  it('returns exactly the 13 engine tools, dir required on each, additionalProperties:false everywhere', async () => {
    const res = await rpc('{"jsonrpc":"2.0","id":9,"method":"tools/list"}');

    const names = (res.result.tools as Array<Record<string, any>>).map((t) => t.name);
    expect(names).toEqual([
      'lco_compile',
      'lco_lint',
      'lco_freeze',
      'lco_verify',
      'lco_trace',
      'lco_plan',
      'lco_check',
      'lco_init',
      'lco_generate',
      'lco_change',
      'lco_renew_status',
      'lco_renew_export',
      'lco_renew_analyze',
    ]);
    const requiredByName: Record<string, string[]> = {
      lco_compile: ['dir'],
      lco_lint: ['dir'],
      lco_freeze: ['dir'],
      lco_verify: ['dir'],
      lco_trace: ['dir'],
      lco_plan: ['dir'],
      lco_check: ['dir'],
      lco_init: ['dir'],
      lco_generate: ['dir', 'intent'],
      lco_change: ['dir', 'changeset'],
      lco_renew_status: ['dir'],
      lco_renew_export: ['dir'],
      lco_renew_analyze: ['dir'],
    };
    for (const tool of res.result.tools as Array<Record<string, any>>) {
      expect(typeof tool.description).toBe('string');
      expect(tool.description.length).toBeGreaterThan(10);
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.required).toEqual(requiredByName[tool.name]);
      expect(tool.inputSchema.additionalProperties).toBe(false);
      expect(typeof tool.inputSchema.properties.dir).toBe('object');
    }
    // The optional flags land in exactly the tools the brief assigns them to.
    // SEC-002: lco_check carries NO `yes` — execution consent is the
    // {consent:{digest}} object, bound to the dry-run preview digest and only
    // honored on an LCO_MCP_ALLOW_EXEC=1 server.
    const byName = new Map(
      (res.result.tools as Array<Record<string, any>>).map((t) => [t.name, t.inputSchema.properties]),
    );
    expect(Object.keys(byName.get('lco_plan')!)).toEqual(['dir', 'json']);
    const checkProps = byName.get('lco_check')!;
    expect(Object.keys(checkProps)).toEqual(['dir', 'task', 'consent']);
    expect(checkProps.consent.required).toEqual(['digest']);
    expect(JSON.stringify(checkProps)).not.toContain('"yes"');
    // PROD-004: the three creation/evolution tools advertise their surfaces;
    // lco_generate never advertises `yes` or any adapter/env parameter.
    expect(Object.keys(byName.get('lco_init')!)).toEqual(['dir', 'profile', 'name']);
    const genProps = byName.get('lco_generate')!;
    expect(Object.keys(genProps)).toEqual(['dir', 'intent', 'variant', 'profile', 'llmProfile', 'consent']);
    expect(genProps.consent.required).toEqual(['digest']);
    expect(JSON.stringify(genProps)).not.toContain('"yes"');
    expect(Object.keys(byName.get('lco_change')!)).toEqual(['dir', 'changeset']);
  });
});

// --- tools/call: the engine over real tmp spec dirs -----------------------------

describe('handleRpcLine: tools/call', () => {
  it('lco_lint on a good (inline conforming) spec -> isError false, "0 errors" + exit-code line', async () => {
    const root = makeSpecRoot(inlineConforming());

    const res = await rpc(
      `{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"lco_lint","arguments":{"dir":${JSON.stringify(root)}}}}`,
    );

    expect(res.id).toBe(2);
    expect(res.result.isError).toBe(false);
    expect(res.result.content).toHaveLength(1);
    expect(res.result.content[0].type).toBe('text');
    expect(res.result.content[0].text).toContain('0 errors');
    expect(res.result.content[0].text).toContain('exit code: 0');
  });

  it('lco_lint on bad/L02 -> isError true with L02 in the text', async () => {
    const root = makeSpecRoot(loadBundle('bad/L02/bundle.json'));

    const res = await rpc(
      `{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"lco_lint","arguments":{"dir":${JSON.stringify(root)}}}}`,
    );

    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toContain('L02');
    expect(res.result.content[0].text).toContain('exit code: 1');
  });

  it('lco_check without yes -> DRY RUN banner, isError false (nothing executes)', async () => {
    const root = makeSpecRoot(inlineConforming());

    const res = await rpc(
      `{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"lco_check","arguments":{"dir":${JSON.stringify(root)}}}}`,
    );

    expect(res.result.isError).toBe(false);
    expect(res.result.content[0].text).toContain('DRY RUN');
    expect(existsSync(join(root, 'spec', 'evidence'))).toBe(false);
  });

  it('lco_freeze then lco_verify round-trip -> both isError false', async () => {
    const root = makeSpecRoot(inlineConforming());
    const call = (id: number, name: string) =>
      rpc(
        `{"jsonrpc":"2.0","id":${id},"method":"tools/call","params":{"name":"${name}","arguments":{"dir":${JSON.stringify(root)}}}}`,
      );

    const frozen = await call(5, 'lco_freeze');
    expect(frozen.result.isError).toBe(false);
    expect(frozen.result.content[0].text).toContain('frozen at');

    const verified = await call(6, 'lco_verify');
    expect(verified.result.isError).toBe(false);
    expect(verified.result.content[0].text).toContain('verify OK');
  });

  it('lco_plan with json:true -> machine-readable plan inside the text', async () => {
    const root = makeSpecRoot(inlineConforming());

    const res = await rpc(
      `{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"lco_plan","arguments":{"dir":${JSON.stringify(root)},"json":true}}}`,
    );

    expect(res.result.isError).toBe(false);
    const text: string = res.result.content[0].text;
    const firstLine = text.slice(0, text.indexOf('\n'));
    const plan = JSON.parse(firstLine); // the report line is exactly the JSON
    expect(Array.isArray(plan.order)).toBe(true);
    expect(Object.keys(plan.tasks).length).toBe(plan.order.length);
  });

  it('unknown tool name -> JSON-RPC error with the id echoed', async () => {
    const res = await rpc(
      '{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"lco_nope","arguments":{"dir":"/tmp"}}}',
    );

    expect(res.id).toBe(8);
    expect(res.error).toBeTruthy();
    expect(res.error.code).toBe(-32602);
    expect(res.error.message).toContain('lco_nope');
  });

  it('missing dir argument -> -32602 invalid params (fail-closed, the core never sees it)', async () => {
    const res = await rpc(
      '{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"lco_lint","arguments":{}}}',
    );

    expect(res.id).toBe(9);
    expect(res.error.code).toBe(-32602);
    expect(res.error.message).toContain('dir');
  });

  it.skipIf((process.getuid?.() ?? 1000) === 0)(
    'BINDING throw-catch: a failing command core becomes an isError tool result, never a crash (non-root: DAC must bite)',
    async () => {
    // The old variant chmod-ed manifest.json 0444 and relied on freeze's
    // truncate-in-place write failing with EACCES — the exact defect DATA-001
    // removed (rename replaces a read-only file). The atomic writer now
    // stages temps in spec/, so the deterministic core failure is an
    // unwritable spec/ DIRECTORY: temp creation throws EACCES out of
    // cmdFreeze exactly like any environment failure.
    const root = makeSpecRoot(inlineConforming());
    chmodSync(join(root, 'spec'), 0o555);
    try {
      const res = await rpc(
        `{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"lco_freeze","arguments":{"dir":${JSON.stringify(root)}}}}`,
      );

      expect(res.id).toBe(10);
      expect(res.result.isError).toBe(true);
      expect(res.result.content[0].text).toContain('command failed');
      // Diagnostics for the throw went to stderr (console.error), never stdout.
      expect(errorSpy.mock.calls.length).toBeGreaterThan(0);
      expect(logSpy.mock.calls).toHaveLength(0);
    } finally {
      chmodSync(join(root, 'spec'), 0o755); // restore so afterEach rmSync can clean up
    }
  });

  it('a full session of calls never touches console.log (stdout purity)', async () => {
    const root = makeSpecRoot(loadBundle('good/pet-clinic/bundle.json'));
    const dir = JSON.stringify(root);
    await handleRpcLine('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}');
    await handleRpcLine('{"jsonrpc":"2.0","method":"notifications/initialized"}');
    await handleRpcLine('{"jsonrpc":"2.0","id":2,"method":"tools/list"}');
    await handleRpcLine(
      `{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"lco_compile","arguments":{"dir":${dir}}}}`,
    );
    await handleRpcLine('{"jsonrpc":"2.0","id":4,"method":"no/such/method"}');
    expect(logSpy.mock.calls).toHaveLength(0);
  });
});

// --- protocol-level errors -----------------------------------------------------

describe('handleRpcLine: protocol errors', () => {
  it('malformed JSON line -> error response with id null (-32700)', async () => {
    const res = await rpc('{"id":7, this is not json');

    expect(res.id).toBeNull();
    expect(res.error.code).toBe(-32700);
  });

  it('non-object line (array) -> error response with id null (-32600)', async () => {
    const res = await rpc('[1,2,3]');
    expect(res.id).toBeNull();
    expect(res.error.code).toBe(-32600);
  });

  it('unknown method with id -> -32601 with the id echoed', async () => {
    const res = await rpc('{"jsonrpc":"2.0","id":42,"method":"resources/list"}');

    expect(res.id).toBe(42);
    expect(res.error.code).toBe(-32601);
    expect(res.error.message).toContain('resources/list');
  });

  it('unknown method WITHOUT id (notification) -> null', async () => {
    expect(await handleRpcLine('{"jsonrpc":"2.0","method":"resources/list"}')).toBeNull();
  });

  it('request missing a method -> -32600 invalid request', async () => {
    const res = await rpc('{"jsonrpc":"2.0","id":5,"params":{}}');
    expect(res.id).toBe(5);
    expect(res.error.code).toBe(-32600);
  });
});

// --- SEC-006: full JSON-RPC 2.0 envelope validation (conformance battery) ----------
//
// The audit's confirmed defects were the RED cases here: a "1.0" runtime
// version was ACCEPTED (and dispatched), an object id was ECHOED, and params /
// unknown fields / batches were never considered. Every case below pins the
// envelope gate BEFORE dispatch — a nonconformant envelope must never reach a
// tool, and an invalid id must never be reflected back (amplification).

describe('handleRpcLine: JSON-RPC 2.0 envelope conformance (SEC-006)', () => {
  it('jsonrpc MUST be exactly "2.0": "1.0" is refused, never dispatched (-32600)', async () => {
    const res = await rpc('{"jsonrpc":"1.0","id":1,"method":"initialize","params":{}}');
    expect(res.id).toBe(1);
    expect(res.error.code).toBe(-32600);
    expect(res.error.message).toContain('2.0');
  });

  it('missing jsonrpc field is refused (-32600), not silently treated as 2.0', async () => {
    const res = await rpc('{"id":2,"method":"initialize","params":{}}');
    expect(res.error.code).toBe(-32600);
    expect(res.error.message).toContain('jsonrpc');
  });

  it('jsonrpc as a NUMBER (2.0) is refused — the field is the string "2.0"', async () => {
    const res = await rpc('{"jsonrpc":2.0,"id":3,"method":"tools/list"}');
    expect(res.error.code).toBe(-32600);
  });

  it('OBJECT id is refused (-32600) and NEVER echoed: the response id is null', async () => {
    const evil = { inject: 'amplify-me' };
    const res = await rpc(
      `{"jsonrpc":"2.0","id":${JSON.stringify(evil)},"method":"initialize","params":{}}`,
    );
    expect(res.error.code).toBe(-32600);
    expect(res.id).toBeNull(); // the object is not echoed
    expect(JSON.stringify(res)).not.toContain('amplify-me');
  });

  it('ARRAY id and BOOLEAN id are refused (-32600), id null, never echoed', async () => {
    const arr = await rpc('{"jsonrpc":"2.0","id":[1,2],"method":"initialize","params":{}}');
    expect(arr.error.code).toBe(-32600);
    expect(arr.id).toBeNull();

    const bool = await rpc('{"jsonrpc":"2.0","id":true,"method":"initialize","params":{}}');
    expect(bool.error.code).toBe(-32600);
    expect(bool.id).toBeNull();
  });

  it('valid id types pass the gate: string, integer, and explicit null are echoed', async () => {
    const str = await rpc('{"jsonrpc":"2.0","id":"abc","method":"tools/list"}');
    expect(str.id).toBe('abc');
    expect(str.result).toBeTruthy();

    const float = await rpc('{"jsonrpc":"2.0","id":1.5,"method":"tools/list"}');
    expect(float.id).toBe(1.5);
    expect(float.result).toBeTruthy();

    const nil = await rpc('{"jsonrpc":"2.0","id":null,"method":"tools/list"}');
    expect(nil.id).toBeNull();
    expect(nil.result).toBeTruthy();
  });

  it('params must be an OBJECT when present (MCP named-parameters stance): array/string -> -32600', async () => {
    const arr = await rpc('{"jsonrpc":"2.0","id":7,"method":"initialize","params":[1,2]}');
    expect(arr.error.code).toBe(-32600);
    expect(arr.error.message).toContain('params');

    const str = await rpc('{"jsonrpc":"2.0","id":8,"method":"initialize","params":"x"}');
    expect(str.error.code).toBe(-32600);
  });

  it('unknown top-level envelope fields are refused (-32600), never ignored', async () => {
    const res = await rpc('{"jsonrpc":"2.0","id":9,"method":"initialize","params":{},"extra":1}');
    expect(res.error.code).toBe(-32600);
    expect(res.error.message).toContain('extra');
  });

  it('batches are refused with a SINGLE invalid-request error naming the no-batch stance', async () => {
    const res = await rpc(
      '[{"jsonrpc":"2.0","id":1,"method":"initialize"},{"jsonrpc":"2.0","id":2,"method":"tools/list"}]',
    );
    expect(res.id).toBeNull();
    expect(res.error.code).toBe(-32600);
    expect(res.error.message).toContain('batch');
  });

  it('invalid envelope WITHOUT an id still gets the id:null error (only VALID notifications are silent)', async () => {
    // A notification (silent) requires a VALID envelope; this one has no method.
    const res = await rpc('{"jsonrpc":"2.0","params":{}}');
    expect(res.id).toBeNull();
    expect(res.error.code).toBe(-32600);
  });

  it('a VALID notification stays silent — unknown method, no id -> null', async () => {
    expect(await handleRpcLine('{"jsonrpc":"2.0","method":"resources/list"}')).toBeNull();
  });

  it('notifications/* WITH an id is a REQUEST: -32601 with the id echoed (SEC-006 residual)', async () => {
    // JSON-RPC 2.0: silence is defined by the ABSENCE of id, never by the
    // method name. The old `method.startsWith('notifications/')` drop was a
    // conformance defect — a Request object with an id MUST get a response.
    const res = await rpc('{"jsonrpc":"2.0","id":5,"method":"notifications/initialized"}');
    expect(res.id).toBe(5);
    expect(res.error.code).toBe(-32601);
    expect(res.error.message).toContain('notifications/initialized');

    const cancelled = await rpc('{"jsonrpc":"2.0","id":"c1","method":"notifications/cancelled","params":{}}');
    expect(cancelled.id).toBe('c1');
    expect(cancelled.error.code).toBe(-32601);
    expect(cancelled.error.message).toContain('notifications/cancelled');
  });

  it('notifications/* with an explicit null id also gets the -32601 response (id present = request)', async () => {
    const res = await rpc('{"jsonrpc":"2.0","id":null,"method":"notifications/initialized"}');
    expect(res.id).toBeNull();
    expect(res.error.code).toBe(-32601);
  });

  it('empty-string method with an id -> -32600', async () => {
    const res = await rpc('{"jsonrpc":"2.0","id":11,"method":"","params":{}}');
    expect(res.error.code).toBe(-32600);
  });
});

// --- tools/call lco_init (PROD-004) --------------------------------------------------

describe('handleRpcLine: lco_init', () => {
  it('scaffolds a working example spec: 9 files, draft/v1, CLI-mirroring output', async () => {
    const root = freshRoot('spec-core-mcp-init-');

    const res = await callTool('lco_init', { dir: root });

    expect(res.result.isError).toBe(false);
    expect(text(res)).toContain(`initialized ${root}/spec (profile p-mini, my-project) with 9 section files`);
    expect(text(res)).toContain('spec/manifest.json');
    expect(text(res)).toContain('WORKING EXAMPLE spec');
    expect(text(res)).toContain('exit code: 0');

    const manifest = JSON.parse(readFileSync(join(root, 'spec', 'manifest.json'), 'utf8'));
    expect(manifest.state).toBe('draft');
    expect(manifest.spec_version).toBe(1);
    // The scaffold is a real spec: it compiles + lints clean through MCP too.
    const lint = await callTool('lco_lint', { dir: root });
    expect(lint.result.isError).toBe(false);
    expect(text(lint)).toContain('0 errors');
  });

  it('profile/name params flow through the CLI contract (p-standard: OPS-0001 + 2 tasks)', async () => {
    const root = freshRoot('spec-core-mcp-init-std-');

    const res = await callTool('lco_init', { dir: root, profile: 'p-standard', name: 'named-via-mcp' });

    expect(res.result.isError).toBe(false);
    expect(text(res)).toContain('profile p-standard, named-via-mcp');
    const manifest = JSON.parse(readFileSync(join(root, 'spec', 'manifest.json'), 'utf8'));
    expect(manifest.complexity_profile).toBe('p-standard');
    expect(manifest.project.name).toBe('named-via-mcp');
    const tasks = JSON.parse(readFileSync(join(root, 'spec', 'tasks.json'), 'utf8'));
    expect(tasks).toHaveLength(2);
    const reqs = JSON.parse(readFileSync(join(root, 'spec', 'requirements.json'), 'utf8'));
    expect(reqs.some((r: { id: string }) => r.id === 'OPS-0001')).toBe(true);
  });

  it('NO-CLOBBER: init on an existing root refuses (isError, exit 2) and disk is untouched', async () => {
    const root = freshRoot('spec-core-mcp-init-clobber-');
    mkdirSync(join(root, 'spec'), { recursive: true });
    writeFileSync(join(root, 'spec', 'manifest.json'), 'sentinel-content', 'utf8');

    const res = await callTool('lco_init', { dir: root });

    expect(res.result.isError).toBe(true);
    expect(text(res)).toContain('refusing to overwrite existing spec/');
    expect(text(res)).toContain('exit code: 2');
    expect(readFileSync(join(root, 'spec', 'manifest.json'), 'utf8')).toBe('sentinel-content');
  });

  it("invalid profile value → -32602 naming the expected values (CLI-mirroring message)", async () => {
    const root = freshRoot('spec-core-mcp-init-bad-');

    const res = await callTool('lco_init', { dir: root, profile: 'p-huge' });

    expect(res.error.code).toBe(-32602);
    expect(res.error.message).toContain('p-mini or p-standard');
    expect(existsSync(join(root, 'spec'))).toBe(false);
  });

  it('empty name → -32602, nothing written', async () => {
    const root = freshRoot('spec-core-mcp-init-name-');

    const res = await callTool('lco_init', { dir: root, name: '' });

    expect(res.error.code).toBe(-32602);
    expect(res.error.message).toContain('name');
    expect(existsSync(join(root, 'spec'))).toBe(false);
  });
});

// --- tools/call lco_generate (PROD-004: paid-call consent) --------------------------

/**
 * Counting scripted LLM (the generate.test.ts makeLlm pattern): records every
 * call, throws beyond the script. Paid-call discipline: tests inject ONLY
 * this mock — no test in this suite may make a live LLM call.
 */
function makeLlm(responses: string[]): { llm: LlmAdapter; calls: () => number } {
  let n = 0;
  const llm: LlmAdapter = {
    async complete(prompt: string): Promise<LlmResponse> {
      n += 1;
      void prompt;
      const out = responses[n - 1];
      if (out === undefined) {
        throw new Error(`test-llm: unexpected call #${n} (script has ${responses.length})`);
      }
      return { text: out, usage: { in_tokens: 10 * n, out_tokens: 5 * n } };
    },
  };
  return { llm, calls: () => n };
}

/** inlineConforming() with an UNRESOLVED decision leak (the blocked outcome). */
function inlineUnresolved(): Record<string, unknown> {
  const bundle = inlineConforming();
  ((bundle.decisions as Array<Record<string, unknown>>)[0] as Record<string, unknown>).status =
    'UNRESOLVED';
  (bundle.manifest as Record<string, unknown>).unresolved_count = 1;
  return bundle;
}

describe('handleRpcLine: lco_generate (PROD-004 paid-call consent)', () => {
  const INTENT = 'build a small pet clinic scheduler';

  it('NO consent → structured refusal carrying the request digest; ZERO adapter calls, nothing written', async () => {
    const root = freshRoot('spec-core-mcp-gen-noconsent-');
    const { llm, calls } = makeLlm([JSON.stringify(inlineConforming())]);

    const res = await callTool('lco_generate', { dir: root, intent: INTENT, variant: 'single', profile: 'p-mini' }, { llm });

    expect(res.result.isError).toBe(true);
    expect(text(res)).toContain('generation refused');
    expect(text(res)).toContain('LCO_MCP_ALLOW_GENERATE');
    expect(text(res)).toContain('ZERO LLM calls');
    expect(text(res)).toMatch(/consent digest: sha256:[0-9a-f]{64}/);
    expect(text(res)).toContain('exit code: 2');
    expect(calls()).toBe(0); // THE paid-call guarantee: refusal made no call
    expect(existsSync(join(root, 'spec'))).toBe(false);
    // The advertised digest is exactly the digest of this request's content.
    expect(digestFrom(text(res))).toBe(generateConsentDigest(INTENT, 'p-mini', 'single'));
  });

  it('consent WITHOUT the server opt-in → refusal naming the flag; ZERO adapter calls', async () => {
    const root = freshRoot('spec-core-mcp-gen-nooptin-');
    const { llm, calls } = makeLlm([JSON.stringify(inlineConforming())]);
    const digest = generateConsentDigest(INTENT, 'p-mini', 'single');

    const res = await callTool(
      'lco_generate',
      { dir: root, intent: INTENT, variant: 'single', profile: 'p-mini', consent: { digest } },
      { llm }, // deliberately NOT allowGenerate — a plainly started server
    );

    expect(res.result.isError).toBe(true);
    expect(text(res)).toContain('generation refused');
    expect(text(res)).toContain('LCO_MCP_ALLOW_GENERATE=1');
    expect(calls()).toBe(0);
    expect(existsSync(join(root, 'spec'))).toBe(false);
    // The env form refuses identically (per-request env read, no process.env mutation).
    const viaEnv = await callTool(
      'lco_generate',
      { dir: root, intent: INTENT, variant: 'single', profile: 'p-mini', consent: { digest } },
      { llm, env: { LCO_MCP_ALLOW_GENERATE: 'true' } }, // 'true' fails closed
    );
    expect(viaEnv.result.isError).toBe(true);
    expect(calls()).toBe(0);
  });

  it('opted-in but WRONG digest → mismatch naming both digests; ZERO adapter calls', async () => {
    const root = freshRoot('spec-core-mcp-gen-mismatch-');
    const { llm, calls } = makeLlm([JSON.stringify(inlineConforming())]);
    const wrong = 'sha256:' + 'f'.repeat(64);

    const res = await callTool(
      'lco_generate',
      { dir: root, intent: INTENT, variant: 'single', profile: 'p-mini', consent: { digest: wrong } },
      { allowGenerate: true, llm },
    );

    expect(res.result.isError).toBe(true);
    expect(text(res)).toContain('digest mismatch');
    expect(text(res)).toContain(wrong);
    expect(text(res)).toContain(generateConsentDigest(INTENT, 'p-mini', 'single'));
    expect(calls()).toBe(0);
    expect(existsSync(join(root, 'spec'))).toBe(false);
  });

  it('the digest binds CONTENT: a digest from a different intent never authorizes', async () => {
    const root = freshRoot('spec-core-mcp-gen-bind-');
    const { llm, calls } = makeLlm([JSON.stringify(inlineConforming())]);
    const otherIntentDigest = generateConsentDigest('a DIFFERENT intent', 'p-mini', 'single');

    const res = await callTool(
      'lco_generate',
      { dir: root, intent: INTENT, variant: 'single', profile: 'p-mini', consent: { digest: otherIntentDigest } },
      { allowGenerate: true, llm },
    );

    expect(res.result.isError).toBe(true);
    expect(text(res)).toContain('digest mismatch');
    expect(calls()).toBe(0);
  });

  it('digest binds RESOLVED content: omitted defaults hash identically to explicit single/p-standard (UX-001 ruling)', async () => {
    const root = freshRoot('spec-core-mcp-gen-resolved-');
    // Omitted variant/profile resolve to single/p-standard (T11: single is the
    // conservative default; council is explicit) — the refusal must advertise
    // the digest of the RESOLVED content, so a client that then sends explicit
    // single/p-standard with that digest is authorized.
    const refusal = await callTool('lco_generate', { dir: root, intent: INTENT }, {
      allowGenerate: true,
      llm: makeLlm([]).llm,
    });
    expect(refusal.result.isError).toBe(true);
    const digest = digestFrom(text(refusal));
    expect(digest).toBe(generateConsentDigest(INTENT, 'p-standard', 'single'));
  });

  it('the full consent chain (mock adapter) → generation runs, gates inherited, draft/v1 written', async () => {
    const root = freshRoot('spec-core-mcp-gen-full-');
    const { llm, calls } = makeLlm([JSON.stringify(inlineConforming())]);
    const digest = generateConsentDigest(INTENT, 'p-mini', 'single');

    const res = await callTool(
      'lco_generate',
      { dir: root, intent: INTENT, variant: 'single', profile: 'p-mini', consent: { digest } },
      { allowGenerate: true, llm },
    );

    expect(res.result.isError).toBe(false);
    expect(calls()).toBe(1);
    expect(text(res)).toContain('generated spec/');
    expect(text(res)).toContain('state: draft');
    const manifest = JSON.parse(readFileSync(join(root, 'spec', 'manifest.json'), 'utf8'));
    expect(manifest.state).toBe('draft');
    expect(manifest.spec_version).toBe(1);
    expect(manifest.complexity_profile).toBe('p-mini');
    // The generated tree is a real spec: lint-clean through the MCP surface.
    const lint = await callTool('lco_lint', { dir: root });
    expect(lint.result.isError).toBe(false);
    expect(text(lint)).toContain('0 errors');
  });

  it('blocked outcome (evidence gate) surfaces through MCP: isError, reasons, NOTHING written', async () => {
    const root = freshRoot('spec-core-mcp-gen-blocked-');
    const { llm, calls } = makeLlm([JSON.stringify(inlineUnresolved())]);
    const digest = generateConsentDigest('stock tool, database undecided', 'p-mini', 'single');

    const res = await callTool(
      'lco_generate',
      { dir: root, intent: 'stock tool, database undecided', variant: 'single', profile: 'p-mini', consent: { digest } },
      { allowGenerate: true, llm },
    );

    expect(res.result.isError).toBe(true);
    expect(calls()).toBe(1);
    expect(text(res)).toContain('blocked by the evidence gate');
    expect(text(res)).toContain('L08');
    expect(existsSync(join(root, 'spec'))).toBe(false);
  });

  it('councilDegraded surfaces in the tool response (BACK-008 line, still fully gated)', async () => {
    const root = freshRoot('spec-core-mcp-gen-degraded-');
    const { llm, calls } = makeLlm([
      JSON.stringify({ profile: 'p-mini', must_be_blocked: false }),
      'proposal A prose, not json',
      'proposal A retry, still not json',
      JSON.stringify(inlineConforming()),
    ]);
    const digest = generateConsentDigest(INTENT, 'p-mini', 'council');

    const res = await callTool(
      'lco_generate',
      { dir: root, intent: INTENT, variant: 'council', profile: 'p-mini', consent: { digest } },
      { allowGenerate: true, llm },
    );

    expect(res.result.isError).toBe(false);
    expect(calls()).toBe(4);
    expect(text(res)).toContain('DEGRADED');
    expect(text(res)).toContain('proposal A');
    expect(existsSync(join(root, 'spec', 'manifest.json'))).toBe(true);
  });

  it('no-clobber through MCP: generate onto an existing spec/ refuses with ZERO adapter calls', async () => {
    const root = freshRoot('spec-core-mcp-gen-clobber-');
    mkdirSync(join(root, 'spec'), { recursive: true });
    writeFileSync(join(root, 'spec', 'manifest.json'), 'sentinel-content', 'utf8');
    const { llm, calls } = makeLlm([JSON.stringify(inlineConforming())]);
    const digest = generateConsentDigest(INTENT, 'p-mini', 'single');

    const res = await callTool(
      'lco_generate',
      { dir: root, intent: INTENT, variant: 'single', profile: 'p-mini', consent: { digest } },
      { allowGenerate: true, llm },
    );

    expect(res.result.isError).toBe(true);
    expect(text(res)).toContain('refusing to overwrite');
    expect(calls()).toBe(0);
    expect(readFileSync(join(root, 'spec', 'manifest.json'), 'utf8')).toBe('sentinel-content');
  });

  it('omitted variant defaults to SINGLE (UX-001 ruling): full chain makes exactly 1 call', async () => {
    const root = freshRoot('spec-core-mcp-gen-single-default-');
    const { llm, calls } = makeLlm([JSON.stringify(inlineConforming())]);
    // profile is explicit p-mini (inlineConforming is a p-mini bundle); the
    // VARIANT is omitted — it must resolve to single, not council.
    const digest = generateConsentDigest(INTENT, 'p-mini', 'single');

    const res = await callTool(
      'lco_generate',
      { dir: root, intent: INTENT, profile: 'p-mini', consent: { digest } }, // no variant passed
      { allowGenerate: true, llm },
    );

    expect(res.result.isError).toBe(false);
    expect(calls()).toBe(1); // single: one paid call — council is explicit
    expect(text(res)).toContain('single');
  });

  it('oversized intent (UX-004): the inline 10k cap is enforced at the ARG layer, ZERO adapter calls', async () => {
    const root = freshRoot('spec-core-mcp-gen-bigintent-');
    const bigIntent = 'y'.repeat(10_001);
    const { llm, calls } = makeLlm([JSON.stringify(inlineConforming())]);

    // The arg layer refuses before any consent/digest/adapter work: -32602.
    const res = await callTool(
      'lco_generate',
      { dir: root, intent: bigIntent, variant: 'single', profile: 'p-mini' },
      { allowGenerate: true, llm },
    );

    expect(res.error!.code).toBe(-32602);
    expect(res.error!.message).toContain('capped at');
    expect(calls()).toBe(0);
    expect(existsSync(join(root, 'spec'))).toBe(false);
  });

  it('full chain but NO live LLM env and no injected adapter → the fail-closed LCO_LLM_* refusal (never invents keys)', async () => {
    const root = freshRoot('spec-core-mcp-gen-noenv-');
    vi.stubEnv('LCO_LLM_BASE_URL', '');
    vi.stubEnv('LCO_LLM_API_KEY', '');
    vi.stubEnv('LCO_LLM_MODEL', '');
    const digest = generateConsentDigest(INTENT, 'p-mini', 'single');

    const res = await callTool(
      'lco_generate',
      { dir: root, intent: INTENT, variant: 'single', profile: 'p-mini', consent: { digest } },
      { allowGenerate: true },
    );

    expect(res.result.isError).toBe(true);
    expect(text(res)).toContain('live mode requires LCO_LLM_* env vars');
    expect(text(res)).toContain('exit code: 2');
    expect(existsSync(join(root, 'spec'))).toBe(false);
  });

  it('argument surface: missing intent → -32602; bad variant/profile → -32602 with CLI-mirroring messages', async () => {
    const root = freshRoot('spec-core-mcp-gen-args-');

    const missing = await callTool('lco_generate', { dir: root });
    expect(missing.error.code).toBe(-32602);
    expect(missing.error.message).toContain('intent');

    const badVariant = await callTool('lco_generate', { dir: root, intent: 'x', variant: 'committee' });
    expect(badVariant.error.code).toBe(-32602);
    expect(badVariant.error.message).toContain('single or council');

    const badProfile = await callTool('lco_generate', { dir: root, intent: 'x', profile: 'p-huge' });
    expect(badProfile.error.code).toBe(-32602);
    expect(badProfile.error.message).toContain('p-mini or p-standard');

    const emptyIntent = await callTool('lco_generate', { dir: root, intent: '' });
    expect(emptyIntent.error.code).toBe(-32602);
    expect(existsSync(join(root, 'spec'))).toBe(false);
  });
});

// --- tools/call lco_change (PROD-004) ------------------------------------------------

/** Byte-exact snapshot of every file under spec/ (the byte-identity oracle). */
function snapshotSpec(root: string): Map<string, Buffer> {
  const spec = join(root, 'spec');
  const out = new Map<string, Buffer>();
  for (const entry of readdirSync(spec, { withFileTypes: true })) {
    if (entry.isFile()) out.set(entry.name, readFileSync(join(spec, entry.name)));
  }
  return out;
}

function expectIdentical(before: Map<string, Buffer>, root: string): void {
  const after = snapshotSpec(root);
  expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
  for (const [name, bytes] of before) {
    expect(after.get(name)).toEqual(bytes); // Buffer deep equality = byte-identical
  }
}

/** A frozen inline-conforming root, frozen through the MCP tool itself. */
async function frozenRoot(prefix: string): Promise<string> {
  const root = makeSpecRoot(inlineConforming());
  const frozen = await callTool('lco_freeze', { dir: root });
  expect(frozen.result.isError).toBe(false);
  return root;
}

describe('handleRpcLine: lco_change', () => {
  const TITLE_PATCH = {
    id: 'CP-0001',
    rationale: 'sharpen the example title',
    modified_tasks: [{ task_id: 'TASK-0001', patch: { title: 'renamed via MCP' } }],
  };

  it('happy path: inline changeset on a frozen spec → v2 draft, tasks.json rewritten, isError false', async () => {
    const root = await frozenRoot('spec-core-mcp-change-ok-');

    const res = await callTool('lco_change', { dir: root, changeset: TITLE_PATCH });

    expect(res.result.isError).toBe(false);
    expect(text(res)).toContain('changeset CP-0001 applied: spec_version 2 (state draft)');
    expect(text(res)).toContain('lint OK');
    const tasks = JSON.parse(readFileSync(join(root, 'spec', 'tasks.json'), 'utf8'));
    expect(tasks[0].title).toBe('renamed via MCP');
    const manifest = JSON.parse(readFileSync(join(root, 'spec', 'manifest.json'), 'utf8'));
    expect(manifest.spec_version).toBe(2);
    expect(manifest.state).toBe('draft');
  });

  it('lint-invalid changeset (L02 orphan added requirement) → gate refusal, disk BYTE-IDENTICAL', async () => {
    const root = await frozenRoot('spec-core-mcp-change-lint-');
    const before = snapshotSpec(root);
    const orphan = {
      id: 'CP-0002',
      rationale: 'adds a requirement no task references',
      added_requirements: [
        {
          id: 'REQ-0009',
          statement: 'The system shall orphan this requirement',
          priority: 'must',
          evidence: ['E-0001'],
          acceptance_refs: ['TST-0001'],
          terms_used: [],
        },
      ],
    };

    const res = await callTool('lco_change', { dir: root, changeset: orphan });

    expect(res.result.isError).toBe(true);
    expect(text(res)).toContain('rejected by the change gate');
    expect(text(res)).toContain('L02');
    expect(text(res)).toContain('nothing written');
    expectIdentical(before, root); // byte-identical refusal (BACK-005 through MCP)
  });

  it('strict envelope: a typo top-level key → ChangeSetSchema refusal, disk unchanged', async () => {
    const root = await frozenRoot('spec-core-mcp-change-typo-');
    const before = snapshotSpec(root);

    const res = await callTool('lco_change', {
      dir: root,
      changeset: { id: 'CP-0003', rationale: 'typo envelope', modified_taskz: [] },
    });

    expect(res.result.isError).toBe(true);
    expect(text(res)).toContain('ChangeSetSchema');
    expectIdentical(before, root);
  });

  it('non-frozen (draft) spec → the shared core refuses the transition', async () => {
    const root = makeSpecRoot(inlineConforming()); // state: draft, never frozen

    const res = await callTool('lco_change', { dir: root, changeset: TITLE_PATCH });

    expect(res.result.isError).toBe(true);
    expect(text(res)).toContain('cannot apply changeset');
  });

  it('changeset must be an object: array/string → -32602 at the parse layer', async () => {
    const root = await frozenRoot('spec-core-mcp-change-shape-');

    const arr = await callTool('lco_change', { dir: root, changeset: [1, 2] });
    expect(arr.error.code).toBe(-32602);
    const str = await callTool('lco_change', { dir: root, changeset: 'not-an-object' });
    expect(str.error.code).toBe(-32602);
    const missing = await callTool('lco_change', { dir: root });
    expect(missing.error.code).toBe(-32602);
    expect(missing.error.message).toContain('changeset');
  });
});

// --- unspoofability: the request can never grant itself capability -------------------

describe('handleRpcLine: consent chain unspoofability (PROD-004)', () => {
  it('allowExec/allowGenerate/llm/env/yes supplied IN THE REQUEST ARGS are refused (-32602)', async () => {
    const root = freshRoot('spec-core-mcp-spoof-');
    const attempts: Array<{ tool: string; args: Record<string, unknown> }> = [
      { tool: 'lco_generate', args: { dir: root, intent: 'x', allowExec: true } },
      { tool: 'lco_generate', args: { dir: root, intent: 'x', allowGenerate: true } },
      { tool: 'lco_generate', args: { dir: root, intent: 'x', llm: { complete: 'spoof' } } },
      { tool: 'lco_generate', args: { dir: root, intent: 'x', env: { LCO_MCP_ALLOW_GENERATE: '1' } } },
      { tool: 'lco_generate', args: { dir: root, intent: 'x', yes: true } },
      { tool: 'lco_check', args: { dir: root, allowExec: true } },
      { tool: 'lco_init', args: { dir: root, llm: 'spoof' } },
      { tool: 'lco_change', args: { dir: root, changeset: { id: 'a', rationale: 'b' }, allowGenerate: true } },
    ];
    for (const { tool, args } of attempts) {
      const res = await callTool(tool, args);
      expect(res.error?.code, `${tool} ${JSON.stringify(args)} must be refused at the argument layer`).toBe(-32602);
    }
    expect(existsSync(join(root, 'spec'))).toBe(false);
  });
});

// --- concurrent MCP mutations serialize through the per-root lock (T6/P0-6) ----------

describe('handleRpcLine: concurrent mutations serialize (per-root lock)', () => {
  it('two concurrent lco_init on the same root → exactly ONE scaffold, the other a clean refusal, spec intact', async () => {
    const root = freshRoot('spec-core-mcp-race-init-');

    const [a, b] = await Promise.all([
      callTool('lco_init', { dir: root }),
      callTool('lco_init', { dir: root }),
    ]);

    const results = [a, b];
    const winners = results.filter((r) => r.result?.isError === false);
    expect(winners).toHaveLength(1);
    const loser = results.find((r) => r.result?.isError === true)!;
    // The loser refuses CLEANLY — a no-clobber refusal or a lock refusal, never a partial write.
    expect(text(loser)).toMatch(/refusing to overwrite|locked by another writer|command failed/);

    // The winner's scaffold is complete and valid — no interleaved corruption.
    const manifest = JSON.parse(readFileSync(join(root, 'spec', 'manifest.json'), 'utf8'));
    expect(manifest.state).toBe('draft');
    const lint = await callTool('lco_lint', { dir: root });
    expect(lint.result.isError).toBe(false);
  });

  it('two concurrent lco_change on the same frozen root → ONE applies (v2), the other refuses cleanly', async () => {
    const root = await frozenRoot('spec-core-mcp-race-change-');
    const cs = (id: string, title: string) => ({
      id,
      rationale: 'concurrent title change',
      modified_tasks: [{ task_id: 'TASK-0001', patch: { title } }],
    });

    const [a, b] = await Promise.all([
      callTool('lco_change', { dir: root, changeset: cs('CP-A', 'title from A') }),
      callTool('lco_change', { dir: root, changeset: cs('CP-B', 'title from B') }),
    ]);

    const results = [a, b];
    const winners = results.filter((r) => r.result?.isError === false);
    expect(winners).toHaveLength(1);
    const loser = results.find((r) => r.result?.isError === true)!;
    expect(text(loser)).toMatch(/cannot acquire the spec root lock|cannot apply changeset|rejected|command failed/);

    // Exactly ONE version bump happened — never two, never a torn write.
    const manifest = JSON.parse(readFileSync(join(root, 'spec', 'manifest.json'), 'utf8'));
    expect(manifest.spec_version).toBe(2);
    expect(manifest.state).toBe('draft');
  });
});

// --- PROD-004 e2e: the full product journey over MCP only (mock adapter) ------------

describe('PROD-004 e2e: intent → draft → frozen → change, without a shell', () => {
  it('lco_init journey: initialize → tools/list → init → compile → lint → freeze → verify → change → lint', async () => {
    const init = await rpc('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}');
    expect(init.result.serverInfo.name).toBe('lco-mcp');
    const listed = await rpc('{"jsonrpc":"2.0","id":2,"method":"tools/list"}');
    expect((listed.result.tools as unknown[]).length).toBe(13);

    const root = freshRoot('spec-core-mcp-e2e-init-');
    const scaffolded = await callTool('lco_init', { dir: root, profile: 'p-mini', name: 'e2e-project' });
    expect(scaffolded.result.isError).toBe(false);

    const compiled = await callTool('lco_compile', { dir: root });
    expect(compiled.result.isError).toBe(false);
    const linted = await callTool('lco_lint', { dir: root });
    expect(text(linted)).toContain('0 errors');

    const frozen = await callTool('lco_freeze', { dir: root });
    expect(text(frozen)).toContain('frozen at');
    const verified = await callTool('lco_verify', { dir: root });
    expect(text(verified)).toContain('verify OK');

    const changed = await callTool('lco_change', {
      dir: root,
      changeset: {
        id: 'CP-E2E',
        rationale: 'e2e title change over MCP',
        modified_tasks: [{ task_id: 'TASK-0001', patch: { title: 'e2e changed title' } }],
      },
    });
    expect(text(changed)).toContain('spec_version 2');
    const relint = await callTool('lco_lint', { dir: root });
    expect(relint.result.isError).toBe(false);
  });

  it('lco_generate journey: refusal-digest → consent → generate → lint → freeze → change (mock adapter only)', async () => {
    const root = freshRoot('spec-core-mcp-e2e-gen-');
    const intent = 'build a small pet clinic scheduler';
    const { llm, calls } = makeLlm([JSON.stringify(inlineConforming())]);

    // 1. First attempt without consent: refusal advertises the digest, no calls.
    const refused = await callTool(
      'lco_generate',
      { dir: root, intent, variant: 'single', profile: 'p-mini' },
      { allowGenerate: true, llm },
    );
    expect(refused.result.isError).toBe(true);
    expect(calls()).toBe(0);
    const digest = digestFrom(text(refused));

    // 2. Consent with exactly that digest: generation runs (mock adapter).
    const generated = await callTool(
      'lco_generate',
      { dir: root, intent, variant: 'single', profile: 'p-mini', consent: { digest } },
      { allowGenerate: true, llm },
    );
    expect(generated.result.isError).toBe(false);
    expect(calls()).toBe(1);

    // 3. The generated draft is a real spec: lint clean, freezes, changes.
    const linted = await callTool('lco_lint', { dir: root });
    expect(text(linted)).toContain('0 errors');
    const frozen = await callTool('lco_freeze', { dir: root });
    expect(frozen.result.isError).toBe(false);
    const changed = await callTool('lco_change', {
      dir: root,
      changeset: {
        id: 'CP-E2E-GEN',
        rationale: 'post-generation change over MCP',
        modified_tasks: [{ task_id: 'TASK-0001', patch: { title: 'post-gen title' } }],
      },
    });
    expect(text(changed)).toContain('spec_version 2');
  });
});

// --- integration: the ANTI-F18 guarantee over real stdio ------------------------
//
// Spawn the BUILT binary (dist/mcp/server.js) and assert that EVERY stdout
// line of a full session — happy calls, failing calls, unknown tool, unknown
// method, malformed JSON — is a parseable JSON-RPC response. This is the
// stdout-purity regression the plan mandates (the old mcp_bridge wrote logs
// to stdout and corrupted the stream; that class of bug dies here).

describe('integration: spawn dist/mcp/server.js (anti-F18)', () => {
  it(
    'a full session over stdio: every stdout line is valid JSON-RPC, clean exit',
    async () => {
      const serverJs = join(__dirname, '../../dist/mcp/server.js');
      if (!existsSync(serverJs)) {
        throw new Error(
          'dist/mcp/server.js not found — run `pnpm --filter ./packages/spec-core build` ' +
            'before `pnpm --filter ./packages/spec-core test` (fail-closed by design: the ' +
            'spawn test is never silently skipped)',
        );
      }
      // T7: the built server carries the L13/L14 rules, so the lint-clean
      // happy call uses the inline conforming bundle (the fixtures have
      // conformed since T8); the bad root stays bad/L02 (still lint-error
      // via L02).
      const good = makeSpecRoot(inlineConforming());
      const bad = makeSpecRoot(loadBundle('bad/L02/bundle.json'));
      // PROD-004 additions: a scaffold target for lco_init (success + the
      // no-clobber refusal on the same root) and a consent-less generate
      // attempt (default server: refusal, ZERO LLM calls — no env needed).
      const initTarget = freshRoot('spec-core-mcp-spawn-init-');
      // SEC-003 residual: the spawned server's DEFAULT allowed root is its
      // cwd (= this suite's cwdBase), so the consent-less generate fixture
      // must target a dir INSIDE that root to reach the consent gate at all
      // (an outside dir would be refused by the dir policy first).
      const genTarget = freshRoot('spec-core-mcp-spawn-gen0-');

      const child = spawn(process.execPath, [serverJs], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stdout = '';
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });
      // stderr may contain anything (diagnostics) — captured so it never
      // pollutes the test runner's own output.
      child.stderr.on('data', () => {});

      const requests = [
        '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}',
        '{"jsonrpc":"2.0","method":"notifications/initialized"}',
        '{"jsonrpc":"2.0","id":2,"method":"tools/list"}',
        `{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"lco_lint","arguments":{"dir":${JSON.stringify(good)}}}}`,
        `{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"lco_lint","arguments":{"dir":${JSON.stringify(bad)}}}}`,
        '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"lco_nope","arguments":{"dir":"/tmp"}}}',
        '{"jsonrpc":"2.0","id":6,"method":"bogus/method"}',
        '{"id":7, broken json',
        `{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"lco_init","arguments":{"dir":${JSON.stringify(initTarget)}}}}`,
        `{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"lco_init","arguments":{"dir":${JSON.stringify(initTarget)}}}}`,
        `{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"lco_generate","arguments":{"dir":${JSON.stringify(genTarget)},"intent":"spawn session intent"}}}`,
        '{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":"lco_change","arguments":{"dir":"/tmp","changeset":[1]}}}',
      ];
      for (const line of requests) {
        child.stdin.write(`${line}\n`);
      }
      child.stdin.end(); // the server must exit on its own

      const [exitCode] = await once(child, 'close');
      expect(exitCode).toBe(0);

      // THE assertion: every single stdout line parses as JSON (no logs, no
      // banners, no compile chatter — nothing but JSON-RPC on stdout).
      const outLines = stdout.split('\n').filter((l) => l.trim() !== '');
      const responses = outLines.map((l) => {
        expect(() => JSON.parse(l)).not.toThrow();
        return JSON.parse(l) as Record<string, any>;
      });

      // notifications/initialized produced nothing; exactly one response per
      // request id (1..11), in whatever completion order they arrived.
      expect(responses).toHaveLength(11);
      const byId = new Map(responses.map((r) => [r.id, r]));

      expect(byId.get(1)!.result.serverInfo).toEqual({ name: 'lco-mcp', version: '0.1.0' });
      const toolNames = (byId.get(2)!.result.tools as Array<{ name: string }>).map((t) => t.name);
      expect(toolNames).toHaveLength(13);
      expect(new Set(toolNames)).toEqual(
        new Set([
          'lco_compile',
          'lco_lint',
          'lco_freeze',
          'lco_verify',
          'lco_trace',
          'lco_plan',
          'lco_check',
          'lco_init',
          'lco_generate',
          'lco_change',
          'lco_renew_status',
          'lco_renew_export',
          'lco_renew_analyze',
        ]),
      );
      expect(byId.get(3)!.result.isError).toBe(false);
      expect(byId.get(3)!.result.content[0].text).toContain('0 errors');
      expect(byId.get(4)!.result.isError).toBe(true);
      expect(byId.get(4)!.result.content[0].text).toContain('L02');
      expect(byId.get(5)!.error.message).toContain('lco_nope');
      expect(byId.get(6)!.error.code).toBe(-32601);
      // PROD-004 over real stdio: init scaffolds, re-init refuses, generate
      // without consent refuses (default server, zero LLM calls), and a
      // non-object changeset is a -32602 argument refusal. NOTE the two
      // pipelined init requests are processed CONCURRENTLY (the server never
      // serializes independent requests), so either may win the race — the
      // assertion is exactly-one-winner + one CLEAN refusal (no-clobber or
      // lock-held), never a partial scaffold.
      const initResults = [byId.get(8)!, byId.get(9)!];
      const initWinners = initResults.filter((r) => r.result.isError === false);
      expect(initWinners).toHaveLength(1);
      expect(initWinners[0].result.content[0].text).toContain('initialized');
      const initLoser = initResults.find((r) => r.result.isError === true)!;
      expect(initLoser.result.content[0].text).toMatch(
        /refusing to overwrite|locked by another writer/,
      );
      expect(existsSync(join(initTarget, 'spec', 'manifest.json'))).toBe(true);
      expect(byId.get(10)!.result.isError).toBe(true);
      expect(byId.get(10)!.result.content[0].text).toContain('generation refused');
      expect(byId.get(11)!.error.code).toBe(-32602);
      // The malformed line's response carries id null (JSON-RPC parse error).
      const parseError = responses.find((r) => r.id === null);
      expect(parseError).toBeTruthy();
      expect(parseError!.error.code).toBe(-32700);
    },
    30_000,
  );
});

// --- tools/call lco_check: execution consent (SEC-002) ----------------------------
//
// The trust boundary under test: an MCP client (a model) must NEVER be able
// to turn spec text into shell execution by itself. Execution requires the
// OPERATOR's server-start opt-in (LCO_MCP_ALLOW_EXEC=1) AND a consent digest
// bound to the dry-run preview AND a frozen+hash-verified+lint-clean spec.
// Every refusal below is a layer of that boundary.

/** inlineConforming() with TASK-0001's verification swapped (stays schema-valid). */
function inlineWithVerification(entries: Array<{ command: string; expect: string }>): Record<string, unknown> {
  const bundle = inlineConforming();
  (bundle.tasks as Array<Record<string, unknown>>)[0].verification = entries;
  return bundle;
}

/** The audit's prompt-injection payload as spec text (SEC-002 failure scenario). */
const INJECTION_COMMAND =
  "node -e \"require('fs').writeFileSync('PWNED.txt','injected')\"";
const injectionRoot = () =>
  makeSpecRoot(inlineWithVerification([{ command: INJECTION_COMMAND, expect: 'exit 0' }]));

/** Extract the consent digest the dry-run response advertises. */
function digestFromDry(text: string): string {
  const m = /consent digest: (sha256:[0-9a-f]{64})/.exec(text);
  expect(m, `dry output must advertise a consent digest, got: ${text}`).not.toBeNull();
  return m![1];
}

describe('handleRpcLine: lco_check execution consent (SEC-002)', () => {
  const call = (
    id: number,
    root: string,
    args: Record<string, unknown>,
    options?: { allowExec?: boolean; env?: NodeJS.ProcessEnv },
  ) =>
    rpc(
      `{"jsonrpc":"2.0","id":${id},"method":"tools/call","params":{"name":"lco_check","arguments":${JSON.stringify(
        { dir: root, ...args },
      )}}}`,
      options,
    );
  /** Every opted-in test goes through this — the env flag in options form. */
  const OPTED_IN = { allowExec: true } as const;

  // --- argument surface --------------------------------------------------------

  it('yes:true is REFUSED (-32602) with an actionable message naming the opt-in — on every tool', async () => {
    const root = injectionRoot();

    const res = await call(1, root, { yes: true });

    expect(res.error.code).toBe(-32602);
    expect(res.error.message).toContain('yes');
    expect(res.error.message).toContain('LCO_MCP_ALLOW_EXEC');
    expect(res.error.message).toContain('consent');
    expect(existsSync(join(root, 'PWNED.txt'))).toBe(false);
  });

  it('consent with a malformed shape is refused fail-closed at the argument layer', async () => {
    const root = injectionRoot();

    for (const bad of [
      { consent: 'sha256:' + 'a'.repeat(64) }, // not an object
      { consent: {} }, // missing digest
      { consent: { digest: 42 } }, // wrong type
      { consent: { digest: 'sha256:abc', extra: 1 } }, // unknown key
      { consent: { digest: 'md5:zzz' } }, // not the sha256:<hex> idiom
    ]) {
      const res = await call(2, root, bad);
      expect(res.error.code).toBe(-32602);
      expect(res.error.message).toContain('consent');
    }
    expect(existsSync(join(root, 'PWNED.txt'))).toBe(false);
  });

  // --- default surface: execution is IMPOSSIBLE ---------------------------------

  it('DEFAULT server: a well-formed consent is refused with the opt-in explanation (isError, exit 2)', async () => {
    const root = injectionRoot();

    const res = await call(3, root, { consent: { digest: 'sha256:' + 'a'.repeat(64) } });

    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toContain('execution refused');
    expect(res.result.content[0].text).toContain('LCO_MCP_ALLOW_EXEC');
    expect(res.result.content[0].text).toContain('exit code: 2');
    expect(existsSync(join(root, 'PWNED.txt'))).toBe(false);
    expect(existsSync(join(root, 'spec', 'evidence'))).toBe(false);
  });

  it('DEFAULT server: the dry run still works and advertises the consent digest', async () => {
    const root = makeSpecRoot(inlineConforming());

    const res = await call(4, root, {});

    expect(res.result.isError).toBe(false);
    expect(res.result.content[0].text).toContain('DRY RUN');
    expect(res.result.content[0].text).toMatch(/consent digest: sha256:[0-9a-f]{64}/);
    expect(existsSync(join(root, 'spec', 'evidence'))).toBe(false);
  });

  it('DEFAULT server: the full injection attack (yes:true AND consent, every combination) never executes', async () => {
    const root = injectionRoot();

    const attempts = [
      { yes: true },
      { yes: false, consent: { digest: 'sha256:' + 'b'.repeat(64) } },
      { consent: { digest: 'sha256:' + 'b'.repeat(64) }, task: 'TASK-0001' },
    ];
    for (const args of attempts) {
      const res = await call(5, root, args);
      // Either a -32602 argument refusal (yes) or an isError consent refusal —
      // both are refusals; neither is a successful execution.
      const refused =
        res.error !== undefined || res.result.isError === true;
      expect(refused, `attempt ${JSON.stringify(args)} must be refused`).toBe(true);
    }
    expect(existsSync(join(root, 'PWNED.txt'))).toBe(false);
  });

  // --- opted-in server: the frozen+verified+digest chain --------------------------

  it('OPTED-IN but DRAFT spec -> refusal naming not-frozen (a fresh scaffold can never execute via MCP)', async () => {
    const root = injectionRoot();
    const dry = await call(6, root, {}, OPTED_IN);
    const digest = digestFromDry(dry.result.content[0].text);

    const res = await call(7, root, { consent: { digest } }, OPTED_IN);

    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toContain('execution refused');
    expect(res.result.content[0].text).toContain('not frozen');
    expect(res.result.content[0].text).toContain('exit code: 2');
    expect(existsSync(join(root, 'PWNED.txt'))).toBe(false);
    expect(existsSync(join(root, 'spec', 'evidence'))).toBe(false);
  });

  it('OPTED-IN but lint-dirty spec -> the lint-clean refusal names the rule (L13 dangling ref)', async () => {
    const bundle = inlineWithVerification([{ command: INJECTION_COMMAND, expect: 'exit 0' }]);
    ((bundle.tasks as Array<Record<string, unknown>>)[0].refs as Record<string, unknown>).requirements = ['REQ-9999'];
    const root = makeSpecRoot(bundle);

    const res = await call(8, root, {
      consent: { digest: 'sha256:' + 'c'.repeat(64) },
    });

    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toContain('lint FAILED');
    expect(res.result.content[0].text).toContain('L13');
    expect(existsSync(join(root, 'PWNED.txt'))).toBe(false);
  });

  it('OPTED-IN + frozen but tampered after freeze -> refusal naming drifted sections, tampered command never runs', async () => {
    const root = injectionRoot();
    const frozen = await rpc(
      `{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"lco_freeze","arguments":{"dir":${JSON.stringify(root)}}}}`,
      { allowExec: true },
    );
    expect(frozen.result.isError).toBe(false);
    // Tamper AFTER freeze: rewrite the frozen task's command on disk (the
    // manifest still pins the pre-tamper hashes). The client re-previews
    // (getting the TAMPERED digest) and consents to exactly the tampered
    // commands — verifyFrozen must still refuse: pinned content is gone.
    const tasksFile = join(root, 'spec', 'tasks.json');
    const tasks = JSON.parse(readFileSync(tasksFile, 'utf8')) as Array<Record<string, unknown>>;
    (tasks[0].verification as Array<{ command: string; expect: string }>)[0] = {
      command: "node -e \"require('fs').writeFileSync('DRIFTED.txt','tampered')\"",
      expect: 'exit 0',
    };
    writeFileSync(tasksFile, JSON.stringify(tasks, null, 2));
    const dry = await call(10, root, {}, OPTED_IN);
    const tamperedDigest = digestFromDry(dry.result.content[0].text);

    const res = await call(11, root, { consent: { digest: tamperedDigest } }, OPTED_IN);

    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toContain('drifted sections');
    expect(existsSync(join(root, 'PWNED.txt'))).toBe(false);
    expect(existsSync(join(root, 'DRIFTED.txt'))).toBe(false);
  });

  it('OPTED-IN + frozen + verified but WRONG digest -> refusal naming both digests', async () => {
    const root = injectionRoot();
    await rpc(
      `{"jsonrpc":"2.0","id":12,"method":"tools/call","params":{"name":"lco_freeze","arguments":{"dir":${JSON.stringify(root)}}}}`,
      { allowExec: true },
    );
    const wrong = 'sha256:' + 'd'.repeat(64);

    const res = await call(13, root, { consent: { digest: wrong } }, OPTED_IN);

    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toContain('digest mismatch');
    expect(res.result.content[0].text).toContain(wrong);
    expect(res.result.content[0].text).toMatch(/sha256:[0-9a-f]{64}/);
    expect(existsSync(join(root, 'PWNED.txt'))).toBe(false);
  });

  it('the full legit chain (opt-in + frozen + verified + digest from the dry preview) EXECUTES and writes evidence', async () => {
    const root = makeSpecRoot(
      inlineWithVerification([
        { command: "node -e \"require('fs').writeFileSync('EXECUTED.txt','ok')\"", expect: 'exit 0' },
      ]),
    );
    await rpc(
      `{"jsonrpc":"2.0","id":14,"method":"tools/call","params":{"name":"lco_freeze","arguments":{"dir":${JSON.stringify(root)}}}}`,
      { allowExec: true },
    );

    const dry = await call(15, root, {}, OPTED_IN);
    const digest = digestFromDry(dry.result.content[0].text);
    const res = await call(16, root, { consent: { digest } }, OPTED_IN);

    expect(res.result.isError).toBe(false);
    expect(res.result.content[0].text).toContain('PASS');
    expect(existsSync(join(root, 'EXECUTED.txt'))).toBe(true);
    // SEC-004: run-addressed immutable evidence (never the overwritten name).
    const evidence = readdirSync(join(root, 'spec', 'evidence')).filter((f) =>
      f.startsWith('TASK-0001-check-'),
    );
    expect(evidence).toHaveLength(1);
  });

  it('consent digest binds the task selection: an all-tasks digest does not authorize a --task run', async () => {
    // TWO tasks: the all-tasks preview covers 2 commands, a TASK-0001 run
    // would execute 1 — different content, so the digests differ (content
    // binding; a single-task bundle would make the selections identical).
    const bundle = inlineWithVerification([{ command: INJECTION_COMMAND, expect: 'exit 0' }]);
    const t1 = (bundle.tasks as Array<Record<string, unknown>>)[0];
    (bundle.tasks as Array<Record<string, unknown>>).push({
      ...t1,
      task_id: 'TASK-0002',
      // disjoint permitted_scope: L12 rejects overlapping scopes with no
      // dependency edge between the two tasks.
      permitted_scope: ['lib/**'],
      tests: [{ id: 'TST-0002', kind: 'unit', file: 'b.test.ts', cases: ['REQ-0001: works 2'] }],
      verification: [{ command: 'node -v', expect: 'exit 0' }],
    });
    const root = makeSpecRoot(bundle);
    await rpc(
      `{"jsonrpc":"2.0","id":17,"method":"tools/call","params":{"name":"lco_freeze","arguments":{"dir":${JSON.stringify(root)}}}}`,
      { allowExec: true },
    );
    const dry = await call(18, root, {}, OPTED_IN);
    const allTasksDigest = digestFromDry(dry.result.content[0].text);

    const res = await call(19, root, { task: 'TASK-0001', consent: { digest: allTasksDigest } }, OPTED_IN);

    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toContain('digest mismatch');
    expect(existsSync(join(root, 'PWNED.txt'))).toBe(false);
  });

  it('LCO_MCP_EXEC_ROOT pins the workspace: outside dirs are refused even with the full chain', async () => {
    const root = injectionRoot();
    await rpc(
      `{"jsonrpc":"2.0","id":20,"method":"tools/call","params":{"name":"lco_freeze","arguments":{"dir":${JSON.stringify(root)}}}}`,
      { allowExec: true },
    );
    const dry = await call(21, root, {}, OPTED_IN);
    const digest = digestFromDry(dry.result.content[0].text);

    const res = await call(22, root, { consent: { digest } }, OPTED_IN);

    // env pin via the options env (no process.env mutation needed)
    const pinned = await rpc(
      `{"jsonrpc":"2.0","id":23,"method":"tools/call","params":{"name":"lco_check","arguments":${JSON.stringify(
        { dir: root, consent: { digest } },
      )}}}`,
      { allowExec: true, env: { LCO_MCP_EXEC_ROOT: '/definitely/elsewhere' } },
    );

    expect(res.result.isError).toBe(false); // unpinned: full chain executes
    // pinned elsewhere: refused. SEC-003 moved the refusal UP to the dir
    // policy at the server boundary — a pin that does not resolve fails
    // closed as -32602 before the tool core (or the consent gate) ever runs.
    expect(pinned.error).toBeDefined();
    expect(pinned.error.code).toBe(-32602);
    expect(pinned.error.message).toContain('LCO_MCP_EXEC_ROOT');
  });

  it('every consent refusal stays off stdout (purity) and off the crash path', async () => {
    const root = injectionRoot();
    await call(24, root, { yes: true });
    await call(25, root, { consent: { digest: 'sha256:' + 'e'.repeat(64) } });
    await rpc(
      `{"jsonrpc":"2.0","id":26,"method":"tools/call","params":{"name":"lco_check","arguments":${JSON.stringify(
        { dir: root, consent: { digest: 'sha256:' + 'e'.repeat(64) } },
      )}}}`,
      { allowExec: true },
    );
    expect(logSpy.mock.calls).toHaveLength(0);
    expect(existsSync(join(root, 'PWNED.txt'))).toBe(false);
  });
});

// --- integration: opted-in server over real stdio, env-scrub proof ----------------
//
// Spawn the BUILT binary WITH LCO_MCP_ALLOW_EXEC=1 in its environment and
// prove the executed child does NOT inherit the server's env: the frozen
// verification command `printenv LCO_MCP_ALLOW_EXEC` is judged PASS exactly
// when the variable is ABSENT from the child (printenv exits 1), while
// `printenv PATH` (kept by the allowlist) exits 0. This is the end-to-end
// env-scrub + consent-chain proof against the real bin.

describe('integration: spawn dist/mcp/server.js with LCO_MCP_ALLOW_EXEC=1', () => {
  it(
    'full chain executes with a scrubbed environment (allowExec flag invisible to children, PATH kept)',
    async () => {
      const serverJs = join(__dirname, '../../dist/mcp/server.js');
      if (!existsSync(serverJs)) {
        throw new Error(
          'dist/mcp/server.js not found — run `pnpm --filter ./packages/spec-core build` ' +
            'before `pnpm --filter ./packages/spec-core test` (fail-closed by design)',
        );
      }
      const root = makeSpecRoot(
        inlineWithVerification([
          { command: 'printenv LCO_MCP_ALLOW_EXEC', expect: 'exit 1' }, // PASS iff scrubbed
          { command: 'printenv PATH', expect: 'exit 0' }, // PASS iff PATH kept
        ]),
      );
      const frozen = await rpc(
        `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"lco_freeze","arguments":{"dir":${JSON.stringify(root)}}}}`,
      );
      expect(frozen.result.isError).toBe(false);

      const child = spawn(process.execPath, [serverJs], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, LCO_MCP_ALLOW_EXEC: '1', LCO_LLM_API_KEY: 'sk-spawn-secret' },
      });
      let stdout = '';
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });
      child.stderr.on('data', () => {});

      const send = (line: string) => child.stdin.write(`${line}\n`);
      send(`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"lco_check","arguments":${JSON.stringify({ dir: root })}}}`);
      child.stdin.end();

      const [exitCode] = await once(child, 'close');
      expect(exitCode).toBe(0);

      const lines = stdout.split('\n').filter((l) => l.trim() !== '');
      expect(lines).toHaveLength(1); // stdout purity: only the dry response
      const dry = JSON.parse(lines[0]) as Record<string, any>;
      expect(dry.result.isError).toBe(false);
      const digest = digestFromDry(dry.result.content[0].text);

      // Second round-trip on a fresh spawned server: the execution consent.
      const child2 = spawn(process.execPath, [serverJs], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, LCO_MCP_ALLOW_EXEC: '1', LCO_LLM_API_KEY: 'sk-spawn-secret' },
      });
      let stdout2 = '';
      child2.stdout.on('data', (chunk: Buffer) => {
        stdout2 += chunk.toString('utf8');
      });
      child2.stderr.on('data', () => {});
      child2.stdin.write(
        `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"lco_check","arguments":${JSON.stringify(
          { dir: root, consent: { digest } },
        )}}}\n`,
      );
      child2.stdin.end();
      const [exitCode2] = await once(child2, 'close');
      expect(exitCode2).toBe(0);

      const lines2 = stdout2.split('\n').filter((l) => l.trim() !== '');
      expect(lines2).toHaveLength(1);
      const exec = JSON.parse(lines2[0]) as Record<string, any>;
      expect(exec.result.isError).toBe(false);
      const text: string = exec.result.content[0].text;
      // Both judged PASS: the flag was scrubbed (printenv exit 1 == expected 1)
      // and PATH survived (exit 0 == expected 0).
      expect(text).toContain('printenv LCO_MCP_ALLOW_EXEC');
      expect(text).toMatch(/printenv LCO_MCP_ALLOW_EXEC\t.*\t1 → 1\tPASS/);
      expect(text).toMatch(/printenv PATH\t.*\t0 → 0\tPASS/);
      // The server's own secret never reached the children — and the evidence
      // file records the judged outcome for the audit trail (run-addressed
      // name since SEC-004; the server's own secret stays redacted/absent).
      const evidenceDir = join(root, 'spec', 'evidence');
      const evidenceName = readdirSync(evidenceDir).find((f) => f.startsWith('TASK-0001-check-'));
      expect(evidenceName).toBeDefined();
      const evidence = JSON.parse(
        readFileSync(join(evidenceDir, evidenceName!), 'utf8'),
      ) as Record<string, any>;
      expect(evidence.checks).toHaveLength(2);
      expect(evidence.checks.every((c: any) => c.status === 'PASS')).toBe(true);
      expect(JSON.stringify(evidence)).not.toContain('sk-spawn-secret');
    },
    30_000,
  );
});

// --- integration: OPS-001 graceful EPIPE over real stdio ---------------------------
//
// Spawn the BUILT server, start a REAL execution (consent chain, `sleep`)
// and kill the client's read end mid-run. The server must: (1) keep serving
// the in-flight mutation to completion (bounded drain), (2) exit NONZERO
// (work/responses were abandoned mid-stream — never the old exit 0), (3)
// leave every stdout line it did deliver complete and parseable (no torn
// writes). A second scenario pins the fast path: EPIPE with nothing truly
// in flight still exits nonzero.

describe('integration: spawn dist/mcp/server.js — EPIPE (OPS-001)', () => {
  it(
    'client dies mid-check-execution: server waits for the work, then exits nonzero; delivered lines all parse',
    async () => {
      const serverJs = join(__dirname, '../../dist/mcp/server.js');
      if (!existsSync(serverJs)) {
        throw new Error('dist/mcp/server.js not found — run the build first (fail-closed)');
      }
      const root = makeSpecRoot(
        inlineWithVerification([{ command: 'sleep 2', expect: 'exit 0' }]),
      );
      const frozen = await rpc(
        `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"lco_freeze","arguments":{"dir":${JSON.stringify(root)}}}}`,
        { allowExec: true },
      );
      expect(frozen.result.isError).toBe(false);
      const dry = await rpc(
        `{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"lco_check","arguments":${JSON.stringify({ dir: root })}}}`,
        { allowExec: true },
      );
      const digest = digestFromDry(dry.result.content[0].text);

      const child = spawn(process.execPath, [serverJs], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, LCO_MCP_ALLOW_EXEC: '1' },
      });
      const delivered: Buffer[] = [];
      child.stdout.on('data', (c: Buffer) => delivered.push(c));
      child.stderr.on('data', () => {});
      child.stdin.write(
        `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"lco_check","arguments":${JSON.stringify(
          { dir: root, consent: { digest } },
        )}}}\n`,
      );
      // The execution is now in flight (the sleep runs ~2s). Kill the read
      // end of the server's stdout — its response write will EPIPE.
      child.stdout.destroy();

      // The server must NOT exit while the check still runs (graceful drain),
      // and must NOT exit 0 afterwards (work was abandoned mid-stream).
      const exited = new Promise<number | null>((resolveExit) => {
        child.on('close', (code: number | null) => resolveExit(code));
      });
      // At 0.7s the 2s sleep is still running: the process must still be alive.
      await new Promise((r) => setTimeout(r, 700));
      expect(child.exitCode).toBeNull(); // still draining in-flight work
      expect(child.killed).toBe(false);

      const code = await exited;
      // The documented client-gone code: work was abandoned mid-stream.
      expect(code).toBe(3); // EXIT_CLIENT_GONE — never the old silent 0
      // No torn writes: every complete stdout line delivered before the pipe
      // died parses as JSON-RPC.
      const text = Buffer.concat(delivered).toString('utf8');
      const lines = text.split('\n').filter((l) => l.trim() !== '');
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    },
    30_000,
  );

  it('EPIPE with no work left: exits nonzero immediately (never the old silent 0)', async () => {
    const serverJs = join(__dirname, '../../dist/mcp/server.js');
    if (!existsSync(serverJs)) {
      throw new Error('dist/mcp/server.js not found — run the build first (fail-closed)');
    }
    const child = spawn(process.execPath, [serverJs], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stderr.on('data', () => {});
    child.stdin.write('{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n');
    // Let the first response flush, then kill the read end; the response to
    // the SECOND request writes into the dead pipe -> EPIPE -> nonzero exit.
    await new Promise((r) => setTimeout(r, 300));
    child.stdout.destroy();
    child.stdin.write('{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n');
    child.stdin.end();
    const [code] = await once(child, 'close');
    expect(code).toBe(3); // EXIT_CLIENT_GONE, immediately — nothing to drain
  }, 15_000);
});

// --- integration: spawn with LCO_MCP_ALLOW_GENERATE=1 but NO LCO_LLM_* env ----------
//
// The paid-call boundary against the real bin: an OPTED-IN server (the env
// flag in its environment) with a full consent chain must still fail closed
// when the operator provided no live LLM credentials — createHttpLlm throws
// and NO key is ever invented. Every stdout line stays valid JSON-RPC.

describe('integration: spawn dist/mcp/server.js with LCO_MCP_ALLOW_GENERATE=1', () => {
  it(
    'full consent chain + no LCO_LLM_* env → the fail-closed env refusal, zero invented keys, pure stdout',
    async () => {
      const serverJs = join(__dirname, '../../dist/mcp/server.js');
      if (!existsSync(serverJs)) {
        throw new Error(
          'dist/mcp/server.js not found — run `pnpm --filter ./packages/spec-core build` ' +
            'before `pnpm --filter ./packages/spec-core test` (fail-closed by design)',
        );
      }
      const root = freshRoot('spec-core-mcp-spawn-gen-');
      const intent = 'spawn generate intent';
      // Child env: the opt-in flag, explicitly NO LCO_LLM_* credentials (even
      // if the dev machine carries them, they are deleted from the child).
      const childEnv: NodeJS.ProcessEnv = { ...process.env, LCO_MCP_ALLOW_GENERATE: '1' };
      delete childEnv.LCO_LLM_BASE_URL;
      delete childEnv.LCO_LLM_API_KEY;
      delete childEnv.LCO_LLM_MODEL;

      const roundTrip = async (args: Record<string, unknown>): Promise<Record<string, any>> => {
        const child = spawn(process.execPath, [serverJs], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: childEnv,
        });
        let out = '';
        child.stdout.on('data', (chunk: Buffer) => {
          out += chunk.toString('utf8');
        });
        child.stderr.on('data', () => {});
        child.stdin.write(
          `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"lco_generate","arguments":${JSON.stringify(
            { dir: root, ...args },
          )}}}\n`,
        );
        child.stdin.end();
        const [exitCode] = await once(child, 'close');
        expect(exitCode).toBe(0);
        const lines = out.split('\n').filter((l) => l.trim() !== '');
        expect(lines).toHaveLength(1); // stdout purity: exactly the one response
        expect(() => JSON.parse(lines[0])).not.toThrow();
        return JSON.parse(lines[0]) as Record<string, any>;
      };

      // 1. No consent yet: the refusal carries the digest (this server IS
      //    opted in — the refusal is consent-missing, not capability-missing).
      const refusal = await roundTrip({ intent, variant: 'single', profile: 'p-mini' });
      expect(refusal.result.isError).toBe(true);
      expect(refusal.result.content[0].text).toContain('generation refused');
      const digest = digestFrom(refusal.result.content[0].text);
      expect(digest).toBe(generateConsentDigest(intent, 'p-mini', 'single'));

      // 2. Full chain: passes flag + digest, reaches the adapter boundary,
      //    and fails closed on the missing LCO_LLM_* env (never invents keys).
      const attempt = await roundTrip({ intent, variant: 'single', profile: 'p-mini', consent: { digest } });
      expect(attempt.result.isError).toBe(true);
      expect(attempt.result.content[0].text).toContain('live mode requires LCO_LLM_* env vars');
      expect(existsSync(join(root, 'spec'))).toBe(false); // nothing written
    },
    30_000,
  );
});

// --- SEC-003: dir argument policy at the server boundary ----------------------------
//
// Every tool's `dir` is REALPATH-NORMALIZED before the core runs (a root
// reached through symlinked parents works) and must RESOLVE inside the
// EFFECTIVE allowed root, computed once per call at the RPC boundary from
// server state: LCO_MCP_EXEC_ROOT when the operator pinned the process,
// otherwise realpath(process.cwd()). There is no unpinned, policy-free mode
// anymore (the audit residual rejects optional security).

describe('tools/call: MCP dir policy (SEC-003)', () => {
  it('dir reached through a symlinked parent is normalized and the tool still works', async () => {
    const root = makeSpecRoot(inlineConforming());
    const holder = freshRoot('spec-core-mcp-dirlink-');
    const link = join(holder, 'workspace');
    symlinkSync(root, link);

    const res = await callTool('lco_compile', { dir: link });
    expect(res.result.isError).toBe(false);
    expect(text(res)).toContain('compiled');
  });

  it('LCO_MCP_EXEC_ROOT set + dir inside the pin -> accepted', async () => {
    const pin = freshRoot('spec-core-mcp-pin-');
    const root = makeSpecRoot(inlineConforming());
    rmSync(root, { recursive: true, force: true });
    // Rebuild the spec INSIDE the pin.
    const inside = join(pin, 'work');
    mkdirSync(inside);
    const spec = join(inside, 'spec');
    mkdirSync(spec);
    const bundle = inlineConforming();
    for (const name of [...SECTION_FILES, 'legacy'] as const) {
      if (bundle[name] === undefined) continue;
      writeFileSync(join(spec, `${name}.json`), JSON.stringify(bundle[name], null, 2));
    }

    const res = await callTool('lco_compile', { dir: inside }, { env: { [EXEC_ROOT_ENV]: pin } });
    expect(res.result.isError).toBe(false);
  });

  it('LCO_MCP_EXEC_ROOT set + dir OUTSIDE the pin -> -32602 naming the pin (every tool)', async () => {
    const pin = freshRoot('spec-core-mcp-pin2-');
    const root = makeSpecRoot(inlineConforming());

    const res = await callTool('lco_compile', { dir: root }, { env: { [EXEC_ROOT_ENV]: pin } });
    expect(res.error).toBeDefined();
    expect(res.error.code).toBe(-32602);
    expect(res.error.message).toContain('LCO_MCP_EXEC_ROOT');
  });

  it('LCO_MCP_EXEC_ROOT set + dir escaping the pin THROUGH A SYMLINK -> -32602 (realpath, not prefix)', async () => {
    const pin = freshRoot('spec-core-mcp-pin3-');
    const elsewhere = freshRoot('spec-core-mcp-elsewhere-');
    symlinkSync(elsewhere, join(pin, 'escape')); // lexical: pin/escape — resolves: elsewhere

    const res = await callTool('lco_compile', { dir: join(pin, 'escape') }, { env: { [EXEC_ROOT_ENV]: pin } });
    expect(res.error).toBeDefined();
    expect(res.error.message).toContain('LCO_MCP_EXEC_ROOT');
  });

  it('LCO_MCP_EXEC_ROOT set + not-yet-existing dir INSIDE the pin -> accepted (init/generate creation path)', async () => {
    const pin = freshRoot('spec-core-mcp-pin4-');
    const res = await callTool(
      'lco_init',
      { dir: join(pin, 'fresh'), profile: 'p-mini', name: 'mcp-app' },
      { env: { [EXEC_ROOT_ENV]: pin } },
    );
    expect(res.result.isError).toBe(false);
    expect(existsSync(join(pin, 'fresh', 'spec'))).toBe(true);
  });

  it('LCO_MCP_EXEC_ROOT set but the pin path does not exist -> fail closed (-32602)', async () => {
    const root = makeSpecRoot(inlineConforming());
    const res = await callTool(
      'lco_compile',
      { dir: root },
      { env: { [EXEC_ROOT_ENV]: join(tmpdir(), 'lco-no-such-pin-xyz') } },
    );
    expect(res.error).toBeDefined();
    expect(res.error.message).toContain('LCO_MCP_EXEC_ROOT');
  });

  it('DEFAULT server (no LCO_MCP_EXEC_ROOT): dir inside process.cwd() -> allowed', async () => {
    // makeSpecRoot creates inside cwdBase — this suite's process.cwd() — so a
    // default-server call exercises the cwd-derived effective root.
    const root = makeSpecRoot(inlineConforming());
    const res = await callTool('lco_compile', { dir: root });
    expect(res.result.isError).toBe(false);
    expect(text(res)).toContain('compiled');
  });

  it('DEFAULT server: dir OUTSIDE the working directory -> -32602 naming the working directory, BEFORE any core runs', async () => {
    const outside = makeOutsideSpecRoot(inlineConforming());

    const res = await callTool('lco_compile', { dir: outside });

    expect(res.error).toBeDefined();
    expect(res.error.code).toBe(-32602);
    expect(res.error.message).toContain('working directory');
    expect(res.error.message).toContain(realpathSync(cwdBase));
  });

  it('DEFAULT server: an outside lco_init target is refused with ZERO side effects (no dir created)', async () => {
    const base = freshOutside('spec-core-mcp-out-init-');
    const target = join(base, 'never-created');

    const res = await callTool('lco_init', { dir: target });

    expect(res.error.code).toBe(-32602);
    expect(existsSync(target)).toBe(false);
    expect(readdirSync(base)).toEqual([]); // nothing at all was written there
  });

  it('DEFAULT server: an outside lco_generate constructs NO adapter and spends ZERO calls', async () => {
    const target = freshOutside('spec-core-mcp-out-gen-');
    const { llm, calls } = makeLlm([JSON.stringify(inlineConforming())]);
    const digest = generateConsentDigest('an intent outside the root', 'p-mini', 'single');

    const res = await callTool(
      'lco_generate',
      { dir: target, intent: 'an intent outside the root', consent: { digest } },
      { allowGenerate: true, llm },
    );

    expect(res.error.code).toBe(-32602);
    expect(calls()).toBe(0); // the refusal precedes any adapter construction/invocation
    expect(existsSync(join(target, 'spec'))).toBe(false);
  });

  it('explicit root MISSING -> EVERY tool fails closed (-32602 naming LCO_MCP_EXEC_ROOT)', async () => {
    const root = makeSpecRoot(inlineConforming());
    const env: NodeJS.ProcessEnv = { [EXEC_ROOT_ENV]: join(tmpdir(), 'lco-no-such-pin-xyz') };
    const minimal: Array<[string, Record<string, unknown>]> = [
      ['lco_compile', { dir: root }],
      ['lco_lint', { dir: root }],
      ['lco_freeze', { dir: root }],
      ['lco_verify', { dir: root }],
      ['lco_trace', { dir: root }],
      ['lco_plan', { dir: root }],
      ['lco_check', { dir: root }],
      ['lco_init', { dir: root }],
      ['lco_generate', { dir: root, intent: 'x' }],
      ['lco_change', { dir: root, changeset: { id: 'CP-1', rationale: 'r' } }],
    ];
    for (const [name, args] of minimal) {
      const res = await callTool(name, args, { env });
      expect(res.error?.code, `${name} must fail closed on a missing root`).toBe(-32602);
      expect(res.error.message).toContain('LCO_MCP_EXEC_ROOT');
    }
  });

  it('explicit root is a FILE (not a directory) -> EVERY tool fails closed', async () => {
    const root = makeSpecRoot(inlineConforming());
    const fileRoot = join(freshOutside('spec-core-mcp-fileroot-'), 'pin-is-a-file');
    writeFileSync(fileRoot, 'not a directory');
    const env: NodeJS.ProcessEnv = { [EXEC_ROOT_ENV]: fileRoot };

    for (const name of ['lco_compile', 'lco_freeze', 'lco_check', 'lco_generate'] as const) {
      const args =
        name === 'lco_generate' ? { dir: root, intent: 'x' } : { dir: root };
      const res = await callTool(name, args, { env });
      expect(res.error?.code, `${name} must fail closed on a file root`).toBe(-32602);
      expect(res.error.message).toContain('LCO_MCP_EXEC_ROOT');
    }
  });

  it('write/execute tools aimed OUTSIDE the root cause NO effect there (containment)', async () => {
    // lco_freeze and lco_change on an outside spec root: refused, disk untouched.
    const outside = makeOutsideSpecRoot(inlineConforming());
    const before = snapshotSpec(outside);
    const frozen = await callTool('lco_freeze', { dir: outside });
    expect(frozen.error.code).toBe(-32602);
    const changed = await callTool('lco_change', {
      dir: outside,
      changeset: { id: 'CP-OUT', rationale: 'r', modified_tasks: [] },
    });
    expect(changed.error.code).toBe(-32602);
    expectIdentical(before, outside); // byte-identical: nothing was written

    // Executing lco_check with a full-looking consent chain on an outside
    // root: the dir policy refuses BEFORE the consent gate or any shell runs.
    const injOutside = makeOutsideSpecRoot(
      inlineWithVerification([{ command: INJECTION_COMMAND, expect: 'exit 0' }]),
    );
    const execAttempt = await callTool(
      'lco_check',
      { dir: injOutside, consent: { digest: 'sha256:' + 'a'.repeat(64) } },
      { allowExec: true },
    );
    expect(execAttempt.error.code).toBe(-32602);
    expect(existsSync(join(injOutside, 'PWNED.txt'))).toBe(false);
    expect(existsSync(join(injOutside, 'spec', 'evidence'))).toBe(false);
  });

  it('request arguments cannot set the root: execRoot in arguments is a named -32602 refusal', async () => {
    const root = makeSpecRoot(inlineConforming());

    const compile = await callTool('lco_compile', { dir: root, execRoot: tmpdir() });
    expect(compile.error.code).toBe(-32602);
    expect(compile.error.message).toContain('execRoot');
    expect(compile.error.message).toContain('OPERATOR');

    const check = await callTool('lco_check', { dir: root, execRoot: '/' });
    expect(check.error.code).toBe(-32602);
  });
});

// ---------------------------------------------------------------------------
// lco_generate llmProfile — named, operator-configured profiles only (§17)
// ---------------------------------------------------------------------------

const PROFILE_CFG = JSON.stringify({
  llm: {
    providers: { or: { type: 'openrouter', apiKeyEnv: 'MCP_TEST_OPENROUTER_KEY' } },
    profiles: {
      'single-x': { variant: 'single', roles: { single: { provider: 'or', model: 'm1' } } },
    },
  },
});

describe('lco_generate llmProfile (§17 named profiles only)', () => {
  const INTENT2 = 'profile intent';

  /** The -32602 message of an error response (parse-layer refusals). */
  function errMessage(res: Record<string, any>): string {
    return String(res.error?.message ?? '');
  }

  it('the digest includes llmProfile when present; without it, historical bytes', () => {
    const without = generateConsentDigest(INTENT2, 'p-mini', 'single');
    const withProfile = generateConsentDigest(INTENT2, 'p-mini', 'single', 'single-x');
    expect(without).not.toBe(withProfile);
    expect(generateConsentDigest(INTENT2, 'p-mini', 'single', undefined)).toBe(without);
  });

  it('consent-missing refusal advertises the llmProfile-bound digest', async () => {
    const res = await callTool('lco_generate', { dir: '.', intent: INTENT2, llmProfile: 'single-x' }, {});
    expect(text(res)).toContain(generateConsentDigest(INTENT2, 'p-standard', 'single', 'single-x'));
  });

  it('unknown profile name → structured refusal, ZERO LLM calls', async () => {
    const digest = generateConsentDigest(INTENT2, 'p-standard', 'single', 'ghost');
    const llm = vi.fn();
    const res = await callTool(
      'lco_generate',
      { dir: '.', intent: INTENT2, llmProfile: 'ghost', consent: { digest } },
      { allowGenerate: true, llmConfigText: PROFILE_CFG, llm: llm as never },
    );
    expect(text(res)).toMatch(/unknown llm profile 'ghost'/);
    expect(llm).not.toHaveBeenCalled();
  });

  it('no operator config configured → llmProfile refused; ZERO LLM calls', async () => {
    const digest = generateConsentDigest(INTENT2, 'p-standard', 'single', 'single-x');
    const llm = vi.fn();
    const res = await callTool(
      'lco_generate',
      { dir: '.', intent: INTENT2, llmProfile: 'single-x', consent: { digest } },
      { allowGenerate: true, llm: llm as never, env: {} as NodeJS.ProcessEnv },
    );
    expect(text(res)).toMatch(/no lco\.config\.json is configured/);
    expect(llm).not.toHaveBeenCalled();
  });

  it('profile/variant disagreement → refusal naming both', async () => {
    const digest = generateConsentDigest(INTENT2, 'p-standard', 'council', 'single-x');
    const res = await callTool(
      'lco_generate',
      { dir: '.', intent: INTENT2, variant: 'council', llmProfile: 'single-x', consent: { digest } },
      { allowGenerate: true, llmConfigText: PROFILE_CFG },
    );
    expect(text(res)).toMatch(/declares variant 'single' but the request says variant 'council'/);
  });

  it('credential/gateway-shaped request arguments get the NAMED refusal (SSRF/credential/spend)', async () => {
    for (const key of ['apiKey', 'base_url', 'headers', 'authorization']) {
      const res = await callTool('lco_generate', { dir: '.', intent: 'x', [key]: 'https://evil.example' }, {});
      expect(errMessage(res)).toMatch(new RegExp(`unknown argument '${key}'`));
      expect(errMessage(res)).toMatch(/never request/);
    }
  });

  it('happy path: named profile reaches cmdGenerate (injected mock adapter wins, profile recorded)', async () => {
    const root = freshRoot('spec-core-mcp-profile-ok-');
    const { llm } = makeLlm([JSON.stringify(inlineConforming())]);
    const digest = generateConsentDigest(INTENT2, 'p-mini', 'single', 'single-x');
    const res = await callTool(
      'lco_generate',
      { dir: root, intent: INTENT2, profile: 'p-mini', llmProfile: 'single-x', consent: { digest } },
      { allowGenerate: true, llmConfigText: PROFILE_CFG, llm },
    );
    expect(text(res)).toContain('generated spec/');
    expect(text(res)).toContain('llm profile single-x');
  });
});

describe('lco_generate llmProfile — the REAL per-role plan path (no injected adapter)', () => {
  it('builds per-role adapters from the named profile; keys resolve from env by NAME', async () => {
    const root = freshRoot('spec-core-mcp-realplan-');
    const multiCfg = JSON.stringify({
      llm: {
        providers: { or: { type: 'openrouter', apiKeyEnv: 'MCP_REALPLAN_OR_KEY' } },
        profiles: {
          'single-x': { variant: 'single', roles: { single: { provider: 'or', model: 'realplan-model' } } },
        },
      },
    });
    vi.stubEnv('MCP_REALPLAN_OR_KEY', 'realplan-key');
    const seenModels: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        // cmdGenerate drives the transport; read the model off the captured body
        const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls as unknown as [
          string,
          RequestInit,
        ][];
        const last = calls[calls.length - 1];
        const body = JSON.parse(last[1].body as string) as { model: string };
        seenModels.push(body.model);
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(inlineConforming()) } }],
            usage: { prompt_tokens: 1, completion_tokens: 1 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }),
    );

    const digest = generateConsentDigest('realplan intent', 'p-mini', 'single', 'single-x');
    const res = await callTool(
      'lco_generate',
      { dir: root, intent: 'realplan intent', profile: 'p-mini', llmProfile: 'single-x', consent: { digest } },
      { allowGenerate: true, llmConfigText: multiCfg },
    );
    expect(text(res)).toContain('generated spec/');
    expect(text(res)).toContain('llm profile single-x');
    expect(seenModels).toEqual(['realplan-model']);
  });
});


// --- lco_renew_* tools: read-only + PAID consent (STEP 11) ----------------------

describe('renew MCP tools', () => {
  it('status on a non-project fails closed with an actionable message', async () => {
    const res = await callTool('lco_renew_status', { dir: freshRoot('renew-nonproject') });
    expect(res.result.isError).toBe(true);
    expect(text(res)).toMatch(/not a renewal project|renew init/);
  });

  it('export is READ-ONLY: an out argument is a -32602 schema refusal (C-02)', async () => {
    const res = await callTool('lco_renew_export', { dir: freshRoot('renew-out'), out: '/etc/pwned.txt' });
    expect(res.error?.code ?? res.result?.isError).toBeTruthy();
    // additionalProperties:false → the unknown `out` is rejected at the schema.
    expect(res.error?.code === -32602 || /out/.test(text(res))).toBe(true);
    expect(existsSync('/etc/pwned.txt')).toBe(false);
  });

  it('export on a real project RETURNS content and writes NOTHING (read-only contract)', async () => {
    // Initialize a renewal project via the pure command core (fixture graph
    // provider — no graphify needed; cmdRenewExport only READS the graph file).
    const { cmdRenewInit } = await import('../cli/commands/renew');
    const { StaticGraphProvider } = await import('../renew/intel/fixture-provider');
    const { parseGraphText } = await import('../renew/intel/graph-reader');
    const { createHash } = await import('node:crypto');
    const { lstatSync, readlinkSync } = await import('node:fs');

    const project = freshRoot('renew-ro-project-');
    const target = mkdtempSync(join(tmpdir(), 'lco-renew-ro-target-'));
    tmpDirs.push(target);
    mkdirSync(join(target, 'src'), { recursive: true });
    writeFileSync(join(target, 'src', 'app.ts'), 'export const x = 1;\n');
    const graphParsed = parseGraphText(
      readFileSync(join(FIXTURES, 'legacy-app', 'graph-fixture.json'), 'utf8'),
    );
    if (!graphParsed.ok) throw new Error(graphParsed.message);
    const init = await cmdRenewInit(
      { dir: project, target, name: 'ro' },
      {
        nowIso: () => '2026-09-02T12:00:00.000Z',
        provider: () => new StaticGraphProvider(graphParsed.graph, '0.9.50'),
        gitCommit: () => undefined,
      },
    );
    expect(init.code).toBe(0);

    const hashTree = (root: string): string => {
      const h = createHash('sha256');
      const walk = (abs: string, rel: string): void => {
        for (const ent of readdirSync(abs, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
          const rel2 = rel === '' ? ent.name : `${rel}/${ent.name}`;
          const abs2 = join(abs, ent.name);
          const st = lstatSync(abs2);
          h.update(`E:${rel2}:${st.mode.toString(8)}\n`);
          if (ent.isDirectory()) walk(abs2, rel2);
          else if (ent.isSymbolicLink()) h.update(`L:${readlinkSync(abs2)}\n`);
          else h.update(`F:${createHash('sha256').update(readFileSync(abs2)).digest('hex')}\n`);
        }
      };
      walk(root, '');
      return h.digest('hex');
    };

    const before = hashTree(project);
    const targetBefore = hashTree(target);
    const res = await callTool('lco_renew_export', { dir: project });
    expect(res.result.isError).toBe(false);
    expect(text(res).length).toBeGreaterThan(0);
    expect(hashTree(project)).toBe(before);
    expect(hashTree(target)).toBe(targetBefore);
  });

  it('PAID analyze: missing consent → ZERO LLM calls, digest advertised', async () => {
    let calls = 0;
    const llm = { complete: async () => { calls++; throw new Error('must not be called'); } };
    const dir = freshRoot('renew-consent');
    const res = await callTool('lco_renew_analyze', { dir }, { llm, allowGenerate: true });
    expect(res.result.isError).toBe(true);
    expect(text(res)).toMatch(/PAID operation and was NOT performed/);
    expect(text(res)).toMatch(/sha256:[0-9a-f]{64}/);
    expect(calls).toBe(0);
  });

  it('PAID analyze: wrong digest → ZERO LLM calls', async () => {
    let calls = 0;
    const llm = { complete: async () => { calls++; throw new Error('must not be called'); } };
    const dir = freshRoot('renew-consent2');
    const res = await callTool(
      'lco_renew_analyze',
      { dir, consent: { digest: `sha256:${'0'.repeat(64)}` } },
      { llm, allowGenerate: true },
    );
    expect(res.result.isError).toBe(true);
    expect(text(res)).toMatch(/digest mismatch/);
    expect(calls).toBe(0);
  });

  it('H-10: the consent digest BINDS the active snapshot — a root-only digest no longer matches', async () => {
    let calls = 0;
    const llm = { complete: async () => { calls++; throw new Error('must not be called'); } };
    // A REAL renewal project: the server-side digest now binds its snapshot id.
    const { cmdRenewInit } = await import('../cli/commands/renew');
    const { StaticGraphProvider } = await import('../renew/intel/fixture-provider');
    const { parseGraphText } = await import('../renew/intel/graph-reader');
    const project = freshRoot('renew-consent-bind-');
    const target = mkdtempSync(join(tmpdir(), 'lco-consent-target-'));
    tmpDirs.push(target);
    mkdirSync(join(target, 'src'), { recursive: true });
    writeFileSync(join(target, 'src', 'app.ts'), 'export const x = 1;\n');
    const graphParsed = parseGraphText(readFileSync(join(FIXTURES, 'legacy-app', 'graph-fixture.json'), 'utf8'));
    if (!graphParsed.ok) throw new Error(graphParsed.message);
    await cmdRenewInit({ dir: project, target, name: 'consent' }, {
      nowIso: () => '2026-09-02T12:00:00.000Z',
      provider: () => new StaticGraphProvider(graphParsed.graph, '0.9.50'),
      gitCommit: () => undefined,
    });
    // The OLD (root+scope only) digest must NOT authorize the call anymore.
    const { renewConsentDigest } = await import('./consent');
    const staleDigest = renewConsentDigest({ dir: project, scope: 'whole' });
    const res = await callTool('lco_renew_analyze', { dir: project, consent: { digest: staleDigest } }, { allowGenerate: true, llm });
    expect(res.result.isError).toBe(true);
    expect(text(res)).toMatch(/digest mismatch/);
    expect(calls).toBe(0);
  });

  it('PAID analyze: server not opted in → ZERO LLM calls even WITH a valid digest', async () => {
    let calls = 0;
    const llm = { complete: async () => { calls++; throw new Error('must not be called'); } };
    const dir = freshRoot('renew-consent3');
    const { renewConsentDigest } = await import('./consent');
    const digest = renewConsentDigest({ dir, scope: 'whole' });
    const res = await callTool('lco_renew_analyze', { dir, consent: { digest } }, { llm }); // no allowGenerate
    expect(res.result.isError).toBe(true);
    expect(text(res)).toMatch(/LCO_MCP_ALLOW_GENERATE=1/);
    expect(calls).toBe(0);
  });
});
