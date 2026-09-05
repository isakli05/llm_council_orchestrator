# 09 — Fault / Mutation Matrix

Per load-bearing fix: mutation/failure → expected safe behavior → committed
test → result. All results from the final-HEAD full suite (172 files / 2402
tests green).

## S4-H-01 — transaction (`trust/transaction-atomicity.test.ts` + `state.test.ts` + `concurrency.test.ts`)

| Mutation / failure | Expected safe behavior | Test | Result |
|---|---|---|---|
| journal write fails (0 store writes) | previous state byte-identical, no journal | fault-matrix 1 | PASS |
| first store write fails | rollback; `commit_failed_without_state_change`; byte-identical | fault-matrix 2 | PASS |
| second store write fails (after first landed — THE audit scenario) | first store rolled back too; revision unchanged | fault-matrix 3 | PASS |
| revision write fails (all stores landed) | full rollback to complete R | fault-matrix 4 | PASS |
| strict writer holding R after rolled-back failure | state is GENUINELY R (byte-compare) → commit legitimate; no divergence possible | fault-matrix 5 | PASS |
| rollback write fails | journal retained; `recovery_required`; next read recovers byte-identical | fault-matrix 6 | PASS |
| crash after first store (valid journal) | deterministic recovery to byte-identical R; idempotent; journal removed | fault-matrix 7 | PASS |
| tampered journal (old-bytes edited, integrity stale) | refusal; journal retained | fault-matrix 8 | PASS |
| unreadable journal | typed fail-closed | fault-matrix 9 | PASS |
| strict writer vs recovered state | clean commit (+1) | fault-matrix 10 | PASS |
| mid-refresh failure (archives+snapshot+project+stores+revision) | whole epoch rebind rolls back / commits fully; no stray archives | fault-matrix 11 | PASS |
| journal observed under a held lock | `recovery_required` (never interpreted) | arm 12 | PASS |
| crashed journal with created spec dir + ensured dirs | dir_create + dir_ensure(!existed) rolled back | arm 13 | PASS |
| phantom archive entry (missing source) | skipped by journal simulation; clean commit | arm 14 | PASS |
| unreadable state.json | typed `state_corrupt` | arm 15 | PASS |
| stale revision at strict commit / snapshot change mid-work / corrupt state first / join mismatches / cross-snapshot stores / concurrent folds / lock contention / re-archive collision | typed refusals, nothing written | state.test + concurrency.test (preserved third-audit matrix) | PASS |

## S4-H-02 — evidence (`trust/evidence.test.ts` + pipeline joins)

| Mutation | Expected | Test | Result |
|---|---|---|---|
| wrong project on records (laundered identity) | `context_project_mismatch` | S4-H-02 matrix | PASS |
| wrong snapshot (re-stamped identity) | `context_snapshot_mismatch` | matrix | PASS |
| different bundle's records under current identity | `context_bundle_mismatch` | matrix | PASS |
| tampered slice text↔hash (either direction) | refuse (hashes recomputed at seal; digest recompute at resolve) | matrix | PASS |
| spliced extra record | `context_bundle_mismatch` | matrix | PASS |
| laundered stale bundle after refresh | `context_snapshot_mismatch` | matrix | PASS |
| widened window / foreign node binding | refuse (digest recompute) | matrix | PASS |
| bundle vs req snapshot mismatch at pipeline entry | typed refusal before anything paid | pipeline join + cross-primitive 4 | PASS |
| THE T3-1 (1–2 supplied, 10–10 claimed) + boundary/overlap/invalid ranges + unknown/foreign ids + whole-file semantics | preserved third-audit matrix | evidence.test | PASS |
| sealed-bundle facts change (any record/window/hash/node/structural) | bundle_id changes | seal digest test | PASS |

## S4-H-03 — paid (`trust/paid-immutability.test.ts` + `paid.test.ts`)

