import { describe, expect, it, afterEach } from 'vitest';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cmdRenewInit, type RenewCapabilities } from '../../cli/commands/renew';
import { StaticGraphProvider } from '../intel/fixture-provider';
import { parseGraphText } from '../intel/graph-reader';
import { renewalPaths } from '../project/project';
import {
  bumpStateRevisionTrusted,
  loadActiveState,
  runRenewalStateTx,
  runJournaledRenewalMutation,
  refreshArchiveEntries,
  withRenewalWriterLock,
} from './state';
import { TrustStateError } from './errors';

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
  tmpDirs.length = 0;
});

const FIXTURE_SRC = join(__dirname, '..', '..', '..', 'fixtures', 'legacy-app');

async function freshProject(): Promise<{ project: string; target: string }> {
  const target = mkdtempSync(join(tmpdir(), 'lco-trust-state-target-'));
  tmpDirs.push(target);
  cpSync(join(FIXTURE_SRC, 'src'), join(target, 'src'), { recursive: true });
  cpSync(join(FIXTURE_SRC, 'package.json'), join(target, 'package.json'));
  const project = mkdtempSync(join(tmpdir(), 'lco-trust-state-project-'));
  tmpDirs.push(project);

  const graphText = readFileSync(join(FIXTURE_SRC, 'graph-fixture.json'), 'utf8');
  const graphParsed = parseGraphText(graphText);
  if (!graphParsed.ok) throw new Error(graphParsed.message);
  const provider = new StaticGraphProvider(graphParsed.graph, '0.9.50');
  const caps: RenewCapabilities = {
    nowIso: () => '2026-09-03T00:00:00Z',
    provider: () => provider,
    gitCommit: () => undefined,
  };
  void cmdRenewInit; // used below
  const init = await import('../../cli/commands/renew');
  const r = await init.cmdRenewInit({ dir: project, target, force: false }, caps);
  if (r.code !== 0) throw new Error(`init failed: ${r.output}`);
  return { project, target };
}

describe('state: loadActiveState — the typed active view', () => {
  it('loads a healthy project with identity, revision, and joined stores', async () => {
    const { project } = await freshProject();
    const state = loadActiveState(project);
    expect(state.identity.snapshotId).toMatch(/^RSN-[0-9a-f]{16}$/);
    expect(state.identity.revision).toBeGreaterThanOrEqual(1);
    expect(state.project.snapshot_id).toBe(state.snapshot.snapshot_id);
    expect(state.analyses.active).toEqual([]);
  });

  it('reads state.json FIRST: a corrupt revision file fails closed before anything else loads', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    writeFileSync(paths.state, '{corrupt', 'utf8');
    expect(() => loadActiveState(project)).toThrowError(TrustStateError);
    try {
      loadActiveState(project);
    } catch (e) {
      expect((e as TrustStateError).code).toBe('state_corrupt');
    }
  });

  it('S3-M-04: project.snapshot_id disagreeing with snapshot.json is a typed join failure', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    const projectJson = JSON.parse(readFileSync(paths.projectJson, 'utf8'));
    writeFileSync(paths.projectJson, JSON.stringify({ ...projectJson, snapshot_id: 'RSN-ffffffffffffffff' }, null, 2));
    try {
      loadActiveState(project);
      throw new Error('should have refused');
    } catch (e) {
      expect((e as TrustStateError).code).toBe('snapshot_join_mismatch');
    }
  });

  it('cross-snapshot parity store is a TYPED cross-snapshot state, never zeros (S3-H-09)', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    const state = loadActiveState(project);
    if (!state.parity.ok) throw new Error('parity should exist post-init');
    const foreign = { ...state.parity.store, snapshot_id: 'RSN-00000000000000aa' };
    writeFileSync(paths.parity, JSON.stringify(foreign, null, 2));
    const reloaded = loadActiveState(project);
    expect(reloaded.parity.ok).toBe(false);
    if (!reloaded.parity.ok) expect(reloaded.parity.code).toBe('store_cross_snapshot');
  });
});

