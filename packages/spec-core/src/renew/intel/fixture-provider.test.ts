import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGraphFile } from './graph-reader';
import { StaticGraphProvider } from './fixture-provider';
import { SUPPORTED_GRAPHIFY_RANGE } from './graphify-adapter';

const fixturePath = join(__dirname, '..', '..', '..', 'fixtures', 'legacy-app', 'graph-fixture.json');
const parsed = parseGraphFile(JSON.parse(readFileSync(fixturePath, 'utf8')));
if (!parsed.ok) throw new Error(parsed.message);

function makeProvider(): StaticGraphProvider {
  return new StaticGraphProvider(parsed.graph, '0.9.50');
}

describe('StaticGraphProvider (offline CodeIntelligenceProvider over a committed graph)', () => {
  it('probes OK with the pinned version and supported range', async () => {
    const probe = await makeProvider().probe();
    expect(probe.ok).toBe(true);
    if (!probe.ok) return;
    expect(probe.providerVersion).toBe('0.9.50');
    expect(probe.supportedRange).toBe(SUPPORTED_GRAPHIFY_RANGE);
  });

  it('reports graph health honestly (counts, languages, communities; no fabrication)', async () => {
    const health = await makeProvider().graphHealth();
    expect(health.ok).toBe(true);
    if (!health.ok) return;
    expect(health.node_count).toBe(11);
    expect(health.edge_count).toBe(15);
    expect(health.languages).toEqual(['ts']);
    expect(health.communities).toBe(2);
    expect(health.warnings).toEqual([]);
  });

  it('exposes god nodes deterministically', async () => {
    const a = await makeProvider().godNodes(2);
    const b = await makeProvider().godNodes(2);
    expect(a).toEqual(b);
    expect(a[0].node_id).toBe('src_orders_createorder');
  });

  it('answers affected()/query()/path()/explain() from the static graph', async () => {
    const p = makeProvider();
    const affected = await p.affected('src_pricing_applydiscount', { depth: 1 });
    expect(affected.ok).toBe(true);

    const q = await p.query('discount');
    expect(q.ok).toBe(true);
    if (q.ok) expect(q.nodes.some((n) => n.node_id === 'src_pricing_applydiscount')).toBe(true);

    const path = await p.path('src_main_run', 'src_pricing_applydiscount');
    expect(path.ok).toBe(true);

    const explain = await p.explain('src_orders_createorder');
    expect(explain.ok).toBe(true);
    if (explain.ok) {
      expect(explain.text.length).toBeGreaterThan(0);
      expect(explain.nodes.some((n) => n.node_id === 'src_orders')).toBe(true);
    }
  });

  it('is deterministic across provider instances (same graph → same health)', async () => {
    const h1 = await makeProvider().graphHealth();
    const h2 = await new StaticGraphProvider(parsed.graph, '0.9.50').graphHealth();
    expect(JSON.stringify(h1)).toBe(JSON.stringify(h2));
  });
});
