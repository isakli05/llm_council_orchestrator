import { describe, it, expect, afterEach, vi } from 'vitest';

/**
 * Failure-path coverage for the atomic revision storage (branch-coverage
 * remediation). Like revision.test.ts, this file needs an injection seam for
 * mid-operation fs failures that cannot be reproduced deterministically on a
 * real filesystem without racing: `vi.mock('node:fs')` intercepts
 * revision.ts's imports (the ESM namespace vitest hands over is frozen to a
 * plain spy, but the module mock works — see revision.test.ts's probe note).
 * The mock is a FULL PASSTHROUGH unless a test arms one of the hooks in
 * `fsCtl`, so every other call sees the real filesystem.
 *
 * Hook semantics (armed per test, always disarmed in finally):
 *   unlink    'throw'   — unlink fails with an injected EPERM, file untouched
 *               'gone'   — REALLY delete, then throw ENOENT (an "already gone"
 *                          race made deterministic: the exact outcome the
 *                          best-effort catches exist for, without the race)
 *               'swallow'— report success without deleting (drives the bounded
 *                          stale-break retry past its attempt limit)
 *   statEnoent          — statSync throws ENOENT for matching paths
 *   existsFalseFor      — existsSync answers false for matching paths
 *   readFailFor         — readFileSync throws EACCES for matching paths
 *   openFailFor         — openSync throws the given errno code for matching
 *                         paths (an unwritable root, without chmod races)
 *   writeFailAt         — the Nth writeSync call throws an injected EIO
 */
const fsCtl = vi.hoisted(() => ({
  unlink: null as ((p: string) => 'throw' | 'gone' | 'swallow' | undefined) | null,
  statEnoent: null as ((p: string) => boolean) | null,
  existsFalseFor: null as ((p: string) => boolean) | null,
  readFailFor: null as ((p: string) => boolean) | null,
  openFailFor: null as ((p: string) => string | null) | null,
  writeFailAt: -1,
  writeCalls: 0,
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const injected = (code: string, what: string) =>
    Object.assign(new Error(`injected ${code}: ${what}`), { code }) as NodeJS.ErrnoException;
  const realUnlink = actual.unlinkSync;
  const realStat = actual.statSync;
  const realExists = actual.existsSync;
  const realRead = actual.readFileSync as (p: string, enc: string) => string;
  const realWrite = actual.writeSync as (fd: number, data: unknown, ...rest: unknown[]) => number;
  const realOpen = actual.openSync as (p: string, flags: string, ...rest: unknown[]) => number;
  return {
    ...actual,
    openSync: (p: string, flags: string, ...rest: unknown[]) => {
      const code = fsCtl.openFailFor?.(p) ?? null;
      if (code !== null) throw injected(code, 'exclusive create refused');
      return realOpen(p, flags, ...rest);
    },
    unlinkSync: (p: string) => {
      const mode = fsCtl.unlink?.(p);
      if (mode === 'throw') throw injected('EPERM', 'unlink refused');
      if (mode === 'gone') {
        realUnlink(p);
        throw injected('ENOENT', 'entry already gone');
      }
      if (mode === 'swallow') return undefined;
      return realUnlink(p);
    },
    statSync: (p: string) => {
      if (fsCtl.statEnoent?.(p)) throw injected('ENOENT', 'vanished meanwhile');
      return realStat(p);
    },
    existsSync: (p: string) => {
      if (fsCtl.existsFalseFor?.(p)) return false;
      return realExists(p);
    },
    readFileSync: (p: string, enc: string) => {
      if (fsCtl.readFailFor?.(p)) throw injected('EACCES', 'lock unreadable');
      return realRead(p, enc);
    },
    writeSync: (fd: number, data: unknown, ...rest: unknown[]) => {
      fsCtl.writeCalls++;
      if (fsCtl.writeCalls === fsCtl.writeFailAt) throw injected('EIO', 'identity write fails mid-buffer');
      return realWrite(fd, data, ...rest);
    },
  };
});

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  acquireSpecRootLock,
  createDirAtomically,
  fsyncDir,
  LOCK_FILE,
  LockHeldError,
  swapFilesAtomically,
} from './revision';

const NOW = '2026-08-26T12:00:00.000Z';
/** A clock far before any real file mtime: garbage/unreadable locks read LIVE under it. */
const EARLY = '2020-01-01T00:00:00.000Z';

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
function plantLock(root: string, content: string): string {
  const lockPath = join(root, LOCK_FILE);
  writeFileSync(lockPath, content, 'utf8');
  return lockPath;
}

