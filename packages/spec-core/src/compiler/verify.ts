import { artifactHashes } from './hash';
import type { SpecBundle } from '../schemas';

export interface VerifyResult {
  ok: boolean;
  drifted: string[];
}

/**
 * Verify a frozen bundle against its own manifest: recompute the per-section
 * artifact hashes and compare them with `manifest.artifact_hashes`.
 *
 * A key drifts when the stored and recomputed values differ, INCLUDING keys
 * that exist on only one side (a section added or dropped since freeze).
 * `drifted` is sorted for deterministic output; `ok` is `drifted.length === 0`.
 * Deterministic core: no clock, filesystem, or environment access.
 */
export function verifyFrozen(b: SpecBundle): VerifyResult {
  const stored = b.manifest.artifact_hashes;
  const recomputed = artifactHashes(b);
  const keys = [...new Set([...Object.keys(recomputed), ...Object.keys(stored)])].sort();
  const drifted = keys.filter((key) => stored[key] !== recomputed[key]);
  return { ok: drifted.length === 0, drifted };
}
