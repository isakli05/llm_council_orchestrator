import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GraphifyAdapter, parseGraphifyVersion, versionSupported } from './graphify-adapter';
import type { SubprocessRunner, SubprocessResult } from './subprocess';

const fixturePath = join(__dirname, '..', '..', '..', 'fixtures', 'legacy-app', 'graph-fixture.json');
const fixtureGraphText = readFileSync(fixturePath, 'utf8');

/** Scripted runner: answers by inspecting argv, never executes anything real. */
function fakeRunner(
  respond: (args: readonly string[]) => SubprocessResult | Promise<SubprocessResult>,
): SubprocessRunner & { calls: { exe: string; args: string[]; timeoutMs: number }[] } {
  const calls: { exe: string; args: string[]; timeoutMs: number }[] = [];
  const runner: SubprocessRunner = async (exe, args, opts) => {
    calls.push({ exe, args: [...args], timeoutMs: opts.timeoutMs });
    return respond(args);
  };
  return Object.assign(runner, { calls });
}

const okVersion = (v: string): SubprocessResult => ({
  status: 'exited',
  exitCode: 0,
  stdout: `graphify ${v}\n`,
  stderr: '',
});

const goodFile = () => fixtureGraphText;

function makeAdapter(runner: SubprocessRunner, readFile: (p: string) => string = goodFile) {
  return new GraphifyAdapter({ workspaceRoot: '/tmp/ws', runner, readFile });
}

describe('version handling', () => {
  it('parses "graphify 0.9.50" output', () => {
    expect(parseGraphifyVersion('graphify 0.9.50\n')).toBe('0.9.50');
    expect(parseGraphifyVersion('graphify 1.2.3')).toBe('1.2.3');
  });

  it('returns undefined for garbage output', () => {
    expect(parseGraphifyVersion('nonsense')).toBeUndefined();
    expect(parseGraphifyVersion('')).toBeUndefined();
  });

  it('supports the pinned range >=0.9.50 <0.10.0', () => {
    expect(versionSupported('0.9.50')).toBe(true);
    expect(versionSupported('0.9.99')).toBe(true);
    expect(versionSupported('0.9.49')).toBe(false);
    expect(versionSupported('0.10.0')).toBe(false);
    expect(versionSupported('1.0.0')).toBe(false);
  });
});

describe('GraphifyAdapter.probe (fail-closed)', () => {
  it('accepts a supported version', async () => {
    const runner = fakeRunner(() => okVersion('0.9.50'));
    const probe = await makeAdapter(runner).probe();
    expect(probe.ok).toBe(true);
    if (!probe.ok) return;
    expect(probe.providerVersion).toBe('0.9.50');
    expect(probe.supportedRange).toBe('>=0.9.50 <0.10.0');
  });

  it('refuses an unsupported NEWER version with an actionable message', async () => {
    const runner = fakeRunner(() => okVersion('0.10.0'));
    const probe = await makeAdapter(runner).probe();
    expect(probe.ok).toBe(false);
    if (probe.ok) return;
    expect(probe.code).toBe('unsupported_version');
    expect(probe.message).toContain('0.10.0');
    expect(probe.message).toContain('0.9.50');
    expect(typeof probe.hint).toBe('string');
  });

  it('refuses an unsupported OLDER version', async () => {
    const runner = fakeRunner(() => okVersion('0.9.40'));
    const probe = await makeAdapter(runner).probe();
    expect(probe.ok).toBe(false);
    if (probe.ok) return;
    expect(probe.code).toBe('unsupported_version');
  });

  it('fails closed on unparseable version output', async () => {
    const runner = fakeRunner(() => ({ status: 'exited', exitCode: 0, stdout: 'garbage', stderr: '' }));
    const probe = await makeAdapter(runner).probe();
    expect(probe.ok).toBe(false);
    if (probe.ok) return;
    expect(probe.code).toBe('probe_failed');
  });

  it('reports not_installed with an install hint when the executable is missing', async () => {
    const runner = fakeRunner(() => ({ status: 'spawn_failed', message: 'ENOENT' }));
    const probe = await makeAdapter(runner).probe();
    expect(probe.ok).toBe(false);
    if (probe.ok) return;
    expect(probe.code).toBe('not_installed');
    expect(probe.hint ?? probe.message).toMatch(/install/i);
  });
});

