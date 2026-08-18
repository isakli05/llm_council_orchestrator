import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildTrace } from './trace';
import { SpecBundleSchema } from '../schemas';
import type { SpecBundle, TraceEdge } from '../schemas';

const GOOD = join(__dirname, '../../fixtures/good');

function loadBundle(dir: string): SpecBundle {
  return JSON.parse(readFileSync(join(GOOD, dir, 'bundle.json'), 'utf8')) as SpecBundle;
}

/** All ids a trace edge endpoint may legitimately name in this bundle. */
function idUniverse(b: SpecBundle): Set<string> {
  return new Set([
    ...b.requirements.map((r) => r.id),
    ...b.tasks.map((t) => t.task_id),
    ...b.decisions.map((d) => d.claim_id),
    ...b.evidence.map((e) => e.id),
  ]);
}

const key = (e: TraceEdge) => `${e.kind}|${e.from}|${e.to}`;

describe('buildTrace on the five good fixtures', () => {
  const dirs = readdirSync(GOOD).filter((d) => !d.startsWith('.')).sort();

  it('sees exactly the five planned bundles', () => {
    expect(dirs).toEqual([
      'embed-cli',
      'legacy-crm',
      'pet-clinic',
      'session-service',
      'todo-api',
    ]);
  });

  for (const d of dirs) {
    describe(d, () => {
      const b = loadBundle(d);
      const edges = buildTrace(b);
      const universe = idUniverse(b);

      it('gives every requirement at least one req-task edge', () => {
        for (const req of b.requirements) {
          expect(
            edges.some((e) => e.kind === 'req-task' && e.from === req.id),
          ).toBe(true);
        }
      });

      it('connects every task to its case-covered requirements (task-test)', () => {
        // L10 linkage: a task's test case containing a req id proves that req.
        for (const task of b.tasks) {
          for (const req of b.requirements) {
            const covered = task.tests.some((t) =>
              t.cases.some((c) => c.includes(req.id)),
            );
            const edge = edges.some(
              (e) => e.kind === 'task-test' && e.from === task.task_id && e.to === req.id,
            );
            expect(edge).toBe(covered);
          }
        }
      });

      it('only names ids that exist in the bundle', () => {
        for (const e of edges) {
          expect(universe.has(e.from)).toBe(true);
          expect(universe.has(e.to)).toBe(true);
        }
      });

      it('is deterministic: two calls deep-equal', () => {
        expect(buildTrace(b)).toEqual(edges);
      });

      it('is sorted by (kind, from, to) with no duplicates', () => {
        const keys = edges.map(key);
        expect(keys).toEqual([...keys].sort());
        expect(new Set(keys).size).toBe(keys.length);
      });
    });
  }
});

describe('buildTrace on a synthetic bundle', () => {
  it('dedupes duplicate refs and derives all four edge kinds via case-text matching', () => {
    const b = mkBundle({
      requirements: [
        { id: 'REQ-0001', evidence: ['E-0001'] },
        { id: 'REQ-0002', evidence: ['E-0001', 'E-0002'] },
      ],
      decisions: [{ claim_id: 'DEC-0001' }],
      evidence: ['E-0001', 'E-0002'],
      tasks: [
        mkTask({
          task_id: 'TASK-0001',
          refs: {
            requirements: ['REQ-0001', 'REQ-0001'], // duplicate ref
            decisions: ['DEC-0001', 'DEC-0001'], // duplicate ref
            architecture: [],
          },
          tests: [
            {
              kind: 'unit',
              file: 'tests/a.test.ts',
              cases: [
                'REQ-0001 does the thing', // covers REQ-0001
                'REQ-0001 does it again', // same req again — dedupe
              ],
            },
            {
              kind: 'integration',
              file: 'tests/b.test.ts',
              cases: [
                'REQ-0002 behaves', // second test file, second req
                'plain case with no id', // proves nothing — no edge
              ],
            },
          ],
        }),
      ],
    });

    expect(buildTrace(b)).toEqual([
      { kind: 'dec-task', from: 'DEC-0001', to: 'TASK-0001' },
      { kind: 'evidence-req', from: 'E-0001', to: 'REQ-0001' },
      { kind: 'evidence-req', from: 'E-0001', to: 'REQ-0002' },
      { kind: 'evidence-req', from: 'E-0002', to: 'REQ-0002' },
      { kind: 'req-task', from: 'REQ-0001', to: 'TASK-0001' },
      { kind: 'task-test', from: 'TASK-0001', to: 'REQ-0001' },
      { kind: 'task-test', from: 'TASK-0001', to: 'REQ-0002' },
    ]);
  });

  it('keeps unknown referenced ids (existence is lint L02/L05 business, not ours)', () => {
    const b = mkBundle({
      tasks: [
        mkTask({
          task_id: 'TASK-0001',
          refs: {
            requirements: ['REQ-9999'], // not in b.requirements
            decisions: ['DEC-9999'], // not in b.decisions
            architecture: [],
          },
        }),
      ],
    });

    expect(buildTrace(b)).toEqual([
      { kind: 'dec-task', from: 'DEC-9999', to: 'TASK-0001' },
      // mkBundle's default REQ-0001/E-0001 still produce their own edge.
      { kind: 'evidence-req', from: 'E-0001', to: 'REQ-0001' },
      { kind: 'req-task', from: 'REQ-9999', to: 'TASK-0001' },
    ]);
  });

  it('emits distinct task-test edges per task, never mutating the input bundle', () => {
    const b = mkBundle({
      requirements: [{ id: 'REQ-0001', evidence: ['E-0001'] }],
      tasks: [
        mkTask({
          task_id: 'TASK-0001',
          refs: { requirements: ['REQ-0001'], decisions: [], architecture: [] },
          tests: [testWith('REQ-0001 ok')],
        }),
        mkTask({
          task_id: 'TASK-0002',
          refs: { requirements: ['REQ-0001'], decisions: [], architecture: [] },
          tests: [testWith('REQ-0001 also ok')],
        }),
      ],
    });
    const before = JSON.stringify(b);

    const edges = buildTrace(b);

    expect(edges).toEqual([
      { kind: 'evidence-req', from: 'E-0001', to: 'REQ-0001' },
      { kind: 'req-task', from: 'REQ-0001', to: 'TASK-0001' },
      { kind: 'req-task', from: 'REQ-0001', to: 'TASK-0002' },
      { kind: 'task-test', from: 'TASK-0001', to: 'REQ-0001' },
      { kind: 'task-test', from: 'TASK-0002', to: 'REQ-0001' },
    ]);
    expect(JSON.stringify(b)).toBe(before);
  });
});

