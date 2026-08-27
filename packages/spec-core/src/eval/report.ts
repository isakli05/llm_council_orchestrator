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
 *       tasks produced blocked outcomes in every run (across all repeats).
 *   G4: only when live runs are provided — computed ONLY over
 *       intent-fidelity-passing runs (PROD-003): council assertion total
 *       strictly greater than single AND council token cost <= 3x single,
 *       with at least one faithful run on EACH side. The cost half requires
 *       COMPLETE provider usage across every run of every repeat: any run
 *       with unknown usage fails it (UX-003 — unknown is not zero cost).
 *
 * PROD-003 honesty labels: the report separates structural passes from
 * intent-fidelity passes, aggregates per-task outcomes ACROSS repeats with
 * spread (mean/min/max), lists named intent misses, carries an explicitly
 * advisory (never gated) inventions section, and states what G4 does NOT
 * establish.
 *
 * Determinism: the report is a pure function of its input — no clock, no
 * randomness, no environment reads on the mock path. `runEvalAll('live')` is
 * the sole place a clock is consulted (the runner's nowIso for live prompts);
 * the timestamp never reaches the rendered report. Repeated runs with MOCK
 * adapters are deterministic-by-construction (the scripts cannot vary); the
 * repeats mechanism exists for LIVE runs, where run-to-run variance is real.
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
  /** PROD-003: repeats per (task, variant) the runs aggregate (derived from runs when omitted). */
  repeats?: number;
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

/**
 * PROD-003: badge a derived greenfield bundle with its task's named intent
 * constraints (the MENTIONS_TERMS vocabulary) so the mock's final bundle faces
 * the same intent-fidelity assertions a live model's output faces. This is
 * honest plumbing, labeled as such: the mock cannot authored-be-faithful, it
 * is CONSTRUCTED to satisfy the assertion — the discriminating power of the
 * assertion itself is pinned by the adversarial tests (a raw unbadged fixture
 * fails every task's MENTIONS_TERMS) and by live runs.
 */
function badgeIntentConstraints(task: EvalTask, b: SpecBundle): SpecBundle {
  const terms = task.assertions
    .filter((a): a is Extract<EvalTask['assertions'][number], { type: 'MENTIONS_TERMS' }> => a.type === 'MENTIONS_TERMS')
    .flatMap((a) => a.terms);
  if (terms.length === 0) return b;
  b.tasks[0]!.instructions += ` Intent constraints honored verbatim: ${terms.join(', ')}.`;
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
 * machinery (now INCLUDING the PROD-003 intent assertions: greenfield finals
 * carry their task's named constraints via badgeIntentConstraints) and the
 * exact call-count accounting (single = 1 call, council = classifier +
 * proposal A + proposeB/judge = 3 calls), not model quality.
 */
export function buildMockScripts(): MockEvalScripts {
  const single: MockScript = { byTaskId: {} };
  const council: MockScript = { byTaskId: {} };

  EVAL_TASKS.forEach((task, i) => {
    const base = loadGoodFixture(fixtureNameFor(task, i));
    const greenfieldBundle = badgeIntentConstraints(task, deriveBundle(task, base));
    const finalBundle = task.must_be_blocked ? unresolvedBundle(task, base) : greenfieldBundle;

    // Council's intermediate proposal A: the same derivation, distinguishable
    // via its council_run stamp (embedded verbatim into call 3's prompt).
    const proposalA = badgeIntentConstraints(task, deriveBundle(task, base));
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

/**
 * Run all 20 tasks x {single, council} through the real runner with mock
 * adapters, `repeats` times per (task, variant). Deterministic, no env, no
 * clock. PROD-003: mock repeats are deterministic-by-construction (the script
 * cannot vary between repeats) — the mechanism (per-repeat scoring, spread,
 * aggregate gating) is what matters and is exercised identically by live runs.
 */
export async function runMockEval(opts: { repeats?: number } = {}): Promise<EvalEvidence> {
  const repeats = Math.max(1, opts.repeats ?? 1);
  const scripts = buildMockScripts();
  const runs: RunScore[] = [];
  for (const task of EVAL_TASKS) {
    for (const variant of ['single', 'council'] as PipelineVariant[]) {
      for (let rep = 1; rep <= repeats; rep += 1) {
        const llm = createMockLlm(scripts[variant], task.id); // fresh cursor per repeat
        const outcome = await runPipeline(task, variant, llm, MOCK_NOW);
        runs.push(scoreRun(task, outcome, outcome.usage, rep));
      }
    }
  }
  return finishEvidence(runs);
}

/**
 * Live run: one shared createHttpLlm() adapter (it throws here if the
 * LCO_LLM_* env is unset — fail-closed, caller's responsibility to set it),
 * `repeats` times per (task, variant) — live models DO vary run to run, so
 * the report aggregates per-task pass-rates with spread instead of one-shots.
 * The only clock read in the whole eval driver lives here: live prompts get a
 * real nowIso; the rendered report never sees it.
 */
async function runLiveEval(repeats: number): Promise<EvalEvidence> {
  const llm = createHttpLlm();
  const nowIso = new Date().toISOString();
  const runs: RunScore[] = [];
  for (const task of EVAL_TASKS) {
    for (const variant of ['single', 'council'] as PipelineVariant[]) {
      for (let rep = 1; rep <= repeats; rep += 1) {
        const outcome = await runPipeline(task, variant, llm, nowIso);
        runs.push(scoreRun(task, outcome, outcome.usage, rep));
      }
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
  /** PROD-003: structural-validity passes across all runs. */
  structuralPasses: number;
  /** PROD-003: intent-fidelity passes across all runs. */
  intentPasses: number;
  runsTotal: number;
  /** Faithful (intentPassed) runs per variant — G4's only contributors. */
  councilFaithfulRuns: number;
  singleFaithfulRuns: number;
  councilAssertions: number;
  singleAssertions: number;
  councilCost: number;
  singleCost: number;
  usageUnknownRuns: number;
  costKnown: boolean;
  g4Comparable: boolean;
  g4CostOk: boolean;
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

  const structuralPasses = r.runs.filter((x) => x.structuralPassed).length;
  const intentPasses = r.runs.filter((x) => x.intentPassed).length;
  const runsTotal = r.runs.length;

  // PROD-003: the council-advantage comparison is computed ONLY over
  // intent-fidelity-passing runs — a council that scores structural assertions
  // on unfaithful bundles is not "more correct", it is more verbose. Costs are
  // likewise summed over the faithful subsets, while complete usage is demanded
  // across EVERY run of every repeat (UX-003): an unknown anywhere makes the
  // whole comparison unevaluable. An empty faithful subset on either side is
  // NOT an advantage — there is nothing comparable.
  const faithful = (v: PipelineVariant) => r.runs.filter((x) => x.variant === v && x.intentPassed);
  const councilFaithful = faithful('council');
  const singleFaithful = faithful('single');
  const councilAssertions = councilFaithful.reduce((a, x) => a + x.assertionsPassed, 0);
  const singleAssertions = singleFaithful.reduce((a, x) => a + x.assertionsPassed, 0);
  const councilCost = councilFaithful.reduce((a, x) => a + x.inTokens + x.outTokens, 0);
  const singleCost = singleFaithful.reduce((a, x) => a + x.inTokens + x.outTokens, 0);
  // UX-003: a provider that reports no usage leaves the token sums PARTIAL —
  // "council 0 <= 3x single 0" is not cost evidence, so the cost half of G4
  // fails with a named reason when ANY contributing run has unknown usage.
  const usageUnknownRuns = r.runs.filter((x) => x.usageKnown === false).length;
  const costKnown = usageUnknownRuns === 0;
  const g4Comparable = councilFaithful.length > 0 && singleFaithful.length > 0;
  const g4CostOk = costKnown && g4Comparable && councilCost <= 3 * singleCost;
  const g4Pass = g4Comparable && councilAssertions > singleAssertions && g4CostOk;

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
    structuralPasses, intentPasses, runsTotal,
    councilFaithfulRuns: councilFaithful.length, singleFaithfulRuns: singleFaithful.length,
    councilAssertions, singleAssertions, councilCost, singleCost,
    usageUnknownRuns, costKnown, g4Comparable, g4CostOk, g4Pass,
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

  const repeatsOf = (variant: 'single' | 'council'): number =>
    Math.max(1, r.runs.filter((x) => x.variant === variant && x.taskId === r.runs[0]?.taskId).length);
  const repeats = r.repeats ?? repeatsOf('single');

  lines.push('# Spec-Core Evidence Gate Report', '');
  lines.push(
    `- G1: bad-fixture capture ${c.g1Caught}/${c.g1Total} (required ${G1_REQUIRED_TOTAL})`,
  );
  lines.push(`- G2: drift caught: ${r.driftCaught}`);
  lines.push(`- G3: ambiguous/conflicting tasks blocked: ${c.blockedCount}/${c.blockedTotal} (every run of every repeat)`);
  lines.push(`- structural passes: ${c.structuralPasses}/${c.runsTotal} runs (PROD-003: validity, not fidelity)`);
  lines.push(`- intent-fidelity passes: ${c.intentPasses}/${c.runsTotal} runs`);
  if (r.live) {
    const costCell = c.costKnown
      ? `council cost ${c.councilCost} <= 3x single cost ${c.singleCost}: ${yn(c.g4CostOk)}`
      : `council cost unknown <= 3x single cost unknown: ${yn(c.g4CostOk)} ` +
        `(${c.usageUnknownRuns} run(s) without provider usage)`;
    lines.push(
      `- G4 (intent-fidelity-passing runs only): council assertions ${c.councilAssertions} > single ${c.singleAssertions}: ${yn(c.g4Comparable && c.councilAssertions > c.singleAssertions)}; ` +
        costCell,
    );
    lines.push(
      `  - faithful runs contributing: council ${c.councilFaithfulRuns}, single ${c.singleFaithfulRuns} ` +
        `(of ${c.runsTotal} total runs across ${repeats} repeat(s))`,
    );
  }
  lines.push('');

  lines.push('Scope notes (what this report does and does NOT establish):');
  if (!r.live) {
    lines.push(
      '- mock evidence: the G3 blocked outcomes are scripted plumbing (derived from must_be_blocked), not classification quality; live runs are the classification evidence.',
      '- mock evidence: the greenfield intent-fidelity passes are CONSTRUCTED (the mock bundles are badged with their task\'s terms by badgeIntentConstraints), not model-fidelity evidence; live runs are that evidence.',
      '- mock evidence cannot substantiate G4 — the council-advantage claim is live-only by construction.',
      '- mock repeats are deterministic-by-construction (scripts cannot vary); the spread columns matter only for live runs.',
    );
  } else {
    lines.push(
      '- G4 is computed ONLY over intent-fidelity-passing runs with complete provider usage across all repeats; structural passes are excluded from the comparison.',
      '- G4 does NOT establish: blinding (none — the model saw the intent verbatim knowing a spec was expected), human-verified design correctness, cross-provider or cross-model generalization, or stability beyond the observed repeats (see the per-task spread).',
      '- term assertions verify that named constraints are CARRIED into the bundle, not that they are USED in the design; a semantically-empty term dump (one sentence listing every term) can satisfy them — live fidelity requires the future tightening (each term resolving to a requirement statement / task instruction), which this rubric does not yet enforce.',
      '- mock-vs-live distinction: deterministic gates G1-G2 are identical either way; G3/G4 carry meaning only in this live report.',
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
  // PROD-003: every failed intent run is named with its missing terms — the
  // operator can see exactly which constraints the bundle failed to carry.
  for (const run of r.runs) {
    if (!run.intentPassed && run.missingTerms.length > 0) {
      misses.push(
        `- intent: ${run.taskId}/${run.variant} rep ${run.repeat} missing named constraints: ${run.missingTerms.join(', ')}`,
      );
    } else if (!run.intentPassed && run.missingTerms.length === 0 && run.blockedCorrectly === false) {
      misses.push(`- intent: ${run.taskId}/${run.variant} rep ${run.repeat} blocked-incorrectly`);
    }
  }
  if (r.live && !c.g4Pass) {
    if (!c.g4Comparable) {
      if (c.councilFaithfulRuns === 0) {
        misses.push('- G4: no intent-fidelity-passing council runs to compare (an empty comparison is not an advantage)');
      }
      if (c.singleFaithfulRuns === 0) {
        misses.push('- G4: no intent-fidelity-passing single runs to compare (an empty comparison is not an advantage)');
      }
    } else if (!(c.councilAssertions > c.singleAssertions)) {
      misses.push(`- G4: council assertions ${c.councilAssertions} not > single ${c.singleAssertions} (faithful runs only)`);
    }
    if (!c.costKnown) {
      // UX-003: unknown usage is NOT zero — the cost half fails with the reason named.
      misses.push(
        `- G4: token cost not evaluable — ${c.usageUnknownRuns} run(s) report unknown usage ` +
          '(the provider sent no token counts; unknown is not zero cost)',
      );
    } else if (c.g4Comparable && !(c.councilCost <= 3 * c.singleCost)) {
      misses.push(`- G4: council cost ${c.councilCost} exceeds 3x single cost ${c.singleCost}`);
    }
  }
  if (misses.length > 0) {
    lines.push('Misses:', ...misses, '');
  }

  // PROD-003: per-task outcomes ACROSS repeats — a one-shot table hides
  // run-to-run variance; this is the honest per-task view.
  lines.push(`## Per-task outcomes across repeats (${repeats} per task/variant)`, '');
  lines.push('| task | variant | repeats | full-pass | intent-pass | mean assertions | min | max |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const t of EVAL_TASKS) {
    for (const variant of ['single', 'council'] as PipelineVariant[]) {
      const rs = r.runs.filter((x) => x.taskId === t.id && x.variant === variant);
      if (rs.length === 0) continue;
      const full = rs.filter((x) => x.assertionsPassed === x.assertionsTotal).length;
      const intent = rs.filter((x) => x.intentPassed).length;
      const scores = rs.map((x) => x.assertionsPassed);
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      lines.push(
        `| ${t.id} | ${variant} | ${rs.length} | ${full}/${rs.length} | ${intent}/${rs.length} | ${mean.toFixed(1)} | ${Math.min(...scores)} | ${Math.max(...scores)} |`,
      );
    }
  }
  lines.push('');

  lines.push(`## Runs (${r.runs.length})`, '');
  lines.push('| task | variant | rep | assertions | intent | blocked-correct | in-tokens | out-tokens | calls | attempts | council-leg |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const run of r.runs) {
    const blocked = run.blockedCorrectly === null ? 'n/a' : run.blockedCorrectly ? 'yes' : 'no';
    // UX-003: token columns show unknown (never a partial sum dressed as 0).
    const inCell = run.usageKnown ? run.inTokens : 'unknown';
    const outCell = run.usageKnown ? run.outTokens : 'unknown';
    // BACK-008: a collapsed independent-proposal leg must be visible per run —
    // a degraded council output is not a full council result.
    const leg = run.variant === 'single' ? '-' : run.councilDegraded ? 'DEGRADED' : 'ok';
    lines.push(
      `| ${run.taskId} | ${run.variant} | ${run.repeat} | ${run.assertionsPassed}/${run.assertionsTotal} | ${run.intentPassed ? 'ok' : 'FAIL'} | ${blocked} | ${inCell} | ${outCell} | ${run.calls} | ${run.attempts} | ${leg} |`,
    );
  }
  lines.push('');

  const degradedLegs = r.runs.filter((x) => x.councilDegraded);
  if (degradedLegs.length > 0) {
    lines.push(
      `degraded council legs: ${degradedLegs.length} (${degradedLegs.map((x) => `${x.taskId} rep ${x.repeat}`).join(', ')}) — ` +
        'proposal A failed schema validation after retry; the final bundle came from the judge alone (BACK-008)',
      '',
    );
  }

  // PROD-003 advisory inventions: explicitly NOT a gate — a faithful spec in
  // the other language legitimately renames concepts; these are review hints.
  const advisory = r.runs.filter((x) => x.advisoryInventions.length > 0);
  if (advisory.length > 0) {
    lines.push('## Advisory — unmentioned first-class concepts (NOT gated)', '');
    for (const run of advisory) {
      lines.push(`- ${run.taskId}/${run.variant} rep ${run.repeat}: ${run.advisoryInventions.join(', ')}`);
    }
    lines.push('');
  }

  lines.push(`VERDICT: ${c.verdict}`);
  return lines.join('\n');
}

/**
 * Drive the full evidence gate: all 20 tasks x both variants x `repeats`,
 * fixture capture, gate computation, optional markdown report file. Mock mode
 * is fully deterministic (PASS_DETERMINISTIC_ONLY when G1-G3 hold; mock
 * repeats are deterministic-by-construction — the spread mechanism is for live
 * runs); live mode requires the LCO_LLM_* env (createHttpLlm throws otherwise
 * — never invented).
 */
export async function runEvalAll(opts: {
  variant: 'mock' | 'live';
  repeats?: number;
  reportPath?: string;
}): Promise<GateVerdict> {
  const repeats = Math.max(1, opts.repeats ?? 1);
  const evidence = opts.variant === 'live' ? await runLiveEval(repeats) : await runMockEval({ repeats });
  const input: GateReportInput = { ...evidence, repeats, live: opts.variant === 'live' };

  if (opts.reportPath !== undefined) {
    const dir = dirname(opts.reportPath);
    if (dir && dir !== '.') mkdirSync(dir, { recursive: true });
    writeFileSync(opts.reportPath, renderGateReport(input), 'utf8');
  }

  return gateVerdict(input);
}
