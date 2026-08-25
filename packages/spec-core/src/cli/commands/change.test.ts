import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cmdChange } from './change';
import { compileSpecDir } from '../../compiler/compile';
import { freeze } from '../../compiler/freeze';
import { lintBundle } from '../../lint/engine';

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

/** pet-clinic frozen ON DISK via the real freeze() gate (clean lint, fixed clock). */
async function frozenSpecRoot(): Promise<string> {
  const root = makeSpecRoot(loadBundle('good/pet-clinic/bundle.json'));
  const compiled = await compileSpecDir(root);
  const frozen = freeze(compiled.bundle!, lintBundle(compiled.bundle!), NOW);
  writeFileSync(join(root, 'spec', 'manifest.json'), JSON.stringify(frozen.bundle!.manifest, null, 2));
  return root;
}

/** Section files on disk hold the bare section value (tasks.json = the array). */
function readSpecSection<T = unknown>(root: string, name: string): T {
  return JSON.parse(readFileSync(join(root, 'spec', `${name}.json`), 'utf8')) as T;
}

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
    const root = makeSpecRoot(loadBundle('good/pet-clinic/bundle.json'));
    const csPath = writeChangeset(root, {
      id: 'CP-0001',
      rationale: 't',
      modified_tasks: [{ task_id: 'TASK-0001', patch: { title: 'x' } }],
    });

    const result = await cmdChange(root, csPath, CHANGED_AT);

    expect(result.code).toBe(2);
    expect(result.details.join(' ')).toContain('only a frozen spec can be changed');
    // Nothing was written: the draft manifest stays untouched.
    expect(readSpecSection(root, 'manifest')).toEqual(
      loadBundle('good/pet-clinic/bundle.json').manifest,
    );
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
    expect(readSpecSection(root, 'requirements')).toEqual(
      loadBundle('good/pet-clinic/bundle.json').requirements,
    );
  });

  // Pure removal of TASK-0003 orphans REQ-0003 (only that task referenced it),
  // so the re-lint gate reports L02 -> exit 1. Removal alone cannot be a
  // clean-lint exit-0 on this fixture.
  it('bare removed_task_ids -> files written (2 tasks, v2) but the orphaned REQ re-lints to exit 1', async () => {
    const root = await frozenSpecRoot();
    const csPath = writeChangeset(root, {
      id: 'CP-0004a',
      rationale: 'vaccinations out of scope',
      removed_task_ids: ['TASK-0003'],
    });

    const result = await cmdChange(root, csPath, CHANGED_AT);

    expect(result.code).toBe(1);
    expect(result.details.join('\n')).toContain('L02_ORPHAN_REQUIREMENT');
    const tasks = readSpecSection<Array<{ task_id: string }>>(root, 'tasks');
    expect(tasks.map((t) => t.task_id)).toEqual(['TASK-0001', 'TASK-0002']);
    expect(readSpecSection<{ spec_version: number }>(root, 'manifest').spec_version).toBe(2);
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
              {
                kind: 'integration',
                file: 'tests/appointments.test.ts',
                cases: [
                  'REQ-0001: booking an appointment persists it',
                  'REQ-0001: cancelling frees the slot for rebooking',
                  'REQ-0003: rescheduling notifies the owner',
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

  it('added_requirements -> appended to requirements.json on disk', async () => {
    const root = await frozenSpecRoot();
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

    // Written, but the re-lint gate flags the new orphan requirement (exit 1).
    expect(result.code).toBe(1);
    const reqs = readSpecSection<Array<{ id: string }>>(root, 'requirements');
    expect(reqs.map((r) => r.id)).toContain('REQ-0009');
    expect(readSpecSection<{ spec_version: number }>(root, 'manifest').spec_version).toBe(2);
  });
});

describe('cmdChange: post-change re-lint gate (exit 1)', () => {
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

  it('valid-but-orphaning patch -> 1 with the rule id and path in the table', async () => {
    const root = await frozenSpecRoot();
    const csPath = writeChangeset(root, ORPHANING_CHANGESET);

    const result = await cmdChange(root, csPath, CHANGED_AT);

    expect(result.code).toBe(1);
    const table = result.details.join('\n');
    expect(table).toContain('L02_ORPHAN_REQUIREMENT');
    expect(table).toContain('REQ-0001');
    // The change itself was written before the gate fired: v2 on disk.
    expect(readSpecSection<{ spec_version: number }>(root, 'manifest').spec_version).toBe(2);
    const tasks = readSpecSection<Array<{ task_id: string; title: string }>>(root, 'tasks');
    expect(tasks.find((t) => t.task_id === 'TASK-0001')?.title).toBeDefined();
  });
});
