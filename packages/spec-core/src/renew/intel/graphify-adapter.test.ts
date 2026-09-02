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

/** Real graphify manifest shape: file path → { mtime, seen, ast_hash, … }. */
const validManifestText = JSON.stringify({
  'src/orders.ts': { mtime: 1, seen: 1, ast_hash: 'a1b2c3', semantic_hash: 'a1b2c3' },
  'src/pricing.ts': { mtime: 2, seen: 2, ast_hash: 'd4e5f6', semantic_hash: '' },
});

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
      if (p.endsWith('manifest.json')) return validManifestText;
      return fixtureGraphText;
    });
    const health = await adapter.graphHealth();
    expect(health.ok).toBe(true);
    if (!health.ok) return;
    expect(health.status).toBe('healthy');
    expect(health.node_count).toBe(11);
    expect(health.edge_count).toBe(15);
    expect(health.languages).toEqual(['ts']);
    expect(health.communities).toBe(2);
    // M-08: health ALSO reads the manifest so manifest_entries is real —
    // the graph read happens first, the manifest read second.
    expect(readPaths[0]).toBe(join('/tmp/ws', 'graphify-out', 'graph.json'));
    expect(readPaths[1]).toBe(join('/tmp/ws', 'graphify-out', 'manifest.json'));
    expect(health.manifest_entries).toBe(2);
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
    expect(health.status).toBe('missing');
  });

  it('reports graph_invalid on malformed graph.json (never a partial success)', async () => {
    const runner = fakeRunner(() => okVersion('0.9.50'));
    const health = makeAdapter(runner, () => '{"nodes":[]}').graphHealth();
    await expect(health).resolves.toMatchObject({ ok: false, code: 'graph_invalid', status: 'malformed' });
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

describe('GraphifyAdapter.graphHealth typed statuses (INV-G3: S2-H-06/M-08)', () => {
  /** graph.json serves the committed fixture; manifest.json serves `manifest`. */
  const healthWithManifest = (manifest: string) =>
    makeAdapter(fakeRunner(() => okVersion('0.9.50')), (p) =>
      p.endsWith('manifest.json') ? manifest : fixtureGraphText,
    ).graphHealth();

  it('healthy: valid graph + valid non-empty manifest + supported version', async () => {
    const health = await healthWithManifest(validManifestText);
    expect(health.ok).toBe(true);
    if (!health.ok) return;
    expect(health.status).toBe('healthy');
    expect(health.manifest_entries).toBe(2);
    expect(health.provider_version).toBe('0.9.50');
  });

  it('missing: no manifest.json beside a parsed graph is incomplete state, not healthy', async () => {
    const health = await makeAdapter(fakeRunner(() => okVersion('0.9.50')), (p) => {
      if (p.endsWith('manifest.json')) throw new Error('ENOENT');
      return fixtureGraphText;
    }).graphHealth();
    expect(health.ok).toBe(false);
    if (health.ok) return;
    expect(health.code).toBe('graph_missing');
    expect(health.status).toBe('missing');
    expect(health.message).toContain('manifest');
  });

  it('malformed: manifest.json that is not valid JSON', async () => {
    const health = await healthWithManifest('{ not json');
    expect(health.ok).toBe(false);
    if (health.ok) return;
    expect(health.code).toBe('graph_invalid');
    expect(health.status).toBe('malformed');
    expect(health.message).toContain('not valid JSON');
  });

  it('malformed: manifest {} beside a parsed graph (a built graph has ≥1 entry)', async () => {
    const health = await healthWithManifest('{}');
    expect(health.ok).toBe(false);
    if (health.ok) return;
    expect(health.status).toBe('malformed');
    expect(health.message).toMatch(/0 entries/);
  });

  it('mutation-sensitivity: a HEALTHY verdict is impossible when the manifest is {}', async () => {
    const health = await healthWithManifest('{}');
    // Kills any mutant that recomputes counts but still returns ok:true for
    // an empty manifest: the verdict itself must be a typed failure.
    expect(health.ok).toBe(false);
    expect((health as { status?: string }).status).not.toBe('healthy');
    expect((health as { manifest_entries?: number }).manifest_entries).toBeUndefined();
  });

  it.each([
    ['non-object manifest (array)', '[]'],
    ['non-object manifest (string)', '"nope"'],
    ['null manifest', 'null'],
    ['scalar entry value', '{"src/orders.ts": "hash-not-object"}'],
    ['entry missing ast_hash', '{"src/orders.ts": {"mtime": 1, "seen": 1}}'],
    ['entry with non-string ast_hash', '{"src/orders.ts": {"ast_hash": 42}}'],
    ['entry with empty ast_hash', '{"src/orders.ts": {"ast_hash": ""}}'],
  ])('malformed: %s is never healthy', async (_label, manifest) => {
    const health = await healthWithManifest(manifest as string);
    expect(health.ok).toBe(false);
    if (health.ok) return;
    expect(health.code).toBe('graph_invalid');
    expect(health.status).toBe('malformed');
    expect(health.message).toMatch(/ast_hash|object|entries/);
  });

  it('malformed: duplicate node ids in graph.json surface through health', async () => {
    const dupGraph = JSON.stringify({
      nodes: [
        { id: 'src_orders_createorder', label: 'createOrder', source_file: 'src/orders.ts' },
        { id: 'src_orders_createorder', label: 'createOrder', source_file: 'src/orders.ts' },
      ],
      links: [],
    });
    const health = await makeAdapter(fakeRunner(() => okVersion('0.9.50')), (p) =>
      p.endsWith('manifest.json') ? validManifestText : dupGraph,
    ).graphHealth();
    expect(health.ok).toBe(false);
    if (health.ok) return;
    expect(health.code).toBe('graph_invalid');
    expect(health.status).toBe('malformed');
    expect(health.message).toContain('duplicate node id');
    expect(health.message).toContain('src_orders_createorder');
  });

  it('incompatible: an unsupported provider version is a typed failure, not healthy-unknown', async () => {
    const health = await makeAdapter(fakeRunner(() => okVersion('0.10.0')), (p) =>
      p.endsWith('manifest.json') ? validManifestText : fixtureGraphText,
    ).graphHealth();
    expect(health.ok).toBe(false);
    if (health.ok) return;
    expect(health.code).toBe('unsupported_version');
    expect(health.status).toBe('incompatible');
  });

  it('probe failure that is NOT a version mismatch keeps its own code and no health status', async () => {
    const health = await makeAdapter(
      fakeRunner(() => ({ status: 'spawn_failed', message: 'ENOENT' })),
      (p) => (p.endsWith('manifest.json') ? validManifestText : fixtureGraphText),
    ).graphHealth();
    expect(health.ok).toBe(false);
    if (health.ok) return;
    expect(health.code).toBe('not_installed');
    expect(health.status).toBeUndefined();
  });

  it('matrix: no malformed manifest shape can ever produce ok:true (fail-closed sweep)', async () => {
    const badManifests = [
      '{',
      '[]',
      '"nope"',
      'null',
      '{}',
      '{"src/a.ts": "scalar"}',
      '{"src/a.ts": {}}',
      '{"src/a.ts": { "ast_hash": 7 }}',
      '{"src/a.ts": { "ast_hash": "" }}',
    ];
    for (const manifest of badManifests) {
      const health = await healthWithManifest(manifest);
      expect(health.ok, `manifest ${manifest} must not be healthy`).toBe(false);
      if (!health.ok) expect(health.status).toBe('malformed');
    }
  });
});