describe('GraphifyAdapter.build', () => {
  it('runs "update <workspaceRoot>" with an explicit argv and a build-scale timeout', async () => {
    const runner = fakeRunner(() => okVersion('0.9.50'));
    const adapter = makeAdapter(runner);
    const build = await adapter.build();
    expect(build.ok).toBe(true);
    expect(runner.calls[0].exe).toBe('graphify');
    expect(runner.calls[0].args[0]).toBe('update');
    expect(runner.calls[0].args).toContain('/tmp/ws');
    expect(runner.calls[0].timeoutMs).toBeGreaterThanOrEqual(60_000);
  });

  it('propagates builder failure with the stderr tail', async () => {
    const runner = fakeRunner(() => ({ status: 'exited', exitCode: 1, stdout: '', stderr: 'boom at parser' }));
    const build = await makeAdapter(runner).build();
    expect(build.ok).toBe(false);
    if (build.ok) return;
    expect(build.code).toBe('build_failed');
    expect(build.stderr ?? build.message).toContain('boom');
  });

  it('fails closed when the build exits 0 but no readable graph appears', async () => {
    const runner = fakeRunner(() => okVersion('0.9.50'));
    const readFile = () => {
      throw new Error("ENOENT: no such file '/tmp/ws/graphify-out/graph.json'");
    };
    const build = await makeAdapter(runner, readFile).build();
    expect(build.ok).toBe(false);
    if (build.ok) return;
    expect(build.code).toBe('graph_missing');
  });

  it('passes --force only when explicitly requested', async () => {
    const runner = fakeRunner(() => okVersion('0.9.50'));
    await makeAdapter(runner).build({ force: true });
    expect(runner.calls[0].args).toContain('--force');
  });
});

describe('GraphifyAdapter graph reads', () => {
  it('graphHealth reads graph.json under the workspace and reports honest counts', async () => {
    const runner = fakeRunner(() => okVersion('0.9.50'));
    const readPaths: string[] = [];
    const adapter = makeAdapter(runner, (p) => {
      readPaths.push(p);
      if (p.endsWith('manifest.json')) return '{}';
      return fixtureGraphText;
    });
    const health = await adapter.graphHealth();
    expect(health.ok).toBe(true);
    if (!health.ok) return;
    expect(health.node_count).toBe(11);
    expect(health.edge_count).toBe(15);
    expect(health.languages).toEqual(['ts']);
    expect(health.communities).toBe(2);
    // M-08: health ALSO reads the manifest so manifest_entries is real —
    // the graph read happens first, the manifest read second.
    expect(readPaths[0]).toBe(join('/tmp/ws', 'graphify-out', 'graph.json'));
    expect(readPaths[1]).toBe(join('/tmp/ws', 'graphify-out', 'manifest.json'));
    expect(health.manifest_entries).toBeGreaterThanOrEqual(0);
  });

  it('reports graph_missing when graph.json is absent', async () => {
    const runner = fakeRunner(() => okVersion('0.9.50'));
    const readFile = () => {
      throw new Error('ENOENT');
    };
    const health = await makeAdapter(runner, readFile).graphHealth();
    expect(health.ok).toBe(false);
    if (health.ok) return;
    expect(health.code).toBe('graph_missing');
  });

  it('reports graph_invalid on malformed graph.json (never a partial success)', async () => {
    const runner = fakeRunner(() => okVersion('0.9.50'));
    const health = makeAdapter(runner, () => '{"nodes":[]}').graphHealth();
    await expect(health).resolves.toMatchObject({ ok: false, code: 'graph_invalid' });
  });

  it('serves affected/godNodes/path/explain deterministically from the graph file', async () => {
    const runner = fakeRunner(() => okVersion('0.9.50'));
    const adapter = makeAdapter(runner);
    const affected = await adapter.affected('src_pricing_applydiscount', { depth: 1 });
    expect(affected.ok).toBe(true);
    const gods = await adapter.godNodes(2);
    expect(gods[0].node_id).toBe('src_orders_createorder');
  });

  it('honors a custom executable path', async () => {
    const runner = fakeRunner(() => okVersion('0.9.50'));
    const adapter = new GraphifyAdapter({
      workspaceRoot: '/tmp/ws',
      executable: '/opt/graphify/bin/graphify',
      runner,
      readFile: goodFile,
    });
    await adapter.probe();
    expect(runner.calls[0].exe).toBe('/opt/graphify/bin/graphify');
  });
});
