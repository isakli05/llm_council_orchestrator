import { resolve } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { handleRpcLine, isPlainObject, isJsonRpcId } from './server';
import { killActiveProcessGroups } from '../check/runner';

/**
 * The OPS-001 stdio session — the stateful half of `lco-mcp` (the bin wiring
 * in server.ts constructs exactly one of these over process.stdin/stdout).
 *
 * `handleRpcLine` (server.ts) stays the stateless protocol core: line in →
 * response line out. THIS module owns everything session-shaped the audit
 * found missing:
 *
 *   FRAME CAP      stdin is read in CHUNKS and assembled into lines under a
 *                  byte budget — a line that exceeds it is never buffered
 *                  whole: the overflow is discarded up to the next newline,
 *                  one `-32600 Request too large` response (id null) and one
 *                  stderr diagnostic are emitted, and the connection survives
 *                  for the next well-formed line. (Node's readline cannot cap
 *                  a line before buffering it — a 2 GB unterminated line is a
 *                  2 GB buffer there. Hence this own assembler.)
 *
 *   IN-FLIGHT CAP  at most MAX_IN_FLIGHT requests may be executing at once
 *                  (a request counts from acceptance to response-written).
 *                  Excess REQUESTS get an immediate structured `-32000
 *                  Server busy` error echoing their id. Notifications and
 *                  malformed lines are near-free (no dispatch) and are never
 *                  busy-refused. The cap bounds tool runs, mutations, and the
 *                  child processes a client can keep in flight at once.
 *
 *   MUTATIONS      same-root mutations serialize through the storage layer's
 *                  per-root lock (T6 — unchanged, pinned by tests at this
 *                  level too). The one session-level addition: a second
 *                  `lco_generate` for the SAME root while one is in flight
 *                  is refused immediately (structured isError, ZERO LLM
 *                  calls) — concurrent same-root generates both passed
 *                  consent and both ran the paid pipeline before (the write
 *                  was safe via no-clobber, but the calls were spent twice).
 *                  init/change stay on the lock alone (local and free).
 *
 *   BACKPRESSURE   responses go through `Writable.write`; when it returns
 *                  false the session PAUSES stdin until the stream drains.
 *                  Paused input produces no new lines, so the write queue is
 *                  structurally bounded: ≤ in-flight-cap responses plus the
 *                  paused pipe — never an unbounded buffer.
 *
 *   SHUTDOWN       stdin EOF (orderly client): stop taking lines, let
 *                  in-flight work settle and pending writes flush, exit 0.
 *                  stdout EPIPE/close (client died): stop taking lines, skip
 *                  further (undeliverable) writes, let in-flight work settle
 *                  within EPIPE_DRAIN_TIMEOUT_MS so started disk writes and
 *                  child lifecycles finish, then exit 3 (work was abandoned
 *                  mid-stream — nonzero by design). If the drain window is
 *                  exceeded, still-running verification process groups are
 *                  SIGKILLed (they cannot be reaped by a dead process) and
 *                  the server exits 4. The EOF path has NO artificial timer:
 *                  tools own their internal budgets (UX-003 wall budget,
 *                  check timeouts), so an orderly close waits for real work.
 *
 * Exit codes (documented in README): 0 orderly, 3 client-gone (EPIPE),
 * 4 drain timeout (work abandoned and children killed).
 *
 * Clock honesty (same ruling as the check executor): the drain timeout is a
 * wall-clock timer at the PROCESS boundary governing real shutdown of a real
 * stdio session; it is not part of any deterministic core. It is injectable
 * (`limits.epipeDrainTimeoutMs`) so tests pin it without sleeping in real
 * time.
 */

/** Max bytes of ONE stdin line (a frame). Legitimate MCP frames are small —
 * the largest argument anywhere is the 10k-char inline intent; 1 MiB is a
 * 100x headroom over any real frame and a hard bound against buffer abuse. */
export const MAX_FRAME_BYTES = 1024 * 1024;

/** Max concurrently executing requests (accepted → response written). */
export const MAX_IN_FLIGHT = 16;

/**
 * How long the server waits for in-flight work after the client vanished
 * (stdout EPIPE) before exiting 4 and SIGKILLing leftover process groups.
 * Generous for local fs mutations; a paid generate or long check that cannot
 * finish inside it is abandoned (its writes are undeliverable anyway).
 */
export const EPIPE_DRAIN_TIMEOUT_MS = 10_000;

/** Orderly shutdown (stdin EOF, everything settled and flushed). */
export const EXIT_OK = 0;
/** The client vanished (stdout EPIPE) — work was abandoned mid-stream. */
export const EXIT_CLIENT_GONE = 3;
/** Drain timeout after the client vanished — in-flight work was killed. */
export const EXIT_DRAIN_TIMEOUT = 4;

