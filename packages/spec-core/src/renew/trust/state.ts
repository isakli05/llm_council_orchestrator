import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { acquireSpecRootLock, type SpecRootLock } from '../../storage/revision';
import { tryRealpath } from '../../storage/paths';
import { renewalPaths, RenewalProjectSchema, type RenewalProject } from '../core/project-record';
import { reloadSnapshot, type ProjectSnapshot } from '../core/snapshot-record';
import { parseOverlayStore, type OverlayStore } from '../core/store-records';
import { parseParityStore, type ParityStore } from '../core/store-records';
import { parseStrategyDecision, type StrategyDecision } from './authority';
import { AnalysisRecordSchema, type AnalysisRecord } from '../recovery/schemas';
import { authorizedRead, authorizedWrite, authorizeProjectDestination, authorizedRenameNoClobber, authorizedEnsureDir, authorizedRemoveTree, authorizedCreateDirAtomically } from './fs';
import { TrustStateError } from './errors';
import { domainDigest } from './canonical';

/**
 * Trust Kernel — RenewalStateTransaction (third-audit S3-H-03, S3-H-04,
 * S3-H-09, S3-M-03, S3-M-04; reopening C-05/C-06).
 *
 * All trusted active Renewal state behaves as ONE explicitly versioned
 * state machine. Before this module: `state.json` was bumped at three sites
 * but read by ZERO production consumers; init/refresh/plan-strategy wrote
 * without any lock; plan loaded state once and wrote a spec minutes later
 * with no re-read under a DIFFERENT lock; refresh superseded only
 * overlay/parity/strategy, leaving a stale `spec/` that status rendered as
 * current and that blocked replanning; status/export treated cross-snapshot
 * or corrupt stores as zeros.
 *
 * The protocol (one writer lock, read-view, revalidate, fold-or-refuse):
 *
 *   begin    loadActiveState() — state.json FIRST (a corrupt revision file
 *            fails closed BEFORE any other trusted file informs a write),
 *            project↔snapshot identity joined BOTH ways (target realpath
 *            AND project.snapshot_id === snapshot.snapshot_id), every store
 *            snapshot-joined and typed (never zeros)
 *   work     long/paid/interactive work, unlocked
 *   commit   acquire the renewal writer lock (ONE lock for ALL trusted
 *            mutations — analyze folds, review folds, refresh, plan,
 *            spec/strategy writes) → re-load active state under the lock →
 *            validate identity vs the read view → fold or typed conflict →
 *            write via FilesystemCapability → bump revision once
 *
 * Merge policies are EXPLICIT per mutation class, never last-write-wins:
 *   additive — analyze/review folds: re-fold deterministically onto the
 *              FRESH state (snapshot must still match); a newer human
 *              ruling made mid-call is never lost (the fold only touches
 *              still-unresolved or same-approval entries)
 *   strict   — plan/refresh: the read view's revision must still hold at
 *              commit; ANY intervening trusted mutation is a typed
 *              stale_revision/snapshot_superseded conflict (re-run)
 * Refresh additionally archives ALL per-snapshot stores — including `spec/`
 * (S3-H-04) — with no-clobber renames (S3-M-05), so an in-flight
 * incompatible transaction fails its revalidation instead of committing
 * under a new epoch.
 */

// --- trusted active-state view ----------------------------------------------------------

/** Canonical active-state identity: project AND snapshot AND revision. */
export interface RenewalStateIdentity {
  projectDir: string;
  projectReal: string;
  projectName: string;
  snapshotId: string;
  revision: number;
}

/** One store's typed state: loaded, or WHY it is not loadable (never zeros). */
export type TrustedStoreResult<T> =
  | { ok: true; store: T }
  | {
      ok: false;
      /** Which store this is (overlay/parity/strategy) — for truthful rendering. */
      kind: string;
      code: 'store_missing' | 'store_corrupt' | 'store_cross_snapshot';
      message: string;
    };

export interface ActiveRenewalState {
  identity: RenewalStateIdentity;
  project: RenewalProject;
  snapshot: ProjectSnapshot;
  /** Immutable history, split by epoch: active snapshot vs prior snapshots. */
  analyses: { active: AnalysisRecord[]; historical: AnalysisRecord[]; corrupt: string[] };
  overlay: TrustedStoreResult<OverlayStore>;
  parity: TrustedStoreResult<ParityStore>;
  strategy: TrustedStoreResult<StrategyDecision>;
  specExists: boolean;
}

/** Read + parse state.json — the FIRST trusted read (corrupt fails closed).
 *  Exported for the domain wrapper (project.readStateRevision).
 *  S4-H-01: a leftover transaction journal is detected HERE (the first
 *  trusted read) and deterministically recovered — see recoverTxJournal. */
