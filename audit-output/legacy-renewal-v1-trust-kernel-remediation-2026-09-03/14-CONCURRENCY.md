# 14 — Concurrency Contract

`npx vitest run src/renew/trust/concurrency.test.ts` (4) + the kernel-level rows in `trust/state.test.ts` (9). Deterministic interleavings only — the scripted LLM's `complete()` blocks on a promise gate released at the chosen interleaving point; the provider seam arms one-shot mutations inside the plan's work phase; no sleep-based races anywhere.

## Scenarios and asserted properties

| interleaving | assertion | result |
|---|---|---|
| analyze (gated paid call) ↔ review (human rules mid-call) | BOTH effects land: the fold is additive onto fresh state, the human `preserve` ruling and `human_confirmed` support SURVIVE (no silent lost update in either direction) | PASS |
| plan ↔ trusted human-side mutation mid-planning | plan refuses typed (`changed during planning`), NOTHING written (no `spec/`, no `strategy.json`); the human-side mutation STANDS (revision +1) | PASS |
| refresh (real new epoch) ↔ in-flight gated analysis | the pre-refresh read view's promotion refuses; the new epoch's parity store stays EMPTY (no cross-epoch fold) | PASS |
| two concurrent writer-lock holders | the second is lock-refused immediately (`LockHeldError`) — never a wait, never a merge, never an overwrite | PASS |
| kernel: strict commit vs mid-work revision bump | `stale_revision`, no commit | PASS |
| kernel: genuine refresh inside a transaction's work | `snapshot_superseded` | PASS |
| kernel: additive fold over a concurrent store write | folds onto FRESH state; revision lands +2 (both mutations counted) | PASS |
| same-epoch double supersession | `archive_collision` — history never overwritten | PASS |

## Policy summary (explicit, never last-write-wins)

- analyze/review folds: **additive, dedup-keyed, behavior-idempotent** onto fresh locked state; existing rulings and newer human decisions are never mutated.
- plan/refresh commits: **strict** — any revision or snapshot drift since the read view is a typed conflict; nothing is written.
- unsupported combinations (two simultaneous interactive reviews): **lock-refused** — an explicit error, never a silent merge.
