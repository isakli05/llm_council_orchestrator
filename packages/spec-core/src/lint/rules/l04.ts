import type { LintRule } from '../types';
import type { LintFinding } from '../types';

/**
 * L04_CYCLIC_TASK_DEPS: a cycle in `depends_on` makes every task in it
 * unschedulable — error with the comma-joined cycle ids as the path.
 * Iterative DFS (explicit stack, WHITE/GRAY/BLACK coloring): no recursion,
 * so no stack-depth risk on deep dependency chains.
 */
export const rule: LintRule = {
  id: 'L04_CYCLIC_TASK_DEPS',
  check(b) {
    const ids = new Set(b.tasks.map((t) => t.task_id));
    const deps = new Map<string, string[]>(
      b.tasks.map((t) => [t.task_id, t.depends_on.filter((d) => ids.has(d))]),
    );
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>(b.tasks.map((t) => [t.task_id, WHITE]));
    const findings: LintFinding[] = [];
    const seen = new Set<string>();

    for (const start of deps.keys()) {
      if (color.get(start) !== WHITE) continue;
      color.set(start, GRAY);
      const stack: Array<{ id: string; next: number }> = [{ id: start, next: 0 }];
      const path: string[] = [start];

      while (stack.length > 0) {
        const top = stack[stack.length - 1];
        const neighbors = deps.get(top.id) ?? [];
        if (top.next < neighbors.length) {
          const n = neighbors[top.next++];
          const nc = color.get(n) ?? BLACK;
          if (nc === GRAY) {
            const cycle = path.slice(path.indexOf(n));
            const key = [...cycle].sort().join(',');
            if (!seen.has(key)) {
              seen.add(key);
              findings.push({
                rule: 'L04_CYCLIC_TASK_DEPS',
                severity: 'error',
                path: cycle.join(','),
                message: `dependency cycle detected: ${[...cycle, cycle[0]].join(' -> ')}`,
              });
            }
          } else if (nc === WHITE) {
            color.set(n, GRAY);
            stack.push({ id: n, next: 0 });
            path.push(n);
          }
        } else {
          color.set(top.id, BLACK);
          stack.pop();
          path.pop();
        }
      }
    }
    return findings;
  },
};
