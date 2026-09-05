/**
 * Process-group containment for the Graphify subprocess boundary (M-06):
 * a timeout (or output cap) must kill the WHOLE process group — a trusted
 * tool that spawns descendants cannot outlive the boundary. Real processes,
 * harmless fixtures only (a grandchild that tries to write a marker later).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSubprocess } from './subprocess';

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
  tmpDirs.length = 0;
});

describe('runSubprocess: process-group containment (M-06)', () => {
  it('a timeout kills the whole group — the orphaned grandchild never writes its marker', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lco-subproc-'));
    tmpDirs.push(dir);
    const marker = join(dir, 'grandchild-was-here');
    const grandchild = join(dir, 'grandchild.js');
    const child = join(dir, 'child.js');
    writeFileSync(
      grandchild,
      `const fs = require('node:fs');
setTimeout(() => { fs.writeFileSync(${JSON.stringify(marker)}, 'alive'); }, 1200);`,
    );
    writeFileSync(
      child,
      `const { spawn } = require('node:child_process');
// Spawn a DETACHED grandchild in its own session so only a GROUP kill
// (not a direct-child kill) can reach it... but we share the process
// GROUP deliberately (typical shell helper shape): no new
// session means the group kill must catch it.
spawn('node', [${JSON.stringify(grandchild)}], { stdio: 'ignore' });
setInterval(() => {}, 100); // the direct child idles forever`,
    );

    const result = await runSubprocess('node', [child], { timeoutMs: 300, maxBufferBytes: 1024 * 1024 });
    expect(result.status).toBe('timeout');

    // Give the grandchild's timer its chance to fire — if the group kill
    // worked, the process no longer exists and the marker never appears.
    await new Promise((r) => setTimeout(r, 1800));
    expect(existsSync(marker)).toBe(false);
  }, 15_000);
});
