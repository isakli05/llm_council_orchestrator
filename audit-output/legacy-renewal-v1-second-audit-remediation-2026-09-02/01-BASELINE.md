# 01 — Baseline

| Item | Value |
|---|---|
| remediation branch | `fix/legacy-renewal-v1-second-audit-blockers` (new) |
| base = audited second-audit HEAD | `40e6b1bfe15bc471d7ef09da5f3524fcd2312773` (`fix/legacy-renewal-v1-release-blockers`) |
| plan commit | `bc2b841` — plans/2026-09-02-legacy-renewal-v1-second-audit-root-invariant-remediation.md (committed before any production code) |
| implementation HEAD (pre-reports) | `b3fce5c3f5dd173ea2d05a1fd77f06380e564453` |
| implementation commits | 7 after the plan commit (INV-A/B, INV-C/D, INV-E/F1, MCP F2/A, INV-G+CI, INV-H, tests) |
| tools | node v24.14.0 · pnpm 10.17.1 · graphify 0.9.50 installed (0.9.53 verified in isolated venv; global untouched) |

## Baseline gates reproduced at 40e6b1b (before remediation)

build PASS · lint PASS · tests 150 files / 2,053 PASS · coverage PASS (93.64 / 89.19 / 96.08 / 93.64) · `git diff --check` CLEAN at HEAD (four trailing-whitespace lines existed vs `feat/legacy-renewal-v1` — S2-L-01, fixed here).

## Baseline audit evidence re-confirmed in source before coding

Every second-audit finding was root-confirmed by direct source inspection before implementation (see 02-ROOT-INVARIANTS §"previous failure variants"): the `.lco/renewal` symlink write path (`renewalPaths` plain `join` + writes without no-follow), the unjoined mutable `target_path`, the decisions-only approval digest, the keyword-first `rulingFromApprovedText` reused as gate authorization, prompt-membership-as-relevance in `runRecovery`'s check(), the Basic-auth redaction gap and unredacted graph metadata, `totalOf`'s slice-only accounting, `res.usage.{reasoning_tokens,…}` invented from the wrong object, `renewalConsentState` never populating `profileFingerprint`/`resolvedModel`, `parseGraphManifestStrict` mapping malformed `ast_hash` to `''`, key-order-sensitive `artifactHashes`, and the pre-lock store reads in both analyze and finishReview.

No discovery phase was run beyond this reconstruction — the audit's evidence was sufficient, per its own statement.
