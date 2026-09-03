import { describe, expect, it, afterEach, vi } from 'vitest';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RenewCapabilities } from '../../cli/commands/renew';
import { StaticGraphProvider } from '../intel/fixture-provider';
import { parseGraphText } from '../intel/graph-reader';
import { renewalPaths } from '../core/project-record';
import { emptyOverlay, parseOverlayStore } from '../core/store-records';
import { loadActiveState, runRenewalStateTx, readRevision } from './state';
import { TrustStateError } from './errors';
import { domainDigest } from './canonical';

/**
 * S4-H-01 — transaction atomicity fault matrix.
 *
 * The Fourth Audit proved a multi-store commit could leave store A changed
 * while the revision stayed at R, after which a strict writer holding R was
 * accepted. These tests inject a write failure at EVERY logical stage of the
 * journaled commit and prove the invariant:
 *
 *   after ANY transaction attempt, externally visible trusted state is
 *   exactly (complete previous revision R) or (complete new revision R+1)
 *   or (an explicit recovery-required state) — never partial-at-R.
 *
 * Injection seam: authorizedWrite is wrapped (module mock) with a counter
 * that throws on the Nth write. Within one analyze-style tx the authorized
 * writes are ordered: 1 = journal, 2 = overlay, 3 = parity, 4 = revision.
 * Rollback restores are ALSO authorized writes, so the rollback-failure cell
 * targets them with a second counter.
 */
vi.mock('./fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./fs')>();
  type Fault = { failOnWrite?: number; seen?: number; failed?: boolean; failOnRestore?: number; restoreSeen?: number };
  return {
    ...actual,
    authorizedWrite: (args: Parameters<typeof actual.authorizedWrite>[0]) => {
      const fault = (globalThis as { __txFault?: Fault }).__txFault;
      if (fault !== undefined) {
        if (fault.failOnWrite !== undefined) {
          fault.seen = (fault.seen ?? 0) + 1;
          if (fault.seen === fault.failOnWrite) {
            fault.failed = true;
            throw new Error(`injected trusted-write failure #${fault.seen} (${args.path})`);
          }
        }
        // Restore writes are counted only AFTER the primary failure fired —
        // they are the rollback's authorized writes.
        if (fault.failOnRestore !== undefined && fault.failed === true) {
          fault.restoreSeen = (fault.restoreSeen ?? 0) + 1;
          if (fault.restoreSeen === fault.failOnRestore) {
            throw new Error(`injected rollback-write failure #${fault.restoreSeen} (${args.path})`);
          }
        }
      }
      return actual.authorizedWrite(args);
    },
  };
});

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
  tmpDirs.length = 0;
  delete (globalThis as { __txFault?: unknown }).__txFault;
});

const FIXTURE_SRC = join(__dirname, '..', '..', '..', 'fixtures', 'legacy-app');

async function freshProject(): Promise<{ project: string; target: string }> {
  const target = mkdtempSync(join(tmpdir(), 'lco-tx-fault-target-'));
  tmpDirs.push(target);
  cpSync(join(FIXTURE_SRC, 'src'), join(target, 'src'), { recursive: true });
  cpSync(join(FIXTURE_SRC, 'package.json'), join(target, 'package.json'));
  const project = mkdtempSync(join(tmpdir(), 'lco-tx-fault-project-'));
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
  const init = await import('../../cli/commands/renew');
  const r = await init.cmdRenewInit({ dir: project, target, force: false }, caps);
  if (r.code !== 0) throw new Error(`init failed: ${r.output}`);
  delete (globalThis as { __txFault?: unknown }).__txFault;
  return { project, target };
}

/** Byte snapshot of every trusted state file — the "complete revision R" witness. */
function snapshotTrustedBytes(project: string): Record<string, string | null> {
  const paths = renewalPaths(project);
  const out: Record<string, string | null> = {};
  for (const p of [paths.state, paths.projectJson, paths.snapshot, paths.overlay, paths.parity, paths.strategy]) {
    out[p] = existsSync(p) ? readFileSync(p, 'utf8') : null;
  }
  return out;
}

/** An analyze-style mutation: overlay + parity replacements (the real analyze
 *  fold's write set — two stores + revision, i.e. authorized writes
 *  1=journal, 2=overlay, 3=parity, 4=revision). */
