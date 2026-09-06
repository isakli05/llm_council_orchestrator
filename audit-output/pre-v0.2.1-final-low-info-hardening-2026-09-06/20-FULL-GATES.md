# 20 — Full Gates at Final Production HEAD (744a5a5)

(An identical gate sequence ran green at the pre-verifier-fix HEAD 1e73633 —
194/2705, 94.65/91.11/97.24/94.65. The numbers below are the FINAL run after the
verifier-response commit; +3 tests = S11 + N-1 + composition CI canary.)

Run in the canonical checkout, content-verified summaries (never exit codes alone):

| Gate | Command | Result |
|---|---|---|
| build | pnpm -C packages/spec-core build | PASS |
| lint | pnpm -C packages/spec-core lint | PASS (tsc ×2 clean) |
| test | pnpm -C packages/spec-core test (pretest builds) | PASS — 194 files / 2708 tests / 0 failed / 0 skipped |
| test:coverage | pnpm -C packages/spec-core test:coverage | PASS — Stmts 94.66 / Branch 91.11 / Funcs 97.24 / Lines 94.66 |
| smoke:packed | pnpm -C packages/spec-core smoke:packed | PASS — pack→install→init→doctor→lco-mcp handshake→offline workspace→renew offline |
| git diff --check | repo root at HEAD | CLEAN |

Coverage floors (≥91/≥89/≥96/≥91): exceeded on all four axes. Thresholds untouched.

Baseline→final movement: 193→194 files, 2677→2708 tests (+31), coverage 94.62→94.66 /
91.06→91.11 / 97.24→97.24 / 94.62→94.66 (all monotone or equal — no weakening).

## Inside the 194-file suite (charter's "also" areas, all green)

root invariants, architecture guards (incl. the new B-2 pin), transaction-atomicity
(76 incl. S2a/S8/S8b/S9/S10/D-F-01), MCP consent + effectual, ContextBundle identity,
browser/client vertical slices (incl. C5), failed/crash recovery, schema freshness
(build step), frozen-spec compatibility (prepublish boundary), graphify canary,
NEW-F-01 concurrency + M-1 fold cell, pre-v021 composition (C1–C4), special-key/profile
resolution suites, dist-presence canaries (CI-off locally → early return).

## Node / Graphify matrix

| Runtime | Scope | Result |
|---|---|---|
| Node 24.14.0 (dev) | FULL gates (above) | all green |
| Node 22.23.2 + graphify 0.9.50 (local CLI version) | targeted: trust+config 26 files/362 tests; browser-client 5/34; graphify canary 1/7; models 1/12 | all green |
| Node 24 + graphify 0.9.53 pairing | NOT locally reproducible (local graphify CLI is 0.9.50 under both runtimes — same limitation as the prior re-audit, report 24 §"Not verified locally"; no versions changed) | declared-in-CI only |

Zero real provider calls in every run (fake transports; offline smoke).
