import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Branch-coverage remediation for the verification-command runner: the
 * spawn-failure shapes, the stderr channel, the OPS-001 registry's ESRCH
 * containment, and the evidence run-name collision walk.
 *
 * ONE magic command is mocked at node:child_process (the same seam
 * runner-dstate.test.ts established): 'dead-group-leader' returns a synthetic
 * child whose pid is a group that PROVABLY does not exist, so the executor
 * registers a pgid whose kill() fails ESRCH — the exact population the
 * OPS-001 drain-timeout path swallows. Everything else passes through to the
 * REAL spawn: the spawn-failure tests below run real (failing) spawns.
 */
const childCtl = vi.hoisted(() => ({ pid: 999_999 }));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  const { EventEmitter } = await import('node:events');

  const makeNeverClosingStream = (): NodeJS.ReadableStream & { destroy(): void } => {
    const s = new EventEmitter() as NodeJS.ReadableStream & { destroy(): void };
    s.setEncoding = () => {};
    s.destroy = () => {};
    return s;
  };

  return {
    ...actual,
    spawn: (cmd: string, opts: unknown) => {
      if (cmd !== 'dead-group-leader') return actual.spawn(cmd, opts);
      const child = new EventEmitter() as EventEmitter & {
        pid: number | undefined;
        stdout: NodeJS.ReadableStream & { destroy(): void };
        stderr: NodeJS.ReadableStream & { destroy(): void };
      };
      // A pgid with no process group: kill(-pid, ...) -> ESRCH every time.
      child.pid = childCtl.pid;
      child.stdout = makeNeverClosingStream();
      child.stderr = makeNeverClosingStream();
      return child;
    },
  };
});

// Imported AFTER the mock declaration (vitest hoists vi.mock above imports).
import { execCommand, execInProcessGroup, killActiveProcessGroups, runChecks, type Executor } from './runner';
import { SpecBundleSchema, type SpecBundle, type TaskContract } from '../schemas';

const FIXTURES = join(__dirname, '../../fixtures');
const NOW = '2026-09-05T12:00:00Z';

/** Raw pet-clinic fixture: three tasks, verifications overridden per test. */
const PET_CLINIC = JSON.parse(
  readFileSync(join(FIXTURES, 'good/pet-clinic/bundle.json'), 'utf8'),
) as Record<string, unknown>;

type Verification = Array<{ command: string; expect: string }>;

/** A validated bundle whose task verifications come from the map. */
function bundleWith(verifications: Record<string, Verification>): SpecBundle {
  const raw = structuredClone(PET_CLINIC);
  for (const t of raw.tasks as TaskContract[]) {
    t.verification = verifications[t.task_id] ?? [{ command: `echo ${t.task_id}`, expect: 'exit 0' }];
  }
  return SpecBundleSchema.parse(raw);
}

/** Injectable fake Executor: answers every call from a fixed plan. */
function fakeExec(plan: { exit: number | null; stdout: string; timedOut: boolean }): Executor {
  return async () => plan;
}

const tmpDirs: string[] = [];

function freshRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(root);
  return root;
}

afterEach(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  tmpDirs.length = 0;
});

// --- OPS-001: the registry's ESRCH containment ---------------------------------------

describe('killActiveProcessGroups: ESRCH containment', () => {
  it('a registered-but-DEAD group is swallowed (ESRCH), counted as not killed, and deregistered at settle', async () => {
    const root = freshRoot('spec-core-bc-esrch-');

    // Pick a pgid that provably has no process group (kill(-pid, 0) -> ESRCH):
    // high values keep clear of every real process on the machine.
    let deadPgid = -1;
    for (let cand = 2_000_000; cand < 2_000_999; cand++) {
      try {
        process.kill(-cand, 0); // a group exists there — keep looking
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ESRCH') {
          deadPgid = cand;
          break;
        }
      }
    }
    expect(deadPgid).toBeGreaterThan(0);
    childCtl.pid = deadPgid;

    try {
      // Registration happens synchronously at spawn, so the group is in the
      // registry before any await: signalling it must hit the ESRCH catch,
      // swallow it, and report ZERO kills (a dead group is not a containment
      // failure — the audit invariant is "dead", and it already is).
      const run = execInProcessGroup('dead-group-leader', { cwd: root, timeoutMs: 25, graceMs: 10 });
      expect(killActiveProcessGroups()).toBe(0);

      // The run itself still settles to the normal TIMEOUT verdict (the group
      // never existed; the kill timer owns the classification) and — the
      // resolution-implies-dead invariant — settles off the registry.
      const result = await run;
      expect(result).toEqual({ exit: null, stdout: '', timedOut: true, killReason: 'timeout' });
      expect(killActiveProcessGroups()).toBe(0);
    } finally {
      childCtl.pid = 999_999;
    }
  }, 5000);
});

// --- spawn-failure containment: the executor NEVER rejects ---------------------------

