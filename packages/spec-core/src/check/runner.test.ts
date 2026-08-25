import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_TIMEOUT_MS,
  parseExpect,
  runChecks,
  type Executor,
} from './runner';
import { SpecBundleSchema, type SpecBundle, type TaskContract } from '../schemas';

const FIXTURES = join(__dirname, '../../fixtures');
const NOW = '2026-08-25T12:00:00Z';

/** Raw pet-clinic fixture: three tasks, real refs, verifications overridden per test. */
const PET_CLINIC = JSON.parse(
  readFileSync(join(FIXTURES, 'good/pet-clinic/bundle.json'), 'utf8'),
) as Record<string, unknown>;

type Verification = Array<{ command: string; expect: string }>;

/**
 * A validated bundle whose task verifications come from the map (default per
 * task: a trivially parseable echo). The fixture's own 'exit code 0, ...'
 * expects would all be UNPARSEABLE — tests need precise control instead.
 */
function bundleWith(verifications: Record<string, Verification>): SpecBundle {
  const raw = structuredClone(PET_CLINIC);
  for (const t of raw.tasks as TaskContract[]) {
    t.verification = verifications[t.task_id] ?? [
      { command: `echo ${t.task_id}`, expect: 'exit 0' },
    ];
  }
  return SpecBundleSchema.parse(raw);
}

interface FakeCall {
  cmd: string;
  cwd: string;
  timeoutMs: number;
}

/** Injectable fake Executor: records every call, answers from `plan`. */
function fakeExec(
  plan: (call: FakeCall, index: number) => { exit: number | null; stdout: string; timedOut: boolean },
): { calls: FakeCall[]; exec: Executor } {
  const calls: FakeCall[] = [];
  const exec: Executor = async (cmd, cwd, timeoutMs) => {
    const call = { cmd, cwd, timeoutMs };
    calls.push(call);
    return plan(call, calls.length);
  };
  return { calls, exec };
}

const tmpDirs: string[] = [];

function freshRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(root);
  return root;
}

function evidencePath(root: string, taskId: string): string {
  return join(root, 'spec', 'evidence', `${taskId}-check.json`);
}

afterEach(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  tmpDirs.length = 0;
});

// --- parseExpect: the ONLY way a check becomes judgeable ----------------------

describe('parseExpect', () => {
  it("'exit 0' -> 0", () => {
    expect(parseExpect('exit 0')).toBe(0);
  });

  it("'exit 3' -> 3", () => {
    expect(parseExpect('exit 3')).toBe(3);
  });

  it("'çıktı boş olmalı' (no exit code at all) -> null", () => {
    expect(parseExpect('çıktı boş olmalı')).toBe(null);
  });

  it("'exit 0 ve exit 1' -> 0 (FIRST match wins)", () => {
    expect(parseExpect('exit 0 ve exit 1')).toBe(0);
  });

  it("'exit code 0, all cases pass' (real fixture style: 'exit' not followed by digits) -> null", () => {
    // Fail-closed by design: if the expect cannot be judged, the command is
    // never executed — vague fixture prose must not silently become exit 0.
    expect(parseExpect('exit code 0, all cases pass')).toBe(null);
  });
});

// --- yes=true: PASS / FAIL / TIMEOUT / UNPARSEABLE-EXPECT ----------------------

