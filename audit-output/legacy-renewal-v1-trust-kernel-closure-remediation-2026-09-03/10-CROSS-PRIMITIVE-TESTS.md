# 10 — Cross-Primitive Tests

The required composition set, with the committed coverage for each (final
HEAD, all green):

## 1. StateTransaction + FilesystemCapability

A failed multi-store commit cannot leave trusted partial state — including
across process death. All journal writes/restores flow through
`authorizedWrite`/`authorizedRemoveTree`/`authorizedRenameNoClobber`.
Committed: `trust/transaction-atomicity.test.ts` (all 15 — every injected
failure byte-compares every trusted file); symlinked-slot refusal preserved
in `trust/composition.test.ts` (Composition A).

## 2. StateTransaction + AuthorityGrant

A transaction failure cannot cause a newer human ruling to disappear under an
old revision. Committed: `trust/cross-primitive-closure.test.ts` — approval
folded + committed, then a failing tx (injected second-store failure) rolls
back byte-identically at the SAME revision with the ruling intact and
`human_confirmed` still set. (Preserved: concurrency analyze↔review — a human
ruling made mid-paid-call survives the fold.)

## 3. StateTransaction + EvidenceCitation

A citation from an old state epoch cannot be committed into current analysis
after refresh. Committed: `cross-primitive-closure.test.ts` (post-refresh
analysis refuses the pre-refresh sealed bundle at the pipeline snapshot join,
before anything paid) + preserved `composition.test.ts`/`concurrency.test.ts`
(refresh during paid call → `snapshot_superseded`/blocked-stale; promotion
refused; nothing written).

## 4. EvidenceCitation + AuthorityGrant

A foreign ContextRecord cannot satisfy a destructive or load-bearing approval
path. Committed: preserved Composition B (unvalidated provenance cannot
become destructive authority) + the S4-H-02 foreign/stale matrix (every
substitution refuses at the resolver, so no anchor exists to carry into any
approval).

## 5. PaidOperation + Consent

The exact consented immutable operation is the exact transported operation.
Committed: `paid-immutability.test.ts` (digest IS over the frozen route; no
reconstruction path) + MCP consent suites (named consent binds the same
construction's routeDigest as the transported operation; legacy unchanged) +
`consent.test.ts` field-matrix (preserved).

## 6. PaidOperation + StateTransaction

A paid response cannot promote after incompatible revision/snapshot
movement. Committed: preserved Composition D + concurrency refresh↔analyze
(promotion refused as superseded; new epoch untouched; spend recorded in the
immutable record only).

## 7. StructuralIdentity + PaidOperation

Mismatched Graphify artifacts fail BEFORE paid transport. Committed:
`cross-primitive-closure.test.ts` — a foreign graph swapped into the
workspace makes analyze refuse at the staleness gate with ZERO transport
calls (a counting adapter that must never fire).

## 8. StructuralIdentity + EvidenceCitation

A ContextRecord cannot reference structural identity from a foreign Graphify
build. Committed: `cross-primitive-closure.test.ts` — a sealed bundle's
structural identity laundered under a different epoch's structural digests
fails the bundle-digest recompute; the honest epoch-A bundle resolves only
under its own identity.

## Committed composition suites

- `trust/composition.test.ts` (A–G, preserved third-audit set — 7/7 green)
- `trust/cross-primitive-closure.test.ts` (4 closure compositions)
- `mcp/consent.test.ts` + `mcp/server.test.ts` (consent↔operation joins)
- `trust/concurrency.test.ts` (deterministic interleavings: analyze↔analyze,
  analyze↔review, refresh↔analyze, plan↔update, lock contention)
- Fresh verifier agents (V6) additionally attacked sequences the committed
  tests miss — results in `12-MAO-VERIFIER-RESULTS.md`.
