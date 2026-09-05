# Graph Report - llm_council_orchestrator  (2026-09-05)

## Corpus Check
- 400 files · ~404,281 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2628 nodes · 7174 edges · 125 communities (119 shown, 6 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `32c5196d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- server/http.ts
- app.ts
- pipeline.test.ts
- check/runner.ts
- compileSpecDir
- sign-test.ts
- trust/evidence.ts
- live-experiment.ts
- engine.ts
- enrich.ts
- generate.test.ts
- server.ts
- manifest.json
- tranche6.test.ts
- check.ts
- fs.ts
- llm-config.ts
- eval/runner.ts
- doctor.ts
- args.ts
- structural.ts
- compilerOptions
- SpecBundleSchema
- trust/state.ts
- intel-contract.test.ts
- openai-compatible.ts
- generate-interactive.ts
- SpecBundle
- check.test.ts
- prompts-v4.ts
- orders.ts
- pipeline.ts
- project.ts
- coverage-hardening.test.ts
- graphify-adapter.test.ts
- constraint-trace.test.ts
- planner/plan.ts
- graphify-adapter.ts
- devDependencies
- fixture-provider.ts
- ledger.ts
- renew.ts
- schemas/index.ts
- common.ts
- model.ts
- recovery/prompts.ts
- spec-core/package.json
- sha256Content
- paths.ts
- providers.ts
- budget.ts
- package.json
- root-invariants.test.ts
- paid.ts
- scale-benchmark.test.ts
- graph-reader.ts
- llm/plan.ts
- copy-browser-assets.js
- renew-consent-effectual.test.ts
- compilerOptions
- McpStdioServer
- tasks/index.ts
- report.ts
- schemas/version.ts
- init.ts
- orchestrator.ts
- run-eval.test.ts
- context/redact.ts
- lint/trace.test.ts
- GraphifyAdapter
- transaction-atomicity.test.ts
- adapter.ts
- fs-coverage.test.ts
- check/runner.test.ts
- scripts
- stdio.ts
- write-spec.ts
- architecture.test.ts
- generate-interactive.test.ts
- orchestrator.test.ts
- runner.branch-coverage.test.ts
- context-provider.ts
- server/http.test.ts
- legacy-app/package.json
- snapshot.ts
- council.test.ts
- models.ts
- authority.ts
- revision.ts
- createClarifySession
- commands/plan.test.ts
- snapshot-trust.test.ts
- make-bins-executable.js
- session/state.ts
- CodeIntelligenceProvider
- generate.ts
- cli/index.ts
- packed-install-smoke.sh
- intent-fidelity.test.ts
- app.test.ts
- prepublish-check.js
- commands/trace.test.ts
- app-errors.test.ts
- domainDigest
- llm/http.test.ts
- LlmAdapter
- files
- clarify.test.ts
- corpus-lock.ts
- schemas/evidence.ts
- prepublish-check.boundary.test.ts
- pipeline.function-coverage.test.ts
- compile.test.ts
- llm/provider.ts
- eval/prompts.ts
- eval/runner.test.ts
- server.test.ts
- l08.test.ts
- l04.test.ts
- l10.test.ts
- bin
- readiness.ts
- dependencies
- repository

## God Nodes (most connected - your core abstractions)
1. `SpecBundle` - 85 edges
2. `cmdRenewInit()` - 52 edges
3. `LlmAdapter` - 51 edges
4. `parseGraphText()` - 49 edges
5. `runPipeline()` - 43 edges
6. `runCli()` - 43 edges
7. `compileSpecDir()` - 39 edges
8. `lintBundle()` - 39 edges
9. `LlmResponse` - 38 edges
10. `sha256Content()` - 38 edges

## Surprising Connections (you probably didn't know these)
- `PlanTask` --references--> `TaskContract`  [EXTRACTED]
  packages/spec-core/src/cli/commands/plan.ts → packages/spec-core/src/schemas/tasks.ts
- `snapshotTrustedBytes()` --calls--> `renewalPaths`  [EXTRACTED]
  packages/spec-core/src/renew/trust/transaction-atomicity.test.ts → packages/spec-core/src/renew/core/project-record.ts
- `Harness` --references--> `McpStdioServer`  [EXTRACTED]
  packages/spec-core/src/mcp/stdio.test.ts → packages/spec-core/src/mcp/stdio.ts
- `compiledBundle()` --calls--> `compileSpecDir()`  [EXTRACTED]
  packages/spec-core/src/cli/commands/trace.test.ts → packages/spec-core/src/compiler/compile.ts
- `depsFor()` --calls--> `singleRoutePlan()`  [EXTRACTED]
  packages/spec-core/src/renew/recovery/pipeline.test.ts → packages/spec-core/src/llm/plan.ts

## Import Cycles
- 3-file cycle: `packages/spec-core/src/eval/budget.ts -> packages/spec-core/src/eval/llm/http.ts -> packages/spec-core/src/llm/openai-compatible.ts -> packages/spec-core/src/eval/budget.ts`

## Communities (125 total, 6 thin omitted)

### Community 0 - "server/http.ts"
Cohesion: 0.08
Nodes (14): ClarifySession, SessionSnapshot, ApplyRoundRequestSchema, ApproveRequestSchema, ASSETS, blocked(), bundle(), CancelRequestSchema (+6 more)

### Community 1 - "app.ts"
Cohesion: 0.05
Nodes (76): ApiError, applyChanges(), applyRound(), approve(), bootstrapToken(), call(), cancel(), primeSessionId() (+68 more)

### Community 2 - "pipeline.test.ts"
Cohesion: 0.18
Nodes (11): depsFor(), freshDir(), makeBundle(), persisted, sealedFor(), setupTarget(), sha(), tmpDirs (+3 more)

### Community 3 - "check/runner.ts"
Cohesion: 0.13
Nodes (19): parseExpect(), REDACTION_RULES, RedactionRule, redactSecrets(), SecretKind, activeProcessGroups, EVIDENCE_FILE_MODE, evidenceRunName() (+11 more)

### Community 4 - "compileSpecDir"
Cohesion: 0.07
Nodes (40): applyUnderLock(), ChangeResult, cmdChange(), findingLine(), FIXTURES, frozenSpecRoot(), inlineBundle(), makeSpecRoot() (+32 more)

### Community 5 - "sign-test.ts"
Cohesion: 0.19
Nodes (13): Aggregation, binomialCdf(), binomialPmf(), binomialTail(), bisect(), choose(), clopperPearson95(), MIN_DISCORDANT_PAIRS (+5 more)

### Community 6 - "trust/evidence.ts"
Cohesion: 0.14
Nodes (16): RecoveryDeps, bundleDigestPayload(), CitationClaim, CitationClaimSchema, contextBundleDigest(), ContextBundleIdentity, ContextRecord, EvidenceRole (+8 more)

### Community 7 - "live-experiment.ts"
Cohesion: 0.11
Nodes (26): aggregateEmitted(), EMITTED_SCHEMA, EmittedOutcome, loadRunDir(), parseEmittedOutcome(), renderAggregation(), baseScore(), BLOCKED (+18 more)

### Community 8 - "engine.ts"
Cohesion: 0.13
Nodes (18): BAD, BadFixtureExpectation, RULES, rule, rule, FIXTURES, rule, rule (+10 more)

### Community 9 - "enrich.ts"
Cohesion: 0.17
Nodes (14): applyEnrichment(), buildEnrichPrompt(), CLARIFY_ENRICH_PROTOCOL, DecisionEnrichment, EnrichedItemSchema, EnrichOutputSchema, EnrichParseResult, MAX_CONTEXT_CHARS (+6 more)

### Community 10 - "generate.test.ts"
Cohesion: 0.10
Nodes (12): complete(), FAKE_ENV, fetchSpy(), jsonResponse(), PET_CLINIC, PROFILE_CONFIG, SECTION_FILES, SESSION_SERVICE (+4 more)

### Community 11 - "server.ts"
Cohesion: 0.06
Nodes (55): DEFAULT_GENERATE_PROFILE, loadBundleAtLevel(), authorizeExecution(), checkPreviewDigest(), consentDigestLine(), EXEC_OPT_IN_ENV, ExecAuthorization, ExecBoundary (+47 more)

### Community 12 - "manifest.json"
Cohesion: 0.07
Nodes (28): artifact_hashes, assumptions, contracts, decisions, evidence, glossary, intent, requirements (+20 more)

### Community 13 - "tranche6.test.ts"
Cohesion: 0.07
Nodes (29): canTransition(), DistillerInputs, distillRenewalQuestions(), makeRenewalDriver(), RENEWAL_CLAIM_ID, RenewalRoundDriver, STRATEGY_CLAIM_ID, STRATEGY_OPTIONS (+21 more)

### Community 14 - "check.ts"
Cohesion: 0.38
Nodes (6): CheckOutcome, Executor, CheckOptions, CheckResult, expectedActual(), renderReport()

### Community 15 - "fs.ts"
Cohesion: 0.16
Nodes (19): authorizedCopyWrite(), authorizedCreateDirAtomically(), authorizedCreateExclusive(), authorizedEnsureDir(), authorizedRemoveTree(), authorizedRenameNoClobber(), authorizedWrite(), authorizeProjectDestination() (+11 more)

### Community 16 - "llm-config.ts"
Cohesion: 0.10
Nodes (23): RFC-7230, BaseUrlSchema, GLM, resolveSingleRole(), HeaderNameSchema, LINK_LOCAL_PREFIXES, LlmConfig, LlmConfigSchema (+15 more)

### Community 17 - "eval/runner.ts"
Cohesion: 0.18
Nodes (13): BudgetLedger, CouncilTopology, LlmUsage, UserAnswerForPrompt, ClassifierOutputSchema, firstIssues(), lintReason(), parseJsonOrBlock() (+5 more)

### Community 18 - "doctor.ts"
Cohesion: 0.10
Nodes (30): BIN_FILES, BUDGET_ENV, checkBins(), checkBudgetEnv(), checkLlmConfig(), checkLock(), checkMcpFlags(), checkNodeVersion() (+22 more)

### Community 19 - "args.ts"
Cohesion: 0.14
Nodes (15): errOf(), Command, COMMANDS, GenerateVariant, InitProfile, parseArgs(), parseRenew(), ParseResult (+7 more)

### Community 20 - "structural.ts"
Cohesion: 0.16
Nodes (21): bindStructuralArtifacts(), coerceStructuralBinding(), artifactSet(), bindingFor(), bindingOf(), tmpDirs, workspaceWith(), computeStructuralBinding() (+13 more)

### Community 21 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, esModuleInterop, lib, module, moduleResolution, noEmitOnError, outDir, rootDir (+11 more)

### Community 22 - "SpecBundleSchema"
Cohesion: 0.13
Nodes (11): EXPECT_GRAMMAR_DOC, EXPECTED_EXIT_PATTERN, isJudgeableExpect(), GOOD, rule, SpecBundleForExport, GENERATED_PATH, SpecBundleSchema (+3 more)

### Community 23 - "trust/state.ts"
Cohesion: 0.15
Nodes (30): renewalPaths, authorizedRead(), abortEvidencePath(), applyStateMutation(), bumpStateRevisionTrusted(), fenceBeforeWrite(), fenceWriterLock(), journalIsOurs() (+22 more)

### Community 24 - "intel-contract.test.ts"
Cohesion: 0.14
Nodes (11): cleanup, installedVersion, FIXTURE_SRC, freshDir(), graphWorkspace(), readFileFixture(), tmpDirs, runSubprocess() (+3 more)

### Community 25 - "openai-compatible.ts"
Cohesion: 0.13
Nodes (16): baseConfig(), jsonResponse(), okBody(), ChatResponse, CostExtractor, parseSuccess(), extractProvenance(), extractUsageDetails() (+8 more)

### Community 26 - "generate-interactive.ts"
Cohesion: 0.23
Nodes (12): cmdGenerateInteractive(), EVENT_LINES, GenerateInteractiveResult, openBrowser(), usageLine(), waitForTerminal(), normalizeIntent(), resolveGenerationRuntime() (+4 more)

### Community 27 - "SpecBundle"
Cohesion: 0.07
Nodes (43): ApplyResult, cleanLint, FIXTURES, CompileResult, freeze(), FreezeResult, cleanLint, FIXTURES (+35 more)

### Community 28 - "check.test.ts"
Cohesion: 0.21
Nodes (8): evidenceOf(), evidencePath(), FIXTURES, freshRoot(), initRoot(), makeSpecRoot(), SECTION_FILES, tmpDirs

### Community 29 - "prompts-v4.ts"
Cohesion: 0.14
Nodes (25): DecomposedCouncilDeps, runDecomposedCouncil(), CLARIFY_RULES, CLASSIFY_RULES, CONSTRAINT_FIDELITY, decomposedClassifier(), decomposedJudge(), decomposedJudgeAlone() (+17 more)

### Community 30 - "orders.ts"
Cohesion: 0.22
Nodes (13): checkStock(), decrementStock(), stock, CATALOG, quote(), run(), createOrder(), OrderResult (+5 more)

### Community 31 - "pipeline.ts"
Cohesion: 0.09
Nodes (23): MAX_RECOVERY_PROMPT_BYTES, RecoveryOutcome, UsageState, zodIssues(), AnalysisUsageSchema, AnchorResult, AnchorResultSchema, AnchorScope (+15 more)

### Community 32 - "project.ts"
Cohesion: 0.20
Nodes (11): RenewalProject, RenewalProjectSchema, dirs, MINIMAL_PROJECT, MINIMAL_SNAPSHOT, loadRenewalProject(), loadSnapshotFile(), persistRenewalProject() (+3 more)

### Community 33 - "coverage-hardening.test.ts"
Cohesion: 0.10
Nodes (30): emptyOverlay(), nextOverlayId(), OVERLAY_RELATIONS, OverlayEntityRefSchema, OverlayLoad, OverlayRecord, OverlayRecordSchema, OverlayRelation (+22 more)

### Community 34 - "graphify-adapter.test.ts"
Cohesion: 0.20
Nodes (6): parseGraphifyVersion(), bindingTextFor(), fixtureGraphText, fixturePath, validManifestText, workspaceFiles()

### Community 35 - "constraint-trace.test.ts"
Cohesion: 0.18
Nodes (13): et07Requirement(), et12Requirement(), failureCodes(), FIXTURES, genericBundleFor(), groundedEt01(), groundedEt02(), groundedEt04() (+5 more)

### Community 36 - "planner/plan.ts"
Cohesion: 0.16
Nodes (18): ArchitectureView, ArchitectureViewSchema, buildArchitectureView(), GENERATED_PATTERNS, isGeneratedPath(), fixturePath, MANIFEST, rawFixture (+10 more)

### Community 37 - "graphify-adapter.ts"
Cohesion: 0.16
Nodes (12): fixturePath, parsed, compareTriple(), DEFAULTS, GraphifyAdapterOptions, MAX_EXCLUSIVE, MIN_VERSION, SUPPORTED_GRAPHIFY_RANGE (+4 more)

### Community 38 - "devDependencies"
Cohesion: 0.15
Nodes (13): jsdom, devDependencies, jsdom, @types/node, typescript, vitest, @vitest/coverage-v8, zod-to-json-schema (+5 more)

### Community 39 - "fixture-provider.ts"
Cohesion: 0.13
Nodes (21): StaticGraphProvider, affectedReverse(), godNodes(), graphHealthOf(), neighborhood(), querySeeds(), shortestPath(), fixturePath (+13 more)

### Community 40 - "ledger.ts"
Cohesion: 0.07
Nodes (44): emptyParity(), nextParityId(), ParityEntry, ParityEntrySchema, ParityLoad, ParityStoreSchema, parseParityStore(), loadParityFile() (+36 more)

### Community 41 - "renew.ts"
Cohesion: 0.07
Nodes (49): affectedSync(), analyzeWithFresh(), cmdRenewAnalyze(), cmdRenewExport(), cmdRenewInit(), cmdRenewPlan(), cmdRenewRefresh(), cmdRenewReview() (+41 more)

### Community 42 - "schemas/index.ts"
Cohesion: 0.07
Nodes (19): FIXTURES, FIXTURES, FIXTURES, FIXTURES, FIXTURES, ContractSchema, validContract, GlossaryEntrySchema (+11 more)

### Community 43 - "common.ts"
Cohesion: 0.13
Nodes (20): AssumptionIdSchema, ComplexityProfileSchema, ContractIdSchema, DecisionIdSchema, EvidenceIdSchema, IdSchema, ImpactLevelSchema, RequirementIdSchema (+12 more)

### Community 44 - "model.ts"
Cohesion: 0.13
Nodes (26): views(), AnswerCheck, answerToUserAnswer(), applyAnswersToRecords(), ApplyResult, attachStatuses(), open(), QUESTIONS (+18 more)

### Community 45 - "recovery/prompts.ts"
Cohesion: 0.31
Nodes (12): redactSecrets(), buildRecoveryPrompt(), buildValidationRetryPrompt(), countEgressRedactions(), EgressProjection, escapeLineUnsafe(), projectItemForEgress(), serializedSizeOfItem() (+4 more)

### Community 46 - "spec-core/package.json"
Cohesion: 0.22
Nodes (8): description, engines, node, license, main, name, type, version

### Community 47 - "sha256Content"
Cohesion: 0.11
Nodes (24): AnswerLedgerSchema, answersExportDocument(), APPROVAL_RECORD_SCHEMA_ID, approvalFileName(), ApprovalRecord, ApprovalRecordSchema, buildApprovalRecord(), ChangeLedgerSchema (+16 more)

### Community 48 - "paths.ts"
Cohesion: 0.13
Nodes (22): transitiveRenewalRootCheck(), refuseIfInsideTarget(), assertDisjointRealRoots(), assertNoSymlinkBelow(), authorizeRenewalPaths(), tmpDirs, checkMcpDir(), ContainedOutputCheck (+14 more)

### Community 49 - "providers.ts"
Cohesion: 0.26
Nodes (12): buildLlmPlanFromProfile(), createOpenAiCompatibleLlm(), RoutingMode, buildRoleAdapter(), openRouterCost(), resolveRoleConfig(), RoleCallContext, SPEC_SCHEMA_TEXT (+4 more)

### Community 50 - "budget.ts"
Cohesion: 0.17
Nodes (17): BudgetCap, BudgetExceededError, BudgetSpentSnapshot, DEFAULT_WALL_SLACK_MS, MAX_COMPLETIONS, maxCompletions(), ResolvedRunBudget, resolveRunBudget() (+9 more)

### Community 51 - "package.json"
Cohesion: 0.25
Nodes (7): _archival, name, packageManager, private, scripts, test:spec, version

### Community 52 - "root-invariants.test.ts"
Cohesion: 0.12
Nodes (23): AnchorBatchResult, AnchorFailureCode, AnchorVerification, canonicalFileHash(), CodeAnchorInput, countLines(), isValidAnchorPath(), tmpDirs (+15 more)

### Community 53 - "paid.ts"
Cohesion: 0.21
Nodes (13): defaultRenewalBudget(), renewalConsentState(), accountCompletionAttempts(), createPaidOperation(), deepFreeze(), deepFreezeRoute(), BASE_ENV, MAX_RECOVERY_WIRE_BYTES (+5 more)

### Community 54 - "scale-benchmark.test.ts"
Cohesion: 0.08
Nodes (18): ChangeSet, ChangeSetSchema, ClosureFinding, ClosureFindingCode, closureFindings(), DuplicateTaskId, firstOverlap(), globSegments() (+10 more)

### Community 55 - "graph-reader.ts"
Cohesion: 0.06
Nodes (38): initProject(), loadGraph(), caps(), basename(), GraphParseResult, parseGraphFile(), parseGraphText(), RawGraphSchema (+30 more)

### Community 56 - "llm/plan.ts"
Cohesion: 0.08
Nodes (26): LLM_ROLES, singleRoutePlan(), analyzedProject(), caps(), ctxWindow(), FIXTURE_SRC, freshDir(), interiorCitation() (+18 more)

### Community 57 - "copy-browser-assets.js"
Cohesion: 0.25
Nodes (7): { copyFileSync, mkdirSync, readdirSync, writeFileSync }, files, { join }, MIME, outDir, root, srcDir

### Community 58 - "renew-consent-effectual.test.ts"
Cohesion: 0.13
Nodes (13): callRenewAnalyze(), callRenewStatus(), FIXTURES, TMP_PIN, tmpDirs, errorResponse(), callTool(), FIXTURES (+5 more)

### Community 59 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck (+7 more)

### Community 61 - "tasks/index.ts"
Cohesion: 0.14
Nodes (30): allUnGrounded(), anchorSentences(), checkConstraintTrace(), commitmentSurfaces(), ConstraintFailure, ConstraintFailureCode, containsTerm(), containsWholeTerm() (+22 more)

### Community 62 - "report.ts"
Cohesion: 0.11
Nodes (33): BadFixtureCapture, calcs(), G1_REQUIRED_TOTAL, G4_COST_MULTIPLIER, GateCalcs, GateReportInput, gateVerdict, groundedBundleFor() (+25 more)

### Community 63 - "schemas/version.ts"
Cohesion: 0.36
Nodes (7): checkSpecSchemaVersion(), ParsedVersion, parseVersion(), SPEC_SCHEMA_VERSION, SpecSchemaVersionFieldSchema, SpecSchemaVersionVerdict, SUPPORTED

### Community 64 - "init.ts"
Cohesion: 0.17
Nodes (11): buildSections(), Contract, Decision, EvidenceItem, GlossaryEntry, InitOptions, InitResult, Intent (+3 more)

### Community 65 - "orchestrator.ts"
Cohesion: 0.15
Nodes (16): changeRequestEvidence, ChangeSetValidation, CLARIFY_REVIEW_CHANGES_PROTOCOL, MAX_CHANGE_INSTRUCTION_CHARS, MAX_CHANGES_PER_SET, ReviewChange, ReviewChangeSchema, ReviewChangeSet (+8 more)

### Community 66 - "run-eval.test.ts"
Cohesion: 0.25
Nodes (7): DEFAULT_REPORT_PATH, LIVE_ENV_VARS, parseArgs(), ParsedArgs, runEvalCli(), FAKE_LIVE_ENV, mockRunEvalAll

### Community 67 - "context/redact.ts"
Cohesion: 0.31
Nodes (9): credentialAssignmentEnd(), isIdentCont(), isIdentStart(), isInlineSpace(), isValueStop(), redactCredentialAssignments(), RedactionResult, Rule (+1 more)

### Community 68 - "lint/trace.test.ts"
Cohesion: 0.22
Nodes (7): DecSpec, GOOD, mkBundle(), mkTask(), ReqSpec, TaskSpec, testWith()

### Community 70 - "transaction-atomicity.test.ts"
Cohesion: 0.20
Nodes (9): analyzeStyleMutation(), Fault, FIXTURE_SRC, Interleave, JournalCapture, RemoveFault, runAnalyzeStyleTx(), snapshotTrustedBytes() (+1 more)

### Community 71 - "adapter.ts"
Cohesion: 0.21
Nodes (9): LlmCompleteOptions, LlmResponse, MockScript, SCRIPT, MockEvalScripts, LlmProvenance, LlmUsageDetails, oneSliceBundle() (+1 more)

### Community 72 - "fs-coverage.test.ts"
Cohesion: 0.16
Nodes (11): isTrustError(), TrustAuthorityError, TrustCitationError, TrustDomainTag, TrustError, TrustFsError, TrustPaidError, TrustStateError (+3 more)

### Community 73 - "check/runner.test.ts"
Cohesion: 0.13
Nodes (7): DEFAULT_TIMEOUT_MS, killActiveProcessGroups(), FakeCall, FIXTURES, PET_CLINIC, tmpDirs, Verification

### Community 74 - "scripts"
Cohesion: 0.22
Nodes (9): scripts, build, lint, prepublishOnly, pretest, smoke:packed, test, test:coverage (+1 more)

### Community 75 - "stdio.ts"
Cohesion: 0.12
Nodes (18): isJsonRpcId(), isPlainObject(), validateJsonRpcEnvelope(), EPIPE_DRAIN_TIMEOUT_MS, EXIT_CLIENT_GONE, EXIT_DRAIN_TIMEOUT, EXIT_OK, MAX_FRAME_BYTES (+10 more)

### Community 76 - "write-spec.ts"
Cohesion: 0.29
Nodes (7): SECTION_KEYS, stageSpecDir(), PET_CLINIC, SECTION_FILES, tmpDirs, writeSpecDir(), assertNotSymlink()

### Community 77 - "architecture.test.ts"
Cohesion: 0.31
Nodes (7): allSpecifiers(), importSpecifiers(), PKG, productionFiles(), REL(), renewalSurface(), WRITE_PRIMITIVES

### Community 78 - "generate-interactive.test.ts"
Cohesion: 0.32
Nodes (6): ASSETS, blocked(), bundle(), fakeLlm(), Ready, run()

### Community 79 - "orchestrator.test.ts"
Cohesion: 0.27
Nodes (8): MAX_CLARIFY_ROUNDS, atReview(), blockedBundle(), bundle(), complete(), OPTS, scriptedLlm(), sessionWith()

### Community 80 - "runner.branch-coverage.test.ts"
Cohesion: 0.14
Nodes (7): childCtl, FIXTURES, PET_CLINIC, tmpDirs, Verification, execCommand(), execInProcessGroup()

### Community 81 - "context-provider.ts"
Cohesion: 0.11
Nodes (18): ContextBundleSchema, ContextItem, ContextItemSchema, ContextLimits, RENEW_CONTEXT_LIMITS, AnalysisScope, GraphContextProvider, GraphContextProviderOptions (+10 more)

### Community 82 - "server/http.test.ts"
Cohesion: 0.22
Nodes (5): startClarifyServer(), ASSETS, blocked(), bundle(), sessionUrl()

### Community 83 - "legacy-app/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, version

### Community 84 - "snapshot.ts"
Cohesion: 0.08
Nodes (33): deriveSnapshotId(), ProjectSnapshotSchema, reloadSnapshot(), Sha256, SnapshotFileEntrySchema, snapshotIdentityPayload(), SnapshotInputs, SnapshotReload (+25 more)

### Community 85 - "council.test.ts"
Cohesion: 0.07
Nodes (16): BUNDLE_OK(), CLASSIFIER_BLOCK, CLASSIFIER_OK, complete(), et01Bundle(), PET_CLINIC, renderCostEnvelopeTable(), PipelineOutcome (+8 more)

### Community 86 - "models.ts"
Cohesion: 0.15
Nodes (12): BUILTIN_PROVIDERS, cmdModels(), fmt(), MAX_CATALOG_BYTES, ModelCatalogEntry, MODELS_REQUEST_TIMEOUT_MS, ModelsOptions, ModelsResult (+4 more)

### Community 87 - "authority.ts"
Cohesion: 0.06
Nodes (43): loadRenewalApproval(), nextRenewalApprovalId(), RenewalApprovalLoad, RenewalDecisionSet, RenewalDecisionSetSchema, payload, tmpDirs, WriteApprovalResult (+35 more)

### Community 88 - "revision.ts"
Cohesion: 0.10
Nodes (18): acquireSpecRootLock(), backupPathFor(), fsCtl, tmpDirs, breakStaleLock(), DEFAULT_STALE_MS, LockHeldError, LockIdentity (+10 more)

### Community 89 - "createClarifySession"
Cohesion: 0.36
Nodes (9): atReview(), blockedBundle(), bundle(), complete(), OPTS, scriptedLlm(), sessionWith(), createClarifySession() (+1 more)

### Community 90 - "commands/plan.test.ts"
Cohesion: 0.08
Nodes (19): cmdPlan(), PlanOptions, PlanResult, PlanTask, renderHuman(), renderJson(), compiledBundle(), FIXTURES (+11 more)

### Community 91 - "snapshot-trust.test.ts"
Cohesion: 0.27
Nodes (10): baseCaps(), ctxWindow(), FIXTURE_SRC, fixtureGraph(), freshDir(), initPair(), interiorCitation(), makeTarget() (+2 more)

### Community 92 - "make-bins-executable.js"
Cohesion: 0.50
Nodes (3): BINS, { join }, { readFileSync, chmodSync }

### Community 93 - "session/state.ts"
Cohesion: 0.31
Nodes (8): CLARIFY_SESSION_STATES, ClarifySessionState, isTerminal(), nextSessionState(), TERMINAL, LEGAL, TransitionRule, TRANSITIONS

### Community 95 - "generate.ts"
Cohesion: 0.16
Nodes (17): checkIntent(), clarificationBlock(), cmdGenerate(), DEFAULT_GENERATE_VARIANT, GenerateResult, IntentCheck, lintReason(), lintRejections() (+9 more)

### Community 96 - "cli/index.ts"
Cohesion: 0.11
Nodes (18): commandHelp(), renewSubHelp(), FIXTURES, SECTION_FILES, tmpDirs, cmdCheck(), parseEnginesFloor(), normalizeFileIntent() (+10 more)

### Community 97 - "packed-install-smoke.sh"
Cohesion: 1.00
Nodes (3): run(), say(), packed-install-smoke.sh script

### Community 98 - "intent-fidelity.test.ts"
Cohesion: 0.25
Nodes (4): FIXTURES, genericBundleFor(), loadFixture(), U

### Community 99 - "app.test.ts"
Cohesion: 0.32
Nodes (6): ASSETS, blocked(), bootApp(), bundle(), settle(), waitFor()

### Community 100 - "prepublish-check.js"
Cohesion: 0.29
Nodes (5): describe, pkg, result, { spawnSync }, status

### Community 101 - "commands/trace.test.ts"
Cohesion: 0.18
Nodes (9): cmdTrace(), renderTrace(), compiledBundle(), FIXTURES, SECTION_FILES, tmpDirs, TraceResult, buildTrace() (+1 more)

### Community 102 - "app-errors.test.ts"
Cohesion: 0.33
Nodes (7): ASSETS, baseBundle(), blockedJson(), complete(), fakeLlm(), REAL_FETCH, startWorkspace()

### Community 103 - "domainDigest"
Cohesion: 0.10
Nodes (26): artifactHashes(), canonicalSectionHash(), FIXTURES, freezeLegacyStyle(), HASHED_KEYS, makeSpecRoot(), PRE_RENEWAL_FIXTURE, rotateKeys() (+18 more)

### Community 104 - "llm/http.test.ts"
Cohesion: 0.29
Nodes (5): FAKE_ENV, FakeEnv, jsonResponse(), okFetch(), PartialFakeEnv

### Community 105 - "LlmAdapter"
Cohesion: 0.31
Nodes (7): ClarifySessionOptions, GenerateOptions, GenerateInteractiveOptions, ResolvedProfile, RunBudgetSpec, LlmAdapter, PaidOperation

### Community 106 - "files"
Cohesion: 0.33
Nodes (6): files, dist, examples, generated, LICENSE, README.md

### Community 107 - "clarify.test.ts"
Cohesion: 0.40
Nodes (3): BASE, complete(), unresolvedBundle()

### Community 108 - "corpus-lock.ts"
Cohesion: 0.27
Nodes (14): canonicalJson(), computeCorpusHash(), CORPUS_LOCK_VERSION, CorpusLock, CorpusLockEntry, frozenThresholds, loadCorpusLock(), lockCandidates() (+6 more)

### Community 109 - "schemas/evidence.ts"
Cohesion: 0.36
Nodes (5): codeAnchorItem, CodeAnchorPayloadSchema, evidenceCommon, EvidenceItemSchema, validEvidence

### Community 111 - "pipeline.function-coverage.test.ts"
Cohesion: 0.18
Nodes (6): ContextBundle, ContextProvider, SCRIPTED_INVALID, tmpDirs, RecoveryRequest, RecoveryPromptArgs

### Community 112 - "compile.test.ts"
Cohesion: 0.29
Nodes (3): FIXTURES, SECTION_FILES, tmpDirs

### Community 113 - "llm/provider.ts"
Cohesion: 0.70
Nodes (3): OPENROUTER_DEFAULT_BASE_URL, PROVIDER_KINDS, ROUTELLM_DEFAULT_BASE_URL

### Community 114 - "eval/prompts.ts"
Cohesion: 0.24
Nodes (15): measurePromptSizes(), CLASSIFY_RULES, classifyAndProposeSingle(), classifySingle(), CONSTRAINT_FIDELITY, intentBlock(), JSON_ONLY, judgeMerge() (+7 more)

### Community 115 - "eval/runner.test.ts"
Cohesion: 0.24
Nodes (7): complete(), counterOnlyUnresolvedBundle(), et01Bundle(), PET_CLINIC, proposalAJson(), unresolvedAddedBundle(), unresolvedPlusLintDirtyBundle()

### Community 116 - "server.test.ts"
Cohesion: 0.11
Nodes (19): EXEC_ROOT_ENV, generateConsentDigest(), callTool(), expectIdentical(), FIXTURES, freshOutside(), freshRoot(), frozenRoot() (+11 more)

### Community 117 - "l08.test.ts"
Cohesion: 0.67
Nodes (3): FIXTURES, inState(), loadBundle()

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
- **693 isolated node(s):** `GenerateInteractiveResult`, `Json`, `StringType`, `ChangeOutcome`, `DecisionStatus` (+688 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SpecBundle` connect `SpecBundle` to `server/http.ts`, `check/runner.ts`, `compileSpecDir`, `engine.ts`, `generate.test.ts`, `server.ts`, `check.ts`, `eval/runner.ts`, `SpecBundleSchema`, `prompts-v4.ts`, `constraint-trace.test.ts`, `planner/plan.ts`, `schemas/index.ts`, `sha256Content`, `budget.ts`, `scale-benchmark.test.ts`, `tasks/index.ts`, `report.ts`, `orchestrator.ts`, `lint/trace.test.ts`, `check/runner.test.ts`, `write-spec.ts`, `generate-interactive.test.ts`, `orchestrator.test.ts`, `runner.branch-coverage.test.ts`, `server/http.test.ts`, `council.test.ts`, `createClarifySession`, `commands/plan.test.ts`, `generate.ts`, `intent-fidelity.test.ts`, `app.test.ts`, `commands/trace.test.ts`, `domainDigest`, `clarify.test.ts`, `compile.test.ts`, `eval/runner.test.ts`, `l08.test.ts`, `l04.test.ts`, `l10.test.ts`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **Why does `LlmAdapter` connect `LlmAdapter` to `server/http.ts`, `pipeline.test.ts`, `generate.test.ts`, `server.ts`, `tranche6.test.ts`, `eval/runner.ts`, `openai-compatible.ts`, `generate-interactive.ts`, `ledger.ts`, `renew.ts`, `providers.ts`, `budget.ts`, `root-invariants.test.ts`, `paid.ts`, `graph-reader.ts`, `llm/plan.ts`, `orchestrator.ts`, `adapter.ts`, `generate-interactive.test.ts`, `orchestrator.test.ts`, `context-provider.ts`, `server/http.test.ts`, `council.test.ts`, `authority.ts`, `createClarifySession`, `snapshot-trust.test.ts`, `generate.ts`, `app.test.ts`, `app-errors.test.ts`, `clarify.test.ts`, `pipeline.function-coverage.test.ts`, `eval/runner.test.ts`, `server.test.ts`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Why does `LlmResponse` connect `adapter.ts` to `server/http.ts`, `pipeline.test.ts`, `generate.test.ts`, `tranche6.test.ts`, `openai-compatible.ts`, `ledger.ts`, `renew.ts`, `budget.ts`, `root-invariants.test.ts`, `graph-reader.ts`, `llm/plan.ts`, `generate-interactive.test.ts`, `orchestrator.test.ts`, `context-provider.ts`, `server/http.test.ts`, `council.test.ts`, `authority.ts`, `createClarifySession`, `snapshot-trust.test.ts`, `app.test.ts`, `app-errors.test.ts`, `clarify.test.ts`, `pipeline.function-coverage.test.ts`, `eval/runner.test.ts`, `server.test.ts`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `runPipeline()` (e.g. with `.chargeAttempts()` and `.chargeTokens()`) actually correct?**
  _`runPipeline()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `GenerateInteractiveResult`, `Json`, `StringType` to the rest of the system?**
  _693 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `server/http.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08465608465608465 - nodes in this community are weakly interconnected._
- **Should `app.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05217391304347826 - nodes in this community are weakly interconnected._