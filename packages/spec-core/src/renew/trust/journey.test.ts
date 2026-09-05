import { describe, expect, it, afterEach } from 'vitest';
import { cpSync, lstatSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  cmdRenewInit,
  cmdRenewRefresh,
  cmdRenewStatus,
  cmdRenewAnalyze,
  cmdRenewReview,
  cmdRenewPlan,
  cmdRenewExport,
  type RenewCapabilities,
} from '../../cli/commands/renew';
import { StaticGraphProvider } from '../intel/fixture-provider';
import { parseGraphText } from '../intel/graph-reader';
import { singleRoutePlan } from '../../llm/plan';
import type { LlmAdapter, LlmResponse } from '../../eval/llm/adapter';

/**
 * TRUST KERNEL — Phase 9: the FULL deterministic renewal journey on the
 * fixture app with a SCRIPTED LLM (zero paid calls): init → analyze → review
 * → plan → freeze → export → status → refresh → analyze → status → export.
 * Verifies target byte/mode/symlink identity across the whole journey,
 * active/historical lineage, status/export truth, authority lineage, citation
 * semantics, and state revisions.
 */

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
  tmpDirs.length = 0;
});

const FIXTURE_SRC = join(__dirname, '..', '..', '..', 'fixtures', 'legacy-app');
const sha = (s: string | Buffer) => `sha256:${createHash('sha256').update(s).digest('hex')}`;

/** Full tree inventory: rel → kind/nlink/mode/bytes (identity proof). */
function inventory(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string, rel: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = join(dir, e.name);
      const r = rel === '' ? e.name : `${rel}/${e.name}`;
      const st = lstatSync(p);
      if (st.isSymbolicLink()) out[r] = `SYMLINK:${st.mode.toString(8)}`;
      else if (st.isDirectory()) {
        out[r] = `DIR:${st.mode.toString(8)}`;
        walk(p, r);
      } else out[r] = `FILE:${st.nlink}n:${st.mode.toString(8)}:${sha(readFileSync(p))}`;
    }
  };
  walk(root, '');
  return out;
}

function fixtureGraphText(): string {
  return readFileSync(join(FIXTURE_SRC, 'graph-fixture.json'), 'utf8');
}

/** The citable context window the prompt advertised for a fixture file. */
function ctxWindow(prompt: string, path: string): { id: string; start: number; end: number } {
  const m = new RegExp(`(CTX-\\d{4}) → ${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} lines (\\d+)-(\\d+)`).exec(prompt);
  if (m === null) throw new Error(`no citable context for ${path} in the recovery prompt`);
  return { id: m[1]!, start: Number(m[2]), end: Number(m[3]) };
}

/** A citation narrowed to the advertised window's interior (never its boundary). */
const interiorCitation = (w: { id: string; start: number; end: number }) => ({
  context_id: w.id,
  start_line: w.start,
  end_line: w.end - 1,
});

function capsWith(llm: LlmAdapter, graphText: string, version = '0.9.50'): RenewCapabilities {
  const parsed = parseGraphText(graphText);
  if (!parsed.ok) throw new Error(parsed.message);
  const provider = new StaticGraphProvider(parsed.graph, version);
  return {
    nowIso: () => '2026-09-03T00:00:00Z',
    provider: () => provider,
    gitCommit: () => undefined,
    llm: () => singleRoutePlan(llm, { gateway: 'scripted', providerKind: 'openai-compatible', requestedModel: 'fixture-llm' }),
  };
}

/**
 * Scripted adapter for the CITATION contract: the model sees the CITABLE
 * CONTEXTS table and cites CTX ids (optionally narrowing inside the supplied
 * window). First call cites honestly; a `mode` switch can make it misbehave.
 */
function scriptedCitingLlm(handler: (call: number, prompt: string) => string): LlmAdapter {
  let calls = 0;
  return {
    async complete(prompt: string): Promise<LlmResponse> {
      calls += 1;
      const text = handler(calls, prompt);
      return {
        text,
        usage: { in_tokens: 10, out_tokens: 10 },
        attempts: 1,
        latencyMs: 1,
      };
    },
  };
}