export function readRevision(projectDir: string): number {
  const paths = renewalPaths(projectDir);
  if (existsSync(paths.journal)) {
    recoverTxJournal(projectDir, paths);
  }
  const path = paths.state;
  if (!existsSync(path)) return 0;
  let text: string;
  try {
    text = authorizedRead({ projectDir, path });
  } catch {
    throw new TrustStateError(
      'state_corrupt',
      `renewal state revision file unreadable (${path}) — inspect it after review; refusing to guess`,
    );
  }
  try {
    const parsed = JSON.parse(text) as { schema_version?: unknown; revision?: unknown };
    if (parsed.schema_version === 1 && typeof parsed.revision === 'number' && Number.isInteger(parsed.revision) && parsed.revision >= 0) {
      return parsed.revision;
    }
  } catch {
    /* fall through to typed failure */
  }
  throw new TrustStateError(
    'state_corrupt',
    `renewal state revision file corrupt (${path}) — inspect or remove it after review; refusing to guess`,
  );
}

/**
 * THE active-state view. Trusted files are read ONLY here (authorized,
 * chain-validated) and every store is snapshot-joined: cross-snapshot and
 * corrupt stores are TYPED states, never silent zeros (S3-H-09). Throws
 * TrustStateError for identity-level failures (missing/corrupt project or
 * snapshot, identity-join mismatch); store-level failures are typed values.
 */
export function loadActiveState(projectDir: string): ActiveRenewalState {
  const paths = renewalPaths(projectDir);
  const revision = readRevision(projectDir); // FIRST — see module doc

  if (!existsSync(paths.projectJson)) {
    throw new TrustStateError(
      'project_missing',
      `not a renewal project: ${paths.projectJson} not found — run 'lco renew init <dir> --target <repo>' first`,
    );
  }
  let project: RenewalProject;
  try {
    project = RenewalProjectSchema.parse(JSON.parse(authorizedRead({ projectDir, path: paths.projectJson })));
  } catch (e) {
    throw new TrustStateError('project_corrupt', `project.json invalid: ${(e as Error).message}`);
  }

  let snapshot: ProjectSnapshot;
  if (!existsSync(paths.snapshot)) {
    throw new TrustStateError('snapshot_missing', `snapshot missing (${paths.snapshot}) — run lco renew refresh`);
  }
  const snapReload = reloadSnapshot(authorizedRead({ projectDir, path: paths.snapshot }));
  if (!snapReload.ok) throw new TrustStateError('snapshot_corrupt', snapReload.message);
  snapshot = snapReload.snapshot;

  // Identity joins — BOTH directions (S3-M-04 + the original clone-pointer
  // invariant): the project's target pointer must resolve to the snapshot's
  // target root, AND the project's recorded snapshot id must BE the loaded
  // snapshot's id.
  const targetReal = tryRealpath(project.target_path);
  if (targetReal === undefined) {
    throw new TrustStateError(
      'target_missing',
      `renewal target missing: project.json points at ${project.target_path}, which does not exist — ` +
        `run 'lco renew refresh' against a present target`,
    );
  }
  if (targetReal !== snapshot.target.root_realpath) {
    throw new TrustStateError(
      'target_join_mismatch',
      `renewal target identity mismatch: the project points at ${targetReal} but the active snapshot ` +
        `${snapshot.snapshot_id} was taken of ${snapshot.target.root_realpath} — run 'lco renew refresh' to rebind explicitly`,
    );
  }
  if (project.snapshot_id !== snapshot.snapshot_id) {
    throw new TrustStateError(
      'snapshot_join_mismatch',
      `renewal state mismatch: project.json records snapshot ${project.snapshot_id} but snapshot.json is ` +
        `${snapshot.snapshot_id} — one of the two is stale; run 'lco renew refresh' to rebuild consistent state`,
    );
  }

  // Analyses: immutable history, epoch-split.
  const analyses = { active: [] as AnalysisRecord[], historical: [] as AnalysisRecord[], corrupt: [] as string[] };
  if (existsSync(paths.analyses)) {
    for (const file of readdirSync(paths.analyses).filter((f) => f.endsWith('.json')).sort()) {
      try {
        const parsed = AnalysisRecordSchema.safeParse(
          JSON.parse(authorizedRead({ projectDir, path: join(paths.analyses, file) })),
        );
        if (!parsed.success) {
          analyses.corrupt.push(file);
          continue;
        }
        if (parsed.data.snapshot_id === snapshot.snapshot_id) analyses.active.push(parsed.data);
        else analyses.historical.push(parsed.data);
      } catch {
        analyses.corrupt.push(file);
      }
    }
    analyses.active.sort((a, b) => (a.analysis_id < b.analysis_id ? -1 : 1));
    analyses.historical.sort((a, b) => (a.analysis_id < b.analysis_id ? -1 : 1));
  }

  return {
    identity: {
      projectDir,
      projectReal: tryRealpath(projectDir) ?? projectDir,
      projectName: project.name,
      snapshotId: snapshot.snapshot_id,
      revision,
    },
    project,
    snapshot,
    analyses,
    overlay: loadJoinedStore(projectDir, paths.overlay, 'overlay', parseOverlayStore, snapshot.snapshot_id),
    parity: loadJoinedStore(projectDir, paths.parity, 'parity', parseParityStore, snapshot.snapshot_id),
    strategy: loadJoinedStore(
      projectDir,
      paths.strategy,
      'strategy',
      (text) => {
        const r = parseStrategyDecision(text);
        return r.ok ? { ok: true as const, store: r.decision } : r;
      },
      snapshot.snapshot_id,
      (s) => s.snapshot_id,
    ),
    specExists: existsSync(paths.specDir),
  };
}

