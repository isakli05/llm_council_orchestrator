import { describe, it, expect } from 'vitest';
import { runSubprocess } from './subprocess';

const NODE = process.execPath;
const MB = 1024 * 1024;

describe('runSubprocess (safe subprocess boundary)', () => {
  it('captures stdout, stderr, and exit code on success', async () => {
    const r = await runSubprocess(NODE, ['-e', "console.log('hi'); console.error('warn')"], {
      timeoutMs: 10_000,
      maxBufferBytes: MB,
    });
    expect(r.status).toBe('exited');
    if (r.status !== 'exited') return;
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe('hi\n');
    expect(r.stderr).toBe('warn\n');
  });

  it('reports non-zero exit codes (caller decides meaning)', async () => {
    const r = await runSubprocess(NODE, ['-e', "console.error('boom'); process.exit(3)"], {
      timeoutMs: 10_000,
      maxBufferBytes: MB,
    });
    expect(r.status).toBe('exited');
    if (r.status !== 'exited') return;
    expect(r.exitCode).toBe(3);
    expect(r.stderr).toBe('boom\n');
  });

  it('kills and reports timeouts', async () => {
    const r = await runSubprocess(NODE, ['-e', 'setTimeout(() => {}, 60000)'], {
      timeoutMs: 200,
      maxBufferBytes: MB,
    });
    expect(r.status).toBe('timeout');
  });

  it('enforces the output cap without buffering past it', async () => {
    const r = await runSubprocess(
      NODE,
      ['-e', "process.stdout.write('x'.repeat(500_000)); process.stdout.write('y'.repeat(500_000))"],
      { timeoutMs: 10_000, maxBufferBytes: 64 * 1024 },
    );
    expect(r.status).toBe('output_cap');
    if (r.status !== 'output_cap') return;
    expect(r.stdout.length).toBeLessThanOrEqual(64 * 1024);
  });

  it('reports spawn failures for a nonexistent executable', async () => {
    const r = await runSubprocess('/nonexistent/executable-xyz', [], {
      timeoutMs: 1_000,
      maxBufferBytes: MB,
    });
    expect(r.status).toBe('spawn_failed');
  });

  it('never goes through a shell: metacharacters arrive as single argv entries', async () => {
    const evil = 'a b;rm -rf /';
    const r = await runSubprocess(
      NODE,
      ['-e', 'console.log(JSON.stringify(process.argv.slice(1)))', evil, '$(echo pwned)', '`id`'],
      { timeoutMs: 10_000, maxBufferBytes: MB },
    );
    expect(r.status).toBe('exited');
    if (r.status !== 'exited') return;
    const argv = JSON.parse(r.stdout) as string[];
    expect(argv).toContain(evil);
    expect(argv).toContain('$(echo pwned)');
    expect(argv).toContain('`id`');
  });

  it('rejects an executable name containing shell metacharacters outright', async () => {
    await expect(
      runSubprocess('graphify; rm -rf /', ['--version'], { timeoutMs: 1_000, maxBufferBytes: MB }),
    ).resolves.toMatchObject({ status: 'spawn_failed' });
  });
});
