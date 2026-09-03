/**
 * Branch tranche 4: architecture-view variants, the export renderer states,
 * ingest caps, project binding errors, strategy/analysis-store edges.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildArchitectureView } from './archview/architecture-view';
import { parseGraphText } from './intel/graph-reader';
import { renderRenewalReport } from './project/export';
import { renewalPaths } from './project/project';
import { loadActiveState } from './trust/state';
import { buildGuardedCopy } from './ingest/workspace-copy';
import { persistStrategy, buildStrategyDecision, parseStrategyDecision } from './planner/strategy';
import { loadAnalysisRecords, persistAnalysisRecord } from './recovery/analysis-store';
import type { AnalysisRecord } from './recovery/schemas';
import { buildModernizationPlan } from './planner/plan';
import { createSnapshot } from './snapshot/snapshot';
import { emptyOverlay } from './overlay/overlay';
import { emptyParity, parityFromAnalyses, setRuling } from './parity/ledger';
const tmpDirs: string[] = [];
function freshDir(p: string): string {
  const dir = mkdtempSync(join(tmpdir(), p));
  tmpDirs.push(dir);
  return dir;
}

/** Test-local raw fixture reader (production reads route through the kernel). */
const loadStrategyFile = (path: string) =>
  existsSync(path)
    ? parseStrategyDecision(readFileSync(path, 'utf8'))
    : ({ ok: false as const, code: 'strategy_missing' as const, message: `no strategy at ${path}` });
afterEach(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
  tmpDirs.length = 0;
});
const sha = (s: string | Buffer) => `sha256:${createHash('sha256').update(s).digest('hex')}`;
const graphOf = (extra: Record<string, unknown> = {}) =>
  parseGraphText(
    JSON.stringify({
      directed: true,
      nodes: [
        { id: 'a', label: 'alpha', source_file: 'src/a.ts', source_location: 'L1', community: 1, community_name: 'core' },
        { id: 'b', label: 'beta', source_file: 'src/gen/generated.ts', source_location: 'L2', community: 2 },
        { id: 'c', label: 'gamma', source_file: 'src/vendor/lib.ts', source_location: 'L3', community: 2 },
        { id: 'plain.ts', label: 'plain.ts', source_file: 'plain.ts' },
        ...((extra.nodes as unknown[]) ?? []),
      ],
      links: [
        { source: 'a', target: 'b', relation: 'calls', confidence: 'EXTRACTED' },
        { source: 'b', target: 'c', relation: 'imports', confidence: 'INFERRED' },
        { source: 'a', target: 'c' },
        ...((extra.links as unknown[]) ?? []),
      ],
    }),
  );
