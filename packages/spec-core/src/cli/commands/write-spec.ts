import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SpecBundle } from '../../schemas';

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
 * byte is written or any directory is created.
 *
 * Synchronous on purpose: the plan's interface is `void`, and a fully sync
 * check-then-write keeps the refusal atomic within the call (no await gap
 * between the existence check and the first write). IO failures (EACCES,
 * read-only fs, ...) propagate as throws for the command wrapper to report
 * as environment failures (exit 2), matching init's write-error contract.
 */
export function writeSpecDir(dir: string, bundle: SpecBundle): void {
  const specDir = join(dir, 'spec');
  if (existsSync(specDir)) {
    throw new Error(`refusing to overwrite existing spec/ at ${specDir}`);
  }
  mkdirSync(specDir, { recursive: true });
  for (const key of SECTION_KEYS) {
    writeFileSync(join(specDir, `${key}.json`), JSON.stringify(bundle[key], null, 2), 'utf8');
  }
  if (bundle.legacy !== undefined) {
    writeFileSync(join(specDir, 'legacy.json'), JSON.stringify(bundle.legacy, null, 2), 'utf8');
  }
}
