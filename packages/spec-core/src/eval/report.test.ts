import { describe, it, expect } from 'vitest';
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  renderGateReport,
  runEvalAll,
  runMockEval,
  captureBadFixtures,
  buildMockScripts,
  type GateReportInput,
} from './report';
import { EVAL_TASKS } from './tasks';
import type { RunScore } from './score';

/** 15 synthetic-but-shaped capture results mirroring the fixtures/bad corpus (12 lint+schema vectors + drift + unresolved). */
function fixtures15(overrides: { index: number; caught: boolean }[] = []): GateReportInput['badFixtureResults'] {
  const expects = ['lint-error', 'schema-error', 'freeze-rejected', 'verify-drift'] as const;
  return Array.from({ length: 15 }, (_, i) => ({
    id: `V${String(i + 1).padStart(2, '0')}`,
    expect: expects[i % 4]!,
    caught: !overrides.some((o) => o.index === i),
  }));
}

function passRuns(): RunScore[] {
  const runs: RunScore[] = [];
  for (const t of EVAL_TASKS) {
    for (const variant of ['single', 'council'] as const) {
      runs.push({
        taskId: t.id,
        variant,
        assertionsPassed: t.assertions.length,
        assertionsTotal: t.assertions.length,
        repeat: 1,
        structuralPassed: true,
        intentPassed: true,
        missingTerms: [],
        advisoryInventions: [],
        blockedCorrectly: t.must_be_blocked,
        councilDegraded: false,
        inTokens: variant === 'single' ? 100 : 300,
        outTokens: variant === 'single' ? 50 : 150,
        calls: variant === 'single' ? 1 : 3,
        attempts: variant === 'single' ? 1 : 3,
        usageKnown: true,
      });
    }
  }
  return runs;
}

function passInput(): GateReportInput {
  return { runs: passRuns(), badFixtureResults: fixtures15(), driftCaught: true };
}

function assertSum(runs: RunScore[], variant: 'single' | 'council', pick: (r: RunScore) => number): number {
  return runs.filter((r) => r.variant === variant).reduce((acc, r) => acc + pick(r), 0);
}

describe('renderGateReport — deterministic (mock) input', () => {
  it('full pass without live data renders PASS_DETERMINISTIC_ONLY with G1/G2/G3 lines and no G4', () => {
    const text = renderGateReport(passInput());
    expect(text).toContain('G1: bad-fixture capture 15/15');
    expect(text).toContain('G2: drift caught: true');
    expect(text).toContain('G3: ambiguous/conflicting tasks blocked: 8/8');
    expect(text).toContain('VERDICT: PASS_DETERMINISTIC_ONLY');
    expect(text).not.toContain('G4:');
    // PROD-003: structural vs intent-fidelity labels + mock scope notes
    expect(text).toContain('structural passes: 40/40');
    expect(text).toContain('intent-fidelity passes: 40/40');
    expect(text).toContain('scripted plumbing');
    // both tables tabulate every run: per-task outcomes + per-run rows
    expect(text).toContain('## Runs (40)');
    expect(text.match(/^\| ET-/gm)).toHaveLength(80);
  });

  it('is deterministic: identical input renders byte-identical text (no clock)', () => {
    const a = renderGateReport(passInput());
    const b = renderGateReport(passInput());
    expect(a).toBe(b);
  });

  // BACK-008: a degraded council leg (proposal A invalid after retry) must be
  // visible in the rendered report — it cannot silently count as full council.
  it('degraded council legs are listed and flagged in the runs table', () => {
    const input = passInput();
    const degradedRun = input.runs.find((r) => r.taskId === 'ET-13' && r.variant === 'council')!;
    degradedRun.councilDegraded = true;

    const text = renderGateReport(input);

    expect(text).toContain('degraded council legs: 1 (ET-13 rep 1)');
    // the run's own runs-table row carries the degraded flag (its 5th column
    // is ok/FAIL — that distinguishes runs-table rows from per-task rows)
    const row = text
      .split('\n')
      .find((l) => /^\| ET-13 \| council \| 1 \| \d+\/\d+ \| ok \|/.test(l))!;
    expect(row).toMatch(/DEGRADED/);
    // untouched council rows are NOT flagged
    const okRow = text
      .split('\n')
      .find((l) => /^\| ET-01 \| council \| 1 \| \d+\/\d+ \| ok \|/.test(l))!;
    expect(okRow).not.toMatch(/DEGRADED/);
  });
});

