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
 * Canonical JSON serialization (INV-H1, hash v2): every object's keys are
 * sorted lexicographically — recursively — while arrays keep their element
 * order and the whole value is pretty-printed with a 2-space indent. Two
 * JSON values that differ ONLY in object key order serialize to the exact
 * same bytes, so their hashes are equal. Sorting is the only transformation:
 * values, nesting, and array order are untouched.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, canonicalReplacer, 2);
}

/** Replacer that hands the serializer a key-sorted clone of every object. */
function canonicalReplacer(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const src = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort()) {
      sorted[key] = src[key];
    }
    return sorted;
  }
  return value;
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
