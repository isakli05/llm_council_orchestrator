import type { LintRule } from '../engine';
import type { LintFinding } from '../types';

/**
 * L12_SCOPE_OVERLAP (ERROR — isolation is execution safety): two tasks with
 * overlapping permitted_scope globs and no dependency edge between them can
 * mutate the same files concurrently. One finding per pair, path 'A,B'.
 */
export const rule: LintRule = {
  id: 'L12_SCOPE_OVERLAP',
  check(b) {
    const tasks = [...b.tasks].sort((a, z) => a.task_id.localeCompare(z.task_id));
    const findings: LintFinding[] = [];

    for (let i = 0; i < tasks.length; i++) {
      for (let j = i + 1; j < tasks.length; j++) {
        const a = tasks[i];
        const z = tasks[j];
        const chained =
          a.depends_on.includes(z.task_id) || z.depends_on.includes(a.task_id);
        if (chained) continue;

        const clash = firstOverlap(a.permitted_scope, z.permitted_scope);
        if (!clash) continue;

        findings.push({
          rule: 'L12_SCOPE_OVERLAP',
          severity: 'error',
          path: `${a.task_id},${z.task_id}`,
          message:
            `permitted scopes overlap with no dependency edge: '${clash[0]}' ` +
            `(${a.task_id}) vs '${clash[1]}' (${z.task_id})`,
        });
      }
    }
    return findings;
  },
};

/** Segment-wise prefix logic on normalized globs — no glob engine. */
function firstOverlap(globsA: string[], globsZ: string[]): [string, string] | null {
  for (const ga of globsA) {
    for (const gz of globsZ) if (globsOverlap(ga, gz)) return [ga, gz];
  }
  return null;
}

/**
 * Overlap = segments agree up to the first difference, where at least one
 * side is a wildcard ('*'), or one glob is a segment-prefix of the other:
 * 'src/auth/**' vs 'src/auth/**' and 'src/**' vs 'src/a.ts' overlap;
 * 'src/auth/**' vs 'src/session/**' does not.
 */
function globsOverlap(a: string, z: string): boolean {
  const sa = a.replace(/\\/g, '/').split('/');
  const sz = z.replace(/\\/g, '/').split('/');
  for (let i = 0; i < Math.min(sa.length, sz.length); i++) {
    if (sa[i] === sz[i]) continue;
    return sa[i].includes('*') || sz[i].includes('*');
  }
  return true; // one glob is a segment-prefix of the other
}
