# 11 — Files & Commits

Base: `feat/clarification-workspace` @ `7dd6477`. Branch: `feat/legacy-renewal-v1` (local; no push/merge).

| commit | step |
|---|---|
| `322a04f` docs(plan): legacy renewal v1 implementation plan | Phase 2 |
| `c63f9e3` feat(renew): code intelligence provider + graphify adapter | STEP 1 |
| `bff22eb` feat(renew): project snapshot + staleness gate | STEP 2 |
| `de3cd08` feat(renew): verified code_anchor evidence + anchor verifier | STEP 3 |
| `056fb59` feat(renew): context provider + bounded redacted bundles | STEP 4 |
| `a79b66a` fix(renew): re-export RENEW_CONTEXT_LIMITS | — |
| `065705a` feat(renew): deterministic architecture view | STEP 5 |
| `a80ed40` feat(renew): schema-gated recovery pipeline + immutable analyses | STEP 6 |
| `38ef6a8` feat(renew): lco-owned renewal overlay | STEP 7 |
| `2d310c8` feat(renew): clarification distiller + workspace generalization | STEP 8 |
| `1801944` feat(renew): operational parity ledger | STEP 9 |
| `e7705ed` feat(renew): deterministic modernization planner | STEP 10 |
| `088c782` feat(renew): cli surface + mcp tools + doctor | STEP 11 |
| `a665012` test(renew): consolidated adversarial security pass | security |
| `c0dab43` fix(renew): planner refuses an empty parity ledger | fix |
| `58cb99d` docs: legacy renewal v1 section + mcp tool table update | docs |
| (final) docs(report) + graphify refresh | closeout |

New production code: `src/renew/{intel,ingest,snapshot,anchors,context,archview,recovery,overlay,parity,clarify,planner,project}/`, `src/cli/commands/renew.ts`; modified: `src/schemas/evidence.ts` (+ regenerated `generated/spec-schema.json`), `src/llm/plan.ts` (role), `src/clarify/model.ts` (pattern seam), `src/cli/{args,index}.ts`, `src/mcp/{server,consent}.ts`, `src/cli/commands/doctor.ts`, `README.md`, `scripts/packed-install-smoke.sh`, tests co-located per repo convention; fixture corpus `fixtures/legacy-app/` (ground-truth rules R1–R5; canaries staged at runtime, never committed).
