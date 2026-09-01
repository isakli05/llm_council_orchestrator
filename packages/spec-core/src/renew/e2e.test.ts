/**
 * Legacy Renewal V1 end-to-end on the fixture app (offline except the
 * SCRIPTED LLM): init → analyze → review (headless answers) → plan --freeze
 * → export, plus staleness refusal and target-immutability proof.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cmdRenewInit, cmdRenewStatus, cmdRenewAnalyze, cmdRenewReview, cmdRenewPlan, cmdRenewExport, type RenewCapabilities } from '../cli/commands/renew';
import { StaticGraphProvider } from './intel/fixture-provider';
import { parseGraphText } from './intel/graph-reader';
import { singleRoutePlan } from '../llm/plan';
import type { LlmAdapter, LlmResponse } from '../eval/llm/adapter';

const tmpDirs: string[] = [];
function freshDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
  tmpDirs.length = 0;
});

const sha = (s: string | Buffer) => `sha256:${createHash('sha256').update(s).digest('hex')}`;
const FIXTURE_SRC = join(__dirname, '..', '..', 'fixtures', 'legacy-app');

function dirHash(root: string): string {
  const parts: string[] = [];
  const walk = (dir: string, rel: string) => {
    for (const f of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const r = rel === '' ? f.name : `${rel}/${f.name}`;
      if (f.isDirectory()) walk(join(dir, f.name), r);
      else parts.push(`${r}:${sha(readFileSync(join(dir, f.name)))}`);
    }
  };
  walk(root, '');
  return sha(parts.join('\n'));
}

describe('renewal V1 end-to-end (fixture app, scripted LLM, injected provider)', () => {
  it('init → analyze → review → plan --freeze → export; target untouched; staleness enforced', async () => {
    const target = freshDir('lco-e2e-target-');
    cpSync(join(FIXTURE_SRC, 'src'), join(target, 'src'), { recursive: true });
    cpSync(join(FIXTURE_SRC, 'package.json'), join(target, 'package.json'));
    const targetBefore = dirHash(target);

    const project = freshDir('lco-e2e-project-');

    // Injected capabilities: fixture graph provider, scripted LLM, fixed clock.
    const graphText = readFileSync(join(FIXTURE_SRC, 'graph-fixture.json'), 'utf8');
    const graphParsed = parseGraphText(graphText);
    if (!graphParsed.ok) throw new Error(graphParsed.message);
    const provider = new StaticGraphProvider(graphParsed.graph, '0.9.50');

    let llmCalls = 0;
    const scripted: LlmAdapter = {
      complete: async (): Promise<LlmResponse> => {
        llmCalls++;
        // Ground-truth hypotheses R1/R2 + one uncertainty, anchored to the
        // REAL fixture bytes (hashes computed from the copied target).
        const orders = readFileSync(join(target, 'src', 'orders.ts'), 'utf8');
        const pricing = readFileSync(join(target, 'src', 'pricing.ts'), 'utf8');
        return {
          text: JSON.stringify({
            hypotheses: [
              {
                id: 'BHV-0001',
                statement: 'Orders with a pre-discount subtotal under $25 incur a $4.95 small-order fee.',
                category: 'business_rule',
                confidence: 'high',
                anchors: [{ path: 'src/orders.ts', content_hash: sha(orders) }],
                rationale: 'SMALL_ORDER_FEE applied when subtotal < 25 in createOrder.',
              },
              {
                id: 'BHV-0002',
                statement: 'Volume discounts: 15% at $500, 10% at $100, 5% at $50 (first tier wins).',
                category: 'business_rule',
                confidence: 'high',
                anchors: [{ path: 'src/pricing.ts', content_hash: sha(pricing) }],
                rationale: 'DISCOUNT_TIERS scanned in applyDiscount.',
              },
            ],
            uncertainties: [
              {
                id: 'UNC-0001',
                question: 'Should the small-order fee survive modernization unchanged?',
                impact: 'medium',
                options: [{ option: 'Preserve the fee exactly' }, { option: 'Revisit the threshold' }],
                anchors: [{ path: 'src/orders.ts', content_hash: sha(orders) }],
              },
            ],
            coverage_notes: ['tax rounding covered only partially'],
          }),
          usage: { in_tokens: 850, out_tokens: 420 },
        };
      },
    };

    const caps: RenewCapabilities = {
      nowIso: () => '2026-09-02T12:00:00.000Z',
      provider: () => provider,
      gitCommit: () => undefined, // plain tree — explicit, never fabricated
      llm: () => singleRoutePlan(scripted, { gateway: 'scripted', providerKind: 'openai-compatible', requestedModel: 'fixture-llm' }),
    };

    // 1. init — offline, writes only LCO-owned state
    const init = await cmdRenewInit({ dir: project, target, name: 'orders-crm' }, caps);
    expect(init.code).toBe(0);
    expect(init.output).toMatch(/snapshot RSN-/);
    expect(existsSync(join(project, '.lco', 'renewal', 'snapshot.json'))).toBe(true);

    // 2. analyze — PAID; scripted LLM; anchors must verify against the real target
    const analyze = await cmdRenewAnalyze({ dir: project }, caps);
    expect(analyze.code).toBe(0);
    expect(analyze.output).toMatch(/2 hypothesis\(ies\) verified, 1 question\(s\)/);
    expect(llmCalls).toBe(1);
    expect(existsSync(join(project, '.lco', 'renewal', 'analyses', 'AN-0001.json'))).toBe(true);

    // 3. status shows the open question + unresolved parity
    const status1 = await cmdRenewStatus({ dir: project }, caps);
    expect(status1.output).toMatch(/1 open question/);
    expect(status1.output).toMatch(/2 UNRESOLVED/);

    // 4. review (headless answers: preserve the fee; strategy strangler)
    const answersFile = join(project, 'answers.json');
    writeFileSync(
      answersFile,
      JSON.stringify({
        answers: [
          { decisionId: 'UNC-0001', kind: 'option', selectedOption: 'Preserve the fee exactly' },
          { decisionId: 'PAR-0002', kind: 'option', selectedOption: 'Preserve current behavior; verify parity during migration' },
          { decisionId: 'STG-0001', kind: 'option', selectedOption: 'strangler' },
        ],
      }),
    );
    const review = await cmdRenewReview({ dir: project, answersPath: answersFile }, caps);
    expect(review.code).toBe(0);
    expect(review.output).toMatch(/APPR-0001/);
    expect(existsSync(join(project, 'approvals', 'APPR-0001.json'))).toBe(true);
    expect(existsSync(join(project, '.lco', 'renewal', 'strategy.json'))).toBe(true);

    // 5. plan --freeze — deterministic; lint/topo/L12 inside; frozen revision
    const plan = await cmdRenewPlan({ dir: project, freeze: true }, caps);
    expect(plan.code).toBe(0);
    expect(plan.output).toMatch(/plan written/);
    expect(plan.output).toMatch(/frozen/);
    expect(existsSync(join(project, 'spec', 'manifest.json'))).toBe(true);
    expect(plan.output).not.toMatch(/UNRESOLVED/);

    // 6. export renders validated state only
    const report = join(project, 'modernization-report.md');
    const exported = await cmdRenewExport({ dir: project, out: report }, caps);
    expect(exported.code).toBe(0);
    const text = readFileSync(report, 'utf8');
    expect(text).toContain('# Modernization report — orders-crm');
    expect(text).toContain('small-order fee');
    expect(text).toContain('strangler');
    expect(text).toMatch(/\*\*preserve\*\*/);

    // 7. the analyzed target repository is byte-identical
    expect(dirHash(target)).toBe(targetBefore);

    // 8. staleness: mutate the target → status flags, analyze/plan refuse
    writeFileSync(join(target, 'src', 'pricing.ts'), readFileSync(join(target, 'src', 'pricing.ts'), 'utf8') + '\n// drifted\n');
    const status2 = await cmdRenewStatus({ dir: project }, caps);
    expect(status2.output).toMatch(/stale/);
    expect(status2.output).toMatch(/file_changed/);
    const analyze2 = await cmdRenewAnalyze({ dir: project }, caps);
    expect(analyze2.code).toBe(1);
    expect(analyze2.output).toMatch(/analyze refused: renewal snapshot is stale/);
    expect(analyze2.output).toMatch(/lco renew refresh/);
    const callsBefore = llmCalls;
    expect(llmCalls).toBe(callsBefore); // refusal made ZERO LLM calls
    const plan2 = await cmdRenewPlan({ dir: project }, caps);
    expect(plan2.code).toBe(1);
    expect(plan2.output).toMatch(/snapshot is stale/);

    // 9. refresh re-snapshots; the journey can continue
    const { cmdRenewRefresh } = await import('../cli/commands/renew');
    const refresh = await cmdRenewRefresh({ dir: project }, caps);
    expect(refresh.code).toBe(0);
  }, 120_000);

  it('analyze without an LLM route makes ZERO calls and says so', async () => {
    const target = freshDir('lco-e2e-target-');
    cpSync(join(FIXTURE_SRC, 'src'), join(target, 'src'), { recursive: true });
    cpSync(join(FIXTURE_SRC, 'package.json'), join(target, 'package.json'));
    const project = freshDir('lco-e2e-project-');
    const graphParsed = parseGraphText(readFileSync(join(FIXTURE_SRC, 'graph-fixture.json'), 'utf8'));
    if (!graphParsed.ok) throw new Error(graphParsed.message);
    const caps: RenewCapabilities = {
      nowIso: () => '2026-09-02T12:00:00.000Z',
      provider: () => new StaticGraphProvider(graphParsed.graph, '0.9.50'),
      gitCommit: () => undefined,
    };
    await cmdRenewInit({ dir: project, target, name: 'x' }, caps);
    const r = await cmdRenewAnalyze({ dir: project }, caps);
    expect(r.code).toBe(2);
    expect(r.output).toMatch(/ZERO calls/);
  });
});
