# 16 — Evidence Index

All commands run from `packages/spec-core` unless noted; zero real paid LLM calls anywhere (scripted/recording transports only).

## Ordinary gates (this session, fresh)

| gate | command | result |
|---|---|---|
| build | `pnpm --filter ./packages/spec-core build` | PASS |
| lint | `pnpm --filter ./packages/spec-core lint` (both tsconfigs) | PASS |
| tests | `pnpm --filter ./packages/spec-core test` | PASS — 165 files / 2,324 tests |
| coverage | `pnpm --filter ./packages/spec-core test:coverage` | PASS — 93.2 / 89.14 / 96.14 / 93.2 vs unchanged ratchet 91/89/96/91 (no exclusions) |
| schema freshness | `git diff --exit-code -- packages/spec-core/generated/spec-schema.json` | PASS |
| whitespace | `git diff --check` | PASS |
| packed install | `pnpm --filter ./packages/spec-core smoke:packed` | PASS — pack → isolated install → lco bins → MCP handshake (initialize/notification/parse-error) → browser clarification workspace (CSP, session API, clean cancel) → renewal offline surface |
| pre-Renewal fixture | `node dist/cli/index.js verify fixtures/pre-renewal-frozen-spec` | exit 0 ("verify OK") |

## Trust-kernel suites

| suite | command | result |
|---|---|---|
| kernel units | `npx vitest run src/renew/trust` | canonical 10 · fs 23(+15 coverage) · structural 8 · evidence 12 · authority 12 · paid 12 · state 9 — PASS |
| architecture guards | `npx vitest run src/renew/trust/architecture.test.ts` | 8/8 PASS |
| composition A–G | `npx vitest run src/renew/trust/composition.test.ts` | 7/7 PASS |
| full journey | `npx vitest run src/renew/trust/journey.test.ts` | 2/2 PASS (11 command legs + T3-1 negative) |
| concurrency | `npx vitest run src/renew/trust/concurrency.test.ts` | 4/4 PASS |
| committed fixture compat | `npx vitest run src/compiler/hash-compat.test.ts` | 9/9 PASS (incl. unchanged→PASS, semantic mutation→FAIL) |

## Graphify version matrix (execution-time, 2026-09-03)

| leg | evidence | result |
|---|---|---|
| floor 0.9.50 (installed) | real integration suite | 7/7 PASS |
| newest compatible 0.9.53 | PyPI latest = 0.9.53 (2026-08-30; no 0.10.x/1.0.0) + GitHub v0.9.53 Latest; isolated venv (`graphifyy==0.9.53`), global untouched, PATH-scoped integration | 7/7 PASS |

CI pairs Node 22/0.9.50 with Node 24/0.9.53 (integration canary enforced); publish installs 0.9.53 before coverage + packed smoke. Local runner node v24.14.0, pnpm 10.17.1.

## Version metadata

- installed Graphify 0.9.50; supported range `>=0.9.50 <0.10.0`
- https://pypi.org/project/graphifyy/ · https://github.com/Graphify-Labs/graphify/releases (both checked 2026-09-03)

## Independent verifier wave (Phase 15)

Six fresh read-only verifiers (A fs · B state · C evidence+authority · D paid+consent · E structural+compat · F composition+bypass) dispatched with the kernel contracts and instruction to attack neighbors, not known finding IDs. Results: 16-MAO-VERIFIER-RESULTS.md.
