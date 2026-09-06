import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { acquireSpecRootLock, type SpecRootLock } from '../../storage/revision';
import { tryRealpath } from '../../storage/paths';
import { renewalPaths, RenewalProjectSchema, type RenewalProject } from '../core/project-record';
import { reloadSnapshot, type ProjectSnapshot } from '../core/snapshot-record';
import { parseOverlayStore, type OverlayStore } from '../core/store-records';
import { parseParityStore, type ParityStore } from '../core/store-records';
import { parseStrategyDecision, type StrategyDecision } from './authority';
import { AnalysisRecordSchema, type AnalysisRecord } from '../recovery/schemas';
import { authorizedRead, authorizedWrite, authorizeProjectDestination, authorizedRenameNoClobber, authorizedEnsureDir, authorizedRemoveTree, authorizedCreateDirAtomically, authorizedCreateExclusive } from './fs';
import { TrustStateError, TrustFsError } from './errors';
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

/** Post-PR5 I5: classify what occupies the abort-evidence path. A GENUINE
 *  sidecar (the exact shape `writeAbortEvidence` persists) and a foreign
 *  object BOTH fail-close reads, but the diagnostic must say which one is
 *  there — an unexpected object must not read as a transaction-abort
 *  narrative. The read is size-guarded (64 KiB) and never TRUSTS the
 *  content: every non-genuine shape (unparseable, wrong shape, oversized,
 *  unreadable) is foreign, and the caller stays fail-closed either way. */
function foreignObjectAtEvidencePath(projectDir: string): { foreign: boolean; path: string } {
  const path = abortEvidencePath(projectDir);
  try {
    const stat = statSync(path);
    if (!stat.isFile() || stat.size > 64 * 1024) return { foreign: true, path };
    const parsed = JSON.parse(authorizedRead({ projectDir, path })) as Record<string, unknown>;
    const genuine =
      parsed !== null &&
      typeof parsed === 'object' &&
      parsed.schema_version === 1 &&
      typeof parsed.holder === 'object' &&
      parsed.holder !== null &&
      typeof parsed.base_revision === 'number' &&
      typeof parsed.performed_steps === 'number' &&
      typeof parsed.evidence === 'string' &&
      typeof parsed.written_at === 'string' &&
      typeof parsed.remedy === 'string';
    return { foreign: !genuine, path };
  } catch {
    return { foreign: true, path };
  }
}

/** Read + parse state.json — the FIRST trusted read (corrupt fails closed).
 *  Exported for the domain wrapper (project.readStateRevision).
 *  S4-H-01: a leftover transaction journal is detected HERE (the first
 *  trusted read) and deterministically recovered — see recoverTxJournal.
 *  Post-PR5 I5: a foreign object at the evidence path gets a distinguishable
 *  typed refusal — same recovery_required fail-closed direction, honest
 *  about what is actually on disk. */
