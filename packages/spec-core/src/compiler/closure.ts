import type { SpecBundle, TaskContract } from '../schemas';

/**
 * THE referential-closure validator (BACK-003) — the single phase that makes
 * a compiled bundle referentially CLOSED: every cross-reference resolves to
 * an entity that exists in the bundle.
 *
 * The schema layer (namespace-specific id schemas) guarantees a reference has
 * the right FAMILY (an evidence ref is E-NNNN, a dependency is TASK-NNNN);
 * this module guarantees EXISTENCE (that E-NNNN, DEC-NNNN, REQ-NNNN,
 * TASK-NNNN, TST-NNNN entity is actually present). Wiring follows the T4
 * lifecycle pattern: one pure shared validator in the compiler layer, surfaced
 * to users as lint rule L13_BROKEN_REFERENCE (lint owns semantics; compile
 * owns shape — plus task-id uniqueness below, which is compile-level because
 * id-keyed consumers must be structurally unambiguous).
 *
 * Checked reference fields:
 *   requirements[].evidence[]          -> evidence[].id
 *   decisions[].evidence[]             -> evidence[].id
 *   assumptions[].evidence[]           -> evidence[].id
 *   legacy.preserve_change_drop[].evidence[] -> evidence[].id (when present)
 *   tasks[].refs.requirements[]        -> requirements[].id (REQ-/OPS-/…)
 *   tasks[].refs.decisions[]           -> decisions[].claim_id
 *   tasks[].depends_on[]               -> tasks[].task_id   (an unknown
 *                                          dependency BLOCKS machine plans)
 *   requirements[].acceptance_refs[]   -> tasks[].tests[].id (TST- ids)
 *
 * Determinism: findings are emitted in bundle iteration order (sections in
 * SpecBundle order, entities in array order, refs in array order); no clock,
 * no filesystem, no randomness.
 */

export type ClosureFindingCode =
  | 'MISSING_EVIDENCE_REF'
  | 'MISSING_DECISION_REF'
  | 'MISSING_REQUIREMENT_REF'
  | 'MISSING_TASK_DEP'
  | 'MISSING_TEST_REF'
  | 'DUPLICATE_TEST_ID';

export interface ClosureFinding {
  code: ClosureFindingCode;
  /** The REFERENCING entity (req/dec/task id or 'legacy'), for actionable paths. */
  path: string;
  message: string;
}

export function closureFindings(b: SpecBundle): ClosureFinding[] {
  const findings: ClosureFinding[] = [];
  const evidenceIds = new Set(b.evidence.map((e) => e.id));
  const requirementIds = new Set(b.requirements.map((r) => r.id));
  const decisionIds = new Set(b.decisions.map((d) => d.claim_id));
  const taskIds = new Set(b.tasks.map((t) => t.task_id));

  // Test registry: every tests[].id across all tasks. Duplicates make an
  // acceptance_ref ambiguous — reported separately, below.
  const testIds = new Set<string>();
  const testIdCounts = new Map<string, number>();
  for (const task of b.tasks) {
    for (const test of task.tests) {
      if (test.id === undefined) continue;
      testIds.add(test.id);
      testIdCounts.set(test.id, (testIdCounts.get(test.id) ?? 0) + 1);
    }
  }
  for (const [id, count] of testIdCounts) {
    if (count < 2) continue;
    findings.push({
      code: 'DUPLICATE_TEST_ID',
      path: id,
      message: `duplicate test id '${id}' appears ${count} times across tasks[].tests — ` +
        'acceptance_refs must resolve to exactly one test; renumber the duplicated entry',
    });
  }

  const checkRefs = (
    owner: string,
    refs: readonly string[],
    existing: ReadonlySet<string>,
    code: ClosureFindingCode,
    what: string,
  ): void => {
    for (const ref of refs) {
      if (existing.has(ref)) continue;
      findings.push({
        code,
        path: owner,
        message: `${owner} references ${what} '${ref}', which does not exist in the bundle`,
      });
    }
  };

  for (const req of b.requirements) {
    checkRefs(req.id, req.evidence, evidenceIds, 'MISSING_EVIDENCE_REF', 'evidence');
    checkRefs(req.id, req.acceptance_refs, testIds, 'MISSING_TEST_REF', 'acceptance test');
  }
  for (const dec of b.decisions) {
    checkRefs(dec.claim_id, dec.evidence, evidenceIds, 'MISSING_EVIDENCE_REF', 'evidence');
  }
  for (const assumption of b.assumptions) {
    checkRefs(assumption.id, assumption.evidence, evidenceIds, 'MISSING_EVIDENCE_REF', 'evidence');
  }
  for (const task of b.tasks) {
    checkRefs(task.task_id, task.refs.requirements, requirementIds, 'MISSING_REQUIREMENT_REF', 'requirement');
    checkRefs(task.task_id, task.refs.decisions, decisionIds, 'MISSING_DECISION_REF', 'decision');
    checkRefs(task.task_id, task.depends_on, taskIds, 'MISSING_TASK_DEP', 'task (dependency)');
  }
  for (const [i, entry] of (b.legacy?.preserve_change_drop ?? []).entries()) {
    checkRefs(`legacy.preserve_change_drop[${i}]`, entry.evidence, evidenceIds, 'MISSING_EVIDENCE_REF', 'evidence');
  }

  return findings;
}

export interface DuplicateTaskId {
  task_id: string;
  count: number;
}

/**
 * Task-id uniqueness (BACK-006) — enforced at COMPILE time, not lint: plan's
 * `--json` map, `check --task` selection, and evidence filenames are all
 * keyed by task_id, so a duplicate must never reach ANY consumer, including
 * the compile-level ones. (L06 remains the cross-family duplicate check at
 * lint for REQ/DEC/CON; task duplicates cannot get that far.)
 */
export function duplicateTaskIds(tasks: readonly TaskContract[]): DuplicateTaskId[] {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    counts.set(task.task_id, (counts.get(task.task_id) ?? 0) + 1);
  }
  const duplicates: DuplicateTaskId[] = [];
  for (const [task_id, count] of counts) {
    if (count >= 2) duplicates.push({ task_id, count });
  }
  // Deterministic: report in first-appearance order.
  duplicates.sort((a, b) => tasks.findIndex((t) => t.task_id === a.task_id) - tasks.findIndex((t) => t.task_id === b.task_id));
  return duplicates;
}
