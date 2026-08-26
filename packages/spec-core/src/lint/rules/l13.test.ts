import { describe, it, expect } from 'vitest';
import { lintBundle } from '../engine';
import { SpecBundleSchema, type SpecBundle, type TaskContract } from '../../schemas';

/**
 * L13_BROKEN_REFERENCE (BACK-003): the shared closure validator surfaces as
 * lint ERRORS — inline minimal bundle, not the shared fixtures (T8 conforms
 * those).
 */

const SHA =
  'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

function miniBundle(mutate: (b: SpecBundle) => void): SpecBundle {
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
  const parsed = SpecBundleSchema.parse({
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
  });
  mutate(parsed as SpecBundle);
  return parsed as SpecBundle;
}

describe('L13_BROKEN_REFERENCE', () => {
  it('a conforming bundle: L13 contributes zero findings', () => {
    const result = lintBundle(miniBundle(() => {}));
    expect(result.errors.filter((f) => f.rule === 'L13_BROKEN_REFERENCE')).toEqual([]);
  });

  it('every dangling reference surfaces as an L13 ERROR naming the missing id', () => {
    const result = lintBundle(
      miniBundle((b) => {
        b.tasks[0].depends_on = ['TASK-9999'];
        b.requirements[0].evidence = ['E-9999'];
        b.tasks[0].refs.decisions = ['DEC-9999'];
        b.tasks[0].refs.requirements = ['REQ-9999'];
        b.requirements[0].acceptance_refs = ['TST-9999'];
      }),
    );

    const l13 = result.errors.filter((f) => f.rule === 'L13_BROKEN_REFERENCE');
    const messages = l13.map((f) => f.message).join('\n');
    expect(l13.length).toBe(5);
    expect(l13.every((f) => f.severity === 'error')).toBe(true);
    for (const bogus of ['E-9999', 'DEC-9999', 'REQ-9999', 'TASK-9999', 'TST-9999']) {
      expect(messages).toContain(bogus);
    }
  });

  it('the finding path points at the referencing entity', () => {
    const result = lintBundle(
      miniBundle((b) => {
        b.tasks[0].depends_on = ['TASK-9999'];
      }),
    );
    const l13 = result.errors.filter((f) => f.rule === 'L13_BROKEN_REFERENCE');
    expect(l13[0].path).toContain('TASK-0001');
  });
});
