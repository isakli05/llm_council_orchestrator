import { createHash } from 'node:crypto';
import type { SpecBundle } from '../schemas';

/**
 * `sha256:<64 lowercase hex>` of the UTF-8 bytes of `content`.
 * Byte-exact contract: hex(sha256(content)) with no extra framing.
 */
export function sha256Content(content: string): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`;
}

/**
 * Sections whose hashes are recorded in `manifest.artifact_hashes`.
 * `manifest` is excluded (the hashes are written into it), and so is the
 * derived `test_files` ledger.
 */
const HASHED_SECTIONS = [
  'intent',
  'glossary',
  'assumptions',
  'evidence',
  'requirements',
  'decisions',
  'contracts',
  'tasks',
] as const;

/**
 * Deterministic per-section hashes: each value is
 * `sha256Content(JSON.stringify(section, null, 2))`.
 * Keys: the eight hashed sections above, plus `legacy` when present.
 */
export function artifactHashes(b: SpecBundle): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const key of HASHED_SECTIONS) {
    hashes[key] = sha256Content(JSON.stringify(b[key], null, 2));
  }
  if (b.legacy !== undefined) {
    hashes.legacy = sha256Content(JSON.stringify(b.legacy, null, 2));
  }
  return hashes;
}
