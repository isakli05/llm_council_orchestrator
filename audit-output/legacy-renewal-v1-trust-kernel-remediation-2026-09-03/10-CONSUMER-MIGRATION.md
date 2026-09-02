# 10 — Consumer Migration

Every trust-bearing consumer of Legacy Renewal V1, migrated to the Trust Kernel. No anonymous consumer: each row names the old path, the kernel primitive now owning the decision, and the disposition of the old implementation. "Architecture guard" = the rule in `src/renew/trust/architecture.test.ts` that fails the build if the old shape returns.

## A. Filesystem writers (primitive: FilesystemCapability, trust/fs.ts)

| # | Consumer | Old path | New path | Old impl removed | Guard |
|---|---|---|---|---|---|
| A1 | export `--out` | `atomicWrite` (renew.ts): mkdir + truncating fixed `.tmp` + rename; only `out` validated | `authorizedWrite` (noClobber) after contained-output preflight | deleted | write-primitive scan |
| A2 | project.json persist | `persistRenewalProject`: fixed `.tmp` truncating write | `authorizedWrite` wrapper | replaced in place | write-primitive scan |
| A3 | snapshot.json persist | `persistSnapshotFile`: same | same | replaced in place | write-primitive scan |
| A4 | state.json revision | `bumpStateRevision`: fixed `.tmp` truncating write | `bumpStateRevisionTrusted` (kernel) — wrapper delegates | replaced in place | write-primitive scan |
| A5 | overlay.json persist | `persistOverlay(path, store)` | `persistOverlay(projectDir, path, store)` → `authorizedWrite` | replaced in place | write-primitive scan |
| A6 | parity.json persist | `persistParity(path, store)` | same shape → `authorizedWrite` | replaced in place | write-primitive scan |
| A7 | strategy.json persist | `persistStrategy(path, d)` — unlocked call site in plan | `persistStrategy(projectDir, path, d)`; writes only inside the state tx commit | replaced in place | write-primitive scan |
| A8 | approvals write | `writeRenewalApproval(dir, record)` wx | `writeRenewalApproval(projectDir, dir, record)` → `authorizedCreateExclusive` | replaced in place | write-primitive scan |
| A9 | analysis records | `persistAnalysisRecord(dir, record)` wx | `(projectDir, dir, record)` → `authorizedCreateExclusive` | replaced in place | write-primitive scan |
| A10 | refresh supersession | `supersedeRenewalStores(paths, id)`: plain renames, 3 stores, collisions overwrite | `supersedeStoresForRefresh(dir, paths, id)`: no-clobber, archives spec too | replaced in place | write-primitive scan |
| A11 | workspace rebuild | `rmSync`/`mkdirSync` at init | `authorizedRemoveTree`/`authorizedEnsureDir` | deleted from renew.ts | write-primitive scan |
| A12 | guarded copy | `buildGuardedCopy` plain truncating writes | `authorizedCopyWrite` when a projectDir is supplied | fallback branch deleted in Phase 5 | write-primitive scan |
| A13 | spec/ write (plan) | `writeSpecDir` (spec-root lock, outside tx) | `stageSpecDir` inside the strict tx commit (one staging engine: `createDirAtomically`) | wrapper retained for non-renewal callers | write-primitive scan |
| A14 | spec swap engine | `storage/revision.ts` (pid-counter names; EEXIST cleanup deleted foreign occupants) | hardened in place: random suffixes, created-flag registration, foreign-safe cleanup — renewal reaches it only via the kernel | n/a (single engine) | allowlisted implementor |

## B. Trusted state reads + mutations (primitive: RenewalStateTransaction, trust/state.ts)

| # | Consumer | Old path | New path | Old impl removed | Guard |
|---|---|---|---|---|---|
| B1 | init persist block | unlocked writes after entry auth | writes under the renewal writer lock; refresh = strict tx (epoch revalidation) | unlocked path deleted | command-core assertions |
| B2 | analyze promotion fold | manual lock + `loadOverlay`/`loadParity` + snapshot equality + persist + bump | additive `runRenewalStateTx` over typed fresh state | manual lock block deleted | renew.ts must use `loadActiveState`, not `loadOverlay(` |
| B3 | review fold | manual lock + newest-filename approval rescan | additive tx + session-owned approval id + kernel validation | rescan deleted | same |
| B4 | plan | load-once, unlocked strategy write, spec under a different lock, no re-read | strict tx; strategy + spec staged inside the commit; any drift ⇒ typed refusal, nothing written | old sequence deleted | same |
| B5 | status | `loadRenewalState` + unjoined parity/strategy counts | typed `loadActiveState` view; corrupt/cross-snapshot rendered as such | `loadRenewalState` deleted (Phase 5) | deprecated-loader ban |
| B6 | export | same | same + typed rendering incl. strategy authority lineage | same | same |
| B7 | store loaders (overlay/parity/strategy) | direct `readFileSync` loaders | kernel reads via `authorizedRead` + pure parsers (`parse*Store`) | raw loaders deleted (Phase 5) | deprecated-loader ban |
| B8 | analysis records read | `loadAnalysisRecords` direct | active view epoch-split + corrupt list | directory loader retained for diagnostics only (no trust decision) | — |
| B9 | graph.json/manifest reads (staleness, init, recheck) | `readFileSync` + non-strict digest fallback | `authorizedRead` + `structuralIdentity` (strict; no fallback) | fallback digest deleted (Phase 5) | fallback-reconstruction ban |
| B10 | context slice reads | plain `readFileSync` on graph-node-derived paths | `authorizedRead` | old reader deleted | write/read rules |

