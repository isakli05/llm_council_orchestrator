# 20 — Full local gates

**Refresh note:** the tables below were measured at e46d574. After the
verifier-finding fixes (4 Low, report 21), everything was re-run at the FINAL
HEAD: lint/tsc exit 0; **193/193 files, 2677/2677 tests, 0 failed, 0 skipped;
coverage statements 94.62 / branches 91.06 / functions 97.24 / lines 94.62**
(thresholds ≥91/89/96/91 unchanged and exceeded); the numbers below are
superseded only in test count (+4 verifier-fix tests) and branch % (91.05→91.06).

| Gate | Result |
|---|---|
| `pnpm --filter ./packages/spec-core build` | exit 0 (shebang/mode checks ok, generated/spec-schema.json written → schema freshness ok) |
| `pnpm --filter ./packages/spec-core lint` (tsc both configs) | exit 0 |
| `pnpm --filter ./packages/spec-core test` (via test:coverage run) | **193/193 files, 2673/2673 tests, 0 failed, 0 skipped** |
| `pnpm --filter ./packages/spec-core test:coverage` | exit 0 — **statements 94.62 / branches 91.05 / functions 97.24 / lines 94.62** (thresholds ≥91/89/96/91 unchanged and exceeded) |
| `pnpm --filter ./packages/spec-core smoke:packed` | PASS (pack → install → lco init → lco-mcp handshake → offline interactive workspace + renewal offline surface) |
| `git diff --check` | clean |

Additional:
- Protected-contract focused regression (13 suites): 251/251 (report 18).
- Composition R1–R4 suite: 5/5 (report 17).
- Architecture guards: 19/19; root-invariants 28/28.
- Frozen-spec/fixture gates: green in the full run (fixtures.test.ts,
  good-fixture-gate.test.ts); canonical change is byte-stable for all
  artifact shapes and no `__proto__` keys exist in any repo JSON.
- Graphify: `graphify update .` refreshed (committed e46d574); adapter
  integration + unit canaries 40/40 green.
- Node 22 (v22.23.2) targeted trust/consent suites: 149/149 green
  (canonical, evidence, transaction-atomicity, consent, effectual).
  Node 24 (v24.14.0) is the primary run environment of every gate above.
  (Browser suite ×runs on both runtimes: see report 21 verifier C.)
- Forbidden during the program: no threshold weakening, no coverage
  exclusions, no `.skip`/`.only` (the dist guards are `skipIf` on artifact
  presence with a stderr notice — exercised tests when dist present, 0
  skipped in the final run), no provider change, no sleep inflation.

Baseline comparison: the pre-implementation baseline run at 602a511 was green
(exit 0). Final: 2673 tests (baseline 2624 + the 49 committed regression
tests added by this program, net of none removed), coverage up on every
dimension (final 94.62/91.05/97.24/94.62).