describe('architecture view variants', () => {
  it('communities, cross-community edges, language coverage, and generated/vendor warnings', () => {
    const g = graphOf();
    if (!g.ok) throw new Error(g.message);
    const manifest = ['src/a.ts', 'src/gen/generated.ts', 'src/vendor/lib.ts', 'plain.ts'].map((p) => ({ path: p, sha256: sha(p) }));
    const view = buildArchitectureView(g.graph, manifest, 'RSN-aaaaaaaaaaaaaaaa');
    expect(view.communities.length).toBe(2);
    expect(view.cross_community_edges.length).toBeGreaterThan(0);
    expect(view.language_coverage.some((l) => l.language === 'ts')).toBe(true);
    // deterministic disclosures: no-community nodes and any generated-dir
    // exclusions appear as warnings (never silently dropped)
    expect(view.warnings.length).toBeGreaterThan(0);
    // coverage is honest about unrepresented files
    const view2 = buildArchitectureView(g.graph, [...manifest, { path: 'legacy/x.cbl', sha256: sha('cbl') }], 'RSN-aaaaaaaaaaaaaaaa');
    expect(view2.coverage.unsupported_files).toContain('legacy/x.cbl');
  });
  it('is deterministic for identical inputs', () => {
    const g = graphOf();
    if (!g.ok) throw new Error(g.message);
    const manifest = [{ path: 'src/a.ts', sha256: sha('a') }];
    const v1 = buildArchitectureView(g.graph, manifest, 'RSN-aaaaaaaaaaaaaaaa');
    const v2 = buildArchitectureView(g.graph, manifest, 'RSN-aaaaaaaaaaaaaaaa');
    expect(JSON.stringify(v1)).toBe(JSON.stringify(v2));
  });
});
describe('export renderer states', () => {
  it('renders analyses/overlay/parity/strategy sections from a rich state', () => {
    const dir = freshDir('lco-rep-');
    // Trust kernel: the renderer consumes the TYPED active view
    // (trust/state.loadActiveState) — the fixture's project/snapshot identity
    // must actually join (real target dir + deterministic snapshot), and the
    // analysis record must bind to the ACTIVE snapshot to render as current.
    const target = realpathSync(freshDir('lco-rep-target-'));
    writeFileSync(join(target, 'a.ts'), 'a\n');
    const snap = createSnapshot({
      rootRealpath: target, repoKind: 'plain',
      files: [{ path: 'a.ts', sha256: sha('a\n') }], filesTruncated: false,
      graph: { graphifyVersion: '0.9.50', nodeCount: 2, edgeCount: 1, graphDigest: sha('g') },
      graphManifest: { digest: sha('m'), entries: 1 }, nowIso: 't',
    });
    const paths = renewalPaths(dir);
    mkdirSync(join(dir, '.lco', 'renewal', 'analyses'), { recursive: true });
    mkdirSync(paths.approvals, { recursive: true });
    writeFileSync(paths.snapshot, JSON.stringify(snap, null, 2));
    writeFileSync(
      paths.projectJson,
      JSON.stringify({ schema_version: 1, name: 'rep', target_path: target, created_at: 't', snapshot_id: snap.snapshot_id }),
    );
    const analysis: AnalysisRecord = {
      schema_version: 1,
      analysis_id: 'AN-0001',
      snapshot_id: snap.snapshot_id,
      created_at: 't',
      role: 'renew_recover',
      model: { gateway: 'g', provider_kind: 'p', requested_model: 'm' },
      prompt_protocol: 'proto',
      scope: {},
      input: { context_digest: sha('c'), item_count: 1, slice_count: 1, truncated: false, warnings: [] },
      outcome: 'validated',
      validation: { schema_ok: true, retry_used: false, issues: [], anchors_total: 1, anchors_ok: 1, anchors_failed: 0 },
      promoted: {
        hypotheses: [{ id: 'BHV-0001', statement: 's', category: 'business_rule', confidence: 'high', anchors: [{ path: 'a.ts', content_hash: sha('a') }], rationale: 'r', status: 'hypothesized', anchor_results: [{ path: 'a.ts', ok: true, scope: 'whole_file' as const }], support_status: 'unvalidated' as const }],
        uncertainties: [],
      },
      rejected: [{ id: 'BHV-0002', kind: 'hypothesis', reasons: ['anchor a.ts: hash_mismatch'] }],
      coverage_notes: ['note'],
      usage: { calls: 1, attempts: 1, in_tokens: 10, out_tokens: 5, usage_known: true },
    };
    persistAnalysisRecord(dir, paths.analyses, analysis);
    const g = graphOf();
    if (!g.ok) throw new Error(g.message);
    const manifest = [{ path: 'src/a.ts', sha256: sha('a') }];
    const view = buildArchitectureView(g.graph, manifest, snap.snapshot_id);
    const state = loadActiveState(dir);
    const report = renderRenewalReport(state, view);
    expect(report).toMatch(/AN-0001/);
    expect(report).toMatch(/1 hypothesis|BHV/);
    expect(report).toMatch(/business_rule|business behavior/i);
    // S2-H-10/INV-C: current section is honest about machine validation.
    expect(report).toMatch(/provenance-verified — semantic support NOT machine-validated/);
    expect(report).toContain('rep');
    // And WITHOUT the view (graph unavailable): still renders.
    const bare = renderRenewalReport(loadActiveState(dir), undefined);
    expect(bare.length).toBeGreaterThan(50);
  });
});
describe('ingest caps and exclusions', () => {
  it('oversize files are excluded from the manifest but counted', () => {
    const target = freshDir('lco-ing-');
    writeFileSync(join(target, 'small.ts'), 'x\n');
    writeFileSync(join(target, 'big.ts'), 'y'.repeat(3 * 1024 * 1024));
    const r = buildGuardedCopy(target, freshDir('lco-ing-copy-'), { copy: false, limits: { maxFiles: 100, maxFileBytes: 1024, maxTotalBytes: 10 * 1024 * 1024 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.manifest.map((f) => f.path)).toEqual(['small.ts']);
    expect(r.excluded.oversize).toContain('big.ts');
  });
  it('the corpus file cap blocks with sizing guidance', () => {
    const target = freshDir('lco-ing2-');
    for (let i = 0; i < 5; i++) writeFileSync(join(target, `f${i}.ts`), 'x\n');
    const r = buildGuardedCopy(target, freshDir('lco-ing2-copy-'), { copy: false, limits: { maxFiles: 2, maxFileBytes: 1024, maxTotalBytes: 1024 * 1024 } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('corpus_too_large');
    expect(r.message).toMatch(/Narrow the target/);
  });
  it('symlinks are excluded (never followed) and non-files skipped', () => {
    const target = freshDir('lco-ing3-');
    writeFileSync(join(target, 'real.ts'), 'x\n');
    symlinkSync('real.ts', join(target, 'alias.ts'));
    // Trust kernel: copy mode REQUIRES projectDir (trusted writes only).
    const dest = freshDir('lco-ing3-copy-');
    const r = buildGuardedCopy(target, dest, { copy: true, projectDir: dest, limits: { maxFiles: 100, maxFileBytes: 1024 * 1024, maxTotalBytes: 1024 * 1024 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.excluded.symlink).toContain('alias.ts');
    expect(r.manifest.map((f) => f.path)).toEqual(['real.ts']);
  });
  it('a missing target fails closed', () => {
    const r = buildGuardedCopy('/nonexistent/target', freshDir('lco-ing4-'), { copy: false });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('target_missing');
  });
});
describe('project state binding errors', () => {
  it('supersession archives only EXISTING stores and refuses a same-snapshot re-archive (S3-M-05)', async () => {
    const dir = freshDir('lco-sup-');
    const paths = renewalPaths(dir);
    mkdirSync(join(dir, '.lco', 'renewal'), { recursive: true });
    writeFileSync(paths.overlay, JSON.stringify({ schema_version: 1, snapshot_id: 'RSN-old', records: [] }));
    // parity + strategy + spec deliberately absent. S4-H-01: supersession is
    // a journaled mutation (archive entries); the kernel performs the renames.
    const { runJournaledRenewalMutation, refreshArchiveEntries } = await import('./trust/state');
    await runJournaledRenewalMutation({
      projectDir: dir,
      nowIso: '2026-09-03T00:00:00Z',
      mutation: { archive: refreshArchiveEntries(paths, 'RSN-old') },
    });
    expect(existsSync(`${paths.overlay}.RSN-old.superseded`)).toBe(true);
    expect(existsSync(paths.overlay)).toBe(false);
    // Trust kernel (S3-M-05): archives are NO-CLOBBER — re-creating the store
    // and re-archiving under the SAME snapshot id refuses instead of
    // overwriting earlier history.
    writeFileSync(paths.overlay, JSON.stringify({ schema_version: 1, snapshot_id: 'RSN-old', records: [] }));
    await expect(
      runJournaledRenewalMutation({
        projectDir: dir,
        nowIso: '2026-09-03T00:00:00Z',
        mutation: { archive: refreshArchiveEntries(paths, 'RSN-old') },
      }),
    ).rejects.toThrow(/already exists|archive_collision|commit_failed_without_state_change/);
    expect(existsSync(`${paths.overlay}.RSN-old.superseded`)).toBe(true); // prior archive intact
  });
  it('S3-H-04: a surviving spec/ directory is archived WITH the stores on refresh', async () => {
    const dir = freshDir('lco-sup-spec-');
    const paths = renewalPaths(dir);
    mkdirSync(join(dir, '.lco', 'renewal'), { recursive: true });
    mkdirSync(paths.specDir, { recursive: true });
    writeFileSync(paths.overlay, JSON.stringify({ schema_version: 1, snapshot_id: 'RSN-old', records: [] }));
    const { runJournaledRenewalMutation, refreshArchiveEntries } = await import('./trust/state');
    const archive = refreshArchiveEntries(paths, 'RSN-old');
    expect(archive).toHaveLength(2); // overlay AND spec
    expect(archive.some((a) => /spec\.RSN-old\.superseded/.test(a.to))).toBe(true);
    await runJournaledRenewalMutation({
      projectDir: dir,
      nowIso: '2026-09-03T00:00:00Z',
      mutation: { archive },
    });
    expect(existsSync(`${paths.specDir}.RSN-old.superseded`)).toBe(true);
    expect(existsSync(paths.specDir)).toBe(false); // no stale pre-refresh spec survives
  });
  it('loadActiveState types store failures as VALUES; identity failures throw', () => {
    const dir = freshDir('lco-state-');
    // A joined identity (real target + snapshot) so the run reaches the store
    // layer — the typed active view is the ONLY trusted reader now.
    const target = realpathSync(freshDir('lco-state-target-'));
    writeFileSync(join(target, 'a.ts'), 'a\n');
    const snap = createSnapshot({
      rootRealpath: target, repoKind: 'plain',
      files: [{ path: 'a.ts', sha256: sha('a\n') }], filesTruncated: false,
      graph: { graphifyVersion: '0.9.50', nodeCount: 1, edgeCount: 0, graphDigest: sha('g') },
      graphManifest: { digest: sha('m'), entries: 1 }, nowIso: 't',
    });
    const paths = renewalPaths(dir);
    mkdirSync(join(dir, '.lco', 'renewal', 'analyses'), { recursive: true });
    mkdirSync(paths.approvals, { recursive: true });
    writeFileSync(paths.snapshot, JSON.stringify(snap, null, 2));
    writeFileSync(
      paths.projectJson,
      JSON.stringify({ schema_version: 1, name: 's', target_path: target, created_at: 't', snapshot_id: snap.snapshot_id }),
    );
    writeFileSync(paths.overlay, '{corrupt');
    const state = loadActiveState(dir);
    // Corrupt store: a TYPED value (S3-H-09) — never zeros, never a throw.
    expect(state.overlay.ok).toBe(false);
    if (!state.overlay.ok) expect(state.overlay.code).toBe('store_corrupt');
    // Missing store: typed missing (the domain-default store is gone).
    expect(state.parity.ok).toBe(false);
    if (!state.parity.ok) expect(state.parity.code).toBe('store_missing');
    expect(state.specExists).toBe(false);
  });
  it('a corrupt project.json throws the typed identity failure', () => {
    const dir = freshDir('lco-badproj-');
    mkdirSync(join(dir, '.lco', 'renewal'), { recursive: true });
    writeFileSync(renewalPaths(dir).projectJson, '{corrupt');
    expect(() => loadActiveState(dir)).toThrow(/project.json invalid/);
  });
});
describe('strategy + analysis store edges', () => {
  it('strategy load: missing is actionable; corrupt is typed; persist round-trips', () => {
    const dir = freshDir('lco-strat-');
    const path = join(dir, 'strategy.json');
    const missing = loadStrategyFile(path);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.code).toBe('strategy_missing');
    writeFileSync(path, '{corrupt');
    const corrupt = loadStrategyFile(path);
    expect(corrupt.ok).toBe(false);
    if (!corrupt.ok) expect(corrupt.code).toBe('strategy_corrupt');
    const decision = buildStrategyDecision({ strategy: 'full_rewrite', rationale: 'r', selectedVia: 'flag', snapshotId: 'RSN-aaaaaaaaaaaaaaaa', nowIso: 't' });
    // Trust kernel: authorized write — (projectDir, path, decision).
    persistStrategy(dir, path, decision);
    const loaded = loadStrategyFile(path);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.decision.selected_by).toBe('human');
  });
  it('persistAnalysisRecord refuses overwrite (immutable) and reports EEXIST', () => {
    const dir = freshDir('lco-an-');
    const record: AnalysisRecord = {
      schema_version: 1,
      analysis_id: 'AN-0001',
      snapshot_id: 'RSN-aaaaaaaaaaaaaaaa',
      created_at: 't',
      role: 'renew_recover',
      model: { gateway: 'g', provider_kind: 'p', requested_model: 'm' },
      prompt_protocol: 'proto',
      scope: {},
      input: { context_digest: sha('c'), item_count: 0, slice_count: 0, truncated: false, warnings: [] },
      outcome: 'blocked_schema',
      validation: { schema_ok: false, retry_used: false, issues: ['x'], anchors_total: 0, anchors_ok: 0, anchors_failed: 0 },
      promoted: { hypotheses: [], uncertainties: [] },
      rejected: [],
      coverage_notes: [],
      usage: { calls: 0, attempts: 0, in_tokens: 0, out_tokens: 0, usage_known: true },
    };
    // Trust kernel: authorized exclusive create — (projectDir, analysesDir, record).
    expect(persistAnalysisRecord(dir, dir, record).ok).toBe(true);
    const second = persistAnalysisRecord(dir, dir, record);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe('already_exists');
    expect(loadAnalysisRecords(dir).records).toHaveLength(1);
  });
});
// --- planner residual branches + provider edges ----------------------------------------
describe('planner residual branches', () => {
  const g = graphOf();
  if (!g.ok) throw new Error(g.message);
  const MANIFEST = ['src/a.ts', 'src/gen/generated.ts', 'src/vendor/lib.ts', 'plain.ts'].map((p) => ({ path: p, sha256: sha(p) }));
  const snapshot = createSnapshot({
    rootRealpath: '/r', repoKind: 'plain', files: MANIFEST, filesTruncated: false,
    graph: { graphifyVersion: '0.9.50', nodeCount: 4, edgeCount: 3, graphDigest: sha('g') },
    graphManifest: { digest: sha('m'), entries: 4 }, nowIso: 't',
  });
  const SNAP = snapshot.snapshot_id;
  const analysis = {
    schema_version: 1 as const, analysis_id: 'AN-0001', snapshot_id: SNAP, created_at: 't',
    role: 'renew_recover' as const, model: { gateway: 't', provider_kind: 't', requested_model: 't' },
    prompt_protocol: 'p', scope: {},
    input: { context_digest: sha('c'), item_count: 1, slice_count: 1, truncated: false, warnings: [] },
    outcome: 'validated' as const,
    validation: { schema_ok: true, retry_used: false, issues: [], anchors_total: 1, anchors_ok: 1, anchors_failed: 0 },
    promoted: {
      hypotheses: [
        { id: 'BHV-0001', statement: 's1', category: 'business_rule' as const, confidence: 'high' as const, anchors: [{ path: 'src/a.ts', content_hash: sha('src/a.ts') }], rationale: 'r', status: 'hypothesized' as const, anchor_results: [{ path: 'src/a.ts', ok: true }] },
        { id: 'BHV-0002', statement: 's2', category: 'business_rule' as const, confidence: 'low' as const, anchors: [{ path: 'src/vendor/lib.ts', content_hash: sha('src/vendor/lib.ts') }], rationale: 'r', status: 'hypothesized' as const, anchor_results: [{ path: 'src/vendor/lib.ts', ok: true }] },
      ],
      uncertainties: [],
    },
    rejected: [], coverage_notes: [],
    usage: { calls: 1, attempts: 1, in_tokens: 1, out_tokens: 1, usage_known: true },
  };
  const strategy = { schema_version: 1 as const, strategy: 'strangler' as const, rationale: 'r', selected_by: 'human' as const, selected_via: 'flag' as const, selected_at: 't', snapshot_id: SNAP };
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
    projectDir: '/tmp/proj',
    blastRadius: (p: string) => (p === 'src/a.ts' ? ['src/vendor/lib.ts'] : []),
  });
  it('blast radius imposes cross-task dependencies (a before its dependents)', () => {
    const r = buildModernizationPlan(inputs());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const dependents = r.bundle.tasks.filter((t) => t.depends_on.length > 0);
    expect(dependents.length).toBeGreaterThan(0);
    // The task owning src/vendor/lib.ts depends on the one owning src/a.ts.
    const libTask = r.bundle.tasks.find((t) => t.permitted_scope.includes('src/vendor/lib.ts'));
    const aTask = r.bundle.tasks.find((t) => t.permitted_scope.includes('src/a.ts') && t.task_id !== libTask?.task_id);
    expect(libTask?.depends_on).toContain(aTask?.task_id);
    // L12: same-file overlap chains deterministically (no shared files here).
    expect(r.bundle.tasks.every((t) => t.permitted_scope.length > 0)).toBe(true);
  });
  it('an empty parity ledger refuses (parity_unresolved)', () => {
    const r = buildModernizationPlan({ ...inputs(), parity: emptyParity(SNAP) });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('parity_unresolved');
    expect(r.message).toMatch(/ledger is empty/);
  });
  it('missing strategy refuses with the human-act message', () => {
    const r = buildModernizationPlan({ ...inputs(), strategy: undefined as never });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('missing_strategy');
    expect(r.message).toMatch(/human act/);
  });
  it('same-file hypotheses chain in task-id order (L12 overlap ordering)', () => {
    const sameFile = {
      ...analysis,
      promoted: {
        hypotheses: [
          { ...analysis.promoted.hypotheses[0]!, statement: 'first' },
          { ...analysis.promoted.hypotheses[0]!, id: 'BHV-0002', statement: 'second' },
        ],
        uncertainties: [],
      },
    } as never;
    const store = parityFromAnalyses([sameFile], SNAP);
    for (const rec of store.records) setRuling(store, rec.id, { ruling: 'change', rationale: 'x' });
    const r = buildModernizationPlan({ ...inputs(), parity: store, analyses: [sameFile] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const chained = r.bundle.tasks.filter((t) => t.depends_on.length > 0);
    expect(chained.length).toBe(1); // the later task depends on the earlier
    expect(chained[0]!.depends_on.length).toBe(1);
  });
  it('a cyclic blast radius is reported as a cycle blocker', () => {
    const r = buildModernizationPlan({
      ...inputs(),
      blastRadius: (p: string) => (p === 'src/a.ts' ? ['src/vendor/lib.ts'] : ['src/a.ts']),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('cycle');
    expect(r.message).toMatch(/cycle/);
  });
  it('evidence dedup: two parity entries sharing one anchor emit ONE code_anchor evidence item', () => {
    const shared = {
      ...analysis,
      promoted: {
        hypotheses: [
          { ...analysis.promoted.hypotheses[0]!, statement: 'x' },
          { ...analysis.promoted.hypotheses[0]!, id: 'BHV-0002', statement: 'y' },
        ],
        uncertainties: [],
      },
    } as never;
    const store = parityFromAnalyses([shared], SNAP);
    for (const rec of store.records) setRuling(store, rec.id, { ruling: 'drop', rationale: 'x', approvalId: 'APPR-0001' });
    const r = buildModernizationPlan({ ...inputs(), parity: store, analyses: [shared] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const anchors = r.bundle.evidence.filter((e) => e.kind === 'code_anchor');
    expect(anchors.length).toBe(1);
    // DROP rulings carry high risk + intentional-absence invariants
    const drop = r.bundle.tasks.find((t) => t.risk.level === 'high');
    expect(drop).toBeTruthy();
    expect(drop!.invariants[0]).toMatch(/intentionally absent/);
  });
});