import { describe, it, expect } from 'vitest';
import {
  AssumptionIdSchema,
  ContractIdSchema,
  DecisionIdSchema,
  EvidenceIdSchema,
  IdSchema,
  RequirementIdSchema,
  TaskIdSchema,
  TestIdSchema,
} from './common';
import { RequirementSchema } from './requirements';
import { DecisionSchema } from './decisions';
import { EvidenceItemSchema } from './evidence';
import { ContractSchema } from './contracts';
import { TaskContractSchema, type TaskContract } from './tasks';

/**
 * BACK-003 acceptance tests (RED first): namespace-specific id schemas — a
 * WRONG namespace in a reference field is a SCHEMA error, not a lint finding.
 * The broad single regex that accepted every prefix in every field is gone.
 */

describe('namespace schemas accept exactly their own prefix', () => {
  const cases: Array<[typeof EvidenceIdSchema, string[], string[]]> = [
    [
      EvidenceIdSchema,
      ['E-0001', 'E-9999'],
      ['EV-0001', 'REQ-0001', 'DEC-0001', 'TASK-0001', 'TST-0001', 'AS-0001', 'CON-0001', 'E-1', 'E-00001', 'e-0001', 'X-E-0001'],
    ],
    [DecisionIdSchema, ['DEC-0001'], ['REQ-0001', 'TASK-0001', 'E-0001', 'TST-0001', 'DEC-1', 'dec-0001']],
    [
      RequirementIdSchema,
      ['REQ-0001', 'OPS-0001', 'UX-0001', 'ARC-0001', 'DAT-0001', 'SEC-0001', 'LGC-0001'],
      ['DEC-0001', 'TASK-0001', 'E-0001', 'TST-0001', 'CON-0001', 'AS-0001', 'REQ-1', 'req-0001'],
    ],
    [TaskIdSchema, ['TASK-0001'], ['REQ-0001', 'DEC-0001', 'TST-0001', 'E-0001', 'TASK-1', 'task-0001']],
    [TestIdSchema, ['TST-0001'], ['REQ-0001', 'TASK-0001', 'E-0001', 'TST-1', 'tst-0001']],
    [ContractIdSchema, ['CON-0001'], ['REQ-0001', 'DEC-0001', 'CON-1']],
    [AssumptionIdSchema, ['AS-0001'], ['REQ-0001', 'E-0001', 'AS-1']],
  ];
  for (const [schema, good, bad] of cases) {
    for (const id of good) {
      it(`${id} accepted`, () => {
        expect(schema.safeParse(id).success).toBe(true);
      });
    }
    for (const id of bad) {
      it(`${id} rejected`, () => {
        expect(schema.safeParse(id).success).toBe(false);
      });
    }
  }

  it('IdSchema (generic, any namespace) still accepts every legal id', () => {
    for (const id of ['E-0001', 'REQ-0001', 'OPS-0001', 'DEC-0001', 'TASK-0001', 'TST-0001', 'CON-0001', 'AS-0001']) {
      expect(IdSchema.safeParse(id).success).toBe(true);
    }
    expect(IdSchema.safeParse('E-1').success).toBe(false);
  });
});

const SHA =
  'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

