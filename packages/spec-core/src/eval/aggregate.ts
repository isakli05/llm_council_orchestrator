import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { signTest, pairedOutcomes, formatP, MIN_DISCORDANT_PAIRS, SIGN_TEST_ALPHA } from './sign-test';
import type { SignTestResult, PairedOutcome } from './sign-test';
import type { RunScore } from './score';
import { G4_COST_MULTIPLIER } from './gate';
import { EVAL_TASKS } from './tasks';

/**
 * LIVE-EXPERIMENT AGGREGATOR (deterministic, no network, no clock).
 *
 * The owner-authorized live experiment runs the FULL corpus in THREE separate
 * invocations (crash-resilience: each invocation uses --repeats 1 and EMITS
 * every bundle + structured outcome to its own untracked output directory;
 * a crashed invocation loses only its own remaining work, never the
 * aggregated evidence). This module re-assembles those emitted artifacts:
 *
 *   - loads one JSON per (task, variant, repeat) from each run directory;
 *   - re-bases per-directory repeat ordinals into GLOBAL repeat ordinals
 *     (dir order = run order; a directory that itself used --repeats k
 *     contributes k consecutive global repeats — aggregation is repeat-aware);
 *   - pairs greenfield (task, repeat) units across variants EXACTLY like the
 *     sign-test module's pairedOutcomes() — because it IS that function — and
 *   - reports the pre-registered signTest() verdict plus cost totals and the
 *     remaining pre-registered pass-criteria counters.
 *
 * The aggregator is pure over its inputs: it reads files given to it and
 * computes; it never runs pipelines, never touches the network, and never
 * reads the clock. It does NOT verify the corpus lock itself (it consumes
 * artifacts the lock-verified run produced; the run entrypoint did the
 * enforcing).
 */

/** Marker stamped on every emitted outcome file (version the format explicitly). */
export const EMITTED_SCHEMA = 'lco-emitted-outcome/1';

/** One (task, variant, repeat) unit exactly as the run emitted it. */
export interface EmittedOutcome {
  schema: typeof EMITTED_SCHEMA;
  taskId: string;
  variant: 'single' | 'council';
  /** 1-based repeat ordinal WITHIN its run directory. */
  repeat: number;
  /** Informational: the 1-based ordinal of the invocation that emitted this file. */
  runIndex?: number;
  task: { id: string; kind: string; profile: string; must_be_blocked: boolean };
  outcome:
    | { kind: 'spec'; bundle: unknown; councilDegraded?: boolean }
    | { kind: 'blocked'; reasons: string[]; councilDegraded?: boolean };
  score: RunScore;
  usage: {
    in: number;
    out: number;
    calls: number;
    attempts: number;
    promptBytes: number;
    callsWithoutUsage: number;
    usageKnown: boolean;
  };
}

/** Parse + shape-check one emitted file (throws naming the file on garbage). */
export function parseEmittedOutcome(path: string, text: string): EmittedOutcome {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`AGGREGATE INVALID JSON: ${path} (${msg})`);
  }
  const e = raw as Partial<EmittedOutcome>;
  if (
    e.schema !== EMITTED_SCHEMA ||
    typeof e.taskId !== 'string' ||
    (e.variant !== 'single' && e.variant !== 'council') ||
    typeof e.repeat !== 'number' ||
    !e.task ||
    typeof e.task !== 'object' ||
    (e.outcome?.kind !== 'spec' && e.outcome?.kind !== 'blocked') ||
    !e.score ||
    typeof e.score !== 'object' ||
    !e.usage ||
    typeof e.usage !== 'object'
  ) {
    throw new Error(
      `AGGREGATE INVALID RECORD: ${path} is not an ${EMITTED_SCHEMA} emitted outcome ` +
        '(expected schema/taskId/variant/repeat/task/outcome/score/usage)',
    );
  }
  return e as EmittedOutcome;
}

/** Load every emitted outcome file of one run directory (sorted, shape-checked). */
export function loadRunDir(dir: string): EmittedOutcome[] {
  if (!existsSync(dir)) {
    throw new Error(`AGGREGATE MISSING RUN DIR: ${dir} (expected one directory per invocation, each holding the emitted JSON files)`);
  }
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort();
  if (files.length === 0) {
    throw new Error(`AGGREGATE EMPTY RUN DIR: ${dir} holds no emitted .json outcomes`);
  }
  const out = files.map((f) => parseEmittedOutcome(join(dir, f), readFileSync(join(dir, f), 'utf8')));
  // duplicate (task, variant, repeat) units inside one directory would pair
  // ambiguously — refuse rather than silently keep the last one
  const seen = new Set<string>();
  for (const e of out) {
    const key = `${e.taskId}#${e.variant}#${e.repeat}`;
    if (seen.has(key)) {
      throw new Error(`AGGREGATE DUPLICATE UNIT: ${dir} emits ${key} more than once`);
    }
    seen.add(key);
  }
  return out;
}

