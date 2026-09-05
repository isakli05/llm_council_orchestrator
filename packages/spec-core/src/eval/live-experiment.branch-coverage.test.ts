import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runExperimentCli, parseExperimentArgs, runEmittingEval, emittedFileName } from './live-experiment';
import { buildMockScripts } from './report';
import { EVAL_TASKS } from './tasks';
import type { EmittedOutcome } from './aggregate';

/**
 * Branch-coverage companions to live-experiment.test.ts: the argv value/flag
 * edge cases, the reportPath default, the live fail-closed paths, the live
 * pipeline driven through a STUBBED global fetch (no network — the transport
 * reads the global fetch at call time), and the bin-entry guard.
 *
 * The live stub below is deliberate: it routes the REAL HTTP adapter over
 * mock-script texts so the driver's live-only branches (scripts vs adapter
 * selection, degraded-council emission, FAIL exit code) run fully offline and
 * deterministically.
 */

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

/** Every LCO_LLM_* name createHttpLlm() reads; saved, cleared, restored. */
const ENV_KEYS = ['LCO_LLM_BASE_URL', 'LCO_LLM_API_KEY', 'LCO_LLM_MODEL', 'LCO_LLM_MAX_TOKENS', 'LCO_LLM_EXTRA_BODY'] as const;
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

function stdout(): string {
  return logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
}

function stderr(): string {
  return errorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
}

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'lco-live-exp-brcov-'));
}

// ---------------------------------------------------------------------------
// parseExperimentArgs — flag-shaped and missing values
// ---------------------------------------------------------------------------

describe('parseExperimentArgs — value edges (flag-shaped / missing values)', () => {
  it('a --flag value that is itself a flag reads as "nothing", not as a variant', () => {
    // valueOf() sees '--emit-dir' (starts with --) → undefined → "got: nothing"
    expect(parseExperimentArgs(['--variant', '--emit-dir', 'x'])).toMatchObject({
      error: '--variant expects mock or live, got: nothing',
    });
  });

  it('--emit-dir with no value is a usage error, not a silent default', () => {
    expect(parseExperimentArgs(['--variant', 'mock', '--emit-dir'])).toMatchObject({
      error: '--emit-dir expects a path',
    });
  });

  it('--run-index with no value names "nothing" instead of coercing', () => {
    expect(
      parseExperimentArgs(['--variant', 'mock', '--emit-dir', 'x', '--run-index']),
    ).toMatchObject({ error: '--run-index expects an integer >= 1, got: nothing' });
  });

  it('--repeats with no value names "nothing" instead of coercing', () => {
    expect(
      parseExperimentArgs(['--variant', 'mock', '--emit-dir', 'x', '--repeats']),
    ).toMatchObject({ error: '--repeats expects an integer >= 1, got: nothing' });
  });

  it('--report with no value is an error; with a value it overrides the default path', () => {
    expect(parseExperimentArgs(['--variant', 'mock', '--emit-dir', 'x', '--report'])).toMatchObject({
      error: '--report expects a path',
    });
    const parsed = parseExperimentArgs(['--variant', 'mock', '--emit-dir', 'x', '--report', '/custom/r.md']);
    expect(parsed).toMatchObject({ mode: 'run', reportPath: '/custom/r.md' });
  });
});

describe('parseExperimentArgs — aggregate mode refuses EVERY run-mode flag', () => {
  it('a non-default --repeats alone already makes it a mixed invocation', () => {
    // repeats is the LAST operand of the combination check: every earlier flag
    // is undefined here, so this is the minimal mixed-mode shape.
    expect(parseExperimentArgs(['--repeats', '2', '--aggregate', 'a', 'b'])).toMatchObject({
      error: '--aggregate cannot be combined with run-mode flags',
    });
  });

  it('each run-mode flag before --aggregate is rejected the same way', () => {
    for (const argv of [
      ['--variant', 'mock', '--aggregate', 'a', 'b'],
      ['--emit-dir', 'x', '--aggregate', 'a', 'b'],
      ['--run-index', '2', '--aggregate', 'a', 'b'],
      ['--report', 'p', '--aggregate', 'a', 'b'],
    ]) {
      expect(parseExperimentArgs(argv)).toMatchObject({
        error: '--aggregate cannot be combined with run-mode flags',
      });
    }
  });
});