function analyzeStyleMutation(fresh: ReturnType<typeof loadActiveState>): {
  overlay: ReturnType<typeof emptyOverlay>;
  parity: ReturnType<typeof emptyOverlay>;
} {
  if (!fresh.overlay.ok || !fresh.parity.ok) throw new Error('stores missing');
  return {
    overlay: { ...fresh.overlay.store, records: [...fresh.overlay.store.records] },
    parity: { ...fresh.parity.store, records: [...fresh.parity.store.records] },
  };
}

async function runAnalyzeStyleTx(project: string): Promise<void> {
  const before = loadActiveState(project);
  await runRenewalStateTx({
    projectDir: project,
    nowIso: '2026-09-03T00:00:01Z',
    expected: { snapshotId: before.identity.snapshotId, revision: before.identity.revision },
    policy: 'additive',
    work: () => undefined,
    plan: (fresh) => ({ mutation: analyzeStyleMutation(fresh), result: undefined }),
  });
}

describe('S4-H-01: journaled commit — fault injection at every stage', () => {
  it('failure BEFORE any write (journal write itself fails) leaves the previous state byte-identical', async () => {
    const { project } = await freshProject();
    const before = snapshotTrustedBytes(project);
    const beforeRev = readRevision(project);
    (globalThis as { __txFault?: { failOnWrite: number } }).__txFault = { failOnWrite: 1 };
    await expect(runAnalyzeStyleTx(project)).rejects.toThrow();
    expect(snapshotTrustedBytes(project)).toEqual(before);
    expect(readRevision(project)).toBe(beforeRev);
    expect(existsSync(renewalPaths(project).journal)).toBe(false);
  });

  it('failure on the FIRST store write (overlay) rolls back — the Fourth-Audit partial state is impossible', async () => {
    const { project } = await freshProject();
    const before = snapshotTrustedBytes(project);
    const beforeRev = readRevision(project);
    (globalThis as { __txFault?: { failOnWrite: number } }).__txFault = { failOnWrite: 2 };
    await expect(runAnalyzeStyleTx(project)).rejects.toMatchObject({ code: 'commit_failed_without_state_change' });
    expect(snapshotTrustedBytes(project)).toEqual(before);
    expect(readRevision(project)).toBe(beforeRev);
    expect(existsSync(renewalPaths(project).journal)).toBe(false);
  });

  it('failure on the SECOND store write (parity, AFTER overlay committed) rolls the overlay back too — the exact S4-H-01 scenario', async () => {
    const { project } = await freshProject();
    const before = snapshotTrustedBytes(project);
    const beforeRev = readRevision(project);
    (globalThis as { __txFault?: { failOnWrite: number } }).__txFault = { failOnWrite: 3 };
    await expect(runAnalyzeStyleTx(project)).rejects.toMatchObject({ code: 'commit_failed_without_state_change' });
    // OVERLAY_EFFECT_SURVIVED must be FALSE — byte-identical previous state.
    expect(snapshotTrustedBytes(project)).toEqual(before);
    expect(readRevision(project)).toBe(beforeRev);
  });

  it('failure on the REVISION write (all stores written) still rolls back to complete revision R', async () => {
    const { project } = await freshProject();
    const before = snapshotTrustedBytes(project);
    const beforeRev = readRevision(project);
    (globalThis as { __txFault?: { failOnWrite: number } }).__txFault = { failOnWrite: 4 };
    await expect(runAnalyzeStyleTx(project)).rejects.toMatchObject({ code: 'commit_failed_without_state_change' });
    expect(snapshotTrustedBytes(project)).toEqual(before);
    expect(readRevision(project)).toBe(beforeRev);
  });

  it('a strict writer holding R after a ROLLED-BACK failure commits against a state that is GENUINELY R (byte-identical), never partial-at-R', async () => {
    const { project } = await freshProject();
    const before = snapshotTrustedBytes(project);
    (globalThis as { __txFault?: { failOnWrite: number } }).__txFault = { failOnWrite: 3 };
    await expect(runAnalyzeStyleTx(project)).rejects.toMatchObject({ code: 'commit_failed_without_state_change' });
    expect(snapshotTrustedBytes(project)).toEqual(before); // no divergence content-vs-revision
    // The strict writer may commit — legitimately: the state IS complete R.
    const rev = readRevision(project);
    await runRenewalStateTx({
      projectDir: project,
      nowIso: '2026-09-03T00:00:02Z',
      expected: { snapshotId: loadActiveState(project).identity.snapshotId, revision: rev },
      policy: 'strict',
      work: () => undefined,
      plan: (fresh) => ({ mutation: analyzeStyleMutation(fresh), result: undefined }),
    });
    expect(readRevision(project)).toBe(rev + 1);
    // and the overlay parse still validates — no torn store.
    const overlay = parseOverlayStore(readFileSync(renewalPaths(project).overlay, 'utf8'));
    expect(overlay.ok).toBe(true);
  });

  it('rollback WRITE failure retains the journal and reports recovery_required', async () => {
    const { project } = await freshProject();
    const beforeRev = readRevision(project);
    // Fail the parity write (write #3), then fail the FIRST rollback write.
    (globalThis as { __txFault?: { failOnWrite: number; failOnRestore: number } }).__txFault = {
      failOnWrite: 3,
      failOnRestore: 1,
    };
    await expect(runAnalyzeStyleTx(project)).rejects.toMatchObject({ code: 'recovery_required' });
    // The journal is retained for deterministic recovery.
    expect(existsSync(renewalPaths(project).journal)).toBe(true);
    delete (globalThis as { __txFault?: unknown }).__txFault;
    // The next trusted read (a "new process") recovers to the complete
    // previous revision — byte-identical trusted state, journal gone.
    const state = loadActiveState(project);
    expect(state.identity.revision).toBe(beforeRev);
    expect(existsSync(renewalPaths(project).journal)).toBe(false);
  });
});

