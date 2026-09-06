# 23 — Files and commits

Base: `4507409` (plan commit; program branch point = `602a511` = origin/main).
Final implementation HEAD: `e46d574`.

## Commits (program order)

| SHA | Subject |
|---|---|
| 4507409 | plan(program): post-PR5 full residual hardening (+ Phase-1 reports 00–16) |
| 7710c49 | fix(canonical): harden special-key canonicalization and validation (L1+I1) |
| 62c49d9 | fix(context): seal digests the cloned frozen items it exposes (I2+I3) |
| 275c2de | fix(context): qualify and mechanically pin request-framing identity boundary (L3+L4) |
| 0c017c0 | perf(context): memoize sealed-bundle digests at seal time (I4) |
| 6b29d77 | test(trust): seal-site guard flags aliased imports, not just call sites |
| 9736c25 | fix(consent): make unresolved route authority explicitly fail closed (L2) |
| c7f81b8 | fix(evidence): pin retention truthfulness and distinguish foreign objects (L7+I5) |
| 30aae75 | fix(evidence): validate the durable store write boundary (I6) + dedup-keyed analyze fold (NEW-F-01) |
| 3b62a43 | fix(evidence): CAS-fence the superseded-marker write (L5) |
| 76bad08 | docs(evidence): codify the persistent-channel invariant boundary (L6) |
| e5b2398 | test(browser): make client state transitions and dist-dependent suites hermetic (I7) |
| 2079620 | test(trust): cross-residual compositions R1-R4 + protected-contract regression green |
| ec6fc68 | test(browser): correct two dist-guard relative keys |
| e46d574 | chore(graphify): refresh graph for post-PR5 hardening HEAD ec6fc68 |

## Production source changed (12 files)

```
packages/spec-core/src/cli/commands/renew.ts        (framing comment; fold dedupe NEW-F-01; L6 entry probe)
packages/spec-core/src/config/llm-config.ts         (I1 refines)
packages/spec-core/src/eval/llm/http.ts             (I1 env guard)
packages/spec-core/src/mcp/consent.ts               (L2 typed binding + total gate)
packages/spec-core/src/mcp/server.ts                (L2 renewalConsentState/gate wiring)
packages/spec-core/src/renew/trust/canonical.ts     (L1 null-proto replacer + own-key rule)
packages/spec-core/src/renew/trust/errors.ts        (I5 sub-shape doc)
packages/spec-core/src/renew/trust/evidence.ts      (I2 reorder; I3 doc; I4 cache; L3/L4 comments)
packages/spec-core/src/renew/trust/fs.ts            (L6 entry probe)
packages/spec-core/src/renew/trust/paid.ts          (L1 env guard)
```
(plus graphify-out generated artifacts — AST-only refresh.)

## Test source changed/added (21 files)

```
browser-client/app.test.ts                 (I7 waitFor ×3)
build/bin-contract.test.ts                 (I7 guard)
cli/commands/doctor.test.ts                (I7 guard)
cli/commands/init-concurrency.test.ts      (I7 guard)
config/llm-config.test.ts                  (I1 negatives)
mcp/consent.test.ts                        (L2 pins + gate cells)
mcp/renew-consent-effectual.test.ts        (L2 effectual cells)
mcp/server.test.ts                         (I7 guards ×4)
release/prepublish-check.boundary.test.ts  (I7 guard)
renew/clarify/round-trip.test.ts           (I7 guard)
renew/review-interactive.test.ts           (I7 guard)
renew/root-invariants.test.ts              (L2 ladder)
renew/trust/architecture.test.ts           (L1+I3 guards)
renew/trust/canonical.test.ts              (L1 block)
renew/trust/concurrency.test.ts            (NEW-F-01 assertions)
renew/trust/evidence.test.ts               (I2+I4 blocks, L4 title)
renew/trust/paid-context-framing-pin.test.ts (NEW — L3 pins)
renew/trust/paid.test.ts                   (L1/I1 block)
renew/trust/post-pr5-composition.test.ts   (NEW — R1–R4)
renew/trust/transaction-atomicity.test.ts  (L5/L6/L7/I5/I6 blocks + seams)
server/assets.test.ts                      (I7 guard)
```

Diff size (excluding graphify-out/audit-output/plans):
32 files, +1797/−127.