function loadJoinedStore<T extends { snapshot_id: string } | StrategyDecision>(
  projectDir: string,
  path: string,
  kind: 'overlay' | 'parity' | 'strategy',
  parse: (text: string) => { ok: true; store: T } | { ok: false; code: string; message: string },
  activeSnapshotId: string,
  snapshotOf?: (store: T) => string,
): TrustedStoreResult<T> {
  if (!existsSync(path)) {
    return { ok: false, kind, code: 'store_missing', message: `no ${kind} store at ${path}` };
  }
  let text: string;
  try {
    text = authorizedRead({ projectDir, path });
  } catch (e) {
    return { ok: false, kind, code: 'store_corrupt', message: `${kind}.json unreadable (${(e as Error).message})` };
  }
  const parsed = parse(text);
  if (!parsed.ok) return { ok: false, kind, code: 'store_corrupt', message: parsed.message };
  const storeSnapshot = snapshotOf ? snapshotOf(parsed.store) : (parsed.store as { snapshot_id: string }).snapshot_id;
  if (storeSnapshot !== activeSnapshotId) {
    return {
      ok: false,
      kind,
      code: 'store_cross_snapshot',
      message:
        `${kind}.json belongs to snapshot ${storeSnapshot} but the active snapshot is ${activeSnapshotId} — ` +
        `the store is history, not current state (run 'lco renew refresh' to rebind, or review the archive)`,
    };
  }
  return { ok: true, store: parsed.store };
}

// --- trusted persistence ----------------------------------------------------------------

/** Trusted JSON state-file persist (authorized atomic write; 2-space + NL). */
export function persistTrustedJson(args: {
  projectDir: string;
  path: string;
  value: unknown;
  mode?: number;
}): void {
  authorizedWrite({
    projectDir: args.projectDir,
    path: args.path,
    content: `${JSON.stringify(args.value, null, 2)}\n`,
    mode: args.mode ?? 0o600,
  });
}

/** Monotonic revision bump (authorized write; caller holds the writer lock). */
export function bumpStateRevisionTrusted(projectDir: string): number {
  const path = renewalPaths(projectDir).state;
  const next = readRevision(projectDir) + 1;
  persistTrustedJson({ projectDir, path, value: { schema_version: 1, revision: next } });
  return next;
}

// --- the ONE writer lock ------------------------------------------------------------------

export function renewalWriterLockDir(projectDir: string): string {
  return join(projectDir, '.lco', 'renewal');
}

/**
 * Hold the renewal writer lock across `fn` (every trusted mutation).
 *
 * Verifier VB-1 (HIGH, reproduced): the lockfile's `acquiredAt` stamp MUST be
 * a clock reading taken AT ACQUISITION. Callers pass a transaction `nowIso`
 * captured BEFORE the unlocked work phase (the MCP boundary freezes one
 * reading per tool call; the paid phase runs up to 15 minutes) — stamping
 * with that pre-work reading makes every long transaction's lock BORN STALE
 * (age > 10s the instant it is acquired), so a concurrent writer breaks it
 * mid-commit and silently drops the first writer's fold. The injected
 * `nowIso` therefore governs caller-side semantics only; liveness is decided
 * by the real clock, evaluated at acquisition. Verifier VB-6: the lock path
 * is authorized through the kernel before the lockfile write.
 */
export async function withRenewalWriterLock<T>(projectDir: string, nowIso: string, fn: (lock: SpecRootLock) => Promise<T> | T): Promise<T> {
  void nowIso; // pre-work clock — deliberately NOT used for lock liveness
  const lockDir = renewalWriterLockDir(projectDir);
  authorizeProjectDestination(projectDir, join(lockDir, '.lco-revision.lock'));
  const lock = acquireSpecRootLock(lockDir, new Date().toISOString());
  try {
    return await fn(lock);
  } finally {
    lock.release();
  }
}

// --- the typed write set + journaled atomic commit (S4-H-01) ---------------------------

