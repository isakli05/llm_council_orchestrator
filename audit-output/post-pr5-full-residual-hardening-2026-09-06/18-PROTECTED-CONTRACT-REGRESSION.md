# 18 — Protected contract regression (fresh, at implementation HEAD)

Focused run (13 suites — the nine S5-tagged files plus the new pins:
canonical, consent-digest-pin, paid-immutability, paid-context-framing-pin):

**251/251 tests passed.**

## Per-finding explicit checks

- **S5-H-01 (post-commit/stale journal rollback authority)** —
  `transaction-atomicity.test.ts` full fault matrix green, re-verified live
  during L5 investigation on current source: C==B non-superseded → rollback
  authority granted (arm executed); C>B → retire, committed revision + stores
  survive, NEVER rolled back; C<B → fail-closed AHEAD refusal; C unreadable →
  fail-closed join refusal; superseded journals at ALL three relations →
  manual refusal, never auto-rollback (the superseded check precedes the join
  and `superseded` is integrity-covered, so a marker cannot be silently
  un-marked). The new CAS fence cannot re-grant authority: it only preserves
  whatever legitimately occupies the journal path.
- **S5-M-02 (configured headers lost on paid routes)** — `paid.test.ts`
  (24/24 incl. header-ride, retry-path same-headers, header-change ⇒ consent
  invalidation incl. post-freeze tamper), `paid-immutability` (op.routeDigest
  === resolvedRouteDigest(op.route)), `renew-consent-effectual` (MCP-level
  header-only digest differences). `resolvedRouteDigest` is untouched by the
  program; the special-key hardening extends the same materialize-don't-omit
  idiom.
- **S5-M-01 (ContextBundle identity over model-visible bundle content)** —
  `evidence.test.ts` (S5-M-01 describe green, now titled with the bundle
  qualifier), entry join, redactions, node/edge/fact coverage; seal digest
  values byte-unchanged through the I2 reorder (137-test pin sweep) and I4
  memoization (55-test identity sweep).
- **S5-M-03 (no undeclared trust digests)** — domain inventory unchanged: the
  declared DigestDomain set is exactly LCO:SNAPSHOT / AUTHORITY / CONSENT /
  PAID_CONTEXT / STATE_TX / STRUCTURE / COUNCIL_RUN. The program introduced
  NO new digest authority: `routeBinding` is a preimage FIELD of the existing
  LCO:CONSENT v1; `bundleDigestCache` memoizes existing LCO:PAID_CONTEXT
  digests; the entry probe writes no digest. Architecture ad-hoc-digest guard
  green.
- **S5-M-04 (persistent abort-evidence failure disclosure)** — matrix green;
  the retention clause is now pinned for ALL FOUR branches (L7 cells) and the
  disclosure names the evidence path with the pre-existing-object caveat
  (I5). No false durable-evidence claim; no authority broadening.

## Architecture guards

`architecture.test.ts` 19/19 green (incl. the two new post-PR5 guards:
null-proto replacer + seal-site coherence). No existing guard weakened
(diff only adds). `root-invariants.test.ts` 28/28 green (digest ladder
extended with resolved/unresolved/omitted arms).
