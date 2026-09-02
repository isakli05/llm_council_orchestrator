/**
 * Renewal project state (STEP 11): the LCO-owned layout under
 * `<lco-project>/.lco/renewal/` + deterministic status aggregation and the
 * markdown export renderer. The analyzed target repository is NEVER written.
 *
 * TRUST KERNEL: trusted reads/writes route through trust/fs + trust/state;
 * the persist helpers here are thin domain wrappers over the authorized
 * primitives (they add the stable-on-disk sorting the stores promise).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { tryRealpath } from '../../storage/paths';
import { authorizedWrite } from '../trust/fs';
import { bumpStateRevisionTrusted, loadActiveState, supersedeStoresForRefresh } from '../trust/state';
import { preflightRenewalSurface } from '../trust/fs';
import { loadAnalysisRecords } from '../recovery/analysis-store';
import { loadOverlay } from '../overlay/overlay';
import { loadParity } from '../parity/ledger';
import { loadStrategy } from '../planner/strategy';
import { reloadSnapshot, type ProjectSnapshot } from '../snapshot/snapshot';

export const RenewalProjectSchema = z
  .object({
    schema_version: z.literal(1),
    name: z.string().min(1).max(200),
    target_path: z.string().min(1),
    created_at: z.string().min(1),
    snapshot_id: z.string().regex(/^RSN-[0-9a-f]{16}$/),
  })
  .strict();

export type RenewalProject = z.infer<typeof RenewalProjectSchema>;

export interface RenewalPaths {
  projectJson: string;
  snapshot: string;
  workspace: string;
  overlay: string;
  parity: string;
  strategy: string;
  analyses: string;
  approvals: string;
  specDir: string;
  /** INV-B2: monotonic trusted-state revision counter (state.json). */
  state: string;
}

export function renewalPaths(dir: string): RenewalPaths {
  const root = join(dir, '.lco', 'renewal');
  return {
    projectJson: join(root, 'project.json'),
    snapshot: join(root, 'snapshot.json'),
    workspace: join(root, 'graph-workspace'),
    overlay: join(root, 'overlay.json'),
    parity: join(root, 'parity.json'),
    strategy: join(root, 'strategy.json'),
    analyses: join(root, 'analyses'),
    approvals: join(dir, 'approvals'),
    specDir: join(dir, 'spec'),
    state: join(root, 'state.json'),
  };
}

/**
 * INV-A (S2-C-01): every trusted Renewal state destination, including the
 * atomic tmp+rename siblings, that must live under a REAL-directory chain of
 * the resolved project root before any renewal command reads or writes state.
 * One shared authorization boundary for the whole command surface.
 */
export function renewalStateDestinations(paths: RenewalPaths): string[] {
  return [
    paths.projectJson,
    `${paths.projectJson}.tmp`,
    paths.snapshot,
    `${paths.snapshot}.tmp`,
    paths.overlay,
    `${paths.overlay}.tmp`,
    paths.parity,
    `${paths.parity}.tmp`,
    paths.strategy,
    `${paths.strategy}.tmp`,
    paths.state,
    `${paths.state}.tmp`,
    paths.workspace,
    paths.analyses,
    paths.approvals,
    paths.specDir,
  ];
}

export function authorizeRenewalState(dir: string): { ok: true } | { ok: false; message: string } {
  // UX preflight over the fixed surface (enforcement lives per-write inside
  // trust/fs.authorizedWrite / authorizedRead).
  const refusals = preflightRenewalSurface(dir);
  return refusals.length === 0 ? { ok: true } : { ok: false, message: refusals[0]! };
}

export type ProjectLoad =
  | { ok: true; project: RenewalProject }
  | { ok: false; code: 'project_missing' | 'project_corrupt'; message: string };

/**
 * C-05 — explicit refresh supersession: per-snapshot stores (overlay, parity,
 * strategy) are ARCHIVED under their old snapshot id, never silently reused
 * across a snapshot change. Analyses and approvals are immutable human/LLM
 * history: retained in place, but consumers bind them to the ACTIVE snapshot
 * only (cross-snapshot records are historical, never planning inputs).
 */
export interface SupersessionResult {
  archived: string[]; // "overlay → overlay.json.RSN-….superseded"
  retained: string[]; // store names kept as history
}

export function supersedeRenewalStores(dir: string, paths: RenewalPaths, oldSnapshotId: string): SupersessionResult {
  // Trust kernel: archives overlay/parity/strategy AND spec (S3-H-04), with
  // no-clobber renames (S3-M-05). Caller holds the renewal writer lock.
  const outcome = supersedeStoresForRefresh(dir, paths, oldSnapshotId);
  return { archived: outcome.archived, retained: outcome.retained };
}

export function loadRenewalProject(dir: string): ProjectLoad {
  const path = renewalPaths(dir).projectJson;
  if (!existsSync(path)) {
    return {
      ok: false,
      code: 'project_missing',
      message: `not a renewal project: ${path} not found — run 'lco renew init ${dir} --target <repo>' first`,
    };
  }
  try {
    return { ok: true, project: RenewalProjectSchema.parse(JSON.parse(readFileSync(path, 'utf8'))) };
  } catch (e) {
    return { ok: false, code: 'project_corrupt', message: `project.json invalid: ${(e as Error).message}` };
  }
}

export function persistRenewalProject(dir: string, project: RenewalProject): void {
  authorizedWrite({
    projectDir: dir,
    path: renewalPaths(dir).projectJson,
    content: `${JSON.stringify(project, null, 2)}\n`,
  });
}

