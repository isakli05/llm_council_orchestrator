import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EVAL_TASKS } from './tasks';
import {
  EMITTED_SCHEMA,
  parseEmittedOutcome,
  loadRunDir,
  aggregateEmitted,
  renderAggregation,
} from './aggregate';
import type { EmittedOutcome } from './aggregate';
import type { RunScore } from './score';

/**
 * LIVE-EXPERIMENT AGGREGATOR tests: synthetic emitted JSON only — no network,
 * no pipelines, no clock. The emitted shape is exactly what
 * src/eval/live-experiment.ts writes (see live-experiment.test.ts for the
 * end-to-end mock run that produces real ones).
 */

const GREENFIELD = EVAL_TASKS.filter((t) => !t.must_be_blocked).map((t) => t.id) as string[];
const BLOCKED = EVAL_TASKS.filter((t) => t.must_be_blocked).map((t) => t.id) as string[];

function baseScore(taskId: string, variant: 'single' | 'council', repeat: number): RunScore {
  const t = EVAL_TASKS.find((x) => x.id === taskId)!;
  const blockedRun = t.must_be_blocked;
  return {
    taskId,
    variant,
    assertionsPassed: t.assertions.length,
    assertionsTotal: t.assertions.length,
    repeat,
    structuralPassed: true,
    // blocked tasks "pass intent" by blocking correctly; greenfield default pass
    intentPassed: true,
    constraintFailures: [],
    advisoryInventions: [],
    blockedCorrectly: blockedRun,
    councilDegraded: false,
    inTokens: variant === 'single' ? 100 : 300,
    outTokens: variant === 'single' ? 50 : 150,
    calls: variant === 'single' ? 1 : 3,
    attempts: variant === 'single' ? 1 : 3,
    usageKnown: true,
  };
}

interface EmitOverrides {
  intentPassed?: boolean;
  blockedCorrectly?: boolean;
  usageKnown?: boolean;
  forbidden?: boolean;
  inTokens?: number;
}

function emittedRecord(
  taskId: string,
  variant: 'single' | 'council',
  repeat: number,
  o: EmitOverrides = {},
): EmittedOutcome {
  const t = EVAL_TASKS.find((x) => x.id === taskId)!;
  const score: RunScore = {
    ...baseScore(taskId, variant, repeat),
    ...(o.intentPassed !== undefined ? { intentPassed: o.intentPassed } : {}),
    ...(o.blockedCorrectly !== undefined ? { blockedCorrectly: o.blockedCorrectly } : {}),
    ...(o.usageKnown !== undefined ? { usageKnown: o.usageKnown } : {}),
    ...(o.inTokens !== undefined ? { inTokens: o.inTokens } : {}),
    ...(o.forbidden
      ? {
          constraintFailures: [
            { constraint: 'FORBIDDEN', code: 'FORBIDDEN_PRESENT', detail: 'forbidden invention present' },
          ],
        }
      : {}),
  };
  return {
    schema: EMITTED_SCHEMA,
    taskId,
    variant,
    repeat,
    runIndex: 1,
    task: {
      id: taskId,
      kind: t.kind,
      profile: t.profile,
      must_be_blocked: t.must_be_blocked,
    },
    outcome: t.must_be_blocked
      ? { kind: 'blocked', reasons: ['L08_UNRESOLVED_LEAK [DEC-0001]: x'] }
      : { kind: 'spec', bundle: { synthetic: true } },
    score,
    usage: {
      in: score.inTokens,
      out: score.outTokens,
      calls: score.calls,
      attempts: score.attempts,
      promptBytes: 1000,
      callsWithoutUsage: 0,
      usageKnown: score.usageKnown,
    },
  };
}

