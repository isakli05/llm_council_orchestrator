# 23 — Files and Commits

Base origin/main 1b7fe6e (tree be5fe190) → final production implementation HEAD
744a5a5 (tree 75f4113003219ae02aee92141b8355a0b06b58fe; after the
verifier-response fixes).

## Commits (base..HEAD, in order)

| SHA | Subject |
|---|---|
| 881b308 | docs(program): pre-v0.2.1 final low/info hardening — plan + canonical 27-residual ledger |
| 68d3504 | fix(config): harden roles record keys and own-property profile/provider resolution (NF-1, NF-2, N1) |
| 3f7e732 | fix(evidence): typed cleanup failures, debris attribution, honest landed-commit arm (E-1, E-3, INFO-A, E-2-doc) |
| b05b54a | fix(trust): typed refusal for non-JSON-serializable durable payloads (D-F-01) |
| 753db8e | test(trust): pin probe placement, seal call-site count, changed-statement fold (F-L6-1, M-2, B-2, M-1) |
| 616f4ed | test(browser): replace residual fixed waits with observable state; fix the double-boot race (H-1, N3–N5) |
| fb71c14 | test(ci): silence the expected lock diagnostic in stdio tests; dist-presence canaries under CI (H-2) |
| 053ce3f | docs(audit+store): correct I4 ceiling attribution and L7 mutation-form wording; document the overlay-key boundary (H-3, F-L7-1, D-OBS-1) |
| fb30d6d | test(trust): pre-v0.2.1 cross-residual composition C1-C5 |
| 1e73633 | test(evidence): pin the commit-cleanup ownership conditioning (S2a) |
| 744a5a5 | fix(trust+config+tests): close verifier-found residuals from the fresh verification wave (N-B1 typed post-rollback removal; N-1 non-empty role keys; wording/hygiene) |

Final production implementation = 744a5a5. Tail after it (exact, recorded in the
evidence-cleanup commit): docs(audit) program reports 692f9eb
(692f9eb83c6aba9abcccf35ba219688f77f86fab) → chore(graphify) refresh fc3ee96
(fc3ee9650fcf1b0774473156a0f3aa178fb00b6e, tree 27c6646ea7eb5855c76c7555fe2bda113cdc8362
— graphify-out/ only; this is the independently audited candidate) → the post-audit
evidence-cleanup docs commit (this report set only; identity via `git rev-parse HEAD`).

## Changed files (base..1e73633) — 22 code/test files + 3 docs

Production (4, unchanged by 744a5a5 in file set): config/llm-config.ts · cli/commands/models.ts · renew/trust/state.ts ·
renew/core/store-records.ts (comment only).
Tests (18): config/llm-config.test.ts · cli/commands/models.test.ts ·
renew/trust/transaction-atomicity.test.ts · renew/trust/architecture.test.ts ·
renew/trust/concurrency.test.ts · renew/trust/pre-v021-composition.test.ts (new) ·
browser-client/app.test.ts · browser-client/app-errors.test.ts · server/http.test.ts ·
mcp/server.test.ts · mcp/stdio.test.ts · server/assets.test.ts ·
renew/clarify/round-trip.test.ts · renew/review-interactive.test.ts ·
build/bin-contract.test.ts · cli/commands/init-concurrency.test.ts ·
release/prepublish-check.boundary.test.ts · cli/commands/doctor.test.ts.
Tests added in 744a5a5: S11 (transaction-atomicity), N-1 cell (llm-config),
composition CI canary, browser/http hygiene cells.

[Corrected in the evidence-cleanup commit: the label previously read "Tests (17)"
over this same 18-file enumeration; Git-derived count base→744a5a5 is 18
(`git diff --name-only 1b7fe6e..744a5a5 | grep '^packages/.*test\.ts$'`), and
744a5a5 adds no file outside the enumerated set.]

Docs: prior-program 13-I4 + 19-MUTATION corrections; program plan; this program's
25-report set (audit-output/pre-v0.2.1-final-low-info-hardening-2026-09-06/).
