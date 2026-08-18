import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { SpecBundleSchema } from '../schemas';
import type { SpecBundle } from '../schemas';
import { lintBundle } from '../lint/engine';
import { freeze } from '../compiler/freeze';
import { verifyFrozen } from '../compiler/verify';
import { scoreRun } from './score';
import type { RunScore } from './score';
import { EVAL_TASKS } from './tasks';
import type { EvalTask } from './tasks';
import { runPipeline } from './runner';
import type { PipelineVariant } from './runner';
import { createMockLlm } from './llm/mock';
import type { MockScript } from './llm/mock';
import { createHttpLlm } from './llm/http';

/**
 * Evidence-gate report + full eval driver (Task 11 binding).
 *
 * Gate lines (the report's evidence-force statements):
 *   G1: bad-fixture capture rate — denominator 15 (plan-corrected): the 12
 *       L-vector directories (10 lint vectors + L09/L11 schema vectors) plus
 *       schema-invalid (schema layer), drift (verify layer), and unresolved
 *       (freeze layer).
 *   G2: drift detection — the drift fixture is caught by verifyFrozen.
 *   G3: ambiguous/conflicting tasks blocked — all 8 must_be_blocked corpus
 *       tasks produced blocked outcomes in every run.
 *   G4: only when live runs are provided — council assertion total strictly
 *       greater than single AND council token cost <= 3x single.
 *
 * Determinism: the report is a pure function of its input — no clock, no
 * randomness, no environment reads on the mock path. `runEvalAll('live')` is
 * the sole place a clock is consulted (the runner's nowIso for live prompts);
 * the timestamp never reaches the rendered report.
 */

/** One captured fixtures/bad vector: did its expected gate layer reject it? */
export interface BadFixtureCapture {
  id: string;
  expect: string;
  caught: boolean;
}

export interface GateReportInput {
  runs: RunScore[];
  badFixtureResults: BadFixtureCapture[];
  driftCaught: boolean;
  /** Brief-compatible extra: the unresolved fixture was rejected by freeze. False (when provided) fails G1. */
  unresolvedFreezeRejected?: boolean;
  /** G4 is rendered and enforced only when live runs are provided (mock evidence cannot substantiate G4). */
  live?: boolean;
}

export type GateVerdict = 'PASS' | 'FAIL' | 'PASS_DETERMINISTIC_ONLY';

/** G1 denominator: 12 L-vector dirs + schema-invalid + drift + unresolved (plan-corrected). */
export const G1_REQUIRED_TOTAL = 15;

/** Fixed timestamps so mock evidence and fixture capture are byte-reproducible. */
const MOCK_NOW = '2026-08-18T12:00:00Z';
const FIXTURE_FREEZE_NOW = '2026-08-18T00:00:00Z';

const FIXTURES_ROOT = join(__dirname, '../../fixtures');
const BAD = join(FIXTURES_ROOT, 'bad');
const GOOD = join(FIXTURES_ROOT, 'good');

/** Per-profile good-fixture pools for mock script derivation (kept profile-consistent so derived bundles lint clean). */
const P_MINI_FIXTURES = ['embed-cli', 'pet-clinic'] as const;
const P_STANDARD_FIXTURES = ['session-service', 'todo-api'] as const;

/** Deterministic mock usage per scripted call: token columns are arithmetic, not guesswork. */
const MOCK_USAGE = { in_tokens: 100, out_tokens: 50 } as const;

interface BadFixtureExpectation {
  expect: 'lint-error' | 'freeze-rejected' | 'verify-drift' | 'schema-error';
  rule?: string;
}

/**
 * G1 evidence: run every fixtures/bad vector through its expected gate layer —
 * lint-error → lintBundle fires the expected rule; schema-error → the bundle
 * fails SpecBundleSchema (equivalently: parse throws); freeze-rejected →
 * freeze rejects; verify-drift → verifyFrozen reports drift.
 */
