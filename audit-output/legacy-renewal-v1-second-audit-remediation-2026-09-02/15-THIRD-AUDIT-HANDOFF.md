# 15 — Third-Audit Handoff

For each load-bearing invariant: the exact source boundary, the exact test command, the original audit reproduction, neighbor-variant tests, and the expected safe outcome. Challenge the implementation without trusting these reports.

Conventions: run tests from `packages/spec-core` (`cd packages/spec-core && npx vitest run <file>`); CLI probes via `node packages/spec-core/dist/cli/index.js …` after `pnpm --filter ./packages/spec-core build`. Scripted providers only — zero real paid calls in any path below.

## INV-A — filesystem trust domain

- Boundary: `authorizeRenewalPaths` (src/storage/paths.ts) + `renewalStateDestinations`/`authorizeRenewalState` (src/renew/project/project.ts); MCP facet `transitiveRenewalRootCheck` (src/mcp/server.ts).
- Tests: `npx vitest run src/renew/root-invariants.test.ts src/renew/isolation.test.ts src/mcp/renew-consent-effectual.test.ts`
- Original repro: pre-plant `<project>/.lco/renewal` symlink → target subdir; `lco renew init` must exit 2 and the target inventory (bytes/modes/symlinks/entries) must be identical.
- Neighbors to attack: `.lco` symlink with REFRESH (does anything rm/write before authorization?); `analyses` symlink via ANALYZE; `approvals` symlink via REVIEW; `spec` symlink via PLAN --freeze; `.tmp` siblings at fold time; project root itself behind a legit symlinked ancestor (must still WORK — the walk polices below the resolved root only); MCP project-in-pin/target-outside-pin.

## INV-B — identity join + versioned state

- Boundary: `assertTargetSnapshotJoin`, `readStateRevision`/`bumpStateRevision` (src/renew/project/project.ts); folds in src/cli/commands/renew.ts (`analyzeWithFresh`, `finishReview`).
- Tests: `npx vitest run src/renew/root-invariants.test.ts src/renew/renew-branches.test.ts src/renew/e2e.test.ts`
- Original repros: (S2-H-11) repoint project.json `target_path` to an identical clone → status must refuse with `target identity mismatch`, never fresh; (S2-M-01) rule PAR-0001 preserve while a second analyze's paid call is in flight → the ruling must survive the fold.
- Neighbors: symlink-ALIAS target (same realpath — must PASS: same source); clone with one byte changed (join or staleness must refuse); tampered snapshot.json root_realpath (self-verify fails); mid-call supersession (fold refuses); lock-held second writer (explicit refusal); approval APPR-0002 after APPR-0001 (newer human supersedes older — verify the fold ordering assumption: finishReview loads the NEWEST on-disk record).

## INV-C — provenance vs support

- Boundary: `check()` + promotion stamping (src/renew/recovery/pipeline.ts); schemas (src/renew/recovery/schemas.ts: `AnchorResult.scope`, `support_status`); parity `support_status` (src/renew/parity/ledger.ts); renderers (renew.ts output, export.ts).
- Tests: `npx vitest run src/renew/root-invariants.test.ts src/renew/anchors/verifier.test.ts src/renew/tranche4.test.ts`
- Original repro: banking claim anchored to a supplied-but-irrelevant file → provenance ok, `scope:'whole_file'`, `support_status:'unvalidated'`, output says provenance-verified/NON-machine-validated.
- Neighbors: irrelevantly-anchored UNCERTAINTY (same honesty in export?); mixed relevant/irrelevant anchors; valid node+range on the wrong claim (still unvalidated); grep every render path for any machine-set "validated/confirmed support" vocabulary.

## INV-D — authority digest + canonical rulings

- Boundary: `renewalApprovalDigest`/`loadRenewalApproval` (src/renew/clarify/approvals.ts); `canonicalRuling`/`applyApprovalToParity`/`parityGate`/`loadParity`/`addParityEntry` (src/renew/parity/ledger.ts); PAR options (src/renew/clarify/distiller.ts).
- Tests: `npx vitest run src/renew/parity/ledger.test.ts src/renew/clarify/approvals.test.ts src/renew/clarify-trust.test.ts src/renew/root-invariants.test.ts`
- Original repros: (S2-C-04) change approval snapshot_id → digest_mismatch, DROP not authorized; (S2-C-05) "Do not drop; preserve" → unresolved, only canonical 'drop' rules drop.
- Neighbors: tamper each authority field one at a time; 'DROP'/'drop '/unicode-lookalike option ids (exact identity — all non-canonical); canonical 'drop' + contradicting free text (rules drop BY CONTRACT — challenge whether you accept the contract); duplicate decisions for one claim; semantic parity duplicates via two addParityEntry calls with different anchors.

