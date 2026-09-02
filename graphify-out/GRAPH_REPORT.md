# Graph Report - llm_council_orchestrator  (2026-09-02)

## Corpus Check
- 338 files · ~310,219 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2191 nodes · 5708 edges · 88 communities (86 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 15 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a0bdaf93`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- budget.ts
- app.ts
- tranche5.test.ts
- check/runner.ts
- GraphifyAdapter
- SpecBundle
- commands/plan.ts
- generate-interactive.ts
- engine.ts
- models.ts
- doctor.ts
- ledger.ts
- planner/plan.ts
- live-experiment.ts
- server/http.ts
- orchestrator.ts
- generate.test.ts
- tasks/index.ts
- report.ts
- check.test.ts
- prompts-v4.ts
- compilerOptions
- compileSpecDir
- review-changes.ts
- cli/index.ts
- parseGraphText
- llm-config.ts
- cli.test.ts
- manifest.ts
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
- graphify-adapter.ts
- orchestrator.test.ts
- paths.ts
- openai-compatible.ts
- change.ts
- consent.ts
- spec-core/package.json
- src/clarify/approvals.ts
- lintBundle
- commands/plan.test.ts
- package.json
- SpecBundleSchema
- intel-contract.test.ts
- schemas.ts
- copy-browser-assets.js
- compilerOptions
- tranche4.test.ts
- coverage-hardening.test.ts
- egress.test.ts
- scale-benchmark.test.ts
- verifier.ts
- init.ts
- revision.ts
- eval/runner.ts
- snapshot-trust.test.ts
- run-eval.test.ts
- graph-reader.ts
- adapter.ts
- scripts
- stdio.ts
- compile.test.ts
- CodeIntelligenceProvider
- llm/http.test.ts
- legacy-app/package.json
- llm/plan.ts
- commands/trace.test.ts
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
2. `LlmAdapter` - 44 edges
3. `runPipeline()` - 43 edges
4. `runCli()` - 42 edges
5. `lintBundle()` - 39 edges
6. `cmdRenewInit()` - 37 edges
7. `compileSpecDir()` - 37 edges
8. `LlmResponse` - 31 edges
9. `parseGraphText()` - 30 edges
10. `cmdRenewReview()` - 27 edges

## Surprising Connections (you probably didn't know these)
- `compiledBundle()` --calls--> `compileSpecDir()`  [EXTRACTED]
  packages/spec-core/src/cli/commands/plan.test.ts → packages/spec-core/src/compiler/compile.ts
- `PlanTask` --references--> `TaskContract`  [EXTRACTED]
  packages/spec-core/src/cli/commands/plan.ts → packages/spec-core/src/schemas/tasks.ts
- `rulePreserve()` --calls--> `cmdRenewReview()`  [EXTRACTED]
  packages/spec-core/src/renew/planner-trust.test.ts → packages/spec-core/src/cli/commands/renew.ts
- `compiledBundle()` --calls--> `compileSpecDir()`  [EXTRACTED]
  packages/spec-core/src/cli/commands/trace.test.ts → packages/spec-core/src/compiler/compile.ts
- `CompileResult` --references--> `SpecBundle`  [EXTRACTED]
  packages/spec-core/src/compiler/compile.ts → packages/spec-core/src/schemas/index.ts

## Import Cycles
- 3-file cycle: `packages/spec-core/src/eval/budget.ts -> packages/spec-core/src/eval/llm/http.ts -> packages/spec-core/src/llm/openai-compatible.ts -> packages/spec-core/src/eval/budget.ts`

## Communities (88 total, 2 thin omitted)

### Community 0 - "budget.ts"
Cohesion: 0.09
Nodes (31): Command, COMMANDS, GenerateVariant, InitProfile, parseRenew(), ParseResult, RENEW_GRAMMAR, RENEW_HELP (+23 more)

### Community 1 - "app.ts"
Cohesion: 0.05
Nodes (76): ApiError, applyChanges(), applyRound(), approve(), bootstrapToken(), call(), cancel(), primeSessionId() (+68 more)

### Community 2 - "tranche5.test.ts"
Cohesion: 0.09
Nodes (23): ContextBundle, ContextItemSchema, RecoveryOutcome, RecoveryRequest, runRecovery(), depsFor(), freshDir(), persisted (+15 more)

### Community 3 - "check/runner.ts"
Cohesion: 0.06
Nodes (34): parseExpect(), REDACTION_RULES, RedactionRule, redactSecrets(), SecretKind, activeProcessGroups, CheckOutcome, DEFAULT_TIMEOUT_MS (+26 more)

### Community 4 - "GraphifyAdapter"
Cohesion: 0.12
Nodes (10): compareTriple(), GraphifyAdapter, GraphifyAdapterOptions, parseGraphifyVersion(), tail(), fixtureGraphText, fixturePath, versionSupported() (+2 more)

### Community 5 - "SpecBundle"
Cohesion: 0.06
Nodes (46): applyChangeSet(), ApplyResult, ChangeSetSchema, formatIssues(), cleanLint, FIXTURES, freeze(), FreezeResult (+38 more)

### Community 6 - "commands/plan.ts"
Cohesion: 0.14
Nodes (16): cmdPlan(), PlanOptions, PlanResult, PlanTask, renderHuman(), renderJson(), TopoResult, topoSort() (+8 more)

### Community 7 - "generate-interactive.ts"
Cohesion: 0.12
Nodes (23): ClarifySessionOptions, GenerateOptions, cmdGenerateInteractive(), EVENT_LINES, GenerateInteractiveOptions, GenerateInteractiveResult, openBrowser(), ASSETS (+15 more)

### Community 8 - "engine.ts"
Cohesion: 0.14
Nodes (17): BAD, BadFixtureExpectation, RULES, rule, rule, rule, rule, rule (+9 more)

### Community 9 - "models.ts"
Cohesion: 0.15
Nodes (12): BUILTIN_PROVIDERS, cmdModels(), fmt(), MAX_CATALOG_BYTES, ModelCatalogEntry, MODELS_REQUEST_TIMEOUT_MS, ModelsOptions, ModelsResult (+4 more)

### Community 10 - "doctor.ts"
Cohesion: 0.10
Nodes (31): BIN_FILES, BUDGET_ENV, checkBins(), checkBudgetEnv(), checkLlmConfig(), checkLock(), checkMcpFlags(), checkNodeVersion() (+23 more)

### Community 11 - "ledger.ts"
Cohesion: 0.07
Nodes (46): RenewalApprovalRecord, FIXTURE_SRC, freshDir(), graphCaps(), makeTarget(), tmpDirs, addParityEntry(), ApplyApprovalResult (+38 more)

### Community 12 - "planner/plan.ts"
Cohesion: 0.18
Nodes (14): ArchitectureView, ParityStore, PlanInputs, PlanOutcome, TaskSeed, BuildStrategyArgs, MODERNIZATION_STRATEGIES, ModernizationStrategy (+6 more)

### Community 13 - "live-experiment.ts"
Cohesion: 0.09
Nodes (40): aggregateEmitted(), Aggregation, EMITTED_SCHEMA, EmittedOutcome, loadRunDir(), parseEmittedOutcome(), renderAggregation(), baseScore() (+32 more)

### Community 14 - "server/http.ts"
Cohesion: 0.06
Nodes (29): ASSETS, baseBundle(), blockedJson(), complete(), fakeLlm(), REAL_FETCH, startWorkspace(), ASSETS (+21 more)

### Community 15 - "orchestrator.ts"
Cohesion: 0.13
Nodes (21): ClarificationQuestionView, mergeRoundRecords(), BehaviorReview, ChangeSetChangeOutcome, ChangeSetOutcome, SessionOpResult, SessionSnapshot, SessionUsageSummary (+13 more)

### Community 16 - "generate.test.ts"
Cohesion: 0.10
Nodes (12): complete(), FAKE_ENV, fetchSpy(), jsonResponse(), PET_CLINIC, PROFILE_CONFIG, SECTION_FILES, SESSION_SERVICE (+4 more)

### Community 17 - "tasks/index.ts"
Cohesion: 0.14
Nodes (28): allUnGrounded(), anchorSentences(), checkConstraintTrace(), commitmentSurfaces(), ConstraintFailureCode, containsTerm(), containsWholeTerm(), evaluateCandidate() (+20 more)

### Community 18 - "report.ts"
Cohesion: 0.08
Nodes (32): BadFixtureCapture, FIXTURES, genericBundleFor(), groundedBundleFor(), loadFixture(), U, createMockLlm(), MockScript (+24 more)

### Community 19 - "check.test.ts"
Cohesion: 0.14
Nodes (12): EXPECT_GRAMMAR_DOC, EXPECTED_EXIT_PATTERN, isJudgeableExpect(), evidenceOf(), evidencePath(), FIXTURES, freshRoot(), initRoot() (+4 more)

### Community 20 - "prompts-v4.ts"
Cohesion: 0.22
Nodes (8): CLARIFY_RULES, CLASSIFY_RULES, CONSTRAINT_FIDELITY, JSON_ONLY, PITFALLS, SCHEMA_BLOCK, SCHEMA_TEXT, EvalTaskProfile

### Community 21 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, esModuleInterop, lib, module, moduleResolution, noEmitOnError, outDir, rootDir (+11 more)

### Community 22 - "compileSpecDir"
Cohesion: 0.11
Nodes (23): cmdCompile(), compileFailedOutput(), CompileResult, cmdFreeze(), FreezeResult, ChildOutcome, CLI_JS, SECTION_FILES (+15 more)

### Community 23 - "review-changes.ts"
Cohesion: 0.17
Nodes (11): ChangeSetValidation, CLARIFY_REVIEW_CHANGES_PROTOCOL, MAX_CHANGE_INSTRUCTION_CHARS, MAX_CHANGES_PER_SET, ReviewChange, ReviewChangeSchema, ReviewChangeSet, ReviewChangeSetSchema (+3 more)

### Community 24 - "cli/index.ts"
Cohesion: 0.13
Nodes (19): commandHelp(), parseArgs(), renewSubHelp(), normalizeFileIntent(), readBudgetEnv(), readEnginesFloor(), readVersion(), runCli() (+11 more)

### Community 25 - "parseGraphText"
Cohesion: 0.17
Nodes (11): caps(), parseGraphText(), FIXTURE_SRC, freshDir(), graphCaps(), initializedPair(), makeTarget(), tmpDirs (+3 more)

### Community 26 - "llm-config.ts"
Cohesion: 0.10
Nodes (23): RFC-7230, BaseUrlSchema, HeaderNameSchema, LINK_LOCAL_PREFIXES, LlmConfig, LlmConfigSchema, METADATA_HOSTS, OpenRouterRoutingSchema (+15 more)

### Community 27 - "cli.test.ts"
Cohesion: 0.22
Nodes (3): FIXTURES, SECTION_FILES, tmpDirs

### Community 28 - "manifest.ts"
Cohesion: 0.22
Nodes (10): Manifest, ManifestSchema, validManifest, checkSpecSchemaVersion(), ParsedVersion, parseVersion(), SPEC_SCHEMA_VERSION, SpecSchemaVersionFieldSchema (+2 more)

### Community 29 - "model.ts"
Cohesion: 0.16
Nodes (17): AnswerCheck, answerToUserAnswer(), applyAnswersToRecords(), ApplyResult, attachStatuses(), ClarificationAnswer, ClarificationOptionView, DecisionRecord (+9 more)

### Community 30 - "orders.ts"
Cohesion: 0.22
Nodes (13): checkStock(), decrementStock(), stock, CATALOG, quote(), run(), createOrder(), OrderResult (+5 more)

### Community 31 - "renew/clarify/approvals.ts"
Cohesion: 0.12
Nodes (16): BuildRenewalApprovalArgs, buildRenewalApprovalRecord(), nextRenewalApprovalId(), renewalApprovalDigest(), RenewalApprovalLoad, RenewalApprovalRecordSchema, RenewalDecision, RenewalDecisionSchema (+8 more)

### Community 32 - "server.ts"
Cohesion: 0.09
Nodes (29): ChangeSet, generateOptInFromEnv(), GenerateProfile, GenerateVariant, ARG_SPECS, ArgName, ArgValidator, configLoadCache (+21 more)

### Community 33 - "createClarifySession"
Cohesion: 0.18
Nodes (15): applyEnrichment(), buildEnrichPrompt(), CLARIFY_ENRICH_PROTOCOL, DecisionEnrichment, EnrichedItemSchema, EnrichOutputSchema, EnrichParseResult, MAX_CONTEXT_CHARS (+7 more)

### Community 34 - "snapshot.ts"
Cohesion: 0.13
Nodes (22): FileManifest, FileManifestEntry, boundPaths(), createSnapshot(), deriveSnapshotId(), evaluateStaleness(), GraphManifestIdentity, GraphManifestParse (+14 more)

### Community 35 - "constraint-trace.test.ts"
Cohesion: 0.18
Nodes (13): et07Requirement(), et12Requirement(), failureCodes(), FIXTURES, genericBundleFor(), groundedEt01(), groundedEt02(), groundedEt04() (+5 more)

### Community 36 - "generate.ts"
Cohesion: 0.16
Nodes (18): buildLlmPlanFromProfile(), checkIntent(), clarificationBlock(), cmdGenerate(), DEFAULT_GENERATE_PROFILE, DEFAULT_GENERATE_VARIANT, GenerateResult, IntentCheck (+10 more)

### Community 37 - "schemas/index.ts"
Cohesion: 0.09
Nodes (33): AssumptionIdSchema, ComplexityProfileSchema, ContractIdSchema, DecisionIdSchema, EvidenceIdSchema, IdSchema, ImpactLevelSchema, RequirementIdSchema (+25 more)

### Community 38 - "devDependencies"
Cohesion: 0.15
Nodes (13): jsdom, devDependencies, jsdom, @types/node, typescript, vitest, @vitest/coverage-v8, zod-to-json-schema (+5 more)

### Community 39 - "graphify-adapter.ts"
Cohesion: 0.13
Nodes (24): StaticGraphProvider, affectedReverse(), godNodes(), graphHealthOf(), neighborhood(), querySeeds(), shortestPath(), fixturePath (+16 more)

### Community 40 - "orchestrator.test.ts"
Cohesion: 0.27
Nodes (8): MAX_CLARIFY_ROUNDS, atReview(), blockedBundle(), bundle(), complete(), OPTS, scriptedLlm(), sessionWith()

### Community 41 - "paths.ts"
Cohesion: 0.19
Nodes (16): assertDisjointRealRoots(), assertNoSymlinkBelow(), assertWritableSpecDir(), checkMcpDir(), ContainedOutputCheck, DisjointRootsCheck, effectiveMcpRoot, isInside() (+8 more)

### Community 42 - "openai-compatible.ts"
Cohesion: 0.13
Nodes (23): ResolvedRole, LlmCompleteOptions, ChatResponse, CostExtractor, createOpenAiCompatibleLlm(), parseSuccess(), extractProvenance(), extractUsageDetails() (+15 more)

### Community 43 - "change.ts"
Cohesion: 0.17
Nodes (10): applyUnderLock(), ChangeResult, cmdChange(), findingLine(), FIXTURES, frozenSpecRoot(), inlineBundle(), makeSpecRoot() (+2 more)

### Community 45 - "consent.ts"
Cohesion: 0.10
Nodes (30): authorizeExecution(), checkPreviewDigest(), consentDigestLine(), EXEC_OPT_IN_ENV, EXEC_ROOT_ENV, ExecAuthorization, execOptInFromEnv(), execRootFromEnv() (+22 more)

### Community 46 - "spec-core/package.json"
Cohesion: 0.22
Nodes (8): description, engines, node, license, main, name, type, version

### Community 47 - "src/clarify/approvals.ts"
Cohesion: 0.10
Nodes (28): AnswerLedgerSchema, answersExportDocument(), APPROVAL_RECORD_SCHEMA_ID, approvalFileName(), ApprovalRecord, ApprovalRecordSchema, buildApprovalRecord(), ChangeLedgerSchema (+20 more)

### Community 48 - "lintBundle"
Cohesion: 0.07
Nodes (14): cmdLint(), LintResult, lintBundle(), FIXTURES, FIXTURES, FIXTURES, FIXTURES, FIXTURES (+6 more)

### Community 49 - "commands/plan.test.ts"
Cohesion: 0.17
Nodes (4): compiledBundle(), FIXTURES, SECTION_FILES, tmpDirs

### Community 51 - "package.json"
Cohesion: 0.25
Nodes (7): _archival, name, packageManager, private, scripts, test:spec, version

### Community 54 - "SpecBundleSchema"
Cohesion: 0.12
Nodes (9): GOOD, SpecBundleForExport, GENERATED_PATH, SpecBundleSchema, validManifest, validTask, FIXTURES, validManifest (+1 more)

### Community 55 - "intel-contract.test.ts"
Cohesion: 0.14
Nodes (11): cleanup, installedVersion, FIXTURE_SRC, freshDir(), graphWorkspace(), readFileFixture(), tmpDirs, runSubprocess() (+3 more)

### Community 56 - "schemas.ts"
Cohesion: 0.07
Nodes (33): DistillerInputs, distillRenewalQuestions(), makeRenewalDriver(), RENEWAL_CLAIM_ID, STRATEGY_CLAIM_ID, STRATEGY_OPTIONS, strategyQuestion(), analysisWithUncertainty() (+25 more)

### Community 57 - "copy-browser-assets.js"
Cohesion: 0.25
Nodes (7): { copyFileSync, mkdirSync, readdirSync, writeFileSync }, files, { join }, MIME, outDir, root, srcDir

### Community 59 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck (+7 more)

### Community 60 - "tranche4.test.ts"
Cohesion: 0.13
Nodes (16): DEFAULT_INGEST_LIMITS, DENIED_BASE_PATTERNS, DENIED_DIRS, guardPath(), GuardVerdict, IngestLimits, isDeniedDirectory(), looksBinary() (+8 more)

### Community 61 - "coverage-hardening.test.ts"
Cohesion: 0.12
Nodes (26): FIXTURE_SRC, freshDir(), makeTarget(), tmpDirs, addOverlayRecord(), emptyOverlay(), evaluateOverlayStaleness(), loadOverlay() (+18 more)

### Community 62 - "egress.test.ts"
Cohesion: 0.09
Nodes (23): ContextBundleSchema, ContextItem, ContextLimits, RENEW_CONTEXT_LIMITS, AnalysisScope, ContextProvider, GraphContextProvider, GraphContextProviderOptions (+15 more)

### Community 63 - "scale-benchmark.test.ts"
Cohesion: 0.09
Nodes (17): ClosureFinding, ClosureFindingCode, closureFindings(), DuplicateTaskId, duplicateTaskIds(), firstOverlap(), globSegments(), globsOverlap() (+9 more)

### Community 64 - "verifier.ts"
Cohesion: 0.18
Nodes (10): AnchorBatchResult, AnchorFailureCode, AnchorVerification, canonicalFileHash(), CodeAnchorInput, countLines(), isValidAnchorPath(), tmpDirs (+2 more)

### Community 65 - "init.ts"
Cohesion: 0.13
Nodes (16): buildSections(), cmdInit(), Contract, Decision, EvidenceItem, GlossaryEntry, InitOptions, InitResult (+8 more)

### Community 67 - "revision.ts"
Cohesion: 0.10
Nodes (24): SECTION_KEYS, PET_CLINIC, SECTION_FILES, tmpDirs, writeSpecDir(), acquireSpecRootLock(), backupPathFor(), breakStaleLock() (+16 more)

### Community 68 - "eval/runner.ts"
Cohesion: 0.09
Nodes (44): BudgetLedger, DecomposedCouncilDeps, runDecomposedCouncil(), measurePromptSizes(), CLASSIFY_RULES, classifyAndProposeSingle(), classifySingle(), CONSTRAINT_FIDELITY (+36 more)

### Community 69 - "snapshot-trust.test.ts"
Cohesion: 0.33
Nodes (9): baseCaps(), FIXTURE_SRC, fixtureGraph(), freshDir(), initPair(), makeTarget(), sha(), tmpDirs (+1 more)

### Community 71 - "run-eval.test.ts"
Cohesion: 0.25
Nodes (7): DEFAULT_REPORT_PATH, LIVE_ENV_VARS, parseArgs(), ParsedArgs, runEvalCli(), FAKE_LIVE_ENV, mockRunEvalAll

### Community 72 - "graph-reader.ts"
Cohesion: 0.10
Nodes (19): ArchitectureViewSchema, buildArchitectureView(), GENERATED_PATTERNS, isGeneratedPath(), fixturePath, loadGraph(), MANIFEST, rawFixture (+11 more)

### Community 73 - "adapter.ts"
Cohesion: 0.05
Nodes (30): BASE, complete(), unresolvedBundle(), BUNDLE_OK(), CLASSIFIER_BLOCK, CLASSIFIER_OK, complete(), et01Bundle() (+22 more)

### Community 74 - "scripts"
Cohesion: 0.22
Nodes (9): scripts, build, lint, prepublishOnly, pretest, smoke:packed, test, test:coverage (+1 more)

### Community 75 - "stdio.ts"
Cohesion: 0.10
Nodes (17): killActiveProcessGroups(), EPIPE_DRAIN_TIMEOUT_MS, EXIT_CLIENT_GONE, EXIT_DRAIN_TIMEOUT, EXIT_OK, jsonRpcError(), MAX_FRAME_BYTES, MAX_IN_FLIGHT (+9 more)

### Community 76 - "compile.test.ts"
Cohesion: 0.29
Nodes (3): FIXTURES, SECTION_FILES, tmpDirs

### Community 80 - "llm/http.test.ts"
Cohesion: 0.29
Nodes (5): FAKE_ENV, FakeEnv, jsonResponse(), okFetch(), PartialFakeEnv

### Community 83 - "legacy-app/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, version

### Community 87 - "llm/plan.ts"
Cohesion: 0.09
Nodes (28): LLM_ROLES, singleRoutePlan(), analyzedProject(), caps(), FIXTURE_SRC, freshDir(), rulePreserve(), sha() (+20 more)

### Community 88 - "commands/trace.test.ts"
Cohesion: 0.10
Nodes (16): cmdTrace(), renderTrace(), compiledBundle(), FIXTURES, SECTION_FILES, tmpDirs, TraceResult, buildTrace() (+8 more)

### Community 92 - "make-bins-executable.js"
Cohesion: 0.50
Nodes (3): BINS, { join }, { readFileSync, chmodSync }

### Community 97 - "packed-install-smoke.sh"
Cohesion: 1.00
Nodes (3): run(), say(), packed-install-smoke.sh script

### Community 99 - "renew.ts"
Cohesion: 0.10
Nodes (45): affectedSync(), analyzeWithFresh(), atomicWrite(), cmdRenewAnalyze(), cmdRenewExport(), cmdRenewInit(), cmdRenewPlan(), cmdRenewRefresh() (+37 more)

### Community 100 - "prepublish-check.js"
Cohesion: 0.29
Nodes (5): describe, pkg, result, { spawnSync }, status

### Community 106 - "files"
Cohesion: 0.33
Nodes (6): files, dist, examples, generated, LICENSE, README.md

### Community 108 - "corpus-lock.ts"
Cohesion: 0.19
Nodes (20): canonicalJson(), computeCorpusHash(), CORPUS_LOCK_VERSION, CorpusLock, CorpusLockEntry, frozenThresholds, loadCorpusLock(), lockCandidates() (+12 more)

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
- **605 isolated node(s):** `name`, `version`, `private`, `packageManager`, `_archival` (+600 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SpecBundle` connect `SpecBundle` to `budget.ts`, `check/runner.ts`, `commands/plan.ts`, `generate-interactive.ts`, `engine.ts`, `planner/plan.ts`, `server/http.ts`, `orchestrator.ts`, `generate.test.ts`, `tasks/index.ts`, `report.ts`, `check.test.ts`, `compileSpecDir`, `review-changes.ts`, `constraint-trace.test.ts`, `generate.ts`, `schemas/index.ts`, `orchestrator.test.ts`, `consent.ts`, `src/clarify/approvals.ts`, `lintBundle`, `commands/plan.test.ts`, `scale-benchmark.test.ts`, `init.ts`, `revision.ts`, `eval/runner.ts`, `adapter.ts`, `compile.test.ts`, `commands/trace.test.ts`?**
  _High betweenness centrality (0.085) - this node is a cross-community bridge._
- **Why does `LlmAdapter` connect `adapter.ts` to `budget.ts`, `tranche5.test.ts`, `generate-interactive.ts`, `ledger.ts`, `server/http.ts`, `orchestrator.ts`, `generate.test.ts`, `report.ts`, `renew/clarify/approvals.ts`, `server.ts`, `generate.ts`, `orchestrator.test.ts`, `openai-compatible.ts`, `egress.test.ts`, `eval/runner.ts`, `snapshot-trust.test.ts`, `llm/plan.ts`, `renew.ts`, `server.test.ts`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Why does `LlmResponse` connect `adapter.ts` to `budget.ts`, `tranche5.test.ts`, `renew.ts`, `snapshot-trust.test.ts`, `generate-interactive.ts`, `orchestrator.test.ts`, `openai-compatible.ts`, `ledger.ts`, `server/http.ts`, `generate.test.ts`, `report.ts`, `server.test.ts`, `llm/plan.ts`, `egress.test.ts`, `renew/clarify/approvals.ts`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `runPipeline()` (e.g. with `.chargeAttempts()` and `.chargeTokens()`) actually correct?**
  _`runPipeline()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _605 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `budget.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09146341463414634 - nodes in this community are weakly interconnected._
- **Should `app.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05217391304347826 - nodes in this community are weakly interconnected._