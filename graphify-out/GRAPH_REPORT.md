# Graph Report - llm_council_orchestrator  (2026-09-05)

## Corpus Check
- 400 files · ~404,145 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2630 nodes · 7176 edges · 121 communities (117 shown, 4 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `94a3600a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- generate-interactive.ts
- app.ts
- pipeline.test.ts
- check/runner.ts
- compileSpecDir
- aggregate.ts
- trust/evidence.ts
- live-experiment.ts
- engine.ts
- orchestrator.ts
- generate.test.ts
- consent.ts
- manifest.json
- distiller.ts
- check.ts
- fs.ts
- llm-config.ts
- server.ts
- doctor.ts
- workspace-copy.ts
- structural.ts
- compilerOptions
- SpecBundleSchema
- trust/state.ts
- revision.ts
- adapter.ts
- scale-benchmark.test.ts
- lifecycle.ts
- check.test.ts
- eval/runner.ts
- orders.ts
- pipeline.ts
- commands/plan.test.ts
- ledger.ts
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
- model.ts
- change.ts
- spec-core/package.json
- src/clarify/approvals.ts
- paths.ts
- providers.ts
- budget.ts
- package.json
- root-invariants.test.ts
- paid.ts
- l12.test.ts
- transaction-atomicity.test.ts
- parseGraphText
- copy-browser-assets.js
- renew-consent-effectual.test.ts
- compilerOptions
- McpStdioServer
- tasks/index.ts
- report.ts
- schemas/version.ts
- graph-reader.ts
- review-changes.ts
- isolation.test.ts
- context/redact.ts
- runcli-renew.test.ts
- GraphifyAdapter
- tranche4.test.ts
- sha256Content
- errors.ts
- check/runner.test.ts
- scripts
- stdio.ts
- write-spec.ts
- architecture.test.ts
- generate-interactive.test.ts
- orchestrator.test.ts
- runner.branch-coverage.test.ts
- context-provider.ts
- concurrency.test.ts
- legacy-app/package.json
- snapshot.ts
- council.test.ts
- models.ts
- authority.ts
- revision.branch-coverage.test.ts
- orchestrator.branch-coverage.test.ts
- commands/plan.ts
- snapshot-trust.test.ts
- make-bins-executable.js
- renew-richstate.test.ts
- CodeIntelligenceProvider
- generate.ts
- cli.test.ts
- packed-install-smoke.sh
- intent-fidelity.test.ts
- app.test.ts
- prepublish-check.js
- commands/trace.test.ts
- verifier.ts
- hash.ts
- llm/http.test.ts
- check/redact.ts
- files
- clarify.test.ts
- corpus-lock.ts
- report.test.ts
- prepublish-check.boundary.test.ts
- pipeline.function-coverage.test.ts
- openai-compatible.test.ts
- runPipeline
- eval/runner.test.ts
- server.test.ts
- bin
- readiness.ts
- dependencies
- repository

## God Nodes (most connected - your core abstractions)
1. `SpecBundle` - 85 edges
2. `cmdRenewInit()` - 52 edges
3. `LlmAdapter` - 51 edges
4. `parseGraphText()` - 49 edges
5. `runCli()` - 43 edges
6. `runPipeline()` - 43 edges
7. `compileSpecDir()` - 39 edges
8. `lintBundle()` - 39 edges
9. `LlmResponse` - 38 edges
10. `sha256Content()` - 38 edges

## Surprising Connections (you probably didn't know these)
- `PlanTask` --references--> `TaskContract`  [EXTRACTED]
  packages/spec-core/src/cli/commands/plan.ts → packages/spec-core/src/schemas/tasks.ts
- `ApplyResult` --references--> `SpecBundle`  [EXTRACTED]
  packages/spec-core/src/compiler/changeset.ts → packages/spec-core/src/schemas/index.ts
- `CompileResult` --references--> `SpecBundle`  [EXTRACTED]
  packages/spec-core/src/compiler/compile.ts → packages/spec-core/src/schemas/index.ts
- `Harness` --references--> `McpStdioServer`  [EXTRACTED]
  packages/spec-core/src/mcp/stdio.test.ts → packages/spec-core/src/mcp/stdio.ts
- `RecoveryRequest` --references--> `ContextBundle`  [EXTRACTED]
  packages/spec-core/src/renew/recovery/pipeline.ts → packages/spec-core/src/renew/context/bundle.ts

## Import Cycles
- 3-file cycle: `packages/spec-core/src/eval/budget.ts -> packages/spec-core/src/eval/llm/http.ts -> packages/spec-core/src/llm/openai-compatible.ts -> packages/spec-core/src/eval/budget.ts`

## Communities (121 total, 4 thin omitted)

### Community 0 - "generate-interactive.ts"
Cohesion: 0.05
Nodes (39): ASSETS, baseBundle(), blockedJson(), complete(), fakeLlm(), REAL_FETCH, startWorkspace(), ClarifySession (+31 more)

### Community 1 - "app.ts"
Cohesion: 0.05
Nodes (76): ApiError, applyChanges(), applyRound(), approve(), bootstrapToken(), call(), cancel(), primeSessionId() (+68 more)

### Community 2 - "pipeline.test.ts"
Cohesion: 0.20
Nodes (10): depsFor(), freshDir(), makeBundle(), persisted, setupTarget(), sha(), tmpDirs, withPricingNodeBound() (+2 more)

### Community 3 - "check/runner.ts"
Cohesion: 0.13
Nodes (14): activeProcessGroups, EVIDENCE_FILE_MODE, evidenceRunName(), execCommand(), execInProcessGroup(), ExecutorResult, FORCE_SETTLE_GRACE_MS, GROUP_KILL_GRACE_MS (+6 more)

### Community 4 - "compileSpecDir"
Cohesion: 0.06
Nodes (34): cmdCompile(), compileFailedOutput(), CompileResult, ChildOutcome, CLI_JS, SECTION_FILES, tmpDirs, cmdLint() (+26 more)

### Community 5 - "aggregate.ts"
Cohesion: 0.15
Nodes (23): Aggregation, VariantCost, calcs(), GateCalcs, GateReportInput, gateVerdict, renderGateReport(), PipelineVariant (+15 more)

### Community 6 - "trust/evidence.ts"
Cohesion: 0.14
Nodes (18): RecoveryDeps, sealedFor(), bundleDigestPayload(), CitationClaim, CitationClaimSchema, contextBundleDigest(), ContextBundleIdentity, ContextRecord (+10 more)

### Community 7 - "live-experiment.ts"
Cohesion: 0.11
Nodes (21): aggregateEmitted(), EMITTED_SCHEMA, EmittedOutcome, loadRunDir(), parseEmittedOutcome(), renderAggregation(), baseScore(), BLOCKED (+13 more)

### Community 8 - "engine.ts"
Cohesion: 0.13
Nodes (18): BAD, BadFixtureExpectation, RULES, rule, rule, rule, rule, rule (+10 more)

### Community 9 - "orchestrator.ts"
Cohesion: 0.10
Nodes (35): applyEnrichment(), buildEnrichPrompt(), CLARIFY_ENRICH_PROTOCOL, DecisionEnrichment, EnrichedItemSchema, EnrichOutputSchema, EnrichParseResult, MAX_CONTEXT_CHARS (+27 more)

### Community 10 - "generate.test.ts"
Cohesion: 0.10
Nodes (12): complete(), FAKE_ENV, fetchSpy(), jsonResponse(), PET_CLINIC, PROFILE_CONFIG, SECTION_FILES, SESSION_SERVICE (+4 more)

### Community 11 - "consent.ts"
Cohesion: 0.09
Nodes (33): loadBundleAtLevel(), authorizeExecution(), checkPreviewDigest(), consentDigestLine(), EXEC_OPT_IN_ENV, ExecAuthorization, ExecBoundary, execOptInFromEnv() (+25 more)

### Community 12 - "manifest.json"
Cohesion: 0.07
Nodes (28): artifact_hashes, assumptions, contracts, decisions, evidence, glossary, intent, requirements (+20 more)

### Community 13 - "distiller.ts"
Cohesion: 0.16
Nodes (15): DistillerInputs, distillRenewalQuestions(), makeRenewalDriver(), RENEWAL_CLAIM_ID, STRATEGY_CLAIM_ID, STRATEGY_OPTIONS, strategyQuestion(), analysisWithUncertainty() (+7 more)

### Community 14 - "check.ts"
Cohesion: 0.29
Nodes (9): CheckOutcome, Executor, runChecks(), tail(), CheckOptions, CheckResult, cmdCheck(), expectedActual() (+1 more)

### Community 15 - "fs.ts"
Cohesion: 0.15
Nodes (19): TrustFsError, authorizedCopyWrite(), authorizedCreateDirAtomically(), authorizedEnsureDir(), authorizedRemoveTree(), authorizedRenameNoClobber(), authorizedStat(), authorizedWrite() (+11 more)

### Community 16 - "llm-config.ts"
Cohesion: 0.10
Nodes (23): RFC-7230, BaseUrlSchema, GLM, resolveSingleRole(), HeaderNameSchema, LINK_LOCAL_PREFIXES, LlmConfig, LlmConfigSchema (+15 more)

### Community 17 - "server.ts"
Cohesion: 0.09
Nodes (19): ARG_SPECS, ArgName, ArgValidator, CallContext, configLoadCache, CoreResult, defaultRenewalBudget(), DIR_PROPERTY (+11 more)

### Community 18 - "doctor.ts"
Cohesion: 0.10
Nodes (30): BIN_FILES, BUDGET_ENV, checkBins(), checkBudgetEnv(), checkLlmConfig(), checkLock(), checkMcpFlags(), checkNodeVersion() (+22 more)

### Community 19 - "workspace-copy.ts"
Cohesion: 0.15
Nodes (14): DEFAULT_INGEST_LIMITS, DENIED_BASE_PATTERNS, DENIED_DIRS, guardPath(), GuardVerdict, IngestLimits, isDeniedDirectory(), looksBinary() (+6 more)

### Community 20 - "structural.ts"
Cohesion: 0.12
Nodes (21): FIXTURE_SRC, freshDir(), graphWorkspace(), readFileFixture(), tmpDirs, bindStructuralArtifacts(), artifactSet(), bindingFor() (+13 more)

### Community 21 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, esModuleInterop, lib, module, moduleResolution, noEmitOnError, outDir, rootDir (+11 more)

### Community 22 - "SpecBundleSchema"
Cohesion: 0.11
Nodes (10): GOOD, BAD, BadFixtureExpectation, FIXTURES, GOOD, SpecBundleForExport, GENERATED_PATH, SpecBundleSchema (+2 more)

### Community 23 - "trust/state.ts"
Cohesion: 0.16
Nodes (22): RenewalProjectSchema, applyStateMutation(), fenceBeforeWrite(), fenceWriterLock(), journalIsOurs(), journalOnDisk(), lockStillOurs(), persistTrustedJson() (+14 more)

### Community 24 - "revision.ts"
Cohesion: 0.22
Nodes (16): cmdFreeze(), FreezeResult, acquireSpecRootLock(), backupPathFor(), breakStaleLock(), createDirAtomically(), fsyncDir(), LockIdentity (+8 more)

### Community 25 - "adapter.ts"
Cohesion: 0.11
Nodes (21): LlmCompleteOptions, LlmResponse, MockScript, SCRIPT, MockEvalScripts, baseConfig(), jsonResponse(), okBody() (+13 more)

### Community 26 - "scale-benchmark.test.ts"
Cohesion: 0.17
Nodes (8): ClosureFinding, ClosureFindingCode, closureFindings(), DuplicateTaskId, duplicateTaskIds(), CEILINGS_MS, mkTask(), syntheticBundle()

### Community 27 - "lifecycle.ts"
Cohesion: 0.09
Nodes (34): applyChangeSet(), ApplyResult, ChangeSet, ChangeSetSchema, formatIssues(), cleanLint, FIXTURES, freeze() (+26 more)

### Community 28 - "check.test.ts"
Cohesion: 0.15
Nodes (12): EXPECT_GRAMMAR_DOC, EXPECTED_EXIT_PATTERN, isJudgeableExpect(), parseExpect(), evidenceOf(), evidencePath(), FIXTURES, freshRoot() (+4 more)

### Community 29 - "eval/runner.ts"
Cohesion: 0.12
Nodes (34): CouncilTopology, DecomposedCouncilDeps, runDecomposedCouncil(), CLARIFY_RULES, CLASSIFY_RULES, CONSTRAINT_FIDELITY, decomposedClassifier(), decomposedJudge() (+26 more)

### Community 30 - "orders.ts"
Cohesion: 0.22
Nodes (13): checkStock(), decrementStock(), stock, CATALOG, quote(), run(), createOrder(), OrderResult (+5 more)

### Community 31 - "pipeline.ts"
Cohesion: 0.09
Nodes (24): MAX_RECOVERY_PROMPT_BYTES, RecoveryOutcome, RecoveryRequest, UsageState, zodIssues(), AnalysisUsageSchema, AnchorResult, AnchorResultSchema (+16 more)

### Community 32 - "commands/plan.test.ts"
Cohesion: 0.17
Nodes (4): compiledBundle(), FIXTURES, SECTION_FILES, tmpDirs

### Community 33 - "ledger.ts"
Cohesion: 0.05
Nodes (63): emptyOverlay(), emptyParity(), nextOverlayId(), nextParityId(), OVERLAY_RELATIONS, OverlayEntityRefSchema, OverlayLoad, OverlayRecord (+55 more)

### Community 34 - "graphify-adapter.test.ts"
Cohesion: 0.10
Nodes (16): compareTriple(), GraphifyAdapterOptions, cleanup, installedVersion, parseGraphifyVersion(), bindingTextFor(), fixtureGraphText, fixturePath (+8 more)

### Community 35 - "constraint-trace.test.ts"
Cohesion: 0.18
Nodes (13): et07Requirement(), et12Requirement(), failureCodes(), FIXTURES, genericBundleFor(), groundedEt01(), groundedEt02(), groundedEt04() (+5 more)

### Community 36 - "planner/plan.ts"
Cohesion: 0.29
Nodes (12): ArchitectureView, RenewalProject, ProjectSnapshot, OverlayStore, ParityStore, OverlayStalenessResult, PlanInputs, PlanOutcome (+4 more)

### Community 37 - "runner-roles.test.ts"
Cohesion: 0.33
Nodes (3): complete(), et01Bundle(), PET_CLINIC

### Community 38 - "devDependencies"
Cohesion: 0.15
Nodes (13): jsdom, devDependencies, jsdom, @types/node, typescript, vitest, @vitest/coverage-v8, zod-to-json-schema (+5 more)

### Community 39 - "fixture-provider.ts"
Cohesion: 0.11
Nodes (28): StaticGraphProvider, fixturePath, parsed, affectedReverse(), godNodes(), graphHealthOf(), neighborhood(), querySeeds() (+20 more)

### Community 40 - "planner/plan.test.ts"
Cohesion: 0.26
Nodes (11): archView, baseInputs(), blastRadius(), fixtureGraphPath, graphParsed, MANIFEST, ruledParity(), sha() (+3 more)

### Community 41 - "renew.ts"
Cohesion: 0.11
Nodes (38): commandHelp(), renewSubHelp(), affectedSync(), analyzeWithFresh(), cmdRenewAnalyze(), cmdRenewExport(), cmdRenewInit(), cmdRenewPlan() (+30 more)

### Community 42 - "SpecBundle"
Cohesion: 0.07
Nodes (17): compileLintFreeze(), SECTION_PATHS, tmpDirs, FreezeResult, lintBundle(), FIXTURES, FIXTURES, FIXTURES (+9 more)

### Community 43 - "schemas/index.ts"
Cohesion: 0.06
Nodes (49): Contract, Decision, EvidenceItem, GlossaryEntry, InitOptions, InitResult, Intent, Requirement (+41 more)

### Community 44 - "model.ts"
Cohesion: 0.10
Nodes (27): AnswerCheck, answerToUserAnswer(), applyAnswersToRecords(), ApplyResult, attachStatuses(), open(), QUESTIONS, ClarificationAnswer (+19 more)

### Community 45 - "change.ts"
Cohesion: 0.17
Nodes (10): applyUnderLock(), ChangeResult, cmdChange(), findingLine(), FIXTURES, frozenSpecRoot(), inlineBundle(), makeSpecRoot() (+2 more)

### Community 46 - "spec-core/package.json"
Cohesion: 0.22
Nodes (8): description, engines, node, license, main, name, type, version

### Community 47 - "src/clarify/approvals.ts"
Cohesion: 0.18
Nodes (14): AnswerLedgerSchema, answersExportDocument(), APPROVAL_RECORD_SCHEMA_ID, approvalFileName(), ApprovalRecord, ApprovalRecordSchema, buildApprovalRecord(), ChangeLedgerSchema (+6 more)

### Community 48 - "paths.ts"
Cohesion: 0.13
Nodes (23): transitiveRenewalRootCheck(), refuseIfInsideTarget(), assertDisjointRealRoots(), assertNoSymlinkBelow(), assertWritableSpecDir(), authorizeRenewalPaths(), tmpDirs, checkMcpDir() (+15 more)

### Community 49 - "providers.ts"
Cohesion: 0.23
Nodes (13): buildLlmPlanFromProfile(), CostExtractor, createOpenAiCompatibleLlm(), RoutingMode, buildRoleAdapter(), openRouterCost(), resolveRoleConfig(), RoleCallContext (+5 more)

### Community 50 - "budget.ts"
Cohesion: 0.08
Nodes (33): errOf(), Command, COMMANDS, GenerateVariant, InitProfile, parseArgs(), parseRenew(), ParseResult (+25 more)

### Community 51 - "package.json"
Cohesion: 0.25
Nodes (7): _archival, name, packageManager, private, scripts, test:spec, version

### Community 52 - "root-invariants.test.ts"
Cohesion: 0.22
Nodes (13): build(), ctxWindow(), FIXTURE_SRC, freshDir(), graphCaps(), groundedResponse(), initProject(), interiorCitation() (+5 more)

### Community 53 - "paid.ts"
Cohesion: 0.19
Nodes (14): renewalConsentState(), domainDigest(), accountCompletionAttempts(), createPaidOperation(), deepFreeze(), deepFreezeRoute(), BASE_ENV, MAX_RECOVERY_WIRE_BYTES (+6 more)

### Community 54 - "l12.test.ts"
Cohesion: 0.21
Nodes (8): firstOverlap(), globSegments(), globsOverlap(), rule, segmentsOverlap(), FIXTURES, refMatch(), refPathMatch()

### Community 55 - "transaction-atomicity.test.ts"
Cohesion: 0.08
Nodes (40): renewalPaths, applyApprovalToParity(), dirs, MINIMAL_PROJECT, MINIMAL_SNAPSHOT, persistRenewalProject(), persistSnapshotFile(), ProjectLoad (+32 more)

### Community 56 - "parseGraphText"
Cohesion: 0.06
Nodes (39): LLM_ROLES, LlmRoute, singleRoutePlan(), initProject(), FIXTURE_SRC, tmpDirs, caps(), parseGraphText() (+31 more)

### Community 57 - "copy-browser-assets.js"
Cohesion: 0.25
Nodes (7): { copyFileSync, mkdirSync, readdirSync, writeFileSync }, files, { join }, MIME, outDir, root, srcDir

### Community 58 - "renew-consent-effectual.test.ts"
Cohesion: 0.11
Nodes (17): generateOptInFromEnv(), callRenewAnalyze(), callRenewStatus(), FIXTURES, TMP_PIN, tmpDirs, errorResponse(), callTool() (+9 more)

### Community 59 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck (+7 more)

### Community 61 - "tasks/index.ts"
Cohesion: 0.14
Nodes (30): allUnGrounded(), anchorSentences(), checkConstraintTrace(), commitmentSurfaces(), ConstraintFailure, ConstraintFailureCode, containsTerm(), containsWholeTerm() (+22 more)

### Community 62 - "report.ts"
Cohesion: 0.10
Nodes (29): BadFixtureCapture, groundedBundleFor(), BAD, BadFixtureExpectation, buildMockScripts(), deriveBundle(), EvalEvidence, finishEvidence() (+21 more)

### Community 63 - "schemas/version.ts"
Cohesion: 0.36
Nodes (7): checkSpecSchemaVersion(), ParsedVersion, parseVersion(), SPEC_SCHEMA_VERSION, SpecSchemaVersionFieldSchema, SpecSchemaVersionVerdict, SUPPORTED

### Community 64 - "graph-reader.ts"
Cohesion: 0.10
Nodes (18): ArchitectureViewSchema, buildArchitectureView(), GENERATED_PATTERNS, isGeneratedPath(), fixturePath, loadGraph(), MANIFEST, rawFixture (+10 more)

### Community 65 - "review-changes.ts"
Cohesion: 0.17
Nodes (12): changeRequestEvidence, ChangeSetValidation, CLARIFY_REVIEW_CHANGES_PROTOCOL, MAX_CHANGE_INSTRUCTION_CHARS, MAX_CHANGES_PER_SET, ReviewChange, ReviewChangeSchema, ReviewChangeSet (+4 more)

### Community 66 - "isolation.test.ts"
Cohesion: 0.39
Nodes (6): FIXTURE_SRC, freshDir(), graphCaps(), initializedPair(), makeTarget(), tmpDirs

### Community 67 - "context/redact.ts"
Cohesion: 0.31
Nodes (9): credentialAssignmentEnd(), isIdentCont(), isIdentStart(), isInlineSpace(), isValueStop(), redactCredentialAssignments(), RedactionResult, Rule (+1 more)

### Community 68 - "runcli-renew.test.ts"
Cohesion: 0.40
Nodes (5): FIXTURE_SRC, freshDir(), graphifyAvailable, makeTarget(), tmpDirs

### Community 69 - "GraphifyAdapter"
Cohesion: 0.27
Nodes (3): GraphifyAdapter, tail(), IntelFailure

### Community 70 - "tranche4.test.ts"
Cohesion: 0.11
Nodes (21): BuildStrategyArgs, buildStrategyDecision(), persistStrategy(), loadStrategyFile(), tmpDirs, renderRenewalReport(), loadAnalysisRecords(), nextAnalysisId() (+13 more)

### Community 71 - "sha256Content"
Cohesion: 0.19
Nodes (11): canonicalJson(), FAMILY_SECTIONS, projectReview(), ReviewSection, ReviewSegment, segment(), specContentDigest(), evidenceOf() (+3 more)

### Community 72 - "errors.ts"
Cohesion: 0.18
Nodes (8): isTrustError(), TrustAuthorityError, TrustCitationError, TrustDomainTag, TrustError, TrustPaidError, TrustStateError, TrustStructuralError

### Community 73 - "check/runner.test.ts"
Cohesion: 0.15
Nodes (6): DEFAULT_TIMEOUT_MS, FakeCall, FIXTURES, PET_CLINIC, tmpDirs, Verification

### Community 74 - "scripts"
Cohesion: 0.22
Nodes (9): scripts, build, lint, prepublishOnly, pretest, smoke:packed, test, test:coverage (+1 more)

### Community 75 - "stdio.ts"
Cohesion: 0.12
Nodes (18): isJsonRpcId(), isPlainObject(), validateJsonRpcEnvelope(), EPIPE_DRAIN_TIMEOUT_MS, EXIT_CLIENT_GONE, EXIT_DRAIN_TIMEOUT, EXIT_OK, MAX_FRAME_BYTES (+10 more)

### Community 76 - "write-spec.ts"
Cohesion: 0.21
Nodes (10): buildSections(), cmdInit(), pathExists(), SECTION_KEYS, stageSpecDir(), PET_CLINIC, SECTION_FILES, tmpDirs (+2 more)

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
Cohesion: 0.17
Nodes (6): childCtl, FIXTURES, PET_CLINIC, tmpDirs, Verification, killActiveProcessGroups()

### Community 81 - "context-provider.ts"
Cohesion: 0.09
Nodes (34): ContextBundle, ContextBundleSchema, ContextItem, ContextItemSchema, ContextLimits, RENEW_CONTEXT_LIMITS, AnalysisScope, ContextProvider (+26 more)

### Community 82 - "concurrency.test.ts"
Cohesion: 0.25
Nodes (8): capsWith(), complete(), ctxWindow(), FIXTURE_SRC, fixtureGraph(), freshReviewedProject(), OUTPUT(), tmpDirs

### Community 83 - "legacy-app/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, version

### Community 84 - "snapshot.ts"
Cohesion: 0.16
Nodes (21): createSnapshot(), deriveSnapshotId(), ProjectSnapshotSchema, reloadSnapshot(), Sha256, SnapshotFileEntrySchema, snapshotIdentityPayload(), SnapshotInputs (+13 more)

### Community 85 - "council.test.ts"
Cohesion: 0.10
Nodes (11): BUNDLE_OK(), CLASSIFIER_BLOCK, CLASSIFIER_OK, complete(), et01Bundle(), PET_CLINIC, PET_CLINIC, U (+3 more)

### Community 86 - "models.ts"
Cohesion: 0.15
Nodes (12): BUILTIN_PROVIDERS, cmdModels(), fmt(), MAX_CATALOG_BYTES, ModelCatalogEntry, MODELS_REQUEST_TIMEOUT_MS, ModelsOptions, ModelsResult (+4 more)

### Community 87 - "authority.ts"
Cohesion: 0.09
Nodes (30): loadRenewalApproval(), nextRenewalApprovalId(), RenewalApprovalLoad, RenewalDecisionSetSchema, payload, tmpDirs, WriteApprovalResult, writeRenewalApproval() (+22 more)

### Community 88 - "revision.branch-coverage.test.ts"
Cohesion: 0.12
Nodes (7): fsCtl, tmpDirs, DEFAULT_STALE_MS, LOCK_FILE, LockHeldError, fsyncCtl, tmpDirs

### Community 89 - "orchestrator.branch-coverage.test.ts"
Cohesion: 0.43
Nodes (7): atReview(), blockedBundle(), bundle(), complete(), OPTS, scriptedLlm(), sessionWith()

### Community 90 - "commands/plan.ts"
Cohesion: 0.13
Nodes (15): cmdPlan(), PlanOptions, PlanResult, PlanTask, renderHuman(), renderJson(), TopoResult, topoSort() (+7 more)

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
Cohesion: 0.13
Nodes (24): ClarifySessionOptions, checkIntent(), clarificationBlock(), cmdGenerate(), DEFAULT_GENERATE_PROFILE, DEFAULT_GENERATE_VARIANT, GenerateOptions, GenerateResult (+16 more)

### Community 96 - "cli.test.ts"
Cohesion: 0.22
Nodes (3): FIXTURES, SECTION_FILES, tmpDirs

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
Cohesion: 0.10
Nodes (16): cmdTrace(), renderTrace(), compiledBundle(), FIXTURES, SECTION_FILES, tmpDirs, TraceResult, buildTrace() (+8 more)

### Community 102 - "verifier.ts"
Cohesion: 0.24
Nodes (10): AnchorBatchResult, AnchorFailureCode, AnchorVerification, canonicalFileHash(), CodeAnchorInput, countLines(), isValidAnchorPath(), tmpDirs (+2 more)

### Community 103 - "hash.ts"
Cohesion: 0.12
Nodes (21): artifactHashes(), canonicalSectionHash(), HASHED_SECTIONS, legacyArtifactHashes(), legacySectionHash(), FIXTURES, HASHED_KEYS, cleanLint (+13 more)

### Community 104 - "llm/http.test.ts"
Cohesion: 0.29
Nodes (5): FAKE_ENV, FakeEnv, jsonResponse(), okFetch(), PartialFakeEnv

### Community 105 - "check/redact.ts"
Cohesion: 0.47
Nodes (4): REDACTION_RULES, RedactionRule, redactSecrets(), SecretKind

### Community 106 - "files"
Cohesion: 0.33
Nodes (6): files, dist, examples, generated, LICENSE, README.md

### Community 107 - "clarify.test.ts"
Cohesion: 0.40
Nodes (3): BASE, complete(), unresolvedBundle()

### Community 108 - "corpus-lock.ts"
Cohesion: 0.24
Nodes (16): canonicalJson(), computeCorpusHash(), CORPUS_LOCK_VERSION, CorpusLock, CorpusLockEntry, frozenThresholds, loadCorpusLock(), lockCandidates() (+8 more)

### Community 109 - "report.test.ts"
Cohesion: 0.60
Nodes (4): fixtures15(), liveInput(), passInput(), passRuns()

### Community 112 - "openai-compatible.test.ts"
Cohesion: 0.83
Nodes (3): baseConfig(), jsonResponse(), okBody()

### Community 114 - "runPipeline"
Cohesion: 0.15
Nodes (19): BudgetLedger, measurePromptSizes(), LlmUsage, CLASSIFY_RULES, classifyAndProposeSingle(), classifySingle(), CONSTRAINT_FIDELITY, intentBlock() (+11 more)

### Community 115 - "eval/runner.test.ts"
Cohesion: 0.24
Nodes (7): complete(), counterOnlyUnresolvedBundle(), et01Bundle(), PET_CLINIC, proposalAJson(), unresolvedAddedBundle(), unresolvedPlusLintDirtyBundle()

### Community 116 - "server.test.ts"
Cohesion: 0.10
Nodes (19): EXEC_ROOT_ENV, generateConsentDigest(), callTool(), expectIdentical(), FIXTURES, freshOutside(), freshRoot(), frozenRoot() (+11 more)

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
- **693 isolated node(s):** `FIXTURES`, `SECTION_FILES`, `tmpDirs`, `PROFILE_CFG`, `SERVER_VERSION` (+688 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SpecBundle` connect `SpecBundle` to `generate-interactive.ts`, `check/runner.ts`, `compileSpecDir`, `engine.ts`, `orchestrator.ts`, `generate.test.ts`, `consent.ts`, `check.ts`, `SpecBundleSchema`, `scale-benchmark.test.ts`, `lifecycle.ts`, `eval/runner.ts`, `commands/plan.test.ts`, `constraint-trace.test.ts`, `planner/plan.ts`, `runner-roles.test.ts`, `schemas/index.ts`, `src/clarify/approvals.ts`, `budget.ts`, `l12.test.ts`, `tasks/index.ts`, `report.ts`, `review-changes.ts`, `sha256Content`, `check/runner.test.ts`, `write-spec.ts`, `generate-interactive.test.ts`, `orchestrator.test.ts`, `runner.branch-coverage.test.ts`, `council.test.ts`, `orchestrator.branch-coverage.test.ts`, `commands/plan.ts`, `generate.ts`, `intent-fidelity.test.ts`, `app.test.ts`, `commands/trace.test.ts`, `hash.ts`, `clarify.test.ts`, `eval/runner.test.ts`?**
  _High betweenness centrality (0.075) - this node is a cross-community bridge._
- **Why does `LlmAdapter` connect `generate.ts` to `generate-interactive.ts`, `pipeline.test.ts`, `orchestrator.ts`, `generate.test.ts`, `distiller.ts`, `server.ts`, `adapter.ts`, `eval/runner.ts`, `runner-roles.test.ts`, `renew.ts`, `providers.ts`, `budget.ts`, `root-invariants.test.ts`, `paid.ts`, `parseGraphText`, `graph-reader.ts`, `sha256Content`, `generate-interactive.test.ts`, `orchestrator.test.ts`, `context-provider.ts`, `concurrency.test.ts`, `council.test.ts`, `authority.ts`, `orchestrator.branch-coverage.test.ts`, `snapshot-trust.test.ts`, `renew-richstate.test.ts`, `app.test.ts`, `clarify.test.ts`, `pipeline.function-coverage.test.ts`, `eval/runner.test.ts`, `server.test.ts`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Why does `GraphifyAdapter` connect `GraphifyAdapter` to `graph-reader.ts`, `graphify-adapter.test.ts`, `fixture-provider.ts`, `renew.ts`, `fs.ts`, `server.ts`, `structural.ts`, `CodeIntelligenceProvider`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **What connects `FIXTURES`, `SECTION_FILES`, `tmpDirs` to the rest of the system?**
  _693 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `generate-interactive.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.052917232021709636 - nodes in this community are weakly interconnected._
- **Should `app.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05217391304347826 - nodes in this community are weakly interconnected._
- **Should `check/runner.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13071895424836602 - nodes in this community are weakly interconnected._