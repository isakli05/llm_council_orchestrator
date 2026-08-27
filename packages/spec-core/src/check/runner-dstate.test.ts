import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * T16 rider (TEST-003 carry list): the D-STATE leader watchdog.
 *
 * A shell leader stuck in uninterruptible sleep (D-state — NFS hang, dying
 * disk) is killed by neither SIGTERM nor SIGKILL in wall-clock terms, never
 * reaps (no 'exit' event), and therefore never emits 'close'. Before the
 * watchdog the executor's promise could hang forever on the
 * `teardownDone && streamsClosed` gate — the destroy() backstop destroyed
 * OUR pipe ends, but nothing ever set `streamsClosed`.
 *
 * D-state cannot be reproduced deterministically with a real process (it is
 * an I/O-scheduler condition), so this file MOCKS node:child_process for ONE
 * magic command and injects the pathological CHILD SHAPE instead: streams
 * whose destroy() is a no-op and that never emit 'close', and a child that
 * never emits 'exit'/'close'/'error'. Everything else in the module under
 * test is the production code path.
 *
 * The mock lives in this dedicated file on purpose: the real-process
 * containment tests in runner.test.ts must keep the REAL spawn.
 */

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  const { EventEmitter } = await import('node:events');

  const makeNeverClosingStream = (): NodeJS.ReadableStream & { destroy(): void } => {
    const s = new EventEmitter() as NodeJS.ReadableStream & { destroy(): void };
    // The production code calls all three; each is a no-op that NEVER leads
    // to a 'close' event — exactly the D-state writer holding the pipe.
    s.setEncoding = () => {};
    s.destroy = () => {};
    return s;
  };

  return {
    ...actual,
    spawn: (cmd: string, opts: unknown) => {
      if (cmd !== 'd-state-leader') return actual.spawn(cmd, opts);
      const child = new EventEmitter() as EventEmitter & {
        pid: number | undefined;
        stdout: NodeJS.ReadableStream & { destroy(): void };
        stderr: NodeJS.ReadableStream & { destroy(): void };
      };
      child.pid = 999_999; // unused pgid: kill(-pid, 0) -> ESRCH (group "dead"),
      // so teardown takes the FAST path — proving the watchdog also covers
      // "group gone but streams still never close", the destroy() backstop's
      // own blind spot (the alive-group SIGKILL path gates on the same
      // settle() condition).
      child.stdout = makeNeverClosingStream();
      child.stderr = makeNeverClosingStream();
      return child;
    },
  };
});

// Imported AFTER the mock declaration (vitest hoists vi.mock above imports).
import { execInProcessGroup } from './runner';

describe('execInProcessGroup: D-state leader watchdog (T16 rider)', () => {
  it('a leader whose streams NEVER close still resolves — TIMEOUT verdict, bounded time', async () => {
    const root = mkdtempSync(join(tmpdir(), 'spec-core-dstate-'));
    try {
      const startedAt = Date.now();
      // timeoutMs fires the kill; graceMs bounds the escalation; the second
      // watchdog must then force-settle. Total bound ~ timeout + grace + the
      // final settle window.
      const result = await execInProcessGroup('d-state-leader', {
        cwd: root,
        timeoutMs: 100,
        graceMs: 100,
      });
      const elapsed = Date.now() - startedAt;

      // The normal TIMEOUT verdict — never a hang, never a PASS by default.
      expect(result).toEqual({ exit: null, stdout: '', timedOut: true });
      // Bounded: far under this test's own timeout. (Against the pre-watchdog
      // code this await NEVER resolves — the test then dies on its timeout,
      // which is the RED demonstration for this exact scenario.)
      expect(elapsed).toBeLessThan(2500);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 5000);

  it('a healthy command still settles through the normal exit/close path (passthrough branch)', async () => {
    // The mock passes non-magic commands to the REAL spawn: the watchdog must
    // not have made force-settle the only way out — normal runs still resolve
    // with the judged exit code, well before any watchdog could matter.
    const root = mkdtempSync(join(tmpdir(), 'spec-core-dstate-healthy-'));
    try {
      const result = await execInProcessGroup('exit 0', { cwd: root, timeoutMs: 5000 });
      expect(result).toEqual({ exit: 0, stdout: '', timedOut: false });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 10_000);
});
