import { compileSpecDir } from '../../compiler/compile';
import type { SpecBundle, TaskContract } from '../../schemas';

export interface PlanResult {
  /** 0 plan produced, 1 cyclic dependencies, 2 compile/schema rejection. */
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
  /** Level-0 ids: tasks with no known dependency — runnable immediately. */
  level0: string[];
  /** Unresolvable ids after Kahn (cycle members and their dependents), sorted. */
  cycle: string[];
}

/**
 * Topological execution plan for a spec directory (Kahn's algorithm).
 *
 * Pure core — no console, no clock, no process.exit. `depends_on` entries
 * that reference no task in the bundle are NOT edges: they only produce
 * WARNING lines (lint owns hard failures; a plan must still be computable),
 * so such references are treated as satisfied and never block. Determinism:
 * each Kahn level is emitted sorted lexicographically by task_id, which
 * totally determines the output for a given bundle.
 *
 * Human output contract (json:false):
 *   WARNING: TASK-0002 depends on unknown TASK-9999      <- only if any
 *   plan: pet-clinic — 3 task(s) in dependency order
 *   1. TASK-0001 [s] deps: none | verify: cmd (expect) | scope: src/**
 *   ...
 *   ready-now: TASK-0001
 *
 * JSON output contract (json:true): the output string is EXACTLY
 * JSON.stringify({order, tasks}) — parseable as-is; warnings are human-only
 * so the machine surface never carries non-JSON lines.
 */
export async function cmdPlan(dir: string, opts: PlanOptions): Promise<PlanResult> {
  const compiled = await compileSpecDir(dir);
  if (!compiled.ok || !compiled.bundle) {
    return {
      code: 2,
      output: [
        `compile FAILED with ${compiled.errors.length} error(s):`,
        ...compiled.errors.map((e) => `  ${e.path}: ${e.message}`),
      ].join('\n'),
    };
  }

  const bundle = compiled.bundle;
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

  return {
    code: 0,
    output: opts.json ? renderJson(bundle, topo.order) : renderHuman(bundle, topo),
  };
}

/**
 * Level-wise Kahn: every pass collects all tasks whose KNOWN dependencies are
 * resolved (unknown depends_on ids are satisfied by definition), sorts that
 * level lexicographically, and appends it. Whatever remains when no pass can
 * progress is unreachable through a cycle — exactly the unresolvable set.
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

/** One WARNING line per unknown depends_on reference, in bundle task order. */
function unknownDepWarnings(tasks: TaskContract[]): string[] {
  const ids = new Set(tasks.map((t) => t.task_id));
  const warnings: string[] = [];
  for (const t of tasks) {
    for (const dep of t.depends_on) {
      if (!ids.has(dep)) warnings.push(`WARNING: ${t.task_id} depends on unknown ${dep}`);
    }
  }
  return warnings;
}

function renderHuman(bundle: SpecBundle, topo: TopoResult): string {
  const byId = new Map(bundle.tasks.map((t) => [t.task_id, t] as const));
  const lines: string[] = [
    ...unknownDepWarnings(bundle.tasks),
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
