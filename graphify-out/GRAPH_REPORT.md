# Graph Report - llm_council_orchestrator  (2026-09-06)

## Corpus Check
- 402 files · ~421,172 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2669 nodes · 7310 edges · 123 communities (118 shown, 5 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ec6fc68d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- renew/clarify/approvals.ts
- app.ts
- pipeline.test.ts
- check/runner.ts
- cli/index.ts
- sha256Content
- trust/evidence.ts
- live-experiment.ts
- engine.ts
- project.ts
- generate.test.ts
- consent.ts
- manifest.json
- fs.ts
- schemas/index.ts
- budget.ts
- src/clarify/approvals.ts
- parseLlmConfig
- doctor.ts
- generate-interactive.ts
- structural.ts
- compilerOptions
- snapshot.ts
- server.ts
- commands/plan.test.ts
- fixture-provider.ts
- session/state.ts
- hash.ts
- graph-reader.ts
- eval/runner.ts
- orders.ts
- schemas.ts
- trust/state.ts
- coverage-hardening.test.ts
- GraphifyAdapter
- constraint-trace.test.ts
- models.ts
- SpecBundleSchema
- devDependencies
- root-invariants.test.ts
- context-provider.test.ts
- transaction-atomicity.test.ts
- graphify-adapter.test.ts
- createClarifySession
- model.ts
- tasks/index.ts
- spec-core/package.json
- canonical.ts
- paths.ts
- llm-config.ts
- graphify-adapter.ts
- package.json
- review-interactive.test.ts
- paid.ts
- recovery/prompts.ts
- orchestrator.ts
- acquireSpecRootLock
- copy-browser-assets.js
- verifier.ts
- compilerOptions
- schemas/version.ts
- context/redact.ts
- corpus-lock.ts
- cli.test.ts
- pipeline.ts
- tranche4.test.ts
- distiller.ts
- concurrency.test.ts
- scale-benchmark.test.ts
- orchestrator.branch-coverage.test.ts
- generate-interactive.test.ts
- renew-richstate.test.ts
- strategy.ts
- McpStdioServer
- scripts
- stdio.ts
- runner.branch-coverage.test.ts
- architecture.test.ts
- ledger.ts
- orchestrator.test.ts
- check/runner.test.ts
- parseGraphText
- planner/plan.test.ts
- legacy-app/package.json
- models.test.ts
- SpecBundle
- check.ts
- authority.ts
- revision.ts
- renew.ts
- openai-compatible.ts
- snapshot-trust.test.ts
- make-bins-executable.js
- envelope.ts
- adapter.ts
- e2e.test.ts
- check.test.ts
- packed-install-smoke.sh
- CodeIntelligenceProvider
- report.ts
- prepublish-check.js
- egress.test.ts
- score.ts
- compileSpecDir
- cmdRenewAnalyze
- renew-branches.test.ts
- files
- adversarial.test.ts
- app.test.ts
- journey.test.ts
- prepublish-check.boundary.test.ts
- pipeline.function-coverage.test.ts
- revision.test.ts
- llm/http.test.ts
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
- `views()` --calls--> `questionViews()`  [EXTRACTED]
  packages/spec-core/src/clarify/enrich.test.ts → packages/spec-core/src/clarify/model.ts
- `compiledBundle()` --calls--> `compileSpecDir()`  [EXTRACTED]
  packages/spec-core/src/cli/commands/plan.test.ts → packages/spec-core/src/compiler/compile.ts
- `ApplyResult` --references--> `SpecBundle`  [EXTRACTED]
  packages/spec-core/src/compiler/changeset.ts → packages/spec-core/src/schemas/index.ts
- `CompileResult` --references--> `SpecBundle`  [EXTRACTED]
  packages/spec-core/src/compiler/compile.ts → packages/spec-core/src/schemas/index.ts
- `HandleRpcOptions` --references--> `LlmAdapter`  [EXTRACTED]
  packages/spec-core/src/mcp/server.ts → packages/spec-core/src/eval/llm/adapter.ts

## Import Cycles
- 3-file cycle: `packages/spec-core/src/eval/budget.ts -> packages/spec-core/src/eval/llm/http.ts -> packages/spec-core/src/llm/openai-compatible.ts -> packages/spec-core/src/eval/budget.ts`

## Communities (123 total, 5 thin omitted)

### Community 0 - "renew/clarify/approvals.ts"
Cohesion: 0.14
Nodes (11): loadRenewalApproval(), RenewalApprovalLoad, RenewalDecisionSet, RenewalDecisionSetSchema, payload, tmpDirs, WriteApprovalResult, RenewalRoundDriver (+3 more)

### Community 1 - "app.ts"
Cohesion: 0.05
Nodes (76): ApiError, applyChanges(), applyRound(), approve(), bootstrapToken(), call(), cancel(), primeSessionId() (+68 more)

### Community 2 - "pipeline.test.ts"
Cohesion: 0.24
Nodes (8): freshDir(), makeBundle(), persisted, setupTarget(), sha(), tmpDirs, withPricingNodeBound(), withPricingWindowBeyondFile()

### Community 3 - "check/runner.ts"
Cohesion: 0.13
Nodes (19): parseExpect(), REDACTION_RULES, RedactionRule, redactSecrets(), SecretKind, activeProcessGroups, EVIDENCE_FILE_MODE, evidenceRunName() (+11 more)

### Community 4 - "cli/index.ts"
Cohesion: 0.15
Nodes (18): commandHelp(), renewSubHelp(), normalizeFileIntent(), cmdRenewExport(), cmdRenewRefresh(), cmdRenewStatus(), readBudgetEnv(), readEnginesFloor() (+10 more)

### Community 5 - "sha256Content"
Cohesion: 0.22
Nodes (11): userAnswerFromPlainText(), canonicalJson(), FAMILY_SECTIONS, projectReview(), ReviewSection, ReviewSegment, segment(), specContentDigest() (+3 more)

### Community 6 - "trust/evidence.ts"
Cohesion: 0.12
Nodes (18): sealedFor(), bundleDigestCache, bundleDigestPayload(), CitationClaim, contextBundleDigest(), ContextBundleIdentity, ContextRecord, deepFreezeItem() (+10 more)

### Community 7 - "live-experiment.ts"
Cohesion: 0.08
Nodes (40): aggregateEmitted(), Aggregation, EMITTED_SCHEMA, EmittedOutcome, loadRunDir(), parseEmittedOutcome(), renderAggregation(), baseScore() (+32 more)

### Community 8 - "engine.ts"
Cohesion: 0.12
Nodes (21): EXPECT_GRAMMAR_DOC, EXPECTED_EXIT_PATTERN, isJudgeableExpect(), BAD, BadFixtureExpectation, RULES, rule, rule (+13 more)

### Community 9 - "project.ts"
Cohesion: 0.23
Nodes (10): reloadSnapshot(), dirs, MINIMAL_PROJECT, MINIMAL_SNAPSHOT, loadRenewalProject(), loadSnapshotFile(), persistRenewalProject(), persistSnapshotFile() (+2 more)

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
Cohesion: 0.17
Nodes (17): authorizedCopyWrite(), authorizedCreateDirAtomically(), authorizedCreateExclusive(), authorizedEnsureDir(), authorizedRemoveTree(), authorizedRenameNoClobber(), authorizedWrite(), authorizeProjectDestination() (+9 more)

### Community 14 - "schemas/index.ts"
Cohesion: 0.06
Nodes (49): Contract, Decision, EvidenceItem, GlossaryEntry, InitOptions, InitResult, Intent, Requirement (+41 more)

### Community 15 - "budget.ts"
Cohesion: 0.09
Nodes (31): errOf(), Command, COMMANDS, GenerateVariant, InitProfile, parseArgs(), parseRenew(), ParseResult (+23 more)

### Community 16 - "src/clarify/approvals.ts"
Cohesion: 0.17
Nodes (15): AnswerLedgerSchema, answersExportDocument(), APPROVAL_RECORD_SCHEMA_ID, approvalFileName(), ApprovalRecord, ApprovalRecordSchema, buildApprovalRecord(), ChangeLedgerSchema (+7 more)

### Community 17 - "parseLlmConfig"
Cohesion: 0.21
Nodes (8): GLM, resolveSingleRole(), LlmConfig, parseLlmConfig(), resolveProfile(), VALID, zodIssues(), loadLlmConfigForProfiles()

### Community 18 - "doctor.ts"
Cohesion: 0.10
Nodes (30): BIN_FILES, BUDGET_ENV, checkBins(), checkBudgetEnv(), checkLlmConfig(), checkLock(), checkMcpFlags(), checkNodeVersion() (+22 more)

### Community 19 - "generate-interactive.ts"
Cohesion: 0.06
Nodes (39): ASSETS, baseBundle(), blockedJson(), complete(), fakeLlm(), REAL_FETCH, startWorkspace(), ClarifySession (+31 more)

### Community 20 - "structural.ts"
Cohesion: 0.15
Nodes (22): TrustStructuralError, bindStructuralArtifacts(), coerceStructuralBinding(), artifactSet(), bindingFor(), bindingOf(), tmpDirs, workspaceWith() (+14 more)

### Community 21 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, esModuleInterop, lib, module, moduleResolution, noEmitOnError, outDir, rootDir (+11 more)

### Community 22 - "snapshot.ts"
Cohesion: 0.08
Nodes (34): createSnapshot(), deriveSnapshotId(), ProjectSnapshotSchema, Sha256, SnapshotFileEntrySchema, snapshotIdentityPayload(), SnapshotInputs, SnapshotReload (+26 more)

### Community 23 - "server.ts"
Cohesion: 0.09
Nodes (24): DEFAULT_GENERATE_PROFILE, ChangeSet, ExecBoundary, GenerateProfile, GenerateVariant, ARG_SPECS, ArgName, ArgValidator (+16 more)

### Community 24 - "commands/plan.test.ts"
Cohesion: 0.08
Nodes (22): cmdPlan(), PlanOptions, PlanResult, PlanTask, renderHuman(), renderJson(), compiledBundle(), FIXTURES (+14 more)

### Community 25 - "fixture-provider.ts"
Cohesion: 0.13
Nodes (19): StaticGraphProvider, affectedReverse(), godNodes(), neighborhood(), querySeeds(), shortestPath(), fixturePath, parsed (+11 more)

### Community 26 - "session/state.ts"
Cohesion: 0.29
Nodes (9): canTransition(), CLARIFY_SESSION_STATES, ClarifySessionState, isTerminal(), nextSessionState(), TERMINAL, LEGAL, TransitionRule (+1 more)

### Community 27 - "hash.ts"
Cohesion: 0.06
Nodes (49): applyChangeSet(), ApplyResult, ChangeSetSchema, formatIssues(), cleanLint, FIXTURES, freeze(), cleanLint (+41 more)

### Community 28 - "graph-reader.ts"
Cohesion: 0.09
Nodes (22): ArchitectureView, ArchitectureViewSchema, buildArchitectureView(), GENERATED_PATTERNS, isGeneratedPath(), fixturePath, loadGraph(), MANIFEST (+14 more)

### Community 29 - "eval/runner.ts"
Cohesion: 0.07
Nodes (56): ClarifySessionOptions, checkIntent(), clarificationBlock(), cmdGenerate(), GenerateOptions, GenerateResult, IntentCheck, GenerateInteractiveOptions (+48 more)

### Community 30 - "orders.ts"
Cohesion: 0.22
Nodes (13): checkStock(), decrementStock(), stock, CATALOG, quote(), run(), createOrder(), OrderResult (+5 more)

### Community 31 - "schemas.ts"
Cohesion: 0.08
Nodes (20): AnalysisUsageSchema, AnchorResult, AnchorResultSchema, AnchorScope, AnchorScopeSchema, RECOVERY_CATEGORIES, RecoveryHypothesis, RecoveryHypothesisSchema (+12 more)

### Community 32 - "trust/state.ts"
Cohesion: 0.12
Nodes (31): RenewalProject, RenewalProjectSchema, ProjectSnapshot, ParityStore, PlanInputs, StrategyDecision, FIXTURE_SRC, tmpDirs (+23 more)

### Community 33 - "coverage-hardening.test.ts"
Cohesion: 0.14
Nodes (23): emptyOverlay(), nextOverlayId(), OVERLAY_RELATIONS, OverlayRecordSchema, OverlayStoreSchema, parseOverlayStore(), FIXTURE_SRC, freshDir() (+15 more)

### Community 35 - "constraint-trace.test.ts"
Cohesion: 0.10
Nodes (21): et07Requirement(), et12Requirement(), failureCodes(), FIXTURES, genericBundleFor(), groundedEt01(), groundedEt02(), groundedEt04() (+13 more)

### Community 36 - "models.ts"
Cohesion: 0.27
Nodes (9): BUILTIN_PROVIDERS, cmdModels(), fmt(), ModelCatalogEntry, MODELS_REQUEST_TIMEOUT_MS, ModelsOptions, ModelsResult, parseCatalog() (+1 more)

### Community 37 - "SpecBundleSchema"
Cohesion: 0.13
Nodes (8): GOOD, BAD, BadFixtureExpectation, FIXTURES, GOOD, SpecBundleForExport, GENERATED_PATH, SpecBundleSchema

### Community 38 - "devDependencies"
Cohesion: 0.15
Nodes (13): jsdom, devDependencies, jsdom, @types/node, typescript, vitest, @vitest/coverage-v8, zod-to-json-schema (+5 more)

### Community 39 - "root-invariants.test.ts"
Cohesion: 0.20
Nodes (14): MAX_RECOVERY_PROMPT_BYTES, build(), ctxWindow(), FIXTURE_SRC, freshDir(), graphCaps(), groundedResponse(), initProject() (+6 more)

### Community 40 - "context-provider.test.ts"
Cohesion: 0.22
Nodes (8): ContextBundleSchema, SliceReader, FILES, fixturePath, makeProvider(), manifest, parsed, reader()

### Community 41 - "transaction-atomicity.test.ts"
Cohesion: 0.11
Nodes (32): renewalPaths, FIXTURE_SRC, tmpDirs, authorizedRead(), abortEvidencePath(), bumpStateRevisionTrusted(), foreignObjectAtEvidencePath(), loadActiveState() (+24 more)

### Community 42 - "graphify-adapter.test.ts"
Cohesion: 0.08
Nodes (19): GraphifyAdapterOptions, cleanup, installedVersion, parseGraphifyVersion(), bindingTextFor(), fixtureGraphText, fixturePath, validManifestText (+11 more)

### Community 43 - "createClarifySession"
Cohesion: 0.16
Nodes (16): applyEnrichment(), buildEnrichPrompt(), CLARIFY_ENRICH_PROTOCOL, DecisionEnrichment, EnrichedItemSchema, EnrichOutputSchema, EnrichParseResult, MAX_CONTEXT_CHARS (+8 more)

### Community 44 - "model.ts"
Cohesion: 0.13
Nodes (25): AnswerCheck, applyAnswersToRecords(), ApplyResult, open(), QUESTIONS, ClarificationAnswer, ClarificationOptionView, ClarificationQuestionView (+17 more)

### Community 45 - "tasks/index.ts"
Cohesion: 0.05
Nodes (28): BASE, complete(), unresolvedBundle(), BUNDLE_OK(), CLASSIFIER_BLOCK, CLASSIFIER_OK, complete(), et01Bundle() (+20 more)

### Community 46 - "spec-core/package.json"
Cohesion: 0.22
Nodes (8): description, engines, node, license, main, name, type, version

### Community 47 - "canonical.ts"
Cohesion: 0.31
Nodes (7): canonicalJsonOfIds(), CANONICAL_HASH_VERSION, canonicalJson(), canonicalReplacer(), DigestDomain, isKnownHashVersion(), KNOWN_HASH_VERSIONS

### Community 48 - "paths.ts"
Cohesion: 0.13
Nodes (23): transitiveRenewalRootCheck(), refuseIfInsideTarget(), assertDisjointRealRoots(), assertNoSymlinkBelow(), assertWritableSpecDir(), authorizeRenewalPaths(), tmpDirs, checkMcpDir() (+15 more)

### Community 49 - "llm-config.ts"
Cohesion: 0.11
Nodes (20): RFC-7230, BaseUrlSchema, HeaderNameSchema, LINK_LOCAL_PREFIXES, LlmConfigSchema, METADATA_HOSTS, NoProtoKeySchema, OpenRouterRoutingSchema (+12 more)

### Community 50 - "graphify-adapter.ts"
Cohesion: 0.23
Nodes (9): graphHealthOf(), compareTriple(), DEFAULTS, MAX_EXCLUSIVE, MIN_VERSION, tail(), versionSupported(), GraphHealth (+1 more)

### Community 51 - "package.json"
Cohesion: 0.25
Nodes (7): _archival, name, packageManager, private, scripts, test:spec, version

### Community 52 - "review-interactive.test.ts"
Cohesion: 0.25
Nodes (8): analyzedProject(), capsWith(), ctxWindow(), DIST_PRESENT, FIXTURE_SRC, freshDir(), interiorCitation(), tmpDirs

### Community 53 - "paid.ts"
Cohesion: 0.17
Nodes (16): renewalConsentState(), accountCompletionAttempts(), createPaidOperation(), deepFreeze(), deepFreezeRoute(), BASE_ENV, MAX_RECOVERY_WIRE_BYTES, ownField() (+8 more)

### Community 54 - "recovery/prompts.ts"
Cohesion: 0.30
Nodes (13): redactSecrets(), runRecovery(), buildRecoveryPrompt(), buildValidationRetryPrompt(), countEgressRedactions(), EgressProjection, escapeLineUnsafe(), projectItemForEgress() (+5 more)

### Community 55 - "orchestrator.ts"
Cohesion: 0.14
Nodes (17): BehaviorReview, changeRequestEvidence, ChangeSetValidation, CLARIFY_REVIEW_CHANGES_PROTOCOL, MAX_CHANGE_INSTRUCTION_CHARS, MAX_CHANGES_PER_SET, ReviewChange, ReviewChangeSchema (+9 more)

### Community 56 - "acquireSpecRootLock"
Cohesion: 0.18
Nodes (14): buildSections(), cmdInit(), pathExists(), SECTION_KEYS, stageSpecDir(), PET_CLINIC, SECTION_FILES, tmpDirs (+6 more)

### Community 57 - "copy-browser-assets.js"
Cohesion: 0.25
Nodes (7): { copyFileSync, mkdirSync, readdirSync, writeFileSync }, files, { join }, MIME, outDir, root, srcDir

### Community 58 - "verifier.ts"
Cohesion: 0.20
Nodes (10): AnchorBatchResult, AnchorFailureCode, AnchorVerification, canonicalFileHash(), CodeAnchorInput, countLines(), isValidAnchorPath(), tmpDirs (+2 more)

### Community 59 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck (+7 more)

### Community 60 - "schemas/version.ts"
Cohesion: 0.36
Nodes (7): checkSpecSchemaVersion(), ParsedVersion, parseVersion(), SPEC_SCHEMA_VERSION, SpecSchemaVersionFieldSchema, SpecSchemaVersionVerdict, SUPPORTED

### Community 61 - "context/redact.ts"
Cohesion: 0.31
Nodes (9): credentialAssignmentEnd(), isIdentCont(), isIdentStart(), isInlineSpace(), isValueStop(), redactCredentialAssignments(), RedactionResult, Rule (+1 more)

### Community 62 - "corpus-lock.ts"
Cohesion: 0.24
Nodes (16): canonicalJson(), computeCorpusHash(), CORPUS_LOCK_VERSION, CorpusLock, CorpusLockEntry, frozenThresholds, loadCorpusLock(), lockCandidates() (+8 more)

### Community 63 - "cli.test.ts"
Cohesion: 0.22
Nodes (3): FIXTURES, SECTION_FILES, tmpDirs

### Community 64 - "pipeline.ts"
Cohesion: 0.25
Nodes (8): RecoveryDeps, RecoveryOutcome, UsageState, zodIssues(), RECOVERY_PROMPT_PROTOCOL, ResolvedCitation, SealedContext, TrustedAnchorPayload

### Community 65 - "tranche4.test.ts"
Cohesion: 0.13
Nodes (15): emptyOverlay, makeSession(), uncertaintyAnalysis(), setRuling(), loadAnalysisRecords(), LoadedAnalyses, nextAnalysisId(), persistAnalysisRecord() (+7 more)

### Community 66 - "distiller.ts"
Cohesion: 0.12
Nodes (16): DistillerInputs, distillRenewalQuestions(), makeRenewalDriver(), RENEWAL_CLAIM_ID, STRATEGY_CLAIM_ID, STRATEGY_OPTIONS, strategyQuestion(), analysisWithUncertainty() (+8 more)

### Community 67 - "concurrency.test.ts"
Cohesion: 0.25
Nodes (8): capsWith(), complete(), ctxWindow(), FIXTURE_SRC, fixtureGraph(), freshReviewedProject(), OUTPUT(), tmpDirs

### Community 68 - "scale-benchmark.test.ts"
Cohesion: 0.10
Nodes (15): ClosureFinding, ClosureFindingCode, closureFindings(), DuplicateTaskId, firstOverlap(), globSegments(), globsOverlap(), rule (+7 more)

### Community 69 - "orchestrator.branch-coverage.test.ts"
Cohesion: 0.43
Nodes (7): atReview(), blockedBundle(), bundle(), complete(), OPTS, scriptedLlm(), sessionWith()

### Community 70 - "generate-interactive.test.ts"
Cohesion: 0.32
Nodes (6): ASSETS, blocked(), bundle(), fakeLlm(), Ready, run()

### Community 71 - "renew-richstate.test.ts"
Cohesion: 0.24
Nodes (7): analysisRecord(), caps(), FIXTURE_SRC, freshDir(), makeTarget(), sha(), tmpDirs

### Community 72 - "strategy.ts"
Cohesion: 0.29
Nodes (9): BuildStrategyArgs, persistStrategy(), loadStrategyFile(), tmpDirs, MODERNIZATION_STRATEGIES, ModernizationStrategy, parseStrategyDecision(), StrategyDecisionSchema (+1 more)

### Community 74 - "scripts"
Cohesion: 0.22
Nodes (9): scripts, build, lint, prepublishOnly, pretest, smoke:packed, test, test:coverage (+1 more)

### Community 75 - "stdio.ts"
Cohesion: 0.13
Nodes (14): EPIPE_DRAIN_TIMEOUT_MS, EXIT_CLIENT_GONE, EXIT_DRAIN_TIMEOUT, EXIT_OK, MAX_FRAME_BYTES, MAX_IN_FLIGHT, SchedulingPeek, StdioServerLimits (+6 more)

### Community 76 - "runner.branch-coverage.test.ts"
Cohesion: 0.14
Nodes (6): childCtl, FIXTURES, PET_CLINIC, tmpDirs, Verification, execCommand()

### Community 77 - "architecture.test.ts"
Cohesion: 0.31
Nodes (7): allSpecifiers(), importSpecifiers(), PKG, productionFiles(), REL(), renewalSurface(), WRITE_PRIMITIVES

### Community 78 - "ledger.ts"
Cohesion: 0.09
Nodes (35): emptyParity(), nextParityId(), OverlayEntityRefSchema, OverlayLoad, ParityEntry, ParityEntrySchema, ParityEvidenceSchema, ParityLoad (+27 more)

### Community 79 - "orchestrator.test.ts"
Cohesion: 0.27
Nodes (8): MAX_CLARIFY_ROUNDS, atReview(), blockedBundle(), bundle(), complete(), OPTS, scriptedLlm(), sessionWith()

### Community 80 - "check/runner.test.ts"
Cohesion: 0.13
Nodes (7): DEFAULT_TIMEOUT_MS, killActiveProcessGroups(), FakeCall, FIXTURES, PET_CLINIC, tmpDirs, Verification

### Community 81 - "parseGraphText"
Cohesion: 0.11
Nodes (18): FIXTURES, initProject(), TMP_PIN, tmpDirs, graphCaps(), caps(), parseGraphText(), FIXTURE_SRC (+10 more)

### Community 82 - "planner/plan.test.ts"
Cohesion: 0.19
Nodes (13): PlanOutcome, TaskSeed, archView, baseInputs(), blastRadius(), fixtureGraphPath, graphParsed, MANIFEST (+5 more)

### Community 83 - "legacy-app/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, version

### Community 84 - "models.test.ts"
Cohesion: 0.25
Nodes (3): MAX_CATALOG_BYTES, CATALOG, ENV

### Community 85 - "SpecBundle"
Cohesion: 0.04
Nodes (28): cmdTrace(), renderTrace(), FIXTURES, SECTION_FILES, tmpDirs, TraceResult, FreezeResult, FIXTURES (+20 more)

### Community 86 - "check.ts"
Cohesion: 0.36
Nodes (7): CheckOutcome, Executor, CheckOptions, CheckResult, cmdCheck(), expectedActual(), renderReport()

### Community 87 - "authority.ts"
Cohesion: 0.09
Nodes (22): ActiveAuthorityScope, ApprovalDecision, ApprovalDecisionSchema, AuthorityBody, CANONICAL_PARITY_RULINGS, CanonicalParityRuling, RENEWAL_APPROVAL_DIGEST_VERSION, Sha256 (+14 more)

### Community 88 - "revision.ts"
Cohesion: 0.18
Nodes (13): backupPathFor(), fsCtl, tmpDirs, createDirAtomically(), fsyncDir(), LOCK_FILE, LockIdentity, LockOptions (+5 more)

### Community 89 - "renew.ts"
Cohesion: 0.16
Nodes (23): affectedSync(), analyzeWithFresh(), cmdRenewInit(), cmdRenewPlan(), cmdRenewReview(), currentStaleness(), finishReview(), persistGuard() (+15 more)

### Community 90 - "openai-compatible.ts"
Cohesion: 0.11
Nodes (26): buildLlmPlanFromProfile(), ResolvedRole, baseConfig(), jsonResponse(), okBody(), ChatResponse, CostExtractor, createOpenAiCompatibleLlm() (+18 more)

### Community 91 - "snapshot-trust.test.ts"
Cohesion: 0.27
Nodes (10): baseCaps(), ctxWindow(), FIXTURE_SRC, fixtureGraph(), freshDir(), initPair(), interiorCitation(), makeTarget() (+2 more)

### Community 92 - "make-bins-executable.js"
Cohesion: 0.50
Nodes (3): BINS, { join }, { readFileSync, chmodSync }

### Community 93 - "envelope.ts"
Cohesion: 0.19
Nodes (19): computeCostEnvelope(), CostEnvelope, measurePromptSizes(), PromptSize, renderCostEnvelopeTable(), VariantEnvelope, CLASSIFY_RULES, classifyAndProposeSingle() (+11 more)

### Community 94 - "adapter.ts"
Cohesion: 0.09
Nodes (22): LlmAdapter, LlmCompleteOptions, LlmResponse, MockScript, SCRIPT, isLlmPlan(), LLM_ROLES, LlmRoute (+14 more)

### Community 95 - "e2e.test.ts"
Cohesion: 0.29
Nodes (4): dirHash(), FIXTURE_SRC, sha(), tmpDirs

### Community 96 - "check.test.ts"
Cohesion: 0.21
Nodes (8): evidenceOf(), evidencePath(), FIXTURES, freshRoot(), initRoot(), makeSpecRoot(), SECTION_FILES, tmpDirs

### Community 97 - "packed-install-smoke.sh"
Cohesion: 1.00
Nodes (3): run(), say(), packed-install-smoke.sh script

### Community 99 - "report.ts"
Cohesion: 0.08
Nodes (36): BadFixtureCapture, calcs(), GateCalcs, GateReportInput, gateVerdict, groundedBundleFor(), BAD, BadFixtureExpectation (+28 more)

### Community 100 - "prepublish-check.js"
Cohesion: 0.29
Nodes (5): describe, pkg, result, { spawnSync }, status

### Community 101 - "egress.test.ts"
Cohesion: 0.15
Nodes (9): ContextBundle, ContextItemSchema, RENEW_CONTEXT_LIMITS, FIXTURE_SRC, tmpDirs, RecoveryRequest, RecoveryPromptArgs, ITEMS (+1 more)

### Community 102 - "score.ts"
Cohesion: 0.17
Nodes (24): allUnGrounded(), anchorSentences(), checkConstraintTrace(), commitmentSurfaces(), ConstraintFailure, ConstraintFailureCode, containsTerm(), containsWholeTerm() (+16 more)

### Community 103 - "compileSpecDir"
Cohesion: 0.05
Nodes (52): applyUnderLock(), ChangeResult, cmdChange(), findingLine(), FIXTURES, frozenSpecRoot(), inlineBundle(), makeSpecRoot() (+44 more)

### Community 104 - "cmdRenewAnalyze"
Cohesion: 0.27
Nodes (9): cmdRenewAnalyze(), analyzedProject(), caps(), ctxWindow(), FIXTURE_SRC, freshDir(), interiorCitation(), tmpDirs (+1 more)

### Community 105 - "renew-branches.test.ts"
Cohesion: 0.39
Nodes (6): caps(), FIXTURE_SRC, freshDir(), initProject(), makeTarget(), tmpDirs

### Community 106 - "files"
Cohesion: 0.33
Nodes (6): files, dist, examples, generated, LICENSE, README.md

### Community 108 - "app.test.ts"
Cohesion: 0.32
Nodes (6): ASSETS, blocked(), bootApp(), bundle(), settle(), waitFor()

### Community 109 - "journey.test.ts"
Cohesion: 0.22
Nodes (7): capsWith(), CONFORMING_OUTPUT(), FIXTURE_SRC, interiorCitation(), inventory(), sha(), tmpDirs

### Community 110 - "prepublish-check.boundary.test.ts"
Cohesion: 0.50
Nodes (3): DIST_PRESENT, git(), makeRepo()

### Community 112 - "revision.test.ts"
Cohesion: 0.20
Nodes (4): DEFAULT_STALE_MS, LockHeldError, fsyncCtl, tmpDirs

### Community 114 - "llm/http.test.ts"
Cohesion: 0.22
Nodes (6): BudgetExceededError, FAKE_ENV, FakeEnv, jsonResponse(), okFetch(), PartialFakeEnv

### Community 115 - "context-provider.ts"
Cohesion: 0.24
Nodes (7): ContextItem, ContextLimits, AnalysisScope, ContextProvider, GraphContextProvider, GraphContextProviderOptions, parseLoc()

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
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SpecBundle` connect `SpecBundle` to `check/runner.ts`, `sha256Content`, `engine.ts`, `generate.test.ts`, `consent.ts`, `schemas/index.ts`, `budget.ts`, `src/clarify/approvals.ts`, `generate-interactive.ts`, `commands/plan.test.ts`, `hash.ts`, `eval/runner.ts`, `constraint-trace.test.ts`, `SpecBundleSchema`, `tasks/index.ts`, `orchestrator.ts`, `acquireSpecRootLock`, `scale-benchmark.test.ts`, `orchestrator.branch-coverage.test.ts`, `generate-interactive.test.ts`, `runner.branch-coverage.test.ts`, `orchestrator.test.ts`, `check/runner.test.ts`, `planner/plan.test.ts`, `check.ts`, `report.ts`, `score.ts`, `compileSpecDir`, `app.test.ts`?**
  _High betweenness centrality (0.082) - this node is a cross-community bridge._
- **Why does `LlmAdapter` connect `adapter.ts` to `pipeline.test.ts`, `generate.test.ts`, `budget.ts`, `generate-interactive.ts`, `server.ts`, `eval/runner.ts`, `root-invariants.test.ts`, `tasks/index.ts`, `review-interactive.test.ts`, `paid.ts`, `orchestrator.ts`, `concurrency.test.ts`, `orchestrator.branch-coverage.test.ts`, `generate-interactive.test.ts`, `renew-richstate.test.ts`, `orchestrator.test.ts`, `openai-compatible.ts`, `snapshot-trust.test.ts`, `e2e.test.ts`, `egress.test.ts`, `cmdRenewAnalyze`, `renew-branches.test.ts`, `adversarial.test.ts`, `app.test.ts`, `journey.test.ts`, `pipeline.function-coverage.test.ts`, `server.test.ts`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Why does `SpecBundleSchema` connect `SpecBundleSchema` to `report.ts`, `scale-benchmark.test.ts`, `compileSpecDir`, `engine.ts`, `generate.test.ts`, `runner.branch-coverage.test.ts`, `schemas/index.ts`, `check/runner.test.ts`, `src/clarify/approvals.ts`, `doctor.ts`, `planner/plan.test.ts`, `SpecBundle`, `eval/runner.ts`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _703 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `renew/clarify/approvals.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1437908496732026 - nodes in this community are weakly interconnected._
- **Should `app.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05217391304347826 - nodes in this community are weakly interconnected._
- **Should `check/runner.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.12554112554112554 - nodes in this community are weakly interconnected._