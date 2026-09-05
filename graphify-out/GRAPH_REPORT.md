# Graph Report - llm_council_orchestrator  (2026-09-05)

## Corpus Check
- 390 files · ~400,337 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2599 nodes · 7132 edges · 119 communities (117 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e7c864ec`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- server/http.ts
- app.ts
- pipeline.test.ts
- check/runner.ts
- compileSpecDir
- fs-coverage.test.ts
- trust/evidence.ts
- live-experiment.ts
- engine.ts
- AnalysisRecord
- generate.test.ts
- consent.ts
- manifest.json
- distiller.ts
- recovery/prompts.ts
- GraphifyAdapter
- llm-config.ts
- envelope.ts
- doctor.ts
- workspace-copy.ts
- structural.ts
- compilerOptions
- trust/state.ts
- ledger.test.ts
- parseLlmConfig
- providers.ts
- SpecBundleSchema
- lifecycle.ts
- init.ts
- eval/runner.ts
- orders.ts
- pipeline.ts
- check/runner.test.ts
- coverage-hardening.test.ts
- graphify-adapter.ts
- constraint-trace.test.ts
- planner/plan.ts
- tasks/index.ts
- devDependencies
- fixture-provider.ts
- planner/plan.test.ts
- renew.ts
- lintBundle
- schemas/index.ts
- orchestrator.ts
- context-provider.test.ts
- spec-core/package.json
- src/clarify/approvals.ts
- paths.ts
- server.ts
- budget.ts
- package.json
- root-invariants.test.ts
- cli/index.ts
- runner.branch-coverage.test.ts
- renewalPaths
- concurrency.test.ts
- copy-browser-assets.js
- renew-consent-effectual.test.ts
- compilerOptions
- McpStdioServer
- score.ts
- report.ts
- version.ts
- graph-reader.ts
- review-changes.ts
- fs.ts
- context/redact.ts
- revision.branch-coverage.test.ts
- journey.test.ts
- tranche4.test.ts
- review.ts
- openai-compatible.test.ts
- singleRoutePlan
- scripts
- stdio.ts
- domainDigest
- architecture.test.ts
- generate-interactive.ts
- orchestrator.test.ts
- check.ts
- context-provider.ts
- planner-trust.test.ts
- legacy-app/package.json
- snapshot.ts
- council.test.ts
- models.ts
- authority.ts
- revision.ts
- orchestrator.branch-coverage.test.ts
- commands/plan.ts
- snapshot-trust.test.ts
- make-bins-executable.js
- parseGraphText
- CodeIntelligenceProvider
- generate.ts
- cli.test.ts
- packed-install-smoke.sh
- cmdRenewAnalyze
- tranche5.test.ts
- prepublish-check.js
- commands/trace.test.ts
- ledger.ts
- SpecBundle
- e2e.test.ts
- intel-contract.test.ts
- files
- composition.test.ts
- EVAL_TASKS
- prepublish-check.boundary.test.ts
- check/redact.ts
- adapter.ts
- eval/runner.test.ts
- server.test.ts
- bin
- readiness.ts
- dependencies
- repository

## God Nodes (most connected - your core abstractions)
1. `SpecBundle` - 85 edges
2. `LlmAdapter` - 52 edges
3. `cmdRenewInit()` - 52 edges
4. `parseGraphText()` - 49 edges
5. `runCli()` - 44 edges
6. `runPipeline()` - 43 edges
7. `compileSpecDir()` - 39 edges
8. `lintBundle()` - 39 edges
9. `sha256Content()` - 38 edges
10. `LlmResponse` - 37 edges

## Surprising Connections (you probably didn't know these)
- `HandleRpcOptions` --references--> `LlmAdapter`  [EXTRACTED]
  packages/spec-core/src/mcp/server.ts → packages/spec-core/src/eval/llm/adapter.ts
- `MockEvalScripts` --references--> `MockScript`  [EXTRACTED]
  packages/spec-core/src/eval/report.ts → packages/spec-core/src/eval/llm/mock.ts
- `PlanTask` --references--> `TaskContract`  [EXTRACTED]
  packages/spec-core/src/cli/commands/plan.ts → packages/spec-core/src/schemas/tasks.ts
- `ApplyResult` --references--> `SpecBundle`  [EXTRACTED]
  packages/spec-core/src/compiler/changeset.ts → packages/spec-core/src/schemas/index.ts
- `CompileResult` --references--> `SpecBundle`  [EXTRACTED]
  packages/spec-core/src/compiler/compile.ts → packages/spec-core/src/schemas/index.ts

## Import Cycles
- 3-file cycle: `packages/spec-core/src/eval/budget.ts -> packages/spec-core/src/eval/llm/http.ts -> packages/spec-core/src/llm/openai-compatible.ts -> packages/spec-core/src/eval/budget.ts`

## Communities (119 total, 2 thin omitted)

### Community 0 - "server/http.ts"
Cohesion: 0.05
Nodes (33): ASSETS, baseBundle(), blockedJson(), complete(), fakeLlm(), REAL_FETCH, startWorkspace(), ASSETS (+25 more)

### Community 1 - "app.ts"
Cohesion: 0.05
Nodes (76): ApiError, applyChanges(), applyRound(), approve(), bootstrapToken(), call(), cancel(), primeSessionId() (+68 more)

### Community 2 - "pipeline.test.ts"
Cohesion: 0.18
Nodes (11): depsFor(), freshDir(), makeBundle(), persisted, sealedFor(), setupTarget(), sha(), tmpDirs (+3 more)

### Community 3 - "check/runner.ts"
Cohesion: 0.16
Nodes (15): parseExpect(), activeProcessGroups, EVIDENCE_FILE_MODE, evidenceRunName(), ExecutorResult, FORCE_SETTLE_GRACE_MS, GROUP_KILL_GRACE_MS, MAX_BUFFER_BYTES (+7 more)

### Community 4 - "compileSpecDir"
Cohesion: 0.05
Nodes (40): applyUnderLock(), ChangeResult, cmdChange(), findingLine(), FIXTURES, frozenSpecRoot(), inlineBundle(), makeSpecRoot() (+32 more)

### Community 5 - "fs-coverage.test.ts"
Cohesion: 0.15
Nodes (13): isTrustError(), TrustAuthorityError, TrustCitationError, TrustDomainTag, TrustError, TrustFsError, TrustPaidError, TrustStateError (+5 more)

### Community 6 - "trust/evidence.ts"
Cohesion: 0.16
Nodes (18): assertSupportPolicy(), bundleDigestPayload(), CitationClaim, CitationClaimSchema, contextBundleDigest(), ContextBundleIdentity, ContextRecord, EvidenceRole (+10 more)

### Community 7 - "live-experiment.ts"
Cohesion: 0.08
Nodes (39): aggregateEmitted(), Aggregation, EMITTED_SCHEMA, EmittedOutcome, loadRunDir(), parseEmittedOutcome(), renderAggregation(), baseScore() (+31 more)

### Community 8 - "engine.ts"
Cohesion: 0.10
Nodes (24): RULES, rule, rule, rule, rule, rule, rule, rule (+16 more)

### Community 9 - "AnalysisRecord"
Cohesion: 0.20
Nodes (11): emptyOverlay, makeSession(), uncertaintyAnalysis(), loadAnalysisRecords(), LoadedAnalyses, nextAnalysisId(), persistAnalysisRecord(), PersistOutcome (+3 more)

### Community 10 - "generate.test.ts"
Cohesion: 0.10
Nodes (12): complete(), FAKE_ENV, fetchSpy(), jsonResponse(), PET_CLINIC, PROFILE_CONFIG, SECTION_FILES, SESSION_SERVICE (+4 more)

### Community 11 - "consent.ts"
Cohesion: 0.10
Nodes (29): authorizeExecution(), checkPreviewDigest(), consentDigestLine(), EXEC_OPT_IN_ENV, ExecAuthorization, ExecBoundary, execOptInFromEnv(), execRootFromEnv() (+21 more)

### Community 12 - "manifest.json"
Cohesion: 0.07
Nodes (28): artifact_hashes, assumptions, contracts, decisions, evidence, glossary, intent, requirements (+20 more)

### Community 13 - "distiller.ts"
Cohesion: 0.22
Nodes (9): distillRenewalQuestions(), makeRenewalDriver(), RENEWAL_CLAIM_ID, STRATEGY_CLAIM_ID, STRATEGY_OPTIONS, strategyQuestion(), analysisWithUncertainty(), sha() (+1 more)

### Community 14 - "recovery/prompts.ts"
Cohesion: 0.30
Nodes (13): redactSecrets(), runRecovery(), buildRecoveryPrompt(), buildValidationRetryPrompt(), countEgressRedactions(), EgressProjection, escapeLineUnsafe(), projectItemForEgress() (+5 more)

### Community 15 - "GraphifyAdapter"
Cohesion: 0.24
Nodes (4): neighborhood(), GraphifyAdapter, IntelFailure, IntelItems

### Community 16 - "llm-config.ts"
Cohesion: 0.12
Nodes (17): RFC-7230, BaseUrlSchema, HeaderNameSchema, LINK_LOCAL_PREFIXES, LlmConfigSchema, METADATA_HOSTS, OpenRouterRoutingSchema, ParseResult (+9 more)

### Community 17 - "envelope.ts"
Cohesion: 0.19
Nodes (19): computeCostEnvelope(), CostEnvelope, measurePromptSizes(), PromptSize, renderCostEnvelopeTable(), VariantEnvelope, CLASSIFY_RULES, classifyAndProposeSingle() (+11 more)

### Community 18 - "doctor.ts"
Cohesion: 0.10
Nodes (30): BIN_FILES, BUDGET_ENV, checkBins(), checkBudgetEnv(), checkLlmConfig(), checkLock(), checkMcpFlags(), checkNodeVersion() (+22 more)

### Community 19 - "workspace-copy.ts"
Cohesion: 0.16
Nodes (15): DEFAULT_INGEST_LIMITS, DENIED_BASE_PATTERNS, DENIED_DIRS, guardPath(), GuardVerdict, IngestLimits, isDeniedDirectory(), looksBinary() (+7 more)

### Community 20 - "structural.ts"
Cohesion: 0.16
Nodes (18): bindStructuralArtifacts(), artifactSet(), bindingFor(), bindingOf(), tmpDirs, workspaceWith(), computeStructuralBinding(), GraphManifestParse (+10 more)

### Community 21 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, esModuleInterop, lib, module, moduleResolution, noEmitOnError, outDir, rootDir (+11 more)

### Community 22 - "trust/state.ts"
Cohesion: 0.14
Nodes (27): abortEvidencePath(), applyStateMutation(), bumpStateRevisionTrusted(), fenceBeforeWrite(), fenceWriterLock(), journalIsOurs(), journalOnDisk(), lockStillOurs() (+19 more)

### Community 23 - "ledger.test.ts"
Cohesion: 0.19
Nodes (13): ParityEntrySchema, parseParityStore(), loadParityFile(), persistParity(), ANCHOR, approval(), freshDir(), hypothesisAnalysis() (+5 more)

### Community 24 - "parseLlmConfig"
Cohesion: 0.19
Nodes (9): GLM, resolveSingleRole(), LlmConfig, parseLlmConfig(), ResolvedRole, resolveProfile(), VALID, zodIssues() (+1 more)

### Community 25 - "providers.ts"
Cohesion: 0.26
Nodes (12): CostExtractor, createOpenAiCompatibleLlm(), RoutingMode, buildRoleAdapter(), openRouterCost(), resolveRoleConfig(), RoleCallContext, SPEC_SCHEMA_TEXT (+4 more)

### Community 26 - "SpecBundleSchema"
Cohesion: 0.09
Nodes (14): ClosureFinding, ClosureFindingCode, closureFindings(), DuplicateTaskId, duplicateTaskIds(), BAD, BadFixtureExpectation, GOOD (+6 more)

### Community 27 - "lifecycle.ts"
Cohesion: 0.10
Nodes (28): applyChangeSet(), ApplyResult, ChangeSet, ChangeSetSchema, formatIssues(), cleanLint, FIXTURES, checkTransition() (+20 more)

### Community 28 - "init.ts"
Cohesion: 0.08
Nodes (24): EXPECT_GRAMMAR_DOC, EXPECTED_EXIT_PATTERN, isJudgeableExpect(), evidenceOf(), evidencePath(), FIXTURES, freshRoot(), initRoot() (+16 more)

### Community 29 - "eval/runner.ts"
Cohesion: 0.11
Nodes (35): validateGenerationOutput(), DecomposedCouncilDeps, runDecomposedCouncil(), CLARIFY_RULES, CLASSIFY_RULES, CONSTRAINT_FIDELITY, decomposedClassifier(), decomposedJudge() (+27 more)

### Community 30 - "orders.ts"
Cohesion: 0.22
Nodes (13): checkStock(), decrementStock(), stock, CATALOG, quote(), run(), createOrder(), OrderResult (+5 more)

### Community 31 - "pipeline.ts"
Cohesion: 0.09
Nodes (23): MAX_RECOVERY_PROMPT_BYTES, RecoveryOutcome, UsageState, zodIssues(), AnalysisUsageSchema, AnchorResult, AnchorResultSchema, AnchorScope (+15 more)

### Community 32 - "check/runner.test.ts"
Cohesion: 0.13
Nodes (7): DEFAULT_TIMEOUT_MS, killActiveProcessGroups(), FakeCall, FIXTURES, PET_CLINIC, tmpDirs, Verification

### Community 33 - "coverage-hardening.test.ts"
Cohesion: 0.13
Nodes (26): nextOverlayId(), OVERLAY_RELATIONS, OverlayEntityRefSchema, OverlayLoad, OverlayRecord, OverlayRecordSchema, OverlayRelation, OverlayStoreSchema (+18 more)

### Community 34 - "graphify-adapter.ts"
Cohesion: 0.10
Nodes (20): compareTriple(), DEFAULTS, GraphifyAdapterOptions, cleanup, installedVersion, MAX_EXCLUSIVE, MIN_VERSION, parseGraphifyVersion() (+12 more)

### Community 35 - "constraint-trace.test.ts"
Cohesion: 0.18
Nodes (13): et07Requirement(), et12Requirement(), failureCodes(), FIXTURES, genericBundleFor(), groundedEt01(), groundedEt02(), groundedEt04() (+5 more)

### Community 36 - "planner/plan.ts"
Cohesion: 0.26
Nodes (12): ArchitectureView, DistillerInputs, OverlayStore, ParityStore, OverlayStalenessResult, parityProjection, PlanInputs, PlanOutcome (+4 more)

### Community 37 - "tasks/index.ts"
Cohesion: 0.06
Nodes (20): BASE, complete(), unresolvedBundle(), FIXTURES, genericBundleFor(), loadFixture(), U, complete() (+12 more)

### Community 38 - "devDependencies"
Cohesion: 0.15
Nodes (13): jsdom, devDependencies, jsdom, @types/node, typescript, vitest, @vitest/coverage-v8, zod-to-json-schema (+5 more)

### Community 39 - "fixture-provider.ts"
Cohesion: 0.13
Nodes (19): StaticGraphProvider, affectedReverse(), graphHealthOf(), querySeeds(), shortestPath(), fixturePath, parsed, ParsedGraph (+11 more)

### Community 40 - "planner/plan.test.ts"
Cohesion: 0.23
Nodes (13): emptyOverlay(), parityFromAnalyses(), archView, baseInputs(), blastRadius(), fixtureGraphPath, graphParsed, MANIFEST (+5 more)

### Community 41 - "renew.ts"
Cohesion: 0.15
Nodes (28): affectedSync(), analyzeWithFresh(), cmdRenewExport(), cmdRenewInit(), cmdRenewPlan(), cmdRenewRefresh(), cmdRenewReview(), cmdRenewStatus() (+20 more)

### Community 42 - "lintBundle"
Cohesion: 0.07
Nodes (14): cmdLint(), LintResult, lintBundle(), FIXTURES, FIXTURES, FIXTURES, FIXTURES, FIXTURES (+6 more)

### Community 43 - "schemas/index.ts"
Cohesion: 0.07
Nodes (42): AssumptionIdSchema, ComplexityProfileSchema, ContractIdSchema, DecisionIdSchema, EvidenceIdSchema, IdSchema, ImpactLevelSchema, RequirementIdSchema (+34 more)

### Community 44 - "orchestrator.ts"
Cohesion: 0.06
Nodes (61): applyEnrichment(), buildEnrichPrompt(), CLARIFY_ENRICH_PROTOCOL, DecisionEnrichment, EnrichedItemSchema, EnrichOutputSchema, EnrichParseResult, MAX_CONTEXT_CHARS (+53 more)

### Community 45 - "context-provider.test.ts"
Cohesion: 0.22
Nodes (8): ContextBundleSchema, SliceReader, FILES, fixturePath, makeProvider(), manifest, parsed, reader()

### Community 46 - "spec-core/package.json"
Cohesion: 0.22
Nodes (8): description, engines, node, license, main, name, type, version

### Community 47 - "src/clarify/approvals.ts"
Cohesion: 0.18
Nodes (14): AnswerLedgerSchema, answersExportDocument(), APPROVAL_RECORD_SCHEMA_ID, approvalFileName(), ApprovalRecord, ApprovalRecordSchema, buildApprovalRecord(), ChangeLedgerSchema (+6 more)

### Community 48 - "paths.ts"
Cohesion: 0.16
Nodes (20): assertDisjointRealRoots(), assertNoSymlinkBelow(), assertWritableSpecDir(), authorizeRenewalPaths(), tmpDirs, checkMcpDir(), ContainedOutputCheck, DisjointRootsCheck (+12 more)

### Community 49 - "server.ts"
Cohesion: 0.09
Nodes (20): DEFAULT_GENERATE_PROFILE, GenerateProfile, GenerateVariant, ARG_SPECS, ArgName, ArgValidator, configLoadCache, CoreResult (+12 more)

### Community 50 - "budget.ts"
Cohesion: 0.07
Nodes (34): errOf(), Command, COMMANDS, GenerateVariant, InitProfile, parseArgs(), parseRenew(), ParseResult (+26 more)

### Community 51 - "package.json"
Cohesion: 0.25
Nodes (7): _archival, name, packageManager, private, scripts, test:spec, version

### Community 52 - "root-invariants.test.ts"
Cohesion: 0.24
Nodes (12): ctxWindow(), FIXTURE_SRC, freshDir(), graphCaps(), groundedResponse(), initProject(), interiorCitation(), makeTarget() (+4 more)

### Community 53 - "cli/index.ts"
Cohesion: 0.12
Nodes (26): commandHelp(), renewSubHelp(), cmdCheck(), normalizeFileIntent(), readBudgetEnv(), readEnginesFloor(), readVersion(), runCli() (+18 more)

### Community 54 - "runner.branch-coverage.test.ts"
Cohesion: 0.14
Nodes (7): childCtl, FIXTURES, PET_CLINIC, tmpDirs, Verification, execCommand(), execInProcessGroup()

### Community 55 - "renewalPaths"
Cohesion: 0.12
Nodes (31): renewalConsentState(), transitiveRenewalRootCheck(), renewalPaths, RenewalProject, RenewalProjectSchema, loadRenewalProject(), loadSnapshotFile(), persistRenewalProject() (+23 more)

### Community 56 - "concurrency.test.ts"
Cohesion: 0.25
Nodes (8): capsWith(), complete(), ctxWindow(), FIXTURE_SRC, fixtureGraph(), freshReviewedProject(), OUTPUT(), tmpDirs

### Community 57 - "copy-browser-assets.js"
Cohesion: 0.25
Nodes (7): { copyFileSync, mkdirSync, readdirSync, writeFileSync }, files, { join }, MIME, outDir, root, srcDir

### Community 58 - "renew-consent-effectual.test.ts"
Cohesion: 0.14
Nodes (14): generateOptInFromEnv(), callRenewAnalyze(), callRenewStatus(), FIXTURES, initProject(), TMP_PIN, tmpDirs, errorResponse() (+6 more)

### Community 59 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck (+7 more)

### Community 60 - "McpStdioServer"
Cohesion: 0.30
Nodes (3): jsonRpcError(), McpStdioServer, makeSession()

### Community 61 - "score.ts"
Cohesion: 0.17
Nodes (25): allUnGrounded(), anchorSentences(), checkConstraintTrace(), commitmentSurfaces(), ConstraintFailure, ConstraintFailureCode, containsTerm(), containsWholeTerm() (+17 more)

### Community 62 - "report.ts"
Cohesion: 0.09
Nodes (33): BadFixtureCapture, groundedBundleFor(), BAD, BadFixtureExpectation, buildMockScripts(), deriveBundle(), EvalEvidence, finishEvidence() (+25 more)

### Community 63 - "version.ts"
Cohesion: 0.36
Nodes (7): checkSpecSchemaVersion(), ParsedVersion, parseVersion(), SPEC_SCHEMA_VERSION, SpecSchemaVersionFieldSchema, SpecSchemaVersionVerdict, SUPPORTED

### Community 64 - "graph-reader.ts"
Cohesion: 0.12
Nodes (16): ArchitectureViewSchema, fixturePath, loadGraph(), MANIFEST, rawFixture, fixturePath, parsed, basename() (+8 more)

### Community 65 - "review-changes.ts"
Cohesion: 0.19
Nodes (11): changeRequestEvidence, ChangeSetValidation, CLARIFY_REVIEW_CHANGES_PROTOCOL, MAX_CHANGE_INSTRUCTION_CHARS, MAX_CHANGES_PER_SET, ReviewChange, ReviewChangeSchema, ReviewChangeSetSchema (+3 more)

### Community 66 - "fs.ts"
Cohesion: 0.20
Nodes (16): authorizedCopyWrite(), authorizedCreateDirAtomically(), authorizedCreateExclusive(), authorizedEnsureDir(), authorizedRemoveTree(), authorizedRenameNoClobber(), authorizedWrite(), authorizeProjectDestination() (+8 more)

### Community 67 - "context/redact.ts"
Cohesion: 0.31
Nodes (9): credentialAssignmentEnd(), isIdentCont(), isIdentStart(), isInlineSpace(), isValueStop(), redactCredentialAssignments(), RedactionResult, Rule (+1 more)

### Community 68 - "revision.branch-coverage.test.ts"
Cohesion: 0.12
Nodes (7): fsCtl, tmpDirs, DEFAULT_STALE_MS, LOCK_FILE, LockHeldError, fsyncCtl, tmpDirs

### Community 69 - "journey.test.ts"
Cohesion: 0.22
Nodes (7): capsWith(), CONFORMING_OUTPUT(), FIXTURE_SRC, interiorCitation(), inventory(), sha(), tmpDirs

### Community 70 - "tranche4.test.ts"
Cohesion: 0.17
Nodes (13): setRuling(), BuildStrategyArgs, persistStrategy(), loadStrategyFile(), tmpDirs, graphOf(), loadStrategyFile(), tmpDirs (+5 more)

### Community 71 - "review.ts"
Cohesion: 0.29
Nodes (7): canonicalJson(), FAMILY_SECTIONS, projectReview(), ReviewSection, ReviewSegment, segment(), specContentDigest()

### Community 72 - "openai-compatible.test.ts"
Cohesion: 0.29
Nodes (7): baseConfig(), jsonResponse(), okBody(), OpenAiCompatibleConfig, baseConfig(), jsonResponse(), okBody()

### Community 73 - "singleRoutePlan"
Cohesion: 0.31
Nodes (8): singleRoutePlan(), caps(), FIXTURE_SRC, freshDir(), initProject(), llmReturning(), makeTarget(), tmpDirs

### Community 74 - "scripts"
Cohesion: 0.22
Nodes (9): scripts, build, lint, prepublishOnly, pretest, smoke:packed, test, test:coverage (+1 more)

### Community 75 - "stdio.ts"
Cohesion: 0.13
Nodes (15): isJsonRpcId(), EPIPE_DRAIN_TIMEOUT_MS, EXIT_CLIENT_GONE, EXIT_DRAIN_TIMEOUT, EXIT_OK, MAX_FRAME_BYTES, MAX_IN_FLIGHT, peekForScheduling() (+7 more)

### Community 76 - "domainDigest"
Cohesion: 0.36
Nodes (8): canonicalJsonOfIds(), CANONICAL_HASH_VERSION, canonicalJson(), canonicalReplacer(), DigestDomain, domainDigest(), isKnownHashVersion(), KNOWN_HASH_VERSIONS

### Community 77 - "architecture.test.ts"
Cohesion: 0.31
Nodes (7): allSpecifiers(), importSpecifiers(), PKG, productionFiles(), REL(), renewalSurface(), WRITE_PRIMITIVES

### Community 78 - "generate-interactive.ts"
Cohesion: 0.16
Nodes (16): sessionLedgerEnvelope(), cmdGenerateInteractive(), EVENT_LINES, GenerateInteractiveResult, openBrowser(), ASSETS, blocked(), bundle() (+8 more)

### Community 79 - "orchestrator.test.ts"
Cohesion: 0.27
Nodes (8): MAX_CLARIFY_ROUNDS, atReview(), blockedBundle(), bundle(), complete(), OPTS, scriptedLlm(), sessionWith()

### Community 80 - "check.ts"
Cohesion: 0.38
Nodes (6): CheckOutcome, Executor, CheckOptions, CheckResult, expectedActual(), renderReport()

### Community 81 - "context-provider.ts"
Cohesion: 0.14
Nodes (14): ContextBundle, ContextItem, ContextItemSchema, ContextLimits, RENEW_CONTEXT_LIMITS, AnalysisScope, ContextProvider, GraphContextProvider (+6 more)

### Community 82 - "planner-trust.test.ts"
Cohesion: 0.29
Nodes (8): analyzedProject(), caps(), ctxWindow(), FIXTURE_SRC, freshDir(), interiorCitation(), rulePreserve(), tmpDirs

### Community 83 - "legacy-app/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, version

### Community 84 - "snapshot.ts"
Cohesion: 0.17
Nodes (21): createSnapshot(), deriveSnapshotId(), ProjectSnapshot, ProjectSnapshotSchema, reloadSnapshot(), Sha256, SnapshotFileEntrySchema, snapshotIdentityPayload() (+13 more)

### Community 85 - "council.test.ts"
Cohesion: 0.28
Nodes (6): BUNDLE_OK(), CLASSIFIER_BLOCK, CLASSIFIER_OK, complete(), et01Bundle(), PET_CLINIC

### Community 86 - "models.ts"
Cohesion: 0.15
Nodes (12): BUILTIN_PROVIDERS, cmdModels(), fmt(), MAX_CATALOG_BYTES, ModelCatalogEntry, MODELS_REQUEST_TIMEOUT_MS, ModelsOptions, ModelsResult (+4 more)

### Community 87 - "authority.ts"
Cohesion: 0.08
Nodes (32): loadRenewalApproval(), RenewalApprovalLoad, RenewalDecisionSet, RenewalDecisionSetSchema, payload, tmpDirs, WriteApprovalResult, FIXTURE_SRC (+24 more)

### Community 88 - "revision.ts"
Cohesion: 0.16
Nodes (18): SECTION_KEYS, stageSpecDir(), PET_CLINIC, SECTION_FILES, tmpDirs, writeSpecDir(), assertNotSymlink(), acquireSpecRootLock() (+10 more)

### Community 89 - "orchestrator.branch-coverage.test.ts"
Cohesion: 0.43
Nodes (7): atReview(), blockedBundle(), bundle(), complete(), OPTS, scriptedLlm(), sessionWith()

### Community 90 - "commands/plan.ts"
Cohesion: 0.13
Nodes (17): cmdPlan(), PlanOptions, PlanResult, PlanTask, renderHuman(), renderJson(), TopoResult, topoSort() (+9 more)

### Community 91 - "snapshot-trust.test.ts"
Cohesion: 0.27
Nodes (10): baseCaps(), ctxWindow(), FIXTURE_SRC, fixtureGraph(), freshDir(), initPair(), interiorCitation(), makeTarget() (+2 more)

### Community 92 - "make-bins-executable.js"
Cohesion: 0.50
Nodes (3): BINS, { join }, { readFileSync, chmodSync }

### Community 93 - "parseGraphText"
Cohesion: 0.12
Nodes (18): graphCaps(), caps(), parseGraphText(), FIXTURE_SRC, freshDir(), graphCaps(), initializedPair(), makeTarget() (+10 more)

### Community 95 - "generate.ts"
Cohesion: 0.09
Nodes (30): ClarifySessionOptions, buildLlmPlanFromProfile(), checkIntent(), clarificationBlock(), cmdGenerate(), DEFAULT_GENERATE_VARIANT, GenerateOptions, GenerateResult (+22 more)

### Community 96 - "cli.test.ts"
Cohesion: 0.22
Nodes (3): FIXTURES, SECTION_FILES, tmpDirs

### Community 97 - "packed-install-smoke.sh"
Cohesion: 1.00
Nodes (3): run(), say(), packed-install-smoke.sh script

### Community 98 - "cmdRenewAnalyze"
Cohesion: 0.27
Nodes (8): cmdRenewAnalyze(), analyzedProject(), capsWith(), ctxWindow(), FIXTURE_SRC, freshDir(), interiorCitation(), tmpDirs

### Community 99 - "tranche5.test.ts"
Cohesion: 0.20
Nodes (7): buildArchitectureView(), GENERATED_PATTERNS, isGeneratedPath(), godNodes(), renderRenewalReport(), tmpDirs, tmpDirs

### Community 100 - "prepublish-check.js"
Cohesion: 0.29
Nodes (5): describe, pkg, result, { spawnSync }, status

### Community 101 - "commands/trace.test.ts"
Cohesion: 0.10
Nodes (16): cmdTrace(), renderTrace(), compiledBundle(), FIXTURES, SECTION_FILES, tmpDirs, TraceResult, buildTrace() (+8 more)

### Community 102 - "ledger.ts"
Cohesion: 0.10
Nodes (24): AnchorBatchResult, AnchorFailureCode, AnchorVerification, canonicalFileHash(), CodeAnchorInput, countLines(), isValidAnchorPath(), tmpDirs (+16 more)

### Community 103 - "SpecBundle"
Cohesion: 0.06
Nodes (43): compileLintFreeze(), SECTION_PATHS, tmpDirs, freeze(), FreezeResult, cleanLint, FIXTURES, frozenPetClinic() (+35 more)

### Community 104 - "e2e.test.ts"
Cohesion: 0.29
Nodes (4): dirHash(), FIXTURE_SRC, sha(), tmpDirs

### Community 105 - "intel-contract.test.ts"
Cohesion: 0.32
Nodes (5): FIXTURE_SRC, freshDir(), graphWorkspace(), readFileFixture(), tmpDirs

### Community 106 - "files"
Cohesion: 0.33
Nodes (6): files, dist, examples, generated, LICENSE, README.md

### Community 107 - "composition.test.ts"
Cohesion: 0.33
Nodes (4): capsWith(), FIXTURE_SRC, freshProject(), tmpDirs

### Community 108 - "EVAL_TASKS"
Cohesion: 0.19
Nodes (20): canonicalJson(), computeCorpusHash(), CORPUS_LOCK_VERSION, CorpusLock, CorpusLockEntry, frozenThresholds, loadCorpusLock(), lockCandidates() (+12 more)

### Community 112 - "check/redact.ts"
Cohesion: 0.47
Nodes (4): REDACTION_RULES, RedactionRule, redactSecrets(), SecretKind

### Community 114 - "adapter.ts"
Cohesion: 0.10
Nodes (19): LlmCompleteOptions, LlmResponse, MockScript, SCRIPT, ChatResponse, parseSuccess(), extractProvenance(), extractUsageDetails() (+11 more)

### Community 115 - "eval/runner.test.ts"
Cohesion: 0.24
Nodes (7): complete(), counterOnlyUnresolvedBundle(), et01Bundle(), PET_CLINIC, proposalAJson(), unresolvedAddedBundle(), unresolvedPlusLintDirtyBundle()

### Community 116 - "server.test.ts"
Cohesion: 0.11
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
- **678 isolated node(s):** `childCtl`, `FIXTURES`, `PET_CLINIC`, `Verification`, `tmpDirs` (+673 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SpecBundle` connect `SpecBundle` to `server/http.ts`, `check/runner.ts`, `compileSpecDir`, `engine.ts`, `generate.test.ts`, `consent.ts`, `SpecBundleSchema`, `lifecycle.ts`, `init.ts`, `eval/runner.ts`, `check/runner.test.ts`, `constraint-trace.test.ts`, `planner/plan.ts`, `tasks/index.ts`, `lintBundle`, `schemas/index.ts`, `orchestrator.ts`, `src/clarify/approvals.ts`, `budget.ts`, `runner.branch-coverage.test.ts`, `score.ts`, `report.ts`, `review-changes.ts`, `review.ts`, `generate-interactive.ts`, `orchestrator.test.ts`, `check.ts`, `council.test.ts`, `revision.ts`, `orchestrator.branch-coverage.test.ts`, `commands/plan.ts`, `generate.ts`, `commands/trace.test.ts`, `eval/runner.test.ts`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **Why does `LlmAdapter` connect `generate.ts` to `server/http.ts`, `pipeline.test.ts`, `generate.test.ts`, `providers.ts`, `eval/runner.ts`, `tasks/index.ts`, `orchestrator.ts`, `server.ts`, `budget.ts`, `root-invariants.test.ts`, `cli/index.ts`, `concurrency.test.ts`, `journey.test.ts`, `singleRoutePlan`, `generate-interactive.ts`, `orchestrator.test.ts`, `context-provider.ts`, `planner-trust.test.ts`, `council.test.ts`, `authority.ts`, `orchestrator.branch-coverage.test.ts`, `snapshot-trust.test.ts`, `parseGraphText`, `cmdRenewAnalyze`, `tranche5.test.ts`, `e2e.test.ts`, `adapter.ts`, `eval/runner.test.ts`, `server.test.ts`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Why does `GraphifyAdapter` connect `GraphifyAdapter` to `graphify-adapter.ts`, `fs.ts`, `tranche5.test.ts`, `fixture-provider.ts`, `intel-contract.test.ts`, `server.ts`, `structural.ts`, `cli/index.ts`, `CodeIntelligenceProvider`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **What connects `childCtl`, `FIXTURES`, `PET_CLINIC` to the rest of the system?**
  _678 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `server/http.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.04972677595628415 - nodes in this community are weakly interconnected._
- **Should `app.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05217391304347826 - nodes in this community are weakly interconnected._
- **Should `compileSpecDir` be split into smaller, more focused modules?**
  _Cohesion score 0.04703753957485301 - nodes in this community are weakly interconnected._