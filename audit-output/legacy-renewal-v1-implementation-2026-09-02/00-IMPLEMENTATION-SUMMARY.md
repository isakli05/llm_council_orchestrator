# 00 — Implementation Summary

**Legacy Renewal V1 · 2026-09-02 · branch `feat/legacy-renewal-v1` (base `feat/cla…` = `feat/clarification-workspace` @ `7dd6477`)**
Owner harness note: implemented by the primary agent under gpt-5.6-sol-xhigh task brief; all work local (no push/merge).

## What was built

Legacy Application Renewal V1 — evidence-backed legacy application **analysis and modernization planning** (no execution) — inside `packages/spec-core/src/renew/` behind the audited seams:

- **STEP 1** `CodeIntelligenceProvider` + `GraphifyAdapter` (pinned external graphify `>=0.9.50 <0.10.0`, subprocess: explicit argv/no shell/timeouts/output caps, defensive graph.json reader, deterministic TS traversals cross-checked against the CLI on the fixture) + `StaticGraphProvider` (offline fixture graph).
- **STEP 2** Single-pass ingest walk (default-deny guards, symlink refusal, corpus caps) → content-hash manifest + **LCO-owned guarded workspace copy** (the analyzed repo is never written — graphify runs against our copy) + `ProjectSnapshot` (idempotent id; git-when-available + hash-index + stable graph-manifest digest) + machine-readable staleness.
- **STEP 3** `code_anchor` evidence kind (strict union; hash === anchor.content_hash; sha256 over raw bytes — the ONE canonical algorithm) + `AnchorVerifier` (recompute always; realpath containment; symlink-escape/traversal/directory refusal; seeded mutation property loop). Closes audit 05 §A.2 (decorative hashes).
- **STEP 4** `ContextProvider` (deterministic; provenance on every item; manifest-contained slices; secret redaction w/ counts; item/char/line/file caps; NO embeddings — the seam stays a seam).
- **STEP 5** `ArchitectureView` (pure structural: communities, symbol-level god nodes — graphify parity cross-checked, generated-pattern disclosure, honest unsupported-file coverage).
- **STEP 6** Recovery pipeline on the existing `LlmPlan`/budget machinery (role `renew_recover`): schema → ONE validation-informed retry → independent anchor verification; the LLM never assigns trust (`status` set only by the pipeline to `hypothesized`); rejected claims recorded with per-anchor reasons; immutable `AN-NNNN` records (usage-honest, context digest, never full prompts); transport/budget errors write nothing. Prompt-injection posture: all repo content fenced as untrusted data; canary tests prove containment.
- **STEP 7** Overlay (`overlay.json`): 13-relation audit vocabulary, anchored records, atomic persist, DERIVED staleness (superseded terminal).
- **STEP 8** Clarification integration: the EXISTING browser workspace reused unchanged (server/state-machine/client duck-typed over `ClarifySession`); new renewal distiller (uncertainties + overlay reviews + parity questions + the always-human strategy question), deterministic round driver, renewal approval records (APPR-NNNN, canonical locally-hashed evidence). Shared-code change is one seam: optional claim-id pattern in `validateAnswer`/`applyAnswersToRecords` (default DEC- — byte-identical for spec flows). Real-server round-trip test green.
- **STEP 9** Parity ledger operational: discovered behavior enters UNRESOLVED and blocks; nothing silently drops (DROP needs approval lineage); approval folding maps canonical language, ambiguous text stays unresolved visibly; gate re-verifies anchors against the live tree; projection to the spec `legacy` package refuses partial ledgers.
- **STEP 10** Deterministic planner: strategy-as-data (`selected_by:'human'` schema invariant), migration tasks on TaskContract (blast-radius `depends_on`, protected scopes for preserves, REAL `lco compile/verify exit 0` verification commands), bundle validated by the SAME gates (schema + lintBundle incl. L02/L03/L07/L10/L12/L13), frozen via the existing freeze path.
- **STEP 11** CLI `lco renew init|refresh|status|analyze|review|plan|export` (cores pure; all env/fs/clock/subprocess at the boundary; PAID markers in help; staleness refusals name the remedy), MCP `lco_renew_status`/`lco_renew_export` (read-only) + `lco_renew_analyze` (PAID: `LCO_MCP_ALLOW_GENERATE=1` + `renewConsentDigest`; zero calls without consent — tested), doctor Graphify check (informational), packed-install smoke extended.

## Validation (exact commands + results, 2026-09-02)

| check | command | result |
|---|---|---|
| build | `pnpm --filter ./packages/spec-core build` | OK (dist + regenerated `generated/spec-schema.json`, byte-exact gate green) |
| lint | `pnpm --filter ./packages/spec-core lint` | OK (both tsconfigs) |
| tests | `pnpm --filter ./packages/spec-core test` | **1822/1822 (133 files)** — baseline 1602/1602 at base; zero regressions |
| renewal suite | `npx vitest run src/renew` | all green incl. real-graphify integration (probe/build/health/god-nodes/affected/CLI cross-check, offline) |
| E2E fixture journey | `src/renew/e2e.test.ts` | PASS (scripted LLM, injected provider): init→analyze→review→plan --freeze→export; target byte-identical; staleness refusal w/ zero LLM calls; refresh recovers |
| anchor mutation | verifier seeded loop + adversarial suite | PASS |
| clarification round-trip | `src/renew/clarify/round-trip.test.ts` (REAL loopback server + token) | PASS |
| MCP handshake/tools | existing + updated server/stdio tests (13 tools) | PASS |
| MCP consent (paid) | `renew MCP tools` describe | PASS — missing consent / wrong digest / not-opted-in → ZERO model calls |
| packed install | `pnpm smoke:packed` | PASS incl. `renew` help + status fail-closed without Graphify |

Graphify integration: **installed 0.9.50, probe-supported, pinned range `>=0.9.50 <0.10.0`**; absence/unsupported/malformed all fail closed with actionable diagnostics (unit + integration tests).

Deviations from the audit: **none architectural** — see 10-DEVIATIONS (one placement decision + a doctor/MCP test-count evolution, both documented).
