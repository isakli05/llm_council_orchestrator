/**
 * ArchitectureView — deterministic structural facts derived from the graph
 * (audit STEP 5): communities, symbol-level god nodes, cross-community
 * boundaries, language coverage, and honest extraction coverage against the
 * guarded manifest. NO LLM content and no interpretation — narrative belongs
 * to recovery analyses and the overlay, never here. Every list is sorted;
 * absent metrics are omitted, never fabricated.
 */
import { z } from 'zod';
import type { ParsedGraph } from '../intel/graph-reader';
import { godNodes } from '../intel/graph-ops';
import type { FileManifest } from '../ingest/workspace-copy';

export const ArchitectureViewSchema = z
  .object({
    schema_version: z.literal(1),
    snapshot_id: z.string().min(1),
    communities: z
      .array(
        z
          .object({
            id: z.number().int(),
            label: z.string().optional(),
            node_count: z.number().int().nonnegative(),
            files: z.array(z.string()),
          })
          .strict(),
      )
      .max(50),
    god_nodes: z
      .array(
        z
          .object({
            node_id: z.string(),
            label: z.string().optional(),
            degree: z.number().int().nonnegative(),
            community: z.number().int().optional(),
          })
          .strict(),
      )
      .max(20),
    cross_community_edges: z
      .array(
        z
          .object({
            source: z.string(),
            target: z.string(),
            relation: z.string().optional(),
            source_community: z.number().int(),
            target_community: z.number().int(),
          })
          .strict(),
      )
      .max(200),
    language_coverage: z
      .array(
        z
          .object({ language: z.string(), files: z.number().int().nonnegative(), nodes: z.number().int().nonnegative() })
          .strict(),
      )
      .max(50),
    coverage: z
      .object({
        guarded_files: z.number().int().nonnegative(),
        graph_files: z.number().int().nonnegative(),
        unsupported_files: z.array(z.string()).max(100),
      })
      .strict(),
    warnings: z.array(z.string()).max(100),
  })
  .strict();

export type ArchitectureView = z.infer<typeof ArchitectureViewSchema>;

/** Generated-code disclosure heuristics (excluded from god nodes, disclosed). */
const GENERATED_PATTERNS: readonly RegExp[] = [/\.generated\./, /(^|\/)generated\//, /(^|\/)__generated__\//];

function isGeneratedPath(path: string): boolean {
  return GENERATED_PATTERNS.some((p) => p.test(path));
}

export function buildArchitectureView(
  graph: ParsedGraph,
  manifest: FileManifest,
  snapshotId: string,
): ArchitectureView {
  const warnings: string[] = [];

  // --- communities -----------------------------------------------------------
  const communityOf = new Map<string, number | undefined>();
  for (const n of graph.nodes) communityOf.set(n.node_id, n.community);
  const noCommunity = graph.nodes.filter((n) => n.community === undefined).length;
  if (noCommunity > 0) {
    warnings.push(`${noCommunity} node(s) carry no community assignment — community views exclude them`);
  }
  const communityIds = [...new Set(graph.nodes.map((n) => n.community).filter((c): c is number => c !== undefined))].sort(
    (a, b) => a - b,
  );
  const communities = communityIds.slice(0, 50).map((id) => {
    const members = graph.nodes.filter((n) => n.community === id);
    const label = members.find((n) => n.community_name !== undefined)?.community_name;
    const files = [...new Set(members.map((n) => n.source_file).filter((f): f is string => f !== undefined))].sort();
    return {
      id,
      ...(label !== undefined ? { label } : {}),
      node_count: members.length,
      files: files.slice(0, 100),
    };
  });
  if (communityIds.length > 50) {
    warnings.push(`${communityIds.length - 50} additional communities not listed (cap 50)`);
  }

  // --- god nodes (symbol-level; generated-code excluded with disclosure) ------
  const generatedFiles = new Set(
    graph.nodes
      .map((n) => n.source_file)
      .filter((f): f is string => f !== undefined && isGeneratedPath(f)),
  );
  if (generatedFiles.size > 0) {
    warnings.push(
      `generated-code pattern detected and excluded from god nodes: ${[...generatedFiles].sort().slice(0, 20).join(', ')}`,
    );
  }
  const filteredGraph: ParsedGraph = {
    ...graph,
    nodes: graph.nodes.filter((n) => !(n.source_file !== undefined && isGeneratedPath(n.source_file))),
  };
  const god_nodes = godNodes(filteredGraph, 10).map((g) => ({
    node_id: g.node_id,
    ...(g.label !== undefined ? { label: g.label } : {}),
    degree: g.degree,
    ...(g.community !== undefined ? { community: g.community } : {}),
  }));

  // --- cross-community edges ---------------------------------------------------
  const cross: {
    source: string;
    target: string;
    relation?: string;
    source_community: number;
    target_community: number;
  }[] = [];
  for (const e of graph.edges) {
    const sc = communityOf.get(e.source);
    const tc = communityOf.get(e.target);
    if (sc === undefined || tc === undefined || sc === tc) continue;
    cross.push({
      source: e.source,
      target: e.target,
      ...(e.relation !== undefined ? { relation: e.relation } : {}),
      source_community: sc,
      target_community: tc,
    });
  }
  cross.sort(
    (a, b) =>
      a.source_community - b.source_community ||
      a.target_community - b.target_community ||
      (a.source < b.source ? -1 : a.source > b.source ? 1 : a.target < b.target ? -1 : 1),
  );
  if (cross.length > 200) {
    warnings.push(`${cross.length - 200} additional cross-community edges not listed (cap 200)`);
  }

  // --- language coverage --------------------------------------------------------
  const langFiles = new Map<string, Set<string>>();
  const langNodes = new Map<string, number>();
  for (const n of graph.nodes) {
    if (n.source_file === undefined) continue;
    const dot = n.source_file.lastIndexOf('.');
    const slash = n.source_file.lastIndexOf('/');
    if (dot <= slash) continue;
    const lang = n.source_file.slice(dot + 1).toLowerCase();
    if (!langFiles.has(lang)) {
      langFiles.set(lang, new Set());
      langNodes.set(lang, 0);
    }
    langFiles.get(lang)!.add(n.source_file);
    langNodes.set(lang, langNodes.get(lang)! + 1);
  }
  const language_coverage = [...langFiles.keys()]
    .sort()
    .map((language) => ({ language, files: langFiles.get(language)!.size, nodes: langNodes.get(language)! }));

  // --- coverage vs the guarded manifest ------------------------------------------
  const graphFiles = new Set(
    graph.nodes.map((n) => n.source_file).filter((f): f is string => f !== undefined),
  );
  const unsupported = manifest.map((f) => f.path).filter((p) => !graphFiles.has(p)).sort();
  if (unsupported.length > 0) {
    warnings.push(
      `${unsupported.length} guarded file(s) absent from the graph (unsupported language, empty, or extraction gap): ${unsupported
        .slice(0, 20)
        .join(', ')}`,
    );
  }

  return {
    schema_version: 1,
    snapshot_id: snapshotId,
    communities,
    god_nodes,
    cross_community_edges: cross.slice(0, 200),
    language_coverage,
    coverage: {
      guarded_files: manifest.length,
      graph_files: graphFiles.size,
      unsupported_files: unsupported.slice(0, 100),
    },
    warnings: [...new Set(warnings)].sort(),
  };
}