describe('runChecks --yes: outcome classification', () => {
  it('exit 0 vs expect "exit 0" -> PASS, code 0, evidence recorded', async () => {
    const root = freshRoot('spec-core-check-pass-');
    const bundle = bundleWith({
      'TASK-0001': [{ command: 'vitest run tests/appointments.test.ts', expect: 'exit 0' }],
    });
    const { calls, exec } = fakeExec(() => ({ exit: 0, stdout: '3 passed\n', timedOut: false }));

    const result = await runChecks(bundle, root, { task: 'TASK-0001', yes: true, nowIso: NOW, exec });

    expect(result.code).toBe(0);
    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0]).toMatchObject({
      taskId: 'TASK-0001',
      command: 'vitest run tests/appointments.test.ts',
      expect: 'exit 0',
      expectedExit: 0,
      actualExit: 0,
      status: 'PASS',
      outputTail: '3 passed\n',
    });
    expect(typeof result.outcomes[0].durationMs).toBe('number');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ cmd: 'vitest run tests/appointments.test.ts', cwd: root, timeoutMs: DEFAULT_TIMEOUT_MS });

    const stored = JSON.parse(readFileSync(evidencePath(root, 'TASK-0001'), 'utf8'));
    expect(stored).toEqual({
      task_id: 'TASK-0001',
      checkedAt: NOW,
      checks: [
        {
          command: 'vitest run tests/appointments.test.ts',
          expect: 'exit 0',
          expectedExit: 0,
          actualExit: 0,
          status: 'PASS',
          durationMs: expect.any(Number),
          outputTail: '3 passed\n',
        },
      ],
    });
  });

  it('exit 3 vs expected 0 -> FAIL, code 1', async () => {
    const root = freshRoot('spec-core-check-fail-');
    const bundle = bundleWith({
      'TASK-0001': [{ command: 'vitest run tests/appointments.test.ts', expect: 'exit 0' }],
    });
    const { exec } = fakeExec(() => ({ exit: 3, stdout: '1 failed\n', timedOut: false }));

    const result = await runChecks(bundle, root, { yes: true, nowIso: NOW, exec });

    expect(result.code).toBe(1);
    expect(result.outcomes[0]).toMatchObject({ status: 'FAIL', expectedExit: 0, actualExit: 3, outputTail: '1 failed\n' });
    expect(JSON.parse(readFileSync(evidencePath(root, 'TASK-0001'), 'utf8')).checks[0].status).toBe('FAIL');
  });

  it('timedOut -> TIMEOUT (counted as failure), exit ignored', async () => {
    const root = freshRoot('spec-core-check-timeout-');
    const bundle = bundleWith({
      'TASK-0001': [{ command: 'slow-suite', expect: 'exit 0' }],
    });
    const { exec } = fakeExec(() => ({ exit: null, stdout: '...partial', timedOut: true }));

    const result = await runChecks(bundle, root, { yes: true, nowIso: NOW, exec });

    expect(result.code).toBe(1);
    expect(result.outcomes[0]).toMatchObject({ status: 'TIMEOUT', actualExit: null, outputTail: '...partial' });
    expect(JSON.parse(readFileSync(evidencePath(root, 'TASK-0001'), 'utf8')).checks[0].status).toBe('TIMEOUT');
  });

  it('unparseable expect -> UNPARSEABLE-EXPECT and the command is NEVER executed (fail-closed)', async () => {
    const root = freshRoot('spec-core-check-unparseable-');
    const bundle = bundleWith({
      'TASK-0001': [
        { command: 'rm -rf /important', expect: 'çıktı boş olmalı' }, // not judgeable
        { command: 'echo still-runnable', expect: 'exit 0' }, // judgeable sibling
      ],
    });
    const { calls, exec } = fakeExec(() => ({ exit: 0, stdout: '', timedOut: false }));

    const result = await runChecks(bundle, root, { task: 'TASK-0001', yes: true, nowIso: NOW, exec });

    expect(result.code).toBe(1);
    expect(result.outcomes).toHaveLength(2);
    expect(result.outcomes[0]).toMatchObject({
      status: 'UNPARSEABLE-EXPECT',
      expectedExit: null,
      actualExit: null,
      command: 'rm -rf /important',
    });
    // Exactly ONE exec call: the judgeable sibling only — the unjudgeable
    // entry was skipped, not run-and-recorded.
    expect(calls.map((c) => c.cmd)).toEqual(['echo still-runnable']);
    expect(result.outcomes[1].status).toBe('PASS');
    // The skip is recorded as evidence too (an audit trail of what --yes did).
    const stored = JSON.parse(readFileSync(evidencePath(root, 'TASK-0001'), 'utf8'));
    expect(stored.checks.map((c: { status: string }) => c.status)).toEqual([
      'UNPARSEABLE-EXPECT',
      'PASS',
    ]);
  });
});

