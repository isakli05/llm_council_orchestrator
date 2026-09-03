/**
 * CodeIntelligenceProvider — the replaceable seam between renewal cores and
 * structural code intelligence (audit 16 §C, 20 §2.1).
 *
 * V1's only real implementation is GraphifyAdapter (pinned external tool,
 * subprocess). StaticGraphProvider serves committed fixture graphs in tests.
 * Nothing outside this interface may depend on Graphify specifics —
 * provider-specific detail stays in diagnostics/provenance, preserving
 * replaceability (audit 15 §D).
 */

export type IntelFailureCode =
  | 'not_installed'
  | 'unsupported_version'
  | 'probe_failed'
  | 'build_failed'
  | 'graph_missing'
  | 'graph_invalid'
  | 'incompatible'
  | 'binding_missing'
  | 'binding_corrupt'
  | 'binding_tampered'
  | 'coherence_failed'
  | 'query_failed'
  | 'timeout'
  | 'output_cap'
  | 'cancelled';

/**
 * INV-G3 (S2-H-06/M-08): explicit graph-health classification, carried by
 * `graphHealth()` results — healthy reports say 'healthy'; failures say which
 * arm failed. Optional so every pre-existing producer (fixture providers,
 * graphHealthOf, non-health failures) stays assignable; consumers tighten
 * onto it incrementally.
 */
export type GraphHealthStatus = 'healthy' | 'missing' | 'malformed' | 'incompatible' | 'probe_unavailable' | 'coherence_failed';

/** A graph-HEALTH failure: like IntelFailure but with a REQUIRED state —
 *  every arm of graphHealth() classifies itself (S3-M-01: generic probe
 *  failures are 'probe_unavailable', never statusless). */
export type HealthFailure = IntelFailure & { status: GraphHealthStatus };

/** Every failure carries an actionable, human-readable message. */
export interface IntelFailure {
  ok: false;
  code: IntelFailureCode;
  message: string;
  /** Builder/tool stderr tail, when a subprocess produced one. */
  stderr?: string;
  /** Actionable remediation (install/pin instructions). */
  hint?: string;
  /** Present only on failures returned by graphHealth(): the explicit
   * INV-G3 classification of the failing arm. */
  status?: GraphHealthStatus;
}

export type IntelProbe =
  | { ok: true; providerVersion: string; supportedRange: string }
  | {
      ok: false;
      providerVersion?: string;
      supportedRange: string;
      code: IntelFailureCode;
      message: string;
      /** Actionable remediation (install/pin instructions). */
      hint?: string;
    };

/** Provenance-carrying node reference (Graphify node-link shape, renamed to
 * LCO-owned vocabulary — Graphify internals do not leak past this point). */
export interface GraphNodeRef {
  node_id: string;
  label?: string;
  source_file?: string;
  /** Raw source location as the provider reports it (e.g. "L21"). */
  source_location?: string;
  community?: number;
  community_name?: string;
  /** True when this node represents the FILE itself (label === file basename)
   * rather than a symbol inside it — graphify's god-nodes exclude these. */
  is_file?: boolean;
}

export interface GraphEdgeRef {
  source: string;
  target: string;
  /** e.g. calls / imports / contains / references. */
  relation?: string;
  /** Provider confidence label (EXTRACTED / INFERRED / AMBIGUOUS). */
  confidence?: string;
  context?: string;
  source_file?: string;
  source_location?: string;
}

export interface GodNode extends GraphNodeRef {
  degree: number;
}

export interface AffectedHit {
  node_id: string;
  depth: number;
  /** Node ids from the seed (inclusive) to this hit. */
  via: string[];
}

export type AffectedResult =
  | { ok: true; hits: AffectedHit[] }
  | IntelFailure;

export type IntelItems =
  | { ok: true; text: string; nodes: GraphNodeRef[]; edges: GraphEdgeRef[] }
  | IntelFailure;

export interface GraphHealth {
  ok: true;
  /** S3-M-01 (trust kernel): REQUIRED on every success shape — 'healthy'
   * only when graph AND manifest both parse (manifest entries ≥ 1). The
   * "ok with status undefined" shape is no longer representable. */
  status: 'healthy';
  provider_version: string;
  node_count: number;
  edge_count: number;
  /** File extensions observed on node source files, sorted. */
  languages: string[];
  communities: number;
  manifest_digest?: string;
  manifest_entries: number;
  /** Honest disclosure only — absent metrics are omitted, never fabricated. */
  warnings: string[];
}

export interface AffectedOptions {
  depth?: number;
  /** Restrict reverse traversal to these edge relations. */
  relations?: readonly string[];
}

/**
 * The structural-intelligence contract. All methods fail closed: an
 * `{ok:false,...}` result is the ONLY failure shape — no throwing for
 * expected unavailability, no placeholder-success.
 */
export interface CodeIntelligenceProvider {
  probe(): Promise<IntelProbe>;
  /**
   * Build/refresh the graph. `workspaceRoot` is the LCO-owned directory the
   * graph must live under (`<workspaceRoot>/graphify-out/graph.json`) — real
   * adapters run their subprocess there; fixture providers materialize the
   * committed graph there.
   */
  build(opts?: { force?: boolean; workspaceRoot?: string }): Promise<
    { ok: true } | IntelFailure
  >;
  /** The parsed structural graph (defensive; renewal context derives from it). */
  graph(): Promise<{ ok: true; graph: import('./graph-reader').ParsedGraph } | IntelFailure>;
  query(question: string, opts?: { budget?: number }): Promise<IntelItems>;
  path(a: string, b: string): Promise<IntelItems>;
  explain(node: string): Promise<IntelItems>;
  affected(seed: string, opts?: AffectedOptions): Promise<AffectedResult>;
  godNodes(top?: number): Promise<GodNode[] | IntelFailure>;
  graphHealth(): Promise<GraphHealth | HealthFailure>;
}