/** Per-variant token/call totals over all loaded runs. */
export interface VariantCost {
  variant: 'single' | 'council';
  runs: number;
  inTokens: number;
  outTokens: number;
  totalTokens: number;
  calls: number;
  attempts: number;
  runsUnknownUsage: number;
}

/** The full aggregation result (data; renderAggregation turns it into text). */
export interface Aggregation {
  runDirs: string[];
  runs: RunScore[];
  pairs: PairedOutcome[];
  signTest: SignTestResult;
  costs: { single: VariantCost; council: VariantCost };
  /** Council/single token ratio; null when single cost is 0 or any usage unknown. */
  costRatio: number | null;
  mustBlockRuns: { total: number; blockedCorrectly: number };
  forbiddenPresent: { runs: number; tasks: string[] };
  /** The pre-registered criteria as computed booleans (all must hold for a pass). */
  criteria: {
    signTestCriterionMet: boolean;
    blocking100: boolean;
    zeroForbiddenPresent: boolean;
    usageComplete: boolean;
    councilCostWithinCap: boolean;
  };
}

function variantCost(variant: 'single' | 'council', runs: RunScore[]): VariantCost {
  const rs = runs.filter((r) => r.variant === variant);
  const inTokens = rs.reduce((a, r) => a + r.inTokens, 0);
  const outTokens = rs.reduce((a, r) => a + r.outTokens, 0);
  return {
    variant,
    runs: rs.length,
    inTokens,
    outTokens,
    totalTokens: inTokens + outTokens,
    calls: rs.reduce((a, r) => a + r.calls, 0),
    attempts: rs.reduce((a, r) => a + r.attempts, 0),
    runsUnknownUsage: rs.filter((r) => !r.usageKnown).length,
  };
}

/**
 * Aggregate emitted run directories, in the order given (dir order = repeat
 * order). Per-directory repeat ordinals are re-based into global ordinals so
 * three one-repeat invocations become repeats 1..3, exactly like one
 * three-repeat invocation would have numbered them; pairing then runs through
 * the pre-registered pairedOutcomes()/signTest() functions unchanged.
 */
export function aggregateEmitted(runDirs: string[]): Aggregation {
  if (runDirs.length === 0) {
    throw new Error('AGGREGATE NO RUN DIRS: pass at least one emitted run directory');
  }

  const runs: RunScore[] = [];
  const blockedIds = new Set<string>();
  let offset = 0;
  for (const dir of runDirs) {
    const emitted = loadRunDir(dir);
    const maxRepeat = Math.max(...emitted.map((e) => e.repeat));
    for (const e of emitted) {
      // pairing classifies tasks against the CURRENT corpus (pairedOutcomes
      // reads EVAL_TASKS); refuse artifacts a corpus substitution orphaned
      const known = EVAL_TASKS.find((t) => t.id === e.taskId);
      if (
        !known ||
        known.kind !== e.task.kind ||
        known.profile !== e.task.profile ||
        known.must_be_blocked !== e.task.must_be_blocked
      ) {
        throw new Error(
          `AGGREGATE CORPUS MISMATCH: ${dir} emits ${e.taskId} as ` +
            `${e.task.kind}/${e.task.profile}/blocked=${e.task.must_be_blocked}, which does not match the current frozen corpus — these artifacts belong to a different freeze`,
        );
      }
      runs.push({ ...e.score, repeat: offset + e.repeat });
      if (e.task.must_be_blocked) blockedIds.add(e.taskId);
    }
    offset += maxRepeat;
  }

  const pairs = pairedOutcomes(runs);
  const sign = signTest(pairs.map((p) => ({ council: p.councilPassed, single: p.singlePassed })));

  const single = variantCost('single', runs);
  const council = variantCost('council', runs);
  const usageComplete = runs.every((r) => r.usageKnown);
  const costRatio =
    usageComplete && single.totalTokens > 0 ? council.totalTokens / single.totalTokens : null;

  const mustBlockRuns = runs.filter((r) => blockedIds.has(r.taskId));

  const forbiddenRuns = runs.filter((r) =>
    r.constraintFailures.some((f) => f.code === 'FORBIDDEN_PRESENT'),
  );

  const criteria = {
    signTestCriterionMet: sign.meetsCriterion,
    blocking100: mustBlockRuns.length > 0 && mustBlockRuns.every((r) => r.blockedCorrectly === true),
    zeroForbiddenPresent: forbiddenRuns.length === 0,
    usageComplete,
    councilCostWithinCap:
      usageComplete &&
      single.totalTokens > 0 &&
      council.totalTokens <= G4_COST_MULTIPLIER * single.totalTokens,
  };

  return {
    runDirs,
    runs,
    pairs,
    signTest: sign,
    costs: { single, council },
    costRatio,
    mustBlockRuns: {
      total: mustBlockRuns.length,
      blockedCorrectly: mustBlockRuns.filter((r) => r.blockedCorrectly === true).length,
    },
    forbiddenPresent: {
      runs: forbiddenRuns.length,
      tasks: [...new Set(forbiddenRuns.map((r) => r.taskId))].sort(),
    },
    criteria,
  };
}

