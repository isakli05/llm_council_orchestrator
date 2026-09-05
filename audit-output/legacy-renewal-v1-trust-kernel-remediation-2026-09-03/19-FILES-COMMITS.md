# 19 — Files and Commits

Branch `fix/legacy-renewal-v1-trust-kernel-remediation` from third-audit HEAD `7e7d71f8f45a57475f2cda4a9eac8b60a3b34a1f`. No push, no merge, no tag. Commit history (program order):

| sha | subject |
|---|---|
| e65eda3 | plan: legacy renewal v1 trust-kernel remediation program (frozen contracts + Stage-0/1 evidence) |
| 6912ed5 | feat(trust): Legacy Renewal Trust Kernel — all six primitives + canonical layer (80 kernel tests; 2273 suite green) |
| 2251960 | feat(trust): consumer migration waves 1+2+4 — fs/state/authority/paid through the kernel |
| 2bcfb95 | feat(trust): evidence-citation wave (S3-H-01), structural totality (S3-M-01), bounded redaction (S3-M-06) |
| 0a72a5c | test(trust): cross-primitive composition A–G + architecture bypass guards + interim reports |
| ff71459 | test(trust): Phase-9 full journey — 11 legs, scripted citations, target identity throughout |
| 9328826 | test(trust): Phase-10 command-level concurrency matrix (deterministic interleavings) |
| 22b171c | fix(renew)+test: evidence-ripple reconciliation + verifier-found phantom-line fix (27 test files on kernel contracts) |
| c7f115a | refactor(trust): Phase-5 — delete the bypass implementations; architecture guards GREEN |
| b4c9f86 | test(renew): Phase-5 deletion cleanup — full suite 2306/2306 green |
| e5329b9 | test(trust): coverage completion — gate green |
| a732ce2 | fix(trust): independent-verifier closure — every finding fixed at its boundary |
| 0472075 | fix(trust): re-verifier closure — M-1/M-2/L-1 + clarify-domain VB-1 fix + F-7 pin |

(The reports commit lands with this directory; no push, no merge, no tag. Final gate table: 00-REMEDIATION-STATUS.md.)

## Production surface (new)

`packages/spec-core/src/renew/trust/` — errors, canonical, fs, structural, state, evidence, authority, paid (+ architecture/composition/concurrency/journey test suites).

## Production files materially changed

renew/project/project.ts (+export.ts), snapshot/snapshot.ts, overlay/overlay.ts, parity/ledger.ts, planner/strategy.ts, recovery/{pipeline,prompts,schemas}.ts, recovery/analysis-store.ts, context/{bundle,context-provider,redact}.ts, clarify/{approvals,session}.ts, ingest/workspace-copy.ts, intel/{provider,graph-ops,graphify-adapter,fixture-provider}.ts, cli/commands/{renew,write-spec,generate,generate-interactive}.ts, cli/index.ts, mcp/{server,consent}.ts, llm/{openai-compatible,providers}.ts, eval/{runner,budget-ledger topology via orchestrator}.ts, clarify/session/orchestrator.ts, compiler/{hash,verify}.ts, schemas/manifest.ts, storage/revision.ts; fixtures/pre-renewal-frozen-spec/**; generated/spec-schema.json (regenerated, schema-affecting changes: manifest hash_version literal union, bundle slice identity fields, citation-claim anchors).

## Test files

27 renew-suite files reconciled to the kernel contracts (two reconciliation passes + deletion cleanup); new trust suites (kernel units 79, architecture 8, composition 7, journey 2, concurrency 4); mcp consent/server tests updated to effectual-binding digests; compiler hash-compat extended with the committed fixture.

## Docs

Root README (13 commands / 13 tools), package README (current test counts).