## INV-E — egress/envelope/cap/coverage

- Boundary: src/renew/context/redact.ts; src/renew/recovery/prompts.ts (`serializeSourceDocumentSafe`, egress projection); src/renew/context/context-provider.ts (`serializedSizeOfItem`); pipeline cap (`MAX_RECOVERY_PROMPT_BYTES`, `blocked_prompt_budget`); archview/planner coverage.
- Tests: `npx vitest run src/renew/context/redact.test.ts src/renew/recovery/prompts.test.ts src/renew/context/context-provider.test.ts src/renew/root-invariants.test.ts src/renew/egress.test.ts`
- Original repros: Basic-auth value unredacted; graph-label sentinel in the prompt; U+2028 forging an END marker; 8k-declared/4MB prompt; 150-file unsupported set truncated.
- Neighbors: lowercase/odd-spacing auth headers; secrets in node labels/source_location; marker-lookalike text inside slices; prompt just-under vs just-over 1MB (proceed vs blocked_prompt_budget with zero calls); 51-file unsupported set (two COVERAGE chunks); complexity ratio at N/2N.

## INV-F — budget/consent

- Boundary: `complete()` charging/accounting (src/renew/recovery/pipeline.ts); CLI one-ledger construction (src/cli/index.ts renew case); `renewalConsentState` + digest inputs (src/mcp/server.ts, src/mcp/consent.ts).
- Tests: `npx vitest run src/renew/root-invariants.test.ts src/mcp/renew-consent-effectual.test.ts src/renew/tranche5.test.ts`
- Original repros: maxAttempts=1 accepted attempts=2 with ledger 0 → now BudgetExceededError, nothing promoted; two model configs under one profile name shared a digest → now different digests on the actual server path.
- Neighbors: attempts absent (charged 1); provenance-cost/usageDetails/latencyMs fidelity; digest across differing gateway/routingMode/dirs/LCO_LLM_MODEL; unresolvable profile (refused before any adapter exists).

## INV-G — graphify identity

- Boundary: `parseGraphManifestStrict` (src/renew/snapshot/snapshot.ts); `parseGraphFile` (src/renew/intel/graph-reader.ts); `graphHealth` (src/renew/intel/graphify-adapter.ts).
- Tests: `npx vitest run src/renew/intel/graph-reader.test.ts src/renew/intel/graphify-adapter.test.ts src/renew/tranche7.test.ts` (+ real integration: `src/renew/intel/graphify-adapter.integration.test.ts` on 0.9.50; isolated 0.9.53 via a venv PATH override).
- Original repro: `{}` / missing-hash / scalar manifests and duplicate node ids parsed OK.
- Neighbors: numeric/empty ast_hash; entry `null`; manifest `'null'`/`'[]'`; duplicate ids among FILE nodes; health on each shape (never healthy-with-zero).

## INV-H — compat/CLI

- Boundary: compiler/{hash,verify,compile,validation,freeze}.ts + schemas/manifest.ts; cli/args.ts; mcp/server.ts git probe.
- Tests: `npx vitest run src/compiler src/cli/args.test.ts` + live fixture: `node dist/cli/index.js verify /tmp/lco-base-compat-AuKMbq` (exit 0) and a copy with one changed value (exit 1, drifted).
- Original repro: pre-Renewal frozen spec falsely drifted (base 0 / current 1) — now 0.
- Neighbors: v2-strict mode ignores the legacy fallback; array-order changes DO drift (arrays are semantically ordered); nested key reorder passes; every CLI grammar mutant; MCP plain-target probe emits no `fatal:` on stderr.

## Acceptance framing for the third audit

`READY_FOR_THIRD_INDEPENDENT_AUDIT` means: every root invariant has a shared enforcement point with mutation-sensitive tests, all ordinary gates pass (build/lint/2187 tests/coverage/packed/MCP/Graphify), and the audit's own reproductions fail closed. It does NOT mean release GO — that verdict belongs to the third audit alone.
