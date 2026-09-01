/**
 * GraphifyAdapter — the ONLY V1 CodeIntelligenceProvider (audit 20 §2.2).
 *
 * Contract with the external tool:
 *   - pinned range below; version probed BEFORE any use; unexpected versions
 *     fail closed with actionable messages (never placeholder-success);
 *   - invoked through intel/subprocess.ts: explicit argv, no shell, timeouts,
 *     output caps, stderr preserved, exit status checked;
 *   - state-changing operation is exactly one: `graphify update <workspaceRoot>`
 *     (AST-only, offline) — the LCO-owned workspace, NEVER the analyzed repo
 *     (graphify writes <root>/graphify-out/; the target repo stays untouched);
 *   - all read operations parse graph.json defensively via graph-reader —
 *     Graphify is a trusted executable but an untrusted data producer.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  AffectedOptions,
  AffectedResult,
  CodeIntelligenceProvider,
  GodNode,
  GraphHealth,
  IntelItems,
  IntelProbe,
} from './provider';
import type { IntelFailure } from './provider';
import { parseGraphText, type ParsedGraph } from './graph-reader';
import { affectedReverse, godNodes, graphHealthOf, neighborhood, querySeeds, shortestPath } from './graph-ops';
import { runSubprocess, type SubprocessRunner } from './subprocess';

/** The deliberate, audited pin (graphify 0.9.50 verified live 2026-09-02). */
export const SUPPORTED_GRAPHIFY_RANGE = '>=0.9.50 <0.10.0';
const MIN_VERSION: readonly number[] = [0, 9, 50];
const MAX_EXCLUSIVE: readonly number[] = [0, 10, 0];

const INSTALL_HINT =
  'Graphify is an external prerequisite for `lco renew` (not bundled): install it per ' +
  'https://github.com/Graphify-Labs/graphify, then re-run. All other lco commands work without it.';

export function parseGraphifyVersion(output: string): string | undefined {
  const m = /^graphify (\d+\.\d+\.\d+)\s*$/m.exec(output.trim());
  return m?.[1];
}