// --- evidence: ONE file per task, checks array, injected checkedAt --------------

describe('runChecks --yes: evidence file shape', () => {
  it('one task with two entries -> a single <TASK-ID>-check.json with a checks array', async () => {
    const root = freshRoot('spec-core-check-evidence-');
    const bundle = bundleWith({
      'TASK-0001': [
        { command: 'cmd-a', expect: 'exit 0' },
        { command: 'cmd-b', expect: 'exit 0' }, // same expectation, different outcome
      ],
    });
    const { exec } = fakeExec((call) =>
      call.cmd === 'cmd-a'
        ? { exit: 0, stdout: 'a-out', timedOut: false }
        : { exit: 1, stdout: 'b-out', timedOut: false },
    );

    const result = await runChecks(bundle, root, { task: 'TASK-0001', yes: true, nowIso: NOW, exec });

    expect(result.code).toBe(1); // PASS + FAIL
    const evidenceDir = join(root, 'spec', 'evidence');
    expect(readdirSync(evidenceDir)).toEqual(['TASK-0001-check.json']); // exactly one file

    const stored = JSON.parse(readFileSync(join(evidenceDir, 'TASK-0001-check.json'), 'utf8'));
    expect(Object.keys(stored)).toEqual(['task_id', 'checkedAt', 'checks']);
    expect(stored.task_id).toBe('TASK-0001');
    expect(stored.checkedAt).toBe(NOW);
    expect(stored.checks).toHaveLength(2);
    expect(stored.checks[0]).toEqual({
      command: 'cmd-a',
      expect: 'exit 0',
      expectedExit: 0,
      actualExit: 0,
      status: 'PASS',
      durationMs: expect.any(Number),
      outputTail: 'a-out',
    });
    expect(stored.checks[1]).toMatchObject({
      command: 'cmd-b',
      status: 'FAIL',
      expectedExit: 0,
      actualExit: 1,
    });
  });

  it('no --task -> one evidence file PER task (three tasks, three files)', async () => {
    const root = freshRoot('spec-core-check-evidence-all-');
    const bundle = bundleWith({}); // all three tasks get a parseable echo default
    const { exec } = fakeExec(() => ({ exit: 0, stdout: 'ok', timedOut: false }));

    const result = await runChecks(bundle, root, { yes: true, nowIso: NOW, exec });

    expect(result.code).toBe(0);
    expect(readdirSync(join(root, 'spec', 'evidence')).sort()).toEqual([
      'TASK-0001-check.json',
      'TASK-0002-check.json',
      'TASK-0003-check.json',
    ]);
  });

  it('outputTail keeps only the LAST 500 chars of combined output', async () => {
    const root = freshRoot('spec-core-check-tail-');
    const bundle = bundleWith({
      'TASK-0001': [{ command: 'noisy', expect: 'exit 0' }],
    });
    const long = `${'a'.repeat(300)}MARKER${'b'.repeat(700)}`; // 1007 chars
    const { exec } = fakeExec(() => ({ exit: 0, stdout: long, timedOut: false }));

    const result = await runChecks(bundle, root, { task: 'TASK-0001', yes: true, nowIso: NOW, exec });

    expect(result.outcomes[0].outputTail).toBe(long.slice(-500));
    expect(result.outcomes[0].outputTail).toHaveLength(500);
    expect(result.outcomes[0].outputTail.endsWith('MARKER' + 'b'.repeat(700))).toBe(false); // head dropped
    expect(result.outcomes[0].outputTail.startsWith('b')).toBe(true);
  });
});

// --- DRY RUN: the security model -----------------------------------------------

