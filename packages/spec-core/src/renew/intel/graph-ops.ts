/**
 * Deterministic graph operations over a ParsedGraph.
 *
 * These are LCO-owned semantics implemented directly on the structural graph
 * (audit 11 §B: graph.json is a stable read surface). Implementing the
 * traversals here keeps every query offline, unit-testable, and free of prose
 * parsing; the real-graphify integration suite cross-checks the results
 * against the CLI surface on the fixture repo.
 *
 * Determinism: all orderings are explicit (stable sorts on node ids); no
 * clock, no randomness.
 */
import type { AffectedHit, AffectedResult, GodNode, GraphHealth } from './provider';
import type { GraphEdgeRef, ParsedGraph } from './graph-reader';

/**
 * God nodes: symbol-level architectural hubs ranked by undirected degree —
 * file nodes are excluded, matching graphify's own god-nodes semantics
 * (cross-checked against the CLI on the fixture repo by the integration suite).
 */
export function godNodes(graph: ParsedGraph, top = 10): GodNode[] {
  const degree = new Map<string, number>();
  for (const n of graph.nodes) if (!n.is_file) degree.set(n.node_id, 0);
  for (const e of graph.edges) {
    if (e.source === e.target) continue;
    if (degree.has(e.source)) degree.set(e.source, degree.get(e.source)! + 1);
    if (degree.has(e.target)) degree.set(e.target, degree.get(e.target)! + 1);
  }
  const byId = new Map(graph.nodes.map((n) => [n.node_id, n]));
  return [...degree.entries()]
    .map(([node_id, deg]) => ({ ...(byId.get(node_id) as GodNode), degree: deg }))
    .sort((a, b) => b.degree - a.degree || (a.node_id < b.node_id ? -1 : 1))
    .slice(0, Math.max(0, top));
}

/**
 * Reverse-impact ("blast radius"): nodes that (transitively) depend on the
 * seed, i.e. predecessors over the edge relation. Mirrors graphify's
 * `affected` traversal direction.
 */
export function affectedReverse(
  graph: ParsedGraph,
  seed: string,
  opts: { depth?: number; relations?: readonly string[] } = {},
): AffectedResult {
  const depth = opts.depth ?? 2;
  const has = new Set(graph.nodes.map((n) => n.node_id));
  if (!has.has(seed)) {
    return { ok: false, code: 'query_failed', message: `unknown node '${seed}' — no such node in the graph` };
  }
  const relations = opts.relations ? new Set(opts.relations) : undefined;
  // predecessor adjacency: target -> sources
  const preds = new Map<string, { from: string; edge: GraphEdgeRef }[]>();
  for (const e of graph.edges) {
    if (relations && e.relation !== undefined && !relations.has(e.relation)) continue;
    if (!preds.has(e.target)) preds.set(e.target, []);
    preds.get(e.target)!.push({ from: e.source, edge: e });
  }

  const hits: AffectedHit[] = [];
  const seen = new Set<string>([seed]);
  let frontier: { id: string; via: string[] }[] = [{ id: seed, via: [seed] }];
  for (let d = 1; d <= depth; d++) {
    const next: { id: string; via: string[] }[] = [];
    for (const f of frontier) {
      for (const p of (preds.get(f.id) ?? []).slice().sort((a, b) => (a.from < b.from ? -1 : 1))) {
        if (seen.has(p.from)) continue;
        seen.add(p.from);
        const via = [...f.via, p.from];
        hits.push({ node_id: p.from, depth: d, via });
        next.push({ id: p.from, via });
      }
    }
    frontier = next;
  }
  hits.sort((a, b) => a.depth - b.depth || (a.node_id < b.node_id ? -1 : 1));
  return { ok: true, hits };
}

