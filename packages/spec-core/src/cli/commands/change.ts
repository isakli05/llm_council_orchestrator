import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { compileSpecDir } from '../../compiler/compile';
import { applyChangeSet, type ChangeSet } from '../../compiler/changeset';
import { lintBundle } from '../../lint/engine';
import type { LintFinding } from '../../lint/types';

export interface ChangeResult {
  /** 0 applied + clean lint, 1 applied but re-lint failed, 2 compile/IO/schema rejection. */
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
 *   4. write the changed sections back to spec/: manifest.json ALWAYS,
 *      tasks.json when tasks were modified/removed, requirements.json when
 *      requirements were added (the new bundle's arrays already carry the
 *      merge — writing them is the append). A write failure is code 2;
 *   5. re-lint the NEW bundle — the change gate. Lint errors surface as a
 *      rule/severity/path/message table in `details` with code 1 (the change
 *      itself is already on disk; the gate reports, it does not roll back).
 *
 * `nowIso` is injected per the interface contract — this function never reads
 * the clock or the environment.
 */
export async function cmdChange(
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

  // --- 4. write the changed sections back --------------------------------------
  const writes: Array<[file: string, content: unknown]> = [['manifest.json', next.manifest]];
  if ((cp.modified_tasks?.length ?? 0) > 0 || (cp.removed_task_ids?.length ?? 0) > 0) {
    writes.push(['tasks.json', next.tasks]);
  }
  if ((cp.added_requirements?.length ?? 0) > 0) {
    writes.push(['requirements.json', next.requirements]);
  }

  try {
    for (const [file, content] of writes) {
      await writeFile(join(dir, 'spec', file), JSON.stringify(content, null, 2), 'utf8');
    }
  } catch (err) {
    return {
      code: 2,
      summary: `changeset ${csId} applied in memory but a section write failed`,
      details: [(err as Error).message],
    };
  }

  // --- 5. re-lint gate over the NEW bundle -------------------------------------
  const lint = lintBundle(next);
  const versionedSummary =
    `changeset ${csId} applied: spec_version ${next.manifest.spec_version} ` +
    `(state ${next.manifest.state}), ${next.tasks.length} task(s), ` +
    `${next.requirements.length} requirement(s)`;

  if (lint.errors.length === 0 && lint.warnings.length === 0) {
    return {
      code: 0,
      summary: `${versionedSummary}; lint OK: 0 errors, 0 warnings`,
      details: [],
    };
  }

  const details = [
    'RULE\tSEVERITY\tPATH\tMESSAGE',
    ...[...lint.errors, ...lint.warnings].map(findingLine),
    `${lint.errors.length} error(s), ${lint.warnings.length} warning(s)`,
  ];

  if (lint.errors.length > 0) {
    return {
      code: 1,
      summary: `${versionedSummary}; re-lint FAILED with ${lint.errors.length} error(s)`,
      details,
    };
  }

  // Warnings only — the change stands (mirrors `lco lint` exit semantics).
  return {
    code: 0,
    summary: `${versionedSummary}; lint OK with ${lint.warnings.length} warning(s)`,
    details,
  };
}

function findingLine(f: LintFinding): string {
  return `${f.rule}\t${f.severity}\t${f.path || '<root>'}\t${f.message}`;
}
