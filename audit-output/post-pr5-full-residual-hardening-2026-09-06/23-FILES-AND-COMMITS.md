# 23 — Files and commits

> **Provenance correction (2026-09-06, docs-only):** the committed version of
> this report named `e46d574` as "Final implementation HEAD", omitted the two
> final commits, enumerated only 10 of 12 production files, and quoted the
> pre-final diff stats. Corrected below against fresh `git` derivation. No
> runtime/test/CI change accompanies this correction.

```
program branch point / base     = 602a51122831c62dc4b6f62e2213054c3201c492 (tree 2f1a702ec2e4c62e05112dfeeef760d7995984d9) = origin/main
plan commit                     = 4507409b3d2cd78d6a8c3de641416bb64402a46c
final production implementation = e47c4489ec0126cc0b7356056f75dd47ef84b485 (tree 9e3663345af5a3ebb2f1515768a9c9b33e93b347)
independently audited candidate = 0063ce37d9154352bbaf2bd7c7f87fbe3d4436f5 (tree cf4b736c04b5777a7daf1378ff6f3d0e7a4865b4)
```

The tail `e47c448 → 0063ce3` is ONE Graphify/generated-only commit (6 files
under `graphify-out/`); `git diff e47c448..0063ce3 -- packages/ .github/` is
empty.

## Snapshot scopes (defined once, used below)

- **Production implementation snapshot** = `602a511..e47c448` (16 commits).
- **Audited candidate snapshot** = `602a511..0063ce3` (17 commits); adds only
  the Graphify-only refresh on top of e47c448 — the same 65 paths change in
  both snapshots (the 6 graphify files are modified, not newly introduced).

## Commits (program order; `git log --oneline 602a511..0063ce3`, 17 rows)

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
| e47c448 | fix(evidence+config): close the four verifier-found Low residuals + final reports |
| 0063ce3 | chore(graphify): refresh graph for final hardening HEAD e47c448 |

(`e47c448` = the four verifier-found Low fixes — doctor own-`__proto__` parity
refusal, NoProtoKeySchema record maps, marker-debris cleanup, entry-probe
placement — plus reports 17–24, in ONE combined commit; there is no separate
"final docs commit". `0063ce3` = Graphify-only refresh of e47c448.)

## Production source changed (12 files)

Scope: `git diff --name-only 602a511..e47c448 -- packages/spec-core/src`,
non-test files = exactly 12. (The previous version of this report enumerated
only 10, omitting exactly `cli/commands/doctor.ts` and `renew/trust/state.ts` —
both verifier-fix files touched by `e47c448`.)

```
packages/spec-core/src/cli/commands/doctor.ts       (V-A parity: doctor refuses own __proto__ in LCO_LLM_EXTRA_BODY — e47c448)
packages/spec-core/src/cli/commands/renew.ts        (framing comment; fold dedupe NEW-F-01; L6 entry probe)
packages/spec-core/src/config/llm-config.ts         (I1 refines; V-A NoProtoKeySchema record maps — e47c448)
packages/spec-core/src/eval/llm/http.ts             (I1 env guard)
packages/spec-core/src/mcp/consent.ts               (L2 typed binding + total gate)
packages/spec-core/src/mcp/server.ts                (L2 renewalConsentState/gate wiring)
packages/spec-core/src/renew/trust/canonical.ts     (L1 null-proto replacer + own-key rule)
packages/spec-core/src/renew/trust/errors.ts        (I5 sub-shape doc)
packages/spec-core/src/renew/trust/evidence.ts      (I2 reorder; I3 doc; I4 cache; L3/L4 comments)
packages/spec-core/src/renew/trust/fs.ts            (L6 entry probe)
packages/spec-core/src/renew/trust/paid.ts          (L1 env guard)
packages/spec-core/src/renew/trust/state.ts         (L7/I5 classifier; I6+NEW-F-01 fold; L5 CAS fence; V-B marker-debris cleanup — e47c448)
```
(plus graphify-out generated artifacts — AST-only refresh, 6 files.)

## Test source changed/added (21 files)

Scope: `git diff --name-status 602a511..e47c448 -- packages/spec-core/src`,
`*.test.ts` = exactly 21 (19 modified + 2 added).

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
`git diff --stat 4507409..e47c448` = **33 files, +1906/−130** (12 production +
21 test; the final production implementation snapshot). The previously quoted
"32 files, +1797/−127" was the STALE `4507409..e46d574` figure (pre-e47c448)
and is superseded.

## File-count summary (every count with its diff range and category filter)

`git diff --name-status 602a511..e47c448` (identical path set for
`602a511..0063ce3`; 65 paths total in both):

| Category | Filter | Count |
|---|---|---|
| Production source | `packages/spec-core/src/**`, non-test | 12 |
| Test source | `packages/spec-core/src/**/*.test.ts` | 21 |
| Committed program reports | `audit-output/post-pr5-full-residual-hardening-2026-09-06/**` | 25 |
| Generated | `graphify-out/**` | 6 |
| Plan | `plans/2026-09-06-post-pr5-full-residual-hardening.md` | 1 |
| **Total changed paths** | | **65** |

Commit counts: `git rev-list --count` → base..e47c448 = **16**;
base..0063ce3 = **17**.
