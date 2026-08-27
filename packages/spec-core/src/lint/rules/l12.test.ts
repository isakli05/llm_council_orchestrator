import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lintBundle } from '../engine';
import { rule, globSegments, segmentsOverlap, globsOverlap } from './l12';
import type { SpecBundle, TaskContract } from '../../schemas';

const FIXTURES = join(__dirname, '../../../fixtures');

function loadBundle(rel: string): SpecBundle {
  return JSON.parse(readFileSync(join(FIXTURES, rel), 'utf8')) as SpecBundle;
}

/** Minimal task for the L12 unit surface (the rule reads only these fields). */
function task(
  task_id: string,
  depends_on: string[],
  permitted_scope: string[],
): TaskContract {
  return { task_id, depends_on, permitted_scope } as unknown as TaskContract;
}

/** L12 reads only b.tasks; a focused bundle keeps the unit under test isolated. */
function bundleOf(...tasks: TaskContract[]): SpecBundle {
  return { tasks } as unknown as SpecBundle;
}

describe('L12_SCOPE_OVERLAP', () => {
  it('fires exactly L12 on the L12 vector (the overlapping glob in the message)', () => {
    const result = lintBundle(loadBundle('bad/L12/bundle.json'));

    expect(result.errors.length).toBeGreaterThan(0);
    expect(new Set(result.errors.map((f) => f.rule))).toEqual(
      new Set(['L12_SCOPE_OVERLAP']),
    );
    expect(result.errors.some((f) => f.message.includes('src/auth/**'))).toBe(true);
  });

  it('is an ERROR (isolation violation), with the task pair as the path', () => {
    const result = lintBundle(loadBundle('bad/L12/bundle.json'));

    expect(result.errors.every((f) => f.severity === 'error')).toBe(true);
    expect(result.errors.map((f) => f.path)).toEqual(['TASK-0001,TASK-0002']);
  });
});

describe('L12_SCOPE_OVERLAP overlap semantics (BACK-007)', () => {
  it('does NOT flag disjoint extensions: src/*.ts vs src/*.md (audit case)', () => {
    const findings = rule.check(
      bundleOf(
        task('TASK-0001', [], ['src/*.ts']),
        task('TASK-0002', [], ['src/*.md']),
      ),
    );
    expect(findings).toEqual([]);
  });

  it('does NOT flag disjoint sibling dirs with same extension', () => {
    const findings = rule.check(
      bundleOf(
        task('TASK-0001', [], ['src/auth/*.ts']),
        task('TASK-0002', [], ['src/session/*.ts']),
      ),
    );
    expect(findings).toEqual([]);
  });

  it('flags genuinely overlapping single-segment globs', () => {
    const findings = rule.check(
      bundleOf(
        task('TASK-0001', [], ['src/*.ts']),
        task('TASK-0002', [], ['src/a*.ts']),
      ),
    );
    expect(findings.map((f) => f.path)).toEqual(['TASK-0001,TASK-0002']);
  });

  it("handles '?' per the documented language: one char, segment-local", () => {
    // v1.? matches v1.2 — a real overlap the old heuristic missed.
    const overlap = rule.check(
      bundleOf(
        task('TASK-0001', [], ['src/v1.?/**']),
        task('TASK-0002', [], ['src/v1.2/**']),
      ),
    );
    expect(overlap.map((f) => f.path)).toEqual(['TASK-0001,TASK-0002']);

    // v1.? does NOT match v1.22 — '?' is exactly one character.
    const disjoint = rule.check(
      bundleOf(
        task('TASK-0001', [], ['src/v1.?/**']),
        task('TASK-0002', [], ['src/v1.22/**']),
      ),
    );
    expect(disjoint).toEqual([]);
  });

  it("'*' never crosses a segment boundary: src/* vs src/a/b is no overlap", () => {
    const findings = rule.check(
      bundleOf(
        task('TASK-0001', [], ['src/*']),
        task('TASK-0002', [], ['src/a/b']),
      ),
    );
    expect(findings).toEqual([]);
  });

  it('still flags a sibling pair with no ordering at all (fixture behavior)', () => {
    const findings = rule.check(
      bundleOf(
        task('TASK-0001', [], ['src/**']),
        task('TASK-0002', [], ['src/**']),
      ),
    );
    expect(findings.map((f) => f.path)).toEqual(['TASK-0001,TASK-0002']);
  });
});

