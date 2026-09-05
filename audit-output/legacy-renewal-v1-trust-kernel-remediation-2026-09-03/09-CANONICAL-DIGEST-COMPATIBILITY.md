# 09 — CanonicalDigest and Compatibility

## One implementation

`trust/canonical.ts` owns `sha256Content` and `canonicalJson` (recursively key-sorted JSON, array order preserved, 2-space indent — byte-identical to the historical algorithm; `compiler/hash.ts` imports + re-exports for API stability). `domainDigest(domain, version, payload)` prefixes the domain tag (`LCO:SNAPSHOT | LCO:AUTHORITY | LCO:CONSENT | LCO:PAID_CONTEXT | LCO:STATE_TX`) and schema version into the hashed canonical bytes — digests for different purposes are never ambiguously interchangeable, and each domain owns its own payload schema. Unknown versions fail closed everywhere (`isKnownHashVersion`).

## S3-M-02 — future hash versions refuse

`ManifestSchema.hash_version` is `z.union([z.literal(1), z.literal(2)])` — an artifact declaring v3 is corrupt ON ITS FACE (schema parse), and `verifyFrozen` independently refuses unknown declared versions with a `hash_version:N` drift entry (guards direct callers with pre-parsed bundles). The prior `>= 2` treated every future version as canonical-v2, interpreting algorithms this compiler never implemented.

## Frozen-spec compatibility (locked product promise)

- v2 freeze bytes are UNCHANGED (same canonical algorithm, one implementation).
- Pre-v2 verification keeps the legacy rule: stored hash over the RAW file-order section (`rawSections`) when the manifest does not declare v2. The committed immutable fixture (S3-L-04) proves it continuously:

```
npx vitest run src/compiler/hash-compat.test.ts
  ✓ the genuine pre-Renewal artifact verifies unchanged (v1 legacy bytes, file key order)
  ✓ a one-value semantic mutation of the fixture DRIFTS
```

- Approval digest v3 is NOT artifact compatibility: renewal approvals are pre-release development state; v2 records fail closed with a re-approve instruction (identical to the v1→v2 policy). Consent digests changed shape (route digest, resolved-profile fingerprint, effectual dir) — consent is computed fresh per session; no stored-consent compatibility exists by design.

## Verification

`npx vitest run src/renew/trust/canonical.test.ts`: key-order irrelevance, array-order semantics, byte-stability for the frozen-spec shape, domain/version separation (same payload different domain/version ⇒ different digest; identical resolution ⇒ identical digest), known-version truth table (1,2 true; 3,99 false).
