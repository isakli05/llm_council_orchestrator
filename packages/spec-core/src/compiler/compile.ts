import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SpecBundleSchema, type SpecBundle } from '../schemas';
import { readContainmentError, tryRealpath, isInside } from '../storage/paths';
import { duplicateTaskIds } from './closure';

export interface CompileError {
  path: string;
  message: string;
}

export interface CompileResult {
  ok: boolean;
  bundle?: SpecBundle;
  errors: CompileError[];
}

/** Required section files under spec/; the file name matches the section name. */
const REQUIRED_SECTIONS = [
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

type SectionName = (typeof REQUIRED_SECTIONS)[number] | 'legacy';

/**
 * Compile a spec/ directory tree into a validated SpecBundle.
 *
 * `root` is the folder containing `spec/`; sections are read from
 * `spec/<section>.json`. `legacy.json` is optional. `test_files` is not a
 * file: it is derived from `tasks[].tests[].file` (first-seen order,
 * deduplicated). Fail-closed: on any missing file, invalid JSON, or schema
 * violation the result is `ok: false` and never carries a bundle.
 *
 * PATH CONTAINMENT (SEC-003): the root is resolved once with realpath and
 * every fixed section path — and the `spec/` directory itself — must RESOLVE
 * inside it. Node follows symlinks on read, so a section (or the whole spec
 * dir) symlinked outside the apparent workspace is refused as a compile
 * error here, at the single boundary every reader shares; symlinked paths
 * that resolve back INSIDE the root stay legal (legitimate reorganization).
 */
export async function compileSpecDir(root: string): Promise<CompileResult> {
  const specDir = join(root, 'spec');
  const sections = new Map<SectionName, unknown>();
  const errors: CompileError[] = [];

  // Resolve the root; a root that does not exist leaves the section reads to
  // report their ordinary 'missing file' errors below.
  const rootReal = tryRealpath(root);

  // The spec/ dir itself: a symlink pointing outside the root escapes EVERY
  // section at once — one error naming the directory, no section is read.
  if (rootReal !== undefined) {
    const specReal = tryRealpath(specDir);
    if (specReal !== undefined && !isInside(rootReal, specReal)) {
      return {
        ok: false,
        errors: [
          {
            path: specDir,
            message: `path escape: ${specDir} resolves to ${specReal}, outside the spec root ${rootReal} (symlinked section/spec paths must stay inside the root)`,
          },
        ],
      };
    }
  }

  for (const name of [...REQUIRED_SECTIONS, 'legacy'] as SectionName[]) {
    const file = join(specDir, `${name}.json`);
    if (rootReal !== undefined) {
      const escape = readContainmentError(rootReal, file);
      if (escape !== null) {
        errors.push({ path: file, message: escape });
        continue; // never read escaped content
      }
    }
    try {
      sections.set(name, JSON.parse(await readFile(file, 'utf8')));
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === 'ENOENT') {
        if ((REQUIRED_SECTIONS as readonly string[]).includes(name)) {
          errors.push({ path: file, message: 'missing file' });
        }
      } else {
        errors.push({ path: file, message: `invalid JSON: ${e.message}` });
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const candidate = {
    manifest: sections.get('manifest'),
    intent: sections.get('intent'),
    glossary: sections.get('glossary'),
    assumptions: sections.get('assumptions'),
    evidence: sections.get('evidence'),
    requirements: sections.get('requirements'),
    decisions: sections.get('decisions'),
    contracts: sections.get('contracts'),
    tasks: sections.get('tasks'),
    test_files: deriveTestFiles(sections.get('tasks')),
    ...(sections.has('legacy') ? { legacy: sections.get('legacy') } : {}),
  };

  const parsed = SpecBundleSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    };
  }

  // Task-id uniqueness is a COMPILE invariant (BACK-006), not a lint finding:
  // plan --json's map, check --task selection, and evidence filenames are all
  // id-keyed — a duplicate task_id makes every id-keyed consumer lossy, so no
  // consumer may ever see such a bundle, including the compile-level ones.
  const duplicateErrors = duplicateTaskIds(parsed.data.tasks).map((d) => ({
    path: 'tasks',
    message:
      `duplicate task_id '${d.task_id}' appears ${d.count} times — task ids must be ` +
      'unique (plan --json, check --task and evidence files are keyed by task_id)',
  }));
  if (duplicateErrors.length > 0) {
    return { ok: false, errors: duplicateErrors };
  }

  return { ok: true, bundle: parsed.data, errors: [] };
}

/** test_files ledger: unique task test files in task order (defensive against malformed input). */
function deriveTestFiles(tasks: unknown): string[] {
  if (!Array.isArray(tasks)) return [];
  const files: string[] = [];
  for (const task of tasks) {
    if (task === null || typeof task !== 'object') continue;
    const tests = (task as { tests?: unknown }).tests;
    if (!Array.isArray(tests)) continue;
    for (const test of tests) {
      if (test === null || typeof test !== 'object') continue;
      const file = (test as { file?: unknown }).file;
      if (typeof file === 'string' && !files.includes(file)) files.push(file);
    }
  }
  return files;
}