describe('L12_SCOPE_OVERLAP ordering semantics (BACK-007)', () => {
  it('suppresses conflicts ordered by a TRANSITIVE dependency path', () => {
    // A <- B <- C, all touching src/** — every pair is ordered through B.
    const findings = rule.check(
      bundleOf(
        task('TASK-0001', [], ['src/**']),
        task('TASK-0002', ['TASK-0001'], ['src/**']),
        task('TASK-0003', ['TASK-0002'], ['src/**']),
      ),
    );
    expect(findings).toEqual([]);
  });

  it('suppresses conflicts ordered by a direct edge (unchanged semantics)', () => {
    const findings = rule.check(
      bundleOf(
        task('TASK-0001', [], ['src/**']),
        task('TASK-0002', ['TASK-0001'], ['src/**']),
      ),
    );
    expect(findings).toEqual([]);
  });

  it('still flags unordered siblings inside an otherwise ordered bundle', () => {
    // Chain A<-B, plus an unrelated C also touching src/** — B/C and A/C are unordered.
    const findings = rule.check(
      bundleOf(
        task('TASK-0001', [], ['src/**']),
        task('TASK-0002', ['TASK-0001'], ['src/**']),
        task('TASK-0003', [], ['src/**']),
      ),
    );
    expect(findings.map((f) => f.path)).toEqual(['TASK-0001,TASK-0003', 'TASK-0002,TASK-0003']);
  });

  it('treats a dependency DIAMOND correctly: ordered pairs silent, the concurrent middle pair flagged', () => {
    // A <- B, A <- C, B <- D, C <- D: A/B, A/C, A/D, B/D, C/D are ordered by
    // a path — but B and C have NO path between them (they may run in parallel
    // after A), so with both touching src/** that pair is a REAL conflict.
    const findings = rule.check(
      bundleOf(
        task('TASK-0001', [], ['src/**']),
        task('TASK-0002', ['TASK-0001'], ['src/**']),
        task('TASK-0003', ['TASK-0001'], ['src/**']),
        task('TASK-0004', ['TASK-0002', 'TASK-0003'], ['src/**']),
      ),
    );
    expect(findings.map((f) => f.path)).toEqual(['TASK-0002,TASK-0003']);
  });

  it('reports the dependency-path decision in the finding message', () => {
    const findings = rule.check(
      bundleOf(
        task('TASK-0001', [], ['src/**']),
        task('TASK-0002', [], ['src/**']),
      ),
    );
    expect(findings[0]?.message).toMatch(/dependency path/i);
  });
});

/**
 * The pure overlap model. Two globs overlap iff SOME file path satisfies
 * both — exact for the documented subset (see l12.ts). The table is the
 * review surface for the semantics; the brute-force block below cross-checks
 * the segment engine against exhaustive enumeration.
 */
describe('glob subset: parsing', () => {
  it('splits on / and \\, dropping empty segments', () => {
    expect(globSegments('src/auth/**')).toEqual(['src', 'auth', '**']);
    expect(globSegments('src\\auth\\**')).toEqual(['src', 'auth', '**']);
    expect(globSegments('/src//auth/')).toEqual(['src', 'auth']);
    expect(globSegments('**')).toEqual(['**']);
  });
});

