# 01 — Baseline

## Verified repository state (program start, 2026-09-03)

| Item | Value |
|---|---|
| branch at start | `fix/legacy-renewal-v1-second-audit-blockers` |
| audited HEAD | `7e7d71f8f45a57475f2cda4a9eac8b60a3b34a1f` — exact match to the third audit's evaluated HEAD |
| remediation base | `fix/legacy-renewal-v1-release-blockers` @ `40e6b1bfe15bc471d7ef09da5f3524fcd2312773` |
| working tree | clean tracked; user-owned untracked audit dirs preserved untouched |
| program branch | `fix/legacy-renewal-v1-trust-kernel-remediation` created FROM the audited HEAD (no overwrite — it did not exist) |
| tools | node v24.14.0 · pnpm 10.17.1 · claude 2.1.258 · graphify 0.9.50 (installed) |
| graphify-out | built at `0f74f3c2` — only docs commits between it and HEAD (the same freshness posture the third audit recorded); refreshed by the repo hook during the program |

## Freshly reproduced baseline gates (on the audited HEAD)

| Gate | Result |
|---|---|
| `pnpm --filter ./packages/spec-core build` | PASS |
| `pnpm --filter ./packages/spec-core lint` | PASS |
| `pnpm --filter ./packages/spec-core test` | PASS — 153 files / 2,193 tests |
| `pnpm --filter ./packages/spec-core test:coverage` | PASS — statements 93.89 / branches 89.38 / functions 96.61 / lines 93.89 (thresholds 91/89/96/91; branch % varies ±0.02 across runs — the third audit recorded 89.40, same passing gate) |
| schema freshness (`git diff --exit-code -- generated/spec-schema.json`) | PASS |

Historical values (2,193 / 93.89-89.40-96.61-93.89) were re-reproduced before any change was made; no historical number was trusted untested.

## Stage-1 mapping (input to the plan)

Four bounded read-only mapping agents inventoried every trust-bearing consumer with file:line evidence (the plan §7 records the full tables): nine independent atomic-write implementations; two lock sites for the entire renewal mutation surface (init/refresh/plan-strategy/approval/analysis writes lockless); `state.json` bumped at three sites with zero production readers; trusted reads following symlinks at dynamic descendants; consent digests binding names before resolution on three routes; two/disconnected/none ledger topologies; the anchor verifier's whole-file range plausibility; and one neighboring variant beyond the audit list (the interactive-clarify orphaned transport ledger).
