import { describe, it, expect, afterEach, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  McpStdioServer,
  MAX_FRAME_BYTES,
  MAX_IN_FLIGHT,
  EXIT_OK,
  EXIT_CLIENT_GONE,
  EXIT_DRAIN_TIMEOUT,
} from './stdio';

// The OPS-001 session over in-memory streams: frame cap, in-flight cap +
// busy errors, mutation serialization / generate dedup, stdout backpressure,
// and the shutdown rules — all WITHOUT spawning (the spawn-level EPIPE and
// stdout-purity regressions live in server.test.ts against dist/).

const tmpDirs: string[] = [];

/**
 * SEC-003 residual setup: an unpinned server's allowed root is now
 * realpath(process.cwd()). The real-dispatch tests below call tools on
 * freshRoot dirs, so the suite runs with cwd switched to a fresh base and
 * freshRoot creates INSIDE it (setup-only change; no assertion moved).
 */
let cwdBase: string;
let prevCwd: string;

beforeAll(() => {
  prevCwd = process.cwd();
  cwdBase = mkdtempSync(join(tmpdir(), 'spec-core-stdio-cwd-'));
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

let diagSpy: string[] = [];

beforeEach(() => {
  diagSpy = [];
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  tmpDirs.length = 0;
});

interface Harness {
  input: PassThrough;
  output: PassThrough;
  exits: number[];
  exitCodes: () => number[];
  send: (line: string) => void;
  endInput: () => void;
  /** Every complete response line so far (accumulates — never drops). */
  readAll: () => string[];
  server: McpStdioServer;
}

/**
 * A session over PassThrough streams with a recorded exit. `limits` defaults
 * to the PRODUCTION caps unless a test narrows them deliberately.
 */
function makeSession(
  opts?: Partial<ConstructorParameters<typeof McpStdioServer>[0]> & {
    limits?: { maxFrameBytes?: number; maxInFlight?: number; epipeDrainTimeoutMs?: number };
  },
): Harness {
  const input = new PassThrough();
  const output = new PassThrough();
  // Consume the readable side eagerly: the harness's output never congests
  // (backpressure has its own dedicated test with an unread stream).
  const outChunks: Buffer[] = [];
  output.on('data', (c: Buffer) => outChunks.push(c));
  const exits: number[] = [];
  const server = new McpStdioServer({
    input,
    output,
    diag: (m) => diagSpy.push(m),
    exit: (code) => exits.push(code),
    ...opts,
  });
  server.start();
  return {
    input,
    output,
    exits,
    exitCodes: () => exits,
    send: (line) => input.write(`${line}\n`),
    endInput: () => input.end(),
    readAll: () =>
      Buffer.concat(outChunks)
        .toString('utf8')
        .split('\n')
        .filter((l) => l.trim() !== ''),
    server,
  };
}

/** Read lines until exactly `n` responses arrived (or timeout → failure). */
async function collect(h: Harness, n: number, timeoutMs = 10_000): Promise<any[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const lines = h.readAll();
    if (lines.length >= n) return lines.slice(0, n).map((l) => JSON.parse(l));
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${n} responses`);
    await new Promise((r) => setTimeout(r, 15));
  }
}

const INIT = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}';

// --- frame cap ---------------------------------------------------------------------

describe('McpStdioServer: frame cap (OPS-001)', () => {
  it('a line over the cap is never buffered: -32600 too-large response, stderr diagnostic, connection SURVIVES', async () => {
    const h = makeSession({ limits: { maxFrameBytes: 1024 } });
    h.send(`${'x'.repeat(2048)}`);
    h.send(INIT);

    const [tooLarge, init] = await collect(h, 2);

    expect(tooLarge.id).toBeNull();
    expect(tooLarge.error.code).toBe(-32600);
    expect(tooLarge.error.message).toContain('too large');
    expect(diagSpy.join('\n')).toContain('frame cap');
    // THE survival property: the very next well-formed line is served.
    expect(init.id).toBe(1);
    expect(init.result.serverInfo.name).toBe('lco-mcp');
  });

  it('an unterminated oversized line (no newline) is discarded byte-by-byte; later lines still work', async () => {
    const h = makeSession({ limits: { maxFrameBytes: 256 } });
    // Oversized, split across chunks, NEVER newline-terminated...
    h.input.write('a'.repeat(300));
    h.input.write('b'.repeat(300));
    // The discard runs to the FIRST newline — so a bare newline terminates the
    // garbage line, and the well-formed line AFTER it is served normally.
    h.input.write('\n');
    h.send(INIT);

    const responses = await collect(h, 2);
    // Exactly ONE too-large response for the whole oversized line (sent the
    // moment the cap tripped — never duplicated by the follow-up chunks).
    expect(responses.filter((r) => r.error?.code === -32600)).toHaveLength(1);
    const init = responses.find((r) => r.id === 1)!;
    expect(init.result.serverInfo.name).toBe('lco-mcp');
  });

  it('a line exactly AT the cap is served normally (the cap is a bound, not a shrink)', async () => {
    // Whitespace-pad a valid request to exactly MAX_FRAME_BYTES (JSON.parse
    // tolerates surrounding whitespace): the boundary line must pass.
    const h = makeSession(); // production cap
    const pad = MAX_FRAME_BYTES - INIT.length;
    h.send(`${' '.repeat(pad)}${INIT}`);
    const [res] = await collect(h, 1);
    expect(res.id).toBe(1);
    expect(res.result.serverInfo.name).toBe('lco-mcp');
  });

  it('default cap is 1 MiB', () => {
    expect(MAX_FRAME_BYTES).toBe(1024 * 1024);
  });
});

// --- notifications through the session ----------------------------------------------

describe('McpStdioServer: notification semantics (SEC-006, session level)', () => {
  it('a valid notification produces NO response line; the request after it does', async () => {
    const h = makeSession();
    h.send('{"jsonrpc":"2.0","method":"notifications/initialized"}');
    h.send(INIT);
    const responses = await collect(h, 1);
    expect(responses).toHaveLength(1);
    expect(responses[0].id).toBe(1); // the ONLY response is the request's
  });

  it('an ID-BEARING notifications/* gets a -32601 through the real scheduler (session stays healthy)', async () => {
    // SEC-006 residual: silence is defined by the envelope (no id), never by
    // the method name. Pinned at the stdio-session level — the scheduling
    // peek classifies notifications/* as light, but the line is still
    // dispatched and answered; the -32601 write does not consume an
    // in-flight slot (it is not work), and the session serves the next
    // request normally afterwards.
    const h = makeSession();
    h.send('{"jsonrpc":"2.0","id":7,"method":"notifications/initialized"}');
    h.send('{"jsonrpc":"2.0","id":null,"method":"notifications/cancelled"}');
    const responses = await collect(h, 2);
    const [first, second] = responses;
    expect(first.id).toBe(7);
    expect(first.error.code).toBe(-32601);
    expect(first.error.message).toContain('Method not found');
    expect(second.id).toBeNull(); // explicit id:null is a Request id — echoed as-is
    expect(second.error.code).toBe(-32601);
    // Session healthy: a subsequent real request is served normally.
    h.send(INIT);
    const after = await collect(h, 3);
    expect(after[2].id).toBe(1);
    expect(after[2].result.serverInfo.name).toBe('lco-mcp');
    expect(h.exitCodes()).toHaveLength(0); // nothing exited — no EPIPE/EOF path hit
  });
});

// --- in-flight cap + busy -----------------------------------------------------------

describe('McpStdioServer: in-flight cap and busy errors (OPS-001)', () => {
  it('20 pipelined requests: the first 16 run, the rest get -32000 echoing their ids — deterministic in ONE chunk', async () => {
    const root = freshRoot('spec-core-stdio-busy-');
    const h = makeSession(); // maxInFlight 16 (production)
    const lines: string[] = [];
    for (let i = 1; i <= 20; i++) {
      lines.push(
        `{"jsonrpc":"2.0","id":${i},"method":"tools/call","params":{"name":"lco_lint","arguments":{"dir":${JSON.stringify(root)}}}}`,
      );
    }
    // ONE chunk: all 20 lines are scheduled in the same synchronous pass, so
    // the first 16 are still in flight when lines 17..20 are peeked.
    h.input.write(`${lines.join('\n')}\n`);

    const responses = await collect(h, 20);
    expect(responses).toHaveLength(20);
    const busy = responses.filter((r) => r.error?.code === -32000);
    const served = responses.filter((r) => r.error === undefined);
    expect(busy).toHaveLength(4);
    expect(served).toHaveLength(16); // 16 really ran concurrently — the cap, pinned
    // Busy responses echo THEIR ids (17..20), name the cap, and stay structured.
    expect(busy.map((r) => r.id).sort((a, b) => a - b)).toEqual([17, 18, 19, 20]);
    for (const b of busy) {
      expect(b.error.message).toContain('Server busy');
      expect(b.error.message).toContain('16');
    }
    expect(MAX_IN_FLIGHT).toBe(16);
  });

  it('busy never applies to notifications or malformed lines (they start no work)', async () => {
    // REAL dispatch, one in-flight slot, all three lines in ONE chunk: the
    // tools/list request holds the slot for the whole synchronous scheduling
    // pass (its counter decrements only in a later microtask) — so if
    // malformed/notification lines were treated as work, the malformed line
    // would be busy-refused here. It must instead get its parse error.
    const h = makeSession({ limits: { maxInFlight: 1 } });
    h.input.write(
      [
        '{"jsonrpc":"2.0","id":1,"method":"tools/list"}',
        '{"jsonrpc":"2.0","method":"notifications/initialized"}',
        '{"id":9, broken json',
      ].join('\n') + '\n',
    );
    const responses = await collect(h, 2);
    expect(responses).toHaveLength(2); // the notification stayed silent
    const parseError = responses.find((r) => r.id === null)!;
    expect(parseError.error.code).toBe(-32700); // parse error, NOT -32000 busy
    const listRes = responses.find((r) => r.id === 1)!;
    expect(listRes.result.tools.length).toBe(10);
    expect(responses.every((r) => r.error?.code !== -32000)).toBe(true);
  });
});

// --- mutation serialization + generate dedup -----------------------------------------

describe('McpStdioServer: same-root mutations serialize (T6 pinned at session level)', () => {
  it('two concurrent lco_init on ONE root: exactly one scaffold, one CLEAN refusal', async () => {
    const root = freshRoot('spec-core-stdio-ser-');
    const h = makeSession();
    h.send(`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"lco_init","arguments":{"dir":${JSON.stringify(root)}}}}`);
    h.send(`{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"lco_init","arguments":{"dir":${JSON.stringify(root)}}}}`);

    const [a, b] = await collect(h, 2);
    const results = [a, b];
    const winners = results.filter((r) => r.result?.isError === false);
    expect(winners).toHaveLength(1);
    const loser = results.find((r) => r.result?.isError === true)!;
    expect(loser.result.content[0].text).toMatch(
      /refusing to overwrite|locked by another writer/,
    );
    // The winner's scaffold is complete and valid — no interleaved corruption.
    expect(readdirSync(join(root, 'spec'))).toContain('manifest.json');
  });

  it('DIFFERENT roots proceed concurrently (no global mutation lock)', async () => {
    const rootA = freshRoot('spec-core-stdio-par-a-');
    const rootB = freshRoot('spec-core-stdio-par-b-');
    const h = makeSession();
    h.send(`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"lco_init","arguments":{"dir":${JSON.stringify(rootA)}}}}`);
    h.send(`{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"lco_init","arguments":{"dir":${JSON.stringify(rootB)}}}}`);

    const [a, b] = await collect(h, 2);
    expect(a.result.isError).toBe(false);
    expect(b.result.isError).toBe(false);
    expect(readdirSync(join(rootA, 'spec'))).toContain('manifest.json');
    expect(readdirSync(join(rootB, 'spec'))).toContain('manifest.json');
  });

  it('a SECOND lco_generate for the SAME root while one is in flight: immediate isError refusal, never dispatched', async () => {
    const root = freshRoot('spec-core-stdio-gen-');
    const dispatched: string[] = [];
    const h = makeSession({
      dispatch: async (line) => {
        dispatched.push(line);
        return jsonInitResult();
      },
    });
    const genLine = (id: number, dir: string) =>
      `{"jsonrpc":"2.0","id":${id},"method":"tools/call","params":{"name":"lco_generate","arguments":{"dir":${JSON.stringify(dir)}}}}`;
    h.send(genLine(1, root));
    h.send(genLine(2, root));

    const responses = await collect(h, 2);
    // Concurrent requests may complete in any order — match by id.
    const first = responses.find((r) => r.id === 1)!;
    const second = responses.find((r) => r.id === 2)!;
    expect(first.result.serverInfo.name).toBe('lco-mcp'); // dispatched (mock)
    expect(dispatched).toHaveLength(1); // THE dedup: the second NEVER ran
    expect(second.result.isError).toBe(true);
    expect(second.result.content[0].text).toContain('already in flight');
    expect(second.result.content[0].text).toContain('exit code: 2');
  });

  it('the dedup key is lexically resolved: "/x" and "/x/." collide; different roots do not', async () => {
    const root = freshRoot('spec-core-stdio-gen2-');
    const h = makeSession({ dispatch: async () => null });
    const genLine = (id: number, dir: string) =>
      `{"jsonrpc":"2.0","id":${id},"method":"tools/call","params":{"name":"lco_generate","arguments":{"dir":${JSON.stringify(dir)}}}}`;
    h.send(genLine(1, join(root, 'sub')));
    h.send(genLine(2, `${join(root, 'sub')}/.`)); // same root, spelled differently
    h.send(genLine(3, join(root, 'other'))); // different root: not refused
    h.send(genLine(4, join(root, 'other/'))); // trailing slash of #3: refused

    // ids 1 and 3 dispatch (their mock response is null — silent); 2 and 4
    // are the in-flight refusals: exactly TWO responses exist.
    const responses = await collect(h, 2);
    expect(responses).toHaveLength(2);
    const refusedIds = responses
      .filter((r) => r.result?.isError === true && r.result.content[0].text.includes('already in flight'))
      .map((r) => r.id)
      .sort((a, b) => a - b);
    expect(refusedIds).toEqual([2, 4]);
  });

  it('the dedup slot is released when the first generate settles: a retry afterwards runs', async () => {
    const root = freshRoot('spec-core-stdio-gen3-');
    const dispatched: string[] = [];
    // Mock that echoes the request id (like the real dispatcher does).
    const echoInit = (line: string): string => {
      const id = (JSON.parse(line) as { id: unknown }).id;
      return JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: { serverInfo: { name: 'lco-mcp', version: '0.1.0' } },
      });
    };
    const h = makeSession({
      dispatch: async (line) => {
        dispatched.push(line);
        return echoInit(line);
      },
    });
    const genLine = (id: number) =>
      `{"jsonrpc":"2.0","id":${id},"method":"tools/call","params":{"name":"lco_generate","arguments":{"dir":${JSON.stringify(root)}}}}`;
    h.send(genLine(1));
    h.send(genLine(2)); // in-flight duplicate: refused
    const two = await collect(h, 2);
    expect(two.find((r) => r.id === 2)!.result.isError).toBe(true);
    // The first settled; the slot must be free again.
    h.send(genLine(3));
    const retry = await collect(h, 3);
    expect(dispatched).toHaveLength(2); // gen 1 and the retry BOTH ran
    expect(retry.find((r) => r.id === 3)!.result.serverInfo.name).toBe('lco-mcp');
  });
});

// --- stdout backpressure --------------------------------------------------------------

describe('McpStdioServer: stdout backpressure (OPS-001)', () => {
  it('a congested stdout PAUSES stdin; drain RESUMES it (never an unbounded write queue)', async () => {
    const input = new PassThrough();
    // Tiny write buffer: any real response (tools/list is several KB) overflows it.
    const output = new PassThrough({ highWaterMark: 16 });
    const exits: number[] = [];
    const pauseSpy = vi.spyOn(input, 'pause');
    const resumeSpy = vi.spyOn(input, 'resume');
    const server = new McpStdioServer({
      input,
      output,
      exit: (c) => exits.push(c),
      diag: (m) => diagSpy.push(m),
    });
    server.start();

    input.write('{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n');
    // The response write must return false (several KB into a 16-byte buffer)
    // and the session must pause reading in the SAME tick.
    await new Promise((r) => setTimeout(r, 50));
    expect(pauseSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(input.isPaused()).toBe(true);
    // Nobody read the output yet: still congested, nothing more was read.
    expect(output.read()).not.toBeNull(); // drain the response
    await new Promise((r) => setTimeout(r, 50));
    expect(resumeSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(input.isPaused()).toBe(false);
    expect(exits).toHaveLength(0); // healthy session: no exit
  });
});

// --- shutdown rules ---------------------------------------------------------------------

describe('McpStdioServer: shutdown (OPS-001)', () => {
  it('stdin EOF: in-flight work settles, writes flush, THEN exit 0', async () => {
    const h = makeSession();
    h.send('{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"lco_lint","arguments":{"dir":"/definitely/not/a/spec"}}}');
    h.endInput(); // EOF while the (fast) request may still be in flight
    await new Promise((r) => setTimeout(r, 500));
    expect(h.exitCodes()).toEqual([EXIT_OK]); // exactly once, code 0
    const lines = h.readAll();
    expect(lines).toHaveLength(1); // the response still flushed before exit
    expect(JSON.parse(lines[0]).id).toBe(1);
  });

  it('EOF with NOTHING in flight: immediate exit 0', async () => {
    const h = makeSession();
    h.endInput();
    await new Promise((r) => setTimeout(r, 100));
    expect(h.exitCodes()).toEqual([EXIT_OK]);
  });

  it('EPIPE mid-work: waits for the work to settle, then exits 3 — never 0', async () => {
    let release: () => void = () => {};
    const work = new Promise<string>((r) => (release = () => r(jsonInitResult())));
    const h = makeSession({ dispatch: () => work });
    h.send('{"jsonrpc":"2.0","id":1,"method":"tools/list"}');
    // Client's read end dies (the write into the dead pipe errors with EPIPE —
    // simulated exactly as the OS would deliver it to the stream).
    h.output.emit('error', Object.assign(new Error('broken pipe'), { code: 'EPIPE' }));
    await new Promise((r) => setTimeout(r, 150));
    // The work has NOT settled: still draining, no exit.
    expect(h.exitCodes()).toHaveLength(0);
    release();
    await new Promise((r) => setTimeout(r, 100));
    expect(h.exitCodes()).toEqual([EXIT_CLIENT_GONE]); // waited, THEN exited 3
  });

  it('after EPIPE, responses are no longer written (dead pipe, no partial/torn attempts)', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const writeSpy = vi.spyOn(output, 'write');
    const exits: number[] = [];
    const server = new McpStdioServer({
      input,
      output,
      dispatch: async () => jsonInitResult(),
      exit: (c) => exits.push(c),
      diag: (m) => diagSpy.push(m),
    });
    server.start();
    input.write('{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n');
    await new Promise((r) => setTimeout(r, 50));
    const writesBefore = writeSpy.mock.calls.length;
    expect(writesBefore).toBeGreaterThanOrEqual(1);
    output.emit('error', Object.assign(new Error('broken pipe'), { code: 'EPIPE' }));
    input.write('{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n');
    await new Promise((r) => setTimeout(r, 150));
    expect(writeSpy.mock.calls.length).toBe(writesBefore); // nothing new written
    expect(exits).toEqual([EXIT_CLIENT_GONE]);
  });

  it('EPIPE drain timeout: work that never settles → children killed, exit 4', async () => {
    const killGroups = vi.fn();
    const h = makeSession({
      dispatch: () => new Promise<string>(() => {}), // hangs forever
      killGroups,
      limits: { epipeDrainTimeoutMs: 80 },
    });
    h.send('{"jsonrpc":"2.0","id":1,"method":"tools/list"}');
    h.output.emit('error', Object.assign(new Error('broken pipe'), { code: 'EPIPE' }));
    await new Promise((r) => setTimeout(r, 30));
    expect(h.exitCodes()).toHaveLength(0); // still within the drain window
    await new Promise((r) => setTimeout(r, 200));
    expect(h.exitCodes()).toEqual([EXIT_DRAIN_TIMEOUT]);
    expect(killGroups).toHaveBeenCalledTimes(1); // abandoned children contained
  });

  it('non-EPIPE stream errors still crash loudly (old behavior preserved)', () => {
    const h = makeSession({ dispatch: async () => null });
    expect(() =>
      h.output.emit('error', Object.assign(new Error('EBADF'), { code: 'EBADF' })),
    ).toThrow('EBADF');
  });
});

/** A canned initialize result string (the mock dispatch's response). */
function jsonInitResult(): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    result: {
      protocolVersion: '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'lco-mcp', version: '0.1.0' },
    },
  });
}
