# Graph Report - llm_council_orchestrator  (2026-09-05)

## Corpus Check
- 398 files · ~403,373 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2625 nodes · 7181 edges · 112 communities (105 shown, 7 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `597006f2`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- server/http.ts
- app.ts
- pipeline.test.ts
- check/runner.ts
- compileSpecDir
- score.ts
- composition.test.ts
- live-experiment.ts
- engine.ts
- orchestrator.ts
- generate.test.ts
- server.ts
- manifest.json
- distiller.ts
- cli/index.ts
- createClarifySession
- llm-config.ts
- ledger.ts
- doctor.ts
- workspace-copy.ts
- cmdRenewInit
- compilerOptions
- SpecBundleSchema
- ledger.test.ts
- llm-config.test.ts
- openai-compatible.ts
- scale-benchmark.test.ts
- lifecycle.ts
- check.test.ts
- eval/runner.ts
- orders.ts
- pipeline.ts
- commands/plan.test.ts
- overlay.ts
- graphify-adapter.test.ts
- constraint-trace.test.ts
- planner/plan.ts
- runner-roles.test.ts
- devDependencies
- fixture-provider.ts
- planner/plan.test.ts
- renew.ts
- SpecBundle
- schemas/index.ts
- sha256Content
- run-eval.test.ts
- spec-core/package.json
- src/clarify/approvals.ts
- fs.ts
- hash-compat.test.ts
- budget.ts
- package.json
- root-invariants.test.ts
- paid.ts
- ClarifySession
- trust/state.ts
- parseGraphText
- copy-browser-assets.js
- renew-consent-effectual.test.ts
- compilerOptions
- McpStdioServer
- tasks/index.ts
- report.ts
- init.ts
- graph-reader.ts
- review-changes.ts
- isolation.test.ts
- context/redact.ts
- runcli-renew.test.ts
- RenewalRoundDriver
- strategy.ts
- review.ts
- l08.test.ts
- OPENROUTER_DEFAULT_BASE_URL
- scripts
- stdio.ts
- l02.test.ts
- architecture.test.ts
- args.ts
- orchestrator.test.ts
- l07.test.ts
- context-provider.ts
- legacy-app/package.json
- snapshot.ts
- council.test.ts
- models.ts
- authority.ts
- revision.ts
- orchestrator.branch-coverage.test.ts
- commands/plan.ts
- snapshot-trust.test.ts
- make-bins-executable.js
- renew-richstate.test.ts
- CodeIntelligenceProvider
- generate.ts
- cli.test.ts
- packed-install-smoke.sh
- prepublish-check.js
- commands/trace.test.ts
- verifier.ts
- hash.ts
- files
- corpus-lock.ts
- prepublish-check.boundary.test.ts
- adapter.ts
- eval/runner.test.ts
- server.test.ts
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
- `ApplyResult` --references--> `SpecBundle`  [EXTRACTED]
  packages/spec-core/src/compiler/changeset.ts → packages/spec-core/src/schemas/index.ts
- `MockEvalScripts` --references--> `MockScript`  [EXTRACTED]
  packages/spec-core/src/eval/report.ts → packages/spec-core/src/eval/llm/mock.ts
- `HandleRpcOptions` --references--> `LlmAdapter`  [EXTRACTED]
  packages/spec-core/src/mcp/server.ts → packages/spec-core/src/eval/llm/adapter.ts
- `renewCaps()` --calls--> `renewalPaths`  [EXTRACTED]
  packages/spec-core/src/mcp/server.ts → packages/spec-core/src/renew/core/project-record.ts
- `compiledBundle()` --calls--> `compileSpecDir()`  [EXTRACTED]
  packages/spec-core/src/cli/commands/trace.test.ts → packages/spec-core/src/compiler/compile.ts

## Import Cycles
- 3-file cycle: `packages/spec-core/src/eval/budget.ts -> packages/spec-core/src/eval/llm/http.ts -> packages/spec-core/src/llm/openai-compatible.ts -> packages/spec-core/src/eval/budget.ts`

## Communities (112 total, 7 thin omitted)

### Community 0 - "server/http.ts"
Cohesion: 0.06
Nodes (30): ASSETS, baseBundle(), blockedJson(), complete(), fakeLlm(), REAL_FETCH, startWorkspace(), ASSETS (+22 more)

### Community 1 - "app.ts"
Cohesion: 0.05
Nodes (77): ApiError, applyChanges(), applyRound(), approve(), bootstrapToken(), call(), cancel(), primeSessionId() (+69 more)

### Community 2 - "pipeline.test.ts"
Cohesion: 0.13
Nodes (14): ClarifySessionOptions, LlmPlan, RecoveryDeps, depsFor(), freshDir(), makeBundle(), persisted, sealedFor() (+6 more)

### Community 3 - "check/runner.ts"
Cohesion: 0.05
Nodes (39): parseExpect(), REDACTION_RULES, RedactionRule, redactSecrets(), SecretKind, activeProcessGroups, childCtl, FIXTURES (+31 more)

### Community 4 - "compileSpecDir"
Cohesion: 0.08
Nodes (30): applyUnderLock(), ChangeResult, cmdChange(), findingLine(), FIXTURES, frozenSpecRoot(), inlineBundle(), makeSpecRoot() (+22 more)

### Community 5 - "score.ts"
Cohesion: 0.12
Nodes (27): allUnGrounded(), ConstraintFailure, calcs(), GateCalcs, GateReportInput, renderGateReport(), fixtures15(), liveInput() (+19 more)

### Community 6 - "composition.test.ts"
Cohesion: 0.16
Nodes (14): capsWith(), FIXTURE_SRC, freshProject(), tmpDirs, FIXTURE_SRC, freshProject(), tmpDirs, bundleDigestPayload() (+6 more)

### Community 7 - "live-experiment.ts"
Cohesion: 0.12
Nodes (23): aggregateEmitted(), Aggregation, EMITTED_SCHEMA, EmittedOutcome, loadRunDir(), parseEmittedOutcome(), renderAggregation(), baseScore() (+15 more)

### Community 8 - "engine.ts"
Cohesion: 0.13
Nodes (19): EXPECT_GRAMMAR_DOC, EXPECTED_EXIT_PATTERN, isJudgeableExpect(), RULES, rule, rule, rule, rule (+11 more)

### Community 9 - "orchestrator.ts"
Cohesion: 0.17
Nodes (19): ClarificationQuestionView, DecisionRecords, mergeRoundRecords(), ChangeSetChangeOutcome, ChangeSetOutcome, SessionOpResult, SessionSnapshot, SessionUsageSummary (+11 more)

### Community 10 - "generate.test.ts"
Cohesion: 0.10
Nodes (12): complete(), FAKE_ENV, fetchSpy(), jsonResponse(), PET_CLINIC, PROFILE_CONFIG, SECTION_FILES, SESSION_SERVICE (+4 more)

### Community 11 - "server.ts"
Cohesion: 0.06
Nodes (50): DEFAULT_GENERATE_PROFILE, authorizeExecution(), checkPreviewDigest(), consentDigestLine(), EXEC_OPT_IN_ENV, EXEC_ROOT_ENV, ExecAuthorization, ExecBoundary (+42 more)

### Community 12 - "manifest.json"
Cohesion: 0.07
Nodes (28): artifact_hashes, assumptions, contracts, decisions, evidence, glossary, intent, requirements (+20 more)

### Community 13 - "distiller.ts"
Cohesion: 0.15
Nodes (16): DistillerInputs, distillRenewalQuestions(), evidenceOf(), makeRenewalDriver(), RENEWAL_CLAIM_ID, STRATEGY_CLAIM_ID, STRATEGY_OPTIONS, strategyQuestion() (+8 more)

### Community 14 - "cli/index.ts"
Cohesion: 0.18
Nodes (19): commandHelp(), renewSubHelp(), cmdCheck(), cmdCompile(), compileFailedOutput(), CompileResult, normalizeFileIntent(), cmdLint() (+11 more)

### Community 15 - "createClarifySession"
Cohesion: 0.16
Nodes (17): applyEnrichment(), buildEnrichPrompt(), CLARIFY_ENRICH_PROTOCOL, DecisionEnrichment, EnrichedItemSchema, EnrichOutputSchema, EnrichParseResult, MAX_CONTEXT_CHARS (+9 more)

### Community 16 - "llm-config.ts"
Cohesion: 0.11
Nodes (21): RFC-7230, BaseUrlSchema, GLM, resolveSingleRole(), HeaderNameSchema, LINK_LOCAL_PREFIXES, LlmConfig, LlmConfigSchema (+13 more)

### Community 17 - "ledger.ts"
Cohesion: 0.15
Nodes (15): nextParityId(), ParityEntry, ParityEvidenceSchema, ParityLoad, ParityStoreSchema, ApplyApprovalResult, NewParityEntry, ParityBlocker (+7 more)

### Community 18 - "doctor.ts"
Cohesion: 0.10
Nodes (31): BIN_FILES, BUDGET_ENV, checkBins(), checkBudgetEnv(), checkLlmConfig(), checkLock(), checkMcpFlags(), checkNodeVersion() (+23 more)

### Community 19 - "workspace-copy.ts"
Cohesion: 0.12
Nodes (17): loadRenewalApproval(), DEFAULT_INGEST_LIMITS, DENIED_BASE_PATTERNS, DENIED_DIRS, guardPath(), GuardVerdict, IngestLimits, isDeniedDirectory() (+9 more)

### Community 20 - "cmdRenewInit"
Cohesion: 0.15
Nodes (24): cmdRenewInit(), currentStaleness(), readWorkspaceFile(), bindStructuralArtifacts(), coerceStructuralBinding(), artifactSet(), bindingFor(), bindingOf() (+16 more)

### Community 21 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, esModuleInterop, lib, module, moduleResolution, noEmitOnError, outDir, rootDir (+11 more)

### Community 22 - "SpecBundleSchema"
Cohesion: 0.13
Nodes (9): BAD, BadFixtureExpectation, GOOD, SpecBundleForExport, GENERATED_PATH, SpecBundleSchema, FIXTURES, validManifest (+1 more)

### Community 23 - "ledger.test.ts"
Cohesion: 0.18
Nodes (14): ParityEntrySchema, parseParityStore(), loadParityFile(), ANCHOR, approval(), freshDir(), hypothesisAnalysis(), loadParityFile() (+6 more)

### Community 25 - "openai-compatible.ts"
Cohesion: 0.10
Nodes (28): ResolvedRole, BudgetLedger, baseConfig(), jsonResponse(), okBody(), ChatResponse, CostExtractor, createOpenAiCompatibleLlm() (+20 more)

### Community 26 - "scale-benchmark.test.ts"
Cohesion: 0.08
Nodes (19): PlanTask, ChangeSet, ClosureFinding, ClosureFindingCode, closureFindings(), DuplicateTaskId, duplicateTaskIds(), firstOverlap() (+11 more)

### Community 27 - "lifecycle.ts"
Cohesion: 0.12
Nodes (24): applyChangeSet(), ApplyResult, ChangeSetSchema, formatIssues(), checkTransition(), FREEZE_REFUSAL_HINTS, LIFECYCLE_STATES, LIFECYCLE_TRANSITIONS (+16 more)

### Community 28 - "check.test.ts"
Cohesion: 0.21
Nodes (9): evidenceOf(), evidencePath(), FIXTURES, freshRoot(), initRoot(), makeSpecRoot(), SECTION_FILES, tmpDirs (+1 more)

### Community 29 - "eval/runner.ts"
Cohesion: 0.08
Nodes (51): CouncilTopology, DecomposedCouncilDeps, runDecomposedCouncil(), measurePromptSizes(), CLASSIFY_RULES, classifyAndProposeSingle(), classifySingle(), CONSTRAINT_FIDELITY (+43 more)

### Community 30 - "orders.ts"
Cohesion: 0.22
Nodes (13): checkStock(), decrementStock(), stock, CATALOG, quote(), run(), createOrder(), OrderResult (+5 more)

### Community 31 - "pipeline.ts"
Cohesion: 0.05
Nodes (37): SCRIPTED_INVALID, tmpDirs, MAX_RECOVERY_PROMPT_BYTES, RecoveryOutcome, UsageState, zodIssues(), RECOVERY_PROMPT_PROTOCOL, AnalysisUsageSchema (+29 more)

### Community 32 - "commands/plan.test.ts"
Cohesion: 0.17
Nodes (4): compiledBundle(), FIXTURES, SECTION_FILES, tmpDirs

### Community 33 - "overlay.ts"
Cohesion: 0.16
Nodes (22): nextOverlayId(), OVERLAY_RELATIONS, OverlayEntityRefSchema, OverlayLoad, OverlayRecord, OverlayRecordSchema, OverlayRelation, OverlayStoreSchema (+14 more)

### Community 34 - "graphify-adapter.test.ts"
Cohesion: 0.08
Nodes (19): GraphifyAdapterOptions, cleanup, installedVersion, parseGraphifyVersion(), bindingTextFor(), fixtureGraphText, fixturePath, validManifestText (+11 more)

### Community 35 - "constraint-trace.test.ts"
Cohesion: 0.18
Nodes (13): et07Requirement(), et12Requirement(), failureCodes(), FIXTURES, genericBundleFor(), groundedEt01(), groundedEt02(), groundedEt04() (+5 more)

### Community 36 - "planner/plan.ts"
Cohesion: 0.33
Nodes (11): ArchitectureView, ProjectSnapshot, OverlayStore, ParityStore, OverlayStalenessResult, PlanInputs, PlanOutcome, TaskSeed (+3 more)

### Community 37 - "runner-roles.test.ts"
Cohesion: 0.10
Nodes (9): BASE, complete(), unresolvedBundle(), complete(), et01Bundle(), PET_CLINIC, PET_CLINIC, U (+1 more)

### Community 38 - "devDependencies"
Cohesion: 0.15
Nodes (13): jsdom, devDependencies, jsdom, @types/node, typescript, vitest, @vitest/coverage-v8, zod-to-json-schema (+5 more)

### Community 39 - "fixture-provider.ts"
Cohesion: 0.10
Nodes (28): StaticGraphProvider, affectedReverse(), graphHealthOf(), neighborhood(), querySeeds(), shortestPath(), ParsedGraph, compareTriple() (+20 more)

### Community 40 - "planner/plan.test.ts"
Cohesion: 0.26
Nodes (11): archView, baseInputs(), blastRadius(), fixtureGraphPath, graphParsed, MANIFEST, ruledParity(), sha() (+3 more)

### Community 41 - "renew.ts"
Cohesion: 0.07
Nodes (44): affectedSync(), analyzeWithFresh(), cmdRenewExport(), cmdRenewPlan(), cmdRenewRefresh(), cmdRenewReview(), cmdRenewStatus(), finishReview() (+36 more)

### Community 42 - "SpecBundle"
Cohesion: 0.07
Nodes (25): cleanLint, FIXTURES, CompileResult, freeze(), FreezeResult, cleanLint, FIXTURES, frozenPetClinic() (+17 more)

### Community 43 - "schemas/index.ts"
Cohesion: 0.09
Nodes (32): AssumptionIdSchema, ContractIdSchema, DecisionIdSchema, EvidenceIdSchema, IdSchema, ImpactLevelSchema, RequirementIdSchema, TaskIdSchema (+24 more)

### Community 44 - "sha256Content"
Cohesion: 0.15
Nodes (23): AnswerCheck, answerToUserAnswer(), applyAnswersToRecords(), ApplyResult, attachStatuses(), QUESTIONS, ClarificationAnswer, ClarificationOptionView (+15 more)

### Community 45 - "run-eval.test.ts"
Cohesion: 0.26
Nodes (8): DEFAULT_REPORT_PATH, LIVE_ENV_VARS, missingLiveEnv(), parseArgs(), ParsedArgs, runEvalCli(), FAKE_LIVE_ENV, mockRunEvalAll

### Community 46 - "spec-core/package.json"
Cohesion: 0.22
Nodes (8): description, engines, node, license, main, name, type, version

### Community 47 - "src/clarify/approvals.ts"
Cohesion: 0.18
Nodes (14): AnswerLedgerSchema, answersExportDocument(), APPROVAL_RECORD_SCHEMA_ID, approvalFileName(), ApprovalRecord, ApprovalRecordSchema, buildApprovalRecord(), ChangeLedgerSchema (+6 more)

### Community 48 - "fs.ts"
Cohesion: 0.06
Nodes (49): isTrustError(), TrustAuthorityError, TrustCitationError, TrustDomainTag, TrustError, TrustFsError, TrustPaidError, TrustStateError (+41 more)

### Community 49 - "hash-compat.test.ts"
Cohesion: 0.22
Nodes (7): FIXTURES, HASHED_KEYS, makeSpecRoot(), PRE_RENEWAL_FIXTURE, rotateKeys(), SECTION_FILES, tmpDirs

### Community 50 - "budget.ts"
Cohesion: 0.12
Nodes (22): BudgetCap, BudgetExceededError, BudgetSpentSnapshot, DEFAULT_WALL_SLACK_MS, MAX_COMPLETIONS, maxCompletions(), ResolvedRunBudget, resolveRunBudget() (+14 more)

### Community 51 - "package.json"
Cohesion: 0.25
Nodes (7): _archival, name, packageManager, private, scripts, test:spec, version

### Community 52 - "root-invariants.test.ts"
Cohesion: 0.24
Nodes (12): ctxWindow(), FIXTURE_SRC, freshDir(), graphCaps(), groundedResponse(), initProject(), interiorCitation(), makeTarget() (+4 more)

### Community 53 - "paid.ts"
Cohesion: 0.20
Nodes (9): createBudgetLedger(), accountCompletionAttempts(), createPaidOperation(), BASE_ENV, MAX_RECOVERY_WIRE_BYTES, ownField(), PaidOperation, ResolvedPaidRoute (+1 more)

### Community 55 - "trust/state.ts"
Cohesion: 0.07
Nodes (63): renewalConsentState(), transitiveRenewalRootCheck(), renewalPaths, RenewalProject, RenewalProjectSchema, reloadSnapshot(), dirs, MINIMAL_PROJECT (+55 more)

### Community 56 - "parseGraphText"
Cohesion: 0.05
Nodes (49): cmdRenewAnalyze(), RenewCapabilities, singleRoutePlan(), initProject(), FIXTURE_SRC, tmpDirs, FIXTURE_SRC, freshDir() (+41 more)

### Community 57 - "copy-browser-assets.js"
Cohesion: 0.25
Nodes (7): { copyFileSync, mkdirSync, readdirSync, writeFileSync }, files, { join }, MIME, outDir, root, srcDir

### Community 58 - "renew-consent-effectual.test.ts"
Cohesion: 0.11
Nodes (17): generateOptInFromEnv(), callRenewAnalyze(), callRenewStatus(), FIXTURES, TMP_PIN, tmpDirs, errorResponse(), callTool() (+9 more)

### Community 59 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck (+7 more)

### Community 60 - "McpStdioServer"
Cohesion: 0.24
Nodes (5): jsonRpcError(), McpStdioServer, Harness, makeSession(), toolRefusal()

### Community 61 - "tasks/index.ts"
Cohesion: 0.11
Nodes (27): anchorSentences(), checkConstraintTrace(), commitmentSurfaces(), ConstraintFailureCode, containsTerm(), containsWholeTerm(), evaluateCandidate(), expandNumberToken() (+19 more)

### Community 62 - "report.ts"
Cohesion: 0.09
Nodes (30): BadFixtureCapture, gateVerdict, FIXTURES, genericBundleFor(), groundedBundleFor(), loadFixture(), U, createMockLlm() (+22 more)

### Community 63 - "init.ts"
Cohesion: 0.09
Nodes (24): buildSections(), Contract, Decision, EvidenceItem, GlossaryEntry, InitOptions, InitResult, Intent (+16 more)

### Community 64 - "graph-reader.ts"
Cohesion: 0.08
Nodes (24): ArchitectureViewSchema, buildArchitectureView(), GENERATED_PATTERNS, isGeneratedPath(), fixturePath, loadGraph(), MANIFEST, rawFixture (+16 more)

### Community 65 - "review-changes.ts"
Cohesion: 0.19
Nodes (12): BehaviorReview, changeRequestEvidence, ChangeSetValidation, CLARIFY_REVIEW_CHANGES_PROTOCOL, MAX_CHANGE_INSTRUCTION_CHARS, MAX_CHANGES_PER_SET, ReviewChange, ReviewChangeSchema (+4 more)

### Community 66 - "isolation.test.ts"
Cohesion: 0.39
Nodes (6): FIXTURE_SRC, freshDir(), graphCaps(), initializedPair(), makeTarget(), tmpDirs

### Community 67 - "context/redact.ts"
Cohesion: 0.31
Nodes (9): credentialAssignmentEnd(), isIdentCont(), isIdentStart(), isInlineSpace(), isValueStop(), redactCredentialAssignments(), RedactionResult, Rule (+1 more)

### Community 68 - "runcli-renew.test.ts"
Cohesion: 0.40
Nodes (5): FIXTURE_SRC, freshDir(), graphifyAvailable, makeTarget(), tmpDirs

### Community 70 - "strategy.ts"
Cohesion: 0.26
Nodes (10): BuildStrategyArgs, persistStrategy(), loadStrategyFile(), tmpDirs, loadStrategyFile(), MODERNIZATION_STRATEGIES, ModernizationStrategy, parseStrategyDecision() (+2 more)

### Community 71 - "review.ts"
Cohesion: 0.29
Nodes (7): canonicalJson(), FAMILY_SECTIONS, projectReview(), ReviewSection, ReviewSegment, segment(), specContentDigest()

### Community 72 - "l08.test.ts"
Cohesion: 0.67
Nodes (3): FIXTURES, inState(), loadBundle()

### Community 73 - "OPENROUTER_DEFAULT_BASE_URL"
Cohesion: 0.50
Nodes (3): OPENROUTER_DEFAULT_BASE_URL, PROVIDER_KINDS, ROUTELLM_DEFAULT_BASE_URL

### Community 74 - "scripts"
Cohesion: 0.22
Nodes (9): scripts, build, lint, prepublishOnly, pretest, smoke:packed, test, test:coverage (+1 more)

### Community 75 - "stdio.ts"
Cohesion: 0.14
Nodes (15): isJsonRpcId(), isPlainObject(), validateJsonRpcEnvelope(), EPIPE_DRAIN_TIMEOUT_MS, EXIT_CLIENT_GONE, EXIT_DRAIN_TIMEOUT, EXIT_OK, MAX_FRAME_BYTES (+7 more)

### Community 77 - "architecture.test.ts"
Cohesion: 0.31
Nodes (7): allSpecifiers(), importSpecifiers(), PKG, productionFiles(), REL(), renewalSurface(), WRITE_PRIMITIVES

### Community 78 - "args.ts"
Cohesion: 0.09
Nodes (24): errOf(), Command, COMMANDS, GenerateVariant, InitProfile, parseArgs(), parseRenew(), ParseResult (+16 more)

### Community 79 - "orchestrator.test.ts"
Cohesion: 0.27
Nodes (8): MAX_CLARIFY_ROUNDS, atReview(), blockedBundle(), bundle(), complete(), OPTS, scriptedLlm(), sessionWith()

### Community 81 - "context-provider.ts"
Cohesion: 0.08
Nodes (37): ContextBundle, ContextBundleSchema, ContextItem, ContextItemSchema, ContextLimits, RENEW_CONTEXT_LIMITS, AnalysisScope, ContextProvider (+29 more)

### Community 83 - "legacy-app/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, version

### Community 84 - "snapshot.ts"
Cohesion: 0.18
Nodes (17): createSnapshot(), deriveSnapshotId(), ProjectSnapshotSchema, Sha256, SnapshotFileEntrySchema, snapshotIdentityPayload(), SnapshotInputs, SnapshotReload (+9 more)

### Community 85 - "council.test.ts"
Cohesion: 0.28
Nodes (6): BUNDLE_OK(), CLASSIFIER_BLOCK, CLASSIFIER_OK, complete(), et01Bundle(), PET_CLINIC

### Community 86 - "models.ts"
Cohesion: 0.15
Nodes (12): BUILTIN_PROVIDERS, cmdModels(), fmt(), MAX_CATALOG_BYTES, ModelCatalogEntry, MODELS_REQUEST_TIMEOUT_MS, ModelsOptions, ModelsResult (+4 more)

### Community 87 - "authority.ts"
Cohesion: 0.10
Nodes (23): RenewalApprovalLoad, RenewalDecisionSet, RenewalDecisionSetSchema, payload, tmpDirs, WriteApprovalResult, ParityGateApprovals, ActiveAuthorityScope (+15 more)

### Community 88 - "revision.ts"
Cohesion: 0.08
Nodes (27): SECTION_KEYS, stageSpecDir(), PET_CLINIC, SECTION_FILES, tmpDirs, writeSpecDir(), assertNotSymlink(), acquireSpecRootLock() (+19 more)

### Community 89 - "orchestrator.branch-coverage.test.ts"
Cohesion: 0.43
Nodes (7): atReview(), blockedBundle(), bundle(), complete(), OPTS, scriptedLlm(), sessionWith()

### Community 90 - "commands/plan.ts"
Cohesion: 0.14
Nodes (16): cmdPlan(), PlanOptions, PlanResult, renderHuman(), renderJson(), TopoResult, topoSort(), LevelLoadResult (+8 more)

### Community 91 - "snapshot-trust.test.ts"
Cohesion: 0.27
Nodes (10): baseCaps(), ctxWindow(), FIXTURE_SRC, fixtureGraph(), freshDir(), initPair(), interiorCitation(), makeTarget() (+2 more)

### Community 92 - "make-bins-executable.js"
Cohesion: 0.50
Nodes (3): BINS, { join }, { readFileSync, chmodSync }

### Community 93 - "renew-richstate.test.ts"
Cohesion: 0.24
Nodes (7): analysisRecord(), caps(), FIXTURE_SRC, freshDir(), makeTarget(), sha(), tmpDirs

### Community 95 - "generate.ts"
Cohesion: 0.12
Nodes (28): sessionLedgerEnvelope(), buildLlmPlanFromProfile(), checkIntent(), clarificationBlock(), cmdGenerate(), GenerateOptions, GenerateResult, IntentCheck (+20 more)

### Community 96 - "cli.test.ts"
Cohesion: 0.12
Nodes (6): FIXTURES, SECTION_FILES, tmpDirs, FIXTURES, SECTION_FILES, tmpDirs

### Community 97 - "packed-install-smoke.sh"
Cohesion: 1.00
Nodes (3): run(), say(), packed-install-smoke.sh script

### Community 100 - "prepublish-check.js"
Cohesion: 0.29
Nodes (5): describe, pkg, result, { spawnSync }, status

### Community 101 - "commands/trace.test.ts"
Cohesion: 0.10
Nodes (16): cmdTrace(), renderTrace(), compiledBundle(), FIXTURES, SECTION_FILES, tmpDirs, TraceResult, buildTrace() (+8 more)

### Community 102 - "verifier.ts"
Cohesion: 0.24
Nodes (10): AnchorBatchResult, AnchorFailureCode, AnchorVerification, canonicalFileHash(), CodeAnchorInput, countLines(), isValidAnchorPath(), tmpDirs (+2 more)

### Community 103 - "hash.ts"
Cohesion: 0.11
Nodes (22): artifactHashes(), canonicalSectionHash(), freezeLegacyStyle(), HASHED_SECTIONS, legacyArtifactHashes(), legacySectionHash(), FIXTURES, HASHED_KEYS (+14 more)

### Community 106 - "files"
Cohesion: 0.33
Nodes (6): files, dist, examples, generated, LICENSE, README.md

### Community 108 - "corpus-lock.ts"
Cohesion: 0.24
Nodes (16): canonicalJson(), computeCorpusHash(), CORPUS_LOCK_VERSION, CorpusLock, CorpusLockEntry, frozenThresholds, loadCorpusLock(), lockCandidates() (+8 more)

### Community 114 - "adapter.ts"
Cohesion: 0.15
Nodes (12): LlmAdapter, LlmCompleteOptions, LlmResponse, LlmUsage, MockScript, SCRIPT, LLM_ROLES, LlmRoute (+4 more)

### Community 115 - "eval/runner.test.ts"
Cohesion: 0.24
Nodes (7): complete(), counterOnlyUnresolvedBundle(), et01Bundle(), PET_CLINIC, proposalAJson(), unresolvedAddedBundle(), unresolvedPlusLintDirtyBundle()

### Community 116 - "server.test.ts"
Cohesion: 0.12
Nodes (18): generateConsentDigest(), callTool(), expectIdentical(), FIXTURES, freshOutside(), freshRoot(), frozenRoot(), injectionRoot() (+10 more)

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
- **689 isolated node(s):** `LIVE_ENV_KEYS`, `FIXTURES`, `SECTION_FILES`, `tmpDirs`, `dirs` (+684 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SpecBundle` connect `SpecBundle` to `server/http.ts`, `check/runner.ts`, `compileSpecDir`, `score.ts`, `engine.ts`, `orchestrator.ts`, `generate.test.ts`, `server.ts`, `scale-benchmark.test.ts`, `lifecycle.ts`, `eval/runner.ts`, `commands/plan.test.ts`, `constraint-trace.test.ts`, `planner/plan.ts`, `runner-roles.test.ts`, `schemas/index.ts`, `src/clarify/approvals.ts`, `hash-compat.test.ts`, `budget.ts`, `tasks/index.ts`, `report.ts`, `review-changes.ts`, `review.ts`, `l08.test.ts`, `l02.test.ts`, `args.ts`, `orchestrator.test.ts`, `l07.test.ts`, `council.test.ts`, `revision.ts`, `orchestrator.branch-coverage.test.ts`, `commands/plan.ts`, `generate.ts`, `cli.test.ts`, `commands/trace.test.ts`, `hash.ts`, `eval/runner.test.ts`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **Why does `LlmAdapter` connect `adapter.ts` to `server/http.ts`, `pipeline.test.ts`, `orchestrator.ts`, `generate.test.ts`, `server.ts`, `openai-compatible.ts`, `eval/runner.ts`, `pipeline.ts`, `runner-roles.test.ts`, `renew.ts`, `budget.ts`, `root-invariants.test.ts`, `paid.ts`, `parseGraphText`, `graph-reader.ts`, `args.ts`, `orchestrator.test.ts`, `context-provider.ts`, `council.test.ts`, `orchestrator.branch-coverage.test.ts`, `snapshot-trust.test.ts`, `renew-richstate.test.ts`, `generate.ts`, `eval/runner.test.ts`, `server.test.ts`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `lintBundle()` connect `compileSpecDir` to `scale-benchmark.test.ts`, `planner/plan.ts`, `score.ts`, `hash.ts`, `engine.ts`, `l08.test.ts`, `SpecBundle`, `renew.ts`, `l02.test.ts`, `planner/plan.test.ts`, `cli/index.ts`, `l07.test.ts`, `commands/plan.ts`, `eval/runner.ts`, `report.ts`, `generate.ts`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **What connects `LIVE_ENV_KEYS`, `FIXTURES`, `SECTION_FILES` to the rest of the system?**
  _689 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `server/http.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06292517006802721 - nodes in this community are weakly interconnected._
- **Should `app.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05142941349837902 - nodes in this community are weakly interconnected._
- **Should `pipeline.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13450292397660818 - nodes in this community are weakly interconnected._