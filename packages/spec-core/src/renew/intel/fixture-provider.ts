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
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
      const outDir = join(opts.workspaceRoot, 'graphify-out');
      mkdirSync(outDir, { recursive: true });
      writeFileSync(
        join(outDir, 'graph.json'),
        JSON.stringify(
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
        ),
      );
      const files = new Map<string, string[]>();
      for (const n of this.fixtureGraph.nodes) {
        if (n.source_file === undefined) continue;
        files.set(n.source_file, [...(files.get(n.source_file) ?? []), n.node_id]);
      }
      const manifest: Record<string, { ast_hash: string }> = {};
      for (const [file, ids] of [...files.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
        manifest[file] = { ast_hash: createHash('sha256').update(JSON.stringify([...ids].sort())).digest('hex') };
      }
      writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
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
    return graphHealthOf(this.fixtureGraph, this.version, 0);
  }
}
