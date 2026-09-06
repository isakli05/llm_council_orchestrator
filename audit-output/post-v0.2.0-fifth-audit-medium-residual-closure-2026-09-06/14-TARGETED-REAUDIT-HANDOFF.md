# 14 — Targeted Independent Re-Audit Handoff

Prepared for a completely fresh post-implementation auditor. The implementation
PM does NOT issue an audit verdict; closure confirmation is yours.

## Identity

- Branch: `fix/post-v0.2.0-fifth-audit-medium-residuals` (local; NOT pushed)
- Base SHA: `e7dedf034e92fc57616124dbdd7fe6ebffda8620` (= `origin/main` = tag `v0.2.0`; main has not advanced past the release)
- Final implementation HEAD: `89beb28` (last commit touching `packages/spec-core/src`); the two commits after it (`8a3931b` graphify refresh, then the final docs(audit) commit containing this report) add no code delta — verify with `git diff 89beb28..HEAD -- packages/`.
- Commits (base→implementation HEAD): `9ab2b8e` plan · `502ead0` fix M-02 · `133e407` tests M-02 · `d682533` fix M-01 · `45912c0` tests M-01 · `491fea9` fix M-04 · `fe6eeac` tests M-04 · `f088997` Composition H · `89beb28` verifier dispositions
- Production diff: `git diff e7dedf0..89beb28 -- packages/spec-core/src`: 5 files — `renew/trust/paid.ts`, `renew/trust/evidence.ts`, `renew/recovery/pipeline.ts`, `renew/trust/state.ts`, `cli/commands/renew.ts`. Everything else is tests + plan/reports.
- Reports: this directory (`audit-output/post-v0.2.0-fifth-audit-medium-residual-closure-2026-09-06/`, reports 00–14)
- Plan: `plans/2026-09-06-fifth-audit-medium-residual-closure.md` (commit `9ab2b8e`)

## Per-finding index (each finding's evidence trail)

| | S5-M-02 | S5-M-01 | S5-M-04 |
|---|---|---|---|
| Pre-fix reproduction | report 02 (RED: sentinel `undefined` on wire; live run recorded) | report 04 (visible≠visible, identity==identity, anchors resolve) | report 06 (RED: message claimed "retained separately" with zero markers; live run) |
| Root cause | report 02 §trace (two drop points, paid.ts) | report 04 (records-only digest payload) | report 06 (void swallow ×2 sites) |
| Fix | report 03 (`502ead0`) | report 05 (`d682533`) | report 07 (`491fea9`) |
| Targeted tests | `paid.test.ts` describe S5-M-02 + Composition F arm + `renew-consent-effectual.test.ts` MCP arm | `evidence.test.ts` describe S5-M-01 + cross-primitive closure join tests + matrix | `transaction-atomicity.test.ts` S5-M-04 cells (incl. real-FS EACCES) |
| Mutation result | 8/11 fail with fix reverted | 3 fail (closure flip, matrix, entry join) | 3 disclosure tests fail |
| Invariants | consent/wire equivalence; immutability; precedence; no logging | mutation⇒identity-change; key-order normalization stable; entry join refuses divergence | fail-closed in-process; disclosure on persistent failure; no fake evidence; S5-H-01 joins untouched |

## Full gate results (final HEAD `89beb28`; commands from `packages/spec-core`)

`pnpm build` PASS · `pnpm lint` PASS · `pnpm test` **191 files / 2624 tests, 0 failed, 0 skipped** · `pnpm test:coverage` exit 0 — **statements 94.42 / branches 90.99 / functions 97.22 / lines 94.42** (thresholds 91/89/96/91 unchanged) · `pnpm smoke:packed` PASS · `git diff --check` clean · schema freshness (regenerate → no diff) · frozen-spec (good-fixture-gate; fixtures dir zero-diff) · architecture guards green · transaction/recovery + Renewal E2E + S5-H-01 crash-window suites green.

## Protected-contract regression results

S5-H-01 re-proven CLOSED (join logic byte-identical — Verifier D's hunk-level diff + the 7 crash-window arms; report 10). S5-M-03 re-proven CLOSED (`LCO:COUNCIL_RUN` v1 untouched; zero new hash sites; `LCO:PAID_CONTEXT` v2 strictly one-domain-one-version-one-schema — report 10). ResolvedPaidOperation, EvidenceCitation, AuthorityGrant, StructuralIdentity, RenewalStateTransaction, CanonicalDigest, FilesystemCapability, MCP effectual consent (incl. new headers arm), support policy, active/historical separation, frozen-spec: all confirmed (report 10 + Verifier D point-by-point).

## Verifier wave (report 12)

Four fresh-context verifiers; all four verdicts: remediations HOLD / contracts CONFIRMED. Totals after dispositions: **0 Critical, 0 High, 0 Medium unresolved** (the one Medium — missing real-FS cell — FIXED in `89beb28`), 4 Low owner-residuals (recorded with rationale), 14 Info.

## Remaining residuals / known limitations (honest list)

1. **Physics (S5-M-04)**: under a persistent failure of the evidence channel, no durable marker is possible; the system's truthful response is the typed fail-closed disclosure — the reader-after-restart can see healthy state (asserted and documented in the repro). Rejected alternatives (pre-arm, second journal, journal clobber) recorded in plan §6.
2. **Scope/nowIso framing** (S5-M-01): rendered around the bundle but not bundle content; excluded by design (documented at the join and in the plan), recorded by Verifier B as a Low documentation-only residual now carried in-code.
3. Per-citation v2 digest cost without memoization (Low; memoization trades tamper-detection freshness — owner decision).
4. Seal items-vs-slices text cross-check absent (Low; impossible at the sole production call site; future-caller hardening).
5. TOCTOU retention phrase (Low; pre-existing wording; fail-closed instruction survives).
6. Same-process restart simulation (Low; soundness argued by Verifier C).
7. Pre-existing MCP consent-gate skip when role resolution fails at consent time (Info; Verifier A; predates this program — owner attention recommended).
8. Composition coverage is piecewise (MCP headers arm + real-FS cell added in `89beb28` narrow it; no single in-one-flow E2E of all three findings).
9. Forced re-consent: every route digest changed (`headers` joined the `LCO:CONSENT` preimage) — persisted consents fail the gate once and demand re-consent (fail-closed by design).

## No-publish confirmation

No push, no merge, no tag, no GitHub Release, no npm publish, no dist-tag change, no version bump (package stays 0.2.0 on the branch). The v0.2.0 release, its tag, and its merge commit were not modified in any way.

## Suggested re-audit entry points

`plans/2026-09-06-…md` (design + rejected alternatives) → reports 02–07 (repro+fix per finding) → 09 (mutation) → 10 (protected regression) → 12 (verifiers + dispositions) → the commits themselves (`git show 502ead0 d682533 491fea9 89beb28`) → re-run the gates independently. Suggested reproduction of any pre-fix state: disposable worktree + `git revert --no-commit <fix>` (never mutate this branch).

**Program status: `READY_FOR_MEDIUM_RESIDUAL_TARGETED_REAUDIT`**
