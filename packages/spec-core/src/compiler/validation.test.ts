import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadBundleAtLevel, VALIDATION_LEVELS, type ValidationLevel } from './validation';
import type { TaskContract } from '../schemas';

/**
 * BACK-006 acceptance tests (RED first): NAMED validation levels for spec
 * consumers. `compile` = shape-valid (schema + unique task ids). `lint-clean`
 * = compile + referential closure + judgeable verification contracts. A
 * consumer that declares a level gets a bundle that satisfies it — or an
 * actionable refusal, never a silently-degraded result.
 */

const FIXTURES = join(__dirname, '../../fixtures');

const SECTION_FILES = [
  'manifest',
  'intent',
  'glossary',
  'assumptions',
  'evidence',
  'requirements',
  'decisions',
  'contracts',
  'tasks',
] as const;

const tmpDirs: string[] = [];

function makeSpecRoot(bundle: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), 'spec-core-levels-'));
  tmpDirs.push(root);
  const spec = join(root, 'spec');
  mkdirSync(spec);
  for (const name of [...SECTION_FILES, 'legacy'] as const) {
    if (bundle[name] === undefined) continue;
    writeFileSync(join(spec, `${name}.json`), JSON.stringify(bundle[name], null, 2));
  }
  return root;
}

function loadBundle(rel: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(FIXTURES, rel), 'utf8')) as Record<string, unknown>;
}

const SHA =
  'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

/** An inline fully-conforming bundle (closure-clean, judgeable expects). */
function inlineConforming(): Record<string, unknown> {
  return {
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
  };
}

afterEach(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  tmpDirs.length = 0;
});

describe('VALIDATION_LEVELS', () => {
  it('declares exactly the two load levels (frozen+verified stays the freeze/verify product, not a load level)', () => {
    expect(VALIDATION_LEVELS).toEqual(['compile', 'lint-clean']);
  });
});

describe('loadBundleAtLevel: compile level', () => {
  it('a schema-valid bundle loads (closure is NOT checked at this level)', async () => {
    const mutated = loadBundle('good/pet-clinic/bundle.json');
    const tasks = mutated.tasks as TaskContract[];
    tasks[0].depends_on = [...tasks[0].depends_on, 'TASK-9999']; // dangling dep

    const result = await loadBundleAtLevel(makeSpecRoot(mutated), 'compile');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bundle.tasks).toHaveLength(3);
  });

  it('duplicate task ids are rejected even at compile level (BACK-006)', async () => {
    const mutated = loadBundle('good/pet-clinic/bundle.json');
    const tasks = mutated.tasks as TaskContract[];
    tasks.push(structuredClone(tasks[0]));

    const result = await loadBundleAtLevel(makeSpecRoot(mutated), 'compile');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(2);
  });
});

describe('loadBundleAtLevel: lint-clean level', () => {
  it('a fully conforming inline bundle loads with its (clean) lint result', async () => {
    const result = await loadBundleAtLevel(makeSpecRoot(inlineConforming()), 'lint-clean');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bundle.tasks).toHaveLength(1);
      expect(result.lint.errors).toEqual([]);
      expect(result.lint.warnings).toEqual([]);
    }
  });

  it('a lint-dirty bundle -> actionable refusal: code 2, every error listed, names lco lint', async () => {
    const mutated = loadBundle('good/pet-clinic/bundle.json');
    const tasks = mutated.tasks as TaskContract[];
    tasks[0].depends_on = [...tasks[0].depends_on, 'TASK-9999'];

    const result = await loadBundleAtLevel(makeSpecRoot(mutated), 'lint-clean');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(2);
      expect(result.output).toContain('lint');
      expect(result.output).toContain('lco lint');
      // The dangling dependency is NAMED in the refusal.
      expect(result.output).toContain('TASK-9999');
    }
  });

  it('compile failure keeps the compile error surface (missing file)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'spec-core-levels-empty-'));
    tmpDirs.push(root);
    mkdirSync(join(root, 'spec'));

    const result = await loadBundleAtLevel(root, 'lint-clean');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(2);
      expect(result.output).toContain('compile FAILED');
    }
  });

  it('level typing sanity: every level is one of VALIDATION_LEVELS', () => {
    const level: ValidationLevel = 'compile';
    expect(VALIDATION_LEVELS).toContain(level);
  });
});
