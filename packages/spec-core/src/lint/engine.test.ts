import { describe, it, expect } from 'vitest';
import { lintBundle, RULES, type LintRule } from './engine';
import { LINT_RULES } from './types';
import { SpecBundleSchema, type SpecBundle } from '../schemas';

const SHA =
  'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

/**
 * Inline fully-conforming bundle (closure-clean, judgeable expects, test
 * ids). T7: pet-clinic served as the engine's clean control, but fixtures
 * conform to the new L13/L14 rules only in T8 — the engine mechanics need a
 * clean control NOW.
 */
function cleanBundle(): SpecBundle {
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
    tasks: [
      {
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
      },
    ],
    test_files: ['a.test.ts'],
  });
}

describe('lint engine rule registry', () => {
  it('RULES registers exactly the twelve lint rules, once each, in id order', () => {
    expect(RULES.map((r) => r.id)).toEqual([...LINT_RULES]);
  });

  it('a good bundle produces zero findings and an all-zero summary', () => {
    const result = lintBundle(cleanBundle());

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.summary).toEqual(
      Object.fromEntries(LINT_RULES.map((id) => [id, 0])),
    );
  });
});

describe('lint engine rule execution (temporary rule, restored after)', () => {
  it('runs every registered rule and buckets findings by severity with per-rule summary counts', () => {
    const rule: LintRule = {
      id: 'L02_ORPHAN_REQUIREMENT',
      check: () => [
        {
          rule: 'L02_ORPHAN_REQUIREMENT',
          severity: 'error',
          path: 'requirements[1]',
          message: 'requirement is not referenced by any task',
        },
        {
          rule: 'L02_ORPHAN_REQUIREMENT',
          severity: 'warning',
          path: 'requirements[2]',
          message: 'requirement referenced by no test case',
        },
      ],
    };
    RULES.push(rule);
    try {
      const result = lintBundle(cleanBundle());

      // the real L02 rule finds nothing on pet-clinic; the temp rule owns the
      // count because summary is keyed by rule id (last write wins)
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].path).toBe('requirements[1]');
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].severity).toBe('warning');
      expect(result.summary['L02_ORPHAN_REQUIREMENT']).toBe(2);
    } finally {
      RULES.pop();
    }
  });

  it('a rule that finds nothing contributes a zero count and no findings', () => {
    const rule: LintRule = { id: 'L06_DUPLICATE_ID', check: () => [] };
    RULES.push(rule);
    try {
      const result = lintBundle(cleanBundle());

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.summary['L06_DUPLICATE_ID']).toBe(0);
    } finally {
      RULES.pop();
    }
  });
});
