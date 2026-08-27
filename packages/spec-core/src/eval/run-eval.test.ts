import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// runEvalAll is Task 11's driver (40 mock LLM runs + fixture capture) — far
// too heavy for an argument-parsing test. Mock the report module so only the
// entry script's own logic (parse, env check, exit-code mapping) is under
// test here; runEvalAll itself is covered by report.test.ts against the real
// runner and fixtures.
vi.mock('./report', () => ({
  runEvalAll: vi.fn(),
}));

import { runEvalAll } from './report';
import { runEvalCli, parseArgs, missingLiveEnv, DEFAULT_REPORT_PATH } from './run-eval';

const mockRunEvalAll = vi.mocked(runEvalAll);

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  mockRunEvalAll.mockReset();
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

/** Fake, fully-populated live env — names only matter; these are not real credentials. */
const FAKE_LIVE_ENV = {
  LCO_LLM_BASE_URL: 'http://localhost:9999/v1',
  LCO_LLM_API_KEY: 'test-key',
  LCO_LLM_MODEL: 'test-model',
} as const;

describe('runEvalCli: argument parsing and defaults', () => {
  it('no arguments -> mock variant, 1 repeat, default report path', async () => {
    mockRunEvalAll.mockResolvedValue('PASS_DETERMINISTIC_ONLY');

    await expect(runEvalCli([])).resolves.toBe(0);

    expect(mockRunEvalAll).toHaveBeenCalledTimes(1);
    expect(mockRunEvalAll).toHaveBeenCalledWith({ variant: 'mock', repeats: 1, reportPath: DEFAULT_REPORT_PATH });
    expect(stdout()).toContain('VERDICT: PASS_DETERMINISTIC_ONLY');
    expect(stdout()).toContain(DEFAULT_REPORT_PATH);
  });

  it('--variant mock --report <path> are forwarded verbatim', async () => {
    mockRunEvalAll.mockResolvedValue('PASS');

    await expect(runEvalCli(['--variant', 'mock', '--report', '/tmp/gate.md'])).resolves.toBe(0);

    expect(mockRunEvalAll).toHaveBeenCalledWith({ variant: 'mock', repeats: 1, reportPath: '/tmp/gate.md' });
    expect(stdout()).toContain('report: /tmp/gate.md');
  });

  it('--repeats <n> is forwarded (PROD-003: repeated runs for live uncertainty)', async () => {
    mockRunEvalAll.mockResolvedValue('PASS');

    await expect(runEvalCli(['--variant', 'live', '--repeats', '3'], { ...FAKE_LIVE_ENV })).resolves.toBe(0);

    expect(mockRunEvalAll).toHaveBeenCalledWith({ variant: 'live', repeats: 3, reportPath: DEFAULT_REPORT_PATH });
  });

  it('--repeats rejects non-integers and values below 1 with exit 2', async () => {
    await expect(runEvalCli(['--repeats', 'abc'])).resolves.toBe(2);
    expect(stderr()).toContain('--repeats expects an integer >= 1');
    await expect(runEvalCli(['--repeats', '0'])).resolves.toBe(2);
    await expect(runEvalCli(['--repeats', '-2'])).resolves.toBe(2);
    await expect(runEvalCli(['--repeats'])).resolves.toBe(2);
    expect(mockRunEvalAll).not.toHaveBeenCalled();
  });

  it('default report path is the repo-root audit-output target (absolute)', () => {
    expect(DEFAULT_REPORT_PATH).toBe('/' + DEFAULT_REPORT_PATH.replace(/^\//, '')); // absolute
    expect(DEFAULT_REPORT_PATH.endsWith('audit-output/spec-core-gate-report.md')).toBe(true);
  });
});

describe('runEvalCli: exit-code mapping', () => {
  it('PASS_DETERMINISTIC_ONLY -> 0', async () => {
    mockRunEvalAll.mockResolvedValue('PASS_DETERMINISTIC_ONLY');
    await expect(runEvalCli([])).resolves.toBe(0);
  });

  it('PASS -> 0', async () => {
    mockRunEvalAll.mockResolvedValue('PASS');
    await expect(runEvalCli([])).resolves.toBe(0);
  });

  it('FAIL -> 1 with the verdict still on stdout', async () => {
    mockRunEvalAll.mockResolvedValue('FAIL');
    await expect(runEvalCli([])).resolves.toBe(1);
    expect(stdout()).toContain('VERDICT: FAIL');
  });
});

describe('runEvalCli: live variant env guard (never half-configured)', () => {
  it('live with all LCO_LLM_* set -> live runEvalAll, exit 0', async () => {
    mockRunEvalAll.mockResolvedValue('PASS');

    await expect(runEvalCli(['--variant', 'live'], { ...FAKE_LIVE_ENV })).resolves.toBe(0);

    expect(mockRunEvalAll).toHaveBeenCalledTimes(1);
    expect(mockRunEvalAll).toHaveBeenCalledWith({ variant: 'live', repeats: 1, reportPath: DEFAULT_REPORT_PATH });
  });

  it('live with no env -> exit 2, runEvalAll never called, all three names listed', async () => {
    await expect(runEvalCli(['--variant', 'live'], {})).resolves.toBe(2);

    expect(mockRunEvalAll).not.toHaveBeenCalled();
    expect(stderr()).toContain('LCO_LLM_BASE_URL');
    expect(stderr()).toContain('LCO_LLM_API_KEY');
    expect(stderr()).toContain('LCO_LLM_MODEL');
    expect(stderr()).toContain('refusing to run half-configured');
  });

  it('live with partially blank env -> exit 2 naming only the missing vars', async () => {
    await expect(
      runEvalCli(['--variant', 'live'], { LCO_LLM_BASE_URL: 'http://x', LCO_LLM_API_KEY: '   ' }),
    ).resolves.toBe(2);

    expect(mockRunEvalAll).not.toHaveBeenCalled();
    expect(stderr()).toContain('missing: LCO_LLM_API_KEY, LCO_LLM_MODEL');
  });

  it('missingLiveEnv treats blank strings as missing', () => {
    expect(missingLiveEnv(FAKE_LIVE_ENV)).toEqual([]);
    expect(missingLiveEnv({})).toEqual(['LCO_LLM_BASE_URL', 'LCO_LLM_API_KEY', 'LCO_LLM_MODEL']);
    expect(missingLiveEnv({ LCO_LLM_MODEL: ' ' })).toEqual([
      'LCO_LLM_BASE_URL',
      'LCO_LLM_API_KEY',
      'LCO_LLM_MODEL',
    ]);
  });
});

describe('runEvalCli: usage errors (exit 2)', () => {
  it('unknown argument -> usage on stderr', async () => {
    await expect(runEvalCli(['--bogus'])).resolves.toBe(2);
    expect(stderr()).toContain('unknown argument: --bogus');
    expect(stderr()).toContain('usage:');
    expect(mockRunEvalAll).not.toHaveBeenCalled();
  });

  it('invalid variant value -> exit 2', async () => {
    await expect(runEvalCli(['--variant', 'turbo'])).resolves.toBe(2);
    expect(stderr()).toContain('--variant expects mock or live');
  });

  it('--variant without a value -> exit 2', async () => {
    await expect(runEvalCli(['--variant'])).resolves.toBe(2);
    expect(stderr()).toContain('--variant expects mock or live');
  });

  it('--report without a value -> exit 2', async () => {
    await expect(runEvalCli(['--report'])).resolves.toBe(2);
    expect(stderr()).toContain('--report expects a path');
  });
});

describe('parseArgs: pure argument parsing', () => {
  it('returns defaults for an empty argv', () => {
    expect(parseArgs([])).toEqual({ variant: 'mock', repeats: 1, reportPath: DEFAULT_REPORT_PATH });
  });

  it('accepts all flags in any order', () => {
    expect(parseArgs(['--report', '/r.md', '--repeats', '5', '--variant', 'live'])).toEqual({
      variant: 'live',
      repeats: 5,
      reportPath: '/r.md',
    });
  });

  it('rejects positional arguments', () => {
    expect(parseArgs(['extra'])).toEqual({ error: 'unknown argument: extra' });
  });

  it('rejects a --repeats value that is not a plain integer', () => {
    expect(parseArgs(['--repeats', '2.5'])).toEqual({ error: '--repeats expects an integer >= 1, got: 2.5' });
    expect(parseArgs(['--repeats', '1e3'])).toEqual({ error: '--repeats expects an integer >= 1, got: 1e3' });
  });
});
