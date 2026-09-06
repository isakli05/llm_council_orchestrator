# 10 — Protected Trust Regression

At implementation HEAD `f088997` (full suite green: 191 files / 2622 tests).

## S5-H-01 — re-proven CLOSED

- `git diff e7dedf0..HEAD -- packages/spec-core/src/renew/trust/state.ts`: ONLY abort-catch disclosure plumbing + the two marker-return helpers changed; `recoverTxJournal`, the C==B/C>B/C<B/unreadable/superseded joins, `removeJournal` ownership conditioning, and foreign-journal no-clobber are untouched.
- S5-H-01 crash-window regression arms (transaction-atomicity.test.ts): committed-transaction journal (base = current−1) never rolls back; replayed older journal; base-ahead journal fails closed; Case-B retire failure typed + retry heals; unreadable revision fails closed during the join; tampered journal refused before the join; E2E commit → death-before-cleanup → healthy R+1 → strict R+2 — all green (part of the 49-test file run).
- Protected semantics re-stated: C==B interrupted-tx rollback authority intact; C>B never rolls back committed human authority; C<B fails closed; unreadable fails closed; stale/completed journal cannot regain rollback authority.

## S5-M-03 — re-proven CLOSED

- `LCO:COUNCIL_RUN` v1 untouched (renew/planner/plan.ts config_fingerprint; canonical.ts domain registry).
- No ad-hoc trust digest introduced: `LCO:PAID_CONTEXT` moved v1→v2 *within* `domainDigest`, and the fix REMOVED a schema-violating second use (pipeline's whole-bundle payload under the same domain+version) — the one-domain-one-version-one-schema contract now holds strictly (the dual-schema state was the deferred S5-INFO-01, now retired).
- Architecture guard suite green (`src/renew/trust/architecture.test.ts`): kernel-only transport construction; no `buildRoleAdapter` on renewal surfaces; no raw trust-store bypass; no direct fs write bypass; no transport constructor bypass.

## Named protected contracts (spot-verified green in the full suite)

FilesystemCapability (fs tests + trust fs-coverage); RenewalStateTransaction
(transaction-atomicity 49 tests + state tests); EvidenceCitation
(evidence.test 26 tests incl. the preserved T3-1 matrix); AuthorityGrant
(authority tests + Composition B); ResolvedPaidOperation (paid + paid-immutability
+ Composition F); StructuralIdentity (structural tests + Composition E + closure
suite); CanonicalDigest (canonical tests + domain-version contract); MCP
effectual consent (156 mcp/server tests — digest-equality gate now includes
headers on both computation sides); semantic-support policy (assertSupportPolicy
arms); active/historical state separation (Composition G + state views);
frozen-spec compatibility (good-fixture-gate + fixtures untouched —
`git diff e7dedf0..HEAD -- packages/spec-core/fixtures/` is empty).
