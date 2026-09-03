/**
 * Trust Kernel groundwork (S4-M-02) — the PURE project-record leaf.
 *
 * `renew/project/project.ts` is a domain module that imports the trust kernel
 * downward (persist wrappers, active-state re-exports). `trust/state.ts`
 * previously imported project.ts back for the schema and path table, forming
 * the upward `state ↔ project` cycle the Fourth Audit flagged. The schema and
 * the path table are PURE data contracts; they live here where both sides
 * depend on them downward. No trust imports, no fs, no side effects.
 */
import { join } from 'node:path';
import { z } from 'zod';

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
