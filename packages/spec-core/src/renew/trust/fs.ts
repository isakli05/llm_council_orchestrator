import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { randomBytes } from 'node:crypto';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { isInside, resolveNearestExisting, tryRealpath } from '../../storage/paths';
import { createDirAtomically, fsyncDir, type StagedFile } from '../../storage/revision';
import { TrustFsError } from './errors';

/**
 * Trust Kernel — FilesystemCapability.
 *
 * THE single authoritative write/read boundary for every trust-bearing
 * Legacy Renewal filesystem operation (third-audit S3-C-01, S3-C-02,
 * S3-H-02, S3-M-05, S3-L-02). Before this module the codebase carried NINE
 * independent write implementations — seven fixed-name `.tmp` writers with
 * default truncating opens (a hard link at `state.json.tmp` truncated the
 * analyzed target's inode: S3-C-02), an export writer whose `out.tmp` was
 * never validated (S3-C-01), and trusted reads that followed symlinks at
 * dynamic descendants (S3-H-02).
 *
 * Trust model:
 *
 *   - The renewal project root bounds the WRITABLE domain. Every write
 *     authorizes its FINAL destination against the resolved root:
 *     resolved containment (through symlinked ancestors ABOVE the root)
 *     plus a per-component no-follow walk BELOW the root — final component
 *     included, dangling links included. The analyzed target has NO write
 *     API at all; writes additionally refuse destinations resolving inside
 *     it (defense in depth on top of root disjointness).
 *
 *   - Staging is EXCLUSIVE and UNPREDICTABLE: `.<name>.lco-<24 hex>.tmp`
 *     created with 'wx' in the destination directory. A pre-existing
 *     occupant of the staging name is a typed refusal — never opened,
 *     never truncated, never deleted. Hard links become inert: this code
 *     only ever writes through a handle IT created, and replacement is an
 *     atomic RENAME (a directory-entry swap) — the previous inode is never
 *     opened for write, so aliases of the old inode (including links in
 *     the analyzed target) keep their bytes untouched.
 *
 *   - Write-time RE-AUTHORIZATION: immediately before the final rename the
 *     parent chain is re-walked and the staging file re-checked, so the
 *     authorization decision and the write it governs are microseconds —
 *     not minutes — apart. The residual window between that re-walk and
 *     the rename (a racing LOCAL writer with concurrent write access to
 *     the project tree swapping a component) cannot be closed portably in
 *     Node (no dirfd/O_NOFOLLOW); it is documented, not claimed solved.
 */

/** Unpredictable staging-name tail (48 bits minimum of entropy per write). */
function randomTail(): string {
  return randomBytes(12).toString('hex');
}

