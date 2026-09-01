/**
 * ContextProvider — the stable seam between structural code intelligence and
 * LLM analysis (audit 20 §2.5). V1 implementation: GraphContextProvider,
 * fully deterministic (graph + manifest + injected slice reader; no clock, no
 * randomness, no embeddings — the semantic-provider seam stays a seam).
 *
 * Prompt-context safety: bounded items/chars, per-slice line+char caps,
 * manifest-contained slice reads ONLY (nothing outside the guarded copy is
 * ever read), secret redaction applied to every slice with the count recorded.
 */
import type { ParsedGraph } from '../intel/graph-reader';
import { godNodes } from '../intel/graph-ops';
import type { FileManifest } from '../ingest/workspace-copy';
import { RENEW_CONTEXT_LIMITS, type ContextBundle, type ContextItem, type ContextLimits } from './bundle';
import { redactSecrets } from './redact';

export { RENEW_CONTEXT_LIMITS } from './bundle';

export type AnalysisScope =
  | { type: 'whole' }
  | { type: 'community'; id: number }
  | { type: 'node'; node_id: string }
  | { type: 'path'; pattern: string };

/** Reads a line range from the guarded workspace copy (1-based, inclusive). */
export type SliceReader = (
  path: string,
  startLine: number,
  endLine: number,
) => { text: string; startLine: number; endLine: number } | undefined;

export interface ContextProvider {
  contextFor(scope: AnalysisScope): ContextBundle;
}

export interface GraphContextProviderOptions {
  graph: ParsedGraph;
  manifest: FileManifest;
  readSlice: SliceReader;
  limits?: Partial<ContextLimits>;
}

/** Lines of context around a node's location; hard window before the cap. */
const CONTEXT_BEFORE = 4;
const CONTEXT_AFTER = 45;
/** Fixed per-item accounting overhead in total_chars. */
const ITEM_OVERHEAD = 40;

function parseLoc(loc: string | undefined): number | undefined {
  if (loc === undefined) return undefined;
  const m = /^L(\d+)$/.exec(loc);
  return m ? Number.parseInt(m[1], 10) : undefined;
}

export class GraphContextProvider implements ContextProvider {
  private readonly limits: ContextLimits;
  private readonly manifestPaths: Set<string>;

  constructor(private readonly opts: GraphContextProviderOptions) {
    this.limits = { ...RENEW_CONTEXT_LIMITS, ...(opts.limits ?? {}) };
    this.manifestPaths = new Set(opts.manifest.map((f) => f.path));
  }

  contextFor(scope: AnalysisScope): ContextBundle {
    const warnings = new Set<string>();
    const selection = this.select(scope);

    const nodeItems: ContextItem[] = [...selection]
      .sort()
      .map((id) => this.opts.graph.nodes.find((n) => n.node_id === id))
      .filter((n): n is NonNullable<typeof n> => n !== undefined && !n.is_file)
      .map((n) => ({
        kind: 'node' as const,
        node_id: n.node_id,
        ...(n.label !== undefined ? { label: n.label } : {}),
        ...(n.source_file !== undefined ? { source_file: n.source_file } : {}),
        ...(n.source_location !== undefined ? { source_location: n.source_location } : {}),
        ...(n.community !== undefined ? { community: n.community } : {}),
        provenance: 'graph' as const,
      }));

    const edgeItems: ContextItem[] = this.opts.graph.edges
      .filter((e) => selection.has(e.source) && selection.has(e.target))
      .sort((a, b) => `${a.source}>${a.target}` < `${b.source}>${b.target}` ? -1 : 1)
      .map((e) => ({
        kind: 'edge' as const,
        source: e.source,
        target: e.target,
        ...(e.relation !== undefined ? { relation: e.relation } : {}),
        ...(e.confidence !== undefined ? { confidence: e.confidence } : {}),
        provenance: 'graph' as const,
      }));

    const factItems: ContextItem[] = this.factsFor(scope, selection);

    const sliceItems = this.sliceItems(scope, selection, warnings);

    let items: ContextItem[] = [...nodeItems, ...edgeItems, ...sliceItems, ...factItems];
    let truncated = false;
    const totalOf = (list: ContextItem[]): number =>
      list.reduce((sum, i) => sum + ITEM_OVERHEAD + ('text' in i ? i.text.length : 0), 0);
    while (
      items.length > 0 &&
      (items.length > this.limits.maxItems || totalOf(items) > this.limits.maxTotalChars)
    ) {
      items = items.slice(0, -1); // drop from the end: facts → slices → edges first
      truncated = true;
    }

    return {
      scope: scope as unknown as Record<string, unknown>,
      items,
      truncated,
      total_chars: totalOf(items),
      warnings: [...warnings].sort(),
    };
  }

