# 15 — E2E and Regression

## Phase 9 — full deterministic journey (`trust/journey.test.ts`, 2 tests, zero paid calls)

init → analyze (scripted citations of the advertised CTX windows, interior narrows) → review (headless: UNC informational answer, canonical PAR rulings, workspace strategy STG-0001) → plan --freeze (workspace strategy authority verified) → export → status → **refresh** (real content change; overlay/parity/strategy AND spec archived under the old snapshot id, no-clobber) → re-analyze on the new epoch → status (1 active / 2 total — the history split) → export ("Historical analyses (prior snapshots — NOT current state)", lineage ids labeled).

Verified across the whole journey:

- **target byte identity** — full-tree inventory (per-file sha256, nlink, mode, symlink presence) equal before/after every phase, except the deliberate drift write the test itself makes to force the refresh;
- **active/historical lineage** — post-refresh active analyses empty, history retained and labeled;
- **status/export truth** — parity counts, strategy (approval-bound workspace selection), spec presence;
- **authority lineage** — the folded approval is the session's own APPR record, validated with active scope;
- **citation semantics** — honest interior citations promote; the T3-1 companion test (claim strictly outside the supplied window) rejects the hypothesis and promotes NOTHING (parity empty).

The original `renew/e2e.test.ts` (init→analyze→review→plan--freeze→export + staleness refusal + target immutability) runs reconciled to the citation contract in the same suites.

## Phase 11 — paid boundary with a recording transport (`trust/paid.test.ts`)

The scripted transport records the EXACT serialized payload per fetch: consent/route resolves first (digest binds the route), one ledger attached, every repository-derived field sanitized (egress projection incl. node/edge identities), the complete request serialized and measured at the transport's single serialization point, admitted/refused at the 1 MB wire cap (below/at/above; retry re-capped through the same adapter), transport attempted only after admission (zero calls on refusal), usage accounted (single-charge), outputs scrubbed before persistence (`scrub()`), state revalidated before promotion (`recheckFreshness`), promotion only through the state transaction (journey + concurrency suites).

## Phase 17 — lco-spec regression (final-gates run)

The full existing behavior for compile/lint/freeze/verify/change/trace/plan/init/check/generate/doctor/clarification workspace/lco-mcp runs in the ordinary suite (compiler, cli, mcp, eval, clarify, browser suites — 160+ files); the pre-Renewal frozen-spec compatibility contract is continuously verified against the COMMITTED immutable fixture (unchanged → PASS; one-value semantic mutation → FAIL). Final exact counts are recorded in 00-REMEDIATION-STATUS.md at program end.