describe('state: the transaction protocol', () => {
  it('strict policy commits when nothing changed and bumps the revision once', async () => {
    const { project } = await freshProject();
    const before = loadActiveState(project);
    const out = await runRenewalStateTx({
      projectDir: project,
      nowIso: '2026-09-03T00:00:01Z',
      expected: { snapshotId: before.identity.snapshotId, revision: before.identity.revision },
      policy: 'strict',
      work: () => 'done',
      plan: (fresh) => {
        expect(fresh.identity.revision).toBe(before.identity.revision);
        return { mutation: {}, result: 'committed' };
      },
    });
    expect(out).toBe('committed');
    expect(loadActiveState(project).identity.revision).toBe(before.identity.revision + 1);
  });

  it('strict policy REFUSES when the revision moved mid-work (no stale commit, S3-H-03)', async () => {
    const { project } = await freshProject();
    const before = loadActiveState(project);
    await expect(
      runRenewalStateTx({
        projectDir: project,
        nowIso: '2026-09-03T00:00:01Z',
        expected: { snapshotId: before.identity.snapshotId, revision: before.identity.revision },
        policy: 'strict',
        work: async () => {
          // a concurrent writer bumps the revision during our work window
          await withRenewalWriterLock(project, '2026-09-03T00:00:01Z', async () => {
            const { bumpStateRevisionTrusted } = await import('./state');
            bumpStateRevisionTrusted(project);
          });
        },
        plan: () => {
          throw new Error('must not commit');
        },
      }),
    ).rejects.toMatchObject({ code: 'stale_revision' });
  });

  it('additive policy re-folds onto the FRESH state (concurrent store write survives, no lost update)', async () => {
    const { project } = await freshProject();
    const before = loadActiveState(project);
    let sawFreshOverlayCount = -1;
    await runRenewalStateTx({
      projectDir: project,
      nowIso: '2026-09-03T00:00:01Z',
      expected: { snapshotId: before.identity.snapshotId, revision: before.identity.revision },
      policy: 'additive',
      work: async () => {
        // a concurrent analyze-style fold writes a store while we work
        await withRenewalWriterLock(project, '2026-09-03T00:00:02Z', async () => {
          const paths = renewalPaths(project);
          const cur = loadActiveState(project);
          if (!cur.overlay.ok) throw new Error('overlay missing');
          const { persistTrustedJson, bumpStateRevisionTrusted } = await import('./state');
          persistTrustedJson({ projectDir: project, path: paths.overlay, value: cur.overlay.store });
          bumpStateRevisionTrusted(project);
        });
      },
      plan: (fresh) => {
        sawFreshOverlayCount = fresh.overlay.ok ? fresh.overlay.store.records.length : -1;
        return { mutation: {}, result: 'folded' };
      },
    });
    expect(sawFreshOverlayCount).toBe(0);
    // and the fold landed on the post-concurrent-write revision (+2 total)
    expect(loadActiveState(project).identity.revision).toBe(before.identity.revision + 2);
  });

  it('a snapshot change mid-work REFUSES the commit as superseded (refresh invalidation)', async () => {
    const { project, target } = await freshProject();
    const before = loadActiveState(project);
    const init = await import('../../cli/commands/renew');
    await expect(
      runRenewalStateTx({
        projectDir: project,
        nowIso: '2026-09-03T00:00:01Z',
        expected: { snapshotId: before.identity.snapshotId, revision: before.identity.revision },
        policy: 'additive',
        work: async () => {
          // a REAL refresh commits a new epoch during our work window: change
          // the target so the new snapshot identity is genuine, then re-init
          writeFileSync(join(target, 'src', 'new-file.ts'), 'export const changed = 1;\n');
          const graphText = readFileSync(join(FIXTURE_SRC, 'graph-fixture.json'), 'utf8');
          const graphParsed = parseGraphText(graphText);
          if (!graphParsed.ok) throw new Error(graphParsed.message);
          const caps: RenewCapabilities = {
            nowIso: () => '2026-09-03T00:00:02Z',
            provider: () => new StaticGraphProvider(graphParsed.graph, '0.9.50'),
            gitCommit: () => undefined,
          };
          const r = await init.cmdRenewInit({ dir: project, target, force: true }, caps);
          if (r.code !== 0) throw new Error(`forced refresh failed: ${r.output}`);
        },
        plan: () => {
          throw new Error('must not commit');
        },
      }),
    ).rejects.toMatchObject({ code: 'snapshot_superseded' });
  });

  it('S3-H-04: refresh supersession archives the SPEC directory too, no-clobber', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    mkdirSync(paths.specDir, { recursive: true });
    writeFileSync(join(paths.specDir, 'intent.md'), '# intent');
    const state = loadActiveState(project);
    // S4-H-01: supersession is now an ARCHIVE-ENTRY journaled mutation — the
    // kernel performs and journals each rename.
    await runJournaledRenewalMutation({
      projectDir: project,
      nowIso: '2026-09-03T00:00:00Z',
      mutation: { archive: refreshArchiveEntries(paths, state.identity.snapshotId) },
    });
    expect(existsSync(paths.specDir)).toBe(false);
    expect(existsSync(`${paths.specDir}.${state.identity.snapshotId}.superseded`)).toBe(true);
    // second supersession of the same epoch REFUSES (S3-M-05)
    mkdirSync(paths.specDir, { recursive: true });
    await expect(
      runJournaledRenewalMutation({
        projectDir: project,
        nowIso: '2026-09-03T00:00:00Z',
        mutation: { archive: refreshArchiveEntries(paths, state.identity.snapshotId) },
      }),
    ).rejects.toThrow();
  });
});


describe('verifier VB-1 (HIGH): lock liveness is decided by the ACQUISITION clock, not the caller-supplied one', () => {
  it('a lock acquired with a pre-work (minutes-old) nowIso is NOT born stale — a concurrent writer is refused, no lost update', async () => {
    const { project } = await freshProject();
    // Simulate the MCP analyze fold: the boundary clock is frozen BEFORE a
    // long paid call; the fold then acquires the writer lock with that OLD
    // reading. Under the defect, breakStaleLock saw age>10s and the second
    // writer broke the live lock mid-commit (reproduced lost update).
    const staleClock = '2026-09-03T00:00:00Z';
    await withRenewalWriterLock(project, staleClock, async () => {
      const second = await withRenewalWriterLock(project, '2026-09-03T09:00:00Z', () => 'ran').then(
        () => 'ran',
        (e: Error) => e.message,
      );
      expect(second).toMatch(/locked by another writer/);
      // and the mid-commit mutation stands
      bumpStateRevisionTrusted(project);
    });
    expect(loadActiveState(project).identity.revision).toBeGreaterThanOrEqual(1);
  });
});
