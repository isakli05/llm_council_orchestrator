/**
 * Renewal project state (STEP 11): the LCO-owned layout under
 * `<lco-project>/.lco/renewal/` + deterministic status aggregation and the
 * markdown export renderer. The analyzed target repository is NEVER written.
 *
 * TRUST KERNEL: trusted reads/writes route through trust/fs + trust/state;
 * the persist helpers here are thin domain wrappers over the authorized
 * primitives (they add the stable-on-disk sorting the stores promise).
 *
 * S4-M-02 (closure): the schema and path table now live in the PURE
 * `renew/core/project-record` leaf — this module imports them (and the
 * kernel) DOWNWARD, and `trust/state.ts` no longer imports this module, so
 * the former `state ↔ project` cycle is structurally gone. S4-M-01 bypass
 * closure: `loadRenewalProject`/`loadSnapshotFile` read through the
 * authorized reader (chain-validated), never raw `readFileSync`.
 */
import { existsSync } from 'node:fs';
import { RenewalProjectSchema, renewalPaths, type RenewalProject } from '../core/project-record';
import { reloadSnapshot, type ProjectSnapshot } from '../core/snapshot-record';
import { authorizedWrite } from '../trust/fs';
import { authorizedRead } from '../trust/fs';
import { loadActiveState, readRevision } from '../trust/state';
import { preflightRenewalSurface } from '../trust/fs';

export { RenewalProjectSchema, renewalPaths } from '../core/project-record';
export type { RenewalProject, RenewalPaths } from '../core/project-record';
export { loadActiveState };

export function authorizeRenewalState(dir: string): { ok: true } | { ok: false; message: string } {
  // UX preflight over the fixed surface (enforcement lives per-write inside
  // trust/fs.authorizedWrite / authorizedRead).
  const refusals = preflightRenewalSurface(dir);
  return refusals.length === 0 ? { ok: true } : { ok: false, message: refusals[0]! };
}

export type ProjectLoad =
  | { ok: true; project: RenewalProject }
  | { ok: false; code: 'project_missing' | 'project_corrupt'; message: string };

/** Trusted project.json read (authorized reader — S4-M-01 bypass 1 closed). */
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
    return { ok: true, project: RenewalProjectSchema.parse(JSON.parse(authorizedRead({ projectDir: dir, path }))) };
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

/** Trusted snapshot.json read (authorized reader — S4-M-01 bypass 2 closed). */
export function loadSnapshotFile(dir: string): { ok: true; snapshot: ProjectSnapshot } | { ok: false; message: string } {
  const path = renewalPaths(dir).snapshot;
  if (!existsSync(path)) return { ok: false, message: `snapshot missing (${path}) — run lco renew refresh` };
  const r = reloadSnapshot(authorizedRead({ projectDir: dir, path }));
  return r.ok ? { ok: true, snapshot: r.snapshot } : { ok: false, message: r.message };
}

// --- INV-B2: versioned trusted-state revision ---------------------------------------

/**
 * The monotonic revision of the trusted Renewal stores (snapshot, project,
 * overlay, parity, strategy). Multiple valid state changes occur under one
 * snapshot — `snapshot_id` alone cannot detect a stale pre-call read (S2-M-01).
 * Absent file reads as 0 (pre-revision projects stay loadable); a CORRUPT
 * file fails closed — silently resetting the revision would re-enable lost
 * updates. Bumps are atomic (tmp+rename) and happen under the renewal lock.
 * Reads route through the kernel's typed reader (trust/state.readRevision).
 */
export function readStateRevision(dir: string): number {
  // Trust kernel wrapper (typed corrupt-first refusal; caller holds the lock).
  return readRevision(dir);
}

