import { describe, it, expect, afterEach } from 'vitest';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cmdChange } from './change';
import { compileSpecDir } from '../../compiler/compile';
import { freeze } from '../../compiler/freeze';
import { lintBundle } from '../../lint/engine';
import { LOCK_FILE } from '../../storage/revision';

const FIXTURES = join(__dirname, '../../../fixtures');
const NOW = '2026-08-18T12:00:00Z';
const CHANGED_AT = '2026-08-25T09:00:00Z';

/** Section files written under spec/ (mirrors cli.test.ts; not exported there). */
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

function loadBundle(rel: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(FIXTURES, rel), 'utf8')) as Record<string, unknown>;
}

const tmpDirs: string[] = [];

function makeSpecRoot(bundle: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), 'spec-core-change-'));
  tmpDirs.push(root);
  const spec = join(root, 'spec');
  mkdirSync(spec);
  for (const name of [...SECTION_FILES, 'legacy'] as const) {
    if (bundle[name] === undefined) continue;
    writeFileSync(join(spec, `${name}.json`), JSON.stringify(bundle[name], null, 2));
  }
  return root;
}

function writeChangeset(root: string, cs: unknown): string {
  const path = join(root, 'changeset.json');
  writeFileSync(path, JSON.stringify(cs, null, 2));
  return path;
}

const SHA =
  'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

/**
 * Inline fully-conforming 3-task bundle (T7): pet-clinic served as the frozen
 * base, but fixtures conform to L13/L14 only in T8 — the change gate needs a
 * freezable bundle NOW. Structure mirrors pet-clinic's shape the tests rely
 * on: REQ-000n referenced by exactly TASK-000n (removing TASK-0003 orphans
 * REQ-0003), TASK-0001's test file 'tests/appointments.test.ts' (the
 * re-anchoring patch reuses it), acceptance_refs anchored to tests[].id.
 */
function inlineBundle(): Record<string, unknown> {
  const task = (n: 1 | 2 | 3, refs: string[], deps: string[], file: string): Record<string, unknown> => ({
    task_id: `TASK-000${n}`,
    title: `example task ${n}`,
    purpose: 'p',
    refs: { requirements: refs, architecture: [], decisions: ['DEC-0001'] },
    depends_on: deps,
    preconditions: ['c'],
    permitted_scope: [`src/part${n}/**`],
    protected: [],
    interface_changes: [],
    invariants: ['i'],
    instructions: 'do',
    tests: [
      {
        id: `TST-000${n}`,
        kind: 'unit',
        file,
        cases: [`${refs[0]}: works`],
      },
    ],
    verification: [{ command: 'node --version', expect: 'exit 0' }],
    acceptance: ['a'],
    rollback: 'r',
    completion_evidence: { required: ['test_summary'] },
    risk: { level: 'low', note: '' },
    complexity: 'xs',
  });
  return {
    manifest: {
      spec_schema: 'lco-spec/1.0',
      spec_version: 1,
      project: { name: 'mini', mode: 'greenfield' },
      complexity_profile: 'p-mini',
      evidence_snapshot: { pack_hash: SHA, collected_at: NOW },
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
    requirements: [1, 2, 3].map((n) => ({
      id: `REQ-000${n}`,
      statement: `requirement ${n} must work`,
      priority: 'must',
      evidence: ['E-0001'],
      acceptance_refs: [`TST-000${n}`],
      terms_used: [],
    })),
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
      task(1, ['REQ-0001'], [], 'tests/appointments.test.ts'),
      task(2, ['REQ-0002'], ['TASK-0001'], 'tests/two.test.ts'),
      task(3, ['REQ-0003'], ['TASK-0001'], 'tests/three.test.ts'),
    ],
    test_files: ['tests/appointments.test.ts', 'tests/two.test.ts', 'tests/three.test.ts'],
  };
}

/** Inline conforming spec frozen ON DISK via the real freeze() gate (clean lint, fixed clock). */
async function frozenSpecRoot(): Promise<string> {
  const root = makeSpecRoot(inlineBundle());
  const compiled = await compileSpecDir(root);
  const frozen = freeze(compiled.bundle!, lintBundle(compiled.bundle!), NOW);
  writeFileSync(join(root, 'spec', 'manifest.json'), JSON.stringify(frozen.bundle!.manifest, null, 2));
  return root;
}

/** Section files on disk hold the bare section value (tasks.json = the array). */
function readSpecSection<T = unknown>(root: string, name: string): T {
  return JSON.parse(readFileSync(join(root, 'spec', `${name}.json`), 'utf8')) as T;
}

/** RAW BYTES of every file under spec/ (the disk-unchanged oracle). */
function snapshotSpec(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of readdirSync(join(root, 'spec')).sort()) {
    out[name] = readFileSync(join(root, 'spec', name), 'utf8');
  }
  return out;
}