export function captureBadFixtures(): BadFixtureCapture[] {
  const dirs = readdirSync(BAD)
    .filter((d) => !d.startsWith('.'))
    .sort();

  return dirs.map((id) => {
    const exp = JSON.parse(readFileSync(join(BAD, id, 'expected.json'), 'utf8')) as BadFixtureExpectation;
    const bundle = JSON.parse(readFileSync(join(BAD, id, 'bundle.json'), 'utf8')) as SpecBundle;

    let caught: boolean;
    switch (exp.expect) {
      case 'lint-error':
        caught = lintBundle(bundle).errors.some((f) => f.rule === exp.rule);
        break;
      case 'schema-error':
        caught = !SpecBundleSchema.safeParse(bundle).success;
        break;
      case 'freeze-rejected':
        caught = !freeze(bundle, lintBundle(bundle), FIXTURE_FREEZE_NOW).ok;
        break;
      case 'verify-drift':
        caught = verifyFrozen(bundle).drifted.length > 0;
        break;
      default:
        caught = false;
    }
    return { id, expect: exp.expect, caught };
  });
}

function loadGoodFixture(name: string): SpecBundle {
  return JSON.parse(readFileSync(join(GOOD, name, 'bundle.json'), 'utf8')) as SpecBundle;
}

function fixtureNameFor(task: EvalTask, corpusIndex: number): string {
  const pool = task.profile === 'p-mini' ? P_MINI_FIXTURES : P_STANDARD_FIXTURES;
  return pool[corpusIndex % pool.length]!;
}

/** Good fixture re-intented for a task: only intent, project name, and profile (same profile value) are swapped. */
function deriveBundle(task: EvalTask, base: SpecBundle): SpecBundle {
  const b = structuredClone(base);
  b.intent = { statement: task.intent, normalized: task.intent.slice(0, 80) };
  b.manifest.project = { name: `eval-${task.id.toLowerCase()}`, mode: 'greenfield' };
  b.manifest.complexity_profile = task.profile;
  return b;
}

/** Blocked-path bundle: one UNRESOLVED decision + unresolved_count 1 → L08 fires → the runner blocks. */
function unresolvedBundle(task: EvalTask, base: SpecBundle): SpecBundle {
  const b = deriveBundle(task, base);
  b.decisions[0]!.status = 'UNRESOLVED';
  b.manifest.unresolved_count = 1;
  return b;
}

export interface MockEvalScripts {
  single: MockScript;
  council: MockScript;
}

/**
 * Mock scripts for the whole corpus. Both variants return the SAME final
 * bundle for a task — the point of the mock runs is exercising the scoring
 * machinery and the exact call-count accounting (single = 1 call, council =
 * classifier + proposal A + proposeB/judge = 3 calls), not model quality.
 */
export function buildMockScripts(): MockEvalScripts {
  const single: MockScript = { byTaskId: {} };
  const council: MockScript = { byTaskId: {} };

  EVAL_TASKS.forEach((task, i) => {
    const base = loadGoodFixture(fixtureNameFor(task, i));
    const finalBundle = task.must_be_blocked ? unresolvedBundle(task, base) : deriveBundle(task, base);

    // Council's intermediate proposal A: the same derivation, distinguishable
    // via its council_run stamp (embedded verbatim into call 3's prompt).
    const proposalA = deriveBundle(task, base);
    proposalA.manifest.council_run = {
      run_id: `mock-${task.id}-proposal-a`,
      config_fingerprint: 'mock-eval',
    };

    const usage = { in_tokens: MOCK_USAGE.in_tokens, out_tokens: MOCK_USAGE.out_tokens };
    single.byTaskId[task.id] = [{ text: JSON.stringify(finalBundle), usage }];
    council.byTaskId[task.id] = [
      { text: JSON.stringify({ profile: task.profile, must_be_blocked: task.must_be_blocked }), usage },
      { text: JSON.stringify(proposalA), usage },
      { text: JSON.stringify(finalBundle), usage },
    ];
  });

  return { single, council };
}

/** Everything runEvalAll needs to render a report, before the live/mock distinction. */
export interface EvalEvidence {
  runs: RunScore[];
  badFixtureResults: BadFixtureCapture[];
  driftCaught: boolean;
  unresolvedFreezeRejected: boolean;
}

function finishEvidence(runs: RunScore[]): EvalEvidence {
  const badFixtureResults = captureBadFixtures();
  const driftCaught = badFixtureResults
    .filter((r) => r.expect === 'verify-drift')
    .every((r) => r.caught);
  const unresolvedFreezeRejected = badFixtureResults
    .filter((r) => r.expect === 'freeze-rejected')
    .every((r) => r.caught);
  return { runs, badFixtureResults, driftCaught, unresolvedFreezeRejected };
}

