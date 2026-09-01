/**
 * Renewal project state (STEP 11): the LCO-owned layout under
 * `<lco-project>/.lco/renewal/` + deterministic status aggregation and the
 * markdown export renderer. The analyzed target repository is NEVER written.
 */
import { existsSync, readFileSync, renameSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
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
  };
}

export type ProjectLoad =
  | { ok: true; project: RenewalProject }
  | { ok: false; code: 'project_missing' | 'project_corrupt'; message: string };

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
  const path = renewalPaths(dir).projectJson;
  mkdirSync(join(path, '..'), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(project, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, path);
}

export function persistSnapshotFile(dir: string, snapshot: ProjectSnapshot): void {
  const path = renewalPaths(dir).snapshot;
  mkdirSync(join(path, '..'), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, path);
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

export function loadRenewalState(dir: string): RenewalState {
  const p = loadRenewalProject(dir);
  if (!p.ok) throw new Error(p.message);
  const paths = renewalPaths(dir);
  const snap = loadSnapshotFile(dir);
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
