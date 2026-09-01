# Graph Report - llm_council_orchestrator  (2026-09-01)

## Corpus Check
- 260 files · ~235,382 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1588 nodes · 3909 edges · 88 communities (81 shown, 7 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `51f8cc48`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- budget.ts
- app.ts
- openai-compatible.ts
- check/runner.ts
- aggregate.test.ts
- lifecycle.ts
- commands/plan.ts
- generate.ts
- engine.ts
- contracts.ts
- doctor.ts
- run-eval.test.ts
- compileSpecDir
- aggregate.ts
- generate-interactive.ts
- paths.ts
- llm-config.ts
- score.ts
- report.ts
- check.test.ts
- model.ts
- compilerOptions
- version.ts
- review-changes.ts
- live-experiment.ts
- check.ts
- orchestrator.ts
- change.test.ts
- schemas/index.ts
- createClarifySession
- eval/runner.test.ts
- adapter.ts
- server.ts
- tasks/index.ts
- init.ts
- constraint-trace.test.ts
- common.ts
- namespace-ids.test.ts
- devDependencies
- lint/trace.test.ts
- orchestrator.test.ts
- lintBundle
- report.test.ts
- models.ts
- check/runner.test.ts
- consent.ts
- spec-core/package.json
- sha256Content
- SpecBundle
- legacy.ts
- l01.test.ts
- package.json
- generate.test.ts
- l02.test.ts
- l14.ts
- eval/runner.ts
- scale-benchmark.test.ts
- copy-browser-assets.js
- runPipeline
- compilerOptions
- SpecBundleSchema
- cli/index.ts
- l04.test.ts
- l12.test.ts
- l07.test.ts
- l10.test.ts
- council.test.ts
- l03.test.ts
- cli.test.ts
- ClarifySession
- scripts
- stdio.ts
- clarify.test.ts
- strictness.test.ts
- l08.test.ts
- commands/trace.test.ts
- make-bins-executable.js
- packed-install-smoke.sh
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
1. `SpecBundle` - 80 edges
2. `runPipeline()` - 43 edges
3. `compileSpecDir()` - 37 edges
4. `lintBundle()` - 36 edges
5. `LlmAdapter` - 32 edges
6. `runCli()` - 28 edges
7. `createClarifySession()` - 23 edges
8. `el()` - 22 edges
9. `EVAL_TASKS` - 22 edges
10. `SpecBundleSchema` - 22 edges

## Surprising Connections (you probably didn't know these)
- `PlanTask` --references--> `TaskContract`  [EXTRACTED]
  packages/spec-core/src/cli/commands/plan.ts → packages/spec-core/src/schemas/tasks.ts
- `compiledBundle()` --calls--> `compileSpecDir()`  [EXTRACTED]
  packages/spec-core/src/cli/commands/trace.test.ts → packages/spec-core/src/compiler/compile.ts
- `ApplyResult` --references--> `SpecBundle`  [EXTRACTED]
  packages/spec-core/src/compiler/changeset.ts → packages/spec-core/src/schemas/index.ts
- `startWorkspace()` --calls--> `createClarifySession()`  [EXTRACTED]
  packages/spec-core/src/browser-client/app-errors.test.ts → packages/spec-core/src/clarify/session/orchestrator.ts
- `scrubbedExecutor()` --calls--> `execInProcessGroup()`  [EXTRACTED]
  packages/spec-core/src/mcp/consent.ts → packages/spec-core/src/check/runner.ts

## Import Cycles
- 3-file cycle: `packages/spec-core/src/eval/budget.ts -> packages/spec-core/src/eval/llm/http.ts -> packages/spec-core/src/llm/openai-compatible.ts -> packages/spec-core/src/eval/budget.ts`

## Communities (88 total, 7 thin omitted)

### Community 0 - "budget.ts"
Cohesion: 0.06
Nodes (51): Command, COMMANDS, GenerateVariant, InitProfile, ParseResult, SingleDirCommand, DEFAULT_GENERATE_VARIANT, MAX_INTENT_CHARS (+43 more)

### Community 1 - "app.ts"
Cohesion: 0.05
Nodes (76): ApiError, applyChanges(), applyRound(), approve(), bootstrapToken(), call(), cancel(), primeSessionId() (+68 more)

### Community 2 - "openai-compatible.ts"
Cohesion: 0.17
Nodes (18): ResolvedRole, ChatResponse, CostExtractor, createOpenAiCompatibleLlm(), parseSuccess(), extractProvenance(), extractUsageDetails(), HTTP_BACKOFF_SCHEDULE_MS (+10 more)

### Community 3 - "check/runner.ts"
Cohesion: 0.09
Nodes (20): parseExpect(), REDACTION_RULES, RedactionRule, redactSecrets(), SecretKind, activeProcessGroups, EVIDENCE_FILE_MODE, evidenceRunName() (+12 more)

### Community 4 - "aggregate.test.ts"
Cohesion: 0.27
Nodes (8): loadRunDir(), parseEmittedOutcome(), baseScore(), BLOCKED, EmitOverrides, emittedRecord(), GREENFIELD, writeRunDir()

### Community 5 - "lifecycle.ts"
Cohesion: 0.10
Nodes (25): applyChangeSet(), ApplyResult, ChangeSet, ChangeSetSchema, formatIssues(), checkTransition(), FREEZE_REFUSAL_HINTS, LIFECYCLE_STATES (+17 more)

### Community 6 - "commands/plan.ts"
Cohesion: 0.11
Nodes (21): cmdPlan(), PlanOptions, PlanResult, PlanTask, renderHuman(), renderJson(), TopoResult, topoSort() (+13 more)

### Community 7 - "generate.ts"
Cohesion: 0.21
Nodes (15): buildLlmPlanFromProfile(), checkIntent(), clarificationBlock(), cmdGenerate(), GenerateOptions, GenerateResult, IntentCheck, lintReason() (+7 more)

### Community 8 - "engine.ts"
Cohesion: 0.17
Nodes (15): RULES, rule, rule, rule, rule, rule, rule, rule (+7 more)

### Community 9 - "contracts.ts"
Cohesion: 0.50
Nodes (3): ContractIdSchema, ContractSchema, validContract

### Community 10 - "doctor.ts"
Cohesion: 0.10
Nodes (30): BIN_FILES, BUDGET_ENV, checkBins(), checkBudgetEnv(), checkLlmConfig(), checkLock(), checkMcpFlags(), checkNodeVersion() (+22 more)

### Community 11 - "run-eval.test.ts"
Cohesion: 0.23
Nodes (9): runEvalAll(), runLiveEval(), DEFAULT_REPORT_PATH, LIVE_ENV_VARS, parseArgs(), ParsedArgs, runEvalCli(), FAKE_LIVE_ENV (+1 more)

### Community 12 - "compileSpecDir"
Cohesion: 0.06
Nodes (22): ChildOutcome, CLI_JS, SECTION_FILES, tmpDirs, compiledBundle(), FIXTURES, SECTION_FILES, tmpDirs (+14 more)

### Community 13 - "aggregate.ts"
Cohesion: 0.17
Nodes (19): Aggregation, EmittedOutcome, VariantCost, renderGateReport(), RunScore, binomialCdf(), binomialPmf(), binomialTail() (+11 more)

### Community 14 - "generate-interactive.ts"
Cohesion: 0.06
Nodes (45): ASSETS, baseBundle(), blockedJson(), complete(), fakeLlm(), REAL_FETCH, startWorkspace(), ASSETS (+37 more)

### Community 15 - "paths.ts"
Cohesion: 0.13
Nodes (18): writeEvidence(), SECTION_KEYS, PET_CLINIC, SECTION_FILES, tmpDirs, writeSpecDir(), assertNoSymlinkBelow(), assertNotSymlink() (+10 more)

### Community 16 - "llm-config.ts"
Cohesion: 0.11
Nodes (20): RFC-7230, BaseUrlSchema, HeaderNameSchema, LINK_LOCAL_PREFIXES, LlmConfig, LlmConfigSchema, METADATA_HOSTS, OpenRouterRoutingSchema (+12 more)

### Community 17 - "score.ts"
Cohesion: 0.18
Nodes (24): allUnGrounded(), anchorSentences(), checkConstraintTrace(), commitmentSurfaces(), ConstraintFailure, ConstraintFailureCode, containsTerm(), containsWholeTerm() (+16 more)

### Community 18 - "report.ts"
Cohesion: 0.10
Nodes (22): BadFixtureCapture, FIXTURES, genericBundleFor(), groundedBundleFor(), loadFixture(), U, BAD, BadFixtureExpectation (+14 more)

### Community 19 - "check.test.ts"
Cohesion: 0.21
Nodes (8): evidenceOf(), evidencePath(), FIXTURES, freshRoot(), initRoot(), makeSpecRoot(), SECTION_FILES, tmpDirs

### Community 20 - "model.ts"
Cohesion: 0.12
Nodes (22): ApprovalRecord, ANSWERS, CHANGES, AnswerCheck, answerToUserAnswer(), applyAnswersToRecords(), ApplyResult, attachStatuses() (+14 more)

### Community 21 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, esModuleInterop, lib, module, moduleResolution, noEmitOnError, outDir, rootDir (+11 more)

### Community 22 - "version.ts"
Cohesion: 0.36
Nodes (7): checkSpecSchemaVersion(), ParsedVersion, parseVersion(), SPEC_SCHEMA_VERSION, SpecSchemaVersionFieldSchema, SpecSchemaVersionVerdict, SUPPORTED

### Community 23 - "review-changes.ts"
Cohesion: 0.18
Nodes (13): BehaviorReview, changeRequestEvidence, ChangeSetValidation, CLARIFY_REVIEW_CHANGES_PROTOCOL, MAX_CHANGE_INSTRUCTION_CHARS, MAX_CHANGES_PER_SET, ReviewChange, ReviewChangeSchema (+5 more)

### Community 24 - "live-experiment.ts"
Cohesion: 0.22
Nodes (13): aggregateEmitted(), EMITTED_SCHEMA, renderAggregation(), gateVerdict, emittedFileName(), ParsedExperimentArgs, parseExperimentArgs(), runEmittingEval() (+5 more)

### Community 25 - "check.ts"
Cohesion: 0.36
Nodes (7): CheckOutcome, Executor, CheckOptions, CheckResult, cmdCheck(), expectedActual(), renderReport()

### Community 26 - "orchestrator.ts"
Cohesion: 0.17
Nodes (15): ClarificationQuestionView, ChangeSetChangeOutcome, ChangeSetOutcome, SessionOpResult, SessionSnapshot, SessionUsageSummary, canTransition(), CLARIFY_SESSION_STATES (+7 more)

### Community 27 - "change.test.ts"
Cohesion: 0.22
Nodes (6): FIXTURES, frozenSpecRoot(), inlineBundle(), makeSpecRoot(), SECTION_FILES, tmpDirs

### Community 28 - "schemas/index.ts"
Cohesion: 0.22
Nodes (9): EvidenceItemSchema, validEvidence, GlossaryEntrySchema, validBundle, validManifest, TraceEdgeSchema, IntentSchema, validIntent (+1 more)

### Community 29 - "createClarifySession"
Cohesion: 0.17
Nodes (16): applyEnrichment(), buildEnrichPrompt(), CLARIFY_ENRICH_PROTOCOL, DecisionEnrichment, EnrichedItemSchema, EnrichOutputSchema, EnrichParseResult, MAX_CONTEXT_CHARS (+8 more)

### Community 30 - "eval/runner.test.ts"
Cohesion: 0.24
Nodes (7): complete(), counterOnlyUnresolvedBundle(), et01Bundle(), PET_CLINIC, proposalAJson(), unresolvedAddedBundle(), unresolvedPlusLintDirtyBundle()

### Community 31 - "adapter.ts"
Cohesion: 0.11
Nodes (20): ClarifySessionOptions, LlmAdapter, LlmCompleteOptions, LlmResponse, MockScript, SCRIPT, MockEvalScripts, complete() (+12 more)

### Community 32 - "server.ts"
Cohesion: 0.08
Nodes (26): DEFAULT_GENERATE_PROFILE, parseLlmConfig(), VALID, zodIssues(), generateOptInFromEnv(), GenerateProfile, GenerateVariant, ARG_SPECS (+18 more)

### Community 33 - "tasks/index.ts"
Cohesion: 0.18
Nodes (7): ConstraintTraceAssertion, DeterministicAssertion, EvalTask, EvalTaskKind, IntentConstraint, NumericOperator, EXPECTED_IDS

### Community 34 - "init.ts"
Cohesion: 0.13
Nodes (15): buildSections(), cmdInit(), Contract, Decision, EvidenceItem, GlossaryEntry, InitOptions, InitResult (+7 more)

### Community 35 - "constraint-trace.test.ts"
Cohesion: 0.18
Nodes (13): et07Requirement(), et12Requirement(), failureCodes(), FIXTURES, genericBundleFor(), groundedEt01(), groundedEt02(), groundedEt04() (+5 more)

### Community 36 - "common.ts"
Cohesion: 0.29
Nodes (7): AssumptionIdSchema, ComplexityProfileSchema, IdSchema, ImpactLevelSchema, Sha256Schema, SpecStateSchema, Manifest

### Community 37 - "namespace-ids.test.ts"
Cohesion: 0.21
Nodes (11): DecisionIdSchema, EvidenceIdSchema, RequirementIdSchema, TaskIdSchema, TestIdSchema, DecisionSchema, validDecision, RequirementSchema (+3 more)

### Community 38 - "devDependencies"
Cohesion: 0.15
Nodes (13): jsdom, devDependencies, jsdom, @types/node, typescript, vitest, @vitest/coverage-v8, zod-to-json-schema (+5 more)

### Community 39 - "lint/trace.test.ts"
Cohesion: 0.22
Nodes (7): DecSpec, GOOD, mkBundle(), mkTask(), ReqSpec, TaskSpec, testWith()

### Community 40 - "orchestrator.test.ts"
Cohesion: 0.27
Nodes (8): MAX_CLARIFY_ROUNDS, atReview(), blockedBundle(), bundle(), complete(), OPTS, scriptedLlm(), sessionWith()

### Community 41 - "lintBundle"
Cohesion: 0.08
Nodes (36): AnswerLedgerSchema, answersExportDocument(), APPROVAL_RECORD_SCHEMA_ID, approvalFileName(), ApprovalRecordSchema, ChangeLedgerSchema, InventorySchema, SECTION_KEYS (+28 more)

### Community 42 - "report.test.ts"
Cohesion: 0.60
Nodes (4): fixtures15(), liveInput(), passInput(), passRuns()

### Community 43 - "models.ts"
Cohesion: 0.15
Nodes (12): BUILTIN_PROVIDERS, cmdModels(), fmt(), MAX_CATALOG_BYTES, ModelCatalogEntry, MODELS_REQUEST_TIMEOUT_MS, ModelsOptions, ModelsResult (+4 more)

### Community 44 - "check/runner.test.ts"
Cohesion: 0.13
Nodes (7): DEFAULT_TIMEOUT_MS, killActiveProcessGroups(), FakeCall, FIXTURES, PET_CLINIC, tmpDirs, Verification

### Community 45 - "consent.ts"
Cohesion: 0.13
Nodes (23): authorizeExecution(), checkPreviewDigest(), consentDigestLine(), EXEC_OPT_IN_ENV, EXEC_ROOT_ENV, ExecAuthorization, execOptInFromEnv(), execRootFromEnv() (+15 more)

### Community 46 - "spec-core/package.json"
Cohesion: 0.22
Nodes (8): description, engines, node, license, main, name, type, version

### Community 47 - "sha256Content"
Cohesion: 0.24
Nodes (11): buildApprovalRecord(), specIdentity(), userAnswerFromPlainText(), canonicalJson(), FAMILY_SECTIONS, projectReview(), ReviewSection, ReviewSegment (+3 more)

### Community 48 - "SpecBundle"
Cohesion: 0.10
Nodes (25): cleanLint, FIXTURES, CompileResult, freeze(), FreezeResult, cleanLint, FIXTURES, frozenPetClinic() (+17 more)

### Community 51 - "package.json"
Cohesion: 0.25
Nodes (7): _archival, name, packageManager, private, scripts, test:spec, version

### Community 52 - "generate.test.ts"
Cohesion: 0.10
Nodes (12): complete(), FAKE_ENV, fetchSpy(), jsonResponse(), PET_CLINIC, PROFILE_CONFIG, SECTION_FILES, SESSION_SERVICE (+4 more)

### Community 54 - "l14.ts"
Cohesion: 0.43
Nodes (4): EXPECT_GRAMMAR_DOC, EXPECTED_EXIT_PATTERN, isJudgeableExpect(), rule

### Community 55 - "eval/runner.ts"
Cohesion: 0.12
Nodes (33): CouncilTopology, DecomposedCouncilDeps, runDecomposedCouncil(), CLARIFY_RULES, CLASSIFY_RULES, CONSTRAINT_FIDELITY, decomposedClassifier(), decomposedJudge() (+25 more)

### Community 56 - "scale-benchmark.test.ts"
Cohesion: 0.18
Nodes (7): ClosureFinding, ClosureFindingCode, closureFindings(), DuplicateTaskId, CEILINGS_MS, mkTask(), syntheticBundle()

### Community 57 - "copy-browser-assets.js"
Cohesion: 0.25
Nodes (7): { copyFileSync, mkdirSync, readdirSync, writeFileSync }, files, { join }, MIME, outDir, root, srcDir

### Community 58 - "runPipeline"
Cohesion: 0.24
Nodes (6): BudgetLedger, LlmUsage, lintReason(), resolutionErasure(), runPipeline(), unresolvedDecisionIds()

### Community 59 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck (+7 more)

### Community 60 - "SpecBundleSchema"
Cohesion: 0.13
Nodes (8): BAD, BadFixtureExpectation, GOOD, SpecBundleForExport, GENERATED_PATH, SpecBundleSchema, validManifest, validTask

### Community 61 - "cli/index.ts"
Cohesion: 0.20
Nodes (17): commandHelp(), parseArgs(), cmdCompile(), compileFailedOutput(), CompileResult, parseEnginesFloor(), normalizeFileIntent(), cmdLint() (+9 more)

### Community 63 - "l12.test.ts"
Cohesion: 0.21
Nodes (8): firstOverlap(), globSegments(), globsOverlap(), rule, segmentsOverlap(), FIXTURES, refMatch(), refPathMatch()

### Community 67 - "council.test.ts"
Cohesion: 0.28
Nodes (6): BUNDLE_OK(), CLASSIFIER_BLOCK, CLASSIFIER_OK, complete(), et01Bundle(), PET_CLINIC

### Community 70 - "l03.test.ts"
Cohesion: 0.17
Nodes (3): FIXTURES, FIXTURES, FIXTURES

### Community 71 - "cli.test.ts"
Cohesion: 0.22
Nodes (3): FIXTURES, SECTION_FILES, tmpDirs

### Community 72 - "ClarifySession"
Cohesion: 0.22
Nodes (3): ClarificationAnswer, ClarifySession, ClarifyServerOptions

### Community 74 - "scripts"
Cohesion: 0.22
Nodes (9): scripts, build, lint, prepublishOnly, pretest, smoke:packed, test, test:coverage (+1 more)

### Community 75 - "stdio.ts"
Cohesion: 0.10
Nodes (20): isJsonRpcId(), isPlainObject(), validateJsonRpcEnvelope(), EPIPE_DRAIN_TIMEOUT_MS, EXIT_CLIENT_GONE, EXIT_DRAIN_TIMEOUT, EXIT_OK, jsonRpcError() (+12 more)

### Community 76 - "clarify.test.ts"
Cohesion: 0.15
Nodes (6): BASE, complete(), unresolvedBundle(), PET_CLINIC, U, EvalTaskId

### Community 78 - "strictness.test.ts"
Cohesion: 0.25
Nodes (5): ManifestSchema, validManifest, FIXTURES, validManifest, validTask

### Community 79 - "l08.test.ts"
Cohesion: 0.67
Nodes (3): FIXTURES, inState(), loadBundle()

### Community 88 - "commands/trace.test.ts"
Cohesion: 0.18
Nodes (9): cmdTrace(), renderTrace(), compiledBundle(), FIXTURES, SECTION_FILES, tmpDirs, TraceResult, buildTrace() (+1 more)

### Community 92 - "make-bins-executable.js"
Cohesion: 0.50
Nodes (3): BINS, { join }, { readFileSync, chmodSync }

### Community 97 - "packed-install-smoke.sh"
Cohesion: 1.00
Nodes (3): run(), say(), packed-install-smoke.sh script

### Community 100 - "prepublish-check.js"
Cohesion: 0.29
Nodes (5): describe, pkg, result, { spawnSync }, status

### Community 106 - "files"
Cohesion: 0.33
Nodes (6): files, dist, examples, generated, LICENSE, README.md

### Community 108 - "corpus-lock.ts"
Cohesion: 0.18
Nodes (21): canonicalJson(), computeCorpusHash(), CORPUS_LOCK_VERSION, CorpusLock, CorpusLockEntry, frozenThresholds, loadCorpusLock(), lockCandidates() (+13 more)

### Community 116 - "server.test.ts"
Cohesion: 0.12
Nodes (17): callTool(), expectIdentical(), FIXTURES, freshOutside(), freshRoot(), frozenRoot(), injectionRoot(), inlineConforming() (+9 more)

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
- **432 isolated node(s):** `name`, `version`, `private`, `packageManager`, `_archival` (+427 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SpecBundle` connect `SpecBundle` to `budget.ts`, `check/runner.ts`, `lifecycle.ts`, `commands/plan.ts`, `generate.ts`, `engine.ts`, `compileSpecDir`, `generate-interactive.ts`, `paths.ts`, `score.ts`, `report.ts`, `model.ts`, `review-changes.ts`, `check.ts`, `orchestrator.ts`, `schemas/index.ts`, `eval/runner.test.ts`, `adapter.ts`, `init.ts`, `constraint-trace.test.ts`, `lint/trace.test.ts`, `orchestrator.test.ts`, `lintBundle`, `check/runner.test.ts`, `consent.ts`, `sha256Content`, `l01.test.ts`, `generate.test.ts`, `l02.test.ts`, `l14.ts`, `eval/runner.ts`, `scale-benchmark.test.ts`, `l04.test.ts`, `l12.test.ts`, `l07.test.ts`, `l10.test.ts`, `council.test.ts`, `l03.test.ts`, `clarify.test.ts`, `l08.test.ts`, `commands/trace.test.ts`?**
  _High betweenness centrality (0.115) - this node is a cross-community bridge._
- **Why does `LlmAdapter` connect `adapter.ts` to `budget.ts`, `server.ts`, `openai-compatible.ts`, `council.test.ts`, `generate.ts`, `orchestrator.test.ts`, `clarify.test.ts`, `generate-interactive.ts`, `generate.test.ts`, `server.test.ts`, `eval/runner.ts`, `orchestrator.ts`, `eval/runner.test.ts`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Why does `runPipeline()` connect `runPipeline` to `budget.ts`, `constraint-trace.test.ts`, `council.test.ts`, `generate.ts`, `lintBundle`, `run-eval.test.ts`, `clarify.test.ts`, `report.ts`, `generate.test.ts`, `eval/runner.ts`, `live-experiment.ts`, `orchestrator.ts`, `createClarifySession`, `eval/runner.test.ts`, `adapter.ts`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `runPipeline()` (e.g. with `.chargeAttempts()` and `.chargeTokens()`) actually correct?**
  _`runPipeline()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _432 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `budget.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05926251097453907 - nodes in this community are weakly interconnected._
- **Should `app.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05217391304347826 - nodes in this community are weakly interconnected._