/** Write a synthetic run directory; `mutate` may drop/edit records before writing. */
function writeRunDir(
  name: string,
  o: {
    repeat?: number;
    singleFailsGreenfield?: string[];
    mutate?: (records: EmittedOutcome[]) => void | EmittedOutcome[];
  } = {},
): string {
  const dir = join(tmpdir(), `lco-agg-${name}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  const repeat = o.repeat ?? 1;
  let records: EmittedOutcome[] = [];
  for (const taskId of GREENFIELD) {
    const fails = (o.singleFailsGreenfield ?? []).includes(taskId);
    records.push(emittedRecord(taskId, 'single', repeat, fails ? { intentPassed: false } : {}));
    records.push(emittedRecord(taskId, 'council', repeat));
  }
  for (const taskId of BLOCKED) {
    records.push(emittedRecord(taskId, 'single', repeat));
    records.push(emittedRecord(taskId, 'council', repeat));
  }
  const mutated = o.mutate?.(records);
  if (mutated) records = mutated;
  for (const r of records) {
    writeFileSync(join(dir, `${r.taskId}--${r.variant}--rep${r.repeat}.json`), JSON.stringify(r));
  }
  return dir;
}

function clean(...dirs: string[]): void {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
}

describe('parseEmittedOutcome / loadRunDir — shape and error pins', () => {
  it('round-trips a well-formed record and stamps the schema marker', () => {
    const r = emittedRecord('ET-01', 'single', 1);
    const parsed = parseEmittedOutcome('x.json', JSON.stringify(r));
    expect(parsed.schema).toBe(EMITTED_SCHEMA);
    expect(parsed.score.intentPassed).toBe(true);
  });

  it('rejects invalid JSON, wrong schema, and duplicates loudly (naming the source)', () => {
    expect(() => parseEmittedOutcome('bad.json', '{nope')).toThrow(/AGGREGATE INVALID JSON: bad\.json/);
    const noMarker = JSON.stringify({ ...emittedRecord('ET-01', 'single', 1), schema: 'other/2' });
    expect(() => parseEmittedOutcome('bad.json', noMarker)).toThrow(/AGGREGATE INVALID RECORD: bad\.json/);

    const dir = writeRunDir('dup');
    try {
      const first = JSON.stringify(emittedRecord('ET-01', 'single', 1));
      writeFileSync(join(dir, 'zz-duplicate.json'), first);
      expect(() => loadRunDir(dir)).toThrow(/AGGREGATE DUPLICATE UNIT/);
    } finally {
      clean(dir);
    }
  });

  it('a missing or empty run directory is a loud error, not silence', () => {
    expect(() => loadRunDir(join(tmpdir(), 'lco-agg-nonexistent-xyz'))).toThrow(/AGGREGATE MISSING RUN DIR/);
    const dir = join(tmpdir(), `lco-agg-empty-${Math.random().toString(36).slice(2, 8)}`);
    mkdirSync(dir);
    try {
      expect(() => loadRunDir(dir)).toThrow(/AGGREGATE EMPTY RUN DIR/);
    } finally {
      clean(dir);
    }
  });
});

describe('aggregateEmitted — repeat re-basing and the pre-registered pairing', () => {
  it('three one-repeat invocations become global repeats 1..3 and pair exactly like pairedOutcomes', () => {
    const dirs = [
      writeRunDir('r1'),
      writeRunDir('r2', { mutate: (rs) => rs.map((r) => ({ ...r, repeat: 1 })) }),
      writeRunDir('r3'),
    ];
    try {
      const a = aggregateEmitted(dirs);
      // 20 tasks x 2 variants x 3 dirs
      expect(a.runs).toHaveLength(120);
      // greenfield pairs: 12 tasks x 3 global repeats
      expect(a.pairs).toHaveLength(36);
      for (const taskId of GREENFIELD) {
        const reps = a.pairs.filter((p) => p.taskId === taskId).map((p) => p.repeat).sort();
        expect(reps, taskId).toEqual([1, 2, 3]);
      }
      // all pairs concordant (synthetic data passes everywhere) → no evidence
      expect(a.signTest.discordant).toBe(0);
      expect(a.signTest.meetsCriterion).toBe(false);
      // blocked-task accounting over ALL 48 blocked runs
      expect(a.mustBlockRuns).toEqual({ total: 48, blockedCorrectly: 48 });
      // cost totals: single 3x(12x100 + 8x100)=6000 in… per dir single in = 20*100
      expect(a.costs.single.inTokens).toBe(20 * 100 * 3);
      expect(a.costs.council.totalTokens).toBe(20 * (300 + 150) * 3);
      expect(a.costRatio).toBeCloseTo(450 / 150, 5);
    } finally {
      clean(...dirs);
    }
  });

  it('a directory that used --repeats 2 contributes two consecutive global repeats (repeat-aware)', () => {
    const dir1 = writeRunDir('multi-a');
    const dir2 = join(tmpdir(), `lco-agg-multi-b-${Math.random().toString(36).slice(2, 8)}`);
    mkdirSync(dir2, { recursive: true });
    for (const rep of [1, 2]) {
      for (const r of [emittedRecord('ET-01', 'single', rep), emittedRecord('ET-01', 'council', rep)]) {
        writeFileSync(join(dir2, `${r.taskId}--${r.variant}--rep${r.repeat}.json`), JSON.stringify(r));
      }
    }
    try {
      const a = aggregateEmitted([dir1, dir2]);
      const et01 = a.pairs.filter((p) => p.taskId === 'ET-01').map((p) => p.repeat).sort();
      expect(et01).toEqual([1, 2, 3]); // dir1 → 1; dir2's rep1/rep2 → 2/3
    } finally {
      clean(dir1, dir2);
    }
  });

  it('pairs (task, repeat) units across variants; an unpaired variant is dropped, never guessed', () => {
    const dirs = [
      writeRunDir('pair-a'),
      writeRunDir('pair-b', {
        mutate: (rs) => rs.filter((r) => !(r.taskId === 'ET-12' && r.variant === 'council')),
      }),
    ];
    try {
      const a = aggregateEmitted(dirs);
      expect(a.pairs).toHaveLength(23); // 12 + 11: ET-12 has no council run at repeat 2
      expect(a.pairs.some((p) => p.taskId === 'ET-12' && p.repeat === 2)).toBe(false);
    } finally {
      clean(...dirs);
    }
  });

  it('the sign-test criterion is MET when >= 10 discordant pairs all go to council (p < 0.05)', () => {
    const failing = GREENFIELD.slice(0, 6); // single fails 6 per dir → 12 discordant over 2 dirs
    const dirs = [writeRunDir('win1', { singleFailsGreenfield: failing }), writeRunDir('win2', { singleFailsGreenfield: failing })];
    try {
      const a = aggregateEmitted(dirs);
      expect(a.signTest.discordant).toBe(12);
      expect(a.signTest.councilWins).toBe(12);
      expect(a.signTest.pOneSidedExact).toBeCloseTo(1 / 4096, 6);
      expect(a.criteria.signTestCriterionMet).toBe(true);
      const text = renderAggregation(a);
      expect(text).toContain('discordant 12 (council wins 12');
      expect(text).toMatch(/criterion \(>= 10 discordant AND p < 0\.05\): MET/);
      expect(text).toContain('ALL CRITERIA: MET');
    } finally {
      clean(...dirs);
    }
  });

  it('fewer than 10 discordant pairs is NOT MET even when every discordant pair favors council', () => {
    const failing = GREENFIELD.slice(0, 3); // 3 per dir → 6 discordant < 10
    const dirs = [writeRunDir('few1', { singleFailsGreenfield: failing }), writeRunDir('few2', { singleFailsGreenfield: failing })];
    try {
      const a = aggregateEmitted(dirs);
      expect(a.signTest.discordant).toBe(6);
      expect(a.signTest.councilWins).toBe(6);
      expect(a.signTest.pOneSidedExact).toBeCloseTo(1 / 64, 6); // would pass on p alone
      expect(a.criteria.signTestCriterionMet).toBe(false); // but 6 < 10 discordants
      expect(renderAggregation(a)).toMatch(/: NOT MET/);
    } finally {
      clean(...dirs);
    }
  });
});

describe('aggregateEmitted — pre-registered criteria toggles', () => {
  it('a single run with unknown usage fails usage completeness AND the cost cap (unknown is not zero)', () => {
    const dirs = [
      writeRunDir('unk1'),
      writeRunDir('unk2', { mutate: (rs) => rs.map((r) => (r.taskId === 'ET-05' && r.variant === 'council' ? { ...r, score: { ...r.score, usageKnown: false } } : r)) }),
    ];
    try {
      const a = aggregateEmitted(dirs);
      expect(a.criteria.usageComplete).toBe(false);
      expect(a.criteria.councilCostWithinCap).toBe(false);
      expect(a.costRatio).toBeNull();
      const text = renderAggregation(a);
      expect(text).toContain('UNKNOWN usage on 1 run(s)');
      expect(text).toContain('not evaluable');
    } finally {
      clean(...dirs);
    }
  });

  it('council cost above 3x single cost fails the cap with the ratio rendered', () => {
    const dirs = [
      writeRunDir('cap1'),
      writeRunDir('cap2', {
        mutate: (rs) => rs.map((r) => (r.variant === 'council' ? { ...r, score: { ...r.score, inTokens: 5000, outTokens: 2000 } } : r)),
      }),
    ];
    try {
      const a = aggregateEmitted(dirs);
      expect(a.criteria.councilCostWithinCap).toBe(false);
      expect(a.costRatio).toBeGreaterThan(3);
      expect(renderAggregation(a)).toMatch(/EXCEEDS/);
    } finally {
      clean(...dirs);
    }
  });

  it('one FORBIDDEN_PRESENT run and one missed block each fail their criterion and are named', () => {
    const dirs = [
      writeRunDir('fb1'),
      writeRunDir('fb2', {
        mutate: (rs) =>
          rs.map((r) => {
            if (r.taskId === 'ET-12' && r.variant === 'single' && !r.task.must_be_blocked) {
              return { ...r, score: { ...r.score, constraintFailures: [{ constraint: 'FORBIDDEN', code: 'FORBIDDEN_PRESENT', detail: 'forbidden invention present' }] } };
            }
            if (r.taskId === 'ET-18' && r.variant === 'council') {
              return { ...r, score: { ...r.score, blockedCorrectly: false, intentPassed: false } };
            }
            return r;
          }),
      }),
    ];
    try {
      const a = aggregateEmitted(dirs);
      expect(a.criteria.zeroForbiddenPresent).toBe(false);
      expect(a.forbiddenPresent).toEqual({ runs: 1, tasks: ['ET-12'] });
      expect(a.criteria.blocking100).toBe(false);
      expect(a.mustBlockRuns.blockedCorrectly).toBe(a.mustBlockRuns.total - 1);
      const text = renderAggregation(a);
      expect(text).toContain('FORBIDDEN_PRESENT): 1 run(s) on ET-12');
      expect(text).toContain('ALL CRITERIA: NOT MET');
    } finally {
      clean(...dirs);
    }
  });

  it('artifacts emitted by a DIFFERENT corpus are refused loudly (pairing reads the current freeze)', () => {
    const dir = writeRunDir('mism', {
      mutate: (rs) => rs.map((r) => (r.taskId === 'ET-01' ? { ...r, task: { ...r.task, kind: 'ambiguous' } } : r)),
    });
    try {
      expect(() => aggregateEmitted([dir])).toThrow(/AGGREGATE CORPUS MISMATCH/);
    } finally {
      clean(dir);
    }
  });

  it('no run dirs is a usage error', () => {
    expect(() => aggregateEmitted([])).toThrow(/AGGREGATE NO RUN DIRS/);
  });
});

describe('renderAggregation — deterministic text', () => {
  it('renders byte-identical output for the same aggregation (no clock, no env)', () => {
    const dirs = [writeRunDir('det1'), writeRunDir('det2')];
    try {
      expect(renderAggregation(aggregateEmitted(dirs))).toBe(
        renderAggregation(aggregateEmitted(dirs)),
      );
    } finally {
      clean(...dirs);
    }
  });
});
