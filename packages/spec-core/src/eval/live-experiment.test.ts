import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runExperimentCli, parseExperimentArgs, runEmittingEval, emittedFileName } from './live-experiment';
import { EMITTED_SCHEMA, aggregateEmitted, renderAggregation } from './aggregate';
import type { EmittedOutcome } from './aggregate';
import { EVAL_TASKS } from './tasks';

/**
 * LIVE-EXPERIMENT DRIVER tests: the mock variant is fully deterministic (no
 * env, no keys, no network), so the emit path is exercised end-to-end through
 * the REAL runner + scorer, and the emitted artifacts are aggregated with the
 * real aggregator. Live-only behavior (env guard) is checked without ever
 * constructing the HTTP adapter.
 */

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function stdout(): string {
  return logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
}

function stderr(): string {
  return errorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
}

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'lco-live-exp-'));
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

describe('parseExperimentArgs', () => {
  it('run mode: variant + emit-dir with 1-based defaults; report defaults into the emit dir', () => {
    expect(parseExperimentArgs(['--variant', 'mock', '--emit-dir', '/tmp/x'])).toEqual({
      mode: 'run',
      variant: 'mock',
      emitDir: '/tmp/x',
      runIndex: 1,
      repeats: 1,
      reportPath: '/tmp/x/gate-report.md',
    });
  });

  it('run mode: --run-index and --repeats are honored', () => {
    expect(parseExperimentArgs(['--variant', 'live', '--emit-dir', '/tmp/x', '--run-index', '3', '--repeats', '2'])).toMatchObject({
      mode: 'run',
      runIndex: 3,
      repeats: 2,
    });
  });

  it('aggregate mode: consumes the remaining argv as run directories', () => {
    expect(parseExperimentArgs(['--aggregate', 'a', 'b', 'c'])).toEqual({
      mode: 'aggregate',
      dirs: ['a', 'b', 'c'],
    });
  });

  it('usage errors: unknown flag, missing values, bad variants, mixed modes', () => {
    expect(parseExperimentArgs([])).toMatchObject({ error: expect.stringMatching(/--variant/) });
    expect(parseExperimentArgs(['--variant', 'mock'])).toMatchObject({ error: expect.stringMatching(/--emit-dir/) });
    expect(parseExperimentArgs(['--variant', 'turbo', '--emit-dir', 'x'])).toMatchObject({ error: /--variant expects mock or live/ });
    expect(parseExperimentArgs(['--variant', 'mock', '--emit-dir', 'x', '--bogus'])).toMatchObject({ error: /unknown argument/ });
    expect(parseExperimentArgs(['--run-index', '0', '--variant', 'mock', '--emit-dir', 'x'])).toMatchObject({ error: /--run-index/ });
    expect(parseExperimentArgs(['--aggregate'])).toMatchObject({ error: /--aggregate expects/ });
    expect(parseExperimentArgs(['--aggregate', 'a', '--variant', 'mock'])).toMatchObject({ error: /cannot be combined/ });
  });
});

// ---------------------------------------------------------------------------
// E2E mock run: full corpus, both variants, one repeat — emitted artifacts
// ---------------------------------------------------------------------------