const BUSY_CODE = -32000; // JSON-RPC server-defined error range

/** One JSON-RPC error response line (mirrors server.ts's shape). */
function jsonRpcError(id: unknown, code: number, message: string): string {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
}

/** One isError tool-result response line (the refusal style of the tools). */
function toolRefusal(id: unknown, text: string): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id,
    result: {
      content: [{ type: 'text', text: `${text}\nexit code: 2` }],
      isError: true,
    },
  });
}

/**
 * What the scheduler needs to know about a line BEFORE dispatching it — a
 * cheap, fault-tolerant peek (the authoritative gate stays validateJsonRpcEnvelope
 * inside handleRpcLine). `request` lines may start WORK (busy check, dedup);
 * everything else (notifications, malformed, batches, id-bearing
 * notifications/*) resolves near-instantly and is never busy-refused.
 */
interface SchedulingPeek {
  kind: 'request' | 'light';
  /** The request's id (echoable — pre-validated as string|number|null). */
  id: string | number | null;
  /** path.resolve'd dir when this is an lco_generate call (dedup key). */
  generateDir?: string;
}

function peekForScheduling(line: string): SchedulingPeek {
  let msg: unknown;
  try {
    msg = JSON.parse(line);
  } catch {
    return { kind: 'light', id: null }; // parse error: -32700, no work
  }
  if (!isPlainObject(msg)) return { kind: 'light', id: null }; // batch/non-object: -32600, no work
  const method = (msg as Record<string, unknown>).method;
  if (typeof method !== 'string' || method === '') {
    return { kind: 'light', id: null }; // envelope error, no work
  }
  if (method.startsWith('notifications/')) {
    return { kind: 'light', id: null }; // silent by convention, no work
  }
  const hasId = 'id' in msg;
  const id = (msg as Record<string, unknown>).id;
  if (!hasId) return { kind: 'light', id: null }; // notification: silent, no work
  if (!isJsonRpcId(id)) return { kind: 'light', id: null }; // invalid id: -32600, no work

  let generateDir: string | undefined;
  const params = (msg as Record<string, unknown>).params;
  if (
    method === 'tools/call' &&
    isPlainObject(params) &&
    params.name === 'lco_generate' &&
    isPlainObject(params.arguments) &&
    typeof params.arguments.dir === 'string'
  ) {
    // Lexical resolution (no IO): catches "/x" vs "/x/" and "." variants;
    // symlink aliases are beyond a dedup key's job — the storage lock remains
    // the correctness backstop either way.
    generateDir = resolve(params.arguments.dir);
  }
  return { kind: 'request', id, generateDir };
}

export interface StdioServerLimits {
  maxFrameBytes?: number;
  maxInFlight?: number;
  epipeDrainTimeoutMs?: number;
}

export interface StdioServerOptions {
  input: Readable;
  output: Writable;
  limits?: StdioServerLimits;
  /**
   * Test seam: the per-line dispatcher. Default: the real handleRpcLine.
   * Injected by unit tests to control completion timing deterministically.
   */
  dispatch?: (line: string) => Promise<string | null>;
  /**
   * Test seam for the drain-timeout child containment. Default: the real
   * killActiveProcessGroups from the check runner.
   */
  killGroups?: () => void;
  /** Process exit (default: process.exit). */
  exit?: (code: number) => void;
  /** Diagnostics sink (default: console.error — stderr, never stdout). */
  diag?: (message: string) => void;
}

/**
 * One stdio session. `start()` attaches the listeners; the session exits
 * (via the injected `exit`) exactly once, after the shutdown rules above.
 */
export class McpStdioServer {
  private readonly input: Readable;
  private readonly output: Writable;
  private readonly maxFrameBytes: number;
  private readonly maxInFlight: number;
  private readonly epipeDrainTimeoutMs: number;
  private readonly dispatch: (line: string) => Promise<string | null>;
  private readonly killGroups: () => void;
  private readonly exit: (code: number) => void;
  private readonly diag: (message: string) => void;

  // Shutdown state.
  private closing = false;
  private closeReason: 'eof' | 'epipe' | null = null;
  private outputAlive = true;
  private exitCalled = false;
  private drainTimer: NodeJS.Timeout | null = null;

  // Work accounting.
  private inFlight = 0;
  private pendingWrites = 0;
  private readonly generateInFlight = new Set<string>();

  // Frame assembly (byte-capped: never buffers more than cap + one chunk).
  private lineParts: Buffer[] = [];
  private lineBytes = 0;
  private discarding = false;

