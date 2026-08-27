import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';

/**
 * Mid-write failure injection seam (review Important 1). A plain
 * `vi.spyOn(fs, 'fsyncSync')` cannot work here: the ESM namespace vitest
 * hands this file is frozen ("Cannot redefine property") and revision.ts
 * does not call through the raw require-cache object either — but
 * `vi.mock('node:fs')` DOES intercept revision.ts's imports (verified by
 * probe). The mock is a full passthrough unless a test arms `failOn`, so
 * every other test in this file sees the real filesystem.
 */
const fsyncCtl = vi.hoisted(() => ({ failOn: -1, calls: 0 }));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const real = actual.fsyncSync;
  return {
    ...actual,
    fsyncSync: (fd: number) => {
      fsyncCtl.calls++;
      if (fsyncCtl.calls === fsyncCtl.failOn) {
        throw new Error('injected EIO: fsync fails after the file exists');
      }
      return real(fd);
    },
  };
});
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  acquireSpecRootLock,
  createDirAtomically,
  DEFAULT_STALE_MS,
  LOCK_FILE,
  LockHeldError,
  swapFilesAtomically,
} from './revision';

const NOW = '2026-08-26T12:00:00.000Z';
const LATER = '2026-08-26T12:00:30.000Z'; // 30s later: beyond DEFAULT_STALE_MS (10s)

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

/** Write a lockfile by hand, as a foreign/dead holder would have left it. */
function plantLock(root: string, content: string): void {
  writeFileSync(join(root, LOCK_FILE), content, 'utf8');
}

/** Every visible (non-dot) regular FILE in a directory, name -> raw bytes. */
function snapshotDir(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith('.')) continue;
    if (!statSync(join(dir, name)).isFile()) continue;
    out[name] = readFileSync(join(dir, name), 'utf8');
  }
  return out;
}

/** Every entry (dotfiles included) — for asserting no temp/backup residue. */
function allEntries(dir: string): string[] {
  return readdirSync(dir).sort();
}

