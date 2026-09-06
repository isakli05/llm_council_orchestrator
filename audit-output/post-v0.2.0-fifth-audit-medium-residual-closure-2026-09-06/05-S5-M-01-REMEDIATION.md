# 05 — S5-M-01 Remediation

Fix commit `d682533`; tests `45912c0`. Within the existing CanonicalDigest architecture — no second ad-hoc digest; S5-M-03 not reopened.

## Design answers (Q1–Q6)

- **Q1 canonical identity domain**: the ENTIRE ContextBundle item list (every kind, ordered) + the slice records + project/snapshot/structural identity — under the SAME domain `LCO:PAID_CONTEXT` with version **2** (one domain, one version, one payload schema; this also retires the deferred S5-INFO-01 dual-schema state).
- **Q2 load-bearing fields**: all item kinds' fields — file_slice (path/range/text/content_hash/redactions + metadata), node (id/label/source_file/source_location/community/provenance), edge (source/target/relation/confidence/provenance), structural_fact (text/node_id/provenance) — and item ordering.
- **Q3 ordering/normalization/metadata**: item ORDER is semantic (arrays keep order in canonical JSON — reordering changes identity, tested); object key order is normalized by canonicalization (key-order-only differences → identity STABLE: the documented safe equivalence, tested); whitespace never enters (canonical representation, not raw bytes); item metadata (redactions etc.) IS covered; bundle-level admin metadata is not (Q4).
- **Q4 intentional exclusions**: `req.scope` and `nowIso` — request framing rendered around the bundle, not bundle content; recorded per-request in the analysis record (`scope`, `created_at`). Non-rendered bundle admin metadata (`truncated`, `total_chars`, `warnings`) — persisted as plain record fields; identity covers more than nothing there by design, and the exclusion is tested/documented.
- **Q5**: identity covers semantic content via the canonical representation (`domainDigest` canonical JSON) — not raw serialized bytes.
- **Q6 compatibility**: `bundle_id`/`SealedContext` are in-memory only (never persisted whole — verified); persisted `AnalysisRecord.input.context_digest` is format-validated only and never recomputed (schemas.ts) → the v1→v2 bump costs only forensic comparability of old records, no runtime breakage; repo fixtures embed no `LCO:PAID_CONTEXT` values (verified by grep). The version bump is the fail-closed marker per the S3-M-02 domain-version contract.

## Production changes

- `evidence.ts`: `sealContextBundle` **requires** `items` (compile-time fail-closed — 32 call sites surfaced and were modernized); `bundleDigestPayload` includes the cloned items; `SealedContext` carries the frozen items; `contextBundleDigest` recomputes over records AND items; `ContextBundleIdentity.schema_version: 2`.
- `recovery/pipeline.ts`: entry join — `canonicalJson(req.bundle.items) !== canonicalJson(deps.context.items)` → typed `context_bundle_mismatch` refusal BEFORE anything paid (the rendered payload must be the identity-bound payload); `input.context_digest` := `deps.context.identity.bundle_id` (the verified identity; metadata fields remain as plain record fields).
- `cli/commands/renew.ts`: production seal site passes `items: bundle.items`.

## Required invariant — proven by tests

Any supported mutation to a model-visible load-bearing field ⇒ `bundle_id`
changes: mutation matrix (node label/id/optional-field-addition, edge addition,
fact text ×2, file_slice text, file_slice redactions, item ORDER, item removal —
10 arms) all change the id; key-order-only shuffling keeps it stable; membership
proofs recompute for both seals of the differing pair.

## Mutation sensitivity (disposable worktree, revert `d682533`)

**3 tests fail**: the closure test (ids no longer differ), the mutation matrix
(mutations no longer move the id), the entry-join refusal (divergence no longer
refused). The normalization test and the positive-join test pass under mutation
by design (vacuous when items don't affect identity) — documented limitation of
those two cells.
