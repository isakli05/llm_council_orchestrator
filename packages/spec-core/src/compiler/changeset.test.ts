import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyChangeSet, type ChangeSet } from './changeset';
import { freeze } from './freeze';
import type { SpecBundle } from '../schemas';
import type { LintResult } from '../lint/types';

const FIXTURES = join(__dirname, '../../fixtures');
const NOW = '2026-08-18T12:00:00Z';
const CHANGED_AT = '2026-08-18T14:30:00Z';

const cleanLint: LintResult = { errors: [], warnings: [], summary: {} };

let draft: SpecBundle;
let frozen: SpecBundle;

beforeEach(() => {
  draft = JSON.parse(readFileSync(join(FIXTURES, 'good/pet-clinic/bundle.json'), 'utf8'));
  const result = freeze(draft, cleanLint, NOW);
  expect(result.ok).toBe(true);
  frozen = result.bundle!;
});

describe('applyChangeSet: valid changes on a frozen bundle', () => {
  it('applies a task title patch: version bumps, state returns to draft, frozen_at removed', () => {
    const cs: ChangeSet = {
      id: 'cs-0001',
      rationale: 'clarify the scheduling task title',
      modified_tasks: [{ task_id: 'TASK-0001', patch: { title: 'Appointment scheduling and rescheduling' } }],
    };

    const result = applyChangeSet(frozen, cs, CHANGED_AT);

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    const next = result.bundle!;
    expect(next.manifest.spec_version).toBe(2);
    expect(next.manifest.state).toBe('draft');
    expect(next.manifest.frozen_at).toBeUndefined();
    expect('frozen_at' in next.manifest).toBe(false);
    expect(next.tasks[0].title).toBe('Appointment scheduling and rescheduling');
    // Untouched tasks survive verbatim.
    expect(next.tasks[1]).toEqual(frozen.tasks[1]);
    expect(next.tasks[2]).toEqual(frozen.tasks[2]);
    expect(next.tasks.length).toBe(3);
  });

  it('keeps the frozen artifact_hashes until the next freeze (drift stays detectable)', () => {
    const cs: ChangeSet = {
      id: 'cs-0002',
      rationale: 'title tweak',
      modified_tasks: [{ task_id: 'TASK-0002', patch: { title: 'Owner records management' } }],
    };

    const result = applyChangeSet(frozen, cs, CHANGED_AT);
    expect(result.ok).toBe(true);
    expect(result.bundle!.manifest.artifact_hashes).toEqual(frozen.manifest.artifact_hashes);
  });

  it('removes an existing task id and bumps the version once', () => {
    const cs: ChangeSet = {
      id: 'cs-0003',
      rationale: 'vaccinations moved out of scope',
      removed_task_ids: ['TASK-0003'],
    };

    const result = applyChangeSet(frozen, cs, CHANGED_AT);

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.bundle!.manifest.spec_version).toBe(2);
    expect(result.bundle!.manifest.state).toBe('draft');
    expect(result.bundle!.tasks.map((t) => t.task_id)).toEqual(['TASK-0001', 'TASK-0002']);
  });

  it('applies modify + remove in one changeset with a single version bump', () => {
    const cs: ChangeSet = {
      id: 'cs-0004',
      rationale: 'rescope',
      modified_tasks: [{ task_id: 'TASK-0001', patch: { title: 'Booking flow' } }],
      removed_task_ids: ['TASK-0002'],
    };

    const result = applyChangeSet(frozen, cs, CHANGED_AT);

    expect(result.ok).toBe(true);
    expect(result.bundle!.manifest.spec_version).toBe(2);
    expect(result.bundle!.tasks.map((t) => t.task_id)).toEqual(['TASK-0001', 'TASK-0003']);
    expect(result.bundle!.tasks[0].title).toBe('Booking flow');
  });

  it('appends schema-valid added_requirements', () => {
    const cs: ChangeSet = {
      id: 'cs-0005',
      rationale: 'new reporting requirement',
      added_requirements: [
        {
          id: 'REQ-0099',
          statement: 'The system shall export the **Appointment** calendar monthly.',
          priority: 'could',
          evidence: ['E-0001'],
          acceptance_refs: ['TST-0001'],
        },
      ],
    };

    const result = applyChangeSet(frozen, cs, CHANGED_AT);

    expect(result.ok).toBe(true);
    expect(result.bundle!.requirements.map((r) => r.id)).toContain('REQ-0099');
    expect(result.bundle!.requirements.length).toBe(frozen.requirements.length + 1);
  });

  it('does not mutate the input bundle', () => {
    const snapshot = JSON.stringify(frozen);
    applyChangeSet(
      frozen,
      {
        id: 'cs-0006',
        rationale: 'mutation check',
        removed_task_ids: ['TASK-0001'],
      },
      CHANGED_AT,
    );
    expect(JSON.stringify(frozen)).toBe(snapshot);
    expect(frozen.manifest.state).toBe('frozen');
  });
});

