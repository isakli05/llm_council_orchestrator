import { existsSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { acquireSpecRootLock, type SpecRootLock } from '../../storage/revision';
import { tryRealpath } from '../../storage/paths';
import { renewalPaths, RenewalProjectSchema, type RenewalProject } from '../project/project';
import { reloadSnapshot, type ProjectSnapshot } from '../snapshot/snapshot';
import { parseOverlayStore, type OverlayStore } from '../overlay/overlay';
import { parseParityStore, type ParityStore } from '../parity/ledger';
import { parseStrategyDecision, type StrategyDecision } from '../planner/strategy';
import { AnalysisRecordSchema, type AnalysisRecord } from '../recovery/schemas';
import { authorizedRead, authorizedWrite, authorizeProjectDestination, authorizedRenameNoClobber } from './fs';
import { TrustStateError } from './errors';

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

/** Read + parse state.json — the FIRST trusted read (corrupt fails closed). */
function readRevision(projectDir: string): number {
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

// --- the transaction ----------------------------------------------------------------------

export interface TxExpectation {
  snapshotId: string;
  revision: number;
}

export type TxFoldPolicy = 'additive' | 'strict';

/**
 * The read-modify-write protocol for trusted renewal state. See the module
 * doc for the begin→work→commit flow and the two merge policies. `commit`
 * performs its writes via the trusted persist helpers; the revision bumps
 * once after a successful commit. Nothing in this protocol can silently
 * lose a newer valid update: additive folds run against the FRESH state,
 * strict commits refuse on ANY drift, and a snapshot change always refuses.
 */
export async function runRenewalStateTx<W, R>(args: {
  projectDir: string;
  nowIso: string;
  /** The read view this transaction started from (required for 'strict'). */
  expected?: TxExpectation;
  policy: TxFoldPolicy;
  work: (state: ActiveRenewalState) => Promise<W> | W;
  commit: (fresh: ActiveRenewalState, workResult: W) => Promise<R> | R;
}): Promise<R> {
  const begin = loadActiveState(args.projectDir);
  if (args.expected === undefined) {
    // Verifier VB-5: BOTH policies require their read-view expectation —
    // additive-without-expected silently skipped snapshot-supersession
    // validation (a documented property, never an option).
    throw new TrustStateError('fold_conflict', `a ${args.policy} transaction requires its read-view expectation`);
  }
  const workResult = await args.work(begin);

  return withRenewalWriterLock(args.projectDir, args.nowIso, async () => {
    const fresh = loadActiveState(args.projectDir);
    if (fresh.identity.projectName !== begin.identity.projectName || fresh.identity.projectReal !== begin.identity.projectReal) {
      throw new TrustStateError(
        'project_mismatch',
        `the renewal project changed mid-operation (${begin.identity.projectName} → ${fresh.identity.projectName}) — refusing to commit`,
      );
    }
    if (args.expected !== undefined && fresh.identity.snapshotId !== args.expected.snapshotId) {
      throw new TrustStateError(
        'snapshot_superseded',
        `the active snapshot changed mid-operation (${args.expected.snapshotId} → ${fresh.identity.snapshotId}; ` +
          `a refresh superseded this work) — re-run the operation against the new snapshot`,
      );
    }
    if (args.expected !== undefined && fresh.identity.snapshotId !== begin.identity.snapshotId) {
      throw new TrustStateError(
        'snapshot_superseded',
        `the active snapshot changed mid-operation (${begin.identity.snapshotId} → ${fresh.identity.snapshotId}) — re-run the operation`,
      );
    }
    if (args.policy === 'strict' && fresh.identity.revision !== args.expected!.revision) {
      throw new TrustStateError(
        'stale_revision',
        `trusted state changed mid-operation (revision ${args.expected!.revision} → ${fresh.identity.revision}) — ` +
          `this operation must re-run from current state rather than commit a stale result`,
      );
    }
    const result = await args.commit(fresh, workResult);
    bumpStateRevisionTrusted(args.projectDir);
    return result;
  });
}

// --- refresh supersession (S3-H-04, S3-M-05) ----------------------------------------------

export interface SupersessionOutcome {
  archived: string[];
  retained: string[];
}

/**
 * Archive EVERY per-snapshot store for a refresh: overlay, parity,
 * strategy — AND the spec directory (a surviving pre-refresh spec used to
 * render as current while blocking the replacement plan). Renames are
 * NO-CLOBBER: a same-snapshot re-refresh refuses rather than overwriting
 * earlier history. Analyses/approvals stay in place as immutable history.
 * Caller holds the writer lock.
 */
export function supersedeStoresForRefresh(
  projectDir: string,
  paths: ReturnType<typeof renewalPaths>,
  oldSnapshotId: string,
): SupersessionOutcome {
  const archived: string[] = [];
  for (const [name, path] of [
    ['overlay', paths.overlay],
    ['parity', paths.parity],
    ['strategy', paths.strategy],
  ] as const) {
    if (!existsSync(path)) continue;
    const target = `${path}.${oldSnapshotId}.superseded`;
    authorizedRenameNoClobber({ projectDir, from: path, to: target });
    archived.push(`${name} → ${target.split(/[\\/]/).pop()}`);
  }
  if (existsSync(paths.specDir)) {
    const target = `${paths.specDir}.${oldSnapshotId}.superseded`;
    // spec/ is a DIRECTORY: rename with the same no-clobber discipline.
    const fromResolved = authorizeProjectDestination(projectDir, paths.specDir);
    const toResolved = authorizeProjectDestination(projectDir, target);
    if (existsSync(toResolved)) {
      throw new TrustStateError(
        'archive_collision',
        `refusing to archive spec → ${target}: the destination already exists (supersession archives never overwrite history)`,
      );
    }
    renameSync(fromResolved, toResolved);
    archived.push(`spec → ${target.split(/[\\/]/).pop()}`);
  }
  return { archived, retained: ['analyses (immutable history)', 'approvals (immutable human history)'] };
}
