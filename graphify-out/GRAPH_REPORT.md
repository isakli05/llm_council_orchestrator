# Graph Report - llm_council_orchestrator  (2026-09-07)

## Corpus Check
- 403 files · ~429,530 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2677 nodes · 7338 edges · 98 communities (96 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `692f9eb8`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- fs.ts
- app.ts
- pipeline.test.ts
- paths.ts
- coverage-hardening.test.ts
- lifecycle.ts
- sha256Content
- live-experiment.ts
- engine.ts
- models.ts
- generate.test.ts
- aggregate.ts
- manifest.json
- server/http.ts
- canonical.ts
- generate-interactive.ts
- INPUT_CEILINGS
- fixture-provider.ts
- doctor.ts
- corpus-lock.ts
- intel-contract.test.ts
- compilerOptions
- structural.ts
- server.ts
- commands/plan.test.ts
- GraphifyAdapter
- server.test.ts
- hash.ts
- graph-reader.ts
- eval/runner.ts
- orders.ts
- run-eval.test.ts
- score.ts
- errors.ts
- trust/state.ts
- budget.ts
- common.ts
- check/runner.ts
- devDependencies
- orchestrator.ts
- constraint-trace.test.ts
- spec-core/package.json
- trust/evidence.ts
- llm-config.ts
- recovery/prompts.ts
- package.json
- paid.ts
- renew-consent-effectual.test.ts
- init.ts
- root-invariants.test.ts
- copy-browser-assets.js
- verifier.ts
- compilerOptions
- revision.ts
- compile.test.ts
- pipeline.ts
- context/redact.ts
- tasks/index.ts
- subprocess.ts
- eval/runner.test.ts
- scale-benchmark.test.ts
- graphify-adapter.ts
- scripts
- stdio.ts
- architecture.test.ts
- parseLlmConfig
- orchestrator.test.ts
- generate.ts
- index.test.ts
- legacy-app/package.json
- ledger.ts
- renew.ts
- adapter.ts
- make-bins-executable.js
- check.test.ts
- packed-install-smoke.sh
- CodeIntelligenceProvider
- report.ts
- prepublish-check.js
- compileSpecDir
- graphify-adapter.test.ts
- manifest.ts
- files
- cli/index.ts
- prepublish-check.boundary.test.ts
- schemas/index.ts
- schemas/evidence.ts
- schemas/version.ts
- context-provider.ts
- strictness.test.ts
- ContextBundle
- contracts.ts
- bin
- readiness.ts
- dependencies
- repository

## God Nodes (most connected - your core abstractions)
1. `SpecBundle` - 85 edges
2. `LlmAdapter` - 53 edges
3. `cmdRenewInit()` - 52 edges
4. `parseGraphText()` - 49 edges
5. `runCli()` - 44 edges
6. `runPipeline()` - 43 edges
7. `renewalPaths` - 40 edges
8. `compileSpecDir()` - 39 edges
9. `lintBundle()` - 39 edges
10. `LlmResponse` - 38 edges

## Surprising Connections (you probably didn't know these)
- `compiledBundle()` --calls--> `compileSpecDir()`  [EXTRACTED]
  packages/spec-core/src/cli/commands/plan.test.ts → packages/spec-core/src/compiler/compile.ts
- `compiledBundle()` --calls--> `compileSpecDir()`  [EXTRACTED]
  packages/spec-core/src/cli/commands/trace.test.ts → packages/spec-core/src/compiler/compile.ts
- `CompileResult` --references--> `SpecBundle`  [EXTRACTED]
  packages/spec-core/src/compiler/compile.ts → packages/spec-core/src/schemas/index.ts
- `FreezeResult` --references--> `SpecBundle`  [EXTRACTED]
  packages/spec-core/src/compiler/freeze.ts → packages/spec-core/src/schemas/index.ts
- `HandleRpcOptions` --references--> `LlmAdapter`  [EXTRACTED]
  packages/spec-core/src/mcp/server.ts → packages/spec-core/src/eval/llm/adapter.ts

## Import Cycles
- 3-file cycle: `packages/spec-core/src/eval/budget.ts -> packages/spec-core/src/eval/llm/http.ts -> packages/spec-core/src/llm/openai-compatible.ts -> packages/spec-core/src/eval/budget.ts`

## Communities (98 total, 2 thin omitted)

### Community 0 - "fs.ts"
Cohesion: 0.14
Nodes (25): TrustFsError, authorizedCopyWrite(), authorizedCreateDirAtomically(), authorizedCreateExclusive(), authorizedEnsureDir(), authorizedRemoveTree(), authorizedRenameNoClobber(), authorizedStat() (+17 more)

### Community 1 - "app.ts"
Cohesion: 0.05
Nodes (77): ApiError, applyChanges(), applyRound(), approve(), bootstrapToken(), call(), cancel(), primeSessionId() (+69 more)

### Community 2 - "pipeline.test.ts"
Cohesion: 0.18
Nodes (11): depsFor(), freshDir(), makeBundle(), persisted, sealedFor(), setupTarget(), sha(), tmpDirs (+3 more)

### Community 3 - "paths.ts"
Cohesion: 0.12
Nodes (20): transitiveRenewalRootCheck(), assertDisjointRealRoots(), assertNoSymlinkBelow(), assertWritableSpecDir(), authorizeRenewalPaths(), tmpDirs, checkMcpDir(), ContainedOutputCheck (+12 more)

### Community 4 - "coverage-hardening.test.ts"
Cohesion: 0.05
Nodes (60): analyzeWithFresh(), DistillerInputs, distillRenewalQuestions(), makeRenewalDriver(), RENEWAL_CLAIM_ID, STRATEGY_CLAIM_ID, STRATEGY_OPTIONS, strategyQuestion() (+52 more)

### Community 5 - "lifecycle.ts"
Cohesion: 0.08
Nodes (37): applyUnderLock(), ChangeResult, cmdChange(), findingLine(), applyChangeSet(), ChangeSet, ChangeSetSchema, formatIssues() (+29 more)

### Community 6 - "sha256Content"
Cohesion: 0.08
Nodes (36): AnswerLedgerSchema, answersExportDocument(), APPROVAL_RECORD_SCHEMA_ID, approvalFileName(), ApprovalRecord, ApprovalRecordSchema, buildApprovalRecord(), ChangeLedgerSchema (+28 more)

### Community 7 - "live-experiment.ts"
Cohesion: 0.12
Nodes (20): aggregateEmitted(), EMITTED_SCHEMA, EmittedOutcome, loadRunDir(), parseEmittedOutcome(), renderAggregation(), baseScore(), BLOCKED (+12 more)

### Community 8 - "engine.ts"
Cohesion: 0.12
Nodes (21): EXPECT_GRAMMAR_DOC, EXPECTED_EXIT_PATTERN, isJudgeableExpect(), BAD, BadFixtureExpectation, RULES, rule, rule (+13 more)

### Community 9 - "models.ts"
Cohesion: 0.15
Nodes (12): BUILTIN_PROVIDERS, cmdModels(), fmt(), MAX_CATALOG_BYTES, ModelCatalogEntry, MODELS_REQUEST_TIMEOUT_MS, ModelsOptions, ModelsResult (+4 more)

### Community 10 - "generate.test.ts"
Cohesion: 0.10
Nodes (12): complete(), FAKE_ENV, fetchSpy(), jsonResponse(), PET_CLINIC, PROFILE_CONFIG, SECTION_FILES, SESSION_SERVICE (+4 more)

### Community 11 - "aggregate.ts"
Cohesion: 0.19
Nodes (14): Aggregation, VariantCost, binomialCdf(), binomialPmf(), binomialTail(), bisect(), choose(), clopperPearson95() (+6 more)

### Community 12 - "manifest.json"
Cohesion: 0.07
Nodes (28): artifact_hashes, assumptions, contracts, decisions, evidence, glossary, intent, requirements (+20 more)

### Community 13 - "server/http.ts"
Cohesion: 0.05
Nodes (39): ASSETS, baseBundle(), blockedJson(), complete(), fakeLlm(), REAL_FETCH, settle(), startWorkspace() (+31 more)

### Community 14 - "canonical.ts"
Cohesion: 0.20
Nodes (9): canonicalJsonOfIds(), CANONICAL_HASH_VERSION, canonicalJson(), canonicalReplacer(), DigestDomain, isKnownHashVersion(), KNOWN_HASH_VERSIONS, ITEMS (+1 more)

### Community 15 - "generate-interactive.ts"
Cohesion: 0.13
Nodes (24): atReview(), blockedBundle(), bundle(), complete(), OPTS, scriptedLlm(), sessionWith(), createClarifySession() (+16 more)

### Community 16 - "INPUT_CEILINGS"
Cohesion: 0.20
Nodes (6): GlossaryEntrySchema, IntentSchema, validIntent, INPUT_CEILINGS, validManifest, validTask

### Community 17 - "fixture-provider.ts"
Cohesion: 0.13
Nodes (19): affectedReverse(), godNodes(), graphHealthOf(), querySeeds(), shortestPath(), fixturePath, parsed, ParsedGraph (+11 more)

### Community 18 - "doctor.ts"
Cohesion: 0.10
Nodes (31): BIN_FILES, BUDGET_ENV, checkBins(), checkBudgetEnv(), checkLlmConfig(), checkLock(), checkMcpFlags(), checkNodeVersion() (+23 more)

### Community 19 - "corpus-lock.ts"
Cohesion: 0.24
Nodes (16): canonicalJson(), computeCorpusHash(), CORPUS_LOCK_VERSION, CorpusLock, CorpusLockEntry, frozenThresholds, loadCorpusLock(), lockCandidates() (+8 more)

### Community 20 - "intel-contract.test.ts"
Cohesion: 0.18
Nodes (12): FIXTURE_SRC, freshDir(), graphWorkspace(), readFileFixture(), tmpDirs, bindStructuralArtifacts(), artifactSet(), bindingFor() (+4 more)

### Community 21 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, esModuleInterop, lib, module, moduleResolution, noEmitOnError, outDir, rootDir (+11 more)

### Community 22 - "structural.ts"
Cohesion: 0.10
Nodes (33): createSnapshot(), deriveSnapshotId(), ProjectSnapshotSchema, reloadSnapshot(), Sha256, SnapshotFileEntrySchema, snapshotIdentityPayload(), SnapshotInputs (+25 more)

### Community 23 - "server.ts"
Cohesion: 0.06
Nodes (53): DEFAULT_GENERATE_PROFILE, authorizeExecution(), checkPreviewDigest(), consentDigestLine(), EXEC_OPT_IN_ENV, EXEC_ROOT_ENV, ExecAuthorization, ExecBoundary (+45 more)

### Community 24 - "commands/plan.test.ts"
Cohesion: 0.08
Nodes (22): cmdPlan(), PlanOptions, PlanResult, PlanTask, renderHuman(), renderJson(), compiledBundle(), FIXTURES (+14 more)

### Community 25 - "GraphifyAdapter"
Cohesion: 0.19
Nodes (4): neighborhood(), GraphifyAdapter, IntelFailure, IntelItems

### Community 26 - "server.test.ts"
Cohesion: 0.11
Nodes (18): callTool(), DIST_PRESENT, expectIdentical(), FIXTURES, freshOutside(), freshRoot(), frozenRoot(), injectionRoot() (+10 more)

### Community 27 - "hash.ts"
Cohesion: 0.10
Nodes (26): cmdVerify(), VerifyResult, artifactHashes(), canonicalSectionHash(), FIXTURES, freezeLegacyStyle(), HASHED_KEYS, makeSpecRoot() (+18 more)

### Community 28 - "graph-reader.ts"
Cohesion: 0.07
Nodes (34): ArchitectureViewSchema, buildArchitectureView(), GENERATED_PATTERNS, isGeneratedPath(), fixturePath, loadGraph(), MANIFEST, rawFixture (+26 more)

### Community 29 - "eval/runner.ts"
Cohesion: 0.09
Nodes (43): validateGenerationOutput(), DecomposedCouncilDeps, runDecomposedCouncil(), measurePromptSizes(), classifyAndProposeSingle(), classifySingle(), intentBlock(), judgeMerge() (+35 more)

### Community 30 - "orders.ts"
Cohesion: 0.22
Nodes (13): checkStock(), decrementStock(), stock, CATALOG, quote(), run(), createOrder(), OrderResult (+5 more)

### Community 31 - "run-eval.test.ts"
Cohesion: 0.26
Nodes (8): DEFAULT_REPORT_PATH, LIVE_ENV_VARS, missingLiveEnv(), parseArgs(), ParsedArgs, runEvalCli(), FAKE_LIVE_ENV, mockRunEvalAll

### Community 32 - "score.ts"
Cohesion: 0.17
Nodes (25): allUnGrounded(), anchorSentences(), checkConstraintTrace(), commitmentSurfaces(), ConstraintFailure, ConstraintFailureCode, containsTerm(), containsWholeTerm() (+17 more)

### Community 33 - "errors.ts"
Cohesion: 0.24
Nodes (6): isTrustError(), TrustAuthorityError, TrustCitationError, TrustDomainTag, TrustError, TrustStructuralError

### Community 34 - "trust/state.ts"
Cohesion: 0.05
Nodes (83): renewalConsentState(), renewalPaths, RenewalProject, RenewalProjectSchema, ProjectSnapshot, ParityStore, dirs, MINIMAL_PROJECT (+75 more)

### Community 35 - "budget.ts"
Cohesion: 0.07
Nodes (34): errOf(), Command, COMMANDS, GenerateVariant, InitProfile, parseArgs(), parseRenew(), ParseResult (+26 more)

### Community 36 - "common.ts"
Cohesion: 0.22
Nodes (13): AssumptionIdSchema, ContractIdSchema, DecisionIdSchema, EvidenceIdSchema, IdSchema, ImpactLevelSchema, RequirementIdSchema, TaskIdSchema (+5 more)

### Community 37 - "check/runner.ts"
Cohesion: 0.05
Nodes (35): parseExpect(), REDACTION_RULES, RedactionRule, redactSecrets(), SecretKind, activeProcessGroups, childCtl, FIXTURES (+27 more)

### Community 38 - "devDependencies"
Cohesion: 0.15
Nodes (13): jsdom, devDependencies, jsdom, @types/node, typescript, vitest, @vitest/coverage-v8, zod-to-json-schema (+5 more)

### Community 44 - "orchestrator.ts"
Cohesion: 0.06
Nodes (58): applyEnrichment(), buildEnrichPrompt(), CLARIFY_ENRICH_PROTOCOL, DecisionEnrichment, EnrichedItemSchema, EnrichOutputSchema, EnrichParseResult, MAX_CONTEXT_CHARS (+50 more)

### Community 45 - "constraint-trace.test.ts"
Cohesion: 0.09
Nodes (23): et07Requirement(), et12Requirement(), failureCodes(), FIXTURES, genericBundleFor(), groundedEt01(), groundedEt02(), groundedEt04() (+15 more)

### Community 46 - "spec-core/package.json"
Cohesion: 0.22
Nodes (8): description, engines, node, license, main, name, type, version

### Community 48 - "trust/evidence.ts"
Cohesion: 0.10
Nodes (19): bundleDigestCache, bundleDigestPayload(), CitationClaim, CitationClaimSchema, contextBundleDigest(), ContextBundleIdentity, ContextRecord, deepFreezeItem() (+11 more)

### Community 49 - "llm-config.ts"
Cohesion: 0.11
Nodes (18): RFC-7230, BaseUrlSchema, HeaderNameSchema, LINK_LOCAL_PREFIXES, LlmConfigSchema, METADATA_HOSTS, NoProtoKeySchema, OpenRouterRoutingSchema (+10 more)

### Community 50 - "recovery/prompts.ts"
Cohesion: 0.30
Nodes (13): redactSecrets(), runRecovery(), buildRecoveryPrompt(), buildValidationRetryPrompt(), countEgressRedactions(), EgressProjection, escapeLineUnsafe(), projectItemForEgress() (+5 more)

### Community 51 - "package.json"
Cohesion: 0.25
Nodes (7): _archival, name, packageManager, private, scripts, test:spec, version

### Community 53 - "paid.ts"
Cohesion: 0.17
Nodes (15): TrustPaidError, accountCompletionAttempts(), createPaidOperation(), deepFreeze(), deepFreezeRoute(), BASE_ENV, MAX_RECOVERY_WIRE_BYTES, ownField() (+7 more)

### Community 54 - "renew-consent-effectual.test.ts"
Cohesion: 0.11
Nodes (17): generateOptInFromEnv(), callRenewAnalyze(), callRenewStatus(), FIXTURES, TMP_PIN, tmpDirs, errorResponse(), callTool() (+9 more)

### Community 55 - "init.ts"
Cohesion: 0.18
Nodes (12): buildSections(), cmdInit(), Contract, Decision, EvidenceItem, GlossaryEntry, InitOptions, InitResult (+4 more)

### Community 56 - "root-invariants.test.ts"
Cohesion: 0.22
Nodes (13): build(), ctxWindow(), FIXTURE_SRC, freshDir(), graphCaps(), groundedResponse(), initProject(), interiorCitation() (+5 more)

### Community 57 - "copy-browser-assets.js"
Cohesion: 0.25
Nodes (7): { copyFileSync, mkdirSync, readdirSync, writeFileSync }, files, { join }, MIME, outDir, root, srcDir

### Community 58 - "verifier.ts"
Cohesion: 0.18
Nodes (10): AnchorBatchResult, AnchorFailureCode, AnchorVerification, canonicalFileHash(), CodeAnchorInput, countLines(), isValidAnchorPath(), tmpDirs (+2 more)

### Community 59 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck (+7 more)

### Community 60 - "revision.ts"
Cohesion: 0.08
Nodes (27): SECTION_KEYS, stageSpecDir(), PET_CLINIC, SECTION_FILES, tmpDirs, writeSpecDir(), assertNotSymlink(), acquireSpecRootLock() (+19 more)

### Community 61 - "compile.test.ts"
Cohesion: 0.29
Nodes (3): FIXTURES, SECTION_FILES, tmpDirs

### Community 62 - "pipeline.ts"
Cohesion: 0.09
Nodes (24): MAX_RECOVERY_PROMPT_BYTES, RecoveryOutcome, UsageState, zodIssues(), AnalysisUsageSchema, AnchorResult, AnchorResultSchema, AnchorScope (+16 more)

### Community 63 - "context/redact.ts"
Cohesion: 0.31
Nodes (9): credentialAssignmentEnd(), isIdentCont(), isIdentStart(), isInlineSpace(), isValueStop(), redactCredentialAssignments(), RedactionResult, Rule (+1 more)

### Community 64 - "tasks/index.ts"
Cohesion: 0.05
Nodes (32): BASE, complete(), unresolvedBundle(), BUNDLE_OK(), CLASSIFIER_BLOCK, CLASSIFIER_OK, complete(), et01Bundle() (+24 more)

### Community 65 - "subprocess.ts"
Cohesion: 0.24
Nodes (6): cleanup, installedVersion, runSubprocess(), SubprocessOptions, SubprocessResult, tmpDirs

### Community 67 - "eval/runner.test.ts"
Cohesion: 0.24
Nodes (7): complete(), counterOnlyUnresolvedBundle(), et01Bundle(), PET_CLINIC, proposalAJson(), unresolvedAddedBundle(), unresolvedPlusLintDirtyBundle()

### Community 68 - "scale-benchmark.test.ts"
Cohesion: 0.10
Nodes (16): ClosureFinding, ClosureFindingCode, closureFindings(), DuplicateTaskId, duplicateTaskIds(), firstOverlap(), globSegments(), globsOverlap() (+8 more)

### Community 73 - "graphify-adapter.ts"
Cohesion: 0.16
Nodes (12): fixturePath, parsed, compareTriple(), DEFAULTS, GraphifyAdapterOptions, MAX_EXCLUSIVE, MIN_VERSION, SUPPORTED_GRAPHIFY_RANGE (+4 more)

### Community 74 - "scripts"
Cohesion: 0.22
Nodes (9): scripts, build, lint, prepublishOnly, pretest, smoke:packed, test, test:coverage (+1 more)

### Community 75 - "stdio.ts"
Cohesion: 0.10
Nodes (20): isJsonRpcId(), isPlainObject(), validateJsonRpcEnvelope(), EPIPE_DRAIN_TIMEOUT_MS, EXIT_CLIENT_GONE, EXIT_DRAIN_TIMEOUT, EXIT_OK, jsonRpcError() (+12 more)

### Community 77 - "architecture.test.ts"
Cohesion: 0.31
Nodes (7): allSpecifiers(), importSpecifiers(), PKG, productionFiles(), REL(), renewalSurface(), WRITE_PRIMITIVES

### Community 78 - "parseLlmConfig"
Cohesion: 0.21
Nodes (8): GLM, resolveSingleRole(), LlmConfig, parseLlmConfig(), resolveProfile(), VALID, zodIssues(), loadLlmConfigForProfiles()

### Community 79 - "orchestrator.test.ts"
Cohesion: 0.27
Nodes (8): MAX_CLARIFY_ROUNDS, atReview(), blockedBundle(), bundle(), complete(), OPTS, scriptedLlm(), sessionWith()

### Community 80 - "generate.ts"
Cohesion: 0.09
Nodes (26): ClarifySessionOptions, buildLlmPlanFromProfile(), checkIntent(), clarificationBlock(), cmdGenerate(), GenerateOptions, GenerateResult, IntentCheck (+18 more)

### Community 82 - "index.test.ts"
Cohesion: 0.29
Nodes (5): validBundle, validManifest, TraceEdgeSchema, LegacyPackageSchema, validLegacy

### Community 83 - "legacy-app/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, version

### Community 87 - "ledger.ts"
Cohesion: 0.04
Nodes (88): ArchitectureView, loadRenewalApproval(), nextRenewalApprovalId(), RenewalApprovalLoad, RenewalDecisionSet, RenewalDecisionSetSchema, payload, tmpDirs (+80 more)

### Community 89 - "renew.ts"
Cohesion: 0.04
Nodes (92): affectedSync(), cmdRenewAnalyze(), cmdRenewExport(), cmdRenewInit(), cmdRenewPlan(), cmdRenewRefresh(), cmdRenewReview(), cmdRenewStatus() (+84 more)

### Community 90 - "adapter.ts"
Cohesion: 0.08
Nodes (36): ResolvedRole, LlmAdapter, LlmCompleteOptions, LlmResponse, baseConfig(), jsonResponse(), okBody(), ChatResponse (+28 more)

### Community 92 - "make-bins-executable.js"
Cohesion: 0.50
Nodes (3): BINS, { join }, { readFileSync, chmodSync }

### Community 96 - "check.test.ts"
Cohesion: 0.21
Nodes (8): evidenceOf(), evidencePath(), FIXTURES, freshRoot(), initRoot(), makeSpecRoot(), SECTION_FILES, tmpDirs

### Community 97 - "packed-install-smoke.sh"
Cohesion: 1.00
Nodes (3): run(), say(), packed-install-smoke.sh script

### Community 99 - "report.ts"
Cohesion: 0.11
Nodes (34): BadFixtureCapture, calcs(), GateCalcs, GateReportInput, gateVerdict, groundedBundleFor(), renderGateReport(), BAD (+26 more)

### Community 100 - "prepublish-check.js"
Cohesion: 0.29
Nodes (5): describe, pkg, result, { spawnSync }, status

### Community 103 - "compileSpecDir"
Cohesion: 0.07
Nodes (33): FIXTURES, frozenSpecRoot(), inlineBundle(), makeSpecRoot(), SECTION_FILES, tmpDirs, cmdCompile(), compileFailedOutput() (+25 more)

### Community 104 - "graphify-adapter.test.ts"
Cohesion: 0.20
Nodes (6): parseGraphifyVersion(), bindingTextFor(), fixtureGraphText, fixturePath, validManifestText, workspaceFiles()

### Community 105 - "manifest.ts"
Cohesion: 0.27
Nodes (6): ComplexityProfileSchema, Sha256Schema, SpecStateSchema, Manifest, ManifestSchema, validManifest

### Community 106 - "files"
Cohesion: 0.33
Nodes (6): files, dist, examples, generated, LICENSE, README.md

### Community 107 - "cli/index.ts"
Cohesion: 0.09
Nodes (22): CheckOutcome, commandHelp(), renewSubHelp(), FIXTURES, SECTION_FILES, tmpDirs, CheckResult, cmdCheck() (+14 more)

### Community 110 - "prepublish-check.boundary.test.ts"
Cohesion: 0.50
Nodes (3): DIST_PRESENT, git(), makeRepo()

### Community 111 - "schemas/index.ts"
Cohesion: 0.04
Nodes (36): renderTrace(), compiledBundle(), FIXTURES, SECTION_FILES, tmpDirs, TraceResult, ApplyResult, GOOD (+28 more)

### Community 112 - "schemas/evidence.ts"
Cohesion: 0.36
Nodes (5): codeAnchorItem, CodeAnchorPayloadSchema, evidenceCommon, EvidenceItemSchema, validEvidence

### Community 113 - "schemas/version.ts"
Cohesion: 0.36
Nodes (7): checkSpecSchemaVersion(), ParsedVersion, parseVersion(), SPEC_SCHEMA_VERSION, SpecSchemaVersionFieldSchema, SpecSchemaVersionVerdict, SUPPORTED

### Community 115 - "context-provider.ts"
Cohesion: 0.10
Nodes (19): ContextBundleSchema, ContextItem, ContextItemSchema, ContextLimits, RENEW_CONTEXT_LIMITS, AnalysisScope, ContextProvider, GraphContextProvider (+11 more)

### Community 117 - "strictness.test.ts"
Cohesion: 0.25
Nodes (5): DecisionSchema, validDecision, FIXTURES, validManifest, validTask

### Community 120 - "ContextBundle"
Cohesion: 0.15
Nodes (7): ContextBundle, SCRIPTED_INVALID, tmpDirs, RecoveryRequest, RecoveryPromptArgs, oneSliceBundle(), tmpDirs

### Community 126 - "bin"
Cohesion: 0.67
Nodes (3): bin, lco, lco-mcp

### Community 128 - "readiness.ts"
Cohesion: 0.50
Nodes (3): evaluateReleaseReadiness(), ReleaseReadiness, ReleaseReadinessInput

### Community 129 - "dependencies"
Cohesion: 0.67
Nodes (3): dependencies, zod, zod

### Community 131 - "repository"
Cohesion: 0.67
Nodes (3): repository, type, url

## Knowledge Gaps
- **708 isolated node(s):** `name`, `version`, `private`, `packageManager`, `_archival` (+703 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SpecBundle` connect `schemas/index.ts` to `lifecycle.ts`, `sha256Content`, `engine.ts`, `generate.test.ts`, `server/http.ts`, `generate-interactive.ts`, `server.ts`, `commands/plan.test.ts`, `hash.ts`, `eval/runner.ts`, `score.ts`, `budget.ts`, `check/runner.ts`, `orchestrator.ts`, `constraint-trace.test.ts`, `revision.ts`, `compile.test.ts`, `tasks/index.ts`, `eval/runner.test.ts`, `scale-benchmark.test.ts`, `orchestrator.test.ts`, `generate.ts`, `ledger.ts`, `report.ts`, `compileSpecDir`, `cli/index.ts`?**
  _High betweenness centrality (0.082) - this node is a cross-community bridge._
- **Why does `LlmAdapter` connect `adapter.ts` to `pipeline.test.ts`, `generate.test.ts`, `server/http.ts`, `generate-interactive.ts`, `server.ts`, `server.test.ts`, `eval/runner.ts`, `budget.ts`, `orchestrator.ts`, `constraint-trace.test.ts`, `paid.ts`, `root-invariants.test.ts`, `tasks/index.ts`, `eval/runner.test.ts`, `orchestrator.test.ts`, `generate.ts`, `ledger.ts`, `renew.ts`, `context-provider.ts`, `ContextBundle`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Why does `GraphifyAdapter` connect `GraphifyAdapter` to `subprocess.ts`, `CodeIntelligenceProvider`, `graphify-adapter.test.ts`, `graphify-adapter.ts`, `cli/index.ts`, `fixture-provider.ts`, `intel-contract.test.ts`, `ledger.ts`, `server.ts`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _708 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `fs.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13949579831932774 - nodes in this community are weakly interconnected._
- **Should `app.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05142941349837902 - nodes in this community are weakly interconnected._
- **Should `paths.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1206896551724138 - nodes in this community are weakly interconnected._