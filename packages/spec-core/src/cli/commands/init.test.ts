import { describe, it, expect, afterEach } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cmdInit } from './init';
import { compileSpecDir } from '../../compiler/compile';
import { lintBundle } from '../../lint/engine';
import { freeze } from '../../compiler/freeze';
import type { SpecBundle } from '../../schemas';

const NOW = '2026-08-25T12:00:00Z';
/** sha256 of the empty string — verified via `printf '' | sha256sum`. */
const EMPTY_SHA =
  'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

/** The exact section-file set compileSpecDir reads (order mirrors compile.ts). */
const SECTION_PATHS = [
  'spec/manifest.json',
  'spec/intent.json',
  'spec/glossary.json',
  'spec/assumptions.json',
  'spec/evidence.json',
  'spec/requirements.json',
  'spec/decisions.json',
  'spec/contracts.json',
  'spec/tasks.json',
];

const tmpDirs: string[] = [];

function freshRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(root);
  return root;
}

afterEach(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  tmpDirs.length = 0;
});

/**
 * THE acceptance chain: a scaffold is only valid if it is a LIVING spec —
 * compile ok, lint 0/0, freeze ok -> state frozen. Returns the compiled
 * bundle (still in its init-time draft state on disk) for content assertions.
 */
async function compileLintFreeze(root: string): Promise<SpecBundle> {
  const compiled = await compileSpecDir(root);
  expect(
    compiled.ok,
    compiled.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
  ).toBe(true);
  const bundle = compiled.bundle!;

  const lint = lintBundle(bundle);
  expect(lint.errors, JSON.stringify(lint.errors)).toEqual([]);
  expect(lint.warnings, JSON.stringify(lint.warnings)).toEqual([]);

  const frozen = freeze(bundle, lint, NOW);
  expect(frozen.reasons).toEqual([]);
  expect(frozen.ok).toBe(true);
  expect(frozen.bundle!.manifest.state).toBe('frozen');
  return bundle;
}

describe('cmdInit p-mini: living-spec acceptance chain', () => {
  it('init -> exactly the 9 section files -> compile ok -> lint 0 errors/0 warnings -> freeze ok, state frozen', async () => {
    const root = freshRoot('spec-core-init-mini-');

    const result = await cmdInit(root, { profile: 'p-mini', name: 'demo-app', nowIso: NOW });

    expect(result.code).toBe(0);
    expect(result.files).toEqual(SECTION_PATHS);
    // On-disk set matches the returned list exactly (nothing extra snuck in).
    expect(readdirSync(join(root, 'spec')).sort()).toEqual(
      SECTION_PATHS.map((p) => p.slice('spec/'.length)).sort(),
    );

    const b = await compileLintFreeze(root);

    // Section shapes: 1 evidence / 1 glossary term / 1 requirement / 1
    // decision / 0 contracts / 1 task; test_files DERIVED from tasks.
    expect(b.evidence).toHaveLength(1);
    expect(b.glossary).toHaveLength(1);
    expect(b.requirements).toHaveLength(1);
    expect(b.decisions).toHaveLength(1);
    expect(b.contracts).toEqual([]);
    expect(b.tasks).toHaveLength(1);
    expect(b.test_files).toEqual(['example.test.ts']);
    expect(b.assumptions).toEqual([]);

    // Binding content: every EXAMPLE string is real, labeled, replaceable.
    expect(b.manifest).toMatchObject({
      spec_schema: 'lco-spec/1.0',
      spec_version: 1,
      project: { name: 'demo-app', mode: 'greenfield' },
      complexity_profile: 'p-mini',
      evidence_snapshot: { pack_hash: EMPTY_SHA, collected_at: NOW },
      state: 'draft',
      council_run: { run_id: 'manual', config_fingerprint: 'manual' },
      artifact_hashes: {},
      unresolved_count: 0,
      blocking_count: 0,
      target_runtime: { platform: 'unspecified', stack: 'unspecified' },
    });
    expect(b.intent.statement).toMatch(/EXAMPLE intent/);
    expect(b.intent.normalized).toBe('example intent');
    expect(b.evidence[0]).toEqual({
      id: 'E-0001',
      kind: 'user_input',
      source: 'EXAMPLE intent — replace with your own',
      hash: EMPTY_SHA,
    });
    expect(b.glossary[0]).toEqual({
      term: 'ExampleTerm',
      definition: 'EXAMPLE glossary entry — replace with your own',
    });
    expect(b.requirements[0]).toEqual({
      id: 'REQ-0001',
      statement: 'EXAMPLE requirement — replace with your own',
      priority: 'must',
      evidence: ['E-0001'],
      acceptance_refs: ['TST-0001'],
      terms_used: ['ExampleTerm'],
    });
    expect(b.decisions[0]).toEqual({
      claim_id: 'DEC-0001',
      decision: 'EXAMPLE decision — replace with your own',
      rationale: 'Scaffold example',
      evidence: ['E-0001'],
      confidence: 0.5,
      impact: 'low',
      assumptions: [],
      alternatives: [],
      status: 'accepted',
    });
    expect(b.tasks[0].task_id).toBe('TASK-0001');
    expect(b.tasks[0].refs).toEqual({
      requirements: ['REQ-0001'],
      architecture: [],
      decisions: ['DEC-0001'],
    });
    // Verification runs on EVERY environment — that is what makes the
    // example REAL rather than a placeholder that only looks valid.
    expect(b.tasks[0].verification).toEqual([{ command: 'node --version', expect: 'exit 0' }]);
    expect(b.tasks[0].tests[0].cases.some((c) => c.includes('REQ-0001'))).toBe(true);
  });

  it('creates missing parent directories (lco init path/to/project works)', async () => {
    const root = freshRoot('spec-core-init-nested-');
    const target = join(root, 'path', 'to', 'project');

    const result = await cmdInit(target, { profile: 'p-mini', name: 'nested', nowIso: NOW });

    expect(result.code).toBe(0);
    expect(existsSync(join(target, 'spec', 'manifest.json'))).toBe(true);
  });
});

