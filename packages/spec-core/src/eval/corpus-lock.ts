import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { EVAL_TASKS } from './tasks';
import type { EvalTask } from './tasks';
import { G1_REQUIRED_TOTAL, G4_COST_MULTIPLIER } from './gate';

/**
 * CORPUS LOCK (RESIDUAL PROD-003, PART 2): the eval corpus (intents +
 * CONSTRAINT_TRACE declarations), the gate thresholds, and the RUBRIC TRIPLE
 * — the file bytes of src/eval/prompts.ts (the prompts the model is shown),
 * src/eval/constraints.ts (the constraint checker), and src/eval/score.ts
 * (the scoring split) — are FROZEN by a sha256 hash recorded in the committed
 * corpus-lock.json, BEFORE any new live evidence is collected.
 *
 * HASHED SCOPE (I-1, 2026-08-27 review — the mechanism now matches the claim):
 * { model, tasks, thresholds } + sha256 of each rubric file's bytes. The
 * exact hashed-file list is recorded INSIDE the lock JSON
 * (`hashed_rubric_files`) so the scope is machine-visible. Files OUTSIDE the
 * lock (this file, gate.ts, render.ts, report.ts, runner.ts, the CLI) are
 * covered by git review only — a silent post-result change there does NOT
 * trip the run; that is stated in the README and the pre-registration rather
 * than over-claimed.
 *
 * FREEZE RECORD:
 *   - History[0]: frozen 2026-08-27 over {model, tasks, thresholds} only (the
 *     original pre-registration freeze).
 *   - History[1] (enforced): same date, scope EXTENDED to the rubric triple
 *     before ANY live results were viewed under this corpus — legitimate
 *     pre-registration strengthening, recorded as an appended dated entry
 *     with the superseded hash, never as an edit of history[0].
 *   - NO live results have been viewed under this corpus: the constraint-trace
 *     model, the frozen constraints, the rubric triple, and the thresholds
 *     were fixed before any live run was authorized (see
 *     audit-output/eval/LIVE-EVAL-PRE-REGISTRATION.md for the pre-registered
 *     pass criteria; no live run is authorized by this freeze alone).
 *   - Editing the corpus, the thresholds, or any hashed rubric file changes
 *     the computed hash; every eval entrypoint (runEvalAll / runMockEval /
 *     runLiveEval) verifies the lock and FAILS LOUDLY on mismatch, so
 *     post-result edits to the LOCKED files are detectable rather than
 *     silent.
 *   - Tamper-evidence for the lock history itself is git history + the
 *     in-lock `previous_hash` chain — NOT a MAC/signature claim.
 *   - Corpus/threshold/rubric edits therefore REQUIRE regenerating the lock
 *     with a new dated entry: history is APPEND-ONLY (never edit or delete an
 *     existing entry — an edited entry is evidence tampering, and the oldest
 *     entry stays the record of what was frozen first).
 *
 * Determinism: pure function of (tasks, thresholds, rubric bytes) + the
 * committed JSON — no clock, no env, no randomness. Files resolve identically
 * from src/ (vitest) and dist/ (node): the loader tries the directory-local
 * file first and falls back to the package's src/eval copy.
 */

export const CORPUS_LOCK_VERSION = 1;

/**
 * The rubric triple hashed into the lock (I-1): the prompts the model sees,
 * the checker that decides grounding, and the scoring semantics. Package-root
 * relative paths, recorded verbatim in the lock JSON.
 */
export const RUBRIC_FILES = [
  'src/eval/constraints.ts',
  'src/eval/prompts.ts',
  'src/eval/score.ts',
] as const;

/** sha256:<64 hex> per rubric file, keyed by the package-relative path. */
export type RubricDigests = Record<string, string>;

/** The frozen gate thresholds (the numbers the verdict depends on). */
export interface FrozenThresholds {
  g1_required_total: number;
  g4_cost_multiplier: number;
}

