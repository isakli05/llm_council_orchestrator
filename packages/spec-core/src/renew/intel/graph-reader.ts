/**
 * Defensive reader for Graphify's graph.json (node-link format).
 *
 * Graphify is a trusted executable but an UNTRUSTED data producer (audit 18
 * §A): this parser validates the fields renewal relies on, tolerates unknown
 * additive fields (forward compatibility across 0.9.x), and fails closed with
 * a pointer to the offending path — never a partial success.
 */
import { z } from 'zod';
import type { GraphEdgeRef, GraphNodeRef } from './provider';

export type { GraphEdgeRef, GraphNodeRef } from './provider';

export interface ParsedGraph {
  nodes: GraphNodeRef[];
  edges: GraphEdgeRef[];
  directed: boolean;
  built_at_commit?: string;
  warnings: string[];
}

export type GraphParseResult =
  | { ok: true; graph: ParsedGraph }
  | { ok: false; code: 'graph_invalid'; message: string };

const RawNodeSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().optional(),
    source_file: z.string().optional(),
    source_location: z.string().optional(),
    community: z.number().int().nonnegative().optional(),
    community_name: z.string().optional(),
  })
  .passthrough();

const RawLinkSchema = z
  .object({
    source: z.string().min(1),
    target: z.string().min(1),
    relation: z.string().optional(),
    confidence: z.string().optional(),
    context: z.string().optional(),
    source_file: z.string().optional(),
    source_location: z.string().optional(),
  })
  .passthrough();

const RawGraphSchema = z
  .object({
    nodes: z.array(RawNodeSchema).min(1),
    links: z.array(RawLinkSchema).default([]),
    directed: z.boolean().optional(),
    built_at_commit: z.string().optional(),
  })
  .passthrough();

/** Parse an already-loaded graph.json value. Pure; no IO. */
export function parseGraphFile(input: unknown): GraphParseResult {
  const parsed = RawGraphSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue.path.join('.');
    return {
      ok: false,
      code: 'graph_invalid',
      message: `graph.json is not a valid node-link document (${where ? `${where}: ` : ''}${issue.message})`,
    };
  }

  const nodeIds = new Set(parsed.data.nodes.map((n) => n.id));
  const edges: GraphEdgeRef[] = [];
  let dangling = 0;
  for (const link of parsed.data.links) {
    if (nodeIds.has(link.source) && nodeIds.has(link.target)) {
      edges.push({
        source: link.source,
        target: link.target,
        relation: link.relation,
        confidence: link.confidence,
        context: link.context,
        source_file: link.source_file,
        source_location: link.source_location,
      });
    } else {
      dangling++;
    }
  }

  const warnings =
    dangling > 0
      ? [`${dangling} dangling link(s) referenced unknown nodes and were dropped`]
      : [];

  return {
    ok: true,
    graph: {
      nodes: parsed.data.nodes.map((n) => ({
        node_id: n.id,
        label: n.label,
        source_file: n.source_file,
        source_location: n.source_location,
        community: n.community,
        community_name: n.community_name,
        is_file:
          n.source_file !== undefined && n.label === basename(n.source_file),
      })),
      edges,
      directed: parsed.data.directed ?? false,
      built_at_commit: parsed.data.built_at_commit,
      warnings,
    },
  };
}

function basename(p: string): string {
  const slash = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return slash === -1 ? p : p.slice(slash + 1);
}

/** Parse graph.json TEXT (JSON.parse failures map to graph_invalid). */
export function parseGraphText(text: string): GraphParseResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    return {
      ok: false,
      code: 'graph_invalid',
      message: `graph.json is not valid JSON (${(e as Error).message})`,
    };
  }
  return parseGraphFile(value);
}