describe('cmdInit p-standard: NFR budget, contract, chained second task', () => {
  it('adds CON-0001 + OPS-0001 (NFR:) + TASK-0002 chained on TASK-0001; lint clean; freezes', async () => {
    const root = freshRoot('spec-core-init-std-');

    const result = await cmdInit(root, { profile: 'p-standard', name: 'std-app', nowIso: NOW });

    expect(result.code).toBe(0);
    expect(result.files).toEqual(SECTION_PATHS);

    const b = await compileLintFreeze(root);

    expect(b.manifest.complexity_profile).toBe('p-standard');

    // L07 satisfied via the NFR:-prefixed statement (not via profile escape).
    const ops = b.requirements.find((r) => r.id === 'OPS-0001');
    expect(ops?.statement).toMatch(/NFR:/i);
    expect(b.requirements.map((r) => r.id)).toEqual(['REQ-0001', 'OPS-0001']);

    expect(b.contracts).toEqual([
      {
        id: 'CON-0001',
        kind: 'ts-signature',
        symbol: 'exampleApi(): void',
        definition: 'EXAMPLE contract — replace with your own',
      },
    ]);

    expect(b.tasks.map((t) => t.task_id)).toEqual(['TASK-0001', 'TASK-0002']);
    const task2 = b.tasks[1];
    expect(task2.depends_on).toEqual(['TASK-0001']);
    expect(task2.refs.requirements).toContain('OPS-0001');
    // TASK-0002's own test file enters the derived ledger next to TASK-0001's.
    expect(b.test_files).toEqual(['example.test.ts', 'example2.test.ts']);
  });
});

describe('cmdInit overwrite refusal (exit 2)', () => {
  it('existing spec/ (with content) -> {code:2, files:[]} and the directory is untouched', async () => {
    const root = freshRoot('spec-core-init-exists-');
    mkdirSync(join(root, 'spec'));
    writeFileSync(join(root, 'spec', 'keepme.json'), '{"mine":true}', 'utf8');

    const result = await cmdInit(root, { profile: 'p-mini', name: 'x', nowIso: NOW });

    expect(result).toEqual({ code: 2, files: [] });
    expect(readdirSync(join(root, 'spec'))).toEqual(['keepme.json']);
    for (const p of SECTION_PATHS) {
      expect(existsSync(join(root, p))).toBe(false);
    }
  });

  it('empty-but-existing spec/ directory also refuses — existence, not content, is the guard', async () => {
    const root = freshRoot('spec-core-init-empty-');
    mkdirSync(join(root, 'spec'));

    const result = await cmdInit(root, { profile: 'p-standard', name: 'x', nowIso: NOW });

    expect(result).toEqual({ code: 2, files: [] });
    expect(readdirSync(join(root, 'spec'))).toEqual([]);
  });
});
