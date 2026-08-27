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
