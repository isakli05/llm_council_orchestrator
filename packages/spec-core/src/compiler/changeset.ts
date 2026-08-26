import { z } from 'zod';
import {
  IdSchema,
  RequirementSchema,
  TaskContractSchema,
  type SpecBundle,
  type TaskContract,
} from '../schemas';
import { validateChangeSource } from './lifecycle';

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

/**
 * Strict runtime envelope for a change set (the TS interface above carries no
 * runtime check). `.strict()` rejects unknown top-level keys, so a typo like
 * `modified_taskz` fails loudly instead of being silently ignored — an
 * ignored key would parse as a ZERO-operation changeset and "succeed" as a
 * no-op version bump (exit 0), which fail-closed forbids.
 *
 * A schema-VALID changeset with zero operations is still accepted: that is a
 * visible-intent no-op bump (the author stated id + rationale and chose to
 * change nothing; the version bump makes the no-op auditable) — expressed
 * intent, not a typo. `patch` is deliberately loose here (`z.record`); the
 * authoritative strict parse of each patch against
 * `TaskContractSchema.partial().strict()` happens in applyChangeSet below.
 */
export const ChangeSetSchema = z
  .object({
    id: z.string().trim().min(1),
    rationale: z.string().trim().min(1),
    added_requirements: z.array(RequirementSchema).optional(),
    modified_tasks: z
      .array(
        z
          .object({
            task_id: IdSchema,
            patch: z.record(z.unknown()),
          })
          .strict(),
      )
      .optional(),
    removed_task_ids: z.array(IdSchema).optional(),
  })
  .strict();

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
 *   - the changeset envelope itself is parsed with ChangeSetSchema (.strict()):
 *     unknown top-level keys (e.g. a typo like `modified_taskz`) and a missing
 *     id/rationale are rejected before anything else — never silently ignored.
 *     A valid changeset with ZERO operations still applies as a visible-intent
 *     no-op bump;
 *   - only a FROZEN spec can be changed (the change transition frozen -> draft
 *     is owned by the lifecycle table in ./lifecycle — BACK-002);
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

  // --- envelope: unknown/missing top-level keys are rejected, not ignored ---
  const envelope = ChangeSetSchema.safeParse(cp);
  if (!envelope.success) {
    return {
      ok: false,
      errors: [
        `changeset failed ChangeSetSchema: ${formatIssues(envelope.error.issues.slice(0, 1))}`,
      ],
    };
  }

  // --- transition legality: the change transition is frozen -> draft ONLY --
  // (single source: the shared lifecycle table in ./lifecycle — BACK-002)
  const transition = validateChangeSource(b);
  if (transition.length > 0) {
    return {
      ok: false,
      errors: [`cannot apply changeset ${cp.id}: ${transition.join('; ')}`],
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
        `modified_tasks[${i}] (${entry.task_id}): patch fails TaskContractSchema.partial().strict(): ` +
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
  // artifact_hashes stay pinned to the frozen content until the next freeze
  // re-pins them; until then they make NO drift claim: cmdVerify short-circuits
  // on notFrozen BEFORE comparing hashes, so a draft cannot pass verify at
  // all (fail-closed).

  return { ok: true, bundle: next, errors: [] };
}

function formatIssues(issues: { path: (string | number)[]; message: string }[]): string {
  return issues
    .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
    .join('; ');
}