/** chmod-based DAC blocks only non-root users; the skip is named, never silent. */
const RUNNING_AS_ROOT = (process.getuid?.() ?? 1000) === 0;

afterEach(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  tmpDirs.length = 0;
});

describe('cmdChange: usage/schema-class failures (exit 2)', () => {
  it('compile failure short-circuits -> 2, compile errors in details', async () => {
    const root = makeSpecRoot(loadBundle('bad/schema-invalid/bundle.json'));
    const csPath = writeChangeset(root, { id: 'CP-0001', rationale: 't' });

    const result = await cmdChange(root, csPath, CHANGED_AT);

    expect(result.code).toBe(2);
    expect(result.details.length).toBeGreaterThan(0);
  });

  it('missing changeset file -> 2', async () => {
    const root = await frozenSpecRoot();

    const result = await cmdChange(root, join(root, 'nope.json'), CHANGED_AT);

    expect(result.code).toBe(2);
    expect(result.details.join(' ')).toContain('nope.json');
  });

  it('changeset that is not valid JSON -> 2', async () => {
    const root = await frozenSpecRoot();
    const path = join(root, 'changeset.json');
    writeFileSync(path, '{not json');

    const result = await cmdChange(root, path, CHANGED_AT);

    expect(result.code).toBe(2);
    expect(`${result.summary} ${result.details.join(' ')}`).toContain('not valid JSON');
  });

  it('draft (unfrozen) spec dir -> 2 with the only-frozen reason', async () => {
    const root = makeSpecRoot(inlineBundle());
    const csPath = writeChangeset(root, {
      id: 'CP-0001',
      rationale: 't',
      modified_tasks: [{ task_id: 'TASK-0001', patch: { title: 'x' } }],
    });

    const result = await cmdChange(root, csPath, CHANGED_AT);

    expect(result.code).toBe(2);
    expect(result.details.join(' ')).toContain('only a frozen spec can be changed');
    // Nothing was written: the draft manifest stays untouched.
    expect(readSpecSection(root, 'manifest')).toEqual(inlineBundle().manifest);
  });

  it('unknown task_id in modified_tasks -> 2', async () => {
    const root = await frozenSpecRoot();
    const csPath = writeChangeset(root, {
      id: 'CP-0002',
      rationale: 'typo in id',
      modified_tasks: [{ task_id: 'TASK-9999', patch: { title: 'x' } }],
    });

    const result = await cmdChange(root, csPath, CHANGED_AT);

    expect(result.code).toBe(2);
    expect(result.details.join(' ')).toContain('TASK-9999');
  });

  it('typo patch key (titel) -> 2: strict key checking, no silent no-op bump', async () => {
    const root = await frozenSpecRoot();
    const csPath = writeChangeset(root, {
      id: 'CP-0003',
      rationale: 'typo key',
      modified_tasks: [{ task_id: 'TASK-0001', patch: { titel: 'x' } }],
    });

    const result = await cmdChange(root, csPath, CHANGED_AT);

    expect(result.code).toBe(2);
    expect(result.details.join(' ')).toContain('titel');
    // The frozen spec is untouched.
    expect(readSpecSection(root, 'manifest')).toMatchObject({ state: 'frozen', spec_version: 1 });
  });
});