describe('runChecks DRY (yes=false): nothing executes, nothing is written', () => {
  it('exec is NEVER called, all statuses DRY, code 0, no evidence files', async () => {
    const root = freshRoot('spec-core-check-dry-');
    const bundle = bundleWith({}); // all three tasks
    const { calls, exec } = fakeExec(() => {
      throw new Error('DRY mode must never execute anything');
    });

    const result = await runChecks(bundle, root, { yes: false, nowIso: NOW, exec });

    expect(calls).toHaveLength(0); // the DRY claim, as a hard count
    expect(result.code).toBe(0);
    expect(result.outcomes).toHaveLength(3);
    for (const o of result.outcomes) {
      expect(o.status).toBe('DRY');
      expect(o.actualExit).toBe(null);
      expect(o.outputTail).toBe('');
    }
    // Not even the spec/evidence directory was created.
    expect(existsSync(join(root, 'spec'))).toBe(false);
    expect(readdirSync(root)).toEqual([]);
  });

  it('DRY still reports the parsed expectation (expectedExit present, actualExit null)', async () => {
    const root = freshRoot('spec-core-check-dry-parse-');
    const bundle = bundleWith({
      'TASK-0001': [{ command: 'vitest run', expect: 'exit 0' }],
    });
    const { exec } = fakeExec(() => {
      throw new Error('never');
    });

    const result = await runChecks(bundle, root, { task: 'TASK-0001', yes: false, nowIso: NOW, exec });

    expect(result.outcomes[0]).toMatchObject({ expectedExit: 0, actualExit: null, status: 'DRY' });
  });
});

// --- task selection ---------------------------------------------------------------

describe('runChecks task selection', () => {
  it('--task TASK-0002 -> only TASK-0002 runs (one exec call, cwd = dir)', async () => {
    const root = freshRoot('spec-core-check-select-');
    const bundle = bundleWith({
      'TASK-0002': [{ command: 'only-this', expect: 'exit 0' }],
    });
    const { calls, exec } = fakeExec(() => ({ exit: 0, stdout: '', timedOut: false }));

    const result = await runChecks(bundle, root, { task: 'TASK-0002', yes: true, nowIso: NOW, exec });

    expect(calls.map((c) => c.cmd)).toEqual(['only-this']);
    expect(calls[0].cwd).toBe(root);
    expect(result.outcomes.map((o) => o.taskId)).toEqual(['TASK-0002']);
    expect(readdirSync(join(root, 'spec', 'evidence'))).toEqual(['TASK-0002-check.json']);
    expect(result.code).toBe(0);
  });

  it('unknown task id -> { code: 2, outcomes: [] } and nothing written', async () => {
    const root = freshRoot('spec-core-check-unknown-');
    const bundle = bundleWith({});
    const { calls, exec } = fakeExec(() => {
      throw new Error('never');
    });

    const result = await runChecks(bundle, root, { task: 'TASK-9999', yes: true, nowIso: NOW, exec });

    expect(result).toEqual({ code: 2, outcomes: [] });
    expect(calls).toHaveLength(0);
    expect(readdirSync(root)).toEqual([]);
  });
});

// --- executor plumbing --------------------------------------------------------------

describe('runChecks executor plumbing', () => {
  it('custom timeoutMs is passed through to the executor', async () => {
    const root = freshRoot('spec-core-check-timeoutms-');
    const bundle = bundleWith({});
    const { calls, exec } = fakeExec(() => ({ exit: 0, stdout: '', timedOut: false }));

    await runChecks(bundle, root, { task: 'TASK-0001', yes: true, timeoutMs: 1234, nowIso: NOW, exec });

    expect(calls[0].timeoutMs).toBe(1234);
  });

  it('omit timeoutMs -> the 60s default is used', async () => {
    const root = freshRoot('spec-core-check-default-timeout-');
    const bundle = bundleWith({});
    const { calls, exec } = fakeExec(() => ({ exit: 0, stdout: '', timedOut: false }));

    await runChecks(bundle, root, { task: 'TASK-0001', yes: true, nowIso: NOW, exec });

    expect(calls[0].timeoutMs).toBe(60_000);
  });
});
