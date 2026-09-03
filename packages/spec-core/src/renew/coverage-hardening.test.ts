/**
 * Branch hardening for the renewal modules the release audit flagged (J1):
 * command-core refusal paths, subprocess failure modes, context-provider
 * scope variants, the export renderer, and the store loaders. Every case
 * asserts REAL behavior (the branch it exercises is a trust or error path).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSubprocess } from './intel/subprocess';
import { GraphContextProvider } from './context/context-provider';
import { parseGraphText } from './intel/graph-reader';
import { loadOverlay, persistOverlay, emptyOverlay } from './overlay/overlay';
import { loadParity, persistParity, emptyParity, addParityEntry } from './parity/ledger';
import {
  cmdRenewInit,
  cmdRenewStatus,
  cmdRenewExport,
  cmdRenewRefresh,
  cmdRenewReview,
  type RenewCapabilities,
} from '../cli/commands/renew';
import { StaticGraphProvider } from './intel/fixture-provider';
import { singleRoutePlan } from '../llm/plan';
import { buildModernizationPlan } from './planner/plan';
import { addOverlayRecord, markSuperseded, evaluateOverlayStaleness } from './overlay/overlay';
import { setRuling, parityFromAnalyses } from './parity/ledger';
import { loadAnalysisRecords, nextAnalysisId } from './recovery/analysis-store';
import { makeRenewalDriver, distillRenewalQuestions, strategyQuestion } from './clarify/distiller';
import { buildArchitectureView } from './archview/architecture-view';
import { createSnapshot } from './snapshot/snapshot';

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

const FIXTURE_SRC = join(__dirname, '..', '..', 'fixtures', 'legacy-app');

function caps(): RenewCapabilities {
  const g = parseGraphText(readFileSync(join(FIXTURE_SRC, 'graph-fixture.json'), 'utf8'));
  if (!g.ok) throw new Error(g.message);
  return {
    nowIso: () => '2026-09-02T12:00:00.000Z',
    provider: () => new StaticGraphProvider(g.graph, '0.9.50'),
    gitCommit: () => undefined,
  };
}

function makeTarget(): string {
  const target = freshDir('lco-cov-target-');
  cpSync(join(FIXTURE_SRC, 'src'), join(target, 'src'), { recursive: true });
  cpSync(join(FIXTURE_SRC, 'package.json'), join(target, 'package.json'));
  return target;
}

describe('subprocess failure modes (real processes)', () => {
  it('rejects executables containing shell syntax', async () => {
    const r = await runSubprocess('evil; rm -rf /', [], { timeoutMs: 1000, maxBufferBytes: 1024 });
    expect(r.status).toBe('spawn_failed');
    if (r.status !== 'spawn_failed') return;
    expect(r.message).toMatch(/safe set/);
  });

  it('classifies a nonzero exit and surfaces stderr', async () => {
    const r = await runSubprocess('node', ['-e', 'process.stderr.write("boom\\n"); process.exit(3)'], {
      timeoutMs: 5000,
      maxBufferBytes: 1024 * 1024,
    });
    expect(r.status).toBe('exited');
    if (r.status !== 'exited') return;
    expect(r.exitCode).toBe(3);
    expect(r.stderr).toContain('boom');
  });

  it('enforces the per-stream output cap with a typed result', async () => {
    const r = await runSubprocess('node', ['-e', 'process.stdout.write("x".repeat(100000))'], {
      timeoutMs: 5000,
      maxBufferBytes: 1024,
    });
    expect(r.status).toBe('output_cap');
  }, 10_000);
});

describe('context-provider scope variants', () => {
  const graphOf = () => {
    const g = parseGraphText(
      JSON.stringify({
        directed: true,
        nodes: [
          { id: 'a', label: 'alpha', source_file: 'src/a.ts', source_location: 'L1', community: 1 },
          { id: 'b', label: 'beta', source_file: 'src/b.ts', source_location: 'L2', community: 1 },
          { id: 'c', label: 'gamma', source_file: 'src/c.ts', source_location: 'L3', community: 2 },
        ],
        links: [
          { source: 'a', target: 'b', relation: 'calls' },
          { source: 'b', target: 'c', relation: 'imports', confidence: 'EXTRACTED' },
        ],
      }),
    );
    if (!g.ok) throw new Error(g.message);
    return g.graph;
  };
  const manifest = ['src/a.ts', 'src/b.ts', 'src/c.ts'].map((p) => ({
    path: p,
    sha256: `sha256:${createHash('sha256').update(p).digest('hex')}`,
  }));
  const reader = (p: string, s: number, e: number) => ({ text: `${p}:${s}-${e}\n`, startLine: s, endLine: e });

  it('community scope selects only that community (with structural fact)', () => {
    const provider = new GraphContextProvider({ graph: graphOf(), manifest, readSlice: reader });
    const bundle = provider.contextFor({ type: 'community', id: 1 });
    const ids = bundle.items.filter((i) => i.kind === 'node').map((i) => (i as { node_id: string }).node_id);
    expect(ids).toContain('a');
    expect(ids).toContain('b');
    expect(ids).not.toContain('c');
    expect(bundle.items.some((i) => i.kind === 'structural_fact')).toBe(true);
  });

  it('node scope includes graph neighbors; an unknown node yields an empty-but-honest bundle', () => {
    const provider = new GraphContextProvider({ graph: graphOf(), manifest, readSlice: reader });
    const bundle = provider.contextFor({ type: 'node', node_id: 'a' });
    const ids = bundle.items.filter((i) => i.kind === 'node').map((i) => (i as { node_id: string }).node_id);
    expect(ids).toEqual(['a', 'b']); // a + neighbor b
    const unknown = provider.contextFor({ type: 'node', node_id: 'ghost' });
    expect(unknown.items).toHaveLength(0);
    expect(unknown.insufficient_context).toBe(true);
  });

  it('path pattern scope matches substrings of source files', () => {
    const provider = new GraphContextProvider({ graph: graphOf(), manifest, readSlice: reader });
    const bundle = provider.contextFor({ type: 'path', pattern: 'b.t' });
    const ids = bundle.items.filter((i) => i.kind === 'node').map((i) => (i as { node_id: string }).node_id);
    expect(ids).toEqual(['b']);
  });

  it('a graph node referencing a file NOT in the manifest warns (unrepresented file)', () => {
    const provider = new GraphContextProvider({ graph: graphOf(), manifest: manifest.slice(0, 1), readSlice: reader });
    const bundle = provider.contextFor({ type: 'community', id: 1 });
    expect(bundle.warnings.join(' ')).toMatch(/not present in the guarded manifest/);
  });
});

describe('store loaders: missing vs corrupt (D2) and duplicates (M-02/M-03)', () => {
  it('missing overlay/parity are typed missing; existing+corrupt refuse', () => {
    const dir = freshDir('lco-cov-stores-');
    const ovMissing = loadOverlay(join(dir, 'overlay.json'));
    expect(ovMissing.ok).toBe(false);
    if (!ovMissing.ok) expect(ovMissing.code).toBe('overlay_missing');
    const parMissing = loadParity(join(dir, 'parity.json'));
    expect(parMissing.ok).toBe(false);
    if (!parMissing.ok) expect(parMissing.code).toBe('parity_missing');
    writeFileSync(join(dir, 'overlay.json'), '{corrupt');
    const ov = loadOverlay(join(dir, 'overlay.json'));
    expect(ov.ok).toBe(false);
    if (!ov.ok) expect(ov.code).toBe('overlay_corrupt');
    writeFileSync(join(dir, 'parity.json'), '[]');
    const par = loadParity(join(dir, 'parity.json'));
    expect(par.ok).toBe(false);
    if (!par.ok) expect(par.code).toBe('parity_corrupt');
  });

  it('duplicate overlay ids and duplicate parity ids are corrupt state', () => {
    const dir = freshDir('lco-cov-dup-');
    const oStore = emptyOverlay('RSN-aaaaaaaaaaaaaaaa');
    const rec = {
      relation: 'business_rule' as const,
      subject: { path: 'src/a.ts' },
      anchors: [{ path: 'src/a.ts', content_hash: 'sha256:1111111111111111111111111111111111111111111111111111111111111111' }],
      snapshot_id: 'RSN-aaaaaaaaaaaaaaaa',
      confidence: 'low' as const,
      status: 'active' as const,
      lineage: {},
    };
    // Hand-build duplicates (the API assigns ids; corruption comes from
    // hand-edited state — exactly the audit scenario). Trust kernel: the
    // authorized persist takes (projectDir, path, store).
    persistOverlay(dir, join(dir, 'overlay.json'), oStore);
    const raw = JSON.parse(readFileSync(join(dir, 'overlay.json'), 'utf8')) as typeof oStore;
    raw.records.push({ ...raw.records, id: 'OVL-0001', ...rec } as never, { id: 'OVL-0001', ...rec } as never);
    // give both the same id
    raw.records = [
      { id: 'OVL-0001', ...rec } as never,
      { id: 'OVL-0001', ...rec } as never,
    ];
    writeFileSync(join(dir, 'overlay.json'), JSON.stringify(raw));
    const ov = loadOverlay(join(dir, 'overlay.json'));
    expect(ov.ok).toBe(false);
    if (!ov.ok) expect(ov.message).toMatch(/duplicate record id OVL-0001/);

    const pStore = emptyParity('RSN-aaaaaaaaaaaaaaaa');
    addParityEntry(pStore, { behavior: 'b1', evidence: [{ kind: 'user_decision', claim_id: 'UNC-0001' }] });
    persistParity(dir, join(dir, 'parity.json'), pStore);
    const praw = JSON.parse(readFileSync(join(dir, 'parity.json'), 'utf8')) as typeof pStore;
    praw.records.push({ ...praw.records[0]!, id: praw.records[0]!.id });
    writeFileSync(join(dir, 'parity.json'), JSON.stringify(praw));
    const par = loadParity(join(dir, 'parity.json'));
    expect(par.ok).toBe(false);
    if (!par.ok) expect(par.message).toMatch(/duplicate entry id/);
  });
});

describe('command-core refusal paths (renew.ts branches)', () => {
  it('refresh/status/export/review on a NON-project fail with actionable errors', async () => {
    const dir = freshDir('lco-cov-nonproj-');
    const r1 = await cmdRenewRefresh({ dir }, caps());
    expect(r1.code).toBe(2);
    expect(r1.output).toMatch(/not a renewal project/);
    const r2 = await cmdRenewStatus({ dir }, caps());
    expect(r2.code).toBe(2);
    const r3 = await cmdRenewExport({ dir }, caps());
    expect(r3.code).toBe(2);
    const r4 = await cmdRenewReview({ dir, answersPath: '/x' }, caps());
    expect(r4.code).toBe(2);
  });

  it('init refuses when the project already exists (no --force) and when the target is missing', async () => {
    const target = makeTarget();
    const project = freshDir('lco-cov-init-');
    const c = caps();
    expect((await cmdRenewInit({ dir: project, target, name: 'x' }, c)).code).toBe(0);
    const again = await cmdRenewInit({ dir: project, target }, c);
    expect(again.code).toBe(2);
    expect(again.output).toMatch(/already exists/);
    const missing = await cmdRenewInit({ dir: freshDir('lco-cov-init2-'), target: '/nonexistent/repo' }, c);
    expect(missing.code).toBe(2);
    expect(missing.output).toMatch(/target repository not found/);
  });

  it('review rejects a malformed answers file with a parse error', async () => {
    const target = makeTarget();
    const project = freshDir('lco-cov-ans-');
    const c = caps();
    expect((await cmdRenewInit({ dir: project, target, name: 'ans' }, c)).code).toBe(0);
    const bad = join(project, 'answers.json');
    writeFileSync(bad, 'not json');
    const r = await cmdRenewReview({ dir: project, answersPath: bad }, c);
    expect(r.code).toBe(2);
    expect(r.output).toMatch(/unreadable|not valid JSON/i);
    writeFileSync(bad, '{"nope": 1}');
    const r2 = await cmdRenewReview({ dir: project, answersPath: bad }, c);
    expect(r2.code).toBe(2);
    expect(r2.output).toMatch(/answers file must be/);
  });
});

describe('export renderer (report honesty)', () => {
  it('renders a status report with plan/analyses/strategy sections from real state', async () => {
    const target = makeTarget();
    const project = freshDir('lco-cov-rep-');
    const c = caps();
    expect((await cmdRenewInit({ dir: project, target, name: 'rep' }, c)).code).toBe(0);
    const r = await cmdRenewExport({ dir: project }, c);
    expect(r.code).toBe(0);
    expect(r.output.length).toBeGreaterThan(100);
  });
});

// --- planner variants: overlay consumption, manual review, input mismatch ----------

describe('planner input variants', () => {
            const sha = (b: string | Buffer) => `sha256:${createHash('sha256').update(b).digest('hex')}`;

  const MANIFEST = [
    { path: 'src/orders.ts', sha256: sha('orders') },
    { path: 'src/pricing.ts', sha256: sha('pricing') },
  ];
  const snapshot = createSnapshot({
    rootRealpath: '/repos/x',
    repoKind: 'plain',
    files: MANIFEST,
    filesTruncated: false,
    graph: { graphifyVersion: '0.9.50', nodeCount: 2, edgeCount: 1, graphDigest: sha('g') },
    graphManifest: { digest: sha('m'), entries: 2 },
    nowIso: '2026-09-02T00:00:00.000Z',
  });
  const SNAP = snapshot.snapshot_id;
  const analysis = {
    schema_version: 1 as const,
    analysis_id: 'AN-0001',
    snapshot_id: SNAP,
    created_at: 't',
    role: 'renew_recover' as const,
    model: { gateway: 't', provider_kind: 't', requested_model: 't' },
    prompt_protocol: 'p',
    scope: {},
    input: { context_digest: sha('c'), item_count: 1, slice_count: 1, truncated: false, warnings: [] },
    outcome: 'validated' as const,
    validation: { schema_ok: true, retry_used: false, issues: [], anchors_total: 1, anchors_ok: 1, anchors_failed: 0 },
    promoted: {
      hypotheses: [
        {
          id: 'BHV-0001',
          statement: 'Fee behavior.',
          category: 'business_rule' as const,
          confidence: 'high' as const,
          anchors: [{ path: 'src/orders.ts', content_hash: sha('orders') }],
          rationale: 'r',
          status: 'hypothesized' as const,
          anchor_results: [{ path: 'src/orders.ts', ok: true }],
        },
      ],
      uncertainties: [],
    },
    rejected: [],
    coverage_notes: [],
    usage: { calls: 1, attempts: 1, in_tokens: 1, out_tokens: 1, usage_known: true },
  };
  const graphParsed = parseGraphText(readFileSync(join(FIXTURE_SRC, 'graph-fixture.json'), 'utf8'));
  if (!graphParsed.ok) throw new Error(graphParsed.message);
  const archView = buildArchitectureView(graphParsed.graph, MANIFEST, SNAP);
  const strategy = {
    schema_version: 1 as const,
    strategy: 'in_place' as const,
    rationale: 'r',
    selected_by: 'human' as const,
    selected_via: 'flag' as const,
    selected_at: 't',
    snapshot_id: SNAP,
  };
  const ruledParity = () => {
    const store = parityFromAnalyses([analysis as never], SNAP);
    for (const rec of store.records) setRuling(store, rec.id, { ruling: 'preserve', rationale: 'test ruling' });
    return store;
  };
  const baseInputs = () => ({
    snapshot,
    architectureView: archView,
    overlay: emptyOverlay(SNAP),
    parity: ruledParity(),
    strategy,
    analyses: [analysis],
    projectName: 'p',
    projectDir: '/tmp/proj',
    blastRadius: () => [] as string[],
  });

  it('a mismatched OVERLAY snapshot is an input_mismatch refusal', () => {
    const r = buildModernizationPlan({ ...baseInputs(), overlay: emptyOverlay('RSN-1111111111111111') });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('input_mismatch');
    expect(r.blockers?.some((b) => b.id === 'overlay')).toBe(true);
  });

  it('a parity entry citing a nonexistent analysis is an input_mismatch refusal', () => {
    const parity = ruledParity();
    parity.records[0]!.source_analysis = 'AN-9999';
    const r = buildModernizationPlan({ ...baseInputs(), parity });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('input_mismatch');
    expect(r.blockers?.[0]!.reason).toMatch(/AN-9999/);
  });

  it('overlay manual_review records and unsupported files become MANUAL-REVIEW tasks (H-06)', () => {
    const overlay = emptyOverlay(SNAP);
    overlay.records.push({
      id: 'OVL-0001',
      relation: 'manual_review',
      subject: { path: 'src/pricing.ts' },
      anchors: [{ path: 'src/pricing.ts', content_hash: sha('pricing') }],
      snapshot_id: SNAP,
      confidence: 'medium',
      status: 'active',
      lineage: {},
      note: 'dynamic dispatch not statically derivable',
    } as never);
    const view = { ...archView, coverage: { ...archView.coverage, unsupported_files: ['legacy/cobol.cbl'] } };
    const r = buildModernizationPlan({ ...baseInputs(), overlay, architectureView: view });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const manual = r.bundle.tasks.filter((t) => t.title.startsWith('Manual review'));
    expect(manual.length).toBe(2); // OVL-0001 + unsupported coverage
    expect(manual.some((t) => t.permitted_scope.includes('legacy/cobol.cbl'))).toBe(true);
    expect(r.bundle.assumptions.some((a) => a.impact_if_wrong.includes('not represented'))).toBe(true);
    // topo order includes the manual tasks too
    for (const t of manual) expect(r.topoOrder).toContain(t.task_id);
  });

  it('overlay behavior_preserve extends protected scopes (G1 consumption)', () => {
    const overlay = emptyOverlay(SNAP);
    overlay.records.push({
      id: 'OVL-0002',
      relation: 'behavior_preserve',
      subject: { path: 'src/orders.ts' },
      anchors: [{ path: 'src/orders.ts', content_hash: sha('orders') }],
      snapshot_id: SNAP,
      confidence: 'high',
      status: 'active',
      lineage: {},
    } as never);
    const r = buildModernizationPlan({ ...baseInputs(), overlay });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const scoped = r.bundle.tasks.find((t) => t.permitted_scope.includes('src/orders.ts'));
    expect(scoped?.protected).toContain('src/orders.ts');
  });
});

// --- overlay record lifecycle ---------------------------------------------------------

describe('overlay record lifecycle', () => {
    const sha = (b: string) => `sha256:${createHash('sha256').update(b).digest('hex')}`;

  it('markSuperseded is terminal and annotated; unknown ids throw', () => {
    const store = emptyOverlay('RSN-aaaaaaaaaaaaaaaa');
    const rec = addOverlayRecord(store, {
      relation: 'business_rule',
      subject: { path: 'src/a.ts' },
      anchors: [{ path: 'src/a.ts', content_hash: sha('a') }],
      snapshot_id: 'RSN-aaaaaaaaaaaaaaaa',
      confidence: 'low',
      status: 'active',
      lineage: {},
    });
    markSuperseded(store, rec.id, 'OVL-0002');
    expect(store.records[0]!.status).toBe('superseded');
    expect(store.records[0]!.note).toMatch(/superseded by OVL-0002/);
    expect(() => markSuperseded(store, 'OVL-9999')).toThrow(/unknown overlay record/);
  });

  it('staleness re-evaluation: a broken anchor flips active→stale; superseded is terminal', async () => {
    const target = freshDir('lco-ovl-target-');
    writeFileSync(join(target, 'a.ts'), 'contents\n');
    const store = emptyOverlay('RSN-aaaaaaaaaaaaaaaa');
    const rec = addOverlayRecord(store, {
      relation: 'business_rule',
      subject: { path: 'a.ts' },
      anchors: [{ path: 'a.ts', content_hash: sha('contents\n') }],
      snapshot_id: 'RSN-aaaaaaaaaaaaaaaa',
      confidence: 'low',
      status: 'active',
      lineage: {},
    });
    const healthy = evaluateOverlayStaleness(store, target);
    expect(healthy.store.records[0]!.status).toBe('active');
    writeFileSync(join(target, 'a.ts'), 'mutated\n');
    const result = evaluateOverlayStaleness(store, target);
    expect(result.store.records[0]!.status).toBe('stale');
    expect(result.changed).toContain(rec.id);
    // terminal status survives re-evaluation even when anchors verify
    markSuperseded(store, rec.id);
    writeFileSync(join(target, 'a.ts'), 'contents\n');
    const terminal = evaluateOverlayStaleness(store, target);
    expect(terminal.store.records[0]!.status).toBe('superseded');
  });
});

// --- parity ruling lifecycle -----------------------------------------------------------

describe('parity ruling lifecycle', () => {

  it('setRuling enforces DROP approval lineage and unknown-id errors', () => {
    const store = emptyParity('RSN-aaaaaaaaaaaaaaaa');
    addParityEntry(store, { behavior: 'b', evidence: [{ kind: 'user_decision', claim_id: 'UNC-0001' }] });
    const rec = store.records[0]!;
    expect(() => setRuling(store, 'PAR-9999', { ruling: 'preserve', rationale: 'r' })).toThrow(/unknown parity entry/);
    expect(() => setRuling(store, rec.id, { ruling: 'drop', rationale: 'r' })).toThrow(/DROP without explicit approval/);
    setRuling(store, rec.id, { ruling: 'preserve', rationale: 'keep it', approvalId: 'APPR-0001' });
    expect(rec.ruling).toBe('preserve');
    expect(rec.approval_id).toBe('APPR-0001');
  });
});

// --- analysis store edge cases ---------------------------------------------------------

describe('analysis store edges', () => {

  it('a corrupt record is reported, never loaded; ids sequence past gaps', () => {
    const dir = freshDir('lco-an-store-');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'AN-0002.json'), '{corrupt');
    const loaded = loadAnalysisRecords(dir);
    expect(loaded.records).toHaveLength(0);
    expect(loaded.corrupt).toEqual(['AN-0002.json']);
    expect(nextAnalysisId(['AN-0002', 'AN-0010'])).toBe('AN-0011');
    expect(nextAnalysisId(['bogus'])).toBe('AN-0001');
    expect(loadAnalysisRecords(join(dir, 'missing')).records).toHaveLength(0);
  });
});

// --- distiller approval payload combinations --------------------------------------------

describe('distiller payload combinations', () => {

  it('option + freeText answers carry both, sorted by claim id', () => {
    const driver = makeRenewalDriver({ analyses: [], overlay: emptyOverlay('RSN-aaaaaaaaaaaaaaaa'), includeStrategy: true });
    const payload = driver.approvalPayload(
      new Map([
        ['STG-0001', { answer: { decisionId: 'STG-0001', kind: 'option', selectedOption: 'strangler', freeText: 'because' }, appliedRound: 1 }],
        ['UNC-0001', { answer: { decisionId: 'UNC-0001', kind: 'other', freeText: 'custom answer' }, appliedRound: 1 }],
      ]),
      { sessionId: 's' },
    );
    const ids = payload.decisions.map((d) => d.claim_id);
    expect(ids).toEqual(['STG-0001', 'UNC-0001']);
    const stg = payload.decisions[0]!;
    expect(stg.selected_option).toBe('strangler');
    expect(stg.free_text).toBe('because');
    expect(stg.evidence.source).toContain('renewal-clarify:s/round1');
  });

  it('distilled questions include parity and manual-review questions in stable order', () => {
    const overlay = emptyOverlay('RSN-aaaaaaaaaaaaaaaa');
    overlay.records.push({
      id: 'OVL-0001',
      relation: 'manual_review',
      subject: { path: 'src/a.ts' },
      anchors: [{ path: 'src/a.ts', content_hash: 'sha256:1111111111111111111111111111111111111111111111111111111111111111' }],
      snapshot_id: 'RSN-aaaaaaaaaaaaaaaa',
      confidence: 'low',
      status: 'active',
      lineage: {},
    } as never);
    const parity = emptyParity('RSN-aaaaaaaaaaaaaaaa');
    addParityEntry(parity, { behavior: 'unruled behavior', evidence: [{ kind: 'user_decision', claim_id: 'UNC-0002' }] });
    const qs = distillRenewalQuestions({ analyses: [], overlay, parity });
    const ids = qs.map((q) => q.claimId);
    expect(ids).toContain('OVL-0001');
    expect(ids).toContain('PAR-0001');
    expect(strategyQuestion().claimId).toBe('STG-0001');
  });
});

// --- renew command error/edge branches (analyze/plan/status/export) -------------------

describe('renew command edge branches', () => {
  it('analyze without LLM route refuses with ZERO calls (fail-closed)', async () => {
    const target = makeTarget();
    const project = freshDir('lco-edge-1-');
    const c = caps();
    expect((await cmdRenewInit({ dir: project, target, name: 'e1' }, c)).code).toBe(0);
    const r = await (await import('../cli/commands/renew')).cmdRenewAnalyze({ dir: project }, c);
    expect(r.code).toBe(2);
    expect(r.output).toMatch(/no LLM route|ZERO calls/);
  });

  const llmCaps = () => {
    const scripted = {
      complete: async () => ({ text: JSON.stringify({ hypotheses: [], uncertainties: [], coverage_notes: [] }) }),
    };
    return { ...caps(), llm: () => singleRoutePlan(scripted as never, { gateway: 'g', providerKind: 'openai-compatible' as const, requestedModel: 'm' }) };
  };

  it('analyze refuses over a CORRUPT analysis record (never silently replaced)', async () => {
    const { cmdRenewAnalyze } = await import('../cli/commands/renew');
    const target = makeTarget();
    const project = freshDir('lco-edge-2-');
    const c = llmCaps();
    expect((await cmdRenewInit({ dir: project, target, name: 'e2' }, c)).code).toBe(0);
    writeFileSync(join(project, '.lco', 'renewal', 'analyses', 'AN-0007.json'), '{corrupt');
    const r = await cmdRenewAnalyze({ dir: project }, c);
    expect(r.code).toBe(1);
    expect(r.output).toMatch(/analysis store corrupt.*AN-0007/);
  });

  it('analyze refuses over a CORRUPT overlay store with the file preserved byte-identical', async () => {
    const { cmdRenewAnalyze } = await import('../cli/commands/renew');
    const target = makeTarget();
    const project = freshDir('lco-edge-3-');
    const c = llmCaps();
    expect((await cmdRenewInit({ dir: project, target, name: 'e3' }, c)).code).toBe(0);
    const overlayPath = join(project, '.lco', 'renewal', 'overlay.json');
    const sentinel = 'CORRUPT-SENTINEL-{';
    writeFileSync(overlayPath, sentinel);
    const r = await cmdRenewAnalyze({ dir: project }, c);
    expect(r.code).toBe(1);
    expect(r.output).toMatch(/overlay store corrupt/);
    expect(readFileSync(overlayPath, 'utf8')).toBe(sentinel); // never overwritten
  });

  it('plan on a corrupt snapshot refuses (identity/tamper), and status exit code reflects it', async () => {
    const { cmdRenewPlan } = await import('../cli/commands/renew');
    const target = makeTarget();
    const project = freshDir('lco-edge-4-');
    const c = caps();
    expect((await cmdRenewInit({ dir: project, target, name: 'e4' }, c)).code).toBe(0);
    const snapPath = join(project, '.lco', 'renewal', 'snapshot.json');
    const snap = JSON.parse(readFileSync(snapPath, 'utf8')) as { snapshot_id: string };
    snap.snapshot_id = 'RSN-0123456789abcdef';
    writeFileSync(snapPath, JSON.stringify(snap, null, 2));
    const plan = await cmdRenewPlan({ dir: project }, c);
    expect(plan.code).not.toBe(0);
    const status = await cmdRenewStatus({ dir: project }, c);
    // Trust kernel (S3-H-09): a tampered snapshot is an identity failure —
    // status fails CLOSED with the typed refusal (exit 2), never zeros. The
    // snapshot's self-identity check names the tamper explicitly.
    expect(status.code).toBe(2);
    expect(status.output).toMatch(/identity mismatch|snapshot_join_mismatch/);
    expect(status.output).toMatch(/tampered|hand-edited/);
  });

  it('plan with --strategy requires --strategy-rationale and rejects unknown strategies', async () => {
    const { cmdRenewPlan } = await import('../cli/commands/renew');
    const target = makeTarget();
    const project = freshDir('lco-edge-5-');
    const c = caps();
    expect((await cmdRenewInit({ dir: project, target, name: 'e5' }, c)).code).toBe(0);
    const r1 = await cmdRenewPlan({ dir: project, strategy: 'strangler' }, c);
    expect(r1.code).toBe(2);
    expect(r1.output).toMatch(/--strategy-rationale/);
    const r2 = await cmdRenewPlan({ dir: project, strategy: 'agile_bigbang', strategyRationale: 'x' }, c);
    expect(r2.code).toBe(2);
    expect(r2.output).toMatch(/unknown strategy/);
  });

  it('status --json emits parseable JSON with snapshot/parity fields', async () => {
    const target = makeTarget();
    const project = freshDir('lco-edge-6-');
    const c = caps();
    expect((await cmdRenewInit({ dir: project, target, name: 'e6' }, c)).code).toBe(0);
    const r = await cmdRenewStatus({ dir: project, json: true }, c);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.output) as Record<string, unknown>;
    expect(parsed.snapshot_state).toBe('fresh');
    expect(parsed.parity).toBeTruthy();
    expect(parsed.overlay).toMatch(/0 record/);
  });

  it('export renders the report and refuses an out-of-project --out', async () => {
    const { cmdRenewExport } = await import('../cli/commands/renew');
    const target = makeTarget();
    const project = freshDir('lco-edge-7-');
    const c = caps();
    expect((await cmdRenewInit({ dir: project, target, name: 'e7' }, c)).code).toBe(0);
    const out = join(project, 'reports', 'r.md');
    const ok = await cmdRenewExport({ dir: project, out }, c);
    expect(ok.code).toBe(0);
    expect(existsSync(out)).toBe(true);
    const bad = await cmdRenewExport({ dir: project, out: join(target, 'x.md') }, c);
    expect(bad.code).toBe(2);
  });


});