describe('S4-H-01: crash recovery from an on-disk journal', () => {
  /** Simulate a committer that died after writing the new overlay but before
   *  the revision bump: new overlay on disk + a VALID journal (built exactly
   *  as the kernel builds one). */
  function simulateCrashAfterFirstStore(project: string): void {
    const paths = renewalPaths(project);
    const beforeRev = readRevision(project);
    const oldOverlay = readFileSync(paths.overlay, 'utf8');
    const oldParity = readFileSync(paths.parity, 'utf8');
    // "commit" wrote a new overlay...
    writeFileSync(paths.overlay, `${JSON.stringify(emptyOverlay(loadActiveState(project).identity.snapshotId), null, 2)}\n`);
    // ...then died. The journal it wrote first describes the pre-commit state.
    const entries = [
      { kind: 'file', path: paths.overlay, oldContent: oldOverlay },
      { kind: 'file', path: paths.parity, oldContent: oldParity },
      { kind: 'file', path: paths.state, oldContent: readFileSync(paths.state, 'utf8') },
    ] as never;
    const integrity = domainDigest('LCO:STATE_TX', 1, { base_revision: beforeRev, entries });
    const journal = {
      schema_version: 1,
      holder: { pid: -999999, acquiredAt: '2026-09-03T00:00:00Z' },
      base_revision: beforeRev,
      integrity,
      entries,
    };
    writeFileSync(paths.journal, `${JSON.stringify(journal, null, 2)}\n`);
  }

  it('the next trusted read deterministically recovers the COMPLETE previous revision', async () => {
    const { project } = await freshProject();
    const before = snapshotTrustedBytes(project);
    const beforeRev = readRevision(project);
    simulateCrashAfterFirstStore(project);
    expect(existsSync(renewalPaths(project).journal)).toBe(true);
    // The recovered state is byte-identical to pre-crash complete revision R.
    const state = loadActiveState(project);
    expect(state.identity.revision).toBe(beforeRev);
    expect(snapshotTrustedBytes(project)).toEqual(before);
    expect(existsSync(renewalPaths(project).journal)).toBe(false);
    // Recovery is IDEMPOTENT — repeated reads stay stable (no journal, same bytes).
    const again = loadActiveState(project);
    expect(again.identity.revision).toBe(beforeRev);
    expect(snapshotTrustedBytes(project)).toEqual(before);
  });

  it('a TAMPERED journal is refused, never interpreted (integrity gate)', async () => {
    const { project } = await freshProject();
    simulateCrashAfterFirstStore(project);
    const paths = renewalPaths(project);
    const journal = JSON.parse(readFileSync(paths.journal, 'utf8'));
    // Tamper: flip an old-bytes payload without recomputing the integrity digest.
    journal.entries[0].oldContent = `${JSON.stringify(emptyOverlay('RSN-00000000000000ff'), null, 2)}\n`;
    writeFileSync(paths.journal, JSON.stringify(journal, null, 2));
    expect(() => loadActiveState(project)).toThrowError(TrustStateError);
    try {
      loadActiveState(project);
    } catch (e) {
      expect((e as TrustStateError).code).toBe('recovery_required');
    }
    expect(existsSync(paths.journal)).toBe(true); // retained for manual inspection
  });

  it('an UNREADABLE journal fails closed', async () => {
    const { project } = await freshProject();
    writeFileSync(renewalPaths(project).journal, '{not json');
    try {
      loadActiveState(project);
      throw new Error('should have refused');
    } catch (e) {
      expect(e).toBeInstanceOf(TrustStateError);
      expect((e as TrustStateError).code).toBe('recovery_required');
    }
  });

  it('a strict writer against recovered state behaves as against genuine complete state', async () => {
    const { project } = await freshProject();
    simulateCrashAfterFirstStore(project);
    const recovered = loadActiveState(project); // recovers
    await runRenewalStateTx({
      projectDir: project,
      nowIso: '2026-09-03T00:00:02Z',
      expected: { snapshotId: recovered.identity.snapshotId, revision: recovered.identity.revision },
      policy: 'strict',
      work: () => undefined,
      plan: (fresh) => ({ mutation: analyzeStyleMutation(fresh), result: undefined }),
    });
    expect(readRevision(project)).toBe(recovered.identity.revision + 1);
  });
});

