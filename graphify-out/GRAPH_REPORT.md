# Graph Report - llm_council_orchestrator  (2026-09-02)

## Corpus Check
- 331 files · ~298,671 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2146 nodes · 5511 edges · 103 communities (100 shown, 3 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 15 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c46bd4e9`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- budget.ts
- app.ts
- pipeline.ts
- check/runner.ts
- graphify-adapter.ts
- lifecycle.ts
- commands/plan.ts
- args.ts
- engine.ts
- distiller.ts
- doctor.ts
- ledger.ts
- planner/plan.ts
- aggregate.ts
- generate-interactive.ts
- orchestrator.ts
- generate.test.ts
- score.ts
- report.ts
- check.test.ts
- prompts-v4.ts
- compilerOptions
- cli/index.ts
- review-changes.ts
- live-experiment.ts
- GraphifyAdapter
- llm-config.ts
- hash.ts
- adapter.ts
- model.ts
- orders.ts
- renew/clarify/approvals.ts
- server.ts
- createClarifySession
- snapshot.ts
- constraint-trace.test.ts
- generate.ts
- schemas/index.ts
- devDependencies
- graph-ops.ts
- orchestrator.test.ts
- compiler/compile.ts
- openai-compatible.ts
- change.test.ts
- intel/provider.ts
- consent.ts
- spec-core/package.json
- src/clarify/approvals.ts
- lintBundle
- commands/plan.test.ts
- runner-roles.test.ts
- package.json
- LlmAdapter
- check/runner.test.ts
- SpecBundleSchema
- subprocess.ts
- schemas.ts
- copy-browser-assets.js
- eval/runner.test.ts
- compilerOptions
- workspace-copy.ts
- overlay.ts
- context-provider.ts
- scale-benchmark.test.ts
- verifier.ts
- init.ts
- council.test.ts
- revision.ts
- eval/runner.ts
- snapshot-trust.test.ts
- SpecBundle
- run-eval.test.ts
- architecture-view.ts
- tasks/index.ts
- scripts
- stdio.ts
- compile.test.ts
- CodeIntelligenceProvider
- ClarifySession
- BudgetLedger
- llm/http.test.ts
- intel-contract.test.ts
- good-fixture-gate.test.ts
- legacy-app/package.json
- clarify.test.ts
- ClarificationQuestion
- .graphHealth
- graph-reader.ts
- commands/trace.test.ts
- write-spec.ts
- make-bins-executable.js
- packed-install-smoke.sh
- renew.ts
- prepublish-check.js
- files
- corpus-lock.ts
- prepublish-check.boundary.test.ts
- server.test.ts
- bin
- readiness.ts
- dependencies
- repository

## God Nodes (most connected - your core abstractions)
1. `SpecBundle` - 81 edges
2. `runPipeline()` - 43 edges
3. `runCli()` - 41 edges
4. `LlmAdapter` - 40 edges
5. `lintBundle()` - 39 edges
6. `compileSpecDir()` - 37 edges
7. `cmdRenewInit()` - 32 edges
8. `LlmResponse` - 28 edges
9. `sha256Content()` - 27 edges
10. `cmdRenewReview()` - 25 edges

## Surprising Connections (you probably didn't know these)
- `compiledBundle()` --calls--> `compileSpecDir()`  [EXTRACTED]
  packages/spec-core/src/cli/commands/plan.test.ts → packages/spec-core/src/compiler/compile.ts
- `PlanTask` --references--> `TaskContract`  [EXTRACTED]
  packages/spec-core/src/cli/commands/plan.ts → packages/spec-core/src/schemas/tasks.ts
- `rulePreserve()` --calls--> `cmdRenewReview()`  [EXTRACTED]
  packages/spec-core/src/renew/planner-trust.test.ts → packages/spec-core/src/cli/commands/renew.ts
- `compiledBundle()` --calls--> `compileSpecDir()`  [EXTRACTED]
  packages/spec-core/src/cli/commands/trace.test.ts → packages/spec-core/src/compiler/compile.ts
- `ApplyResult` --references--> `SpecBundle`  [EXTRACTED]
  packages/spec-core/src/compiler/changeset.ts → packages/spec-core/src/schemas/index.ts

## Import Cycles
- 3-file cycle: `packages/spec-core/src/eval/budget.ts -> packages/spec-core/src/eval/llm/http.ts -> packages/spec-core/src/llm/openai-compatible.ts -> packages/spec-core/src/eval/budget.ts`

## Communities (103 total, 3 thin omitted)

### Community 0 - "budget.ts"
Cohesion: 0.15
Nodes (18): BudgetCap, BudgetExceededError, BudgetSpentSnapshot, DEFAULT_WALL_SLACK_MS, MAX_COMPLETIONS, maxCompletions(), ResolvedRunBudget, resolveRunBudget() (+10 more)

### Community 1 - "app.ts"
Cohesion: 0.05
Nodes (76): ApiError, applyChanges(), applyRound(), approve(), bootstrapToken(), call(), cancel(), primeSessionId() (+68 more)

### Community 2 - "pipeline.ts"
Cohesion: 0.13
Nodes (18): ContextBundle, ContextItemSchema, RecoveryOutcome, RecoveryRequest, runRecovery(), depsFor(), freshDir(), persisted (+10 more)

### Community 3 - "check/runner.ts"
Cohesion: 0.08
Nodes (29): parseExpect(), REDACTION_RULES, RedactionRule, redactSecrets(), SecretKind, activeProcessGroups, CheckOutcome, EVIDENCE_FILE_MODE (+21 more)

### Community 4 - "graphify-adapter.ts"
Cohesion: 0.15
Nodes (11): compareTriple(), DEFAULTS, GraphifyAdapterOptions, MAX_EXCLUSIVE, MIN_VERSION, parseGraphifyVersion(), fixtureGraphText, fixturePath (+3 more)

### Community 5 - "lifecycle.ts"
Cohesion: 0.09
Nodes (33): applyChangeSet(), ApplyResult, ChangeSetSchema, formatIssues(), cleanLint, FIXTURES, freeze(), FreezeResult (+25 more)

### Community 6 - "commands/plan.ts"
Cohesion: 0.14
Nodes (16): cmdPlan(), PlanOptions, PlanResult, PlanTask, renderHuman(), renderJson(), TopoResult, topoSort() (+8 more)

### Community 7 - "args.ts"
Cohesion: 0.09
Nodes (24): Command, COMMANDS, GenerateVariant, InitProfile, parseArgs(), parseRenew(), ParseResult, RENEW_GRAMMAR (+16 more)

### Community 8 - "engine.ts"
Cohesion: 0.15
Nodes (17): BAD, BadFixtureExpectation, RULES, rule, rule, rule, rule, rule (+9 more)

### Community 9 - "distiller.ts"
Cohesion: 0.16
Nodes (14): DistillerInputs, distillRenewalQuestions(), makeRenewalDriver(), RENEWAL_CLAIM_ID, STRATEGY_CLAIM_ID, STRATEGY_OPTIONS, strategyQuestion(), analysisWithUncertainty() (+6 more)

### Community 10 - "doctor.ts"
Cohesion: 0.10
Nodes (30): BIN_FILES, BUDGET_ENV, checkBins(), checkBudgetEnv(), checkLlmConfig(), checkLock(), checkMcpFlags(), checkNodeVersion() (+22 more)

### Community 11 - "ledger.ts"
Cohesion: 0.08
Nodes (38): RenewalApprovalRecord, addParityEntry(), ApplyApprovalResult, applyApprovalToParity(), NewParityEntry, nextParityId(), ParityBlocker, ParityEntry (+30 more)

### Community 12 - "planner/plan.ts"
Cohesion: 0.18
Nodes (14): ArchitectureView, ParityStore, PlanInputs, PlanOutcome, TaskSeed, BuildStrategyArgs, MODERNIZATION_STRATEGIES, ModernizationStrategy (+6 more)

### Community 13 - "aggregate.ts"
Cohesion: 0.15
Nodes (23): Aggregation, VariantCost, calcs(), GateCalcs, GateReportInput, gateVerdict, renderGateReport(), PipelineVariant (+15 more)

### Community 14 - "generate-interactive.ts"
Cohesion: 0.08
Nodes (30): ASSETS, baseBundle(), blockedJson(), complete(), fakeLlm(), REAL_FETCH, startWorkspace(), cmdGenerateInteractive() (+22 more)

### Community 15 - "orchestrator.ts"
Cohesion: 0.17
Nodes (19): ClarificationQuestionView, mergeRoundRecords(), BehaviorReview, ChangeSetChangeOutcome, ChangeSetOutcome, SessionOpResult, SessionSnapshot, SessionUsageSummary (+11 more)

### Community 16 - "generate.test.ts"
Cohesion: 0.05
Nodes (28): complete(), FAKE_ENV, fetchSpy(), jsonResponse(), PET_CLINIC, PROFILE_CONFIG, SECTION_FILES, SESSION_SERVICE (+20 more)

### Community 17 - "score.ts"
Cohesion: 0.17
Nodes (25): allUnGrounded(), anchorSentences(), checkConstraintTrace(), commitmentSurfaces(), ConstraintFailure, ConstraintFailureCode, containsTerm(), containsWholeTerm() (+17 more)

### Community 18 - "report.ts"
Cohesion: 0.13
Nodes (23): BadFixtureCapture, groundedBundleFor(), BAD, BadFixtureExpectation, buildMockScripts(), deriveBundle(), EvalEvidence, finishEvidence() (+15 more)

### Community 19 - "check.test.ts"
Cohesion: 0.17
Nodes (11): evidenceOf(), evidencePath(), FIXTURES, freshRoot(), initRoot(), makeSpecRoot(), SECTION_FILES, tmpDirs (+3 more)

### Community 20 - "prompts-v4.ts"
Cohesion: 0.22
Nodes (19): runDecomposedCouncil(), CLARIFY_RULES, CLASSIFY_RULES, CONSTRAINT_FIDELITY, decomposedClassifier(), decomposedJudge(), decomposedJudgeAlone(), decomposedJudgeSingle() (+11 more)

### Community 21 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, esModuleInterop, lib, module, moduleResolution, noEmitOnError, outDir, rootDir (+11 more)

### Community 22 - "cli/index.ts"
Cohesion: 0.14
Nodes (32): commandHelp(), cmdCompile(), compileFailedOutput(), CompileResult, cmdFreeze(), FreezeResult, cmdLint(), LintResult (+24 more)

### Community 23 - "review-changes.ts"
Cohesion: 0.17
Nodes (12): changeRequestEvidence, ChangeSetValidation, CLARIFY_REVIEW_CHANGES_PROTOCOL, MAX_CHANGE_INSTRUCTION_CHARS, MAX_CHANGES_PER_SET, ReviewChange, ReviewChangeSchema, ReviewChangeSet (+4 more)

### Community 24 - "live-experiment.ts"
Cohesion: 0.14
Nodes (20): aggregateEmitted(), EMITTED_SCHEMA, EmittedOutcome, loadRunDir(), parseEmittedOutcome(), renderAggregation(), baseScore(), BLOCKED (+12 more)

### Community 25 - "GraphifyAdapter"
Cohesion: 0.22
Nodes (5): neighborhood(), querySeeds(), shortestPath(), GraphifyAdapter, IntelItems

### Community 26 - "llm-config.ts"
Cohesion: 0.11
Nodes (20): RFC-7230, BaseUrlSchema, HeaderNameSchema, LINK_LOCAL_PREFIXES, LlmConfig, LlmConfigSchema, METADATA_HOSTS, OpenRouterRoutingSchema (+12 more)

### Community 27 - "hash.ts"
Cohesion: 0.08
Nodes (15): FIXTURES, SECTION_FILES, tmpDirs, artifactHashes(), HASHED_SECTIONS, FIXTURES, HASHED_KEYS, cleanLint (+7 more)

### Community 28 - "adapter.ts"
Cohesion: 0.16
Nodes (13): ASSETS, blocked(), bootApp(), bundle(), settle(), waitFor(), LlmCompleteOptions, LlmResponse (+5 more)

### Community 29 - "model.ts"
Cohesion: 0.15
Nodes (19): AnswerCheck, answerToUserAnswer(), applyAnswersToRecords(), ApplyResult, attachStatuses(), ClarificationOptionView, DecisionRecord, DecisionRecords (+11 more)

### Community 30 - "orders.ts"
Cohesion: 0.22
Nodes (13): checkStock(), decrementStock(), stock, CATALOG, quote(), run(), createOrder(), OrderResult (+5 more)

### Community 31 - "renew/clarify/approvals.ts"
Cohesion: 0.13
Nodes (14): BuildRenewalApprovalArgs, buildRenewalApprovalRecord(), renewalApprovalDigest(), RenewalApprovalLoad, RenewalApprovalRecordSchema, RenewalDecision, RenewalDecisionSchema, RenewalDecisionSet (+6 more)

### Community 32 - "server.ts"
Cohesion: 0.08
Nodes (32): DEFAULT_GENERATE_PROFILE, ChangeSet, ExecBoundary, generateOptInFromEnv(), GenerateProfile, GenerateVariant, ARG_SPECS, ArgName (+24 more)

### Community 33 - "createClarifySession"
Cohesion: 0.17
Nodes (16): applyEnrichment(), buildEnrichPrompt(), CLARIFY_ENRICH_PROTOCOL, DecisionEnrichment, EnrichedItemSchema, EnrichOutputSchema, EnrichParseResult, MAX_CONTEXT_CHARS (+8 more)

### Community 34 - "snapshot.ts"
Cohesion: 0.13
Nodes (20): FileManifest, FileManifestEntry, boundPaths(), deriveSnapshotId(), evaluateStaleness(), GraphManifestIdentity, GraphManifestParse, identityPayload() (+12 more)

### Community 35 - "constraint-trace.test.ts"
Cohesion: 0.16
Nodes (14): et07Requirement(), et12Requirement(), failureCodes(), FIXTURES, genericBundleFor(), groundedEt01(), groundedEt02(), groundedEt04() (+6 more)

### Community 36 - "generate.ts"
Cohesion: 0.20
Nodes (17): buildLlmPlanFromProfile(), checkIntent(), clarificationBlock(), cmdGenerate(), GenerateResult, IntentCheck, lintReason(), lintRejections() (+9 more)

### Community 37 - "schemas/index.ts"
Cohesion: 0.07
Nodes (42): AssumptionIdSchema, ComplexityProfile, ComplexityProfileSchema, ContractIdSchema, DecisionIdSchema, EvidenceIdSchema, IdSchema, ImpactLevelSchema (+34 more)

### Community 38 - "devDependencies"
Cohesion: 0.15
Nodes (13): jsdom, devDependencies, jsdom, @types/node, typescript, vitest, @vitest/coverage-v8, zod-to-json-schema (+5 more)

### Community 39 - "graph-ops.ts"
Cohesion: 0.29
Nodes (6): affectedReverse(), fixturePath, parsed, AffectedHit, AffectedOptions, AffectedResult

### Community 40 - "orchestrator.test.ts"
Cohesion: 0.27
Nodes (8): MAX_CLARIFY_ROUNDS, atReview(), blockedBundle(), bundle(), complete(), OPTS, scriptedLlm(), sessionWith()

### Community 41 - "compiler/compile.ts"
Cohesion: 0.12
Nodes (21): applyUnderLock(), ChangeResult, cmdChange(), findingLine(), CompileError, CompileResult, deriveTestFiles(), REQUIRED_SECTIONS (+13 more)

### Community 42 - "openai-compatible.ts"
Cohesion: 0.14
Nodes (21): ResolvedRole, ChatResponse, CostExtractor, createOpenAiCompatibleLlm(), parseSuccess(), extractProvenance(), extractUsageDetails(), HTTP_BACKOFF_SCHEDULE_MS (+13 more)

### Community 43 - "change.test.ts"
Cohesion: 0.20
Nodes (7): FIXTURES, frozenSpecRoot(), inlineBundle(), makeSpecRoot(), SECTION_FILES, tmpDirs, LOCK_FILE

### Community 44 - "intel/provider.ts"
Cohesion: 0.22
Nodes (7): ParsedGraph, tail(), GodNode, GraphEdgeRef, GraphNodeRef, IntelFailure, IntelFailureCode

### Community 45 - "consent.ts"
Cohesion: 0.10
Nodes (29): authorizeExecution(), checkPreviewDigest(), consentDigestLine(), EXEC_OPT_IN_ENV, EXEC_ROOT_ENV, ExecAuthorization, execOptInFromEnv(), execRootFromEnv() (+21 more)

### Community 46 - "spec-core/package.json"
Cohesion: 0.22
Nodes (8): description, engines, node, license, main, name, type, version

### Community 47 - "src/clarify/approvals.ts"
Cohesion: 0.12
Nodes (23): AnswerLedgerSchema, answersExportDocument(), APPROVAL_RECORD_SCHEMA_ID, approvalFileName(), ApprovalRecord, ApprovalRecordSchema, buildApprovalRecord(), ChangeLedgerSchema (+15 more)

### Community 48 - "lintBundle"
Cohesion: 0.06
Nodes (15): compileLintFreeze(), SECTION_PATHS, tmpDirs, lintBundle(), FIXTURES, FIXTURES, FIXTURES, FIXTURES (+7 more)

### Community 49 - "commands/plan.test.ts"
Cohesion: 0.17
Nodes (4): compiledBundle(), FIXTURES, SECTION_FILES, tmpDirs

### Community 50 - "runner-roles.test.ts"
Cohesion: 0.25
Nodes (4): PipelineOutcome, complete(), et01Bundle(), PET_CLINIC

### Community 51 - "package.json"
Cohesion: 0.25
Nodes (7): _archival, name, packageManager, private, scripts, test:spec, version

### Community 52 - "LlmAdapter"
Cohesion: 0.24
Nodes (9): ClarifySessionOptions, GenerateOptions, GenerateInteractiveOptions, ResolvedProfile, CouncilTopology, RunBudgetSpec, LlmAdapter, PipelineOptions (+1 more)

### Community 53 - "check/runner.test.ts"
Cohesion: 0.15
Nodes (6): DEFAULT_TIMEOUT_MS, FakeCall, FIXTURES, PET_CLINIC, tmpDirs, Verification

### Community 54 - "SpecBundleSchema"
Cohesion: 0.15
Nodes (8): EXPECT_GRAMMAR_DOC, EXPECTED_EXIT_PATTERN, isJudgeableExpect(), GOOD, rule, SpecBundleForExport, GENERATED_PATH, SpecBundleSchema

### Community 55 - "subprocess.ts"
Cohesion: 0.24
Nodes (6): cleanup, installedVersion, runSubprocess(), SubprocessOptions, SubprocessResult, tmpDirs

### Community 56 - "schemas.ts"
Cohesion: 0.09
Nodes (22): LoadedAnalyses, persistAnalysisRecord(), PersistOutcome, tmpDirs, AnalysisRecord, AnalysisRecordSchema, AnalysisUsageSchema, AnchorResult (+14 more)

### Community 57 - "copy-browser-assets.js"
Cohesion: 0.25
Nodes (7): { copyFileSync, mkdirSync, readdirSync, writeFileSync }, files, { join }, MIME, outDir, root, srcDir

### Community 58 - "eval/runner.test.ts"
Cohesion: 0.24
Nodes (7): complete(), counterOnlyUnresolvedBundle(), et01Bundle(), PET_CLINIC, proposalAJson(), unresolvedAddedBundle(), unresolvedPlusLintDirtyBundle()

### Community 59 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck (+7 more)

### Community 60 - "workspace-copy.ts"
Cohesion: 0.16
Nodes (15): DEFAULT_INGEST_LIMITS, DENIED_BASE_PATTERNS, DENIED_DIRS, guardPath(), GuardVerdict, IngestLimits, isDeniedDirectory(), looksBinary() (+7 more)

### Community 61 - "overlay.ts"
Cohesion: 0.15
Nodes (18): addOverlayRecord(), markSuperseded(), NewOverlayRecord, nextOverlayId(), OVERLAY_RELATIONS, OverlayEntityRefSchema, OverlayLoad, OverlayRecord (+10 more)

### Community 62 - "context-provider.ts"
Cohesion: 0.10
Nodes (20): ContextBundleSchema, ContextItem, ContextLimits, RENEW_CONTEXT_LIMITS, AnalysisScope, ContextProvider, GraphContextProvider, GraphContextProviderOptions (+12 more)

### Community 63 - "scale-benchmark.test.ts"
Cohesion: 0.10
Nodes (17): ClosureFinding, ClosureFindingCode, closureFindings(), DuplicateTaskId, duplicateTaskIds(), firstOverlap(), globSegments(), globsOverlap() (+9 more)

### Community 64 - "verifier.ts"
Cohesion: 0.20
Nodes (11): AnchorBatchResult, AnchorFailureCode, AnchorVerification, canonicalFileHash(), CodeAnchorInput, countLines(), isValidAnchorPath(), tmpDirs (+3 more)

### Community 65 - "init.ts"
Cohesion: 0.13
Nodes (17): Contract, Decision, EvidenceItem, GlossaryEntry, InitOptions, InitResult, Intent, Requirement (+9 more)

### Community 66 - "council.test.ts"
Cohesion: 0.28
Nodes (6): BUNDLE_OK(), CLASSIFIER_BLOCK, CLASSIFIER_OK, complete(), et01Bundle(), PET_CLINIC

### Community 67 - "revision.ts"
Cohesion: 0.12
Nodes (19): acquireSpecRootLock(), backupPathFor(), breakStaleLock(), createDirAtomically(), DEFAULT_STALE_MS, fsyncDir(), LockHeldError, LockIdentity (+11 more)

### Community 68 - "eval/runner.ts"
Cohesion: 0.16
Nodes (24): measurePromptSizes(), CLASSIFY_RULES, classifyAndProposeSingle(), classifySingle(), CONSTRAINT_FIDELITY, intentBlock(), JSON_ONLY, judgeMerge() (+16 more)

### Community 69 - "snapshot-trust.test.ts"
Cohesion: 0.33
Nodes (9): baseCaps(), FIXTURE_SRC, fixtureGraph(), freshDir(), initPair(), makeTarget(), sha(), tmpDirs (+1 more)

### Community 70 - "SpecBundle"
Cohesion: 0.25
Nodes (5): DecomposedCouncilDeps, UserAnswerForPrompt, PipelineTask, PipelineUsage, SpecBundle

### Community 71 - "run-eval.test.ts"
Cohesion: 0.26
Nodes (9): runEvalAll(), DEFAULT_REPORT_PATH, LIVE_ENV_VARS, missingLiveEnv(), parseArgs(), ParsedArgs, runEvalCli(), FAKE_LIVE_ENV (+1 more)

### Community 72 - "architecture-view.ts"
Cohesion: 0.17
Nodes (13): ArchitectureViewSchema, buildArchitectureView(), GENERATED_PATTERNS, isGeneratedPath(), fixturePath, loadGraph(), MANIFEST, rawFixture (+5 more)

### Community 73 - "tasks/index.ts"
Cohesion: 0.10
Nodes (13): FIXTURES, genericBundleFor(), loadFixture(), U, PET_CLINIC, U, ConstraintTraceAssertion, EVAL_TASKS (+5 more)

### Community 74 - "scripts"
Cohesion: 0.22
Nodes (9): scripts, build, lint, prepublishOnly, pretest, smoke:packed, test, test:coverage (+1 more)

### Community 75 - "stdio.ts"
Cohesion: 0.10
Nodes (17): killActiveProcessGroups(), EPIPE_DRAIN_TIMEOUT_MS, EXIT_CLIENT_GONE, EXIT_DRAIN_TIMEOUT, EXIT_OK, jsonRpcError(), MAX_FRAME_BYTES, MAX_IN_FLIGHT (+9 more)

### Community 76 - "compile.test.ts"
Cohesion: 0.14
Nodes (7): ChildOutcome, CLI_JS, SECTION_FILES, tmpDirs, FIXTURES, SECTION_FILES, tmpDirs

### Community 78 - "ClarifySession"
Cohesion: 0.25
Nodes (3): ClarificationAnswer, ClarifySession, ClarifyServerOptions

### Community 79 - "BudgetLedger"
Cohesion: 0.25
Nodes (3): BudgetLedger, LlmUsage, RecoveryDeps

### Community 80 - "llm/http.test.ts"
Cohesion: 0.29
Nodes (5): FAKE_ENV, FakeEnv, jsonResponse(), okFetch(), PartialFakeEnv

### Community 81 - "intel-contract.test.ts"
Cohesion: 0.32
Nodes (5): FIXTURE_SRC, freshDir(), graphWorkspace(), readFileFixture(), tmpDirs

### Community 82 - "good-fixture-gate.test.ts"
Cohesion: 0.29
Nodes (4): GOOD, GOOD_BUNDLES, SECTION_FILES, tmpDirs

### Community 83 - "legacy-app/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, version

### Community 84 - "clarify.test.ts"
Cohesion: 0.40
Nodes (3): BASE, complete(), unresolvedBundle()

### Community 85 - "ClarificationQuestion"
Cohesion: 0.33
Nodes (3): ClarificationQuestion, RenewalRoundDriver, RenewalClarifySessionOptions

### Community 87 - "graph-reader.ts"
Cohesion: 0.05
Nodes (42): RenewCapabilities, LLM_ROLES, LlmPlan, LlmRoute, singleRoutePlan(), FIXTURE_SRC, tmpDirs, FIXTURE_SRC (+34 more)

### Community 88 - "commands/trace.test.ts"
Cohesion: 0.10
Nodes (15): renderTrace(), compiledBundle(), FIXTURES, SECTION_FILES, tmpDirs, TraceResult, buildTrace(), DecSpec (+7 more)

### Community 89 - "write-spec.ts"
Cohesion: 0.28
Nodes (6): SECTION_KEYS, PET_CLINIC, SECTION_FILES, tmpDirs, writeSpecDir(), assertNotSymlink()

### Community 92 - "make-bins-executable.js"
Cohesion: 0.50
Nodes (3): BINS, { join }, { readFileSync, chmodSync }

### Community 97 - "packed-install-smoke.sh"
Cohesion: 1.00
Nodes (3): run(), say(), packed-install-smoke.sh script

### Community 99 - "renew.ts"
Cohesion: 0.09
Nodes (43): affectedSync(), analyzeWithFresh(), cmdRenewInit(), cmdRenewRefresh(), RenewResult, RenewReviewArgs, renewalConsentState(), nextRenewalApprovalId() (+35 more)

### Community 100 - "prepublish-check.js"
Cohesion: 0.29
Nodes (5): describe, pkg, result, { spawnSync }, status

### Community 106 - "files"
Cohesion: 0.33
Nodes (6): files, dist, examples, generated, LICENSE, README.md

### Community 108 - "corpus-lock.ts"
Cohesion: 0.24
Nodes (16): canonicalJson(), computeCorpusHash(), CORPUS_LOCK_VERSION, CorpusLock, CorpusLockEntry, frozenThresholds, loadCorpusLock(), lockCandidates() (+8 more)

### Community 116 - "server.test.ts"
Cohesion: 0.11
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
- **593 isolated node(s):** `name`, `version`, `private`, `packageManager`, `_archival` (+588 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SpecBundle` connect `SpecBundle` to `budget.ts`, `check/runner.ts`, `lifecycle.ts`, `commands/plan.ts`, `args.ts`, `engine.ts`, `planner/plan.ts`, `generate-interactive.ts`, `orchestrator.ts`, `generate.test.ts`, `score.ts`, `report.ts`, `prompts-v4.ts`, `review-changes.ts`, `hash.ts`, `adapter.ts`, `constraint-trace.test.ts`, `generate.ts`, `schemas/index.ts`, `orchestrator.test.ts`, `compiler/compile.ts`, `consent.ts`, `src/clarify/approvals.ts`, `lintBundle`, `commands/plan.test.ts`, `runner-roles.test.ts`, `check/runner.test.ts`, `SpecBundleSchema`, `eval/runner.test.ts`, `scale-benchmark.test.ts`, `council.test.ts`, `eval/runner.ts`, `tasks/index.ts`, `compile.test.ts`, `good-fixture-gate.test.ts`, `clarify.test.ts`, `commands/trace.test.ts`, `write-spec.ts`?**
  _High betweenness centrality (0.094) - this node is a cross-community bridge._
- **Why does `LlmAdapter` connect `LlmAdapter` to `budget.ts`, `pipeline.ts`, `args.ts`, `generate-interactive.ts`, `orchestrator.ts`, `generate.test.ts`, `adapter.ts`, `renew/clarify/approvals.ts`, `server.ts`, `generate.ts`, `orchestrator.test.ts`, `openai-compatible.ts`, `runner-roles.test.ts`, `eval/runner.test.ts`, `council.test.ts`, `eval/runner.ts`, `snapshot-trust.test.ts`, `tasks/index.ts`, `clarify.test.ts`, `graph-reader.ts`, `server.test.ts`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Why does `GraphContextProvider` connect `context-provider.ts` to `renew.ts`, `graph-reader.ts`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `runPipeline()` (e.g. with `.chargeAttempts()` and `.chargeTokens()`) actually correct?**
  _`runPipeline()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _593 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `app.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05217391304347826 - nodes in this community are weakly interconnected._
- **Should `pipeline.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.12698412698412698 - nodes in this community are weakly interconnected._