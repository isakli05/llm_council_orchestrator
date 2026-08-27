import type { LintRule } from '../types';
import type { LintFinding } from '../types';

/**
 * L06_DUPLICATE_ID: ids must be unique across REQ/DEC/CON/TASK. A repeated
 * literal — within one family or colliding across families sharing a prefix —
 * breaks every id-keyed cross-reference — error with the duplicated id as the
 * path.
 */
export const rule: LintRule = {
  id: 'L06_DUPLICATE_ID',
  check(b) {
    const occurrences: Array<{ id: string; family: string }> = [
      ...b.requirements.map((r) => ({ id: r.id, family: 'requirements' })),
      ...b.decisions.map((d) => ({ id: d.claim_id, family: 'decisions' })),
      ...b.contracts.map((c) => ({ id: c.id, family: 'contracts' })),
      ...b.tasks.map((t) => ({ id: t.task_id, family: 'tasks' })),
    ];

    const byId = new Map<string, string[]>();
    for (const { id, family } of occurrences) {
      byId.set(id, [...(byId.get(id) ?? []), family]);
    }

    const findings: LintFinding[] = [];
    for (const [id, families] of byId) {
      if (families.length < 2) continue;
      findings.push({
        rule: 'L06_DUPLICATE_ID',
        severity: 'error',
        path: id,
        message: `duplicate id '${id}' appears ${families.length} times (${families.join(', ')})`,
      });
    }
    return findings;
  },
};
