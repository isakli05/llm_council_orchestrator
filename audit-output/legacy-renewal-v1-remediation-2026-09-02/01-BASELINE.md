# 01 — Baseline

Verified before any change (this session):

| Item | Value |
|---|---|
| branch | `feat/legacy-renewal-v1` |
| HEAD | `f71cbc19996b469ea348e8b5dc096312e1d93c28` |
| base | `feat/clarification-workspace` @ `7dd6477018d9fb7f6af4d0bc33ffbf2fd167b086` (merge-base confirms direct descendant) |
| working tree | clean except the two untracked audit dirs (preserved, never committed) |
| `fix/legacy-renewal-v1-release-blockers` | did NOT exist → created fresh from the verified HEAD |
| node / pnpm / claude / graphify | v24.14.0 / 10.17.1 / 2.1.258 / 0.9.50 (0.9.53 re-verified current on PyPI) |

Baseline gates (pre-remediation, reproduced): build PASS · lint PASS · tests 133 files/1822 PASS · coverage FAIL (branches 85.98<89, functions 94.28<96) · schema freshness PASS · smoke:packed PASS (incl. MCP handshake) — all matching the audit's table exactly.