const CONFORMING_OUTPUT = (orders: { id: string; start: number; end: number }, pricing: { id: string; start: number; end: number }) =>
  JSON.stringify({
    hypotheses: [
      {
        id: 'BHV-0001',
        statement: 'Orders with a pre-discount subtotal under $25 incur a $4.95 small-order fee.',
        category: 'business_rule',
        confidence: 'high',
        anchors: [interiorCitation(orders)],
        rationale: 'SMALL_ORDER_FEE applied when subtotal < 25 in createOrder.',
      },
      {
        id: 'BHV-0002',
        statement: 'Volume discounts: 15% at $500, 10% at $100, 5% at $50 (first tier wins).',
        category: 'business_rule',
        confidence: 'high',
        anchors: [interiorCitation(pricing)],
        rationale: 'DISCOUNT_TIERS scanned in applyDiscount.',
      },
    ],
    uncertainties: [
      {
        id: 'UNC-0001',
        question: 'Should the small-order fee survive modernization unchanged?',
        impact: 'medium',
        options: [{ option: 'Preserve the fee exactly' }, { option: 'Revisit the threshold' }],
        anchors: [interiorCitation(orders)],
      },
    ],
    coverage_notes: [],
  });

describe('Phase 9 — full journey (scripted LLM, zero paid calls)', () => {
  it('init → analyze → review → plan --freeze → export → status → refresh → analyze → status → export; target untouched throughout', async () => {
    const target = mkdtempSync(join(tmpdir(), 'lco-journey-target-'));
    tmpDirs.push(target);
    cpSync(join(FIXTURE_SRC, 'src'), join(target, 'src'), { recursive: true });
    cpSync(join(FIXTURE_SRC, 'package.json'), join(target, 'package.json'));
    const targetBefore = inventory(target);

    const project = mkdtempSync(join(tmpdir(), 'lco-journey-project-'));
    tmpDirs.push(project);
    const graphText = fixtureGraphText();

    // Scripted model: cite the advertised windows honestly (interior narrows).
    const llm = scriptedCitingLlm((_call, prompt) => {
      const ordersCtx = ctxWindow(prompt, 'src/orders.ts');
      const pricingCtx = ctxWindow(prompt, 'src/pricing.ts');
      return CONFORMING_OUTPUT(ordersCtx, pricingCtx);
    });
    const caps = capsWith(llm, graphText);

    // 1. init
    const init = await cmdRenewInit({ dir: project, target, name: 'journey' }, caps);
    expect(init.code).toBe(0);

    // 2. analyze (scripted)
    const analyze = await cmdRenewAnalyze({ dir: project }, caps);
    expect(analyze.code).toBe(0);
    expect(analyze.output).toContain('provenance-verified');

    // 3. review (headless answers: rule PAR-0001 preserve, answer UNC-0001)
    const answersPath = join(project, 'answers.json');
    writeFileSync(
      answersPath,
      JSON.stringify({
        // Answers use the round's own option strings; the UNC answer is
        // informational, every parity entry is asked and ruled canonically
        // (S2-C-05), and the strategy is a workspace human act (S3-H-08).
        answers: [
          { decisionId: 'UNC-0001', kind: 'option', selectedOption: 'Preserve the fee exactly' },
          { decisionId: 'PAR-0001', kind: 'option', selectedOption: 'preserve' },
          { decisionId: 'PAR-0002', kind: 'option', selectedOption: 'preserve' },
          { decisionId: 'STG-0001', kind: 'option', selectedOption: 'in_place' },
        ],
      }),
    );
    const review = await cmdRenewReview({ dir: project, answersPath }, caps);
    expect(review.code, `review output: ${review.output}`).toBe(0);
    expect(review.output).toContain('review approved');

    // 4. plan --freeze (needs a strategy: via --strategy with rationale)
    // The workspace already selected a strategy via STG-0001 (approval-bound);
    // plan --freeze runs WITHOUT --strategy: the workspace selection is the
    // human act, and the plan verifies its authority lineage.
    const plan = await cmdRenewPlan({ dir: project, freeze: true }, caps);
    expect(plan.code).toBe(0);
    expect(plan.output).toContain('plan written');

    // 5. export
    const out = join(project, 'report.md');
    const exportResult = await cmdRenewExport({ dir: project, out }, caps);
    expect(exportResult.code).toBe(0);
    expect(readFileSync(out, 'utf8')).toContain('# Modernization report');
    expect(readFileSync(out, 'utf8')).toContain('preserve');

    // 6. status
    const status1 = await cmdRenewStatus({ dir: project }, caps);
    expect(status1.code).toBe(0);
    expect(status1.output).toContain('parity: 2 preserve');
    expect(status1.output).toContain('spec/ present');

    // TARGET IDENTITY so far: bytes, modes, symlinks untouched.
    expect(inventory(target)).toEqual(targetBefore);

    // 7. refresh (explicit epoch change) — spec archived too (S3-H-04)
    writeFileSync(join(target, 'src', 'drift.ts'), 'export const drift = 1;\n');
    const targetAfterDrift = inventory(target);
    const refresh = await cmdRenewRefresh({ dir: project }, caps);
    expect(refresh.code).toBe(0);
    expect(refresh.output).toContain('superseded state: overlay/parity/strategy/spec archived');
    // S3-H-04: the spec archive lands BESIDE the spec dir at the project
    // root (spec.<old-snapshot>.superseded); store archives sit under
    // .lco/renewal. Both classes must be present.
    const { renewalPaths } = await import('../project/project');
    void renewalPaths;
    const storeArchived = readdirSync(join(project, '.lco', 'renewal')).filter((f) => f.includes('.superseded'));
    const specArchived = readdirSync(project).filter((f) => /^spec\..*\.superseded$/.test(f));
    expect(storeArchived.length).toBeGreaterThanOrEqual(3);
    expect(specArchived.length).toBe(1);

    // 8. analyze again on the new epoch (scripted cites fresh context)
    const analyze2 = await cmdRenewAnalyze({ dir: project }, caps);
    expect(analyze2.code).toBe(0);

    // 9. status — the new epoch's state is current; history retained
    const status2 = await cmdRenewStatus({ dir: project }, caps);
    expect(status2.code).toBe(0);
    expect(status2.output).toContain('analyses: 1 active (2 total, cross-snapshot history retained)');

    // 10. export again — history labeled, current empty of rulings
    const out2 = join(project, 'report2.md');
    const export2 = await cmdRenewExport({ dir: project, out: out2 }, caps);
    expect(export2.code).toBe(0);
    const report2 = readFileSync(out2, 'utf8');
    expect(report2).toContain('Historical analyses (prior snapshots — NOT current state)');
    expect(report2).toContain('AN-0001 (snapshot');

    // TARGET IDENTITY across the entire journey (only the drift write we made).
    expect(inventory(target)).toEqual(targetAfterDrift);
  });

  it('a model claiming lines OUTSIDE the supplied window is rejected (T3-1 forever)', async () => {
    const target = mkdtempSync(join(tmpdir(), 'lco-t31-target-'));
    tmpDirs.push(target);
    cpSync(join(FIXTURE_SRC, 'src'), join(target, 'src'), { recursive: true });
    cpSync(join(FIXTURE_SRC, 'package.json'), join(target, 'package.json'));
    const project = mkdtempSync(join(tmpdir(), 'lco-t31-project-'));
    tmpDirs.push(project);
    const graphText = fixtureGraphText();

    // The scripted model grabs the supplied window from the table and cites
    // lines STRICTLY OUTSIDE it (the T3-1 attack: window w1..w2, claim an
    // unrelated range beyond w2 — no matter the exact window, choose a range
    // that cannot be inside any ≤200-line window at line 1 unless the file
    // is that long; safest: pick lines from the FAR END by claiming 999999).
    const llm = scriptedCitingLlm((_c, prompt) => {
      const m = /CTX-\d{4} → \S+ lines (\d+)-(\d+)/.exec(prompt);
      expect(m).not.toBeNull();
      const end = Number(m![2]);
      return JSON.stringify({
        hypotheses: [
          {
            id: 'BHV-0001',
            statement: 'Fabricated claim anchored outside the supplied window.',
            category: 'business_rule',
            confidence: 'high',
            anchors: [{ context_id: 'CTX-0001', start_line: end + 50, end_line: end + 51 }],
            rationale: 'never shown these lines',
          },
        ],
        uncertainties: [],
        coverage_notes: [],
      });
    });
    const caps = capsWith(llm, graphText);
    const init = await cmdRenewInit({ dir: project, target }, caps);
    expect(init.code).toBe(0);
    const analyze = await cmdRenewAnalyze({ dir: project }, caps);
    // The dishonest citation rejects the hypothesis; nothing promoted.
    expect(analyze.output).toContain('1 rejected (anchor failures)');
    const { loadActiveState } = await import('./state');
    const state = loadActiveState(project);
    if (!state.parity.ok) throw new Error('parity missing');
    expect(state.parity.store.records).toEqual([]);
  });
});
