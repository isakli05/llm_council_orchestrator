import { describe, expect, it, afterEach } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  cmdRenewInit,
  cmdRenewAnalyze,
  cmdRenewReview,
  cmdRenewPlan,
  cmdRenewStatus,
  type RenewCapabilities,
} from '../../cli/commands/renew';
import { StaticGraphProvider } from '../intel/fixture-provider';
import { parseGraphText } from '../intel/graph-reader';
import { singleRoutePlan } from '../../llm/plan';
import type { LlmAdapter, LlmResponse } from '../../eval/llm/adapter';
import { loadActiveState } from './state';

/**
 * TRUST KERNEL — Phase 10: the CONCURRENCY CONTRACT at the command level.
 *
 * Deterministic interleaving only (the scripted LLM's complete() gates on a
 * barrier we release at the chosen interleaving point — never sleep races).
 * The asserted property in every scenario: NO SILENT LOST VALID UPDATE —
 * either both writers' effects are present, or the second writer fails with
 * a typed refusal naming the conflict.
 */

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
  tmpDirs.length = 0;
});

const FIXTURE_SRC = join(__dirname, '..', '..', '..', 'fixtures', 'legacy-app');

function fixtureGraph(): string {
  return readFileSync(join(FIXTURE_SRC, 'graph-fixture.json'), 'utf8');
}

/** A scripted adapter whose paid call BLOCKS on a gate until we release it. */
function gatedLlm(gate: { released: Promise<void>; release: () => void }, makeText: (prompt: string) => string): LlmAdapter {
  return {
    async complete(prompt: string): Promise<LlmResponse> {
      await gate.released;
      return { text: makeText(prompt), usage: { in_tokens: 1, out_tokens: 1 }, attempts: 1, latencyMs: 1 };
    },
  };
}

function ctxWindow(prompt: string, path: string): { id: string; start: number; end: number } {
  const m = new RegExp(`(CTX-\\d{4}) → ${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} lines (\\d+)-(\\d+)`).exec(prompt);
  if (m === null) throw new Error(`no citable context for ${path}`);
  return { id: m[1]!, start: Number(m[2]), end: Number(m[3]) };
}

const OUTPUT = (prompt: string) => {
  const orders = ctxWindow(prompt, 'src/orders.ts');
  return JSON.stringify({
    hypotheses: [
      {
        id: 'BHV-0001',
        statement: 'Orders under $25 incur a $4.95 small-order fee.',
        category: 'business_rule',
        confidence: 'high',
        anchors: [{ context_id: orders.id, start_line: orders.start, end_line: orders.end - 1 }],
        rationale: 'seen',
      },
    ],
    uncertainties: [
      {
        id: 'UNC-0001',
        question: 'Should the fee survive unchanged?',
        impact: 'medium',
        options: [{ option: 'Preserve the fee exactly' }, { option: 'Revisit the threshold' }],
        anchors: [{ context_id: orders.id, start_line: orders.start, end_line: orders.end - 1 }],
      },
    ],
    coverage_notes: [],
  });
};

function makeGate(): { released: Promise<void>; release: () => void } {
  let release!: () => void;
  const released = new Promise<void>((r) => {
    release = r;
  });
  return { released, release };
}

function capsWith(llm: LlmAdapter, graphText: string): RenewCapabilities {
  const parsed = parseGraphText(graphText);
  if (!parsed.ok) throw new Error(parsed.message);
  return {
    nowIso: () => '2026-09-03T00:00:00Z',
    provider: () => new StaticGraphProvider(parsed.graph, '0.9.50'),
    gitCommit: () => undefined,
    llm: () => singleRoutePlan(llm, { gateway: 'scripted', providerKind: 'openai-compatible', requestedModel: 'fixture-llm' }),
  };
}