export function persistSnapshotFile(dir: string, snapshot: ProjectSnapshot): void {
  authorizedWrite({
    projectDir: dir,
    path: renewalPaths(dir).snapshot,
    content: `${JSON.stringify(snapshot, null, 2)}\n`,
  });
}

export function loadSnapshotFile(dir: string): { ok: true; snapshot: ProjectSnapshot } | { ok: false; message: string } {
  const path = renewalPaths(dir).snapshot;
  if (!existsSync(path)) return { ok: false, message: `snapshot missing (${path}) — run lco renew refresh` };
  const r = reloadSnapshot(readFileSync(path, 'utf8'));
  return r.ok ? { ok: true, snapshot: r.snapshot } : { ok: false, message: r.message };
}

/** Everything status/export need, loaded once, missing stores tolerated. */
export interface RenewalState {
  project: RenewalProject;
  snapshot: ProjectSnapshot | undefined;
  snapshotError: string | undefined;
  analyses: ReturnType<typeof loadAnalysisRecords>;
  overlay: { ok: true; store: import('../overlay/overlay').OverlayStore } | { ok: false; message: string };
  parity: { ok: true; store: import('../parity/ledger').ParityStore } | { ok: false; message: string };
  strategy: { ok: true; decision: import('../planner/strategy').StrategyDecision } | { ok: false; message: string };
  specExists: boolean;
}

/**
 * INV-B1 (S2-H-11, reopening C-04): the project-level target pointer and the
 * snapshot's target identity are ONE identity — `realpath(project.target_path)`
 * must equal `snapshot.target.root_realpath`. A `fresh` verdict must never
 * describe Snapshot A while the project points at Target B (an identical clone
 * included). Changing the pointer is the explicit `refresh` transition, never
 * a silent mutation. Throws a typed message the command surface converts into
 * a fail-closed refusal.
 */
export function assertTargetSnapshotJoin(project: RenewalProject, snapshot: ProjectSnapshot): void {
  const targetReal = tryRealpath(project.target_path);
  if (targetReal === undefined) {
    throw new Error(
      `renewal target missing: project.json points at ${project.target_path}, which does not exist — ` +
        `the recorded source state is unverifiable. Run 'lco renew refresh' against a present target.`,
    );
  }
  if (targetReal !== snapshot.target.root_realpath) {
    throw new Error(
      `renewal target identity mismatch: the project points at ${targetReal} but the active snapshot ` +
        `${snapshot.snapshot_id} was taken of ${snapshot.target.root_realpath} — a fresh verdict must never ` +
        `describe one source while the project points at another. Run 'lco renew refresh' to rebind explicitly.`,
    );
  }
}

export function loadRenewalState(dir: string): RenewalState {
  const p = loadRenewalProject(dir);
  if (!p.ok) throw new Error(p.message);
  const paths = renewalPaths(dir);
  const snap = loadSnapshotFile(dir);
  if (snap.ok) assertTargetSnapshotJoin(p.project, snap.snapshot);
  return {
    project: p.project,
    snapshot: snap.ok ? snap.snapshot : undefined,
    snapshotError: snap.ok ? undefined : snap.message,
    analyses: loadAnalysisRecords(paths.analyses),
    overlay: existsSync(paths.overlay)
      ? (() => {
          const r = loadOverlay(paths.overlay);
          return r.ok ? { ok: true, store: r.store } : { ok: false, message: r.message };
        })()
      : { ok: true, store: { schema_version: 1, snapshot_id: p.project.snapshot_id, records: [] } },
    parity: existsSync(paths.parity)
      ? (() => {
          const r = loadParity(paths.parity);
          return r.ok ? { ok: true, store: r.store } : { ok: false, message: r.message };
        })()
      : { ok: true, store: { schema_version: 1, snapshot_id: p.project.snapshot_id, records: [] } },
    strategy: (() => {
      const r = loadStrategy(paths.strategy);
      return r.ok ? { ok: true, decision: r.decision } : { ok: false, message: r.message };
    })(),
    specExists: existsSync(paths.specDir),
  };
}

// --- INV-B2: versioned trusted-state revision ---------------------------------------

const RenewalStateFileSchema = z
  .object({ schema_version: z.literal(1), revision: z.number().int().nonnegative() })
  .strict();

/**
 * The monotonic revision of the trusted Renewal stores (snapshot, project,
 * overlay, parity, strategy). Multiple valid state changes occur under one
 * snapshot — `snapshot_id` alone cannot detect a stale pre-call read (S2-M-01).
 * Absent file reads as 0 (pre-revision projects stay loadable); a CORRUPT
 * file fails closed — silently resetting the revision would re-enable lost
 * updates. Bumps are atomic (tmp+rename) and happen under the renewal lock.
 */
export function readStateRevision(dir: string): number {
  const path = renewalPaths(dir).state;
  if (!existsSync(path)) return 0;
  const parsed = RenewalStateFileSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
  if (!parsed.success) {
    throw new Error(`renewal state revision file corrupt (${path}: ${parsed.error.issues[0]?.message ?? 'invalid'}) — inspect or remove it after review; refusing to guess`);
  }
  return parsed.data.revision;
}

export function bumpStateRevision(dir: string): void {
  // Trust kernel wrapper (authorized atomic write; caller holds the lock).
  bumpStateRevisionTrusted(dir);
}

export { loadActiveState };
