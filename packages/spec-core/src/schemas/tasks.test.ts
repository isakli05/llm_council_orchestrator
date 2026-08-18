import { describe, it, expect } from 'vitest';
import { TaskContractSchema } from './tasks';

const validTask = {
  task_id: 'TASK-0001',
  title: 't',
  purpose: 'p',
  refs: { requirements: ['REQ-0001'], architecture: [], decisions: ['DEC-0001'] },
  depends_on: [],
  preconditions: ['pc'],
  permitted_scope: ['src/**'],
  protected: [],
  interface_changes: [{ symbol: 'f()', file: 'src/a.ts' }],
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

describe('TaskContractSchema', () => {
  it('accepts a valid contract', () => {
    expect(TaskContractSchema.parse(validTask)).toBeTruthy();
  });
  it('rejects bad id format', () => {
    expect(() => TaskContractSchema.parse({ ...validTask, task_id: 'X-1' })).toThrow();
  });
  it('rejects task without verification (fail-closed core)', () => {
    expect(() => TaskContractSchema.parse({ ...validTask, verification: [] })).toThrow();
  });
  it('rejects task without tests (fail-closed core)', () => {
    expect(() => TaskContractSchema.parse({ ...validTask, tests: [] })).toThrow();
  });
  it('rejects test entry without cases', () => {
    expect(() => TaskContractSchema.parse({ ...validTask, tests: [{ kind: 'unit', file: 'a.test.ts', cases: [] }] })).toThrow();
  });
  it('rejects task without completion evidence requirements (fail-closed core)', () => {
    expect(() => TaskContractSchema.parse({
      ...validTask,
      completion_evidence: { required: [] },
    })).toThrow();
  });
  it('rejects unknown completion evidence kind', () => {
    expect(() => TaskContractSchema.parse({
      ...validTask,
      completion_evidence: { required: ['pull_request_link'] },
    })).toThrow();
  });
  it('rejects empty preconditions', () => {
    expect(() => TaskContractSchema.parse({ ...validTask, preconditions: [] })).toThrow();
  });
  it('rejects empty permitted_scope', () => {
    expect(() => TaskContractSchema.parse({ ...validTask, permitted_scope: [] })).toThrow();
  });
  it('rejects empty invariants', () => {
    expect(() => TaskContractSchema.parse({ ...validTask, invariants: [] })).toThrow();
  });
  it('rejects empty acceptance', () => {
    expect(() => TaskContractSchema.parse({ ...validTask, acceptance: [] })).toThrow();
  });
  it('rejects empty rollback', () => {
    expect(() => TaskContractSchema.parse({ ...validTask, rollback: '' })).toThrow();
  });
  it('rejects unknown risk level', () => {
    expect(() => TaskContractSchema.parse({ ...validTask, risk: { level: 'extreme', note: '' } })).toThrow();
  });
  it('rejects unknown complexity', () => {
    expect(() => TaskContractSchema.parse({ ...validTask, complexity: 'xl' })).toThrow();
  });
  it('rejects unknown test kind', () => {
    expect(() => TaskContractSchema.parse({
      ...validTask,
      tests: [{ kind: 'smoke', file: 'a.test.ts', cases: ['c1'] }],
    })).toThrow();
  });
});
