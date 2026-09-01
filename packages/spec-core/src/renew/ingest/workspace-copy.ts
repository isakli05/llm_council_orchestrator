/**
 * The single walk over an untrusted target repository (audit 16 §C snapshot
 * row): produce the content-hash manifest AND the LCO-owned guarded copy that
 * Graphify builds against — one pass, one integrity story. The analyzed
 * repository itself is NEVER written to.
 *
 * Determinism: directory entries are processed in sorted order at every level,
 * so manifests, exclusion reports, and cap decisions are stable across runs.
 */
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DEFAULT_INGEST_LIMITS, guardPath, isDeniedDirectory, looksBinary, type IngestLimits } from './guards';

export interface FileManifestEntry {
  /** Repo-relative POSIX path, forward slashes, sorted. */
  path: string;
  /** sha256 of the raw file bytes at capture time. */
  sha256: string;
}
export type FileManifest = FileManifestEntry[];

export interface ExcludedReport {
  denied: string[];
  binary: string[];
  oversize: string[];
  symlink: string[];
}

export type WalkOutcome =
  | { ok: true; manifest: FileManifest; copyRoot: string; excluded: ExcludedReport }
  | { ok: false; code: 'corpus_too_large' | 'target_missing' | 'walk_failed'; message: string };

/** Recorded sample paths per exclusion category (counts stay honest via cap). */
const LIST_CAP = 200;

class WalkFailure extends Error {
  constructor(readonly outcome: Extract<WalkOutcome, { ok: false }>) {
    super(outcome.message);
  }
}

export function buildGuardedCopy(
  targetRoot: string,
  copyRoot: string,
  opts?: { limits?: IngestLimits; copy?: boolean },
): WalkOutcome {
  if (!existsSync(targetRoot)) {
    return { ok: false, code: 'target_missing', message: `target repository not found: ${targetRoot}` };
  }
  const limits = opts?.limits ?? DEFAULT_INGEST_LIMITS;

  const excluded: ExcludedReport = { denied: [], binary: [], oversize: [], symlink: [] };
  const push = (list: string[], rel: string) => {
    if (list.length < LIST_CAP) list.push(rel);
  };

  const found: { rel: string; abs: string }[] = [];

  const walk = (absDir: string, relDir: string): void => {
    let entries;
    try {
      entries = readdirSync(absDir, { withFileTypes: true });
    } catch (e) {
      throw new WalkFailure({
        ok: false,
        code: 'walk_failed',
        message: `could not read directory ${absDir}: ${(e as Error).message}`,
      });
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const ent of entries) {
      const rel = relDir === '' ? ent.name : `${relDir}/${ent.name}`;
      if (ent.isSymbolicLink()) {
        // Fail-closed: symlinks are never followed and never copied — an
        // in-repo link and an escape are indistinguishable cheaply.
        push(excluded.symlink, rel);
        continue;
      }
      if (ent.isDirectory()) {
        if (isDeniedDirectory(ent.name)) continue; // subtree skipped whole
        walk(join(absDir, ent.name), rel);
        continue;
      }
      if (!ent.isFile()) continue; // fifos, sockets, devices
      const verdict = guardPath(rel);
      if (!verdict.include) {
        push(excluded.denied, rel);
        continue;
      }
      found.push({ rel, abs: join(absDir, ent.name) });
    }
  };

  try {
    walk(targetRoot, '');
  } catch (e) {
    if (e instanceof WalkFailure) return e.outcome;
    throw e;
  }

  found.sort((a, b) => (a.rel < b.rel ? -1 : 1));

  if (found.length > limits.maxFiles) {
    return {
      ok: false,
      code: 'corpus_too_large',
      message:
        `target repository exceeds ingest limits: ${found.length} files > max ${limits.maxFiles}. ` +
        'Narrow the target (point at a sub-tree) or raise the ingest file cap.',
    };
  }

  const manifest: FileManifest = [];
  const doCopy = opts?.copy !== false;
  let totalBytes = 0;
  for (const f of found) {
    let size: number;
    try {
      size = lstatSync(f.abs).size;
    } catch (e) {
      throw new WalkFailure({
        ok: false,
        code: 'walk_failed',
        message: `could not stat ${f.abs}: ${(e as Error).message}`,
      });
    }
    if (size > limits.maxFileBytes) {
      push(excluded.oversize, f.rel);
      continue;
    }
    const buf = readFileSync(f.abs);
    if (looksBinary(buf)) {
      push(excluded.binary, f.rel);
      continue;
    }
    totalBytes += buf.length;
    if (totalBytes > limits.maxTotalBytes) {
      return {
        ok: false,
        code: 'corpus_too_large',
        message:
          `target repository exceeds ingest limits: included content exceeds ${limits.maxTotalBytes} bytes. ` +
          'Narrow the target or raise the ingest corpus cap.',
      };
    }
    if (doCopy) {
      const dest = join(copyRoot, f.rel);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, buf);
    }
    manifest.push({ path: f.rel, sha256: `sha256:${createHash('sha256').update(buf).digest('hex')}` });
  }

  return { ok: true, manifest, copyRoot, excluded };
}
