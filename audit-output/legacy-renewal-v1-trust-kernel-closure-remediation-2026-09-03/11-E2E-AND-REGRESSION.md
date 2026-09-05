# 11 — E2E and Regression

All runs at final HEAD, zero real paid calls (scripted/local transport only).

## Full Renewal journey E2E

`trust/journey.test.ts` + `renew/e2e.test.ts` — the deterministic synthetic
journey (init → analyze → review/approval → strategy → plan --freeze →
export → status → refresh → re-analyze/review → status/export) with scripted
adapters: PASS. Target inventories preserved (bytes, modes, symlinks,
hard-link witnesses) except deliberate test drift; active/history split,
approval lineage, citation ranges, state revisions, and refresh archives
asserted. The journey now exercises the journaled transactions, the sealed
context bundle, the PaidOperation transport, and binding-verified structural
reads end-to-end.

## Failed-transaction restart/recovery E2E (load-bearing)

- Kernel level: `transaction-atomicity.test.ts` — injected second-write
  failure → rollback (state byte-identical, revision unchanged, journal
  gone); rollback-failure → journal retained → the NEXT trusted read (the
  "restart") deterministically recovers byte-identical state and clears the
  journal; a strict writer then commits cleanly. Repeated reads idempotent.
- Command level: `cross-primitive-closure.test.ts` — a failed tx cannot lose
  a human ruling; refresh mid-failure rolls the whole epoch rebind back.

## Paid-operation E2E

`paid-immutability.test.ts` — recording fetch (captures the exact serialized
request): resolve operation → mutate caller-owned originals → run → wire
still matches the constructed snapshot; budget-1 route → second transport
refused by the operation-owned ledger with zero bytes (no external ledger
authority exists to enlarge it). MCP consent suites bind the consented digest
to the transported construction on both route families.

## Structural E2E

`structural-coherence.test.ts` — two disposable build-sets (A, B): A/A valid,
B/B valid, A/B and B/A invalid at the source-set gate; foreign binding,
byte-modified artifacts, absent binding, tampered binding all invalid; all
adapter consumers (graph/query/path/explain/graphHealth) inherit the gate.
Real-graphify integration (installed 0.9.50 + isolated 0.9.53): build →
binding seal → verified reads → god nodes/blast radius/health 7/7 on both
versions.

## Held-invariant regression (explicitly re-run)

| Invariant | Result |
|---|---|
| FilesystemCapability target immutability + hardlink/staging safety | PASS (fs.test 23 + root-invariants) |
| T3-1 evidence range containment | PASS (evidence.test, preserved repro + neighbors) |
| semantic-support policy (unvalidated ≠ load-bearing) | PASS (evidence + parity gate via kernel policy) |
| AuthorityGrant structured DROP + exact rulings + scope joins | PASS (authority.test + negation corpus) |
| serialized initial/retry request cap | PASS (paid.test + operation-bound cap test) |
| redaction/egress (bounded patterns) | PASS (redact + prompts/egress suites) |
| pre-Renewal frozen compatibility | PASS (`verify fixtures/pre-renewal-frozen-spec` exit 0; mutation still fails; unknown versions refuse) |
| active/historical export + status truth | PASS (journey + export suites) |

## Non-Renewal regression

Full suite covers compile/freeze/verify/change/trace/plan(legacy)/init/check/
generate/doctor/clarification surfaces (172 files / 2437 tests green); packed
install smoke ran the real tarball: CLI init/help/version, doctor, MCP
initialize/notification/parse-error handshake, browser clarification, Renewal
help + offline non-project refusal — Graphify not required for ordinary
commands.

## Distribution / CI

Packed package: 292 files; allowlist unchanged (dist, generated, examples,
README, LICENSE); no audit output, graphify output, coverage, machine paths,
or secrets. CI (`ci.yml`: Node22/Graphify0.9.50 + Node24/Graphify0.9.53,
availability canary, frozen install, schema freshness, lint, coverage, real
integration, packed smoke) and `publish.yml` reviewed — static parity
preserved; no workflow changes were needed by this program. No push, no
merge, no tag (remote runs remain a future condition).

## Zero paid calls

Every paid path in every test/E2E uses scripted adapters or recording fetch
implementations. Required real paid calls: **0**.
