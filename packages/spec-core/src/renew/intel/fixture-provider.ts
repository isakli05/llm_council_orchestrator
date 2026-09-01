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
  IntelItems,
  IntelProbe,
} from './provider';
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
    private readonly graph: ParsedGraph,
    private readonly version: string,
  ) {}

  async probe(): Promise<IntelProbe> {
    return { ok: true, providerVersion: this.version, supportedRange: SUPPORTED_GRAPHIFY_RANGE };
  }

  async build(): Promise<{ ok: true }> {
    return { ok: true }; // the fixture graph is always "built"
  }

  async query(question: string): Promise<IntelItems> {
    const seeds = querySeeds(this.graph, question);
    const seedIds = new Set(seeds.map((n) => n.node_id));
    const edges = this.graph.edges
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
    const r = shortestPath(this.graph, a, b);
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
    const target = this.graph.nodes.find((n) => n.node_id === node);
    if (!target) {
      return { ok: false, code: 'query_failed', message: `unknown node '${node}'` };
    }
    const nb = neighborhood(this.graph, node) ?? { nodes: [], edges: [] };
    const lines = [`${node} (${target.label ?? '?'} @ ${target.source_file ?? '?'})`];
    for (const e of nb.edges) {
      const dir = e.source === node ? `-> ${e.target}` : `<- ${e.source}`;
      lines.push(`  ${dir} [${e.relation ?? '?'}${e.confidence ? ` ${e.confidence}` : ''}]`);
    }
    return { ok: true, text: lines.join('\n'), nodes: [target, ...nb.nodes], edges: nb.edges };
  }

  async affected(seed: string, opts?: AffectedOptions): Promise<AffectedResult> {
    return affectedReverse(this.graph, seed, opts ?? {});
  }

  async godNodes(top?: number): Promise<GodNode[]> {
    return godNodes(this.graph, top ?? 10);
  }

  async graphHealth(): Promise<GraphHealth> {
    return graphHealthOf(this.graph, this.version, 0);
  }
}
