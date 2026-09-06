# 11 — Low H-1: residual settle() sleeps in browser tests

- Fresh-audit ref: report 16 §New-Low row H-1; detail report 14 (Lane H).
- Reproduction on main: CONFIRMED — census found 11 settle() call sites in app.test.ts
  (10 in test bodies; the re-audit's "12" counted the waitFor helper's own interval)
  plus same-class residuals in app-errors.test.ts; one settle(80) masked a STRUCTURAL
  double-boot race (app.ts's module side-effect boot() racing the explicit dynamic-import
  boot — a late stray mount clobbers the whole DOM); the null-tolerant
  `if (area !== null)` guards silently skipped half the change-request test on slow
  renders.
- Change (commit 616f4ed):
  - app.test.ts: STATIC import (app-errors.test.ts shape) — the explicit boot() is the
    single, fully-awaited boot (no race to mask); all 10 fixed waits replaced by
    observable waitFor gates (real round-trips) or deleted (provably-synchronous
    renders — the client render path is fully synchronous); null-tolerance removed
    (panel awaited unconditionally).
  - app-errors.test.ts: 1400ms poll-cycle sleep → waitFor(legend, ~4s); 120ms cancel
    round-trip → waitFor(.terminal h2); 11 dead settles deleted.
  - Same-class sites beyond the audit's literal scope (new findings N4/N5):
    server/http.test.ts 400ms inactivity sleep → in-process state poll;
    mcp/server.test.ts 300ms "first response flush" → await first stdout JSON-RPC line.
- Retained (legitimate): 150ms slow-adapter fixture; waitFor poll intervals; negative-
  margin windows over fixture-defined timers (check/runner, subprocess).
- Tests: C5 cell — deterministic 300ms-delayed transport passes purely on observable
  gates (H-1's mutation shape).
- Mutation: M-H1b (fixed 120ms window restored on the delayed POST) CAUGHT (C5).
  (M-H1a, a fixed window after the AWAITED boot, was legitimately absorbed — boot()
  awaits the fetch fully; documented, not a coverage gap.)
- CI coverage NOT weakened: same assertions, fewer flake windows; browser suites green
  on Node 22 and 24.
- Final: CLOSED_BY_TEST_HARDENING (H-1) + N3/N4/N5 closed. Reopen: any new fixed wait
  gating a real round-trip/poll cycle.
