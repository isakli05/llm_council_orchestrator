import { artifactHashes, legacySectionHash } from './hash';
import { isKnownHashVersion } from '../renew/trust/canonical';
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
 * ACCEPTANCE RULE (INV-H1, hash v2 compatibility). Per stored hash key:
 * a section is VERIFIED when
 *   (1) stored === v2 canonical hash — `sha256(canonicalJson(section))`,
 *       key-order independent — computed over the bundle's section; OR
 *   (2) the manifest does NOT declare `hash_version >= 2` (a freeze made by
 *       a pre-v2 build) AND stored === legacy hash —
 *       `sha256(JSON.stringify(rawSection, null, 2))` — where `rawSection`
 *       is the section AS PARSED FROM ITS FILE (`rawSections[key]`, file key
 *       order preserved). When `rawSections` is not available, the legacy
 *       hash falls back to the bundle's (zod-parsed) section — the
 *       pre-v2 behavior.
 * A key DRIFTS when both applicable checks fail, INCLUDING keys that exist
 * on only one side (a section added or dropped since freeze). When the
 * manifest carries `hash_version >= 2` (strict mode — every new freeze),
 * ONLY the canonical hash applies: the legacy check never rescues a stored
 * v1 hash from a v2-frozen manifest.
 * Why the raw section: v1 hashes were bytes of `JSON.stringify(section,
 * null, 2)` in whatever key order the freezing build's zod produced — which
 * the current build's zod need not reproduce. The file's own key order is
 * the stable witness of what the freezing build saw, so compatibility is
 * judged against it, never against the current zod ordering.
 *
 * `drifted` is sorted for deterministic output; `ok` is `drifted.length === 0`.
 * When the manifest is not frozen the result additionally carries
 * `notFrozen: true` (the drift columns alone would be misleading — a draft
 * manifest records no hashes, and pinned hashes on a draft are not
 * authoritative). This is accidental-drift detection over section content,
 * not tamper evidence: manifest fields and the derived `test_files` ledger
 * are not hashed by design.
 * Deterministic core: no clock, filesystem, or environment access.
 *
 * @param b the (zod-parsed) bundle whose frozen manifest is verified.
 * @param rawSections optional JSON.parse'd sections AS READ FROM DISK
 *        (compileSpecDir's `rawSections`) — file key order preserved; used
 *        only by the legacy compatibility check. Absent => bundle-only
 *        fallback (single-arg call sites keep compiling and behave sanely).
 */
export function verifyFrozen(
  b: SpecBundle,
  rawSections?: Record<string, unknown>,
): VerifyResult {
  const stored = b.manifest.artifact_hashes;
  const recomputed = artifactHashes(b);
  // S3-M-02 (trust kernel): a hash version this build does not implement is
  // a refusal — never a guess that ">= 2 means v2". (zod already rejects
  // unknown literals at parse; this guards direct callers with pre-parsed
  // bundles and keeps verify's contract self-evident.)
  const declaredVersion = b.manifest.hash_version ?? 1;
  if (!isKnownHashVersion(declaredVersion)) {
    return {
      ok: false,
      drifted: [`hash_version:${declaredVersion}`],
      notFrozen: b.manifest.state !== 'frozen' || undefined,
    };
  }
  const strict = declaredVersion >= 2;
  const keys = [...new Set([...Object.keys(recomputed), ...Object.keys(stored)])].sort();
  const drifted = keys.filter((key) => !storedHashAccepted(key));
  const result: VerifyResult = { ok: drifted.length === 0, drifted };
  if (b.manifest.state !== 'frozen') {
    result.notFrozen = true;
  }
  return result;

  /** Acceptance rule per section key (see the block comment above). */
  function storedHashAccepted(key: string): boolean {
    if (stored[key] === recomputed[key]) return true; // (1) v2 canonical
    if (strict) return false; // hash_version >= 2: canonical only
    const raw = rawSections?.[key]; // (2) legacy compat over the raw section
    const section = raw !== undefined ? raw : (b as unknown as Record<string, unknown>)[key];
    return stored[key] === legacySectionHash(section);
  }
}