export function readRevision(projectDir: string): number {
  const paths = renewalPaths(projectDir);
  if (existsSync(abortEvidencePath(projectDir))) {
    const { foreign, path } = foreignObjectAtEvidencePath(projectDir);
    if (foreign) {
      throw new TrustStateError(
        'recovery_required',
        `an unexpected object occupies the abort-evidence path (${path}) — it fail-closes trusted reads but is ` +
          `not a transaction-abort marker; inspect and remove it after review; recovery refuses to guess`,
      );
    }
    throw new TrustStateError(
      'recovery_required',
      `a transaction aborted with in-flight writes while a concurrent writer owned the journal ` +
        `(${path}) — the on-disk state may combine both writers. Inspect the trusted ` +
        `state after review, then remove the evidence file; recovery refuses to guess`,
    );
  }
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
  /** V1-re-verifier H1: set when this committer aborted AFTER another writer
   *  committed (fence observed the revision move). The journal is then an
   *  EVIDENCE MARKER, not a rollback authority — auto-recovery would clobber
   *  the newer commit. Recovery refuses (manual) instead. */
  superseded?: boolean;
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
  // V1-verifier note: holder identity (and the superseded marker) are covered
  // too — a journal is bound to its committer and its abort status.
  return domainDigest('LCO:STATE_TX', 1, {
    base_revision: j.base_revision,
    holder: j.holder,
    entries: j.entries,
    ...(j.superseded === true ? { superseded: true } : {}),
  });
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
  // Post-PR5 I6 (RD1): the durable write boundary validates with the SAME
  // schemas the reader will — no payload may commit that the read side would
  // refuse as `store_corrupt`/`project_corrupt`. Runs BEFORE the journal
  // write, so a refusal changes nothing on disk (typed
  // commit_failed_without_state_change). Read-side validation remains as the
  // backstop against external tampering (the write boundary cannot cover
  // that). Objects are validated through the exact JSON value domain the
  // durable bytes will carry (persistTrustedJson serializes the same value).
  const refuseInvalid = (kind: string, why: string): never => {
    throw new TrustStateError(
      'commit_failed_without_state_change',
      `refusing to commit an invalid ${kind} payload (${why}) — nothing was written`,
    );
  };
  if (mutation.overlay !== undefined) {
    const r = parseOverlayStore(JSON.stringify(mutation.overlay));
    if (!r.ok) refuseInvalid('overlay', r.message);
  }
  if (mutation.parity !== undefined) {
    const r = parseParityStore(JSON.stringify(mutation.parity));
    if (!r.ok) refuseInvalid('parity', r.message);
  }
  if (mutation.project !== undefined && !RenewalProjectSchema.safeParse(mutation.project).success) {
    refuseInvalid('project', 'renewal project schema validation failed');
  }
  if (mutation.snapshot !== undefined) {
    const r = reloadSnapshot(JSON.stringify(mutation.snapshot));
    if (!r.ok) refuseInvalid('snapshot', r.message);
  }
  if (mutation.strategy !== undefined) {
    const r = parseStrategyDecision(JSON.stringify(mutation.strategy));
    if (!r.ok) refuseInvalid('strategy', r.message);
  }
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
  // Pre-v0.2.1 (INFO-A closure): set the moment the revision bump lands —
  // the revision write is the LAST store write, so revisionBumped ⇒ every
  // store of this commit is on disk and the only remaining step is journal
  // cleanup. The abort disclosure uses this to distinguish "our own commit
  // landed, cleanup faulted" from "a concurrent writer moved the revision".
  let revisionBumped = false;
  try {
    // Canonical order (matches planJournalEntries' construction exactly).
    // Every step is ownership-fenced (zombie-write closure): a stale-broken
    // writer aborts at the NEXT boundary instead of completing its writes
    // over the live committer's bytes.
    for (const dir of mutation.ensureDirs ?? []) {
      fenceBeforeWrite(projectDir, holder, 'ensureDir');
      authorizedEnsureDir({ projectDir, path: dir });
      performed += 1;
    }
    for (const r of mutation.archive ?? []) {
      if (entries.some((e) => e.kind === 'rename' && e.from === r.from && e.to === r.to)) {
        fenceBeforeWrite(projectDir, holder, 'archive');
        authorizedRenameNoClobber({ projectDir, from: r.from, to: r.to });
        performed += 1;
      }
    }
    if (mutation.snapshot !== undefined) { fenceBeforeWrite(projectDir, holder, 'snapshot'); persistTrustedJson({ projectDir, path: paths.snapshot, value: mutation.snapshot }); performed += 1; }
    if (mutation.project !== undefined) { fenceBeforeWrite(projectDir, holder, 'project'); persistTrustedJson({ projectDir, path: paths.projectJson, value: mutation.project }); performed += 1; }
    if (mutation.overlay !== undefined) { fenceBeforeWrite(projectDir, holder, 'overlay'); persistTrustedJson({ projectDir, path: paths.overlay, value: mutation.overlay }); performed += 1; }
    if (mutation.parity !== undefined) { fenceBeforeWrite(projectDir, holder, 'parity'); persistTrustedJson({ projectDir, path: paths.parity, value: mutation.parity }); performed += 1; }
    if (mutation.strategy !== undefined) { fenceBeforeWrite(projectDir, holder, 'strategy'); persistTrustedJson({ projectDir, path: paths.strategy, value: mutation.strategy }); performed += 1; }
    if (mutation.specDir !== undefined) {
      fenceBeforeWrite(projectDir, holder, 'specDir');
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
    revisionBumped = true;
    removeJournal(projectDir, paths, holder);
  } catch (err) {
    const cause = err as Error;
    // Final-V1-re-verifier NH-1/NH-2 protocol: abort paths NEVER touch
    // shared state without proving the journal at the path is still OURS.
    // A live concurrent committer consumed our journal at its begin (that is
    // how every transaction starts); a foreign journal on disk is therefore
    // proof another writer owns the state — we must not roll back over it,
    // remove it, or clobber it with a marker.
    let revisionMoved = false;
    try {
      revisionMoved = readRevisionUnlocked(projectDir) !== journal.base_revision;
    } catch {
      revisionMoved = true; // unreadable revision after a mid-commit failure — fail loud too
    }
    const ours = journalIsOurs(projectDir, paths, holder);

    if (revisionMoved) {
      if (activeJournalDir === projectDir) activeJournalDir = null;
      // When the journal path is FOREIGN, no marker of ours can be written
      // and B's completion will remove the last authority — performed>0 then
      // means our bytes may sit over B's commit with NO surviving evidence.
      // The sidecar (a separate path) fail-closes reads past B's removal.
      let sidecar: MarkerWriteOutcome | undefined;
      // ONE journal-presence read drives BOTH evidence channels (post-PR5 L5:
      // this was two separate reads; the check→write window between them and
      // the marker write is now closed by the O_EXCL CAS inside
      // markJournalSuperseded, not by read ordering).
      const journalPresent = journalOnDisk(projectDir, paths) !== undefined;
      if (performed > 0 && !ours && journalPresent) {
        sidecar = writeAbortEvidence(projectDir, journal, performed);
      }
      // The marker is evidence ONLY over our own journal (or an empty path);
      // a foreign journal belongs to the concurrent writer and stays theirs.
      let marker: SupersededMarkerOutcome | undefined;
      if (ours || !journalPresent) {
        marker = markJournalSuperseded(projectDir, paths, journal, ours);
      }
      // S5-M-04: the typed abort must tell the truth about what is (and is
      // NOT) durably on disk — a persistently failing evidence channel is
      // disclosed, never silently absorbed.
      const disclosures: string[] = [];
      if (sidecar !== undefined && !sidecar.landed) {
        disclosures.push(
          `PERSISTENT abort-evidence failure: the abort evidence could NOT be written to ${abortEvidencePath(projectDir)} ` +
            `after ${sidecar.attempts} attempts — NO durable marker of this abort exists on disk ` +
            `(any pre-existing object at that path still fail-closes reads, but is not evidence of this abort); ` +
            `manually inspect the trusted state against both writers before any re-run`,
        );
      }
      if (marker !== undefined && !marker.landed) {
        if (marker.failed === 'race') {
          disclosures.push(
            `SUPERSEDED-MARKER RACE: the marker was NOT written — a concurrent writer's journal occupied the path and its ` +
              `rollback authority was PRESERVED (the marker refuses to clobber it); manually inspect the trusted state before any re-run`,
          );
        } else if (marker.failed === 'debris') {
          disclosures.push(
            `SUPERSEDED-MARKER DEBRIS: the marker was NOT written — OUR OWN partial marker (left by a failed write attempt whose ` +
              `cleanup unlink also failed) occupied the journal path; this is NOT a concurrent writer; reads fail closed until the ` +
              `debris is manually cleared; manually inspect the trusted state before any re-run`,
          );
        } else if (marker.failed === 'cleanup') {
          disclosures.push(
            `SUPERSEDED-MARKER CLEANUP FAILURE: our own journal could NOT be removed before marking superseded (${marker.reason}) — ` +
              `the journal itself is retained unmarked and the next trusted read will retire it automatically; no rollback authority was lost`,
          );
        } else {
          disclosures.push(
            `PERSISTENT superseded-marker failure: the journal path could NOT be marked superseded after ${marker.attempts} attempts — ` +
              `the stale journal may auto-retire on the next trusted read; manually inspect the trusted state before any re-run`,
          );
        }
      }
      const retention =
        marker !== undefined && marker.landed
          ? 'the journal is retained as a superseded marker'
          : marker !== undefined && marker.failed === 'cleanup'
            ? 'the journal itself is retained unmarked — the next trusted read will retire it automatically (the revision has already advanced past its base)'
            : sidecar !== undefined && sidecar.landed
              ? 'the concurrent writer owns the journal path (abort evidence retained separately)'
              : marker !== undefined || sidecar !== undefined
                ? 'NO durable evidence of this abort could be retained'
                : 'no in-flight writes were performed (nothing to evidence)';
      // Pre-v0.2.1 (INFO-A closure): when OUR OWN revision bump had already
      // landed, the commit itself completed — every store plus the revision
      // are on disk and only journal cleanup faulted. The generic arm below
      // would claim "commit failed / a concurrent writer committed / state
      // may combine both writers" — all three factually false here, and a
      // fresh reader would be fail-closed into needless manual recovery.
      if (revisionBumped && ours) {
        throw new TrustStateError(
          'recovery_required',
          `trusted-state commit LANDED completely (all stores written and the revision advanced) — the failure (${cause.message}) ` +
            `was in post-commit journal cleanup, not in the commit; no concurrent writer is implied; ` +
            `${retention}; ` +
            `inspect the journal path after review before re-running.` +
            (disclosures.length > 0 ? ` CRITICAL: ${disclosures.join(' · ')}.` : ''),
        );
      }
      throw new TrustStateError(
        'recovery_required',
        `trusted-state commit failed (${cause.message}) AND the revision advanced past this commit's base — ` +
          `a concurrent writer committed. On-disk state may combine both writers; ` +
          `${retention}; ` +
          `inspect the state after review before re-running.` +
          (disclosures.length > 0 ? ` CRITICAL: ${disclosures.join(' · ')}.` : ''),
      );
    }

    if (!ours) {
      // Revision unchanged but the journal is NOT ours: a concurrent writer
      // consumed ours and is mid-commit (or crashed). Do NOT roll back — the
      // zombie byte we may already have landed cannot be unsafely rewritten
      // here; leave fail-closed evidence and let review/their-recovery decide.
      if (activeJournalDir === projectDir) activeJournalDir = null;
      const sidecar = performed > 0 ? writeAbortEvidence(projectDir, journal, performed) : undefined;
      const disclosure =
        sidecar !== undefined && !sidecar.landed
          ? ` CRITICAL: PERSISTENT abort-evidence failure: the abort evidence could NOT be written to ${abortEvidencePath(projectDir)} ` +
            `after ${sidecar.attempts} attempts — NO durable marker of this abort exists on disk ` +
            `(any pre-existing object at that path still fail-closes reads, but is not evidence of this abort); ` +
            `manually inspect the trusted state against both writers before any re-run.`
          : '';
      throw new TrustStateError(
        'recovery_required',
        `trusted-state commit aborted (${cause.message}) while another writer owns the transaction journal — ` +
          `this commit's partial writes are left to be superseded by the concurrent commit or its recovery; ` +
          `inspect the state after review before re-running.${disclosure}`,
      );
    }

    // The journal is still OURS and the revision is unchanged: no other
    // writer exists (a live one would have consumed the journal at its
    // begin). The clean abort is exclusively ours — roll the performed
    // prefix back and propagate the ORIGINAL typed refusal. (H2: guarded —
    // a rollback failure is typed and never sticks the in-flight marker.)
    if (err instanceof TrustStateError && err.code === 'recovery_required') {
      try {
        rollbackPerformedPrefix(projectDir, journal, performed);
        removeJournal(projectDir, paths, holder);
      } catch (rb) {
        if (activeJournalDir === projectDir) activeJournalDir = null;
        throw new TrustStateError(
          'recovery_required',
          `commit aborted (${cause.message}) and its rollback failed (${(rb as Error).message}) — ` +
            `the transaction journal is retained; the next trusted read recovers deterministically`,
        );
      }
      throw err;
    }
    try {
      rollbackPerformedPrefix(projectDir, journal, performed);
      removeJournal(projectDir, paths, holder);
      throw new TrustStateError(
        'commit_failed_without_state_change',
        `trusted-state commit failed and was ROLLED BACK to the previous complete revision (${cause.message}) — ` +
          `no partial state was left behind; re-run the operation`,
      );
    } catch (rb) {
      if (rb instanceof TrustStateError && rb.code === 'commit_failed_without_state_change') throw rb;
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

/** The abort-evidence SIDECAR path (final-V1 zombie-byte closure): written
 *  by a committer whose abort may have left in-flight bytes on disk while a
 *  concurrent writer owned the journal path. It NEVER conflicts with any
 *  journal (separate file) and fail-closes trusted reads until manual
 *  recovery — the alternative was a silently-torn pair. */
function abortEvidencePath(projectDir: string): string {
  return join(renewalPaths(projectDir).journal, '..', 'tx-abort-evidence.json');
}

/** Typed outcome of a best-effort durable-marker write (S5-M-04): the
 *  caller MUST know when the marker did NOT land so the typed abort can
 *  disclose the evidence channel is down — never claim retention that
 *  physics did not permit. */
type MarkerWriteOutcome = { landed: true } | { landed: false; failed: 'persistent'; attempts: 3 };
/** Post-PR5 L5 (RC1): the superseded marker's outcome additionally includes
 *  the CAS-race loss — a concurrent writer's journal occupied the path, so
 *  the marker was NOT written and the racer's rollback authority is
 *  PRESERVED (disclosed, never clobbered).
 *
 *  Pre-v0.2.1 hardening adds two distinct fail-closed outcomes so the
 *  disclosure can never misattribute CAUSE (the L7 truthfulness contract):
 *  - 'debris' (E-3): our own partial marker (from a failed create) occupied
 *    the path after its cleanup unlink ALSO failed — NOT a concurrent writer;
 *  - 'cleanup' (E-1): our own journal could not be removed at all — the
 *    journal stays on disk unmarked and the next trusted read auto-retires
 *    it (the revision has advanced past its base). */
type SupersededMarkerOutcome =
  | MarkerWriteOutcome
  | { landed: false; failed: 'race' }
  | { landed: false; failed: 'debris' }
  | { landed: false; failed: 'cleanup'; reason: string };

/** Bounded-retry sidecar write (closing-verify hardening): the evidence
 *  channel must survive a TRANSIENT single I/O fault at exactly this write
 *  (ENOSPC/EIO blip) — three attempts with fresh staging each time. A
 *  PERSISTENT fault is REPORTED to the caller (S5-M-04): under total
 *  persistent failure no durable marker is physically possible through this
 *  channel — the honest representation is the typed disclosure in the abort
 *  error, not a silent void. */
function writeAbortEvidence(projectDir: string, journal: TxJournalFile, performed: number): MarkerWriteOutcome {
  const value = {
    schema_version: 1,
    holder: journal.holder,
    base_revision: journal.base_revision,
    performed_steps: performed,
    evidence: 'a transaction aborted while another writer owned the journal path; in-flight bytes may have landed over the concurrent commit',
    written_at: new Date().toISOString(),
    remedy: 'inspect the trusted state against both writers, then remove tx-abort-evidence.json',
  };
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      persistTrustedJson({ projectDir, path: abortEvidencePath(projectDir), value });
      return { landed: true };
    } catch {
      // transient fault — retry with fresh staging; a PERSISTENT fault is
      // typed and disclosed by the caller below (S5-M-04).
    }
  }
  return { landed: false, failed: 'persistent', attempts: 3 };
}

/** Bounded-retry superseded-marker write on the journal path (S5-M-04):
 *  same class as the sidecar — when this write persistently fails, the
 *  stale journal may auto-retire on the next trusted read; the abort must
 *  say so instead of claiming the marker was retained. */
function markJournalSuperseded(projectDir: string, paths: ReturnType<typeof renewalPaths>, journal: TxJournalFile, ours: boolean): SupersededMarkerOutcome {
  const supersededJournal: TxJournalFile = { ...journal, superseded: true };
  supersededJournal.integrity = txJournalIntegrity(supersededJournal);
  // Post-PR5 L5 (RC1) CAS fence: the marker may never destructively replace
  // bytes it has not PROVED are its own at check time. Our own journal is
  // removed first (ownership-conditioned inside removeJournal); the
  // superseded marker is then CREATED with O_EXCL — a concurrent writer
  // parking its journal in the historical check→write window can no longer
  // be clobbered: the create fails atomically (record_exists), the racer
  // wins, and its rollback authority survives. Bytes match the historical
  // persistTrustedJson format.
  //
  // E-2 (pre-v0.2.1) — accepted boundary: the ownership proof inside
  // removeJournal is check-then-act (read journal bytes → prove ours →
  // unlink). An OUT-OF-PROTOCOL writer landing a journal in that
  // microsecond window can still be unlinked (schedule S10 pins this
  // deterministically). Every in-protocol journal write serializes on the
  // renewal writer lock this aborter still holds, so the window is
  // reachable only by writers already violating the protocol; no global
  // lock or second authority store is added for it.
  if (ours) {
    try {
      removeJournal(projectDir, paths, journal.holder);
    } catch (err) {
      // E-1 (pre-v0.2.1): a persistent unlink fault must not escape as a
      // raw fs error replacing the typed disclosure. The journal itself
      // stays on disk unmarked — fail-safe: the next trusted read retires
      // it (the revision has advanced past its base).
      return { landed: false, failed: 'cleanup', reason: (err as Error).message };
    }
  }
  const content = `${JSON.stringify(supersededJournal, null, 2)}\n`;
  let debrisCleanupFailed = false;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      authorizedCreateExclusive({ projectDir, path: paths.journal, content, mode: 0o600 });
      return { landed: true };
    } catch (err) {
      if (err instanceof TrustFsError && err.code === 'record_exists') {
        // E-3 (pre-v0.2.1): distinguish OUR OWN debris from a REAL racer.
        // A prior attempt's partial marker whose cleanup unlink also failed
        // must not be attributed to a "concurrent writer … PRESERVED".
        return debrisCleanupFailed
          ? { landed: false, failed: 'debris' }
          : { landed: false, failed: 'race' };
      }
      // V-B finding: a mid-write fault (ENOSPC/EIO) can leave OUR OWN
      // TRUNCATED partial file at the path — the next attempt would EEXIST
      // and misattribute a concurrent-writer race to our own debris. Remove
      // the partial file (best-effort) so the retry races only a REAL
      // concurrent writer.
      try {
        authorizedRemoveTree({ projectDir, path: paths.journal });
        debrisCleanupFailed = false;
      } catch {
        // best-effort: if this also fails, the bounded retry keeps the
        // fail-closed outcome; a subsequent EEXIST is classified as OUR OWN
        // debris ('debris') — never a false concurrent-writer claim.
        debrisCleanupFailed = true;
      }
    }
  }
  return { landed: false, failed: 'persistent', attempts: 3 };
}

