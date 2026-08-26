import { describe, it, expect } from 'vitest';
import { closureFindings, duplicateTaskIds } from './closure';
import { SpecBundleSchema, type SpecBundle, type TaskContract } from '../schemas';

/**
 * BACK-003 acceptance tests (RED first): a schema-valid bundle must be
 * REFERENTIALLY CLOSED — every cross-reference resolves to an entity that
 * exists in the bundle. These tests use an inline minimal CONFORMING bundle
 * (not the shared fixtures): the shared fixtures are conformed in T8.
 */

const SHA =
  'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

/** The minimal fully-conforming bundle: closure-clean, lint-clean, judgeable. */
function miniBundle(overrides: Partial<SpecBundle> = {}): SpecBundle {
  const task: TaskContract = {
    task_id: 'TASK-0001',
    title: 't',
    purpose: 'p',
    refs: { requirements: ['REQ-0001'], architecture: [], decisions: ['DEC-0001'] },
    depends_on: [],
    preconditions: ['c'],
    permitted_scope: ['src/**'],
    protected: [],
    interface_changes: [],
    invariants: ['i'],
    instructions: 'do',
    tests: [
      { id: 'TST-0001', kind: 'unit', file: 'a.test.ts', cases: ['REQ-0001: works'] },
    ],
    verification: [{ command: 'node --version', expect: 'exit 0' }],
    acceptance: ['a'],
    rollback: 'r',
    completion_evidence: { required: ['test_summary'] },
    risk: { level: 'low', note: '' },
    complexity: 'xs',
  };
  return SpecBundleSchema.parse({
    manifest: {
      spec_schema: 'lco-spec/1.0',
      spec_version: 1,
      project: { name: 'mini', mode: 'greenfield' },
      complexity_profile: 'p-mini',
      evidence_snapshot: { pack_hash: SHA, collected_at: '2026-08-27T00:00:00Z' },
      state: 'draft',
      council_run: { run_id: 't', config_fingerprint: 't' },
      artifact_hashes: {},
      unresolved_count: 0,
      blocking_count: 0,
      target_runtime: { platform: 'node', stack: 'ts' },
    },
    intent: { statement: 's', normalized: 'n' },
    glossary: [{ term: 'Term', definition: 'd' }],
    assumptions: [],
    evidence: [{ id: 'E-0001', kind: 'user_input', source: 's', hash: SHA }],
    requirements: [
      {
        id: 'REQ-0001',
        statement: 'must work',
        priority: 'must',
        evidence: ['E-0001'],
        acceptance_refs: ['TST-0001'],
        terms_used: [],
      },
    ],
    decisions: [
      {
        claim_id: 'DEC-0001',
        decision: 'd',
        rationale: 'r',
        evidence: ['E-0001'],
        confidence: 1,
        impact: 'low',
        assumptions: [],
        alternatives: [],
        status: 'accepted',
      },
    ],
    contracts: [],
    tasks: [task],
    test_files: ['a.test.ts'],
    ...overrides,
  });
}

describe('closureFindings: the conforming control', () => {
  it('a fully-resolved bundle yields ZERO findings', () => {
    expect(closureFindings(miniBundle())).toEqual([]);
  });
});

describe('closureFindings: evidence references (BACK-003)', () => {
  it('requirement citing nonexistent E-9999 -> MISSING_EVIDENCE_REF naming both ids', () => {
    const b = miniBundle({
      requirements: [
        {
          id: 'REQ-0001',
          statement: 'must work',
          priority: 'must',
          evidence: ['E-0001', 'E-9999'],
          acceptance_refs: ['TST-0001'],
          terms_used: [],
        },
      ],
    });
    const findings = closureFindings(b);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ code: 'MISSING_EVIDENCE_REF' });
    expect(findings[0].path).toContain('REQ-0001');
    expect(findings[0].message).toContain('E-9999');
  });

  it('decision citing nonexistent evidence -> MISSING_EVIDENCE_REF', () => {
    const b = miniBundle({
      decisions: [
        {
          claim_id: 'DEC-0001',
          decision: 'd',
          rationale: 'r',
          evidence: ['E-9999'],
          confidence: 1,
          impact: 'low',
          assumptions: [],
          alternatives: [],
          status: 'accepted',
        },
      ],
    });
    expect(closureFindings(b).map((f) => f.code)).toEqual(['MISSING_EVIDENCE_REF']);
  });

  it('assumption citing nonexistent evidence -> MISSING_EVIDENCE_REF', () => {
    const b = miniBundle({
      assumptions: [
        { id: 'AS-0001', statement: 's', evidence: ['E-9999'], impact_if_wrong: 'w' },
      ],
    });
    expect(closureFindings(b).map((f) => f.code)).toEqual(['MISSING_EVIDENCE_REF']);
  });
});