describe('applyChangeSet: rejections (fail-closed)', () => {
  it('rejects a changeset against a draft bundle', () => {
    const result = applyChangeSet(
      draft,
      { id: 'cs-x1', rationale: 'too early', modified_tasks: [{ task_id: 'TASK-0001', patch: { title: 'x' } }] },
      CHANGED_AT,
    );

    expect(result.ok).toBe(false);
    expect(result.bundle).toBeUndefined();
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.toLowerCase().includes('frozen'))).toBe(true);
  });

  it('rejects a patch for a nonexistent task_id', () => {
    const result = applyChangeSet(
      frozen,
      { id: 'cs-x2', rationale: 'typo in id', modified_tasks: [{ task_id: 'TASK-9999', patch: { title: 'x' } }] },
      CHANGED_AT,
    );

    expect(result.ok).toBe(false);
    expect(result.bundle).toBeUndefined();
    expect(result.errors.some((e) => e.includes('TASK-9999'))).toBe(true);
  });

  it('rejects a removed_task_ids entry that does not exist', () => {
    const result = applyChangeSet(
      frozen,
      { id: 'cs-x3', rationale: 'typo in id', removed_task_ids: ['TASK-4242'] },
      CHANGED_AT,
    );

    expect(result.ok).toBe(false);
    expect(result.bundle).toBeUndefined();
    expect(result.errors.some((e) => e.includes('TASK-4242'))).toBe(true);
  });

  it('rejects a patch value that fails TaskContractSchema.partial() (empty title)', () => {
    const result = applyChangeSet(
      frozen,
      { id: 'cs-x4', rationale: 'bad value', modified_tasks: [{ task_id: 'TASK-0001', patch: { title: '' } }] },
      CHANGED_AT,
    );

    expect(result.ok).toBe(false);
    expect(result.bundle).toBeUndefined();
    expect(result.errors.length).toBeGreaterThan(0);
    // The unmodified task must never leak through a failed changeset.
    expect(JSON.stringify(result.bundle)).toBeUndefined();
  });

  it('rejects a patch value with an invalid enum (complexity)', () => {
    const result = applyChangeSet(
      frozen,
      {
        id: 'cs-x5',
        rationale: 'bad enum',
        modified_tasks: [{ task_id: 'TASK-0001', patch: { complexity: 'gigantic' as never } }],
      },
      CHANGED_AT,
    );

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects an invalid added_requirement instead of merging it', () => {
    const result = applyChangeSet(
      frozen,
      {
        id: 'cs-x6',
        rationale: 'bad requirement',
        added_requirements: [
          { id: 'REQ-0098', statement: '', priority: 'must', evidence: [], acceptance_refs: [] },
        ],
      },
      CHANGED_AT,
    );

    expect(result.ok).toBe(false);
    expect(result.bundle).toBeUndefined();
    expect(result.errors.some((e) => e.includes('added_requirements'))).toBe(true);
  });

  it('accumulates every error instead of stopping at the first', () => {
    const result = applyChangeSet(
      frozen,
      {
        id: 'cs-x7',
        rationale: 'many problems',
        modified_tasks: [
          { task_id: 'TASK-9999', patch: { title: 'ghost task' } },
          { task_id: 'TASK-0001', patch: { title: '' } },
        ],
        removed_task_ids: ['TASK-4242'],
      },
      CHANGED_AT,
    );

    expect(result.ok).toBe(false);
    expect(result.bundle).toBeUndefined();
    expect(result.errors.length).toBe(3);
  });
});

describe('applyChangeSet: determinism', () => {
  it('two identical calls produce byte-for-byte identical results', () => {
    const cs: ChangeSet = {
      id: 'cs-det',
      rationale: 'determinism probe',
      modified_tasks: [{ task_id: 'TASK-0001', patch: { title: 'Deterministic title' } }],
      removed_task_ids: ['TASK-0003'],
    };

    const a = applyChangeSet(frozen, cs, CHANGED_AT);
    const frozenAgain = JSON.parse(JSON.stringify(frozen)) as SpecBundle;
    const b = applyChangeSet(frozenAgain, JSON.parse(JSON.stringify(cs)) as ChangeSet, CHANGED_AT);

    expect(a.ok).toBe(true);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
