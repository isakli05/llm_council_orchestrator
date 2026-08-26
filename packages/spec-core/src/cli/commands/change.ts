import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { compileSpecDir } from '../../compiler/compile';
import { applyChangeSet, type ChangeSet } from '../../compiler/changeset';
import { lintBundle } from '../../lint/engine';
import type { LintFinding } from '../../lint/types';
import { acquireSpecRootLock, swapFilesAtomically } from '../../storage/revision';

export interface ChangeResult {
  /** 0 applied + clean lint, 1 change-gate (lint) failure — nothing written, 2 compile/IO/schema rejection. */
  code: number;
  summary: string;
  details: string[];
}

/**
 * Apply a changeset to a frozen spec directory and operationalize the result.
 *
 * Pipeline (fail-closed, pure core — no console, no process.exit, no clock):
 *   1. compileSpecDir — any compile error is a usage-class rejection (code 2);
 *   2. read + parse the changeset file — missing file / invalid JSON / non-object
 *      are rejected with code 2;
 *   3. applyChangeSet — only a FROZEN spec is changeable; strict patch keys;
 *      success bumps spec_version, returns the bundle to state 'draft' and
 *      drops frozen_at. Rejections (code 2) write nothing;
 *   4. CHANGE GATE (BACK-005): the complete candidate revision is linted IN
 *      MEMORY. Lint errors reject the changeset with code 1 and NOTHING is
 *      written — exit 1 means "not committed", byte-identically; the same
 *      changeset can be fixed and retried against the still-frozen spec.
 *      (Before DATA-001/BACK-005 the sections were written first and the
 *      gate reported after the fact, stranding an invalid draft on disk.)
 *   5. persist the changed sections ATOMICALLY (DATA-001) under the per-root
 *      revision lock: staged temps + rename with manifest.json LAST (the
 *      commit point) and rollback on any failure — a write error is code 2
 *      and leaves the previous state byte-identical, so the same changeset
 *      stays retryable.
 *
 * Concurrency: steps 1-5 run under `<dir>/.lco-revision.lock` (stale-break
 * policy inside the storage module); a live lock held by another writer is a
 * clean code-2 refusal, never a wait. A missing spec/ short-circuits to the
 * plain compile error BEFORE any lock or directory is created.
 *
 * `nowIso` is injected per the interface contract — this function never reads
 * the clock or the environment.
 */
export async function cmdChange(
  dir: string,
  changesetPath: string,
  nowIso: string,
): Promise<ChangeResult> {
  // Missing spec/: the standard compile failure, with zero fs side effects.
  if (!existsSync(join(dir, 'spec'))) {
    const compiled = await compileSpecDir(dir);
    return {
      code: 2,
      summary: `compile FAILED with ${compiled.errors.length} error(s): nothing changed`,
      details: compiled.errors.map((e) => `${e.path}: ${e.message}`),
    };
  }

  let lock: ReturnType<typeof acquireSpecRootLock>;
  try {
    lock = acquireSpecRootLock(dir, nowIso);
  } catch (err) {
    return {
      code: 2,
      summary: `cannot acquire the spec root lock: ${(err as Error).message}`,
      details: [],
    };
  }
  try {
    return await applyUnderLock(dir, changesetPath, nowIso);
  } finally {
    lock.release();
  }
}

/** Steps 1-5 above, already serialized by the caller's per-root lock. */
async function applyUnderLock(
  dir: string,
  changesetPath: string,
  nowIso: string,
): Promise<ChangeResult> {
  // --- 1. compile ------------------------------------------------------------
  const compiled = await compileSpecDir(dir);
  if (!compiled.ok || !compiled.bundle) {
    return {
      code: 2,
      summary: `compile FAILED with ${compiled.errors.length} error(s): nothing changed`,
      details: compiled.errors.map((e) => `${e.path}: ${e.message}`),
    };
  }

  // --- 2. read + parse the changeset -----------------------------------------
  let raw: string;
  try {
    raw = await readFile(changesetPath, 'utf8');
  } catch (err) {
    return {
      code: 2,
      summary: `cannot read changeset: ${changesetPath}`,
      details: [(err as Error).message],
    };
  }

  let cp: ChangeSet;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('changeset must be a JSON object');
    }
    cp = parsed as ChangeSet;
  } catch (err) {
    return {
      code: 2,
      summary: `changeset not valid JSON: ${changesetPath}`,
      details: [(err as Error).message],
    };
  }
  const csId = cp.id ?? '<unnamed>';

  // --- 3. apply against the frozen bundle -------------------------------------
  const applied = applyChangeSet(compiled.bundle, cp, nowIso);
  if (!applied.ok || !applied.bundle) {
    return {
      code: 2,
      summary: `changeset ${csId} rejected with ${applied.errors.length} error(s): nothing changed`,
      details: applied.errors,
    };
  }
  const next = applied.bundle;

  // --- 4. CHANGE GATE: lint the complete candidate BEFORE any persistence -----
  // (BACK-005: "gate failed" must mean "not committed", never "committed
  // into an invalid state". Warnings still pass — mirrors `lco lint`.)
  const lint = lintBundle(next);
  const versionedSummary =
    `changeset ${csId} applied: spec_version ${next.manifest.spec_version} ` +
    `(state ${next.manifest.state}), ${next.tasks.length} task(s), ` +
    `${next.requirements.length} requirement(s)`;

  if (lint.errors.length > 0) {
    return {
      code: 1,
      summary:
        `changeset ${csId} rejected by the change gate: re-lint FAILED with ` +
        `${lint.errors.length} error(s) — nothing written, the frozen spec is untouched`,
      details: [
        'RULE\tSEVERITY\tPATH\tMESSAGE',
        ...[...lint.errors, ...lint.warnings].map(findingLine),
        `${lint.errors.length} error(s), ${lint.warnings.length} warning(s)`,
      ],
    };
  }

  // --- 5. staged, atomic persistence (manifest last) ---------------------------
  const writes = new Array<{ name: string; content: unknown }>();
  if ((cp.modified_tasks?.length ?? 0) > 0 || (cp.removed_task_ids?.length ?? 0) > 0) {
    writes.push({ name: 'tasks.json', content: next.tasks });
  }
  if ((cp.added_requirements?.length ?? 0) > 0) {
    writes.push({ name: 'requirements.json', content: next.requirements });
  }
  writes.push({ name: 'manifest.json', content: next.manifest }); // the commit point

  try {
    swapFilesAtomically(join(dir, 'spec'), writes);
  } catch (err) {
    return {
      code: 2,
      summary: `changeset ${csId} applied in memory but a section write failed`,
      details: [(err as Error).message],
    };
  }

  if (lint.warnings.length === 0) {
    return {
      code: 0,
      summary: `${versionedSummary}; lint OK: 0 errors, 0 warnings`,
      details: [],
    };
  }

  // Warnings only — the change stands (mirrors `lco lint` exit semantics).
  return {
    code: 0,
    summary: `${versionedSummary}; lint OK with ${lint.warnings.length} warning(s)`,
    details: [
      'RULE\tSEVERITY\tPATH\tMESSAGE',
      ...lint.warnings.map(findingLine),
      `${lint.errors.length} error(s), ${lint.warnings.length} warning(s)`,
    ],
  };
}

function findingLine(f: LintFinding): string {
  return `${f.rule}\t${f.severity}\t${f.path || '<root>'}\t${f.message}`;
}
