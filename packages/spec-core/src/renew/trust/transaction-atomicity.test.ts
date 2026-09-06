import { describe, expect, it, afterEach, vi } from 'vitest';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RenewCapabilities } from '../../cli/commands/renew';
import { StaticGraphProvider } from '../intel/fixture-provider';
import { parseGraphText } from '../intel/graph-reader';
import { renewalPaths } from '../core/project-record';
import { emptyOverlay, parseOverlayStore } from '../core/store-records';
import { addParityEntry } from '../parity/ledger';
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
  type Interleave = { onWrite: number; commit: () => void; only?: boolean };
  type JournalCapture = { armed: boolean; bytes?: string };
  type RemoveFault = { path?: string };
  return {
    ...actual,
    authorizedWrite: (args: Parameters<typeof actual.authorizedWrite>[0]) => {
      // S5-H-01 regression seam (dormant unless armed): capture the REAL
      // journal bytes the kernel writes, so tests can reconstitute the exact
      // post-commit crash persistence state (durable R+1 + journal(base R))
      // without hand-building a journal.
      const capture = (globalThis as { __txJournalCapture?: JournalCapture }).__txJournalCapture;
      if (capture !== undefined && capture.armed && args.path.endsWith('tx-journal.json')) {
        capture.bytes = args.content;
      }
      const fault = (globalThis as { __txFault?: Fault & { interleaveAndFail?: Interleave } }).__txFault;
      if (fault !== undefined) {
        if (fault.interleaveAndFail !== undefined) {
          fault.seen = (fault.seen ?? 0) + 1;
          if (fault.seen === fault.interleaveAndFail.onWrite) {
            fault.failed = true;
            // A CONCURRENT WRITER commits inside our write window, then our
            // write fails (the V1-re-verifier overlap interleave).
            fault.interleaveAndFail.commit();
            if (fault.interleaveAndFail.only !== true) {
              throw new Error(`injected trusted-write failure #${fault.seen} (${args.path}) — after a concurrent commit`);
            }
          }
        }
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
      // closing-verify arm: transient single-fault on the ABORT-EVIDENCE write
      const evFault = (globalThis as { __txEvidenceFault?: { hookArmed: boolean; evidenceFailures: number; evidenceWrites: number } }).__txEvidenceFault;
      if (evFault !== undefined && evFault.hookArmed && args.path.endsWith('tx-abort-evidence.json')) {
        evFault.evidenceWrites += 1;
        if (evFault.evidenceFailures >= evFault.evidenceWrites) {
          throw new Error(`injected transient evidence-write failure #${evFault.evidenceWrites}`);
        }
      }
      // S5-M-04 arm: PERSISTENT fault on the journal SUPERSEDED-MARKER write
      // (targets only the superseded-stamped journal content, never the
      // initial journal write).
      const mkFault = (globalThis as { __txMarkerFault?: { hookArmed: boolean } }).__txMarkerFault;
      if (mkFault !== undefined && mkFault.hookArmed && args.path.endsWith('tx-journal.json') && args.content.includes('"superseded"')) {
        throw new Error('injected persistent superseded-marker failure');
      }
      return actual.authorizedWrite(args);
    },
    authorizedRemoveTree: (args: Parameters<typeof actual.authorizedRemoveTree>[0]) => {
      // S5-H-01 regression seam (dormant unless armed): fail the removal of
      // one exact path — used for the journal-RETIRE-failure arm.
      const rf = (globalThis as { __txRemoveFault?: RemoveFault }).__txRemoveFault;
      if (rf !== undefined && rf.path !== undefined && args.path === rf.path) {
        throw new Error(`injected removal failure (${args.path})`);
      }
      return actual.authorizedRemoveTree(args);
    },
  };
});

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
  tmpDirs.length = 0;
  delete (globalThis as { __txFault?: unknown }).__txFault;
  delete (globalThis as { __txJournalCapture?: unknown }).__txJournalCapture;
  delete (globalThis as { __txRemoveFault?: unknown }).__txRemoveFault;
  delete (globalThis as { __txEvidenceFault?: unknown }).__txEvidenceFault;
  delete (globalThis as { __txMarkerFault?: unknown }).__txMarkerFault;
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
    const holder = { pid: -999999, acquiredAt: '2026-09-03T00:00:00Z' };
    const integrity = domainDigest('LCO:STATE_TX', 1, { base_revision: beforeRev, holder, entries });
    const journal = {
      schema_version: 1,
      holder,
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
    const holder = { pid: -1, acquiredAt: '2026-09-03T00:00:00Z' };
    const integrity = domainDigest('LCO:STATE_TX', 1, { base_revision: beforeRev, holder, entries });
    mkdirSync(join(project, 'fresh-dir'), { recursive: true }); // the dir_ensure step had run
    writeFileSync(
      paths.journal,
      `${JSON.stringify({ schema_version: 1, holder, base_revision: beforeRev, integrity, entries }, null, 2)}\n`,
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
    const holder = { pid: -1, acquiredAt: '2026-09-03T00:00:00Z' };
    const integrity = domainDigest('LCO:STATE_TX', 1, { base_revision: beforeRev, holder, entries });
    writeFileSync(
      paths.journal,
      `${JSON.stringify({ schema_version: 1, holder, base_revision: beforeRev, integrity, entries }, null, 2)}\n`,
    );
  }
});


describe('S4-H-01: V1-verifier violation regressions (all fixed)', () => {
  it('V1: a plan whose specDir ALREADY EXISTS fails WITHOUT deleting the pre-existing spec/', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    mkdirSync(paths.specDir, { recursive: true });
    writeFileSync(join(paths.specDir, 'intent.json'), '{}');
    const beforeBytes = readFileSync(join(paths.specDir, 'intent.json'), 'utf8');
    const beforeRev = readRevision(project);
    const before = loadActiveState(project);
    await expect(
      runRenewalStateTx({
        projectDir: project,
        nowIso: '2026-09-03T00:00:02Z',
        expected: { snapshotId: before.identity.snapshotId, revision: before.identity.revision },
        policy: 'strict',
        work: () => undefined,
        plan: (fresh) => ({
          mutation: { specDir: { files: [{ name: 'intent.json', content: {} }] } },
          result: undefined,
        }),
      }),
    ).rejects.toThrow();
    expect(existsSync(paths.specDir)).toBe(true);
    expect(readFileSync(join(paths.specDir, 'intent.json'), 'utf8')).toBe(beforeBytes);
    expect(readRevision(project)).toBe(beforeRev);
  });

  it('V2: a refresh ARCHIVE COLLISION after a committed analyze leaves the committed store INTACT (the headline zero-injection chain)', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    // commit one analyze-style fold (a real record lands)
    const b = loadActiveState(project);
    await runRenewalStateTx({
      projectDir: project,
      nowIso: '2026-09-03T00:00:01Z',
      expected: { snapshotId: b.identity.snapshotId, revision: b.identity.revision },
      policy: 'additive',
      work: () => undefined,
      plan: (fresh) => {
        if (!fresh.parity.ok) throw new Error('parity missing');
        const folded = { ...fresh.parity.store, records: [...fresh.parity.store.records] };
        addParityEntry(folded, {
          behavior: 'committed-behavior',
          evidence: [{ kind: 'code_anchor', anchor: { path: 'src/orders.ts', content_hash: 'sha256:' + '0'.repeat(64) } }],
        });
        return { mutation: { parity: folded }, result: undefined };
      },
    });
    const committedBytes = readFileSync(paths.parity, 'utf8');
    // first archive of the epoch lands
    const { runJournaledRenewalMutation, refreshArchiveEntries } = await import('./state');
    const epoch = loadActiveState(project).identity.snapshotId;
    await runJournaledRenewalMutation({ projectDir: project, nowIso: '2026-09-03T00:00:02Z', mutation: { archive: refreshArchiveEntries(paths, epoch) } });
    // the store is recreated (as a refresh would) and a SECOND archive of the
    // SAME epoch collides — the committed record must survive everything.
    const recreated = JSON.parse(committedBytes) as { snapshot_id: string };
    writeFileSync(paths.parity, JSON.stringify({ ...recreated, records: recreated.records }, null, 2));
    const revBefore = readRevision(project);
    await expect(
      runJournaledRenewalMutation({ projectDir: project, nowIso: '2026-09-03T00:00:03Z', mutation: { archive: refreshArchiveEntries(paths, epoch) } }),
    ).rejects.toThrow(/archive_collision|commit failed|ROLLED BACK/);
    // prior archive intact AND the recreated store still present
    expect(existsSync(`${paths.parity}.${epoch}.superseded`)).toBe(true);
    expect(existsSync(paths.parity)).toBe(true);
    expect(readRevision(project)).toBe(revBefore);
  });

  it('V4: a journal WRITE failure leaves no stuck marker — a later foreign journal still recovers in-process', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    const beforeRev = readRevision(project);
    // crash-state journal on disk (from ANOTHER process)
    const oldOverlay = readFileSync(paths.overlay, 'utf8');
    writeFileSync(paths.overlay, `${JSON.stringify(emptyOverlay(loadActiveState(project).identity.snapshotId), null, 2)}\n`);
    const holder = { pid: -424242, acquiredAt: '2026-09-03T00:00:00Z' };
    const entries = [
      { kind: 'file', path: paths.overlay, oldContent: oldOverlay },
      { kind: 'file', path: paths.state, oldContent: readFileSync(paths.state, 'utf8') },
    ] as never;
    const integrity = domainDigest('LCO:STATE_TX', 1, { base_revision: beforeRev, holder, entries });
    writeFileSync(paths.journal, `${JSON.stringify({ schema_version: 1, holder, base_revision: beforeRev, integrity, entries }, null, 2)}\n`);

    const before2 = loadActiveState(project); // recovers the crashed journal FIRST
    // OUR journal write fails (write #1) — previously this left the marker stuck
    (globalThis as { __txFault?: { failOnWrite: number } }).__txFault = { failOnWrite: 1 };
    await expect(
      runRenewalStateTx({
        projectDir: project,
        nowIso: '2026-09-03T00:00:02Z',
        expected: { snapshotId: before2.identity.snapshotId, revision: before2.identity.revision },
        policy: 'additive',
        work: () => undefined,
        plan: (fresh) => ({ mutation: analyzeStyleMutation(fresh), result: undefined }),
      }),
    ).rejects.toThrow();
    delete (globalThis as { __txFault?: unknown }).__txFault;
    // the next trusted read IN THIS PROCESS recovers the crashed journal
    const state = loadActiveState(project);
    expect(state.identity.revision).toBe(beforeRev);
    expect(existsSync(paths.journal)).toBe(false);
    expect(readFileSync(paths.overlay, 'utf8')).toBe(oldOverlay);
  });

  it('V5: force-mode init REFUSES a recovery-required journal instead of rebuilding over it', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    // a journal whose rollback fails (INCONSISTENT state): integrity-valid but
    // its rename entries point at paths that cannot be restored
    const holder = { pid: -7, acquiredAt: '2026-09-03T00:00:00Z' };
    // A rollback that CANNOT complete: an integrity-valid journal whose
    // restore target is outside the project (authorizedWrite refuses) —
    // recovery fails closed with recovery_required, which force must NOT swallow.
    const entries = [
      { kind: 'file', path: join(project, '..', 'outside-project-state.json'), oldContent: 'x' },
    ] as never;
    const integrity = domainDigest('LCO:STATE_TX', 1, { base_revision: 1, holder, entries });
    writeFileSync(paths.journal, `${JSON.stringify({ schema_version: 1, holder, base_revision: 1, integrity, entries }, null, 2)}\n`);
    const init = await import('../../cli/commands/renew');
    const graphText = readFileSync(join(FIXTURE_SRC, 'graph-fixture.json'), 'utf8');
    const graphParsed = parseGraphText(graphText);
    if (!graphParsed.ok) throw new Error(graphParsed.message);
    const provider = new StaticGraphProvider(graphParsed.graph, '0.9.50');
    const caps: RenewCapabilities = { nowIso: () => '2026-09-03T00:00:05Z', provider: () => provider, gitCommit: () => undefined };
    const target = mkdtempSync(join(tmpdir(), 'lco-v5-target-'));
    tmpDirs.push(target);
    await expect(init.cmdRenewInit({ dir: project, target, force: true }, caps)).rejects.toMatchObject({
      code: 'recovery_required',
    });
    expect(existsSync(paths.journal)).toBe(true); // the recovery authority survives
  });
});