  // Backpressure.
  private congested = false;

  constructor(opts: StdioServerOptions) {
    this.input = opts.input;
    this.output = opts.output;
    this.maxFrameBytes = opts.limits?.maxFrameBytes ?? MAX_FRAME_BYTES;
    this.maxInFlight = opts.limits?.maxInFlight ?? MAX_IN_FLIGHT;
    this.epipeDrainTimeoutMs =
      opts.limits?.epipeDrainTimeoutMs ?? EPIPE_DRAIN_TIMEOUT_MS;
    this.dispatch = opts.dispatch ?? handleRpcLine;
    this.killGroups = opts.killGroups ?? (() => killActiveProcessGroups('SIGKILL'));
    this.exit = opts.exit ?? ((code: number) => process.exit(code));
    this.diag = opts.diag ?? ((m: string) => console.error(m));
  }

  start(): void {
    this.input.on('data', (chunk: Buffer) => this.onData(chunk));
    this.input.on('end', () => this.beginDrain('eof'));
    this.input.on('close', () => this.beginDrain('eof'));
    this.input.on('error', (err: Error) => {
      this.diag(`lco-mcp: stdin error: ${err.message}`);
      this.beginDrain('eof');
    });
    this.output.on('error', (err: NodeJS.ErrnoException) => this.onOutputError(err));
  }

  // --- shutdown -----------------------------------------------------------------

  private onOutputError(err: NodeJS.ErrnoException): void {
    if (err.code === 'EPIPE') {
      // The client died. Begin (or escalate) the graceful drain; further
      // writes are skipped — nothing is deliverable to a dead pipe.
      this.beginDrain('epipe');
      return;
    }
    // Anything else is a real stream error — crash loudly (old behavior).
    throw err;
  }

  private beginDrain(reason: 'eof' | 'epipe'): void {
    if (this.exitCalled) return;
    if (reason === 'epipe') {
      if (this.closeReason === 'epipe') return; // already draining for epipe
      // An orderly EOF drain upgrades: responses are no longer deliverable,
      // so "settled + flushed → exit 0" must become the client-gone path.
      this.closeReason = 'epipe';
      this.outputAlive = false;
      if (this.drainTimer === null) {
        this.drainTimer = setTimeout(() => this.onDrainTimeout(), this.epipeDrainTimeoutMs);
      }
    } else if (this.closeReason === null) {
      this.closeReason = 'eof';
    }
    this.closing = true; // stop accepting new lines (existing ones continue)
    this.maybeFinish();
  }

  private onDrainTimeout(): void {
    if (this.exitCalled) return;
    this.exitCalled = true;
    this.diag(
      `lco-mcp: drain timeout (${this.epipeDrainTimeoutMs}ms) with ${this.inFlight} request(s) ` +
        `still in flight after the client vanished — abandoning them and killing leftover process groups`,
    );
    // The server's own timeout timers die with this process; the children
    // cannot outlive that containment (OPS-001/SEC-005).
    this.killGroups();
    this.exit(EXIT_DRAIN_TIMEOUT);
  }

  private maybeFinish(): void {
    if (
      !this.closing ||
      this.exitCalled ||
      this.inFlight > 0 ||
      (this.outputAlive && this.pendingWrites > 0)
    ) {
      return;
    }
    this.exitCalled = true;
    if (this.drainTimer !== null) clearTimeout(this.drainTimer);
    this.detach();
    this.exit(this.closeReason === 'epipe' ? EXIT_CLIENT_GONE : EXIT_OK);
  }

  /** Pause input only — the stream keeps its listeners, so "detach" stops
   *  FEEDING the session rather than silencing it; a finished session never
   *  reacts again because the `closing`/`exitCalled` guards refuse everything
   *  downstream. */
  private detach(): void {
    this.input.pause();
  }

  // --- input: byte-capped line assembly ------------------------------------------

  private onData(chunk: Buffer): void {
    if (this.closing) return; // shutdown began: remaining input is dropped
    let start = 0;
    let i = chunk.indexOf(10); // '\n'
    while (i !== -1) {
      const piece = chunk.subarray(start, i);
      if (this.discarding) {
        // The oversized line is now terminated: resume normal framing. Its
        // bytes were already discarded; the too-large response was sent at
        // the moment the cap was crossed.
        this.discarding = false;
      } else {
        this.acceptPiece(piece);
        if (this.discarding) {
          // acceptPiece tripped the cap for [buffer + piece]; the newline
          // that follows ends the abusive line.
          this.discarding = false;
        } else {
          this.emitLine();
        }
      }
      start = i + 1;
      i = chunk.indexOf(10, start);
    }
    const rest = chunk.subarray(start);
    if (rest.length > 0 && !this.discarding) {
      this.acceptPiece(rest); // no newline yet: hold (under the cap) for more
    }
  }

