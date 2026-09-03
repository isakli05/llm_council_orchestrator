/**
 * Priority-2 tranche: the renew command cores' error and variant arms —
 * every assertion is a documented refusal code or observable state shape.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  cmdRenewInit,
  cmdRenewAnalyze,
  cmdRenewStatus,
  cmdRenewPlan,
  cmdRenewExport,
  cmdRenewReview,
  cmdRenewRefresh,
  type RenewCapabilities,
} from '../cli/commands/renew';
import { StaticGraphProvider } from './intel/fixture-provider';
import { parseGraphText } from './intel/graph-reader';
import { singleRoutePlan } from '../llm/plan';
import type { LlmAdapter, LlmResponse } from '../eval/llm/adapter';

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
  const target = freshDir('lco-rb-target-');
  cpSync(join(FIXTURE_SRC, 'src'), join(target, 'src'), { recursive: true });
  cpSync(join(FIXTURE_SRC, 'package.json'), join(target, 'package.json'));
  return target;
}

async function initProject(name?: string): Promise<{ project: string; target: string; caps: RenewCapabilities }> {
  const target = makeTarget();
  const project = freshDir('lco-rb-project-');
  const c = caps();
  const r = await cmdRenewInit({ dir: project, target, ...(name !== undefined ? { name } : {}) }, c);
  expect(r.code).toBe(0);
  return { project, target, caps: c };
}

const llmReturning = (text: () => string) =>
  singleRoutePlan({ complete: async () => ({ text: text() }) } as LlmAdapter, {
    gateway: 'scripted', providerKind: 'openai-compatible', requestedModel: 'fixture-llm',
  });

describe('status variants', () => {
  it('a project initialized WITHOUT --name defaults the name (usage line reflects it)', async () => {
    const { project } = await initProject();
    const r = await cmdRenewStatus({ dir: project }, caps());
    expect(r.code).toBe(0);
    expect(r.output).toMatch(/renewal status: legacy-renewal/);
  });

  it('a superseded (cross-snapshot) overlay is REPORTED, not trusted', async () => {
    const { project } = await initProject('sup');
    const overlayPath = join(project, '.lco', 'renewal', 'overlay.json');
    const overlay = JSON.parse(readFileSync(overlayPath, 'utf8')) as { snapshot_id: string };
    overlay.snapshot_id = 'RSN-1111111111111111';
    writeFileSync(overlayPath, JSON.stringify(overlay, null, 2));
    const r = await cmdRenewStatus({ dir: project }, caps());
    expect(r.code).toBe(0);
    // Trust kernel (S3-H-09): the typed view renders the store's TYPED state
    // (cross-snapshot history), never as trusted zeros.
    expect(r.output).toMatch(/overlay: superseded \(overlay\.json belongs to snapshot RSN-1111/);
  });

  it('STALE overlay records and rulings are visible in the human output', async () => {
    const { project } = await initProject('stale-ovl');
    const overlayPath = join(project, '.lco', 'renewal', 'overlay.json');
    const overlay = JSON.parse(readFileSync(overlayPath, 'utf8')) as {
      snapshot_id: string;
      records: { id: string; status: string }[];
    };
    overlay.records.push({
      id: 'OVL-0001',
      relation: 'business_rule',
      subject: { path: 'src/orders.ts' },
      anchors: [{ path: 'src/orders.ts', content_hash: 'sha256:1111111111111111111111111111111111111111111111111111111111111111' }],
      snapshot_id: overlay.snapshot_id,
      confidence: 'low',
      status: 'stale',
      lineage: {},
    } as never);
    writeFileSync(overlayPath, JSON.stringify(overlay, null, 2));
    const parityPath = join(project, '.lco', 'renewal', 'parity.json');
    const parity = JSON.parse(readFileSync(parityPath, 'utf8')) as {
      snapshot_id: string;
      records: { id: string; ruling: string; rationale?: string }[];
    };
    parity.records.push({
      id: 'PAR-0001',
      behavior: 'ruled behavior',
      ruling: 'preserve',
      rationale: 'human',
      evidence: [{ kind: 'user_decision', claim_id: 'UNC-0001' }],
      snapshot_id: parity.snapshot_id,
    } as never);
    writeFileSync(parityPath, JSON.stringify(parity, null, 2));
    const r = await cmdRenewStatus({ dir: project }, caps());
    expect(r.output).toMatch(/1 STALE/);
    expect(r.output).toMatch(/1 preserve/);
  });

  it('a project whose snapshot.json is MISSING fails closed with the typed refusal (never zeros)', async () => {
    const { project } = await initProject('nosnap');
    rmSync(join(project, '.lco', 'renewal', 'snapshot.json'));
    const r = await cmdRenewStatus({ dir: project }, caps());
    // Trust kernel (S3-H-09): uncomputable trusted state is a typed refusal —
    // status exits 2 naming the missing snapshot, never renders zeros.
    expect(r.code).toBe(2);
    expect(r.output).toMatch(/snapshot missing/);
    expect(r.output).toMatch(/lco renew refresh/);
  });
});

describe('analyze refusal arms', () => {
  it('a vanished target is the typed identity gate (S2-H-11): renewal target missing', async () => {
    const { project, target } = await initProject('gone');
    rmSync(target, { recursive: true, force: true });
    const r = await cmdRenewAnalyze({ dir: project }, caps());
    // Trust kernel: a project pointing at nothing never reaches analysis —
    // the guarded target walk fails closed at entry with the typed refusal.
    expect(r.code).toBe(1);
    expect(r.output).toMatch(/renewal walk failed: target repository not found/);
  });

  it('a graph that becomes unreadable mid-flow fails closed at analyze', async () => {
    const { project } = await initProject('badgraph');
    const base = caps();
    const c: RenewCapabilities = {
      ...base,
      provider: () => {
        const g = parseGraphText(readFileSync(join(FIXTURE_SRC, 'graph-fixture.json'), 'utf8'));
        if (!g.ok) throw new Error(g.message);
        const p = new StaticGraphProvider(g.graph, '0.9.50');
        const orig = p.graph.bind(p);
        p.graph = (async () => ({ ok: false as const, code: 'graph_invalid' as const, message: 'sabotaged graph' })) as unknown as typeof p.graph;
        void orig;
        return p;
      },
    };
    const r = await cmdRenewAnalyze({ dir: project }, c);
    expect(r.code).toBe(1);
    expect(r.output).toMatch(/graph_invalid|graph unreadable/); // either gate — both fail closed
  });

  it('a missing manifest alongside a present graph is a typed workspace problem', async () => {
    const { project } = await initProject('nomanifest');
    rmSync(join(project, '.lco', 'renewal', 'graph-workspace', 'graphify-out', 'manifest.json'));
    const r = await cmdRenewStatus({ dir: project }, caps());
    expect(r.code).toBe(1);
    expect(r.output).toMatch(/manifest_missing/);
  });

  it('a failing Graphify probe refuses BEFORE any LLM route exists (H-02)', async () => {
    const { project } = await initProject('noprobe');
    const c = caps({
      provider: () => {
        const g = parseGraphText(readFileSync(join(FIXTURE_SRC, 'graph-fixture.json'), 'utf8'));
        if (!g.ok) throw new Error(g.message);
        const p = new StaticGraphProvider(g.graph, '0.9.50');
        p.probe = async () => ({ ok: false as const, supportedRange: '>=0.9.50 <0.10.0', code: 'not_installed' as const, message: 'graphify absent', hint: 'install it' });
        return p;
      },
    });
    const r = await cmdRenewAnalyze({ dir: project }, c);
    expect(r.code).toBe(2);
    expect(r.output).toMatch(/Graphify prerequisite failed \(not_installed\)/);
    expect(r.output).toMatch(/ZERO LLM calls/);
  });

  it('an empty model output blocks as UNRESOLVED (blocked_empty), never a success', async () => {
    const { project } = await initProject('empty');
    const c = caps({ llm: () => llmReturning(() => JSON.stringify({ hypotheses: [], uncertainties: [], coverage_notes: [] })) });
    const r = await cmdRenewAnalyze({ dir: project }, c);
    expect(r.code).toBe(1);
    expect(r.output).toMatch(/BLOCKED \(UNRESOLVED\)/);
  });

  it('a transport failure exits 2 with the spend record trail', async () => {
    const { project } = await initProject('transport');
    const throwing: LlmAdapter = { complete: async () => { throw new Error('connection reset'); } };
    const c = caps({ llm: () => singleRoutePlan(throwing, { gateway: 'g', providerKind: 'openai-compatible', requestedModel: 'm' }) });
    const r = await cmdRenewAnalyze({ dir: project }, c);
    expect(r.code).toBe(2);
    expect(r.output).toMatch(/transport failure/);
    const record = JSON.parse(readFileSync(join(project, '.lco', 'renewal', 'analyses', 'AN-0001.json'), 'utf8')) as { outcome: string };
    expect(record.outcome).toBe('transport_failed');
  });
});

describe('plan refusal arms', () => {
  it('a stale snapshot refuses with the refresh remedy', async () => {
    const { project, target } = await initProject('planstale');
    writeFileSync(join(target, 'src', 'inventory.ts'), 'export const CHANGED = 1;\n');
    const r = await cmdRenewPlan({ dir: project }, caps());
    expect(r.code).toBe(1);
    expect(r.output).toMatch(/plan refused: snapshot is stale/);
    expect(r.output).toMatch(/lco renew refresh/);
  });

  it('a corrupt overlay refuses at plan entry', async () => {
    const { project } = await initProject('plancorrupt');
    writeFileSync(join(project, '.lco', 'renewal', 'overlay.json'), '{corrupt');
    const r = await cmdRenewPlan({ dir: project, strategy: 'strangler', strategyRationale: 'x' }, caps());
    expect(r.code).toBe(1);
    // Trust kernel: plan reads the TYPED active view — the refusal carries
    // the typed store code, never silent zeros.
    expect(r.output).toMatch(/overlay store problem \(store_corrupt\)/);
    // S3-H-03: a refused plan writes NO strategy.json (the flag selection is
    // written only inside a successful commit).
    expect(existsSync(join(project, '.lco', 'renewal', 'strategy.json'))).toBe(false);
  });

  it('a foreign-snapshot overlay refuses at plan entry', async () => {
    const { project } = await initProject('planforeign');
    const overlayPath = join(project, '.lco', 'renewal', 'overlay.json');
    const overlay = JSON.parse(readFileSync(overlayPath, 'utf8')) as { snapshot_id: string };
    overlay.snapshot_id = 'RSN-2222222222222222';
    writeFileSync(overlayPath, JSON.stringify(overlay, null, 2));
    const r = await cmdRenewPlan({ dir: project, strategy: 'strangler', strategyRationale: 'x' }, caps());
    expect(r.code).toBe(1);
    expect(r.output).toMatch(/overlay store problem \(store_cross_snapshot\)/);
    expect(r.output).toMatch(/RSN-2222/);
    expect(existsSync(join(project, '.lco', 'renewal', 'strategy.json'))).toBe(false);
  });

  it('a corrupt parity ledger refuses at plan entry', async () => {
    const { project } = await initProject('planpar');
    writeFileSync(join(project, '.lco', 'renewal', 'parity.json'), '[not an object]');
    const r = await cmdRenewPlan({ dir: project, strategy: 'strangler', strategyRationale: 'x' }, caps());
    expect(r.code).toBe(1);
    expect(r.output).toMatch(/parity\.json (is not valid JSON|failed schema validation)/);
  });

  it('a missing snapshot.json refuses at plan entry', async () => {
    const { project } = await initProject('plannosnap');
    rmSync(join(project, '.lco', 'renewal', 'snapshot.json'));
    const r = await cmdRenewPlan({ dir: project }, caps());
    // Trust kernel: the typed identity failure is a refusal (exit 2) from the
    // loadActiveState read view.
    expect(r.code).toBe(2);
    expect(r.output).toMatch(/snapshot missing/);
  });

  it('an unreadable graph refuses at plan (blast radius needs the graph)', async () => {
    const { project } = await initProject('planbadgraph');
    const c = caps({
      provider: () => {
        const g = parseGraphText(readFileSync(join(FIXTURE_SRC, 'graph-fixture.json'), 'utf8'));
        if (!g.ok) throw new Error(g.message);
        const p = new StaticGraphProvider(g.graph, '0.9.50');
        p.graph = (async () => ({ ok: false as const, code: 'graph_invalid' as const, message: 'gone' })) as unknown as typeof p.graph;
        return p;
      },
    });
    const r = await cmdRenewPlan({ dir: project }, c);
    expect(r.code).toBe(1);
    expect(r.output).toMatch(/graph_invalid|graph unreadable/); // either gate — both fail closed
  });
});

describe('review headless arms', () => {
  it('review without --answers/--interactive tells the operator the decisions are human acts', async () => {
    const { project } = await initProject('revnothing');
    const r = await cmdRenewReview({ dir: project }, caps());
    expect(r.code).toBe(2);
    expect(r.output).toMatch(/review requires --answers <file> \(headless\) or --interactive/);
  });

  it('answers that do not match offered options are rejected with the reason', async () => {
    const { project } = await initProject('revbad');
    const answersPath = join(project, 'answers.json');
    writeFileSync(
      answersPath,
      JSON.stringify({ answers: [{ decisionId: 'STG-0001', kind: 'option', selectedOption: 'not-an-offered-strategy' }] }),
    );
    const r = await cmdRenewReview({ dir: project, answersPath }, caps());
    expect(r.code).toBe(1);
    expect(r.output).toMatch(/answers rejected/);
  });

  it('answers for the wrong claim id are rejected', async () => {
    const { project } = await initProject('revwrong');
    const answersPath = join(project, 'answers.json');
    writeFileSync(
      answersPath,
      JSON.stringify({ answers: [{ decisionId: 'PAR-9999', kind: 'option', selectedOption: 'strangler' }] }),
    );
    const r = await cmdRenewReview({ dir: project, answersPath }, caps());
    expect(r.code).toBe(1);
    expect(r.output).toMatch(/answers rejected/);
  });
});

describe('refresh output arm', () => {
  it('refresh on a healthy project succeeds and advertises the supersession', async () => {
    const { project } = await initProject('refreshok');
    const r = await cmdRenewRefresh({ dir: project }, caps());
    expect(r.code).toBe(0);
    expect(r.output).toMatch(/superseded state: overlay\/parity\/strategy archived/);
  });
});

describe('export arms', () => {
  it('export still renders when the graph is unreadable (report without arch view)', async () => {
    const { project } = await initProject('expnograph');
    const c = caps({
      provider: () => {
        const g = parseGraphText(readFileSync(join(FIXTURE_SRC, 'graph-fixture.json'), 'utf8'));
        if (!g.ok) throw new Error(g.message);
        const p = new StaticGraphProvider(g.graph, '0.9.50');
        p.graph = (async () => ({ ok: false as const, code: 'graph_missing' as const, message: 'no graph' })) as unknown as typeof p.graph;
        return p;
      },
    });
    const r = await cmdRenewExport({ dir: project }, c);
    expect(r.code).toBe(0);
    expect(r.output.length).toBeGreaterThan(50);
  });

  it('export refuses (typed, zero writes) when the recorded target no longer exists', async () => {
    const { project, target } = await initProject('expnotarget');
    rmSync(target, { recursive: true, force: true });
    const outside = freshDir('lco-rb-out-');
    const r = await cmdRenewExport({ dir: project, out: join(outside, 'escape.md') }, caps());
    // S2-H-11: the target-identity gate fires before any export path is
    // resolved or written — containment is subsumed by the typed refusal.
    expect(r.code).toBe(2);
    expect(r.output).toMatch(/renewal target missing/);
    expect(existsSync(join(outside, 'escape.md'))).toBe(false);
  });
});