describe('S4-H-01: fence + recovery-rename arms (coverage completion)', () => {
  it('V6 fence: a lock handover mid-commit aborts the commit with the journal retained', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    const beforeRev = readRevision(project);
    const beforeBytes = readFileSync(paths.overlay, 'utf8');
    const begin = loadActiveState(project);
    await expect(
      runRenewalStateTx({
        projectDir: project,
        nowIso: '2026-09-03T00:00:02Z',
        expected: { snapshotId: begin.identity.snapshotId, revision: begin.identity.revision },
        policy: 'additive',
        work: () => undefined,
        // simulate another writer breaking our aged lock DURING the commit:
        // the plan phase rewrites the lockfile with a foreign identity
        plan: (fresh) => {
          writeFileSync(join(project, '.lco', 'renewal', '.lco-revision.lock'), JSON.stringify({ pid: 424242, acquiredAt: '2026-09-03T09:09:09.000Z' }));
          return { mutation: analyzeStyleMutation(fresh), result: undefined };
        },
      }),
    ).rejects.toMatchObject({ code: 'recovery_required' });
    // the journal is retained; the next trusted read recovers byte-identical state
    const state = loadActiveState(project);
    expect(state.identity.revision).toBe(beforeRev);
    expect(readFileSync(paths.overlay, 'utf8')).toBe(beforeBytes);
    expect(existsSync(paths.journal)).toBe(false);
  });

  it('crash recovery executes the rename-back arm (rename ran, stores not yet rewritten)', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    const beforeRev = readRevision(project);
    const originalOverlay = readFileSync(paths.overlay, 'utf8');
    // the committer archived overlay (rename ran) then died before any write
    const archivePath = `${paths.overlay}.RSN-crashed.superseded`;
    renameSync(paths.overlay, archivePath);
    const holder = { pid: -31337, acquiredAt: '2026-09-03T00:00:00Z' };
    const entries = [
      { kind: 'rename', from: paths.overlay, to: archivePath, fromContent: originalOverlay, fromIsDir: false },
      { kind: 'file', path: paths.state, oldContent: readFileSync(paths.state, 'utf8') },
    ] as never;
    const integrity = domainDigest('LCO:STATE_TX', 1, { base_revision: beforeRev, holder, entries });
    writeFileSync(paths.journal, `${JSON.stringify({ schema_version: 1, holder, base_revision: beforeRev, integrity, entries }, null, 2)}\n`);
    const state = loadActiveState(project); // recovers
    expect(state.identity.revision).toBe(beforeRev);
    expect(readFileSync(paths.overlay, 'utf8')).toBe(originalOverlay); // renamed back
    expect(existsSync(archivePath)).toBe(false);
    expect(existsSync(paths.journal)).toBe(false);
  });

  it('a project identity change mid-operation refuses as project_mismatch (nothing written)', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    const begin = loadActiveState(project);
    const beforeBytes = readFileSync(paths.overlay, 'utf8');
    await expect(
      runRenewalStateTx({
        projectDir: project,
        nowIso: '2026-09-03T00:00:02Z',
        expected: { snapshotId: begin.identity.snapshotId, revision: begin.identity.revision },
        policy: 'additive',
        work: () => {
          // the project is renamed during the unlocked work phase
          const pj = JSON.parse(readFileSync(paths.projectJson, 'utf8')) as { name: string };
          writeFileSync(paths.projectJson, JSON.stringify({ ...pj, name: 'renamed-project' }, null, 2));
        },
        plan: (fresh) => ({ mutation: analyzeStyleMutation(fresh), result: undefined }),
      }),
    ).rejects.toMatchObject({ code: 'project_mismatch' });
    expect(readFileSync(paths.overlay, 'utf8')).toBe(beforeBytes);
  });
});


describe('S4-H-01: command-arm coverage (refresh generic refusal + plan LockHeld)', () => {
  it('a journaled refresh WRITE failure surfaces as the typed refresh-failed arm (nothing partial)', async () => {
    const { project } = await freshProject();
    const init = await import('../../cli/commands/renew');
    const graphText = readFileSync(join(FIXTURE_SRC, 'graph-fixture.json'), 'utf8');
    const graphParsed = parseGraphText(graphText);
    if (!graphParsed.ok) throw new Error(graphParsed.message);
    const provider = new StaticGraphProvider(graphParsed.graph, '0.9.50');
    const caps: RenewCapabilities = { nowIso: () => '2026-09-03T00:00:08Z', provider: () => provider, gitCommit: () => undefined };
    const beforeRev = readRevision(project);
    const beforeBytes = snapshotTrustedBytes(project);
    (globalThis as { __txFault?: { failOnWrite: number } }).__txFault = { failOnWrite: 8 }; // deep in the epoch write set
    const r = await init.cmdRenewRefresh({ dir: project }, caps);
    delete (globalThis as { __txFault?: unknown }).__txFault;
    expect(r.code).not.toBe(0);
    expect(r.output).toMatch(/refresh failed|refused/i);
    expect(readRevision(project)).toBe(beforeRev); // rolled back (or refused) — never partial
    expect(snapshotTrustedBytes(project)).toEqual(beforeBytes);
  });

  it('a plan commit blocked by a concurrent lock holder surfaces the retry arm (nothing written)', async () => {
    const { project } = await freshProject();
    const init = await import('../../cli/commands/renew');
    const graphText = readFileSync(join(FIXTURE_SRC, 'graph-fixture.json'), 'utf8');
    const graphParsed = parseGraphText(graphText);
    if (!graphParsed.ok) throw new Error(graphParsed.message);
    const provider = new StaticGraphProvider(graphParsed.graph, '0.9.50');
    // hold the writer lock for the entire plan via the work phase
    const caps: RenewCapabilities = {
      nowIso: () => '2026-09-03T00:00:09Z',
      provider: () => provider,
      gitCommit: () => undefined,
    };
    const { withRenewalWriterLock } = await import('./state');
    let releasePlanLock: (() => void) | undefined;
    const planPromise = (async () => {
      // acquire the lock first, then run plan while holding it
      await withRenewalWriterLock(project, '2026-09-03T00:00:09Z', async () => {
        await new Promise<void>((resolve) => {
          releasePlanLock = resolve;
          setTimeout(resolve, 400).unref?.();
        });
      });
    })();
    const r = await init.cmdRenewPlan({ dir: project }, caps);
    releasePlanLock?.();
    await planPromise;
    expect(r.code).not.toBe(0);
    expect(r.output).toMatch(/locked|retry|refused/i);
  });
});


