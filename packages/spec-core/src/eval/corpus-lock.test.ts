import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  canonicalJson,
  computeCorpusHash,
  loadCorpusLock,
  verifyCorpusLock,
  regenerateCorpusLock,
  readRubricDigests,
  frozenThresholds,
  CORPUS_LOCK_VERSION,
  RUBRIC_FILES,
} from './corpus-lock';
import { EVAL_TASKS } from './tasks';
import { G1_REQUIRED_TOTAL, G4_COST_MULTIPLIER } from './gate';

/**
 * PART 2 of RESIDUAL PROD-003: the corpus + thresholds are FROZEN by a
 * committed hash lock before any new live evidence is collected. These tests
 * pin the mechanism: canonical serialization, the committed lock matching the
 * current corpus, LOUD failure on tampering (corpus edit or lock edit), and
 * the append-only regeneration history.
 */

const LOCK_PATH = join(__dirname, 'corpus-lock.json');

describe('canonicalJson — stable serialization', () => {
  it('sorts object keys recursively and emits no whitespace', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, 1], c: 'x' } })).toBe('{"a":{"c":"x","d":[2,1]},"b":1}');
  });

  it('is key-order-insensitive for the same data (array order stays significant — corpus order is part of the hash)', () => {
    const a = { intent: 'x', assertions: [{ type: 'HAS_REQUIREMENTS', min: 3 }, { type: 'BLOCKED' }] };
    const b = { assertions: [{ min: 3, type: 'HAS_REQUIREMENTS' }, { type: 'BLOCKED' }], intent: 'x' };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    // but a reordered corpus is a different corpus
    const c = { assertions: [{ type: 'BLOCKED' }, { min: 3, type: 'HAS_REQUIREMENTS' }], intent: 'x' };
    expect(canonicalJson(c)).not.toBe(canonicalJson(a));
  });

  it('every corpus task serializes without NaN/undefined noise', () => {
    expect(() => JSON.parse(canonicalJson(EVAL_TASKS))).not.toThrow();
  });
});

