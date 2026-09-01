# Graph Report - llm_council_orchestrator  (2026-09-02)

## Corpus Check
- 321 files · ~275,450 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2061 nodes · 5158 edges · 99 communities (95 shown, 4 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 15 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `58cb99d6`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- budget.ts
- app.ts
- pipeline.ts
- check/runner.ts
- graphify-adapter.ts
- SpecBundle
- commands/plan.test.ts
- generate.ts
- engine.ts
- distiller.ts
- doctor.ts
- ledger.ts
- planner/plan.ts
- aggregate.ts
- generate-interactive.ts
- orchestrator.ts
- llm-config.ts
- score.ts
- report.ts
- check.test.ts
- prompts-v4.ts
- compilerOptions
- version.ts
- review-changes.ts
- live-experiment.ts
- GraphifyAdapter
- graph-reader.ts
- good-fixture-gate.test.ts
- schemas/index.ts
- model.ts
- orders.ts
- renew/clarify/approvals.ts
- server.ts
- createClarifySession
- snapshot.ts
- constraint-trace.test.ts
- common.ts
- namespace-ids.test.ts
- devDependencies
- fixture-provider.ts
- orchestrator.test.ts
- compileSpecDir
- providers.ts
- revision.test.ts
- strictness.test.ts
- consent.ts
- spec-core/package.json
- src/clarify/approvals.ts
- lintBundle
- gate.ts
- runner-roles.test.ts
- package.json
- generate.test.ts
- check/runner.test.ts
- l14.ts
- McpStdioServer
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
- execInProcessGroup
- check.ts
- run-eval.test.ts
- architecture-view.ts
- tasks/index.ts
- scripts
- stdio.ts
- cli.test.ts
- CodeIntelligenceProvider
- context-provider.test.ts
- pipeline.test.ts
- legacy-app/package.json
- check/redact.ts
- INPUT_CEILINGS
- adapter.ts
- commands/trace.test.ts
- acquireSpecRootLock
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
3. `runCli()` - 39 edges
4. `lintBundle()` - 39 edges
5. `compileSpecDir()` - 37 edges
6. `LlmAdapter` - 35 edges
7. `sha256Content()` - 27 edges
8. `SpecBundleSchema` - 24 edges
9. `createClarifySession()` - 23 edges
10. `LlmResponse` - 23 edges

## Surprising Connections (you probably didn't know these)
- `compiledBundle()` --calls--> `compileSpecDir()`  [EXTRACTED]
  packages/spec-core/src/cli/commands/plan.test.ts → packages/spec-core/src/compiler/compile.ts
- `compiledBundle()` --calls--> `compileSpecDir()`  [EXTRACTED]
  packages/spec-core/src/cli/commands/trace.test.ts → packages/spec-core/src/compiler/compile.ts
- `CompileResult` --references--> `SpecBundle`  [EXTRACTED]
  packages/spec-core/src/compiler/compile.ts → packages/spec-core/src/schemas/index.ts
- `HandleRpcOptions` --references--> `LlmAdapter`  [EXTRACTED]
  packages/spec-core/src/mcp/server.ts → packages/spec-core/src/eval/llm/adapter.ts
- `MockEvalScripts` --references--> `MockScript`  [EXTRACTED]
  packages/spec-core/src/eval/report.ts → packages/spec-core/src/eval/llm/mock.ts

## Import Cycles
- 3-file cycle: `packages/spec-core/src/eval/budget.ts -> packages/spec-core/src/eval/llm/http.ts -> packages/spec-core/src/llm/openai-compatible.ts -> packages/spec-core/src/eval/budget.ts`

## Communities (99 total, 4 thin omitted)

### Community 0 - "budget.ts"
Cohesion: 0.11
Nodes (24): BudgetCap, BudgetExceededError, BudgetSpentSnapshot, createBudgetLedger(), DEFAULT_WALL_SLACK_MS, MAX_COMPLETIONS, maxCompletions(), ResolvedRunBudget (+16 more)

### Community 1 - "app.ts"
Cohesion: 0.05
Nodes (76): ApiError, applyChanges(), applyRound(), approve(), bootstrapToken(), call(), cancel(), primeSessionId() (+68 more)

### Community 2 - "pipeline.ts"
Cohesion: 0.25
Nodes (11): ContextBundle, RecoveryOutcome, RecoveryRequest, runRecovery(), UsageState, zodIssues(), buildRecoveryPrompt(), buildValidationRetryPrompt() (+3 more)

### Community 3 - "check/runner.ts"
Cohesion: 0.16
Nodes (15): parseExpect(), activeProcessGroups, EVIDENCE_FILE_MODE, evidenceRunName(), ExecutorResult, FORCE_SETTLE_GRACE_MS, GROUP_KILL_GRACE_MS, MAX_BUFFER_BYTES (+7 more)

### Community 4 - "graphify-adapter.ts"
Cohesion: 0.11
Nodes (16): compareTriple(), DEFAULTS, GraphifyAdapterOptions, cleanup, installedVersion, MAX_EXCLUSIVE, MIN_VERSION, parseGraphifyVersion() (+8 more)

### Community 5 - "SpecBundle"
Cohesion: 0.07
Nodes (40): compileLintFreeze(), SECTION_PATHS, tmpDirs, applyChangeSet(), ApplyResult, ChangeSetSchema, formatIssues(), cleanLint (+32 more)

### Community 6 - "commands/plan.test.ts"
Cohesion: 0.08
Nodes (22): cmdPlan(), PlanOptions, PlanResult, PlanTask, renderHuman(), renderJson(), compiledBundle(), FIXTURES (+14 more)

### Community 7 - "generate.ts"
Cohesion: 0.09
Nodes (33): ClarifySessionOptions, Command, COMMANDS, GenerateVariant, InitProfile, parseArgs(), parseRenew(), ParseResult (+25 more)

### Community 8 - "engine.ts"
Cohesion: 0.15
Nodes (17): BAD, BadFixtureExpectation, RULES, rule, rule, rule, rule, rule (+9 more)

### Community 9 - "distiller.ts"
Cohesion: 0.10
Nodes (22): LlmPlan, DistillerInputs, distillRenewalQuestions(), makeRenewalDriver(), RENEWAL_CLAIM_ID, STRATEGY_CLAIM_ID, STRATEGY_OPTIONS, strategyQuestion() (+14 more)

### Community 10 - "doctor.ts"
Cohesion: 0.10
Nodes (30): BIN_FILES, BUDGET_ENV, checkBins(), checkBudgetEnv(), checkLlmConfig(), checkLock(), checkMcpFlags(), checkNodeVersion() (+22 more)

### Community 11 - "ledger.ts"
Cohesion: 0.08
Nodes (40): finishReview(), loadRenewalApproval(), addParityEntry(), ApplyApprovalResult, applyApprovalToParity(), emptyParity(), NewParityEntry, nextParityId() (+32 more)

### Community 12 - "planner/plan.ts"
Cohesion: 0.16
Nodes (16): ArchitectureView, OverlayStore, ParityStore, PlanInputs, PlanOutcome, TaskSeed, BuildStrategyArgs, MODERNIZATION_STRATEGIES (+8 more)

### Community 13 - "aggregate.ts"
Cohesion: 0.18
Nodes (18): Aggregation, VariantCost, calcs(), renderGateReport(), binomialCdf(), binomialPmf(), binomialTail(), bisect() (+10 more)

### Community 14 - "generate-interactive.ts"
Cohesion: 0.05
Nodes (45): ASSETS, baseBundle(), blockedJson(), complete(), fakeLlm(), REAL_FETCH, startWorkspace(), ASSETS (+37 more)

### Community 15 - "orchestrator.ts"
Cohesion: 0.11
Nodes (20): ClarificationAnswer, ClarificationQuestionView, DecisionRecords, ChangeSetChangeOutcome, ChangeSetOutcome, ClarifySession, SessionOpResult, SessionSnapshot (+12 more)

### Community 16 - "llm-config.ts"
Cohesion: 0.06
Nodes (35): RFC-7230, BUILTIN_PROVIDERS, cmdModels(), fmt(), MAX_CATALOG_BYTES, ModelCatalogEntry, MODELS_REQUEST_TIMEOUT_MS, ModelsOptions (+27 more)

### Community 17 - "score.ts"
Cohesion: 0.19
Nodes (23): allUnGrounded(), anchorSentences(), checkConstraintTrace(), commitmentSurfaces(), ConstraintFailureCode, containsTerm(), containsWholeTerm(), evaluateCandidate() (+15 more)

### Community 18 - "report.ts"
Cohesion: 0.11
Nodes (21): FIXTURES, genericBundleFor(), groundedBundleFor(), loadFixture(), U, BAD, BadFixtureExpectation, buildMockScripts() (+13 more)

### Community 19 - "check.test.ts"
Cohesion: 0.21
Nodes (8): evidenceOf(), evidencePath(), FIXTURES, freshRoot(), initRoot(), makeSpecRoot(), SECTION_FILES, tmpDirs

### Community 20 - "prompts-v4.ts"
Cohesion: 0.12
Nodes (29): DecomposedCouncilDeps, runDecomposedCouncil(), CLARIFY_RULES, CLASSIFY_RULES, CONSTRAINT_FIDELITY, decomposedClassifier(), decomposedJudge(), decomposedJudgeAlone() (+21 more)

### Community 21 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, esModuleInterop, lib, module, moduleResolution, noEmitOnError, outDir, rootDir (+11 more)

### Community 22 - "version.ts"
Cohesion: 0.36
Nodes (7): checkSpecSchemaVersion(), ParsedVersion, parseVersion(), SPEC_SCHEMA_VERSION, SpecSchemaVersionFieldSchema, SpecSchemaVersionVerdict, SUPPORTED

### Community 23 - "review-changes.ts"
Cohesion: 0.19
Nodes (12): BehaviorReview, changeRequestEvidence, ChangeSetValidation, CLARIFY_REVIEW_CHANGES_PROTOCOL, MAX_CHANGE_INSTRUCTION_CHARS, MAX_CHANGES_PER_SET, ReviewChange, ReviewChangeSchema (+4 more)

### Community 24 - "live-experiment.ts"
Cohesion: 0.13
Nodes (22): aggregateEmitted(), EMITTED_SCHEMA, EmittedOutcome, loadRunDir(), parseEmittedOutcome(), renderAggregation(), baseScore(), BLOCKED (+14 more)

### Community 25 - "GraphifyAdapter"
Cohesion: 0.24
Nodes (4): neighborhood(), GraphifyAdapter, IntelFailure, IntelItems

### Community 26 - "graph-reader.ts"
Cohesion: 0.16
Nodes (12): fixturePath, parsed, basename(), GraphParseResult, parseGraphFile(), parseGraphText(), RawGraphSchema, RawLinkSchema (+4 more)

### Community 27 - "good-fixture-gate.test.ts"
Cohesion: 0.10
Nodes (15): cmdVerify(), VerifyResult, artifactHashes(), FIXTURES, HASHED_KEYS, verifyFrozen(), VerifyResult, GOOD (+7 more)

### Community 28 - "schemas/index.ts"
Cohesion: 0.13
Nodes (15): GOOD, parityProjection, codeAnchorItem, CodeAnchorPayloadSchema, evidenceCommon, EvidenceItemSchema, validEvidence, SpecBundleForExport (+7 more)

### Community 29 - "model.ts"
Cohesion: 0.15
Nodes (19): AnswerCheck, answerToUserAnswer(), applyAnswersToRecords(), ApplyResult, attachStatuses(), ClarificationOptionView, DecisionRecord, DecisionStatus (+11 more)

### Community 30 - "orders.ts"
Cohesion: 0.22
Nodes (13): checkStock(), decrementStock(), stock, CATALOG, quote(), run(), createOrder(), OrderResult (+5 more)

### Community 31 - "renew/clarify/approvals.ts"
Cohesion: 0.12
Nodes (15): BuildRenewalApprovalArgs, buildRenewalApprovalRecord(), renewalApprovalDigest(), RenewalApprovalRecord, RenewalApprovalRecordSchema, RenewalDecision, RenewalDecisionSchema, RenewalDecisionSet (+7 more)

### Community 32 - "server.ts"
Cohesion: 0.08
Nodes (33): DEFAULT_GENERATE_PROFILE, ChangeSet, ExecBoundary, generateOptInFromEnv(), GenerateProfile, GenerateVariant, ARG_SPECS, ArgName (+25 more)

### Community 33 - "createClarifySession"
Cohesion: 0.17
Nodes (16): applyEnrichment(), buildEnrichPrompt(), CLARIFY_ENRICH_PROTOCOL, DecisionEnrichment, EnrichedItemSchema, EnrichOutputSchema, EnrichParseResult, MAX_CONTEXT_CHARS (+8 more)

### Community 34 - "snapshot.ts"
Cohesion: 0.14
Nodes (20): FileManifest, boundPaths(), createSnapshot(), digestGraphManifest(), evaluateStaleness(), GraphManifestIdentity, identityDigest(), ProjectSnapshotSchema (+12 more)

### Community 35 - "constraint-trace.test.ts"
Cohesion: 0.18
Nodes (13): et07Requirement(), et12Requirement(), failureCodes(), FIXTURES, genericBundleFor(), groundedEt01(), groundedEt02(), groundedEt04() (+5 more)

### Community 36 - "common.ts"
Cohesion: 0.27
Nodes (7): ComplexityProfileSchema, IdSchema, ImpactLevelSchema, Sha256Schema, SpecStateSchema, ManifestSchema, validManifest

### Community 37 - "namespace-ids.test.ts"
Cohesion: 0.19
Nodes (12): AssumptionIdSchema, DecisionIdSchema, EvidenceIdSchema, RequirementIdSchema, TaskIdSchema, TestIdSchema, DecisionSchema, validDecision (+4 more)

### Community 38 - "devDependencies"
Cohesion: 0.15
Nodes (13): jsdom, devDependencies, jsdom, @types/node, typescript, vitest, @vitest/coverage-v8, zod-to-json-schema (+5 more)

### Community 39 - "fixture-provider.ts"
Cohesion: 0.14
Nodes (17): StaticGraphProvider, affectedReverse(), graphHealthOf(), querySeeds(), shortestPath(), fixturePath, parsed, ParsedGraph (+9 more)

### Community 40 - "orchestrator.test.ts"
Cohesion: 0.27
Nodes (8): MAX_CLARIFY_ROUNDS, atReview(), blockedBundle(), bundle(), complete(), OPTS, scriptedLlm(), sessionWith()

### Community 41 - "compileSpecDir"
Cohesion: 0.07
Nodes (37): applyUnderLock(), ChangeResult, cmdChange(), findingLine(), FIXTURES, frozenSpecRoot(), inlineBundle(), makeSpecRoot() (+29 more)

### Community 42 - "providers.ts"
Cohesion: 0.22
Nodes (14): ResolvedRole, CostExtractor, createOpenAiCompatibleLlm(), OpenAiCompatibleConfig, baseConfig(), jsonResponse(), okBody(), buildRoleAdapter() (+6 more)

### Community 43 - "revision.test.ts"
Cohesion: 0.17
Nodes (5): DEFAULT_STALE_MS, LOCK_FILE, LockHeldError, fsyncCtl, tmpDirs

### Community 44 - "strictness.test.ts"
Cohesion: 0.40
Nodes (3): FIXTURES, validManifest, validTask

### Community 45 - "consent.ts"
Cohesion: 0.11
Nodes (27): authorizeExecution(), checkPreviewDigest(), consentDigestLine(), EXEC_OPT_IN_ENV, EXEC_ROOT_ENV, ExecAuthorization, execOptInFromEnv(), execRootFromEnv() (+19 more)

### Community 46 - "spec-core/package.json"
Cohesion: 0.22
Nodes (8): description, engines, node, license, main, name, type, version

### Community 47 - "src/clarify/approvals.ts"
Cohesion: 0.12
Nodes (23): AnswerLedgerSchema, answersExportDocument(), APPROVAL_RECORD_SCHEMA_ID, approvalFileName(), ApprovalRecord, ApprovalRecordSchema, buildApprovalRecord(), ChangeLedgerSchema (+15 more)

### Community 48 - "lintBundle"
Cohesion: 0.06
Nodes (14): cmdLint(), LintResult, lintBundle(), FIXTURES, FIXTURES, FIXTURES, FIXTURES, FIXTURES (+6 more)

### Community 49 - "gate.ts"
Cohesion: 0.24
Nodes (11): ConstraintFailure, BadFixtureCapture, GateCalcs, GateReportInput, EvalEvidence, fixtures15(), liveInput(), passInput() (+3 more)

### Community 50 - "runner-roles.test.ts"
Cohesion: 0.10
Nodes (9): BASE, complete(), unresolvedBundle(), complete(), et01Bundle(), PET_CLINIC, PET_CLINIC, U (+1 more)

### Community 51 - "package.json"
Cohesion: 0.25
Nodes (7): _archival, name, packageManager, private, scripts, test:spec, version

### Community 52 - "generate.test.ts"
Cohesion: 0.10
Nodes (12): complete(), FAKE_ENV, fetchSpy(), jsonResponse(), PET_CLINIC, PROFILE_CONFIG, SECTION_FILES, SESSION_SERVICE (+4 more)

### Community 53 - "check/runner.test.ts"
Cohesion: 0.15
Nodes (6): DEFAULT_TIMEOUT_MS, FakeCall, FIXTURES, PET_CLINIC, tmpDirs, Verification

### Community 54 - "l14.ts"
Cohesion: 0.43
Nodes (4): EXPECT_GRAMMAR_DOC, EXPECTED_EXIT_PATTERN, isJudgeableExpect(), rule

### Community 56 - "schemas.ts"
Cohesion: 0.11
Nodes (16): AnalysisUsageSchema, AnchorResult, AnchorResultSchema, RECOVERY_CATEGORIES, RecoveryHypothesis, RecoveryHypothesisSchema, RecoveryOutput, RecoveryOutputSchema (+8 more)

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
Cohesion: 0.15
Nodes (16): DEFAULT_INGEST_LIMITS, DENIED_BASE_PATTERNS, DENIED_DIRS, guardPath(), GuardVerdict, IngestLimits, isDeniedDirectory(), looksBinary() (+8 more)

### Community 61 - "overlay.ts"
Cohesion: 0.14
Nodes (23): analyzeWithFresh(), addOverlayRecord(), emptyOverlay(), evaluateOverlayStaleness(), loadOverlay(), markSuperseded(), NewOverlayRecord, nextOverlayId() (+15 more)

### Community 62 - "context-provider.ts"
Cohesion: 0.15
Nodes (12): ContextItem, ContextLimits, AnalysisScope, ContextProvider, GraphContextProvider, GraphContextProviderOptions, parseLoc(), SliceReader (+4 more)

### Community 63 - "scale-benchmark.test.ts"
Cohesion: 0.10
Nodes (16): ClosureFinding, ClosureFindingCode, closureFindings(), DuplicateTaskId, duplicateTaskIds(), firstOverlap(), globSegments(), globsOverlap() (+8 more)

### Community 64 - "verifier.ts"
Cohesion: 0.23
Nodes (9): AnchorBatchResult, AnchorFailureCode, AnchorVerification, canonicalFileHash(), CodeAnchorInput, isValidAnchorPath(), tmpDirs, verifyAnchor() (+1 more)

### Community 65 - "init.ts"
Cohesion: 0.13
Nodes (13): Contract, Decision, EvidenceItem, GlossaryEntry, InitOptions, InitResult, Intent, Requirement (+5 more)

### Community 66 - "council.test.ts"
Cohesion: 0.28
Nodes (6): BUNDLE_OK(), CLASSIFIER_BLOCK, CLASSIFIER_OK, complete(), et01Bundle(), PET_CLINIC

### Community 67 - "revision.ts"
Cohesion: 0.26
Nodes (11): backupPathFor(), createDirAtomically(), fsyncDir(), LockIdentity, LockOptions, nextSuffix(), serialize(), SpecRootLock (+3 more)

### Community 68 - "eval/runner.ts"
Cohesion: 0.14
Nodes (22): validateGenerationOutput(), BudgetLedger, measurePromptSizes(), LlmUsage, CLASSIFY_RULES, classifyAndProposeSingle(), classifySingle(), CONSTRAINT_FIDELITY (+14 more)

### Community 70 - "check.ts"
Cohesion: 0.38
Nodes (6): CheckOutcome, Executor, CheckOptions, CheckResult, expectedActual(), renderReport()

### Community 71 - "run-eval.test.ts"
Cohesion: 0.23
Nodes (9): runEvalAll(), runLiveEval(), DEFAULT_REPORT_PATH, LIVE_ENV_VARS, parseArgs(), ParsedArgs, runEvalCli(), FAKE_LIVE_ENV (+1 more)

### Community 72 - "architecture-view.ts"
Cohesion: 0.25
Nodes (9): ArchitectureViewSchema, buildArchitectureView(), GENERATED_PATTERNS, isGeneratedPath(), fixturePath, loadGraph(), MANIFEST, rawFixture (+1 more)

### Community 73 - "tasks/index.ts"
Cohesion: 0.16
Nodes (9): ConstraintTraceAssertion, DeterministicAssertion, EVAL_TASKS, EvalTask, EvalTaskKind, EvalTaskProfile, IntentConstraint, NumericOperator (+1 more)

### Community 74 - "scripts"
Cohesion: 0.22
Nodes (9): scripts, build, lint, prepublishOnly, pretest, smoke:packed, test, test:coverage (+1 more)

### Community 75 - "stdio.ts"
Cohesion: 0.12
Nodes (15): killActiveProcessGroups(), EPIPE_DRAIN_TIMEOUT_MS, EXIT_CLIENT_GONE, EXIT_DRAIN_TIMEOUT, EXIT_OK, MAX_FRAME_BYTES, MAX_IN_FLIGHT, SchedulingPeek (+7 more)

### Community 76 - "cli.test.ts"
Cohesion: 0.12
Nodes (6): FIXTURES, SECTION_FILES, tmpDirs, FIXTURES, SECTION_FILES, tmpDirs

### Community 78 - "context-provider.test.ts"
Cohesion: 0.21
Nodes (9): ContextBundleSchema, ContextItemSchema, RENEW_CONTEXT_LIMITS, FILES, fixturePath, makeProvider(), manifest, parsed (+1 more)

### Community 82 - "pipeline.test.ts"
Cohesion: 0.22
Nodes (6): depsFor(), freshDir(), persisted, setupTarget(), sha(), tmpDirs

### Community 83 - "legacy-app/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, version

### Community 84 - "check/redact.ts"
Cohesion: 0.47
Nodes (4): REDACTION_RULES, RedactionRule, redactSecrets(), SecretKind

### Community 85 - "INPUT_CEILINGS"
Cohesion: 0.20
Nodes (6): GlossaryEntrySchema, IntentSchema, validIntent, INPUT_CEILINGS, validManifest, validTask

### Community 87 - "adapter.ts"
Cohesion: 0.10
Nodes (24): LlmAdapter, LlmCompleteOptions, LlmResponse, MockScript, SCRIPT, ChatResponse, parseSuccess(), extractProvenance() (+16 more)

### Community 88 - "commands/trace.test.ts"
Cohesion: 0.10
Nodes (16): cmdTrace(), renderTrace(), compiledBundle(), FIXTURES, SECTION_FILES, tmpDirs, TraceResult, buildTrace() (+8 more)

### Community 89 - "acquireSpecRootLock"
Cohesion: 0.17
Nodes (13): buildSections(), cmdInit(), pathExists(), SECTION_KEYS, PET_CLINIC, SECTION_FILES, tmpDirs, writeSpecDir() (+5 more)

### Community 92 - "make-bins-executable.js"
Cohesion: 0.50
Nodes (3): BINS, { join }, { readFileSync, chmodSync }

### Community 97 - "packed-install-smoke.sh"
Cohesion: 1.00
Nodes (3): run(), say(), packed-install-smoke.sh script

### Community 99 - "renew.ts"
Cohesion: 0.11
Nodes (40): commandHelp(), cmdCheck(), cmdFreeze(), normalizeFileIntent(), affectedSync(), atomicWrite(), cmdRenewAnalyze(), cmdRenewExport() (+32 more)

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
- **565 isolated node(s):** `name`, `version`, `private`, `packageManager`, `_archival` (+560 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SpecBundle` connect `SpecBundle` to `budget.ts`, `check/runner.ts`, `commands/plan.test.ts`, `generate.ts`, `engine.ts`, `planner/plan.ts`, `generate-interactive.ts`, `orchestrator.ts`, `score.ts`, `report.ts`, `prompts-v4.ts`, `review-changes.ts`, `good-fixture-gate.test.ts`, `schemas/index.ts`, `constraint-trace.test.ts`, `orchestrator.test.ts`, `compileSpecDir`, `consent.ts`, `src/clarify/approvals.ts`, `lintBundle`, `runner-roles.test.ts`, `generate.test.ts`, `check/runner.test.ts`, `l14.ts`, `eval/runner.test.ts`, `scale-benchmark.test.ts`, `council.test.ts`, `eval/runner.ts`, `check.ts`, `cli.test.ts`, `commands/trace.test.ts`, `acquireSpecRootLock`?**
  _High betweenness centrality (0.099) - this node is a cross-community bridge._
- **Why does `LlmAdapter` connect `adapter.ts` to `budget.ts`, `server.ts`, `council.test.ts`, `eval/runner.ts`, `generate.ts`, `orchestrator.test.ts`, `providers.ts`, `generate-interactive.ts`, `orchestrator.ts`, `runner-roles.test.ts`, `pipeline.test.ts`, `generate.test.ts`, `server.test.ts`, `eval/runner.test.ts`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Why does `GraphifyAdapter` connect `GraphifyAdapter` to `server.ts`, `renew.ts`, `graphify-adapter.ts`, `fixture-provider.ts`, `CodeIntelligenceProvider`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `runPipeline()` (e.g. with `.chargeAttempts()` and `.chargeTokens()`) actually correct?**
  _`runPipeline()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _565 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `budget.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10793650793650794 - nodes in this community are weakly interconnected._
- **Should `app.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05217391304347826 - nodes in this community are weakly interconnected._