/** Deterministic text rendering of an aggregation (the aggregation report). */
export function renderAggregation(a: Aggregation): string {
  const lines: string[] = [];
  lines.push(`# Live-experiment aggregation over ${a.runDirs.length} emitted run directory(ies)`);
  lines.push('');
  lines.push(`runs loaded: ${a.runs.length} (greenfield paired units: ${a.pairs.length})`);
  lines.push(
    `must-be-blocked runs: ${a.mustBlockRuns.blockedCorrectly}/${a.mustBlockRuns.total} blocked correctly`,
  );
  lines.push(
    `forbidden-invention failures (FORBIDDEN_PRESENT): ${a.forbiddenPresent.runs} run(s)${
      a.forbiddenPresent.tasks.length > 0 ? ` on ${a.forbiddenPresent.tasks.join(', ')}` : ''
    }`,
  );
  lines.push('');
  lines.push('## Cost totals (all runs, provider-reported usage)');
  for (const v of [a.costs.single, a.costs.council]) {
    lines.push(
      `- ${v.variant}: ${v.runs} runs, in ${v.inTokens} + out ${v.outTokens} = ${v.totalTokens} tokens, ${v.calls} completions, ${v.attempts} attempts${
        v.runsUnknownUsage > 0 ? `, UNKNOWN usage on ${v.runsUnknownUsage} run(s)` : ''
      }`,
    );
  }
  if (a.costRatio !== null) {
    lines.push(
      `council/single token ratio: ${a.costRatio.toFixed(3)} (cap ${G4_COST_MULTIPLIER}x → ${
        a.criteria.councilCostWithinCap ? 'within' : 'EXCEEDS'
      })`,
    );
  } else {
    lines.push('council/single token ratio: not evaluable (unknown usage present or zero single cost)');
  }
  lines.push('');
  lines.push('## Pre-registered claim criterion (sign-test, binding)');
  const s = a.signTest;
  lines.push(
    `paired exact sign test: pairs ${s.pairs}, discordant ${s.discordant} (council wins ${s.councilWins}, single wins ${s.singleWins}), concordant ${s.concordant}`,
  );
  lines.push(`one-sided exact p: ${formatP(s.pOneSidedExact)} (alpha ${SIGN_TEST_ALPHA})`);
  lines.push(`two-sided exact p: ${formatP(s.pTwoSidedExact)}`);
  lines.push(
    `Clopper-Pearson 95% CI (council-win share of discordant): [${s.ci95ClopperPearson.lower.toFixed(3)}, ${s.ci95ClopperPearson.upper.toFixed(3)}]`,
  );
  lines.push(
    `criterion (>= ${MIN_DISCORDANT_PAIRS} discordant AND p < ${SIGN_TEST_ALPHA}): ${s.meetsCriterion ? 'MET' : 'NOT MET'}`,
  );
  lines.push('');
  lines.push('## Pre-registered criteria (all must hold)');
  lines.push(`- sign-test criterion: ${a.criteria.signTestCriterionMet ? 'met' : 'NOT MET'}`);
  lines.push(`- blocking 100%: ${a.criteria.blocking100 ? 'met' : 'NOT MET'}`);
  lines.push(`- zero FORBIDDEN_PRESENT: ${a.criteria.zeroForbiddenPresent ? 'met' : 'NOT MET'}`);
  lines.push(`- complete usage accounting: ${a.criteria.usageComplete ? 'met' : 'NOT MET'}`);
  lines.push(`- council cost <= ${G4_COST_MULTIPLIER}x single: ${a.criteria.councilCostWithinCap ? 'met' : 'NOT MET'}`);
  const allMet = Object.values(a.criteria).every(Boolean);
  lines.push(`ALL CRITERIA: ${allMet ? 'MET' : 'NOT MET'}`);
  lines.push(
    '(the council-advantage CLAIM is decided solely by the sign-test criterion above — never by a CLI exit code; "no demonstrated council advantage" is the honest reading of any miss)',
  );
  return lines.join('\n');
}