describe('cmdChange: successful applies (exit 0)', () => {
  it('frozen + valid title patch -> 0; manifest v2/draft/no frozen_at and tasks.json rewritten', async () => {
    const root = await frozenSpecRoot();
    const csPath = writeChangeset(root, {
      id: 'CP-0001',
      rationale: 't',
      modified_tasks: [{ task_id: 'TASK-0001', patch: { title: 'Updated title' } }],
    });

    const result = await cmdChange(root, csPath, CHANGED_AT);

    expect(result.code).toBe(0);
    expect(result.summary).toContain('spec_version 2');
    expect(result.summary).toContain('3 task');
    expect(result.details).toEqual([]);

    const manifest = readSpecSection<{ spec_version: number; state: string } & object>(root, 'manifest');
    expect(manifest.spec_version).toBe(2);
    expect(manifest.state).toBe('draft');
    expect('frozen_at' in manifest).toBe(false);

    const tasks = readSpecSection<Array<{ task_id: string; title: string }>>(root, 'tasks');
    expect(tasks.find((t) => t.task_id === 'TASK-0001')?.title).toBe('Updated title');

    // No added_requirements -> requirements.json is NOT rewritten.
    expect(readSpecSection(root, 'requirements')).toEqual(inlineBundle().requirements);
  });

  // Pure removal of TASK-0003 orphans REQ-0003 (only that task referenced it),
  // so the change gate reports L02 -> exit 1. Under the validate-before-persist
  // contract (BACK-005) a gate failure means NOTHING was written: the frozen
  // v1 state stays byte-identical on disk. (This test previously asserted the
  // defect: files written to v2 + exit 1.)
  it('bare removed_task_ids orphans a REQ -> 1, nothing written (frozen v1 intact)', async () => {
    const root = await frozenSpecRoot();
    const before = snapshotSpec(root);
    const csPath = writeChangeset(root, {
      id: 'CP-0004a',
      rationale: 'vaccinations out of scope',
      removed_task_ids: ['TASK-0003'],
    });

    const result = await cmdChange(root, csPath, CHANGED_AT);

    expect(result.code).toBe(1);
    expect(result.details.join('\n')).toContain('L02_ORPHAN_REQUIREMENT');
    expect(result.summary).toContain('nothing written');
    // Disk untouched: still the frozen v1 with all three tasks.
    expect(snapshotSpec(root)).toEqual(before);
    expect(readSpecSection<{ spec_version: number; state: string }>(root, 'manifest')).toMatchObject(
      { spec_version: 1, state: 'frozen' },
    );
  });

  // The clean removal: drop TASK-0003 AND re-anchor REQ-0003 onto TASK-0001
  // (its refs plus a covering test case) — one changeset, one version bump,
  // lint stays clean.
  it('removed_task_ids + re-anchoring patch -> 0; tasks.json has 2 tasks, manifest v2', async () => {
    const root = await frozenSpecRoot();
    const csPath = writeChangeset(root, {
      id: 'CP-0004',
      rationale: 'vaccinations folded into the appointments task',
      removed_task_ids: ['TASK-0003'],
      modified_tasks: [
        {
          task_id: 'TASK-0001',
          patch: {
            refs: { requirements: ['REQ-0001', 'REQ-0003'], architecture: [], decisions: ['DEC-0001'] },
            tests: [
              // T7: tests carry ids and anchor acceptance_refs — REQ-0001 keeps
              // TST-0001, and the removed TASK-0003's TST-0003 is re-anchored
              // here as a covering entry so REQ-0003 stays closed (L13).
              {
                id: 'TST-0001',
                kind: 'unit',
                file: 'tests/appointments.test.ts',
                cases: ['REQ-0001: booking an appointment persists it'],
              },
              {
                id: 'TST-0003',
                kind: 'integration',
                file: 'tests/appointments.test.ts',
                cases: [
                  'REQ-0003: rescheduling notifies the owner',
                  'REQ-0001: cancelling frees the slot for rebooking',
                ],
              },
            ],
          },
        },
      ],
    });

    const result = await cmdChange(root, csPath, CHANGED_AT);

    expect(result.code).toBe(0);
    expect(result.details).toEqual([]);
    const tasks = readSpecSection<Array<{ task_id: string }>>(root, 'tasks');
    expect(tasks.map((t) => t.task_id)).toEqual(['TASK-0001', 'TASK-0002']);
    expect(readSpecSection<{ spec_version: number }>(root, 'manifest').spec_version).toBe(2);
  });

  it('added_requirements orphaning the new REQ -> 1, nothing written (BACK-005)', async () => {
    const root = await frozenSpecRoot();
    const before = snapshotSpec(root);
    const csPath = writeChangeset(root, {
      id: 'CP-0005',
      rationale: 'new reporting requirement',
      added_requirements: [
        {
          id: 'REQ-0009',
          statement: 'The system shall export the **Appointment** calendar monthly.',
          priority: 'could',
          evidence: ['E-0001'],
          acceptance_refs: ['TST-0001'],
        },
      ],
    });

    const result = await cmdChange(root, csPath, CHANGED_AT);

    // Gate failure (the new requirement is an orphan): exit 1 and the disk
    // still holds the frozen v1 — REQ-0009 was never appended.
    expect(result.code).toBe(1);
    expect(result.details.join('\n')).toContain('REQ-0009');
    expect(snapshotSpec(root)).toEqual(before);
    const reqs = readSpecSection<Array<{ id: string }>>(root, 'requirements');
    expect(reqs.map((r) => r.id)).not.toContain('REQ-0009');
    expect(readSpecSection<{ spec_version: number }>(root, 'manifest').spec_version).toBe(1);
  });
});

