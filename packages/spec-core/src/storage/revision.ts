import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Atomic per-root revision storage (DATA-001, BACK-005).
 *
 * JSON files under spec/ are the database. Before this module every writer
 * truncated live section files in place: a crash, a disk error, or two
 * concurrent processes (two `lco init` runs interleaved a corrupted
 * manifest; a mid-`change` write failure stranded a v2-draft manifest over
 * old sections that could neither verify nor retry) left the ONLY spec
 * corrupt. This module is the single write path for every spec mutation:
 *
 *   - PER-ROOT LOCK: `<root>/.lco-revision.lock`, acquired with exclusive
 *     create (O_EXCL). The holder records its identity (pid + the injected
 *     acquisition time). A lock whose recorded age exceeds the stale policy
 *     is broken by the next writer (a crashed holder can never deadlock the
 *     root); a live lock is an immediate, clean `LockHeldError` — never a
 *     wait, never a hang.
 *   - ATOMIC CREATION (init/generate): the complete directory is staged in a
 *     hidden sibling and moved into place with ONE rename — creation is
 *     all-or-nothing and exclusive by construction.
 *   - ATOMIC SWAP (change/freeze/check evidence): every file is staged as a
 *     hidden temp (exclusively created, fsynced), live targets are backed up
 *     via hardlink, then each temp is renamed over its live name — with
 *     `manifest.json` LAST: the manifest is the revision's commit point, so
 *     a reader keying on it sees either the old revision or a fully-swapped
 *     one. Any failure during the swap ROLLS BACK every already-renamed file
 *     from its backup, leaving the previous state byte-identical.
 *
 * TIME: no clock and no randomness in here — staleness is decided from the
 * INJECTED `nowIso` (the repo-wide boundary-clock contract) and, for
 * unparseable lockfiles, the lockfile's own mtime. Temp/backup/stage names
 * are derived from pid + a module counter, so they are deterministic and
 * collision-free across and within processes.
 *
 * SYNCHRONOUS ON PURPOSE: a fully sync critical section cannot interleave on
 * the event loop, so two concurrent MCP tool calls in ONE server process are
 * serialized exactly like two OS processes (the lock covers both; sync makes
 * the in-process case airtight).
 *
 * PLATFORM: POSIX is the product target (the smoke test is POSIX). The
 * primitives used (O_EXCL, same-directory rename, hardlink, directory
 * fsync) behave as required on Linux/macOS; on other platforms directory
 * fsync is best-effort (ignored where unsupported) and no Windows-specific
 * fallback is provided. NFS/remote filesystems do not guarantee O_EXCL or
 * atomic rename semantics — use a local filesystem.
 */

/** The lockfile name, at the SPEC ROOT (the dir that contains spec/). */
export const LOCK_FILE = '.lco-revision.lock';

/**
 * A holder's lock older than this is stale and may be broken. Critical
 * sections are sub-second local-fs writes, so 10s is two orders of magnitude
 * beyond the worst legal holder — dead holders recover quickly, live ones
 * can never be mistaken for dead.
 */
export const DEFAULT_STALE_MS = 10_000;

/** Bounded stale-break retries: two racers must not ping-pong forever. */
const MAX_ACQUIRE_ATTEMPTS = 5;

/** Monotonic per-process suffix for temp/backup/stage names (no randomness). */
let nameCounter = 0;
function nextSuffix(): string {
  return `${process.pid}-${++nameCounter}`;
}

export interface LockIdentity {
  pid: number;
  acquiredAt: string;
}

/** A live lock is held by someone else: fail fast with an actionable message. */
export class LockHeldError extends Error {
  readonly lockPath: string;
  /** The parsed holder identity, or null when the content was unparseable. */
  readonly holder: LockIdentity | null;
  readonly staleAfterMs: number;

