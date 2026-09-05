# 05 — Persistence & Transactions (TRACK D)

**C-06 CLOSED · D2 CLOSED · M-02/M-03 CLOSED · M-07 (renew stores) CLOSED** (commits `a862dc9`, `8e850ee`)

- Typed loads: `overlay_missing|overlay_corrupt` / `parity_missing|parity_corrupt` (ENOENT ≠ corrupt). Missing keeps domain init semantics (first-init empties only); existing+corrupt always stops the operation — the audit's sentinel-loss reproduction now refuses with the file preserved byte-identical (test-proven).
- Duplicate semantics: duplicate overlay record ids and duplicate ACTIVE (relation, subject-path) pairs are corrupt; duplicate parity ids and contradictory non-unresolved rulings for the same behavior are corrupt (documented, deterministic — no silent last-write-wins).
- Versioned formats: all renew stores carry `schema_version: 1`; the snapshot schema gained `graph_digest` as a REQUIRED field — pre-remediation snapshots fail schema → corrupt → refresh required (fail-closed dev-state migration; documented).
- Transactions: the two multi-file folds (analyze: overlay+parity; review: parity+strategy) run under the per-project renewal lock with per-file atomic tmp+rename; a crash between renames leaves the pre-transaction file intact and the lock stale-breaks.

Tests: coverage-hardening (loaders/duplicates/sentinels), isolation, clarify-trust, planner-trust.
