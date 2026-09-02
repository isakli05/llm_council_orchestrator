import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildModernizationPlan } from './plan';
import { buildStrategyDecision } from './strategy';
import { SPEC_SCHEMA_VERSION, SpecBundleSchema } from '../../schemas';
import { lintBundle } from '../../lint/engine';
import { parseGraphFile } from '../intel/graph-reader';
import { buildArchitectureView } from '../archview/architecture-view';
import { emptyOverlay } from '../overlay/overlay';
import { parityFromAnalyses, applyApprovalToParity } from '../parity/ledger';
import { createSnapshot } from '../snapshot/snapshot';
import type { AnalysisRecord } from '../recovery/schemas';
import type { RenewalApprovalRecord } from '../clarify/approvals';
import type { FileManifest } from '../ingest/workspace-copy';

const sha = (s: string | Buffer) => `sha256:${createHash('sha256').update(s).digest('hex')}`;

const PRICING = 'export function applyDiscount(s: number): number {\n  return s * 0.95;\n}\n';
const ORDERS = 'export function createOrder(c: string) {\n  return { accepted: true };\n}\n';

const fixtureGraphPath = join(__dirname, '..', '..', '..', 'fixtures', 'legacy-app', 'graph-fixture.json');
const graphParsed = parseGraphFile(JSON.parse(readFileSync(fixtureGraphPath, 'utf8')));
if (!graphParsed.ok) throw new Error(graphParsed.message);

const MANIFEST: FileManifest = [
  { path: 'src/inventory.ts', sha256: sha('inv') },
  { path: 'src/main.ts', sha256: sha('main') },
  { path: 'src/orders.ts', sha256: sha(ORDERS) },
  { path: 'src/pricing.ts', sha256: sha(PRICING) },
];