  /** Add bytes to the pending line, or trip the cap (bounded buffering). */
  private acceptPiece(piece: Buffer): void {
    if (this.lineBytes + piece.length > this.maxFrameBytes) {
      // NEVER buffer the oversized line: drop what is held, discard forward
      // to the next newline, tell the client once (id null — the line is
      // unparseable by policy), and keep serving subsequent lines.
      this.lineParts = [];
      this.lineBytes = 0;
      this.discarding = true;
      this.diag(
        `lco-mcp: dropping a line larger than the ${this.maxFrameBytes}-byte frame cap`,
      );
      this.writeLine(
        jsonRpcError(
          null,
          -32600,
          `Request too large: the line exceeds the ${this.maxFrameBytes}-byte frame cap`,
        ),
      );
      return;
    }
    this.lineParts.push(piece);
    this.lineBytes += piece.length;
  }

  private emitLine(): void {
    const line =
      this.lineParts.length === 1
        ? this.lineParts[0].toString('utf8')
        : Buffer.concat(this.lineParts).toString('utf8');
    this.lineParts = [];
    this.lineBytes = 0;
    // schedule() trims, which also tolerates a trailing \r (CRLF clients).
    this.schedule(line);
  }

  // --- scheduling: busy gate, generate dedup, dispatch -----------------------------

  private schedule(rawLine: string): void {
    const trimmed = rawLine.trim();
    if (trimmed === '') return; // blank keepalive line
    const peek = peekForScheduling(trimmed);
    if (peek.kind !== 'request') {
      // Notifications and malformed lines do no work — never busy-refused;
      // handleRpcLine answers (or stays silent) immediately.
      void this.settleDispatch(trimmed, undefined, false);
      return;
    }
    if (this.inFlight >= this.maxInFlight) {
      this.writeLine(
        jsonRpcError(
          peek.id,
          BUSY_CODE,
          `Server busy: ${this.maxInFlight} requests are already in flight — resend when earlier requests complete`,
        ),
      );
      return;
    }
    if (peek.generateDir !== undefined) {
      if (this.generateInFlight.has(peek.generateDir)) {
        // The paid pipeline already runs for this root: refuse the duplicate
        // immediately, ZERO LLM calls (write safety stays with the lock).
        this.writeLine(
          toolRefusal(
            peek.id,
            'generation refused: another lco_generate for this root is already in flight — ' +
              'wait for it to complete, then retry (the paid pipeline runs once per root at a time)',
          ),
        );
        return;
      }
      this.generateInFlight.add(peek.generateDir);
    }
    this.inFlight += 1;
    void this.settleDispatch(trimmed, peek.generateDir, true);
  }

  private async settleDispatch(
    line: string,
    generateDir: string | undefined,
    counted: boolean,
  ): Promise<void> {
    try {
      let response: string | null;
      try {
        response = await this.dispatch(line);
      } catch (err: unknown) {
        // handleRpcLine never rejects; belt-and-braces (old wiring had it too).
        this.diag(`lco-mcp: unhandled error while processing a line: ${String(err)}`);
        response = null;
      }
      if (generateDir !== undefined) this.generateInFlight.delete(generateDir);
      if (counted) this.inFlight -= 1;
      this.writeLine(response);
      this.maybeFinish();
    } catch {
      // Never let accounting state corrupt on a write failure.
      if (generateDir !== undefined) this.generateInFlight.delete(generateDir);
      if (counted) this.inFlight -= 1;
      this.maybeFinish();
    }
  }

  // --- output: backpressure-aware writes -------------------------------------------

  private writeLine(response: string | null): void {
    if (response === null) return;
    if (!this.outputAlive) return; // dead pipe: undeliverable, skip silently
    this.pendingWrites += 1;
    let ok: boolean;
    try {
      ok = this.output.write(`${response}\n`, () => {
        this.pendingWrites -= 1;
        this.maybeFinish();
      });
    } catch {
      this.pendingWrites -= 1;
      return;
    }
    if (!ok && !this.congested) {
      // Backpressure: stop READING until the stream drains. Paused input
      // produces no new lines ⇒ the write queue stays structurally bounded.
      this.congested = true;
      this.input.pause();
      this.output.once('drain', () => {
        this.congested = false;
        if (!this.closing) this.input.resume();
        this.maybeFinish();
      });
    }
  }
}