export interface CorpusLockEntry {
  /** Freeze date (YYYY-MM-DD, from the regeneration timestamp). */
  frozen_at: string;
  /** sha256:<64 hex> over the canonical corpus+thresholds+rubric serialization. */
  hash: string;
  /** Why the lock was (re)frozen — the audit trail entry. */
  note: string;
  /** The hash this entry supersedes (set on appended entries; the first freeze has none). */
  previous_hash?: string;
}

export interface CorpusLock {
  version: typeof CORPUS_LOCK_VERSION;
  algorithm: 'sha256';
  canonicalization: 'stable-json-v1';
  thresholds: FrozenThresholds;
  /** Machine-visible hashed scope (I-1): the rubric files inside the hash. */
  hashed_rubric_files?: string[];
  /** Append-only: the LAST entry is the enforced freeze. */
  history: CorpusLockEntry[];
}

export function frozenThresholds(): FrozenThresholds {
  return { g1_required_total: G1_REQUIRED_TOTAL, g4_cost_multiplier: G4_COST_MULTIPLIER };
}

/** Deterministic serialization: recursively key-sorted JSON, no whitespace. */
export function canonicalJson(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v !== null && typeof v === 'object') {
      return Object.fromEntries(
        Object.keys(v as Record<string, unknown>)
          .sort()
          .map((k) => [k, sort((v as Record<string, unknown>)[k])]),
      );
    }
    return v;
  };
  return JSON.stringify(sort(value));
}

/**
 * Read and digest the rubric triple's file BYTES (I-1): the working-tree
 * bytes as they exist at freeze/verify time. Resolves each file from src/
 * (vitest) or from dist/ via the package's src/eval copy (node). Byte-level:
 * any edit to a hashed file — even whitespace — moves the digest and thereby
 * the corpus hash.
 */
export function readRubricDigests(files: readonly string[] = RUBRIC_FILES): RubricDigests {
  const out: RubricDigests = {};
  for (const file of files) {
    const base = path.basename(file);
    const candidates = [
      path.resolve(__dirname, base), // src/eval (vitest) or a dist-local copy
      path.resolve(__dirname, '../../src/eval', base), // from dist/eval
    ];
    const found = candidates.find((p) => existsSync(p));
    if (found === undefined) {
      throw new Error(
        `CORPUS LOCK RUBRIC FILE MISSING: ${file} (tried ${candidates.join(', ')}) — ` +
          'the rubric triple is part of the frozen hash and must be present to verify or regenerate the lock',
      );
    }
    out[file] = `sha256:${createHash('sha256').update(readFileSync(found)).digest('hex')}`;
  }
  return out;
}

/**
 * sha256 over the canonical serialization of { model, tasks, thresholds,
 * rubric }. The CONSTRAINT_TRACE declarations travel inside the task
 * assertions, so constraint edits, intent edits, and threshold edits all move
 * the hash; since the I-1 scope extension the prompts/checker/scoring file
 * bytes move it too. `rubricDigests` is injectable so tests can prove a
 * tampered rubric file fails the lock without touching the working tree.
 */
export function computeCorpusHash(
  tasks: EvalTask[] = EVAL_TASKS,
  thresholds: FrozenThresholds = frozenThresholds(),
  rubricDigests: RubricDigests = readRubricDigests(),
): string {
  const canonical = canonicalJson({
    model: 'constraint-trace-v1',
    tasks,
    thresholds,
    rubric: rubricDigests,
  });
  return `sha256:${createHash('sha256').update(canonical, 'utf8').digest('hex')}`;
}

/** Candidate lock-file locations: dir-local first, then the package's src/eval copy. */
function lockCandidates(explicit?: string): string[] {
  if (explicit !== undefined) return [explicit];
  return [
    path.resolve(__dirname, 'corpus-lock.json'), // src/eval (vitest) or a dist-local copy
    path.resolve(__dirname, '../../src/eval/corpus-lock.json'), // from dist/eval
  ];
}

