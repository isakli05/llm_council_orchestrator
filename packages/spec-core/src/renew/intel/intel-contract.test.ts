/**
 * Full CodeIntelligenceProvider contract coverage: every method of the REAL
 * GraphifyAdapter (over a fixture graph file on disk) and the StaticGraphProvider
 * parity — including the failure modes (timeout, output cap, nonzero exit,
 * unparseable version, missing graph). These are behavioral contract tests,
 * not percentage-chasing: each asserts semantics the planner/snapshot rely on.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GraphifyAdapter } from './graphify-adapter';
import { StaticGraphProvider } from './fixture-provider';
import { parseGraphText } from './graph-reader';
import type { SubprocessRunner, SubprocessResult } from './subprocess';

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

const FIXTURE_SRC = join(__dirname, '..', '..', '..', 'fixtures', 'legacy-app');

/** A workspace with a real graph.json + manifest.json materialized on disk. */
function graphWorkspace(): { ws: string; graphJson: string } {
  const ws = freshDir('lco-intel-ws-');
  const outDir = join(ws, 'graphify-out');
  mkdirSync(outDir, { recursive: true });
  const graphJson = JSON.parse(readFileFixture('graph-fixture.json')) as unknown;
  writeFileSync(join(outDir, 'graph.json'), JSON.stringify(graphJson, null, 2));
  const manifest: Record<string, { ast_hash: string }> = {};
  const g = parseGraphText(JSON.stringify(graphJson));
  if (!g.ok) throw new Error(g.message);
  const files = new Map<string, string[]>();
  for (const n of g.graph.nodes) {
    if (n.source_file === undefined) continue;
    files.set(n.source_file, [...(files.get(n.source_file) ?? []), n.node_id]);
  }
  for (const [f, ids] of files) manifest[f] = { ast_hash: `h-${ids.length}` };
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return { ws, graphJson: JSON.stringify(graphJson) };
}

function readFileFixture(name: string): string {
  return require('node:fs').readFileSync(join(FIXTURE_SRC, name), 'utf8');
}

const okVersion = (v: string): SubprocessResult => ({
  status: 'exited',
  exitCode: 0,
  stdout: `graphify ${v}\n`,
  stderr: '',
});
const fakeRunner = (impl: (exe: string, args: readonly string[]) => SubprocessResult): SubprocessRunner => {
  return async (exe, args) => impl(exe, args);
};

