/**
 * REAL Graphify integration (pinned external tool, offline AST-only build).
 *
 * Portability contract (plan §Test Strategy): this is the ONLY suite that
 * invokes the real `graphify` executable. It skips cleanly when graphify is
 * absent/unsupported so the portable unit suite never depends on it — CI
 * environments running renewal acceptance MUST install graphify >=0.9.50 <0.10.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cpSync, mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { GraphifyAdapter } from './graphify-adapter';
import { runSubprocess } from './subprocess';

function realGraphifyVersion(): string | undefined {
  try {
    const out = execFileSync('graphify', ['--version'], { encoding: 'utf8', timeout: 10_000 });
    return /graphify (\d+\.\d+\.\d+)/.exec(out)?.[1];
  } catch {
    return undefined;
  }
}

const installedVersion = realGraphifyVersion();
const available = installedVersion !== undefined && GraphifyAdapter.versionSupportedStatic(installedVersion);

const cleanup: string[] = [];
let workspaceRoot = '';

beforeAll(() => {
  workspaceRoot = mkdtempSync(join(tmpdir(), 'lco-renew-graphify-'));
  cleanup.push(workspaceRoot);
  // Stage the fixture legacy app sources into the LCO-owned workspace (the
  // same containment pattern production uses — the fixture dir is untouched).
  cpSync(join(__dirname, '..', '..', '..', 'fixtures', 'legacy-app', 'src'), join(workspaceRoot, 'src'), {
    recursive: true,
  });
  cpSync(
    join(__dirname, '..', '..', '..', 'fixtures', 'legacy-app', 'package.json'),
    join(workspaceRoot, 'package.json'),
  );
});

afterAll(() => {
  for (const dir of cleanup) rmSync(dir, { recursive: true, force: true });
});

describe.skipIf(!available)('GraphifyAdapter × real graphify (pinned, offline)', () => {
  const adapter = () => new GraphifyAdapter({ workspaceRoot });

  it('probes the installed version as supported', async () => {
    const probe = await adapter().probe();
    expect(probe.ok).toBe(true);
    if (!probe.ok) return;
    expect(probe.providerVersion).toBe(installedVersion);
  });

  it(
    'builds a graph offline (AST-only) inside the LCO workspace',
    async () => {
      const build = await adapter().build();
      expect(build.ok).toBe(true);
      if (!build.ok) return;
      expect(existsSync(join(workspaceRoot, 'graphify-out', 'graph.json'))).toBe(true);
    },
    180_000,
  );

  it(
    'reports honest health over the real graph',
    async () => {
      const health = await adapter().graphHealth();
      expect(health.ok).toBe(true);
      if (!health.ok) return;
      expect(health.node_count).toBeGreaterThan(5);
      expect(health.languages).toContain('ts');
      expect(health.provider_version).toBe(installedVersion);
    },
    60_000,
  );

  it(
    'serves god nodes and blast radius from the real graph',
    async () => {
      const gods = await adapter().godNodes(5);
      expect(gods.length).toBeGreaterThan(0);
      // createOrder is structurally the busiest function in the fixture app.
      expect(gods.some((g) => g.label === 'createOrder' || g.node_id.includes('createorder'))).toBe(true);

      const affected = await adapter().affected(gods[0].node_id, { depth: 2 });
      expect(affected.ok).toBe(true);
    },
    60_000,
  );

  it(
    'agrees with the CLI god-nodes surface on the fixture (cross-check)',
    async () => {
      const gods = await adapter().godNodes(1);
      expect(gods.length).toBe(1);
      const cli = await runSubprocess(
        'graphify',
        ['god-nodes', '--top', '3', '--graph', join(workspaceRoot, 'graphify-out', 'graph.json')],
        { timeoutMs: 30_000, maxBufferBytes: 4 * 1024 * 1024 },
      );
      expect(cli.status).toBe('exited');
      if (cli.status !== 'exited') return;
      const label = gods[0].label ?? gods[0].node_id;
      expect(cli.stdout.toLowerCase()).toContain(label.toLowerCase());
    },
    60_000,
  );

  it('leaves the staged fixture app sources untouched (workspace-only writes)', () => {
    const graphText = readFileSync(join(workspaceRoot, 'graphify-out', 'graph.json'), 'utf8');
    const g = JSON.parse(graphText) as { nodes: { source_file?: string }[] };
    // Every referenced source lives under the workspace copy, never outside.
    for (const n of g.nodes) {
      if (n.source_file) expect(n.source_file.startsWith('src/') || n.source_file === 'package.json').toBe(true);
    }
  });
});
