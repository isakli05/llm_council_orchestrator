import { describe, it, expect } from 'vitest';
import { rule } from './l14';
import { isJudgeableExpect } from '../../check/expect';
import { SpecBundleSchema, type SpecBundle, type TaskContract } from '../../schemas';

/**
 * L14_UNPARSEABLE_EXPECT (BACK-004): an `expect` the runner could never judge
 * is a lint ERROR — the shared grammar module (check/expect) decides what is
 * judgeable, and the rule consults it, so schema/lint and the runner can never
 * disagree. Inline minimal bundle.
 */

const SHA =
  'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

function bundleWithExpects(expects: string[]): SpecBundle {
  const task = {
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
    verification: expects.map((expect, i) => ({ command: `cmd-${i}`, expect })),
    acceptance: ['a'],
    rollback: 'r',
    completion_evidence: { required: ['test_summary'] },
    risk: { level: 'low', note: '' },
    complexity: 'xs',
  } satisfies TaskContract;
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
  });
}

describe('isJudgeableExpect (the shared grammar)', () => {
  it("'exit 0' / 'exit 3' / prose-with-embedded 'exit 1' -> judgeable", () => {
    expect(isJudgeableExpect('exit 0')).toBe(true);
    expect(isJudgeableExpect('exit 3')).toBe(true);
    expect(isJudgeableExpect('suite passes with exit 0 and no diff')).toBe(true);
  });

  it("'exit code 0, all cases pass' (fixture prose) -> NOT judgeable", () => {
    expect(isJudgeableExpect('exit code 0, all cases pass')).toBe(false);
  });

  it("no exit token at all -> NOT judgeable", () => {
    expect(isJudgeableExpect('çıktı boş olmalı')).toBe(false);
  });
});

describe('L14_UNPARSEABLE_EXPECT', () => {
  it('parseable expects -> zero findings', () => {
    expect(rule.check(bundleWithExpects(['exit 0', 'expect exit 1 afterwards']))).toEqual([]);
  });

  it("unparseable expect -> ERROR naming the task, the expect text, and the grammar", () => {
    const findings = rule.check(bundleWithExpects(['exit 0', 'exit code 0, all cases pass']));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: 'L14_UNPARSEABLE_EXPECT',
      severity: 'error',
      path: 'TASK-0001',
    });
    expect(findings[0].message).toContain('exit code 0, all cases pass');
    expect(findings[0].message).toMatch(/exit \d+/); // the message teaches the grammar
  });
});