describe('execCommand: spawn-failure containment', () => {
  it('a SYNCHRONOUS spawn throw resolves as a failed start: exit null, NOT a timeout', async () => {
    const root = freshRoot('spec-core-bc-syncthrow-');

    // An invalid command argument makes spawn itself throw synchronously
    // (ERR_INVALID_ARG_TYPE) — the executor contract still holds: resolve,
    // never reject, and classify as a failed start, never as a timeout.
    const result = await execCommand(undefined as unknown as string, root, 1000);

    expect(result.exit).toBeNull();
    expect(result.timedOut).toBe(false);
    expect(result.stdout).toContain('must be of type string'); // the error itself
    expect(killActiveProcessGroups()).toBe(0); // nothing was ever registered
  });

  it('a command that fails to START (nonexistent cwd) settles { exit: null, timedOut: false }', async () => {
    const root = freshRoot('spec-core-bc-nocwd-');

    // The child 'error' event (ENOENT on the cwd) — spawn failed, so no pid
    // ever existed: the pgid guards see undefined and nothing is registered.
    const result = await execCommand('echo hi', join(root, 'no-such-dir'), 5000);

    expect(result.exit).toBeNull();
    expect(result.timedOut).toBe(false);
    expect(killActiveProcessGroups()).toBe(0);
  });

  it('through runChecks a spawn failure is judged FAIL (never a crash, never TIMEOUT) and evidence is still written', async () => {
    const root = freshRoot('spec-core-bc-failstart-');
    const bundle = bundleWith({ 'TASK-0001': [{ command: 'echo hi', expect: 'exit 0' }] });

    // The spec root does not exist yet: the command cannot start there (the
    // evidence write creates the tree afterwards). The run must classify the
    // failed start as a normal FAIL verdict — exit null vs expected 0.
    const result = await runChecks(bundle, join(root, 'ghost-root'), {
      task: 'TASK-0001',
      yes: true,
      nowIso: NOW,
    });

    expect(result.code).toBe(1);
    expect(result.outcomes[0]).toMatchObject({
      status: 'FAIL',
      expectedExit: 0,
      actualExit: null,
    });
    // The audit trail is written regardless of how the command failed.
    expect(readdirSync(join(root, 'ghost-root', 'spec', 'evidence'))).toHaveLength(1);
  });
});

// --- output channels: stderr lands in the single combined channel --------------------

describe('execCommand: output channels', () => {
  it('a command writing ONLY to stderr is captured into the combined stdout channel', async () => {
    const root = freshRoot('spec-core-bc-stderr-');

    const result = await execCommand('echo err-channel >&2', root, 5000);

    // stdout was EMPTY: everything the verdict kept came from the stderr arm
    // of the chunk handler — one combined channel, nothing dropped.
    expect(result).toEqual({ exit: 0, stdout: 'err-channel\n', timedOut: false });
  });

  it('a command writing only to STDOUT is captured verbatim (both arms of the single channel)', async () => {
    const root = freshRoot('spec-core-bc-stdout-');

    const result = await execCommand('echo out-channel', root, 5000);

    // The mirror of the stderr test: this time the stdout arm is the only
    // source — the verdict keeps exactly the bytes the command printed.
    expect(result).toEqual({ exit: 0, stdout: 'out-channel\n', timedOut: false });
  });
});

// --- evidence run naming: occupied names are skipped, never overwritten --------------

describe('evidence run naming: occupied-name walk', () => {
  it('pre-existing files at the next run ids are skipped — the run writes -003 and touches nothing else', async () => {
    const root = freshRoot('spec-core-bc-collision-');
    const evidenceDir = join(root, 'spec', 'evidence');
    mkdirSync(evidenceDir, { recursive: true });

    // Foreign files occupy BOTH -001 and -002 for this task+timestamp (e.g. a
    // restored backup, or a same-clock rerun): the name walk must pass over
    // them, land on -003, and leave the occupants byte-identical.
    const name1 = 'TASK-0001-check-20260905T120000Z-001.json';
    const name2 = 'TASK-0001-check-20260905T120000Z-002.json';
    const name3 = 'TASK-0001-check-20260905T120000Z-003.json';
    writeFileSync(join(evidenceDir, name1), '{"sentinel":"first"}', 'utf8');
    writeFileSync(join(evidenceDir, name2), '{"sentinel":"second"}', 'utf8');

    const bundle = bundleWith({});
    const result = await runChecks(bundle, root, {
      task: 'TASK-0001',
      yes: true,
      nowIso: NOW,
      exec: fakeExec({ exit: 0, stdout: 'ok', timedOut: false }),
    });

    expect(result.code).toBe(0);
    expect(result.evidenceFiles).toEqual([join(evidenceDir, name3)]);
    expect(readFileSync(join(evidenceDir, name1), 'utf8')).toBe('{"sentinel":"first"}');
    expect(readFileSync(join(evidenceDir, name2), 'utf8')).toBe('{"sentinel":"second"}');
    expect(readdirSync(evidenceDir).sort()).toEqual([name1, name2, name3]);
    // The new run's own file carries the run's verdict, not a blend.
    const stored = JSON.parse(readFileSync(join(evidenceDir, name3), 'utf8'));
    expect(stored.task_id).toBe('TASK-0001');
    expect(stored.checks[0].status).toBe('PASS');
  });
});
