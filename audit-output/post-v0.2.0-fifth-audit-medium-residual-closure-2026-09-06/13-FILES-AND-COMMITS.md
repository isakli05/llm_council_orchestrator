# 13 — Files and Commits

Base → final HEAD: `e7dedf0` → `89beb28` (branch `fix/post-v0.2.0-fifth-audit-medium-residuals`; no push, no merge).

```
9ab2b8e  plan(program): fifth-audit medium residual closure
           plans/2026-09-06-fifth-audit-medium-residual-closure.md

502ead0  fix(renew): preserve configured headers through paid routes (S5-M-02)
           packages/spec-core/src/renew/trust/paid.ts                     [production]

133e407  test(renew): strengthen paid-route header regressions (S5-M-02)
           packages/spec-core/src/renew/trust/paid.test.ts
           packages/spec-core/src/renew/trust/composition.test.ts

d682533  fix(renew): bind complete model-visible ContextBundle identity (S5-M-01)
           packages/spec-core/src/renew/trust/evidence.ts                 [production]
           packages/spec-core/src/renew/recovery/pipeline.ts              [production]
           packages/spec-core/src/cli/commands/renew.ts                   [production]

45912c0  test(renew): strengthen ContextBundle identity coverage (S5-M-01)
           packages/spec-core/src/renew/trust/evidence.test.ts
           packages/spec-core/src/renew/trust/cross-primitive-closure.test.ts
           packages/spec-core/src/renew/trust/composition.test.ts
           packages/spec-core/src/renew/trust/pipeline-taxonomy.test.ts
           packages/spec-core/src/renew/recovery/pipeline.test.ts
           packages/spec-core/src/renew/recovery/pipeline.function-coverage.test.ts
           packages/spec-core/src/renew/recovery/prompts.test.ts
           packages/spec-core/src/renew/root-invariants.test.ts
           packages/spec-core/src/renew/session-branches.test.ts
           packages/spec-core/src/renew/tranche5.test.ts
           packages/spec-core/src/renew/tranche7.test.ts
           (test-call-site modernization for the required seal `items` param —
            mechanical; new coverage lives in evidence.test + cross-primitive)

491fea9  fix(renew): harden persistent abort-evidence failure semantics (S5-M-04)
           packages/spec-core/src/renew/trust/state.ts                    [production]

fe6eeac  test(renew): add abort-evidence persistence fault matrix (S5-M-04)
           packages/spec-core/src/renew/trust/transaction-atomicity.test.ts

f088997  test(renew): cross-residual trust regression (Composition H)
           packages/spec-core/src/renew/trust/composition.test.ts

89beb28  test+fix(renew): verifier-wave dispositions
           packages/spec-core/src/renew/trust/evidence.ts              [payload-assembly hardening]
           packages/spec-core/src/renew/recovery/pipeline.ts           [join documentation]
           packages/spec-core/src/renew/trust/transaction-atomicity.test.ts [real-FS EACCES cell]
           packages/spec-core/src/mcp/renew-consent-effectual.test.ts  [MCP headers consent arm]
```

Production diff (4 files): `renew/trust/paid.ts`, `renew/trust/evidence.ts`,
`renew/recovery/pipeline.ts`, `renew/trust/state.ts` (+ 1 production call-site
update in `cli/commands/renew.ts`). Test diff: 13 files.
Aggregate: 18 files, +1065 / −105 lines at `f088997`; `89beb28` adds 4 files,
+101 / −5. Fixtures, schemas, package version, thresholds: untouched.
