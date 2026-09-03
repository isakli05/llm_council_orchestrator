/**
 * StaticGraphProvider — a CodeIntelligenceProvider over a committed graph
 * fixture. The offline substrate for renewal unit tests (STEPS 2-10): no
 * subprocess, fully deterministic, real interface.
 */
import type {
  AffectedOptions,
  AffectedResult,
  CodeIntelligenceProvider,
  GodNode,
  GraphHealth,
  IntelFailure,
  IntelItems,
  IntelProbe,
} from './provider';
import { sha256Content, canonicalJson } from '../trust/canonical';

/** Synthetic per-file ast_hash via the canonical layer (deterministic). */
function canonicalJsonOfIds(sortedIds: string[]): string {
  return sha256Content(canonicalJson(sortedIds)).slice('sha256:'.length);
}
import { join } from 'node:path';
import type { ParsedGraph } from './graph-reader';
import {
  affectedReverse,
  godNodes,
  graphHealthOf,
  neighborhood,
  querySeeds,
  shortestPath,
} from './graph-ops';
import { SUPPORTED_GRAPHIFY_RANGE } from './graphify-adapter';
import { authorizedEnsureDir, authorizedWrite } from '../trust/fs';
import { bindStructuralArtifacts } from '../trust/structural';

export class StaticGraphProvider implements CodeIntelligenceProvider {
  constructor(
    private readonly fixtureGraph: ParsedGraph,
    private readonly version: string,
  ) {}

  async probe(): Promise<IntelProbe> {
    return { ok: true, providerVersion: this.version, supportedRange: SUPPORTED_GRAPHIFY_RANGE };
  }

  async build(opts?: { force?: boolean; workspaceRoot?: string }): Promise<{ ok: true }> {
    // Materialize the fixture graph under the workspace exactly where the
    // real adapter's subprocess would leave it, so staleness/health flows in
    // command cores behave identically for injected fixture providers. The
    // manifest is derived deterministically from the graph (per-file
    // ast_hash = sha256 over that file's sorted node ids) so snapshot
    // identity behaves exactly like the real tool's output.
    if (opts?.workspaceRoot !== undefined) {
      // Trust kernel: even the fixture substrate writes through the authorized
      // primitive (the workspace root is its own project domain), so no
      // production file in the renewal surface performs a plain write.
      const outDir = join(opts.workspaceRoot, 'graphify-out');
      authorizedEnsureDir({ projectDir: opts.workspaceRoot, path: outDir });
      const graphJson = JSON.stringify(
          {
            directed: this.fixtureGraph.directed,
            multigraph: false,
            built_at_commit: 'fixture',
            nodes: this.fixtureGraph.nodes.map((n) => ({
              id: n.node_id,
              ...(n.label !== undefined ? { label: n.label } : {}),
              ...(n.source_file !== undefined ? { source_file: n.source_file } : {}),
              ...(n.source_location !== undefined ? { source_location: n.source_location } : {}),
              ...(n.community !== undefined ? { community: n.community } : {}),
              ...(n.community_name !== undefined ? { community_name: n.community_name } : {}),
            })),
            links: this.fixtureGraph.edges.map((e) => ({
              source: e.source,
              target: e.target,
              ...(e.relation !== undefined ? { relation: e.relation } : {}),
              ...(e.confidence !== undefined ? { confidence: e.confidence } : {}),
            })),
          },
          null,
          2,
        );
      authorizedWrite({ projectDir: opts.workspaceRoot, path: join(outDir, 'graph.json'), content: graphJson });
      const files = new Map<string, string[]>();
      for (const n of this.fixtureGraph.nodes) {
        if (n.source_file === undefined) continue;
        files.set(n.source_file, [...(files.get(n.source_file) ?? []), n.node_id]);
      }
      const manifest: Record<string, { ast_hash: string }> = {};
      for (const [file, ids] of [...files.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
        manifest[file] = { ast_hash: canonicalJsonOfIds([...ids].sort()) };
      }
      authorizedWrite({ projectDir: opts.workspaceRoot, path: join(outDir, 'manifest.json'), content: `${JSON.stringify(manifest, null, 2)}\n` });
      // S4-H-04: the fixture substrate seals the SAME structural binding a
      // real build would, so every downstream coherence gate behaves
      // identically for injected providers.
      const bound = bindStructuralArtifacts({
        projectDir: opts.workspaceRoot,
        workspaceRoot: opts.workspaceRoot,
        manifestText: `${JSON.stringify(manifest, null, 2)}\n`,
        graphText: graphJson,
        graphifyVersion: this.version,
        nowIso: '2026-09-03T00:00:00Z',
      });
      if (!bound.ok) return { ok: false as never, code: bound.code as never, message: bound.message } as never;
    }
    return { ok: true };
  }

  async graph(): Promise<{ ok: true; graph: ParsedGraph }> {
    return { ok: true, graph: this.fixtureGraph };
  }

  async query(question: string): Promise<IntelItems> {
    const seeds = querySeeds(this.fixtureGraph, question);
    const seedIds = new Set(seeds.map((n) => n.node_id));
    const edges = this.fixtureGraph.edges
      .filter((e) => seedIds.has(e.source) || seedIds.has(e.target))
      .sort((a, b) => `${a.source}>${a.target}` < `${b.source}>${b.target}` ? -1 : 1);
    return {
      ok: true,
      text: seeds.map((n) => `${n.node_id} (${n.label ?? '?'} @ ${n.source_file ?? '?'})`).join('\n'),
      nodes: seeds,
      edges,
    };
  }

  async path(a: string, b: string): Promise<IntelItems> {
    const r = shortestPath(this.fixtureGraph, a, b);
    if (!r.found) {
      return { ok: false, code: 'query_failed', message: `no path between '${a}' and '${b}' in the graph` };
    }
    return {
      ok: true,
      text: r.nodes.map((n) => n.node_id).join(' -> '),
      nodes: r.nodes,
      edges: r.edges,
    };
  }

  async explain(node: string): Promise<IntelItems> {
    const target = this.fixtureGraph.nodes.find((n) => n.node_id === node);
    if (!target) {
      return { ok: false, code: 'query_failed', message: `unknown node '${node}'` };
    }
    const nb = neighborhood(this.fixtureGraph, node) ?? { nodes: [], edges: [] };
    const lines = [`${node} (${target.label ?? '?'} @ ${target.source_file ?? '?'})`];
    for (const e of nb.edges) {
      const dir = e.source === node ? `-> ${e.target}` : `<- ${e.source}`;
      lines.push(`  ${dir} [${e.relation ?? '?'}${e.confidence ? ` ${e.confidence}` : ''}]`);
    }
    return { ok: true, text: lines.join('\n'), nodes: [target, ...nb.nodes], edges: nb.edges };
  }

  async affected(seed: string, opts?: AffectedOptions): Promise<AffectedResult> {
    return affectedReverse(this.fixtureGraph, seed, opts ?? {});
  }

  async godNodes(top?: number): Promise<GodNode[] | IntelFailure> {
    return godNodes(this.fixtureGraph, top ?? 10);
  }

  async graphHealth(): Promise<GraphHealth> {
    // S3-M-01: total status ('healthy'); the fixture substrate records no
    // manifest digest (honest omission — the fixture has no manifest.json).
    return graphHealthOf(this.fixtureGraph, this.version, 0);
  }
}
