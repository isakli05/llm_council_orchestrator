import { compileSpecDir } from '../../compiler/compile';
import { buildTrace } from '../../lint/trace';
import type { SpecBundle, TraceEdge } from '../../schemas';

export interface TraceResult {
  /** 0 report produced (informational command), 2 compile/schema rejection. */
  code: number;
  report: string;
}

/**
 * Build the traceability report for a spec directory.
 *
 * Informational by design (exit 0): `lco lint` owns the gate; this is the
 * human-facing coverage view over the same graph.
 *
 * VALIDATION LEVEL (BACK-006 decision): trace stays at the COMPILE level —
 * deliberately. It is the repair view: while a spec is lint-dirty (dangling
 * refs, unjudgeable expects) `lco trace` is what you use to SEE the coverage
 * graph and fix it, so requiring lint-clean here would disable the tool
 * exactly when it is needed. It keys nothing by referenced ids and executes
 * nothing, so a semantically-invalid bundle cannot make it lossy or
 * dangerous — unlike plan (keys + schedules) and check (executes), which load
 * at 'lint-clean'. Compile-level invariants still hold underneath it:
 * sections must parse, the schema must pass, task ids must be unique.
 *
 * Requirements are rendered in bundle order; per-requirement task lists come
 * from the `req-task` edges (already sorted by buildTrace), so the report is
 * fully deterministic.
 *
 * Line contract:
 *   REQ-0001: 2 task(s) [TASK-0001 ✓test, TASK-0002 ✗no-test-link]
 *   REQ-0003: ORPHAN (no task references this requirement)   <- the L02 view
 *
 * `✓test` marks a `task-test` edge from that TASK to this REQ (the L10
 * linkage); the summary tail counts requirements with at least one edge of
 * each kind.
 */
export async function cmdTrace(dir: string): Promise<TraceResult> {
  const compiled = await compileSpecDir(dir);
  if (!compiled.ok || !compiled.bundle) {
    return {
      code: 2,
      report: [
        `compile FAILED with ${compiled.errors.length} error(s):`,
        ...compiled.errors.map((e) => `  ${e.path}: ${e.message}`),
      ].join('\n'),
    };
  }
  return { code: 0, report: renderTrace(compiled.bundle) };
}

/** Pure report renderer: bundle -> deterministic multi-line string. */
function renderTrace(b: SpecBundle): string {
  const edges = buildTrace(b);
  const count = (kind: TraceEdge['kind']): number =>
    edges.filter((e) => e.kind === kind).length;
  const hasTestLink = (taskId: string, reqId: string): boolean =>
    edges.some((e) => e.kind === 'task-test' && e.from === taskId && e.to === reqId);

  const lines: string[] = [
    `traceability: ${b.manifest.project.name} — ` +
      `${b.requirements.length} requirement(s), ${b.tasks.length} task(s)`,
    `edges: req-task ${count('req-task')}, task-test ${count('task-test')}, ` +
      `dec-task ${count('dec-task')}, evidence-req ${count('evidence-req')}`,
  ];

  // Coverage counters are edge-set questions, independent of the line loop:
  // an ORPHAN req with a stray task-test edge (case text mentions its id)
  // still counts as test-linked.
  const total = b.requirements.length;
  const taskLinked = b.requirements.filter((r) =>
    edges.some((e) => e.kind === 'req-task' && e.from === r.id),
  ).length;
  const testLinked = b.requirements.filter((r) =>
    edges.some((e) => e.kind === 'task-test' && e.to === r.id),
  ).length;

  for (const req of b.requirements) {
    const tasks = edges
      .filter((e) => e.kind === 'req-task' && e.from === req.id)
      .map((e) => e.to);
    if (tasks.length === 0) {
      lines.push(`${req.id}: ORPHAN (no task references this requirement)`);
      continue;
    }
    const parts = tasks.map((t) =>
      hasTestLink(t, req.id) ? `${t} ✓test` : `${t} ✗no-test-link`,
    );
    lines.push(`${req.id}: ${tasks.length} task(s) [${parts.join(', ')}]`);
  }

  lines.push(
    `coverage: ${taskLinked}/${total} requirements task-linked; ` +
      `${testLinked}/${total} test-linked`,
  );
  return lines.join('\n');
}
