# 13 — Fourth-Audit Finding Matrix

Fields: root contract → fix (at the primitive boundary) → committed test
evidence → independent-verifier evidence → status. Allowed statuses:
CLOSED / PARTIAL / OPEN / NOT_REPRODUCIBLE.

## The six Fourth-Audit findings

| Finding | Root contract | Fix | Test | Verifier evidence | Status |
|---|---|---|---|---|---|
| **S4-H-01** partial state commits without revision advancement | the transaction primitive delegated its write set to an untyped consumer callback; atomicity of a multi-store commit was nobody's invariant | journaled typed write-set transaction: `plan()` returns `StateMutationPlan` DATA; the kernel journals the ORIGINAL state of every target, writes in canonical order, bumps the revision LAST, rolls back the performed prefix on failure (typed), retains the journal on rollback failure, recovers deterministically from the first trusted read (never destructive on ambiguity), fences lock+revision before the revision write, and NEVER rolls back over a concurrent commit (superseded-journal protocol) | `transaction-atomicity.test.ts` (26: full fault matrix incl. every write stage, crash states, tampered/unreadable/superseded journals, archive collisions, fence handovers, concurrent-commit interleave, unreadable revision) + state/concurrency/cross-primitive suites | V1 round-1 BROKEN (6 violations) → all fixed → round-2 V1–V5 FIXED, V6 partial (H1/H2/N1c) → round-3 superseded protocol + regressions → round-4 narrow re-verify (see 12 addendum) | **CLOSED** (subject to the round-4 addendum verdict) |
| **S4-H-02** ContextRecord lacks active snapshot/request/slice binding | the resolver's only input was an untyped record list; identity joins were unrepresentable; the stored slice hash was decorative | `sealContextBundle` (the ONLY constructor): records carry project/snapshot/bundle identity; slice hashes RECOMPUTED from server-owned rendered bytes; `bundle_id = domainDigest('LCO:PAID_CONTEXT')` over ordered slice facts + structural epoch; `resolveCitation(activeBundle, claim)` joins project+snapshot+bundle (recomputed digest = membership proof) then T3-1 containment; pipeline joins project AND snapshot at entry | `evidence.test.ts` (21: preserved T3-1 matrix + the full foreign/stale/substitution matrix) + pipeline joins + cross-primitive | V2 CONTRACT HELD (model-reachable surface); the project-join gap fixed + regression | **CLOSED** |
| **S4-H-03** PaidOperation route mutable; route budget not joined to ledger | the operation object was a VIEW of caller-owned mutable state; budget authority was split between route and an independent ledger | `createPaidOperation` deep-clones + deep-freezes its route, derives the digest from that exact frozen value, and CREATES/OWNS the ledger from `route.budget` (external ledger input deleted); transport consumes a private clone with own-property materialization; named CLI/MCP routes construct through the kernel; consent binds the same construction's digest + an equality assertion at the MCP tool; `wireCap` standalone deleted | `paid-immutability.test.ts` (9: post-construction caller mutation matrix, budget-1 second transport refused with zero bytes, wall carry, no reconstruction path, consent≡transport digest equality) + paid.test | V3 round-1 BROKEN (3 holes incl. deterministic consent mismatch) → all fixed → re-verify ALL FIXED → residuals closed (own-prop guards both sides) | **CLOSED** |
| **S4-H-04** StructuralIdentity accepts mutually incoherent manifest/graph pairs | "identity" validated two documents independently; Graphify exposes no cross-document build identity | source-set coherence (graph source_files ⊆ manifest keys) + LCO StructuralBinding (kernel-sealed at build time, integrity = domainDigest('LCO:STRUCTURE')); `requireStructuralIdentity/Graph` demand the bound triple; every graph consumer flows through it (adapter choke point); snapshot records + staleness + the analyze brackets verify the binding; version cross-check against the probed version | `structural-coherence.test.ts` (22: A/A B/B healthy; A/B B/A mixed refused; foreign/tampered/corrupt/missing bindings; same-names-different-bytes; version joins; adapter consumer gates; source-set drift) + intel suites | V4 round-1 BROKEN (narrowly — the freshness bracket) → fixed → re-verify DEFECT FIXED | **CLOSED** |
| **S4-M-01** 8 trust-bearing bypass consumers | the kernel was an API surface, not an exclusive boundary | all 8 closed + 5 fresh-inventory deviations (B1 raw approval reader, B2 adapter read channel, B3 ad-hoc context digest, B4 ad-hoc fingerprints, B5 CLI split ledger) + guard rule per class | `architecture.test.ts` (16 rules) + consumer suites; fresh inventories: audit 50 → PM 52 → verifier 60 (grouping granularity) — all agree **unmediated = 0** | V5 Claims A/B/C HELD; prior fixes confirmed in source | **CLOSED** |
| **S4-M-02** dependency direction + CanonicalDigest ownership false in source | `trust/state ↔ project` cycle; snapshot/consent digests ad hoc; claimed domains decorative | pure `renew/core/*` record leaves break the cycle; `LCO:SNAPSHOT` snapshot identity; ALL consent digests + fingerprints `LCO:CONSENT`; `LCO:PAID_CONTEXT` (bundle + context digest); `LCO:STATE_TX` (journal incl. holder + superseded marker); `LCO:STRUCTURE` (binding); import-graph guards (upward-import ban, cycle walk incl. require/import(), ad-hoc digest idiom ban) | `architecture.test.ts` + canonical/compiler suites + frozen fixture (verify OK, mutation fails, unknown versions refuse) | V5 Claim B/C HELD (own census: zero upward imports incl. transitive, trust/state cycle-free) | **CLOSED** |

## Reopened prior Critical/High classes (Fourth-Audit report 14)

| Prior finding | Status under this closure |
|---|---|
| C-03 foreign/unbound context provenance | **CLOSED BY PRIMITIVE** (sealed bundles + all joins; V2) |
| C-05 partial state transition/revision | **CLOSED BY PRIMITIVE** (journaled write-set + fence + superseded protocol; V1) |
| H-05 budget identity | **CLOSED BY PRIMITIVE** (owned ledger; V3) |
| H-10 resolved/consented operation unity | **CLOSED BY PRIMITIVE** (immutable op + digest equality assertion; V3/V6) |
| H-11 structural coherence | **CLOSED BY PRIMITIVE** (binding + coherence gates; V4) |
| S3-H-03 versioned transaction | **CLOSED** (S4-H-01 closure) |
| S3-H-06 one-ledger accounting | **CLOSED** (owned ledger + B5 unification) |
| S3-H-07 resolved route binding | **CLOSED** (frozen snapshot digest) |

All previously-HELD primitives (FilesystemCapability, AuthorityGrant,
semantic-support behavior, target immutability, wire cap, redaction,
frozen-spec compatibility, export/status truth) re-verified green in the full
suite and packed smoke.