describe('renderGateReport — failures', () => {
  it('one G1 miss → 14/15, the miss is listed, verdict FAIL', () => {
    const input = passInput();
    input.badFixtureResults = fixtures15([{ index: 2, caught: false }]);
    const text = renderGateReport(input);
    expect(text).toContain('G1: bad-fixture capture 14/15');
    expect(text).toContain('V03 (expect freeze-rejected) not captured');
    expect(text).toContain('VERDICT: FAIL');
  });

  it('fewer than 15 fixture vectors provided → verdict FAIL even if all provided vectors were caught', () => {
    const input = passInput();
    input.badFixtureResults = fixtures15().slice(0, 14);
    const text = renderGateReport(input);
    expect(text).toContain('VERDICT: FAIL');
    expect(text).toContain('14 fixture vectors provided, 15 required');
  });

  it('drift not caught → G2 false line and verdict FAIL', () => {
    const input = passInput();
    input.driftCaught = false;
    const text = renderGateReport(input);
    expect(text).toContain('G2: drift caught: false');
    expect(text).toContain('G2: drift fixture not caught by verifyFrozen');
    expect(text).toContain('VERDICT: FAIL');
  });

  it('a must-be-blocked task that was not blocked → G3 7/8 and verdict FAIL', () => {
    const input = passInput();
    for (const r of input.runs) {
      if (r.taskId === 'ET-18') r.blockedCorrectly = false;
    }
    const text = renderGateReport(input);
    expect(text).toContain('G3: ambiguous/conflicting tasks blocked: 7/8');
    expect(text).toContain('G3: ET-18 not blocked');
    expect(text).toContain('VERDICT: FAIL');
  });
});

describe('renderGateReport — live input (G4)', () => {
  function liveInput(councilAdvantage: number): GateReportInput {
    const runs = passRuns();
    // shave `councilAdvantage` assertions off ONE single run so council total exceeds single total
    if (councilAdvantage > 0) runs[0]!.assertionsPassed -= councilAdvantage;
    return { runs, badFixtureResults: fixtures15(), driftCaught: true, live: true };
  }

  it('live + council assertions greater AND council cost <= 3x single cost → PASS with raw numbers', () => {
    const input = liveInput(1);
    const text = renderGateReport(input);
    const ca = assertSum(input.runs, 'council', (r) => r.assertionsPassed);
    const sa = assertSum(input.runs, 'single', (r) => r.assertionsPassed);
    const cc = assertSum(input.runs, 'council', (r) => r.inTokens + r.outTokens);
    const sc = assertSum(input.runs, 'single', (r) => r.inTokens + r.outTokens);
    // PROD-003: the claim is labeled — computed over intent-fidelity-passing runs only
    expect(text).toContain(`G4 (intent-fidelity-passing runs only): council assertions ${ca} > single ${sa}: pass`);
    expect(text).toContain(`council cost ${cc} <= 3x single cost ${sc}: pass`);
    expect(text).toContain('faithful runs contributing: council 20, single 20');
    expect(text).toContain('VERDICT: PASS');
  });

  it('live + council assertions NOT greater (equal) → G4 fail line and verdict FAIL', () => {
    const input = liveInput(0);
    const text = renderGateReport(input);
    expect(text).toMatch(/G4 \(intent-fidelity-passing runs only\): council assertions \d+ > single \d+: fail/);
    expect(text).toContain('VERDICT: FAIL');
  });

  it('live + council cost above 3x single cost → verdict FAIL', () => {
    const input = liveInput(1);
    for (const r of input.runs) {
      if (r.variant === 'council') {
        r.inTokens = 5000; // 5050 per council run vs 3x150=450 allowed per single run
      }
    }
    const text = renderGateReport(input);
    expect(text).toMatch(/council cost \d+ <= 3x single cost \d+: fail/);
    expect(text).toContain('VERDICT: FAIL');
  });

  it('live input with a deterministic miss stays FAIL (live data cannot rescue G1-G3)', () => {
    const input = liveInput(1);
    input.driftCaught = false;
    expect(renderGateReport(input)).toContain('VERDICT: FAIL');
  });
});