/** One planned trusted-state change, expressed as DATA. The kernel — never a
 *  consumer callback — performs every write, journals the previous state, and
 *  advances the revision: an arbitrary write-performing `commit` callback is
 *  unrepresentable (the Fourth Audit proved such callbacks can leave store A
 *  changed at the old revision when store B's write fails). */
export interface StateMutationPlan {
  /** Full-store replacements (kernel writes via persistTrustedJson semantics). */
  overlay?: OverlayStore;
  parity?: ParityStore;
  strategy?: StrategyDecision;
  /** Refresh/init rebind. */
  project?: RenewalProject;
  snapshot?: ProjectSnapshot;
  /** Plan-time spec directory (atomic create; must not already exist). */
  specDir?: { files: { name: string; content: unknown }[] };
  /** No-clobber renames (refresh supersession archives). */
  archive?: { from: string; to: string }[];
  /** Directories to ensure exist (init only). */
  ensureDirs?: string[];
}

/** One journaled undo step. `oldContent: null` means the path was ABSENT. */
type TxJournalEntry =
  | { kind: 'file'; path: string; oldContent: string | null }
  | { kind: 'rename'; from: string; to: string; fromContent: string | null; fromIsDir: boolean }
  | { kind: 'dir_create'; path: string; existed: boolean }
  | { kind: 'dir_ensure'; path: string; existed: boolean };

interface TxJournalFile {
  schema_version: 1;
  holder: { pid: number; acquiredAt: string };
  base_revision: number;
  /** domainDigest('LCO:STATE_TX', 1, { base_revision, entries }) — a tampered
   *  journal is REFUSED (never interpreted), because its old-bytes are the
   *  recovery authority. */
  integrity: `sha256:${string}`;
  entries: TxJournalEntry[];
}

/** The in-flight journal of THIS process (skip-recovery marker: the committer
 *  itself calls readRevision via the revision bump while its journal lives). */
let activeJournalDir: string | null = null;

function txJournalIntegrity(j: Omit<TxJournalFile, 'integrity'>): `sha256:${string}` {
  // V1-verifier note: holder identity is covered too — a journal is bound to
  // its committer, not just its entries.
  return domainDigest('LCO:STATE_TX', 1, { base_revision: j.base_revision, holder: j.holder, entries: j.entries });
}

/** Build the journal for a plan by SIMULATING the canonical write order —
 *  each entry captures the old state of its target GIVEN the effects of the
 *  steps before it (a refresh archives overlay.json before writing the new
 *  empty store, so the file entry for overlay records `null`, not the old
 *  store bytes — the rename entry already owns those). */
function planJournalEntries(projectDir: string, paths: ReturnType<typeof renewalPaths>, mutation: StateMutationPlan): TxJournalEntry[] {
  const entries: TxJournalEntry[] = [];
  // V1-verifier V2 root cause: every entry records the ORIGINAL (pre-commit)
  // state of its target, read from disk BEFORE any write. A file that an
  // earlier archive step will rename away still records its ORIGINAL BYTES —
  // never a null "will be absent" placeholder — so rollback is correct
  // whether or not the rename actually ran (the old pairing was implicit and
  // a never-run rename made the null-restore DELETE a live store).
  const readOld = (p: string): string | null => {
    if (!existsSync(p)) return null;
    return authorizedRead({ projectDir, path: p });
  };
  const pushFile = (p: string): void => {
    entries.push({ kind: 'file', path: p, oldContent: readOld(p) });
  };

  for (const dir of mutation.ensureDirs ?? []) {
    entries.push({ kind: 'dir_ensure', path: dir, existed: existsSync(dir) });
  }
  for (const r of mutation.archive ?? []) {
    if (!existsSync(r.from)) {
      // Nothing to archive — the supersession set only includes what exists.
      continue;
    }
    let fromContent: string | null = null;
    let fromIsDir = false;
    try {
      fromContent = authorizedRead({ projectDir, path: r.from });
    } catch {
      // a directory (the spec/ archive) — content disambiguation is by
      // absence instead: a RUN rename leaves `from` absent
      fromIsDir = true;
    }
    entries.push({ kind: 'rename', from: r.from, to: r.to, fromContent, fromIsDir });
  }
  if (mutation.snapshot !== undefined) pushFile(paths.snapshot);
  if (mutation.project !== undefined) pushFile(paths.projectJson);
  if (mutation.overlay !== undefined) pushFile(paths.overlay);
  if (mutation.parity !== undefined) pushFile(paths.parity);
  if (mutation.strategy !== undefined) pushFile(paths.strategy);
  // V1-verifier V1: dir_create records whether the directory already existed
  // — a failed create over an EXISTING directory must not roll back to
  // deleting it.
  if (mutation.specDir !== undefined) entries.push({ kind: 'dir_create', path: paths.specDir, existed: existsSync(paths.specDir) });
  pushFile(paths.state); // the revision bump is the FINAL journaled write
  return entries;
}

