# Graph Report - llm_council_orchestrator  (2026-09-03)

## Corpus Check
- 373 files · ~360,797 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2476 nodes · 6646 edges · 109 communities (106 shown, 3 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 19 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0a5cee79`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- trust/state.ts
- app.ts
- pipeline.test.ts
- check/runner.ts
- GraphifyAdapter
- lifecycle.ts
- commands/plan.ts
- live-experiment.ts
- engine.ts
- compiler/compile.ts
- generate.test.ts
- coverage-hardening.test.ts
- manifest.json
- aggregate.ts
- app-errors.test.ts
- orchestrator.ts
- llm-config.ts
- score.ts
- doctor.ts
- generate.ts
- eval/runner.ts
- compilerOptions
- fs.ts
- intent-fidelity.test.ts
- BudgetLedger
- providers.ts
- commands/plan.test.ts
- hash.ts
- version.ts
- council.test.ts
- orders.ts
- schemas.ts
- server.ts
- pipeline.ts
- snapshot.ts
- constraint-trace.test.ts
- budget.ts
- SpecBundleSchema
- devDependencies
- graph-reader.ts
- orchestrator.test.ts
- verifier.ts
- app.test.ts
- TaskContract
- schemas/index.ts
- consent.ts
- spec-core/package.json
- sha256Content
- composition.test.ts
- change.test.ts
- revision.ts
- package.json
- args.ts
- paid.ts
- models.ts
- trust/evidence.ts
- GraphContextProvider
- copy-browser-assets.js
- isolation.test.ts
- compilerOptions
- workspace-copy.ts
- overlay.ts
- report.ts
- compileSpecDir
- runner-roles.test.ts
- init.ts
- review-changes.ts
- context/redact.ts
- prompts-v4.ts
- paths.ts
- l12.test.ts
- run-eval.test.ts
- ClarifySession
- root-invariants.test.ts
- scripts
- stdio.ts
- init-concurrency.test.ts
- architecture.test.ts
- RenewalRoundDriver
- eval/runner.test.ts
- distiller.ts
- openai-compatible.ts
- tasks/index.ts
- legacy-app/package.json
- context-provider.test.ts
- l08.test.ts
- generate-interactive.ts
- adapter.ts
- commands/trace.test.ts
- snapshot-trust.test.ts
- make-bins-executable.js
- cli.test.ts
- model.ts
- packed-install-smoke.sh
- renew.ts
- prepublish-check.js
- cli/index.ts
- llm/provider.ts
- SpecBundle
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
2. `cmdRenewInit()` - 55 edges
3. `LlmAdapter` - 50 edges
4. `parseGraphText()` - 45 edges
5. `runCli()` - 44 edges
6. `runPipeline()` - 43 edges
7. `compileSpecDir()` - 39 edges
8. `lintBundle()` - 39 edges
9. `sha256Content()` - 39 edges
10. `LlmResponse` - 35 edges

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

## Communities (109 total, 3 thin omitted)

### Community 0 - "trust/state.ts"
Cohesion: 0.11
Nodes (27): ArchitectureView, OverlayStore, ParityStore, PlanInputs, PlanOutcome, TaskSeed, BuildStrategyArgs, buildStrategyDecision() (+19 more)

### Community 1 - "app.ts"
Cohesion: 0.05
Nodes (76): ApiError, applyChanges(), applyRound(), approve(), bootstrapToken(), call(), cancel(), primeSessionId() (+68 more)

### Community 2 - "pipeline.test.ts"
Cohesion: 0.21
Nodes (10): depsFor(), freshDir(), makeBundle(), persisted, recordsFor(), setupTarget(), sha(), tmpDirs (+2 more)

### Community 3 - "check/runner.ts"
Cohesion: 0.06
Nodes (35): parseExpect(), REDACTION_RULES, RedactionRule, redactSecrets(), SecretKind, activeProcessGroups, CheckOutcome, DEFAULT_TIMEOUT_MS (+27 more)

### Community 4 - "GraphifyAdapter"
Cohesion: 0.05
Nodes (23): compareTriple(), GraphifyAdapter, GraphifyAdapterOptions, cleanup, installedVersion, parseGraphifyVersion(), tail(), fixtureGraphText (+15 more)

### Community 5 - "lifecycle.ts"
Cohesion: 0.12
Nodes (24): applyChangeSet(), ApplyResult, ChangeSetSchema, formatIssues(), checkTransition(), FREEZE_REFUSAL_HINTS, LIFECYCLE_STATES, LIFECYCLE_TRANSITIONS (+16 more)

### Community 6 - "commands/plan.ts"
Cohesion: 0.13
Nodes (17): cmdPlan(), PlanOptions, PlanResult, PlanTask, renderHuman(), renderJson(), TopoResult, topoSort() (+9 more)

### Community 7 - "live-experiment.ts"
Cohesion: 0.14
Nodes (19): aggregateEmitted(), EMITTED_SCHEMA, EmittedOutcome, loadRunDir(), parseEmittedOutcome(), renderAggregation(), baseScore(), BLOCKED (+11 more)

### Community 8 - "engine.ts"
Cohesion: 0.15
Nodes (17): BAD, BadFixtureExpectation, RULES, rule, rule, rule, rule, rule (+9 more)

### Community 9 - "compiler/compile.ts"
Cohesion: 0.10
Nodes (14): ClosureFinding, ClosureFindingCode, closureFindings(), DuplicateTaskId, duplicateTaskIds(), CompileResult, REQUIRED_SECTIONS, SectionName (+6 more)

### Community 10 - "generate.test.ts"
Cohesion: 0.10
Nodes (12): complete(), FAKE_ENV, fetchSpy(), jsonResponse(), PET_CLINIC, PROFILE_CONFIG, SECTION_FILES, SESSION_SERVICE (+4 more)

### Community 11 - "coverage-hardening.test.ts"
Cohesion: 0.05
Nodes (61): emptyOverlay, makeSession(), uncertaintyAnalysis(), FIXTURE_SRC, freshDir(), loadParityFile(), makeTarget(), tmpDirs (+53 more)

### Community 12 - "manifest.json"
Cohesion: 0.07
Nodes (28): artifact_hashes, assumptions, contracts, decisions, evidence, glossary, intent, requirements (+20 more)

### Community 13 - "aggregate.ts"
Cohesion: 0.15
Nodes (23): Aggregation, VariantCost, calcs(), GateCalcs, GateReportInput, gateVerdict, renderGateReport(), PipelineVariant (+15 more)

### Community 14 - "app-errors.test.ts"
Cohesion: 0.33
Nodes (7): ASSETS, baseBundle(), blockedJson(), complete(), fakeLlm(), REAL_FETCH, startWorkspace()

### Community 15 - "orchestrator.ts"
Cohesion: 0.10
Nodes (35): applyEnrichment(), buildEnrichPrompt(), CLARIFY_ENRICH_PROTOCOL, DecisionEnrichment, EnrichedItemSchema, EnrichOutputSchema, EnrichParseResult, MAX_CONTEXT_CHARS (+27 more)

### Community 16 - "llm-config.ts"
Cohesion: 0.09
Nodes (20): RFC-7230, BaseUrlSchema, HeaderNameSchema, LINK_LOCAL_PREFIXES, LlmConfig, LlmConfigSchema, METADATA_HOSTS, OpenRouterRoutingSchema (+12 more)

### Community 17 - "score.ts"
Cohesion: 0.18
Nodes (24): allUnGrounded(), anchorSentences(), checkConstraintTrace(), commitmentSurfaces(), ConstraintFailure, ConstraintFailureCode, containsTerm(), containsWholeTerm() (+16 more)

### Community 18 - "doctor.ts"
Cohesion: 0.11
Nodes (29): BIN_FILES, BUDGET_ENV, checkBins(), checkBudgetEnv(), checkLlmConfig(), checkLock(), checkMcpFlags(), checkNodeVersion() (+21 more)

### Community 19 - "generate.ts"
Cohesion: 0.16
Nodes (20): checkIntent(), clarificationBlock(), cmdGenerate(), DEFAULT_GENERATE_PROFILE, GenerateOptions, GenerateResult, IntentCheck, lintReason() (+12 more)

### Community 20 - "eval/runner.ts"
Cohesion: 0.13
Nodes (30): computeCostEnvelope(), CostEnvelope, measurePromptSizes(), PromptSize, renderCostEnvelopeTable(), VariantEnvelope, CLASSIFY_RULES, classifyAndProposeSingle() (+22 more)

### Community 21 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, esModuleInterop, lib, module, moduleResolution, noEmitOnError, outDir, rootDir (+11 more)

### Community 22 - "fs.ts"
Cohesion: 0.17
Nodes (16): isTrustError(), TrustFsError, authorizedCreateDirAtomically(), authorizedCreateExclusive(), authorizedEnsureDir(), authorizedRemoveTree(), authorizedRenameNoClobber(), authorizedStat() (+8 more)

### Community 23 - "intent-fidelity.test.ts"
Cohesion: 0.17
Nodes (9): FIXTURES, genericBundleFor(), loadFixture(), U, createMockLlm(), MockScript, SCRIPT, MockEvalScripts (+1 more)

### Community 24 - "BudgetLedger"
Cohesion: 0.17
Nodes (6): ClarifySessionOptions, BudgetLedger, LlmUsage, LlmPlan, RecoveryDeps, PaidOperation

### Community 25 - "providers.ts"
Cohesion: 0.23
Nodes (14): buildLlmPlanFromProfile(), ResolvedRole, createOpenAiCompatibleLlm(), OpenAiCompatibleConfig, ProviderKind, RoutingMode, buildRoleAdapter(), openRouterCost() (+6 more)

### Community 26 - "commands/plan.test.ts"
Cohesion: 0.17
Nodes (4): compiledBundle(), FIXTURES, SECTION_FILES, tmpDirs

### Community 27 - "hash.ts"
Cohesion: 0.10
Nodes (25): artifactHashes(), canonicalSectionHash(), FIXTURES, freezeLegacyStyle(), HASHED_KEYS, makeSpecRoot(), PRE_RENEWAL_FIXTURE, rotateKeys() (+17 more)

### Community 28 - "version.ts"
Cohesion: 0.36
Nodes (7): checkSpecSchemaVersion(), ParsedVersion, parseVersion(), SPEC_SCHEMA_VERSION, SpecSchemaVersionFieldSchema, SpecSchemaVersionVerdict, SUPPORTED

### Community 29 - "council.test.ts"
Cohesion: 0.28
Nodes (6): BUNDLE_OK(), CLASSIFIER_BLOCK, CLASSIFIER_OK, complete(), et01Bundle(), PET_CLINIC

### Community 30 - "orders.ts"
Cohesion: 0.22
Nodes (13): checkStock(), decrementStock(), stock, CATALOG, quote(), run(), createOrder(), OrderResult (+5 more)

### Community 31 - "schemas.ts"
Cohesion: 0.10
Nodes (19): AnalysisUsageSchema, AnchorResult, AnchorResultSchema, AnchorScope, AnchorScopeSchema, RECOVERY_CATEGORIES, RecoveryHypothesis, RecoveryHypothesisSchema (+11 more)

### Community 32 - "server.ts"
Cohesion: 0.07
Nodes (34): ExecBoundary, generateOptInFromEnv(), GenerateProfile, GenerateVariant, callRenewAnalyze(), callRenewStatus(), FIXTURES, TMP_PIN (+26 more)

### Community 33 - "pipeline.ts"
Cohesion: 0.16
Nodes (22): redactSecrets(), MAX_RECOVERY_PROMPT_BYTES, RecoveryOutcome, RecoveryRequest, runRecovery(), UsageState, zodIssues(), buildRecoveryPrompt() (+14 more)

### Community 34 - "snapshot.ts"
Cohesion: 0.10
Nodes (25): FileManifest, FileManifestEntry, boundPaths(), createSnapshot(), deriveSnapshotId(), evaluateStaleness(), identityPayload(), ProjectSnapshotSchema (+17 more)

### Community 35 - "constraint-trace.test.ts"
Cohesion: 0.18
Nodes (13): et07Requirement(), et12Requirement(), failureCodes(), FIXTURES, genericBundleFor(), groundedEt01(), groundedEt02(), groundedEt04() (+5 more)

### Community 36 - "budget.ts"
Cohesion: 0.12
Nodes (18): BudgetCap, BudgetExceededError, BudgetSpentSnapshot, DEFAULT_WALL_SLACK_MS, MAX_COMPLETIONS, maxCompletions(), ResolvedRunBudget, resolveRunBudget() (+10 more)

### Community 37 - "SpecBundleSchema"
Cohesion: 0.12
Nodes (9): GOOD, SpecBundleForExport, GENERATED_PATH, SpecBundleSchema, validManifest, validTask, FIXTURES, validManifest (+1 more)

### Community 38 - "devDependencies"
Cohesion: 0.15
Nodes (13): jsdom, devDependencies, jsdom, @types/node, typescript, vitest, @vitest/coverage-v8, zod-to-json-schema (+5 more)

### Community 39 - "graph-reader.ts"
Cohesion: 0.07
Nodes (45): ArchitectureViewSchema, buildArchitectureView(), GENERATED_PATTERNS, isGeneratedPath(), fixturePath, loadGraph(), MANIFEST, rawFixture (+37 more)

### Community 40 - "orchestrator.test.ts"
Cohesion: 0.27
Nodes (8): MAX_CLARIFY_ROUNDS, atReview(), blockedBundle(), bundle(), complete(), OPTS, scriptedLlm(), sessionWith()

### Community 41 - "verifier.ts"
Cohesion: 0.18
Nodes (11): AnchorBatchResult, AnchorFailureCode, AnchorVerification, canonicalFileHash(), CodeAnchorInput, countLines(), isValidAnchorPath(), tmpDirs (+3 more)

### Community 42 - "app.test.ts"
Cohesion: 0.32
Nodes (6): ASSETS, blocked(), bootApp(), bundle(), settle(), waitFor()

### Community 43 - "TaskContract"
Cohesion: 0.24
Nodes (6): EXPECT_GRAMMAR_DOC, EXPECTED_EXIT_PATTERN, isJudgeableExpect(), ChangeSet, rule, TaskContract

### Community 44 - "schemas/index.ts"
Cohesion: 0.08
Nodes (37): parityProjection, AssumptionIdSchema, ComplexityProfileSchema, ContractIdSchema, DecisionIdSchema, EvidenceIdSchema, IdSchema, ImpactLevelSchema (+29 more)

### Community 45 - "consent.ts"
Cohesion: 0.11
Nodes (28): authorizeExecution(), checkPreviewDigest(), consentDigestLine(), EXEC_OPT_IN_ENV, EXEC_ROOT_ENV, ExecAuthorization, execOptInFromEnv(), execRootFromEnv() (+20 more)

### Community 46 - "spec-core/package.json"
Cohesion: 0.22
Nodes (8): description, engines, node, license, main, name, type, version

### Community 47 - "sha256Content"
Cohesion: 0.11
Nodes (27): AnswerLedgerSchema, answersExportDocument(), APPROVAL_RECORD_SCHEMA_ID, approvalFileName(), ApprovalRecord, ApprovalRecordSchema, buildApprovalRecord(), ChangeLedgerSchema (+19 more)

### Community 48 - "composition.test.ts"
Cohesion: 0.06
Nodes (43): loadRenewalApproval(), nextRenewalApprovalId(), RenewalApprovalLoad, RenewalDecisionSet, RenewalDecisionSetSchema, payload, tmpDirs, WriteApprovalResult (+35 more)

### Community 49 - "change.test.ts"
Cohesion: 0.22
Nodes (6): FIXTURES, frozenSpecRoot(), inlineBundle(), makeSpecRoot(), SECTION_FILES, tmpDirs

### Community 50 - "revision.ts"
Cohesion: 0.09
Nodes (26): SECTION_KEYS, stageSpecDir(), PET_CLINIC, SECTION_FILES, tmpDirs, writeSpecDir(), assertNotSymlink(), acquireSpecRootLock() (+18 more)

### Community 51 - "package.json"
Cohesion: 0.25
Nodes (7): _archival, name, packageManager, private, scripts, test:spec, version

### Community 52 - "args.ts"
Cohesion: 0.12
Nodes (18): Command, COMMANDS, GenerateVariant, InitProfile, parseArgs(), parseRenew(), ParseResult, RENEW_GRAMMAR (+10 more)

### Community 53 - "paid.ts"
Cohesion: 0.26
Nodes (6): TrustPaidError, createPaidOperation(), MAX_RECOVERY_WIRE_BYTES, ResolvedPaidRoute, resolvedRouteDigest(), resolveLegacyEnvRoute()

### Community 54 - "models.ts"
Cohesion: 0.15
Nodes (12): BUILTIN_PROVIDERS, cmdModels(), fmt(), MAX_CATALOG_BYTES, ModelCatalogEntry, MODELS_REQUEST_TIMEOUT_MS, ModelsOptions, ModelsResult (+4 more)

### Community 55 - "trust/evidence.ts"
Cohesion: 0.20
Nodes (10): assertSupportPolicy(), CitationClaim, CitationClaimSchema, ContextRecord, EvidenceRole, ResolvedCitation, SupportStatus, SupportStatusSchema (+2 more)

### Community 56 - "GraphContextProvider"
Cohesion: 0.29
Nodes (4): ContextItem, ContextProvider, GraphContextProvider, parseLoc()

### Community 57 - "copy-browser-assets.js"
Cohesion: 0.25
Nodes (7): { copyFileSync, mkdirSync, readdirSync, writeFileSync }, files, { join }, MIME, outDir, root, srcDir

### Community 58 - "isolation.test.ts"
Cohesion: 0.39
Nodes (6): FIXTURE_SRC, freshDir(), graphCaps(), initializedPair(), makeTarget(), tmpDirs

### Community 59 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck (+7 more)

### Community 60 - "workspace-copy.ts"
Cohesion: 0.15
Nodes (16): DEFAULT_INGEST_LIMITS, DENIED_BASE_PATTERNS, DENIED_DIRS, guardPath(), GuardVerdict, IngestLimits, isDeniedDirectory(), looksBinary() (+8 more)

### Community 61 - "overlay.ts"
Cohesion: 0.13
Nodes (21): loadOverlayFile(), addOverlayRecord(), markSuperseded(), NewOverlayRecord, nextOverlayId(), OVERLAY_RELATIONS, OverlayEntityRefSchema, OverlayLoad (+13 more)

### Community 62 - "report.ts"
Cohesion: 0.13
Nodes (24): BadFixtureCapture, groundedBundleFor(), BAD, BadFixtureExpectation, buildMockScripts(), deriveBundle(), EvalEvidence, finishEvidence() (+16 more)

### Community 63 - "compileSpecDir"
Cohesion: 0.14
Nodes (23): applyUnderLock(), ChangeResult, findingLine(), cmdCompile(), compileFailedOutput(), CompileResult, cmdFreeze(), FreezeResult (+15 more)

### Community 64 - "runner-roles.test.ts"
Cohesion: 0.33
Nodes (3): complete(), et01Bundle(), PET_CLINIC

### Community 65 - "init.ts"
Cohesion: 0.09
Nodes (23): evidenceOf(), evidencePath(), FIXTURES, freshRoot(), initRoot(), makeSpecRoot(), SECTION_FILES, tmpDirs (+15 more)

### Community 66 - "review-changes.ts"
Cohesion: 0.17
Nodes (11): ChangeSetValidation, CLARIFY_REVIEW_CHANGES_PROTOCOL, MAX_CHANGE_INSTRUCTION_CHARS, MAX_CHANGES_PER_SET, ReviewChange, ReviewChangeSchema, ReviewChangeSet, ReviewChangeSetSchema (+3 more)

### Community 67 - "context/redact.ts"
Cohesion: 0.31
Nodes (9): credentialAssignmentEnd(), isIdentCont(), isIdentStart(), isInlineSpace(), isValueStop(), redactCredentialAssignments(), RedactionResult, Rule (+1 more)

### Community 68 - "prompts-v4.ts"
Cohesion: 0.14
Nodes (25): DecomposedCouncilDeps, runDecomposedCouncil(), CLARIFY_RULES, CLASSIFY_RULES, CONSTRAINT_FIDELITY, decomposedClassifier(), decomposedJudge(), decomposedJudgeAlone() (+17 more)

### Community 69 - "paths.ts"
Cohesion: 0.17
Nodes (20): transitiveRenewalRootCheck(), refuseIfInsideTarget(), assertDisjointRealRoots(), assertNoSymlinkBelow(), authorizeRenewalPaths(), checkMcpDir(), ContainedOutputCheck, DisjointRootsCheck (+12 more)

### Community 70 - "l12.test.ts"
Cohesion: 0.21
Nodes (8): firstOverlap(), globSegments(), globsOverlap(), rule, segmentsOverlap(), FIXTURES, refMatch(), refPathMatch()

### Community 71 - "run-eval.test.ts"
Cohesion: 0.26
Nodes (8): DEFAULT_REPORT_PATH, LIVE_ENV_VARS, missingLiveEnv(), parseArgs(), ParsedArgs, runEvalCli(), FAKE_LIVE_ENV, mockRunEvalAll

### Community 73 - "root-invariants.test.ts"
Cohesion: 0.22
Nodes (13): build(), ctxWindow(), FIXTURE_SRC, freshDir(), graphCaps(), groundedResponse(), initProject(), interiorCitation() (+5 more)

### Community 74 - "scripts"
Cohesion: 0.22
Nodes (9): scripts, build, lint, prepublishOnly, pretest, smoke:packed, test, test:coverage (+1 more)

### Community 75 - "stdio.ts"
Cohesion: 0.11
Nodes (18): isJsonRpcId(), EPIPE_DRAIN_TIMEOUT_MS, EXIT_CLIENT_GONE, EXIT_DRAIN_TIMEOUT, EXIT_OK, jsonRpcError(), MAX_FRAME_BYTES, MAX_IN_FLIGHT (+10 more)

### Community 76 - "init-concurrency.test.ts"
Cohesion: 0.33
Nodes (4): ChildOutcome, CLI_JS, SECTION_FILES, tmpDirs

### Community 77 - "architecture.test.ts"
Cohesion: 0.47
Nodes (5): PKG, productionFiles(), REL(), renewalSurface(), WRITE_PRIMITIVES

### Community 79 - "eval/runner.test.ts"
Cohesion: 0.14
Nodes (11): BASE, complete(), unresolvedBundle(), complete(), counterOnlyUnresolvedBundle(), et01Bundle(), PET_CLINIC, proposalAJson() (+3 more)

### Community 80 - "distiller.ts"
Cohesion: 0.18
Nodes (11): DistillerInputs, distillRenewalQuestions(), evidenceOf(), makeRenewalDriver(), RENEWAL_CLAIM_ID, STRATEGY_CLAIM_ID, STRATEGY_OPTIONS, strategyQuestion() (+3 more)

### Community 81 - "openai-compatible.ts"
Cohesion: 0.24
Nodes (8): LlmCompleteOptions, ChatResponse, CostExtractor, parseSuccess(), extractProvenance(), extractUsageDetails(), HTTP_BACKOFF_SCHEDULE_MS, isPlainObject()

### Community 82 - "tasks/index.ts"
Cohesion: 0.13
Nodes (9): PET_CLINIC, U, DeterministicAssertion, EVAL_TASKS, EvalTask, EvalTaskKind, IntentConstraint, NumericOperator (+1 more)

### Community 83 - "legacy-app/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, version

### Community 84 - "context-provider.test.ts"
Cohesion: 0.22
Nodes (8): ContextBundleSchema, SliceReader, FILES, fixturePath, makeProvider(), manifest, parsed, reader()

### Community 85 - "l08.test.ts"
Cohesion: 0.67
Nodes (3): FIXTURES, inState(), loadBundle()

### Community 86 - "generate-interactive.ts"
Cohesion: 0.07
Nodes (34): sessionLedgerEnvelope(), cmdGenerateInteractive(), EVENT_LINES, GenerateInteractiveOptions, GenerateInteractiveResult, openBrowser(), ASSETS, blocked() (+26 more)

### Community 87 - "adapter.ts"
Cohesion: 0.04
Nodes (67): cmdRenewAnalyze(), LlmAdapter, LlmResponse, LLM_ROLES, LlmRoute, singleRoutePlan(), LlmProvenance, LlmUsageDetails (+59 more)

### Community 88 - "commands/trace.test.ts"
Cohesion: 0.10
Nodes (16): cmdTrace(), renderTrace(), compiledBundle(), FIXTURES, SECTION_FILES, tmpDirs, TraceResult, buildTrace() (+8 more)

### Community 91 - "snapshot-trust.test.ts"
Cohesion: 0.27
Nodes (10): baseCaps(), ctxWindow(), FIXTURE_SRC, fixtureGraph(), freshDir(), initPair(), interiorCitation(), makeTarget() (+2 more)

### Community 92 - "make-bins-executable.js"
Cohesion: 0.50
Nodes (3): BINS, { join }, { readFileSync, chmodSync }

### Community 93 - "cli.test.ts"
Cohesion: 0.22
Nodes (3): FIXTURES, SECTION_FILES, tmpDirs

### Community 94 - "model.ts"
Cohesion: 0.13
Nodes (19): AnswerCheck, applyAnswersToRecords(), ApplyResult, attachStatuses(), ClarificationAnswer, ClarificationOptionView, DecisionRecord, DecisionRecords (+11 more)

### Community 97 - "packed-install-smoke.sh"
Cohesion: 1.00
Nodes (3): run(), say(), packed-install-smoke.sh script

### Community 99 - "renew.ts"
Cohesion: 0.09
Nodes (55): affectedSync(), analyzeWithFresh(), cmdRenewExport(), cmdRenewInit(), cmdRenewPlan(), cmdRenewRefresh(), cmdRenewReview(), cmdRenewStatus() (+47 more)

### Community 100 - "prepublish-check.js"
Cohesion: 0.29
Nodes (5): describe, pkg, result, { spawnSync }, status

### Community 101 - "cli/index.ts"
Cohesion: 0.22
Nodes (13): commandHelp(), cmdChange(), parseEnginesFloor(), readBudgetEnv(), readEnginesFloor(), readVersion(), runCli(), FIXTURE_SRC (+5 more)

### Community 102 - "llm/provider.ts"
Cohesion: 0.70
Nodes (3): OPENROUTER_DEFAULT_BASE_URL, PROVIDER_KINDS, ROUTELLM_DEFAULT_BASE_URL

### Community 103 - "SpecBundle"
Cohesion: 0.05
Nodes (29): cleanLint, FIXTURES, freeze(), FreezeResult, cleanLint, FIXTURES, frozenPetClinic(), inState() (+21 more)

### Community 105 - "openai-compatible.test.ts"
Cohesion: 0.83
Nodes (3): baseConfig(), jsonResponse(), okBody()

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
- **668 isolated node(s):** `name`, `version`, `private`, `packageManager`, `_archival` (+663 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SpecBundle` connect `SpecBundle` to `trust/state.ts`, `check/runner.ts`, `lifecycle.ts`, `commands/plan.ts`, `engine.ts`, `compiler/compile.ts`, `generate.test.ts`, `orchestrator.ts`, `score.ts`, `generate.ts`, `eval/runner.ts`, `intent-fidelity.test.ts`, `commands/plan.test.ts`, `hash.ts`, `council.test.ts`, `constraint-trace.test.ts`, `budget.ts`, `orchestrator.test.ts`, `app.test.ts`, `TaskContract`, `schemas/index.ts`, `consent.ts`, `sha256Content`, `revision.ts`, `report.ts`, `compileSpecDir`, `runner-roles.test.ts`, `init.ts`, `review-changes.ts`, `prompts-v4.ts`, `l12.test.ts`, `eval/runner.test.ts`, `tasks/index.ts`, `l08.test.ts`, `generate-interactive.ts`, `commands/trace.test.ts`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **Why does `LlmAdapter` connect `adapter.ts` to `pipeline.test.ts`, `generate.test.ts`, `coverage-hardening.test.ts`, `app-errors.test.ts`, `orchestrator.ts`, `generate.ts`, `eval/runner.ts`, `intent-fidelity.test.ts`, `BudgetLedger`, `providers.ts`, `council.test.ts`, `server.ts`, `budget.ts`, `orchestrator.test.ts`, `app.test.ts`, `composition.test.ts`, `paid.ts`, `runner-roles.test.ts`, `root-invariants.test.ts`, `eval/runner.test.ts`, `openai-compatible.ts`, `tasks/index.ts`, `generate-interactive.ts`, `snapshot-trust.test.ts`, `renew.ts`, `server.test.ts`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Why does `LlmResponse` connect `adapter.ts` to `runner-roles.test.ts`, `pipeline.test.ts`, `renew.ts`, `budget.ts`, `orchestrator.test.ts`, `root-invariants.test.ts`, `app.test.ts`, `generate.test.ts`, `coverage-hardening.test.ts`, `app-errors.test.ts`, `eval/runner.test.ts`, `composition.test.ts`, `openai-compatible.ts`, `server.test.ts`, `generate-interactive.ts`, `intent-fidelity.test.ts`, `snapshot-trust.test.ts`, `council.test.ts`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _668 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `trust/state.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11290322580645161 - nodes in this community are weakly interconnected._
- **Should `app.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05217391304347826 - nodes in this community are weakly interconnected._
- **Should `check/runner.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05580693815987934 - nodes in this community are weakly interconnected._