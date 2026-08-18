import { artifactHashes } from './hash';
import type { SpecBundle } from '../schemas';

export interface VerifyResult {
  ok: boolean;
  drifted: string[];
  /** True when `manifest.state !== 'frozen'` — verify targets frozen bundles,
   * and only a frozen manifest pins authoritative hashes. Absent (undefined)
   * for frozen bundles. */
  notFrozen?: boolean;
}

/**
 * Verify a frozen bundle against its own manifest: recompute the per-section
 * artifact hashes and compare them with `manifest.artifact_hashes`.
 *
 * A key drifts when the stored and recomputed values differ, INCLUDING keys
 * that exist on only one side (a section added or dropped since freeze).
 * `drifted` is sorted for deterministic output; `ok` is `drifted.length === 0`.
 * When the manifest is not frozen the result additionally carries
 * `notFrozen: true` (the drift columns alone would be misleading — a draft
 * manifest records no hashes, and pinned hashes on a draft are not
 * authoritative). This is accidental-drift detection over section content,
 * not tamper evidence: manifest fields and the derived `test_files` ledger
 * are not hashed by design.
 * Deterministic core: no clock, filesystem, or environment access.
 */
export function verifyFrozen(b: SpecBundle): VerifyResult {
  const stored = b.manifest.artifact_hashes;
  const recomputed = artifactHashes(b);
  const keys = [...new Set([...Object.keys(recomputed), ...Object.keys(stored)])].sort();
  const drifted = keys.filter((key) => stored[key] !== recomputed[key]);
  const result: VerifyResult = { ok: drifted.length === 0, drifted };
  if (b.manifest.state !== 'frozen') {
    result.notFrozen = true;
  }
  return result;
}