/** Every entry (dotfiles included) — for asserting no temp/backup/stage residue. */
function allEntries(dir: string): string[] {
  return readdirSync(dir).sort();
}

/** Disarm every hook: passthrough for afterEach cleanup and the next test. */
function disarm(): void {
  fsCtl.unlink = null;
  fsCtl.statEnoent = null;
  fsCtl.existsFalseFor = null;
  fsCtl.readFailFor = null;
  fsCtl.openFailFor = null;
  fsCtl.writeFailAt = -1;
}

// --- readHolder: an unreadable lock is UNKNOWN, never misread -----------------------

describe('acquireSpecRootLock: unreadable lock content (readHolder containment)', () => {
  it('a lock that exists but cannot be READ -> LockHeldError with holder null (unparseable)', () => {
    const root = freshRoot('spec-core-bc-read-');
    const lockPath = plantLock(root, JSON.stringify({ pid: 424242, acquiredAt: NOW }));
    fsCtl.readFailFor = (p) => p === lockPath;

    // The content is perfectly valid JSON — but if it cannot be read at all
    // (EACCES), the holder must be reported as UNKNOWN, never guessed. The
    // mtime fallback keeps it live under the EARLY clock (age < 0 < stale).
    try {
      expect(() => acquireSpecRootLock(root, EARLY)).toThrow(LockHeldError);
      try {
        acquireSpecRootLock(root, EARLY);
        throw new Error('unreachable');
      } catch (err) {
        const e = err as LockHeldError;
        expect(e.holder).toBeNull();
        expect(e.message).toContain('unparseable');
      }
    } finally {
      disarm(); // first: passthrough again, THEN inspect the disk
    }
    // The lock — and its diagnostic value — is untouched.
    expect(readFileSync(lockPath, 'utf8')).toContain('424242');
  });

  it('a DIRECTORY sitting at the lock path reads as held-but-unparseable (EISDIR read, fresh mtime -> live)', () => {
    const root = freshRoot('spec-core-bc-dirlock-');
    // O_EXCL fires EEXIST on ANY existing entry — a directory included — so
    // the walk goes through readHolder, whose read of a directory fails
    // EISDIR: an unknown holder plus a fresh mtime is a LIVE lock, and the
    // refusal reports it exactly like any other unparseable content.
    mkdirSync(join(root, LOCK_FILE));

    try {
      acquireSpecRootLock(root, NOW);
      throw new Error('unreachable');
    } catch (err) {
      const e = err as LockHeldError;
      expect(e.holder).toBeNull();
      expect(e.message).toContain('unparseable');
    }
    expect(statSync(join(root, LOCK_FILE)).isDirectory()).toBe(true);
  });
});

// --- the lock lifecycle's best-effort catches ---------------------------------------

