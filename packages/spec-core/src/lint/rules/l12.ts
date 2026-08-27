import type { LintRule } from '../engine';
import type { LintFinding } from '../types';
import type { TaskContract } from '../../schemas';

/**
 * L12_SCOPE_OVERLAP (ERROR — isolation is execution safety): two tasks with
 * overlapping permitted_scope globs and no dependency path ordering them can
 * mutate the same files concurrently. One finding per pair, path 'A,B'.
 *
 * ORDERING SEMANTICS (BACK-007, recorded decision): a conflict is suppressed
 * when either task is reachable from the other through `depends_on` — the
 * TRANSITIVE closure, not just direct edges. Rationale: a chain
 * A <- B <- C is just as serialized as a direct A <- C; flagging the A/C pair
 * was a false-positive class the audit named explicitly, closure is O(V·(V+E))
 * at sizes the input ceilings allow, and cycles remain L04's problem (inside a
 * cycle every pair is "ordered", and L04 rejects the cycle itself).
 *
 * PATTERN LANGUAGE (BACK-007): a permitted_scope glob is a `/`-separated
 * sequence of segments where
 *   - a literal character matches itself;
 *   - `?` matches exactly ONE character, never `/`;
 *   - `*` matches ZERO OR MORE characters, never `/` (adjacent stars collapse:
 *     `a**b` as a segment equals `a*b`);
 *   - a segment that is exactly `**` matches ANY number of whole segments,
 *     including zero (`src/**` covers `src` itself and everything below it);
 *   - `\` is normalized to `/`; empty segments (`//`, trailing `/`) are dropped.
 * Two globs OVERLAP iff some file path satisfies both — computed exactly for
 * this subset (segment-wise unification + a `**`-aware whole-path DP), so
 * `src/*.ts` vs `src/*.md` is provably disjoint while `src/*.ts` vs `src/*.t?`
 * provably shares `src/a.ts`. Patterns outside this language (character
 * classes, braces) are literals: they can only match themselves, which the
 * model answers exactly.
 */
export const rule: LintRule = {
  id: 'L12_SCOPE_OVERLAP',
  check(b) {
    const tasks = [...b.tasks].sort((a, z) => a.task_id.localeCompare(z.task_id));
    const findings: LintFinding[] = [];

    // Transitive reachability per task (iterative DFS — no recursion, so deep
    // chains cannot overflow the stack; see L04 for the same discipline).
    const reachable = transitiveDeps(tasks);

    for (let i = 0; i < tasks.length; i++) {
      for (let j = i + 1; j < tasks.length; j++) {
        const a = tasks[i]!;
        const z = tasks[j]!;
        const ordered =
          reachable.get(a.task_id)?.has(z.task_id) === true ||
          reachable.get(z.task_id)?.has(a.task_id) === true;
        if (ordered) continue;

        const clash = firstOverlap(a.permitted_scope, z.permitted_scope);
        if (!clash) continue;

        findings.push({
          rule: 'L12_SCOPE_OVERLAP',
          severity: 'error',
          path: `${a.task_id},${z.task_id}`,
          message:
            `permitted scopes overlap with no dependency path ordering the tasks: ` +
            `'${clash[0]}' (${a.task_id}) vs '${clash[1]}' (${z.task_id}) — ` +
            'add a depends_on path between them or narrow the scopes apart',
        });
      }
    }
    return findings;
  },
};

/**
 * For every task id, the set of ids reachable through ANY non-empty
 * `depends_on` path. Pure; deterministic (Set insertion order is irrelevant —
 * only membership is consumed). Edges pointing at unknown ids are ignored
 * here: L13 reports them as broken references.
 */
export function transitiveDeps(tasks: readonly TaskContract[]): Map<string, Set<string>> {
  const direct = new Map<string, readonly string[]>(
    tasks.map((t) => [t.task_id, t.depends_on]),
  );
  const known = new Set(direct.keys());
  const out = new Map<string, Set<string>>();

  for (const start of known) {
    const seen = new Set<string>();
    const stack: string[] = [...(direct.get(start) ?? [])];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (!known.has(id) || seen.has(id)) continue;
      seen.add(id);
      for (const next of direct.get(id) ?? []) stack.push(next);
    }
    out.set(start, seen);
  }
  return out;
}

/** First overlapping glob pair (a-side order, then z-side order). */
function firstOverlap(globsA: string[], globsZ: string[]): [string, string] | null {
  for (const ga of globsA) {
    for (const gz of globsZ) if (globsOverlap(ga, gz)) return [ga, gz];
  }
  return null;
}

/** Split a glob into segments: `\` -> `/`, drop empty segments. */
export function globSegments(glob: string): string[] {
  return glob
    .replace(/\\/g, '/')
    .split('/')
    .filter((s) => s.length > 0);
}

/**
 * Do two SINGLE-SEGMENT patterns share a witness string (no `/` in it)?
 * Exact for literals/`?`/`*`: memoized unification over pattern positions —
 * `overlap(i, j)` asks whether pattern a[i..] and pattern z[j..] can match the
 * same string suffix.
 */
export function segmentsOverlap(a: string, z: string): boolean {
  const memo = new Map<number, boolean>();
  const n = z.length;

  const overlap = (i: number, j: number): boolean => {
    const key = i * (n + 1) + j;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;

    let result: boolean;
    if (i === a.length && j === z.length) {
      result = true; // both consumed — empty suffix on both sides
    } else if (i === a.length) {
      result = z.slice(j).split('').every((c) => c === '*'); // z must match empty
    } else if (j === z.length) {
      result = a.slice(i).split('').every((c) => c === '*'); // a must match empty
    } else if (a[i] === '*' || z[j] === '*') {
      // At least one side has a star here. A common witness either lets the
      // star(s) match empty, or lets them consume characters the other side
      // also consumes — the three branches cover every decomposition.
      result = overlap(i + 1, j) || overlap(i, j + 1) || overlap(i + 1, j + 1);
    } else if (a[i] === '?' || z[j] === '?' || a[i] === z[j]) {
      result = overlap(i + 1, j + 1); // both sides consume one identical char
    } else {
      result = false; // two different literals — no witness
    }
    memo.set(key, result);
    return result;
  };

  return overlap(0, 0);
}

/**
 * Do two whole-path globs share a witness path? Segment-wise DP:
 * `pOverlap(i, j)` asks whether P[i..] and Q[j..] can both match some common
 * SEGMENT SEQUENCE. `**` segments can consume zero or more segments on either
 * side, which the two `rec` branches express.
 */
export function globsOverlap(a: string, z: string): boolean {
  const P = globSegments(a);
  const Q = globSegments(z);
  const memo = new Map<number, boolean>();
  const n = Q.length;

  const allDoubleStar = (segs: string[], from: number): boolean =>
    segs.slice(from).every((s) => s === '**');

  const pOverlap = (i: number, j: number): boolean => {
    const key = i * (n + 1) + j;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;

    let result: boolean;
    if (i === P.length && j === Q.length) {
      result = true;
    } else if (i === P.length) {
      result = allDoubleStar(Q, j); // Q alone must match zero segments
    } else if (j === Q.length) {
      result = allDoubleStar(P, i);
    } else if (P[i] === '**' || Q[j] === '**') {
      result =
        pOverlap(i + 1, j) || // this ** matches zero segments
        pOverlap(i, j + 1); // this ** absorbs the other side's current segment
    } else {
      result = segmentsOverlap(P[i]!, Q[j]!) && pOverlap(i + 1, j + 1);
    }
    memo.set(key, result);
    return result;
  };

  return pOverlap(0, 0);
}
