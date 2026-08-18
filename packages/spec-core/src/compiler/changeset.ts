import {
  RequirementSchema,
  TaskContractSchema,
  type SpecBundle,
  type TaskContract,
} from '../schemas';

export interface ChangeSet {
  id: string;
  rationale: string;
  added_requirements?: unknown[];
  /** `patch` is parsed with `TaskContractSchema.partial().strict()` (unknown
   * keys are rejected, never stripped); the MERGED task is then revalidated
   * against the full `TaskContractSchema` before acceptance. */
  modified_tasks?: Array<{ task_id: string; patch: Partial<TaskContract> }>;
  removed_task_ids?: string[];
}

export interface ApplyResult {
  ok: boolean;
  bundle?: SpecBundle;
  errors: string[];
}

/**
 * Apply a change set to a frozen spec bundle.
 *
 * Rules (fail-closed — every problem is reported, none is swallowed, and a
 * failed apply never returns a bundle):
 *   - only a FROZEN spec can be changed;
 *   - on success: spec_version + 1, state -> 'draft', frozen_at removed;
 *   - modified_tasks: unknown task_id is an error; each patch is schema-parsed
 *     with TaskContractSchema.partial().strict() (unknown keys rejected, so a
 *     typo'd key cannot become a silent no-op) and the merged task is
 *     revalidated against the FULL TaskContractSchema (an invalid merged task
 *     is rejected, never merged in);
 *   - removed_task_ids: existence is checked; unknown ids are errors;
 *   - added_requirements: each entry must satisfy RequirementSchema.
 *
 * Determinism: `nowIso` is injected per the interface — this function never
 * reads the clock or the environment. It is intentionally not stamped into
 * the result: the applied bundle returns to state 'draft', which carries no
 * timestamp field (only freeze records one, via its own parameter).
 */
export function applyChangeSet(b: SpecBundle, cp: ChangeSet, nowIso: string): ApplyResult {
  void nowIso; // determinism-by-construction: no hidden clock, no env reads

  if (b.manifest.state !== 'frozen') {
    return {
      ok: false,
      errors: [
        `cannot apply changeset ${cp.id}: only a frozen spec can be changed ` +
          `(current state is '${b.manifest.state}')`,
      ],
    };
  }

  const errors: string[] = [];

  // --- added_requirements: validate against RequirementSchema ----------------
  const addedRequirements = (cp.added_requirements ?? []).map((req, i) => {
    const parsed = RequirementSchema.safeParse(req);
    if (!parsed.success) {
      errors.push(
        `added_requirements[${i}] fails RequirementSchema: ` +
          `${formatIssues(parsed.error.issues)}`,
      );
      return null;
    }
    return parsed.data;
  });

  // --- modified_tasks: partial patch + full merged-object revalidation -------
  const tasksById = new Map<string, TaskContract>(b.tasks.map((t) => [t.task_id, t]));
  const mergedById = new Map<string, TaskContract>();

  for (const [i, entry] of (cp.modified_tasks ?? []).entries()) {
    const existing = tasksById.get(entry.task_id);
    if (!existing) {
      errors.push(
        `modified_tasks[${i}]: unknown task_id '${entry.task_id}' ` +
          `(known: ${b.tasks.map((t) => t.task_id).join(', ')})`,
      );
      continue;
    }

    const base = mergedById.get(entry.task_id) ?? existing;
    // strict(): unrecognized keys (e.g. a typo like `titel`) are rejected
    // instead of silently stripped — a stripped patch would parse to {} and
    // "succeed" as a no-op version bump, which fail-closed forbids.
    const patchParsed = TaskContractSchema.partial().strict().safeParse(entry.patch ?? {});
    if (!patchParsed.success) {
      errors.push(
        `modified_tasks[${i}] (${entry.task_id}): patch fails TaskContractSchema.partial(): ` +
          `${formatIssues(patchParsed.error.issues)}`,
      );
      continue;
    }

    const merged = TaskContractSchema.safeParse({ ...base, ...patchParsed.data });
    if (!merged.success) {
      errors.push(
        `modified_tasks[${i}] (${entry.task_id}): merged task fails TaskContractSchema: ` +
          `${formatIssues(merged.error.issues)}`,
      );
      continue;
    }
    mergedById.set(entry.task_id, merged.data);
  }

  // --- removed_task_ids: existence check -------------------------------------
  const knownIds = new Set(tasksById.keys());
  for (const id of cp.removed_task_ids ?? []) {
    if (!knownIds.has(id)) {
      errors.push(
        `removed_task_ids: '${id}' does not exist in the spec ` +
          `(known: ${b.tasks.map((t) => t.task_id).join(', ')})`,
      );
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // --- build the next bundle (input is never mutated) ------------------------
  const next: SpecBundle = structuredClone(b);
  if (addedRequirements.length > 0) {
    next.requirements.push(...(addedRequirements as SpecBundle['requirements']));
  }
  next.tasks = next.tasks
    .filter((t) => !(cp.removed_task_ids ?? []).includes(t.task_id))
    .map((t) => mergedById.get(t.task_id) ?? t);

  next.manifest.spec_version = b.manifest.spec_version + 1;
  next.manifest.state = 'draft';
  delete next.manifest.frozen_at;
  // artifact_hashes stay pinned to the frozen content until the next freeze;
  // the drift between them and the edited sections is exactly what makes
  // post-change tampering detectable.

  return { ok: true, bundle: next, errors: [] };
}

function formatIssues(issues: { path: (string | number)[]; message: string }[]): string {
  return issues
    .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
    .join('; ');
}
