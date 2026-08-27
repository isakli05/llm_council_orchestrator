import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { SpecBundle } from '../../schemas';
import { acquireSpecRootLock, createDirAtomically } from '../../storage/revision';
import { assertNotSymlink } from '../../storage/paths';

/**
 * Required section files in compile.ts read order. `test_files` is NOT a file
 * — compileSpecDir derives it from tasks[].tests[].file — and `legacy.json` is
 * optional: it is written only when the bundle carries a legacy package.
 */
const SECTION_KEYS = [
  'manifest',
  'intent',
  'glossary',
  'assumptions',
  'evidence',
  'requirements',
  'decisions',
  'contracts',
  'tasks',
] as const;

/**
 * Shared spec/ writer: persist a parsed SpecBundle as the 9 (+legacy when
 * present) section files under `<dir>/spec/`, JSON with 2-space indent —
 * the exact mirror of what init scaffolds, change rewrites, and compile reads.
 *
 * NO-CLOBBER, CHECK BEFORE ANY WRITE: if `<dir>/spec` already exists (even
 * empty) this THROWS 'refusing to overwrite existing spec/' before a single
 * byte is written or any directory is created. The check runs twice — once
 * up front (zero side effects on refusal) and again under the per-root
 * revision lock, so two concurrent writers can never both pass it.
 *
 * ATOMICITY (DATA-001): the whole tree is staged in a hidden sibling and
 * moved into place with ONE rename via the revision storage, under the
 * per-root lock — a crashed or racing generate leaves either nothing or the
 * complete spec, never a partial scaffold.
 *
 * Synchronous on purpose: a fully sync critical section cannot interleave on
 * the event loop, so concurrent callers in one process (e.g. MCP tool calls)
 * serialize exactly like separate processes. IO failures (EACCES, read-only
 * fs, a live lock, ...) propagate as throws for the command wrapper to report
 * as environment failures (exit 2), matching init's write-error contract.
 * `nowIso` is injected per the interface contract (lock holder identity).
 */
export function writeSpecDir(dir: string, bundle: SpecBundle, nowIso: string): void {
  const specDir = join(dir, 'spec');
  // SEC-003: lstat catches a DANGLING spec symlink the existsSync no-clobber
  // check below would miss (existsSync follows; a dangling link reads false).
  assertNotSymlink(specDir, 'generate write target spec/');
  if (existsSync(specDir)) {
    throw new Error(`refusing to overwrite existing spec/ at ${specDir}`);
  }
  mkdirSync(dir, { recursive: true });
  const lock = acquireSpecRootLock(dir, nowIso);
  try {
    if (existsSync(specDir)) {
      throw new Error(`refusing to overwrite existing spec/ at ${specDir}`);
    }
    createDirAtomically(specDir, [
      ...SECTION_KEYS.map((key) => ({ name: `${key}.json`, content: bundle[key] })),
      ...(bundle.legacy !== undefined ? [{ name: 'legacy.json', content: bundle.legacy }] : []),
    ]);
  } finally {
    lock.release();
  }
}