  private select(scope: AnalysisScope): Set<string> {
    const nodes = this.opts.graph.nodes;
    switch (scope.type) {
      case 'whole':
        return new Set(nodes.map((n) => n.node_id));
      case 'community':
        return new Set(nodes.filter((n) => n.community === scope.id).map((n) => n.node_id));
      case 'node': {
        const set = new Set<string>();
        const exists = nodes.some((n) => n.node_id === scope.node_id);
        if (!exists) return set;
        set.add(scope.node_id);
        for (const e of this.opts.graph.edges) {
          if (e.source === scope.node_id) set.add(e.target);
          if (e.target === scope.node_id) set.add(e.source);
        }
        return set;
      }
      case 'path':
        return new Set(
          nodes.filter((n) => n.source_file !== undefined && n.source_file.includes(scope.pattern)).map((n) => n.node_id),
        );
    }
  }

  private factsFor(scope: AnalysisScope, selection: Set<string>): ContextItem[] {
    if (scope.type === 'community') {
      const members = this.opts.graph.nodes.filter((n) => selection.has(n.node_id));
      const name = members.find((n) => n.community_name !== undefined)?.community_name;
      const files = new Set(members.map((n) => n.source_file).filter((f): f is string => f !== undefined));
      return [
        {
          kind: 'structural_fact',
          text: `community ${scope.id}${name !== undefined ? ` ("${name}")` : ''} contains ${members.length} nodes across ${files.size} file(s)`,
          provenance: 'derived',
        },
      ];
    }
    if (scope.type === 'whole') {
      return [
        {
          kind: 'structural_fact',
          text: `graph summary: ${this.opts.graph.nodes.length} nodes, ${this.opts.graph.edges.length} edges`,
          provenance: 'derived',
        },
      ];
    }
    return [];
  }

  private sliceItems(
    scope: AnalysisScope,
    selection: Set<string>,
    warnings: Set<string>,
  ): ContextItem[] {
    // Which nodes drive slicing: god-node priority for whole scope, id order
    // otherwise. Deterministic either way.
    let ordered: { node_id: string; source_file?: string; source_location?: string }[];
    if (scope.type === 'whole') {
      const rank = new Map(godNodes(this.opts.graph, this.opts.graph.nodes.length).map((n, i) => [n.node_id, i]));
      ordered = this.opts.graph.nodes
        .filter((n) => !n.is_file && selection.has(n.node_id))
        .sort((a, b) => (rank.get(a.node_id) ?? 0) - (rank.get(b.node_id) ?? 0) || (a.node_id < b.node_id ? -1 : 1));
    } else {
      ordered = this.opts.graph.nodes
        .filter((n) => !n.is_file && selection.has(n.node_id))
        .sort((a, b) => (a.node_id < b.node_id ? -1 : 1));
    }

    // Merge per-file line windows from node locations.
    const windows = new Map<string, { start: number; end: number }>();
    const fileOrder: string[] = [];
    for (const n of ordered) {
      if (n.source_file === undefined) continue;
      if (!this.manifestPaths.has(n.source_file)) {
        warnings.add(`graph node references file not present in the guarded manifest: ${n.source_file}`);
        continue;
      }
      const line = parseLoc(n.source_location) ?? 1;
      const start = Math.max(1, line - CONTEXT_BEFORE);
      const end = start + CONTEXT_BEFORE + CONTEXT_AFTER;
      const existing = windows.get(n.source_file);
      if (existing === undefined) {
        windows.set(n.source_file, { start, end });
        fileOrder.push(n.source_file);
      } else {
        existing.start = Math.min(existing.start, start);
        existing.end = Math.max(existing.end, end);
      }
      if (fileOrder.length >= this.limits.maxSliceFiles) break;
    }

    const items: ContextItem[] = [];
    for (const path of fileOrder.slice(0, this.limits.maxSliceFiles)) {
      const win = windows.get(path)!;
      const clippedStart = win.start;
      const clippedEnd = Math.min(win.end, clippedStart + this.limits.maxSliceLines - 1);
      const slice = this.opts.readSlice(path, clippedStart, clippedEnd);
      if (slice === undefined) continue;
      const redacted = redactSecrets(slice.text);
      const text =
        redacted.text.length > this.limits.maxFileSliceChars
          ? `${redacted.text.slice(0, this.limits.maxFileSliceChars)}…[truncated]`
          : redacted.text;
      items.push({
        kind: 'file_slice',
        path,
        start_line: slice.startLine,
        end_line: slice.endLine,
        text,
        redactions: redacted.count,
        provenance: 'file-read',
      });
    }
    return items;
  }
}