describe('acquireSpecRootLock / release: best-effort cleanup catches', () => {
  it('a failed identity write whose own cleanup ALSO fails still surfaces the original error', () => {
    const root = freshRoot('spec-core-bc-midwrite-');
    const lockPath = join(root, LOCK_FILE);
    // Fail the first writeSync (the lock identity write) AND make the
    // compensating unlink fail: the diagnosis must be the WRITE error — the
    // unlink failure is best-effort and never masks it.
    fsCtl.writeCalls = 0;
    fsCtl.writeFailAt = 1;
    fsCtl.unlink = (p) => (p === lockPath ? 'throw' : undefined);

    try {
      expect(() => acquireSpecRootLock(root, NOW)).toThrow('injected EIO');
      // And NOT the compensating unlink's error:
      try {
        acquireSpecRootLock(root, NOW);
        throw new Error('unreachable');
      } catch (err) {
        expect((err as Error).message).not.toContain('EPERM');
      }
      // The best-effort unlink failed, so the partial lockfile is stranded —
      // the documented cost of best-effort cleanup (recovered by stale-break).
      expect(existsSync(lockPath)).toBe(true);
    } finally {
      disarm();
    }
  });

  it('a non-EEXIST open failure (unwritable root) propagates raw, not as LockHeldError', () => {
    const root = freshRoot('spec-core-bc-eacces-');
    // The exclusive create itself is refused with a non-EEXIST errno (here an
    // injected EACCES — an unwritable root): an environment error, not
    // contention; it must surface as-is, with no lock cleanup to attempt.
    const lockPath = join(root, LOCK_FILE);
    fsCtl.openFailFor = (p) => (p === lockPath ? 'EACCES' : null);

    try {
      acquireSpecRootLock(root, NOW);
      throw new Error('unreachable');
    } catch (err) {
      expect(err).not.toBeInstanceOf(LockHeldError);
      expect((err as NodeJS.ErrnoException).code).toBe('EACCES');
    } finally {
      disarm();
    }
    // No partial lockfile was stranded by the failed acquisition.
    expect(existsSync(lockPath)).toBe(false);
  });

  it('stale-break retries are BOUNDED: an unbreakable "stale" lock fails after 5 attempts, not a ping-pong', () => {
    const root = freshRoot('spec-core-bc-bounded-');
    const lockPath = plantLock(root, JSON.stringify({ pid: 11111, acquiredAt: '2020-01-01T00:00:00.000Z' }));
    // The lock is provably stale, but the unlink "succeeds" without removing
    // anything (the swallow): every retry sees EEXIST again. The loop must
    // give up with the raw EEXIST after MAX_ACQUIRE_ATTEMPTS (5) breaks.
    let swallowed = 0;
    fsCtl.unlink = (p) => {
      if (p === lockPath) {
        swallowed++;
        return 'swallow';
      }
      return undefined;
    };

    try {
      acquireSpecRootLock(root, NOW);
      throw new Error('unreachable');
    } catch (err) {
      expect(err).not.toBeInstanceOf(LockHeldError);
      expect((err as NodeJS.ErrnoException).code).toBe('EEXIST');
      expect(swallowed).toBe(5);
    } finally {
      disarm();
    }
    // The lock is exactly as the foreign holder left it.
    expect(readFileSync(lockPath, 'utf8')).toContain('11111');
  });

  it('release() on a lock whose unlink fails does not throw and leaves the lock in place', () => {
    const root = freshRoot('spec-core-bc-release-');
    const lock = acquireSpecRootLock(root, NOW); // real acquisition
    const lockPath = join(root, LOCK_FILE);
    fsCtl.unlink = (p) => (p === lockPath ? 'throw' : undefined);

    try {
      // Idempotent best-effort: an unlink failure (already gone, EPERM, ...)
      // must never turn release() into a throw for the finally{} callers.
      expect(() => lock.release()).not.toThrow();
      expect(existsSync(lockPath)).toBe(true);
    } finally {
      disarm();
    }
  });
});

// --- breakStaleLock: refuse to guess, refuse to break what it cannot remove ---------

describe('breakStaleLock: refusal branches (injected time only)', () => {
  it('a parseable holder + an unparseable INJECTED clock (NaN nowMs) -> refuse, name the holder', () => {
    const root = freshRoot('spec-core-bc-nan-now-');
    const lockPath = plantLock(root, JSON.stringify({ pid: 424242, acquiredAt: '2021-01-01T00:00:00.000Z' }));

    // The holder's own timestamp parses fine — the UNKNOWN age comes from the
    // clock. Unknown is not stale: the lock is never broken on a guess, and
    // the refusal still names the holder.
    try {
      acquireSpecRootLock(root, 'not-a-timestamp');
      throw new Error('unreachable');
    } catch (err) {
      const e = err as LockHeldError;
      expect(e.holder?.pid).toBe(424242);
      expect(e.message).toContain('424242');
    }
    expect(readFileSync(lockPath, 'utf8')).toContain('424242');
  });

  it('a parseable holder with an unparseable acquiredAt (NaN heldMs) -> refuse with the holder parsed', () => {
    const root = freshRoot('spec-core-bc-nan-held-');
    plantLock(root, JSON.stringify({ pid: 424243, acquiredAt: 'not-a-timestamp' }));

    try {
      acquireSpecRootLock(root, NOW);
      throw new Error('unreachable');
    } catch (err) {
      const e = err as LockHeldError;
      expect(e.holder).toEqual({ pid: 424243, acquiredAt: 'not-a-timestamp' });
    }
  });

  it('unparseable content + the lock VANISHING before the mtime check -> refuse (let the retry re-run)', () => {
    const root = freshRoot('spec-core-bc-vanished-');
    const lockPath = plantLock(root, 'not json at all');
    fsCtl.statEnoent = (p) => p === lockPath;

    try {
      expect(() => acquireSpecRootLock(root, NOW)).toThrow(LockHeldError);
      try {
        acquireSpecRootLock(root, NOW);
        throw new Error('unreachable');
      } catch (err) {
        expect((err as LockHeldError).holder).toBeNull();
        expect((err as LockHeldError).message).toContain('unparseable');
      }
    } finally {
      disarm();
    }
  });

  it('a PROVABLY stale garbage lock whose unlink fails -> clean LockHeldError, the lock survives', () => {
    const root = freshRoot('spec-core-bc-stale-fail-');
    const lockPath = plantLock(root, 'not json at all');
    const old = new Date('2020-01-01T00:00:00Z');
    utimesSync(lockPath, old, old);
    fsCtl.unlink = (p) => (p === lockPath ? 'throw' : undefined);

    try {
      // Old mtime says STALE, the unlink says NO (someone else got there
      // first, or permissions): the breaker must refuse, not force it.
      expect(() => acquireSpecRootLock(root, NOW)).toThrow(LockHeldError);
      expect(existsSync(lockPath)).toBe(true);
      expect(readFileSync(lockPath, 'utf8')).toBe('not json at all');
    } finally {
      disarm();
    }
  });
});

