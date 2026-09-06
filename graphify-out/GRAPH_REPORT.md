# Graph Report - llm_council_orchestrator  (2026-09-06)

## Corpus Check
- 400 files · ~410,814 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2643 nodes · 7237 edges · 121 communities (119 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `89beb287`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- generate.ts
- browser-client/state.ts
- pipeline.test.ts
- check/runner.ts
- cli/index.ts
- context-provider.ts
- pipeline.ts
- aggregate.ts
- engine.ts
- enrich.ts
- generate.test.ts
- consent.ts
- manifest.json
- tranche6.test.ts
- isolation.test.ts
- verifier.ts
- INPUT_CEILINGS
- server.ts
- doctor.ts
- generate-interactive.ts
- structural.ts
- compilerOptions
- orchestrator.ts
- report.ts
- strictness.test.ts
- fixture-provider.ts
- server/http.ts
- SpecBundle
- eval/runner.test.ts
- eval/runner.ts
- orders.ts
- schemas.ts
- fs.ts
- coverage-hardening.test.ts
- graph-reader.ts
- constraint-trace.test.ts
- tasks/index.ts
- index.test.ts
- devDependencies
- trust/state.ts
- commands/trace.test.ts
- schemas/version.ts
- renewalPaths
- common.ts
- model.ts
- app.ts
- spec-core/package.json
- sha256Content
- paths.ts
- llm-config.ts
- intel-contract.test.ts
- package.json
- tranche4.test.ts
- paid.ts
- scale-benchmark.test.ts
- parseGraphText
- root-invariants.test.ts
- copy-browser-assets.js
- recovery/prompts.ts
- compilerOptions
- init.ts
- adapter.ts
- EVAL_TASKS
- schemas/evidence.ts
- check.test.ts
- api.ts
- CodeIntelligenceProvider
- context/redact.ts
- commands/plan.test.ts
- namespace-ids.test.ts
- models.ts
- renew-consent-effectual.test.ts
- McpStdioServer
- screens-review.ts
- scripts
- stdio.ts
- runner.branch-coverage.test.ts
- architecture.test.ts
- graphify-adapter.ts
- orchestrator.test.ts
- check/runner.test.ts
- .render
- GraphifyAdapter
- legacy-app/package.json
- snapshot.ts
- graphify-adapter.test.ts
- canonical.ts
- ledger.ts
- revision.ts
- renew.ts
- openai-compatible.ts
- snapshot-trust.test.ts
- make-bins-executable.js
- budget.ts
- el
- schemas/index.ts
- l12.test.ts
- packed-install-smoke.sh
- providers.ts
- errors.ts
- prepublish-check.js
- session-branches.test.ts
- browser-client/types.ts
- hash.ts
- llm/http.test.ts
- server.function-coverage.test.ts
- files
- llm/provider.ts
- l08.test.ts
- prepublish-check.boundary.test.ts
- council.test.ts
- check.ts
- server.test.ts
- init-concurrency.test.ts
- runcli-renew.test.ts
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
7. `compileSpecDir()` - 39 edges
8. `lintBundle()` - 39 edges
9. `LlmResponse` - 38 edges
10. `sha256Content()` - 38 edges

## Surprising Connections (you probably didn't know these)
- `compiledBundle()` --calls--> `compileSpecDir()`  [EXTRACTED]
  packages/spec-core/src/cli/commands/plan.test.ts → packages/spec-core/src/compiler/compile.ts
- `rulePreserve()` --calls--> `cmdRenewReview()`  [EXTRACTED]
  packages/spec-core/src/renew/planner-trust.test.ts → packages/spec-core/src/cli/commands/renew.ts
- `compiledBundle()` --calls--> `compileSpecDir()`  [EXTRACTED]
  packages/spec-core/src/cli/commands/trace.test.ts → packages/spec-core/src/compiler/compile.ts
- `CompileResult` --references--> `SpecBundle`  [EXTRACTED]
  packages/spec-core/src/compiler/compile.ts → packages/spec-core/src/schemas/index.ts
- `HandleRpcOptions` --references--> `LlmAdapter`  [EXTRACTED]
  packages/spec-core/src/mcp/server.ts → packages/spec-core/src/eval/llm/adapter.ts

## Import Cycles
- 3-file cycle: `packages/spec-core/src/eval/budget.ts -> packages/spec-core/src/eval/llm/http.ts -> packages/spec-core/src/llm/openai-compatible.ts -> packages/spec-core/src/eval/budget.ts`

## Communities (121 total, 2 thin omitted)

### Community 0 - "generate.ts"
Cohesion: 0.08
Nodes (36): errOf(), Command, COMMANDS, GenerateVariant, InitProfile, parseArgs(), parseRenew(), ParseResult (+28 more)

### Community 1 - "browser-client/state.ts"
Cohesion: 0.17
Nodes (20): confirmControl(), reviewSnap(), snap(), wireActions(), addPendingChange(), answeredCount(), ClientState, closeChangePanel() (+12 more)

### Community 2 - "pipeline.test.ts"
Cohesion: 0.15
Nodes (12): BudgetExceededError, depsFor(), freshDir(), makeBundle(), persisted, sealedFor(), setupTarget(), sha() (+4 more)

### Community 3 - "check/runner.ts"
Cohesion: 0.13
Nodes (19): parseExpect(), REDACTION_RULES, RedactionRule, redactSecrets(), SecretKind, activeProcessGroups, EVIDENCE_FILE_MODE, evidenceRunName() (+11 more)

### Community 4 - "cli/index.ts"
Cohesion: 0.08
Nodes (40): commandHelp(), renewSubHelp(), applyUnderLock(), ChangeResult, cmdChange(), findingLine(), FIXTURES, frozenSpecRoot() (+32 more)

### Community 5 - "context-provider.ts"
Cohesion: 0.10
Nodes (19): ContextBundleSchema, ContextItem, ContextItemSchema, ContextLimits, RENEW_CONTEXT_LIMITS, AnalysisScope, ContextProvider, GraphContextProvider (+11 more)

### Community 6 - "pipeline.ts"
Cohesion: 0.14
Nodes (18): MAX_RECOVERY_PROMPT_BYTES, RecoveryOutcome, UsageState, bundleDigestPayload(), CitationClaim, contextBundleDigest(), ContextBundleIdentity, deepFreezeItem() (+10 more)

### Community 7 - "aggregate.ts"
Cohesion: 0.12
Nodes (24): Aggregation, EmittedOutcome, loadRunDir(), parseEmittedOutcome(), baseScore(), BLOCKED, EmitOverrides, emittedRecord() (+16 more)

### Community 8 - "engine.ts"
Cohesion: 0.13
Nodes (19): EXPECT_GRAMMAR_DOC, EXPECTED_EXIT_PATTERN, isJudgeableExpect(), RULES, rule, rule, rule, rule (+11 more)

### Community 9 - "enrich.ts"
Cohesion: 0.18
Nodes (13): applyEnrichment(), buildEnrichPrompt(), CLARIFY_ENRICH_PROTOCOL, DecisionEnrichment, EnrichedItemSchema, EnrichOutputSchema, EnrichParseResult, MAX_CONTEXT_CHARS (+5 more)

### Community 10 - "generate.test.ts"
Cohesion: 0.10
Nodes (12): complete(), FAKE_ENV, fetchSpy(), jsonResponse(), PET_CLINIC, PROFILE_CONFIG, SECTION_FILES, SESSION_SERVICE (+4 more)

### Community 11 - "consent.ts"
Cohesion: 0.10
Nodes (30): authorizeExecution(), checkPreviewDigest(), consentDigestLine(), EXEC_OPT_IN_ENV, ExecAuthorization, execOptInFromEnv(), execRootFromEnv(), GENERATE_OPT_IN_ENV (+22 more)

### Community 12 - "manifest.json"
Cohesion: 0.07
Nodes (28): artifact_hashes, assumptions, contracts, decisions, evidence, glossary, intent, requirements (+20 more)

### Community 13 - "tranche6.test.ts"
Cohesion: 0.11
Nodes (28): ArchitectureView, DistillerInputs, distillRenewalQuestions(), makeRenewalDriver(), RENEWAL_CLAIM_ID, STRATEGY_CLAIM_ID, STRATEGY_OPTIONS, strategyQuestion() (+20 more)

### Community 14 - "isolation.test.ts"
Cohesion: 0.39
Nodes (6): FIXTURE_SRC, freshDir(), graphCaps(), initializedPair(), makeTarget(), tmpDirs

### Community 15 - "verifier.ts"
Cohesion: 0.20
Nodes (10): AnchorBatchResult, AnchorFailureCode, AnchorVerification, canonicalFileHash(), CodeAnchorInput, countLines(), isValidAnchorPath(), tmpDirs (+2 more)

### Community 16 - "INPUT_CEILINGS"
Cohesion: 0.20
Nodes (6): GlossaryEntrySchema, IntentSchema, validIntent, INPUT_CEILINGS, validManifest, validTask

### Community 17 - "server.ts"
Cohesion: 0.09
Nodes (23): DEFAULT_GENERATE_PROFILE, ExecBoundary, GenerateProfile, GenerateVariant, ARG_SPECS, ArgName, ArgValidator, CallContext (+15 more)

### Community 18 - "doctor.ts"
Cohesion: 0.10
Nodes (31): BIN_FILES, BUDGET_ENV, checkBins(), checkBudgetEnv(), checkLlmConfig(), checkLock(), checkMcpFlags(), checkNodeVersion() (+23 more)

### Community 19 - "generate-interactive.ts"
Cohesion: 0.12
Nodes (27): ASSETS, baseBundle(), blockedJson(), complete(), fakeLlm(), REAL_FETCH, startWorkspace(), atReview() (+19 more)

### Community 20 - "structural.ts"
Cohesion: 0.17
Nodes (17): bindStructuralArtifacts(), artifactSet(), bindingFor(), bindingOf(), tmpDirs, workspaceWith(), computeStructuralBinding(), GraphManifestParse (+9 more)

### Community 21 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, esModuleInterop, lib, module, moduleResolution, noEmitOnError, outDir, rootDir (+11 more)

### Community 22 - "orchestrator.ts"
Cohesion: 0.16
Nodes (20): ClarificationQuestionView, mergeRoundRecords(), BehaviorReview, ChangeSetChangeOutcome, ChangeSetOutcome, SessionOpResult, SessionSnapshot, SessionUsageSummary (+12 more)

### Community 23 - "report.ts"
Cohesion: 0.06
Nodes (50): aggregateEmitted(), EMITTED_SCHEMA, renderAggregation(), verifyCorpusLock(), BadFixtureCapture, gateVerdict, groundedBundleFor(), ENV_KEYS (+42 more)

### Community 24 - "strictness.test.ts"
Cohesion: 0.25
Nodes (5): ManifestSchema, validManifest, FIXTURES, validManifest, validTask

### Community 25 - "fixture-provider.ts"
Cohesion: 0.17
Nodes (15): StaticGraphProvider, affectedReverse(), graphHealthOf(), querySeeds(), ParsedGraph, AffectedHit, AffectedOptions, AffectedResult (+7 more)

### Community 26 - "server/http.ts"
Cohesion: 0.07
Nodes (19): ClarifySession, tmpDirs, ApplyRoundRequestSchema, ApproveRequestSchema, ASSETS, blocked(), bundle(), CancelRequestSchema (+11 more)

### Community 27 - "SpecBundle"
Cohesion: 0.08
Nodes (41): compileLintFreeze(), SECTION_PATHS, tmpDirs, PlanTask, applyChangeSet(), ApplyResult, ChangeSet, ChangeSetSchema (+33 more)

### Community 28 - "eval/runner.test.ts"
Cohesion: 0.24
Nodes (7): complete(), counterOnlyUnresolvedBundle(), et01Bundle(), PET_CLINIC, proposalAJson(), unresolvedAddedBundle(), unresolvedPlusLintDirtyBundle()

### Community 29 - "eval/runner.ts"
Cohesion: 0.10
Nodes (38): CouncilTopology, BASE, complete(), unresolvedBundle(), DecomposedCouncilDeps, runDecomposedCouncil(), CLARIFY_RULES, CLASSIFY_RULES (+30 more)

### Community 30 - "orders.ts"
Cohesion: 0.22
Nodes (13): checkStock(), decrementStock(), stock, CATALOG, quote(), run(), createOrder(), OrderResult (+5 more)

### Community 31 - "schemas.ts"
Cohesion: 0.09
Nodes (20): AnalysisUsageSchema, AnchorResult, AnchorResultSchema, AnchorScope, AnchorScopeSchema, RECOVERY_CATEGORIES, RecoveryHypothesis, RecoveryHypothesisSchema (+12 more)

### Community 32 - "fs.ts"
Cohesion: 0.15
Nodes (21): TrustFsError, authorizedCopyWrite(), authorizedCreateDirAtomically(), authorizedCreateExclusive(), authorizedEnsureDir(), authorizedRemoveTree(), authorizedRenameNoClobber(), authorizedStat() (+13 more)

### Community 33 - "coverage-hardening.test.ts"
Cohesion: 0.10
Nodes (32): emptyOverlay(), nextOverlayId(), OVERLAY_RELATIONS, OverlayEntityRefSchema, OverlayLoad, OverlayRecord, OverlayRecordSchema, OverlayRelation (+24 more)

### Community 34 - "graph-reader.ts"
Cohesion: 0.12
Nodes (18): ArchitectureViewSchema, GENERATED_PATTERNS, isGeneratedPath(), fixturePath, loadGraph(), MANIFEST, rawFixture, godNodes() (+10 more)

### Community 35 - "constraint-trace.test.ts"
Cohesion: 0.18
Nodes (13): et07Requirement(), et12Requirement(), failureCodes(), FIXTURES, genericBundleFor(), groundedEt01(), groundedEt02(), groundedEt04() (+5 more)

### Community 36 - "tasks/index.ts"
Cohesion: 0.07
Nodes (38): allUnGrounded(), anchorSentences(), checkConstraintTrace(), commitmentSurfaces(), ConstraintFailure, ConstraintFailureCode, containsTerm(), containsWholeTerm() (+30 more)

### Community 37 - "index.test.ts"
Cohesion: 0.18
Nodes (9): DecisionIdSchema, EvidenceIdSchema, DecisionSchema, validDecision, validBundle, validManifest, TraceEdgeSchema, LegacyPackageSchema (+1 more)

### Community 38 - "devDependencies"
Cohesion: 0.15
Nodes (13): jsdom, devDependencies, jsdom, @types/node, typescript, vitest, @vitest/coverage-v8, zod-to-json-schema (+5 more)

### Community 39 - "trust/state.ts"
Cohesion: 0.15
Nodes (26): authorizedRead(), abortEvidencePath(), applyStateMutation(), fenceBeforeWrite(), fenceWriterLock(), journalIsOurs(), journalOnDisk(), loadJoinedStore() (+18 more)

### Community 40 - "commands/trace.test.ts"
Cohesion: 0.10
Nodes (15): renderTrace(), compiledBundle(), FIXTURES, SECTION_FILES, tmpDirs, TraceResult, buildTrace(), DecSpec (+7 more)

### Community 41 - "schemas/version.ts"
Cohesion: 0.36
Nodes (7): checkSpecSchemaVersion(), ParsedVersion, parseVersion(), SPEC_SCHEMA_VERSION, SpecSchemaVersionFieldSchema, SpecSchemaVersionVerdict, SUPPORTED

### Community 42 - "renewalPaths"
Cohesion: 0.08
Nodes (40): renewalPaths, RenewalProjectSchema, reloadSnapshot(), dirs, MINIMAL_PROJECT, MINIMAL_SNAPSHOT, loadSnapshotFile(), persistRenewalProject() (+32 more)

### Community 43 - "common.ts"
Cohesion: 0.33
Nodes (6): ComplexityProfile, ComplexityProfileSchema, IdSchema, ImpactLevelSchema, Sha256Schema, SpecStateSchema

### Community 44 - "model.ts"
Cohesion: 0.10
Nodes (27): views(), AnswerCheck, answerToUserAnswer(), applyAnswersToRecords(), ApplyResult, attachStatuses(), open(), QUESTIONS (+19 more)

### Community 45 - "app.ts"
Cohesion: 0.18
Nodes (13): boot(), BUSY_STATES, shell(), busyMessage(), renderBusy(), renderCancelled(), renderExpired(), renderFailed() (+5 more)

### Community 46 - "spec-core/package.json"
Cohesion: 0.22
Nodes (8): description, engines, node, license, main, name, type, version

### Community 47 - "sha256Content"
Cohesion: 0.08
Nodes (35): AnswerLedgerSchema, answersExportDocument(), APPROVAL_RECORD_SCHEMA_ID, approvalFileName(), ApprovalRecord, ApprovalRecordSchema, buildApprovalRecord(), ChangeLedgerSchema (+27 more)

### Community 48 - "paths.ts"
Cohesion: 0.13
Nodes (22): transitiveRenewalRootCheck(), refuseIfInsideTarget(), assertDisjointRealRoots(), assertNoSymlinkBelow(), authorizeRenewalPaths(), tmpDirs, checkMcpDir(), ContainedOutputCheck (+14 more)

### Community 49 - "llm-config.ts"
Cohesion: 0.10
Nodes (23): RFC-7230, BaseUrlSchema, GLM, resolveSingleRole(), HeaderNameSchema, LINK_LOCAL_PREFIXES, LlmConfig, LlmConfigSchema (+15 more)

### Community 50 - "intel-contract.test.ts"
Cohesion: 0.14
Nodes (11): cleanup, installedVersion, FIXTURE_SRC, freshDir(), graphWorkspace(), readFileFixture(), tmpDirs, runSubprocess() (+3 more)

### Community 51 - "package.json"
Cohesion: 0.25
Nodes (7): _archival, name, packageManager, private, scripts, test:spec, version

### Community 52 - "tranche4.test.ts"
Cohesion: 0.22
Nodes (11): BuildStrategyArgs, buildStrategyDecision(), persistStrategy(), loadStrategyFile(), tmpDirs, loadStrategyFile(), tmpDirs, MODERNIZATION_STRATEGIES (+3 more)

### Community 53 - "paid.ts"
Cohesion: 0.17
Nodes (16): renewalConsentState(), accountCompletionAttempts(), createPaidOperation(), deepFreeze(), deepFreezeRoute(), BASE_ENV, MAX_RECOVERY_WIRE_BYTES, ownField() (+8 more)

### Community 54 - "scale-benchmark.test.ts"
Cohesion: 0.17
Nodes (8): ClosureFinding, ClosureFindingCode, closureFindings(), DuplicateTaskId, duplicateTaskIds(), CEILINGS_MS, mkTask(), syntheticBundle()

### Community 55 - "parseGraphText"
Cohesion: 0.06
Nodes (41): LLM_ROLES, singleRoutePlan(), initProject(), FIXTURE_SRC, tmpDirs, caps(), parseGraphText(), analyzedProject() (+33 more)

### Community 56 - "root-invariants.test.ts"
Cohesion: 0.22
Nodes (13): build(), ctxWindow(), FIXTURE_SRC, freshDir(), graphCaps(), groundedResponse(), initProject(), interiorCitation() (+5 more)

### Community 57 - "copy-browser-assets.js"
Cohesion: 0.25
Nodes (7): { copyFileSync, mkdirSync, readdirSync, writeFileSync }, files, { join }, MIME, outDir, root, srcDir

### Community 58 - "recovery/prompts.ts"
Cohesion: 0.24
Nodes (15): redactSecrets(), runRecovery(), zodIssues(), buildRecoveryPrompt(), buildValidationRetryPrompt(), countEgressRedactions(), EgressProjection, escapeLineUnsafe() (+7 more)

### Community 59 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck (+7 more)

### Community 60 - "init.ts"
Cohesion: 0.16
Nodes (13): buildSections(), cmdInit(), Contract, Decision, EvidenceItem, GlossaryEntry, InitOptions, InitResult (+5 more)

### Community 61 - "adapter.ts"
Cohesion: 0.11
Nodes (20): ASSETS, blocked(), bootApp(), bundle(), settle(), waitFor(), ASSETS, blocked() (+12 more)

### Community 62 - "EVAL_TASKS"
Cohesion: 0.18
Nodes (20): canonicalJson(), computeCorpusHash(), CORPUS_LOCK_VERSION, CorpusLock, CorpusLockEntry, frozenThresholds, loadCorpusLock(), lockCandidates() (+12 more)

### Community 63 - "schemas/evidence.ts"
Cohesion: 0.36
Nodes (5): codeAnchorItem, CodeAnchorPayloadSchema, evidenceCommon, EvidenceItemSchema, validEvidence

### Community 64 - "check.test.ts"
Cohesion: 0.21
Nodes (8): evidenceOf(), evidencePath(), FIXTURES, freshRoot(), initRoot(), makeSpecRoot(), SECTION_FILES, tmpDirs

### Community 65 - "api.ts"
Cohesion: 0.19
Nodes (11): ApiError, applyChanges(), applyRound(), approve(), bootstrapToken(), call(), cancel(), primeSessionId() (+3 more)

### Community 67 - "context/redact.ts"
Cohesion: 0.31
Nodes (9): credentialAssignmentEnd(), isIdentCont(), isIdentStart(), isInlineSpace(), isValueStop(), redactCredentialAssignments(), RedactionResult, Rule (+1 more)

### Community 68 - "commands/plan.test.ts"
Cohesion: 0.08
Nodes (19): cmdPlan(), PlanOptions, PlanResult, renderHuman(), renderJson(), compiledBundle(), FIXTURES, SECTION_FILES (+11 more)

### Community 69 - "namespace-ids.test.ts"
Cohesion: 0.19
Nodes (11): AssumptionIdSchema, ContractIdSchema, RequirementIdSchema, TaskIdSchema, TestIdSchema, ContractSchema, validContract, RequirementSchema (+3 more)

### Community 70 - "models.ts"
Cohesion: 0.15
Nodes (12): BUILTIN_PROVIDERS, cmdModels(), fmt(), MAX_CATALOG_BYTES, ModelCatalogEntry, MODELS_REQUEST_TIMEOUT_MS, ModelsOptions, ModelsResult (+4 more)

### Community 71 - "renew-consent-effectual.test.ts"
Cohesion: 0.15
Nodes (13): generateOptInFromEnv(), callRenewAnalyze(), callRenewStatus(), FIXTURES, TMP_PIN, tmpDirs, errorResponse(), handleRpcLine() (+5 more)

### Community 72 - "McpStdioServer"
Cohesion: 0.24
Nodes (5): jsonRpcError(), McpStdioServer, Harness, makeSession(), toolRefusal()

### Community 73 - "screens-review.ts"
Cohesion: 0.23
Nodes (7): approveControl(), changePanel(), findSegment(), pendingTray(), renderReview(), ReviewActions, segmentEl()

### Community 74 - "scripts"
Cohesion: 0.22
Nodes (9): scripts, build, lint, prepublishOnly, pretest, smoke:packed, test, test:coverage (+1 more)

### Community 75 - "stdio.ts"
Cohesion: 0.15
Nodes (13): isJsonRpcId(), EPIPE_DRAIN_TIMEOUT_MS, EXIT_CLIENT_GONE, EXIT_DRAIN_TIMEOUT, EXIT_OK, MAX_FRAME_BYTES, MAX_IN_FLIGHT, peekForScheduling() (+5 more)

### Community 76 - "runner.branch-coverage.test.ts"
Cohesion: 0.14
Nodes (7): childCtl, FIXTURES, PET_CLINIC, tmpDirs, Verification, execCommand(), execInProcessGroup()

### Community 77 - "architecture.test.ts"
Cohesion: 0.31
Nodes (7): allSpecifiers(), importSpecifiers(), PKG, productionFiles(), REL(), renewalSurface(), WRITE_PRIMITIVES

### Community 78 - "graphify-adapter.ts"
Cohesion: 0.15
Nodes (13): fixturePath, parsed, compareTriple(), DEFAULTS, GraphifyAdapterOptions, MAX_EXCLUSIVE, MIN_VERSION, SUPPORTED_GRAPHIFY_RANGE (+5 more)

### Community 79 - "orchestrator.test.ts"
Cohesion: 0.27
Nodes (8): MAX_CLARIFY_ROUNDS, atReview(), blockedBundle(), bundle(), complete(), OPTS, scriptedLlm(), sessionWith()

### Community 80 - "check/runner.test.ts"
Cohesion: 0.13
Nodes (7): DEFAULT_TIMEOUT_MS, killActiveProcessGroups(), FakeCall, FIXTURES, PET_CLINIC, tmpDirs, Verification

### Community 81 - ".render"
Cohesion: 0.31
Nodes (6): App, questionsScreen(), initialState(), setCurrentIndex(), setDraft(), setNotice()

### Community 82 - "GraphifyAdapter"
Cohesion: 0.21
Nodes (5): neighborhood(), shortestPath(), GraphifyAdapter, IntelFailure, IntelItems

### Community 83 - "legacy-app/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, version

### Community 84 - "snapshot.ts"
Cohesion: 0.09
Nodes (33): createSnapshot(), deriveSnapshotId(), ProjectSnapshotSchema, Sha256, SnapshotFileEntrySchema, snapshotIdentityPayload(), SnapshotInputs, SnapshotReload (+25 more)

### Community 85 - "graphify-adapter.test.ts"
Cohesion: 0.20
Nodes (6): parseGraphifyVersion(), bindingTextFor(), fixtureGraphText, fixturePath, validManifestText, workspaceFiles()

### Community 86 - "canonical.ts"
Cohesion: 0.22
Nodes (9): canonicalJsonOfIds(), CANONICAL_HASH_VERSION, canonicalJson(), canonicalReplacer(), DigestDomain, isKnownHashVersion(), KNOWN_HASH_VERSIONS, oneSliceBundle() (+1 more)

### Community 87 - "ledger.ts"
Cohesion: 0.05
Nodes (73): loadRenewalApproval(), nextRenewalApprovalId(), RenewalApprovalLoad, RenewalDecisionSet, RenewalDecisionSetSchema, payload, tmpDirs, WriteApprovalResult (+65 more)

### Community 88 - "revision.ts"
Cohesion: 0.08
Nodes (25): SECTION_KEYS, stageSpecDir(), PET_CLINIC, SECTION_FILES, tmpDirs, writeSpecDir(), assertNotSymlink(), acquireSpecRootLock() (+17 more)

### Community 89 - "renew.ts"
Cohesion: 0.07
Nodes (51): affectedSync(), analyzeWithFresh(), cmdRenewAnalyze(), cmdRenewExport(), cmdRenewInit(), cmdRenewPlan(), cmdRenewRefresh(), cmdRenewReview() (+43 more)

### Community 90 - "openai-compatible.ts"
Cohesion: 0.13
Nodes (16): baseConfig(), jsonResponse(), okBody(), ChatResponse, CostExtractor, parseSuccess(), extractProvenance(), extractUsageDetails() (+8 more)

### Community 91 - "snapshot-trust.test.ts"
Cohesion: 0.27
Nodes (10): baseCaps(), ctxWindow(), FIXTURE_SRC, fixtureGraph(), freshDir(), initPair(), interiorCitation(), makeTarget() (+2 more)

### Community 92 - "make-bins-executable.js"
Cohesion: 0.50
Nodes (3): BINS, { join }, { readFileSync, chmodSync }

### Community 93 - "budget.ts"
Cohesion: 0.11
Nodes (31): BudgetCap, BudgetSpentSnapshot, DEFAULT_WALL_SLACK_MS, MAX_COMPLETIONS, maxCompletions(), ResolvedRunBudget, resolveRunBudget(), worstCaseAttempts() (+23 more)

### Community 94 - "el"
Cohesion: 0.28
Nodes (10): cssEscape(), navRow(), progressBar(), QuestionActions, questionCard(), renderPreview(), renderQuestions(), openQuestions() (+2 more)

### Community 95 - "schemas/index.ts"
Cohesion: 0.05
Nodes (17): FIXTURES, SECTION_FILES, tmpDirs, BAD, BadFixtureExpectation, GOOD, FIXTURES, FIXTURES (+9 more)

### Community 96 - "l12.test.ts"
Cohesion: 0.21
Nodes (8): firstOverlap(), globSegments(), globsOverlap(), rule, segmentsOverlap(), FIXTURES, refMatch(), refPathMatch()

### Community 97 - "packed-install-smoke.sh"
Cohesion: 1.00
Nodes (3): run(), say(), packed-install-smoke.sh script

### Community 98 - "providers.ts"
Cohesion: 0.26
Nodes (12): buildLlmPlanFromProfile(), createOpenAiCompatibleLlm(), RoutingMode, buildRoleAdapter(), openRouterCost(), resolveRoleConfig(), RoleCallContext, SPEC_SCHEMA_TEXT (+4 more)

### Community 99 - "errors.ts"
Cohesion: 0.18
Nodes (8): isTrustError(), TrustAuthorityError, TrustCitationError, TrustDomainTag, TrustError, TrustPaidError, TrustStateError, TrustStructuralError

### Community 100 - "prepublish-check.js"
Cohesion: 0.29
Nodes (5): describe, pkg, result, { spawnSync }, status

### Community 101 - "session-branches.test.ts"
Cohesion: 0.15
Nodes (6): ContextBundle, SCRIPTED_INVALID, tmpDirs, RecoveryRequest, RecoveryPromptArgs, tmpDirs

### Community 102 - "browser-client/types.ts"
Cohesion: 0.18
Nodes (10): ApiResponse, ChangeOutcome, DecisionStatus, OptionView, Progress, QuestionView, Review, ReviewSegment (+2 more)

### Community 103 - "hash.ts"
Cohesion: 0.06
Nodes (31): FIXTURES, SECTION_FILES, tmpDirs, artifactHashes(), canonicalSectionHash(), FIXTURES, freezeLegacyStyle(), HASHED_KEYS (+23 more)

### Community 104 - "llm/http.test.ts"
Cohesion: 0.29
Nodes (5): FAKE_ENV, FakeEnv, jsonResponse(), okFetch(), PartialFakeEnv

### Community 105 - "server.function-coverage.test.ts"
Cohesion: 0.29
Nodes (6): callTool(), FIXTURES, freshRoot(), makeSpecRoot(), SECTION_FILES, tmpDirs

### Community 106 - "files"
Cohesion: 0.33
Nodes (6): files, dist, examples, generated, LICENSE, README.md

### Community 107 - "llm/provider.ts"
Cohesion: 0.70
Nodes (3): OPENROUTER_DEFAULT_BASE_URL, PROVIDER_KINDS, ROUTELLM_DEFAULT_BASE_URL

### Community 108 - "l08.test.ts"
Cohesion: 0.67
Nodes (3): FIXTURES, inState(), loadBundle()

### Community 112 - "council.test.ts"
Cohesion: 0.08
Nodes (15): ClarifySessionOptions, BudgetLedger, BUNDLE_OK(), CLASSIFIER_BLOCK, CLASSIFIER_OK, complete(), et01Bundle(), PET_CLINIC (+7 more)

### Community 114 - "check.ts"
Cohesion: 0.36
Nodes (7): CheckOutcome, Executor, CheckOptions, CheckResult, cmdCheck(), expectedActual(), renderReport()

### Community 116 - "server.test.ts"
Cohesion: 0.11
Nodes (18): EXEC_ROOT_ENV, callTool(), expectIdentical(), FIXTURES, freshOutside(), freshRoot(), frozenRoot(), injectionRoot() (+10 more)

### Community 117 - "init-concurrency.test.ts"
Cohesion: 0.33
Nodes (4): ChildOutcome, CLI_JS, SECTION_FILES, tmpDirs

### Community 120 - "runcli-renew.test.ts"
Cohesion: 0.40
Nodes (5): FIXTURE_SRC, freshDir(), graphifyAvailable, makeTarget(), tmpDirs

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
- **691 isolated node(s):** `name`, `version`, `private`, `packageManager`, `_archival` (+686 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SpecBundle` connect `SpecBundle` to `generate.ts`, `check/runner.ts`, `cli/index.ts`, `engine.ts`, `generate.test.ts`, `consent.ts`, `tranche6.test.ts`, `generate-interactive.ts`, `orchestrator.ts`, `report.ts`, `server/http.ts`, `eval/runner.test.ts`, `eval/runner.ts`, `constraint-trace.test.ts`, `tasks/index.ts`, `commands/trace.test.ts`, `sha256Content`, `scale-benchmark.test.ts`, `adapter.ts`, `commands/plan.test.ts`, `runner.branch-coverage.test.ts`, `orchestrator.test.ts`, `check/runner.test.ts`, `revision.ts`, `budget.ts`, `schemas/index.ts`, `l12.test.ts`, `hash.ts`, `l08.test.ts`, `council.test.ts`, `check.ts`?**
  _High betweenness centrality (0.082) - this node is a cross-community bridge._
- **Why does `LlmAdapter` connect `adapter.ts` to `generate.ts`, `pipeline.test.ts`, `context-provider.ts`, `generate.test.ts`, `server.ts`, `generate-interactive.ts`, `orchestrator.ts`, `server/http.ts`, `eval/runner.test.ts`, `eval/runner.ts`, `tasks/index.ts`, `app.ts`, `paid.ts`, `parseGraphText`, `root-invariants.test.ts`, `orchestrator.test.ts`, `canonical.ts`, `ledger.ts`, `renew.ts`, `openai-compatible.ts`, `snapshot-trust.test.ts`, `budget.ts`, `providers.ts`, `session-branches.test.ts`, `council.test.ts`, `server.test.ts`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Why does `LlmResponse` connect `adapter.ts` to `pipeline.test.ts`, `context-provider.ts`, `generate.test.ts`, `generate-interactive.ts`, `server/http.ts`, `eval/runner.test.ts`, `eval/runner.ts`, `app.ts`, `parseGraphText`, `root-invariants.test.ts`, `orchestrator.test.ts`, `canonical.ts`, `ledger.ts`, `renew.ts`, `openai-compatible.ts`, `snapshot-trust.test.ts`, `budget.ts`, `session-branches.test.ts`, `council.test.ts`, `server.test.ts`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _691 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `generate.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08076923076923077 - nodes in this community are weakly interconnected._
- **Should `check/runner.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.12554112554112554 - nodes in this community are weakly interconnected._
- **Should `cli/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08145363408521303 - nodes in this community are weakly interconnected._