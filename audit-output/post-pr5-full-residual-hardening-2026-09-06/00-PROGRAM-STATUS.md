# 00 — Program Status

**Program:** Post-PR5 Full Residual Hardening (pre-v0.2.1 source candidate)
**Status:** IN_PROGRESS (Phase 1 — independent residual reproduction)
**Date opened:** 2026-09-06

## Scope

Resolve every post-PR5 residual recorded by the targeted independent re-audit of
2026-09-06 (`audit-output/post-v0.2.0-medium-residual-targeted-independent-reaudit-2026-09-06/12-RESIDUAL-LEDGER.md`):

- **Low: 7** — RA1(L1), RA2(L2), RB1(L3), RDOC1(L4), RC1(L5), RC3(L6), RF1(L7)
- **Info: 7** — RA1b(I1), RB2(I2), RB3(I3), RB4(I4), RC2(I5), RD1(I6), RD2(I7)

"Resolve" = reproduce/falsify → establish invariant → classify actionability →
minimal safe remediation where justified → test/mutation-prove → final disposition
from the program's allowed disposition vocabulary. Not force-closure regardless of
architectural cost.

## Non-goals / hard boundaries

- v0.2.0 (`e7dedf034e92fc57616124dbdd7fe6ebffda8620`) is immutable history: no
  tag move, no republish, no version change, no `v0.2.1`, no npm publish, no
  GitHub Release, no push, no merge during this program.
- Protected findings S5-H-01, S5-M-01, S5-M-02, S5-M-03, S5-M-04 must remain closed.
- Canonical digest authorities remain exactly `LCO:COUNCIL_RUN v1`, `LCO:PAID_CONTEXT v2`,
  `LCO:CONSENT v1` — no ad-hoc trust digests, no new trust primitive without explicit
  PM review (Audit Council escalation is owner-authorized only).

## Phase ledger

| Phase | State |
|---|---|
| 0 — MAO load + baseline preflight + branch | DONE |
| 1 — Independent residual reproduction (7 parallel read-only investigators) | IN_PROGRESS |
| 2 — Root-cause / authority mapping + plan commit | PENDING |
| 3 — Implementation (Lanes A→B→C→D, sequential on trust boundaries) | PENDING |
| 4 — Cross-residual composition R1–R4 + protected regression + mutation matrix | PENDING |
| 5 — Full gates + MAO independent verifiers | PENDING |
| 6 — Final disposition ledger + targeted re-audit handoff | PENDING |

## Status ceiling

This program may conclude only as `READY_FOR_FULL_RESIDUAL_TARGETED_REAUDIT` or
`NOT_READY_FOR_FULL_RESIDUAL_TARGETED_REAUDIT`. The independent audit verdict
belongs to a fresh auditor, not to this program.