const snapshot = createSnapshot({
  rootRealpath: '/repos/orders-crm',
  repoKind: 'git',
  gitCommit: 'a'.repeat(40),
  files: MANIFEST,
  filesTruncated: false,
  graph: { graphifyVersion: '0.9.50', nodeCount: 11, edgeCount: 15, graphDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
  graphManifest: { digest: sha('manifest'), entries: 4 },
  nowIso: '2026-09-02T00:00:00.000Z',
});
const SNAP_ID = snapshot.snapshot_id;

function twoHypothesisAnalysis(): AnalysisRecord {
  return JSON.parse(
    JSON.stringify({
      schema_version: 1,
      analysis_id: 'AN-0001',
      snapshot_id: SNAP_ID,
      created_at: '2026-09-02T00:00:00Z',
      role: 'renew_recover',
      model: { gateway: 't', provider_kind: 't', requested_model: 't' },
      prompt_protocol: 'lco-renew/recovery-v1',
      scope: { type: 'whole' },
      input: { context_digest: sha('x'), item_count: 2, slice_count: 2, truncated: false, warnings: [] },
      outcome: 'validated',
      validation: { schema_ok: true, retry_used: false, issues: [], anchors_total: 2, anchors_ok: 2, anchors_failed: 0 },
      promoted: {
        hypotheses: [
          {
            id: 'BHV-0001',
            statement: 'Orders under $25 incur a $4.95 small-order fee.',
            category: 'business_rule',
            confidence: 'medium',
            anchors: [{ path: 'src/orders.ts', content_hash: sha(ORDERS) }],
            rationale: 'seen',
            status: 'hypothesized',
            anchor_results: [{ path: 'src/orders.ts', ok: true }],
          },
          {
            id: 'BHV-0002',
            statement: 'A 5% discount is applied to eligible subtotals.',
            category: 'business_rule',
            confidence: 'medium',
            anchors: [{ path: 'src/pricing.ts', content_hash: sha(PRICING) }],
            rationale: 'seen',
            status: 'hypothesized',
            anchor_results: [{ path: 'src/pricing.ts', ok: true }],
          },
        ],
        uncertainties: [],
      },
      rejected: [],
      coverage_notes: [],
      usage: { calls: 1, attempts: 1, in_tokens: 1, out_tokens: 1, usage_known: true },
    }),
  ) as AnalysisRecord;
}

const strategy = buildStrategyDecision({
  strategy: 'strangler',
  rationale: 'incremental cutover fits the order pipeline',
  selectedVia: 'workspace',
  snapshotId: SNAP_ID,
  nowIso: '2026-09-02T00:00:00Z',
});

function ruledParity() {
  const store = parityFromAnalyses([twoHypothesisAnalysis()], SNAP_ID);
  const approval = {
    schema_version: 1,
    approval_id: 'APPR-0001',
    session_id: 's1',
    round_count: 1,
    approved_at: '2026-09-02T00:00:00Z',
    decisions: [
      { claim_id: 'UNC-0001', kind: 'uncertainty' as const, selected_option: 'Preserve the fee', evidence: { source: 's', answer_text: 'Preserve the fee', hash: sha('p') } },
      { claim_id: 'UNC-0002', kind: 'uncertainty' as const, selected_option: 'Preserve the discount', evidence: { source: 's', answer_text: 'Preserve the discount', hash: sha('d') } },
    ],
    content_digest: sha('cd'),
  } as RenewalApprovalRecord;
  store.records[0].decision_claim_id = 'UNC-0001';
  store.records[1].decision_claim_id = 'UNC-0002';
  applyApprovalToParity(store, approval);
  return store;
}

const archView = buildArchitectureView(graphParsed.graph, MANIFEST, SNAP_ID);

/** Fixture blast radius: pricing impacts orders+main; orders impacts main. */
const blastRadius = (path: string): string[] =>
  path === 'src/pricing.ts' ? ['src/orders.ts', 'src/main.ts'] : path === 'src/orders.ts' ? ['src/main.ts'] : [];

function baseInputs() {
  return {
    snapshot,
    architectureView: archView,
    overlay: emptyOverlay(SNAP_ID),
    parity: ruledParity(),
    strategy,
    analyses: [twoHypothesisAnalysis()],
    projectName: 'orders-crm',
    projectDir: '/projects/orders-renewal',
    blastRadius,
  };
}

describe('buildModernizationPlan (deterministic, zero LLM calls)', () => {
  it('produces a schema-valid, LINT-CLEAN legacy SpecBundle', () => {
    const r = buildModernizationPlan(baseInputs());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(SpecBundleSchema.safeParse(r.bundle).success).toBe(true);
    const lint = lintBundle(r.bundle);
    expect(lint.errors).toEqual([]);
    expect(r.bundle.manifest.project.mode).toBe('legacy');
    expect(r.bundle.manifest.complexity_profile).toBe('p-legacy');
    expect(r.bundle.manifest.spec_schema).toBe(SPEC_SCHEMA_VERSION);
    expect(r.bundle.legacy?.preserve_change_drop).toHaveLength(2);
  });

  it('anchors every requirement to code_anchor evidence that verifies against the real tree bytes', () => {
    const r = buildModernizationPlan(baseInputs());
    if (!r.ok) throw new Error(r.message ?? '');
    const anchorEvidence = r.bundle.evidence.filter((e) => e.kind === 'code_anchor');
    expect(anchorEvidence).toHaveLength(2);
    for (const e of anchorEvidence) {
      if (e.kind !== 'code_anchor') continue;
      const bytes = e.anchor.path === 'src/orders.ts' ? ORDERS : PRICING;
      expect(e.anchor.content_hash).toBe(sha(bytes));
      expect(e.hash).toBe(e.anchor.content_hash);
    }
    for (const req of r.bundle.requirements) {
      expect(req.evidence.length).toBeGreaterThanOrEqual(1);
      expect(req.acceptance_refs.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('records the human strategy as an accepted decision with alternatives', () => {
    const r = buildModernizationPlan(baseInputs());
    if (!r.ok) throw new Error(r.message ?? '');
    expect(r.bundle.decisions).toHaveLength(1);
    const d = r.bundle.decisions[0];
    expect(d.status).toBe('accepted');
    expect(d.decision).toContain('strangler');
    expect(d.alternatives).toHaveLength(5); // the five REJECTED strategies
  });

  it('orders migration tasks by blast radius (pricing before its dependents)', () => {
    const r = buildModernizationPlan(baseInputs());
    if (!r.ok) throw new Error(r.message ?? '');
    // The orders task depends on the pricing task (orders is in pricing's blast radius).
    const ordersTask = r.bundle.tasks.find((t) => t.permitted_scope.includes('src/orders.ts'));
    const pricingTask = r.bundle.tasks.find((t) => t.permitted_scope.includes('src/pricing.ts'));
    expect(ordersTask?.depends_on).toContain(pricingTask?.task_id);
    const idxP = r.topoOrder.indexOf(pricingTask!.task_id);
    const idxO = r.topoOrder.indexOf(ordersTask!.task_id);
    expect(idxP).toBeLessThan(idxO);
  });

  it('tasks carry real verification commands, tests ledger, and protected scopes for preserves', () => {
    const r = buildModernizationPlan(baseInputs());
    if (!r.ok) throw new Error(r.message ?? '');
    for (const t of r.bundle.tasks) {
      expect(t.verification[0]?.command).toMatch(/^lco (compile|verify) /);
      expect(t.verification[0]?.expect).toBe('exit 0');
      expect(t.tests[0]?.file).toBe('.lco/renewal/parity.json');
      expect(r.bundle.test_files).toContain('.lco/renewal/parity.json');
    }
    const preserveTask = r.bundle.tasks.find((t) => t.permitted_scope.includes('src/orders.ts'));
    expect(preserveTask?.protected).toContain('src/orders.ts');
  });

  it('refuses to plan with unresolved parity entries (actionable blockers)', () => {
    const inputs = baseInputs();
    inputs.parity = parityFromAnalyses([twoHypothesisAnalysis()], SNAP_ID);
    const r = buildModernizationPlan(inputs);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('parity_unresolved');
    expect(r.blockers?.map((b) => b.id)).toEqual(['PAR-0001', 'PAR-0002']);
  });

  it('refuses to plan without a strategy decision', () => {
    const inputs = baseInputs();
    inputs.strategy = undefined as never;
    const r = buildModernizationPlan(inputs);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('missing_strategy');
  });

  it('chains same-file scopes deterministically (L12-compliant overlap ordering)', () => {
    const analysis = twoHypothesisAnalysis();
    // Force both hypotheses onto the same file.
    analysis.promoted.hypotheses[1].anchors = [{ path: 'src/orders.ts', content_hash: sha(ORDERS) }];
    const store = parityFromAnalyses([analysis], SNAP_ID);
    const approval = {
      schema_version: 1,
      approval_id: 'APPR-0001',
      session_id: 's1',
      round_count: 1,
      approved_at: '2026-09-02T00:00:00Z',
      decisions: [
        { claim_id: 'UNC-0001', kind: 'uncertainty' as const, selected_option: 'Preserve it', evidence: { source: 's', answer_text: 'Preserve it', hash: sha('p') } },
        { claim_id: 'UNC-0002', kind: 'uncertainty' as const, selected_option: 'Keep it too', evidence: { source: 's', answer_text: 'Keep it too', hash: sha('d') } },
      ],
      content_digest: sha('cd'),
    } as RenewalApprovalRecord;
    store.records[0].decision_claim_id = 'UNC-0001';
    store.records[1].decision_claim_id = 'UNC-0002';
    applyApprovalToParity(store, approval);

    const inputs = baseInputs();
    inputs.parity = store;
    const r = buildModernizationPlan(inputs);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(lintBundle(r.bundle).errors).toEqual([]); // L12 satisfied by the chain
    const same = r.bundle.tasks.filter((t) => t.permitted_scope.includes('src/orders.ts'));
    expect(same).toHaveLength(2);
    const withDeps = same.filter((t) => t.depends_on.length > 0);
    expect(withDeps).toHaveLength(1);
  });

  it('deterministic: identical inputs → byte-identical bundle', () => {
    const a = buildModernizationPlan(baseInputs());
    const b = buildModernizationPlan(baseInputs());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
