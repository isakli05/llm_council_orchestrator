import type { SpecBundle } from '../schemas';
// The canonical serialization/digest primitives live in the Trust Kernel
// (src/renew/trust/canonical.ts) — ONE implementation product-wide. The
// historical artifact-hash BYTES are unchanged (same algorithm); the import
// + re-export keep every existing import stable.
import { canonicalJson, sha256Content } from '../renew/trust/canonical';
export { sha256Content, canonicalJson };

/**
 * `sha256:<64 lowercase hex>` of the UTF-8 bytes of `content` — see the
 * re-export above (Trust Kernel canonical module) for the implementation.
 * Documented here for readers of the artifact-hash contract.
 */

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

/** Hash ONE section the v2 way: over its canonical (key-sorted) form. */
function canonicalSectionHash(section: unknown): `sha256:${string}` {
  return sha256Content(canonicalJson(section));
}

/**
 * Deterministic per-section hashes (v2, INV-H1): each value is
 * `sha256Content(canonicalJson(section))` — key-order independent forever.
 * A section hash survives any zod/serializer key-ordering change because the
 * bytes hashed are fully determined by the section's semantic content.
 * Keys: the eight hashed sections above, plus `legacy` when present.
 */
export function artifactHashes(b: SpecBundle): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const key of HASHED_SECTIONS) {
    hashes[key] = canonicalSectionHash(b[key]);
  }
  if (b.legacy !== undefined) {
    hashes.legacy = canonicalSectionHash(b.legacy);
  }
  return hashes;
}

/**
 * Hash ONE section the v1 (pre-canonical) way:
 * `sha256Content(JSON.stringify(section, null, 2))`. KEY-ORDER DEPENDENT —
 * the bytes depend on whatever order the in-memory object carries (zod
 * output order, or the file's order for a raw JSON.parse'd section).
 * Kept exclusively for compatibility verification of specs frozen by
 * pre-v2 builds (see verifyFrozen's acceptance rule).
 */
export function legacySectionHash(section: unknown): `sha256:${string}` {
  return sha256Content(JSON.stringify(section, null, 2));
}

/**
 * The v1 artifact hash map (compat only): `legacySectionHash` over each
 * section of the bundle AS GIVEN. Never used to freeze anymore — freeze
 * stamps v2 canonical hashes and `manifest.hash_version: 2`.
 */
export function legacyArtifactHashes(b: SpecBundle): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const key of HASHED_SECTIONS) {
    hashes[key] = legacySectionHash(b[key]);
  }
  if (b.legacy !== undefined) {
    hashes.legacy = legacySectionHash(b.legacy);
  }
  return hashes;
}
