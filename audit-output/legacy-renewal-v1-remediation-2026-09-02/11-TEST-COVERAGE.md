# 11 — Test Coverage (H-01 status: CLOSED)

## Gate command

```bash
pnpm --filter ./packages/spec-core test:coverage
```

## Final result (exit 0 — thresholds UNCHANGED)

| Metric | Before (audit) | Before this task | AFTER | Threshold | Result |
|---|---:|---:|---:|---:|---|
| statements | 91.81% | 92.16% | **93.64%** | 91% | pass |
| lines | 91.81% | 92.16% | **93.64%** | 91% | pass |
| branches | 85.98% | 86.56% | **89.17–89.19%** (3 runs) | 89% | **pass** |
| functions | 94.28% | 95.12% | **96.08%** | 96% | **pass** |

Stability: three consecutive full coverage runs stayed ≥ 89.17% branches
and exactly 96.08% functions. Thresholds/config untouched (diff-verifiable:
`git diff 4ab1eed..HEAD -- packages/spec-core/vitest.config.ts` is empty);
no ignore directives added anywhere.

## Tests

1956 → **2053** (+97, 8 new files): every one asserts a documented
refusal code, state shape, containment behavior, or timing bound — no
line-touching filler.

## How the gap closed (by pool)

| Pool | Closed by |
|---|---|
| `renew review --interactive` (largest) | `review-interactive.test.ts` — REAL command core + REAL loopback workspace, HTTP-driven (round/apply + approve + cancel); openBrowser is the only seam |
| renew.ts command arms | `renew-branches.test.ts` + `renew-richstate.test.ts` — status over rich state, analyze/plan/review/export refusal arms, sabotage (probe/graph/lock/mid-call) |
| CLI boundary wiring | `runcli-renew.test.ts` — in-process `runCli` (caps closures: clock/provider/git/budget/llm) |
| pipeline/adapter/fixture | `tranche5.test.ts` — usage-detail fields, persist_failed per outcome, minimal-graph contracts, per-method typed failures |
| planner/ledger/session/distiller/archview/graph-ops/approvals/export/ingest/verifier/prompts/graph-reader | `tranche6/7.test.ts` + verifier/redact additions |

## Two genuine defects the new tests found (fixed in production code)

1. **`args.ts` empty-value hole (M-04 gap):** `--target ''` was silently
   accepted — an empty flag value is now a missing-value grammar error.
2. **`redact.ts` ReDoS (C-07 hardening):** the L3 credential-name rule used
   a nested-quantifier ends-with-keyword pattern with catastrophic
   backtracking on long identifier-like runs (minified code) — a hang in
   the egress path. Replaced with a linear identifier match + credential
   tail check; a 20k-char identifier run now redacts in milliseconds
   (regression test bounds it at <2s).

## Remaining uncovered (accepted, not hidden)

Long-tail single arms in shared non-renewal surfaces (browser-client UI
callbacks, eval live-experiment, mcp stdio plumbing) and defensive arms
provably unreachable through public flows (e.g. the command-level
`persist_failed` after `nextAnalysisId` always yields max+1). No
exclusions or ignores were introduced for any of them.