describe('glob subset: segment overlap table (tricky cases)', () => {
  const cases: Array<[string, string, boolean, string]> = [
    ['a.ts', 'a.ts', true, 'identical literals'],
    ['a.ts', 'a.md', false, 'different literals'],
    ['*.ts', '*.md', false, 'disjoint extensions (audit case)'],
    ['*.ts', '*.t?', true, 'shared .ts witness'],
    ['*.ts', 'a.ts', true, 'literal inside the glob'],
    ['*.ts', 'b.ts', true, 'other literal'],
    ['?', 'a', true, 'one-char wildcard'],
    ['?', 'ab', false, 'exactly one char'],
    ['?.ts', 'a.ts', true, 'one char + literal'],
    ['?.ts', 'ab.ts', false, 'two chars do not fit ?'],
    ['a?c', 'abc', true, '? in the middle'],
    ['a?c', 'ac', false, '? needs exactly one char'],
    ['a?c', 'abbc', false, 'one ? is not a star'],
    ['*', 'a', true, 'star matches one char'],
    ['*', '', true, 'star matches zero chars'],
    ['ab*', 'ab', true, 'trailing star matches zero'],
    ['ab*', 'abcd', true, 'trailing star matches tail'],
    ['a*b', 'a*b', true, 'identical stars'],
    ['a*b*s', 'a*b*s', true, 'identical double stars'],
    ['a*b', 'b*a', false, 'witness first char would need to be both a and b'],
    ['*a*', '*b*', true, 'witness contains both a and b'],
    ['*a', '*b', false, 'last char is both a and b — impossible'],
    ['a*b', 'ab', true, 'literal pair with star-zero'],
    ['a**b', 'a*b', true, 'adjacent stars are one star'],
  ];
  for (const [a, z, expected, why] of cases) {
    it(`segmentsOverlap(${JSON.stringify(a)}, ${JSON.stringify(z)}) = ${expected} — ${why}`, () => {
      expect(segmentsOverlap(a, z)).toBe(expected);
    });
  }
});

describe('glob subset: full-path overlap table (tricky cases)', () => {
  const cases: Array<[string, string, boolean, string]> = [
    ['src/**', 'src/**', true, 'same subtree'],
    ['src/auth/**', 'src/session/**', false, 'disjoint subtrees'],
    ['src/**', 'docs/**', false, 'different roots'],
    ['src/**', 'src', true, '** matches zero segments'],
    ['src/**', 'src/auth/x.ts', true, '** spans segments'],
    ['**', 'a/b/c.ts', true, 'global star matches anything'],
    ['**', 'src', true, 'global star matches one segment'],
    ['src/*', 'src/**', true, 'star is inside **'],
    ['src/*', 'src/a/b', false, '* never crosses /'],
    ['src/*', 'src/a', true, 'single-segment match'],
    ['src', 'src/*', false, 'src/* needs a child segment'],
    ['src/*.ts', 'src/*.md', false, 'audit case at path level'],
    ['src/*.ts', 'src/*.t?', true, '? shares the .ts tail'],
    ['src/auth*/*', 'src/authentication/x', true, 'star inside a segment'],
    ['src/auth*/*', 'src/session/*', false, 'literal prefixes disjoint'],
    ['**/*.ts', 'a.ts', true, '** matches zero leading segments'],
    ['**/*.ts', 'a/b/c.md', false, 'no .ts witness'],
    ['src/**/x.ts', 'src/a/x.ts', true, 'implicit ** zero-match'],
    ['src/**/x.ts', 'src/x.ts', true, '** can vanish entirely'],
    ['src/**', 'src/authentication/**', true, 'src/** covers the deeper subtree too'],
    ['a/**/b/**', 'a/x/b/y', true, 'two ** both nonempty'],
  ];
  for (const [a, z, expected, why] of cases) {
    it(`globsOverlap(${JSON.stringify(a)}, ${JSON.stringify(z)}) = ${expected} — ${why}`, () => {
      expect(globsOverlap(a, z)).toBe(expected);
    });
  }
});