## C. Evidence pipeline (primitive: EvidenceCitation, trust/evidence.ts)

| # | Consumer | Old path | New path | Old impl removed | Guard |
|---|---|---|---|---|---|
| C1 | context supply | whole-file hash only; no slice identity | slice items carry `slice_text_hash`/`file_line_count`/node binding → `assignContextRecords` | n/a (additive) | — |
| C2 | recovery prompt | ANCHORABLE FILES path→hash table; model copies path/hash + free ranges | CITABLE CONTEXTS id table; anchors = `{context_id, subrange?}` | old table + rule deleted | — |
| C3 | anchor verification | membership + whole-file range plausibility | `resolveCitation` (containment) + live-tree verify on resolved coordinates | old check() deleted | — |
| C4 | persisted anchors | model-authored payloads | server-resolved payloads (persisted schema unchanged) | n/a | — |
| C5 | parity/planner/export anchors | full model range payload spread | resolved payloads flow unchanged downstream | n/a | — |
| C6 | support policy | `support_status` decorative (parityGate never read it) | `assertSupportPolicy` load-bearing; ruled entries carry human_confirmed | decorative path deleted | consumer tests |

## D. Authority (primitive: AuthorityGrant, trust/authority.ts)

| # | Consumer | Old path | New path | Old impl removed | Guard |
|---|---|---|---|---|---|
| D1 | approval build/load | approvals.ts v2 digest, optional scope | kernel v3 builder + `validateRenewalApproval` (id/scope joins, evidence hashes) | v2 digest implementation deleted | digest-implementation locality |
| D2 | parityGate approval resolution | filename load, no id/project join | kernel validation with `expectedApprovalId` + `activeScope`; failure blocks | old resolver deleted | — |
| D3 | strategy selection | workspace without approval resolvable | schema-required approval_id + `verifyStrategyAuthority` | unverified path unrepresentable | schema refine + tests |
| D4 | review session record | v2 builder, optional scope | v3 builder; session passes REQUIRED projectName/snapshotId | old signature gone | — |

## E. Paid routes (primitive: ResolvedPaidOperation, trust/paid.ts)

| # | Consumer | Old path | New path | Old impl removed | Guard |
|---|---|---|---|---|---|
| E1 | CLI analyze legacy env | `createHttpLlm(oneLedger())`, model-only consent | `resolveLegacyEnvRoute` → `createPaidOperation` (route digest bound, wire cap) | direct construction deleted | transport-constructor ban in renewal surface |
| E2 | CLI analyze named profile | `buildRoleAdapter` (no wire hook) | + `wireCap(MAX_RECOVERY_WIRE_BYTES)` via RoleCallContext | hookless construction deleted | wire-hook co-presence rule |
| E3 | MCP renew named profile | two ledgers (transport + pipeline) | ONE opLedger + wire cap | second ledger deleted | same |
| E4 | MCP renew legacy env | `createHttpLlm()` (no transport ledger), model-only consent | paid-kernel adapter + routeDigest consent + opLedger | direct construction deleted | transport-constructor ban |
| E5 | MCP renew injected adapter | pipeline-only ledger | same opLedger | disconnected ledger deleted | — |
| E6 | pipeline completion accounting | unconditional `chargeAttempts(attempts)` (double charge) | `accountCompletionAttempts` (single-charge contract) | unconditional charge deleted | consumer tests |
| E7 | validation retry | uncapped | capped at the same wire boundary (every complete() measures) | uncapped path deleted | paid.test boundary tests |
| E8 | MCP lco_generate consent | digest of profile NAME before resolution | resolve-first + resolved-content fingerprint | name-only digest deleted | server tests |
| E9 | MCP lco_check consent | commands+expect only | + effectual execution dir (preview and authorization) | dirless digest deleted | consent tests |
| E10 | interactive clarify session | adapter bound to a DISCARDED runtime ledger; session capped on a second ledger | one session-sized ledger (`sessionLedgerEnvelope`) injected into both | orphaned-ledger construction deleted | — |
| E11 | egress projection | node_id/edge endpoints exempt "as identity"; retry issues unredacted; warnings persisted raw | all sanitized; persisted diagnostics scrubbed | exemption deleted | prompts tests |

## F. Structural identity (primitive: StructuralIdentity, trust/structural.ts)

| # | Consumer | Old path | New path | Old impl removed | Guard |
|---|---|---|---|---|---|
| F1 | manifest identity | snapshot.ts parser + non-strict digest fallback | kernel strict parser (one implementation; snapshot re-exports) | fallback deleted (Phase 5) | fallback ban |
| F2 | staleness digests | mixed strict/non-strict | `structuralIdentity` (strict, both inputs) everywhere | mixed paths deleted | — |
| F3 | graph health | optional status; probe failures statusless; manifest_digest never populated | total typed states (`probe_unavailable` added), kernel parser for manifest acceptance, digest populated | optional-status arms deleted | intel tests |

## G. Compatibility/CLI/docs

| # | Consumer | Change |
|---|---|---|
| G1 | verifyFrozen / ManifestSchema | unknown hash versions fail closed (S3-M-02); v1/v2 bytes unchanged |
| G2 | pre-Renewal fixture | committed immutable copy + continuous verify tests (S3-L-04) |
| G3 | READMEs | 13-command/13-tool surface, current test counts (S3-L-01) |