/** Perform the journaled mutation: journal → writes in canonical order →
 *  revision → journal removal. Any failure rolls back in-process; a rollback
 *  failure leaves the journal for deterministic crash recovery. The caller
 *  holds the renewal writer lock. */
/** The identity of the writer lock this commit holds (V6 fence). */
function applyStateMutation(projectDir: string, mutation: StateMutationPlan, lockIdentity: { pid: number; acquiredAt: string }): void {
  const paths = renewalPaths(projectDir);
  const entries = planJournalEntries(projectDir, paths, mutation);
  const holder = lockIdentity; // the REAL lock identity — the fence compares against it
  const journal: TxJournalFile = {
    schema_version: 1,
    holder,
    base_revision: readRevisionUnlocked(projectDir),
    integrity: '' as `sha256:${string}`,
    entries,
  };
  journal.integrity = txJournalIntegrity(journal);
  // V1-verifier V4: the in-flight marker is set only AFTER the journal lands
  // (a failed journal write leaves no journal, so nothing to skip) — and the
  // failure itself is typed (nothing was written).
  try {
    persistTrustedJson({ projectDir, path: paths.journal, value: journal });
  } catch (e) {
    throw new TrustStateError(
      'commit_failed_without_state_change',
      `the transaction journal could not be written (${(e as Error).message}) — no state was changed`,
    );
  }
  activeJournalDir = projectDir;
  let performed = 0; // count of completed forward steps (V1-verifier V2/V3)
  try {
    // Canonical order (matches planJournalEntries' construction exactly).
    for (const dir of mutation.ensureDirs ?? []) authorizedEnsureDir({ projectDir, path: dir });
    performed += (mutation.ensureDirs ?? []).length;
    for (const r of mutation.archive ?? []) {
      if (entries.some((e) => e.kind === 'rename' && e.from === r.from && e.to === r.to)) {
        authorizedRenameNoClobber({ projectDir, from: r.from, to: r.to });
        performed += 1;
      }
    }
    if (mutation.snapshot !== undefined) { persistTrustedJson({ projectDir, path: paths.snapshot, value: mutation.snapshot }); performed += 1; }
    if (mutation.project !== undefined) { persistTrustedJson({ projectDir, path: paths.projectJson, value: mutation.project }); performed += 1; }
    if (mutation.overlay !== undefined) { persistTrustedJson({ projectDir, path: paths.overlay, value: mutation.overlay }); performed += 1; }
    if (mutation.parity !== undefined) { persistTrustedJson({ projectDir, path: paths.parity, value: mutation.parity }); performed += 1; }
    if (mutation.strategy !== undefined) { persistTrustedJson({ projectDir, path: paths.strategy, value: mutation.strategy }); performed += 1; }
    if (mutation.specDir !== undefined) {
      authorizedCreateDirAtomically({ projectDir, targetDir: paths.specDir, files: mutation.specDir.files as never });
      performed += 1;
    }
    // V1-verifier V6 (fencing): before the revision write, prove the writer
    // lock is STILL OURS and the base revision has not moved. If another
    // writer broke our (aged) lock and committed, our commit aborts — the
    // journal stays and the next trusted read recovers complete state rather
    // than letting two commits land at the same revision number.
    fenceWriterLock(projectDir, holder, journal.base_revision);
    // The revision bump — LAST, and itself journaled: a crash anywhere before
    // this point recovers to complete revision R; after it, the journal is
    // removed and revision R+1 with its full write set stands.
    const next = journal.base_revision + 1;
    persistTrustedJson({ projectDir, path: paths.state, value: { schema_version: 1, revision: next } });
    performed += 1;
    removeJournal(projectDir, paths);
  } catch (err) {
    const cause = err as Error;
    try {
      rollbackPerformedPrefix(projectDir, journal, performed);
      removeJournal(projectDir, paths);
      throw new TrustStateError(
        'commit_failed_without_state_change',
        `trusted-state commit failed and was ROLLED BACK to the previous complete revision (${cause.message}) — ` +
          `no partial state was left behind; re-run the operation`,
      );
    } catch (rb) {
      if (rb instanceof TrustStateError && rb.code === 'commit_failed_without_state_change') throw rb;
      // The commit is over and the journal is now a DEAD ARTIFACT of this
      // process — clear the in-flight marker so even a long-lived process
      // (the MCP server) recovers deterministically on its next trusted read.
      if (activeJournalDir === projectDir) activeJournalDir = null;
      throw new TrustStateError(
        'recovery_required',
        `trusted-state commit failed (${cause.message}) AND rollback failed (${(rb as Error).message}) — ` +
          `the transaction journal is retained; the next trusted read recovers the previous complete revision ` +
          `deterministically. Re-run the operation after recovery.`,
      );
    }
  }
}

