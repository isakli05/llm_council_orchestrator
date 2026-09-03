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
import type { HealthFailure, IntelFailure } from './provider';
import type { ParsedGraph } from './graph-reader';
import type { StructuralBinding } from '../trust/structural';
import { computeStructuralBinding, coerceStructuralBinding, requireStructuralGraph, structuralBindingPath, parseGraphManifestStrict } from '../trust/structural';
import { affectedReverse, godNodes, graphHealthOf, neighborhood, querySeeds, shortestPath } from './graph-ops';
import { runSubprocess, type SubprocessRunner } from './subprocess';
import { authorizedWrite, authorizedRead } from '../trust/fs';

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
  /** The RENEWAL PROJECT dir (trust domain for the LCO-owned structural
   *  binding written after each build — S4-H-04). */
  projectDir: string;
  executable?: string;
  runner?: SubprocessRunner;
  readFile?: (path: string) => string;
  /** Trusted write path for the LCO structural binding (S4-H-04). Default:
   *  the kernel's authorized write against projectDir; tests inject. */
  writeFile?: (path: string, content: string) => void;
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
  private readonly projectDir: string;
  private readonly exe: string;
  private readonly runner: SubprocessRunner;
  private readonly readFileImpl: (path: string) => string;
  private readonly writeFileImpl: (path: string, content: string) => void;
  private readonly opts: {
    probeTimeoutMs: number;
    buildTimeoutMs: number;
    queryTimeoutMs: number;
    maxBufferBytes: number;
  };
  private probedVersion: string | undefined;

  constructor(o: GraphifyAdapterOptions) {
    this.workspaceRoot = o.workspaceRoot;
    this.projectDir = o.projectDir;
    this.exe = o.executable ?? DEFAULTS.executable;
    this.runner = o.runner ?? runSubprocess;
    // S4-M-01 (B2 closure): the DEFAULT workspace reader is the kernel's
    // authorized reader (chain-validated) — graph.json/manifest.json/
    // lco-binding.json are trusted inputs. Injected readers stay for tests.
    this.readFileImpl =
      o.readFile ?? ((path: string) => authorizedRead({ projectDir: this.projectDir, path }));
    this.writeFileImpl = o.writeFile ?? ((path: string, content: string) => authorizedWrite({ projectDir: this.projectDir, path, content, mode: 0o600 }));
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

  private get manifestPath(): string {
    return join(this.workspaceRoot, 'graphify-out', 'manifest.json');
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
    // S4-H-04: immediately after a successful build, LCO seals the
    // manifest/graph pair with a structural binding (strict parse + source-
    // set coherence verified by the kernel; written through the authorized
    // primitive). Every later trusted graph read verifies it. The binding
    // records the provider's real version, so probe if we haven't. The
    // PRE-bind verification is pair-level (the binding does not exist yet —
    // this build is what creates it); the post-bind read is fully bound.
    if (this.probedVersion === undefined) {
      const p = await this.probe();
      if (!p.ok) return { ok: false, code: p.code, message: p.message, hint: p.hint };
    }
    const prebound = this.rebind();
    if (!prebound.ok) return prebound;
    const graph = this.loadGraph();
    if (!graph.ok) return graph;
    return { ok: true };
  }

  /** Verify the CURRENT artifact pair and write/refresh its structural
   *  binding (pair-level verification; the fully-bound gate is loadGraph). */
  private rebind(): { ok: true } | IntelFailure {
    let manifestText: string | undefined;
    try {
      manifestText = this.readFileImpl(this.manifestPath);
    } catch {
      manifestText = undefined;
    }
    let graphText: string;
    try {
      graphText = this.readFileImpl(this.graphPath);
    } catch {
      return { ok: false, code: 'graph_missing', message: `no graphify graph at ${this.graphPath} — build it first (lco renew refresh)` };
    }
    const version = this.probedVersion ?? 'unknown';
    const r = computeStructuralBinding({
      manifestText,
      graphText,
      graphifyVersion: version,
      nowIso: new Date().toISOString(),
    });
    if (!r.ok) return { ok: false, code: r.code as never, message: r.message } as IntelFailure;
    this.writeFileImpl(structuralBindingPath(this.workspaceRoot), `${JSON.stringify(r.binding, null, 2)}\n`);
    return { ok: true };
  }

  async graph(): Promise<{ ok: true; graph: ParsedGraph } | IntelFailure> {
    return this.loadGraph();
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

  async godNodes(top?: number): Promise<GodNode[] | IntelFailure> {
    // M-08: a graph read failure is a TYPED failure — empty and failure have
    // different semantics and must never collapse to [].
    const g = this.loadGraph();
    if (!g.ok) return g;
    return godNodes(g.graph, top ?? 10);
  }

  async graphHealth(): Promise<GraphHealth | HealthFailure> {
    // INV-G3 (S2-H-06/M-08): health is EXPLICITLY classified — a malformed
    // manifest/graph must never collapse to a healthy-looking
    // manifest_entries: 0. Every failing arm returns a typed failure whose
    // `status` names the arm; only graph+manifest both parsing (entries ≥ 1)
    // can report healthy.
    const g = this.loadGraph();
    if (!g.ok) {
      return g.code === 'graph_missing'
        ? { ...g, status: 'missing' }
        : g.code === 'binding_missing' || g.code === 'coherence_failed' || g.code === 'binding_tampered'
          ? { ...g, status: 'coherence_failed' }
          : { ...g, status: 'malformed' };
    }
    // Honest provider identity: probe once if we haven't; a failed probe is a
    // typed failure (unsupported ⇒ 'incompatible'), never fabricated as a
    // version on a healthy report.
    let version = this.probedVersion;
    if (version === undefined) {
      const p = await this.probe();
      if (!p.ok) {
        // S3-M-01: total classification — unsupported versions are
        // 'incompatible'; every other probe failure is 'probe_unavailable'
        // (a tool problem, not a verdict about graph state). Statusless
        // health failures are unrepresentable.
        const failure: HealthFailure = {
          ok: false,
          code: p.code,
          status: p.code === 'unsupported_version' ? 'incompatible' : 'probe_unavailable',
          message: `graph exists but the provider probe failed: ${p.message}`,
          hint: p.hint,
        };
        return failure;
      }
      version = p.providerVersion;
    }
    const manifestText = g.ok
      ? (() => {
          try {
            return this.readFileImpl(this.manifestPath);
          } catch {
            return undefined;
          }
        })()
      : undefined;
    // S3-M-01 + trust kernel (VERIFIER E-M-01 fix): manifest acceptance is
    // the KERNEL's strict parser — one implementation, no hand-rolled copy —
    // and the healthy report carries the manifest identity digest.
    const manifestId = parseGraphManifestStrict(manifestText);
    if (!manifestId.ok) {
      return {
        ok: false,
        code: manifestId.code === 'manifest_missing' ? 'graph_missing' : 'graph_invalid',
        status: manifestId.code === 'manifest_missing' ? 'missing' : 'malformed',
        message: manifestId.message,
      };
    }
    return graphHealthOf(g.graph, version, manifestId.identity.entries, manifestId.identity.digest);
  }

  private loadGraph(): { ok: true; graph: ParsedGraph; binding: StructuralBinding } | IntelFailure {
    // S4-H-04 (trust kernel closure): the raw parseGraphText call is GONE —
    // every load-bearing graph consumer now flows through the kernel's
    // coherent identity check (manifest + graph + LCO binding as ONE build).
    let graphText: string;
    try {
      graphText = this.readFileImpl(this.graphPath);
    } catch {
      return {
        ok: false,
        code: 'graph_missing',
        message: `no graphify graph at ${this.graphPath} — build it first (lco renew refresh)`,
      };
    }
    let manifestText: string | undefined;
    try {
      manifestText = this.readFileImpl(this.manifestPath);
    } catch {
      manifestText = undefined;
    }
    let bindingText: string | undefined;
    try {
      bindingText = this.readFileImpl(structuralBindingPath(this.workspaceRoot));
    } catch {
      bindingText = undefined;
    }
    let verified: { identity: import('../trust/structural').StructuralIdentity; graph: ParsedGraph };
    try {
      verified = requireStructuralGraph({
        manifestText,
        graphText,
        bindingText,
        ...(this.probedVersion !== undefined ? { expected: { graphifyVersion: this.probedVersion } } : {}),
        source: 'graph workspace',
      });
    } catch (e) {
      const err = e as { code?: string; message?: string };
      // Preserve the adapter's public vocabulary: manifest-gate failures are
      // graph_missing/graph_invalid; binding/coherence failures carry their
      // own S4-H-04 codes.
      const mapped =
        err.code === 'manifest_missing' ? 'graph_missing' : err.code === 'manifest_invalid' ? 'graph_invalid' : (err.code ?? 'graph_invalid');
      return { ok: false, code: mapped as never, message: err.message ?? String(e) } as IntelFailure;
    }
    // requireStructuralGraph already verified the binding; surface it for
    // consumers without re-parsing (single verification, no redundant arm).
    const bindingVerified = coerceStructuralBinding(bindingText);
    return bindingVerified.ok
      ? { ok: true, graph: verified.graph, binding: bindingVerified.binding }
      : ({ ok: false, code: bindingVerified.code as never, message: bindingVerified.message } as IntelFailure);
  }
}

function tail(s: string, max = 2_000): string {
  return s.length > max ? s.slice(s.length - max) : s;
}
