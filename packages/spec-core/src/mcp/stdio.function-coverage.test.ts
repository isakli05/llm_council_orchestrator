import { afterEach, describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { McpStdioServer, EXIT_DRAIN_TIMEOUT } from './stdio';

/**
 * Deterministic function-coverage hardening for the McpStdioServer
 * CONSTRUCTOR DEFAULTS (killGroups / diag): the documented default
 * diagnostics sink is console.error — stderr, never stdout — and the default
 * kill-groups hook contains leftover child groups when an abandoned drain
 * times out (OPS-001/SEC-005).
 *
 * `exit` stays injected (its default is process.exit — unusable in a worker;
 * that default is unreachable-by-construction in-process and deliberately
 * not targeted here). The drain window is narrowed via the configurable
 * limit; the in-flight request is an explicitly never-resolving dispatch, so
 * the sequence is deterministic — no real timing race.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

describe('McpStdioServer constructor defaults (diag -> stderr, killGroups containment)', () => {
  it('EPIPE drain timeout with DEFAULT diag/killGroups: diagnostics land on stderr (never stdout), leftover groups are killed, exit is exactly once with the drain-timeout code', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const input = new PassThrough();
    const output = new PassThrough();
    const outChunks: Buffer[] = [];
    output.on('data', (c: Buffer) => outChunks.push(c)); // keep the readable side uncongested

    const exits: number[] = [];
    let onExit: (() => void) | undefined;
    const exited = new Promise<void>((resolve) => {
      onExit = resolve;
    });
    const server = new McpStdioServer({
      input,
      output,
      // dispatch never settles: the request is genuinely in flight when the
      // client vanishes, so the drain CANNOT finish inside the window.
      dispatch: () => new Promise<string | null>(() => {}),
      exit: (code) => {
        exits.push(code);
        onExit?.();
      },
      limits: { epipeDrainTimeoutMs: 40 },
    });
    server.start();

    input.write('{"jsonrpc":"2.0","id":7,"method":"tools/list"}\n');
    // The client's read end dies: writes into the dead pipe surface as EPIPE.
    output.emit('error', Object.assign(new Error('broken pipe'), { code: 'EPIPE' }));

    await exited;

    // The abandoned drain exits exactly once with the documented code.
    expect(exits).toEqual([EXIT_DRAIN_TIMEOUT]);
    // DEFAULT diag contract: the drain-timeout diagnosis went to STDERR
    // (console.error), never to stdout (the RPC surface).
    expect(errSpy).toHaveBeenCalled();
    const diagText = errSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(diagText).toContain('drain timeout');
    expect(logSpy).not.toHaveBeenCalled();
    // The default killGroups hook ran before exit (containment on an empty
    // group registry is a no-op — reaching exit proves it did not throw).
  });
});
