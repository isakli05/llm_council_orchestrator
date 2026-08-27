import { describe, it, expect } from 'vitest';
import { SpecBundleSchema, TaskContractSchema } from './index';
import { INPUT_CEILINGS } from './limits';

/**
 * PERF-001 input ceilings: schema-level maxima chosen ~10x+ above the largest
 * observed fixture/eval corpus usage (measured before choosing — see the
 * table in limits.ts). The ceilings bound hostile/accidental MCP and LLM
 * input BEFORE the quadratic lint/hash work runs on it; errors must name the
 * limit and the way out (actionable, not just "too big").
 */

const validManifest = {
  spec_schema: 'lco-spec/1.0',
  spec_version: 1,
  project: { name: 'demo', mode: 'greenfield' },
  complexity_profile: 'p-standard',
  evidence_snapshot: { pack_hash: `sha256:${'a'.repeat(64)}`, collected_at: '2026-08-18T00:00:00Z' },
  state: 'draft',
  council_run: { run_id: 'run-1', config_fingerprint: 'fp-1' },
  artifact_hashes: { 'intent.md': `sha256:${'b'.repeat(64)}` },
  unresolved_count: 0,
  blocking_count: 0,
  target_runtime: { platform: 'node', stack: 'typescript' },
};

const validTask = {
  task_id: 'TASK-0001',
  title: 't',
  purpose: 'p',
  refs: { requirements: ['REQ-0001'], architecture: [], decisions: ['DEC-0001'] },
  depends_on: [],
  preconditions: ['pc'],
  permitted_scope: ['src/**'],
  protected: [],
  interface_changes: [],
  invariants: ['inv'],
  instructions: 'do',
  tests: [{ kind: 'unit', file: 'a.test.ts', cases: ['c1'] }],
  verification: [{ command: 'npm test', expect: 'exit 0' }],
  acceptance: ['ac'],
  rollback: 'git revert',
  completion_evidence: { required: ['test_summary'] },
  risk: { level: 'low', note: '' },
  complexity: 'xs',
};

function baseBundle(): Record<string, unknown> {
  return {
    manifest: structuredClone(validManifest),
    intent: { statement: 'Build it', normalized: 'build it' },
    glossary: [{ term: 'Evidence', definition: 'Hashed, sourced artifact.' }],
    assumptions: [
      { id: 'AS-0001', statement: 'Zod stays maintained', evidence: ['E-0001'], impact_if_wrong: 'Rewrite IR layer.' },
    ],
    evidence: [
      { id: 'E-0001', kind: 'user_input', source: 'interviews/1.md', hash: `sha256:${'c'.repeat(64)}` },
    ],
    requirements: [
      {
        id: 'REQ-0001',
        statement: 'The system shall gate merges on evidence.',
        priority: 'must',
        evidence: ['E-0001'],
        acceptance_refs: ['TST-0001'],
      },
    ],
    decisions: [
      {
        claim_id: 'DEC-0001',
        decision: 'Use Zod',
        rationale: 'Inference + runtime validation.',
        evidence: ['E-0001'],
        confidence: 0.8,
        impact: 'medium',
        assumptions: [],
        alternatives: [],
        status: 'accepted',
      },
    ],
    contracts: [
      { id: 'CON-0001', kind: 'openapi', symbol: 'GET /x', definition: '...' },
    ],
    tasks: [structuredClone(validTask)],
    test_files: ['a.test.ts'],
  };
}

/** TASK-0001..TASK-NNNN (ids stay inside the 4-digit schema range). */
function tasks(n: number): Record<string, unknown>[] {
  return Array.from({ length: n }, (_, i) => ({
    ...structuredClone(validTask),
    task_id: `TASK-${String(i + 1).padStart(4, '0')}`,
    tests: [{ kind: 'unit' as const, file: 'a.test.ts', cases: ['c1'] }],
  }));
}

