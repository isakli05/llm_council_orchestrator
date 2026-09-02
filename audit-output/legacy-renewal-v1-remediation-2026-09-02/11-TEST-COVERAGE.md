# 11 — Test Coverage (H-01 status)

## Gate command

```bash
pnpm --filter ./packages/spec-core test:coverage
```

## Current result (final run this session)

| Metric | Actual | Threshold | Result |
|---|---:|---:|---|
| statements | 92.16% | 91% | pass |
| lines | 92.16% | 91% | pass |
| branches | **86.56%** | 89% | **FAIL — 131 branch points short** |
| functions | **95.12%** | 96% | **FAIL — 7 functions short** |

Thresholds are UNCHANGED (vitest.config.ts untouched on this branch — diff-verifiable).

## Trajectory (audit baseline → now)

branches 85.98 → 86.56 (+0.58 absolute, on a LARGER pool: the branch pool grew from new trust code), functions 94.28 → 95.12. Tests grew 1822 → 1956 (134 new, all trust/error-path assertions; no superficial filler — each asserts a refusal code, a tamper detection, or a containment behavior).

## Where the remaining 131 branch points live (measured, `coverage-final.json`)

| File | Uncovered branches | Notes |
|---|---:|---|
| `src/cli/commands/renew.ts` | ~85 | The interactive-review flow (server start/poll/approve wiring) and several fold branches are the dominant block; needs an HTTP-driving e2e test against the loopback workspace |
| `src/renew/planner/plan.ts` | ~15 | remaining overlay-consumption permutations |
| `src/mcp/server.ts` | ~20 | renewal-consent error orderings |
| `src/cli/args.ts` | ~15 | non-renew grammar branches (pre-existing) |
| `src/server/http.ts`, `clarify/session/orchestrator.ts` | ~45 combined | shared clarify-server branches (pre-existing lows) |
| `src/renew/recovery/pipeline.ts`, `intel/graphify-adapter.ts`, `intel/fixture-provider.ts`, `parity/ledger.ts`, `clarify/session.ts` | ~50 combined | residual error permutations |
| browser-client, eval/live-experiment, generate-interactive, doctor | remainder | pre-existing lows outside the renewal scope |

## Recommended closure plan (next session)

1. **Interactive review e2e** (~35–40 branches): drive `cmdRenewReview --interactive` with a real HTTP client against its loopback server (capture the URL from stderr, POST answers + approve). The shared round-trip test is the precedent.
2. **finishReview/export/plan command permutations** (~30): approval-not-found, no-strategy-answer, review cancellation state, `--freeze` happy path.
3. **Pipeline/adapter/ledger residuals** (~35): error permutations reachable only through specific fixture shapes.
4. **Functions (7)**: uncovered functions concentrate in `browser-client/app.ts` (error screens), `eval/report.ts`, and one pipeline closure — small jsdom/unit additions close them.
5. If the shared-file lows (orchestrator/http) are chosen instead, they are equally honest targets — but the audit's guidance prioritizes the renewal modules.

## What will NOT be done

Thresholds are not lowered; `skipIf` is not added anywhere new; no test-only production branches; no assertions deleted to shrink the pool.
