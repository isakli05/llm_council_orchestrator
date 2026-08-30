import { describe, it, expect } from 'vitest';
import { EVAL_TASKS } from './index';
import type { EvalTask } from './index';

const EXPECTED_IDS = Array.from({ length: 20 }, (_, i) => `ET-${String(i + 1).padStart(2, '0')}`);

function countBy(tasks: EvalTask[], pick: (t: EvalTask) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of tasks) {
    const key = pick(t);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function sentenceCount(intent: string): number {
  return intent
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0).length;
}

function typesOf(t: EvalTask): string[] {
  return t.assertions.map((a) => a.type);
}

describe('EVAL_TASKS shape', () => {
  it('contains exactly 20 tasks', () => {
    expect(EVAL_TASKS).toHaveLength(20);
  });

  it('has unique ids covering ET-01..ET-20 in order', () => {
    expect(EVAL_TASKS.map((t) => t.id)).toEqual(EXPECTED_IDS);
  });
});

describe('EVAL_TASKS kind/profile matrix', () => {
  it('splits 12 greenfield / 5 ambiguous / 3 conflicting', () => {
    expect(countBy(EVAL_TASKS, (t) => t.kind)).toEqual(
      new Map([
        ['greenfield', 12],
        ['ambiguous', 5],
        ['conflicting', 3],
      ]),
    );
  });

  it('assigns kinds to the planned id ranges', () => {
    for (const t of EVAL_TASKS) {
      const n = Number(t.id.slice(3));
      if (n <= 12) expect(t.kind).toBe('greenfield');
      else if (n <= 17) expect(t.kind).toBe('ambiguous');
      else expect(t.kind).toBe('conflicting');
    }
  });

  it('splits greenfield profiles 6 p-mini / 6 p-standard', () => {
    const greenfield = EVAL_TASKS.filter((t) => t.kind === 'greenfield');
    expect(greenfield).toHaveLength(12);
    expect(countBy(greenfield, (t) => t.profile)).toEqual(
      new Map([
        ['p-mini', 6],
        ['p-standard', 6],
      ]),
    );
  });

  it('uses only the two known profiles', () => {
    for (const t of EVAL_TASKS) {
      expect(['p-mini', 'p-standard']).toContain(t.profile);
    }
  });
});

describe('EVAL_TASKS blocking semantics', () => {
  it('sets must_be_blocked true exactly for ambiguous|conflicting', () => {
    for (const t of EVAL_TASKS) {
      expect(t.must_be_blocked).toBe(t.kind === 'ambiguous' || t.kind === 'conflicting');
    }
  });
});

