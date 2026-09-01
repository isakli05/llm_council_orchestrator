/**
 * AnchorVerifier — the honesty fix for evidence hashes (audit 05 §A.2: today
 * evidence hashes are write-only decoration; closure checks id-existence only).
 *
 * This module RECOMPUTES the canonical hash (sha256 over raw file bytes) from
 * the analyzed repository on every verification. It never trusts:
 *   - the stored `content_hash` (compared against the recomputation),
 *   - LLM-provided hashes,
 *   - Graphify-provided hashes (graph data is untrusted output).
 *
 * Path safety: repo-relative POSIX paths only; every resolution goes through
 * realpath containment (`isInside`) — never string-prefix checks. A symlink
 * resolving outside the target root is an escape and fails closed; a symlink
 * resolving INSIDE the root hashes the real file (documented behavior).
 */
import { createHash } from 'node:crypto';
import { statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isInside, tryRealpath } from '../../storage/paths';

export interface CodeAnchorInput {
  node_id?: string;
  path: string;
  content_hash: string;
  start_line?: number;
  end_line?: number;
}

export type AnchorFailureCode =
  | 'invalid_path'
  | 'file_missing'
  | 'path_escape'
  | 'not_a_regular_file'
  | 'hash_mismatch';

export type AnchorVerification =
  | { ok: true; anchor: CodeAnchorInput; computed_hash: string }
  | { ok: false; anchor: CodeAnchorInput; code: AnchorFailureCode; message: string };

/** Canonical hash: sha256 over raw bytes — the ONE documented algorithm. */
export function canonicalFileHash(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

/** Repo-relative POSIX path shape only — traversal/absolute/Windows fail fast. */
export function isValidAnchorPath(path: string): boolean {
  if (path.length === 0 || path.length > 1000) return false;
  if (path.includes('\\') || path.includes('\0')) return false;
  if (path.startsWith('/')) return false;
  if (/^[A-Za-z]:/.test(path)) return false;
  const segments = path.split('/');
  for (const seg of segments) {
    if (seg === '..' || seg === '') return false;
  }
  return true;
}

export function verifyAnchor(anchor: CodeAnchorInput, targetRoot: string): AnchorVerification {
  if (!isValidAnchorPath(anchor.path)) {
    return {
      ok: false,
      anchor,
      code: 'invalid_path',
      message: `anchor path ${JSON.stringify(anchor.path)} is not a repo-relative POSIX path (no .., no absolute, no backslashes)`,
    };
  }

  const rootReal = tryRealpath(targetRoot);
  if (rootReal === undefined) {
    return {
      ok: false,
      anchor,
      code: 'file_missing',
      message: `target root does not exist: ${targetRoot}`,
    };
  }

  const real = tryRealpath(join(rootReal, anchor.path));
  if (real === undefined) {
    return {
      ok: false,
      anchor,
      code: 'file_missing',
      message: `anchored file missing: ${anchor.path}`,
    };
  }

  if (!isInside(rootReal, real)) {
    return {
      ok: false,
      anchor,
      code: 'path_escape',
      message: `anchor ${anchor.path} resolves outside the target root (${real}) — symlink escape refused`,
    };
  }

  let isFile: boolean;
  try {
    isFile = statSync(real).isFile();
  } catch {
    return { ok: false, anchor, code: 'file_missing', message: `anchored file missing: ${anchor.path}` };
  }
  if (!isFile) {
    return {
      ok: false,
      anchor,
      code: 'not_a_regular_file',
      message: `anchor ${anchor.path} does not resolve to a regular file`,
    };
  }

  const computed = canonicalFileHash(readFileSync(real));
  if (computed !== anchor.content_hash) {
    return {
      ok: false,
      anchor,
      code: 'hash_mismatch',
      message: `anchor ${anchor.path} is stale: stored ${anchor.content_hash.slice(0, 19)}… but computed ${computed.slice(0, 19)}…`,
    };
  }
  return { ok: true, anchor, computed_hash: computed };
}

export interface AnchorBatchResult {
  results: AnchorVerification[];
  all_ok: boolean;
}

export function verifyMany(anchors: readonly CodeAnchorInput[], targetRoot: string): AnchorBatchResult {
  const results = anchors.map((a) => verifyAnchor(a, targetRoot));
  return { results, all_ok: results.every((r) => r.ok) };
}