// --- fsyncDir: durability degrades, never throws ------------------------------------

describe('fsyncDir: unsupported-target degradation', () => {
  it('a target that cannot be opened/fsynced is swallowed (durability degrades, atomicity does not depend on it)', () => {
    const root = freshRoot('spec-core-bc-fsync-');
    // A missing directory: openSync fails ENOENT — the platform/filesystem
    // gap the catch exists for. The swap/create paths call this best-effort
    // helper AFTER their atomic rename: it must never turn success into a
    // throw, and a real directory still passes through unharmed.
    expect(() => fsyncDir(join(root, 'not-there'))).not.toThrow();
    expect(() => fsyncDir(root)).not.toThrow();
    expect(existsSync(root)).toBe(true);
  });
});

// --- createDirAtomically: a failed stage leaves NOTHING behind ----------------------

describe('createDirAtomically: stage-failure cleanup', () => {
  it('a staging write failure removes the hidden stage and leaves no target behind', () => {
    const parent = freshRoot('spec-core-bc-stage-');
    const target = join(parent, 'spec');
    // A 300-char name cannot exist as a file (ENAMETOOLONG) on any target
    // platform: staging fails deterministically before the rename, even as root.
    const longName = `${'n'.repeat(300)}.json`;

    expect(() => createDirAtomically(target, [{ name: longName, content: { ok: true } }])).toThrow();

    expect(existsSync(target)).toBe(false); // creation is all-or-nothing
    expect(allEntries(parent)).toEqual([]); // no .lco-stage-* residue
  });
});

// --- swapFilesAtomically: the best-effort edges of success and rollback -------------

