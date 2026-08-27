import { calcs, G1_REQUIRED_TOTAL } from './gate';
import type { GateReportInput } from './gate';
import { EVAL_TASKS } from './tasks';
import type { PipelineVariant } from './runner';

/**
 * Evidence-gate RENDERING (the text half of the old report.ts): turn a
 * GateReportInput into the deterministic markdown report. Pure: no clock, no
 * env, no I/O — every number shown comes from gate.ts's calcs(), every line
 * from this module's own emission logic.
 *
 * PROD-003 honesty labels (rendered by this module): the report separates
 * structural passes from intent-fidelity passes, lists named intent misses,
 * carries an explicitly advisory (never gated) inventions section, and states
 * what G4 does NOT establish.
 */
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