  constructor(lockPath: string, holder: LockIdentity | null, staleAfterMs: number) {
    super(
      holder
        ? `spec root is locked by another writer (pid ${holder.pid}, acquired at ` +
          `${holder.acquiredAt}) — wait for it to finish, or if that writer is ` +
          `dead remove ${lockPath} (a stale lock is auto-broken after ` +
          `${Math.round(staleAfterMs / 1000)}s)`
        : `spec root lock ${lockPath} is held (content unparseable) — if no ` +
          `other writer is running, remove it (auto-broken after ` +
          `${Math.round(staleAfterMs / 1000)}s)`,
    );
    this.name = 'LockHeldError';
    this.lockPath = lockPath;
    this.holder = holder;
    this.staleAfterMs = staleAfterMs;
  }
}

export interface SpecRootLock {
  identity: LockIdentity;
  /** Remove the lock — but ONLY if it is still ours (a stale-breaker or a
   *  foreign writer may have replaced it meanwhile). Idempotent. */
  release(): void;
}

export interface LockOptions {
  /** Override the stale-break window (tests); default DEFAULT_STALE_MS. */
  staleMs?: number;
}

/**
 * Acquire the per-root revision lock, creating `<root>` (and parents) if
 * missing — init/generate legitimately run on a not-yet-existing root.
 * Throws `LockHeldError` immediately when a live lock exists; breaks locks
 * that are provably stale (recorded age, or mtime age for unparseable
 * content) and retries, bounded.
 */
