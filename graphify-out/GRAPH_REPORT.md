# Graph Report - llm_council_orchestrator  (2026-09-02)

## Corpus Check
- 341 files · ~328,854 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2264 nodes · 5961 edges · 115 communities (111 shown, 4 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 16 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0f74f3c2`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- tranche4.test.ts
- app.ts
- pipeline.test.ts
- check/runner.ts
- graphify-adapter.ts
- lifecycle.ts
- commands/plan.test.ts
- live-experiment.ts
- engine.ts
- scale-benchmark.test.ts
- generate.test.ts
- ledger.ts
- generate-interactive.ts
- sign-test.ts
- app-errors.test.ts
- orchestrator.ts
- llm-config.ts
- score.ts
- doctor.ts
- generate.ts
- runPipeline
- compilerOptions
- renew-consent-effectual.test.ts
- session/state.ts
- graph-reader.ts
- providers.ts
- INPUT_CEILINGS
- hash.ts
- version.ts
- adapter.ts
- orders.ts
- schemas.ts
- server.ts
- pipeline.ts
- planner/plan.test.ts
- constraint-trace.test.ts
- budget.ts
- schemas/index.ts
- devDependencies
- fixture-provider.ts
- orchestrator.test.ts
- verifier.ts
- app.test.ts
- l14.ts
- common.ts
- consent.ts
- spec-core/package.json
- src/clarify/approvals.ts
- clarify-trust.test.ts
- change.test.ts
- revision.ts
- package.json
- args.ts
- compile.test.ts
- models.ts
- sha256Content
- check/runner.test.ts
- copy-browser-assets.js
- GraphifyAdapter
- compilerOptions
- workspace-copy.ts
- coverage-hardening.test.ts
- report.ts
- compileSpecDir
- report.test.ts
- check.test.ts
- review-changes.ts
- context/redact.ts
- eval/runner.ts
- paths.ts
- l12.test.ts
- run-eval.test.ts
- strictness.test.ts
- root-invariants.test.ts
- scripts
- stdio.ts
- McpStdioServer
- CodeIntelligenceProvider
- init.ts
- eval/runner.test.ts
- renew/clarify/approvals.ts
- openai-compatible.ts
- tasks/index.ts
- legacy-app/package.json
- context-provider.ts
- check.ts
- server/http.ts
- parseGraphText
- commands/trace.test.ts
- evidence.ts
- acquireSpecRootLock
- snapshot-trust.test.ts
- make-bins-executable.js
- cli.test.ts
- clarify.test.ts
- generate-interactive.test.ts
- check/redact.ts
- packed-install-smoke.sh
- intel-contract.test.ts
- renew.ts
- prepublish-check.js
- cli/index.ts
- llm/provider.ts
- SpecBundle
- llm-config.test.ts
- openai-compatible.test.ts
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
2. `LlmAdapter` - 45 edges
3. `cmdRenewInit()` - 43 edges
4. `runPipeline()` - 43 edges
5. `runCli()` - 42 edges
6. `compileSpecDir()` - 39 edges
7. `lintBundle()` - 39 edges
8. `parseGraphText()` - 35 edges
9. `LlmResponse` - 32 edges
10. `cmdRenewReview()` - 30 edges

## Surprising Connections (you probably didn't know these)
- `compiledBundle()` --calls--> `compileSpecDir()`  [EXTRACTED]
  packages/spec-core/src/cli/commands/plan.test.ts → packages/spec-core/src/compiler/compile.ts
- `rulePreserve()` --calls--> `cmdRenewReview()`  [EXTRACTED]
  packages/spec-core/src/renew/planner-trust.test.ts → packages/spec-core/src/cli/commands/renew.ts
- `compiledBundle()` --calls--> `compileSpecDir()`  [EXTRACTED]
  packages/spec-core/src/cli/commands/trace.test.ts → packages/spec-core/src/compiler/compile.ts
- `ApplyResult` --references--> `SpecBundle`  [EXTRACTED]
  packages/spec-core/src/compiler/changeset.ts → packages/spec-core/src/schemas/index.ts
- `FreezeResult` --references--> `SpecBundle`  [EXTRACTED]
  packages/spec-core/src/compiler/freeze.ts → packages/spec-core/src/schemas/index.ts

## Import Cycles
- 3-file cycle: `packages/spec-core/src/eval/budget.ts -> packages/spec-core/src/eval/llm/http.ts -> packages/spec-core/src/llm/openai-compatible.ts -> packages/spec-core/src/eval/budget.ts`

## Communities (115 total, 4 thin omitted)

### Community 0 - "tranche4.test.ts"
Cohesion: 0.08
Nodes (29): ArchitectureView, parityProjection, ParityStore, buildModernizationPlan(), PlanInputs, PlanOutcome, TaskSeed, BuildStrategyArgs (+21 more)

### Community 1 - "app.ts"
Cohesion: 0.05
Nodes (76): ApiError, applyChanges(), applyRound(), approve(), bootstrapToken(), call(), cancel(), primeSessionId() (+68 more)

### Community 2 - "pipeline.test.ts"
Cohesion: 0.24
Nodes (5): freshDir(), persisted, setupTarget(), sha(), tmpDirs

### Community 3 - "check/runner.ts"
Cohesion: 0.12
Nodes (14): activeProcessGroups, EVIDENCE_FILE_MODE, evidenceRunName(), execCommand(), execInProcessGroup(), ExecutorResult, FORCE_SETTLE_GRACE_MS, GROUP_KILL_GRACE_MS (+6 more)

### Community 4 - "graphify-adapter.ts"
Cohesion: 0.10
Nodes (18): compareTriple(), DEFAULTS, GraphifyAdapterOptions, cleanup, installedVersion, MAX_EXCLUSIVE, MIN_VERSION, parseGraphifyVersion() (+10 more)

### Community 5 - "lifecycle.ts"
Cohesion: 0.08
Nodes (37): compileLintFreeze(), SECTION_PATHS, tmpDirs, applyChangeSet(), ApplyResult, ChangeSetSchema, formatIssues(), cleanLint (+29 more)

### Community 6 - "commands/plan.test.ts"
Cohesion: 0.08
Nodes (21): cmdPlan(), PlanOptions, PlanResult, PlanTask, renderHuman(), renderJson(), compiledBundle(), FIXTURES (+13 more)

### Community 7 - "live-experiment.ts"
Cohesion: 0.14
Nodes (22): aggregateEmitted(), EMITTED_SCHEMA, EmittedOutcome, loadRunDir(), parseEmittedOutcome(), renderAggregation(), baseScore(), BLOCKED (+14 more)

### Community 8 - "engine.ts"
Cohesion: 0.17
Nodes (15): RULES, rule, rule, rule, rule, rule, rule, rule (+7 more)

### Community 9 - "scale-benchmark.test.ts"
Cohesion: 0.17
Nodes (8): ClosureFinding, ClosureFindingCode, closureFindings(), DuplicateTaskId, duplicateTaskIds(), CEILINGS_MS, mkTask(), syntheticBundle()

### Community 10 - "generate.test.ts"
Cohesion: 0.10
Nodes (12): complete(), FAKE_ENV, fetchSpy(), jsonResponse(), PET_CLINIC, PROFILE_CONFIG, SECTION_FILES, SESSION_SERVICE (+4 more)

### Community 11 - "ledger.ts"
Cohesion: 0.11
Nodes (24): RenewalApprovalRecord, addParityEntry(), ApplyApprovalResult, CANONICAL_PARITY_RULINGS, emptyParity(), NewParityEntry, nextParityId(), ParityBlocker (+16 more)

### Community 12 - "generate-interactive.ts"
Cohesion: 0.21
Nodes (14): GenerateOptions, cmdGenerateInteractive(), EVENT_LINES, GenerateInteractiveOptions, GenerateInteractiveResult, openBrowser(), usageLine(), waitForTerminal() (+6 more)

### Community 13 - "sign-test.ts"
Cohesion: 0.15
Nodes (21): Aggregation, ConstraintFailure, calcs(), GateReportInput, renderGateReport(), PipelineVariant, RunScore, binomialCdf() (+13 more)

### Community 14 - "app-errors.test.ts"
Cohesion: 0.33
Nodes (7): ASSETS, baseBundle(), blockedJson(), complete(), fakeLlm(), REAL_FETCH, startWorkspace()

### Community 15 - "orchestrator.ts"
Cohesion: 0.08
Nodes (45): applyEnrichment(), buildEnrichPrompt(), CLARIFY_ENRICH_PROTOCOL, DecisionEnrichment, EnrichedItemSchema, EnrichOutputSchema, EnrichParseResult, MAX_CONTEXT_CHARS (+37 more)

### Community 16 - "llm-config.ts"
Cohesion: 0.12
Nodes (15): RFC-7230, BaseUrlSchema, HeaderNameSchema, LINK_LOCAL_PREFIXES, LlmConfig, LlmConfigSchema, METADATA_HOSTS, OpenRouterRoutingSchema (+7 more)

### Community 17 - "score.ts"
Cohesion: 0.18
Nodes (24): allUnGrounded(), anchorSentences(), checkConstraintTrace(), commitmentSurfaces(), ConstraintFailureCode, containsTerm(), containsWholeTerm(), evaluateCandidate() (+16 more)

### Community 18 - "doctor.ts"
Cohesion: 0.11
Nodes (29): BIN_FILES, BUDGET_ENV, checkBins(), checkBudgetEnv(), checkLlmConfig(), checkLock(), checkMcpFlags(), checkNodeVersion() (+21 more)

### Community 19 - "generate.ts"
Cohesion: 0.16
Nodes (19): buildLlmPlanFromProfile(), checkIntent(), clarificationBlock(), cmdGenerate(), DEFAULT_GENERATE_PROFILE, DEFAULT_GENERATE_VARIANT, GenerateResult, IntentCheck (+11 more)

### Community 20 - "runPipeline"
Cohesion: 0.15
Nodes (19): BudgetLedger, measurePromptSizes(), LlmUsage, CLASSIFY_RULES, classifyAndProposeSingle(), classifySingle(), CONSTRAINT_FIDELITY, intentBlock() (+11 more)

### Community 21 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, esModuleInterop, lib, module, moduleResolution, noEmitOnError, outDir, rootDir (+11 more)

### Community 22 - "renew-consent-effectual.test.ts"
Cohesion: 0.14
Nodes (15): generateOptInFromEnv(), callRenewAnalyze(), callRenewStatus(), FIXTURES, TMP_PIN, tmpDirs, errorResponse(), handleRpcLine() (+7 more)

### Community 23 - "session/state.ts"
Cohesion: 0.33
Nodes (7): CLARIFY_SESSION_STATES, isTerminal(), nextSessionState(), TERMINAL, LEGAL, TransitionRule, TRANSITIONS

### Community 24 - "graph-reader.ts"
Cohesion: 0.11
Nodes (18): ArchitectureViewSchema, GENERATED_PATTERNS, isGeneratedPath(), fixturePath, loadGraph(), MANIFEST, rawFixture, fixturePath (+10 more)

### Community 25 - "providers.ts"
Cohesion: 0.25
Nodes (13): ResolvedRole, createOpenAiCompatibleLlm(), OpenAiCompatibleConfig, ProviderKind, RoutingMode, buildRoleAdapter(), openRouterCost(), RoleCallContext (+5 more)

### Community 26 - "INPUT_CEILINGS"
Cohesion: 0.20
Nodes (6): GlossaryEntrySchema, IntentSchema, validIntent, INPUT_CEILINGS, validManifest, validTask

### Community 27 - "hash.ts"
Cohesion: 0.10
Nodes (27): cmdVerify(), VerifyResult, artifactHashes(), canonicalJson(), canonicalReplacer(), canonicalSectionHash(), FIXTURES, freezeLegacyStyle() (+19 more)

### Community 28 - "version.ts"
Cohesion: 0.36
Nodes (7): checkSpecSchemaVersion(), ParsedVersion, parseVersion(), SPEC_SCHEMA_VERSION, SpecSchemaVersionFieldSchema, SpecSchemaVersionVerdict, SUPPORTED

### Community 29 - "adapter.ts"
Cohesion: 0.09
Nodes (24): ClarifySessionOptions, BUNDLE_OK(), CLASSIFIER_BLOCK, CLASSIFIER_OK, complete(), et01Bundle(), PET_CLINIC, LlmAdapter (+16 more)

### Community 30 - "orders.ts"
Cohesion: 0.22
Nodes (13): checkStock(), decrementStock(), stock, CATALOG, quote(), run(), createOrder(), OrderResult (+5 more)

### Community 31 - "schemas.ts"
Cohesion: 0.10
Nodes (19): AnalysisUsageSchema, AnchorResult, AnchorResultSchema, AnchorScope, AnchorScopeSchema, RECOVERY_CATEGORIES, RecoveryHypothesis, RecoveryHypothesisSchema (+11 more)

### Community 32 - "server.ts"
Cohesion: 0.08
Nodes (24): ChangeSet, parseLlmConfig(), zodIssues(), ExecBoundary, GenerateProfile, GenerateVariant, ARG_SPECS, ArgName (+16 more)

### Community 33 - "pipeline.ts"
Cohesion: 0.18
Nodes (21): stripJsonFences(), ContextBundle, redactSecrets(), RecoveryOutcome, RecoveryRequest, runRecovery(), UsageState, zodIssues() (+13 more)

### Community 34 - "planner/plan.test.ts"
Cohesion: 0.09
Nodes (33): FileManifest, FileManifestEntry, archView, baseInputs(), blastRadius(), fixtureGraphPath, graphParsed, MANIFEST (+25 more)

### Community 35 - "constraint-trace.test.ts"
Cohesion: 0.16
Nodes (14): et07Requirement(), et12Requirement(), failureCodes(), FIXTURES, genericBundleFor(), groundedEt01(), groundedEt02(), groundedEt04() (+6 more)

### Community 36 - "budget.ts"
Cohesion: 0.11
Nodes (24): BudgetCap, BudgetExceededError, BudgetSpentSnapshot, createBudgetLedger(), DEFAULT_WALL_SLACK_MS, MAX_COMPLETIONS, maxCompletions(), ResolvedRunBudget (+16 more)

### Community 37 - "schemas/index.ts"
Cohesion: 0.14
Nodes (12): BAD, BadFixtureExpectation, GOOD, EvidenceIdSchema, SpecBundleForExport, GENERATED_PATH, SpecBundleSchema, validBundle (+4 more)

### Community 38 - "devDependencies"
Cohesion: 0.15
Nodes (13): jsdom, devDependencies, jsdom, @types/node, typescript, vitest, @vitest/coverage-v8, zod-to-json-schema (+5 more)

### Community 39 - "fixture-provider.ts"
Cohesion: 0.14
Nodes (18): StaticGraphProvider, affectedReverse(), godNodes(), graphHealthOf(), shortestPath(), fixturePath, parsed, ParsedGraph (+10 more)

### Community 40 - "orchestrator.test.ts"
Cohesion: 0.27
Nodes (8): MAX_CLARIFY_ROUNDS, atReview(), blockedBundle(), bundle(), complete(), OPTS, scriptedLlm(), sessionWith()

### Community 41 - "verifier.ts"
Cohesion: 0.18
Nodes (10): AnchorBatchResult, AnchorFailureCode, AnchorVerification, canonicalFileHash(), CodeAnchorInput, countLines(), isValidAnchorPath(), tmpDirs (+2 more)

### Community 42 - "app.test.ts"
Cohesion: 0.32
Nodes (6): ASSETS, blocked(), bootApp(), bundle(), settle(), waitFor()

### Community 43 - "l14.ts"
Cohesion: 0.43
Nodes (4): EXPECT_GRAMMAR_DOC, EXPECTED_EXIT_PATTERN, isJudgeableExpect(), rule

### Community 44 - "common.ts"
Cohesion: 0.15
Nodes (17): AssumptionIdSchema, ComplexityProfileSchema, ContractIdSchema, DecisionIdSchema, IdSchema, ImpactLevelSchema, RequirementIdSchema, Sha256Schema (+9 more)

### Community 45 - "consent.ts"
Cohesion: 0.10
Nodes (29): authorizeExecution(), checkPreviewDigest(), consentDigestLine(), EXEC_OPT_IN_ENV, EXEC_ROOT_ENV, ExecAuthorization, execOptInFromEnv(), execRootFromEnv() (+21 more)

### Community 46 - "spec-core/package.json"
Cohesion: 0.22
Nodes (8): description, engines, node, license, main, name, type, version

### Community 47 - "src/clarify/approvals.ts"
Cohesion: 0.19
Nodes (12): AnswerLedgerSchema, answersExportDocument(), APPROVAL_RECORD_SCHEMA_ID, approvalFileName(), ApprovalRecord, ApprovalRecordSchema, ChangeLedgerSchema, InventorySchema (+4 more)

### Community 48 - "clarify-trust.test.ts"
Cohesion: 0.13
Nodes (15): buildRenewalApprovalRecord(), renewalApprovalDigest(), FIXTURE_SRC, freshDir(), graphCaps(), makeTarget(), tmpDirs, applyApprovalToParity() (+7 more)

### Community 49 - "change.test.ts"
Cohesion: 0.22
Nodes (6): FIXTURES, frozenSpecRoot(), inlineBundle(), makeSpecRoot(), SECTION_FILES, tmpDirs

### Community 50 - "revision.ts"
Cohesion: 0.13
Nodes (16): backupPathFor(), createDirAtomically(), DEFAULT_STALE_MS, fsyncDir(), LOCK_FILE, LockHeldError, LockIdentity, LockOptions (+8 more)

### Community 51 - "package.json"
Cohesion: 0.25
Nodes (7): _archival, name, packageManager, private, scripts, test:spec, version

### Community 52 - "args.ts"
Cohesion: 0.15
Nodes (15): Command, COMMANDS, GenerateVariant, InitProfile, parseArgs(), parseRenew(), ParseResult, RENEW_GRAMMAR (+7 more)

### Community 53 - "compile.test.ts"
Cohesion: 0.29
Nodes (3): FIXTURES, SECTION_FILES, tmpDirs

### Community 54 - "models.ts"
Cohesion: 0.15
Nodes (12): BUILTIN_PROVIDERS, cmdModels(), fmt(), MAX_CATALOG_BYTES, ModelCatalogEntry, MODELS_REQUEST_TIMEOUT_MS, ModelsOptions, ModelsResult (+4 more)

### Community 55 - "sha256Content"
Cohesion: 0.24
Nodes (11): buildApprovalRecord(), specIdentity(), canonicalJson(), FAMILY_SECTIONS, projectReview(), ReviewSection, ReviewSegment, segment() (+3 more)

### Community 56 - "check/runner.test.ts"
Cohesion: 0.13
Nodes (7): DEFAULT_TIMEOUT_MS, killActiveProcessGroups(), FakeCall, FIXTURES, PET_CLINIC, tmpDirs, Verification

### Community 57 - "copy-browser-assets.js"
Cohesion: 0.25
Nodes (7): { copyFileSync, mkdirSync, readdirSync, writeFileSync }, files, { join }, MIME, outDir, root, srcDir

### Community 58 - "GraphifyAdapter"
Cohesion: 0.22
Nodes (5): neighborhood(), querySeeds(), GraphifyAdapter, IntelFailure, IntelItems

### Community 59 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck (+7 more)

### Community 60 - "workspace-copy.ts"
Cohesion: 0.16
Nodes (15): DEFAULT_INGEST_LIMITS, DENIED_BASE_PATTERNS, DENIED_DIRS, guardPath(), GuardVerdict, IngestLimits, isDeniedDirectory(), looksBinary() (+7 more)

### Community 61 - "coverage-hardening.test.ts"
Cohesion: 0.12
Nodes (26): FIXTURE_SRC, freshDir(), makeTarget(), tmpDirs, addOverlayRecord(), emptyOverlay(), evaluateOverlayStaleness(), loadOverlay() (+18 more)

### Community 62 - "report.ts"
Cohesion: 0.13
Nodes (24): BadFixtureCapture, groundedBundleFor(), createMockLlm(), MockScript, SCRIPT, BAD, BadFixtureExpectation, buildMockScripts() (+16 more)

### Community 63 - "compileSpecDir"
Cohesion: 0.10
Nodes (25): applyUnderLock(), ChangeResult, cmdChange(), findingLine(), cmdCompile(), compileFailedOutput(), CompileResult, cmdFreeze() (+17 more)

### Community 64 - "report.test.ts"
Cohesion: 0.60
Nodes (4): fixtures15(), liveInput(), passInput(), passRuns()

### Community 65 - "check.test.ts"
Cohesion: 0.19
Nodes (9): parseExpect(), evidenceOf(), evidencePath(), FIXTURES, freshRoot(), initRoot(), makeSpecRoot(), SECTION_FILES (+1 more)

### Community 66 - "review-changes.ts"
Cohesion: 0.17
Nodes (12): changeRequestEvidence, ChangeSetValidation, CLARIFY_REVIEW_CHANGES_PROTOCOL, MAX_CHANGE_INSTRUCTION_CHARS, MAX_CHANGES_PER_SET, ReviewChange, ReviewChangeSchema, ReviewChangeSet (+4 more)

### Community 67 - "context/redact.ts"
Cohesion: 0.31
Nodes (9): credentialAssignmentEnd(), isIdentCont(), isIdentStart(), isInlineSpace(), isValueStop(), redactCredentialAssignments(), RedactionResult, Rule (+1 more)

### Community 68 - "eval/runner.ts"
Cohesion: 0.12
Nodes (33): CouncilTopology, DecomposedCouncilDeps, runDecomposedCouncil(), CLARIFY_RULES, CLASSIFY_RULES, CONSTRAINT_FIDELITY, decomposedClassifier(), decomposedJudge() (+25 more)

### Community 69 - "paths.ts"
Cohesion: 0.19
Nodes (10): checkMcpDir(), ContainedOutputCheck, DisjointRootsCheck, effectiveMcpRoot, McpDirCheck, McpRootSource, PathEscapeError, RenewalPathAuth (+2 more)

### Community 70 - "l12.test.ts"
Cohesion: 0.21
Nodes (8): firstOverlap(), globSegments(), globsOverlap(), rule, segmentsOverlap(), FIXTURES, refMatch(), refPathMatch()

### Community 71 - "run-eval.test.ts"
Cohesion: 0.26
Nodes (8): DEFAULT_REPORT_PATH, LIVE_ENV_VARS, missingLiveEnv(), parseArgs(), ParsedArgs, runEvalCli(), FAKE_LIVE_ENV, mockRunEvalAll

### Community 72 - "strictness.test.ts"
Cohesion: 0.25
Nodes (5): ManifestSchema, validManifest, FIXTURES, validManifest, validTask

### Community 73 - "root-invariants.test.ts"
Cohesion: 0.23
Nodes (12): setRuling(), MAX_RECOVERY_PROMPT_BYTES, FIXTURE_SRC, freshDir(), graphCaps(), groundedResponse(), initProject(), makeTarget() (+4 more)

### Community 74 - "scripts"
Cohesion: 0.22
Nodes (9): scripts, build, lint, prepublishOnly, pretest, smoke:packed, test, test:coverage (+1 more)

### Community 75 - "stdio.ts"
Cohesion: 0.13
Nodes (14): EPIPE_DRAIN_TIMEOUT_MS, EXIT_CLIENT_GONE, EXIT_DRAIN_TIMEOUT, EXIT_OK, MAX_FRAME_BYTES, MAX_IN_FLIGHT, SchedulingPeek, StdioServerLimits (+6 more)

### Community 78 - "init.ts"
Cohesion: 0.14
Nodes (12): Contract, Decision, EvidenceItem, GlossaryEntry, InitOptions, InitResult, Intent, Requirement (+4 more)

### Community 79 - "eval/runner.test.ts"
Cohesion: 0.24
Nodes (7): complete(), counterOnlyUnresolvedBundle(), et01Bundle(), PET_CLINIC, proposalAJson(), unresolvedAddedBundle(), unresolvedPlusLintDirtyBundle()

### Community 80 - "renew/clarify/approvals.ts"
Cohesion: 0.06
Nodes (32): AuthorityFields, BuildRenewalApprovalArgs, nextRenewalApprovalId(), RENEWAL_APPROVAL_DIGEST_VERSION, RenewalApprovalLoad, RenewalApprovalRecordSchema, RenewalDecision, RenewalDecisionSchema (+24 more)

### Community 81 - "openai-compatible.ts"
Cohesion: 0.24
Nodes (8): LlmCompleteOptions, ChatResponse, CostExtractor, parseSuccess(), extractProvenance(), extractUsageDetails(), HTTP_BACKOFF_SCHEDULE_MS, isPlainObject()

### Community 82 - "tasks/index.ts"
Cohesion: 0.07
Nodes (16): FIXTURES, genericBundleFor(), loadFixture(), U, complete(), et01Bundle(), PET_CLINIC, PET_CLINIC (+8 more)

### Community 83 - "legacy-app/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, version

### Community 84 - "context-provider.ts"
Cohesion: 0.11
Nodes (19): ContextBundleSchema, ContextItem, ContextItemSchema, ContextLimits, RENEW_CONTEXT_LIMITS, AnalysisScope, ContextProvider, GraphContextProvider (+11 more)

### Community 85 - "check.ts"
Cohesion: 0.29
Nodes (9): CheckOutcome, Executor, runChecks(), tail(), CheckOptions, CheckResult, cmdCheck(), expectedActual() (+1 more)

### Community 86 - "server/http.ts"
Cohesion: 0.09
Nodes (15): ClarifySession, ApplyRoundRequestSchema, ApproveRequestSchema, CancelRequestSchema, ClarificationAnswerApiSchema, ClarifyServerHandle, ClarifyServerOptions, CSP (+7 more)

### Community 87 - "parseGraphText"
Cohesion: 0.08
Nodes (30): initProject(), caps(), parseGraphText(), FIXTURE_SRC, freshDir(), graphCaps(), initializedPair(), makeTarget() (+22 more)

### Community 88 - "commands/trace.test.ts"
Cohesion: 0.10
Nodes (16): cmdTrace(), renderTrace(), compiledBundle(), FIXTURES, SECTION_FILES, tmpDirs, TraceResult, buildTrace() (+8 more)

### Community 89 - "evidence.ts"
Cohesion: 0.36
Nodes (5): codeAnchorItem, CodeAnchorPayloadSchema, evidenceCommon, EvidenceItemSchema, validEvidence

### Community 90 - "acquireSpecRootLock"
Cohesion: 0.17
Nodes (13): buildSections(), cmdInit(), pathExists(), SECTION_KEYS, PET_CLINIC, SECTION_FILES, tmpDirs, writeSpecDir() (+5 more)

### Community 91 - "snapshot-trust.test.ts"
Cohesion: 0.33
Nodes (9): baseCaps(), FIXTURE_SRC, fixtureGraph(), freshDir(), initPair(), makeTarget(), sha(), tmpDirs (+1 more)

### Community 92 - "make-bins-executable.js"
Cohesion: 0.50
Nodes (3): BINS, { join }, { readFileSync, chmodSync }

### Community 93 - "cli.test.ts"
Cohesion: 0.22
Nodes (3): FIXTURES, SECTION_FILES, tmpDirs

### Community 94 - "clarify.test.ts"
Cohesion: 0.22
Nodes (6): AnswersParseResult, MAX_ANSWER_CHARS, MAX_ANSWERS, BASE, complete(), unresolvedBundle()

### Community 95 - "generate-interactive.test.ts"
Cohesion: 0.32
Nodes (6): ASSETS, blocked(), bundle(), fakeLlm(), Ready, run()

### Community 96 - "check/redact.ts"
Cohesion: 0.47
Nodes (4): REDACTION_RULES, RedactionRule, redactSecrets(), SecretKind

### Community 97 - "packed-install-smoke.sh"
Cohesion: 1.00
Nodes (3): run(), say(), packed-install-smoke.sh script

### Community 98 - "intel-contract.test.ts"
Cohesion: 0.32
Nodes (5): FIXTURE_SRC, freshDir(), graphWorkspace(), readFileFixture(), tmpDirs

### Community 99 - "renew.ts"
Cohesion: 0.09
Nodes (54): affectedSync(), analyzeWithFresh(), atomicWrite(), cmdRenewAnalyze(), cmdRenewExport(), cmdRenewInit(), cmdRenewPlan(), cmdRenewRefresh() (+46 more)

### Community 100 - "prepublish-check.js"
Cohesion: 0.29
Nodes (5): describe, pkg, result, { spawnSync }, status

### Community 101 - "cli/index.ts"
Cohesion: 0.21
Nodes (14): commandHelp(), parseEnginesFloor(), normalizeFileIntent(), readBudgetEnv(), readEnginesFloor(), readVersion(), runCli(), resolveProfile() (+6 more)

### Community 102 - "llm/provider.ts"
Cohesion: 0.70
Nodes (3): OPENROUTER_DEFAULT_BASE_URL, PROVIDER_KINDS, ROUTELLM_DEFAULT_BASE_URL

### Community 103 - "SpecBundle"
Cohesion: 0.06
Nodes (20): cmdLint(), LintResult, CompileResult, BAD, BadFixtureExpectation, FIXTURES, GOOD, lintBundle() (+12 more)

### Community 105 - "openai-compatible.test.ts"
Cohesion: 0.83
Nodes (3): baseConfig(), jsonResponse(), okBody()

### Community 106 - "files"
Cohesion: 0.33
Nodes (6): files, dist, examples, generated, LICENSE, README.md

### Community 108 - "corpus-lock.ts"
Cohesion: 0.22
Nodes (17): canonicalJson(), computeCorpusHash(), CORPUS_LOCK_VERSION, CorpusLock, CorpusLockEntry, frozenThresholds, loadCorpusLock(), lockCandidates() (+9 more)

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
- **623 isolated node(s):** `name`, `version`, `private`, `packageManager`, `_archival` (+618 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SpecBundle` connect `SpecBundle` to `tranche4.test.ts`, `check/runner.ts`, `lifecycle.ts`, `commands/plan.test.ts`, `engine.ts`, `scale-benchmark.test.ts`, `generate.test.ts`, `orchestrator.ts`, `score.ts`, `generate.ts`, `hash.ts`, `adapter.ts`, `constraint-trace.test.ts`, `budget.ts`, `schemas/index.ts`, `orchestrator.test.ts`, `app.test.ts`, `l14.ts`, `consent.ts`, `src/clarify/approvals.ts`, `compile.test.ts`, `sha256Content`, `check/runner.test.ts`, `report.ts`, `compileSpecDir`, `review-changes.ts`, `eval/runner.ts`, `l12.test.ts`, `eval/runner.test.ts`, `tasks/index.ts`, `check.ts`, `server/http.ts`, `commands/trace.test.ts`, `acquireSpecRootLock`, `clarify.test.ts`, `generate-interactive.test.ts`?**
  _High betweenness centrality (0.084) - this node is a cross-community bridge._
- **Why does `LlmAdapter` connect `adapter.ts` to `pipeline.test.ts`, `generate.test.ts`, `generate-interactive.ts`, `app-errors.test.ts`, `orchestrator.ts`, `generate.ts`, `providers.ts`, `server.ts`, `budget.ts`, `orchestrator.test.ts`, `app.test.ts`, `clarify-trust.test.ts`, `report.ts`, `eval/runner.ts`, `root-invariants.test.ts`, `eval/runner.test.ts`, `openai-compatible.ts`, `tasks/index.ts`, `context-provider.ts`, `server/http.ts`, `parseGraphText`, `snapshot-trust.test.ts`, `clarify.test.ts`, `generate-interactive.test.ts`, `renew.ts`, `server.test.ts`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Why does `LlmResponse` connect `adapter.ts` to `pipeline.test.ts`, `generate.test.ts`, `app-errors.test.ts`, `budget.ts`, `orchestrator.test.ts`, `app.test.ts`, `clarify-trust.test.ts`, `report.ts`, `root-invariants.test.ts`, `eval/runner.test.ts`, `openai-compatible.ts`, `tasks/index.ts`, `context-provider.ts`, `server/http.ts`, `parseGraphText`, `snapshot-trust.test.ts`, `clarify.test.ts`, `generate-interactive.test.ts`, `renew.ts`, `server.test.ts`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `runPipeline()` (e.g. with `.chargeAttempts()` and `.chargeTokens()`) actually correct?**
  _`runPipeline()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _623 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `tranche4.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07751937984496124 - nodes in this community are weakly interconnected._
- **Should `app.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05217391304347826 - nodes in this community are weakly interconnected._