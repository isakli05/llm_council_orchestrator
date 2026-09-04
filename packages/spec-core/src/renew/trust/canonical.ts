import { createHash } from 'node:crypto';

/**
 * Trust Kernel — canonical serialization and domain-separated digests.
 *
 * THE one implementation of canonical JSON for the whole product
 * (third-audit remediation: previously `compiler/hash.ts` held it for frozen
 * specs while approval/consent paths each rolled ad-hoc
 * `JSON.stringify(partial)` digest payloads — the S3-C-04 "omitted scope"
 * shape). `compiler/hash.ts` re-exports from here; frozen-spec artifact
 * hashing keeps its exact historical BYTES (same algorithm, unchanged), so
 * every existing frozen spec still verifies.
 *
 * Domain separation: a digest is only meaningful within one trust domain and
 * schema version. `domainDigest('LCO:AUTHORITY', 3, payload)` prefixes the
 * domain tag and version into the hashed material, so a snapshot digest can
 * never be reinterpreted as an authority/consent/context digest (and a v2
 * payload can never verify against a v3 verifier).
 *
 * Future versions fail closed (S3-M-02): only implemented hash/artifact
 * versions validate; an unknown `hash_version: 3` is a refusal, never a
 * guess that ">= 2 means v2".
 */

/**
 * `sha256:<64 lowercase hex>` of the UTF-8 bytes of `content`.
 * Byte-exact contract: hex(sha256(content)) with no extra framing.
 */
export function sha256Content(content: string): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`;
}

/**
 * Canonical JSON serialization: every object's keys are sorted
 * lexicographically — recursively — while arrays keep their element order
 * and the whole value is pretty-printed with a 2-space indent. Two JSON
 * values that differ ONLY in object key order serialize to the exact same
 * bytes. Sorting is the only transformation: values, nesting, and array
 * order are untouched. (Byte-identical to the historical algorithm frozen
 * specs already carry — artifact_hashes pin exactly these bytes.)
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

/** The trust domains that own digests (each defines its own payload schema).
 *  S4-M-02 closure: EVERY domain listed here is actually used by its owning
 *  primitive — snapshot identity (snapshot-record), authority v3, all consent
 *  digests (MCP check/generate + renewal route + final renew consent), the
 *  paid context bundle identity, the state-transaction journal integrity, and
 *  the LCO StructuralBinding (S4-H-04). No decorative domains.
 *
 *  S5-M-03 (Fifth Audit): the canonical layer owns the COMPLETE inventory of
 *  identity-framing digests — the honest claim is "zero UNDECLARED ad-hoc
 *  trust digests": every persisted digest that frames structured identity is
 *  a domainDigest over a declared domain/version here, except the explicitly
 *  owned structural document content hashes (`trust/structural.ts`, blessed
 *  in the closure plan) and byte-exact content hashes that carry no identity
 *  framing (e.g. evidence `hash: sha256Content(text)`). */
export type DigestDomain =
  | 'LCO:SNAPSHOT'
  | 'LCO:AUTHORITY'
  | 'LCO:CONSENT'
  | 'LCO:PAID_CONTEXT'
  | 'LCO:STATE_TX'
  | 'LCO:STRUCTURE'
  /** v1 — planner `council_run.config_fingerprint`: the persisted identity of
   *  the planning configuration (snapshot id + selected strategy + parity
   *  record-id set) inside the planned SpecBundle's manifest. */
  | 'LCO:COUNCIL_RUN';

/**
 * A domain-separated digest over the CANONICAL form of `payload`:
 * `sha256(canonicalJson({ d: domain, v: version, p: payload }))`. The domain
 * tag and schema version are part of the hashed bytes, so identical payloads
 * under different domains/versions produce different digests, and a digest
 * from one domain can never satisfy a check in another.
 */
export function domainDigest(
  domain: DigestDomain,
  version: number,
  payload: unknown,
): `sha256:${string}` {
  return sha256Content(canonicalJson({ d: domain, v: version, p: payload }));
}

// --- Known artifact hash versions (S3-M-02: future versions fail closed) ---------------

/**
 * Every hash algorithm this build implements for frozen-spec manifests.
 * `verifyFrozen` accepts a manifest hash ONLY at one of these versions;
 * v1 = legacy key-order hash (compat verification), v2 = canonical hash
 * (what freeze stamps). An artifact declaring an unknown future version
 * (3, 4, ...) is REFUSED — this compiler never interprets an algorithm it
 * did not implement.
 */
export const KNOWN_HASH_VERSIONS: readonly number[] = [1, 2];

/** True only for versions this build actually implements. */
export function isKnownHashVersion(version: number): boolean {
  return KNOWN_HASH_VERSIONS.includes(version);
}

/** The canonical (key-sorted) hash algorithm's version stamp. */
export const CANONICAL_HASH_VERSION = 2;