/** lstat a path; undefined when absent; throws other errors. */
function tryLstat(p: string): import('node:fs').Stats | undefined {
  try {
    return lstatSync(p);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
}

/**
 * Authorize ONE destination inside the project-writable domain and return
 * its resolved path. Refuses (typed) when the destination resolves outside
 * the resolved project root, or when ANY existing component below the root
 * — final component included, dangling symlink included — is a symlink.
 * A not-yet-existing tail is legal (creation happens beneath it).
 */
export function authorizeProjectDestination(projectDir: string, dest: string): string {
  // The operation acts on the LEXICAL destination (never through a link).
  const lexical = resolve(dest);
  const rootReal = tryRealpath(projectDir);
  if (rootReal === undefined) {
    // Nonexistent root (verifier A-F2): still enforce LEXICAL containment —
    // join-derived destinations stay under the (to-be-created) root, and an
    // arbitrary absolute path outside it refuses instead of authorizing.
    const rootLexical = resolve(projectDir);
    const rel = relative(rootLexical, lexical);
    if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`)) {
      throw new TrustFsError(
        'destination_outside_project',
        dest,
        `renewal destination ${dest} is outside the project root ${rootLexical} — refusing`,
      );
    }
    return lexical;
  }
  const resolved = resolveNearestExisting(dest);
  const rel = relative(rootReal, resolved);
  if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`)) {
    throw new TrustFsError(
      'destination_outside_project',
      dest,
      `renewal write destination ${dest} resolves to ${resolved}, outside the resolved project ` +
        `root ${rootReal} — refusing`,
    );
  }
  const segments = rel.split(sep);
  let cur = rootReal;
  for (const segment of segments) {
    cur = join(cur, segment);
    const st = tryLstat(cur);
    if (st === undefined) break; // absent tail: nothing below it can exist
    if (st.isSymbolicLink()) {
      throw new TrustFsError(
        'symlink_in_chain',
        cur,
        `renewal trust domain refused: ${cur} is a symlink — trusted renewal IO never follows ` +
          `symlinks below the project root (remove the link or point the project at a clean tree)`,
      );
    }
  }
  // Verifier A-F1 (HIGH): the FINAL component of the INTENDED path must be a
  // real file/directory. A symlink at the destination — even one resolving
  // INSIDE the root — redirects every operation onto attacker-chosen state
  // (writes replace the link's target; reads source trusted state from it;
  // no-clobber renames move the TARGET away). Legitimate intermediate aliasing
  // (a parent component resolving inside the root) remains the documented
  // accepted policy; the destination itself never follows a link.
  const finalStat = tryLstat(lexical);
  if (finalStat !== undefined && finalStat.isSymbolicLink()) {
    throw new TrustFsError(
      'symlink_in_chain',
      lexical,
      `renewal trust domain refused: the destination ${lexical} is a symlink — operations act ` +
        `on the intended path only and never follow a link at the destination (remove the link)`,
    );
  }
  return lexical;
}

/** Refuse destinations that resolve inside the analyzed (read-only) target. */
function refuseIfInsideTarget(dest: string, resolved: string, targetDir?: string): void {
  if (targetDir === undefined) return;
  const targetReal = tryRealpath(targetDir) ?? resolveNearestExisting(targetDir);
  if (isInside(targetReal, resolved)) {
    throw new TrustFsError(
      'destination_inside_target',
      dest,
      `renewal write destination ${dest} resolves inside the analyzed target (${targetReal}) — ` +
        `the target is read-only`,
    );
  }
}

/**
 * The ONE trusted write: authorize → unpredictable exclusive staging →
 * write/fsync through our own handle → re-authorize → atomic rename.
 *
 * `noClobber` refuses an existing destination (export semantics);
 * otherwise an existing regular-file destination is atomically REPLACED
 * (rename swap — the old inode is never truncated or written through).
 */
export function authorizedWrite(args: {
  projectDir: string;
  /** Analyzed target root — when known, destinations inside it refuse. */
  targetDir?: string;
  path: string;
  content: string;
  mode?: number;
  noClobber?: boolean;
}): void {
  const resolved = authorizeProjectDestination(args.projectDir, args.path);
  refuseIfInsideTarget(args.path, resolved, args.targetDir);
  if (args.noClobber && existsSync(resolved)) {
    throw new TrustFsError(
      'destination_exists',
      resolved,
      `refusing to overwrite ${args.path} — it already exists (renewal writes never clobber; ` +
        `move it aside or choose a fresh path)`,
    );
  }
  const dir = dirname(resolved);
  mkdirSync(dir, { recursive: true, mode: 0o700 });

  // Stage: unpredictable name, exclusive create, our own handle.
  const temp = join(dir, `.${basename(resolved)}.lco-${randomTail()}.tmp`);
  let fd: number | undefined;
  try {
    fd = openSync(temp, 'wx', args.mode ?? 0o600);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'EEXIST') {
      throw new TrustFsError(
        'staging_collision',
        temp,
        `staging path ${temp} already exists — an unpredictable exclusive name collided, which ` +
          `means it was created by someone else; refusing (the occupant is never touched)`,
      );
    }
    throw err;
  }
  try {
    const buf = Buffer.from(args.content, 'utf8');
    let offset = 0;
    while (offset < buf.length) {
      offset += writeSync(fd, buf, offset, buf.length - offset);
    }
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }

  try {
    // Write-time re-authorization: the chain must still be symlink-free and
    // our staging entry must still be the regular file we just created.
    authorizeProjectDestination(args.projectDir, resolved);
    const tempStat = tryLstat(temp);
    if (tempStat === undefined || !tempStat.isFile()) {
      throw new TrustFsError(
        'staging_vanished',
        temp,
        `staging file ${temp} disappeared or changed type between write and rename — refusing`,
      );
    }
    renameSync(temp, resolved);
    fsyncDir(dir);
  } catch (err) {
    // Clean up OUR staging entry only (it exists and we created it).
    try {
      unlinkIfExists(temp);
    } catch {
      // best-effort; the original error is the diagnosis
    }
    throw err;
  }
}

