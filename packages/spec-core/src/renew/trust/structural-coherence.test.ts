import { describe, expect, it, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  bindStructuralArtifacts,
  computeStructuralBinding,
  coerceStructuralBinding,
  requireStructuralIdentity,
  structuralIdentity,
  structuralBindingPath,
} from './structural';
import { TrustStructuralError } from './errors';
import { GraphifyAdapter } from '../intel/graphify-adapter';

/**
 * S4-H-04 — the mixed-artifact matrix.
 *
 * The Fourth Audit paired a manifest describing src/other.ts with a graph
 * describing src/a.ts and received `ok:true`. The closure contract: a
 * manifest/graph pair is trusted ONLY when it is ONE build — source-set
 * coherent AND matching the LCO structural binding sealed at build time.
 */

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
  tmpDirs.length = 0;
});

/** Build-set A: manifest + graph describing src/a.ts. Build-set B: src/b.ts. */
function artifactSet(which: 'a' | 'b'): { manifestText: string; graphText: string } {
  const file = `src/${which}.ts`;
  const node = `n_${which}`;
  return {
    manifestText: JSON.stringify({ [file]: { mtime: 1, seen: 1, ast_hash: `hash-${which}` } }, null, 2),
    graphText: JSON.stringify(
      { directed: true, multigraph: false, graph: {}, built_at_commit: 'test', nodes: [{ id: node, label: which, source_file: file }], links: [] },
      null,
      2,
    ),
  };
}

function workspaceWith(which: 'a' | 'b', opts?: { bind?: boolean; graphOverride?: string; manifestOverride?: string; bindingOverride?: string }): string {
  const ws = mkdtempSync(join(tmpdir(), 'lco-s4h04-'));
  tmpDirs.push(ws);
  const set = artifactSet(which);
  const outDir = join(ws, 'graphify-out');
  mkdirSync(outDir, { recursive: true });
  const manifestText = opts?.manifestOverride ?? set.manifestText;
  const graphText = opts?.graphOverride ?? set.graphText;
  writeFileSync(join(outDir, 'manifest.json'), manifestText);
  writeFileSync(join(outDir, 'graph.json'), graphText);
  if (opts?.bindingOverride !== undefined) {
    writeFileSync(structuralBindingPath(ws), opts.bindingOverride);
  } else if (opts?.bind !== false) {
    const bound = bindStructuralArtifacts({
      projectDir: ws,
      workspaceRoot: ws,
      manifestText,
      graphText,
      graphifyVersion: '0.9.50',
      nowIso: '2026-09-03T00:00:00Z',
    });
    if (!bound.ok) throw new Error(bound.message);
  }
  return ws;
}

const bindingOf = (ws: string): string => readFileSync(structuralBindingPath(ws), 'utf8');

