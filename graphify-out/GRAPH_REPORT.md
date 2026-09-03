# Graph Report - llm_council_orchestrator  (2026-09-03)

## Corpus Check
- 380 files · ~374,775 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2522 nodes · 6765 edges · 112 communities (109 shown, 3 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d6703e95`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- schemas/index.ts
- app.ts
- pipeline.test.ts
- check/runner.ts
- graphify-adapter.test.ts
- lifecycle.ts
- commands/plan.test.ts
- live-experiment.ts
- engine.ts
- trust/state.ts
- generate.test.ts
- server.ts
- manifest.json
- sign-test.ts
- coverage-hardening.test.ts
- orchestrator.ts
- llm-config.ts
- score.ts
- doctor.ts
- overlay.ts
- recovery/prompts.ts
- compilerOptions
- fs.ts
- authority.ts
- models.ts
- openai-compatible.ts
- scale-benchmark.test.ts
- sha256Content
- check.test.ts
- good-fixture-gate.test.ts
- orders.ts
- pipeline.ts
- renew-consent-effectual.test.ts
- ledger.ts
- paths.ts
- constraint-trace.test.ts
- budget.ts
- check/runner.test.ts
- devDependencies
- graphify-adapter.ts
- orchestrator.test.ts
- renew.ts
- SpecBundle
- trust/evidence.ts
- SpecBundleSchema
- consent.test.ts
- spec-core/package.json
- src/clarify/approvals.ts
- renew/clarify/approvals.ts
- structural.ts
- enrich.ts
- package.json
- generate.ts
- paid.ts
- ledger.test.ts
- eval/runner.test.ts
- context-provider.ts
- copy-browser-assets.js
- errors.ts
- compilerOptions
- planner/plan.test.ts
- lintBundle
- report.ts
- revision.ts
- validation.ts
- commands/trace.test.ts
- review-changes.ts
- context/redact.ts
- eval/runner.ts
- review.ts
- hash-compat.test.ts
- run-eval.test.ts
- cli.test.ts
- root-invariants.test.ts
- scripts
- stdio.ts
- McpStdioServer
- architecture.test.ts
- l14.ts
- snapshot.ts
- distiller.ts
- cli/index.ts
- generate-interactive.test.ts
- legacy-app/package.json
- check.ts
- parseGraphText
- generate-interactive.ts
- check/redact.ts
- init-concurrency.test.ts
- adapter.ts
- ClarifySession
- snapshot-trust.test.ts
- make-bins-executable.js
- recoverTxJournal
- model.ts
- execInProcessGroup
- tasks/index.ts
- packed-install-smoke.sh
- llm/plan.ts
- prepublish-check.js
- compileSpecDir
- verifier.ts
- version.ts
- files
- corpus-lock.ts
- prepublish-check.boundary.test.ts
- server.test.ts
- bin
- readiness.ts
- dependencies
- repository

## God Nodes (most connected - your core abstractions)
1. `SpecBundle` - 82 edges
2. `parseGraphText()` - 50 edges
3. `LlmAdapter` - 47 edges
4. `cmdRenewInit()` - 47 edges
5. `runCli()` - 43 edges
6. `runPipeline()` - 43 edges
7. `compileSpecDir()` - 39 edges
8. `lintBundle()` - 39 edges
9. `LlmResponse` - 35 edges
10. `StaticGraphProvider` - 34 edges

## Surprising Connections (you probably didn't know these)
- `ApplyResult` --references--> `SpecBundle`  [EXTRACTED]
  packages/spec-core/src/compiler/changeset.ts → packages/spec-core/src/schemas/index.ts
- `PlanTask` --references--> `TaskContract`  [EXTRACTED]
  packages/spec-core/src/cli/commands/plan.ts → packages/spec-core/src/schemas/tasks.ts
- `compiledBundle()` --calls--> `compileSpecDir()`  [EXTRACTED]
  packages/spec-core/src/cli/commands/plan.test.ts → packages/spec-core/src/compiler/compile.ts
- `compiledBundle()` --calls--> `compileSpecDir()`  [EXTRACTED]
  packages/spec-core/src/cli/commands/trace.test.ts → packages/spec-core/src/compiler/compile.ts
- `caps()` --calls--> `parseGraphText()`  [EXTRACTED]
  packages/spec-core/src/renew/coverage-hardening.test.ts → packages/spec-core/src/renew/intel/graph-reader.ts

## Import Cycles
- 3-file cycle: `packages/spec-core/src/eval/budget.ts -> packages/spec-core/src/eval/llm/http.ts -> packages/spec-core/src/llm/openai-compatible.ts -> packages/spec-core/src/eval/budget.ts`

## Communities (112 total, 3 thin omitted)

### Community 0 - "schemas/index.ts"
Cohesion: 0.08
Nodes (35): AssumptionIdSchema, ComplexityProfileSchema, ContractIdSchema, DecisionIdSchema, EvidenceIdSchema, IdSchema, ImpactLevelSchema, RequirementIdSchema (+27 more)

### Community 1 - "app.ts"
Cohesion: 0.05
Nodes (76): ApiError, applyChanges(), applyRound(), approve(), bootstrapToken(), call(), cancel(), primeSessionId() (+68 more)

### Community 2 - "pipeline.test.ts"
Cohesion: 0.18
Nodes (11): depsFor(), freshDir(), makeBundle(), persisted, sealedFor(), setupTarget(), sha(), tmpDirs (+3 more)

### Community 3 - "check/runner.ts"
Cohesion: 0.16
Nodes (15): parseExpect(), activeProcessGroups, EVIDENCE_FILE_MODE, evidenceRunName(), ExecutorResult, FORCE_SETTLE_GRACE_MS, GROUP_KILL_GRACE_MS, MAX_BUFFER_BYTES (+7 more)

### Community 4 - "graphify-adapter.test.ts"
Cohesion: 0.09
Nodes (18): cleanup, installedVersion, parseGraphifyVersion(), bindingTextFor(), fixtureGraphText, fixturePath, validManifestText, workspaceFiles() (+10 more)

### Community 5 - "lifecycle.ts"
Cohesion: 0.08
Nodes (35): ApplyResult, ChangeSetSchema, cleanLint, FIXTURES, freeze(), cleanLint, FIXTURES, frozenPetClinic() (+27 more)

### Community 6 - "commands/plan.test.ts"
Cohesion: 0.17
Nodes (4): compiledBundle(), FIXTURES, SECTION_FILES, tmpDirs

### Community 7 - "live-experiment.ts"
Cohesion: 0.11
Nodes (29): aggregateEmitted(), Aggregation, EMITTED_SCHEMA, EmittedOutcome, loadRunDir(), parseEmittedOutcome(), renderAggregation(), baseScore() (+21 more)

### Community 8 - "engine.ts"
Cohesion: 0.17
Nodes (15): RULES, rule, rule, rule, rule, rule, rule, rule (+7 more)

### Community 9 - "trust/state.ts"
Cohesion: 0.10
Nodes (39): renewalPaths, RenewalProject, RenewalProjectSchema, ProjectSnapshot, reloadSnapshot(), emptyOverlay(), parseOverlayStore(), bumpStateRevision() (+31 more)

### Community 10 - "generate.test.ts"
Cohesion: 0.10
Nodes (12): complete(), FAKE_ENV, fetchSpy(), jsonResponse(), PET_CLINIC, PROFILE_CONFIG, SECTION_FILES, SESSION_SERVICE (+4 more)

### Community 11 - "server.ts"
Cohesion: 0.07
Nodes (32): authorizeExecution(), checkPreviewDigest(), consentDigestLine(), ExecAuthorization, ExecBoundary, GenerateProfile, GenerateVariant, refuseGenerateDigestMismatch() (+24 more)

### Community 12 - "manifest.json"
Cohesion: 0.07
Nodes (28): artifact_hashes, assumptions, contracts, decisions, evidence, glossary, intent, requirements (+20 more)

### Community 13 - "sign-test.ts"
Cohesion: 0.29
Nodes (8): binomialCdf(), binomialPmf(), binomialTail(), bisect(), choose(), clopperPearson95(), SignPair, signTest()

### Community 14 - "coverage-hardening.test.ts"
Cohesion: 0.10
Nodes (14): caps(), FIXTURE_SRC, freshDir(), makeTarget(), tmpDirs, loadAnalysisRecords(), LoadedAnalyses, nextAnalysisId() (+6 more)

### Community 15 - "orchestrator.ts"
Cohesion: 0.16
Nodes (19): ClarificationQuestionView, DecisionRecords, BehaviorReview, ChangeSetChangeOutcome, ChangeSetOutcome, SessionOpResult, SessionSnapshot, SessionUsageSummary (+11 more)

### Community 16 - "llm-config.ts"
Cohesion: 0.12
Nodes (19): RFC-7230, BaseUrlSchema, HeaderNameSchema, LINK_LOCAL_PREFIXES, LlmConfig, LlmConfigSchema, METADATA_HOSTS, OpenRouterRoutingSchema (+11 more)

### Community 17 - "score.ts"
Cohesion: 0.18
Nodes (24): allUnGrounded(), anchorSentences(), checkConstraintTrace(), commitmentSurfaces(), ConstraintFailure, ConstraintFailureCode, containsTerm(), containsWholeTerm() (+16 more)

### Community 18 - "doctor.ts"
Cohesion: 0.11
Nodes (29): BIN_FILES, BUDGET_ENV, checkBins(), checkBudgetEnv(), checkLlmConfig(), checkLock(), checkMcpFlags(), checkNodeVersion() (+21 more)

### Community 19 - "overlay.ts"
Cohesion: 0.12
Nodes (21): nextOverlayId(), OVERLAY_RELATIONS, OverlayEntityRefSchema, OverlayLoad, OverlayRecord, OverlayRecordSchema, OverlayRelation, OverlayStore (+13 more)

### Community 20 - "recovery/prompts.ts"
Cohesion: 0.19
Nodes (17): redactSecrets(), runRecovery(), zodIssues(), buildRecoveryPrompt(), buildValidationRetryPrompt(), countEgressRedactions(), EgressProjection, escapeLineUnsafe() (+9 more)

### Community 21 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, esModuleInterop, lib, module, moduleResolution, noEmitOnError, outDir, rootDir (+11 more)

### Community 22 - "fs.ts"
Cohesion: 0.18
Nodes (19): TrustFsError, authorizedCopyWrite(), authorizedCreateDirAtomically(), authorizedCreateExclusive(), authorizedEnsureDir(), authorizedRemoveTree(), authorizedRenameNoClobber(), authorizedStat() (+11 more)

### Community 23 - "authority.ts"
Cohesion: 0.12
Nodes (21): ArchitectureView, parityProjection, PlanInputs, PlanOutcome, TaskSeed, BuildStrategyArgs, persistStrategy(), tmpDirs (+13 more)

### Community 24 - "models.ts"
Cohesion: 0.10
Nodes (16): BUILTIN_PROVIDERS, cmdModels(), fmt(), MAX_CATALOG_BYTES, ModelCatalogEntry, MODELS_REQUEST_TIMEOUT_MS, ModelsOptions, ModelsResult (+8 more)

### Community 25 - "openai-compatible.ts"
Cohesion: 0.12
Nodes (25): buildLlmPlanFromProfile(), ResolvedRole, ChatResponse, CostExtractor, createOpenAiCompatibleLlm(), parseSuccess(), extractProvenance(), extractUsageDetails() (+17 more)

### Community 26 - "scale-benchmark.test.ts"
Cohesion: 0.10
Nodes (17): ChangeSet, ClosureFinding, ClosureFindingCode, closureFindings(), DuplicateTaskId, firstOverlap(), globSegments(), globsOverlap() (+9 more)

### Community 27 - "sha256Content"
Cohesion: 0.12
Nodes (25): artifactHashes(), canonicalSectionHash(), freezeLegacyStyle(), HASHED_SECTIONS, legacyArtifactHashes(), legacySectionHash(), FIXTURES, HASHED_KEYS (+17 more)

### Community 28 - "check.test.ts"
Cohesion: 0.21
Nodes (8): evidenceOf(), evidencePath(), FIXTURES, freshRoot(), initRoot(), makeSpecRoot(), SECTION_FILES, tmpDirs

### Community 29 - "good-fixture-gate.test.ts"
Cohesion: 0.15
Nodes (15): cmdPlan(), PlanOptions, PlanResult, PlanTask, renderHuman(), renderJson(), TopoResult, topoSort() (+7 more)

### Community 30 - "orders.ts"
Cohesion: 0.22
Nodes (13): checkStock(), decrementStock(), stock, CATALOG, quote(), run(), createOrder(), OrderResult (+5 more)

### Community 31 - "pipeline.ts"
Cohesion: 0.09
Nodes (24): MAX_RECOVERY_PROMPT_BYTES, RecoveryDeps, RecoveryOutcome, RecoveryRequest, UsageState, AnalysisUsageSchema, AnchorResult, AnchorResultSchema (+16 more)

### Community 32 - "renew-consent-effectual.test.ts"
Cohesion: 0.17
Nodes (11): generateOptInFromEnv(), callRenewAnalyze(), callRenewStatus(), FIXTURES, TMP_PIN, tmpDirs, errorResponse(), handleRpcLine() (+3 more)

### Community 33 - "ledger.ts"
Cohesion: 0.12
Nodes (22): emptyParity(), nextParityId(), ParityEntry, ParityEntrySchema, ParityEvidenceSchema, ParityLoad, ParityStore, ParityStoreSchema (+14 more)

### Community 34 - "paths.ts"
Cohesion: 0.17
Nodes (20): transitiveRenewalRootCheck(), refuseIfInsideTarget(), assertDisjointRealRoots(), assertNoSymlinkBelow(), authorizeRenewalPaths(), checkMcpDir(), ContainedOutputCheck, DisjointRootsCheck (+12 more)

### Community 35 - "constraint-trace.test.ts"
Cohesion: 0.18
Nodes (13): et07Requirement(), et12Requirement(), failureCodes(), FIXTURES, genericBundleFor(), groundedEt01(), groundedEt02(), groundedEt04() (+5 more)

### Community 36 - "budget.ts"
Cohesion: 0.09
Nodes (20): BudgetCap, BudgetExceededError, BudgetLedger, BudgetSpentSnapshot, DEFAULT_WALL_SLACK_MS, MAX_COMPLETIONS, maxCompletions(), ResolvedRunBudget (+12 more)

### Community 37 - "check/runner.test.ts"
Cohesion: 0.15
Nodes (6): DEFAULT_TIMEOUT_MS, FakeCall, FIXTURES, PET_CLINIC, tmpDirs, Verification

### Community 38 - "devDependencies"
Cohesion: 0.17
Nodes (12): jsdom, devDependencies, jsdom, @types/node, typescript, vitest, @vitest/coverage-v8, zod-to-json-schema (+4 more)

### Community 39 - "graphify-adapter.ts"
Cohesion: 0.05
Nodes (51): ArchitectureViewSchema, buildArchitectureView(), GENERATED_PATTERNS, isGeneratedPath(), fixturePath, loadGraph(), MANIFEST, rawFixture (+43 more)

### Community 40 - "orchestrator.test.ts"
Cohesion: 0.27
Nodes (8): MAX_CLARIFY_ROUNDS, atReview(), blockedBundle(), bundle(), complete(), OPTS, scriptedLlm(), sessionWith()

### Community 41 - "renew.ts"
Cohesion: 0.08
Nodes (50): affectedSync(), analyzeWithFresh(), cmdRenewAnalyze(), cmdRenewExport(), cmdRenewInit(), cmdRenewPlan(), cmdRenewRefresh(), cmdRenewReview() (+42 more)

### Community 42 - "SpecBundle"
Cohesion: 0.06
Nodes (14): CompileResult, FreezeResult, FIXTURES, FIXTURES, FIXTURES, FIXTURES, FIXTURES, FIXTURES (+6 more)

### Community 43 - "trust/evidence.ts"
Cohesion: 0.13
Nodes (20): capsWith(), FIXTURE_SRC, freshProject(), tmpDirs, assertSupportPolicy(), bundleDigestPayload(), CitationClaim, CitationClaimSchema (+12 more)

### Community 44 - "SpecBundleSchema"
Cohesion: 0.09
Nodes (11): BAD, BadFixtureExpectation, GOOD, SpecBundleForExport, GENERATED_PATH, SpecBundleSchema, validManifest, validTask (+3 more)

### Community 45 - "consent.test.ts"
Cohesion: 0.15
Nodes (16): EXEC_OPT_IN_ENV, execOptInFromEnv(), execRootFromEnv(), GENERATE_OPT_IN_ENV, generateConsentDigest(), mcpExecBoundary(), refuseGenerateConsentMissing(), refuseGenerateNotOptedIn() (+8 more)

### Community 46 - "spec-core/package.json"
Cohesion: 0.22
Nodes (8): description, engines, node, license, main, name, type, version

### Community 47 - "src/clarify/approvals.ts"
Cohesion: 0.18
Nodes (14): AnswerLedgerSchema, answersExportDocument(), APPROVAL_RECORD_SCHEMA_ID, approvalFileName(), ApprovalRecord, ApprovalRecordSchema, buildApprovalRecord(), ChangeLedgerSchema (+6 more)

### Community 48 - "renew/clarify/approvals.ts"
Cohesion: 0.10
Nodes (20): loadRenewalApproval(), RenewalApprovalLoad, RenewalDecisionSet, RenewalDecisionSetSchema, payload, tmpDirs, WriteApprovalResult, RenewalRoundDriver (+12 more)

### Community 49 - "structural.ts"
Cohesion: 0.09
Nodes (26): GraphifyAdapter, tail(), baseInputs(), FILES, withFiles(), bindStructuralArtifacts(), coerceStructuralBinding(), artifactSet() (+18 more)

### Community 50 - "enrich.ts"
Cohesion: 0.16
Nodes (15): applyEnrichment(), buildEnrichPrompt(), CLARIFY_ENRICH_PROTOCOL, DecisionEnrichment, EnrichedItemSchema, EnrichOutputSchema, EnrichParseResult, MAX_CONTEXT_CHARS (+7 more)

### Community 51 - "package.json"
Cohesion: 0.25
Nodes (7): _archival, name, packageManager, private, scripts, test:spec, version

### Community 52 - "generate.ts"
Cohesion: 0.08
Nodes (37): ClarifySessionOptions, Command, COMMANDS, GenerateVariant, InitProfile, parseArgs(), parseRenew(), ParseResult (+29 more)

### Community 53 - "paid.ts"
Cohesion: 0.20
Nodes (12): defaultRenewalBudget(), renewalConsentState(), createPaidOperation(), deepFreeze(), deepFreezeRoute(), BASE_ENV, MAX_RECOVERY_WIRE_BYTES, PaidOperation (+4 more)

### Community 54 - "ledger.test.ts"
Cohesion: 0.21
Nodes (10): parityGate, persistParity(), ANCHOR, approval(), freshDir(), hypothesisAnalysis(), sha(), stageTarget() (+2 more)

### Community 55 - "eval/runner.test.ts"
Cohesion: 0.24
Nodes (7): complete(), counterOnlyUnresolvedBundle(), et01Bundle(), PET_CLINIC, proposalAJson(), unresolvedAddedBundle(), unresolvedPlusLintDirtyBundle()

### Community 56 - "context-provider.ts"
Cohesion: 0.10
Nodes (22): ContextBundle, ContextBundleSchema, ContextItem, ContextItemSchema, ContextLimits, RENEW_CONTEXT_LIMITS, AnalysisScope, ContextProvider (+14 more)

### Community 57 - "copy-browser-assets.js"
Cohesion: 0.25
Nodes (7): { copyFileSync, mkdirSync, readdirSync, writeFileSync }, files, { join }, MIME, outDir, root, srcDir

### Community 58 - "errors.ts"
Cohesion: 0.14
Nodes (10): isTrustError(), TrustAuthorityError, TrustCitationError, TrustDomainTag, TrustError, TrustPaidError, TrustStateError, TrustStructuralError (+2 more)

### Community 59 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck (+7 more)

### Community 60 - "planner/plan.test.ts"
Cohesion: 0.24
Nodes (12): applyApprovalToParity(), archView, baseInputs(), blastRadius(), fixtureGraphPath, graphParsed, MANIFEST, ruledParity() (+4 more)

### Community 61 - "lintBundle"
Cohesion: 0.14
Nodes (17): applyUnderLock(), ChangeResult, cmdChange(), findingLine(), FIXTURES, frozenSpecRoot(), inlineBundle(), makeSpecRoot() (+9 more)

### Community 62 - "report.ts"
Cohesion: 0.11
Nodes (31): BadFixtureCapture, calcs(), G1_REQUIRED_TOTAL, GateCalcs, GateReportInput, gateVerdict, groundedBundleFor(), BAD (+23 more)

### Community 63 - "revision.ts"
Cohesion: 0.07
Nodes (37): buildSections(), cmdInit(), Contract, Decision, EvidenceItem, GlossaryEntry, InitOptions, InitResult (+29 more)

### Community 64 - "validation.ts"
Cohesion: 0.22
Nodes (6): LevelLoadResult, FIXTURES, SECTION_FILES, tmpDirs, VALIDATION_LEVELS, ValidationLevel

### Community 65 - "commands/trace.test.ts"
Cohesion: 0.10
Nodes (16): cmdTrace(), renderTrace(), compiledBundle(), FIXTURES, SECTION_FILES, tmpDirs, TraceResult, buildTrace() (+8 more)

### Community 66 - "review-changes.ts"
Cohesion: 0.17
Nodes (12): changeRequestEvidence, ChangeSetValidation, CLARIFY_REVIEW_CHANGES_PROTOCOL, MAX_CHANGE_INSTRUCTION_CHARS, MAX_CHANGES_PER_SET, ReviewChange, ReviewChangeSchema, ReviewChangeSet (+4 more)

### Community 67 - "context/redact.ts"
Cohesion: 0.36
Nodes (9): credentialAssignmentEnd(), isIdentCont(), isIdentStart(), isInlineSpace(), isValueStop(), redactCredentialAssignments(), RedactionResult, Rule (+1 more)

### Community 68 - "eval/runner.ts"
Cohesion: 0.06
Nodes (68): GenerateOptions, ResolvedProfile, CouncilTopology, DecomposedCouncilDeps, runDecomposedCouncil(), BUNDLE_OK(), CLASSIFIER_BLOCK, CLASSIFIER_OK (+60 more)

### Community 69 - "review.ts"
Cohesion: 0.29
Nodes (7): canonicalJson(), FAMILY_SECTIONS, projectReview(), ReviewSection, ReviewSegment, segment(), specContentDigest()

### Community 70 - "hash-compat.test.ts"
Cohesion: 0.22
Nodes (7): FIXTURES, HASHED_KEYS, makeSpecRoot(), PRE_RENEWAL_FIXTURE, rotateKeys(), SECTION_FILES, tmpDirs

### Community 71 - "run-eval.test.ts"
Cohesion: 0.26
Nodes (9): runEvalAll(), DEFAULT_REPORT_PATH, LIVE_ENV_VARS, missingLiveEnv(), parseArgs(), ParsedArgs, runEvalCli(), FAKE_LIVE_ENV (+1 more)

### Community 72 - "cli.test.ts"
Cohesion: 0.22
Nodes (3): FIXTURES, SECTION_FILES, tmpDirs

### Community 73 - "root-invariants.test.ts"
Cohesion: 0.20
Nodes (12): ctxWindow(), FIXTURE_SRC, freshDir(), graphCaps(), groundedResponse(), initProject(), interiorCitation(), makeTarget() (+4 more)

### Community 74 - "scripts"
Cohesion: 0.22
Nodes (9): scripts, build, lint, prepublishOnly, pretest, smoke:packed, test, test:coverage (+1 more)

### Community 75 - "stdio.ts"
Cohesion: 0.13
Nodes (16): killActiveProcessGroups(), isJsonRpcId(), isPlainObject(), validateJsonRpcEnvelope(), EPIPE_DRAIN_TIMEOUT_MS, EXIT_CLIENT_GONE, EXIT_DRAIN_TIMEOUT, EXIT_OK (+8 more)

### Community 76 - "McpStdioServer"
Cohesion: 0.24
Nodes (5): jsonRpcError(), McpStdioServer, Harness, makeSession(), toolRefusal()

### Community 77 - "architecture.test.ts"
Cohesion: 0.38
Nodes (5): PKG, productionFiles(), REL(), renewalSurface(), WRITE_PRIMITIVES

### Community 78 - "l14.ts"
Cohesion: 0.43
Nodes (4): EXPECT_GRAMMAR_DOC, EXPECTED_EXIT_PATTERN, isJudgeableExpect(), rule

### Community 79 - "snapshot.ts"
Cohesion: 0.08
Nodes (31): createSnapshot(), deriveSnapshotId(), ProjectSnapshotSchema, Sha256, SnapshotFileEntrySchema, snapshotIdentityPayload(), SnapshotInputs, SnapshotReload (+23 more)

### Community 80 - "distiller.ts"
Cohesion: 0.20
Nodes (14): DistillerInputs, distillRenewalQuestions(), evidenceOf(), makeRenewalDriver(), RENEWAL_CLAIM_ID, STRATEGY_CLAIM_ID, STRATEGY_OPTIONS, strategyQuestion() (+6 more)

### Community 81 - "cli/index.ts"
Cohesion: 0.21
Nodes (14): commandHelp(), cmdCheck(), parseEnginesFloor(), readBudgetEnv(), readEnginesFloor(), readVersion(), runCli(), resolveProfile() (+6 more)

### Community 82 - "generate-interactive.test.ts"
Cohesion: 0.32
Nodes (6): ASSETS, blocked(), bundle(), fakeLlm(), Ready, run()

### Community 83 - "legacy-app/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, version

### Community 84 - "check.ts"
Cohesion: 0.38
Nodes (6): CheckOutcome, Executor, CheckOptions, CheckResult, expectedActual(), renderReport()

### Community 85 - "parseGraphText"
Cohesion: 0.09
Nodes (22): initProject(), FIXTURE_SRC, freshDir(), graphCaps(), makeTarget(), tmpDirs, parseGraphText(), FIXTURE_SRC (+14 more)

### Community 86 - "generate-interactive.ts"
Cohesion: 0.08
Nodes (35): ASSETS, baseBundle(), blockedJson(), complete(), fakeLlm(), REAL_FETCH, startWorkspace(), createClarifySession() (+27 more)

### Community 87 - "check/redact.ts"
Cohesion: 0.47
Nodes (4): REDACTION_RULES, RedactionRule, redactSecrets(), SecretKind

### Community 88 - "init-concurrency.test.ts"
Cohesion: 0.33
Nodes (4): ChildOutcome, CLI_JS, SECTION_FILES, tmpDirs

### Community 89 - "adapter.ts"
Cohesion: 0.13
Nodes (15): ASSETS, blocked(), bootApp(), bundle(), settle(), waitFor(), LlmAdapter, LlmCompleteOptions (+7 more)

### Community 91 - "snapshot-trust.test.ts"
Cohesion: 0.27
Nodes (10): baseCaps(), ctxWindow(), FIXTURE_SRC, fixtureGraph(), freshDir(), initPair(), interiorCitation(), makeTarget() (+2 more)

### Community 92 - "make-bins-executable.js"
Cohesion: 0.50
Nodes (3): BINS, { join }, { readFileSync, chmodSync }

### Community 93 - "recoverTxJournal"
Cohesion: 0.40
Nodes (5): recoverTxJournal(), renewalWriterLockDir(), txJournalIntegrity(), withRenewalWriterLock(), SpecRootLock

### Community 94 - "model.ts"
Cohesion: 0.15
Nodes (20): AnswerCheck, answerToUserAnswer(), applyAnswersToRecords(), ApplyResult, attachStatuses(), ClarificationAnswer, ClarificationOptionView, DecisionRecord (+12 more)

### Community 96 - "tasks/index.ts"
Cohesion: 0.07
Nodes (17): BASE, complete(), unresolvedBundle(), FIXTURES, genericBundleFor(), loadFixture(), U, PET_CLINIC (+9 more)

### Community 97 - "packed-install-smoke.sh"
Cohesion: 1.00
Nodes (3): run(), say(), packed-install-smoke.sh script

### Community 99 - "llm/plan.ts"
Cohesion: 0.07
Nodes (26): LLM_ROLES, singleRoutePlan(), FIXTURE_SRC, tmpDirs, analyzedProject(), caps(), ctxWindow(), FIXTURE_SRC (+18 more)

### Community 100 - "prepublish-check.js"
Cohesion: 0.29
Nodes (5): describe, pkg, result, { spawnSync }, status

### Community 101 - "compileSpecDir"
Cohesion: 0.12
Nodes (19): cmdCompile(), compileFailedOutput(), CompileResult, compileLintFreeze(), SECTION_PATHS, tmpDirs, cmdLint(), LintResult (+11 more)

### Community 102 - "verifier.ts"
Cohesion: 0.24
Nodes (10): AnchorBatchResult, AnchorFailureCode, AnchorVerification, canonicalFileHash(), CodeAnchorInput, countLines(), isValidAnchorPath(), tmpDirs (+2 more)

### Community 105 - "version.ts"
Cohesion: 0.36
Nodes (7): checkSpecSchemaVersion(), ParsedVersion, parseVersion(), SPEC_SCHEMA_VERSION, SpecSchemaVersionFieldSchema, SpecSchemaVersionVerdict, SUPPORTED

### Community 106 - "files"
Cohesion: 0.33
Nodes (6): files, dist, examples, generated, LICENSE, README.md

### Community 108 - "corpus-lock.ts"
Cohesion: 0.25
Nodes (15): canonicalJson(), computeCorpusHash(), CORPUS_LOCK_VERSION, CorpusLock, CorpusLockEntry, frozenThresholds, loadCorpusLock(), lockCandidates() (+7 more)

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
- **672 isolated node(s):** `tmpDirs`, `Fault`, `tmpDirs`, `FIXTURE_SRC`, `StringType` (+667 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SpecBundle` connect `SpecBundle` to `schemas/index.ts`, `check/runner.ts`, `lifecycle.ts`, `commands/plan.test.ts`, `engine.ts`, `generate.test.ts`, `server.ts`, `orchestrator.ts`, `score.ts`, `authority.ts`, `scale-benchmark.test.ts`, `sha256Content`, `good-fixture-gate.test.ts`, `constraint-trace.test.ts`, `budget.ts`, `check/runner.test.ts`, `orchestrator.test.ts`, `SpecBundleSchema`, `consent.test.ts`, `src/clarify/approvals.ts`, `generate.ts`, `eval/runner.test.ts`, `report.ts`, `revision.ts`, `validation.ts`, `commands/trace.test.ts`, `review-changes.ts`, `eval/runner.ts`, `review.ts`, `hash-compat.test.ts`, `l14.ts`, `generate-interactive.test.ts`, `check.ts`, `generate-interactive.ts`, `adapter.ts`, `tasks/index.ts`, `compileSpecDir`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **Why does `LlmAdapter` connect `adapter.ts` to `pipeline.test.ts`, `generate.test.ts`, `server.ts`, `orchestrator.ts`, `openai-compatible.ts`, `ledger.ts`, `budget.ts`, `orchestrator.test.ts`, `renew.ts`, `generate.ts`, `paid.ts`, `eval/runner.test.ts`, `context-provider.ts`, `errors.ts`, `eval/runner.ts`, `root-invariants.test.ts`, `generate-interactive.test.ts`, `parseGraphText`, `generate-interactive.ts`, `snapshot-trust.test.ts`, `tasks/index.ts`, `llm/plan.ts`, `server.test.ts`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **Why does `GraphifyAdapter` connect `structural.ts` to `ledger.ts`, `graphify-adapter.test.ts`, `graphify-adapter.ts`, `trust/state.ts`, `server.ts`, `cli/index.ts`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **What connects `tmpDirs`, `Fault`, `tmpDirs` to the rest of the system?**
  _672 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `schemas/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08302485457429931 - nodes in this community are weakly interconnected._
- **Should `app.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05217391304347826 - nodes in this community are weakly interconnected._
- **Should `graphify-adapter.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08735632183908046 - nodes in this community are weakly interconnected._