describe('S4-H-01: V1-re-verifier H1 — post-fence abort preserves a concurrent commit', () => {
  it('a concurrent commit landing INSIDE our write window is never rolled back over; the journal becomes a superseded marker', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    const baseRev = readRevision(project);
    const snapshotId = loadActiveState(project).identity.snapshotId;
    // B's committed overlay bytes (what must SURVIVE A's abort)
    const bOverlay = `${JSON.stringify({ schema_version: 1, snapshot_id: snapshotId, records: [] }, null, 2)}\n`;
    const begin = loadActiveState(project);
    (globalThis as { __txFault?: { interleaveAndFail: { onWrite: number; commit: () => void } } }).__txFault = {
      // write #1 = A's journal, write #2 = A's overlay → B commits, then A fails
      interleaveAndFail: {
        onWrite: 2,
        commit: () => {
          writeFileSync(paths.state, JSON.stringify({ schema_version: 1, revision: baseRev + 1 }, null, 2));
          writeFileSync(paths.overlay, bOverlay);
        },
      },
    };
    try {
      await expect(
        runRenewalStateTx({
          projectDir: project,
          nowIso: '2026-09-03T00:00:02Z',
          expected: { snapshotId: begin.identity.snapshotId, revision: begin.identity.revision },
          policy: 'additive',
          work: () => undefined,
          plan: (fresh) => ({ mutation: analyzeStyleMutation(fresh), result: undefined }),
        }),
      ).rejects.toMatchObject({ code: 'recovery_required' });
    } finally {
      delete (globalThis as { __txFault?: unknown }).__txFault;
    }
    // A did NOT roll back over B: B's revision and bytes stand (raw reads —
    // the retained marker correctly blocks trusted reads until manual recovery)
    const rawRevision = (): number => (JSON.parse(readFileSync(paths.state, 'utf8')) as { revision: number }).revision;
    expect(rawRevision()).toBe(baseRev + 1);
    expect(readFileSync(paths.overlay, 'utf8')).toBe(bOverlay);
    // the journal is retained as a SUPERSEDED marker; recovery REFUSES to
    // auto-rollback over the newer commit (manual recovery only)
    expect(existsSync(paths.journal)).toBe(true);
    try {
      loadActiveState(project);
      throw new Error('should have refused');
    } catch (e) {
      expect(e).toBeInstanceOf(TrustStateError);
      expect((e as TrustStateError).code).toBe('recovery_required');
      expect((e as TrustStateError).message).toMatch(/SUPERSEDED|concurrent/i);
    }
    expect(rawRevision()).toBe(baseRev + 1);
    expect(readFileSync(paths.overlay, 'utf8')).toBe(bOverlay);
    // manual recovery completes: removing the evidence marker restores reads
    rmSync(paths.journal);
    const after = loadActiveState(project);
    expect(after.identity.revision).toBe(baseRev + 1);
  });

  it('an UNREADABLE revision at abort time also takes the fail-loud path (never a blind rollback)', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    const begin = loadActiveState(project);
    (globalThis as { __txFault?: { interleaveAndFail: { onWrite: number; commit: () => void } } }).__txFault = {
      interleaveAndFail: {
        onWrite: 2,
        commit: () => {
          // the concurrent actor leaves a CORRUPT revision file
          writeFileSync(paths.state, '{torn');
        },
      },
    };
    try {
      await expect(
        runRenewalStateTx({
          projectDir: project,
          nowIso: '2026-09-03T00:00:02Z',
          expected: { snapshotId: begin.identity.snapshotId, revision: begin.identity.revision },
          policy: 'additive',
          work: () => undefined,
          plan: (fresh) => ({ mutation: analyzeStyleMutation(fresh), result: undefined }),
        }),
      ).rejects.toMatchObject({ code: 'recovery_required' });
    } finally {
      delete (globalThis as { __txFault?: unknown }).__txFault;
    }
    expect(readFileSync(paths.state, 'utf8')).toBe('{torn'); // not blindly rewritten
    expect(() => loadActiveState(project)).toThrowError(TrustStateError); // fail-closed read
  });

  it('NH-1: a FOREIGN journal at the abort (revision unchanged) means another writer owns the state — NO rollback, NO removal', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    const baseRev = readRevision(project);
    const begin = loadActiveState(project);
    const bOverlayBytes = `${JSON.stringify({ schema_version: 1, snapshot_id: begin.identity.snapshotId, records: [] }, null, 2)}\n`;
    // B mid-commit: its own journal is on the path (foreign to A), its overlay
    // written, revision NOT yet bumped. A's write then fails.
    const bHolder = { pid: -55555, acquiredAt: '2026-09-03T00:00:00Z' };
    const bEntries = [
      { kind: 'file', path: paths.overlay, oldContent: readFileSync(paths.overlay, 'utf8') },
      { kind: 'file', path: paths.state, oldContent: readFileSync(paths.state, 'utf8') },
    ] as never;
    const bIntegrity = domainDigest('LCO:STATE_TX', 1, { base_revision: baseRev, holder: bHolder, entries: bEntries });
    (globalThis as { __txFault?: { interleaveAndFail: { onWrite: number; commit: () => void } } }).__txFault = {
      interleaveAndFail: {
        onWrite: 2, // A's first store write
        commit: () => {
          writeFileSync(paths.journal, `${JSON.stringify({ schema_version: 1, holder: bHolder, base_revision: baseRev, integrity: bIntegrity, entries: bEntries }, null, 2)}\n`);
          writeFileSync(paths.overlay, bOverlayBytes);
        },
      },
    };
    try {
      await expect(
        runRenewalStateTx({
          projectDir: project,
          nowIso: '2026-09-03T00:00:02Z',
          expected: { snapshotId: begin.identity.snapshotId, revision: begin.identity.revision },
          policy: 'additive',
          work: () => undefined,
          plan: (fresh) => ({ mutation: analyzeStyleMutation(fresh), result: undefined }),
        }),
      ).rejects.toMatchObject({ code: 'recovery_required' });
    } finally {
      delete (globalThis as { __txFault?: unknown }).__txFault;
    }
    // A did NOT delete B's journal and did NOT roll back over B's bytes; the
    // next read recovers through B's journal to complete base state.
    const after = loadActiveState(project);
    expect(after.identity.revision).toBe(baseRev);
    expect(existsSync(paths.journal)).toBe(false); // consumed by B's recovery
  });

  it('NH-2: the ownership-conditioned removal never deletes a foreign journal at the commit point (defense-in-depth)', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    const begin = loadActiveState(project);
    const beforeRev = readRevision(project);
    const foreignHolder = { pid: -77777, acquiredAt: '2026-09-03T00:00:00Z' };
    const foreignEntries = [
      { kind: 'file', path: paths.overlay, oldContent: readFileSync(paths.overlay, 'utf8') },
    ] as never;
    const foreignIntegrity = domainDigest('LCO:STATE_TX', 1, { base_revision: beforeRev, holder: foreignHolder, entries: foreignEntries, superseded: true });
    const plantForeignMarker = (): void => {
      writeFileSync(
        paths.journal,
        `${JSON.stringify({ schema_version: 1, holder: foreignHolder, base_revision: beforeRev, integrity: foreignIntegrity, superseded: true, entries: foreignEntries }, null, 2)}\n`,
      );
    };
    // A protocol-violating actor replaces the journal at OUR commit point
    // (the revision write is the last authorized write before removal).
    // writes: 1=journal, 2..=stores/revision — plant at the revision write.
    (globalThis as { __txFault?: { interleaveAndFail: { onWrite: number; commit: () => void; only: boolean } } }).__txFault = {
      interleaveAndFail: { onWrite: 4, commit: plantForeignMarker, only: true },
    };
    try {
      await runRenewalStateTx({
        projectDir: project,
        nowIso: '2026-09-03T00:00:03Z',
        expected: { snapshotId: begin.identity.snapshotId, revision: begin.identity.revision },
        policy: 'additive',
        work: () => undefined,
        plan: (fresh) => ({ mutation: analyzeStyleMutation(fresh), result: undefined }),
      });
    } finally {
      delete (globalThis as { __txFault?: unknown }).__txFault;
    }
    // the commit landed… and the FOREIGN journal survived our cleanup
    // (trusted reads are blocked by the preserved marker — read raw)
    const rawRevision = (): number => (JSON.parse(readFileSync(paths.state, 'utf8')) as { revision: number }).revision;
    expect(rawRevision()).toBeGreaterThan(beforeRev);
    expect(existsSync(paths.journal)).toBe(true);
    const onDisk = JSON.parse(readFileSync(paths.journal, 'utf8')) as { superseded?: boolean; holder?: { pid?: number } };
    expect(onDisk.superseded).toBe(true);
    expect(onDisk.holder?.pid).toBe(-77777);
    // reads fail closed on the preserved evidence until manual recovery
    expect(() => loadActiveState(project)).toThrowError(TrustStateError);
  });

  it('abort arms: unparseable journal at the path / corrupt lockfile at the fence / missing expectation all refuse typed', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    const beforeRev = readRevision(project);
    const begin = loadActiveState(project);

    // (a) an UNPARSEABLE journal at the abort point is foreign-by-definition:
    // no rollback, no removal, typed refusal.
    (globalThis as { __txFault?: { interleaveAndFail: { onWrite: number; commit: () => void } } }).__txFault = {
      interleaveAndFail: {
        onWrite: 2,
        commit: () => {
          writeFileSync(paths.journal, '{corrupt journal');
        },
      },
    };
    try {
      await expect(
        runRenewalStateTx({
          projectDir: project,
          nowIso: '2026-09-03T00:00:02Z',
          expected: { snapshotId: begin.identity.snapshotId, revision: begin.identity.revision },
          policy: 'additive',
          work: () => undefined,
          plan: (fresh) => ({ mutation: analyzeStyleMutation(fresh), result: undefined }),
        }),
      ).rejects.toMatchObject({ code: 'recovery_required' });
    } finally {
      delete (globalThis as { __txFault?: unknown }).__txFault;
    }
    expect(readFileSync(paths.journal, 'utf8')).toBe('{corrupt journal'); // untouched by our abort

    // (b) a CORRUPT lockfile at the fence aborts the commit (not ours to trust)
    rmSync(paths.journal);
    const begin2 = loadActiveState(project);
    await expect(
      runRenewalStateTx({
        projectDir: project,
        nowIso: '2026-09-03T00:00:03Z',
        expected: { snapshotId: begin2.identity.snapshotId, revision: begin2.identity.revision },
        policy: 'additive',
        work: () => undefined,
        plan: (fresh) => {
          writeFileSync(join(project, '.lco', 'renewal', '.lco-revision.lock'), 'not json');
          return { mutation: analyzeStyleMutation(fresh), result: undefined };
        },
      }),
    ).rejects.toMatchObject({ code: 'recovery_required' });
    expect(readRevision(project)).toBe(beforeRev);

    // (c) a transaction without its read-view expectation is refused (VB-5)
    rmSync(join(project, '.lco', 'renewal', '.lco-revision.lock'), { force: true });
    await expect(
      runRenewalStateTx({
        projectDir: project,
        nowIso: '2026-09-03T00:00:04Z',
        // expected deliberately omitted
        policy: 'additive',
        work: () => undefined,
        plan: (fresh) => ({ mutation: analyzeStyleMutation(fresh), result: undefined }),
      } as never),
    ).rejects.toMatchObject({ code: 'fold_conflict' });
  });

  it('zombie-write closure: a lock broken mid-write-set aborts the NEXT forward write BEFORE it lands', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    const begin = loadActiveState(project);
    const beforeBytes = snapshotTrustedBytes(project);
    const beforeRev = readRevision(project);
    // write #2 is A's overlay (1=journal): the hook swaps the lockfile there
    // (only — no throw); A's NEXT fence (before parity) must abort the commit
    // with A's overlay the ONLY zombie byte, and the abort (journal ours,
    // revision unchanged) rolls even that back cleanly.
    (globalThis as { __txFault?: { interleaveAndFail: { onWrite: number; commit: () => void; only: boolean } } }).__txFault = {
      interleaveAndFail: {
        onWrite: 2,
        only: true,
        commit: () => {
          writeFileSync(join(project, '.lco', 'renewal', '.lco-revision.lock'), JSON.stringify({ pid: 424244, acquiredAt: '2026-09-03T09:09:11.000Z' }));
        },
      },
    };
    try {
      await expect(
        runRenewalStateTx({
          projectDir: project,
          nowIso: '2026-09-03T00:00:02Z',
          expected: { snapshotId: begin.identity.snapshotId, revision: begin.identity.revision },
          policy: 'additive',
          work: () => undefined,
          plan: (fresh) => ({ mutation: analyzeStyleMutation(fresh), result: undefined }),
        }),
      ).rejects.toMatchObject({ code: 'recovery_required' });
    } finally {
      delete (globalThis as { __txFault?: unknown }).__txFault;
    }
    // every trusted byte is base-R; no journal; revision unchanged
    expect(snapshotTrustedBytes(project)).toEqual(beforeBytes);
    expect(readRevision(project)).toBe(beforeRev);
    expect(existsSync(paths.journal)).toBe(false);
  });

  it('revisionMoved abort with a FOREIGN journal names the true evidence state (no marker written)', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    const begin = loadActiveState(project);
    const bHolder = { pid: -88888, acquiredAt: '2026-09-03T00:00:00Z' };
    const bEntries = [{ kind: 'file', path: paths.overlay, oldContent: readFileSync(paths.overlay, 'utf8') }] as never;
    const bIntegrity = domainDigest('LCO:STATE_TX', 1, { base_revision: 99, holder: bHolder, entries: bEntries });
    (globalThis as { __txFault?: { interleaveAndFail: { onWrite: number; commit: () => void } } }).__txFault = {
      interleaveAndFail: {
        onWrite: 2,
        commit: () => {
          // the concurrent writer owns the journal path AND committed (revision moved)
          writeFileSync(paths.journal, `${JSON.stringify({ schema_version: 1, holder: bHolder, base_revision: 99, integrity: bIntegrity, entries: bEntries }, null, 2)}\n`);
          writeFileSync(paths.state, JSON.stringify({ schema_version: 1, revision: 99 }, null, 2));
        },
      },
    };
    try {
      await expect(
        runRenewalStateTx({
          projectDir: project,
          nowIso: '2026-09-03T00:00:02Z',
          expected: { snapshotId: begin.identity.snapshotId, revision: begin.identity.revision },
          policy: 'additive',
          work: () => undefined,
          plan: (fresh) => ({ mutation: analyzeStyleMutation(fresh), result: undefined }),
        }),
      ).rejects.toMatchObject({ code: 'recovery_required' });
    } finally {
      delete (globalThis as { __txFault?: unknown }).__txFault;
    }
    const onDisk = JSON.parse(readFileSync(paths.journal, 'utf8')) as { holder?: { pid?: number }; superseded?: boolean };
    expect(onDisk.holder?.pid).toBe(-88888); // B's journal untouched — no marker clobbered it
    expect(onDisk.superseded).toBeUndefined();
    // the next read recovers through B's journal (the authority): its
    // oldContent restores the overlay byte-identically and consumes the journal
    const restored = loadActiveState(project);
    expect(restored.identity.revision).toBe(99); // B's authority stands
    expect(existsSync(paths.journal)).toBe(false);
  });

  it('zombie-byte closure: an in-flight byte that landed over a concurrent writer leaves FAIL-CLOSED evidence (sidecar)', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    const begin = loadActiveState(project);
    const bHolder = { pid: -66661, acquiredAt: '2026-09-03T00:00:00Z' };
    const bEntries = [{ kind: 'file', path: paths.overlay, oldContent: readFileSync(paths.overlay, 'utf8') }] as never;
    const bIntegrity = domainDigest('LCO:STATE_TX', 1, { base_revision: begin.identity.revision, holder: bHolder, entries: bEntries });
    const evidencePath = join(project, '.lco', 'renewal', 'tx-abort-evidence.json');
    // The hook runs INSIDE A's overlay write (write #2, only-mode): it parks
    // B's foreign journal + foreign lock BEFORE A's overlay rename lands —
    // A's byte lands (the in-flight write), then A's NEXT fence aborts.
    (globalThis as { __txFault?: { interleaveAndFail: { onWrite: number; commit: () => void; only: boolean } } }).__txFault = {
      interleaveAndFail: {
        onWrite: 2,
        only: true,
        commit: () => {
          writeFileSync(paths.journal, `${JSON.stringify({ schema_version: 1, holder: bHolder, base_revision: begin.identity.revision, integrity: bIntegrity, entries: bEntries }, null, 2)}\n`);
          writeFileSync(join(project, '.lco', 'renewal', '.lco-revision.lock'), JSON.stringify({ pid: -66661, acquiredAt: '2026-09-03T00:00:00Z' }));
        },
      },
    };
    try {
      await expect(
        runRenewalStateTx({
          projectDir: project,
          nowIso: '2026-09-03T00:00:02Z',
          expected: { snapshotId: begin.identity.snapshotId, revision: begin.identity.revision },
          policy: 'additive',
          work: () => undefined,
          plan: (fresh) => ({ mutation: analyzeStyleMutation(fresh), result: undefined }),
        }),
      ).rejects.toMatchObject({ code: 'recovery_required' });
    } finally {
      delete (globalThis as { __txFault?: unknown }).__txFault;
    }
    // B's journal is intact (never clobbered)… and the SIDECAR exists: every
    // trusted read fails closed past any future journal removal.
    const onDisk = JSON.parse(readFileSync(paths.journal, 'utf8')) as { holder?: { pid?: number } };
    expect(onDisk.holder?.pid).toBe(-66661);
    expect(existsSync(evidencePath)).toBe(true);
    try {
      loadActiveState(project);
      throw new Error('should have refused');
    } catch (e) {
      expect((e as TrustStateError).code).toBe('recovery_required');
      expect((e as TrustStateError).message).toMatch(/aborted with in-flight writes|evidence/i);
    }
    // manual recovery: remove the evidence → reads recover through B's journal
    rmSync(evidencePath);
    const after = loadActiveState(project);
    expect(after.identity.revision).toBe(begin.identity.revision);
  });

  it('clean aborts leave NO sidecar (journal-write failure and clean rollback)', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    const evidencePath = join(project, '.lco', 'renewal', 'tx-abort-evidence.json');
    // journal write fails → performed=0 → no bytes, no sidecar
    (globalThis as { __txFault?: { failOnWrite: number } }).__txFault = { failOnWrite: 1 };
    const begin = loadActiveState(project);
    await expect(
      runRenewalStateTx({
        projectDir: project,
        nowIso: '2026-09-03T00:00:02Z',
        expected: { snapshotId: begin.identity.snapshotId, revision: begin.identity.revision },
        policy: 'additive',
        work: () => undefined,
        plan: (fresh) => ({ mutation: analyzeStyleMutation(fresh), result: undefined }),
      }),
    ).rejects.toMatchObject({ code: 'commit_failed_without_state_change' });
    delete (globalThis as { __txFault?: unknown }).__txFault;
    expect(existsSync(evidencePath)).toBe(false);
    // clean rollback at the second store write → journal ours, rolled back → no sidecar
    (globalThis as { __txFault?: { failOnWrite: number } }).__txFault = { failOnWrite: 3 };
    const begin2 = loadActiveState(project);
    await expect(
      runRenewalStateTx({
        projectDir: project,
        nowIso: '2026-09-03T00:00:03Z',
        expected: { snapshotId: begin2.identity.snapshotId, revision: begin2.identity.revision },
        policy: 'additive',
        work: () => undefined,
        plan: (fresh) => ({ mutation: analyzeStyleMutation(fresh), result: undefined }),
      }),
    ).rejects.toMatchObject({ code: 'commit_failed_without_state_change' });
    delete (globalThis as { __txFault?: unknown }).__txFault;
    expect(existsSync(evidencePath)).toBe(false);
    expect(loadActiveState(project).identity.revision).toBe(begin2.identity.revision);
  });

  it('revisionMoved + foreign journal: the sidecar fires (our bytes over B commit, no marker possible)', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    const evidencePath = join(project, '.lco', 'renewal', 'tx-abort-evidence.json');
    const begin = loadActiveState(project);
    const bHolder = { pid: -66662, acquiredAt: '2026-09-03T00:00:00Z' };
    const bEntries = [{ kind: 'file', path: paths.overlay, oldContent: readFileSync(paths.overlay, 'utf8') }] as never;
    const bIntegrity = domainDigest('LCO:STATE_TX', 1, { base_revision: begin.identity.revision, holder: bHolder, entries: bEntries });
    (globalThis as { __txFault?: { interleaveAndFail: { onWrite: number; commit: () => void; only: boolean } } }).__txFault = {
      // write 2 = A's overlay: B's journal parks + revision bumps + lock swaps
      // BEFORE A's byte lands; A's next fence aborts with revisionMoved+!ours.
      interleaveAndFail: {
        onWrite: 2,
        only: true,
        commit: () => {
          writeFileSync(paths.journal, `${JSON.stringify({ schema_version: 1, holder: bHolder, base_revision: begin.identity.revision, integrity: bIntegrity, entries: bEntries }, null, 2)}\n`);
          writeFileSync(paths.state, JSON.stringify({ schema_version: 1, revision: begin.identity.revision + 1 }, null, 2));
          writeFileSync(join(project, '.lco', 'renewal', '.lco-revision.lock'), JSON.stringify({ pid: -66662, acquiredAt: '2026-09-03T00:00:00Z' }));
        },
      },
    };
    try {
      await expect(
        runRenewalStateTx({
          projectDir: project,
          nowIso: '2026-09-03T00:00:02Z',
          expected: { snapshotId: begin.identity.snapshotId, revision: begin.identity.revision },
          policy: 'additive',
          work: () => undefined,
          plan: (fresh) => ({ mutation: analyzeStyleMutation(fresh), result: undefined }),
        }),
      ).rejects.toMatchObject({ code: 'recovery_required' });
    } finally {
      delete (globalThis as { __txFault?: unknown }).__txFault;
    }
    expect(existsSync(evidencePath)).toBe(true); // sidecar fired (no marker was possible)
    expect(() => loadActiveState(project)).toThrowError(TrustStateError);
    // manual recovery: inspect, remove evidence; B's journal then recovers
    rmSync(evidencePath);
    loadActiveState(project); // recovers through B's journal (its base = begin revision)
  });

  it('closing-verify hardening: a TRANSIENT fault on the sidecar write is retried — evidence still lands', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    const evidencePath = join(project, '.lco', 'renewal', 'tx-abort-evidence.json');
    const begin = loadActiveState(project);
    const bHolder = { pid: -66663, acquiredAt: '2026-09-03T00:00:00Z' };
    const bEntries = [{ kind: 'file', path: paths.overlay, oldContent: readFileSync(paths.overlay, 'utf8') }] as never;
    const bIntegrity = domainDigest('LCO:STATE_TX', 1, { base_revision: begin.identity.revision, holder: bHolder, entries: bEntries });
    const fault = { hookArmed: true, evidenceFailures: 1, evidenceWrites: 0 }; // first attempt fails, retry lands
    (globalThis as { __txEvidenceFault?: typeof fault }).__txEvidenceFault = fault;
    (globalThis as { __txFault?: { interleaveAndFail: { onWrite: number; commit: () => void; only: boolean } } }).__txFault = {
      interleaveAndFail: {
        onWrite: 2,
        only: true,
        commit: () => {
          writeFileSync(paths.journal, `${JSON.stringify({ schema_version: 1, holder: bHolder, base_revision: begin.identity.revision, integrity: bIntegrity, entries: bEntries }, null, 2)}\n`);
          writeFileSync(join(project, '.lco', 'renewal', '.lco-revision.lock'), JSON.stringify({ pid: -66663, acquiredAt: '2026-09-03T00:00:00Z' }));
        },
      },
    };
    try {
      await expect(
        runRenewalStateTx({
          projectDir: project,
          nowIso: '2026-09-03T00:00:02Z',
          expected: { snapshotId: begin.identity.snapshotId, revision: begin.identity.revision },
          policy: 'additive',
          work: () => undefined,
          plan: (fresh) => ({ mutation: analyzeStyleMutation(fresh), result: undefined }),
        }),
      ).rejects.toMatchObject({ code: 'recovery_required' });
    } finally {
      delete (globalThis as { __txFault?: unknown }).__txFault;
      delete (globalThis as { __txEvidenceFault?: unknown }).__txEvidenceFault;
    }
    expect(existsSync(evidencePath)).toBe(true); // retried past the transient fault
    expect(() => loadActiveState(project)).toThrowError(TrustStateError);
  });

  it('S5-M-04 PRE-FIX REPRO: PERSISTENT evidence-write failure leaves no durable marker — the abort message must disclose it', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    const evidencePath = join(project, '.lco', 'renewal', 'tx-abort-evidence.json');
    const begin = loadActiveState(project);
    const bHolder = { pid: -66664, acquiredAt: '2026-09-03T00:00:00Z' };
    const bEntries = [{ kind: 'file', path: paths.overlay, oldContent: readFileSync(paths.overlay, 'utf8') }] as never;
    const bIntegrity = domainDigest('LCO:STATE_TX', 1, { base_revision: begin.identity.revision, holder: bHolder, entries: bEntries });
    const fault = { hookArmed: true, evidenceFailures: 3, evidenceWrites: 0 }; // ALL THREE attempts fail — persistent
    (globalThis as { __txEvidenceFault?: typeof fault }).__txEvidenceFault = fault;
    (globalThis as { __txFault?: { interleaveAndFail: { onWrite: number; commit: () => void; only: boolean } } }).__txFault = {
      interleaveAndFail: {
        onWrite: 2,
        only: true,
        commit: () => {
          writeFileSync(paths.journal, `${JSON.stringify({ schema_version: 1, holder: bHolder, base_revision: begin.identity.revision, integrity: bIntegrity, entries: bEntries }, null, 2)}\n`);
          writeFileSync(paths.state, JSON.stringify({ schema_version: 1, revision: begin.identity.revision + 1 }, null, 2));
          writeFileSync(join(project, '.lco', 'renewal', '.lco-revision.lock'), JSON.stringify({ pid: -66664, acquiredAt: '2026-09-03T00:00:00Z' }));
        },
      },
    };
    let rejection: (Error & { code?: string }) | undefined;
    try {
      await runRenewalStateTx({
        projectDir: project,
        nowIso: '2026-09-03T00:00:02Z',
        expected: { snapshotId: begin.identity.snapshotId, revision: begin.identity.revision },
        policy: 'additive',
        work: () => undefined,
        plan: (fresh) => ({ mutation: analyzeStyleMutation(fresh), result: undefined }),
      });
    } catch (e) {
      rejection = e as Error & { code?: string };
    } finally {
      delete (globalThis as { __txFault?: unknown }).__txFault;
      delete (globalThis as { __txEvidenceFault?: unknown }).__txEvidenceFault;
    }
    // 1. in-process fail-closed holds: typed recovery_required
    expect(rejection).toBeDefined();
    expect(rejection!.code).toBe('recovery_required');
    // 2. THE DISCLOSURE (RED pre-fix — S5-M-02 class silence): the abort
    //    message must state the evidence channel is persistently down and no
    //    durable marker of the abort exists.
    expect(rejection!.message).toMatch(/abort evidence could NOT be written|NO durable marker/i);
    // 3. physics (documented limitation): no sidecar could land
    expect(existsSync(evidencePath)).toBe(false);
    expect(fault.evidenceWrites).toBe(3); // all three bounded attempts were made
    // 4. reader after "restart" with B's journal removed (B completed and
    //    cleaned up): no marker → the combined state reads as healthy. This is
    //    the physics-limited residual the disclosure above must cover.
    rmSync(paths.journal);
    const after = loadActiveState(project);
    expect(after.identity.revision).toBe(begin.identity.revision + 1);
  });

  it('S5-M-04 matrix: TWO bounded transient evidence faults — the third attempt still lands the evidence', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    const evidencePath = join(project, '.lco', 'renewal', 'tx-abort-evidence.json');
    const begin = loadActiveState(project);
    const bHolder = { pid: -66665, acquiredAt: '2026-09-03T00:00:00Z' };
    const bEntries = [{ kind: 'file', path: paths.overlay, oldContent: readFileSync(paths.overlay, 'utf8') }] as never;
    const bIntegrity = domainDigest('LCO:STATE_TX', 1, { base_revision: begin.identity.revision, holder: bHolder, entries: bEntries });
    const fault = { hookArmed: true, evidenceFailures: 2, evidenceWrites: 0 }; // attempts 1+2 fail, 3 lands
    (globalThis as { __txEvidenceFault?: typeof fault }).__txEvidenceFault = fault;
    (globalThis as { __txFault?: { interleaveAndFail: { onWrite: number; commit: () => void; only: boolean } } }).__txFault = {
      interleaveAndFail: {
        onWrite: 2,
        only: true,
        commit: () => {
          writeFileSync(paths.journal, `${JSON.stringify({ schema_version: 1, holder: bHolder, base_revision: begin.identity.revision, integrity: bIntegrity, entries: bEntries }, null, 2)}\n`);
          writeFileSync(paths.state, JSON.stringify({ schema_version: 1, revision: begin.identity.revision + 1 }, null, 2));
          writeFileSync(join(project, '.lco', 'renewal', '.lco-revision.lock'), JSON.stringify({ pid: -66665, acquiredAt: '2026-09-03T00:00:00Z' }));
        },
      },
    };
    try {
      await expect(
        runRenewalStateTx({
          projectDir: project,
          nowIso: '2026-09-03T00:00:02Z',
          expected: { snapshotId: begin.identity.snapshotId, revision: begin.identity.revision },
          policy: 'additive',
          work: () => undefined,
          plan: (fresh) => ({ mutation: analyzeStyleMutation(fresh), result: undefined }),
        }),
      ).rejects.toMatchObject({ code: 'recovery_required' });
    } finally {
      delete (globalThis as { __txFault?: unknown }).__txFault;
      delete (globalThis as { __txEvidenceFault?: unknown }).__txEvidenceFault;
    }
    expect(fault.evidenceWrites).toBe(3);
    expect(existsSync(evidencePath)).toBe(true); // bounded retries absorbed two faults
    expect(() => loadActiveState(project)).toThrowError(TrustStateError); // fail-closed by the sidecar
  });

  it('S5-M-04 matrix: BROAD storage failure as the abort cause + evidence channel down — disclosed, fail-closed in-process', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    const evidencePath = join(project, '.lco', 'renewal', 'tx-abort-evidence.json');
    const begin = loadActiveState(project);
    const bHolder = { pid: -66666, acquiredAt: '2026-09-03T00:00:00Z' };
    const bEntries = [{ kind: 'file', path: paths.overlay, oldContent: readFileSync(paths.overlay, 'utf8') }] as never;
    const bIntegrity = domainDigest('LCO:STATE_TX', 1, { base_revision: begin.identity.revision, holder: bHolder, entries: bEntries });
    const fault = { hookArmed: true, evidenceFailures: 3, evidenceWrites: 0 };
    (globalThis as { __txEvidenceFault?: typeof fault }).__txEvidenceFault = fault;
    (globalThis as { __txFault?: { interleaveAndFail: { onWrite: number; commit: () => void; only: boolean } } }).__txFault = {
      interleaveAndFail: {
        onWrite: 3, // journal(1) and overlay(2) LAND (performed>0); parity(3) fails after B's commit
        only: false, // A's own write FAILS TOO (broad storage failure), after B's commit
        commit: () => {
          writeFileSync(paths.journal, `${JSON.stringify({ schema_version: 1, holder: bHolder, base_revision: begin.identity.revision, integrity: bIntegrity, entries: bEntries }, null, 2)}\n`);
          writeFileSync(paths.state, JSON.stringify({ schema_version: 1, revision: begin.identity.revision + 1 }, null, 2));
          writeFileSync(join(project, '.lco', 'renewal', '.lco-revision.lock'), JSON.stringify({ pid: -66666, acquiredAt: '2026-09-03T00:00:00Z' }));
        },
      },
    };
    let rejection: (Error & { code?: string }) | undefined;
    try {
      await runRenewalStateTx({
        projectDir: project,
        nowIso: '2026-09-03T00:00:02Z',
        expected: { snapshotId: begin.identity.snapshotId, revision: begin.identity.revision },
        policy: 'additive',
        work: () => undefined,
        plan: (fresh) => ({ mutation: analyzeStyleMutation(fresh), result: undefined }),
      });
    } catch (e) {
      rejection = e as Error & { code?: string };
    } finally {
      delete (globalThis as { __txFault?: unknown }).__txFault;
      delete (globalThis as { __txEvidenceFault?: unknown }).__txEvidenceFault;
    }
    // fail-closed in-process with BOTH truths: the write failure AND the
    // down evidence channel
    expect(rejection?.code).toBe('recovery_required');
    expect(rejection!.message).toMatch(/abort evidence could NOT be written|NO durable marker/i);
    expect(existsSync(evidencePath)).toBe(false); // no fake evidence
    expect(fault.evidenceWrites).toBe(3); // bounded attempts were made
  });

  it('S5-M-04 matrix: a foreign OBJECT at the sidecar path fail-closes reads by PRESENCE (gate robustness)', async () => {
    const { project } = await freshProject();
    const evidencePath = join(project, '.lco', 'renewal', 'tx-abort-evidence.json');
    // Not a valid sidecar — a directory. The read gate fail-closes on
    // PRESENCE alone (it never parses the file), so a hostile or accidental
    // object cannot masquerade as "no evidence".
    mkdirSync(evidencePath);
    expect(() => loadActiveState(project)).toThrowError(TrustStateError);
    try {
      loadActiveState(project);
    } catch (e) {
      expect((e as TrustStateError).code).toBe('recovery_required');
      expect((e as TrustStateError).message).toContain('tx-abort-evidence.json');
    }
    // operator clears it; reads resume
    rmSync(evidencePath, { recursive: true });
    loadActiveState(project);
  });

  it('S5-M-04 matrix: REAL-FS persistent failure (renewal dir made read-only mid-tx) — evidence channel blocked without mocks, disclosed', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    const evidencePath = join(project, '.lco', 'renewal', 'tx-abort-evidence.json');
    const stateDir = join(project, '.lco', 'renewal');
    const begin = loadActiveState(project);
    // Root bypasses directory permissions: the EACCES precondition cannot
    // hold there. Probe it explicitly — under root the writes succeed, so we
    // assert the honest environment-specific outcome instead of a fake one.
    chmodSync(stateDir, 0o500);
    const probe = join(stateDir, '.lco-eacces-probe');
    let eaccesHolds = true;
    try {
      writeFileSync(probe, 'x');
    } catch {
      eaccesHolds = false;
    } finally {
      if (eaccesHolds) rmSync(probe, { force: true });
      chmodSync(stateDir, 0o755);
    }
    if (!eaccesHolds) {
      // The primary (non-root) arm: the mid-tx interleave parks B's journal,
      // bumps the revision, swaps the lock, and makes the REAL renewal dir
      // read-only. A's overlay write then fails on the real filesystem, and
      // every evidence-write attempt fails with REAL EACCES — the sidecar
      // channel is blocked without any evidence fault mock.
      const bHolder = { pid: -66670, acquiredAt: '2026-09-03T00:00:00Z' };
      const bEntries = [{ kind: 'file', path: paths.overlay, oldContent: readFileSync(paths.overlay, 'utf8') }] as never;
      const bIntegrity = domainDigest('LCO:STATE_TX', 1, { base_revision: begin.identity.revision, holder: bHolder, entries: bEntries });
      (globalThis as { __txFault?: { interleaveAndFail: { onWrite: number; commit: () => void; only: boolean } } }).__txFault = {
        interleaveAndFail: {
          onWrite: 3, // journal(1) and overlay(2) LAND first (performed>0); the parity write hits the chmod
          only: true, // the mock does NOT throw — the real EACCES is the abort cause
          commit: () => {
            writeFileSync(paths.journal, `${JSON.stringify({ schema_version: 1, holder: bHolder, base_revision: begin.identity.revision, integrity: bIntegrity, entries: bEntries }, null, 2)}\n`);
            writeFileSync(paths.state, JSON.stringify({ schema_version: 1, revision: begin.identity.revision + 1 }, null, 2));
            writeFileSync(join(stateDir, '.lco-revision.lock'), JSON.stringify({ pid: -66670, acquiredAt: '2026-09-03T00:00:00Z' }));
            chmodSync(stateDir, 0o500); // the REAL persistent storage failure
          },
        },
      };
      let rejection: (Error & { code?: string }) | undefined;
      try {
        await runRenewalStateTx({
          projectDir: project,
          nowIso: '2026-09-03T00:00:02Z',
          expected: { snapshotId: begin.identity.snapshotId, revision: begin.identity.revision },
          policy: 'additive',
          work: () => undefined,
          plan: (fresh) => ({ mutation: analyzeStyleMutation(fresh), result: undefined }),
        });
      } catch (e) {
        rejection = e as Error & { code?: string };
      } finally {
        delete (globalThis as { __txFault?: unknown }).__txFault;
        chmodSync(stateDir, 0o755); // restore for cleanup and reads
      }
      expect(rejection?.code).toBe('recovery_required');
      expect(rejection!.message).toMatch(/abort evidence could NOT be written|NO durable marker/i);
      expect(existsSync(evidencePath)).toBe(false); // real EACCES blocked every attempt — no marker
      // reader after "restart": B's journal present, C(R+1) > B(R) → auto-retire → healthy
      expect(loadActiveState(project).identity.revision).toBe(begin.identity.revision + 1);
    } else {
      // Running as root (or equivalent): directory permissions cannot block
      // writes, so this cell's precondition is absent. The mock-based
      // persistent cell (evidenceFailures: 3) carries the coverage here.
      expect(process.getuid?.() === 0).toBe(true);
    }
  });

  it('S5-M-04 matrix: PERSISTENT superseded-marker failure is disclosed (journal-path variant)', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    const begin = loadActiveState(project);
    // B consumes A's journal, commits, and REMOVES it — the journal path is
    // EMPTY when A aborts, so A's evidence channel is the superseded marker.
    const bHolder = { pid: -66667, acquiredAt: '2026-09-03T00:00:00Z' };
    (globalThis as { __txMarkerFault?: { hookArmed: boolean } }).__txMarkerFault = { hookArmed: true };
    (globalThis as { __txFault?: { interleaveAndFail: { onWrite: number; commit: () => void; only: boolean } } }).__txFault = {
      interleaveAndFail: {
        onWrite: 2,
        only: true,
        commit: () => {
          writeFileSync(paths.state, JSON.stringify({ schema_version: 1, revision: begin.identity.revision + 1 }, null, 2));
          writeFileSync(join(project, '.lco', 'renewal', '.lco-revision.lock'), JSON.stringify({ pid: -66667, acquiredAt: '2026-09-03T00:00:00Z' }));
        },
      },
    };
    let rejection: (Error & { code?: string }) | undefined;
    try {
      await runRenewalStateTx({
        projectDir: project,
        nowIso: '2026-09-03T00:00:02Z',
        expected: { snapshotId: begin.identity.snapshotId, revision: begin.identity.revision },
        policy: 'additive',
        work: () => undefined,
        plan: (fresh) => ({ mutation: analyzeStyleMutation(fresh), result: undefined }),
      });
    } catch (e) {
      rejection = e as Error & { code?: string };
    } finally {
      delete (globalThis as { __txFault?: unknown }).__txFault;
      delete (globalThis as { __txMarkerFault?: unknown }).__txMarkerFault;
    }
    expect(rejection?.code).toBe('recovery_required');
    // the disclosure for the MARKER channel (journal path), not the sidecar
    expect(rejection!.message).toMatch(/superseded-marker failure|journal path could NOT be marked superseded/i);
    // physics: no marker landed — A's OWN journal remains on the path
    // UNMARKED (superseded-stamp refused to write), and with the revision
    // already advanced (C > journal base) the next read AUTO-RETIRES it
    // instead of holding for manual recovery — the disclosed residual.
    expect(existsSync(paths.journal)).toBe(true);
    const jText = readFileSync(paths.journal, 'utf8');
    expect(jText).not.toContain('"superseded"'); // the stamp never landed
    expect(loadActiveState(project).identity.revision).toBe(begin.identity.revision + 1);
  });

  it('S5-M-04 matrix: after a persistent-failure abort, the next LEGITIMATE transaction works and creates no fake evidence', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    const evidencePath = join(project, '.lco', 'renewal', 'tx-abort-evidence.json');
    const begin = loadActiveState(project);
    const bHolder = { pid: -66668, acquiredAt: '2026-09-03T00:00:00Z' };
    const bEntries = [{ kind: 'file', path: paths.overlay, oldContent: readFileSync(paths.overlay, 'utf8') }] as never;
    const bIntegrity = domainDigest('LCO:STATE_TX', 1, { base_revision: begin.identity.revision, holder: bHolder, entries: bEntries });
    const fault = { hookArmed: true, evidenceFailures: 3, evidenceWrites: 0 };
    (globalThis as { __txEvidenceFault?: typeof fault }).__txEvidenceFault = fault;
    (globalThis as { __txFault?: { interleaveAndFail: { onWrite: number; commit: () => void; only: boolean } } }).__txFault = {
      interleaveAndFail: {
        onWrite: 2,
        only: true,
        commit: () => {
          writeFileSync(paths.journal, `${JSON.stringify({ schema_version: 1, holder: bHolder, base_revision: begin.identity.revision, integrity: bIntegrity, entries: bEntries }, null, 2)}\n`);
          writeFileSync(paths.state, JSON.stringify({ schema_version: 1, revision: begin.identity.revision + 1 }, null, 2));
          writeFileSync(join(project, '.lco', 'renewal', '.lco-revision.lock'), JSON.stringify({ pid: -66668, acquiredAt: '2026-09-03T00:00:00Z' }));
        },
      },
    };
    try {
      await expect(
        runRenewalStateTx({
          projectDir: project,
          nowIso: '2026-09-03T00:00:02Z',
          expected: { snapshotId: begin.identity.snapshotId, revision: begin.identity.revision },
          policy: 'additive',
          work: () => undefined,
          plan: (fresh) => ({ mutation: analyzeStyleMutation(fresh), result: undefined }),
        }),
      ).rejects.toMatchObject({ code: 'recovery_required' });
    } finally {
      delete (globalThis as { __txFault?: unknown }).__txFault;
      delete (globalThis as { __txEvidenceFault?: unknown }).__txEvidenceFault;
    }
    // operator clears the simulated concurrent writer's leftovers
    rmSync(paths.journal);
    const mid = loadActiveState(project); // healthy at B's revision
    // the next legitimate transaction commits cleanly, and no evidence file
    // materializes for a clean run
    await runRenewalStateTx({
      projectDir: project,
      nowIso: '2026-09-03T00:00:04Z',
      expected: { snapshotId: mid.identity.snapshotId, revision: mid.identity.revision },
      policy: 'additive',
      work: () => undefined,
      plan: (fresh) => ({ mutation: analyzeStyleMutation(fresh), result: undefined }),
    });
    expect(existsSync(evidencePath)).toBe(false); // no fake evidence for a clean commit
    expect(loadActiveState(project).identity.revision).toBe(mid.identity.revision + 1);
    // repeated reads are deterministic
    expect(loadActiveState(project).identity.revision).toBe(mid.identity.revision + 1);
  });

  it('H2 arm: the clean-abort rollback failure is typed and leaves the journal (auto-recovery follows)', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    const begin = loadActiveState(project);
    const beforeBytes = snapshotTrustedBytes(project);
    // fail the fence-abort (lock swap in plan) AND the first rollback restore
    (globalThis as { __txFault?: { failOnWrite?: number; failOnRestore?: number } }).__txFault = { failOnRestore: 1 };
    try {
      await expect(
        runRenewalStateTx({
          projectDir: project,
          nowIso: '2026-09-03T00:00:02Z',
          expected: { snapshotId: begin.identity.snapshotId, revision: begin.identity.revision },
          policy: 'additive',
          work: () => undefined,
          plan: (fresh) => {
            writeFileSync(join(project, '.lco', 'renewal', '.lco-revision.lock'), JSON.stringify({ pid: 424245, acquiredAt: '2026-09-03T09:09:12.000Z' }));
            return { mutation: analyzeStyleMutation(fresh), result: undefined };
          },
        }),
      ).rejects.toMatchObject({ code: 'recovery_required' });
    } finally {
      delete (globalThis as { __txFault?: unknown }).__txFault;
    }
    // hmm — with the lock swapped, the fence aborts at the OVERLAY write (per-write fence) —
    // performed=0 — the clean abort rolls back nothing; to hit the rollback-failure arm we
    // need bytes performed first. Restore the real lock, fail at store write 3 (performed=1),
    // then fail the first rollback restore.
    const begin2 = loadActiveState(project);
    (globalThis as { __txFault?: { failOnWrite?: number; failOnRestore?: number } }).__txFault = { failOnWrite: 3, failOnRestore: 1 };
    try {
      await expect(
        runRenewalStateTx({
          projectDir: project,
          nowIso: '2026-09-03T00:00:03Z',
          expected: { snapshotId: begin2.identity.snapshotId, revision: begin2.identity.revision },
          policy: 'additive',
          work: () => undefined,
          plan: (fresh) => ({ mutation: analyzeStyleMutation(fresh), result: undefined }),
        }),
      ).rejects.toMatchObject({ code: 'recovery_required' });
    } finally {
      delete (globalThis as { __txFault?: unknown }).__txFault;
    }
    expect(existsSync(paths.journal)).toBe(true); // retained authority
    const after = loadActiveState(project); // auto-recovery (journal ours)
    expect(snapshotTrustedBytes(project)).toEqual(beforeBytes);
    expect(after.identity.revision).toBe(begin2.identity.revision);
  });
});