/** Run all 20 tasks x {single, council} through the real runner with mock adapters. Deterministic, no env, no clock. */
export async function runMockEval(): Promise<EvalEvidence> {
  const scripts = buildMockScripts();
  const runs: RunScore[] = [];
  for (const task of EVAL_TASKS) {
    for (const variant of ['single', 'council'] as PipelineVariant[]) {
      const llm = createMockLlm(scripts[variant], task.id);
      const outcome = await runPipeline(task, variant, llm, MOCK_NOW);
      runs.push(scoreRun(task, outcome, outcome.usage));
    }
  }
  return finishEvidence(runs);
}

/**
 * Live run: one shared createHttpLlm() adapter (it throws here if the
 * LCO_LLM_* env is unset — fail-closed, caller's responsibility to set it).
 * The only clock read in the whole eval driver lives here: live prompts get a
 * real nowIso; the rendered report never sees it.
 */
async function runLiveEval(): Promise<EvalEvidence> {
  const llm = createHttpLlm();
  const nowIso = new Date().toISOString();
  const runs: RunScore[] = [];
  for (const task of EVAL_TASKS) {
    for (const variant of ['single', 'council'] as PipelineVariant[]) {
      const outcome = await runPipeline(task, variant, llm, nowIso);
      runs.push(scoreRun(task, outcome, outcome.usage));
    }
  }
  return finishEvidence(runs);
}

interface GateCalcs {
  g1Caught: number;
  g1Total: number;
  g1Pass: boolean;
  g2Pass: boolean;
  blockedCount: number;
  blockedTotal: number;
  g3Pass: boolean;
  councilAssertions: number;
  singleAssertions: number;
  councilCost: number;
  singleCost: number;
  g4Pass: boolean;
  detPass: boolean;
  verdict: GateVerdict;
}

function calcs(r: GateReportInput): GateCalcs {
  const g1Caught = r.badFixtureResults.filter((x) => x.caught).length;
  const g1Total = r.badFixtureResults.length;
  const g1Pass =
    g1Total >= G1_REQUIRED_TOTAL &&
    g1Caught === g1Total &&
    r.unresolvedFreezeRejected !== false;

  const g2Pass = r.driftCaught === true;

  const mustBlock = EVAL_TASKS.filter((t) => t.must_be_blocked);
  let blockedCount = 0;
  for (const t of mustBlock) {
    const rs = r.runs.filter((x) => x.taskId === t.id);
    if (rs.length > 0 && rs.every((x) => x.blockedCorrectly === true)) blockedCount += 1;
  }
  const blockedTotal = mustBlock.length;
  const g3Pass = blockedCount === blockedTotal;

  const councilAssertions = r.runs
    .filter((x) => x.variant === 'council')
    .reduce((a, x) => a + x.assertionsPassed, 0);
  const singleAssertions = r.runs
    .filter((x) => x.variant === 'single')
    .reduce((a, x) => a + x.assertionsPassed, 0);
  const councilCost = r.runs
    .filter((x) => x.variant === 'council')
    .reduce((a, x) => a + x.inTokens + x.outTokens, 0);
  const singleCost = r.runs
    .filter((x) => x.variant === 'single')
    .reduce((a, x) => a + x.inTokens + x.outTokens, 0);
  const g4Pass = councilAssertions > singleAssertions && councilCost <= 3 * singleCost;

  const detPass = g1Pass && g2Pass && g3Pass;
  const verdict: GateVerdict = !r.live
    ? detPass
      ? 'PASS_DETERMINISTIC_ONLY'
      : 'FAIL'
    : detPass && g4Pass
      ? 'PASS'
      : 'FAIL';

  return {
    g1Caught, g1Total, g1Pass, g2Pass, blockedCount, blockedTotal, g3Pass,
    councilAssertions, singleAssertions, councilCost, singleCost, g4Pass,
    detPass, verdict,
  };
}

/** The verdict as a pure function of the report input (shared by renderGateReport and runEvalAll). */
export function gateVerdict(r: GateReportInput): GateVerdict {
  return calcs(r).verdict;
}

