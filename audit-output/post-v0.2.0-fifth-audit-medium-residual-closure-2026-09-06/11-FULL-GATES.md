# 11 — Full Gates (at final HEAD `89beb28`)

All commands run fresh 2026-09-06 from `packages/spec-core`. Re-run after the
verifier-disposition commit; the identical gate set was also green at the
pre-verifier implementation HEAD `f088997` (2622 tests then).

| Gate | Command | Result |
|---|---|---|
| Build | `pnpm --filter ./packages/spec-core build` | PASS (dist rebuilt; browser assets copied; spec-schema.json regenerated; bins executable) |
| Lint | `pnpm --filter ./packages/spec-core lint` | PASS (tsc project + browser, no errors) |
| Test | `pnpm --filter ./packages/spec-core test` | **191 files / 2624 tests passed, 0 failed, 0 skipped** |
| Coverage | `pnpm --filter ./packages/spec-core test:coverage` | exit 0 — statements **94.42%** (≥91), branches **90.99%** (≥89), functions **97.22%** (≥96), lines **94.42%** (≥91) |
| Packed install | `pnpm --filter ./packages/spec-core smoke:packed` | PASS — pack → install → `lco init` → MCP handshake → offline interactive workspace + renewal offline surface |
| Whitespace | `git diff --check` | clean |
| Schema freshness | regenerate `generated/spec-schema.json` → compare | no diff (fresh) |
| Frozen-spec compatibility | good-fixture-gate + frozen fixtures in full suite | PASS (fixtures untouched: empty diff) |
| Architecture guards | `src/renew/trust/architecture.test.ts` (+ guard assertions across suites) | PASS — no guard weakened, no new bypass/inversion/cycle/ad-hoc digest |
| Transaction/recovery suites | transaction-atomicity (49), state, composition, closure, cross-primitive | PASS |
| Renewal E2E | `src/renew/e2e.test.ts` | PASS |
| Failed/crash recovery E2E | S5-H-01 crash-window arms (real captured journal bytes) + fs fault arms | PASS |

Forbidden-actions audit: thresholds unchanged (vitest.config.ts 91/89/96/91 —
ratchet comment intact); no coverage exclude/ignore added; zero `.skip`/`.only`
(scan of the trust + recovery test surface; the only `only` string hit is the
fault-mock's `interleaveAndFail.only` property); no provider manipulation; no
production logic written to game coverage.

Note: coverage run happens via the same suite (`test:coverage`); one run,
threshold-enforced, matching CI.