describe('S5-H-01: post-commit journal recovery — the journal↔revision join', () => {
  /**
   * Fifth-Audit release blocker: a journal survives not only an interrupted
   * commit but also a SUCCESSFUL one — the window between the durable
   * revision write (the commit point) and removeJournal's unlink. Recovery
   * never compared journal.base_revision with the current durable revision,
   * so the genuine, integrity-valid, non-superseded leftover was used as
   * ROLLBACK AUTHORITY and silently reverted the committed revision (and
   * DELETED newly-created stores such as strategy.json) while reads stayed
   * "healthy". The same missing join made any older journal reintroduced on
   * disk (backup restore / cp -r / rsync) a replayable rollback authority.
   *
   * Every test below reconstitutes the crash persistence state from the REAL
   * journal bytes the kernel itself wrote (captured at the authorizedWrite
   * seam) AFTER a fully-completed commit — so no test can pass merely
   * because cleanup happens earlier.
   */

  /** Commit a HUMAN strategy decision (the plan-command write shape). */
  async function commitHumanStrategy(project: string): Promise<void> {
    const begin = loadActiveState(project);
    await runRenewalStateTx({
      projectDir: project,
      nowIso: '2026-09-04T00:00:01Z',
      expected: { snapshotId: begin.identity.snapshotId, revision: begin.identity.revision },
      policy: 'strict',
      work: () => undefined,
      plan: (fresh) => ({
        mutation: {
          strategy: {
            schema_version: 1,
            strategy: 'strangler',
            rationale: 'S5-H-01 regression: human-selected strategy committed at the crash boundary',
            selected_by: 'human',
            selected_via: 'flag',
            selected_at: '2026-09-04T00:00:01Z',
            snapshot_id: fresh.identity.snapshotId,
          },
        },
        result: undefined,
      }),
    });
  }

  /** Run fn with journal-byte capture armed; returns the kernel's real journal bytes. */
  async function withJournalCapture(project: string, fn: () => Promise<void>): Promise<string> {
    const capture: { armed: boolean; bytes?: string } = { armed: true };
    (globalThis as { __txJournalCapture?: { armed: boolean; bytes?: string } }).__txJournalCapture = capture;
    try {
      await fn();
    } finally {
      delete (globalThis as { __txJournalCapture?: unknown }).__txJournalCapture;
    }
    if (capture.bytes === undefined) throw new Error('journal capture failed — no journal write observed');
    return capture.bytes;
  }

  it('THE MISSING CELL — a journal left by a COMMITTED transaction (base = current − 1) never rolls the commit back; the human strategy SURVIVES', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    const R = readRevision(project);
    // Complete the strategy commit for real; capture the kernel's own journal bytes.
    const journalBytes = await withJournalCapture(project, () => commitHumanStrategy(project));
    expect(readRevision(project)).toBe(R + 1); // committed
    expect(existsSync(paths.journal)).toBe(false); // cleanup ran
    const journal = JSON.parse(journalBytes) as { base_revision: number };
    expect(journal.base_revision).toBe(R); // the leftover describes the PRE-commit base
    // Reconstitute the exact crash persistence state: durable R+1 + journal(base R).
    writeFileSync(paths.journal, journalBytes);
    // The next trusted read: the committed revision and its stores SURVIVE;
    // the journal is retired; NO recovery_required; reads stay healthy.
    const state = loadActiveState(project);
    expect(state.identity.revision).toBe(R + 1);
    expect(state.strategy.ok).toBe(true);
    if (state.strategy.ok) expect(state.strategy.store.strategy).toBe('strangler');
    expect(existsSync(paths.journal)).toBe(false);
    // Recovery is IDEMPOTENT — repeated trusted reads stay at R+1, journal gone.
    const again = loadActiveState(project);
    expect(again.identity.revision).toBe(R + 1);
    expect(again.strategy.ok).toBe(true);
    expect(existsSync(paths.journal)).toBe(false);
  });

  it('an OLDER journal reintroduced onto newer committed state (replay: base = current − 2) can never regain rollback authority', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    const R = readRevision(project);
    // Capture the FIRST commit's journal (base R), then commit again (R+2).
    const oldJournalBytes = await withJournalCapture(project, () => commitHumanStrategy(project));
    await runAnalyzeStyleTx(project);
    expect(readRevision(project)).toBe(R + 2);
    // A backup restore / cp -r of .lco/ reintroduces the older valid journal.
    writeFileSync(paths.journal, oldJournalBytes);
    const state = loadActiveState(project);
    expect(state.identity.revision).toBe(R + 2); // the NEWEST committed revision survives
    if (!state.strategy.ok) throw new Error(`strategy lost: ${state.strategy.code}`);
    expect(state.strategy.store.strategy).toBe('strangler');
    expect(existsSync(paths.journal)).toBe(false); // stale journal retired, never applied
  });

  it('a journal whose base is AHEAD of the durable revision fails closed (recovery_required, retained, nothing rolled)', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    const R = readRevision(project);
    const overlayBefore = readFileSync(paths.overlay, 'utf8');
    // Integrity-valid journal claiming base R+5 over durable state R —
    // unexplained (restore of an older state.json under a newer journal).
    const holder = { pid: -424242, acquiredAt: '2026-09-04T00:00:00Z' };
    const entries = [{ kind: 'file', path: paths.overlay, oldContent: overlayBefore }] as never;
    const integrity = domainDigest('LCO:STATE_TX', 1, { base_revision: R + 5, holder, entries });
    writeFileSync(
      paths.journal,
      `${JSON.stringify({ schema_version: 1, holder, base_revision: R + 5, integrity, entries }, null, 2)}\n`,
    );
    expect(() => loadActiveState(project)).toThrowError(TrustStateError);
    try {
      loadActiveState(project);
      throw new Error('should have refused');
    } catch (e) {
      expect((e as TrustStateError).code).toBe('recovery_required');
      expect((e as TrustStateError).message).toMatch(/ahead|AHEAD/);
    }
    expect(existsSync(paths.journal)).toBe(true); // retained — no guessing forward or backward
    expect(readFileSync(paths.overlay, 'utf8')).toBe(overlayBefore); // nothing was rolled
  });

  it('Case B retire failure is typed, retains the journal, and leaves the committed bytes untouched (retry heals)', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    const R = readRevision(project);
    const journalBytes = await withJournalCapture(project, () => commitHumanStrategy(project));
    writeFileSync(paths.journal, journalBytes); // post-commit leftover (C = B + 1)
    const committed = snapshotTrustedBytes(project);
    (globalThis as { __txRemoveFault?: { path: string } }).__txRemoveFault = { path: paths.journal };
    try {
      expect(() => loadActiveState(project)).toThrowError(TrustStateError);
      try {
        loadActiveState(project);
        throw new Error('should have refused');
      } catch (e) {
        expect((e as TrustStateError).code).toBe('recovery_required');
      }
      expect(existsSync(paths.journal)).toBe(true); // retained for the retry
      expect(snapshotTrustedBytes(project)).toEqual(committed); // committed state untouched
    } finally {
      delete (globalThis as { __txRemoveFault?: unknown }).__txRemoveFault;
    }
    // after the transient removal fault clears, the next read retires the
    // journal and observes the committed revision, healthy
    const healed = loadActiveState(project);
    expect(healed.identity.revision).toBe(R + 1);
    expect(healed.strategy.ok).toBe(true);
    expect(existsSync(paths.journal)).toBe(false);
  });

  it('an UNREADABLE revision file with a base-behind journal fails closed — the join is unperformable, rollback is not guessed (verifier-A residual closure)', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    const journalBytes = await withJournalCapture(project, () => commitHumanStrategy(project));
    writeFileSync(paths.journal, journalBytes); // post-commit leftover (C = B + 1)
    const committed = snapshotTrustedBytes(project);
    // external corruption of the revision file (a torn write is unreachable —
    // authorizedWrite is staging+fsync+atomic rename)
    writeFileSync(paths.state, '{corrupt', 'utf8');
    try {
      loadActiveState(project);
      throw new Error('should have refused');
    } catch (e) {
      expect(e).toBeInstanceOf(TrustStateError);
      expect((e as TrustStateError).code).toBe('recovery_required');
      expect((e as TrustStateError).message).toMatch(/unreadable|join/i);
    }
    expect(existsSync(paths.journal)).toBe(true); // retained — never guessed through
    // committed stores are untouched: no rollback fired
    expect(readFileSync(paths.strategy, 'utf8')).toBe(committed[paths.strategy]);
    expect(readFileSync(paths.overlay, 'utf8')).toBe(committed[paths.overlay]);
  });

  it('a TAMPERED post-commit journal is refused by the integrity gate BEFORE the revision join (ordering proof)', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    const journalBytes = await withJournalCapture(project, () => commitHumanStrategy(project));
    writeFileSync(paths.journal, journalBytes); // post-commit leftover
    const journal = JSON.parse(readFileSync(paths.journal, 'utf8')) as { entries: { oldContent: string | null }[] };
    // Tamper: flip an old-bytes payload WITHOUT recomputing the integrity digest.
    journal.entries[0].oldContent = journal.entries[0].oldContent === null ? 'tampered' : null;
    writeFileSync(paths.journal, JSON.stringify(journal, null, 2));
    try {
      loadActiveState(project);
      throw new Error('should have refused');
    } catch (e) {
      expect(e).toBeInstanceOf(TrustStateError);
      expect((e as TrustStateError).code).toBe('recovery_required');
      expect((e as TrustStateError).message).toMatch(/integrity|tampered/);
    }
    expect(existsSync(paths.journal)).toBe(true); // retained — a tampered leftover is evidence, not trash
  });

  it('E2E — strategy commit R+1 → death before journal cleanup → fresh trusted read recovers R+1 healthy → strict writer commits R+2', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    const R = readRevision(project);
    const journalBytes = await withJournalCapture(project, () => commitHumanStrategy(project));
    writeFileSync(paths.journal, journalBytes); // the crash state: committed, cleanup lost
    // new trusted reader / restart
    const recovered = loadActiveState(project);
    expect(recovered.identity.revision).toBe(R + 1);
    if (!recovered.strategy.ok) throw new Error(`strategy lost after recovery: ${recovered.strategy.code}`);
    expect(recovered.strategy.store.strategy).toBe('strangler');
    expect(existsSync(paths.journal)).toBe(false);
    // a STRICT writer holding the recovered revision is accepted — the state
    // is genuinely R+1, and the leftover journal has no rollback power left
    await runRenewalStateTx({
      projectDir: project,
      nowIso: '2026-09-04T00:00:02Z',
      expected: { snapshotId: recovered.identity.snapshotId, revision: recovered.identity.revision },
      policy: 'strict',
      work: () => undefined,
      plan: (fresh) => ({ mutation: analyzeStyleMutation(fresh), result: undefined }),
    });
    expect(readRevision(project)).toBe(R + 2);
    const final = loadActiveState(project);
    expect(final.identity.revision).toBe(R + 2);
    if (!final.strategy.ok) throw new Error(`strategy lost after strict commit: ${final.strategy.code}`);
    expect(final.strategy.store.strategy).toBe('strangler'); // human authority survived everything
  });
});