/** Remove a path only when it exists (ENOENT tolerated). Only ever called
 *  on staging entries this module created. */
function unlinkIfExists(p: string): void {
  try {
    unlinkSync(p);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code !== 'ENOENT') throw err;
  }
}

/**
 * The ONE trusted exclusive-create write (immutable records: approvals,
 * analysis records). Authorizes the chain, then creates the file with 'wx'
 * — an existing entry (including a symlink) is a typed refusal, never
 * truncated, never followed, never deleted.
 */
export function authorizedCreateExclusive(args: {
  projectDir: string;
  path: string;
  content: string;
  mode?: number;
}): void {
  const resolved = authorizeProjectDestination(args.projectDir, args.path);
  const dir = dirname(resolved);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  // Final-component symlink refusal is structural here: 'wx' fails EEXIST
  // on ANY existing entry, link included.
  try {
    const fd = openSync(resolved, 'wx', args.mode ?? 0o600);
    try {
      const buf = Buffer.from(args.content, 'utf8');
      let offset = 0;
      while (offset < buf.length) {
        offset += writeSync(fd, buf, offset, buf.length - offset);
      }
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'EEXIST') {
      throw new TrustFsError(
        'record_exists',
        resolved,
        `refusing to create ${args.path}: the path already exists (immutable records are ` +
          `write-once; a symlink occupant is refused identically)`,
      );
    }
    throw err;
  }
  fsyncDir(dir);
}

/**
 * The ONE trusted read for trust-bearing files (state, snapshot, stores,
 * approvals, analyses, graphify outputs, context slices): the final path
 * must be a REAL regular file reached through a symlink-free chain below
 * the project root (S3-H-02 — dynamic descendants were previously read
 * with plain follow-the-link semantics).
 */
export function authorizedRead(args: {
  projectDir: string;
  path: string;
  encoding?: 'utf8' | undefined;
}): string {
  authorizeProjectDestination(args.projectDir, args.path);
  const resolved = resolveNearestExisting(args.path);
  const st = tryLstat(resolved);
  if (st !== undefined && !st.isFile()) {
    throw new TrustFsError(
      'not_a_regular_file',
      resolved,
      `trusted renewal read ${args.path} is not a real regular file — refusing`,
    );
  }
  return readFileSync(resolved, 'utf8');
}

/**
 * Trusted directory creation beneath the project root (authorization covers
 * the chain; mode 0o700 for renewal-owned state directories).
 */
export function authorizedEnsureDir(args: { projectDir: string; path: string; mode?: number }): void {
  const resolved = authorizeProjectDestination(args.projectDir, args.path);
  mkdirSync(resolved, { recursive: true, mode: args.mode ?? 0o700 });
}

/**
 * Trusted rename with NO-CLOBBER semantics (refresh supersession archives,
 * S3-M-05: deterministic archive names previously overwrote earlier
 * history silently). Both endpoints are authorized; an existing destination
 * is a typed refusal naming both sides.
 */