/** The V6 fence: the lockfile must still name THIS holder and the on-disk
 *  revision must still be our base. A stale-break by another writer (or any
 *  intervening commit) aborts THIS commit — typed, journal retained. */
function fenceWriterLock(projectDir: string, holder: { pid: number; acquiredAt: string }, baseRevision: number): void {
  const lockPath = join(renewalWriterLockDir(projectDir), '.lco-revision.lock');
  let text: string | undefined;
  try {
    text = authorizedRead({ projectDir, path: lockPath });
  } catch {
    text = undefined;
  }
  let stillOurs = false;
  if (text !== undefined) {
    try {
      const parsed = JSON.parse(text) as { pid?: unknown; acquiredAt?: unknown };
      stillOurs = parsed.pid === holder.pid && parsed.acquiredAt === holder.acquiredAt;
    } catch {
      stillOurs = false;
    }
  }
  if (!stillOurs) {
    throw new TrustStateError(
      'recovery_required',
      'the renewal writer lock changed hands mid-commit (the stale window elapsed and another writer broke it) — ' +
        'this commit is aborted and the journal is retained; the next trusted read recovers deterministically',
    );
  }
  if (readRevisionUnlocked(projectDir) !== baseRevision) {
    throw new TrustStateError(
      'recovery_required',
      'the trusted revision moved mid-commit (another writer committed after breaking our lock) — ' +
        'this commit is aborted and the journal is retained; the next trusted read recovers deterministically',
    );
  }
}

function removeJournal(projectDir: string, paths: ReturnType<typeof renewalPaths>): void {
  try {
    if (existsSync(paths.journal)) authorizedRemoveTree({ projectDir, path: paths.journal });
  } finally {
    if (activeJournalDir === projectDir) activeJournalDir = null;
  }
}

/**
 * Reverse-apply journal entries for CRASH RECOVERY (the performer is gone —
 * how far it got is unknown). Tolerant and NEVER destructive on ambiguous
 * states:
 *   file(old)   → rewrite old bytes (null ⇒ remove — the file can only be
 *                 the committer's creation)
 *   rename      → to&&!from: rename back (the forward rename ran)
 *                 to&&from:  NO-OP — `from` already carries restored bytes
 *                            (either untouched or restored by a paired file
 *                            entry); `to` is either our own now-redundant
 *                            archive copy or PRIOR HISTORY the no-clobber
 *                            collision refused to touch. Removing it could
 *                            destroy prior history when contents coincide, so
 *                            recovery leaves both (a redundant same-bytes
 *                            `.superseded` file is cosmetic; active-path
 *                            bytes are always complete-R).
 *                 !to:       the rename never ran — no-op
 *   dir_create  → remove ONLY if the directory did not exist before us
 *   dir_ensure  → remove ONLY if we created it
 */
function rollbackJournal(projectDir: string, _paths: ReturnType<typeof renewalPaths>, journal: TxJournalFile): void {
  for (const entry of [...journal.entries].reverse()) {
    if (entry.kind === 'file') {
      if (entry.oldContent === null) {
        if (existsSync(entry.path)) authorizedRemoveTree({ projectDir, path: entry.path });
      } else {
        authorizedWrite({ projectDir, path: entry.path, content: entry.oldContent, mode: 0o600 });
      }
    } else if (entry.kind === 'rename') {
      if (existsSync(entry.to) && !existsSync(entry.from)) {
        authorizedRenameNoClobber({ projectDir, from: entry.to, to: entry.from });
      }
    } else if (entry.kind === 'dir_create') {
      if (!entry.existed && existsSync(entry.path)) {
        authorizedRemoveTree({ projectDir, path: entry.path });
      }
    } else {
      if (!entry.existed && existsSync(entry.path)) authorizedRemoveTree({ projectDir, path: entry.path });
    }
  }
}

/**
 * In-process rollback after a caught commit failure: the performer KNOWS how
 * far it got, so only the PERFORMED PREFIX is undone, with strict semantics
 * (no ambiguity): a rename in the performed prefix is OURS (from exists ⇒ a
 * later file-restore recreated it — remove our `to`; absent ⇒ move it back).
 */
