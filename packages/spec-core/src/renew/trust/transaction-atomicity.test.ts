import { describe, expect, it, afterEach, vi } from 'vitest';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
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
  return {
    ...actual,
    authorizedWrite: (args: Parameters<typeof actual.authorizedWrite>[0]) => {
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