// --- synthetic-bundle helpers -------------------------------------------------

type ReqSpec = { id: string; evidence: string[] };
type DecSpec = { claim_id: string };
type TaskSpec = {
  task_id: string;
  refs?: { requirements: string[]; decisions: string[]; architecture: string[] };
  tests?: Array<{ kind: 'unit' | 'integration' | 'property' | 'e2e'; file: string; cases: string[] }>;
};

function testWith(...cases: string[]) {
  return { kind: 'unit' as const, file: 'tests/x.test.ts', cases };
}

function mkTask(spec: TaskSpec) {
  return {
    task_id: spec.task_id,
    title: `title ${spec.task_id}`,
    purpose: 'purpose',
    refs: spec.refs ?? { requirements: [], decisions: [], architecture: [] },
    depends_on: [],
    preconditions: ['none'],
    permitted_scope: ['src/**'],
    protected: [],
    interface_changes: [],
    invariants: ['none'],
    instructions: 'do it',
    tests: spec.tests ?? [testWith('plain case')],
    verification: [{ command: 'pnpm test', expect: 'green' }],
    acceptance: ['it works'],
    rollback: 'revert',
    completion_evidence: { required: ['test_summary' as const] },
    risk: { level: 'low' as const, note: '' },
    complexity: 'xs' as const,
  };
}

function mkBundle(overrides: {
  requirements?: ReqSpec[];
  decisions?: DecSpec[];
  evidence?: string[];
  tasks?: ReturnType<typeof mkTask>[];
}): SpecBundle {
  const bundle = {
    manifest: {
      spec_schema: 'lco-spec/1.0',
      spec_version: 1,
      project: { name: 'synthetic', mode: 'greenfield' },
      complexity_profile: 'p-standard',
      evidence_snapshot: {
        pack_hash: 'sha256:' + 'a'.repeat(64),
        collected_at: '2026-08-18T00:00:00Z',
      },
      state: 'draft',
      council_run: { run_id: 'r1', config_fingerprint: 'f1' },
      artifact_hashes: {},
      unresolved_count: 0,
      blocking_count: 0,
      target_runtime: { platform: 'node', stack: 'ts' },
    },
    intent: { statement: 'synthetic', normalized: 'synthetic' },
    glossary: [],
    assumptions: [],
    evidence: (overrides.evidence ?? ['E-0001']).map((id) => ({
      id,
      kind: 'user_input',
      source: 'synthetic',
      hash: 'sha256:' + 'b'.repeat(64),
    })),
    requirements: (overrides.requirements ?? [{ id: 'REQ-0001', evidence: ['E-0001'] }]).map(
      (r) => ({
        id: r.id,
        statement: `statement ${r.id}`,
        priority: 'must',
        evidence: r.evidence,
        acceptance_refs: ['TST-0001'],
        terms_used: [],
      }),
    ),
    decisions: (overrides.decisions ?? []).map((d) => ({
      claim_id: d.claim_id,
      decision: 'decision',
      rationale: 'rationale',
      evidence: [],
      confidence: 0.9,
      impact: 'low',
      assumptions: [],
      alternatives: [],
      status: 'accepted',
    })),
    contracts: [],
    tasks: overrides.tasks ?? [mkTask({ task_id: 'TASK-0001' })],
    test_files: [],
  };
  // Guarantee the synthetic shape is a genuinely valid SpecBundle.
  return SpecBundleSchema.parse(bundle);
}