describe('the committed lock', () => {
  it('exists, matches the current corpus + thresholds, and verifies cleanly', () => {
    const lock = loadCorpusLock(LOCK_PATH);
    expect(lock.version).toBe(CORPUS_LOCK_VERSION);
    expect(lock.history.length).toBeGreaterThanOrEqual(1);
    // the newest history entry is the enforced one
    const newest = lock.history[lock.history.length - 1]!;
    expect(newest.hash).toBe(computeCorpusHash());
    expect(newest.frozen_at).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(() => verifyCorpusLock(LOCK_PATH)).not.toThrow();
  });

  it('the frozen thresholds include the gate constants (G1 denominator, G4 cost multiplier)', () => {
    const lock = loadCorpusLock(LOCK_PATH);
    expect(lock.thresholds.g1_required_total).toBe(G1_REQUIRED_TOTAL);
    expect(lock.thresholds.g4_cost_multiplier).toBe(G4_COST_MULTIPLIER);
  });

  it('the hash covers the constraint declarations — a tampered corpus fails LOUDLY with an actionable message', () => {
    const original = EVAL_TASKS[0]!;
    const tampered = structuredClone(original);
    // the classic post-result edit: relax one constraint's numeric bound after seeing results
    const trace = tampered.assertions.find((a) => a.type === 'CONSTRAINT_TRACE') as {
      constraints: { id: string; terms: string[]; numeric?: { operator: string; value: number } }[];
    };
    trace.constraints[trace.constraints.length - 1]!.numeric = { operator: '<=', value: 999 };
    const wrongHash = computeCorpusHash([tampered, ...EVAL_TASKS.slice(1)], {
      g1_required_total: G1_REQUIRED_TOTAL,
      g4_cost_multiplier: G4_COST_MULTIPLIER,
    });
    expect(wrongHash).not.toBe(computeCorpusHash());

    // and the LIVE tamper: mutate the imported corpus in place, verify against
    // the real lock file, expect the loud failure, then restore
    try {
      EVAL_TASKS[0] = tampered;
      expect(() => verifyCorpusLock(LOCK_PATH)).toThrow(/CORPUS LOCK MISMATCH/);
      expect(() => verifyCorpusLock(LOCK_PATH)).toThrow(/frozen/i);
    } finally {
      EVAL_TASKS[0] = original;
    }
    expect(() => verifyCorpusLock(LOCK_PATH)).not.toThrow();
  });

  it('a tampered intent text also changes the hash (exam questions, not just constraints)', () => {
    const tampered = structuredClone(EVAL_TASKS[0]!);
    tampered.intent += ' Ek cümle.';
    const wrongHash = computeCorpusHash([tampered, ...EVAL_TASKS.slice(1)], {
      g1_required_total: G1_REQUIRED_TOTAL,
      g4_cost_multiplier: G4_COST_MULTIPLIER,
    });
    expect(wrongHash).not.toBe(computeCorpusHash());
  });

  it('a tampered LOCK FILE (rewritten hash) fails loudly against the real corpus', () => {
    const lock = loadCorpusLock(LOCK_PATH);
    lock.history[lock.history.length - 1]!.hash = 'sha256:' + 'f'.repeat(64);
    expect(() => verifyCorpusLock(LOCK_PATH, { lock })).toThrow(/CORPUS LOCK MISMATCH/);
    expect(() => verifyCorpusLock(LOCK_PATH, { lock })).toThrow(/regenerat/i);
  });

  it('the eval ENTRYPOINTS abort loudly on a tampered corpus (the wiring, not just the helper)', async () => {
    const { runMockEval } = await import('./report');
    const original = EVAL_TASKS[5]!; // ET-06: five declared constraints
    const tampered = structuredClone(original);
    const trace = tampered.assertions.find((a) => a.type === 'CONSTRAINT_TRACE') as {
      constraints: unknown[];
    };
    trace.constraints.pop(); // quietly drop one frozen constraint post-freeze
    try {
      EVAL_TASKS[5] = tampered;
      await expect(runMockEval({ repeats: 1 })).rejects.toThrow(/CORPUS LOCK MISMATCH/);
    } finally {
      EVAL_TASKS[5] = original;
    }
    // restored: the eval runs again
    await expect(runMockEval({ repeats: 1 })).resolves.toBeTruthy();
  });

  // I-1 (2026-08-27 review): the lock's scope must match the freeze claim —
  // the RUBRIC TRIPLE (prompts.ts + constraints.ts + score.ts file bytes) is
  // inside the hash, and the lock JSON names the exact hashed-file list.
  it('the committed lock records the exact hashed rubric-file list (machine-visible scope)', () => {
    const lock = loadCorpusLock(LOCK_PATH);
    expect(lock.hashed_rubric_files).toEqual([...RUBRIC_FILES]);
  });

  it('readRubricDigests digests the real working-tree bytes of every rubric file', () => {
    const digests = readRubricDigests();
    expect(Object.keys(digests).sort()).toEqual([...RUBRIC_FILES].sort());
    for (const file of RUBRIC_FILES) {
      expect(digests[file], `${file} must digest to sha256:<64 hex>`).toMatch(/^sha256:[0-9a-f]{64}$/);
    }
    // byte-sensitivity: any changed byte of a rubric file changes its digest,
    // and a changed digest moves the corpus hash
    const tamperedBytes = { ...digests, [RUBRIC_FILES[0]]: digests[RUBRIC_FILES[1]]! };
    expect(computeCorpusHash(EVAL_TASKS, frozenThresholds(), tamperedBytes)).not.toBe(
      computeCorpusHash(EVAL_TASKS, frozenThresholds(), digests),
    );
  });

  it('tampering prompts.ts (digest swapped) fails the lock LOUDLY — prompts are inside the freeze', () => {
    const digests = readRubricDigests();
    const tampered = { ...digests, 'src/eval/prompts.ts': 'sha256:' + '0'.repeat(64) };
    const tamperedHash = computeCorpusHash(EVAL_TASKS, frozenThresholds(), tampered);
    expect(() => verifyCorpusLock(LOCK_PATH, { corpusHash: tamperedHash })).toThrow(
      /CORPUS LOCK MISMATCH/,
    );
  });

  it('tampering constraints.ts (digest swapped) fails the lock LOUDLY — the checker is inside the freeze', () => {
    const digests = readRubricDigests();
    const tampered = { ...digests, 'src/eval/constraints.ts': 'sha256:' + '0'.repeat(64) };
    const tamperedHash = computeCorpusHash(EVAL_TASKS, frozenThresholds(), tampered);
    expect(() => verifyCorpusLock(LOCK_PATH, { corpusHash: tamperedHash })).toThrow(
      /CORPUS LOCK MISMATCH/,
    );
  });

  it('tampering score.ts (digest swapped) fails the lock LOUDLY — scoring semantics are inside the freeze', () => {
    const digests = readRubricDigests();
    const tampered = { ...digests, 'src/eval/score.ts': 'sha256:' + '0'.repeat(64) };
    const tamperedHash = computeCorpusHash(EVAL_TASKS, frozenThresholds(), tampered);
    expect(() => verifyCorpusLock(LOCK_PATH, { corpusHash: tamperedHash })).toThrow(
      /CORPUS LOCK MISMATCH/,
    );
  });
});

