import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGraphFile } from './graph-reader';
import { affectedReverse, godNodes, querySeeds, shortestPath } from './graph-ops';

const fixturePath = join(__dirname, '..', '..', '..', 'fixtures', 'legacy-app', 'graph-fixture.json');
const parsed = parseGraphFile(JSON.parse(readFileSync(fixturePath, 'utf8')));
if (!parsed.ok) throw new Error(parsed.message);
const graph = parsed.graph;

describe('godNodes', () => {
  it("ranks by undirected degree; createOrder is the fixture's top god node", () => {
    const top = godNodes(graph, 3);
    expect(top[0].node_id).toBe('src_orders_createorder');
    expect(top[0].degree).toBe(5); // contains + called-by run + calls priceOrder/checkStock/saveOrder
    // Degree ties break by node_id ascending; FILE nodes are excluded (graphify parity).
    expect(top.map((n) => n.node_id)).toEqual([
      'src_orders_createorder',
      'src_orders_saveorder',
      'src_pricing_priceorder',
    ]);
  });

  it('breaks degree ties by node_id (stable ordering)', () => {
    // checkStock and saveOrder both have degree 2; ids must sort ascending within a tie.
    const all = godNodes(graph, 11);
    const degrees = all.map((n) => n.degree);
    expect([...degrees].sort((a, b) => b - a)).toEqual(degrees);
    for (let i = 1; i < all.length; i++) {
      if (all[i].degree === all[i - 1].degree) {
        expect(all[i].node_id > all[i - 1].node_id).toBe(true);
      }
    }
  });

  it('caps at the requested count', () => {
    expect(godNodes(graph, 2)).toHaveLength(2);
  });
});

describe('affectedReverse (blast radius)', () => {
  it('finds reverse impact: applyDiscount → priceOrder → createOrder at depth 2', () => {
    const r = affectedReverse(graph, 'src_pricing_applydiscount', { depth: 2 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const byId = new Map(r.hits.map((h) => [h.node_id, h.depth]));
    expect(byId.get('src_pricing_priceorder')).toBe(1);
    expect(byId.get('src_orders_createorder')).toBe(2);
    expect(byId.has('src_pricing_applydiscount')).toBe(false); // seed excluded
  });

  it('respects depth bounds', () => {
    const r = affectedReverse(graph, 'src_pricing_applydiscount', { depth: 1 });
    if (!r.ok) throw new Error(r.message);
    // Depth 1: both direct predecessors — the containing file AND the caller.
    expect(r.hits.map((h) => h.node_id)).toEqual(['src_pricing', 'src_pricing_priceorder']);
  });

  it('filters by relation when asked', () => {
    const r = affectedReverse(graph, 'src_orders_createorder', { depth: 1, relations: ['contains'] });
    if (!r.ok) throw new Error(r.message);
    expect(r.hits.map((h) => h.node_id)).toEqual(['src_orders']); // only the containing file
  });

  it('records the via path for each hit', () => {
    const r = affectedReverse(graph, 'src_pricing_applydiscount', { depth: 2 });
    if (!r.ok) throw new Error(r.message);
    const create = r.hits.find((h) => h.node_id === 'src_orders_createorder');
    expect(create?.via).toEqual(['src_pricing_applydiscount', 'src_pricing_priceorder', 'src_orders_createorder']);
  });

  it('unknown seed fails closed with query_failed', () => {
    const r = affectedReverse(graph, 'no_such_node', {});
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('query_failed');
  });
});

describe('shortestPath', () => {
  it('finds a deterministic shortest path (lexical neighbor tie-break)', () => {
    const r = shortestPath(graph, 'src_main_run', 'src_pricing_applydiscount');
    expect(r.found).toBe(true);
    if (!r.found) return;
    // Both the call chain and the file chain are length 3; BFS expands
    // neighbors in ascending id order, so the main.ts → pricing.ts file route
    // wins deterministically.
    expect(r.nodes.map((n) => n.node_id)).toEqual([
      'src_main_run',
      'src_main',
      'src_pricing',
      'src_pricing_applydiscount',
    ]);
    expect(r.edges).toHaveLength(3);
  });

  it('returns not-found for unreachable/no such nodes', () => {
    expect(shortestPath(graph, 'src_main_run', 'no_such_node').found).toBe(false);
  });
});

describe('querySeeds (deterministic token matching)', () => {
  it('matches tokens against label/norm_label/source_file, case-insensitively', () => {
    const seeds = querySeeds(graph, 'DISCOUNT stock');
    const ids = seeds.map((n) => n.node_id);
    expect(ids).toContain('src_pricing_applydiscount');
    expect(ids).toContain('src_inventory_checkstock');
  });

  it('ignores tokens shorter than 3 characters', () => {
    const seeds = querySeeds(graph, 'a b an pricing');
    expect(seeds.map((n) => n.node_id)).toContain('src_pricing');
    expect(seeds).toHaveLength(1);
  });

  it('is deterministic: repeated calls return identical order', () => {
    expect(querySeeds(graph, 'order stock')).toEqual(querySeeds(graph, 'order stock'));
  });
});
