/**
 * Planner trust invariants at the COMMAND level (TRACK G): fabricated
 * approvals and cross-snapshot inputs cannot freeze a plan (C-08), an
 * unscoped parity entry refuses instead of writing a schema-invalid spec
 * (C-09), and a source mutation during planning writes NOTHING.
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
  cmdRenewPlan,
  cmdRenewReview,
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

function caps(): RenewCapabilities {
  const g = parseGraphText(readFileSync(join(FIXTURE_SRC, 'graph-fixture.json'), 'utf8'));
  if (!g.ok) throw new Error(g.message);
  return {
    nowIso: () => '2026-09-02T12:00:00.000Z',
    provider: () => new StaticGraphProvider(g.graph, '0.9.50'),
    gitCommit: () => undefined,
  };
}

function analyzedProject(): Promise<{ project: string; target: string; caps: RenewCapabilities }> {
  const target = freshDir('lco-pln-target-');
  cpSync(join(FIXTURE_SRC, 'src'), join(target, 'src'), { recursive: true });
  cpSync(join(FIXTURE_SRC, 'package.json'), join(target, 'package.json'));
  const project = freshDir('lco-pln-project-');
  const base = caps();
  const ordersPath = join(target, 'src', 'orders.ts');
  const scripted: LlmAdapter = {
    complete: async (): Promise<LlmResponse> => ({
      text: JSON.stringify({
        hypotheses: [
          {
            id: 'BHV-0001',
            statement: 'Orders under $25 incur a small-order fee.',
            category: 'business_rule',
            confidence: 'high',
            anchors: [{ path: 'src/orders.ts', content_hash: sha(readFileSync(ordersPath)) }],
            rationale: 'source',
          },
        ],
        uncertainties: [],
        coverage_notes: [],
      }),
    }),
  };
  const analyzeCaps: RenewCapabilities = {
    ...base,
    llm: () => singleRoutePlan(scripted, { gateway: 'scripted', providerKind: 'openai-compatible', requestedModel: 'fixture-llm' }),
  };
  return (async () => {
    expect((await cmdRenewInit({ dir: project, target, name: 'pln' }, base)).code).toBe(0);
    expect((await cmdRenewAnalyze({ dir: project }, analyzeCaps)).code).toBe(0);
    return { project, target, caps: base };
  })();
}

/** Headless review that preserves the behavior and selects a strategy. */
async function rulePreserve(project: string, base: RenewCapabilities): Promise<void> {
  const answersPath = join(project, 'answers.json');
  writeFileSync(
    answersPath,
    JSON.stringify({
      answers: [
        { decisionId: 'PAR-0001', kind: 'option', selectedOption: 'Preserve current behavior; verify parity during migration' },
        { decisionId: 'STG-0001', kind: 'option', selectedOption: 'strangler' },
      ],
    }),
  );
  const review = await cmdRenewReview({ dir: project, answersPath }, base);
  expect(review.code).toBe(0);
}

describe('planner trust at the command level (C-08/C-09)', () => {
  it('a fabricated APPR-9999 in a hand-edited parity file refuses to plan', async () => {
    const { project, target, caps: base } = await analyzedProject();
    await rulePreserve(project, base);

    // Hand-edit the ruling to DROP with a FABRICATED approval id.
    const parityPath = join(project, '.lco', 'renewal', 'parity.json');
    const parity = JSON.parse(readFileSync(parityPath, 'utf8')) as {
      records: { id: string; ruling: string; rationale: string; approval_id?: string }[];
    };
    parity.records[0]!.ruling = 'drop';
    parity.records[0]!.rationale = 'hand-written drop';
    parity.records[0]!.approval_id = 'APPR-9999';
    writeFileSync(parityPath, JSON.stringify(parity, null, 2));

    const plan = await cmdRenewPlan({ dir: project }, base);
    expect(plan.code).not.toBe(0);
    expect(plan.output).toMatch(/APPR-9999 does not exist|parity/i);
    expect(existsSync(join(project, 'spec'))).toBe(false);
  });

  it('cross-snapshot strategy refuses to plan (refresh supersession holds)', async () => {
    const { project, caps: base } = await analyzedProject();
    await rulePreserve(project, base);
    // Rewrite the strategy for a FOREIGN snapshot (schema-valid).
    const strategyPath = join(project, '.lco', 'renewal', 'strategy.json');
    const strategy = JSON.parse(readFileSync(strategyPath, 'utf8')) as { snapshot_id: string };
    strategy.snapshot_id = 'RSN-ffffffffffffffff';
    writeFileSync(strategyPath, JSON.stringify(strategy, null, 2));
    const plan = await cmdRenewPlan({ dir: project }, base);
    expect(plan.code).not.toBe(0);
    expect(plan.output).toMatch(/strategy .*snapshot|input_mismatch/);
    expect(existsSync(join(project, 'spec'))).toBe(false);
  });

  it('a parity entry with NO code anchors refuses (unscoped_tasks) — nothing written, non-zero exit', async () => {
    const { project, caps: base } = await analyzedProject();
    await rulePreserve(project, base);
    // Strip the code anchor: the ruling keeps only user-decision evidence.
    const parityPath = join(project, '.lco', 'renewal', 'parity.json');
    const parity = JSON.parse(readFileSync(parityPath, 'utf8')) as {
      records: { id: string; evidence: unknown[] }[];
    };
    parity.records[0]!.evidence = [{ kind: 'user_decision', claim_id: 'UNC-0001' }];
    writeFileSync(parityPath, JSON.stringify(parity, null, 2));

    const plan = await cmdRenewPlan({ dir: project }, base);
    expect(plan.code).not.toBe(0);
    expect(plan.output).toMatch(/unscoped_tasks|code_anchor/);
    expect(existsSync(join(project, 'spec'))).toBe(false);
  });

  it('a healthy state plans, and the written bundle compiles (no invalid-spec writes)', async () => {
    const { project, caps: base } = await analyzedProject();
    await rulePreserve(project, base);
    const plan = await cmdRenewPlan({ dir: project }, base);
    expect(plan.code).toBe(0);
    expect(existsSync(join(project, 'spec', 'tasks.json'))).toBe(true);
  });

  it('a source mutation DURING planning writes NOTHING (pre-write recheck)', async () => {
    const { project, target, caps: base } = await analyzedProject();
    await rulePreserve(project, base);
    // Wrap the provider so the graph read (mid-plan) triggers a target mutation.
    const g = parseGraphText(readFileSync(join(FIXTURE_SRC, 'graph-fixture.json'), 'utf8'));
    if (!g.ok) throw new Error(g.message);
    let mutated = false;
    const sabotaged = new StaticGraphProvider(g.graph, '0.9.50');
    const origGraph = sabotaged.graph.bind(sabotaged);
    sabotaged.graph = async () => {
      if (!mutated) {
        mutated = true;
        writeFileSync(join(target, 'src', 'inventory.ts'), 'export const MID_PLAN = 1;\n');
      }
      return origGraph();
    };
    const plan = await cmdRenewPlan({ dir: project }, { ...base, provider: () => sabotaged });
    expect(plan.code).not.toBe(0);
    expect(plan.output).toMatch(/changed during planning|stale/);
    expect(existsSync(join(project, 'spec'))).toBe(false);
  });
});
