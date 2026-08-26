import { loadBundleAtLevel, lintRefusal } from '../../compiler/validation';
import type { SpecBundle, TaskContract } from '../../schemas';

export interface PlanResult {
  /** 0 plan produced, 1 cyclic dependencies, 2 compile/schema/lint rejection. */
  code: number;
  output: string;
}

export interface PlanOptions {
  /** true -> machine-readable {order, tasks} JSON, exactly, nothing else. */
  json: boolean;
}

/** The per-task object of the --json surface (exactly five fields). */
interface PlanTask {
  title: string;
  complexity: TaskContract['complexity'];
  depends_on: string[];
  verification: Array<{ command: string; expect: string }>;
  permitted_scope: string[];
}

interface TopoResult {
  /** Task ids in level order; within a level, lexicographic by task_id. */
  order: string[];
  /** Level-0 ids: tasks with no dependencies — runnable immediately. */
  level0: string[];
  /** Unresolvable ids after Kahn (cycle members and their dependents), sorted. */
  cycle: string[];
}

/**
 * Topological execution plan for a spec directory (Kahn's algorithm).
 *
 * Pure core — no console, no clock, no process.exit.
 *
 * VALIDATION LEVEL (BACK-006): plan requires a lint-clean bundle — referential
 * closure included. Consequences (BACK-003):
 *   - an unknown `depends_on` id (dangling dependency) is a BLOCKING error:
 *     exit 2 with the unknown id named in the structured refusal, in human
 *     AND json mode. The old behavior — a human-mode WARNING that JSON plans
 *     silently dropped while scheduling the task ready-now — is gone: a
 *     machine plan must never treat a missing prerequisite as satisfied.
 *   - duplicate task ids never get this far (compile rejects them), so the
 *     id-keyed `tasks` map of the JSON surface can never lose a task.
 *
 * Ordering of verdicts: a dependency cycle (itself an L04 lint error) is
 * reported FIRST, in plan's own words (exit 1, members listed) — the
 * plan-specific "cannot order" verdict — before the generic lint refusal;
 * every other lint error refuses with exit 2 and the actionable lint hint.
 *
 * Determinism: each Kahn level is emitted sorted lexicographically by
 * task_id, which totally determines the output for a given bundle.
 *
 * Human output contract (json:false):
 *   plan: pet-clinic — 3 task(s) in dependency order
 *   1. TASK-0001 [s] deps: none | verify: cmd (expect) | scope: src/**
 *   ...
 *   ready-now: TASK-0001
 *
 * JSON output contract (json:true): the output string is EXACTLY
 * JSON.stringify({order, tasks}) — parseable as-is. A refused bundle (code 2)
 * emits the refusal text instead — machines check the exit code and never
 * parse a lossy half-plan.
 */
export async function cmdPlan(dir: string, opts: PlanOptions): Promise<PlanResult> {
  // Load at 'compile' (shape + unique task ids) and enforce lint-clean HERE so
  // the cycle verdict — plan's own "cannot order" report — comes before the
  // generic lint refusal (a cycle is also an L04 error; the specialized
  // verdict is the more actionable one).
  const loaded = await loadBundleAtLevel(dir, 'compile');
  if (!loaded.ok) {
    return { code: loaded.code, output: loaded.output };
  }
  const bundle = loaded.bundle;

  const topo = topoSort(bundle.tasks);
  if (topo.cycle.length > 0) {
    return {
      code: 1,
      output: [
        `plan FAILED: ${topo.cycle.length} task(s) stuck in cyclic dependencies:`,
        ...topo.cycle.map((id) => `  ${id}`),
      ].join('\n'),
    };
  }

  if (loaded.lint.errors.length > 0) {
    return { code: 2, output: lintRefusal(loaded.lint, dir) };
  }

  return {
    code: 0,
    output: opts.json ? renderJson(bundle, topo.order) : renderHuman(bundle, topo),
  };
}

/**
 * Level-wise Kahn: every pass collects all tasks whose dependencies are all
 * resolved, sorts that level lexicographically, and appends it. Whatever
 * remains when no pass can progress is unreachable through a cycle — exactly
 * the unresolvable set. (Dependencies are guaranteed to exist by the
 * lint-clean gate — closure L13 rejects an unknown depends_on id before this
 * function runs; the `ids.has` filter below is pure defense for direct
 * callers.)
 */
function topoSort(tasks: TaskContract[]): TopoResult {
  const ids = new Set(tasks.map((t) => t.task_id));
  const resolved = new Set<string>();
  const order: string[] = [];
  let level0: string[] = [];

  for (let level = 0; resolved.size < tasks.length; level++) {
    const ready = tasks
      .filter((t) => !resolved.has(t.task_id))
      .filter((t) => t.depends_on.every((d) => !ids.has(d) || resolved.has(d)))
      .map((t) => t.task_id)
      .sort();
    if (ready.length === 0) break;
    if (level === 0) level0 = ready;
    order.push(...ready);
    for (const id of ready) resolved.add(id);
  }

  const cycle = tasks
    .filter((t) => !resolved.has(t.task_id))
    .map((t) => t.task_id)
    .sort();
  return { order, level0, cycle };
}

function renderHuman(bundle: SpecBundle, topo: TopoResult): string {
  const byId = new Map(bundle.tasks.map((t) => [t.task_id, t] as const));
  const lines: string[] = [
    `plan: ${bundle.manifest.project.name} — ${bundle.tasks.length} task(s) in dependency order`,
  ];

  topo.order.forEach((id, i) => {
    const task = byId.get(id);
    if (!task) return; // unreachable: order ids come from the task list itself
    const deps = task.depends_on.length > 0 ? task.depends_on.join(', ') : 'none';
    const verify = task.verification.map((v) => `${v.command} (${v.expect})`).join('; ');
    const scope = task.permitted_scope.join('; ');
    lines.push(
      `${i + 1}. ${task.task_id} [${task.complexity}] deps: ${deps} | verify: ${verify} | scope: ${scope}`,
    );
  });

  lines.push(`ready-now: ${topo.level0.join(', ')}`);
  return lines.join('\n');
}

function renderJson(bundle: SpecBundle, order: string[]): string {
  const tasks: Record<string, PlanTask> = {};
  for (const t of bundle.tasks) {
    tasks[t.task_id] = {
      title: t.title,
      complexity: t.complexity,
      depends_on: [...t.depends_on],
      verification: t.verification.map((v) => ({ command: v.command, expect: v.expect })),
      permitted_scope: [...t.permitted_scope],
    };
  }
  // Field order is fixed by construction, so the string is deterministic.
  return JSON.stringify({ order, tasks });
}
