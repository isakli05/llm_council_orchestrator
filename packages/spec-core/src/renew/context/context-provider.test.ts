import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGraphFile, parseGraphText } from '../intel/graph-reader';
import {
  GraphContextProvider,
  RENEW_CONTEXT_LIMITS,
  type SliceReader,
} from './context-provider';
import { ContextBundleSchema } from './bundle';
import { buildRecoveryPrompt, serializedSizeOfItem } from '../recovery/prompts';
import type { FileManifest } from '../ingest/workspace-copy';

const fixturePath = join(__dirname, '..', '..', '..', 'fixtures', 'legacy-app', 'graph-fixture.json');
const parsed = parseGraphFile(JSON.parse(readFileSync(fixturePath, 'utf8')));
if (!parsed.ok) throw new Error(parsed.message);
const graph = parsed.graph;

const FILES: Record<string, string> = {
  'src/main.ts': Array.from({ length: 30 }, (_, i) => `// main line ${i + 1}`).join('\n'),
  'src/orders.ts': Array.from({ length: 60 }, (_, i) => `// orders line ${i + 1}`).join('\n'),
  'src/pricing.ts': Array.from({ length: 50 }, (_, i) => `// pricing line ${i + 1}`).join('\n'),
  'src/inventory.ts': Array.from({ length: 30 }, (_, i) => `// inventory line ${i + 1}`).join('\n'),
};

const manifest: FileManifest = Object.keys(FILES)
  .sort()
  .map((path) => ({ path, sha256: `sha256:${path.length.toString().repeat(64).slice(0, 64)}` }));

/** Slice reader over the in-memory FILES map — the test double for the copy reader. */
const reader: SliceReader = (path, startLine, endLine) => {
  const content = FILES[path];
  if (content === undefined) return undefined;
  const lines = content.split('\n');
  const start = Math.max(1, startLine);
  const end = Math.min(endLine, lines.length);
  if (start > end) return undefined;
  return { text: lines.slice(start - 1, end).join('\n'), startLine: start, endLine: end };
};

function makeProvider(): GraphContextProvider {
  return new GraphContextProvider({ graph, manifest, readSlice: reader });
}