describe('closureFindings: decision / requirement references (BACK-003)', () => {
  it('task referencing nonexistent DEC-9999 -> MISSING_DECISION_REF', () => {
    const b = miniBundle();
    b.tasks[0].refs.decisions = ['DEC-0001', 'DEC-9999'];
    const findings = closureFindings(b);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ code: 'MISSING_DECISION_REF' });
    expect(findings[0].message).toContain('DEC-9999');
  });

  it('task referencing nonexistent REQ-9999 -> MISSING_REQUIREMENT_REF', () => {
    const b = miniBundle();
    b.tasks[0].refs.requirements = ['REQ-9999'];
    const findings = closureFindings(b);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ code: 'MISSING_REQUIREMENT_REF' });
    expect(findings[0].message).toContain('REQ-9999');
  });
});

describe('closureFindings: task dependencies (BACK-003)', () => {
  it('depends_on TASK-9999 (no such task) -> MISSING_TASK_DEP naming the unknown id', () => {
    const b = miniBundle();
    b.tasks[0].depends_on = ['TASK-9999'];
    const findings = closureFindings(b);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ code: 'MISSING_TASK_DEP' });
    expect(findings[0].message).toContain('TASK-0001');
    expect(findings[0].message).toContain('TASK-9999');
  });

  it('a dependency on an EXISTING task is not a finding', () => {
    const b = miniBundle();
    const second = structuredClone(b.tasks[0]);
    second.task_id = 'TASK-0002';
    second.depends_on = ['TASK-0001'];
    second.tests = []; // no second TST-0001: duplicate test ids stay out of scope here
    b.tasks.push(second);
    expect(closureFindings(b)).toEqual([]);
  });
});

describe('closureFindings: acceptance_refs resolve against tests[].id (BACK-003)', () => {
  it('acceptance_refs TST-9999 with no such test -> MISSING_TEST_REF', () => {
    const b = miniBundle();
    b.requirements[0].acceptance_refs = ['TST-9999'];
    const findings = closureFindings(b);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ code: 'MISSING_TEST_REF' });
    expect(findings[0].message).toContain('TST-9999');
  });

  it('the same TST id on two test entries -> DUPLICATE_TEST_ID (ambiguous resolution)', () => {
    const b = miniBundle();
    b.tasks[0].tests = [
      { id: 'TST-0001', kind: 'unit', file: 'a.test.ts', cases: ['REQ-0001: works'] },
      { id: 'TST-0001', kind: 'unit', file: 'b.test.ts', cases: ['REQ-0001: again'] },
    ];
    const findings = closureFindings(b);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ code: 'DUPLICATE_TEST_ID' });
  });

  it('acceptance_ref resolved by a test on ANOTHER task is still resolved', () => {
    const b = miniBundle();
    const second = structuredClone(b.tasks[0]);
    second.task_id = 'TASK-0002';
    second.tests = [
      { id: 'TST-0002', kind: 'unit', file: 'b.test.ts', cases: ['REQ-0001: two'] },
    ];
    b.tasks.push(second);
    b.requirements[0].acceptance_refs = ['TST-0001', 'TST-0002'];
    expect(closureFindings(b)).toEqual([]);
  });
});

describe('duplicateTaskIds: compile-level uniqueness (BACK-006)', () => {
  it('no duplicates -> empty', () => {
    expect(duplicateTaskIds(miniBundle().tasks)).toEqual([]);
  });

  it('two tasks with the same task_id -> the id reported once with its count', () => {
    const b = miniBundle();
    const twin = structuredClone(b.tasks[0]);
    b.tasks.push(twin); // same TASK-0001
    expect(duplicateTaskIds(b.tasks)).toEqual([
      { task_id: 'TASK-0001', count: 2 },
    ]);
  });
});