describe('swapFilesAtomically: cleanup edges', () => {
  it('a backup already gone at the final cleanup keeps the swap a success with zero residue', () => {
    const dir = freshRoot('spec-core-bc-bakgone-');
    writeFileSync(join(dir, 'a.json'), '{"v":1}', 'utf8');
    // The final backup-unlink "finds" the backup already deleted (the exact
    // already-gone race the catch exists for, made deterministic): the swap
    // has already committed — nothing about the verdict may change.
    fsCtl.unlink = (p) => (p.includes('.lco-bak-') ? 'gone' : undefined);

    try {
      expect(() => swapFilesAtomically(dir, [{ name: 'a.json', content: { v: 2 } }])).not.toThrow();
      expect(readFileSync(join(dir, 'a.json'), 'utf8')).toBe(JSON.stringify({ v: 2 }, null, 2));
      expect(allEntries(dir)).toEqual(['a.json']);
    } finally {
      disarm();
    }
  });

  it('rollback RESTORES a swapped file from its backup (the rename-back arm)', () => {
    const dir = freshRoot('spec-core-bc-restore-');
    writeFileSync(join(dir, 'a.json'), 'old-a', 'utf8');
    // b.json is a DIRECTORY: its rename target is not a regular file, so the
    // swap fails on b.json AFTER a.json (backed up) has already been renamed.
    mkdirSync(join(dir, 'b.json'));
    writeFileSync(join(dir, 'b.json', 'inner'), 'x', 'utf8');

    expect(() =>
      swapFilesAtomically(dir, [
        { name: 'a.json', content: 'new-a' },
        { name: 'b.json', content: 'new-b' },
      ]),
    ).toThrow();

    // a.json is restored to its pre-swap bytes; b.json untouched; no residue.
    expect(readFileSync(join(dir, 'a.json'), 'utf8')).toBe('old-a');
    expect(readFileSync(join(dir, 'b.json', 'inner'), 'utf8')).toBe('x');
    expect(allEntries(dir)).toEqual(['a.json', 'b.json']);
  });

  it('rollback REMOVES a swapped file that had no live predecessor (it must not survive as new content)', () => {
    const dir = freshRoot('spec-core-bc-nobak-');
    // a.json does NOT exist live (no backup is made for it); b.json is a
    // directory, so the swap fails AFTER a.json's temp was renamed live.
    mkdirSync(join(dir, 'b.json'));
    writeFileSync(join(dir, 'b.json', 'inner'), 'x', 'utf8');

    expect(() =>
      swapFilesAtomically(dir, [
        { name: 'a.json', content: 'new-a' },
        { name: 'b.json', content: 'new-b' },
      ]),
    ).toThrow();

    // No backup to restore from: reverting to "did not exist" is the only
    // byte-identical outcome — the half-swapped new content is REMOVED.
    expect(existsSync(join(dir, 'a.json'))).toBe(false);
    expect(allEntries(dir)).toEqual(['b.json']);
  });

  it('rollback with a VANISHED backup removes the swapped file (never leaves the new bytes as "restored")', () => {
    const dir = freshRoot('spec-core-bc-bakmissing-');
    writeFileSync(join(dir, 'a.json'), 'old-a', 'utf8');
    mkdirSync(join(dir, 'b.json'));
    writeFileSync(join(dir, 'b.json', 'inner'), 'x', 'utf8');
    // The backup hardlink "disappears" between the swap and the rollback:
    // existsSync lies false for every .lco-bak- path.
    fsCtl.existsFalseFor = (p) => p.includes('.lco-bak-');

    try {
      expect(() =>
        swapFilesAtomically(dir, [
          { name: 'a.json', content: 'new-a' },
          { name: 'b.json', content: 'new-b' },
        ]),
      ).toThrow();

      // No reachable backup -> the swapped file is removed, not "restored"
      // from nothing; and the orphaned backup itself is still cleaned up.
      expect(existsSync(join(dir, 'a.json'))).toBe(false);
      expect(allEntries(dir)).toEqual(['b.json']);
    } finally {
      disarm();
    }
  });

  it('a rollback action that FAILS is best-effort: the ORIGINAL error surfaces, the failure is swallowed', () => {
    const dir = freshRoot('spec-core-bc-rbfail-');
    const liveA = join(dir, 'a.json');
    mkdirSync(join(dir, 'b.json'));
    writeFileSync(join(dir, 'b.json', 'inner'), 'x', 'utf8');
    // a.json has no backup; the rollback's unlink of the swapped a.json is
    // refused by the hook — the swap's original rename error must still be
    // the one the caller sees.
    fsCtl.unlink = (p) => (p === liveA ? 'throw' : undefined);

    try {
      expect(() =>
        swapFilesAtomically(dir, [
          { name: 'a.json', content: 'new-a' },
          { name: 'b.json', content: 'new-b' },
        ]),
      ).toThrow();

      // The rollback could not remove it, so the new content stays (the
      // documented best-effort residue — the diagnosis is the thrown error).
      expect(readFileSync(liveA, 'utf8')).toBe(JSON.stringify('new-a', null, 2));
      // Everything the call COULD still clean (the b temp) is gone.
      expect(allEntries(dir)).toEqual(['a.json', 'b.json']);
    } finally {
      disarm();
    }
  });

  it('a temp the cleanup cannot unlink is left behind, the original staging error still surfaces', () => {
    const dir = freshRoot('spec-core-bc-tempfail-');
    writeFileSync(join(dir, 'a.json'), 'old-a', 'utf8');
    const longName = `${'n'.repeat(300)}.json`;
    // Staging: a's temp is written, the long name fails ENAMETOOLONG; the
    // cleanup's unlink of a's OWN temp is refused by the hook.
    fsCtl.unlink = (p) => (p.includes('.lco-tmp-') ? 'throw' : undefined);

    try {
      expect(() =>
        swapFilesAtomically(dir, [
          { name: 'a.json', content: 'new-a' },
          { name: longName, content: 'never' },
        ]),
      ).toThrow();

      // Live state byte-identical; the best-effort temp cleanup failed, so
      // exactly one temp residue remains (removed by the test's afterEach).
      expect(readFileSync(join(dir, 'a.json'), 'utf8')).toBe('old-a');
      const residue = allEntries(dir).filter((n) => n.startsWith('.'));
      expect(residue).toHaveLength(1);
      expect(residue[0]).toContain('.a.json.lco-tmp-');
    } finally {
      disarm();
    }
  });
});