describe('GraphContextProvider (deterministic, provenance-carrying)', () => {
  it('whole scope: node items exclude file nodes, edges included, slices present, schema-valid', () => {
    const bundle = makeProvider().contextFor({ type: 'whole' });
    expect(ContextBundleSchema.safeParse(bundle).success).toBe(true);
    const nodeIds = bundle.items.filter((i) => i.kind === 'node').map((i) => (i as { node_id: string }).node_id);
    expect(nodeIds).not.toContain('src_orders'); // file node excluded from items
    expect(nodeIds).toContain('src_orders_createorder');
    expect(bundle.items.some((i) => i.kind === 'edge')).toBe(true);
    expect(bundle.items.some((i) => i.kind === 'file_slice')).toBe(true);
  });

  it('is deterministic: same inputs → byte-identical bundle', () => {
    const a = makeProvider().contextFor({ type: 'whole' });
    const b = new GraphContextProvider({ graph, manifest, readSlice: reader }).contextFor({ type: 'whole' });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('every item carries provenance; slices carry path+lines+redaction count', () => {
    const bundle = makeProvider().contextFor({ type: 'whole' });
    for (const item of bundle.items) {
      expect(typeof item.provenance).toBe('string');
      expect(['graph', 'file-read', 'derived']).toContain(item.provenance);
    }
    const slice = bundle.items.find((i) => i.kind === 'file_slice') as {
      path: string;
      start_line: number;
      end_line: number;
      redactions: number;
    } | undefined;
    expect(slice).toBeDefined();
    expect(slice?.redactions).toBe(0);
    expect(manifest.some((f) => f.path === slice?.path)).toBe(true);
  });

  it('slices ONLY manifest-listed files (containment: nothing outside the guarded copy)', () => {
    const staleText = readFileSync(fixturePath, 'utf8').replace(/src\/inventory\.ts/g, 'evil/../outside.ts');
    const staleGraph = parseGraphFile(JSON.parse(staleText));
    if (!staleGraph.ok) throw new Error(staleGraph.message);
    const provider = new GraphContextProvider({ graph: staleGraph.graph, manifest, readSlice: reader });
    const bundle = provider.contextFor({ type: 'path', pattern: 'outside' });
    const slices = bundle.items.filter((i) => i.kind === 'file_slice');
    expect(slices).toHaveLength(0);
    expect(bundle.warnings.some((w) => w.includes('outside.ts'))).toBe(true);
  });

  it('applies redaction to slice text and records the count', () => {
    // Place the secret INSIDE the sliced window (applyDiscount sits at L21;
    // the window opens at L17).
    const pricingLines = FILES['src/pricing.ts'].split('\n');
    pricingLines.splice(24, 0, 'const api_key = "supersecretvalue123";');
    const withSecret = { ...FILES, 'src/pricing.ts': pricingLines.join('\n') };
    const secretReader: SliceReader = (path, s, e) => readerWith(withSecret)(path, s, e);
    const provider = new GraphContextProvider({ graph, manifest, readSlice: secretReader });
    const bundle = provider.contextFor({ type: 'community', id: 1 });
    const slice = bundle.items.find(
      (i) => i.kind === 'file_slice' && (i as { path: string }).path === 'src/pricing.ts',
    ) as { text: string; redactions: number } | undefined;
    expect(slice).toBeDefined();
    expect(slice?.text).not.toContain('supersecretvalue123');
    expect(slice?.redactions).toBeGreaterThanOrEqual(1);
  });

  it('community scope restricts nodes/edges to that community', () => {
    const bundle = makeProvider().contextFor({ type: 'community', id: 1 });
    const nodeIds = bundle.items.filter((i) => i.kind === 'node').map((i) => (i as { node_id: string }).node_id);
    expect(nodeIds).toEqual(['src_pricing_applydiscount', 'src_pricing_priceorder']);
    const fact = bundle.items.find((i) => i.kind === 'structural_fact') as { text: string } | undefined;
    expect(fact?.text).toMatch(/community 1/);
  });

  it('node scope includes the node, its neighborhood edges, and its file window', () => {
    const bundle = makeProvider().contextFor({ type: 'node', node_id: 'src_pricing_applydiscount' });
    const nodeIds = bundle.items.filter((i) => i.kind === 'node').map((i) => (i as { node_id: string }).node_id);
    expect(nodeIds).toContain('src_pricing_applydiscount');
    const edges = bundle.items.filter((i) => i.kind === 'edge');
    expect(edges.length).toBeGreaterThan(0);
    const slice = bundle.items.find((i) => i.kind === 'file_slice') as { path: string; start_line: number } | undefined;
    expect(slice?.path).toBe('src/pricing.ts');
    // applyDiscount sits at L21 → window opens a few lines above it.
    expect(slice ? slice.start_line <= 21 : false).toBe(true);
  });

  it('enforces caps and reports truncation honestly (S2-H-04: serialized-size budget)', () => {
    const provider = new GraphContextProvider({
      graph,
      manifest,
      readSlice: reader,
      limits: { maxItems: 5, maxTotalChars: 3_000, maxFileSliceChars: 8_000, maxSliceLines: 200, maxSliceFiles: 12 },
    });
    const bundle = provider.contextFor({ type: 'whole' });
    expect(bundle.items.length).toBeLessThanOrEqual(5);
    expect(bundle.truncated).toBe(true);
    // total_chars is the sum of SERIALIZED item sizes — labels, paths, ids,
    // and JSON overhead included — never a flat per-item constant.
    const expected = bundle.items.reduce((sum, i) => sum + serializedSizeOfItem(i), 0);
    expect(bundle.total_chars).toBe(expected);
    expect(bundle.total_chars).toBeLessThanOrEqual(3_000);
  });

  it('respects per-slice line and char caps', () => {
    const provider = new GraphContextProvider({
      graph,
      manifest,
      readSlice: reader,
      limits: { ...RENEW_CONTEXT_LIMITS, maxSliceLines: 10, maxFileSliceChars: 5_000 },
    });
    const bundle = provider.contextFor({ type: 'whole' });
    for (const item of bundle.items) {
      if (item.kind === 'file_slice') {
        expect(item.end_line - item.start_line + 1).toBeLessThanOrEqual(10);
        expect(item.text.length).toBeLessThanOrEqual(5_000);
      }
    }
  });
});

// --- S2-H-04: honest serialized-size accounting -----------------------------------------

describe('context accounting counts serialized bytes (S2-H-04)', () => {
  const GITHUB_LABEL = 'ghp_Synthet1cLabelToken0123456789abcdef';

  const makeLabeledGraph = (symbolNodes: number, secretLabelIndex = -1) => {
    const nodes: { id: string; label: string; source_file: string; source_location: string }[] = [];
    const links: { source: string; target: string; relation?: string }[] = [];
    for (let i = 0; i < symbolNodes; i++) {
      const label = i === secretLabelIndex ? GITHUB_LABEL : `businessRuleHandlerWithLongDescriptiveName${i}`;
      nodes.push({ id: `n${i}`, label, source_file: 'src/domain.ts', source_location: `L${(i % 50) + 1}` });
      links.push({ source: `n${i}`, target: `n${(i + 1) % symbolNodes}`, relation: 'calls' });
    }
    const parsed = parseGraphText(JSON.stringify({ directed: true, nodes, links }));
    if (!parsed.ok) throw new Error(parsed.message);
    return parsed.graph;
  };

  const tinyReader: SliceReader = (path, startLine, endLine) => ({
    text: `slice of ${path} lines ${startLine}-${endLine}`,
    startLine,
    endLine,
  });

  it('total_chars equals the serialized sizes and EXCEEDS raw text when labels/paths dominate', () => {
    const provider = new GraphContextProvider({
      graph: makeLabeledGraph(120),
      manifest: [{ path: 'src/domain.ts', sha256: 'sha256:3333333333333333333333333333333333333333333333333333333333333333' }],
      readSlice: tinyReader,
    });
    const bundle = provider.contextFor({ type: 'whole' });
    expect(ContextBundleSchema.safeParse(bundle).success).toBe(true);

    const serialized = bundle.items.reduce((sum, i) => sum + serializedSizeOfItem(i), 0);
    expect(bundle.total_chars).toBe(serialized); // accounting == what the prompt serializes

    // The audited failure mode: 40-char flat overhead ignored labels/paths.
    const rawText = bundle.items.reduce((sum, i) => sum + ('text' in i ? i.text.length : 0), 0);
    expect(bundle.total_chars).toBeGreaterThan(rawText); // labels/paths/ids/overhead counted

    // And it is the right ORDER: the built prompt's document grows with it.
    const doc = buildRecoveryPrompt({ scope: bundle.scope, bundle, nowIso: '2026-09-02T00:00:00Z' });
    const start = doc.indexOf('UNTRUSTED SOURCE DATA START');
    const end = doc.lastIndexOf('UNTRUSTED SOURCE DATA END');
    const docBytes = end - start;
    expect(docBytes).toBeGreaterThan(bundle.total_chars); // document ⊇ item projections
    expect(docBytes).toBeLessThan(bundle.total_chars + bundle.items.length * 4 + 200); // wrapper+separators only
  });

  it('a graph label containing a secret is redacted when the bundle is serialized into a prompt', () => {
    const provider = new GraphContextProvider({
      graph: makeLabeledGraph(8, /* secretLabelIndex */ 3),
      manifest: [{ path: 'src/domain.ts', sha256: 'sha256:4444444444444444444444444444444444444444444444444444444444444444' }],
      readSlice: tinyReader,
    });
    const bundle = provider.contextFor({ type: 'whole' });
    const prompt = buildRecoveryPrompt({ scope: bundle.scope, bundle, nowIso: '2026-09-02T00:00:00Z' });
    expect(prompt).not.toContain(GITHUB_LABEL);
    expect(prompt).toMatch(/\[REDACTED:github-token\]/);
  });
});

function readerWith(files: Record<string, string>): SliceReader {
  return (path: string, startLine: number, endLine: number) => {
    const content = files[path];
    if (content === undefined) return undefined;
    const lines = content.split('\n');
    const start = Math.max(1, startLine);
    const end = Math.min(endLine, lines.length);
    if (start > end) return undefined;
    return { text: lines.slice(start - 1, end).join('\n'), startLine: start, endLine: end };
  };
}
