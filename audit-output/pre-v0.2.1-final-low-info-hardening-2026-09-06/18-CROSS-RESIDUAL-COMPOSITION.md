# 18 — Cross-Residual Composition (C1–C6)

Committed suite: packages/spec-core/src/renew/trust/pre-v021-composition.test.ts (C1–C4,
4 cells) + browser-client/app.test.ts C5 cell (commit fb30d6d). C6 = committed suites.

| Cell | Scenario | Result |
|---|---|---|
| C1 | roles "__proto__" parse refusal → resolver inherited-name typed refusals → provider "__proto__" refusal → clean route consent-bound (post-consent header mutation refused by total gate) | PASS |
| C2 | racer parked in the read→unlink window unlinked (accepted E-2 boundary); marker lands; REAL child process fail-closes on the superseded marker; committed revision R+1 stands | PASS |
| C3 | post-probe degradation + persistent cleanup fault → TYPED abort, truthful retention (negative regex), fresh process auto-retires to healthy R+1 | PASS |
| C4 | bigint payload through the REAL tx flow (work phase ran, llmCalls=1) → typed commit_failed_without_state_change; byte-identical trusted tree; no journal; revision unchanged | PASS |
| C5 | 300ms-delayed transport on the full clarification flow completes purely on observable gates | PASS |
| C6 | NEW-F-01 duplicate-ACTIVE concurrency/fold: committed I6 backstop + concurrency Phase-10 + M-1 changed-statement cell re-run inside the final full gates | PASS (2705/2705) |

No real provider calls anywhere (fake transports/adapters only); fresh child processes
used for C2/C3 recovery legs (dist built by pretest).
