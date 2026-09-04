# Graph Report - llm_council_orchestrator  (2026-09-04)

## Corpus Check
- 380 files · ~386,594 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2538 nodes · 6814 edges · 126 communities (124 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `458604ed`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- generate-interactive.ts
- app.ts
- pipeline.test.ts
- check/runner.ts
- compileSpecDir
- fs-coverage.test.ts
- sha256Content
- live-experiment.ts
- engine.ts
- schemas/index.ts
- generate.test.ts
- consent.ts
- manifest.json
- sign-test.ts
- coverage-hardening.test.ts
- distiller.ts
- llm-config.ts
- envelope.ts
- doctor.ts
- workspace-copy.ts
- parseGraphText
- compilerOptions
- trust/state.ts
- run-eval.test.ts
- StaticGraphProvider
- providers.ts
- scale-benchmark.test.ts
- lifecycle.ts
- init.ts
- prompts-v4.ts
- orders.ts
- pipeline.ts
- check/runner.test.ts
- overlay.ts
- graphify-adapter.test.ts
- constraint-trace.test.ts
- council.test.ts
- tasks/index.ts
- devDependencies
- fixture-provider.ts
- planner/plan.test.ts
- renew.ts
- SpecBundle
- common.ts
- orchestrator.ts
- context-provider.ts
- spec-core/package.json
- src/clarify/approvals.ts
- paths.ts
- server.ts
- budget.ts
- package.json
- args.ts
- paid.ts
- freeze
- transaction-atomicity.test.ts
- GraphContextProvider
- copy-browser-assets.js
- renew-consent-effectual.test.ts
- compilerOptions
- McpStdioServer
- score.ts
- report.ts
- version.ts
- tranche4.test.ts
- server/http.ts
- fs.ts
- context/redact.ts
- revision.ts
- enrich.ts
- ledger.ts
- cli/index.ts
- change.test.ts
- root-invariants.test.ts
- scripts
- stdio.ts
- ledger.test.ts
- architecture.test.ts
- generate-interactive.test.ts
- orchestrator.test.ts
- check.ts
- recovery/prompts.ts
- commands/plan.test.ts
- legacy-app/package.json
- snapshot.ts
- revision.test.ts
- models.ts
- authority.ts
- clarify.test.ts
- compile.test.ts
- commands/plan.ts
- snapshot-trust.test.ts
- make-bins-executable.js
- renew-richstate.test.ts
- concurrency.test.ts
- generate.ts
- cli.test.ts
- packed-install-smoke.sh
- adapter.ts
- clarify-trust.test.ts
- prepublish-check.js
- commands/trace.test.ts
- verifier.ts
- hash-compat.test.ts
- journey.test.ts
- init-concurrency.test.ts
- files
- eval/runner.ts
- corpus-lock.ts
- intent-fidelity.test.ts
- prepublish-check.boundary.test.ts
- workspace-copy.test.ts
- check/redact.ts
- snapshot.test.ts
- openai-compatible.ts
- eval/runner.test.ts
- server.test.ts
- session/state.ts
- LlmRole
- llm/http.test.ts
- llm-config.test.ts
- bin
- readiness.ts
- dependencies
- repository

## God Nodes (most connected - your core abstractions)
1. `SpecBundle` - 82 edges
2. `parseGraphText()` - 49 edges
3. `LlmAdapter` - 47 edges
4. `cmdRenewInit()` - 47 edges
5. `runPipeline()` - 43 edges
6. `runCli()` - 43 edges
7. `compileSpecDir()` - 39 edges
8. `lintBundle()` - 39 edges
9. `LlmResponse` - 35 edges
10. `sha256Content()` - 35 edges

## Surprising Connections (you probably didn't know these)
- `loadActiveState()` --indirect_call--> `parseOverlayStore()`  [INFERRED]
  packages/spec-core/src/renew/trust/state.ts → packages/spec-core/src/renew/core/store-records.ts
- `loadActiveState()` --indirect_call--> `parseParityStore()`  [INFERRED]
  packages/spec-core/src/renew/trust/state.ts → packages/spec-core/src/renew/core/store-records.ts
- `PlanTask` --references--> `TaskContract`  [EXTRACTED]
  packages/spec-core/src/cli/commands/plan.ts → packages/spec-core/src/schemas/tasks.ts
- `ApplyResult` --references--> `SpecBundle`  [EXTRACTED]
  packages/spec-core/src/compiler/changeset.ts → packages/spec-core/src/schemas/index.ts
- `FreezeResult` --references--> `SpecBundle`  [EXTRACTED]
  packages/spec-core/src/compiler/freeze.ts → packages/spec-core/src/schemas/index.ts

## Import Cycles
- 3-file cycle: `packages/spec-core/src/eval/budget.ts -> packages/spec-core/src/eval/llm/http.ts -> packages/spec-core/src/llm/openai-compatible.ts -> packages/spec-core/src/eval/budget.ts`

## Communities (126 total, 2 thin omitted)

### Community 0 - "generate-interactive.ts"
Cohesion: 0.08
Nodes (34): ASSETS, baseBundle(), blockedJson(), complete(), fakeLlm(), REAL_FETCH, startWorkspace(), ASSETS (+26 more)

### Community 1 - "app.ts"
Cohesion: 0.05
Nodes (76): ApiError, applyChanges(), applyRound(), approve(), bootstrapToken(), call(), cancel(), primeSessionId() (+68 more)

### Community 2 - "pipeline.test.ts"
Cohesion: 0.19
Nodes (11): depsFor(), freshDir(), makeBundle(), persisted, sealedFor(), setupTarget(), sha(), tmpDirs (+3 more)

### Community 3 - "check/runner.ts"
Cohesion: 0.12
Nodes (17): parseExpect(), activeProcessGroups, EVIDENCE_FILE_MODE, evidenceRunName(), execCommand(), execInProcessGroup(), ExecutorResult, FORCE_SETTLE_GRACE_MS (+9 more)

### Community 4 - "compileSpecDir"
Cohesion: 0.14
Nodes (23): applyUnderLock(), ChangeResult, cmdChange(), findingLine(), cmdCompile(), compileFailedOutput(), CompileResult, cmdFreeze() (+15 more)

### Community 5 - "fs-coverage.test.ts"
Cohesion: 0.15
Nodes (13): isTrustError(), TrustAuthorityError, TrustCitationError, TrustDomainTag, TrustError, TrustFsError, TrustPaidError, TrustStateError (+5 more)

### Community 6 - "sha256Content"
Cohesion: 0.10
Nodes (25): canonicalJson(), FAMILY_SECTIONS, projectReview(), ReviewSection, ReviewSegment, segment(), specContentDigest(), FreezeResult (+17 more)

### Community 7 - "live-experiment.ts"
Cohesion: 0.13
Nodes (25): aggregateEmitted(), Aggregation, EMITTED_SCHEMA, EmittedOutcome, loadRunDir(), parseEmittedOutcome(), renderAggregation(), baseScore() (+17 more)

### Community 8 - "engine.ts"
Cohesion: 0.17
Nodes (16): RULES, rule, rule, rule, rule, rule, rule, rule (+8 more)

### Community 9 - "schemas/index.ts"
Cohesion: 0.07
Nodes (22): BAD, BadFixtureExpectation, GOOD, codeAnchorItem, SpecBundleForExport, GENERATED_PATH, GlossaryEntrySchema, SpecBundleSchema (+14 more)

### Community 10 - "generate.test.ts"
Cohesion: 0.10
Nodes (12): complete(), FAKE_ENV, fetchSpy(), jsonResponse(), PET_CLINIC, PROFILE_CONFIG, SECTION_FILES, SESSION_SERVICE (+4 more)

### Community 11 - "consent.ts"
Cohesion: 0.09
Nodes (34): authorizeExecution(), checkPreviewDigest(), consentDigestLine(), EXEC_OPT_IN_ENV, EXEC_ROOT_ENV, ExecAuthorization, ExecBoundary, execOptInFromEnv() (+26 more)

### Community 12 - "manifest.json"
Cohesion: 0.07
Nodes (28): artifact_hashes, assumptions, contracts, decisions, evidence, glossary, intent, requirements (+20 more)

### Community 13 - "sign-test.ts"
Cohesion: 0.21
Nodes (14): calcs(), renderGateReport(), binomialCdf(), binomialPmf(), binomialTail(), bisect(), choose(), clopperPearson95() (+6 more)

### Community 14 - "coverage-hardening.test.ts"
Cohesion: 0.14
Nodes (10): caps(), FIXTURE_SRC, freshDir(), makeTarget(), tmpDirs, loadAnalysisRecords(), LoadedAnalyses, PersistOutcome (+2 more)

### Community 15 - "distiller.ts"
Cohesion: 0.08
Nodes (28): loadRenewalApproval(), nextRenewalApprovalId(), RenewalApprovalLoad, RenewalDecisionSet, RenewalDecisionSetSchema, payload, tmpDirs, WriteApprovalResult (+20 more)

### Community 16 - "llm-config.ts"
Cohesion: 0.11
Nodes (21): RFC-7230, GenerateOptions, BaseUrlSchema, HeaderNameSchema, LINK_LOCAL_PREFIXES, LlmConfig, LlmConfigSchema, METADATA_HOSTS (+13 more)

### Community 17 - "envelope.ts"
Cohesion: 0.18
Nodes (20): computeCostEnvelope(), CostEnvelope, measurePromptSizes(), PromptSize, renderCostEnvelopeTable(), VariantEnvelope, CLASSIFY_RULES, classifyAndProposeSingle() (+12 more)

### Community 18 - "doctor.ts"
Cohesion: 0.11
Nodes (29): BIN_FILES, BUDGET_ENV, checkBins(), checkBudgetEnv(), checkLlmConfig(), checkLock(), checkMcpFlags(), checkNodeVersion() (+21 more)

### Community 19 - "workspace-copy.ts"
Cohesion: 0.20
Nodes (13): DEFAULT_INGEST_LIMITS, DENIED_BASE_PATTERNS, DENIED_DIRS, guardPath(), GuardVerdict, IngestLimits, isDeniedDirectory(), looksBinary() (+5 more)

### Community 20 - "parseGraphText"
Cohesion: 0.09
Nodes (34): initProject(), parseGraphText(), runRecovery(), capsWith(), FIXTURE_SRC, freshProject(), tmpDirs, FIXTURE_SRC (+26 more)

### Community 21 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, esModuleInterop, lib, module, moduleResolution, noEmitOnError, outDir, rootDir (+11 more)

### Community 22 - "trust/state.ts"
Cohesion: 0.16
Nodes (24): abortEvidencePath(), applyStateMutation(), bumpStateRevisionTrusted(), fenceBeforeWrite(), fenceWriterLock(), journalIsOurs(), journalOnDisk(), lockStillOurs() (+16 more)

### Community 23 - "run-eval.test.ts"
Cohesion: 0.26
Nodes (8): DEFAULT_REPORT_PATH, LIVE_ENV_VARS, missingLiveEnv(), parseArgs(), ParsedArgs, runEvalCli(), FAKE_LIVE_ENV, mockRunEvalAll

### Community 24 - "StaticGraphProvider"
Cohesion: 0.21
Nodes (7): StaticGraphProvider, FIXTURE_SRC, freshDir(), graphCaps(), initializedPair(), makeTarget(), tmpDirs

### Community 25 - "providers.ts"
Cohesion: 0.23
Nodes (13): buildLlmPlanFromProfile(), ResolvedRole, CostExtractor, createOpenAiCompatibleLlm(), buildRoleAdapter(), openRouterCost(), resolveRoleConfig(), RoleCallContext (+5 more)

### Community 26 - "scale-benchmark.test.ts"
Cohesion: 0.10
Nodes (16): ClosureFinding, ClosureFindingCode, closureFindings(), DuplicateTaskId, firstOverlap(), globSegments(), globsOverlap(), rule (+8 more)

### Community 27 - "lifecycle.ts"
Cohesion: 0.10
Nodes (27): applyChangeSet(), ApplyResult, ChangeSet, ChangeSetSchema, formatIssues(), cleanLint, FIXTURES, checkTransition() (+19 more)

### Community 28 - "init.ts"
Cohesion: 0.08
Nodes (25): EXPECT_GRAMMAR_DOC, EXPECTED_EXIT_PATTERN, isJudgeableExpect(), evidenceOf(), evidencePath(), FIXTURES, freshRoot(), initRoot() (+17 more)

### Community 29 - "prompts-v4.ts"
Cohesion: 0.21
Nodes (20): runDecomposedCouncil(), CLARIFY_RULES, CLASSIFY_RULES, CONSTRAINT_FIDELITY, decomposedClassifier(), decomposedJudge(), decomposedJudgeAlone(), decomposedJudgeSingle() (+12 more)

### Community 30 - "orders.ts"
Cohesion: 0.22
Nodes (13): checkStock(), decrementStock(), stock, CATALOG, quote(), run(), createOrder(), OrderResult (+5 more)

### Community 31 - "pipeline.ts"
Cohesion: 0.06
Nodes (40): MAX_RECOVERY_PROMPT_BYTES, RecoveryDeps, RecoveryOutcome, RecoveryRequest, UsageState, zodIssues(), AnalysisUsageSchema, AnchorResult (+32 more)

### Community 32 - "check/runner.test.ts"
Cohesion: 0.13
Nodes (7): DEFAULT_TIMEOUT_MS, killActiveProcessGroups(), FakeCall, FIXTURES, PET_CLINIC, tmpDirs, Verification

### Community 33 - "overlay.ts"
Cohesion: 0.14
Nodes (21): nextOverlayId(), OVERLAY_RELATIONS, OverlayEntityRefSchema, OverlayLoad, OverlayRecord, OverlayRecordSchema, OverlayRelation, OverlayStore (+13 more)

### Community 34 - "graphify-adapter.test.ts"
Cohesion: 0.09
Nodes (17): cleanup, installedVersion, bindingTextFor(), fixtureGraphText, fixturePath, validManifestText, workspaceFiles(), FIXTURE_SRC (+9 more)

### Community 35 - "constraint-trace.test.ts"
Cohesion: 0.16
Nodes (14): et07Requirement(), et12Requirement(), failureCodes(), FIXTURES, genericBundleFor(), groundedEt01(), groundedEt02(), groundedEt04() (+6 more)

### Community 36 - "council.test.ts"
Cohesion: 0.20
Nodes (8): BUNDLE_OK(), CLASSIFIER_BLOCK, CLASSIFIER_OK, complete(), et01Bundle(), PET_CLINIC, PipelineOutcome, LlmPlan

### Community 37 - "tasks/index.ts"
Cohesion: 0.10
Nodes (11): complete(), et01Bundle(), PET_CLINIC, PET_CLINIC, U, DeterministicAssertion, EvalTask, EvalTaskId (+3 more)

### Community 38 - "devDependencies"
Cohesion: 0.17
Nodes (12): jsdom, devDependencies, jsdom, @types/node, typescript, vitest, @vitest/coverage-v8, zod-to-json-schema (+4 more)

### Community 39 - "fixture-provider.ts"
Cohesion: 0.07
Nodes (35): fixturePath, parsed, affectedReverse(), graphHealthOf(), neighborhood(), querySeeds(), GraphParseResult, ParsedGraph (+27 more)

### Community 40 - "planner/plan.test.ts"
Cohesion: 0.22
Nodes (13): emptyParity(), parityFromAnalyses(), archView, baseInputs(), blastRadius(), fixtureGraphPath, graphParsed, MANIFEST (+5 more)

### Community 41 - "renew.ts"
Cohesion: 0.11
Nodes (41): affectedSync(), analyzeWithFresh(), cmdRenewExport(), cmdRenewInit(), cmdRenewPlan(), cmdRenewRefresh(), cmdRenewReview(), cmdRenewStatus() (+33 more)

### Community 42 - "SpecBundle"
Cohesion: 0.07
Nodes (13): CompileResult, FIXTURES, FIXTURES, FIXTURES, FIXTURES, FIXTURES, FIXTURES, FIXTURES (+5 more)

### Community 43 - "common.ts"
Cohesion: 0.11
Nodes (24): AssumptionIdSchema, ComplexityProfileSchema, ContractIdSchema, DecisionIdSchema, EvidenceIdSchema, IdSchema, ImpactLevelSchema, RequirementIdSchema (+16 more)

### Community 44 - "orchestrator.ts"
Cohesion: 0.10
Nodes (31): AnswerCheck, answerToUserAnswer(), applyAnswersToRecords(), ApplyResult, attachStatuses(), ClarificationAnswer, ClarificationOptionView, ClarificationQuestionView (+23 more)

### Community 45 - "context-provider.ts"
Cohesion: 0.18
Nodes (14): ContextBundleSchema, ContextItemSchema, ContextLimits, RENEW_CONTEXT_LIMITS, AnalysisScope, GraphContextProviderOptions, SliceReader, FILES (+6 more)

### Community 46 - "spec-core/package.json"
Cohesion: 0.22
Nodes (8): description, engines, node, license, main, name, type, version

### Community 47 - "src/clarify/approvals.ts"
Cohesion: 0.18
Nodes (14): AnswerLedgerSchema, answersExportDocument(), APPROVAL_RECORD_SCHEMA_ID, approvalFileName(), ApprovalRecord, ApprovalRecordSchema, buildApprovalRecord(), ChangeLedgerSchema (+6 more)

### Community 48 - "paths.ts"
Cohesion: 0.17
Nodes (20): transitiveRenewalRootCheck(), refuseIfInsideTarget(), assertDisjointRealRoots(), assertNoSymlinkBelow(), authorizeRenewalPaths(), checkMcpDir(), ContainedOutputCheck, DisjointRootsCheck (+12 more)

### Community 49 - "server.ts"
Cohesion: 0.10
Nodes (17): DEFAULT_GENERATE_PROFILE, ARG_SPECS, ArgName, ArgValidator, CallContext, configLoadCache, CoreResult, DIR_PROPERTY (+9 more)

### Community 50 - "budget.ts"
Cohesion: 0.19
Nodes (13): BudgetCap, BudgetExceededError, BudgetSpentSnapshot, DEFAULT_WALL_SLACK_MS, MAX_COMPLETIONS, maxCompletions(), ResolvedRunBudget, resolveRunBudget() (+5 more)

### Community 51 - "package.json"
Cohesion: 0.25
Nodes (7): _archival, name, packageManager, private, scripts, test:spec, version

### Community 52 - "args.ts"
Cohesion: 0.12
Nodes (19): Command, COMMANDS, GenerateVariant, InitProfile, parseArgs(), parseRenew(), ParseResult, RENEW_GRAMMAR (+11 more)

### Community 53 - "paid.ts"
Cohesion: 0.19
Nodes (14): defaultRenewalBudget(), renewalConsentState(), accountCompletionAttempts(), createPaidOperation(), deepFreeze(), deepFreezeRoute(), BASE_ENV, MAX_RECOVERY_WIRE_BYTES (+6 more)

### Community 54 - "freeze"
Cohesion: 0.13
Nodes (13): compileLintFreeze(), SECTION_PATHS, tmpDirs, freeze(), cleanLint, FIXTURES, frozenPetClinic(), inState() (+5 more)

### Community 55 - "transaction-atomicity.test.ts"
Cohesion: 0.11
Nodes (26): renewalPaths, RenewalProject, RenewalProjectSchema, emptyOverlay(), parseOverlayStore(), loadRenewalProject(), loadSnapshotFile(), persistRenewalProject() (+18 more)

### Community 56 - "GraphContextProvider"
Cohesion: 0.29
Nodes (4): ContextItem, ContextProvider, GraphContextProvider, parseLoc()

### Community 57 - "copy-browser-assets.js"
Cohesion: 0.25
Nodes (7): { copyFileSync, mkdirSync, readdirSync, writeFileSync }, files, { join }, MIME, outDir, root, srcDir

### Community 58 - "renew-consent-effectual.test.ts"
Cohesion: 0.15
Nodes (13): generateOptInFromEnv(), callRenewAnalyze(), callRenewStatus(), FIXTURES, TMP_PIN, tmpDirs, errorResponse(), handleRpcLine() (+5 more)

### Community 59 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck (+7 more)

### Community 60 - "McpStdioServer"
Cohesion: 0.30
Nodes (3): jsonRpcError(), McpStdioServer, makeSession()

### Community 61 - "score.ts"
Cohesion: 0.19
Nodes (23): allUnGrounded(), anchorSentences(), checkConstraintTrace(), commitmentSurfaces(), ConstraintFailureCode, containsTerm(), containsWholeTerm(), evaluateCandidate() (+15 more)

### Community 62 - "report.ts"
Cohesion: 0.12
Nodes (28): ConstraintFailure, BadFixtureCapture, GateReportInput, groundedBundleFor(), BAD, BadFixtureExpectation, buildMockScripts(), deriveBundle() (+20 more)

### Community 63 - "version.ts"
Cohesion: 0.36
Nodes (7): checkSpecSchemaVersion(), ParsedVersion, parseVersion(), SPEC_SCHEMA_VERSION, SpecSchemaVersionFieldSchema, SpecSchemaVersionVerdict, SUPPORTED

### Community 64 - "tranche4.test.ts"
Cohesion: 0.08
Nodes (24): ArchitectureView, ArchitectureViewSchema, buildArchitectureView(), GENERATED_PATTERNS, isGeneratedPath(), fixturePath, loadGraph(), MANIFEST (+16 more)

### Community 65 - "server/http.ts"
Cohesion: 0.08
Nodes (22): changeRequestEvidence, ChangeSetValidation, CLARIFY_REVIEW_CHANGES_PROTOCOL, MAX_CHANGE_INSTRUCTION_CHARS, MAX_CHANGES_PER_SET, ReviewChange, ReviewChangeSchema, ReviewChangeSet (+14 more)

### Community 66 - "fs.ts"
Cohesion: 0.24
Nodes (13): authorizedCopyWrite(), authorizedCreateDirAtomically(), authorizedCreateExclusive(), authorizedEnsureDir(), authorizedRemoveTree(), authorizedRenameNoClobber(), authorizedWrite(), authorizeProjectDestination() (+5 more)

### Community 67 - "context/redact.ts"
Cohesion: 0.31
Nodes (9): credentialAssignmentEnd(), isIdentCont(), isIdentStart(), isInlineSpace(), isValueStop(), redactCredentialAssignments(), RedactionResult, Rule (+1 more)

### Community 68 - "revision.ts"
Cohesion: 0.26
Nodes (14): acquireSpecRootLock(), backupPathFor(), breakStaleLock(), createDirAtomically(), fsyncDir(), LockIdentity, LockOptions, nextSuffix() (+6 more)

### Community 69 - "enrich.ts"
Cohesion: 0.17
Nodes (14): applyEnrichment(), buildEnrichPrompt(), CLARIFY_ENRICH_PROTOCOL, DecisionEnrichment, EnrichedItemSchema, EnrichOutputSchema, EnrichParseResult, MAX_CONTEXT_CHARS (+6 more)

### Community 70 - "ledger.ts"
Cohesion: 0.12
Nodes (17): nextParityId(), ParityEntry, ParityEntrySchema, ParityEvidenceSchema, ParityLoad, ParityStore, ParityStoreSchema, parseParityStore() (+9 more)

### Community 71 - "cli/index.ts"
Cohesion: 0.21
Nodes (14): commandHelp(), cmdCheck(), parseEnginesFloor(), readBudgetEnv(), readEnginesFloor(), readVersion(), runCli(), resolveProfile() (+6 more)

### Community 72 - "change.test.ts"
Cohesion: 0.22
Nodes (6): FIXTURES, frozenSpecRoot(), inlineBundle(), makeSpecRoot(), SECTION_FILES, tmpDirs

### Community 73 - "root-invariants.test.ts"
Cohesion: 0.20
Nodes (12): ctxWindow(), FIXTURE_SRC, freshDir(), graphCaps(), groundedResponse(), initProject(), interiorCitation(), makeTarget() (+4 more)

### Community 74 - "scripts"
Cohesion: 0.22
Nodes (9): scripts, build, lint, prepublishOnly, pretest, smoke:packed, test, test:coverage (+1 more)

### Community 75 - "stdio.ts"
Cohesion: 0.13
Nodes (15): isJsonRpcId(), EPIPE_DRAIN_TIMEOUT_MS, EXIT_CLIENT_GONE, EXIT_DRAIN_TIMEOUT, EXIT_OK, MAX_FRAME_BYTES, MAX_IN_FLIGHT, peekForScheduling() (+7 more)

### Community 76 - "ledger.test.ts"
Cohesion: 0.27
Nodes (8): persistParity(), ANCHOR, approval(), freshDir(), hypothesisAnalysis(), sha(), stageTarget(), tmpDirs

### Community 77 - "architecture.test.ts"
Cohesion: 0.31
Nodes (7): allSpecifiers(), importSpecifiers(), PKG, productionFiles(), REL(), renewalSurface(), WRITE_PRIMITIVES

### Community 78 - "generate-interactive.test.ts"
Cohesion: 0.32
Nodes (6): ASSETS, blocked(), bundle(), fakeLlm(), Ready, run()

### Community 79 - "orchestrator.test.ts"
Cohesion: 0.27
Nodes (8): MAX_CLARIFY_ROUNDS, atReview(), blockedBundle(), bundle(), complete(), OPTS, scriptedLlm(), sessionWith()

### Community 80 - "check.ts"
Cohesion: 0.38
Nodes (6): CheckOutcome, Executor, CheckOptions, CheckResult, expectedActual(), renderReport()

### Community 81 - "recovery/prompts.ts"
Cohesion: 0.23
Nodes (15): redactSecrets(), buildRecoveryPrompt(), buildValidationRetryPrompt(), countEgressRedactions(), EgressProjection, escapeLineUnsafe(), projectItemForEgress(), RECOVERY_PROMPT_PROTOCOL (+7 more)

### Community 82 - "commands/plan.test.ts"
Cohesion: 0.17
Nodes (4): compiledBundle(), FIXTURES, SECTION_FILES, tmpDirs

### Community 83 - "legacy-app/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, version

### Community 84 - "snapshot.ts"
Cohesion: 0.21
Nodes (15): createSnapshot(), deriveSnapshotId(), ProjectSnapshot, ProjectSnapshotSchema, reloadSnapshot(), Sha256, SnapshotFileEntrySchema, snapshotIdentityPayload() (+7 more)

### Community 85 - "revision.test.ts"
Cohesion: 0.18
Nodes (5): DEFAULT_STALE_MS, LOCK_FILE, LockHeldError, fsyncCtl, tmpDirs

### Community 86 - "models.ts"
Cohesion: 0.13
Nodes (15): BUILTIN_PROVIDERS, cmdModels(), fmt(), MAX_CATALOG_BYTES, ModelCatalogEntry, MODELS_REQUEST_TIMEOUT_MS, ModelsOptions, ModelsResult (+7 more)

### Community 87 - "authority.ts"
Cohesion: 0.10
Nodes (25): BuildStrategyArgs, persistStrategy(), tmpDirs, ActiveAuthorityScope, ApprovalDecision, ApprovalDecisionSchema, AuthorityBody, buildRenewalApprovalRecord() (+17 more)

### Community 88 - "clarify.test.ts"
Cohesion: 0.22
Nodes (6): AnswersParseResult, MAX_ANSWER_CHARS, MAX_ANSWERS, BASE, complete(), unresolvedBundle()

### Community 89 - "compile.test.ts"
Cohesion: 0.29
Nodes (3): FIXTURES, SECTION_FILES, tmpDirs

### Community 90 - "commands/plan.ts"
Cohesion: 0.13
Nodes (17): cmdPlan(), PlanOptions, PlanResult, PlanTask, renderHuman(), renderJson(), TopoResult, topoSort() (+9 more)

### Community 91 - "snapshot-trust.test.ts"
Cohesion: 0.27
Nodes (10): baseCaps(), ctxWindow(), FIXTURE_SRC, fixtureGraph(), freshDir(), initPair(), interiorCitation(), makeTarget() (+2 more)

### Community 92 - "make-bins-executable.js"
Cohesion: 0.50
Nodes (3): BINS, { join }, { readFileSync, chmodSync }

### Community 93 - "renew-richstate.test.ts"
Cohesion: 0.24
Nodes (7): analysisRecord(), caps(), FIXTURE_SRC, freshDir(), makeTarget(), sha(), tmpDirs

### Community 94 - "concurrency.test.ts"
Cohesion: 0.25
Nodes (8): capsWith(), complete(), ctxWindow(), FIXTURE_SRC, fixtureGraph(), freshReviewedProject(), OUTPUT(), tmpDirs

### Community 95 - "generate.ts"
Cohesion: 0.13
Nodes (21): checkIntent(), clarificationBlock(), cmdGenerate(), GenerateResult, IntentCheck, lintReason(), lintRejections(), normalizeFileIntent() (+13 more)

### Community 96 - "cli.test.ts"
Cohesion: 0.22
Nodes (3): FIXTURES, SECTION_FILES, tmpDirs

### Community 97 - "packed-install-smoke.sh"
Cohesion: 1.00
Nodes (3): run(), say(), packed-install-smoke.sh script

### Community 98 - "adapter.ts"
Cohesion: 0.06
Nodes (38): cmdRenewAnalyze(), LlmAdapter, LlmResponse, LLM_ROLES, LlmRoute, singleRoutePlan(), LlmProvenance, LlmUsageDetails (+30 more)

### Community 99 - "clarify-trust.test.ts"
Cohesion: 0.25
Nodes (5): FIXTURE_SRC, freshDir(), graphCaps(), makeTarget(), tmpDirs

### Community 100 - "prepublish-check.js"
Cohesion: 0.29
Nodes (5): describe, pkg, result, { spawnSync }, status

### Community 101 - "commands/trace.test.ts"
Cohesion: 0.10
Nodes (16): cmdTrace(), renderTrace(), compiledBundle(), FIXTURES, SECTION_FILES, tmpDirs, TraceResult, buildTrace() (+8 more)

### Community 102 - "verifier.ts"
Cohesion: 0.24
Nodes (10): AnchorBatchResult, AnchorFailureCode, AnchorVerification, canonicalFileHash(), CodeAnchorInput, countLines(), isValidAnchorPath(), tmpDirs (+2 more)

### Community 103 - "hash-compat.test.ts"
Cohesion: 0.12
Nodes (19): cmdVerify(), VerifyResult, FIXTURES, freezeLegacyStyle(), HASHED_KEYS, makeSpecRoot(), PRE_RENEWAL_FIXTURE, rotateKeys() (+11 more)

### Community 104 - "journey.test.ts"
Cohesion: 0.24
Nodes (6): CONFORMING_OUTPUT(), FIXTURE_SRC, interiorCitation(), inventory(), sha(), tmpDirs

### Community 105 - "init-concurrency.test.ts"
Cohesion: 0.33
Nodes (4): ChildOutcome, CLI_JS, SECTION_FILES, tmpDirs

### Community 106 - "files"
Cohesion: 0.33
Nodes (6): files, dist, examples, generated, LICENSE, README.md

### Community 107 - "eval/runner.ts"
Cohesion: 0.18
Nodes (13): BudgetLedger, CouncilTopology, LlmUsage, UserAnswerForPrompt, ClassifierOutputSchema, firstIssues(), lintReason(), parseJsonOrBlock() (+5 more)

### Community 108 - "corpus-lock.ts"
Cohesion: 0.22
Nodes (17): canonicalJson(), computeCorpusHash(), CORPUS_LOCK_VERSION, CorpusLock, CorpusLockEntry, frozenThresholds, loadCorpusLock(), lockCandidates() (+9 more)

### Community 109 - "intent-fidelity.test.ts"
Cohesion: 0.17
Nodes (9): FIXTURES, genericBundleFor(), loadFixture(), U, createMockLlm(), MockScript, SCRIPT, MockEvalScripts (+1 more)

### Community 111 - "workspace-copy.test.ts"
Cohesion: 0.50
Nodes (3): freshDir(), stageTarget(), tmpDirs

### Community 112 - "check/redact.ts"
Cohesion: 0.47
Nodes (4): REDACTION_RULES, RedactionRule, redactSecrets(), SecretKind

### Community 113 - "snapshot.test.ts"
Cohesion: 0.67
Nodes (3): baseInputs(), FILES, withFiles()

### Community 114 - "openai-compatible.ts"
Cohesion: 0.19
Nodes (11): LlmCompleteOptions, ChatResponse, parseSuccess(), extractProvenance(), extractUsageDetails(), HTTP_BACKOFF_SCHEDULE_MS, isPlainObject(), OpenAiCompatibleConfig (+3 more)

### Community 115 - "eval/runner.test.ts"
Cohesion: 0.24
Nodes (7): complete(), counterOnlyUnresolvedBundle(), et01Bundle(), PET_CLINIC, proposalAJson(), unresolvedAddedBundle(), unresolvedPlusLintDirtyBundle()

### Community 116 - "server.test.ts"
Cohesion: 0.12
Nodes (17): callTool(), expectIdentical(), FIXTURES, freshOutside(), freshRoot(), frozenRoot(), injectionRoot(), inlineConforming() (+9 more)

### Community 117 - "session/state.ts"
Cohesion: 0.29
Nodes (9): canTransition(), CLARIFY_SESSION_STATES, ClarifySessionState, isTerminal(), nextSessionState(), TERMINAL, LEGAL, TransitionRule (+1 more)

### Community 118 - "LlmRole"
Cohesion: 0.31
Nodes (4): DecomposedCouncilDeps, PipelineTask, PipelineUsage, LlmRole

### Community 119 - "llm/http.test.ts"
Cohesion: 0.29
Nodes (5): FAKE_ENV, FakeEnv, jsonResponse(), okFetch(), PartialFakeEnv

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
- **676 isolated node(s):** `RenewalStateIdentity`, `TrustedStoreResult`, `TxJournalEntry`, `TxJournalFile`, `TxExpectation` (+671 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SpecBundle` connect `SpecBundle` to `generate-interactive.ts`, `check/runner.ts`, `compileSpecDir`, `sha256Content`, `engine.ts`, `schemas/index.ts`, `generate.test.ts`, `consent.ts`, `scale-benchmark.test.ts`, `lifecycle.ts`, `init.ts`, `prompts-v4.ts`, `check/runner.test.ts`, `constraint-trace.test.ts`, `council.test.ts`, `tasks/index.ts`, `orchestrator.ts`, `src/clarify/approvals.ts`, `budget.ts`, `freeze`, `score.ts`, `report.ts`, `tranche4.test.ts`, `server/http.ts`, `generate-interactive.test.ts`, `orchestrator.test.ts`, `check.ts`, `commands/plan.test.ts`, `clarify.test.ts`, `compile.test.ts`, `commands/plan.ts`, `generate.ts`, `commands/trace.test.ts`, `hash-compat.test.ts`, `eval/runner.ts`, `intent-fidelity.test.ts`, `eval/runner.test.ts`, `LlmRole`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **Why does `GraphifyAdapter` connect `fixture-provider.ts` to `graphify-adapter.test.ts`, `adapter.ts`, `cli/index.ts`, `server.ts`, `parseGraphText`, `transaction-atomicity.test.ts`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Why does `LlmAdapter` connect `adapter.ts` to `generate-interactive.ts`, `pipeline.test.ts`, `generate.test.ts`, `distiller.ts`, `llm-config.ts`, `providers.ts`, `council.test.ts`, `tasks/index.ts`, `renew.ts`, `orchestrator.ts`, `server.ts`, `budget.ts`, `paid.ts`, `root-invariants.test.ts`, `generate-interactive.test.ts`, `orchestrator.test.ts`, `clarify.test.ts`, `snapshot-trust.test.ts`, `renew-richstate.test.ts`, `concurrency.test.ts`, `generate.ts`, `clarify-trust.test.ts`, `journey.test.ts`, `eval/runner.ts`, `intent-fidelity.test.ts`, `openai-compatible.ts`, `eval/runner.test.ts`, `server.test.ts`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `runPipeline()` (e.g. with `.chargeAttempts()` and `.chargeTokens()`) actually correct?**
  _`runPipeline()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `RenewalStateIdentity`, `TrustedStoreResult`, `TxJournalEntry` to the rest of the system?**
  _676 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `generate-interactive.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0797872340425532 - nodes in this community are weakly interconnected._
- **Should `app.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05217391304347826 - nodes in this community are weakly interconnected._