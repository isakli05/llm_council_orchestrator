import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lintBundle } from './lint/engine';
import { rule as l12 } from './lint/rules/l12';
import { closureFindings } from './compiler/closure';
import { artifactHashes } from './compiler/hash';
import { compileSpecDir } from './compiler/compile';
import { SpecBundleSchema, type SpecBundle, INPUT_CEILINGS } from './schemas';

/**
 * PERF-001 scale ceiling — a REGRESSION CEILING, not a performance claim.
 *
 * Deterministic synthetic bundles (sequential ids, no randomness) at
 * 10/100/1000 tasks exercise the pipeline stages the audit flagged: L12's
 * task-pair loop x scope-pair products, the transitive dependency closure,
 * the full lint pass, per-section hashing, schema validation, and a real
 * compile from disk. Thresholds are ~10x the observed numbers on the dev
 * machine (recorded in the task-21 report) so CI load cannot flake them;
 * a threshold trip means an ORDER-OF-MAGNITUDE regression, not noise.
 *
 * Two worst-case shapes per size:
 *  - chained/overlap: every task touches the same 3 globs and is ordered by
 *    a full dependency chain — maximum closure work, ordered short-circuit
 *    in the pair loop.
 *  - disjoint: no dependencies, pairwise-disjoint scope dirs — every task
 *    pair runs the FULL scope-product overlap search before concluding
 *    disjointness (maximum L12 pair-loop work, memory-light: no findings).
 *
 * Sizes above the schema's task ceiling (INPUT_CEILINGS.tasksPerBundle)
 * bypass SpecBundleSchema deliberately: the ceiling bounds real input, while
 * this benchmark pins the ALGORITHMS' scaling for any future ceiling raise.
 * The schema-validated paths (parse + compile) run at exactly the ceiling.
 *
 * Observed on the dev machine (2026-08, single run, Node 24):
 *   n=10:   l12 chained 5.6ms / disjoint 0.4ms, lint 1.2ms, hash 0.6ms
 *   n=100:  l12 chained 2.2ms / disjoint 9.2ms, lint 1.2ms, hash 0.5ms,
 *           schema parse 4.7ms, compile-from-disk 4.4ms
 *   n=1000: l12 chained 131.7ms / disjoint 349.5ms, lint 101.4ms,
 *           closure 0.5ms, hash 3.3ms
 */

function mkTask(i: number, chained: boolean, scope: string[]): SpecBundle['tasks'][number] {
  return {
    task_id: `TASK-${String(i + 1).padStart(4, '0')}`,
    title: 't',
    purpose: 'p',
    refs: { requirements: ['REQ-0001'], architecture: [], decisions: [] },
    depends_on: chained && i > 0 ? [`TASK-${String(i).padStart(4, '0')}`] : [],
    preconditions: ['pc'],
    permitted_scope: scope,
    protected: [],
    interface_changes: [],
    invariants: ['inv'],
    instructions: 'do',
    tests: [
      {
        ...(i === 0 ? { id: 'TST-0001' as const } : {}),
        kind: 'unit' as const,
        file: 'a.test.ts',
        cases: ['c1'],
      },
    ],
    verification: [{ command: 'npm test', expect: 'exit 0' }],
    acceptance: ['ac'],
    rollback: 'git revert',
    completion_evidence: { required: ['test_summary' as const] },
    risk: { level: 'low' as const, note: '' },
    complexity: 's' as const,
  };
}

function syntheticBundle(n: number, chained: boolean, scopeOf: (i: number) => string[]): SpecBundle {
  return {
    manifest: {
      spec_schema: 'lco-spec/1.0',
      spec_version: 1,
      project: { name: 'bench', mode: 'greenfield' },
      complexity_profile: 'p-standard',
      evidence_snapshot: {
        pack_hash: `sha256:${'a'.repeat(64)}`,
        collected_at: '2026-08-26T00:00:00Z',
      },
      state: 'draft',
      council_run: { run_id: 'bench', config_fingerprint: 'bench' },
      artifact_hashes: {},
      unresolved_count: 0,
      blocking_count: 0,
      target_runtime: { platform: 'node', stack: 'typescript' },
    },
    intent: { statement: 'Bench', normalized: 'bench' },
    glossary: [{ term: 'T', definition: 'D' }],
    assumptions: [],
    evidence: [
      { id: 'E-0001', kind: 'user_input', source: 'bench', hash: `sha256:${'c'.repeat(64)}` },
    ],
    requirements: [
      {
        id: 'REQ-0001',
        statement: 'S',
        priority: 'must',
        evidence: ['E-0001'],
        acceptance_refs: ['TST-0001'],
        terms_used: [],
      },
    ],
    decisions: [],
    contracts: [],
    tasks: Array.from({ length: n }, (_, i) => mkTask(i, chained, scopeOf(i))),
    test_files: ['a.test.ts'],
  };
}

const overlapScope = (): string[] => ['src/**', 'lib/**', 'docs/**'];
const disjointScope = (i: number): string[] => [`src/t${String(i).padStart(4, '0')}/**`];

