/**
 * Rich-state and sabotage tranche for the renew command cores: a project
 * carrying every state shape (validated/blocked/cross-snapshot analyses, all
 * parity rulings, stale+active overlay records, strategy, spec) exercises
 * the status/export rendering arms; sabotaged providers/mid-flow mutations
 * exercise the defensive arms of analyze (recheck failure, lock contention,
 * schema/insufficient-context blocks).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  cmdRenewInit,
  cmdRenewStatus,
  cmdRenewAnalyze,
  cmdRenewExport,
  type RenewCapabilities,
} from '../cli/commands/renew';
import { StaticGraphProvider } from './intel/fixture-provider';
import { parseGraphText } from './intel/graph-reader';
import { acquireSpecRootLock } from '../storage/revision';
import { singleRoutePlan } from '../llm/plan';
import type { LlmAdapter } from '../eval/llm/adapter';

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
const FIXTURE_SRC = join(__dirname, '..', '..', 'fixtures', 'legacy-app');
const NOW = '2026-09-02T12:00:00.000Z';

function caps(overrides: Partial<RenewCapabilities> = {}): RenewCapabilities {
  const g = parseGraphText(readFileSync(join(FIXTURE_SRC, 'graph-fixture.json'), 'utf8'));
  if (!g.ok) throw new Error(g.message);
  return {
    nowIso: () => NOW,
    provider: () => new StaticGraphProvider(g.graph, '0.9.50'),
    gitCommit: () => undefined,
    ...overrides,
  };
}

function makeTarget(): string {
  const target = freshDir('lco-rich-target-');
  cpSync(join(FIXTURE_SRC, 'src'), join(target, 'src'), { recursive: true });
  cpSync(join(FIXTURE_SRC, 'package.json'), join(target, 'package.json'));
  return target;
}

const analysisRecord = (id: string, snapshotId: string, outcome: 'validated' | 'blocked_schema') =>
  ({
    schema_version: 1,
    analysis_id: id,
    snapshot_id: snapshotId,
    created_at: NOW,
    role: 'renew_recover',
    model: { gateway: 'g', provider_kind: 'p', requested_model: 'm' },
    prompt_protocol: 'lco-renew/recovery-v1',
    scope: { type: 'whole' },
    input: { context_digest: sha('c'), item_count: 2, slice_count: 1, truncated: false, warnings: [] },
    outcome,
    validation: { schema_ok: outcome === 'validated', retry_used: false, issues: outcome === 'validated' ? [] : ['bad'], anchors_total: 1, anchors_ok: outcome === 'validated' ? 1 : 0, anchors_failed: outcome === 'validated' ? 0 : 1 },
    promoted:
      outcome === 'validated'
        ? {
            hypotheses: [{ id: 'BHV-0001', statement: 'Fee under $25.', category: 'business_rule', confidence: 'high', anchors: [{ path: 'src/orders.ts', content_hash: sha('orders') }], rationale: 'r', status: 'hypothesized', anchor_results: [{ path: 'src/orders.ts', ok: true }] }],
            uncertainties: [{ id: 'UNC-0001', question: 'Keep the fee?', impact: 'low', options: [{ option: 'yes' }, { option: 'no' }], anchors: [{ path: 'src/orders.ts', content_hash: sha('orders') }], anchor_results: [{ path: 'src/orders.ts', ok: true }] }],
          }
        : { hypotheses: [], uncertainties: [] },
    rejected: [],
    coverage_notes: ['note'],
    usage: { calls: 1, attempts: 1, in_tokens: 5, out_tokens: 5, usage_known: true },
  }) as const;

describe('status/export over RICH state', () => {
  it('renders every state shape honestly (validated+blocked+history analyses, all rulings, stale overlay, strategy, spec)', async () => {
    const target = makeTarget();
    const project = freshDir('lco-rich-project-');
    const c = caps();
    expect((await cmdRenewInit({ dir: project, target, name: 'rich' }, c)).code).toBe(0);
    const renewal = join(project, '.lco', 'renewal');
    const snapId = (JSON.parse(readFileSync(join(renewal, 'snapshot.json'), 'utf8')) as { snapshot_id: string }).snapshot_id;

    // Analyses: one validated (active), one blocked_schema (active), one HISTORY (foreign snapshot).
    writeFileSync(join(renewal, 'analyses', 'AN-0001.json'), JSON.stringify(analysisRecord('AN-0001', snapId, 'validated')));
    writeFileSync(join(renewal, 'analyses', 'AN-0002.json'), JSON.stringify(analysisRecord('AN-0002', snapId, 'blocked_schema')));
    writeFileSync(join(renewal, 'analyses', 'AN-0003.json'), JSON.stringify(analysisRecord('AN-0003', 'RSN-9999999999999999', 'validated')));

    // Parity: all four rulings.
    const parity = JSON.parse(readFileSync(join(renewal, 'parity.json'), 'utf8')) as {
      snapshot_id: string;
      records: unknown[];
    };
    const parityRow = (id: string, ruling: string) => ({
      id,
      behavior: `behavior ${id}`,
      ruling,
      ...(ruling !== 'unresolved' ? { rationale: `why ${id}` } : {}),
      evidence: [{ kind: 'user_decision', claim_id: 'UNC-0001' }],
      snapshot_id: parity.snapshot_id,
      ...(ruling === 'drop' ? { approval_id: 'APPR-0001' } : {}),
    });
    parity.records = [parityRow('PAR-0001', 'preserve'), parityRow('PAR-0002', 'change'), parityRow('PAR-0003', 'drop'), parityRow('PAR-0004', 'unresolved')];
    writeFileSync(join(renewal, 'parity.json'), JSON.stringify(parity, null, 2));

    // Overlay: one ACTIVE + one STALE record (both anchored).
    const overlay = JSON.parse(readFileSync(join(renewal, 'overlay.json'), 'utf8')) as { snapshot_id: string; records: unknown[] };
    const overlayRow = (id: string, status: string) => ({
      id,
      relation: 'business_rule',
      subject: { path: 'src/orders.ts' },
      anchors: [{ path: 'src/orders.ts', content_hash: sha('orders') }],
      snapshot_id: overlay.snapshot_id,
      confidence: 'medium',
      status,
      lineage: { analysis_id: 'AN-0001' },
    });
    overlay.records = [overlayRow('OVL-0001', 'active'), overlayRow('OVL-0002', 'stale')];
    writeFileSync(join(renewal, 'overlay.json'), JSON.stringify(overlay, null, 2));

    // Strategy + a spec dir.
    writeFileSync(
      join(renewal, 'strategy.json'),
      JSON.stringify({ schema_version: 1, strategy: 'strangler', rationale: 'r', selected_by: 'human', selected_via: 'flag', selected_at: NOW, snapshot_id: snapId }, null, 2),
    );
    mkdirSync(join(project, 'spec'), { recursive: true });

    const status = await cmdRenewStatus({ dir: project }, c);
    expect(status.code).toBe(0);
    expect(status.output).toMatch(/analyses: 2 active \(3 total/);
    expect(status.output).toMatch(/open questions: 1/);
    expect(status.output).toMatch(/overlay: 2 record\(s\), 1 STALE/);
    expect(status.output).toMatch(/1 preserve \/ 1 change \/ 1 drop \/ 1 UNRESOLVED/);
    expect(status.output).toMatch(/strategy: strangler/);
    expect(status.output).toMatch(/plan: spec\/ present/);

    // The JSON arm carries the same facts.
    const json = await cmdRenewStatus({ dir: project, json: true }, c);
    const parsed = JSON.parse(json.output) as { analyses: number; analyses_total: number; parity: Record<string, number> };
    expect(parsed.analyses).toBe(2);
    expect(parsed.analyses_total).toBe(3);
    expect(parsed.parity).toEqual({ preserve: 1, change: 1, drop: 1, unresolved: 1 });

    // Export renders the rich report (analyses/overlay/parity/strategy sections).
    const report = await cmdRenewExport({ dir: project }, c);
    expect(report.code).toBe(0);
    expect(report.output).toMatch(/AN-0001/);
  });

  it('a git-tracked target snapshot records the commit and status stays fresh', async () => {
    const target = makeTarget();
    const project = freshDir('lco-rich-git-');
    const commit = 'a'.repeat(40);
    const c = caps({ gitCommit: () => commit });
    expect((await cmdRenewInit({ dir: project, target, name: 'gitrich' }, c)).code).toBe(0);
    const snap = JSON.parse(readFileSync(join(project, '.lco', 'renewal', 'snapshot.json'), 'utf8')) as {
      target: { repo_kind: string; git_commit: string };
    };
    expect(snap.target.repo_kind).toBe('git');
    expect(snap.target.git_commit).toBe(commit);
    const status = await cmdRenewStatus({ dir: project }, c);
    expect(status.code).toBe(0);
    expect(status.output).toMatch(/snapshot: fresh/);
  });
});

describe('analyze defensive arms', () => {
  const emptyOutput = () => JSON.stringify({ hypotheses: [], uncertainties: [], coverage_notes: [] });

  it('a corrupt PARITY store refuses at analyze (parity counterpart of the overlay arm)', async () => {
    const target = makeTarget();
    const project = freshDir('lco-rich-par-');
    const c = caps();
    expect((await cmdRenewInit({ dir: project, target, name: 'par' }, c)).code).toBe(0);
    writeFileSync(join(project, '.lco', 'renewal', 'parity.json'), '{corrupt');
    const r = await cmdRenewAnalyze({ dir: project }, { ...c, llm: () => singleRoutePlan({ complete: async () => ({ text: emptyOutput() }) } as LlmAdapter, { gateway: 'g', providerKind: 'openai-compatible', requestedModel: 'm' }) });
    expect(r.code).toBe(1);
    expect(r.output).toMatch(/parity store corrupt/);
  });

  it('a FOREIGN-snapshot parity store refuses at analyze with the refresh remedy', async () => {
    const target = makeTarget();
    const project = freshDir('lco-rich-fpar-');
    const c = caps();
    expect((await cmdRenewInit({ dir: project, target, name: 'fpar' }, c)).code).toBe(0);
    const parityPath = join(project, '.lco', 'renewal', 'parity.json');
    const parity = JSON.parse(readFileSync(parityPath, 'utf8')) as { snapshot_id: string };
    parity.snapshot_id = 'RSN-8888888888888888';
    writeFileSync(parityPath, JSON.stringify(parity, null, 2));
    const r = await cmdRenewAnalyze({ dir: project }, { ...c, llm: () => singleRoutePlan({ complete: async () => ({ text: emptyOutput() }) } as LlmAdapter, { gateway: 'g', providerKind: 'openai-compatible', requestedModel: 'm' }) });
    expect(r.code).toBe(1);
    expect(r.output).toMatch(/parity store is bound to snapshot RSN-8888/);
    expect(r.output).toMatch(/lco renew refresh/);
  });

  it('a second schema failure blocks with the record path (blocked_schema arm)', async () => {
    const target = makeTarget();
    const project = freshDir('lco-rich-bs-');
    const c = caps();
    expect((await cmdRenewInit({ dir: project, target, name: 'bs' }, c)).code).toBe(0);
    const alwaysBad: LlmAdapter = { complete: async () => ({ text: 'garbage' }) };
    const r = await cmdRenewAnalyze({ dir: project }, { ...c, llm: () => singleRoutePlan(alwaysBad, { gateway: 'g', providerKind: 'openai-compatible', requestedModel: 'm' }) });
    expect(r.code).toBe(1);
    expect(r.output).toMatch(/BLOCKED \(schema\)/);
    expect(r.output).toMatch(/AN-0001\.json/);
  });

  it('a graph whose nodes reference NO manifest files blocks as UNRESOLVED_INSUFFICIENT_CONTEXT before the call', async () => {
    const target = makeTarget();
    const project = freshDir('lco-rich-ic-');
    const c = caps();
    expect((await cmdRenewInit({ dir: project, target, name: 'ic' }, c)).code).toBe(0);
    // Sabotage the IN-MEMORY graph: nodes exist but reference absent files.
    // The on-disk graph (used for staleness) is untouched → still fresh.
    const g = parseGraphText(readFileSync(join(FIXTURE_SRC, 'graph-fixture.json'), 'utf8'));
    if (!g.ok) throw new Error(g.message);
    const barren = {
      ...g.graph,
      nodes: g.graph.nodes.map((n) => ({ ...n, source_file: 'src/absent-file.ts' })),
    };
    let calls = 0;
    const c2 = caps({
      provider: () => {
        const p = new StaticGraphProvider(barren, '0.9.50');
        return p;
      },
      llm: () => singleRoutePlan({ complete: async () => { calls++; throw new Error('must not be called'); } } as LlmAdapter, { gateway: 'g', providerKind: 'openai-compatible', requestedModel: 'm' }),
    });
    const r = await cmdRenewAnalyze({ dir: project }, c2);
    expect(r.code).toBe(1);
    expect(r.output).toMatch(/BLOCKED \(UNRESOLVED_INSUFFICIENT_CONTEXT\)/);
    expect(calls).toBe(0); // zero paid calls
  });

  it('a vanished graph.json DURING the paid call blocks as stale (recheck graph-missing arm)', async () => {
    const target = makeTarget();
    const project = freshDir('lco-rich-mid-');
    const c = caps();
    expect((await cmdRenewInit({ dir: project, target, name: 'mid' }, c)).code).toBe(0);
    const ordersPath = join(target, 'src', 'orders.ts');
    const scripted: LlmAdapter = {
      complete: async () => {
        // Remove the workspace graph mid-call → the recheck sees graph bytes change.
        rmSync(join(project, '.lco', 'renewal', 'graph-workspace', 'graphify-out', 'graph.json'));
        return {
          text: JSON.stringify({
            hypotheses: [{ id: 'BHV-0001', statement: 's', category: 'business_rule', confidence: 'high', anchors: [{ path: 'src/orders.ts', content_hash: sha(readFileSync(ordersPath)) }], rationale: 'r' }],
            uncertainties: [],
            coverage_notes: [],
          }),
        };
      },
    };
    const r = await cmdRenewAnalyze({ dir: project }, { ...c, llm: () => singleRoutePlan(scripted, { gateway: 'g', providerKind: 'openai-compatible', requestedModel: 'm' }) });
    expect(r.code).toBe(1);
    expect(r.output).toMatch(/BLOCKED \(stale\)/);
  });

  it('renewal lock contention during the analyze fold refuses cleanly (lock-held arm)', async () => {
    const target = makeTarget();
    const project = freshDir('lco-rich-lock-');
    const c = caps();
    expect((await cmdRenewInit({ dir: project, target, name: 'lock' }, c)).code).toBe(0);
    const ordersPath = join(target, 'src', 'orders.ts');
    const scripted: LlmAdapter = {
      complete: async () => ({
        text: JSON.stringify({
          hypotheses: [{ id: 'BHV-0001', statement: 's', category: 'business_rule', confidence: 'high', anchors: [{ path: 'src/orders.ts', content_hash: sha(readFileSync(ordersPath)) }], rationale: 'r' }],
          uncertainties: [],
          coverage_notes: [],
        }),
      }),
    };
    // Hold the renewal lock across the whole analyze (acquired before, released after).
    const lock = acquireSpecRootLock(join(project, '.lco', 'renewal'), NOW);
    try {
      const r = await cmdRenewAnalyze({ dir: project }, { ...c, llm: () => singleRoutePlan(scripted, { gateway: 'g', providerKind: 'openai-compatible', requestedModel: 'm' }) });
      expect(r.code).toBe(1);
      expect(r.output).toMatch(/locked by another writer/);
      // The trusted stores were NOT written (the fold never ran).
      const overlay = JSON.parse(readFileSync(join(project, '.lco', 'renewal', 'overlay.json'), 'utf8')) as { records: unknown[] };
      expect(overlay.records).toHaveLength(0);
    } finally {
      lock.release();
    }
  });

  it('hypotheses carrying node_id anchors fold into the overlay with node provenance', async () => {
    const target = makeTarget();
    const project = freshDir('lco-rich-node-');
    const c = caps();
    expect((await cmdRenewInit({ dir: project, target, name: 'node' }, c)).code).toBe(0);
    const ordersPath = join(target, 'src', 'orders.ts');
    const g = parseGraphText(readFileSync(join(FIXTURE_SRC, 'graph-fixture.json'), 'utf8'));
    if (!g.ok) throw new Error(g.message);
    const nodeId =
      g.graph.nodes.find((n) => n.source_file === 'src/orders.ts' && n.source_location !== undefined)?.node_id ??
      'src_orders_createorder';
    // countLines() discounts one trailing newline — derive the exact count.
    const raw = readFileSync(ordersPath, 'utf8').split('\n');
    const ordersLines = raw[raw.length - 1] === '' ? raw.length - 1 : raw.length;
    const scripted: LlmAdapter = {
      complete: async () => ({
        text: JSON.stringify({
          hypotheses: [{
            id: 'BHV-0001',
            statement: 'Node-anchored fee rule.',
            category: 'business_rule',
            confidence: 'high',
            anchors: [{ path: 'src/orders.ts', content_hash: sha(readFileSync(ordersPath)), node_id: nodeId, start_line: 1, end_line: ordersLines }],
            rationale: 'r',
          }],
          uncertainties: [],
          coverage_notes: [],
        }),
      }),
    };
    const r = await cmdRenewAnalyze({ dir: project }, { ...c, llm: () => singleRoutePlan(scripted, { gateway: 'g', providerKind: 'openai-compatible', requestedModel: 'm' }) });
    expect(r.code).toBe(0);
    const overlay = JSON.parse(readFileSync(join(project, '.lco', 'renewal', 'overlay.json'), 'utf8')) as {
      records: { subject: { node_id?: string; path: string }; anchors: { node_id?: string; start_line?: number }[] }[];
    };
    expect(overlay.records).toHaveLength(1);
    expect(overlay.records[0]!.subject.node_id).toBe(nodeId);
    expect(overlay.records[0]!.anchors[0]!.node_id).toBe(nodeId);
    expect(overlay.records[0]!.anchors[0]!.start_line).toBe(1);
  });

  it('a budget ledger is honored when provided (attempt ceiling → BudgetExceededError contract)', async () => {
    const target = makeTarget();
    const project = freshDir('lco-rich-budget-');
    const c = caps();
    expect((await cmdRenewInit({ dir: project, target, name: 'budget' }, c)).code).toBe(0);
    const { createBudgetLedger } = await import('../eval/budget');
    const ledger = createBudgetLedger({ maxAttempts: 1 }, { nowMs: Date.now });
    const alwaysBad: LlmAdapter = { complete: async () => ({ text: 'garbage' }) };
    // First call consumed the attempt; the retry is refused by the ledger —
    // the observable contract is the typed rejection with NOTHING written.
    await expect(
      cmdRenewAnalyze({ dir: project }, {
        ...c,
        budget: () => ledger,
        llm: () => singleRoutePlan(alwaysBad, { gateway: 'g', providerKind: 'openai-compatible', requestedModel: 'm' }),
      }),
    ).rejects.toThrow(/BUDGET_EXCEEDED.*nothing written/);
    const files = readdirSync(join(project, '.lco', 'renewal', 'analyses')).filter((f) => f.endsWith('.json'));
    expect(files).toHaveLength(0); // budget refusal writes nothing (pre-response)
  });

  it('an unreadable target subdirectory surfaces the typed walk failure', async () => {
    const target = makeTarget();
    const project = freshDir('lco-rich-eacces-');
    const c = caps();
    expect((await cmdRenewInit({ dir: project, target, name: 'eacces' }, c)).code).toBe(0);
    const locked = join(target, 'src');
    chmodSync(locked, 0o000);
    try {
      const r = await cmdRenewStatus({ dir: project }, c);
      expect(r.code).toBe(1);
      expect(r.output).toMatch(/walk failed|could not read directory/);
    } finally {
      chmodSync(locked, 0o755);
    }
  });
});
