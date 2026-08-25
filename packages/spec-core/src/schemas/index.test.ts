import { describe, it, expect } from 'vitest';
import * as schemas from './index';
import {
  SpecBundleSchema,
  TraceEdgeSchema,
  ManifestSchema,
  IntentSchema,
  GlossaryEntrySchema,
  EvidenceItemSchema,
  RequirementSchema,
  DecisionSchema,
  ContractSchema,
  TaskContractSchema,
  LegacyPackageSchema,
} from './index';

describe('scaffold', () => {
  it('package is importable and exports a version constant', async () => {
    const mod = await import('./index');
    expect(mod.SPEC_SCHEMA_VERSION).toBe('lco-spec/1.0');
  });
});

describe('schema barrel', () => {
  it('exports every schema named in the W1 contract', () => {
    const expected = [
      'SPEC_SCHEMA_VERSION',
      'SpecStateSchema',
      'ImpactLevelSchema',
      'ComplexityProfileSchema',
      'Sha256Schema',
      'IdSchema',
      'ManifestSchema',
      'IntentSchema',
      'GlossaryEntrySchema',
      'EvidenceItemSchema',
      'RequirementSchema',
      'DecisionSchema',
      'ContractSchema',
      'TaskContractSchema',
      'LegacyPackageSchema',
      'SpecBundleSchema',
      'TraceEdgeSchema',
    ];
    for (const name of expected) {
      expect(schemas, `missing export: ${name}`).toHaveProperty(name);
    }
  });
});

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

const validBundle = {
  manifest: validManifest,
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
  tasks: [
    {
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
    },
  ],
  test_files: ['a.test.ts'],
  legacy: {
    as_is_summary: 'Monolith.',
    preserve_change_drop: [
      { behavior: 'CSV import', decision: 'preserve', rationale: 'Load bearing.', evidence: ['E-0001'] },
    ],
  },
};

describe('SpecBundleSchema', () => {
  it('accepts a valid full bundle (with legacy)', () => {
    expect(SpecBundleSchema.parse(validBundle)).toBeTruthy();
  });
  it('accepts a bundle without legacy (optional) — genuinely distinct input', () => {
    const withoutLegacy = structuredClone(validBundle);
    delete (withoutLegacy as { legacy?: unknown }).legacy;
    expect(() => SpecBundleSchema.parse(withoutLegacy)).not.toThrow();
    expect(withoutLegacy).not.toHaveProperty('legacy');
  });
  it('accepts a bundle with a legacy package', () => {
    expect(SpecBundleSchema.parse({
      ...validBundle,
      legacy: {
        as_is_summary: 'Greenfield override.',
        preserve_change_drop: [
          { behavior: 'CSV import', decision: 'change', rationale: 'Replaced.', evidence: ['E-0001'] },
        ],
      },
    })).toBeTruthy();
  });
  it('rejects a bundle missing its manifest (fail-closed core)', () => {
    const { manifest: _m, ...withoutManifest } = validBundle;
    expect(() => SpecBundleSchema.parse(withoutManifest)).toThrow();
  });
  it('rejects a bundle with an invalid nested manifest', () => {
    expect(() => SpecBundleSchema.parse({
      ...validBundle,
      manifest: { ...validManifest, spec_schema: 'other/1' },
    })).toThrow();
  });
  it('rejects bundles with an invalid id anywhere (fail-closed core)', () => {
    expect(() => SpecBundleSchema.parse({
      ...validBundle,
      tasks: [{ ...validBundle.tasks[0], task_id: 'oops' }],
    })).toThrow();
  });
});

describe('TraceEdgeSchema', () => {
  it('accepts a valid edge', () => {
    expect(TraceEdgeSchema.parse({ from: 'REQ-0001', to: 'TASK-0001', kind: 'req-task' })).toBeTruthy();
  });
  it('accepts every documented kind', () => {
    for (const kind of ['req-task', 'task-test', 'dec-task', 'evidence-req']) {
      expect(TraceEdgeSchema.parse({ from: 'REQ-0001', to: 'TASK-0001', kind })).toBeTruthy();
    }
  });
  it('rejects unknown kind', () => {
    expect(() => TraceEdgeSchema.parse({ from: 'REQ-0001', to: 'TASK-0001', kind: 'req-req' })).toThrow();
  });
  it('rejects invalid id format on either end', () => {
    expect(() => TraceEdgeSchema.parse({ from: 'bad', to: 'TASK-0001', kind: 'req-task' })).toThrow();
    expect(() => TraceEdgeSchema.parse({ from: 'REQ-0001', to: 'bad', kind: 'req-task' })).toThrow();
  });
});