/**
 * Exhaustive cross-check: the segment engine against a reference wildcard
 * matcher. The universe is every string of length 0..5 over an alphabet that
 * covers EVERY literal in the pattern set (an alphabet missing a literal makes
 * that pattern's language look empty — the check then 'passes' vacuously
 * against false negatives). If segmentsOverlap ever disagrees with "exists a
 * common witness string", this fails with the counterexample in hand.
 */

/** Reference matcher: does segment pattern p match string s? (?, *) semantics. */
function refMatch(p: string, s: string): boolean {
    // dp[i][j]: p[i..] matches s[j..]
    const dp: boolean[][] = Array.from({ length: p.length + 1 }, () =>
      new Array<boolean>(s.length + 1).fill(false),
    );
    dp[p.length][s.length] = true;
    for (let i = p.length - 1; i >= 0; i--) {
      for (let j = s.length; j >= 0; j--) {
        if (p[i] === '*') dp[i][j] = dp[i + 1][j] || (j < s.length && dp[i][j + 1]);
        else dp[i][j] = (p[i] === '?' || p[i] === s[j]) && j < s.length && dp[i + 1][j + 1];
      }
    }
    return dp[0][0];
}

describe('segment overlap engine vs brute-force enumeration', () => {
  const alphabet = ['a', 'b', 't', 's', 'm', 'd', '.'];
  function allStrings(maxLen: number): string[] {
    // ACCUMULATE every length 0..maxLen — replacing instead of accumulating
    // once cost this cross-check its entire short-string coverage.
    const out = [''];
    let frontier = [''];
    for (let len = 1; len <= maxLen; len++) {
      frontier = frontier.flatMap((s2) => alphabet.map((c) => s2 + c));
      out.push(...frontier);
    }
    return out;
  }

  it('segmentsOverlap(a, b) === exists s matched by both (exhaustive, len <= 5)', () => {
    const universe = allStrings(5); // 1+7+49+...+16807 = 19608 strings
    const patterns = [
      'a', 'b', 'ab', 'ba', 'a.b', '*.ts', '*.md', '?', '??', '?.ts', 'a?',
      'a*', '*a', '*a*', 'a*b', 'b*a', 'a**b', '*.*', '?*?', 'aa*', 'a*b*s',
      '*.t?', '?a?b',
    ];
    // Each pattern's language once (not per pair — 22 passes, not 484).
    const langs = new Map<string, Set<string>>(
      patterns.map((p) => [p, new Set(universe.filter((s) => refMatch(p, s)))]),
    );
    for (const p of patterns) {
      expect(langs.get(p)!.size, `pattern ${p} must match something in the universe`).toBeGreaterThan(0);
    }
    for (const p of patterns) {
      for (const q of patterns) {
        const brute = [...langs.get(q)!].some((s) => langs.get(p)!.has(s));
        expect(segmentsOverlap(p, q), `counterexample: ${p} vs ${q}`).toBe(brute);
      }
    }
  });
});

/**
 * T21 rider (TEST-003): the SAME exhaustive cross-check lifted one layer —
 * from segment strings to whole-path SEGMENT SEQUENCES, so the `**` branches
 * of globsOverlap (zero-segment match / absorb-other's-segment) get the
 * exhaustive agreement the segment engine already had.
 *
 * Universe design (bounded, and closed under the patterns' witnesses):
 *   PATTERN paths — every 1..3-segment sequence over
 *     {a, b, *, ?, **}  (5 kinds → 5+25+125 = 155 patterns)
 *   LITERAL paths — every 1..6-segment sequence over {a, b} (126 paths)
 *
 * Why this is witness-closed: every pattern segment is a pure literal, a
 * pure '?', a pure '*', or '**', so any common witness segment of two
 * pattern segments is a 1-char string ('a'/'b') — differing literals have
 * no witness, matching literals are themselves. And a MINIMAL common
 * witness never needs more segments than (non-** segments in P) + (non-**
 * segments in Q) ≤ 3+3 = 6: a witness segment that advanced only '**'
 * positions on both sides could be deleted and both would still match. (A
 * first draft with 3-segment literal paths missed the pattern pair
 * {a, a, StarStar} vs {StarStar, b, a}, whose minimal witness is the
 * 4-segment a/a/b/a.)
 */