describe('EVAL_TASKS assertions', () => {
  it('gives every task at least 2 assertions', () => {
    for (const t of EVAL_TASKS) {
      expect(t.assertions.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('never repeats an assertion type within a task', () => {
    for (const t of EVAL_TASKS) {
      const types = typesOf(t);
      expect(new Set(types).size).toBe(types.length);
    }
  });

  it('greenfield tasks assert HAS_REQUIREMENTS + TASKS_ACYCLIC + TASKS_HAVE_VERIFICATION', () => {
    for (const t of EVAL_TASKS.filter((x) => x.kind === 'greenfield')) {
      expect(typesOf(t)).toEqual(expect.arrayContaining([
        'HAS_REQUIREMENTS',
        'TASKS_ACYCLIC',
        'TASKS_HAVE_VERIFICATION',
      ]));
    }
  });

  it('bounds HAS_REQUIREMENTS min to 2..4 on greenfield tasks, exactly once each', () => {
    for (const t of EVAL_TASKS.filter((x) => x.kind === 'greenfield')) {
      const reqs = t.assertions.filter((a) => a.type === 'HAS_REQUIREMENTS');
      expect(reqs).toHaveLength(1);
      const min = (reqs[0] as { min: number }).min;
      expect(min).toBeGreaterThanOrEqual(2);
      expect(min).toBeLessThanOrEqual(4);
      expect(Number.isInteger(min)).toBe(true);
    }
  });

  it('demands more requirements (min 4) for p-standard greenfield than p-mini (min 3)', () => {
    const minOf = (t: EvalTask) => (t.assertions.find((a) => a.type === 'HAS_REQUIREMENTS') as { min: number }).min;
    for (const t of EVAL_TASKS.filter((x) => x.kind === 'greenfield' && x.profile === 'p-standard')) {
      expect(minOf(t)).toBe(4);
    }
    for (const t of EVAL_TASKS.filter((x) => x.kind === 'greenfield' && x.profile === 'p-mini')) {
      expect(minOf(t)).toBe(3);
    }
  });

  it('p-standard greenfield tasks also assert TRACE_REQ_TASK_COVERED', () => {
    for (const t of EVAL_TASKS.filter((x) => x.kind === 'greenfield' && x.profile === 'p-standard')) {
      expect(typesOf(t)).toContain('TRACE_REQ_TASK_COVERED');
    }
  });

  it('greenfield tasks never assert BLOCKED or STATE_IS_DRAFT_OR_BLOCKED', () => {
    for (const t of EVAL_TASKS.filter((x) => x.kind === 'greenfield')) {
      expect(typesOf(t)).not.toContain('BLOCKED');
      expect(typesOf(t)).not.toContain('STATE_IS_DRAFT_OR_BLOCKED');
    }
  });

  it('blocked tasks assert BLOCKED + STATE_IS_DRAFT_OR_BLOCKED', () => {
    const blocked = EVAL_TASKS.filter((t) => t.must_be_blocked);
    expect(blocked).toHaveLength(8);
    for (const t of blocked) {
      expect(typesOf(t)).toContain('BLOCKED');
      expect(typesOf(t)).toContain('STATE_IS_DRAFT_OR_BLOCKED');
    }
  });
});

describe('EVAL_TASKS intent quality', () => {
  // 2026-08-28 corpus substitution: the greenfield intents are owner-provided
  // anonymized workload paraphrases kept verbatim (substance is frozen —
  // padding sentences or digits into them would alter it), so the prose-style
  // floors below are scoped accordingly: the synthetic blocked tasks keep the
  // original 200-char / 3-sentence shape; the greenfield paraphrases keep a
  // non-triviality floor (>= 100 chars, single requirement statement is
  // legitimate) and numeric concreteness is demanded exactly where the task
  // DECLARES numeric constraints (pinned per-value in constraint-trace.test.ts).

  it('gives every intent at least 200 characters (blocked) / 100 characters (greenfield paraphrases)', () => {
    for (const t of EVAL_TASKS) {
      const floor = t.must_be_blocked ? 200 : 100;
      expect(t.intent.length, `${t.id} intent too short`).toBeGreaterThanOrEqual(floor);
    }
  });

  it('keeps all 20 intents unique', () => {
    expect(new Set(EVAL_TASKS.map((t) => t.intent)).size).toBe(20);
  });

  it('writes each intent as 1..8 sentences (blocked tasks stay 3..8; greenfield paraphrases may be single statements)', () => {
    for (const t of EVAL_TASKS) {
      const n = sentenceCount(t.intent);
      const floor = t.must_be_blocked ? 3 : 1;
      expect(n, `${t.id} has ${n} sentences`).toBeGreaterThanOrEqual(floor);
      expect(n).toBeLessThanOrEqual(8);
    }
  });

  it('embeds digits in every greenfield intent that DECLARES numeric constraints', () => {
    for (const t of EVAL_TASKS.filter((x) => x.kind === 'greenfield')) {
      const declaresNumeric = t.assertions.some(
        (a) => a.type === 'CONSTRAINT_TRACE' && a.constraints.some((c) => c.numeric),
      );
      if (!declaresNumeric) continue;
      expect(/\d/.test(t.intent), `${t.id} declares numeric constraints but the intent carries no digit`).toBe(true);
    }
  });
});