// ---------------------------------------------------------------------------
// runEmittingEval — reportPath default and the live fail-closed paths
// ---------------------------------------------------------------------------

describe('runEmittingEval — report default + live guard', () => {
  it('reportPath left undefined defaults to <emit-dir>/gate-report.md (written and returned)', async () => {
    const dir = tempDir();
    try {
      const { reportPath, verdict } = await runEmittingEval({
        variant: 'mock',
        repeats: 1,
        emitDir: dir,
        runIndex: 1,
        nowIso: '2026-08-18T12:00:00Z',
        // reportPath intentionally omitted — the default is the behavior under test
      });
      expect(reportPath).toBe(join(dir, 'gate-report.md'));
      expect(existsSync(join(dir, 'gate-report.md'))).toBe(true);
      expect(verdict).toBe('PASS_DETERMINISTIC_ONLY');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('live variant constructs the HTTP adapter fail-closed: no LCO_LLM_* env → rejects, emits nothing', async () => {
    const dir = tempDir();
    try {
      // beforeEach cleared every LCO_LLM_* name — createHttpLlm() must throw
      // before a single unit runs.
      await expect(
        runEmittingEval({
          variant: 'live',
          repeats: 1,
          emitDir: dir,
          runIndex: 1,
          nowIso: '2026-08-18T12:00:00Z',
          reportPath: null,
        }),
      ).rejects.toThrow(/live mode requires LCO_LLM_\* env vars/);
      // the emit dir was created (mkdir precedes adapter construction) but no
      // unit was ever emitted
      expect(readdirSync(dir)).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// CLI — live wiring without network
// ---------------------------------------------------------------------------

describe('runExperimentCli — live wiring (stubbed, no network)', () => {
  it('env satisfied but emit-dir under a FILE: exit 2 with the fs error, nothing emitted', async () => {
    const dir = tempDir();
    try {
      const blocker = join(dir, 'blocker-file');
      writeFileSync(blocker, 'x', 'utf8');
      const code = await runExperimentCli(
        ['--variant', 'live', '--emit-dir', join(blocker, 'sub')],
        { LCO_LLM_BASE_URL: 'https://stub.example.test/v1', LCO_LLM_API_KEY: 'k', LCO_LLM_MODEL: 'm' },
      );
      expect(code).toBe(2);
      expect(stderr()).toMatch(/not a directory/i);
      expect(existsSync(join(blocker, 'sub'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /**
   * Full live run with the transport pointed at a stubbed global fetch that
   * answers from the SAME mock scripts the mock variant uses — except proposal
   * A always fails schema validation, which forces the degraded-merger path
   * (BACK-008). Offline and deterministic: the dispatch is keyed on stable
   * prompt template markers, never on timing.
   */
  it('live run through a stubbed fetch: degraded council emits flagged outcomes, gate FAILs → exit 1', async () => {
    const scripts = buildMockScripts();
    let calls = 0;
    const okBody = (text: string): Response =>
      new Response(JSON.stringify({ choices: [{ message: { content: text } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    const notABundle = 'not-a-valid-bundle';
    const dispatch = (prompt: string): string => {
      // longest-intent match: prompts embed the task intent verbatim
      const task = EVAL_TASKS.filter((t) => prompt.includes(t.intent)).sort((a, b) => b.intent.length - a.intent.length)[0];
      if (task === undefined) throw new Error(`live stub: no task intent found in prompt`);
      const council = scripts.council.byTaskId[task.id]!;
      if (prompt.includes('You are the classifier step')) return council[0]!.text;
      // degraded merger (and, symmetrically, a healthy judge) return the final bundle
      if (prompt.includes('The council leg is DEGRADED')) return council[2]!.text;
      if (prompt.includes('Another member already produced proposal A')) return council[2]!.text;
      // single-variant merged call AND council proposal A both fail schema →
      // single blocks; council degrades
      return notABundle;
    };
    const fetchStub = vi.fn(async (_url: unknown, init?: RequestInit) => {
      calls += 1;
      const body = JSON.parse((init?.body as string) ?? '{}') as { messages?: { content?: string }[] };
      return okBody(dispatch(body.messages?.[0]?.content ?? ''));
    });
    vi.stubGlobal('fetch', fetchStub);
    process.env.LCO_LLM_BASE_URL = 'https://stub.example.test/v1';
    process.env.LCO_LLM_API_KEY = 'test-key-not-a-real-secret';
    process.env.LCO_LLM_MODEL = 'stub-model';

    const dir = tempDir();
    try {
      const code = await runExperimentCli(['--variant', 'live', '--emit-dir', dir]);
      // every greenfield single run blocked wrongly → the gate verdict is FAIL
      expect(code).toBe(1);
      expect(stdout()).toContain('VERDICT: FAIL');
      // progress lines report the failed greenfield units
      expect(stdout()).toContain('intent=FAIL');

      // Greenfield council: proposal A failed twice → DEGRADED merger still
      // produced a valid spec → emitted as spec AND flagged councilDegraded.
      const greenCouncil = JSON.parse(
        readFileSync(join(dir, emittedFileName('ET-01', 'council', 1)), 'utf8'),
      ) as EmittedOutcome;
      expect(greenCouncil.outcome.kind).toBe('spec');
      expect(greenCouncil.outcome.kind === 'spec' && greenCouncil.outcome.councilDegraded).toBe(true);
      expect(greenCouncil.outcome.kind === 'spec' && greenCouncil.outcome.bundle).toBeTruthy();
      expect(greenCouncil.score.intentPassed).toBe(true); // the degraded spec is the task's own grounded bundle
      expect(greenCouncil.usage).toMatchObject({ calls: 4, usageKnown: true }); // classifier + 2 failed A + judge

      // Ambiguous council: blocked (L08 via the unresolved bundle) AND degraded.
      const blockedCouncil = JSON.parse(
        readFileSync(join(dir, emittedFileName('ET-13', 'council', 1)), 'utf8'),
      ) as EmittedOutcome;
      expect(blockedCouncil.outcome.kind).toBe('blocked');
      expect(blockedCouncil.outcome.kind === 'blocked' && blockedCouncil.outcome.councilDegraded).toBe(true);
      expect(blockedCouncil.outcome.kind === 'blocked' && blockedCouncil.outcome.reasons.length).toBeGreaterThan(0);

      // Singles never carry the council flag; greenfield singles blocked after the retry.
      const greenSingle = JSON.parse(
        readFileSync(join(dir, emittedFileName('ET-01', 'single', 1)), 'utf8'),
      ) as EmittedOutcome;
      expect(greenSingle.outcome.kind).toBe('blocked');
      expect(greenSingle.outcome).not.toHaveProperty('councilDegraded');
      expect(greenSingle.usage).toMatchObject({ calls: 2 });

      // Exact transport cost: 20 singles x 2 attempts-in-chain + 20 councils x
      // (1 classifier + 2 failed proposal A + 1 judge).
      expect(calls).toBe(120);
      expect(readdirSync(dir).filter((f) => f.endsWith('.json'))).toHaveLength(40);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Bin-entry guard (require.main === module)
// ---------------------------------------------------------------------------

describe('bin-entry guard', () => {
  /** Save/restore the (normally absent) CJS globals the guard reads. */
  function snapshotCjsGlobals(): () => void {
    const g = globalThis as { require?: unknown; module?: unknown };
    const hadRequire = Object.getOwnPropertyDescriptor(globalThis, 'require');
    const hadModule = Object.getOwnPropertyDescriptor(globalThis, 'module');
    return () => {
      if (hadRequire === undefined) delete g.require;
      else Object.defineProperty(globalThis, 'require', hadRequire);
      if (hadModule === undefined) delete g.module;
      else Object.defineProperty(globalThis, 'module', hadModule);
    };
  }

  it('does not fire when require exists but require.main !== module (import stays side-effect free)', async () => {
    const restore = snapshotCjsGlobals();
    try {
      // Simulate a CJS host where `require` exists but this module is NOT the
      // process main — the guard must skip, or every import would launch the CLI.
      (globalThis as { require?: unknown }).require = { main: { not: 'this module' } };
      (globalThis as { module?: unknown }).module = {};
      vi.resetModules(); // force a fresh module evaluation under these globals
      const mod = await import('./live-experiment');
      expect(typeof mod.runExperimentCli).toBe('function');
      expect(typeof mod.parseExperimentArgs).toBe('function');
      // the guard never reached runExperimentCli: no usage block, no verdict line
      expect(stderr()).not.toContain('usage: live-experiment');
      expect(stdout()).not.toContain('VERDICT:');
    } finally {
      restore();
    }
  });
});