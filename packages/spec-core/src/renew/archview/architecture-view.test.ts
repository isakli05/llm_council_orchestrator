import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGraphFile } from '../intel/graph-reader';
import { buildArchitectureView, ArchitectureViewSchema } from './architecture-view';
import type { FileManifest } from '../ingest/workspace-copy';

const fixturePath = join(__dirname, '..', '..', '..', 'fixtures', 'legacy-app', 'graph-fixture.json');
const rawFixture = readFileSync(fixturePath, 'utf8');

function loadGraph() {
  const parsed = parseGraphFile(JSON.parse(rawFixture));
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.graph;
}

const MANIFEST: FileManifest = ['src/inventory.ts', 'src/main.ts', 'src/orders.ts', 'src/pricing.ts']
  .sort()
  .map((path) => ({ path, sha256: `sha256:${'f'.repeat(64)}` }));

const SNAP_ID = 'RSN-deadbeefdeadbeef';

describe('buildArchitectureView (deterministic structural summary)', () => {
  it('is schema-valid and stable across rebuilds', () => {
    const a = buildArchitectureView(loadGraph(), MANIFEST, SNAP_ID);
    const b = buildArchitectureView(loadGraph(), MANIFEST, SNAP_ID);
    expect(ArchitectureViewSchema.safeParse(a).success).toBe(true);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('carries the snapshot identity and schema version', () => {
    const view = buildArchitectureView(loadGraph(), MANIFEST, SNAP_ID);
    expect(view.schema_version).toBe(1);
    expect(view.snapshot_id).toBe(SNAP_ID);
  });

  it('reports both communities with labels and honest counts', () => {
    const view = buildArchitectureView(loadGraph(), MANIFEST, SNAP_ID);
    const byId = new Map(view.communities.map((c) => [c.id, c]));
    expect(byId.get(0)).toMatchObject({ label: 'orders', node_count: 8 });
    expect(byId.get(1)).toMatchObject({ label: 'pricing', node_count: 3 });
    expect(byId.get(0)?.files).toEqual(['src/inventory.ts', 'src/main.ts', 'src/orders.ts']);
  });

  it('god nodes are symbol-level with community attached; createOrder first', () => {
    const view = buildArchitectureView(loadGraph(), MANIFEST, SNAP_ID);
    expect(view.god_nodes[0]).toMatchObject({ node_id: 'src_orders_createorder', degree: 5, community: 0 });
    expect(view.god_nodes.every((g) => !g.node_id.startsWith('src_main') || g.node_id.includes('_'))).toBe(true);
  });

  it('cross-community edges identify the two c0→c1 boundaries', () => {
    const view = buildArchitectureView(loadGraph(), MANIFEST, SNAP_ID);
    const pairs = view.cross_community_edges.map((e) => `${e.source}->${e.target}`);
    expect(pairs).toContain('src_main->src_pricing');
    expect(pairs).toContain('src_orders_createorder->src_pricing_priceorder');
    expect(view.cross_community_edges.every((e) => e.source_community !== e.target_community)).toBe(true);
  });

  it('language coverage is derived from source files (ts × 4 files)', () => {
    const view = buildArchitectureView(loadGraph(), MANIFEST, SNAP_ID);
    expect(view.language_coverage).toEqual([{ language: 'ts', files: 4, nodes: 11 }]);
  });

  it('coverage honestly lists manifest files the graph never extracted', () => {
    const withDocs: FileManifest = [...MANIFEST, { path: 'docs/rules.md', sha256: `sha256:${'f'.repeat(64)}` }];
    const view = buildArchitectureView(loadGraph(), withDocs, SNAP_ID);
    expect(view.coverage).toMatchObject({ guarded_files: 5, graph_files: 4 });
    expect(view.coverage.unsupported_files).toEqual(['docs/rules.md']);
    expect(view.warnings.some((w) => w.includes('docs/rules.md'))).toBe(true);
  });

  it('excludes generated-pattern nodes from god nodes with a disclosure warning', () => {
    const g = JSON.parse(rawFixture) as { nodes: unknown[] };
    g.nodes.push({
      id: 'src_api_generated_bigthing',
      label: 'bigThing',
      community: 0,
      source_file: 'src/api.generated.ts',
    });
    g.nodes.push({ id: 'src_api_generated', label: 'api.generated.ts', community: 0, source_file: 'src/api.generated.ts' });
    const parsed = parseGraphFile(g);
    if (!parsed.ok) throw new Error(parsed.message);
    const view = buildArchitectureView(parsed.graph, MANIFEST, SNAP_ID);
    expect(view.god_nodes.some((n) => n.node_id.includes('generated'))).toBe(false);
    expect(view.warnings.some((w) => w.includes('api.generated.ts'))).toBe(true);
  });

  it('structural-only: no field admits free-text interpretation', () => {
    const view = buildArchitectureView(loadGraph(), MANIFEST, SNAP_ID);
    const viewKeys = JSON.stringify(view);
    // The view carries ids, counts, labels, paths — never narrative sentences.
    expect(viewKeys).not.toMatch(/critical revenue|business logic|hypothes/);
  });
});