async function freshReviewedProject(): Promise<{ project: string; target: string; graph: string }> {
  const target = mkdtempSync(join(tmpdir(), 'lco-conc-target-'));
  tmpDirs.push(target);
  cpSync(join(FIXTURE_SRC, 'src'), join(target, 'src'), { recursive: true });
  cpSync(join(FIXTURE_SRC, 'package.json'), join(target, 'package.json'));
  const project = mkdtempSync(join(tmpdir(), 'lco-conc-project-'));
  tmpDirs.push(project);
  const graph = fixtureGraph();
  // init + analyze + review(preserve) so a HUMAN RULING exists to protect.
  const ungated: LlmAdapter = {
    async complete(prompt) {
      return { text: OUTPUT(prompt), usage: { in_tokens: 1, out_tokens: 1 }, attempts: 1, latencyMs: 1 };
    },
  };
  const caps = capsWith(ungated, graph);
  expect((await cmdRenewInit({ dir: project, target }, caps)).code).toBe(0);
  expect((await cmdRenewAnalyze({ dir: project }, caps)).code).toBe(0);
  const answersPath = join(project, 'answers.json');
  writeFileSync(
    answersPath,
    JSON.stringify({
      answers: [
        { decisionId: 'UNC-0001', kind: 'option', selectedOption: 'Preserve the fee exactly' },
        { decisionId: 'PAR-0001', kind: 'option', selectedOption: 'preserve' },
        { decisionId: 'STG-0001', kind: 'option', selectedOption: 'in_place' },
      ],
    }),
  );
  expect((await cmdRenewReview({ dir: project, answersPath }, caps)).code).toBe(0);
  return { project, target, graph };
}