describe('captureBadFixtures — the real fixtures/bad corpus', () => {
  it('captures all 15 vectors (12 lint/schema + drift + unresolved)', () => {
    const results = captureBadFixtures();
    expect(results).toHaveLength(15);
    expect(results.every((r) => r.caught)).toBe(true);
    const ids = results.map((r) => r.id).sort();
    expect(ids).toEqual(
      [
        'L01', 'L02', 'L03', 'L04', 'L05', 'L06', 'L07', 'L08', 'L09', 'L10', 'L11', 'L12',
        'drift', 'schema-invalid', 'unresolved',
      ].sort(),
    );
  });
});

describe('buildMockScripts — per-task scripting', () => {
  it('scripts every task: 1 response for single, 3 for council', () => {
    const scripts = buildMockScripts();
    for (const t of EVAL_TASKS) {
      expect(scripts.single.byTaskId[t.id]).toHaveLength(1);
      expect(scripts.council.byTaskId[t.id]).toHaveLength(3);
      // council call 1 is the classifier verdict JSON
      const classifier = JSON.parse(scripts.council.byTaskId[t.id]![0]!.text) as {
        profile: string;
        must_be_blocked: boolean;
      };
      expect(classifier.profile).toBe(t.profile);
      expect(classifier.must_be_blocked).toBe(t.must_be_blocked);
    }
  });

  it('greenfield final responses parse as bundles re-intented for the task; blocked tasks carry an UNRESOLVED decision', () => {
    const scripts = buildMockScripts();
    for (const t of EVAL_TASKS) {
      const finalSingle = JSON.parse(scripts.single.byTaskId[t.id]![0]!.text) as {
        intent: { statement: string };
        manifest: { project: { name: string }; complexity_profile: string; unresolved_count: number };
        decisions: { status: string }[];
      };
      expect(finalSingle.intent.statement).toBe(t.intent);
      expect(finalSingle.manifest.project.name).toBe(`eval-${t.id.toLowerCase()}`);
      expect(finalSingle.manifest.complexity_profile).toBe(t.profile);
      if (t.must_be_blocked) {
        expect(finalSingle.decisions.some((d) => d.status === 'UNRESOLVED')).toBe(true);
        expect(finalSingle.manifest.unresolved_count).toBe(1);
      } else {
        expect(finalSingle.manifest.unresolved_count).toBe(0);
      }
      // council's final (3rd) response is the same bundle — same final output either way
      const finalCouncil = JSON.parse(scripts.council.byTaskId[t.id]![2]!.text);
      expect(finalCouncil).toEqual(finalSingle);
    }
  });
});

describe('runMockEval — 20 tasks x 2 variants through the real runner', () => {
  it('produces 40 RunScores with exact call accounting: single=1, council=3 per task', async () => {
    const evidence = await runMockEval();
    expect(evidence.runs).toHaveLength(40);
    for (const t of EVAL_TASKS) {
      const single = evidence.runs.find((r) => r.taskId === t.id && r.variant === 'single');
      const council = evidence.runs.find((r) => r.taskId === t.id && r.variant === 'council');
      expect(single, `${t.id} single run`).toBeDefined();
      expect(council, `${t.id} council run`).toBeDefined();
      expect(single!.calls, `${t.id} single calls`).toBe(1);
      expect(council!.calls, `${t.id} council calls`).toBe(3);
    }
  });

  it('all 8 ambiguous/conflicting tasks are blocked in both variants with full assertion scores', async () => {
    const evidence = await runMockEval();
    for (const t of EVAL_TASKS.filter((x) => x.must_be_blocked)) {
      for (const r of evidence.runs.filter((x) => x.taskId === t.id)) {
        expect(r.blockedCorrectly, `${t.id}/${r.variant}`).toBe(true);
        expect(r.assertionsPassed, `${t.id}/${r.variant}`).toBe(r.assertionsTotal);
      }
    }
  });

  it('greenfield tasks are never blocked; mock scripts return the same bundle either way (identical assertion scores)', async () => {
    const evidence = await runMockEval();
    for (const t of EVAL_TASKS.filter((x) => !x.must_be_blocked)) {
      const single = evidence.runs.find((r) => r.taskId === t.id && r.variant === 'single')!;
      const council = evidence.runs.find((r) => r.taskId === t.id && r.variant === 'council')!;
      expect(single.blockedCorrectly).toBe(true);
      expect(council.blockedCorrectly).toBe(true);
      expect(council.assertionsPassed).toBe(single.assertionsPassed);
      // lint/verification machinery holds for every greenfield bundle
      expect(single.assertionsPassed).toBeGreaterThanOrEqual(2);
    }
  });

  it('captures the fixture gate: 15/15 caught, drift caught, unresolved freeze-rejected', async () => {
    const evidence = await runMockEval();
    expect(evidence.badFixtureResults).toHaveLength(15);
    expect(evidence.badFixtureResults.every((r) => r.caught)).toBe(true);
    expect(evidence.driftCaught).toBe(true);
    expect(evidence.unresolvedFreezeRejected).toBe(true);
  });
});