describe('runEmittingEval — mock variant (deterministic plumbing)', () => {
  it('runs the full corpus, emits one JSON per (task,variant,repeat), and writes the gate report', async () => {
    const dir = tempDir();
    try {
      const { runs, verdict, reportPath } = await runEmittingEval({
        variant: 'mock',
        repeats: 1,
        emitDir: dir,
        runIndex: 1,
        nowIso: '2026-08-18T12:00:00Z',
        reportPath: null, // suppress: asserted via the CLI default below
      });
      expect(runs).toHaveLength(40); // 20 tasks x 2 variants
      expect(verdict).toBe('PASS_DETERMINISTIC_ONLY');
      expect(reportPath).toBeNull();

      const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
      expect(files).toHaveLength(40);
      // exactly the expected filenames, no extras
      const expected = EVAL_TASKS.flatMap((t) =>
        (['council', 'single'] as const).map((v) => emittedFileName(t.id, v, 1)),
      ).sort();
      expect(files).toEqual(expected);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('each emitted file carries the full bundle/outcome + usage; blocked tasks carry reasons, no bundle', async () => {
    const dir = tempDir();
    try {
      await runEmittingEval({
        variant: 'mock',
        repeats: 1,
        emitDir: dir,
        runIndex: 2,
        nowIso: '2026-08-18T12:00:00Z',
        reportPath: null,
      });

      const green = JSON.parse(
        readFileSync(join(dir, emittedFileName('ET-01', 'single', 1)), 'utf8'),
      ) as EmittedOutcome;
      expect(green.schema).toBe(EMITTED_SCHEMA);
      expect(green.taskId).toBe('ET-01');
      expect(green.runIndex).toBe(2);
      expect(green.task.must_be_blocked).toBe(false);
      expect(green.outcome.kind).toBe('spec');
      expect(green.outcome.kind === 'spec' && green.outcome.bundle).toBeTruthy();
      expect(green.score.intentPassed).toBe(true); // the constructed mock trace
      expect(green.usage).toMatchObject({ calls: 1, usageKnown: true });

      const blocked = JSON.parse(
        readFileSync(join(dir, emittedFileName('ET-13', 'council', 1)), 'utf8'),
      ) as EmittedOutcome;
      expect(blocked.outcome.kind).toBe('blocked');
      expect(blocked.outcome.kind === 'blocked' && blocked.outcome.reasons.length).toBeGreaterThan(0);
      expect(blocked.score.blockedCorrectly).toBe(true);
      expect(blocked.usage.calls).toBe(3); // council = classifier + proposal A + fused judge
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('mock emissions are byte-deterministic across runs (no clock in the artifacts)', async () => {
    const a = tempDir();
    const b = tempDir();
    try {
      await runEmittingEval({ variant: 'mock', repeats: 1, emitDir: a, runIndex: 1, nowIso: '2026-08-18T12:00:00Z', reportPath: null });
      await runEmittingEval({ variant: 'mock', repeats: 1, emitDir: b, runIndex: 1, nowIso: '2026-08-18T12:00:00Z', reportPath: null });
      const fa = readdirSync(a).sort().map((f) => readFileSync(join(a, f), 'utf8'));
      const fb = readdirSync(b).sort().map((f) => readFileSync(join(b, f), 'utf8'));
      expect(fa).toEqual(fb);
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  });

  it('three emitted mock dirs aggregate: 3 global repeats, all pairs concordant (NOT MET, honest for mock)', async () => {
    const dirs = [tempDir(), tempDir(), tempDir()];
    try {
      for (const [i, dir] of dirs.entries()) {
        await runEmittingEval({ variant: 'mock', repeats: 1, emitDir: dir, runIndex: i + 1, nowIso: '2026-08-18T12:00:00Z', reportPath: null });
      }
      const a = aggregateEmitted(dirs);
      expect(a.runs).toHaveLength(120);
      expect(a.pairs).toHaveLength(36); // 12 greenfield x 3 global repeats
      // mock bundles are identical across variants → zero discordant pairs
      expect(a.signTest.discordant).toBe(0);
      expect(a.criteria.signTestCriterionMet).toBe(false);
      // the deterministic criteria DO hold on mock data
      expect(a.criteria.blocking100).toBe(true);
      expect(a.criteria.zeroForbiddenPresent).toBe(true);
      expect(a.criteria.usageComplete).toBe(true);
      expect(a.criteria.councilCostWithinCap).toBe(true);
      const text = renderAggregation(a);
      expect(text).toContain('paired exact sign test');
      expect(text).toMatch(/criterion \(>= 10 discordant AND p < 0\.05\): NOT MET/);
    } finally {
      for (const d of dirs) rmSync(d, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// CLI wiring (env injectable; live never constructs the HTTP adapter here)
// ---------------------------------------------------------------------------

describe('runExperimentCli', () => {
  it('mock run: exit 0, VERDICT line, default gate report written inside the emit dir', async () => {
    const dir = tempDir();
    try {
      const code = await runExperimentCli(['--variant', 'mock', '--emit-dir', dir]);
      expect(code).toBe(0);
      expect(stdout()).toContain('VERDICT: PASS_DETERMINISTIC_ONLY');
      expect(existsSync(join(dir, 'gate-report.md'))).toBe(true);
      expect(readdirSync(dir).filter((f) => f.endsWith('.json'))).toHaveLength(40);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('live without the LCO_LLM_* env: exit 2, names-only diagnostics, nothing emitted', async () => {
    const dir = tempDir();
    try {
      const code = await runExperimentCli(['--variant', 'live', '--emit-dir', dir], {});
      expect(code).toBe(2);
      expect(stderr()).toContain('missing: LCO_LLM_BASE_URL, LCO_LLM_API_KEY, LCO_LLM_MODEL');
      expect(stderr()).toContain('refusing to run half-configured');
      expect(readdirSync(dir)).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('aggregate mode: exit 0 with the aggregation report; bad dirs exit 2', async () => {
    const dir = tempDir();
    try {
      await runExperimentCli(['--variant', 'mock', '--emit-dir', dir]);
      const code = await runExperimentCli(['--aggregate', dir]);
      expect(code).toBe(0);
      expect(stdout()).toContain('Live-experiment aggregation over 1 emitted run directory');
      expect(stdout()).toMatch(/discordant 0/);

      const bad = await runExperimentCli(['--aggregate', join(dir, 'nope')]);
      expect(bad).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('usage errors exit 2 with the usage block', async () => {
    expect(await runExperimentCli([])).toBe(2);
    expect(stderr()).toContain('usage: live-experiment');
  });
});