describe('cmdChange: pre-persistence change gate (exit 1) — validate BEFORE persist (BACK-005)', () => {
  // refs.requirements has no schema min(1), so emptying it is a VALID patch
  // (partial().strict() needs the full refs object) — the single fault is the
  // orphaned REQ-0001, which only L02 reports (L10 deliberately skips orphans).
  const ORPHANING_CHANGESET = {
    id: 'CP-0006',
    rationale: 'accidentally disconnect the requirement',
    modified_tasks: [
      {
        task_id: 'TASK-0001',
        patch: { refs: { requirements: [], architecture: [], decisions: ['DEC-0001'] } },
      },
    ],
  };

  it('valid-but-orphaning patch -> 1 with the rule table; EVERY section byte-identical', async () => {
    const root = await frozenSpecRoot();
    const before = snapshotSpec(root);
    const csPath = writeChangeset(root, ORPHANING_CHANGESET);

    const result = await cmdChange(root, csPath, CHANGED_AT);

    expect(result.code).toBe(1);
    const table = result.details.join('\n');
    expect(table).toContain('L02_ORPHAN_REQUIREMENT');
    expect(table).toContain('REQ-0001');
    // BACK-005 contract: exit 1 means NOTHING was committed — not "committed
    // into an invalid state". The frozen v1 is byte-identical, so the SAME
    // changeset can be fixed and retried.
    expect(result.summary).toContain('nothing written');
    expect(snapshotSpec(root)).toEqual(before);
    expect(readSpecSection<{ spec_version: number; state: string }>(root, 'manifest')).toMatchObject(
      { spec_version: 1, state: 'frozen' },
    );
  });

  it('gate-refused changeset leaves no lock or staging residue at the root', async () => {
    const root = await frozenSpecRoot();
    const csPath = writeChangeset(root, ORPHANING_CHANGESET);

    await cmdChange(root, csPath, CHANGED_AT);

    expect(existsSync(join(root, LOCK_FILE))).toBe(false);
    expect(readdirSync(root).sort()).toEqual(['changeset.json', 'spec']);
  });
});

describe('cmdChange: mid-revision write failure (DATA-001) — disk provably unchanged', () => {
  // The audit's stranded state: a write failed midway left manifest at v2
  // draft with old sections — neither verifiable nor retryable. The staged
  // writer makes ANY write-phase failure atomic-noop: byte-identical frozen
  // state, lock released, same changeset retryable.
  it.skipIf(RUNNING_AS_ROOT)(
    'chmod: spec/ unwritable mid-change -> 2, byte-identical, retry succeeds',
    async () => {
    const root = await frozenSpecRoot();
    const before = snapshotSpec(root);
    const csPath = writeChangeset(root, {
      id: 'CP-0007',
      rationale: 'mid-write failure scenario',
      modified_tasks: [{ task_id: 'TASK-0001', patch: { title: 'Updated anyway' } }],
    });

    chmodSync(join(root, 'spec'), 0o555); // staging (temp create/rename) fails
    let result: Awaited<ReturnType<typeof cmdChange>>;
    try {
      result = await cmdChange(root, csPath, CHANGED_AT);
    } finally {
      chmodSync(join(root, 'spec'), 0o755); // restore for assertions + cleanup
    }

    expect(result.code).toBe(2);
    expect(result.summary).toContain('write failed');
    // EVERY previous file is byte-identical (manifest included), no residue.
    expect(snapshotSpec(root)).toEqual(before);
    expect(existsSync(join(root, LOCK_FILE))).toBe(false);

    // RETRY of the same changeset is still possible — the frozen v1 never
    // left the disk, so the same changeset applies cleanly now.
    const retry = await cmdChange(root, csPath, CHANGED_AT);
    expect(retry.code).toBe(0);
    expect(retry.summary).toContain('spec_version 2');
    expect(readSpecSection<{ spec_version: number }>(root, 'manifest').spec_version).toBe(2);
  });

  // The audit's exact setup: tasks.json made unwritable (chmod 0444). The old
  // truncate-in-place writer stranded the spec on it; the rename-based writer
  // needs directory (not file) write permission, so the change now COMPLETES.
  it.skipIf(RUNNING_AS_ROOT)(
    'chmod 0444 tasks.json (audit setup) no longer strands: change completes',
    async () => {
    const root = await frozenSpecRoot();
    const csPath = writeChangeset(root, {
      id: 'CP-0008',
      rationale: 'audit reproduction',
      modified_tasks: [{ task_id: 'TASK-0001', patch: { title: 'Audit-proof title' } }],
    });
    chmodSync(join(root, 'spec', 'tasks.json'), 0o444);

    let result: Awaited<ReturnType<typeof cmdChange>>;
    try {
      result = await cmdChange(root, csPath, CHANGED_AT);
    } finally {
      chmodSync(join(root, 'spec', 'tasks.json'), 0o644);
    }

    expect(result.code).toBe(0);
    expect(readSpecSection<{ spec_version: number }>(root, 'manifest').spec_version).toBe(2);
    const tasks = readSpecSection<Array<{ task_id: string; title: string }>>(root, 'tasks');
    expect(tasks.find((t) => t.task_id === 'TASK-0001')?.title).toBe('Audit-proof title');
  });
});