/** Read the journal currently on disk (undefined when absent/unparseable). */
function journalOnDisk(projectDir: string, paths: ReturnType<typeof renewalPaths>): TxJournalFile | undefined {
  if (!existsSync(paths.journal)) return undefined;
  try {
    return JSON.parse(authorizedRead({ projectDir, path: paths.journal })) as TxJournalFile;
  } catch {
    return undefined;
  }
}

/** Is the journal on disk still THIS holder's (and not superseded)? */
function journalIsOurs(projectDir: string, paths: ReturnType<typeof renewalPaths>, holder: { pid: number; acquiredAt: string }): boolean {
  const onDisk = journalOnDisk(projectDir, paths);
  return (
    onDisk !== undefined &&
    onDisk.holder?.pid === holder.pid &&
    onDisk.holder?.acquiredAt === holder.acquiredAt &&
    onDisk.superseded !== true
  );
}

/** Ownership probe: does the lockfile still name THIS holder? */
function lockStillOurs(projectDir: string, holder: { pid: number; acquiredAt: string }): boolean {
  const lockPath = join(renewalWriterLockDir(projectDir), '.lco-revision.lock');
  let text: string | undefined;
  try {
    text = authorizedRead({ projectDir, path: lockPath });
  } catch {
    text = undefined;
  }
  if (text === undefined) return false;
  try {
    const parsed = JSON.parse(text) as { pid?: unknown; acquiredAt?: unknown };
    return parsed.pid === holder.pid && parsed.acquiredAt === holder.acquiredAt;
  } catch {
    return false;
  }
}