export function authorizedRenameNoClobber(args: { projectDir: string; from: string; to: string; targetDir?: string }): void {
  const fromResolved = authorizeProjectDestination(args.projectDir, args.from);
  const toResolved = authorizeProjectDestination(args.projectDir, args.to);
  refuseIfInsideTarget(args.to, toResolved, args.targetDir);
  if (existsSync(toResolved)) {
    throw new TrustFsError(
      'archive_collision',
      toResolved,
      `refusing to archive ${args.from} → ${args.to}: the destination already exists ` +
        `(supersession archives never overwrite history)`,
    );
  }
  renameSync(fromResolved, toResolved);
}

/**
 * Trusted recursive removal (refresh workspace rebuild). The path must
 * authorize inside the project domain; a symlink at the path itself is
 * refused (the link entry is never followed downward by rmSync through a
 * pre-checked chain).
 */
export function authorizedRemoveTree(args: { projectDir: string; path: string }): void {
  const resolved = authorizeProjectDestination(args.projectDir, args.path);
  const st = tryLstat(resolved);
  if (st === undefined) return;
  if (st.isSymbolicLink()) {
    throw new TrustFsError(
      'symlink_in_chain',
      resolved,
      `refusing to remove ${args.path}: it is a symlink — renewal never follows links in the ` +
        `trust domain (remove it manually if intended)`,
    );
  }
  rmSync(resolved, { recursive: true, force: true });
}

/**
 * Trusted guarded-copy write for workspace descendants (mirroring analyzed
 * target files into the graph workspace). Content is derived from the
 * READ-ONLY target, so this is a fresh-file write beneath an authorized
 * workspace root — same staging discipline as {@link authorizedWrite}, but
 * creating (not replacing): a pre-existing destination is a typed refusal.
 */
export function authorizedCopyWrite(args: {
  projectDir: string;
  path: string;
  content: string;
  mode?: number;
}): void {
  authorizedWrite({ ...args, noClobber: true });
}

/**
 * Trusted atomic directory creation (renewal `spec/` write via plan):
 * wraps the shared exclusive-staging engine (`createDirAtomically`, which
 * stages in a hidden sibling and lands with ONE rename) after authorizing
 * the destination inside the project domain.
 */
export function authorizedCreateDirAtomically(args: {
  projectDir: string;
  targetDir: string;
  files: StagedFile[];
}): void {
  const resolved = authorizeProjectDestination(args.projectDir, args.targetDir);
  if (existsSync(resolved)) {
    throw new TrustFsError(
      'destination_exists',
      resolved,
      `refusing to create ${args.targetDir}: it already exists`,
    );
  }
  createDirAtomically(resolved, args.files);
}

/** Entry-surface UX preflight: the fixed renewal state destinations are
 *  chain-healthy (or absent). This is DIAGNOSTIC ONLY — the per-write
 *  authorization inside every API above is the enforcement; commands run
 *  this to fail with the best message before starting long work. */
export function renewalStateSurface(projectDir: string): string[] {
  const root = join(projectDir, '.lco', 'renewal');
  return [
    join(root, 'project.json'),
    join(root, 'snapshot.json'),
    join(root, 'overlay.json'),
    join(root, 'parity.json'),
    join(root, 'strategy.json'),
    join(root, 'state.json'),
    root,
    join(root, 'graph-workspace'),
    join(root, 'analyses'),
    join(projectDir, 'approvals'),
    join(projectDir, 'spec'),
  ];
}

/** Run the entry preflight; returns refusals as messages (never throws). */
export function preflightRenewalSurface(projectDir: string): string[] {
  const refusals: string[] = [];
  for (const dest of renewalStateSurface(projectDir)) {
    try {
      authorizeProjectDestination(projectDir, dest);
    } catch (err) {
      if (err instanceof TrustFsError) refusals.push(err.message);
      else throw err;
    }
  }
  return refusals;
}

/** No-follow stat of a path (lstat semantics — a symlink reports AS a link). */
export function authorizedStat(p: string): import('node:fs').Stats {
  return lstatSync(p);
}
