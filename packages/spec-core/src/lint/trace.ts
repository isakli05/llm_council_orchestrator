import type { SpecBundle, TraceEdge } from '../schemas';

/**
 * Pure traceability-graph builder: derives every edge of the bundle graph.
 *
 * Edge semantics (binding):
 * - `req-task`     task.refs.requirements[i] -> task.task_id
 * - `dec-task`     task.refs.decisions[i] -> task.task_id
 * - `task-test`    task.task_id -> each requirement whose id text appears in
 *                  one of the task's test `cases[]` — the same case-text
 *                  linkage L10_TRACEABILITY_GAP uses (see ./rules/l10.ts).
 *                  `task.tests[].file` is a file path, not an IdSchema value,
 *                  so test nodes are expressed as the REQ ids their cases
 *                  prove; this keeps both endpoints IdSchema-valid.
 * - `evidence-req` requirement.evidence[i] -> requirement.id
 *
 * This is a pure graph builder, NOT a validator: referenced ids that do not
 * exist in the bundle (dangling req/dec/evidence refs) are passed through
 * unfiltered. Existence is the lint layer's job (L02/L05-style checks).
 *
 * Deterministic and side-effect free: the input bundle is never mutated, the
 * result contains no duplicate (kind, from, to) triple, and it is sorted by
 * (kind, from, to).
 */
export function buildTrace(b: SpecBundle): TraceEdge[] {
  const seen = new Set<string>();
  const edges: TraceEdge[] = [];

  const push = (kind: TraceEdge['kind'], from: string, to: string): void => {
    const k = `${kind}|${from}|${to}`;
    if (seen.has(k)) return;
    seen.add(k);
    edges.push({ from, to, kind });
  };

  for (const task of b.tasks) {
    for (const reqId of task.refs.requirements) {
      push('req-task', reqId, task.task_id);
    }
    for (const decId of task.refs.decisions) {
      push('dec-task', decId, task.task_id);
    }
    // L10 linkage, mirrored: a test case containing a req id proves that req.
    for (const req of b.requirements) {
      const covered = task.tests.some((test) =>
        test.cases.some((c) => c.includes(req.id)),
      );
      if (covered) push('task-test', task.task_id, req.id);
    }
  }

  for (const req of b.requirements) {
    for (const evId of req.evidence) {
      push('evidence-req', evId, req.id);
    }
  }

  const byKey = (e: TraceEdge): string => `${e.kind}|${e.from}|${e.to}`;
  edges.sort((a, c) => {
    const ka = byKey(a);
    const kc = byKey(c);
    return ka < kc ? -1 : ka > kc ? 1 : 0;
  });
  return edges;
}
