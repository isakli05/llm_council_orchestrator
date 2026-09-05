/**
 * Safe subprocess boundary for invoking trusted external tools (Graphify).
 *
 * Hard rules (audit 16 §C, 18 §A):
 *   - explicit argv arrays — NEVER a shell, never string interpolation;
 *   - executable names are validated against a safe charset before spawn;
 *   - wall-clock timeouts kill the child;
 *   - per-stream output caps are enforced WITHOUT buffering past the cap;
 *   - exit status is always surfaced; stderr is preserved as diagnostics.
 */
import { spawn } from 'node:child_process';

export type SubprocessResult =
  | { status: 'exited'; exitCode: number | null; stdout: string; stderr: string }
  | { status: 'timeout'; stdout: string; stderr: string }
  | { status: 'output_cap'; stdout: string; stderr: string }
  | { status: 'spawn_failed'; message: string };

export interface SubprocessOptions {
  timeoutMs: number;
  /** Per-stream byte cap; output past the cap is discarded and reported. */
  maxBufferBytes: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

/** Injectable runner signature (tests script it; the adapter injects it). */
export type SubprocessRunner = (
  executable: string,
  args: readonly string[],
  opts: SubprocessOptions,
) => Promise<SubprocessResult>;

/** Executables are paths/command names — nothing with shell syntax in them. */
const SAFE_EXECUTABLE = /^[A-Za-z0-9_./@:+-]+$/;

export function runSubprocess(
  executable: string,
  args: readonly string[],
  opts: SubprocessOptions,
): Promise<SubprocessResult> {
  if (!SAFE_EXECUTABLE.test(executable)) {
    return Promise.resolve({
      status: 'spawn_failed',
      message: `executable '${executable}' contains characters outside the safe set (paths and command names only — never shell syntax)`,
    });
  }

  return new Promise<SubprocessResult>((resolve) => {
    let child;
    // M-06: on POSIX the child is spawned DETACHED as its own process-group
    // leader, so a timeout/output-cap kill can terminate the WHOLE group —
    // a trusted tool that spawns descendants cannot outlive the boundary.
    // Windows has no group semantics here: the direct kill stands (documented
    // platform fallback).
    const groupLeader = process.platform !== 'win32';
    try {
      child = spawn(executable, args, {
        cwd: opts.cwd,
        env: opts.env,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        ...(groupLeader ? { detached: true } : {}),
      });
    } catch (e) {
      resolve({ status: 'spawn_failed', message: (e as Error).message });
      return;
    }

    /** Kill the child; when it leads a process group, kill the GROUP. */
    const killTree = (): void => {
      const pid = child.pid;
      try {
        if (groupLeader && pid !== undefined) {
          try {
            process.kill(-pid, 'SIGKILL');
            return; // group signalled — done
          } catch {
            /* group already gone: fall through to the direct kill */
          }
        }
        child.kill('SIGKILL');
      } catch {
        /* already gone */
      }
    };

    let stdout = '';
    let stderr = '';
    let capped = false;
    let timedOut = false;
    let settled = false;

    const cap = opts.maxBufferBytes;
    const collect = (buf: 'stdout' | 'stderr'): (chunk: Buffer) => void => {
      return (chunk: Buffer) => {
        if (capped) return;
        const current = buf === 'stdout' ? stdout : stderr;
        const next = current + chunk.toString('utf8');
        if (Buffer.byteLength(next, 'utf8') > cap) {
          if (buf === 'stdout') stdout = next.slice(0, cap);
          else stderr = next.slice(0, cap);
          capped = true;
          killTree();
          return;
        }
        if (buf === 'stdout') stdout = next;
        else stderr = next;
      };
    };

    child.stdout?.on('data', collect('stdout'));
    child.stderr?.on('data', collect('stderr'));

    const timer = setTimeout(() => {
      timedOut = true;
      killTree();
    }, opts.timeoutMs);

    const finish = (result: SubprocessResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    child.on('error', (err: NodeJS.ErrnoException) => {
      finish({
        status: 'spawn_failed',
        message:
          err.code === 'ENOENT'
            ? `executable '${executable}' not found on PATH (code ENOENT)`
            : `failed to launch '${executable}': ${err.message}`,
      });
    });

    child.on('close', (code) => {
      if (capped) finish({ status: 'output_cap', stdout, stderr });
      else if (timedOut) finish({ status: 'timeout', stdout, stderr });
      else finish({ status: 'exited', exitCode: code, stdout, stderr });
    });
  });
}