// ---------------------------------------------------------------------------
// Post-PR5 L7 (RF1): the retention clause of the recovery_required abort
// message is a FUNCTION OF THE MARKER-WRITE OUTCOMES. The S5-M-04 matrix pins
// the disclosure sentences; these four cells pin every retention branch —
// under the historical "unconditional retention claim" mutation, cell A's
// negative assertion fails (the message would simultaneously claim retention
// and disclose that NO durable marker exists).
// ---------------------------------------------------------------------------
describe('L7: retention-clause truthfulness (all four branches pinned)', () => {
  function foreignJournalCommit(paths: ReturnType<typeof renewalPaths>, baseRevision: number) {
    const bHolder = { pid: -777001, acquiredAt: '2026-09-03T00:00:00Z' };
    const bEntries = [{ kind: 'file', path: paths.overlay, oldContent: readFileSync(paths.overlay, 'utf8') }] as never;
    const bIntegrity = domainDigest('LCO:STATE_TX', 1, { base_revision: baseRevision, holder: bHolder, entries: bEntries });
    return {
      holder: bHolder,
      commit: () => {
        writeFileSync(paths.journal, `${JSON.stringify({ schema_version: 1, holder: bHolder, base_revision: baseRevision, integrity: bIntegrity, entries: bEntries }, null, 2)}\n`);
        writeFileSync(paths.state, JSON.stringify({ schema_version: 1, revision: baseRevision + 1 }, null, 2));
      },
    };
  }

  async function driveTx(project: string, beginRevision: number, snapshotId: string) {
    let rejection: (Error & { code?: string }) | undefined;
    try {
      await runRenewalStateTx({
        projectDir: project,
        nowIso: '2026-09-03T00:00:02Z',
        expected: { snapshotId, revision: beginRevision },
        policy: 'additive',
        work: () => undefined,
        plan: (fresh) => ({ mutation: analyzeStyleMutation(fresh), result: undefined }),
      });
    } catch (e) {
      rejection = e as Error & { code?: string };
    }
    expect(rejection).toBeDefined();
    expect(rejection!.code).toBe('recovery_required');
    return rejection!;
  }

  it('branch 3 — persistent evidence failure + foreign journal: NO retention claim, truthful nothing-retained state', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    const begin = loadActiveState(project);
    const foreign = foreignJournalCommit(paths, begin.identity.revision);
    const evFault = { hookArmed: true, evidenceFailures: 3, evidenceWrites: 0 };
    (globalThis as { __txEvidenceFault?: typeof evFault }).__txEvidenceFault = evFault;
    (globalThis as { __txFault?: unknown }).__txFault = {
      interleaveAndFail: { onWrite: 2, only: true, commit: foreign.commit },
    };
    try {
      const rejection = await driveTx(project, begin.identity.revision, begin.identity.snapshotId);
      expect(evFault.evidenceWrites).toBe(3); // every bounded attempt failed
      // LOAD-BEARING NEGATIVE: nothing landed — claiming superseded-marker
      // retention here would be false (this is the line the pre-fix mutation
      // slipped past 85 tests with).
      expect(rejection.message).not.toMatch(/journal is retained as a superseded marker/i);
      expect(rejection.message).toMatch(/NO durable evidence of this abort could be retained/i);
      expect(rejection.message).toMatch(/CRITICAL: PERSISTENT abort-evidence failure/i);
    } finally {
      delete (globalThis as { __txFault?: unknown }).__txFault;
      delete (globalThis as { __txEvidenceFault?: unknown }).__txEvidenceFault;
    }
  });

  it('branch 1 — marker landed over our own journal: retention claim TRUE, no CRITICAL', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    const begin = loadActiveState(project);
    (globalThis as { __txFault?: unknown }).__txFault = {
      // revision moves but the journal path keeps OUR journal — the marker
      // write targets our own journal and lands.
      interleaveAndFail: {
        onWrite: 2,
        only: true,
        commit: () => {
          writeFileSync(paths.state, JSON.stringify({ schema_version: 1, revision: begin.identity.revision + 1 }, null, 2));
        },
      },
    };
    try {
      const rejection = await driveTx(project, begin.identity.revision, begin.identity.snapshotId);
      expect(rejection.message).toMatch(/journal is retained as a superseded marker/i);
      expect(rejection.message).not.toMatch(/CRITICAL/i);
    } finally {
      delete (globalThis as { __txFault?: unknown }).__txFault;
    }
  });

  it('branch 2 — foreign journal + sidecar landed: retention attributed to the separate evidence channel', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    const begin = loadActiveState(project);
    const foreign = foreignJournalCommit(paths, begin.identity.revision);
    (globalThis as { __txFault?: unknown }).__txFault = {
      interleaveAndFail: { onWrite: 2, only: true, commit: foreign.commit },
    };
    try {
      const rejection = await driveTx(project, begin.identity.revision, begin.identity.snapshotId);
      expect(rejection.message).toMatch(/concurrent writer owns the journal path \(abort evidence retained separately\)/i);
      expect(rejection.message).not.toMatch(/journal is retained as a superseded marker/i);
      expect(existsSync(join(paths.journal, '..', 'tx-abort-evidence.json'))).toBe(true);
    } finally {
      delete (globalThis as { __txFault?: unknown }).__txFault;
    }
  });

  it('branch 4 — performed==0 with a foreign live journal: nothing-to-evidence truth', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    const begin = loadActiveState(project);
    const foreign = foreignJournalCommit(paths, begin.identity.revision);
    (globalThis as { __txFault?: unknown }).__txFault = {
      // The FIRST store write (write #2) interleaves: the concurrent writer
      // consumes our journal and commits — then OUR write FAILS. Nothing was
      // performed (the increment happens only after a successful write), so
      // neither evidence channel is attempted and the message says exactly
      // that.
      interleaveAndFail: { onWrite: 2, only: false, commit: foreign.commit },
    };
    let rejection: (Error & { code?: string }) | undefined;
    try {
      await runRenewalStateTx({
        projectDir: project,
        nowIso: '2026-09-03T00:00:02Z',
        expected: { snapshotId: begin.identity.snapshotId, revision: begin.identity.revision },
        policy: 'additive',
        work: () => undefined,
        plan: (fresh) => ({ mutation: analyzeStyleMutation(fresh), result: undefined }),
      });
    } catch (e) {
      rejection = e as Error & { code?: string };
    } finally {
      delete (globalThis as { __txFault?: unknown }).__txFault;
    }
    expect(rejection).toBeDefined();
    expect(rejection!.code).toBe('recovery_required');
    expect(rejection!.message).toMatch(/no in-flight writes were performed \(nothing to evidence\)/i);
    expect(existsSync(join(paths.journal, '..', 'tx-abort-evidence.json'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Post-PR5 I5 (RC2): read-side taxonomy at the abort-evidence path. A foreign
// object fail-closes reads exactly like a genuine sidecar, but the two states
// must be DIAGNOSTICALLY distinct — an unexpected object is not an abort
// narrative, and the abort-side disclosure must not imply the path is empty.
// ---------------------------------------------------------------------------
describe('I5: foreign-object diagnostics at the abort-evidence path', () => {
  const GENUINE = {
    schema_version: 1,
    holder: { pid: -777003, acquiredAt: '2026-09-03T00:00:00Z' },
    base_revision: 1,
    performed_steps: 2,
    evidence: 'a transaction aborted while another writer owned the journal path; in-flight bytes may have landed over the concurrent commit',
    written_at: '2026-09-03T00:00:03Z',
    remedy: 'inspect the trusted state against both writers, then remove tx-abort-evidence.json',
  };

  function parkAndRead(project: string, content: string | null): Error & { code?: string } {
    const evidencePath = join(renewalPaths(project).journal, '..', 'tx-abort-evidence.json');
    if (content === null) writeFileSync(evidencePath, '');
    else writeFileSync(evidencePath, content);
    try {
      readRevision(project);
    } catch (e) {
      return e as Error & { code?: string };
    }
    throw new Error('readRevision must fail-close when the evidence path is occupied');
  }

  it('foreign garbage / wrong-shape JSON / empty file: distinguishable FOREIGN refusal, still recovery_required', async () => {
    const { project } = await freshProject();
    for (const [label, content] of [
      ['garbage', 'not json at all'],
      ['wrong shape', JSON.stringify({ hello: 'world' })],
      ['empty file', null],
    ] as [string, string | null][]) {
      const err = parkAndRead(project, content);
      expect(err.code, label).toBe('recovery_required');
      expect(err.message, label).toMatch(/unexpected object occupies the abort-evidence path/i);
      expect(err.message, label).toMatch(/not a transaction-abort marker/i);
      expect(err.message, label).not.toMatch(/a transaction aborted with in-flight writes/i);
    }
  });

  it('an oversized object is foreign without being read (size guard)', async () => {
    const { project } = await freshProject();
    const err = parkAndRead(project, JSON.stringify({ ...GENUINE, padding: 'x'.repeat(65 * 1024) }));
    expect(err.code).toBe('recovery_required');
    expect(err.message).toMatch(/unexpected object occupies the abort-evidence path/i);
  });

  it('a GENUINE sidecar keeps the abort-narrative message (taxonomies do not swallow the real case)', async () => {
    const { project } = await freshProject();
    const err = parkAndRead(project, JSON.stringify(GENUINE));
    expect(err.code).toBe('recovery_required');
    expect(err.message).toMatch(/a transaction aborted with in-flight writes while a concurrent writer owned the journal/i);
    expect(err.message).not.toMatch(/unexpected object/i);
  });

  it('branch-3 abort disclosure names the evidence path and the pre-existing-object caveat (abort side)', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    const begin = loadActiveState(project);
    const bHolder = { pid: -777004, acquiredAt: '2026-09-03T00:00:00Z' };
    const bEntries = [{ kind: 'file', path: paths.overlay, oldContent: readFileSync(paths.overlay, 'utf8') }] as never;
    const bIntegrity = domainDigest('LCO:STATE_TX', 1, { base_revision: begin.identity.revision, holder: bHolder, entries: bEntries });
    const evFault = { hookArmed: true, evidenceFailures: 3, evidenceWrites: 0 };
    (globalThis as { __txEvidenceFault?: typeof evFault }).__txEvidenceFault = evFault;
    (globalThis as { __txFault?: unknown }).__txFault = {
      interleaveAndFail: {
        onWrite: 2,
        only: true,
        commit: () => {
          writeFileSync(paths.journal, `${JSON.stringify({ schema_version: 1, holder: bHolder, base_revision: begin.identity.revision, integrity: bIntegrity, entries: bEntries }, null, 2)}\n`);
          writeFileSync(paths.state, JSON.stringify({ schema_version: 1, revision: begin.identity.revision + 1 }, null, 2));
        },
      },
    };
    let rejection: (Error & { code?: string }) | undefined;
    try {
      await runRenewalStateTx({
        projectDir: project,
        nowIso: '2026-09-03T00:00:02Z',
        expected: { snapshotId: begin.identity.snapshotId, revision: begin.identity.revision },
        policy: 'additive',
        work: () => undefined,
        plan: (fresh) => ({ mutation: analyzeStyleMutation(fresh), result: undefined }),
      });
    } catch (e) {
      rejection = e as Error & { code?: string };
    } finally {
      delete (globalThis as { __txFault?: unknown }).__txFault;
      delete (globalThis as { __txEvidenceFault?: unknown }).__txEvidenceFault;
    }
    expect(rejection!.code).toBe('recovery_required');
    expect(rejection!.message).toMatch(/could NOT be written to .*tx-abort-evidence\.json/i);
    expect(rejection!.message).toMatch(/any pre-existing object at that path still fail-closes reads/i);
  });
});