/** Undirected shortest path (deterministic: neighbors visited in id order). */
export function shortestPath(
  graph: ParsedGraph,
  a: string,
  b: string,
): { found: true; nodes: ParsedGraph['nodes']; edges: GraphEdgeRef[] } | { found: false } {
  const byId = new Map(graph.nodes.map((n) => [n.node_id, n]));
  if (!byId.has(a) || !byId.has(b)) return { found: false };

  const neighbors = new Map<string, { id: string; edge: GraphEdgeRef }[]>();
  for (const e of graph.edges) {
    if (!neighbors.has(e.source)) neighbors.set(e.source, []);
    if (!neighbors.has(e.target)) neighbors.set(e.target, []);
    neighbors.get(e.source)!.push({ id: e.target, edge: e });
    neighbors.get(e.target)!.push({ id: e.source, edge: e });
  }
  for (const list of neighbors.values()) list.sort((x, y) => (x.id < y.id ? -1 : 1));

  const prev = new Map<string, { from: string; edge: GraphEdgeRef }>();
  const seen = new Set<string>([a]);
  let frontier = [a];
  while (frontier.length > 0 && !seen.has(b)) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const nb of neighbors.get(id) ?? []) {
        if (seen.has(nb.id)) continue;
        seen.add(nb.id);
        prev.set(nb.id, { from: id, edge: nb.edge });
        next.push(nb.id);
      }
    }
    frontier = next;
  }
  if (!seen.has(b)) return { found: false };

  const ids: string[] = [b];
  const edges: GraphEdgeRef[] = [];
  for (let cur = b; cur !== a; ) {
    const p = prev.get(cur)!;
    edges.unshift(p.edge);
    ids.unshift(p.from);
    cur = p.from;
  }
  return { found: true, nodes: ids.map((id) => byId.get(id)!), edges };
}

/**
 * Deterministic seed matching for free-text queries: case-insensitive
 * SUBSTRING match of each significant token (≥3 chars) against node labels.
 * Label-only by design — node ids and file paths would over-match.
 */
export function querySeeds(graph: ParsedGraph, question: string): ParsedGraph['nodes'] {
  const tokens = question
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length >= 3);
  if (tokens.length === 0) return [];
  const uniq = [...new Set(tokens)];
  return graph.nodes
    .filter((n) => {
      const label = (n.label ?? '').toLowerCase();
      return uniq.some((t) => label.includes(t));
    })
    .sort((a, b) => (a.node_id < b.node_id ? -1 : 1));
}

/** Direct neighbors of a node (undirected), id-sorted, with connecting edges. */
export function neighborhood(
  graph: ParsedGraph,
  nodeId: string,
): { nodes: ParsedGraph['nodes']; edges: GraphEdgeRef[] } | undefined {
  const byId = new Map(graph.nodes.map((n) => [n.node_id, n]));
  if (!byId.has(nodeId)) return undefined;
  const edges = graph.edges.filter((e) => e.source === nodeId || e.target === nodeId);
  const ids = new Set<string>();
  for (const e of edges) {
    ids.add(e.source);
    ids.add(e.target);
  }
  ids.delete(nodeId);
  return {
    nodes: [...ids].sort().map((id) => byId.get(id)!),
    edges: edges.slice().sort((a, b) => `${a.source}>${a.target}` < `${b.source}>${b.target}` ? -1 : 1),
  };
}

/** Honest health derivation — absent metrics omitted, never fabricated. */
export function graphHealthOf(
  graph: ParsedGraph,
  providerVersion: string,
  manifestEntries: number,
  manifestDigest?: string,
): GraphHealth {
  const languages = new Set<string>();
  for (const n of graph.nodes) {
    if (!n.source_file) continue;
    const dot = n.source_file.lastIndexOf('.');
    const slash = n.source_file.lastIndexOf('/');
    if (dot > slash) languages.add(n.source_file.slice(dot + 1).toLowerCase());
  }
  const communities = new Set<number>();
  for (const n of graph.nodes) {
    if (n.community !== undefined) communities.add(n.community);
  }
  return {
    ok: true,
    status: 'healthy',
    ...(manifestDigest !== undefined ? { manifest_digest: manifestDigest } : {}),
    provider_version: providerVersion,
    node_count: graph.nodes.length,
    edge_count: graph.edges.length,
    languages: [...languages].sort(),
    communities: communities.size,
    manifest_entries: manifestEntries,
    warnings: [...graph.warnings],
  };
}