/** Read and parse the lock file (throws with the path when missing/corrupt). */
export function loadCorpusLock(explicitPath?: string): CorpusLock {
  const candidate = lockCandidates(explicitPath).find((p) => existsSync(p));
  if (candidate === undefined) {
    throw new Error(
      `CORPUS LOCK MISSING: no corpus-lock.json next to the eval (tried ${lockCandidates(explicitPath).join(', ')}) — ` +
        'the corpus freeze is part of the evidence chain; regenerate it with a dated entry before running evals',
    );
  }
  const lock = JSON.parse(readFileSync(candidate, 'utf8')) as CorpusLock;
  if (lock.version !== CORPUS_LOCK_VERSION || !Array.isArray(lock.history) || lock.history.length === 0) {
    throw new Error(`CORPUS LOCK INVALID: ${candidate} is not a v${CORPUS_LOCK_VERSION} lock with at least one history entry`);
  }
  return lock;
}

/**
 * Verify the corpus + thresholds + rubric triple on disk still match the
 * newest frozen hash. Throws (loud, actionable) on mismatch — this is the
 * pre-registration enforcement: exam questions and the rubric that grades
 * them cannot change silently after (or before viewing) results.
 */
export function verifyCorpusLock(
  explicitPath?: string,
  opts: { lock?: CorpusLock; corpusHash?: string } = {},
): { hash: string; frozenAt: string } {
  const lock = opts.lock ?? loadCorpusLock(explicitPath);
  const newest = lock.history[lock.history.length - 1]!;
  const computed =
    opts.corpusHash ?? computeCorpusHash(EVAL_TASKS, frozenThresholds(), readRubricDigests(lock.hashed_rubric_files ?? RUBRIC_FILES));
  if (newest.hash !== computed) {
    throw new Error(
      'CORPUS LOCK MISMATCH: the eval corpus/thresholds/rubric no longer match the frozen lock.\n' +
        `  frozen:  ${newest.hash} (${newest.frozen_at}, "${newest.note}")\n` +
        `  current: ${computed}\n` +
        'The corpus was frozen pre-registration; editing intents, constraint declarations, gate ' +
        'thresholds, or any hashed rubric file (prompts.ts / constraints.ts / score.ts) invalidates ' +
        'every result collected under the old freeze. If this change is INTENTIONAL, regenerate the ' +
        'lock — append a new dated history entry (never edit existing ones) — before running or ' +
        'reporting any eval.',
    );
  }
  return { hash: newest.hash, frozenAt: newest.frozen_at };
}

/**
 * Append a new dated freeze entry (the only sanctioned way to change the
 * freeze). Writes the file and returns the new lock; existing history entries
 * are carried over byte-identical. `nowIso` is INJECTED (cores never read the
 * clock) — the CLI/one-off regeneration passes a real timestamp.
 *
 * M-2 (2026-08-27 review): the written lock carries the CURRENT thresholds
 * and the CURRENT hashed-file scope — never the previous lock's stale fields,
 * which would contradict the very hash recorded next to them.
 */
export function regenerateCorpusLock(
  explicitPath: string,
  opts: { note: string; nowIso: string },
): CorpusLock {
  const previous = existsSync(explicitPath)
    ? loadCorpusLock(explicitPath)
    : ({
        version: CORPUS_LOCK_VERSION,
        algorithm: 'sha256',
        canonicalization: 'stable-json-v1',
        thresholds: frozenThresholds(),
        history: [],
      } satisfies CorpusLock);
  const hash = computeCorpusHash(EVAL_TASKS, frozenThresholds(), readRubricDigests());
  const entry: CorpusLockEntry = {
    frozen_at: opts.nowIso.slice(0, 10),
    hash,
    note: opts.note,
    ...(previous.history.length > 0
      ? { previous_hash: previous.history[previous.history.length - 1]!.hash }
      : {}),
  };
  const lock: CorpusLock = {
    ...previous,
    thresholds: frozenThresholds(),
    hashed_rubric_files: [...RUBRIC_FILES],
    history: [...previous.history, entry],
  };
  writeFileSync(explicitPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
  return lock;
}
