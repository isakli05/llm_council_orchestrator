# Graph Report - llm_council_orchestrator  (2026-09-06)

## Corpus Check
- 402 files · ~421,816 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2669 nodes · 7311 edges · 112 communities (108 shown, 4 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e47c4489`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- generate-interactive.ts
- app.ts
- pipeline.test.ts
- check/runner.ts
- runcli-renew.test.ts
- lifecycle.ts
- trust/evidence.ts
- aggregate.ts
- engine.ts
- parseGraphText
- generate.test.ts
- consent.ts
- manifest.json
- fs.ts
- schemas/index.ts
- budget.ts
- sha256Content
- generate.ts
- doctor.ts
- server/http.ts
- structural.ts
- compilerOptions
- planner/plan.test.ts
- server.ts
- commands/plan.test.ts
- fixture-provider.ts
- session.ts
- canonical.ts
- graph-reader.ts
- prompts-v4.ts
- orders.ts
- pipeline.ts
- composition.test.ts
- coverage-hardening.test.ts
- GraphifyAdapter
- args.ts
- models.ts
- SpecBundleSchema
- devDependencies
- transaction-atomicity.test.ts
- renewalPaths
- trust/state.ts
- graphify-adapter.test.ts
- enrich.ts
- model.ts
- intent-fidelity.test.ts
- spec-core/package.json
- eval/runner.test.ts
- paths.ts
- llm-config.ts
- SpecBundle
- package.json
- runner.branch-coverage.test.ts
- paid.ts
- recovery/prompts.ts
- orchestrator.ts
- check/runner.test.ts
- copy-browser-assets.js
- verifier.ts
- compilerOptions
- acquireSpecRootLock
- McpStdioServer
- EVAL_TASKS
- context/redact.ts
- adapter.ts
- intel-contract.test.ts
- concurrency.test.ts
- journey.test.ts
- scale-benchmark.test.ts
- orchestrator.branch-coverage.test.ts
- renew-richstate.test.ts
- revision.test.ts
- tranche4.test.ts
- council.test.ts
- scripts
- stdio.ts
- check.ts
- architecture.test.ts
- root-invariants.test.ts
- orchestrator.test.ts
- StaticGraphProvider
- cli/index.ts
- legacy-app/package.json
- commands/trace.test.ts
- authority.ts
- revision.ts
- renew.ts
- providers.ts
- snapshot-trust.test.ts
- make-bins-executable.js
- eval/runner.ts
- LlmAdapter
- check.test.ts
- packed-install-smoke.sh
- CodeIntelligenceProvider
- report.ts
- prepublish-check.js
- ContextBundle
- constraint-trace.test.ts
- compileSpecDir
- files
- app.test.ts
- prepublish-check.boundary.test.ts
- context-provider.ts
- server.test.ts
- handleRpcLine
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
9. `renewalPaths` - 39 edges
10. `LlmResponse` - 38 edges

## Surprising Connections (you probably didn't know these)
- `compiledBundle()` --calls--> `compileSpecDir()`  [EXTRACTED]
  packages/spec-core/src/cli/commands/plan.test.ts → packages/spec-core/src/compiler/compile.ts
- `compiledBundle()` --calls--> `compileSpecDir()`  [EXTRACTED]
  packages/spec-core/src/cli/commands/trace.test.ts → packages/spec-core/src/compiler/compile.ts
- `ApplyResult` --references--> `SpecBundle`  [EXTRACTED]
  packages/spec-core/src/compiler/changeset.ts → packages/spec-core/src/schemas/index.ts
- `HandleRpcOptions` --references--> `LlmAdapter`  [EXTRACTED]
  packages/spec-core/src/mcp/server.ts → packages/spec-core/src/eval/llm/adapter.ts
- `MockEvalScripts` --references--> `MockScript`  [EXTRACTED]
  packages/spec-core/src/eval/report.ts → packages/spec-core/src/eval/llm/mock.ts

## Import Cycles
- 3-file cycle: `packages/spec-core/src/eval/budget.ts -> packages/spec-core/src/eval/llm/http.ts -> packages/spec-core/src/llm/openai-compatible.ts -> packages/spec-core/src/eval/budget.ts`

## Communities (112 total, 4 thin omitted)

### Community 0 - "generate-interactive.ts"
Cohesion: 0.08
Nodes (29): ASSETS, baseBundle(), blockedJson(), complete(), fakeLlm(), REAL_FETCH, startWorkspace(), createClarifySession() (+21 more)

### Community 1 - "app.ts"
Cohesion: 0.05
Nodes (76): ApiError, applyChanges(), applyRound(), approve(), bootstrapToken(), call(), cancel(), primeSessionId() (+68 more)

### Community 2 - "pipeline.test.ts"
Cohesion: 0.24
Nodes (8): freshDir(), makeBundle(), persisted, setupTarget(), sha(), tmpDirs, withPricingNodeBound(), withPricingWindowBeyondFile()

### Community 3 - "check/runner.ts"
Cohesion: 0.13
Nodes (19): parseExpect(), REDACTION_RULES, RedactionRule, redactSecrets(), SecretKind, activeProcessGroups, EVIDENCE_FILE_MODE, evidenceRunName() (+11 more)

### Community 4 - "runcli-renew.test.ts"
Cohesion: 0.40
Nodes (5): FIXTURE_SRC, freshDir(), graphifyAvailable, makeTarget(), tmpDirs

### Community 5 - "lifecycle.ts"
Cohesion: 0.12
Nodes (24): applyChangeSet(), ApplyResult, ChangeSetSchema, formatIssues(), checkTransition(), FREEZE_REFUSAL_HINTS, LIFECYCLE_STATES, LIFECYCLE_TRANSITIONS (+16 more)

### Community 6 - "trust/evidence.ts"
Cohesion: 0.12
Nodes (18): sealedFor(), bundleDigestCache, bundleDigestPayload(), CitationClaim, contextBundleDigest(), ContextBundleIdentity, ContextRecord, deepFreezeItem() (+10 more)

### Community 7 - "aggregate.ts"
Cohesion: 0.12
Nodes (24): Aggregation, EmittedOutcome, loadRunDir(), parseEmittedOutcome(), baseScore(), BLOCKED, EmitOverrides, emittedRecord() (+16 more)

### Community 8 - "engine.ts"
Cohesion: 0.12
Nodes (21): EXPECT_GRAMMAR_DOC, EXPECTED_EXIT_PATTERN, isJudgeableExpect(), BAD, BadFixtureExpectation, RULES, rule, rule (+13 more)

### Community 9 - "parseGraphText"
Cohesion: 0.09
Nodes (23): FIXTURES, initProject(), TMP_PIN, tmpDirs, graphCaps(), caps(), parseGraphText(), FIXTURE_SRC (+15 more)

### Community 10 - "generate.test.ts"
Cohesion: 0.10
Nodes (12): complete(), FAKE_ENV, fetchSpy(), jsonResponse(), PET_CLINIC, PROFILE_CONFIG, SECTION_FILES, SESSION_SERVICE (+4 more)

### Community 11 - "consent.ts"
Cohesion: 0.09
Nodes (34): execInProcessGroup(), authorizeExecution(), checkPreviewDigest(), consentDigestLine(), EXEC_OPT_IN_ENV, EXEC_ROOT_ENV, ExecAuthorization, execOptInFromEnv() (+26 more)

### Community 12 - "manifest.json"
Cohesion: 0.07
Nodes (28): artifact_hashes, assumptions, contracts, decisions, evidence, glossary, intent, requirements (+20 more)

### Community 13 - "fs.ts"
Cohesion: 0.15
Nodes (20): TrustFsError, authorizedCopyWrite(), authorizedCreateDirAtomically(), authorizedCreateExclusive(), authorizedEnsureDir(), authorizedRemoveTree(), authorizedRenameNoClobber(), authorizedStat() (+12 more)

### Community 14 - "schemas/index.ts"
Cohesion: 0.06
Nodes (50): Contract, Decision, EvidenceItem, GlossaryEntry, InitOptions, InitResult, Intent, Requirement (+42 more)

### Community 15 - "budget.ts"
Cohesion: 0.12
Nodes (18): BudgetCap, BudgetExceededError, BudgetSpentSnapshot, DEFAULT_WALL_SLACK_MS, MAX_COMPLETIONS, maxCompletions(), ResolvedRunBudget, resolveRunBudget() (+10 more)

### Community 16 - "sha256Content"
Cohesion: 0.11
Nodes (24): AnswerLedgerSchema, answersExportDocument(), APPROVAL_RECORD_SCHEMA_ID, approvalFileName(), ApprovalRecord, ApprovalRecordSchema, buildApprovalRecord(), ChangeLedgerSchema (+16 more)

### Community 17 - "generate.ts"
Cohesion: 0.16
Nodes (18): ClarifySessionOptions, checkIntent(), clarificationBlock(), cmdGenerate(), GenerateOptions, GenerateResult, IntentCheck, GenerateInteractiveOptions (+10 more)

### Community 18 - "doctor.ts"
Cohesion: 0.10
Nodes (30): BIN_FILES, BUDGET_ENV, checkBins(), checkBudgetEnv(), checkLlmConfig(), checkLock(), checkMcpFlags(), checkNodeVersion() (+22 more)

### Community 19 - "server/http.ts"
Cohesion: 0.07
Nodes (20): ClarifySession, ASSETS, blocked(), bundle(), fakeLlm(), Ready, run(), ApplyRoundRequestSchema (+12 more)

### Community 20 - "structural.ts"
Cohesion: 0.15
Nodes (22): TrustStructuralError, bindStructuralArtifacts(), coerceStructuralBinding(), artifactSet(), bindingFor(), bindingOf(), tmpDirs, workspaceWith() (+14 more)

### Community 21 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, esModuleInterop, lib, module, moduleResolution, noEmitOnError, outDir, rootDir (+11 more)

### Community 22 - "planner/plan.test.ts"
Cohesion: 0.05
Nodes (52): createSnapshot(), deriveSnapshotId(), ProjectSnapshotSchema, Sha256, SnapshotFileEntrySchema, snapshotIdentityPayload(), SnapshotInputs, SnapshotReload (+44 more)

### Community 23 - "server.ts"
Cohesion: 0.09
Nodes (24): DEFAULT_GENERATE_PROFILE, ChangeSet, ExecBoundary, GenerateProfile, GenerateVariant, ARG_SPECS, ArgName, ArgValidator (+16 more)

### Community 24 - "commands/plan.test.ts"
Cohesion: 0.08
Nodes (22): cmdPlan(), PlanOptions, PlanResult, PlanTask, renderHuman(), renderJson(), compiledBundle(), FIXTURES (+14 more)

### Community 25 - "fixture-provider.ts"
Cohesion: 0.16
Nodes (21): affectedReverse(), godNodes(), graphHealthOf(), neighborhood(), querySeeds(), shortestPath(), fixturePath, parsed (+13 more)

### Community 26 - "session.ts"
Cohesion: 0.21
Nodes (14): DecisionRecords, mergeRoundRecords(), SessionOpResult, canTransition(), CLARIFY_SESSION_STATES, ClarifySessionState, isTerminal(), nextSessionState() (+6 more)

### Community 27 - "canonical.ts"
Cohesion: 0.06
Nodes (34): FIXTURES, SECTION_FILES, tmpDirs, cleanLint, FIXTURES, freeze(), cleanLint, FIXTURES (+26 more)

### Community 28 - "graph-reader.ts"
Cohesion: 0.11
Nodes (19): ArchitectureViewSchema, fixturePath, loadGraph(), MANIFEST, rawFixture, fixturePath, parsed, basename() (+11 more)

### Community 29 - "prompts-v4.ts"
Cohesion: 0.13
Nodes (28): DecomposedCouncilDeps, runDecomposedCouncil(), CLARIFY_RULES, CLASSIFY_RULES, CONSTRAINT_FIDELITY, decomposedClassifier(), decomposedJudge(), decomposedJudgeAlone() (+20 more)

### Community 30 - "orders.ts"
Cohesion: 0.22
Nodes (13): checkStock(), decrementStock(), stock, CATALOG, quote(), run(), createOrder(), OrderResult (+5 more)

### Community 31 - "pipeline.ts"
Cohesion: 0.08
Nodes (28): RecoveryDeps, RecoveryOutcome, UsageState, zodIssues(), RECOVERY_PROMPT_PROTOCOL, AnalysisUsageSchema, AnchorResult, AnchorResultSchema (+20 more)

### Community 32 - "composition.test.ts"
Cohesion: 0.12
Nodes (13): capsWith(), FIXTURE_SRC, freshProject(), tmpDirs, isTrustError(), TrustAuthorityError, TrustCitationError, TrustDomainTag (+5 more)

### Community 33 - "coverage-hardening.test.ts"
Cohesion: 0.07
Nodes (42): DistillerInputs, distillRenewalQuestions(), makeRenewalDriver(), RENEWAL_CLAIM_ID, STRATEGY_CLAIM_ID, STRATEGY_OPTIONS, strategyQuestion(), analysisWithUncertainty() (+34 more)

### Community 35 - "args.ts"
Cohesion: 0.12
Nodes (18): errOf(), Command, COMMANDS, GenerateVariant, InitProfile, parseArgs(), parseRenew(), ParseResult (+10 more)

### Community 36 - "models.ts"
Cohesion: 0.13
Nodes (15): BUILTIN_PROVIDERS, cmdModels(), fmt(), MAX_CATALOG_BYTES, ModelCatalogEntry, MODELS_REQUEST_TIMEOUT_MS, ModelsOptions, ModelsResult (+7 more)

### Community 37 - "SpecBundleSchema"
Cohesion: 0.13
Nodes (8): GOOD, BAD, BadFixtureExpectation, FIXTURES, GOOD, SpecBundleForExport, GENERATED_PATH, SpecBundleSchema

### Community 38 - "devDependencies"
Cohesion: 0.15
Nodes (13): jsdom, devDependencies, jsdom, @types/node, typescript, vitest, @vitest/coverage-v8, zod-to-json-schema (+5 more)

### Community 39 - "transaction-atomicity.test.ts"
Cohesion: 0.14
Nodes (22): parseOverlayStore(), FIXTURE_SRC, tmpDirs, abortEvidencePath(), foreignObjectAtEvidencePath(), loadActiveState(), readRevision(), runRenewalStateTx() (+14 more)

### Community 40 - "renewalPaths"
Cohesion: 0.21
Nodes (14): transitiveRenewalRootCheck(), renewalPaths, RenewalProject, RenewalProjectSchema, reloadSnapshot(), dirs, MINIMAL_PROJECT, MINIMAL_SNAPSHOT (+6 more)

### Community 41 - "trust/state.ts"
Cohesion: 0.14
Nodes (29): authorizedRead(), applyStateMutation(), bumpStateRevisionTrusted(), fenceBeforeWrite(), fenceWriterLock(), journalIsOurs(), journalOnDisk(), loadJoinedStore() (+21 more)

### Community 42 - "graphify-adapter.test.ts"
Cohesion: 0.17
Nodes (8): compareTriple(), parseGraphifyVersion(), bindingTextFor(), fixtureGraphText, fixturePath, validManifestText, workspaceFiles(), versionSupported()

### Community 43 - "enrich.ts"
Cohesion: 0.18
Nodes (13): applyEnrichment(), buildEnrichPrompt(), CLARIFY_ENRICH_PROTOCOL, DecisionEnrichment, EnrichedItemSchema, EnrichOutputSchema, EnrichParseResult, MAX_CONTEXT_CHARS (+5 more)

### Community 44 - "model.ts"
Cohesion: 0.13
Nodes (23): views(), AnswerCheck, answerToUserAnswer(), applyAnswersToRecords(), ApplyResult, attachStatuses(), open(), QUESTIONS (+15 more)

### Community 45 - "intent-fidelity.test.ts"
Cohesion: 0.25
Nodes (4): FIXTURES, genericBundleFor(), loadFixture(), U

### Community 46 - "spec-core/package.json"
Cohesion: 0.22
Nodes (8): description, engines, node, license, main, name, type, version

### Community 47 - "eval/runner.test.ts"
Cohesion: 0.14
Nodes (11): BASE, complete(), unresolvedBundle(), complete(), counterOnlyUnresolvedBundle(), et01Bundle(), PET_CLINIC, proposalAJson() (+3 more)

### Community 48 - "paths.ts"
Cohesion: 0.13
Nodes (22): refuseIfInsideTarget(), assertDisjointRealRoots(), assertNoSymlinkBelow(), assertWritableSpecDir(), authorizeRenewalPaths(), tmpDirs, checkMcpDir(), ContainedOutputCheck (+14 more)

### Community 49 - "llm-config.ts"
Cohesion: 0.09
Nodes (24): RFC-7230, BaseUrlSchema, GLM, resolveSingleRole(), HeaderNameSchema, LINK_LOCAL_PREFIXES, LlmConfig, LlmConfigSchema (+16 more)

### Community 50 - "SpecBundle"
Cohesion: 0.05
Nodes (17): CompileResult, FIXTURES, SECTION_FILES, tmpDirs, FreezeResult, FIXTURES, FIXTURES, FIXTURES (+9 more)

### Community 51 - "package.json"
Cohesion: 0.25
Nodes (7): _archival, name, packageManager, private, scripts, test:spec, version

### Community 52 - "runner.branch-coverage.test.ts"
Cohesion: 0.14
Nodes (6): childCtl, FIXTURES, PET_CLINIC, tmpDirs, Verification, execCommand()

### Community 53 - "paid.ts"
Cohesion: 0.17
Nodes (16): renewalConsentState(), accountCompletionAttempts(), createPaidOperation(), deepFreeze(), deepFreezeRoute(), BASE_ENV, MAX_RECOVERY_WIRE_BYTES, ownField() (+8 more)

### Community 54 - "recovery/prompts.ts"
Cohesion: 0.30
Nodes (13): redactSecrets(), runRecovery(), buildRecoveryPrompt(), buildValidationRetryPrompt(), countEgressRedactions(), EgressProjection, escapeLineUnsafe(), projectItemForEgress() (+5 more)

### Community 55 - "orchestrator.ts"
Cohesion: 0.14
Nodes (18): ClarificationQuestionView, BehaviorReview, changeRequestEvidence, ChangeSetValidation, CLARIFY_REVIEW_CHANGES_PROTOCOL, MAX_CHANGE_INSTRUCTION_CHARS, MAX_CHANGES_PER_SET, ReviewChange (+10 more)

### Community 56 - "check/runner.test.ts"
Cohesion: 0.13
Nodes (7): DEFAULT_TIMEOUT_MS, killActiveProcessGroups(), FakeCall, FIXTURES, PET_CLINIC, tmpDirs, Verification

### Community 57 - "copy-browser-assets.js"
Cohesion: 0.25
Nodes (7): { copyFileSync, mkdirSync, readdirSync, writeFileSync }, files, { join }, MIME, outDir, root, srcDir

### Community 58 - "verifier.ts"
Cohesion: 0.20
Nodes (10): AnchorBatchResult, AnchorFailureCode, AnchorVerification, canonicalFileHash(), CodeAnchorInput, countLines(), isValidAnchorPath(), tmpDirs (+2 more)

### Community 59 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck (+7 more)

### Community 60 - "acquireSpecRootLock"
Cohesion: 0.18
Nodes (14): buildSections(), cmdInit(), pathExists(), SECTION_KEYS, stageSpecDir(), PET_CLINIC, SECTION_FILES, tmpDirs (+6 more)

### Community 62 - "EVAL_TASKS"
Cohesion: 0.12
Nodes (24): canonicalJson(), computeCorpusHash(), CORPUS_LOCK_VERSION, CorpusLock, CorpusLockEntry, frozenThresholds, loadCorpusLock(), lockCandidates() (+16 more)

### Community 63 - "context/redact.ts"
Cohesion: 0.31
Nodes (9): credentialAssignmentEnd(), isIdentCont(), isIdentStart(), isInlineSpace(), isValueStop(), redactCredentialAssignments(), RedactionResult, Rule (+1 more)

### Community 64 - "adapter.ts"
Cohesion: 0.18
Nodes (14): LlmCompleteOptions, LlmResponse, LlmUsage, MockScript, SCRIPT, ChatResponse, CostExtractor, parseSuccess() (+6 more)

### Community 65 - "intel-contract.test.ts"
Cohesion: 0.13
Nodes (13): GraphifyAdapterOptions, cleanup, installedVersion, FIXTURE_SRC, freshDir(), graphWorkspace(), readFileFixture(), tmpDirs (+5 more)

### Community 66 - "concurrency.test.ts"
Cohesion: 0.25
Nodes (8): capsWith(), complete(), ctxWindow(), FIXTURE_SRC, fixtureGraph(), freshReviewedProject(), OUTPUT(), tmpDirs

### Community 67 - "journey.test.ts"
Cohesion: 0.22
Nodes (7): capsWith(), CONFORMING_OUTPUT(), FIXTURE_SRC, interiorCitation(), inventory(), sha(), tmpDirs

### Community 68 - "scale-benchmark.test.ts"
Cohesion: 0.10
Nodes (15): ClosureFinding, ClosureFindingCode, closureFindings(), DuplicateTaskId, firstOverlap(), globSegments(), globsOverlap(), rule (+7 more)

### Community 69 - "orchestrator.branch-coverage.test.ts"
Cohesion: 0.43
Nodes (7): atReview(), blockedBundle(), bundle(), complete(), OPTS, scriptedLlm(), sessionWith()

### Community 70 - "renew-richstate.test.ts"
Cohesion: 0.24
Nodes (7): analysisRecord(), caps(), FIXTURE_SRC, freshDir(), makeTarget(), sha(), tmpDirs

### Community 71 - "revision.test.ts"
Cohesion: 0.20
Nodes (4): DEFAULT_STALE_MS, LockHeldError, fsyncCtl, tmpDirs

### Community 72 - "tranche4.test.ts"
Cohesion: 0.10
Nodes (26): ArchitectureView, buildArchitectureView(), GENERATED_PATTERNS, isGeneratedPath(), ProjectSnapshot, ParityStore, PlanInputs, PlanOutcome (+18 more)

### Community 73 - "council.test.ts"
Cohesion: 0.28
Nodes (6): BUNDLE_OK(), CLASSIFIER_BLOCK, CLASSIFIER_OK, complete(), et01Bundle(), PET_CLINIC

### Community 74 - "scripts"
Cohesion: 0.22
Nodes (9): scripts, build, lint, prepublishOnly, pretest, smoke:packed, test, test:coverage (+1 more)

### Community 75 - "stdio.ts"
Cohesion: 0.13
Nodes (14): EPIPE_DRAIN_TIMEOUT_MS, EXIT_CLIENT_GONE, EXIT_DRAIN_TIMEOUT, EXIT_OK, MAX_FRAME_BYTES, MAX_IN_FLIGHT, SchedulingPeek, StdioServerLimits (+6 more)

### Community 76 - "check.ts"
Cohesion: 0.36
Nodes (7): CheckOutcome, Executor, CheckOptions, CheckResult, cmdCheck(), expectedActual(), renderReport()

### Community 77 - "architecture.test.ts"
Cohesion: 0.31
Nodes (7): allSpecifiers(), importSpecifiers(), PKG, productionFiles(), REL(), renewalSurface(), WRITE_PRIMITIVES

### Community 78 - "root-invariants.test.ts"
Cohesion: 0.07
Nodes (45): nextParityId(), ParityEntry, ParityEntrySchema, ParityEvidenceSchema, ParityLoad, ParityStoreSchema, parseParityStore(), loadParityFile() (+37 more)

### Community 79 - "orchestrator.test.ts"
Cohesion: 0.27
Nodes (8): MAX_CLARIFY_ROUNDS, atReview(), blockedBundle(), bundle(), complete(), OPTS, scriptedLlm(), sessionWith()

### Community 81 - "cli/index.ts"
Cohesion: 0.08
Nodes (33): commandHelp(), renewSubHelp(), normalizeFileIntent(), cmdRenewAnalyze(), cmdRenewExport(), cmdRenewInit(), cmdRenewRefresh(), cmdRenewStatus() (+25 more)

### Community 83 - "legacy-app/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, version

### Community 85 - "commands/trace.test.ts"
Cohesion: 0.10
Nodes (16): cmdTrace(), renderTrace(), compiledBundle(), FIXTURES, SECTION_FILES, tmpDirs, TraceResult, buildTrace() (+8 more)

### Community 87 - "authority.ts"
Cohesion: 0.08
Nodes (28): loadRenewalApproval(), nextRenewalApprovalId(), RenewalApprovalLoad, RenewalDecisionSet, RenewalDecisionSetSchema, payload, tmpDirs, WriteApprovalResult (+20 more)

### Community 88 - "revision.ts"
Cohesion: 0.18
Nodes (13): backupPathFor(), fsCtl, tmpDirs, createDirAtomically(), fsyncDir(), LOCK_FILE, LockIdentity, LockOptions (+5 more)

### Community 89 - "renew.ts"
Cohesion: 0.09
Nodes (27): affectedSync(), analyzeWithFresh(), cmdRenewPlan(), cmdRenewReview(), currentStaleness(), finishReview(), persistGuard(), readWorkspaceFile() (+19 more)

### Community 90 - "providers.ts"
Cohesion: 0.16
Nodes (18): baseConfig(), jsonResponse(), okBody(), createOpenAiCompatibleLlm(), OpenAiCompatibleConfig, baseConfig(), jsonResponse(), okBody() (+10 more)

### Community 91 - "snapshot-trust.test.ts"
Cohesion: 0.27
Nodes (10): baseCaps(), ctxWindow(), FIXTURE_SRC, fixtureGraph(), freshDir(), initPair(), interiorCitation(), makeTarget() (+2 more)

### Community 92 - "make-bins-executable.js"
Cohesion: 0.50
Nodes (3): BINS, { join }, { readFileSync, chmodSync }

### Community 93 - "eval/runner.ts"
Cohesion: 0.11
Nodes (30): validateGenerationOutput(), BudgetLedger, CouncilTopology, computeCostEnvelope(), CostEnvelope, measurePromptSizes(), PromptSize, renderCostEnvelopeTable() (+22 more)

### Community 94 - "LlmAdapter"
Cohesion: 0.09
Nodes (19): LlmAdapter, isLlmPlan(), LLM_ROLES, LlmRoute, singleRoutePlan(), ProviderKind, FIXTURE_SRC, freshDir() (+11 more)

### Community 96 - "check.test.ts"
Cohesion: 0.21
Nodes (8): evidenceOf(), evidencePath(), FIXTURES, freshRoot(), initRoot(), makeSpecRoot(), SECTION_FILES, tmpDirs

### Community 97 - "packed-install-smoke.sh"
Cohesion: 1.00
Nodes (3): run(), say(), packed-install-smoke.sh script

### Community 99 - "report.ts"
Cohesion: 0.06
Nodes (50): aggregateEmitted(), EMITTED_SCHEMA, renderAggregation(), BadFixtureCapture, gateVerdict, groundedBundleFor(), ENV_KEYS, emittedFileName() (+42 more)

### Community 100 - "prepublish-check.js"
Cohesion: 0.29
Nodes (5): describe, pkg, result, { spawnSync }, status

### Community 101 - "ContextBundle"
Cohesion: 0.15
Nodes (7): ContextBundle, SCRIPTED_INVALID, tmpDirs, RecoveryRequest, RecoveryPromptArgs, ITEMS, SLICES

### Community 102 - "constraint-trace.test.ts"
Cohesion: 0.06
Nodes (46): et07Requirement(), et12Requirement(), failureCodes(), FIXTURES, genericBundleFor(), groundedEt01(), groundedEt02(), groundedEt04() (+38 more)

### Community 103 - "compileSpecDir"
Cohesion: 0.05
Nodes (47): applyUnderLock(), ChangeResult, cmdChange(), findingLine(), FIXTURES, frozenSpecRoot(), inlineBundle(), makeSpecRoot() (+39 more)

### Community 106 - "files"
Cohesion: 0.33
Nodes (6): files, dist, examples, generated, LICENSE, README.md

### Community 108 - "app.test.ts"
Cohesion: 0.32
Nodes (6): ASSETS, blocked(), bootApp(), bundle(), settle(), waitFor()

### Community 110 - "prepublish-check.boundary.test.ts"
Cohesion: 0.50
Nodes (3): DIST_PRESENT, git(), makeRepo()

### Community 115 - "context-provider.ts"
Cohesion: 0.10
Nodes (19): ContextBundleSchema, ContextItem, ContextItemSchema, ContextLimits, RENEW_CONTEXT_LIMITS, AnalysisScope, ContextProvider, GraphContextProvider (+11 more)

### Community 116 - "server.test.ts"
Cohesion: 0.11
Nodes (18): callTool(), DIST_PRESENT, expectIdentical(), FIXTURES, freshOutside(), freshRoot(), frozenRoot(), injectionRoot() (+10 more)

### Community 117 - "handleRpcLine"
Cohesion: 0.13
Nodes (18): generateOptInFromEnv(), callRenewAnalyze(), callRenewStatus(), errorResponse(), callTool(), FIXTURES, freshRoot(), makeSpecRoot() (+10 more)

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
- **703 isolated node(s):** `name`, `version`, `private`, `packageManager`, `_archival` (+698 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SpecBundle` connect `SpecBundle` to `generate-interactive.ts`, `check/runner.ts`, `lifecycle.ts`, `engine.ts`, `generate.test.ts`, `consent.ts`, `schemas/index.ts`, `budget.ts`, `sha256Content`, `generate.ts`, `server/http.ts`, `commands/plan.test.ts`, `canonical.ts`, `prompts-v4.ts`, `SpecBundleSchema`, `intent-fidelity.test.ts`, `eval/runner.test.ts`, `runner.branch-coverage.test.ts`, `orchestrator.ts`, `check/runner.test.ts`, `acquireSpecRootLock`, `EVAL_TASKS`, `scale-benchmark.test.ts`, `orchestrator.branch-coverage.test.ts`, `tranche4.test.ts`, `council.test.ts`, `check.ts`, `orchestrator.test.ts`, `commands/trace.test.ts`, `eval/runner.ts`, `report.ts`, `constraint-trace.test.ts`, `compileSpecDir`, `app.test.ts`?**
  _High betweenness centrality (0.082) - this node is a cross-community bridge._
- **Why does `LlmAdapter` connect `LlmAdapter` to `generate-interactive.ts`, `pipeline.test.ts`, `parseGraphText`, `generate.test.ts`, `budget.ts`, `generate.ts`, `server/http.ts`, `server.ts`, `eval/runner.test.ts`, `paid.ts`, `orchestrator.ts`, `EVAL_TASKS`, `adapter.ts`, `concurrency.test.ts`, `journey.test.ts`, `orchestrator.branch-coverage.test.ts`, `renew-richstate.test.ts`, `council.test.ts`, `root-invariants.test.ts`, `orchestrator.test.ts`, `cli/index.ts`, `renew.ts`, `providers.ts`, `snapshot-trust.test.ts`, `eval/runner.ts`, `ContextBundle`, `constraint-trace.test.ts`, `app.test.ts`, `context-provider.ts`, `server.test.ts`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Why does `SpecBundleSchema` connect `SpecBundleSchema` to `report.ts`, `scale-benchmark.test.ts`, `compileSpecDir`, `engine.ts`, `tranche4.test.ts`, `generate.test.ts`, `schemas/index.ts`, `sha256Content`, `doctor.ts`, `runner.branch-coverage.test.ts`, `commands/trace.test.ts`, `planner/plan.test.ts`, `check/runner.test.ts`, `eval/runner.ts`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _703 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `generate-interactive.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08456659619450317 - nodes in this community are weakly interconnected._
- **Should `app.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05217391304347826 - nodes in this community are weakly interconnected._
- **Should `check/runner.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.12554112554112554 - nodes in this community are weakly interconnected._