/** Render the evidence-gate report as deterministic markdown. Pure: no clock, no env, no I/O. */
export function renderGateReport(r: GateReportInput): string {
  const c = calcs(r);
  const yn = (b: boolean) => (b ? 'pass' : 'fail');
  const lines: string[] = [];

  lines.push('# Spec-Core Evidence Gate Report', '');
  lines.push(
    `- G1: bad-fixture capture ${c.g1Caught}/${c.g1Total} (required ${G1_REQUIRED_TOTAL})`,
  );
  lines.push(`- G2: drift caught: ${r.driftCaught}`);
  lines.push(`- G3: ambiguous/conflicting tasks blocked: ${c.blockedCount}/${c.blockedTotal}`);
  if (r.live) {
    lines.push(
      `- G4: council assertions ${c.councilAssertions} > single ${c.singleAssertions}: ${yn(c.councilAssertions > c.singleAssertions)}; ` +
        `council cost ${c.councilCost} <= 3x single cost ${c.singleCost}: ${yn(c.councilCost <= 3 * c.singleCost)}`,
    );
  }
  lines.push('');

  const misses: string[] = [];
  if (!c.g1Pass) {
    for (const m of r.badFixtureResults.filter((x) => !x.caught)) {
      misses.push(`- G1: ${m.id} (expect ${m.expect}) not captured`);
    }
    if (c.g1Total < G1_REQUIRED_TOTAL) {
      misses.push(`- G1: only ${c.g1Total} fixture vectors provided, ${G1_REQUIRED_TOTAL} required`);
    }
    if (r.unresolvedFreezeRejected === false) {
      misses.push('- G1: unresolved fixture not rejected by freeze');
    }
  }
  if (!c.g2Pass) misses.push('- G2: drift fixture not caught by verifyFrozen');
  if (!c.g3Pass) {
    for (const t of EVAL_TASKS.filter((x) => x.must_be_blocked)) {
      const rs = r.runs.filter((x) => x.taskId === t.id);
      if (!(rs.length > 0 && rs.every((x) => x.blockedCorrectly === true))) {
        misses.push(`- G3: ${t.id} not blocked`);
      }
    }
  }
  if (r.live && !c.g4Pass) {
    if (!(c.councilAssertions > c.singleAssertions)) {
      misses.push(`- G4: council assertions ${c.councilAssertions} not > single ${c.singleAssertions}`);
    }
    if (!(c.councilCost <= 3 * c.singleCost)) {
      misses.push(`- G4: council cost ${c.councilCost} exceeds 3x single cost ${c.singleCost}`);
    }
  }
  if (misses.length > 0) {
    lines.push('Misses:', ...misses, '');
  }

  lines.push(`## Runs (${r.runs.length})`, '');
  lines.push('| task | variant | assertions | blocked-correct | in-tokens | out-tokens | calls |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const run of r.runs) {
    const blocked = run.blockedCorrectly === null ? 'n/a' : run.blockedCorrectly ? 'yes' : 'no';
    lines.push(
      `| ${run.taskId} | ${run.variant} | ${run.assertionsPassed}/${run.assertionsTotal} | ${blocked} | ${run.inTokens} | ${run.outTokens} | ${run.calls} |`,
    );
  }
  lines.push('');

  lines.push(`VERDICT: ${c.verdict}`);
  return lines.join('\n');
}

/**
 * Drive the full evidence gate: all 20 tasks x both variants, fixture capture,
 * gate computation, optional markdown report file. Mock mode is fully
 * deterministic (PASS_DETERMINISTIC_ONLY when G1-G3 hold); live mode requires
 * the LCO_LLM_* env (createHttpLlm throws otherwise — never invented).
 */
export async function runEvalAll(opts: {
  variant: 'mock' | 'live';
  reportPath?: string;
}): Promise<GateVerdict> {
  const evidence = opts.variant === 'live' ? await runLiveEval() : await runMockEval();
  const input: GateReportInput = { ...evidence, live: opts.variant === 'live' };

  if (opts.reportPath !== undefined) {
    const dir = dirname(opts.reportPath);
    if (dir && dir !== '.') mkdirSync(dir, { recursive: true });
    writeFileSync(opts.reportPath, renderGateReport(input), 'utf8');
  }

  return gateVerdict(input);
}