describe('Phase 10 — deterministic interleavings (no silent lost updates)', () => {
  it('analyze ↔ review: a human ruling made during the paid call SURVIVES the fold (and both effects land)', async () => {
    // Base project WITH analysis but WITHOUT review; a second analyze's paid
    // call is in flight (gated) while the human reviews.
    const target = mkdtempSync(join(tmpdir(), 'lco-conc2-target-'));
    tmpDirs.push(target);
    cpSync(join(FIXTURE_SRC, 'src'), join(target, 'src'), { recursive: true });
    cpSync(join(FIXTURE_SRC, 'package.json'), join(target, 'package.json'));
    const project = mkdtempSync(join(tmpdir(), 'lco-conc2-project-'));
    tmpDirs.push(project);
    const graph = fixtureGraph();
    const ungated: LlmAdapter = {
      async complete(prompt) {
        return { text: OUTPUT(prompt), usage: { in_tokens: 1, out_tokens: 1 }, attempts: 1, latencyMs: 1 };
      },
    };
    const caps0 = capsWith(ungated, graph);
    expect((await cmdRenewInit({ dir: project, target }, caps0)).code).toBe(0);
    expect((await cmdRenewAnalyze({ dir: project }, caps0)).code).toBe(0);

    // Second analyze with a GATED paid call.
    const gate = makeGate();
    const gatedCaps = capsWith(gatedLlm(gate, OUTPUT), graph);
    const analyzePromise = cmdRenewAnalyze({ dir: project }, gatedCaps);

    // While the paid call is blocked, the human rules (headless review).
    const answersPath = join(project, 'answers2.json');
    writeFileSync(
      answersPath,
      JSON.stringify({
        answers: [
          { decisionId: 'UNC-0001', kind: 'option', selectedOption: 'Preserve the fee exactly' },
          { decisionId: 'PAR-0001', kind: 'option', selectedOption: 'preserve' },
          { decisionId: 'STG-0001', kind: 'option', selectedOption: 'in_place' },
        ],
      }),
    );
    const review = await cmdRenewReview({ dir: project, answersPath }, caps0);
    expect(review.code, review.output).toBe(0);

    // Release the paid call; the fold must land ADDITIVELY (idempotent by
    // behavior) and NEVER revert the human ruling.
    gate.release();
    const analyze = await analyzePromise;
    expect(analyze.code, analyze.output).toBe(0);

    const state = loadActiveState(project);
    if (!state.parity.ok) throw new Error('parity');
    const entry = state.parity.store.records.find((r) => r.behavior.includes('small-order fee'));
    expect(entry, 'the re-analysis fold landed').toBeDefined();
    expect(entry!.ruling).toBe('preserve'); // HUMAN RULING SURVIVED
    expect(entry!.support_status).toBe('human_confirmed');
  });

  it('plan ↔ human update: any trusted mutation during planning refuses the plan (typed, nothing written)', async () => {
    const { project, target, graph } = await freshReviewedProject();
    // Plan reads state, then (in its work phase) we mutate trusted state.
    // The plan must refuse with stale_revision/snapshot_superseded semantics
    // and write NOTHING (no spec/, no strategy.json).
    const before = loadActiveState(project);

    // We cannot inject a hook into plan's internals; instead we mutate the
    // revision BEFORE the commit by racing via a provider whose graph() call
    // bumps state once (the plan's work phase awaits provider().graph()).
    const parsed = parseGraphText(graph);
    if (!parsed.ok) throw new Error(parsed.message);
    const racingProvider = new StaticGraphProvider(parsed.graph, '0.9.50');
    const caps: RenewCapabilities = {
      nowIso: () => '2026-09-03T00:00:00Z',
      provider: () => racingProvider,
      gitCommit: () => undefined,
      llm: () => {
        throw new Error('plan is offline');
      },
    };
    // Simulate the mid-plan trusted mutation by bumping the revision exactly
    // between plan's read view and its commit: wrap provider.graph via a
    // one-shot side effect on first call after plan starts.
    let armed = true;
    const origGraph = racingProvider.graph.bind(racingProvider);
    racingProvider.graph = async () => {
      if (armed) {
        armed = false;
        const { withRenewalWriterLock, bumpStateRevisionTrusted } = await import('./state');
        await withRenewalWriterLock(project, '2026-09-03T00:00:05Z', () => {
          bumpStateRevisionTrusted(project);
        });
      }
      return origGraph();
    };

    const plan = await cmdRenewPlan({ dir: project }, caps);
    expect(plan.code, plan.output).toBe(1);
    expect(plan.output).toMatch(/changed during planning|stale|re-run/i);
    expect(require('node:fs').existsSync(join(project, 'spec'))).toBe(false);
    const after = loadActiveState(project);
    expect(after.identity.revision).toBe(before.identity.revision + 1); // the human-side mutation stands
    expect(after.identity.snapshotId).toBe(before.identity.snapshotId);
    void target;
  });

  it('refresh ↔ analyze: an in-flight paid analysis over a refreshed epoch refuses promotion (superseded)', async () => {
    const { project, target, graph } = await freshReviewedProject();
    // Refresh needs a REAL content change to alter the snapshot identity.
    writeFileSync(join(target, 'src', 'mid-flight.ts'), 'export const midFlight = 1;\n');
    const gate = makeGate();
    const gatedCaps = capsWith(gatedLlm(gate, OUTPUT), graph);

    const analyzePromise = cmdRenewAnalyze({ dir: project }, gatedCaps);
    // While the paid call is blocked, a REFRESH lands (new epoch).
    const refreshCaps = capsWith(
      {
        async complete(prompt) {
          return { text: OUTPUT(prompt), usage: { in_tokens: 1, out_tokens: 1 }, attempts: 1, latencyMs: 1 };
        },
      },
      graph,
    );
    const refresh = await (await import('../../cli/commands/renew')).cmdRenewRefresh({ dir: project }, refreshCaps);
    expect(refresh.code, refresh.output).toBe(0);

    gate.release();
    const analyze = await analyzePromise;
    // The pre-refresh read view cannot fold into the new epoch.
    expect(analyze.code).toBe(1);
    expect(analyze.output).toMatch(/superseded|refused|promotion/i);
    // And the new epoch's stores are the refresh's empty ones (no cross-epoch fold).
    const state = loadActiveState(project);
    if (!state.parity.ok) throw new Error('parity');
    expect(state.parity.store.records).toEqual([]);
  });

  it('two concurrent interactive writers: the lock refuses the second (never merges, never overwrites)', async () => {
    const { project } = await freshReviewedProject();
    const { withRenewalWriterLock, bumpStateRevisionTrusted } = await import('./state');
    const first = withRenewalWriterLock(project, '2026-09-03T00:00:10Z', async () => {
      const second = await withRenewalWriterLock(project, '2026-09-03T00:00:10Z', () => 'should not run').then(
        () => 'ran',
        (e: Error) => e.message,
      );
      expect(second).toMatch(/locked by another writer/);
      bumpStateRevisionTrusted(project);
    });
    await expect(first).resolves.toBeUndefined();
    const status = await cmdRenewStatus({ dir: project }, capsWith(
      {
        async complete(prompt) {
          return { text: OUTPUT(prompt), usage: { in_tokens: 1, out_tokens: 1 }, attempts: 1, latencyMs: 1 };
        },
      },
      fixtureGraph(),
    ));
    expect(status.code).toBe(0);
  });
});