function rollbackPerformedPrefix(projectDir: string, journal: TxJournalFile, performed: number): void {
  const performedEntries = journal.entries.slice(0, performed);
  for (const entry of [...performedEntries].reverse()) {
    if (entry.kind === 'file') {
      if (entry.oldContent === null) {
        if (existsSync(entry.path)) authorizedRemoveTree({ projectDir, path: entry.path });
      } else {
        authorizedWrite({ projectDir, path: entry.path, content: entry.oldContent, mode: 0o600 });
      }
    } else if (entry.kind === 'rename') {
      // OUR rename definitely ran: `to` is our copy.
      if (existsSync(entry.to)) {
        if (existsSync(entry.from)) {
          authorizedRemoveTree({ projectDir, path: entry.to });
        } else {
          authorizedRenameNoClobber({ projectDir, from: entry.to, to: entry.from });
        }
      }
    } else if (entry.kind === 'dir_create') {
      if (!entry.existed && existsSync(entry.path)) authorizedRemoveTree({ projectDir, path: entry.path });
    } else {
      if (!entry.existed && existsSync(entry.path)) authorizedRemoveTree({ projectDir, path: entry.path });
    }
  }
}

/** readRevision that never triggers recovery (used inside the committer). */
function readRevisionUnlocked(projectDir: string): number {
  const path = renewalPaths(projectDir).state;
  if (!existsSync(path)) return 0;
  let text: string;
  try {
    text = authorizedRead({ projectDir, path });
  } catch {
    throw new TrustStateError(
      'state_corrupt',
      `renewal state revision file unreadable (${path}) — inspect it after review; refusing to guess`,
    );
  }
  try {
    const parsed = JSON.parse(text) as { schema_version?: unknown; revision?: unknown };
    if (parsed.schema_version === 1 && typeof parsed.revision === 'number' && Number.isInteger(parsed.revision) && parsed.revision >= 0) {
      return parsed.revision;
    }
  } catch {
    /* fall through to typed failure */
  }
  throw new TrustStateError(
    'state_corrupt',
    `renewal state revision file corrupt (${path}) — inspect or remove it after review; refusing to guess`,
  );
}

/**
 * Deterministic crash recovery (S4-H-01): a journal on disk means a committer
 * died mid-commit — the trusted state is NOT interpreted as healthy. Under
 * the writer lock (so recovery cannot interleave with a new committer), the
 * journal is integrity-verified and reverse-applied, restoring the COMPLETE
 * previous revision R; the journal is then removed. A journal belonging to a
 * live committer (another writer holds the lock) is a typed refusal — retry.
 * A tampered journal is refused, never interpreted. The caller does NOT hold
 * the lock (this runs from the first trusted read).
 */
function recoverTxJournal(projectDir: string, paths: ReturnType<typeof renewalPaths>): void {
  if (activeJournalDir === projectDir) return; // our own commit is in flight
  const lockDir = renewalWriterLockDir(projectDir);
  authorizeProjectDestination(projectDir, join(lockDir, '.lco-revision.lock'));
  let lock: SpecRootLock;
  try {
    lock = acquireSpecRootLock(lockDir, new Date().toISOString());
  } catch (e) {
    throw new TrustStateError(
      'recovery_required',
      `an unfinished trusted-state transaction journal exists (${paths.journal}) and the writer lock is held ` +
        `(${(e as Error).message}) — another writer may be committing, or a recent one died inside the stale window. ` +
        `Retry shortly; recovery is deterministic once the lock frees.`,
    );
  }
  try {
    if (!existsSync(paths.journal)) return; // recovered by a concurrent reader
    let journal: TxJournalFile;
    try {
      journal = JSON.parse(authorizedRead({ projectDir, path: paths.journal })) as TxJournalFile;
    } catch (e) {
      throw new TrustStateError(
        'recovery_required',
        `the trusted-state transaction journal is unreadable (${(e as Error).message}) — inspect ` +
          `${paths.journal} manually; recovery refuses to guess`,
      );
    }
    if (
      journal.schema_version !== 1 ||
      !Array.isArray(journal.entries) ||
      typeof journal.base_revision !== 'number' ||
      txJournalIntegrity(journal) !== journal.integrity
    ) {
      throw new TrustStateError(
        'recovery_required',
        `the trusted-state transaction journal failed integrity verification (${paths.journal}) — it is tampered ` +
          `or of an unknown format; recovery refuses to interpret it. Inspect it after review.`,
      );
    }
    try {
      rollbackJournal(projectDir, paths, journal);
    } catch (e) {
      throw new TrustStateError(
        'recovery_required',
        `journal rollback could not complete (${(e as Error).message}) — the journal is retained; ` +
          `inspect it after review and recover manually`,
      );
    }
    authorizedRemoveTree({ projectDir, path: paths.journal });
  } finally {
    lock.release();
  }
}

// --- the transaction ----------------------------------------------------------------------

export interface TxExpectation {
  snapshotId: string;
  revision: number;
}

export type TxFoldPolicy = 'additive' | 'strict';

/**
 * The read-modify-write protocol for trusted renewal state. See the module
 * doc for the begin→work→commit flow and the two merge policies. `plan`
 * computes the NEXT store values as DATA; the kernel performs every write
 * inside a journaled all-or-nothing commit (S4-H-01) and bumps the revision
 * itself. Nothing in this protocol can silently lose a newer valid update:
 * additive folds run against the FRESH state, strict commits refuse on ANY
 * drift, a snapshot change always refuses, and a failed commit leaves the
 * COMPLETE previous revision (rolled back in-process, or recovered from the
 * journal on the next trusted read).
 */