describe('acquireSpecRootLock: exclusivity', () => {
  it('second acquisition while held throws LockHeldError naming the holder', () => {
    const root = freshRoot('spec-core-lock-');
    const first = acquireSpecRootLock(root, NOW);

    expect(() => acquireSpecRootLock(root, NOW)).toThrow(LockHeldError);
    try {
      acquireSpecRootLock(root, NOW);
      throw new Error('unreachable');
    } catch (err) {
      const e = err as LockHeldError;
      expect(e.message).toContain('locked');
      expect(e.message).toContain(String(process.pid));
      expect(e.holder?.pid).toBe(process.pid);
      expect(e.holder?.acquiredAt).toBe(NOW);
    }

    first.release();
  });

  it('acquisition fails fast on a live lock (no wait/retry — a clean error, not a hang)', async () => {
    const root = freshRoot('spec-core-lock-fast-');
    const first = acquireSpecRootLock(root, NOW);
    const started = Date.now();
    let threw = false;
    try {
      acquireSpecRootLock(root, NOW);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    // No retry loop: the refusal must be immediate (well under 1s).
    expect(Date.now() - started).toBeLessThan(1000);
    first.release();
  });

  it('release frees the lock for the next writer and removes the lockfile', () => {
    const root = freshRoot('spec-core-lock-release-');
    const first = acquireSpecRootLock(root, NOW);
    first.release();

    expect(existsSync(join(root, LOCK_FILE))).toBe(false);
    const second = acquireSpecRootLock(root, LATER);
    expect(second.identity.acquiredAt).toBe(LATER);
    second.release();
  });

  it('release does NOT remove a lock that is no longer ours (foreign takeover)', () => {
    const root = freshRoot('spec-core-lock-foreign-');
    const mine = acquireSpecRootLock(root, NOW);
    // A stale-break by someone else replaced the lock while we "were" running.
    plantLock(root, JSON.stringify({ pid: 424242, acquiredAt: LATER }));
    mine.release();

    expect(existsSync(join(root, LOCK_FILE))).toBe(true);
    expect(readFileSync(join(root, LOCK_FILE), 'utf8')).toContain('424242');
    // And the foreign lock is live for the next acquirer (fresh timestamp).
    expect(() => acquireSpecRootLock(root, LATER)).toThrow(LockHeldError);
    rmSync(join(root, LOCK_FILE));
  });

  it('creates the root directory when missing (lco init/generate on a fresh path)', () => {
    const root = join(freshRoot('spec-core-lock-mkdir-'), 'deep', 'target');
    const lock = acquireSpecRootLock(root, NOW);
    expect(existsSync(join(root, LOCK_FILE))).toBe(true);
    lock.release();
    expect(existsSync(join(root, LOCK_FILE))).toBe(false);
  });
});

describe('acquireSpecRootLock: stale-break policy (injected time only)', () => {
  it('a lock older than the policy is broken and the next writer proceeds', () => {
    const root = freshRoot('spec-core-lock-stale-');
    plantLock(root, JSON.stringify({ pid: 11111, acquiredAt: '2020-01-01T00:00:00.000Z' }));

    const lock = acquireSpecRootLock(root, NOW); // 2026 vs 2020: far beyond stale

    expect(lock.identity.pid).toBe(process.pid); // we OWN it now
    lock.release();
  });

  it('a lock within the policy window is respected (no premature break)', () => {
    const root = freshRoot('spec-core-lock-fresh-');
    plantLock(root, JSON.stringify({ pid: 11111, acquiredAt: NOW }));

    // LATER - NOW = 30s > DEFAULT_STALE_MS, but a CUSTOM policy of 60s keeps it live.
    expect(() => acquireSpecRootLock(root, LATER, { staleMs: 60_000 })).toThrow(LockHeldError);
    // And under the default 10s policy LATER is stale -> breakable.
    const lock = acquireSpecRootLock(root, LATER, { staleMs: DEFAULT_STALE_MS });
    lock.release();
  });

  it('garbage lock content with an OLD mtime is treated as stale and broken', () => {
    const root = freshRoot('spec-core-lock-garbage-');
    const lockPath = join(root, LOCK_FILE);
    writeFileSync(lockPath, 'not json at all', 'utf8');
    const old = new Date('2020-01-01T00:00:00Z');
    utimesSync(lockPath, old, old);

    const lock = acquireSpecRootLock(root, NOW);
    expect(lock.identity.pid).toBe(process.pid);
    lock.release();
  });

  it('garbage lock content with a FRESH mtime is treated as live (write-gap safety)', () => {
    const root = freshRoot('spec-core-lock-garbage-fresh-');
    plantLock(root, ''); // e.g. a holder between open('wx') and its write

    expect(() => acquireSpecRootLock(root, NOW)).toThrow(LockHeldError);
    rmSync(join(root, LOCK_FILE));
  });

  // T22 rider (TEST-003 carry list): the holder branch already refused an
  // unparseable CLOCK ('unknown age: refuse to guess') — the mtime branch
  // computed NaN ageMs and fell through `NaN < staleMs` (false) to UNLINK.
  // A garbage clock must never authorize breaking someone else's lock.
  it('garbage lock content + unparseable injected clock (NaN age) -> REFUSE to break (T22)', () => {
    const root = freshRoot('spec-core-lock-nan-clock-');
    const lockPath = join(root, LOCK_FILE);
    writeFileSync(lockPath, 'not json at all', 'utf8');

    expect(() => acquireSpecRootLock(root, 'not-a-timestamp')).toThrow(LockHeldError);
    // The lock — and its diagnostic value — is untouched.
    expect(readFileSync(lockPath, 'utf8')).toBe('not json at all');
  });
});

describe('createDirAtomically: whole-directory creation (init/generate)', () => {
  it('creates the full directory in one rename: exact content, 2-space JSON, no residue', () => {
    const parent = freshRoot('spec-core-create-');
    const target = join(parent, 'spec');

    createDirAtomically(target, [
      { name: 'manifest.json', content: { spec_version: 1, state: 'draft' } },
      { name: 'tasks.json', content: [{ task_id: 'TASK-0001' }] },
    ]);

    expect(snapshotDir(target)).toEqual({
      'manifest.json': JSON.stringify({ spec_version: 1, state: 'draft' }, null, 2),
      'tasks.json': JSON.stringify([{ task_id: 'TASK-0001' }], null, 2),
    });
    expect(allEntries(target)).toEqual(['manifest.json', 'tasks.json']);
    // No staging directory left in the parent.
    expect(allEntries(parent)).toEqual(['spec']);
  });

  it('refuses when the target already exists and leaves it untouched', () => {
    const parent = freshRoot('spec-core-create-exists-');
    const target = join(parent, 'spec');
    mkdirSync(target);
    writeFileSync(join(target, 'keepme'), 'mine', 'utf8');

    expect(() =>
      createDirAtomically(target, [{ name: 'manifest.json', content: {} }]),
    ).toThrow();
    expect(allEntries(target)).toEqual(['keepme']);
    expect(allEntries(parent)).toEqual(['spec']); // no stage residue
  });

  it('creates missing parents of the target', () => {
    const parent = freshRoot('spec-core-create-nested-');
    const target = join(parent, 'deeply', 'nested', 'spec');

    createDirAtomically(target, [{ name: 'manifest.json', content: { ok: true } }]);

    expect(readFileSync(join(target, 'manifest.json'), 'utf8')).toBe(
      JSON.stringify({ ok: true }, null, 2),
    );
  });
});

describe('swapFilesAtomically: staged per-file rename into an existing directory', () => {
  it('swaps all files: new content live, no temp/backup residue', () => {
    const dir = freshRoot('spec-core-swap-');
    writeFileSync(join(dir, 'manifest.json'), '{"old":true}', 'utf8');
    writeFileSync(join(dir, 'tasks.json'), '[]', 'utf8');

    swapFilesAtomically(dir, [
      { name: 'tasks.json', content: [{ task_id: 'TASK-0001' }] },
      { name: 'manifest.json', content: { spec_version: 2 } },
    ]);

    expect(snapshotDir(dir)).toEqual({
      'manifest.json': JSON.stringify({ spec_version: 2 }, null, 2),
      'tasks.json': JSON.stringify([{ task_id: 'TASK-0001' }], null, 2),
    });
    expect(allEntries(dir)).toEqual(['manifest.json', 'tasks.json']);
  });

  it('creates a target file that does not exist yet (evidence first write)', () => {
    const dir = freshRoot('spec-core-swap-new-');
    swapFilesAtomically(dir, [{ name: 'TASK-0001-check.json', content: { status: 'PASS' } }]);
    expect(snapshotDir(dir)).toEqual({
      'TASK-0001-check.json': JSON.stringify({ status: 'PASS' }, null, 2),
    });
  });

  it('replaces a read-only live file (rename needs directory write, not file write)', () => {
    const dir = freshRoot('spec-core-swap-readonly-');
    writeFileSync(join(dir, 'tasks.json'), 'old', 'utf8');
    chmodSync(join(dir, 'tasks.json'), 0o444);

    swapFilesAtomically(dir, [{ name: 'tasks.json', content: { ok: 1 } }]);

    expect(readFileSync(join(dir, 'tasks.json'), 'utf8')).toBe(
      JSON.stringify({ ok: 1 }, null, 2),
    );
    chmodSync(join(dir, 'tasks.json'), 0o644); // restore for afterEach cleanup
  });

  it('CRASH-SIM: a failure during the swap step rolls every already-renamed file back', () => {
    const dir = freshRoot('spec-core-swap-midfail-');
    writeFileSync(join(dir, 'a.json'), 'old-a', 'utf8');
    // b.json is a DIRECTORY: its rename target is not a regular file, so the
    // swap fails on b.json AFTER a.json has already been renamed.
    mkdirSync(join(dir, 'b.json'));
    writeFileSync(join(dir, 'b.json', 'inner'), 'x', 'utf8');
    const before = snapshotDir(dir);

    let threw: unknown = null;
    try {
      swapFilesAtomically(dir, [
        { name: 'a.json', content: 'new-a' },
        { name: 'b.json', content: 'new-b' },
      ]);
    } catch (err) {
      threw = err;
    }

    expect(threw).toBeTruthy();
    // a.json is RESTORED to its pre-swap bytes; b.json untouched; no residue.
    expect(readFileSync(join(dir, 'a.json'), 'utf8')).toBe('old-a');
    expect(statSync(join(dir, 'b.json')).isDirectory()).toBe(true);
    expect(readFileSync(join(dir, 'b.json', 'inner'), 'utf8')).toBe('x');
    expect(allEntries(dir)).toEqual(Object.keys(before).concat('b.json').sort());
  });

  it('CRASH-SIM: a failure during STAGING renames nothing (live state intact)', () => {
    const dir = freshRoot('spec-core-swap-stagefail-');
    writeFileSync(join(dir, 'a.json'), 'old-a', 'utf8');
    const before = snapshotDir(dir);

    // A 300-char name cannot exist as a file (ENAMETOOLONG) on any target
    // platform: staging fails deterministically before any rename, even as root.
    const longName = `${'n'.repeat(300)}.json`;

    expect(() =>
      swapFilesAtomically(dir, [
        { name: 'a.json', content: 'new-a' },
        { name: longName, content: 'never' },
      ]),
    ).toThrow();

    expect(snapshotDir(dir)).toEqual(before);
    expect(allEntries(dir)).toEqual(['a.json']);
  });

  it('MID-WRITE-SIM: a temp write failing AFTER the file exists leaves the directory byte-identical (no residue)', () => {
    // Review Important 1: writeTempFile opens with 'wx' and can fail AFTER the
    // temp exists (writeSync ENOSPC mid-buffer, fsyncSync EIO). The temp must
    // be cleaned even then — the module promises byte-identity at ANY failure
    // point. Injected deterministically (root-safe): fail the SECOND fsync
    // from here, so temp a is fully staged while temp b EXISTS when it throws.
    const dir = freshRoot('spec-core-swap-midwrite-');
    writeFileSync(join(dir, 'a.json'), 'old-a', 'utf8');
    writeFileSync(join(dir, 'b.json'), 'old-b', 'utf8');
    const before = snapshotDir(dir);

    fsyncCtl.failOn = fsyncCtl.calls + 2;
    try {
      expect(() =>
        swapFilesAtomically(dir, [
          { name: 'a.json', content: 'new-a' },
          { name: 'b.json', content: 'new-b' },
        ]),
      ).toThrow('injected EIO');
    } finally {
      fsyncCtl.failOn = -1; // disarm: passthrough for every other test
    }

    // Live files untouched AND no temp/backup residue of ANY kind (the oracle
    // enumerates dotfiles too).
    expect(snapshotDir(dir)).toEqual(before);
    expect(allEntries(dir)).toEqual(['a.json', 'b.json']);
  });

  it('MID-WRITE-SIM: a failed lock-identity write does not leave a partial lockfile behind', () => {
    // Same defect class at the lock: openSync('wx') created the file, the
    // identity write/fsync fails -> the holder must not strand its own lock
    // (it would block the root for the full stale window).
    const root = freshRoot('spec-core-lock-midwrite-');

    fsyncCtl.failOn = fsyncCtl.calls + 1; // the lock identity fsync
    try {
      expect(() => acquireSpecRootLock(root, NOW)).toThrow('injected EIO');
    } finally {
      fsyncCtl.failOn = -1;
    }

    expect(existsSync(join(root, LOCK_FILE))).toBe(false);
    // And the root recovers immediately: the next acquire succeeds.
    const lock = acquireSpecRootLock(root, NOW);
    lock.release();
  });
});