/** CI-safe regression ceilings (~10x+ observed; see the file header). */
const CEILINGS_MS = {
  l12PerSize: [100, 1_000, 5_000] as const, // 10 / 100 / 1000 tasks
  closurePerSize: [200, 500, 2_000] as const,
  lintPerSize: [500, 1_000, 5_000] as const,
  hashPerSize: [500, 1_000, 2_000] as const,
  fullPipeline1000: 15_000,
  schemaParseAtCeiling: 2_000,
  compileAtCeiling: 5_000,
} as const;

const ms = (fn: () => unknown): number => {
  const start = performance.now();
  fn();
  return performance.now() - start;
};

describe('scale ceiling (PERF-001) — deterministic synthetic bundles', () => {
  const SIZES = [10, 100, 1000] as const;

  it('sanity: the generator is schema-valid at the task ceiling (the ceiling itself works)', () => {
    const b = syntheticBundle(INPUT_CEILINGS.tasksPerBundle, true, overlapScope);
    expect(() => SpecBundleSchema.parse(b)).not.toThrow();
  });

  it('sanity: L12 really does the pair work — 100 unordered overlapping tasks yield C(100,2) findings', () => {
    const b = syntheticBundle(100, false, overlapScope);
    const findings = l12.check(b);
    expect(findings).toHaveLength((100 * 99) / 2);
  });

  it('sanity: chained overlap is fully ordered — zero findings at 1000', () => {
    const b = syntheticBundle(1000, true, overlapScope);
    expect(l12.check(b)).toHaveLength(0);
  });

  for (let s = 0; s < SIZES.length; s++) {
    const n = SIZES[s]!;
    it(
      `L12 + closure + lint + hash at ${n} tasks stay under the regression ceilings`,
      () => {
        const chained = syntheticBundle(n, true, overlapScope);
        const disjoint = syntheticBundle(n, false, disjointScope);

        const l12Chained = ms(() => l12.check(chained));
        const l12Disjoint = ms(() => l12.check(disjoint));
        expect(l12Chained, `L12 chained @${n}`).toBeLessThan(CEILINGS_MS.l12PerSize[s]!);
        expect(l12Disjoint, `L12 disjoint @${n}`).toBeLessThan(CEILINGS_MS.l12PerSize[s]!);

        const closure = ms(() => closureFindings(chained));
        expect(closure, `closure @${n}`).toBeLessThan(CEILINGS_MS.closurePerSize[s]!);

        const lint = ms(() => lintBundle(chained));
        expect(lint, `lintBundle @${n}`).toBeLessThan(CEILINGS_MS.lintPerSize[s]!);

        const hash = ms(() => artifactHashes(chained));
        expect(hash, `artifactHashes @${n}`).toBeLessThan(CEILINGS_MS.hashPerSize[s]!);
      },
      60_000,
    );
  }

  it(
    `full pipeline (L12 + closure + lint + hash) at 1000 tasks stays under the combined ceiling`,
    () => {
      const chained = syntheticBundle(1000, true, overlapScope);
      const total = ms(() => {
        l12.check(chained);
        closureFindings(chained);
        lintBundle(chained);
        artifactHashes(chained);
      });
      expect(total).toBeLessThan(CEILINGS_MS.fullPipeline1000);
    },
    60_000,
  );

  it(
    `schema parse at the task ceiling (${INPUT_CEILINGS.tasksPerBundle}) stays under its ceiling`,
    () => {
      const b = syntheticBundle(INPUT_CEILINGS.tasksPerBundle, true, overlapScope);
      const parse = ms(() => SpecBundleSchema.parse(b));
      expect(parse).toBeLessThan(CEILINGS_MS.schemaParseAtCeiling);
    },
    60_000,
  );

  describe('compile from disk at the task ceiling', () => {
    let dir: string;

    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), 'lco-scale-bench-'));
      const specDir = join(dir, 'spec');
      mkdirSync(specDir);
      const b = syntheticBundle(INPUT_CEILINGS.tasksPerBundle, true, overlapScope);
      const sections = {
        manifest: b.manifest,
        intent: b.intent,
        glossary: b.glossary,
        assumptions: b.assumptions,
        evidence: b.evidence,
        requirements: b.requirements,
        decisions: b.decisions,
        contracts: b.contracts,
        tasks: b.tasks,
      } as const;
      for (const [name, content] of Object.entries(sections)) {
        writeFileSync(join(specDir, `${name}.json`), JSON.stringify(content));
      }
    });

    afterAll(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it(
      'compiles ok (100-task chain) and stays under the compile ceiling',
      async () => {
        const start = performance.now();
        const result = await compileSpecDir(dir);
        const took = performance.now() - start;

        expect(result.ok, result.ok ? '' : JSON.stringify(result.errors)).toBe(true);
        expect(result.bundle?.tasks).toHaveLength(INPUT_CEILINGS.tasksPerBundle);
        expect(took).toBeLessThan(CEILINGS_MS.compileAtCeiling);
      },
      60_000,
    );
  });
});