export function acquireSpecRootLock(rootDir: string, nowIso: string, opts?: LockOptions): SpecRootLock {
  const staleMs = opts?.staleMs ?? DEFAULT_STALE_MS;
  const lockPath = join(rootDir, LOCK_FILE);
  mkdirSync(rootDir, { recursive: true });

  for (let attempt = 0; ; attempt++) {
    const identity: LockIdentity = { pid: process.pid, acquiredAt: nowIso };
    const content = JSON.stringify(identity);
    let fd: number | undefined;
    try {
      fd = openSync(lockPath, 'wx'); // O_EXCL: the exclusivity primitive
      writeSync(fd, content, 0, 'utf8');
      fsyncSync(fd);
    } catch (err) {
      if (fd !== undefined) {
        // The lockfile exists and is OURS (openSync succeeded this attempt;
        // the identity write/fsync failed). A failed acquisition must not
        // strand its own partial lock for the whole stale window.
        try {
          unlinkSync(lockPath);
        } catch {
          // best-effort: the original error is the diagnosis
        }
        throw err;
      }
      const e = err as NodeJS.ErrnoException;
      if (e.code !== 'EEXIST' || attempt >= MAX_ACQUIRE_ATTEMPTS) throw err;
      if (!breakStaleLock(lockPath, nowIso, staleMs)) {
        throw new LockHeldError(lockPath, readHolder(lockPath), staleMs);
      }
      continue; // stale lock broken — retry the exclusive create
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
    return {
      identity,
      release: () => releaseLock(lockPath, identity),
    };
  }
}

/** Parse the holder identity, or null for missing/unparseable content. */
function readHolder(lockPath: string): LockIdentity | null {
  let raw: string;
  try {
    raw = readFileSync(lockPath, 'utf8');
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as { pid?: unknown; acquiredAt?: unknown };
    if (typeof parsed.pid === 'number' && typeof parsed.acquiredAt === 'string') {
      return { pid: parsed.pid, acquiredAt: parsed.acquiredAt };
    }
  } catch {
    // fall through: unparseable
  }
  return null;
}

/**
 * Break the lock iff it is provably stale. Returns true when the lock was
 * removed (caller retries); false when it looks live (caller refuses).
 *
 * Staleness is decided ONLY from injected time: the recorded acquiredAt for
 * parseable content, and the file's mtime for unparseable content (covers
 * the microsecond gap between a holder's O_EXCL create and its identity
 * write — such a lock has a fresh mtime and is treated as live). An age
 * that cannot be computed (NaN clock, either branch) is UNKNOWN, not stale:
 * the lock is never broken on a guess (T22 rider — the mtime branch used
 * to fall through `NaN < staleMs`, which is false, straight to unlink).
 */
function breakStaleLock(lockPath: string, nowIso: string, staleMs: number): boolean {
  const nowMs = Date.parse(nowIso); // parses the INJECTED clock; never reads one
  const holder = readHolder(lockPath);
  let ageMs: number;
  if (holder) {
    const heldMs = Date.parse(holder.acquiredAt);
    if (Number.isNaN(heldMs) || Number.isNaN(nowMs)) return false; // unknown age: refuse to guess
    ageMs = nowMs - heldMs;
  } else {
    try {
      ageMs = nowMs - statSync(lockPath).mtimeMs;
    } catch {
      return false; // vanished meanwhile: let the retry loop re-run
    }
  }
  if (Number.isNaN(ageMs) || ageMs < staleMs) return false; // live OR unknown age: never break on a guess
  try {
    unlinkSync(lockPath);
  } catch {
    return false; // someone else broke/took it first: refuse, retry re-runs
  }
  return true;
}

/** Remove the lock only when its content is still exactly our identity. */
function releaseLock(lockPath: string, identity: LockIdentity): void {
  const holder = readHolder(lockPath);
  if (holder && holder.pid === identity.pid && holder.acquiredAt === identity.acquiredAt) {
    try {
      unlinkSync(lockPath);
    } catch {
      // Already gone — release is idempotent.
    }
  }
}

/** One staged file: `name` is a single path segment relative to the target. */
export interface StagedFile {
  name: string;
  content: unknown;
  /**
   * Creation mode for the staged (and, after the rename, live) file — default
   * is the process default. Evidence files pass 0o600 (SEC-004): output tails
   * may carry secrets, so they are owner-only from creation; section files
   * keep the default (they are the shared, committable spec).
   */
  mode?: number;
}

/** The on-disk serialization every spec writer shares (2-space JSON, utf8) —
 *  byte-identical to the format every existing spec file already carries
 *  (artifact_hashes pin exactly these bytes; never add or drop a byte). */
function serialize(content: unknown): string {
  return JSON.stringify(content, null, 2);
}

/** Best-effort directory fsync (durability of the rename metadata itself). */
function fsyncDir(dir: string): void {
  let fd: number | undefined;
  try {
    fd = openSync(dir, 'r');
    fsyncSync(fd);
  } catch {
    // Unsupported on this platform/filesystem — durability degrades, the
    // atomicity contract does not depend on it.
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/** Write one file to `path` with exclusive create, fsync before close. */
function writeTempFile(path: string, content: unknown, mode?: number): void {
  const fd = openSync(path, 'wx', mode ?? 0o666);
  try {
    const buf = Buffer.from(serialize(content), 'utf8');
    let offset = 0;
    while (offset < buf.length) {
      offset += writeSync(fd, buf, offset, buf.length - offset);
    }
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/**
 * Create a COMPLETE directory atomically (init scaffolds, generated specs).
 *
 * All files are staged in a hidden sibling `.lco-stage-*` directory (created
 * exclusively, fsynced), then the whole directory is moved into place with
 * ONE rename — creation is all-or-nothing; no reader ever sees a partial
 * tree, and a failed attempt leaves no target behind. THROWS when the target
 * already exists with content (rename gives ENOTEMPTY/EEXIST); a caller
 * wanting a friendly no-clobber refusal checks existence first (under the
 * root lock).
 */
export function createDirAtomically(targetDir: string, files: StagedFile[]): void {
  if (existsSync(targetDir)) {
    throw new Error(`refusing to create ${targetDir}: directory already exists`);
  }
  const parent = dirname(targetDir);
  mkdirSync(parent, { recursive: true });
  const stageDir = join(parent, `.lco-stage-${nextSuffix()}`);
  mkdirSync(stageDir); // exclusive: fresh name, fails loudly if occupied
  try {
    for (const { name, content } of files) {
      writeTempFile(join(stageDir, name), content);
    }
    fsyncDir(stageDir);
    renameSync(stageDir, targetDir); // THE atomic create
    fsyncDir(parent);
  } catch (err) {
    rmSync(stageDir, { recursive: true, force: true }); // never leave a stage behind
    throw err;
  }
}

/**
 * Swap a set of files into an EXISTING directory atomically per file, with
 * rollback (change sections, freeze manifest, check evidence).
 *
 * Phases: (1) stage every file as a hidden exclusive temp with fsync;
 * (2) hardlink-backup every live target that is a regular file; (3) rename
 * each temp over its live name — `manifest.json` LAST (the commit point);
 * (4) fsync the directory; (5) drop the backups. A failure at ANY point
 * rolls back every already-renamed file from its backup and removes all
 * temps/backups, so the directory is left BYTE-IDENTICAL to its pre-call
 * state. No live file is ever truncated in place.
 */
export function swapFilesAtomically(targetDir: string, files: StagedFile[]): void {
  const suffix = nextSuffix();
  const temps = new Map<string, string>(); // name -> temp path
  const backups = new Map<string, string | null>(); // name -> backup path (null: no prior file)
  const swapped: string[] = [];

  try {
    // --- 1. stage everything (no live file is touched yet) -------------------
    for (const staged of files) {
      const { name, content } = staged;
      const temp = join(targetDir, `.${name}.lco-tmp-${suffix}`);
      // Register the temp BEFORE writing it: writeTempFile opens with 'wx'
      // and can fail AFTER the file exists (writeSync ENOSPC mid-buffer,
      // fsyncSync EIO), and the rollback below cleans only what is in this
      // map — an unregistered temp would survive as residue, breaking the
      // byte-identity contract this function promises.
      temps.set(name, temp);
      writeTempFile(temp, content, staged.mode);
      backups.set(name, backupPathFor(targetDir, name, suffix));
    }

    // --- 2. hardlink-backup the current live files ---------------------------
    for (const { name } of files) {
      const live = join(targetDir, name);
      if (!existsSync(live) || !statSync(live).isFile()) {
        backups.set(name, null); // nothing (or not a regular file) to protect
        continue;
      }
      const bak = backups.get(name)!;
      linkSync(live, bak);
    }

    // --- 3. the swap — manifest.json LAST (the revision commit point) --------
    const ordered = [...files].sort((a, b) =>
      a.name === 'manifest.json' ? 1 : b.name === 'manifest.json' ? -1 : 0,
    );
    for (const { name } of ordered) {
      renameSync(temps.get(name)!, join(targetDir, name));
      temps.delete(name);
      swapped.push(name);
    }

    // --- 4. durability + 5. drop backups --------------------------------------
    fsyncDir(targetDir);
    for (const bak of backups.values()) {
      if (bak !== null) {
        try {
          unlinkSync(bak);
        } catch {
          // backup already gone — nothing to clean
        }
      }
    }
  } catch (err) {
    // ROLLBACK: restore every already-swapped file, newest first. Backup
    // null means the file did not exist before — remove it again.
    for (const name of swapped.reverse()) {
      const bak = backups.get(name) ?? null;
      try {
        if (bak !== null && existsSync(bak)) renameSync(bak, join(targetDir, name));
        else unlinkSync(join(targetDir, name));
      } catch {
        // Rollback is best-effort; the original error is the diagnosis.
      }
    }
    for (const temp of temps.values()) {
      try {
        unlinkSync(temp);
      } catch {
        // already renamed away / gone
      }
    }
    for (const bak of backups.values()) {
      if (bak === null) continue;
      try {
        unlinkSync(bak);
      } catch {
        // gone
      }
    }
    throw err;
  }
}

/** Hidden hardlink backup path for a live target (or null-candidate). */
function backupPathFor(targetDir: string, name: string, suffix: string): string {
  return join(targetDir, `.${name}.lco-bak-${suffix}`);
}