describe('S4-H-04: manifest↔graph coherence (the pair, not the documents)', () => {
  it('A/A → healthy identity; B/B → healthy identity (both digests bound)', () => {
    const a = artifactSet('a');
    const b = artifactSet('b');
    for (const set of [a, b]) {
      const r = requireStructuralIdentity({ ...set, bindingText: bindingFor(set), source: 'test' });
      expect(r.manifest_digest).toMatch(/^sha256:/);
      expect(r.graph_digest).toMatch(/^sha256:/);
    }
  });

  it('A/B — manifest A + graph B is REFUSED at the source-set coherence gate (the Fourth-Audit pair)', () => {
    const a = artifactSet('a');
    const b = artifactSet('b');
    const r = structuralIdentity({ manifestText: a.manifestText, graphText: b.graphText });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('coherence_failed');
      expect(r.message).toMatch(/src\/b\.ts/);
    }
  });

  it('B/A — graph A under manifest B is equally refused', () => {
    const a = artifactSet('a');
    const b = artifactSet('b');
    const r = structuralIdentity({ manifestText: b.manifestText, graphText: a.graphText });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('coherence_failed');
  });

  it('A/A + modified graph bytes → binding coherence refuses (the pair is no longer the bound pair)', () => {
    const ws = workspaceWith('a');
    const a = artifactSet('a');
    const modifiedGraph = JSON.stringify(
      { directed: true, multigraph: false, graph: {}, built_at_commit: 'test', nodes: [{ id: 'n_a', label: 'TAMPERED', source_file: 'src/a.ts' }], links: [] },
      null,
      2,
    );
    expect(() =>
      requireStructuralIdentity({ manifestText: a.manifestText, graphText: modifiedGraph, bindingText: bindingOf(ws) }),
    ).toThrowError(TrustStructuralError);
  });

  it('binding A + manifest/graph B → coherence refuses (binding does not bless a foreign pair)', () => {
    const wsA = workspaceWith('a');
    const b = artifactSet('b');
    // source-set gate catches this first (graph B under manifest B is coherent
    // by names? no — this is binding A over a FULL B pair: B/B is name-
    // coherent, so the BINDING gate is what must refuse):
    const r = structuralIdentity({ ...b, bindingText: bindingOf(wsA) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('coherence_failed');
  });

  it('same source NAMES, different manifest BYTES → the binding gate refuses (name-level coherence alone cannot)', () => {
    const wsA = workspaceWith('a');
    const a = artifactSet('a');
    // Same key src/a.ts, different ast_hash — both documents individually
    // valid and name-coherent with the graph; only the sealed binding
    // detects the content drift.
    const driftedManifest = JSON.stringify({ 'src/a.ts': { mtime: 2, seen: 2, ast_hash: 'hash-DIFFERENT' } }, null, 2);
    const r = structuralIdentity({ manifestText: driftedManifest, graphText: a.graphText, bindingText: bindingOf(wsA) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('coherence_failed');
  });

  it('a HAND-EDITED binding (integrity digest broken) is refused, never interpreted', () => {
    const ws = workspaceWith('a');
    const raw = JSON.parse(bindingOf(ws)) as Record<string, unknown>;
    raw.graphify_version = '0.9.99'; // edit without recomputing binding_digest
    writeFileSync(structuralBindingPath(ws), JSON.stringify(raw, null, 2));
    const parsed = coerceStructuralBinding(bindingOf(ws));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.code).toBe('binding_tampered');
  });

  it('an ABSENT binding on a trusted path is a typed refusal (pre-closure workspaces fail closed)', () => {
    const a = artifactSet('a');
    expect(() => requireStructuralIdentity({ ...a, bindingText: undefined })).toThrowError(TrustStructuralError);
    try {
      requireStructuralIdentity({ ...a, bindingText: undefined });
    } catch (e) {
      expect((e as TrustStructuralError).code).toBe('binding_missing');
    }
  });

  it('a version join refuses a binding sealed by a different graphify', () => {
    const a = artifactSet('a');
    const bindingText = bindingFor(a, '0.9.53');
    const r = structuralIdentity({ ...a, bindingText, expected: { graphifyVersion: '0.9.50' } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('incompatible');
  });
});

describe('S4-H-04: the adapter consumes ONLY verified structural state (bypass 8 closed)', () => {
  const fakeRunner = () => async () => ({ status: 'exited' as const, exitCode: 0, stdout: 'graphify 0.9.50\n', stderr: '' });

  it('graph() over a bound coherent workspace succeeds', async () => {
    const ws = workspaceWith('a');
    const adapter = new GraphifyAdapter({ workspaceRoot: ws, projectDir: ws, runner: fakeRunner() as never });
    const g = await adapter.graph();
    expect(g.ok).toBe(true);
  });

  it('graph() over manifest A + graph B fails at the coherence gate (the Fourth-Audit pair)', async () => {
    const b = artifactSet('b');
    const ws = workspaceWith('a'); // bound A/A workspace…
    writeFileSync(join(ws, 'graphify-out', 'graph.json'), b.graphText); // …then a foreign graph is swapped in
    const adapter = new GraphifyAdapter({ workspaceRoot: ws, projectDir: ws, runner: fakeRunner() as never });
    const g = await adapter.graph();
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.code).toBe('coherence_failed');
  });

  it('graph() over a coherent pair with a FOREIGN binding fails', async () => {
    const wsA = workspaceWith('a');
    const wsB = workspaceWith('b');
    // B/B pair carrying A's binding
    writeFileSync(structuralBindingPath(wsB), bindingOf(wsA));
    const adapter = new GraphifyAdapter({ workspaceRoot: wsB, projectDir: wsB, runner: fakeRunner() as never });
    const g = await adapter.graph();
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.code).toBe('coherence_failed');
  });

  it('graph() over a pre-closure workspace (no binding) fails closed with the refresh remedy', async () => {
    const ws = workspaceWith('a', { bind: false });
    const adapter = new GraphifyAdapter({ workspaceRoot: ws, projectDir: ws, runner: fakeRunner() as never });
    const g = await adapter.graph();
    expect(g.ok).toBe(false);
    if (!g.ok) {
      expect(g.code).toBe('binding_missing');
      expect(g.message).toMatch(/refresh/);
    }
  });

  it('query/path/explain (all graph consumers) inherit the verified gate — mixed pair yields typed failures', async () => {
    const b = artifactSet('b');
    const ws = workspaceWith('a');
    writeFileSync(join(ws, 'graphify-out', 'graph.json'), b.graphText);
    const adapter = new GraphifyAdapter({ workspaceRoot: ws, projectDir: ws, runner: fakeRunner() as never });
    for (const r of [await adapter.query('x'), await adapter.path('n_b', 'n_a'), await adapter.explain('n_b')]) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('coherence_failed');
    }
  });

  it('graphHealth maps coherence failures to the coherence_failed state (never healthy)', async () => {
    const ws = workspaceWith('a', { bind: false });
    const adapter = new GraphifyAdapter({ workspaceRoot: ws, projectDir: ws, runner: fakeRunner() as never });
    const h = await adapter.graphHealth();
    expect(h.ok).toBe(false);
    if (!h.ok) expect(h.status).toBe('coherence_failed');
  });
});

/** Compute the binding text for an artifact set (the PURE kernel
 *  constructor — no filesystem involved). */
function bindingFor(set: { manifestText: string; graphText: string }, version = '0.9.50'): string {
  const r = computeStructuralBinding({
    manifestText: set.manifestText,
    graphText: set.graphText,
    graphifyVersion: version,
    nowIso: '2026-09-03T00:00:00Z',
  });
  if (!r.ok) throw new Error(r.message);
  return `${JSON.stringify(r.binding, null, 2)}\n`;
}