describe('GraphifyAdapter full contract (fixture graph on disk)', () => {
  it('probe: supported version, parsed and remembered', async () => {
    const { ws } = graphWorkspace();
    const adapter = new GraphifyAdapter({ workspaceRoot: ws, runner: fakeRunner(() => okVersion('0.9.50')) });
    const probe = await adapter.probe();
    expect(probe.ok).toBe(true);
    if (!probe.ok) return;
    expect(probe.providerVersion).toBe('0.9.50');
    expect(probe.supportedRange).toBe('>=0.9.50 <0.10.0');
  });

  it('probe failure modes: timeout, nonzero exit, unparseable output, unsupported version', async () => {
    const { ws } = graphWorkspace();
    const mk = (r: SubprocessResult | (() => SubprocessResult)) => {
      const impl = typeof r === 'function' ? r : () => r;
      return new GraphifyAdapter({ workspaceRoot: ws, runner: fakeRunner(() => impl()) });
    };
    const t = await mk({ status: 'timeout', stdout: '', stderr: '' }).probe();
    expect(t.ok).toBe(false);
    if (!t.ok) expect(t.code).toBe('probe_failed');
    const nz = await mk({ status: 'exited', exitCode: 2, stdout: '', stderr: 'nope' }).probe();
    expect(nz.ok).toBe(false);
    if (!nz.ok) expect(nz.code).toBe('probe_failed');
    const unparseable = await mk({ status: 'exited', exitCode: 0, stdout: 'weird tool v1', stderr: '' }).probe();
    expect(unparseable.ok).toBe(false);
    if (!unparseable.ok) expect(unparseable.code).toBe('probe_failed');
    const unsupported = await mk(okVersion('0.10.2')).probe();
    expect(unsupported.ok).toBe(false);
    if (!unsupported.ok) {
      expect(unsupported.code).toBe('unsupported_version');
      expect(unsupported.providerVersion).toBe('0.10.2');
    }
  });

  it('graph(): parses the on-disk graph (nodes/edges/warnings) and reports missing', async () => {
    const { ws } = graphWorkspace();
    const adapter = new GraphifyAdapter({ workspaceRoot: ws, runner: fakeRunner(() => okVersion('0.9.50')) });
    const g = await adapter.graph();
    expect(g.ok).toBe(true);
    if (!g.ok) return;
    expect(g.graph.nodes.length).toBeGreaterThan(0);
    const missing = new GraphifyAdapter({ workspaceRoot: freshDir('lco-intel-empty-'), runner: fakeRunner(() => okVersion('0.9.50')) });
    const m = await missing.graph();
    expect(m.ok).toBe(false);
    if (!m.ok) expect(m.code).toBe('graph_missing');
  });

  it('query/path/explain/affected/godNodes operate over the graph deterministically', async () => {
    const { ws } = graphWorkspace();
    const adapter = new GraphifyAdapter({ workspaceRoot: ws, runner: fakeRunner(() => okVersion('0.9.50')) });
    const g = await adapter.graph();
    if (!g.ok) throw new Error('graph');
    const someNode = g.graph.nodes[0]!.node_id;
    const other = g.graph.nodes[1]!.node_id;
    const label = g.graph.nodes[0]!.label ?? someNode;

    // query() is lexical over labels/ids — a label keyword seeds results.
    const q = await adapter.query(label.split(/[^A-Za-z0-9]+/)[0] ?? label);
    expect(q.ok).toBe(true);
    if (q.ok) {
      expect(q.nodes.length).toBeGreaterThan(0);
    }

    const p = await adapter.path(someNode, other);
    if (p.ok) {
      expect(p.text).toContain(someNode);
      expect(p.text).toContain(other);
    } else {
      expect(p.code).toBe('query_failed'); // legitimately unreachable pairs
    }
    const unreachable = await adapter.path(someNode, 'no-such-node');
    expect(unreachable.ok).toBe(false);
    if (!unreachable.ok) expect(unreachable.code).toBe('query_failed');

    const e = await adapter.explain(someNode);
    expect(e.ok).toBe(true);
    if (e.ok) expect(e.text).toContain(someNode);
    const unknown = await adapter.explain('no-such-node');
    expect(unknown.ok).toBe(false);

    const a = await adapter.affected(someNode, { depth: 2 });
    expect(a.ok).toBe(true);

    const gods = await adapter.godNodes(5);
    expect(Array.isArray(gods)).toBe(true);
    if (Array.isArray(gods)) expect(gods.length).toBeGreaterThan(0);

    const health = await adapter.graphHealth();
    expect(health.ok).toBe(true);
    if (health.ok) {
      expect(health.node_count).toBe(g.graph.nodes.length);
      expect(health.manifest_entries).toBeGreaterThan(0); // M-08: real, not fabricated 0
      expect(health.provider_version).toBe('0.9.50');
    }
  });

  it('build(): success path loads the graph; failure modes are typed with stderr tails', async () => {
    const { ws } = graphWorkspace();
    const ok = await new GraphifyAdapter({ workspaceRoot: ws, runner: fakeRunner(() => okVersion('0.9.50')) }).build();
    expect(ok.ok).toBe(true);

    const fail = await new GraphifyAdapter({
      workspaceRoot: ws,
      runner: fakeRunner(() => ({ status: 'exited', exitCode: 1, stdout: '', stderr: 'x'.repeat(5000) })),
    }).build();
    expect(fail.ok).toBe(false);
    if (!fail.ok) {
      expect(fail.code).toBe('build_failed');
      expect((fail.stderr ?? '').length).toBeLessThanOrEqual(2000); // tailed
    }
    const timeout = await new GraphifyAdapter({
      workspaceRoot: ws,
      runner: fakeRunner(() => ({ status: 'timeout', stdout: '', stderr: 'slow' })),
    }).build();
    expect(timeout.ok).toBe(false);
    if (!timeout.ok) expect(timeout.code).toBe('timeout');
    const cap = await new GraphifyAdapter({
      workspaceRoot: ws,
      runner: fakeRunner(() => ({ status: 'output_cap', stdout: '', stderr: '' })),
    }).build();
    expect(cap.ok).toBe(false);
    if (!cap.ok) expect(cap.code).toBe('output_cap');
    const notInstalled = await new GraphifyAdapter({
      workspaceRoot: ws,
      runner: fakeRunner(() => ({ status: 'spawn_failed', message: 'ENOENT' })),
    }).build();
    expect(notInstalled.ok).toBe(false);
    if (!notInstalled.ok) expect(notInstalled.code).toBe('not_installed');
  });
});

describe('StaticGraphProvider contract parity', () => {
  it('every method answers over the fixture graph (same dialect as the adapter)', async () => {
    const g = parseGraphText(readFileFixture('graph-fixture.json'));
    if (!g.ok) throw new Error(g.message);
    const provider = new StaticGraphProvider(g.graph, '0.9.50');
    expect((await provider.probe()).ok).toBe(true);
    const someNode = g.graph.nodes[0]!.node_id;
    const q = await provider.query(someNode);
    expect(q.ok).toBe(true);
    const p = await provider.path(someNode, g.graph.nodes[1]!.node_id);
    expect('ok' in p).toBe(true);
    const e = await provider.explain(someNode);
    expect(e.ok).toBe(true);
    const unknown = await provider.explain('no-such-node');
    expect(unknown.ok).toBe(false);
    const a = await provider.affected(someNode, {});
    expect(a.ok).toBe(true);
    const gods = await provider.godNodes(3);
    expect(Array.isArray(gods)).toBe(true);
    const health = await provider.graphHealth();
    expect(health.ok && health.provider_version === '0.9.50').toBe(true);
    // build() with a workspace materializes the graph where tests expect it.
    const ws = freshDir('lco-static-ws-');
    await provider.build({ workspaceRoot: ws });
    expect(existsSync(join(ws, 'graphify-out', 'graph.json'))).toBe(true);
    expect(existsSync(join(ws, 'graphify-out', 'manifest.json'))).toBe(true);
  });
});