export async function runRenewalStateTx<W, R>(args: {
  projectDir: string;
  nowIso: string;
  /** The read view this transaction started from (required for both policies). */
  expected: TxExpectation;
  policy: TxFoldPolicy;
  work: (state: ActiveRenewalState) => Promise<W> | W;
  plan: (fresh: ActiveRenewalState, workResult: W) => { mutation: StateMutationPlan; result: R };
}): Promise<R> {
  const begin = loadActiveState(args.projectDir);
  if (args.expected === undefined) {
    // Verifier VB-5: BOTH policies require their read-view expectation —
    // additive-without-expected silently skipped snapshot-supersession
    // validation (a documented property, never an option).
    throw new TrustStateError('fold_conflict', `a ${args.policy} transaction requires its read-view expectation`);
  }
  const workResult = await args.work(begin);

  return withRenewalWriterLock(args.projectDir, args.nowIso, async (lock) => {
    const fresh = loadActiveState(args.projectDir);
    if (fresh.identity.projectName !== begin.identity.projectName || fresh.identity.projectReal !== begin.identity.projectReal) {
      throw new TrustStateError(
        'project_mismatch',
        `the renewal project changed mid-operation (${begin.identity.projectName} → ${fresh.identity.projectName}) — refusing to commit`,
      );
    }
    if (fresh.identity.snapshotId !== args.expected.snapshotId) {
      throw new TrustStateError(
        'snapshot_superseded',
        `the active snapshot changed mid-operation (${args.expected.snapshotId} → ${fresh.identity.snapshotId}; ` +
          `a refresh superseded this work) — re-run the operation against the new snapshot`,
      );
    }
    if (fresh.identity.snapshotId !== begin.identity.snapshotId) {
      throw new TrustStateError(
        'snapshot_superseded',
        `the active snapshot changed mid-operation (${begin.identity.snapshotId} → ${fresh.identity.snapshotId}) — re-run the operation`,
      );
    }
    if (args.policy === 'strict' && fresh.identity.revision !== args.expected.revision) {
      throw new TrustStateError(
        'stale_revision',
        `trusted state changed mid-operation (revision ${args.expected.revision} → ${fresh.identity.revision}) — ` +
          `this operation must re-run from current state rather than commit a stale result`,
      );
    }
    const planned = await args.plan(fresh, workResult);
    applyStateMutation(args.projectDir, planned.mutation, lock.identity);
    return planned.result;
  });
}

/**
 * Journaled strict mutation for init/refresh (S4-H-01): the epoch-rebind
 * write set (snapshot + project + optional first-init stores + supersession
 * archives) commits with the SAME all-or-nothing guarantee as the command
 * transactions. `expected` (when present) is the pre-build epoch that must
 * still hold; force-recovery over torn state passes none (rebuild semantics).
 */
/**
 * The refresh supersession set (S3-H-04, S3-M-05): no-clobber archive renames
 * for every EXISTING per-snapshot store — overlay, parity, strategy, AND the
 * spec directory — under the old snapshot id. Analyses/approvals are retained
 * as immutable history. Consumed as `archive` entries of a journaled mutation
 * (the kernel performs and journals each rename).
 */
export function refreshArchiveEntries(
  paths: ReturnType<typeof renewalPaths>,
  oldSnapshotId: string,
): { from: string; to: string }[] {
  const entries: { from: string; to: string }[] = [];
  for (const p of [paths.overlay, paths.parity, paths.strategy, paths.specDir]) {
    if (!existsSync(p)) continue;
    entries.push({ from: p, to: `${p}.${oldSnapshotId}.superseded` });
  }
  return entries;
}

export async function runJournaledRenewalMutation(args: {
  projectDir: string;
  nowIso: string;
  expected?: TxExpectation;
  mutation: StateMutationPlan;
}): Promise<void> {
  return withRenewalWriterLock(args.projectDir, args.nowIso, (lock) => {
    if (args.expected !== undefined) {
      const fresh = loadActiveState(args.projectDir);
      if (fresh.identity.snapshotId !== args.expected.snapshotId || fresh.identity.revision !== args.expected.revision) {
        throw new TrustStateError(
          'snapshot_superseded',
          `renewal state changed during the graph rebuild (snapshot ${args.expected.snapshotId} → ` +
            `${fresh.identity.snapshotId}, revision ${args.expected.revision} → ${fresh.identity.revision}) — re-run the refresh`,
        );
      }
    }
    applyStateMutation(args.projectDir, args.mutation, lock.identity);
  });
}
