import { lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';

/**
 * Path safety for the spec tree (SEC-003, binding).
 *
 * The audit finding: every fixed spec path was built with `join(root, 'spec',
 * name)` and handed straight to fs calls. Node FOLLOWS symlinks on both read
 * and write, so a symlinked `spec/manifest.json` — or a symlinked `spec/`
 * directory — made the engine read and write OUTSIDE the apparent workspace,
 * and the MCP server accepted any nonblank `dir` with no allowed-root policy
 * at all. On a trusted local tree that is normal filesystem behavior; on an
 * untrusted checkout or an exposed MCP server it is an escape hatch.
 *
 * Two rules, one per direction:
 *
 *   READ  — REALPATH CONTAINMENT. Resolve the root once with realpath; every
 *   fixed section path that resolves OUTSIDE the resolved root is refused.
 *   Symlinks that resolve INSIDE the root stay legal (a symlinked parent or
 *   an aliased section is legitimate reorganization; realpath makes it legal,
 *   symlink-as-escape makes it refuse). Applied at the compile boundary, so
 *   every reader (lint/plan/trace/check/freeze/verify) inherits it.
 *
 *   WRITE — NO-FOLLOW. A write target below the spec root must be a REAL
 *   directory/file chain: each component from the root down is lstat-checked
 *   and a symlink (even one pointing back inside the root, even a DANGLING
 *   one that existsSync-style checks miss) refuses the write with a
 *   structured error naming the link. Writes never follow symlinks.
 *
 * The MCP layer adds the allowed-root policy on top (checkMcpDir): the
 * server's `dir` is ALWAYS realpath-normalized, and when the operator pinned
 * the process with LCO_MCP_EXEC_ROOT the dir must RESOLVE inside the pin.
 *
 * PLATFORM: POSIX is the product target (symlink semantics as described);
 * Windows junction/reparse-point behavior is out of scope and untested.
 */

/** The structured refusal for a path that may not be read or written. */
export class PathEscapeError extends Error {
  /** The offending path (the symlink itself, the resolving target, ...). */
  readonly path: string;

  constructor(path: string, detail: string) {
    super(`refusing unsafe path ${path}: ${detail}`);
    this.name = 'PathEscapeError';
    this.path = path;
  }
}

/**
 * Realpath containment verdict: `target` equals `base` or lies strictly
 * beneath it. STRING prefixes never count — `/a/bc` is not inside `/a/b`
 * (the exact class of bug the audit's "prefix comparison" note describes).
 */
export function isInside(base: string, target: string): boolean {
  if (target === base) return true;
  return target.startsWith(base + sep);
}

/** realpath, or undefined when the path does not exist. Other errors throw. */
export function tryRealpath(p: string): string | undefined {
  try {
    return realpathSync(p);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
}

/**
 * Resolve a path that may not exist YET: realpath the deepest existing
 * ancestor and rejoin the still-missing tail. Symlinked ancestors are
 * RESOLVED (never traversed blindly), so the result is the path a write of
 * the tail would really land at. Never throws for ENOENT; other fs errors
 * propagate.
 */
export function resolveNearestExisting(p: string): string {
  let cur = resolve(p);
  const tail: string[] = [];
  for (;;) {
    const real = tryRealpath(cur);
    if (real !== undefined) return join(real, ...tail);
    tail.unshift(basename(cur));
    const parent = dirname(cur);
    if (parent === cur) return join(cur, ...tail); // hit '/' without resolving
    cur = parent;
  }
}

/**
 * Read-side containment for one fixed spec path against the resolved root.
 * Returns null when the path is contained (or absent — a missing file is the
 * compiler's 'missing file' case, not an escape), or a human-readable
 * violation message naming both sides.
 */
export function readContainmentError(rootReal: string, path: string): string | null {
  let resolved: string | undefined;
  try {
    resolved = realpathSync(path);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') return null; // absent: contained by definition
    return `cannot resolve ${path} (${e.message}) — treated as a path escape`;
  }
  if (!isInside(rootReal, resolved!)) {
    return (
      `path escape: ${path} resolves to ${resolved}, outside the spec root ` +
      `${rootReal} (symlinked section/spec paths must stay inside the root)`
    );
  }
  return null;
}

/**
 * Write-side no-follow gate: walk `segments` under `base`; the FIRST
 * component that is a symlink refuses with a structured error naming it.
 * A missing component ends the walk (nothing below it can exist), and a
 * missing base is fine for the same reason — callers gate existence
 * separately when it matters.
 */
export function assertNoSymlinkBelow(base: string, segments: readonly string[]): void {
  let cur = base;
  for (const segment of segments) {
    cur = join(cur, segment);
    let st;
    try {
      st = lstatSync(cur);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return; // absent tail
      throw err;
    }
    if (st.isSymbolicLink()) {
      throw new PathEscapeError(
        cur,
        'is a symlink — writes below the spec root never follow symlinks ' +
          '(remove the link or make it a real file/directory)',
      );
    }
  }
}

/** Refuse one specific path when it is a symlink (dangling links included). */
export function assertNotSymlink(p: string, what: string): void {
  let st;
  try {
    st = lstatSync(p);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw err;
  }
  if (st.isSymbolicLink()) {
    throw new PathEscapeError(
      p,
      `is a symlink (the intended ${what}) — refusing to create or write ` +
        'through it; remove the link first',
    );
  }
}

/**
 * Write-side gate for the spec/ directory of an existing root: `spec` must be
 * a real directory (not a symlink) and every named section file must be a
 * real file (a symlinked write target refuses even where a rename would
 * merely clobber the link — the operator should learn their tree is linked).
 */
export function assertWritableSpecDir(root: string, fileNames: readonly string[]): void {
  assertNoSymlinkBelow(root, ['spec']);
  for (const name of fileNames) {
    assertNoSymlinkBelow(root, ['spec', name]);
  }
}

// --- MCP allowed-root policy ---------------------------------------------------------

/** The verdict of {@link checkMcpDir}. */
export type McpDirCheck = { ok: true; dir: string } | { ok: false; message: string };

/**
 * The MCP server's allowed-root policy for one tool call's `dir`.
 *
 * ALWAYS: the dir is REALPATH-NORMALIZED (an existing dir through symlinked
 * parents resolves to its real path; a not-yet-existing dir resolves via its
 * nearest existing ancestor, so init/generate creation targets normalize too).
 *
 * When `execRoot` (LCO_MCP_EXEC_ROOT, resolved from the server environment —
 * never from the request) is set, the dir must RESOLVE inside the pin's own
 * realpath: a path that is lexically under the pin but escapes through a
 * symlink is refused, and a pin that does not itself resolve fails closed
 * for every call.
 *
 * Without a pin there is no path policy — that is the documented local-trust
 * boundary (README: an unpinned server trusts its client with local paths);
 * the boundary is the operator's to draw at server start.
 */
export function checkMcpDir(dir: string, execRoot: string | undefined): McpDirCheck {
  if (typeof dir !== 'string' || dir.trim() === '') {
    return { ok: false, message: "Invalid arguments: 'dir' must be a non-empty string" };
  }
  let resolved: string;
  try {
    resolved = resolveNearestExisting(dir);
  } catch (err) {
    return { ok: false, message: `cannot resolve dir ${dir}: ${(err as Error).message}` };
  }
  if (execRoot === undefined) {
    return { ok: true, dir: resolved };
  }
  let pinReal: string;
  try {
    pinReal = realpathSync(execRoot);
  } catch {
    return {
      ok: false,
      message:
        `Invalid dir: LCO_MCP_EXEC_ROOT (${execRoot}) does not resolve to an existing ` +
        'directory — the operator pinned this server to a workspace that is not ' +
        'there, so every tool call is refused until the pin is fixed or removed',
    };
  }
  if (!isInside(pinReal, resolved)) {
    return {
      ok: false,
      message:
        `Invalid dir: ${dir} resolves to ${resolved}, outside LCO_MCP_EXEC_ROOT ` +
        `(${execRoot} → ${pinReal}) — the operator pinned this server to that ` +
        'workspace (realpath containment: symlinked paths cannot move a tool ' +
        'call outside the pin). Use a spec root under the pin, or have the ' +
        'operator restart the server without the pin.',
    };
  }
  return { ok: true, dir: resolved };
}