describe('regeneration — append-only history', () => {
  it('appends a new dated entry and keeps every earlier entry byte-identical', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lco-corpus-lock-'));
    try {
      const path = join(dir, 'corpus-lock.json');
      writeFileSync(path, readFileSync(LOCK_PATH, 'utf8'), 'utf8');
      const before = loadCorpusLock(path);

      const regenerated = regenerateCorpusLock(path, {
        note: 'test regeneration',
        nowIso: '2027-01-01T00:00:00Z',
      });

      expect(regenerated.history).toHaveLength(before.history.length + 1);
      // earlier entries untouched (append-only)
      expect(regenerated.history.slice(0, before.history.length)).toEqual(before.history);
      const newest = regenerated.history[regenerated.history.length - 1]!;
      expect(newest.frozen_at).toBe('2027-01-01');
      expect(newest.note).toBe('test regeneration');
      // M-3: the appended entry names the hash it supersedes (tamper-evidence
      // is git history + this in-lock chain, not a MAC)
      expect(newest.previous_hash).toBe(before.history[before.history.length - 1]!.hash);
      // and the regenerated lock verifies against the real corpus
      expect(() => verifyCorpusLock(path, { lock: regenerated })).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // M-2 (2026-08-27 review): after a threshold change, the regenerated lock's
  // thresholds field must state the CURRENT thresholds — a stale field would
  // contradict the very hash recorded next to it.
  it('regeneration writes the CURRENT thresholds, never the previous lock\'s stale ones', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lco-corpus-lock-'));
    try {
      const path = join(dir, 'corpus-lock.json');
      const stale = loadCorpusLock(LOCK_PATH);
      stale.thresholds = { g1_required_total: 99, g4_cost_multiplier: 99 }; // a lock frozen under old thresholds
      writeFileSync(path, JSON.stringify(stale), 'utf8');

      const regenerated = regenerateCorpusLock(path, {
        note: 'threshold change regeneration',
        nowIso: '2027-01-01T00:00:00Z',
      });

      expect(regenerated.thresholds).toEqual(frozenThresholds());
      expect(regenerated.thresholds.g1_required_total).toBe(G1_REQUIRED_TOTAL);
      expect(regenerated.thresholds.g4_cost_multiplier).toBe(G4_COST_MULTIPLIER);
      expect(() => verifyCorpusLock(path, { lock: regenerated })).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('the committed lock history is append-only: the original pre-registration entry survives verbatim', () => {
    const lock = loadCorpusLock(LOCK_PATH);
    // the FIRST freeze (2026-08-27 pre-registration, {model,tasks,thresholds}
    // scope) stays in history byte-identical after the I-1 scope extension
    expect(lock.history.length).toBeGreaterThanOrEqual(2);
    expect(lock.history[0]!.frozen_at).toBe('2026-08-27');
    expect(lock.history[0]!.hash).toBe(
      'sha256:e9c5e3b0f50953387df13ddad88907216ff99f5f230411233525e95d8b7fb523',
    );
    expect(lock.history[0]!.note).toMatch(/pre-?registration/i);
    // the enforced (newest) entry records the rubric-scope extension and the
    // hash it supersedes
    const newest = lock.history[lock.history.length - 1]!;
    expect(newest.note).toMatch(/prompts\+checker|rubric/i);
    expect(newest.previous_hash).toBe(lock.history[lock.history.length - 2]!.hash);
    // the enforced lock has no duplicate hashes
    expect(new Set(lock.history.map((h) => h.hash)).size).toBe(lock.history.length);
  });

  it('the committed lock is never regenerated by these tests (no accidental history growth)', () => {
    const lock = loadCorpusLock(LOCK_PATH);
    // pinned by the append-only test above: exactly the original freeze plus
    // the I-1 scope extension, both dated 2026-08-27, before any live run
    expect(lock.history).toHaveLength(2);
    expect(lock.history.every((h) => h.frozen_at === '2026-08-27')).toBe(true);
  });
});
