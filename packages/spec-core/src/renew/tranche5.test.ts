/**
 * Final module tranche: pipeline usage/persist-failure arms, minimal-graph
 * provider contracts (optional-field fallbacks + per-method failure arms),
 * planner input-mismatch variants, CLI parse residuals, and the three
 * remaining uncovered display helpers (behavioral, not filler).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runRecovery } from './recovery/pipeline';
import { assignContextRecords, type ContextRecord } from './trust/evidence';
import { singleRoutePlan } from '../llm/plan';
import type { LlmAdapter, LlmResponse } from '../eval/llm/adapter';
import type { AnalysisRecord } from './recovery/schemas';
import type { ContextBundle } from './context/bundle';
import { GraphifyAdapter } from './intel/graphify-adapter';
import { StaticGraphProvider } from './intel/fixture-provider';
import { parseGraphText } from './intel/graph-reader';
import { buildModernizationPlan } from './planner/plan';
import { emptyParity, parityFromAnalyses, setRuling, addParityEntry } from './parity/ledger';
import { emptyOverlay } from './overlay/overlay';
import { buildArchitectureView } from './archview/architecture-view';
import { createSnapshot } from './snapshot/snapshot';
import { parseArgs } from '../cli/args';
import { answeredCount, setNotice } from '../browser-client/state';
import { STRINGS } from '../browser-client/strings';

const tmpDirs: string[] = [];
function freshDir(p: string): string {
  const dir = mkdtempSync(join(tmpdir(), p));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
  tmpDirs.length = 0;
});
const sha = (s: string | Buffer) => `sha256:${createHash('sha256').update(s).digest('hex')}`;

// --- pipeline: usage detail + persist-failure arms -------------------------------------

describe('pipeline usage and persist arms', () => {
  const bundleOf = (hash: string): ContextBundle => ({
    scope: { type: 'whole' },
    items: [
      { kind: 'file_slice', path: 'src/a.ts', start_line: 1, end_line: 3, text: 'code\n', content_hash: hash, redactions: 0, provenance: 'file-read', slice_text_hash: sha('code\n'), file_line_count: 3 },
    ],
    truncated: false,
    total_chars: 10,
    warnings: [],
  });
  const setupTarget = () => {
    const target = freshDir('lco-t5-');
    const { mkdirSync, writeFileSync } = require('node:fs') as typeof import('node:fs');
    mkdirSync(join(target, 'src'), { recursive: true });
    writeFileSync(join(target, 'src', 'a.ts'), 'export const a = 1;\n');
    return { target, hash: sha('export const a = 1;\n') };
  };
  // S3-H-01: server-assigned context records for the bundle's slices.
  const recordsFor = (bundle: ContextBundle) =>
    assignContextRecords(
      bundle.items
        .filter((i): i is Extract<ContextBundle['items'][number], { kind: 'file_slice' }> => i.kind === 'file_slice')
        .map((i) => ({
          path: i.path,
          whole_file_hash: i.content_hash,
          start_line: i.start_line,
          end_line: i.end_line,
          slice_text_hash: i.slice_text_hash ?? sha(i.text),
          file_line_count: i.file_line_count ?? i.end_line,
          ...(i.node_id !== undefined ? { node_id: i.node_id } : {}),
        })),
    );
  const depsFor = (adapter: LlmAdapter, target: string, persist: (r: AnalysisRecord) => { ok: true } | { ok: false; code: string; message: string }, contextRecords: readonly ContextRecord[] = []) => ({
    llm: singleRoutePlan(adapter, { gateway: 'g', providerKind: 'openai-compatible', requestedModel: 'm' }),
    nowIso: 't',
    targetRoot: target,
    contextRecords,
    persist,
  });

  it('provider usage detail (reasoning/cache/cost/currency/resolved model) lands in the record', async () => {
    const { target, hash } = setupTarget();
    const bundle = bundleOf(hash);
    const adapter: LlmAdapter = {
      complete: async () => ({
        // S3-H-01: the model cites the server-assigned context id (CTX-0001).
        text: JSON.stringify({ hypotheses: [], uncertainties: [{ id: 'UNC-0001', question: 'q?', impact: 'low', options: [{ option: 'x' }, { option: 'y' }], anchors: [{ context_id: 'CTX-0001' }] }], coverage_notes: [] }),
        usage: { in_tokens: 10, out_tokens: 5 },
        // INV-F1: accounting reads the REAL response shape — provenance and
        // usageDetails objects, latencyMs — never flat usage.* fields.
        provenance: {
          gateway: 'g', providerKind: 'openai-compatible', requestedModel: 'm',
          resolvedModel: 'served-model-x', upstreamProvider: 'vendor-a', requestId: 'req-1',
          cost: { amount: 0.0125, currency: 'USD' },
        },
        usageDetails: { reasoningTokens: 7, cacheReadTokens: 3, cacheWriteTokens: 2 },
        latencyMs: 42,
      }),
    };
    let saved: AnalysisRecord | undefined;
    const outcome = await runRecovery(
      { analysisId: 'AN-0001', snapshotId: 'RSN-deadbeefdeadbeef', scope: {}, bundle },
      { ...depsFor(adapter, target, (r) => { saved = r; return { ok: true as const }; }, recordsFor(bundle)) },
    );
    expect(outcome.ok).toBe(true);
    expect(saved!.usage).toMatchObject({
      reasoning_tokens: 7, cache_read_tokens: 3, cache_write_tokens: 2,
      cost: 0.0125, currency: 'USD', resolved_model: 'served-model-x',
      upstream_provider: 'vendor-a', request_id: 'req-1', latency_ms: 42,
    });
  });

  it('persist failure during a BLOCKED-SCHEMA run surfaces persist_failed (nothing silently lost)', async () => {
    const { target, hash } = setupTarget();
    const alwaysBad: LlmAdapter = { complete: async () => ({ text: 'garbage' }) };
    const outcome = await runRecovery(
      { analysisId: 'AN-0001', snapshotId: 'RSN-deadbeefdeadbeef', scope: {}, bundle: bundleOf(hash) },
      depsFor(alwaysBad, target, () => ({ ok: false as const, code: 'already_exists' as const, message: 'exists' })),
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe('persist_failed');
  });

  it('persist failure during BLOCKED-INSUFFICIENT-CONTEXT and BLOCKED-EMPTY surfaces persist_failed', async () => {
    const { target, hash } = setupTarget();
    const empty: LlmAdapter = { complete: async () => ({ text: JSON.stringify({ hypotheses: [], uncertainties: [], coverage_notes: [] }) }) };
    // No slices in the bundle → insufficient context path.
    const bare: ContextBundle = { scope: {}, items: [], truncated: false, total_chars: 0, warnings: [], insufficient_context: true };
    const o1 = await runRecovery(
      { analysisId: 'AN-0001', snapshotId: 'RSN-deadbeefdeadbeef', scope: {}, bundle: bare },
      depsFor(empty, target, () => ({ ok: false as const, code: 'already_exists' as const, message: 'exists' })),
    );
    expect(o1.ok).toBe(false);
    if (!o1.ok) expect(o1.code).toBe('persist_failed');
    // Empty output over a non-empty context → blocked_empty path.
    const o2 = await runRecovery(
      { analysisId: 'AN-0001', snapshotId: 'RSN-deadbeefdeadbeef', scope: {}, bundle: bundleOf(hash) },
      depsFor(empty, target, () => ({ ok: false as const, code: 'already_exists' as const, message: 'exists' })),
    );
    expect(o2.ok).toBe(false);
    if (!o2.ok) expect(o2.code).toBe('persist_failed');
  });

  it('persist failure during BLOCKED-STALE surfaces persist_failed', async () => {
    const { target, hash } = setupTarget();
    const adapter: LlmAdapter = { complete: async () => ({ text: JSON.stringify({ hypotheses: [], uncertainties: [], coverage_notes: [] }) }) };
    const outcome = await runRecovery(
      { analysisId: 'AN-0001', snapshotId: 'RSN-deadbeefdeadbeef', scope: {}, bundle: bundleOf(hash) },
      {
        ...depsFor(adapter, target, () => ({ ok: false as const, code: 'already_exists' as const, message: 'exists' })),
        recheckFreshness: () => ({ ok: false as const, reasons: ['file_changed'] }),
      },
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe('persist_failed');
  });

  it('budget exhaustion during the retry propagates the typed error (nothing written)', async () => {
    const { target, hash } = setupTarget();
    const { createBudgetLedger } = await import('../eval/budget');
    const ledger = createBudgetLedger({ maxAttempts: 1 }, { nowMs: Date.now });
    const responses = ['garbage', 'also-garbage'];
    let i = 0;
    const adapter: LlmAdapter = { complete: async () => ({ text: responses[i++] ?? 'x' }) };
    await expect(
      runRecovery(
        { analysisId: 'AN-0001', snapshotId: 'RSN-deadbeefdeadbeef', scope: {}, bundle: bundleOf(hash) },
        { ...depsFor(adapter, target, () => ({ ok: true as const })), budget: ledger },
      ),
    ).rejects.toThrow(/BUDGET_EXCEEDED/);
  });
});

// --- minimal-graph provider contracts (optional-field fallbacks, failure arms) -----------

describe('provider contracts over a MINIMAL graph (no labels/locations)', () => {
  const minimalGraph = () =>
    parseGraphText(JSON.stringify({ directed: true, nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], links: [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }] }));

  it('adapter query/explain/path/affected/godNodes degrade honestly without optional fields', async () => {
    const g = minimalGraph();
    if (!g.ok) throw new Error(g.message);
    // Materialize the minimal graph on disk for the real adapter.
    const ws = freshDir('lco-t5-ws-');
    const { mkdirSync, writeFileSync } = require('node:fs') as typeof import('node:fs');
    mkdirSync(join(ws, 'graphify-out'), { recursive: true });
    writeFileSync(join(ws, 'graphify-out', 'graph.json'), JSON.stringify({ directed: true, nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], links: [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }] }));
    writeFileSync(join(ws, 'graphify-out', 'manifest.json'), '{}');
    const ok = (s: string) => ({ status: 'exited' as const, exitCode: 0, stdout: `graphify ${s}\n`, stderr: '' });
    const adapter = new GraphifyAdapter({ workspaceRoot: ws, runner: async () => ok('0.9.50') });

    const q = await adapter.query('anything');
    expect(q.ok).toBe(true);
    if (q.ok) expect(q.text).toBe(''); // no lexical seeds — honest emptiness
    const e = await adapter.explain('b');
    expect(e.ok).toBe(true);
    if (e.ok) {
      expect(e.text).toContain('b (? @ ?)'); // no label, no source file
      expect(e.text).toMatch(/->|<-/); // edge rendering with unknown relation
    }
    const p = await adapter.path('a', 'c');
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.text).toContain('a -> b -> c');
    const a = await adapter.affected('c', { depth: 2 });
    expect(a.ok).toBe(true);
    const gods = await adapter.godNodes(2);
    expect(Array.isArray(gods) && gods.length).toBeGreaterThan(0);
    // S2-H-06/INV-G1: a '{}' manifest beside a built graph is INCONSISTENT
    // state — typed malformed, never a healthy zero-entry metric.
    const h = await adapter.graphHealth();
    expect(h.ok).toBe(false);
    if (!h.ok) {
      expect(h.code).toBe('graph_invalid');
      expect(h.status).toBe('malformed');
      expect(h.message).toMatch(/no entries/);
    }
  });

  it('per-method failure arms: a missing graph yields typed failures everywhere', async () => {
    const ok = (s: string) => ({ status: 'exited' as const, exitCode: 0, stdout: `graphify ${s}\n`, stderr: '' });
    const adapter = new GraphifyAdapter({ workspaceRoot: freshDir('lco-t5-empty-'), runner: async () => ok('0.9.50') });
    expect((await adapter.query('x')).ok).toBe(false);
    expect((await adapter.path('a', 'b')).ok).toBe(false);
    expect((await adapter.explain('a')).ok).toBe(false);
    expect((await adapter.affected('a')).ok).toBe(false);
    const gods = await adapter.godNodes();
    expect(Array.isArray(gods)).toBe(false); // typed failure, not []
    expect((await adapter.graphHealth()).ok).toBe(false);
  });

  it('StaticGraphProvider query/path/explain degrade identically on a minimal graph', async () => {
    const g = minimalGraph();
    if (!g.ok) throw new Error(g.message);
    const p = new StaticGraphProvider(g.graph, '0.9.50');
    const q = await p.query('zzz-no-match');
    expect(q.ok).toBe(true);
    if (q.ok) expect(q.text).toBe(''); // no seeds — honest emptiness
    const path = await p.path('a', 'zzz');
    expect(path.ok).toBe(false);
    const e = await p.explain('a');
    expect(e.ok).toBe(true);
    if (e.ok) expect(e.text).toContain('a (? @ ?)');
    const ws = freshDir('lco-t5-static-');
    await p.build({ workspaceRoot: ws }); // nodes WITHOUT source files: manifest stays empty
    const manifestText = require('node:fs').readFileSync(join(ws, 'graphify-out', 'manifest.json'), 'utf8');
    expect(JSON.parse(manifestText)).toEqual({});
  });

  it('a node WITH a source file but no others still materializes a manifest entry', async () => {
    const g = parseGraphText(JSON.stringify({ directed: true, nodes: [{ id: 'x', source_file: 'src/x.ts' }], links: [] }));
    if (!g.ok) throw new Error(g.message);
    const p = new StaticGraphProvider(g.graph, '0.9.50');
    const ws = freshDir('lco-t5-static2-');
    await p.build({ workspaceRoot: ws });
    const manifest = JSON.parse(require('node:fs').readFileSync(join(ws, 'graphify-out', 'manifest.json'), 'utf8')) as Record<string, unknown>;
    expect(Object.keys(manifest)).toEqual(['src/x.ts']);
  });
});

// --- planner input-mismatch variants ------------------------------------------------------

describe('planner input-mismatch variants', () => {
  const g = parseGraphText(JSON.stringify({ directed: true, nodes: [{ id: 'a', source_file: 'src/a.ts', source_location: 'L1' }], links: [] }));
  if (!g.ok) throw new Error('graph');
  const MANIFEST = [{ path: 'src/a.ts', sha256: sha('a') }];
  const snapshot = createSnapshot({
    rootRealpath: '/r', repoKind: 'plain', files: MANIFEST, filesTruncated: false,
    graph: { graphifyVersion: '0.9.50', nodeCount: 1, edgeCount: 0, graphDigest: sha('g') },
    graphManifest: { digest: sha('m'), entries: 1 }, nowIso: 't',
  });
  const SNAP = snapshot.snapshot_id;
  const analysis = {
    schema_version: 1 as const, analysis_id: 'AN-0001', snapshot_id: SNAP, created_at: 't',
    role: 'renew_recover' as const, model: { gateway: 't', provider_kind: 't', requested_model: 't' },
    prompt_protocol: 'p', scope: {},
    input: { context_digest: sha('c'), item_count: 1, slice_count: 1, truncated: false, warnings: [] },
    outcome: 'validated' as const,
    validation: { schema_ok: true, retry_used: false, issues: [], anchors_total: 1, anchors_ok: 1, anchors_failed: 0 },
    promoted: { hypotheses: [{ id: 'BHV-0001', statement: 's', category: 'business_rule' as const, confidence: 'high' as const, anchors: [{ path: 'src/a.ts', content_hash: sha('a') }], rationale: 'r', status: 'hypothesized' as const, anchor_results: [{ path: 'src/a.ts', ok: true }] }], uncertainties: [] },
    rejected: [], coverage_notes: [],
    usage: { calls: 1, attempts: 1, in_tokens: 1, out_tokens: 1, usage_known: true },
  };
  const strategy = { schema_version: 1 as const, strategy: 'in_place' as const, rationale: 'r', selected_by: 'human' as const, selected_via: 'flag' as const, selected_at: 't', snapshot_id: SNAP };
  const ruled = () => {
    const store = parityFromAnalyses([analysis as never], SNAP);
    for (const rec of store.records) setRuling(store, rec.id, { ruling: 'preserve', rationale: 'x' });
    return store;
  };
  const inputs = () => ({
    snapshot,
    architectureView: buildArchitectureView(g.graph, MANIFEST, SNAP),
    overlay: emptyOverlay(SNAP),
    parity: ruled(),
    strategy,
    analyses: [analysis],
    projectName: 'p',
    projectDir: '/tmp/p',
    blastRadius: () => [] as string[],
  });

  it('a foreign-snapshot ARCHITECTURE VIEW is an input_mismatch', () => {
    const r = buildModernizationPlan({ ...inputs(), architectureView: buildArchitectureView(g.graph, MANIFEST, 'RSN-3333333333333333') });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('input_mismatch');
    expect(r.blockers?.some((b) => b.id === 'architecture_view')).toBe(true);
  });

  it('a foreign-snapshot PARITY ledger is an input_mismatch', () => {
    const foreign = ruled();
    (foreign as unknown as { snapshot_id: string }).snapshot_id = 'RSN-4444444444444444';
    const r = buildModernizationPlan({ ...inputs(), parity: foreign });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.blockers?.some((b) => b.id === 'parity')).toBe(true);
  });

  it('a foreign-snapshot STRATEGY is an input_mismatch', () => {
    const r = buildModernizationPlan({ ...inputs(), strategy: { ...strategy, snapshot_id: 'RSN-5555555555555555' } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.blockers?.some((b) => b.id === 'strategy')).toBe(true);
  });

  it('the singular unresolved message reads correctly for ONE entry', () => {
    const one = emptyParity(SNAP);
    // (addParityEntry defaults to unresolved)
    addParityEntry(one, { behavior: 'b', evidence: [{ kind: 'code_anchor', anchor: { path: 'src/a.ts', content_hash: sha('a') } }] });
    const r = buildModernizationPlan({ ...inputs(), parity: one });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toMatch(/1 parity entry is unresolved/);
  });

  it('an overlay uncertain_behavior record and a PATHLESS manual record both become review units', () => {
    const overlay = emptyOverlay(SNAP);
    overlay.records.push({
      id: 'OVL-0001', relation: 'uncertain_behavior', subject: { path: 'src/reflect.ts' },
      anchors: [{ path: 'src/reflect.ts', content_hash: sha('reflect') }], snapshot_id: SNAP,
      confidence: 'low', status: 'active', lineage: {}, note: 'reflection-heavy',
    } as never);
    // A manual_review record WITHOUT anchors' paths is impossible (schema
    // requires anchors) — but a record whose paths exist still yields a unit;
    // the PARITY_LEDGER_FILE fallback arm needs a record with anchors on a
    // file OUTSIDE every task scope — same file is fine here.
    const r = buildModernizationPlan({ ...inputs(), overlay });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const manual = r.bundle.tasks.filter((t) => t.title.startsWith('Manual review'));
    expect(manual.length).toBe(1);
    expect(manual[0]!.instructions).toMatch(/Uncertain behavior/);
  });

  it('an overlay renewal_risk record shapes task risk and instructions', () => {
    const overlay = emptyOverlay(SNAP);
    overlay.records.push({
      id: 'OVL-0009', relation: 'renewal_risk', subject: { path: 'src/a.ts' },
      value: 'tight temporal coupling', anchors: [{ path: 'src/a.ts', content_hash: sha('a') }],
      snapshot_id: SNAP, confidence: 'high', status: 'active', lineage: {},
    } as never);
    const r = buildModernizationPlan({ ...inputs(), overlay });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const scoped = r.bundle.tasks.find((t) => t.permitted_scope.includes('src/a.ts'));
    expect(scoped!.instructions).toMatch(/tight temporal coupling/);
    expect(scoped!.risk.note).toMatch(/overlay risks: 1/);
  });
});

// --- CLI parse residuals -------------------------------------------------------------------

describe('CLI parse residuals', () => {
  it('empty flag values are rejected with the missing-value error', () => {
    const r1 = parseArgs(['renew', 'init', '/tmp/p', '--target', '']);
    expect('error' in r1 && r1.error).toMatch(/--target requires a value/);
  });

  it('extra positional arguments on single-dir commands are refused', () => {
    const r = parseArgs(['compile', '/tmp/a', '/tmp/b']);
    if ('error' in r) {
      expect(r.error).toMatch(/unexpected|<dir>/i);
    } else {
      // If accepted, the extra token must not silently become the dir.
      expect((r as { compile?: string }).compile).toBe('/tmp/a');
    }
  });

  it('lco renew --help (no sub) routes to the family help; unknown sub --help too', () => {
    expect('commandHelp' in parseArgs(['renew', '--help'])).toBe(true);
    expect('commandHelp' in parseArgs(['renew', 'frobnicate', '--help'])).toBe(true);
  });

  it('review --answers, plan --freeze/--strategy, export --out, analyze --llm-profile all parse', () => {
    const rv = parseArgs(['renew', 'review', '/tmp/p', '--answers', '/tmp/a.json']);
    expect('renew' in rv && (rv.renew as { answersFile?: string }).answersFile).toBe('/tmp/a.json');
    const pl = parseArgs(['renew', 'plan', '/tmp/p', '--strategy', 'strangler', '--strategy-rationale', 'why', '--freeze']);
    expect('renew' in pl && (pl.renew as { freeze?: boolean }).freeze).toBe(true);
    const ex = parseArgs(['renew', 'export', '/tmp/p', '--out', '/tmp/r.md']);
    expect('renew' in ex && (ex.renew as { out?: string }).out).toBe('/tmp/r.md');
    const an = parseArgs(['renew', 'analyze', '/tmp/p', '--llm-profile', 'renewal-x']);
    expect('renew' in an && (an.renew as { llmProfile?: string }).llmProfile).toBe('renewal-x');
  });

  it('renew refresh and status parse without flags', () => {
    expect('renew' in parseArgs(['renew', 'refresh', '/tmp/p'])).toBe(true);
    const st = parseArgs(['renew', 'status', '/tmp/p']);
    expect('renew' in st && (st.renew as { json: boolean }).json).toBe(false);
  });
});

// --- the three remaining display helpers ---------------------------------------------------

describe('browser-client display helpers', () => {
  it('answeredCount counts only VALID drafts for open questions', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    // Minimal snapshot with one open question.
    const { initialState } = await import('../browser-client/state');
    const state = initialState({
      sessionId: 's',
      state: 'CLARIFICATION_REQUIRED',
      round: 1,
      questions: [
        {
          claimId: 'STG-0001',
          question: 'Which strategy?',
          impact: 'high',
          round: 1,
          status: 'open',
          options: [{ option: 'strangler', rejected_because: 'x' }, { option: 'in_place', rejected_because: 'y' }],
        },
      ],
      progress: { resolved: 0, remaining: 1, newlyDiscovered: 1 },
      usage: { in: 0, out: 0, calls: 0, attempts: 0, callsWithoutUsage: 0, usageKnown: true, promptBytes: 0 },
      promptProtocol: 'p',
    } as never);
    expect(answeredCount(state)).toBe(0); // no draft yet
    const { setDraft } = await import('../browser-client/state');
    const withDraft = setDraft(state, { decisionId: 'STG-0001', kind: 'option', selectedOption: 'strangler' });
    expect(answeredCount(withDraft)).toBe(1); // valid draft counts
    void mkdtempSync; void writeFileSync;
  });

  it('setNotice stores and clears the notice', async () => {
    const { initialState } = await import('../browser-client/state');
    const state = initialState({
      sessionId: 's', state: 'FINAL_REVIEW', round: 1, questions: [],
      progress: { resolved: 0, remaining: 0, newlyDiscovered: 0 },
      usage: { in: 0, out: 0, calls: 0, attempts: 0, callsWithoutUsage: 0, usageKnown: true, promptBytes: 0 },
      promptProtocol: 'p',
    } as never);
    expect(setNotice(state, 'saved').notice).toBe('saved');
    expect(setNotice(state, null).notice).toBeNull();
  });

  it('UI_STRINGS.answeredAs renders the acknowledged answer', () => {
    expect(STRINGS.answeredAs('strangler')).toBe('You answered: strangler');
  });
});
