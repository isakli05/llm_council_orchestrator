import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGraphFile } from './graph-reader';

const fixturePath = join(__dirname, '..', '..', '..', 'fixtures', 'legacy-app', 'graph-fixture.json');
const fixtureGraph: unknown = JSON.parse(readFileSync(fixturePath, 'utf8'));

describe('parseGraphFile (defensive graph.json reader)', () => {
  it('parses the committed fixture graph (real graphify node-link shape)', () => {
    const r = parseGraphFile(fixtureGraph);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.graph.nodes).toHaveLength(11);
    expect(r.graph.edges).toHaveLength(15);
    expect(r.graph.warnings).toEqual([]);
    const create = r.graph.nodes.find((n) => n.node_id === 'src_orders_createorder');
    expect(create?.label).toBe('createOrder');
    expect(create?.source_file).toBe('src/orders.ts');
    expect(create?.source_location).toBe('L21');
    expect(create?.community).toBe(0);
    expect(create?.community_name).toBe('orders');
  });

  it('maps link provenance onto edges (relation, confidence, location)', () => {
    const r = parseGraphFile(fixtureGraph);
    if (!r.ok) throw new Error(r.message);
    const edge = r.graph.edges.find(
      (e) => e.source === 'src_orders_createorder' && e.target === 'src_pricing_priceorder',
    );
    expect(edge?.relation).toBe('calls');
    expect(edge?.confidence).toBe('EXTRACTED');
    expect(edge?.source_file).toBe('src/orders.ts');
    expect(edge?.source_location).toBe('L28');
  });

  it('tolerates unknown extra fields on nodes and links (forward compatibility)', () => {
    const g = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
      nodes: Record<string, unknown>[];
      links: Record<string, unknown>[];
    };
    g.nodes[0].brand_new_future_field = 'whatever';
    g.links[0].another_future_field = 42;
    const r = parseGraphFile(g);
    expect(r.ok).toBe(true);
  });

  it('captures built_at_commit and directed when present', () => {
    const r = parseGraphFile(fixtureGraph);
    if (!r.ok) throw new Error(r.message);
    expect(r.graph.built_at_commit).toBe('fixture');
    expect(r.graph.directed).toBe(false);
  });

  it('rejects non-object input', () => {
    const r = parseGraphFile('not a graph');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('graph_invalid');
    expect(r.message).toMatch(/object/i);
  });

  it('rejects a graph with no nodes array', () => {
    const r = parseGraphFile({ links: [] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('graph_invalid');
    expect(r.message).toMatch(/nodes/);
  });

  it('rejects an empty nodes array', () => {
    const r = parseGraphFile({ nodes: [], links: [] });
    expect(r.ok).toBe(false);
  });

  it('rejects a node without an id', () => {
    const r = parseGraphFile({ nodes: [{ label: 'x' }], links: [] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toMatch(/id/);
  });

  it('rejects a link without source or target', () => {
    const r = parseGraphFile({ nodes: [{ id: 'a' }], links: [{ target: 'a', relation: 'calls' }] });
    expect(r.ok).toBe(false);
  });

  it('dangling links (endpoint not in the node set) are a typed failure — H-11', () => {
    const r = parseGraphFile({
      nodes: [{ id: 'a' }, { id: 'b' }],
      links: [
        { source: 'a', target: 'b', relation: 'calls' },
        { source: 'a', target: 'ghost', relation: 'calls' },
        { source: 'phantom', target: 'b', relation: 'imports' },
      ],
    });
    // Load-bearing graph state never proceeds on a partial success: the
    // graph is structurally incomplete and must be rebuilt.
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('graph_invalid');
    expect(r.message).toMatch(/2 dangling/);
  });
});