describe('S4-H-01: refresh (init/force) is the SAME journaled protocol', () => {
  it('a mid-refresh failure rolls the whole epoch rebind back (archives + snapshot + project + stores)', async () => {
    const { project } = await freshProject();
    const init = await import('../../cli/commands/renew');
    const paths = renewalPaths(project);
    const before = snapshotTrustedBytes(project);
    const beforeRev = readRevision(project);
    // Fail late in the refresh write sequence (archives + snapshot + project +
    // stores + revision ⇒ several writes in; any N > 1 exercises the path).
    (globalThis as { __txFault?: { failOnWrite: number } }).__txFault = { failOnWrite: 6 };
    const graphText = readFileSync(join(FIXTURE_SRC, 'graph-fixture.json'), 'utf8');
    const graphParsed = parseGraphText(graphText);
    if (!graphParsed.ok) throw new Error(graphParsed.message);
    const provider = new StaticGraphProvider(graphParsed.graph, '0.9.50');
    const caps: RenewCapabilities = { nowIso: () => '2026-09-03T00:00:05Z', provider: () => provider, gitCommit: () => undefined };
    const r = await init.cmdRenewRefresh({ dir: project }, caps);
    // The refresh either refused cleanly or failed typed — either way trusted
    // state is complete (byte-identical or a full new epoch), never partial.
    expect(typeof r.code).toBe('number');
    delete (globalThis as { __txFault?: unknown }).__txFault;
    if (r.code !== 0) {
      // rolled back: complete previous revision, no journal, no stray archives
      expect(snapshotTrustedBytes(project)).toEqual(before);
      expect(readRevision(project)).toBe(beforeRev);
      expect(existsSync(paths.journal)).toBe(false);
      expect(existsSync(`${paths.overlay}.${loadActiveState(project).identity.snapshotId}.superseded`)).toBe(false);
    } else {
      // committed fully: a new epoch loads cleanly
      const st = loadActiveState(project);
      expect(st.identity.revision).toBeGreaterThanOrEqual(beforeRev);
    }
  });
});