describe('path overlap engine vs brute-force enumeration (T21)', () => {
  /** Reference whole-path matcher: does segment-pattern P match path S? */
  function refPathMatch(p: string[], s: string[]): boolean {
    // dp[i][j]: P[i..] matches S[j..]; '**' spans any number of segments.
    const dp: boolean[][] = Array.from({ length: p.length + 1 }, () =>
      new Array<boolean>(s.length + 1).fill(false),
    );
    dp[p.length][s.length] = true;
    for (let i = p.length; i >= 0; i--) {
      for (let j = s.length; j >= 0; j--) {
        if (i === p.length && j === s.length) continue;
        if (i < p.length && p[i] === '**') {
          dp[i][j] = dp[i + 1][j] || (j < s.length && dp[i][j + 1]);
        } else if (i < p.length && j < s.length) {
          dp[i][j] = refMatch(p[i]!, s[j]!) && dp[i + 1][j + 1];
        } else {
          dp[i][j] = false;
        }
      }
    }
    return dp[0][0];
  }

  const segKinds = ['a', 'b', '*', '?', '**'];
  const literals = ['a', 'b'];

  const sequences = (kinds: string[], maxLen: number): string[][] => {
    const out: string[][] = [];
    let frontier: string[][] = [[]];
    for (let len = 1; len <= maxLen; len++) {
      frontier = frontier.flatMap((seq) => kinds.map((k) => [...seq, k]));
      out.push(...frontier);
    }
    return out;
  };

  it('globsOverlap(P, Q) === exists path matched by both (exhaustive patterns<=3 segs)', () => {
    const patterns = sequences(segKinds, 3); // 155 segment sequences
    const paths = sequences(literals, 6); // 126 literal witness paths

    // Each pattern's language ONCE as a Set of joined paths (not per pair).
    const langs = new Map<string, Set<string>>(
      patterns.map((p) => {
        const key = p.join('/');
        return [key, new Set(paths.filter((s) => refPathMatch(p, s)).map((s) => s.join('/')))];
      }),
    );

    // Non-vacuity: every pattern must match SOME path in the universe — an
    // empty language would make its rows 'pass' vacuously against false
    // negatives. ('**' alone matches every path; '?'/'*' segments are
    // satisfiable by 'a'.)
    for (const [key, lang] of langs) {
      expect(lang.size, `pattern ${key} must match something in the universe`).toBeGreaterThan(0);
    }

    let checked = 0;
    for (const [pk, plang] of langs) {
      for (const [qk, qlang] of langs) {
        const [small, big] = plang.size <= qlang.size ? [plang, qlang] : [qlang, plang];
        const brute = [...small].some((s) => big.has(s));
        expect(globsOverlap(pk, qk), `counterexample: ${pk} vs ${qk}`).toBe(brute);
        checked++;
      }
    }
    // Sanity: this really is the full quadratic, `**` branches included.
    expect(checked).toBe(patterns.length * patterns.length);
    // And the named `**` behaviors hold inside the enumerated set.
    expect(globsOverlap('**/b', 'a/b')).toBe(true); // ** zero-match (matches 'b' itself)
    expect(globsOverlap('**/a', 'a/b')).toBe(false); // 'a/b' ends in 'b' — no witness
    expect(globsOverlap('a/**', 'a/b/c')).toBe(true); // ** absorb
    expect(globsOverlap('a/**/b', 'a/x/y/b')).toBe(true); // ** absorbs several
    // The witness-length lesson, pinned: two 3-segment '**' patterns whose
    // common witness needs FOUR segments (a/a/b/a).
    expect(globsOverlap('a/a/**', '**/b/a')).toBe(true);
  });
});
