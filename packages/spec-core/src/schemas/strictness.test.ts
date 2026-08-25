import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  SpecBundleSchema,
  ManifestSchema,
  TaskContractSchema,
  DecisionSchema,
} from './index';

/**
 * Strictness alignment: zod yüzeyi generated/spec-schema.json (additionalProperties:false)
 * ile birebir aynı davranmalı — bilinmeyen anahtar RED; metin alanları boşluk-only RED.
 */

const FIXTURES = join(__dirname, '../../fixtures');

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

/** Her test kendi klonunu alır — mutation sızıntısı yok. */
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

describe('strictness: unknown keys rejected at every level', () => {
  it('rejects an extra key at the bundle root', () => {
    const b = baseBundle();
    (b as Record<string, unknown>).surprise = 'x';
    expect(() => SpecBundleSchema.parse(b)).toThrow(/unrecognized/i);
  });

  it('rejects an extra key in manifest', () => {
    const b = baseBundle();
    (b.manifest as Record<string, unknown>).extra = 1;
    expect(() => SpecBundleSchema.parse(b)).toThrow(/unrecognized/i);
  });

  it('rejects an extra key in a nested manifest object (project)', () => {
    const m = structuredClone(validManifest);
    (m.project as Record<string, unknown>).oops = true;
    expect(() => ManifestSchema.parse(m)).toThrow(/unrecognized/i);
  });

  it('rejects an extra key in a task object', () => {
    const b = baseBundle();
    (b.tasks as Record<string, unknown>[])[0].surprise = 'x';
    expect(() => SpecBundleSchema.parse(b)).toThrow(/unrecognized/i);
  });

  it('rejects an extra key in task.refs', () => {
    const t = structuredClone(validTask);
    (t.refs as Record<string, unknown>).extra = [];
    expect(() => TaskContractSchema.parse(t)).toThrow(/unrecognized/i);
  });

  it('rejects an extra key in a verification item', () => {
    const t = structuredClone(validTask);
    (t.verification as Record<string, unknown>[])[0].timeout = 30;
    expect(() => TaskContractSchema.parse(t)).toThrow(/unrecognized/i);
  });

  it('rejects an extra key in a decision.alternatives item', () => {
    const d = {
      claim_id: 'DEC-0001',
      decision: 'Use Zod',
      rationale: 'Because.',
      evidence: [],
      confidence: 0.8,
      impact: 'medium',
      assumptions: [],
      alternatives: [{ option: 'ajv', rejected_because: 'two sources of truth', extra: 1 }],
      status: 'accepted',
    };
    expect(() => DecisionSchema.parse(d)).toThrow(/unrecognized/i);
  });

  it('rejects an extra key in task.risk and task.tests[] item', () => {
    const withRiskExtra = structuredClone(validTask);
    (withRiskExtra.risk as Record<string, unknown>).owner = 'x';
    expect(() => TaskContractSchema.parse(withRiskExtra)).toThrow(/unrecognized/i);

    const withTestExtra = structuredClone(validTask);
    (withTestExtra.tests as Record<string, unknown>[])[0].skip = true;
    expect(() => TaskContractSchema.parse(withTestExtra)).toThrow(/unrecognized/i);
  });
});

describe('strictness: whitespace-only text rejected (trim + min(1))', () => {
  const blanks = ['   ', ' \t\n '];

  for (const blank of blanks) {
    it(`TaskContractSchema rejects title="${JSON.stringify(blank).slice(1, -1)}-only"`, () => {
      const t = structuredClone(validTask);
      t.title = blank;
      expect(() => TaskContractSchema.parse(t)).toThrow();
    });
  }

  it('rejects whitespace-only instructions', () => {
    const t = structuredClone(validTask);
    t.instructions = '   ';
    expect(() => TaskContractSchema.parse(t)).toThrow();
  });

  it('rejects whitespace-only rollback', () => {
    const t = structuredClone(validTask);
    t.rollback = '  ';
    expect(() => TaskContractSchema.parse(t)).toThrow();
  });

  it('rejects whitespace-only verification.command', () => {
    const t = structuredClone(validTask);
    (t.verification as Record<string, unknown>[])[0].command = '  ';
    expect(() => TaskContractSchema.parse(t)).toThrow();
  });

  it('rejects whitespace-only verification.expect, tests[].file, tests[].cases item', () => {
    const t1 = structuredClone(validTask);
    (t1.verification as Record<string, unknown>[])[0].expect = ' ';
    expect(() => TaskContractSchema.parse(t1)).toThrow();

    const t2 = structuredClone(validTask);
    (t2.tests as Record<string, unknown>[])[0].file = ' ';
    expect(() => TaskContractSchema.parse(t2)).toThrow();

    const t3 = structuredClone(validTask);
    (t3.tests as Record<string, unknown>[])[0].cases = ['ok', ' '];
    expect(() => TaskContractSchema.parse(t3)).toThrow();
  });

  it('rejects whitespace-only purpose', () => {
    const t = structuredClone(validTask);
    t.purpose = '\t';
    expect(() => TaskContractSchema.parse(t)).toThrow();
  });

  it('trims surrounding whitespace on parse (output is normalized)', () => {
    const t = structuredClone(validTask);
    t.title = '  Real title  ';
    t.instructions = '  Do the thing ';
    t.verification = [{ command: ' npm test ', expect: ' exit 0 ' }];
    const out = TaskContractSchema.parse(t);
    expect(out.title).toBe('Real title');
    expect(out.instructions).toBe('Do the thing');
    expect(out.verification[0]).toEqual({ command: 'npm test', expect: 'exit 0' });
  });
});

describe('strictness: fixtures stay aligned', () => {
  const goodDirs = readdirSync(join(FIXTURES, 'good')).filter((d) => !d.startsWith('.')).sort();
  const badDirs = readdirSync(join(FIXTURES, 'bad')).filter((d) => !d.startsWith('.')).sort();
  const schemaErrorVectors = ['L09', 'L11', 'schema-invalid'];

  it('all good fixtures still parse under strictness (no extra keys hiding in them)', () => {
    expect(goodDirs.length).toBeGreaterThanOrEqual(5);
    for (const d of goodDirs) {
      const b = JSON.parse(readFileSync(join(FIXTURES, 'good', d, 'bundle.json'), 'utf8'));
      expect(() => SpecBundleSchema.parse(b), `good fixture ${d} must parse`).not.toThrow();
    }
  });

  it('non-schema-error bad vectors (lint/freeze/drift) still parse — their seeded fault is not an extra key', () => {
    const nonSchemaVectors = badDirs.filter((d) => !schemaErrorVectors.includes(d));
    for (const d of nonSchemaVectors) {
      const b = JSON.parse(readFileSync(join(FIXTURES, 'bad', d, 'bundle.json'), 'utf8'));
      expect(() => SpecBundleSchema.parse(b), `non-schema vector ${d} must still parse`).not.toThrow();
    }
  });

  it('schema-error vectors (L09, L11, schema-invalid) still throw', () => {
    for (const d of schemaErrorVectors) {
      const b = JSON.parse(readFileSync(join(FIXTURES, 'bad', d, 'bundle.json'), 'utf8'));
      expect(() => SpecBundleSchema.parse(b), `vector ${d} must throw`).toThrow();
    }
  });
});
