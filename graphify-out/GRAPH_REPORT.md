# Graph Report - llm_council_orchestrator  (2026-09-04)

## Corpus Check
- 380 files · ~384,217 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2533 nodes · 6809 edges · 121 communities (117 shown, 4 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c0263e52`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- generate-interactive.ts
- browser-client/state.ts
- pipeline.test.ts
- check/runner.ts
- lintBundle
- fs.ts
- server.ts
- live-experiment.ts
- engine.ts
- SpecBundleSchema
- generate.test.ts
- consent.ts
- manifest.json
- aggregate.ts
- tranche4.test.ts
- distiller.ts
- llm-config.ts
- app.ts
- doctor.ts
- workspace-copy.ts
- parseGraphText
- compilerOptions
- paths.ts
- run-eval.test.ts
- isolation.test.ts
- providers.ts
- scale-benchmark.test.ts
- lifecycle.ts
- cli/index.ts
- eval/runner.ts
- orders.ts
- pipeline.ts
- revision.ts
- coverage-hardening.test.ts
- graphify-adapter.test.ts
- constraint-trace.test.ts
- adapter.ts
- tasks/index.ts
- devDependencies
- fixture-provider.ts
- planner/plan.test.ts
- renew.ts
- SpecBundle
- schemas/index.ts
- model.ts
- graphify-adapter.ts
- spec-core/package.json
- sha256Content
- api.ts
- GraphifyAdapter
- envelope.ts
- package.json
- generate.ts
- paid.ts
- app-errors.test.ts
- trust/state.ts
- context-provider.ts
- copy-browser-assets.js
- renew-consent-effectual.test.ts
- compilerOptions
- fs-coverage.test.ts
- score.ts
- report.ts
- init.ts
- planner/plan.ts
- review-changes.ts
- screens-review.ts
- context/redact.ts
- council.test.ts
- orchestrator.ts
- ledger.ts
- cli.test.ts
- models.ts
- root-invariants.test.ts
- scripts
- stdio.ts
- intel-contract.test.ts
- architecture.test.ts
- .render
- orchestrator.test.ts
- el
- recovery/prompts.ts
- compileSpecDir
- legacy-app/package.json
- snapshot.ts
- trust/evidence.ts
- ClarifySession
- authority.ts
- CodeIntelligenceProvider
- browser-client/types.ts
- good-fixture-gate.test.ts
- snapshot-trust.test.ts
- make-bins-executable.js
- clarify-trust.test.ts
- concurrency.test.ts
- write-spec.ts
- llm/http.test.ts
- packed-install-smoke.sh
- graph-reader.ts
- planner-trust.test.ts
- prepublish-check.js
- commands/trace.test.ts
- verifier.ts
- hash.ts
- journey.test.ts
- renew-richstate.test.ts
- files
- app.test.ts
- corpus-lock.ts
- clarify.test.ts
- prepublish-check.boundary.test.ts
- report.test.ts
- check/redact.ts
- runcli-renew.test.ts
- pipeline-taxonomy.test.ts
- server.test.ts
- bin
- readiness.ts
- dependencies
- repository

## God Nodes (most connected - your core abstractions)
1. `SpecBundle` - 82 edges
2. `parseGraphText()` - 49 edges
3. `LlmAdapter` - 47 edges
4. `cmdRenewInit()` - 47 edges
5. `runCli()` - 43 edges
6. `runPipeline()` - 43 edges
7. `lintBundle()` - 39 edges
8. `compileSpecDir()` - 39 edges
9. `sha256Content()` - 36 edges
10. `LlmResponse` - 35 edges

## Surprising Connections (you probably didn't know these)
- `DistillerInputs` --references--> `AnalysisRecord`  [EXTRACTED]
  packages/spec-core/src/renew/clarify/distiller.ts → packages/spec-core/src/renew/recovery/schemas.ts
- `PlanTask` --references--> `TaskContract`  [EXTRACTED]
  packages/spec-core/src/cli/commands/plan.ts → packages/spec-core/src/schemas/tasks.ts
- `FreezeResult` --references--> `SpecBundle`  [EXTRACTED]
  packages/spec-core/src/compiler/freeze.ts → packages/spec-core/src/schemas/index.ts
- `caps()` --calls--> `parseGraphText()`  [EXTRACTED]
  packages/spec-core/src/renew/renew-richstate.test.ts → packages/spec-core/src/renew/intel/graph-reader.ts
- `oneSliceBundle()` --calls--> `sha256Content()`  [EXTRACTED]
  packages/spec-core/src/renew/trust/pipeline-taxonomy.test.ts → packages/spec-core/src/renew/trust/canonical.ts

## Import Cycles
- 3-file cycle: `packages/spec-core/src/eval/budget.ts -> packages/spec-core/src/eval/llm/http.ts -> packages/spec-core/src/llm/openai-compatible.ts -> packages/spec-core/src/eval/budget.ts`

## Communities (121 total, 4 thin omitted)

### Community 0 - "generate-interactive.ts"
Cohesion: 0.07
Nodes (33): sessionLedgerEnvelope(), cmdGenerateInteractive(), EVENT_LINES, GenerateInteractiveOptions, GenerateInteractiveResult, openBrowser(), ASSETS, blocked() (+25 more)

### Community 1 - "browser-client/state.ts"
Cohesion: 0.17
Nodes (20): confirmControl(), reviewSnap(), snap(), wireActions(), addPendingChange(), answeredCount(), ClientState, closeChangePanel() (+12 more)

### Community 2 - "pipeline.test.ts"
Cohesion: 0.20
Nodes (10): depsFor(), freshDir(), makeBundle(), persisted, sealedFor(), setupTarget(), sha(), tmpDirs (+2 more)

### Community 3 - "check/runner.ts"
Cohesion: 0.07
Nodes (30): parseExpect(), activeProcessGroups, CheckOutcome, DEFAULT_TIMEOUT_MS, EVIDENCE_FILE_MODE, evidenceRunName(), execCommand(), execInProcessGroup() (+22 more)

### Community 4 - "lintBundle"
Cohesion: 0.15
Nodes (10): FIXTURES, frozenSpecRoot(), inlineBundle(), makeSpecRoot(), SECTION_FILES, tmpDirs, compileLintFreeze(), SECTION_PATHS (+2 more)

### Community 5 - "fs.ts"
Cohesion: 0.20
Nodes (18): authorizedCopyWrite(), authorizedCreateDirAtomically(), authorizedCreateExclusive(), authorizedEnsureDir(), authorizedRemoveTree(), authorizedRenameNoClobber(), authorizedWrite(), authorizeProjectDestination() (+10 more)

### Community 6 - "server.ts"
Cohesion: 0.10
Nodes (17): DEFAULT_GENERATE_PROFILE, ARG_SPECS, ArgName, ArgValidator, CallContext, configLoadCache, CoreResult, DIR_PROPERTY (+9 more)

### Community 7 - "live-experiment.ts"
Cohesion: 0.14
Nodes (20): aggregateEmitted(), EMITTED_SCHEMA, EmittedOutcome, loadRunDir(), parseEmittedOutcome(), renderAggregation(), baseScore(), BLOCKED (+12 more)

### Community 8 - "engine.ts"
Cohesion: 0.11
Nodes (23): RULES, rule, rule, rule, rule, rule, rule, rule (+15 more)

### Community 9 - "SpecBundleSchema"
Cohesion: 0.10
Nodes (13): BAD, BadFixtureExpectation, GOOD, BAD, BadFixtureExpectation, FIXTURES, GOOD, SpecBundleForExport (+5 more)

### Community 10 - "generate.test.ts"
Cohesion: 0.10
Nodes (12): complete(), FAKE_ENV, fetchSpy(), jsonResponse(), PET_CLINIC, PROFILE_CONFIG, SECTION_FILES, SESSION_SERVICE (+4 more)

### Community 11 - "consent.ts"
Cohesion: 0.09
Nodes (32): authorizeExecution(), checkPreviewDigest(), consentDigestLine(), EXEC_OPT_IN_ENV, ExecAuthorization, ExecBoundary, execOptInFromEnv(), execRootFromEnv() (+24 more)

### Community 12 - "manifest.json"
Cohesion: 0.07
Nodes (28): artifact_hashes, assumptions, contracts, decisions, evidence, glossary, intent, requirements (+20 more)

### Community 13 - "aggregate.ts"
Cohesion: 0.15
Nodes (22): Aggregation, VariantCost, ConstraintFailure, calcs(), GateReportInput, renderGateReport(), PipelineVariant, RunScore (+14 more)

### Community 14 - "tranche4.test.ts"
Cohesion: 0.14
Nodes (13): emptyOverlay, makeSession(), uncertaintyAnalysis(), loadAnalysisRecords(), LoadedAnalyses, nextAnalysisId(), persistAnalysisRecord(), PersistOutcome (+5 more)

### Community 15 - "distiller.ts"
Cohesion: 0.12
Nodes (13): DistillerInputs, distillRenewalQuestions(), evidenceOf(), makeRenewalDriver(), RENEWAL_CLAIM_ID, STRATEGY_CLAIM_ID, STRATEGY_OPTIONS, strategyQuestion() (+5 more)

### Community 16 - "llm-config.ts"
Cohesion: 0.09
Nodes (26): RFC-7230, BaseUrlSchema, HeaderNameSchema, LINK_LOCAL_PREFIXES, LlmConfig, LlmConfigSchema, METADATA_HOSTS, OpenRouterRoutingSchema (+18 more)

### Community 17 - "app.ts"
Cohesion: 0.18
Nodes (13): boot(), BUSY_STATES, shell(), busyMessage(), renderBusy(), renderCancelled(), renderExpired(), renderFailed() (+5 more)

### Community 18 - "doctor.ts"
Cohesion: 0.10
Nodes (30): BIN_FILES, BUDGET_ENV, checkBins(), checkBudgetEnv(), checkLlmConfig(), checkLock(), checkMcpFlags(), checkNodeVersion() (+22 more)

### Community 19 - "workspace-copy.ts"
Cohesion: 0.16
Nodes (15): DEFAULT_INGEST_LIMITS, DENIED_BASE_PATTERNS, DENIED_DIRS, guardPath(), GuardVerdict, IngestLimits, isDeniedDirectory(), looksBinary() (+7 more)

### Community 20 - "parseGraphText"
Cohesion: 0.08
Nodes (32): initProject(), ParityStore, parseGraphText(), baseInputs(), FILES, withFiles(), capsWith(), FIXTURE_SRC (+24 more)

### Community 21 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, esModuleInterop, lib, module, moduleResolution, noEmitOnError, outDir, rootDir (+11 more)

### Community 22 - "paths.ts"
Cohesion: 0.19
Nodes (19): transitiveRenewalRootCheck(), refuseIfInsideTarget(), assertDisjointRealRoots(), assertNoSymlinkBelow(), authorizeRenewalPaths(), checkMcpDir(), ContainedOutputCheck, DisjointRootsCheck (+11 more)

### Community 23 - "run-eval.test.ts"
Cohesion: 0.26
Nodes (9): runEvalAll(), DEFAULT_REPORT_PATH, LIVE_ENV_VARS, missingLiveEnv(), parseArgs(), ParsedArgs, runEvalCli(), FAKE_LIVE_ENV (+1 more)

### Community 24 - "isolation.test.ts"
Cohesion: 0.39
Nodes (6): FIXTURE_SRC, freshDir(), graphCaps(), initializedPair(), makeTarget(), tmpDirs

### Community 25 - "providers.ts"
Cohesion: 0.18
Nodes (17): buildLlmPlanFromProfile(), ResolvedRole, CostExtractor, createOpenAiCompatibleLlm(), OpenAiCompatibleConfig, baseConfig(), jsonResponse(), okBody() (+9 more)

### Community 26 - "scale-benchmark.test.ts"
Cohesion: 0.10
Nodes (13): EXPECT_GRAMMAR_DOC, EXPECTED_EXIT_PATTERN, isJudgeableExpect(), ChangeSet, ClosureFinding, ClosureFindingCode, closureFindings(), DuplicateTaskId (+5 more)

### Community 27 - "lifecycle.ts"
Cohesion: 0.09
Nodes (33): applyChangeSet(), ChangeSetSchema, formatIssues(), cleanLint, FIXTURES, freeze(), FreezeResult, cleanLint (+25 more)

### Community 28 - "cli/index.ts"
Cohesion: 0.12
Nodes (24): commandHelp(), cmdCheck(), evidenceOf(), evidencePath(), FIXTURES, freshRoot(), initRoot(), makeSpecRoot() (+16 more)

### Community 29 - "eval/runner.ts"
Cohesion: 0.11
Nodes (38): GenerateOptions, ResolvedProfile, CouncilTopology, DecomposedCouncilDeps, runDecomposedCouncil(), CLARIFY_RULES, CLASSIFY_RULES, CONSTRAINT_FIDELITY (+30 more)

### Community 30 - "orders.ts"
Cohesion: 0.22
Nodes (13): checkStock(), decrementStock(), stock, CATALOG, quote(), run(), createOrder(), OrderResult (+5 more)

### Community 31 - "pipeline.ts"
Cohesion: 0.08
Nodes (26): MAX_RECOVERY_PROMPT_BYTES, RecoveryDeps, RecoveryOutcome, RecoveryRequest, UsageState, zodIssues(), RECOVERY_PROMPT_PROTOCOL, AnalysisUsageSchema (+18 more)

### Community 32 - "revision.ts"
Cohesion: 0.11
Nodes (23): applyUnderLock(), ChangeResult, cmdChange(), findingLine(), cmdFreeze(), FreezeResult, assertWritableSpecDir(), acquireSpecRootLock() (+15 more)

### Community 33 - "coverage-hardening.test.ts"
Cohesion: 0.10
Nodes (26): nextOverlayId(), OVERLAY_RELATIONS, OverlayEntityRefSchema, OverlayLoad, OverlayRecord, OverlayRecordSchema, OverlayRelation, OverlayStore (+18 more)

### Community 34 - "graphify-adapter.test.ts"
Cohesion: 0.12
Nodes (12): cleanup, installedVersion, bindingTextFor(), fixtureGraphText, fixturePath, validManifestText, workspaceFiles(), runSubprocess() (+4 more)

### Community 35 - "constraint-trace.test.ts"
Cohesion: 0.18
Nodes (13): et07Requirement(), et12Requirement(), failureCodes(), FIXTURES, genericBundleFor(), groundedEt01(), groundedEt02(), groundedEt04() (+5 more)

### Community 36 - "adapter.ts"
Cohesion: 0.09
Nodes (26): ClarifySessionOptions, BudgetCap, BudgetLedger, BudgetSpentSnapshot, DEFAULT_WALL_SLACK_MS, MAX_COMPLETIONS, maxCompletions(), ResolvedRunBudget (+18 more)

### Community 37 - "tasks/index.ts"
Cohesion: 0.09
Nodes (16): complete(), counterOnlyUnresolvedBundle(), et01Bundle(), PET_CLINIC, proposalAJson(), unresolvedAddedBundle(), unresolvedPlusLintDirtyBundle(), PET_CLINIC (+8 more)

### Community 38 - "devDependencies"
Cohesion: 0.17
Nodes (12): jsdom, devDependencies, jsdom, @types/node, typescript, vitest, @vitest/coverage-v8, zod-to-json-schema (+4 more)

### Community 39 - "fixture-provider.ts"
Cohesion: 0.14
Nodes (18): affectedReverse(), godNodes(), graphHealthOf(), neighborhood(), querySeeds(), shortestPath(), fixturePath, parsed (+10 more)

### Community 40 - "planner/plan.test.ts"
Cohesion: 0.11
Nodes (23): ArchitectureViewSchema, buildArchitectureView(), GENERATED_PATTERNS, isGeneratedPath(), fixturePath, loadGraph(), MANIFEST, rawFixture (+15 more)

### Community 41 - "renew.ts"
Cohesion: 0.11
Nodes (35): affectedSync(), analyzeWithFresh(), cmdRenewAnalyze(), cmdRenewExport(), cmdRenewInit(), cmdRenewPlan(), cmdRenewRefresh(), cmdRenewReview() (+27 more)

### Community 42 - "SpecBundle"
Cohesion: 0.06
Nodes (14): ApplyResult, CompileResult, FIXTURES, FIXTURES, FIXTURES, FIXTURES, FIXTURES, FIXTURES (+6 more)

### Community 43 - "schemas/index.ts"
Cohesion: 0.08
Nodes (36): AssumptionIdSchema, ComplexityProfileSchema, ContractIdSchema, DecisionIdSchema, EvidenceIdSchema, IdSchema, ImpactLevelSchema, RequirementIdSchema (+28 more)

### Community 44 - "model.ts"
Cohesion: 0.09
Nodes (25): AnswerCheck, answerToUserAnswer(), applyAnswersToRecords(), ApplyResult, attachStatuses(), ClarificationAnswer, ClarificationOptionView, DecisionRecord (+17 more)

### Community 45 - "graphify-adapter.ts"
Cohesion: 0.13
Nodes (14): fixturePath, parsed, compareTriple(), DEFAULTS, GraphifyAdapterOptions, MAX_EXCLUSIVE, MIN_VERSION, parseGraphifyVersion() (+6 more)

### Community 46 - "spec-core/package.json"
Cohesion: 0.22
Nodes (8): description, engines, node, license, main, name, type, version

### Community 47 - "sha256Content"
Cohesion: 0.13
Nodes (23): AnswerLedgerSchema, answersExportDocument(), APPROVAL_RECORD_SCHEMA_ID, approvalFileName(), ApprovalRecord, ApprovalRecordSchema, buildApprovalRecord(), ChangeLedgerSchema (+15 more)

### Community 48 - "api.ts"
Cohesion: 0.19
Nodes (11): ApiError, applyChanges(), applyRound(), approve(), bootstrapToken(), call(), cancel(), primeSessionId() (+3 more)

### Community 49 - "GraphifyAdapter"
Cohesion: 0.27
Nodes (3): GraphifyAdapter, IntelFailure, IntelItems

### Community 50 - "envelope.ts"
Cohesion: 0.18
Nodes (20): computeCostEnvelope(), CostEnvelope, measurePromptSizes(), PromptSize, renderCostEnvelopeTable(), VariantEnvelope, CLASSIFY_RULES, classifyAndProposeSingle() (+12 more)

### Community 51 - "package.json"
Cohesion: 0.25
Nodes (7): _archival, name, packageManager, private, scripts, test:spec, version

### Community 52 - "generate.ts"
Cohesion: 0.09
Nodes (33): Command, COMMANDS, GenerateVariant, InitProfile, parseArgs(), parseRenew(), ParseResult, RENEW_GRAMMAR (+25 more)

### Community 53 - "paid.ts"
Cohesion: 0.19
Nodes (14): defaultRenewalBudget(), renewalConsentState(), accountCompletionAttempts(), createPaidOperation(), deepFreeze(), deepFreezeRoute(), BASE_ENV, MAX_RECOVERY_WIRE_BYTES (+6 more)

### Community 54 - "app-errors.test.ts"
Cohesion: 0.33
Nodes (7): ASSETS, baseBundle(), blockedJson(), complete(), fakeLlm(), REAL_FETCH, startWorkspace()

### Community 55 - "trust/state.ts"
Cohesion: 0.08
Nodes (55): renewalPaths, RenewalProject, RenewalProjectSchema, emptyOverlay(), parseOverlayStore(), parseParityStore(), persistRenewalProject(), persistSnapshotFile() (+47 more)

### Community 56 - "context-provider.ts"
Cohesion: 0.12
Nodes (20): ContextBundle, ContextBundleSchema, ContextItem, ContextItemSchema, ContextLimits, RENEW_CONTEXT_LIMITS, AnalysisScope, ContextProvider (+12 more)

### Community 57 - "copy-browser-assets.js"
Cohesion: 0.25
Nodes (7): { copyFileSync, mkdirSync, readdirSync, writeFileSync }, files, { join }, MIME, outDir, root, srcDir

### Community 58 - "renew-consent-effectual.test.ts"
Cohesion: 0.15
Nodes (13): generateOptInFromEnv(), callRenewAnalyze(), callRenewStatus(), FIXTURES, TMP_PIN, tmpDirs, errorResponse(), handleRpcLine() (+5 more)

### Community 59 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck (+7 more)

### Community 60 - "fs-coverage.test.ts"
Cohesion: 0.19
Nodes (9): isTrustError(), TrustCitationError, TrustDomainTag, TrustError, TrustFsError, TrustPaidError, TrustStructuralError, authorizedStat() (+1 more)

### Community 61 - "score.ts"
Cohesion: 0.19
Nodes (23): allUnGrounded(), anchorSentences(), checkConstraintTrace(), commitmentSurfaces(), ConstraintFailureCode, containsTerm(), containsWholeTerm(), evaluateCandidate() (+15 more)

### Community 62 - "report.ts"
Cohesion: 0.09
Nodes (28): BadFixtureCapture, FIXTURES, genericBundleFor(), groundedBundleFor(), loadFixture(), U, createMockLlm(), MockScript (+20 more)

### Community 63 - "init.ts"
Cohesion: 0.10
Nodes (21): buildSections(), Contract, Decision, EvidenceItem, GlossaryEntry, InitOptions, InitResult, Intent (+13 more)

### Community 64 - "planner/plan.ts"
Cohesion: 0.17
Nodes (14): ArchitectureView, parityProjection, buildModernizationPlan(), PlanInputs, PlanOutcome, TaskSeed, BuildStrategyArgs, persistStrategy() (+6 more)

### Community 65 - "review-changes.ts"
Cohesion: 0.17
Nodes (11): ChangeSetValidation, CLARIFY_REVIEW_CHANGES_PROTOCOL, MAX_CHANGE_INSTRUCTION_CHARS, MAX_CHANGES_PER_SET, ReviewChange, ReviewChangeSchema, ReviewChangeSet, ReviewChangeSetSchema (+3 more)

### Community 66 - "screens-review.ts"
Cohesion: 0.23
Nodes (7): approveControl(), changePanel(), findSegment(), pendingTray(), renderReview(), ReviewActions, segmentEl()

### Community 67 - "context/redact.ts"
Cohesion: 0.31
Nodes (9): credentialAssignmentEnd(), isIdentCont(), isIdentStart(), isInlineSpace(), isValueStop(), redactCredentialAssignments(), RedactionResult, Rule (+1 more)

### Community 68 - "council.test.ts"
Cohesion: 0.13
Nodes (10): BUNDLE_OK(), CLASSIFIER_BLOCK, CLASSIFIER_OK, complete(), et01Bundle(), PET_CLINIC, complete(), et01Bundle() (+2 more)

### Community 69 - "orchestrator.ts"
Cohesion: 0.10
Nodes (35): applyEnrichment(), buildEnrichPrompt(), CLARIFY_ENRICH_PROTOCOL, DecisionEnrichment, EnrichedItemSchema, EnrichOutputSchema, EnrichParseResult, MAX_CONTEXT_CHARS (+27 more)

### Community 70 - "ledger.ts"
Cohesion: 0.09
Nodes (25): emptyParity(), nextParityId(), ParityEntry, ParityEntrySchema, ParityEvidenceSchema, ParityLoad, ParityStoreSchema, ApplyApprovalResult (+17 more)

### Community 71 - "cli.test.ts"
Cohesion: 0.22
Nodes (3): FIXTURES, SECTION_FILES, tmpDirs

### Community 72 - "models.ts"
Cohesion: 0.15
Nodes (12): BUILTIN_PROVIDERS, cmdModels(), fmt(), MAX_CATALOG_BYTES, ModelCatalogEntry, MODELS_REQUEST_TIMEOUT_MS, ModelsOptions, ModelsResult (+4 more)

### Community 73 - "root-invariants.test.ts"
Cohesion: 0.20
Nodes (12): ctxWindow(), FIXTURE_SRC, freshDir(), graphCaps(), groundedResponse(), initProject(), interiorCitation(), makeTarget() (+4 more)

### Community 74 - "scripts"
Cohesion: 0.22
Nodes (9): scripts, build, lint, prepublishOnly, pretest, smoke:packed, test, test:coverage (+1 more)

### Community 75 - "stdio.ts"
Cohesion: 0.10
Nodes (19): killActiveProcessGroups(), isJsonRpcId(), EPIPE_DRAIN_TIMEOUT_MS, EXIT_CLIENT_GONE, EXIT_DRAIN_TIMEOUT, EXIT_OK, jsonRpcError(), MAX_FRAME_BYTES (+11 more)

### Community 76 - "intel-contract.test.ts"
Cohesion: 0.18
Nodes (12): FIXTURE_SRC, freshDir(), graphWorkspace(), readFileFixture(), tmpDirs, bindStructuralArtifacts(), artifactSet(), bindingFor() (+4 more)

### Community 77 - "architecture.test.ts"
Cohesion: 0.36
Nodes (7): allSpecifiers(), importSpecifiers(), PKG, productionFiles(), REL(), renewalSurface(), WRITE_PRIMITIVES

### Community 78 - ".render"
Cohesion: 0.31
Nodes (6): App, questionsScreen(), initialState(), setCurrentIndex(), setDraft(), setNotice()

### Community 79 - "orchestrator.test.ts"
Cohesion: 0.27
Nodes (8): MAX_CLARIFY_ROUNDS, atReview(), blockedBundle(), bundle(), complete(), OPTS, scriptedLlm(), sessionWith()

### Community 80 - "el"
Cohesion: 0.28
Nodes (10): cssEscape(), navRow(), progressBar(), QuestionActions, questionCard(), renderPreview(), renderQuestions(), openQuestions() (+2 more)

### Community 81 - "recovery/prompts.ts"
Cohesion: 0.30
Nodes (13): redactSecrets(), runRecovery(), buildRecoveryPrompt(), buildValidationRetryPrompt(), countEgressRedactions(), EgressProjection, escapeLineUnsafe(), projectItemForEgress() (+5 more)

### Community 82 - "compileSpecDir"
Cohesion: 0.07
Nodes (18): ChildOutcome, CLI_JS, SECTION_FILES, tmpDirs, compiledBundle(), FIXTURES, SECTION_FILES, tmpDirs (+10 more)

### Community 83 - "legacy-app/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, version

### Community 84 - "snapshot.ts"
Cohesion: 0.20
Nodes (16): createSnapshot(), deriveSnapshotId(), ProjectSnapshot, ProjectSnapshotSchema, reloadSnapshot(), Sha256, SnapshotFileEntrySchema, snapshotIdentityPayload() (+8 more)

### Community 85 - "trust/evidence.ts"
Cohesion: 0.16
Nodes (13): CitationClaim, CitationClaimSchema, ContextBundleIdentity, ContextRecord, EvidenceRole, ResolvedCitation, SealedContext, SuppliedContextSlice (+5 more)

### Community 87 - "authority.ts"
Cohesion: 0.11
Nodes (24): loadRenewalApproval(), RenewalApprovalLoad, RenewalDecisionSetSchema, payload, tmpDirs, WriteApprovalResult, ActiveAuthorityScope, ApprovalDecision (+16 more)

### Community 89 - "browser-client/types.ts"
Cohesion: 0.18
Nodes (10): ApiResponse, ChangeOutcome, DecisionStatus, OptionView, Progress, QuestionView, Review, ReviewSegment (+2 more)

### Community 90 - "good-fixture-gate.test.ts"
Cohesion: 0.09
Nodes (21): cmdPlan(), PlanOptions, PlanResult, PlanTask, renderHuman(), renderJson(), TopoResult, topoSort() (+13 more)

### Community 91 - "snapshot-trust.test.ts"
Cohesion: 0.27
Nodes (10): baseCaps(), ctxWindow(), FIXTURE_SRC, fixtureGraph(), freshDir(), initPair(), interiorCitation(), makeTarget() (+2 more)

### Community 92 - "make-bins-executable.js"
Cohesion: 0.50
Nodes (3): BINS, { join }, { readFileSync, chmodSync }

### Community 93 - "clarify-trust.test.ts"
Cohesion: 0.20
Nodes (7): FIXTURE_SRC, freshDir(), graphCaps(), makeTarget(), tmpDirs, parityGate, assertSupportPolicy()

### Community 94 - "concurrency.test.ts"
Cohesion: 0.25
Nodes (8): capsWith(), complete(), ctxWindow(), FIXTURE_SRC, fixtureGraph(), freshReviewedProject(), OUTPUT(), tmpDirs

### Community 95 - "write-spec.ts"
Cohesion: 0.29
Nodes (7): SECTION_KEYS, stageSpecDir(), PET_CLINIC, SECTION_FILES, tmpDirs, writeSpecDir(), assertNotSymlink()

### Community 96 - "llm/http.test.ts"
Cohesion: 0.22
Nodes (6): BudgetExceededError, FAKE_ENV, FakeEnv, jsonResponse(), okFetch(), PartialFakeEnv

### Community 97 - "packed-install-smoke.sh"
Cohesion: 1.00
Nodes (3): run(), say(), packed-install-smoke.sh script

### Community 98 - "graph-reader.ts"
Cohesion: 0.07
Nodes (25): LlmResponse, singleRoutePlan(), FIXTURE_SRC, tmpDirs, FIXTURE_SRC, tmpDirs, StaticGraphProvider, GraphParseResult (+17 more)

### Community 99 - "planner-trust.test.ts"
Cohesion: 0.29
Nodes (8): analyzedProject(), caps(), ctxWindow(), FIXTURE_SRC, freshDir(), interiorCitation(), rulePreserve(), tmpDirs

### Community 100 - "prepublish-check.js"
Cohesion: 0.29
Nodes (5): describe, pkg, result, { spawnSync }, status

### Community 101 - "commands/trace.test.ts"
Cohesion: 0.11
Nodes (15): cmdTrace(), renderTrace(), FIXTURES, SECTION_FILES, tmpDirs, TraceResult, buildTrace(), DecSpec (+7 more)

### Community 102 - "verifier.ts"
Cohesion: 0.24
Nodes (10): AnchorBatchResult, AnchorFailureCode, AnchorVerification, canonicalFileHash(), CodeAnchorInput, countLines(), isValidAnchorPath(), tmpDirs (+2 more)

### Community 103 - "hash.ts"
Cohesion: 0.08
Nodes (31): artifactHashes(), canonicalSectionHash(), FIXTURES, freezeLegacyStyle(), HASHED_KEYS, makeSpecRoot(), PRE_RENEWAL_FIXTURE, rotateKeys() (+23 more)

### Community 104 - "journey.test.ts"
Cohesion: 0.22
Nodes (7): capsWith(), CONFORMING_OUTPUT(), FIXTURE_SRC, interiorCitation(), inventory(), sha(), tmpDirs

### Community 105 - "renew-richstate.test.ts"
Cohesion: 0.24
Nodes (7): analysisRecord(), caps(), FIXTURE_SRC, freshDir(), makeTarget(), sha(), tmpDirs

### Community 106 - "files"
Cohesion: 0.33
Nodes (6): files, dist, examples, generated, LICENSE, README.md

### Community 107 - "app.test.ts"
Cohesion: 0.32
Nodes (6): ASSETS, blocked(), bootApp(), bundle(), settle(), waitFor()

### Community 108 - "corpus-lock.ts"
Cohesion: 0.21
Nodes (18): canonicalJson(), computeCorpusHash(), CORPUS_LOCK_VERSION, CorpusLock, CorpusLockEntry, frozenThresholds, loadCorpusLock(), lockCandidates() (+10 more)

### Community 109 - "clarify.test.ts"
Cohesion: 0.40
Nodes (3): BASE, complete(), unresolvedBundle()

### Community 111 - "report.test.ts"
Cohesion: 0.60
Nodes (4): fixtures15(), liveInput(), passInput(), passRuns()

### Community 112 - "check/redact.ts"
Cohesion: 0.47
Nodes (4): REDACTION_RULES, RedactionRule, redactSecrets(), SecretKind

### Community 113 - "runcli-renew.test.ts"
Cohesion: 0.40
Nodes (5): FIXTURE_SRC, freshDir(), graphifyAvailable, makeTarget(), tmpDirs

### Community 116 - "server.test.ts"
Cohesion: 0.12
Nodes (18): EXEC_ROOT_ENV, callTool(), expectIdentical(), FIXTURES, freshOutside(), freshRoot(), frozenRoot(), injectionRoot() (+10 more)

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
- **673 isolated node(s):** `tmpDirs`, `payload`, `tmpDirs`, `RenewalStateIdentity`, `TrustedStoreResult` (+668 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SpecBundle` connect `SpecBundle` to `generate-interactive.ts`, `check/runner.ts`, `lintBundle`, `engine.ts`, `SpecBundleSchema`, `generate.test.ts`, `consent.ts`, `scale-benchmark.test.ts`, `lifecycle.ts`, `eval/runner.ts`, `constraint-trace.test.ts`, `adapter.ts`, `tasks/index.ts`, `schemas/index.ts`, `sha256Content`, `generate.ts`, `score.ts`, `report.ts`, `planner/plan.ts`, `review-changes.ts`, `council.test.ts`, `orchestrator.ts`, `orchestrator.test.ts`, `compileSpecDir`, `good-fixture-gate.test.ts`, `write-spec.ts`, `commands/trace.test.ts`, `hash.ts`, `app.test.ts`, `clarify.test.ts`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **Why does `LlmAdapter` connect `adapter.ts` to `generate-interactive.ts`, `pipeline.test.ts`, `server.ts`, `generate.test.ts`, `distiller.ts`, `llm-config.ts`, `app.ts`, `providers.ts`, `eval/runner.ts`, `tasks/index.ts`, `renew.ts`, `generate.ts`, `paid.ts`, `app-errors.test.ts`, `report.ts`, `council.test.ts`, `orchestrator.ts`, `root-invariants.test.ts`, `orchestrator.test.ts`, `snapshot-trust.test.ts`, `clarify-trust.test.ts`, `concurrency.test.ts`, `graph-reader.ts`, `planner-trust.test.ts`, `journey.test.ts`, `renew-richstate.test.ts`, `app.test.ts`, `clarify.test.ts`, `pipeline-taxonomy.test.ts`, `server.test.ts`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Why does `GraphifyAdapter` connect `GraphifyAdapter` to `graphify-adapter.test.ts`, `server.ts`, `intel-contract.test.ts`, `graphify-adapter.ts`, `app.ts`, `CodeIntelligenceProvider`, `cli/index.ts`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **What connects `tmpDirs`, `payload`, `tmpDirs` to the rest of the system?**
  _673 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `generate-interactive.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07183673469387755 - nodes in this community are weakly interconnected._
- **Should `check/runner.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06533776301218161 - nodes in this community are weakly interconnected._
- **Should `lintBundle` be split into smaller, more focused modules?**
  _Cohesion score 0.14705882352941177 - nodes in this community are weakly interconnected._