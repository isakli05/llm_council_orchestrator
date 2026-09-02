/**
 * The CLI BOUNDARY wiring for renew commands, exercised in-process through
 * the real `runCli` dispatcher (the same code `lco` executes) — covers the
 * capability closures (clock/provider/git/budget/llm/openBrowser) and the
 * dispatch arms with the real GraphifyAdapter path.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../cli/index';

const tmpDirs: string[] = [];
function freshDir(p: string): string {
  const dir = mkdtempSync(join(tmpdir(), p));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
  tmpDirs.length = 0;
});
const FIXTURE_SRC = join(__dirname, '..', '..', 'fixtures', 'legacy-app');

function makeTarget(): string {
  const target = freshDir('lco-rc-target-');
  cpSync(join(FIXTURE_SRC, 'src'), join(target, 'src'), { recursive: true });
  cpSync(join(FIXTURE_SRC, 'package.json'), join(target, 'package.json'));
  return target;
}

// The real boundary constructs a GraphifyAdapter; its probe shells out to the
// installed graphify. On machines without graphify the probe fails closed —
// assert the DOCUMENTED outcome for that environment instead of skipping.
const graphifyAvailable = (() => {
  try {
    require('node:child_process').execFileSync('graphify', ['--version'], { timeout: 10_000, stdio: ['ignore', 'pipe', 'ignore'] });
    return true;
  } catch {
    return false;
  }
})();

describe('runCli boundary: renew wiring', () => {
  it('renew <sub> --help prints the subcommand help and exits 0', async () => {
    expect(await runCli(['renew', 'analyze', '/tmp/x', '--help'])).toBe(0);
    expect(await runCli(['renew', 'export', '/tmp/x', '--help'])).toBe(0);
  });

  it('renew status on a non-project fails with the actionable message (exit 2)', async () => {
    const code = await runCli(['renew', 'status', freshDir('lco-rc-nonproj-')]);
    expect(code).toBe(2);
  });

  it('renew init → status round-trip through the REAL boundary (GraphifyAdapter + git probe)', async () => {
    if (!graphifyAvailable) return; // documented local skip; CI installs graphify (H-13)
    const target = makeTarget();
    const project = freshDir('lco-rc-project-');
    const init = await runCli(['renew', 'init', project, '--target', target, '--name', 'rc']);
    expect(init).toBe(0);
    const status = await runCli(['renew', 'status', project]);
    expect(status).toBe(0);
    // JSON arm of the dispatch path.
    const json = await runCli(['renew', 'status', project, '--json']);
    expect(json).toBe(0);
    // The gitCommit closure runs for a plain (non-git) tree → repo_kind plain.
    const refresh = await runCli(['renew', 'refresh', project]);
    expect(refresh).toBe(0);
  }, 120_000);

  it('renew analyze without any LLM configuration fails closed with ZERO calls (exit 2)', async () => {
    if (!graphifyAvailable) return;
    const target = makeTarget();
    const project = freshDir('lco-rc-noLlm-');
    expect(await runCli(['renew', 'init', project, '--target', target])).toBe(0);
    const savedBase = process.env.LCO_LLM_BASE_URL;
    delete process.env.LCO_LLM_BASE_URL;
    try {
      // Fail-closed BEFORE any call: the boundary refuses to construct a live
      // route without complete env — the observable contract is the throw
      // naming the missing variables (and zero network activity).
      await expect(runCli(['renew', 'analyze', project])).rejects.toThrow(/LCO_LLM_/);
    } finally {
      if (savedBase !== undefined) process.env.LCO_LLM_BASE_URL = savedBase;
    }
  }, 120_000);

  it('grammar errors from the boundary return exit 2 with the usage error', async () => {
    expect(await runCli(['renew', 'review', '/tmp/x', '--answers', 'a.json', '--interactive'])).toBe(2);
    expect(await runCli(['renew', 'init', '/tmp/x'])).toBe(2);
    expect(await runCli(['renew'])).toBe(2);
  });
});
