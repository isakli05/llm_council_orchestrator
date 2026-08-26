import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { handleRpcLine } from './server';

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

function freshRoot(prefix: string): string {
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
async function rpc(line: string): Promise<Record<string, any>> {
  const raw = await handleRpcLine(line);
  expect(raw).not.toBeNull();
  return JSON.parse(raw!) as Record<string, any>;
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
  it('returns exactly the 7 engine tools, dir required on each', async () => {
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
    ]);
    for (const tool of res.result.tools as Array<Record<string, any>>) {
      expect(typeof tool.description).toBe('string');
      expect(tool.description.length).toBeGreaterThan(10);
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.required).toEqual(['dir']);
      expect(typeof tool.inputSchema.properties.dir).toBe('object');
    }
    // The optional flags land in exactly the tools the brief assigns them to.
    const byName = new Map(
      (res.result.tools as Array<Record<string, any>>).map((t) => [t.name, t.inputSchema.properties]),
    );
    expect(Object.keys(byName.get('lco_plan')!)).toEqual(['dir', 'json']);
    expect(Object.keys(byName.get('lco_check')!)).toEqual(['dir', 'task', 'yes']);
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
      // request id (1..7), in whatever completion order they arrived.
      expect(responses).toHaveLength(7);
      const byId = new Map(responses.map((r) => [r.id, r]));

      expect(byId.get(1)!.result.serverInfo).toEqual({ name: 'lco-mcp', version: '0.1.0' });
      const toolNames = (byId.get(2)!.result.tools as Array<{ name: string }>).map((t) => t.name);
      expect(toolNames).toHaveLength(7);
      expect(new Set(toolNames)).toEqual(
        new Set([
          'lco_compile',
          'lco_lint',
          'lco_freeze',
          'lco_verify',
          'lco_trace',
          'lco_plan',
          'lco_check',
        ]),
      );
      expect(byId.get(3)!.result.isError).toBe(false);
      expect(byId.get(3)!.result.content[0].text).toContain('0 errors');
      expect(byId.get(4)!.result.isError).toBe(true);
      expect(byId.get(4)!.result.content[0].text).toContain('L02');
      expect(byId.get(5)!.error.message).toContain('lco_nope');
      expect(byId.get(6)!.error.code).toBe(-32601);
      // The malformed line's response carries id null (JSON-RPC parse error).
      const parseError = responses.find((r) => r.id === null);
      expect(parseError).toBeTruthy();
      expect(parseError!.error.code).toBe(-32700);
    },
    30_000,
  );
});