describe('runEvalAll — mock e2e', () => {
  it('returns PASS_DETERMINISTIC_ONLY and writes the markdown report when a path is given', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lco-gate-report-'));
    try {
      const reportPath = join(dir, 'gate-report.md');
      const verdict = await runEvalAll({ variant: 'mock', reportPath });
      expect(verdict).toBe('PASS_DETERMINISTIC_ONLY');

      expect(existsSync(reportPath)).toBe(true);
      const text = readFileSync(reportPath, 'utf8');
      expect(text).toContain('G1: bad-fixture capture 15/15');
      expect(text).toContain('G2: drift caught: true');
      expect(text).toContain('G3: ambiguous/conflicting tasks blocked: 8/8');
      expect(text).toContain('VERDICT: PASS_DETERMINISTIC_ONLY');
      expect(text).not.toContain('G4:');
      expect(text).toContain('## Runs (40)');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('runs without a reportPath (report optional)', async () => {
    await expect(runEvalAll({ variant: 'mock' })).resolves.toBe('PASS_DETERMINISTIC_ONLY');
  });
});

// ---------------------------------------------------------------------------
// UX-003 (T11): unknown token usage is NOT zero — display + the G4 cost gate
// ---------------------------------------------------------------------------

describe('renderGateReport — unknown usage (UX-003)', () => {
  it('a run with unknown usage renders "unknown" in the token cells, never 0', () => {
    const input = passInput();
    const unknownRun = input.runs.find((r) => r.taskId === 'ET-01' && r.variant === 'council')!;
    unknownRun.usageKnown = false;

    const text = renderGateReport(input);

    // the RUNS-table row (5th column ok/FAIL), not the per-task summary row
    const row = text.split('\n').find((l) => /^\| ET-01 \| council \| 1 \| \d+\/\d+ \| ok \|/.test(l))!;
    expect(row).toContain('unknown');
  });

  it('live + any unknown-usage run → the G4 cost condition FAILS with a named reason (0 <= 3*0 is not evidence)', () => {
    const input = passInput();
    input.live = true;
    input.runs[0]!.usageKnown = false; // one single run lacks provider usage

    const text = renderGateReport(input);
    expect(text).toContain('unknown usage');
    expect(text).toContain('G4');
    expect(text).toContain('VERDICT: FAIL');
    // the named miss must say WHY unknown fails the cost half
    const miss = text.split('\n').find((l) => l.startsWith('- G4: token cost not evaluable'));
    expect(miss).toBeDefined();
    expect(miss).toContain('not zero');
  });

  it('mock report: unknown usage does not affect the deterministic verdict (G4 is live-only)', () => {
    const input = passInput();
    input.runs[3]!.usageKnown = false;
    const text = renderGateReport(input);
    expect(text).toContain('VERDICT: PASS_DETERMINISTIC_ONLY');
    expect(text).not.toContain('G4:');
  });

  it('the runs table carries the attempts column (UX-001: attempts ≠ completions)', () => {
    const input = passInput();
    input.runs[0]!.attempts = 4; // one completion, four HTTP attempts
    const text = renderGateReport(input);
    expect(text).toContain('| task | variant | rep | assertions | intent | blocked-correct | in-tokens | out-tokens | calls | attempts | council-leg |');
    // the PER-RUN row (5th column ok/FAIL distinguishes it from the per-task summary)
    const row = text.split('\n').find((l) => /^\| ET-01 \| single \| 1 \| \d+\/\d+ \| ok \|/.test(l))!;
    expect(row).toMatch(/\| no \| 100 \| 50 \| 1 \| 4 \|/); // ET-01 is greenfield (blocked-correct no), calls 1, attempts 4
  });
});