| Mutation | Expected | Test | Result |
|---|---|---|---|
| post-construction mutation: caller route.extraBody (nested), model, baseUrl, budget, routing | wire bytes + digest unchanged; frozen route throws on write | immutability 1–2 | PASS |
| provider config mutated after routeFromConfig | unreachable | immutability 3 | PASS |
| routeFromConfig value mutated | deep-frozen (throws) | immutability 3 | PASS |
| nested extraBody-only change (pre-construction) | digest changes | immutability 4 | PASS |
| route budget 1 + second transport attempt | refused by the OWNED ledger; zero bytes | immutability 5 | PASS |
| ledger ensure/charge hooks vs route budget | same budget enforced | immutability 6 | PASS |
| wall budget carries into owned ledger | enforced with injected clock | immutability 7 | PASS |
| digest reconstruction path | none — digest IS over op.route | immutability 8 | PASS |
| external ledger supplied | unrepresentable (API deleted; tsc-level + test-level absence) | guard + V3 verifier | PASS |
| over-cap serialized request / at-cap boundary / validation-retry growth | zero transport calls; cap at the same boundary | paid.test (preserved) | PASS |
| field-variation digest separation (model/baseUrl/maxTokens/extraBody/budget) | digest changes per field | paid.test (preserved) | PASS |

## S4-H-04 — structural (`trust/structural-coherence.test.ts` + `structural.test.ts` + intel suites)

| Mutation | Expected | Test | Result |
|---|---|---|---|
| manifest A + graph B / B + A | `coherence_failed` (source-set gate) | coherence 2–3 | PASS |
| A/A + modified graph bytes under valid binding | refuse | coherence 4 | PASS |
| binding A over full B/B pair | `coherence_failed` | coherence 5 | PASS |
| same source names, different manifest bytes | `coherence_failed` (binding gate) | coherence 6 | PASS |
| hand-edited binding | `binding_tampered` | coherence 7 | PASS |
| binding absent (trusted path) | `binding_missing` + refresh remedy | coherence 8 | PASS |
| version join mismatch | `incompatible` | coherence 9 | PASS |
| binding corrupt JSON / missing fields / blank | `binding_corrupt` / `binding_missing` | arms 16–18 | PASS |
| expected manifest/graph digest drift | `coherence_failed` | arm 19 | PASS |
| adapter graph/query/path/explain over mixed/foreign/unbound workspace | typed failures | adapter arms | PASS |
| graphHealth over unbound workspace | `coherence_failed` status (never healthy) | adapter arm | PASS |
| malformed manifests/graphs/duplicates/dangling (preserved third-audit matrix) | typed refusals | structural.test + intel suites | PASS |
| schema-valid graph.json mutation with binding present | typed workspace refusal (stronger than "stale") | snapshot-trust | PASS |

## Bypass-class mutations (`trust/architecture.test.ts` + consumer suites)

| Former bypass reintroduced as… | Guard | Result |
|---|---|---|
| raw write primitive in the renewal surface | write-primitive scan | caught |
| direct transport constructor | identifier ban | caught |
| provider-factory transport in MCP renewal / missing createPaidOperation on a boundary | closure rules | caught |
| raw readFileSync in project/analysis-store/approvals readers | raw-read rule | caught |
| inline support-policy literal | ONE-policy rule | caught |
| second CANONICAL_PARITY_RULINGS definition | definition-locality rule | caught |
| parseGraphText outside kernel | locality rule | caught |
| ad-hoc sha256Content(JSON.stringify) trust digest | idiom rule (caught pipeline.ts live) | caught |
| upward import from trust/*, cycle through trust/state | import-graph rules | caught |
| write-performing commit callback returning | journal write-set API rule | caught |
| each of the 8+5 closed bypass paths themselves | class guards + consumer tests | PASS (old paths deleted) |

## Cross-primitive (`trust/cross-primitive-closure.test.ts` + preserved composition suite)

See `10-CROSS-PRIMITIVE-TESTS.md`.