describe('input ceilings — bundle-level counts (PERF-001)', () => {
  it(`accepts a bundle at exactly ${INPUT_CEILINGS.tasksPerBundle} tasks (the ceiling is a wall, not a tripwire)`, () => {
    const b = baseBundle();
    b.tasks = tasks(INPUT_CEILINGS.tasksPerBundle);
    expect(() => SpecBundleSchema.parse(b)).not.toThrow();
  });

  it('rejects a bundle over the task ceiling with an actionable split message', () => {
    const b = baseBundle();
    b.tasks = tasks(INPUT_CEILINGS.tasksPerBundle + 1);
    expect(() => SpecBundleSchema.parse(b)).toThrow(/split the spec/i);
  });

  it('rejects over the evidence-entry ceiling with an actionable message', () => {
    const b = baseBundle();
    b.evidence = Array.from({ length: INPUT_CEILINGS.evidencePerBundle + 1 }, (_, i) => ({
      id: `E-${String(i + 1).padStart(4, '0')}`,
      kind: 'doc',
      source: 'docs/x.md',
      hash: `sha256:${'c'.repeat(64)}`,
    }));
    expect(() => SpecBundleSchema.parse(b)).toThrow(/evidence/i);
  });

  it('rejects over the requirements ceiling', () => {
    const b = baseBundle();
    b.requirements = Array.from({ length: INPUT_CEILINGS.requirementsPerBundle + 1 }, (_, i) => ({
      id: `REQ-${String(i + 1).padStart(4, '0')}`,
      statement: 's',
      priority: 'must',
      evidence: ['E-0001'],
      acceptance_refs: ['TST-0001'],
    }));
    expect(() => SpecBundleSchema.parse(b)).toThrow(/requirements/i);
  });
});

describe('input ceilings — task-level counts (PERF-001)', () => {
  it('rejects a task with too many depends_on entries', () => {
    const t = structuredClone(validTask);
    t.depends_on = Array.from({ length: INPUT_CEILINGS.dependsOnPerTask + 1 }, (_, i) => `TASK-${String(i + 2).padStart(4, '0')}`);
    expect(() => TaskContractSchema.parse(t)).toThrow(/depends_on/i);
  });

  it('rejects a task with too many permitted_scope entries', () => {
    const t = structuredClone(validTask);
    t.permitted_scope = Array.from({ length: INPUT_CEILINGS.scopeEntriesPerTask + 1 }, (_, i) => `src/d${i}/**`);
    expect(() => TaskContractSchema.parse(t)).toThrow(/permitted_scope/i);
  });

  it('rejects a task with too many requirement refs', () => {
    const t = structuredClone(validTask);
    t.refs = {
      requirements: Array.from({ length: INPUT_CEILINGS.refsPerTask + 1 }, (_, i) => `REQ-${String(i + 1).padStart(4, '0')}`),
      architecture: [],
      decisions: [],
    };
    expect(() => TaskContractSchema.parse(t)).toThrow(/refs/i);
  });

  it('rejects a task with too many tests entries', () => {
    const t = structuredClone(validTask);
    t.tests = Array.from({ length: INPUT_CEILINGS.testsPerTask + 1 }, () => ({ kind: 'unit', file: 'a.test.ts', cases: ['c1'] }));
    expect(() => TaskContractSchema.parse(t)).toThrow(/tests/i);
  });
});

describe('input ceilings — prose lengths (PERF-001)', () => {
  it('rejects an over-long title', () => {
    const t = structuredClone(validTask);
    t.title = 'x'.repeat(INPUT_CEILINGS.charsTitle + 1);
    expect(() => TaskContractSchema.parse(t)).toThrow(/title/i);
  });

  it('rejects over-long instructions', () => {
    const t = structuredClone(validTask);
    t.instructions = 'x'.repeat(INPUT_CEILINGS.charsInstructions + 1);
    expect(() => TaskContractSchema.parse(t)).toThrow(/instructions/i);
  });

  it('accepts prose at exactly the ceiling', () => {
    const t = structuredClone(validTask);
    t.title = 'x'.repeat(INPUT_CEILINGS.charsTitle);
    t.instructions = 'y'.repeat(INPUT_CEILINGS.charsInstructions);
    expect(() => TaskContractSchema.parse(t)).not.toThrow();
  });
});

describe('input ceilings — the table itself', () => {
  it('every ceiling is positive and the object is frozen intent (no accidental zeros)', () => {
    for (const [key, value] of Object.entries(INPUT_CEILINGS)) {
      expect(Number.isInteger(value), `${key} must be an integer`).toBe(true);
      expect(value as number, `${key} must be positive`).toBeGreaterThan(0);
    }
  });
});