/**
 * The PER-WRITE fence (final-V1 zombie-write closure): before EVERY forward
 * write, the writer proves the lock still names it. A stale-broken writer
 * that resumes mid-write-set therefore aborts at the next write boundary —
 * BEFORE its zombie bytes land over the live committer's stores. The window
 * shrinks to inside a single authorized write (staging+fsync+rename), which
 * cannot outlive the 10s stale-break on a healthy filesystem.
 */
function fenceBeforeWrite(projectDir: string, holder: { pid: number; acquiredAt: string }, what: string): void {
  if (!lockStillOurs(projectDir, holder)) {
    throw new TrustStateError(
      'recovery_required',
      `the renewal writer lock changed hands before the ${what} write (this writer's lock was stale-broken) — ` +
        `the commit aborts BEFORE writing over another writer's state`,
    );
  }
}

/** The V6 fence (pre-revision): the lockfile must still name THIS holder and
 *  the on-disk revision must still be our base. */
function fenceWriterLock(projectDir: string, holder: { pid: number; acquiredAt: string }, baseRevision: number): void {
  if (!lockStillOurs(projectDir, holder)) {
    throw new TrustStateError(
      'recovery_required',
      'the renewal writer lock changed hands mid-commit (the stale window elapsed and another writer broke it) — ' +
        'this commit is aborted; the abort path decides whether recovery or rollback applies',
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

/**
 * Remove the journal — OWNERSHIP-CONDITIONED (final-V1-re-verifier NH-1/NH-2):
 * a writer only unlinks ITS OWN journal. A foreign journal (a concurrent
 * committer's) or a SUPERSEDED marker at the path is NEVER removed by us —
 * removing another writer's in-flight journal or an abort-evidence marker is
 * exactly how silent torn states were produced. Recovery keeps its own
 * removal authority (it processes the dead writer's journal deliberately).
 */
function removeJournal(
  projectDir: string,
  paths: ReturnType<typeof renewalPaths>,
  holder?: { pid: number; acquiredAt: string },
  opts?: { recoveryOwns?: boolean },
): void {
  try {
    if (!existsSync(paths.journal)) return;
    if (opts?.recoveryOwns === true) {
      // recovery processes whatever journal is there (superseded ones were
      // refused before this point)
      authorizedRemoveTree({ projectDir, path: paths.journal });
      return;
    }
    if (holder !== undefined) {
      if (journalIsOurs(projectDir, paths, holder)) {
        authorizedRemoveTree({ projectDir, path: paths.journal });
      }
      // foreign or superseded: leave it — its owner (or manual recovery)
      // resolves it; we must never delete another writer's authority
      return;
    }
    throw new Error('removeJournal requires a holder (or recoveryOwns) — unconditional journal removal is unrepresentable');
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
    // H1 companion: a SUPERSEDED journal (its committer aborted after another
    // writer committed) is an evidence marker, not a rollback authority —
    // auto-recovery would clobber the newer commit. Manual recovery only.
    if (journal.superseded === true) {
      throw new TrustStateError(
        'recovery_required',
        `the transaction journal at ${paths.journal} is SUPERSEDED — its committer aborted after a concurrent ` +
          `commit landed, so on-disk state may combine both writers. Recovery refuses to auto-rollback over the ` +
          `newer revision; inspect the state and the journal after review, then remove the journal.`,
      );
    }
    // S5-H-01 (Fifth Audit): JOIN the journal to the durable revision before
    // granting it rollback authority. The commit point is the durable revision
    // write itself, and applyStateMutation performs it BEFORE removeJournal —
    // so a journal whose base_revision is BEHIND the current revision proves
    // its transaction REACHED the commit point (a completed commit whose
    // cleanup unlink was lost to process death) or is an older journal
    // reintroduced onto disk (restore/copy). Either way the durable state is
    // newer and complete; reverse-applying the journal would silently revert
    // committed trusted state (and DELETE stores the commit created). Retire
    // it instead — never roll back through it.
    let currentRevision: number | undefined;
    try {
      currentRevision = readRevisionUnlocked(projectDir);
    } catch (e) {
      // Indeterminate current revision (unreadable/corrupt state.json). The
      // revision write is atomic (staging+fsync+rename), so a torn revision
      // file is unreachable by the protocol itself — an unreadable one is
      // external corruption, and the join this fix depends on CANNOT be
      // performed. Granting the journal rollback authority over committed
      // state on an unperformable comparison is exactly the guess recovery
      // refuses (verifier-A residual closure): fail closed, retain both.
      throw new TrustStateError(
        'recovery_required',
        `the durable revision is unreadable (${(e as Error).message}) while a transaction journal exists — ` +
          `the journal↔revision join cannot be performed, so recovery refuses to guess whether the journal ` +
          `describes an interrupted or a completed transaction. Inspect state.json and ${paths.journal} after review`,
      );
    }
    if (currentRevision !== undefined && currentRevision > journal.base_revision) {
      // Completed-transaction leftover / stale replay: preserve the current
      // trusted revision and its full write set; retire the journal through
      // the ownership-conditioned recovery removal (the authorized primitive
      // — never a new raw filesystem path).
      try {
        removeJournal(projectDir, paths, undefined, { recoveryOwns: true });
      } catch (e) {
        throw new TrustStateError(
          'recovery_required',
          `a completed transaction's journal (base revision ${journal.base_revision}, current revision ` +
            `${currentRevision}) could not be retired (${(e as Error).message}) — the journal is retained and the ` +
            `committed state is untouched; retry the read after the fault clears`,
        );
      }
      return; // the trusted read proceeds at the current (committed) revision
    }
    if (currentRevision !== undefined && currentRevision < journal.base_revision) {
      // The journal claims a base AHEAD of the durable state — unexplained
      // (an older state.json restored beneath a newer journal, or tampering).
      // Fail closed: recovery refuses to guess forward or backward.
      throw new TrustStateError(
        'recovery_required',
        `the transaction journal claims base revision ${journal.base_revision} but the durable revision is ` +
          `${currentRevision} — the journal is AHEAD of the state it would restore (older state.json restored, or ` +
          `tampering). Recovery refuses to guess; inspect ${paths.journal} after review`,
      );
    }
    try {
      rollbackJournal(projectDir, paths, journal);
    } catch (e) {
      void 0;
      throw new TrustStateError(
        'recovery_required',
        `journal rollback could not complete (${(e as Error).message}) — the journal is retained; ` +
          `inspect it after review and recover manually`,
      );
    }
    removeJournal(projectDir, paths, undefined, { recoveryOwns: true });
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