describe('reference fields reject wrong namespaces at SCHEMA level (BACK-003)', () => {
  it('requirement.evidence must be E-*: a DEC- id there is a schema error', () => {
    const result = RequirementSchema.safeParse({
      id: 'REQ-0001',
      statement: 's',
      priority: 'must',
      evidence: ['DEC-0001'],
      acceptance_refs: ['TST-0001'],
      terms_used: [],
    });
    expect(result.success).toBe(false);
  });

  it('requirement.acceptance_refs must be TST-*: a REQ- id there is a schema error', () => {
    const result = RequirementSchema.safeParse({
      id: 'REQ-0001',
      statement: 's',
      priority: 'must',
      evidence: ['E-0001'],
      acceptance_refs: ['REQ-0002'],
      terms_used: [],
    });
    expect(result.success).toBe(false);
  });

  it('requirement.id accepts the requirement family (REQ-/OPS-)', () => {
    for (const id of ['REQ-0001', 'OPS-0001']) {
      expect(
        RequirementSchema.safeParse({
          id,
          statement: 's',
          priority: 'must',
          evidence: ['E-0001'],
          acceptance_refs: ['TST-0001'],
          terms_used: [],
        }).success,
      ).toBe(true);
    }
  });

  it('decision.evidence must be E-*; decision.claim_id must be DEC-*', () => {
    const decision = {
      decision: 'd',
      rationale: 'r',
      evidence: ['E-0001'],
      confidence: 1,
      impact: 'low',
      assumptions: [],
      alternatives: [],
      status: 'accepted',
    } as const;
    expect(DecisionSchema.safeParse({ claim_id: 'DEC-0001', ...decision }).success).toBe(true);
    expect(DecisionSchema.safeParse({ claim_id: 'REQ-0001', ...decision }).success).toBe(false);
    expect(
      DecisionSchema.safeParse({ claim_id: 'DEC-0001', ...decision, evidence: ['REQ-0001'] }).success,
    ).toBe(false);
  });

  it('evidence.id must be E-*', () => {
    const item = { kind: 'user_input', source: 's', hash: SHA } as const;
    expect(EvidenceItemSchema.safeParse({ id: 'E-0001', ...item }).success).toBe(true);
    expect(EvidenceItemSchema.safeParse({ id: 'REQ-0001', ...item }).success).toBe(false);
  });

  it('contract.id must be CON-*', () => {
    const contract = { kind: 'ts-signature', symbol: 's()', definition: 'd' } as const;
    expect(ContractSchema.safeParse({ id: 'CON-0001', ...contract }).success).toBe(true);
    expect(ContractSchema.safeParse({ id: 'E-0001', ...contract }).success).toBe(false);
  });

  const baseTask = {
    task_id: 'TASK-0001',
    title: 't',
    purpose: 'p',
    refs: { requirements: ['REQ-0001'], architecture: [], decisions: ['DEC-0001'] },
    depends_on: [] as string[],
    preconditions: ['c'],
    permitted_scope: ['src/**'],
    protected: [],
    interface_changes: [],
    invariants: ['i'],
    instructions: 'do',
    tests: [{ id: 'TST-0001', kind: 'unit' as const, file: 'a.test.ts', cases: ['c'] }],
    verification: [{ command: 'node --version', expect: 'exit 0' }],
    acceptance: ['a'],
    rollback: 'r',
    completion_evidence: { required: ['test_summary' as const] },
    risk: { level: 'low' as const, note: '' },
    complexity: 'xs' as const,
  };

  it('task.depends_on must be TASK-*: a REQ- id there is a schema error', () => {
    expect(TaskContractSchema.safeParse({ ...baseTask, depends_on: ['REQ-0001'] }).success).toBe(false);
    expect(TaskContractSchema.safeParse({ ...baseTask, depends_on: ['TASK-0002'] }).success).toBe(true);
  });

  it('task.refs.requirements must be requirement-family; refs.decisions must be DEC-*', () => {
    expect(
      TaskContractSchema.safeParse({ ...baseTask, refs: { requirements: ['DEC-0001'], architecture: [], decisions: [] } })
        .success,
    ).toBe(false);
    expect(
      TaskContractSchema.safeParse({ ...baseTask, refs: { requirements: [], architecture: [], decisions: ['REQ-0001'] } })
        .success,
    ).toBe(false);
  });

  it('tests[].id is optional but, when present, must be TST-*', () => {
    const withoutId = { ...baseTask, tests: [{ kind: 'unit', file: 'a.test.ts', cases: ['c'] }] };
    expect(TaskContractSchema.safeParse(withoutId).success).toBe(true);
    expect(
      TaskContractSchema.safeParse({
        ...baseTask,
        tests: [{ id: 'REQ-0001', kind: 'unit', file: 'a.test.ts', cases: ['c'] }],
      }).success,
    ).toBe(false);
  });

  it('bogus-but-well-formed ids (E-9999 etc.) still pass the SCHEMA (existence is closure/lint)', () => {
    expect(
      RequirementSchema.safeParse({
        id: 'REQ-0001',
        statement: 's',
        priority: 'must',
        evidence: ['E-9999'],
        acceptance_refs: ['TST-9999'],
        terms_used: [],
      }).success,
    ).toBe(true);
    expect(TaskContractSchema.safeParse({ ...baseTask, depends_on: ['TASK-9999'] }).success).toBe(true);
  });

  it('type sanity: TaskContract remains the 18-field contract (tests[].id optional)', () => {
    const t = TaskContractSchema.parse(baseTask) as TaskContract;
    expect(t.tests[0].id).toBe('TST-0001');
  });
});