function compareTriple(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

export function versionSupported(version: string): boolean {
  const parts = version.split('.').map((p) => Number.parseInt(p, 10));
  if (parts.length !== 3 || parts.some((p) => Number.isNaN(p))) return false;
  return compareTriple(parts, MIN_VERSION) >= 0 && compareTriple(parts, MAX_EXCLUSIVE) < 0;
}

export interface GraphifyAdapterOptions {
  /** LCO-owned directory that graphify treats as the repo root. */
  workspaceRoot: string;
  executable?: string;
  runner?: SubprocessRunner;
  readFile?: (path: string) => string;
  probeTimeoutMs?: number;
  buildTimeoutMs?: number;
  queryTimeoutMs?: number;
  maxBufferBytes?: number;
}

const DEFAULTS = {
  executable: 'graphify',
  probeTimeoutMs: 15_000,
  buildTimeoutMs: 600_000,
  queryTimeoutMs: 60_000,
  maxBufferBytes: 16 * 1024 * 1024,
} as const;

export class GraphifyAdapter implements CodeIntelligenceProvider {
  static readonly versionSupportedStatic = versionSupported;

  private readonly workspaceRoot: string;
  private readonly exe: string;
  private readonly runner: SubprocessRunner;
  private readonly readFileImpl: (path: string) => string;
  private readonly opts: {
    probeTimeoutMs: number;
    buildTimeoutMs: number;
    queryTimeoutMs: number;
    maxBufferBytes: number;
  };
  private probedVersion: string | undefined;

  constructor(o: GraphifyAdapterOptions) {
    this.workspaceRoot = o.workspaceRoot;
    this.exe = o.executable ?? DEFAULTS.executable;
    this.runner = o.runner ?? runSubprocess;
    this.readFileImpl = o.readFile ?? ((path: string) => readFileSync(path, 'utf8'));
    this.opts = {
      probeTimeoutMs: o.probeTimeoutMs ?? DEFAULTS.probeTimeoutMs,
      buildTimeoutMs: o.buildTimeoutMs ?? DEFAULTS.buildTimeoutMs,
      queryTimeoutMs: o.queryTimeoutMs ?? DEFAULTS.queryTimeoutMs,
      maxBufferBytes: o.maxBufferBytes ?? DEFAULTS.maxBufferBytes,
    };
  }

  private get graphPath(): string {
    return join(this.workspaceRoot, 'graphify-out', 'graph.json');
  }

  async probe(): Promise<IntelProbe> {
    const r = await this.runner(this.exe, ['--version'], {
      timeoutMs: this.opts.probeTimeoutMs,
      maxBufferBytes: 64 * 1024,
    });
    if (r.status === 'spawn_failed') {
      return {
        ok: false,
        supportedRange: SUPPORTED_GRAPHIFY_RANGE,
        code: 'not_installed',
        message: r.message,
        hint: INSTALL_HINT,
      };
    }
    if (r.status === 'timeout' || r.status === 'output_cap') {
      return {
        ok: false,
        supportedRange: SUPPORTED_GRAPHIFY_RANGE,
        code: 'probe_failed',
        message: `graphify --version did not complete (${r.status === 'timeout' ? 'timed out' : 'output exceeded cap'})`,
        hint: INSTALL_HINT,
      };
    }
    if (r.exitCode !== 0) {
      return {
        ok: false,
        supportedRange: SUPPORTED_GRAPHIFY_RANGE,
        code: 'probe_failed',
        message: `graphify --version exited ${r.exitCode}${r.stderr ? `: ${r.stderr.trim()}` : ''}`,
        hint: INSTALL_HINT,
      };
    }
    const version = parseGraphifyVersion(r.stdout);
    if (version === undefined) {
      return {
        ok: false,
        supportedRange: SUPPORTED_GRAPHIFY_RANGE,
        code: 'probe_failed',
        message: `could not parse graphify --version output: ${JSON.stringify(r.stdout.trim().slice(0, 120))}`,
        hint: INSTALL_HINT,
      };
    }
    if (!versionSupported(version)) {
      return {
        ok: false,
        providerVersion: version,
        supportedRange: SUPPORTED_GRAPHIFY_RANGE,
        code: 'unsupported_version',
        message: `graphify ${version} is outside the supported range ${SUPPORTED_GRAPHIFY_RANGE}; expected e.g. 0.9.50`,
        hint: `Install a graphify version inside ${SUPPORTED_GRAPHIFY_RANGE}. This LCO release was audited against graphify 0.9.50.`,
      };
    }
    this.probedVersion = version;
    return { ok: true, providerVersion: version, supportedRange: SUPPORTED_GRAPHIFY_RANGE };
  }

  async build(opts?: { force?: boolean }): Promise<{ ok: true } | IntelFailure> {
    const argv = ['update', this.workspaceRoot];
    if (opts?.force) argv.push('--force');
    const r = await this.runner(this.exe, argv, {
      timeoutMs: this.opts.buildTimeoutMs,
      maxBufferBytes: this.opts.maxBufferBytes,
    });
    if (r.status === 'spawn_failed') {
      return { ok: false, code: 'not_installed', message: r.message };
    }
    if (r.status === 'timeout') {
      return { ok: false, code: 'timeout', message: 'graphify update timed out', stderr: tail(r.stderr) };
    }
    if (r.status === 'output_cap') {
      return { ok: false, code: 'output_cap', message: 'graphify update produced more output than the cap allows', stderr: tail(r.stderr) };
    }
    if (r.exitCode !== 0) {
      return {
        ok: false,
        code: 'build_failed',
        message: `graphify update exited ${r.exitCode}`,
        stderr: tail(r.stderr),
      };
    }
    const graph = this.loadGraph();
    return graph.ok ? { ok: true } : graph;
  }

  async query(question: string): Promise<IntelItems> {
    const g = this.loadGraph();
    if (!g.ok) return g;
    const seeds = querySeeds(g.graph, question);
    const seedIds = new Set(seeds.map((n) => n.node_id));
    const edges = g.graph.edges
      .filter((e) => seedIds.has(e.source) || seedIds.has(e.target))
      .sort((a, b) => `${a.source}>${a.target}` < `${b.source}>${b.target}` ? -1 : 1);
    return {
      ok: true,
      text: seeds.map((n) => `${n.node_id} (${n.label ?? '?'} @ ${n.source_file ?? '?'})`).join('\n'),
      nodes: seeds,
      edges,
    };
  }

  async path(a: string, b: string): Promise<IntelItems> {
    const g = this.loadGraph();
    if (!g.ok) return g;
    const r = shortestPath(g.graph, a, b);
    if (!r.found) {
      return { ok: false, code: 'query_failed', message: `no path between '${a}' and '${b}' in the graph` };
    }
    return { ok: true, text: r.nodes.map((n) => n.node_id).join(' -> '), nodes: r.nodes, edges: r.edges };
  }

  async explain(node: string): Promise<IntelItems> {
    const g = this.loadGraph();
    if (!g.ok) return g;
    const target = g.graph.nodes.find((n) => n.node_id === node);
    if (!target) {
      return { ok: false, code: 'query_failed', message: `unknown node '${node}'` };
    }
    const nb = neighborhood(g.graph, node) ?? { nodes: [], edges: [] };
    const lines = [`${node} (${target.label ?? '?'} @ ${target.source_file ?? '?'})`];
    for (const e of nb.edges) {
      const dir = e.source === node ? `-> ${e.target}` : `<- ${e.source}`;
      lines.push(`  ${dir} [${e.relation ?? '?'}${e.confidence ? ` ${e.confidence}` : ''}]`);
    }
    return { ok: true, text: lines.join('\n'), nodes: [target, ...nb.nodes], edges: nb.edges };
  }

  async affected(seed: string, opts?: AffectedOptions): Promise<AffectedResult> {
    const g = this.loadGraph();
    if (!g.ok) return g;
    return affectedReverse(g.graph, seed, opts ?? {});
  }

  async godNodes(top?: number): Promise<GodNode[]> {
    const g = this.loadGraph();
    if (!g.ok) return [];
    return godNodes(g.graph, top ?? 10);
  }

  async graphHealth(): Promise<GraphHealth | IntelFailure> {
    const g = this.loadGraph();
    if (!g.ok) return g;
    // Honest provider identity: probe once if we haven't; a failed probe is
    // disclosed as a warning, never fabricated as a version.
    let version = this.probedVersion;
    if (version === undefined) {
      const p = await this.probe();
      version = p.ok ? p.providerVersion : 'unknown';
      if (!p.ok && g.graph.warnings.length === 0) {
        return {
          ok: false,
          code: p.code,
          message: `graph exists but the provider probe failed: ${p.message}`,
          hint: p.hint,
        };
      }
    }
    return graphHealthOf(g.graph, version, 0);
  }

  private loadGraph(): { ok: true; graph: ParsedGraph } | IntelFailure {
    let text: string;
    try {
      text = this.readFileImpl(this.graphPath);
    } catch {
      return {
        ok: false,
        code: 'graph_missing',
        message: `no graphify graph at ${this.graphPath} — build it first (lco renew refresh)`,
      };
    }
    const parsed = parseGraphText(text);
    if (!parsed.ok) return parsed;
    return { ok: true, graph: parsed.graph };
  }
}

function tail(s: string, max = 2_000): string {
  return s.length > max ? s.slice(s.length - max) : s;
}
