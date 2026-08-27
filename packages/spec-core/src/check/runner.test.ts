import { describe, it, expect, afterEach } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_TIMEOUT_MS,
  execCommand,
  killActiveProcessGroups,
  parseExpect,
  runChecks,
  type Executor,
} from './runner';
import { PathEscapeError } from '../storage/paths';
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

/** The (single) run-addressed evidence file for a task: <TASK-ID>-check-<run>.json. */
function evidencePath(root: string, taskId: string): string {
  const dir = join(root, 'spec', 'evidence');
  const matches = readdirSync(dir).filter((f) => f.startsWith(`${taskId}-check-`));
  expect(matches).toHaveLength(1);
  return join(dir, matches[0]!);
}

/** All evidence files for a task in readdir (lexicographic) order. */
function evidenceFilesFor(root: string, taskId: string): string[] {
  return readdirSync(join(root, 'spec', 'evidence'))
    .filter((f) => f.startsWith(`${taskId}-check-`))
    .sort();
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
  it('one task with two entries -> a single run-addressed evidence file with a checks array', async () => {
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
    expect(readdirSync(evidenceDir)).toEqual(['TASK-0001-check-20260825T120000Z-001.json']); // exactly one file

    const stored = JSON.parse(readFileSync(join(evidenceDir, 'TASK-0001-check-20260825T120000Z-001.json'), 'utf8'));
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
      'TASK-0001-check-20260825T120000Z-001.json',
      'TASK-0002-check-20260825T120000Z-001.json',
      'TASK-0003-check-20260825T120000Z-001.json',
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

  // --- BACK-004: DRY is an HONEST preview — it surfaces an unjudgeable
  // expectation as a FAILURE (exit 1, status UNPARSEABLE-EXPECT) instead of
  // labeling it DRY and hiding the failure until consent is supplied. The
  // dry run previews exactly what --yes would judge; --yes itself still
  // never EXECUTES an unjudgeable command (protected invariant).

  it('DRY + unparseable expect -> UNPARSEABLE-EXPECT (NOT DRY), code 1, nothing executed', async () => {
    const root = freshRoot('spec-core-check-dry-unparseable-');
    const bundle = bundleWith({
      'TASK-0001': [
        { command: 'rm -rf /important', expect: 'exit code 0, all cases pass' },
        { command: 'echo judgeable', expect: 'exit 0' },
      ],
    });
    const { calls, exec } = fakeExec(() => {
      throw new Error('DRY mode must never execute anything');
    });

    const result = await runChecks(bundle, root, { task: 'TASK-0001', yes: false, nowIso: NOW, exec });

    expect(calls).toHaveLength(0); // still nothing executes — the invariant holds
    expect(result.code).toBe(1); // the honest preview FAILS, not exits 0
    expect(result.outcomes).toHaveLength(2);
    expect(result.outcomes[0]).toMatchObject({
      status: 'UNPARSEABLE-EXPECT',
      expect: 'exit code 0, all cases pass',
      expectedExit: null,
      actualExit: null,
    });
    expect(result.outcomes[1].status).toBe('DRY'); // the judgeable sibling stays DRY
    expect(existsSync(join(root, 'spec'))).toBe(false); // DRY still writes nothing
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
    expect(readdirSync(join(root, 'spec', 'evidence'))).toEqual(['TASK-0002-check-20260825T120000Z-001.json']);
    expect(result.code).toBe(0);
  });

  it('unknown task id -> { code: 2, outcomes: [] } and nothing written', async () => {
    const root = freshRoot('spec-core-check-unknown-');
    const bundle = bundleWith({});
    const { calls, exec } = fakeExec(() => {
      throw new Error('never');
    });

    const result = await runChecks(bundle, root, { task: 'TASK-9999', yes: true, nowIso: NOW, exec });

    expect(result).toEqual({ code: 2, outcomes: [], evidenceFiles: [] });
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

// --- SEC-004: hardened, run-addressed, immutable evidence --------------------------

describe('runChecks --yes: SEC-004 evidence hardening', () => {
  it('evidence files are created with mode 0600 (owner-only)', async () => {
    const root = freshRoot('spec-core-check-mode-');
    const bundle = bundleWith({});
    const { exec } = fakeExec(() => ({ exit: 0, stdout: 'ok', timedOut: false }));

    await runChecks(bundle, root, { task: 'TASK-0001', yes: true, nowIso: NOW, exec });

    const file = evidencePath(root, 'TASK-0001');
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it('a second run NEVER overwrites the first: two files, ordered names', async () => {
    const root = freshRoot('spec-core-check-rerun-');
    const bundle = bundleWith({});
    const first = fakeExec(() => ({ exit: 0, stdout: 'first run ok', timedOut: false }));
    await runChecks(bundle, root, { task: 'TASK-0001', yes: true, nowIso: NOW, exec: first.exec });

    const second = fakeExec(() => ({ exit: 1, stdout: 'second run FAILED', timedOut: false }));
    await runChecks(bundle, root, { task: 'TASK-0001', yes: true, nowIso: NOW, exec: second.exec });

    const files = evidenceFilesFor(root, 'TASK-0001');
    expect(files).toHaveLength(2); // immutable: the first run survived
    expect(files).toEqual([...files].sort()); // ordered (lexicographic = chronological)
    const firstJson = JSON.parse(readFileSync(join(root, 'spec', 'evidence', files[0]!), 'utf8'));
    const secondJson = JSON.parse(readFileSync(join(root, 'spec', 'evidence', files[1]!), 'utf8'));
    expect(firstJson.checks[0].outputTail).toBe('first run ok'); // NOT erased by the rerun
    expect(secondJson.checks[0].outputTail).toBe('second run FAILED');
  });

  it('run id is deterministic: injected nowIso + task id + collision counter', async () => {
    const root = freshRoot('spec-core-check-runid-');
    const bundle = bundleWith({});
    const { exec } = fakeExec(() => ({ exit: 0, stdout: '', timedOut: false }));
    const result = await runChecks(bundle, root, { task: 'TASK-0001', yes: true, nowIso: NOW, exec });

    // Same injected clock -> same base name, distinct counter suffix.
    expect(result.evidenceFiles).toHaveLength(1);
    expect(result.evidenceFiles[0]).toBe(
      join(root, 'spec', 'evidence', 'TASK-0001-check-20260825T120000Z-001.json'),
    );
  });

  it('a later run with a DIFFERENT nowIso sorts after the earlier one', async () => {
    const root = freshRoot('spec-core-check-chrono-');
    const bundle = bundleWith({});
    const { exec } = fakeExec(() => ({ exit: 0, stdout: '', timedOut: false }));
    await runChecks(bundle, root, { task: 'TASK-0001', yes: true, nowIso: '2026-08-25T12:00:00Z', exec });
    await runChecks(bundle, root, { task: 'TASK-0001', yes: true, nowIso: '2026-08-25T12:05:00Z', exec });

    const files = evidenceFilesFor(root, 'TASK-0001');
    expect(files).toHaveLength(2);
    expect(files[0]).toBe('TASK-0001-check-20260825T120000Z-001.json');
    expect(files[1]).toBe('TASK-0001-check-20260825T120500Z-001.json');
  });

  it('redaction runs BEFORE persistence: a printed token never lands in the file', async () => {
    const root = freshRoot('spec-core-check-redact-');
    const bundle = bundleWith({});
    const secret = 'sk-AbCdEf1234567890aBcDeF';
    const { exec } = fakeExec(() => ({ exit: 1, stdout: `auth failed for ${secret}\n`, timedOut: false }));

    const result = await runChecks(bundle, root, { task: 'TASK-0001', yes: true, nowIso: NOW, exec });

    const raw = readFileSync(evidencePath(root, 'TASK-0001'), 'utf8');
    expect(raw).not.toContain(secret);
    expect(raw).toContain('[REDACTED:api-key]');
    // The in-memory outcome carries the SAME redaction (no split-brain trail).
    expect(result.outcomes[0].outputTail).not.toContain(secret);
  });

  it('non-secret output tails are stored verbatim (redaction is conservative)', async () => {
    const root = freshRoot('spec-core-check-clean-tail-');
    const bundle = bundleWith({});
    const out = 'Test Files  1 passed (1)\n     Tests  3 passed (3)\n';
    const { exec } = fakeExec(() => ({ exit: 0, stdout: out, timedOut: false }));

    const result = await runChecks(bundle, root, { task: 'TASK-0001', yes: true, nowIso: NOW, exec });

    expect(result.outcomes[0].outputTail).toBe(out);
    expect(JSON.parse(readFileSync(evidencePath(root, 'TASK-0001'), 'utf8')).checks[0].outputTail).toBe(out);
  });
});

// --- SEC-003: the evidence write cannot escape the spec root ------------------------

describe('runChecks --yes: SEC-003 evidence write containment', () => {
  it('spec/evidence symlinked elsewhere -> structured refusal, nothing written through the link', async () => {
    const root = freshRoot('spec-core-check-evlink-');
    mkdirSync(join(root, 'spec'), { recursive: true });
    const outside = freshRoot('spec-core-check-outside-');
    const outsideEvidence = join(outside, 'evidence');
    mkdirSync(outsideEvidence);
    symlinkSync(outsideEvidence, join(root, 'spec', 'evidence'));

    const bundle = bundleWith({});
    const { calls, exec } = fakeExec(() => ({ exit: 0, stdout: 'ok', timedOut: false }));

    await expect(
      runChecks(bundle, root, { task: 'TASK-0001', yes: true, nowIso: NOW, exec }),
    ).rejects.toThrow(/symlink/);
    // Refused BEFORE any write: the outside dir saw no new file.
    expect(readdirSync(outsideEvidence)).toEqual([]);
    expect(calls).toHaveLength(1); // commands ran; the EVIDENCE write is what refused
  });

  it('spec itself symlinked elsewhere -> structured refusal (dir variant)', async () => {
    const root = freshRoot('spec-core-check-speclink-');
    const outside = mkdtempSync(join(tmpdir(), 'spec-core-check-outside2-'));
    tmpDirs.push(outside);
    mkdirSync(join(outside, 'spec'), { recursive: true });
    symlinkSync(join(outside, 'spec'), join(root, 'spec'));

    const bundle = bundleWith({});
    const { exec } = fakeExec(() => ({ exit: 0, stdout: 'ok', timedOut: false }));

    await expect(
      runChecks(bundle, root, { task: 'TASK-0001', yes: true, nowIso: NOW, exec }),
    ).rejects.toThrow(PathEscapeError);
    // Nothing was created inside the symlink target.
    expect(readdirSync(join(outside, 'spec'))).toEqual([]);
  });

  it('a symlinked ROOT path still works (legitimate reorganization, no false positive)', async () => {
    const real = freshRoot('spec-core-check-realroot-');
    const holder = mkdtempSync(join(tmpdir(), 'spec-core-check-hold-'));
    tmpDirs.push(holder);
    const link = join(holder, 'workspace');
    symlinkSync(real, link);

    const bundle = bundleWith({});
    const { exec } = fakeExec(() => ({ exit: 0, stdout: 'ok', timedOut: false }));
    const result = await runChecks(bundle, link, { task: 'TASK-0001', yes: true, nowIso: NOW, exec });

    expect(result.code).toBe(0);
    expect(existsSync(join(real, 'spec', 'evidence'))).toBe(true); // landed under the REAL root
    expect(readdirSync(join(real, 'spec', 'evidence'))).toHaveLength(1);
  });
});

// --- SEC-005: process-group execution containment (REAL processes, POSIX) ----------
//
// The audit's reproduced scenario: `exec`'s timeout kills the shell child only,
// so grandchildren SURVIVE a TIMEOUT verdict and keep running (consuming
// resources, mutating the workspace) after evidence is written; and a command
// reading stdin has no input protocol, so it occupies the full timeout.
// These tests run the REAL executor (no injection) with REAL processes.

/** Wall-clock sleep for the real-process tests (settle windows, not core logic). */
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe('execCommand / SEC-005: process-group containment (real processes)', () => {
  it('timeout kills the WHOLE group: the orphaned grandchild never writes its marker', async () => {
    const root = freshRoot('spec-core-sec005-tree-');
    const marker = join(root, 'marker.txt');
    // A background grandchild (all fds redirected — it holds no pipes) would
    // write the marker 0.9s in; the foreground `wait` sleeps forever past the
    // 300ms timeout. This is the audit's reproduction: today the surviving
    // grandchild writes the marker AFTER the TIMEOUT verdict came back.
    const bundle = bundleWith({
      'TASK-0001': [
        {
          command: `sleep 30 >/dev/null 2>&1 & ( sleep 0.9; echo survived > ${marker} ) >/dev/null 2>&1 & wait`,
          expect: 'exit 0',
        },
      ],
    });

    const result = await runChecks(bundle, root, {
      task: 'TASK-0001',
      yes: true,
      timeoutMs: 300,
      nowIso: NOW,
    });

    expect(result.outcomes[0].status).toBe('TIMEOUT'); // classification preserved
    expect(result.code).toBe(1);
    // Past the grandchild's would-be write time: the marker must NOT exist.
    await sleep(1500);
    expect(existsSync(marker)).toBe(false);
  }, 10_000);

  it('stdin is closed (EOF): a command reading stdin finishes immediately, not at the timeout', async () => {
    const root = freshRoot('spec-core-sec005-stdin-');
    const bundle = bundleWith({
      'TASK-0001': [{ command: 'cat', expect: 'exit 0' }], // blocks reading stdin forever if stdin never EOFs
    });

    const result = await runChecks(bundle, root, {
      task: 'TASK-0001',
      yes: true,
      timeoutMs: 1500,
      nowIso: NOW,
    });

    expect(result.outcomes[0].status).toBe('PASS'); // cat saw EOF and exited 0
    expect(result.outcomes[0].durationMs).toBeLessThan(1000); // far under the 1500ms timeout
  }, 10_000);

  it('normal completion kills lingering group members (no leak past the verdict)', async () => {
    const root = freshRoot('spec-core-sec005-leak-');
    const marker = join(root, 'leak.txt');
    // The shell exits immediately; a redirected background grandchild would
    // live 1.2s beyond the verdict if the group were not cleaned up.
    const bundle = bundleWith({
      'TASK-0001': [
        { command: `( sleep 1.2; echo leaked > ${marker} ) >/dev/null 2>&1 & echo ok`, expect: 'exit 0' },
        { command: 'echo second-check', expect: 'exit 0' }, // a later check in the same run
      ],
    });

    const result = await runChecks(bundle, root, {
      task: 'TASK-0001',
      yes: true,
      timeoutMs: 5000,
      nowIso: NOW,
    });

    expect(result.outcomes.map((o) => o.status)).toEqual(['PASS', 'PASS']);
    expect(result.outcomes[0].durationMs).toBeLessThan(1500); // did not wait for the grandchild
    // Past the grandchild's would-be write time: nothing survived the verdict.
    await sleep(1600);
    expect(existsSync(marker)).toBe(false);
  }, 10_000);

  it('a SIGTERM-ignoring command is escalated to SIGKILL within the grace window', async () => {
    const root = freshRoot('spec-core-sec005-grace-');
    const bundle = bundleWith({
      // The shell traps SIGTERM (ignore) — only SIGKILL ends it. Natural exit
      // would be 4000ms; the grace escalation must end it far sooner.
      'TASK-0001': [{ command: `trap '' TERM; sleep 4`, expect: 'exit 0' }],
    });

    const result = await runChecks(bundle, root, {
      task: 'TASK-0001',
      yes: true,
      timeoutMs: 250,
      nowIso: NOW,
    });

    expect(result.outcomes[0].status).toBe('TIMEOUT');
    expect(result.outcomes[0].durationMs).toBeLessThan(2500); // << the 4000ms natural exit
  }, 10_000);

  it('real timeout: exit null, TIMEOUT, evidence records TIMEOUT (classification parity)', async () => {
    const root = freshRoot('spec-core-sec005-timeout-');
    const bundle = bundleWith({
      'TASK-0001': [{ command: 'sleep 30', expect: 'exit 0' }],
    });

    const result = await runChecks(bundle, root, {
      task: 'TASK-0001',
      yes: true,
      timeoutMs: 300,
      nowIso: NOW,
    });

    expect(result.code).toBe(1);
    expect(result.outcomes[0]).toMatchObject({ status: 'TIMEOUT', actualExit: null });
    expect(JSON.parse(readFileSync(evidencePath(root, 'TASK-0001'), 'utf8')).checks[0].status).toBe('TIMEOUT');
  }, 10_000);

  it('real FAIL: nonzero exit code is judged (exit 3 -> FAIL)', async () => {
    const root = freshRoot('spec-core-sec005-fail-');
    const bundle = bundleWith({
      'TASK-0001': [{ command: 'exit 3', expect: 'exit 0' }],
    });

    const result = await runChecks(bundle, root, {
      task: 'TASK-0001',
      yes: true,
      timeoutMs: 5000,
      nowIso: NOW,
    });

    expect(result.outcomes[0]).toMatchObject({ status: 'FAIL', actualExit: 3, expectedExit: 0 });
  }, 10_000);

  it('the dead shell is reaped after normal exit: no zombie, no group remains', async () => {
    const root = freshRoot('spec-core-sec005-zombie-');
    const pidFile = join(root, 'pid');
    // $$ = the shell's own pid == the spawned group leader's pid.
    await execCommand(`echo $$ > ${pidFile}; exit 0`, root, 5000);

    const pid = Number(readFileSync(pidFile, 'utf8').trim());
    expect(pid).toBeGreaterThan(1);
    // kill(pid, 0) succeeds even for a ZOMBIE — throwing means fully reaped.
    expect(() => process.kill(pid, 0)).toThrow();
    // The process group is gone entirely.
    expect(() => process.kill(-pid, 0)).toThrow();
  }, 10_000);

  it('the dead shell is reaped after a timeout kill: no zombie, no group remains', async () => {
    const root = freshRoot('spec-core-sec005-zombie-to-');
    const pidFile = join(root, 'pid');
    const result = await execCommand(`echo $$ > ${pidFile}; sleep 30`, root, 300);

    expect(result.timedOut).toBe(true);
    const pid = Number(readFileSync(pidFile, 'utf8').trim());
    expect(() => process.kill(pid, 0)).toThrow();
    expect(() => process.kill(-pid, 0)).toThrow();
  }, 10_000);

  it('maxBuffer overflow still classifies TIMEOUT and the group cleanup runs on that path', async () => {
    const root = freshRoot('spec-core-sec005-overflow-');
    const marker = join(root, 'ov.txt');
    // >1MB of output overflows the buffer (fail-on-overflow preserved); the
    // background grandchild would write the marker at 1.5s if the group
    // survived the overflow kill.
    const bundle = bundleWith({
      'TASK-0001': [
        {
          command: `( sleep 1.5; echo survived > ${marker} ) >/dev/null 2>&1 & head -c 3000000 /dev/zero | tr '\\0' x`,
          expect: 'exit 0',
        },
      ],
    });

    const result = await runChecks(bundle, root, {
      task: 'TASK-0001',
      yes: true,
      timeoutMs: 8000,
      nowIso: NOW,
    });

    expect(result.outcomes[0].status).toBe('TIMEOUT'); // verbose output can never PASS
    await sleep(1800);
    expect(existsSync(marker)).toBe(false);
  }, 15_000);

  it('a clean command resolves immediately (no grace-window penalty)', async () => {
    const root = freshRoot('spec-core-sec005-fast-');
    const started = Date.now();
    const result = await execCommand('exit 0', root, 5000);

    expect(result).toMatchObject({ exit: 0, timedOut: false });
    expect(Date.now() - started).toBeLessThan(1000); // the empty-group fast path costs no grace wait
  }, 10_000);

  // --- OPS-001: the active-group registry (shutdown containment) ------------------

  it('the registry is empty when idle and empty again after a run settles', async () => {
    // Idle: nothing to kill, zero reported.
    expect(killActiveProcessGroups()).toBe(0);
    const root = freshRoot('spec-core-ops001-registry-');
    const result = await execCommand('echo hi', root, 5000);
    expect(result.exit).toBe(0);
    // The executor unregistered its (dead) group at settle — still empty.
    expect(killActiveProcessGroups()).toBe(0);
  }, 10_000);

  it('killActiveProcessGroups kills a STILL-RUNNING group: the executor resolves TIMEOUT, contained', async () => {
    const root = freshRoot('spec-core-ops001-kill-');
    const marker = join(root, 'late.txt');
    // A command that outlives the external kill would write the marker at 1.2s.
    const run = execCommand(`( sleep 5; echo leaked > ${marker} ) & sleep 30`, root, 60_000);
    await sleep(400); // the group is up and running now
    const killed = killActiveProcessGroups(); // the MCP drain-timeout path
    expect(killed).toBeGreaterThanOrEqual(1); // the running group was signalled
    const result = await run;
    // Death by our signal ⇒ TIMEOUT classification (T16 semantics preserved).
    expect(result.timedOut).toBe(true);
    expect(result.exit).toBeNull();
    await sleep(1500); // past the would-be write time: nothing survived
    expect(existsSync(marker)).toBe(false);
    expect(killActiveProcessGroups()).toBe(0); // registry cleaned at settle
  }, 15_000);
});
