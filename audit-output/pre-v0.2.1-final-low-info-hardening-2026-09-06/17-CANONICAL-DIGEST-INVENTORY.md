# 17 — Canonical Digest Inventory (fresh, at final HEAD)

Freshly enumerated from source at 1e73633 (production only; tests excluded) — matching
the re-audit baseline exactly:

| Class | Count | Note |
|---|---|---|
| DigestDomain union members (canonical.ts) | 7 | SNAPSHOT, STRUCTURE, STATE_TX, CONSENT, AUTHORITY, PAID_CONTEXT, COUNCIL_RUN |
| Production domainDigest call sites | 13 | byte-identical set at origin/main and HEAD (site list = re-audit report 18 §3.1; the program diff adds ZERO digest sites — verified by site-list diff) |
| Blessed structural content hashes (structural.ts) | 3 | unchanged |
| Frozen-spec artifact algorithms (KNOWN_HASH_VERSIONS [1,2]) | 2 | unchanged |
| Non-framing content hashes | ~20 | unchanged set; includes the two single-consumer compact canonicalizations (NF-3) |
| Undeclared authority/identity-framing digests | 0 | architecture ad-hoc-idiom guard green (allowlist canonical.ts/compiler/hash.ts/structural.ts) |

No md5/sha1/hmac in production source. The program's only hash-adjacent change is the
typed REFUSAL wrapper around existing serialization in the I6 block (no new digest, no
payload change). Independent verifier re-derivation: report 21 (V-E).