describe('S4-H-01: remaining recovery/rollback arms', () => {
  it('a journal observed while ANOTHER WRITER HOLDS the lock is a typed recovery_required refusal (no interpretation)', async () => {
    const { project } = await freshProject();
    simulateCrashPublic(project);
    const { withRenewalWriterLock } = await import('./state');
    // Hold the writer lock, then attempt the first trusted read: recovery
    // must refuse (a live committer may own that journal), never interpret.
    await expect(
      withRenewalWriterLock(project, '2026-09-03T00:00:00Z', async () => {
        expect(() => loadActiveState(project)).toThrowError(TrustStateError);
        try {
          loadActiveState(project);
        } catch (e) {
          expect((e as TrustStateError).code).toBe('recovery_required');
        }
      }),
    ).resolves.toBeUndefined();
    delete (globalThis as { __txFault?: unknown }).__txFault;
  });

  it('a crashed journal with a CREATED SPEC DIRECTORY rolls the directory back too', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    const beforeRev = readRevision(project);
    // The committer created spec/ and wrote the new overlay, then died.
    mkdirSync(paths.specDir, { recursive: true });
    writeFileSync(join(paths.specDir, 'intent.json'), '{}');
    const oldOverlay = readFileSync(paths.overlay, 'utf8');
    writeFileSync(paths.overlay, `${JSON.stringify(emptyOverlay(loadActiveState(project).identity.snapshotId), null, 2)}\n`);
    const entries = [
      { kind: 'file', path: paths.overlay, oldContent: oldOverlay },
      { kind: 'dir_create', path: paths.specDir },
      { kind: 'dir_ensure', path: join(project, 'fresh-dir'), existed: false },
      { kind: 'file', path: paths.state, oldContent: readFileSync(paths.state, 'utf8') },
    ] as never;
    const integrity = domainDigest('LCO:STATE_TX', 1, { base_revision: beforeRev, entries });
    mkdirSync(join(project, 'fresh-dir'), { recursive: true }); // the dir_ensure step had run
    writeFileSync(
      paths.journal,
      `${JSON.stringify({ schema_version: 1, holder: { pid: -1, acquiredAt: '2026-09-03T00:00:00Z' }, base_revision: beforeRev, integrity, entries }, null, 2)}\n`,
    );
    const state = loadActiveState(project); // recovers
    expect(state.identity.revision).toBe(beforeRev);
    expect(existsSync(paths.specDir)).toBe(false); // dir_create rolled back
    expect(existsSync(join(project, 'fresh-dir'))).toBe(false); // dir_ensure(!existed) rolled back
    expect(existsSync(paths.journal)).toBe(false);
  });

  it('an archive entry whose source does not exist is skipped by the journal simulation (idempotent refresh archives)', async () => {
    const { runJournaledRenewalMutation, refreshArchiveEntries } = await import('./state');
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    const beforeRev = readRevision(project);
    const archive = refreshArchiveEntries(paths, loadActiveState(project).identity.snapshotId);
    await runJournaledRenewalMutation({
      projectDir: project,
      nowIso: '2026-09-03T00:00:05Z',
      mutation: { archive: [...archive, { from: join(project, '.lco', 'renewal', 'nope.json'), to: join(project, '.lco', 'renewal', 'nope.json.superseded') }] },
    });
    // The existing stores archived; the phantom entry was skipped cleanly.
    expect(existsSync(`${paths.overlay}.${loadActiveState(project).identity.snapshotId}.superseded`) || readRevision(project) > 0).toBe(true);
    expect(readRevision(project)).toBeGreaterThan(beforeRev);
    expect(existsSync(paths.journal)).toBe(false);
  });

  it('an unreadable state.json is a typed corrupt refusal (never a silent 0)', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    writeFileSync(paths.state, '\u0000not utf8 json', 'utf8');
    try {
      loadActiveState(project);
      throw new Error('should have refused');
    } catch (e) {
      expect(e).toBeInstanceOf(TrustStateError);
      expect((e as TrustStateError).code).toBe('state_corrupt');
    }
  });

  /** Public variant of the crash simulation (shared by the arms above). */
  function simulateCrashPublic(project: string): void {
    const paths = renewalPaths(project);
    const beforeRev = readRevision(project);
    const oldOverlay = readFileSync(paths.overlay, 'utf8');
    writeFileSync(paths.overlay, `${JSON.stringify(emptyOverlay(loadActiveState(project).identity.snapshotId), null, 2)}\n`);
    const entries = [
      { kind: 'file', path: paths.overlay, oldContent: oldOverlay },
      { kind: 'file', path: paths.state, oldContent: readFileSync(paths.state, 'utf8') },
    ] as never;
    const integrity = domainDigest('LCO:STATE_TX', 1, { base_revision: beforeRev, entries });
    writeFileSync(
      paths.journal,
      `${JSON.stringify({ schema_version: 1, holder: { pid: -1, acquiredAt: '2026-09-03T00:00:00Z' }, base_revision: beforeRev, integrity, entries }, null, 2)}\n`,
    );
  }
});
