# Graph Report - llm_council_orchestrator  (2026-08-30)

## Corpus Check
- 223 files · ~199,454 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1255 nodes · 3017 edges · 81 communities (76 shown, 5 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `31234674`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- envelope.ts
- adapter.ts
- consent.ts
- check/runner.ts
- score.ts
- lifecycle.ts
- common.ts
- budget.ts
- engine.ts
- schemas/index.ts
- doctor.ts
- run-eval.test.ts
- cli/index.ts
- sign-test.ts
- init.ts
- validation.ts
- eval/runner.ts
- compileSpecDir
- report.ts
- live-experiment.ts
- answers.ts
- l14.ts
- report.test.ts
- l12.test.ts
- args.ts
- commands/plan.test.ts
- SpecBundleSchema
- change.test.ts
- SpecBundle
- providers.ts
- eval/runner.test.ts
- openai-compatible.ts
- server.ts
- tasks/index.ts
- gate.ts
- compile.test.ts
- init-concurrency.test.ts
- compiler/compile.ts
- devDependencies
- strictness.test.ts
- models.ts
- council.test.ts
- manifest.ts
- llm-config.ts
- constraint-trace.test.ts
- version.ts
- spec-core/package.json
- provider.ts
- l01.test.ts
- http.test.ts
- TaskContract
- package.json
- generate.test.ts
- l03.test.ts
- BudgetLedger
- prompts-v4.ts
- openai-compatible.test.ts
- l04.test.ts
- l08.test.ts
- compilerOptions
- legacy.ts
- cli.test.ts
- aggregate.ts
- scale-benchmark.test.ts
- l10.test.ts
- scripts
- stdio.ts
- commands/trace.test.ts
- make-bins-executable.js
- packed-install-smoke.sh
- prepublish-check.js
- generate.ts
- files
- corpus-lock.ts
- prepublish-check.boundary.test.ts
- server.test.ts
- bin
- readiness.ts
- dependencies
- repository

## God Nodes (most connected - your core abstractions)
1. `SpecBundle` - 70 edges
2. `runPipeline()` - 41 edges
3. `compileSpecDir()` - 37 edges
4. `lintBundle()` - 36 edges
5. `runCli()` - 27 edges
6. `EVAL_TASKS` - 22 edges
7. `SpecBundleSchema` - 21 edges
8. `LlmAdapter` - 20 edges
9. `TaskContract` - 19 edges
10. `runDecomposedCouncil()` - 19 edges

## Surprising Connections (you probably didn't know these)
- `CompileResult` --references--> `SpecBundle`  [EXTRACTED]
  packages/spec-core/src/compiler/compile.ts → packages/spec-core/src/schemas/index.ts
- `ApplyResult` --references--> `SpecBundle`  [EXTRACTED]
  packages/spec-core/src/compiler/changeset.ts → packages/spec-core/src/schemas/index.ts
- `compiledBundle()` --calls--> `compileSpecDir()`  [EXTRACTED]
  packages/spec-core/src/cli/commands/plan.test.ts → packages/spec-core/src/compiler/compile.ts
- `compiledBundle()` --calls--> `compileSpecDir()`  [EXTRACTED]
  packages/spec-core/src/cli/commands/trace.test.ts → packages/spec-core/src/compiler/compile.ts
- `parseArgs()` --calls--> `normalizeIntent()`  [EXTRACTED]
  packages/spec-core/src/cli/args.ts → packages/spec-core/src/cli/commands/generate.ts

## Import Cycles
- 3-file cycle: `packages/spec-core/src/eval/budget.ts -> packages/spec-core/src/eval/llm/http.ts -> packages/spec-core/src/llm/openai-compatible.ts -> packages/spec-core/src/eval/budget.ts`

## Communities (81 total, 5 thin omitted)

### Community 0 - "envelope.ts"
Cohesion: 0.19
Nodes (19): computeCostEnvelope(), CostEnvelope, measurePromptSizes(), PromptSize, renderCostEnvelopeTable(), VariantEnvelope, CLASSIFY_RULES, classifyAndProposeSingle() (+11 more)

### Community 1 - "adapter.ts"
Cohesion: 0.13
Nodes (15): LlmAdapter, LlmCompleteOptions, LlmResponse, createMockLlm(), MockScript, SCRIPT, MockEvalScripts, complete() (+7 more)

### Community 2 - "consent.ts"
Cohesion: 0.10
Nodes (32): sha256Content(), loadBundleAtLevel(), authorizeExecution(), checkPreviewDigest(), consentDigestLine(), EXEC_OPT_IN_ENV, ExecAuthorization, ExecBoundary (+24 more)

### Community 3 - "check/runner.ts"
Cohesion: 0.06
Nodes (33): parseExpect(), REDACTION_RULES, RedactionRule, redactSecrets(), SecretKind, activeProcessGroups, CheckOutcome, DEFAULT_TIMEOUT_MS (+25 more)

### Community 4 - "score.ts"
Cohesion: 0.16
Nodes (12): allUnGrounded(), finishEvidence(), runEvalAll(), runLiveEval(), runMockEval(), advisoryInventions(), assertionPasses(), constraintFailuresFor() (+4 more)

### Community 5 - "lifecycle.ts"
Cohesion: 0.14
Nodes (20): checkTransition(), FREEZE_REFUSAL_HINTS, LIFECYCLE_STATES, LIFECYCLE_TRANSITIONS, LifecycleFinding, LifecycleFindingCode, LifecycleOperation, LifecycleState (+12 more)

### Community 6 - "common.ts"
Cohesion: 0.27
Nodes (11): AssumptionIdSchema, ContractIdSchema, DecisionIdSchema, EvidenceIdSchema, IdSchema, ImpactLevelSchema, RequirementIdSchema, TaskIdSchema (+3 more)

### Community 7 - "budget.ts"
Cohesion: 0.19
Nodes (11): BudgetCap, BudgetExceededError, BudgetSpentSnapshot, DEFAULT_WALL_SLACK_MS, MAX_COMPLETIONS, maxCompletions(), ResolvedRunBudget, resolveRunBudget() (+3 more)

### Community 8 - "engine.ts"
Cohesion: 0.15
Nodes (17): BAD, BadFixtureExpectation, RULES, rule, rule, rule, rule, rule (+9 more)

### Community 9 - "schemas/index.ts"
Cohesion: 0.19
Nodes (11): ContractSchema, validContract, EvidenceItemSchema, validEvidence, GlossaryEntrySchema, validBundle, validManifest, TraceEdgeSchema (+3 more)

### Community 10 - "doctor.ts"
Cohesion: 0.11
Nodes (29): BIN_FILES, BUDGET_ENV, checkBins(), checkBudgetEnv(), checkLlmConfig(), checkLock(), checkMcpFlags(), checkNodeVersion() (+21 more)

### Community 11 - "run-eval.test.ts"
Cohesion: 0.25
Nodes (7): DEFAULT_REPORT_PATH, LIVE_ENV_VARS, parseArgs(), ParsedArgs, runEvalCli(), FAKE_LIVE_ENV, mockRunEvalAll

### Community 12 - "cli/index.ts"
Cohesion: 0.15
Nodes (20): commandHelp(), parseArgs(), cmdCheck(), cmdCompile(), compileFailedOutput(), CompileResult, parseEnginesFloor(), normalizeFileIntent() (+12 more)

### Community 13 - "sign-test.ts"
Cohesion: 0.29
Nodes (8): binomialCdf(), binomialPmf(), binomialTail(), bisect(), choose(), clopperPearson95(), SignPair, signTest()

### Community 14 - "init.ts"
Cohesion: 0.05
Nodes (46): evidenceOf(), evidencePath(), FIXTURES, freshRoot(), initRoot(), makeSpecRoot(), SECTION_FILES, tmpDirs (+38 more)

### Community 15 - "validation.ts"
Cohesion: 0.22
Nodes (6): LevelLoadResult, FIXTURES, SECTION_FILES, tmpDirs, VALIDATION_LEVELS, ValidationLevel

### Community 16 - "eval/runner.ts"
Cohesion: 0.17
Nodes (23): validateGenerationOutput(), CouncilTopology, DecomposedCouncilDeps, runDecomposedCouncil(), PROMPT_PROTOCOL_VERSION, UserAnswerForPrompt, withUserAnswers(), buildValidationRetryPrompt() (+15 more)

### Community 17 - "compileSpecDir"
Cohesion: 0.18
Nodes (15): applyUnderLock(), ChangeResult, cmdChange(), findingLine(), cmdFreeze(), FreezeResult, compileLintFreeze(), applyChangeSet() (+7 more)

### Community 18 - "report.ts"
Cohesion: 0.17
Nodes (16): BadFixtureCapture, groundedBundleFor(), BAD, BadFixtureExpectation, buildMockScripts(), deriveBundle(), EvalEvidence, fixtureNameFor() (+8 more)

### Community 19 - "live-experiment.ts"
Cohesion: 0.24
Nodes (11): EMITTED_SCHEMA, EmittedOutcome, renderAggregation(), emittedFileName(), ParsedExperimentArgs, parseExperimentArgs(), runEmittingEval(), runExperimentCli() (+3 more)

### Community 20 - "answers.ts"
Cohesion: 0.50
Nodes (3): AnswersParseResult, MAX_ANSWER_CHARS, MAX_ANSWERS

### Community 21 - "l14.ts"
Cohesion: 0.43
Nodes (4): EXPECT_GRAMMAR_DOC, EXPECTED_EXIT_PATTERN, isJudgeableExpect(), rule

### Community 22 - "report.test.ts"
Cohesion: 0.60
Nodes (4): fixtures15(), liveInput(), passInput(), passRuns()

### Community 23 - "l12.test.ts"
Cohesion: 0.21
Nodes (8): firstOverlap(), globSegments(), globsOverlap(), rule, segmentsOverlap(), FIXTURES, refMatch(), refPathMatch()

### Community 24 - "args.ts"
Cohesion: 0.18
Nodes (12): Command, COMMANDS, GenerateVariant, InitProfile, ParseResult, SingleDirCommand, DEFAULT_GENERATE_VARIANT, MAX_INTENT_CHARS (+4 more)

### Community 25 - "commands/plan.test.ts"
Cohesion: 0.12
Nodes (12): cmdPlan(), PlanOptions, PlanResult, renderHuman(), renderJson(), compiledBundle(), FIXTURES, SECTION_FILES (+4 more)

### Community 26 - "SpecBundleSchema"
Cohesion: 0.14
Nodes (6): GOOD, SpecBundleForExport, GENERATED_PATH, SpecBundleSchema, validManifest, validTask

### Community 27 - "change.test.ts"
Cohesion: 0.20
Nodes (7): FIXTURES, frozenSpecRoot(), inlineBundle(), makeSpecRoot(), SECTION_FILES, tmpDirs, LOCK_FILE

### Community 28 - "SpecBundle"
Cohesion: 0.09
Nodes (25): SECTION_PATHS, tmpDirs, cleanLint, FIXTURES, freeze(), FreezeResult, cleanLint, FIXTURES (+17 more)

### Community 29 - "providers.ts"
Cohesion: 0.29
Nodes (11): ResolvedRole, createOpenAiCompatibleLlm(), RoutingMode, buildRoleAdapter(), openRouterCost(), RoleCallContext, SPEC_SCHEMA_TEXT, send() (+3 more)

### Community 30 - "eval/runner.test.ts"
Cohesion: 0.24
Nodes (7): complete(), counterOnlyUnresolvedBundle(), et01Bundle(), PET_CLINIC, proposalAJson(), unresolvedAddedBundle(), unresolvedPlusLintDirtyBundle()

### Community 31 - "openai-compatible.ts"
Cohesion: 0.21
Nodes (9): ChatResponse, CostExtractor, parseSuccess(), extractProvenance(), extractUsageDetails(), HTTP_BACKOFF_SCHEDULE_MS, isPlainObject(), LlmProvenance (+1 more)

### Community 32 - "server.ts"
Cohesion: 0.11
Nodes (25): generateOptInFromEnv(), ARG_SPECS, ArgName, ArgValidator, configLoadCache, CoreResult, DIR_PROPERTY, ENVELOPE_KEYS (+17 more)

### Community 33 - "tasks/index.ts"
Cohesion: 0.10
Nodes (15): BASE, complete(), unresolvedBundle(), FIXTURES, genericBundleFor(), loadFixture(), U, ConstraintTraceAssertion (+7 more)

### Community 34 - "gate.ts"
Cohesion: 0.32
Nodes (10): calcs(), G1_REQUIRED_TOTAL, G4_COST_MULTIPLIER, GateCalcs, GateReportInput, gateVerdict, renderGateReport(), PipelineVariant (+2 more)

### Community 35 - "compile.test.ts"
Cohesion: 0.29
Nodes (3): FIXTURES, SECTION_FILES, tmpDirs

### Community 36 - "init-concurrency.test.ts"
Cohesion: 0.33
Nodes (4): ChildOutcome, CLI_JS, SECTION_FILES, tmpDirs

### Community 37 - "compiler/compile.ts"
Cohesion: 0.16
Nodes (17): CompileError, CompileResult, deriveTestFiles(), REQUIRED_SECTIONS, SectionName, assertNoSymlinkBelow(), checkMcpDir(), effectiveMcpRoot (+9 more)

### Community 38 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, @types/node, typescript, vitest, @vitest/coverage-v8, zod-to-json-schema, @types/node, typescript (+3 more)

### Community 39 - "strictness.test.ts"
Cohesion: 0.18
Nodes (7): DecisionSchema, validDecision, FIXTURES, validManifest, validTask, TaskContractSchema, validTask

### Community 40 - "models.ts"
Cohesion: 0.15
Nodes (12): BUILTIN_PROVIDERS, cmdModels(), fmt(), MAX_CATALOG_BYTES, ModelCatalogEntry, MODELS_REQUEST_TIMEOUT_MS, ModelsOptions, ModelsResult (+4 more)

### Community 41 - "council.test.ts"
Cohesion: 0.28
Nodes (6): BUNDLE_OK(), CLASSIFIER_BLOCK, CLASSIFIER_OK, complete(), et01Bundle(), PET_CLINIC

### Community 42 - "manifest.ts"
Cohesion: 0.31
Nodes (5): ComplexityProfileSchema, Sha256Schema, SpecStateSchema, ManifestSchema, validManifest

### Community 43 - "llm-config.ts"
Cohesion: 0.12
Nodes (16): RFC-7230, BaseUrlSchema, HeaderNameSchema, LINK_LOCAL_PREFIXES, LlmConfig, LlmConfigSchema, METADATA_HOSTS, OpenRouterRoutingSchema (+8 more)

### Community 44 - "constraint-trace.test.ts"
Cohesion: 0.10
Nodes (33): et07Requirement(), et12Requirement(), failureCodes(), FIXTURES, genericBundleFor(), groundedEt01(), groundedEt02(), groundedEt04() (+25 more)

### Community 45 - "version.ts"
Cohesion: 0.36
Nodes (7): checkSpecSchemaVersion(), ParsedVersion, parseVersion(), SPEC_SCHEMA_VERSION, SpecSchemaVersionFieldSchema, SpecSchemaVersionVerdict, SUPPORTED

### Community 46 - "spec-core/package.json"
Cohesion: 0.22
Nodes (8): description, engines, node, license, main, name, type, version

### Community 47 - "provider.ts"
Cohesion: 0.70
Nodes (3): OPENROUTER_DEFAULT_BASE_URL, PROVIDER_KINDS, ROUTELLM_DEFAULT_BASE_URL

### Community 48 - "l01.test.ts"
Cohesion: 0.10
Nodes (5): FIXTURES, FIXTURES, FIXTURES, FIXTURES, FIXTURES

### Community 49 - "http.test.ts"
Cohesion: 0.29
Nodes (5): FAKE_ENV, FakeEnv, jsonResponse(), okFetch(), PartialFakeEnv

### Community 50 - "TaskContract"
Cohesion: 0.33
Nodes (6): PlanTask, ApplyResult, ChangeSet, ChangeSetSchema, formatIssues(), TaskContract

### Community 51 - "package.json"
Cohesion: 0.25
Nodes (7): _archival, name, packageManager, private, scripts, test:spec, version

### Community 52 - "generate.test.ts"
Cohesion: 0.10
Nodes (12): complete(), FAKE_ENV, fetchSpy(), jsonResponse(), PET_CLINIC, PROFILE_CONFIG, SECTION_FILES, SESSION_SERVICE (+4 more)

### Community 54 - "BudgetLedger"
Cohesion: 0.25
Nodes (3): BudgetLedger, OpenAiCompatibleConfig, ProviderKind

### Community 55 - "prompts-v4.ts"
Cohesion: 0.21
Nodes (15): CLARIFY_RULES, CLASSIFY_RULES, CONSTRAINT_FIDELITY, decomposedClassifier(), decomposedJudge(), decomposedJudgeAlone(), decomposedJudgeSingle(), decomposedProposalA() (+7 more)

### Community 56 - "openai-compatible.test.ts"
Cohesion: 0.83
Nodes (3): baseConfig(), jsonResponse(), okBody()

### Community 58 - "l08.test.ts"
Cohesion: 0.67
Nodes (3): FIXTURES, inState(), loadBundle()

### Community 59 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, declaration, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck (+6 more)

### Community 61 - "cli.test.ts"
Cohesion: 0.22
Nodes (3): FIXTURES, SECTION_FILES, tmpDirs

### Community 62 - "aggregate.ts"
Cohesion: 0.16
Nodes (16): aggregateEmitted(), Aggregation, loadRunDir(), parseEmittedOutcome(), baseScore(), BLOCKED, EmitOverrides, emittedRecord() (+8 more)

### Community 63 - "scale-benchmark.test.ts"
Cohesion: 0.17
Nodes (8): ClosureFinding, ClosureFindingCode, closureFindings(), DuplicateTaskId, duplicateTaskIds(), CEILINGS_MS, mkTask(), syntheticBundle()

### Community 74 - "scripts"
Cohesion: 0.22
Nodes (9): scripts, build, lint, prepublishOnly, pretest, smoke:packed, test, test:coverage (+1 more)

### Community 75 - "stdio.ts"
Cohesion: 0.10
Nodes (17): killActiveProcessGroups(), EPIPE_DRAIN_TIMEOUT_MS, EXIT_CLIENT_GONE, EXIT_DRAIN_TIMEOUT, EXIT_OK, jsonRpcError(), MAX_FRAME_BYTES, MAX_IN_FLIGHT (+9 more)

### Community 88 - "commands/trace.test.ts"
Cohesion: 0.10
Nodes (16): cmdTrace(), renderTrace(), compiledBundle(), FIXTURES, SECTION_FILES, tmpDirs, TraceResult, buildTrace() (+8 more)

### Community 92 - "make-bins-executable.js"
Cohesion: 0.50
Nodes (3): BINS, { join }, { readFileSync, chmodSync }

### Community 97 - "packed-install-smoke.sh"
Cohesion: 1.00
Nodes (3): run(), say(), packed-install-smoke.sh script

### Community 100 - "prepublish-check.js"
Cohesion: 0.29
Nodes (5): describe, pkg, result, { spawnSync }, status

### Community 101 - "generate.ts"
Cohesion: 0.16
Nodes (20): buildLlmPlanFromProfile(), checkIntent(), clarificationBlock(), cmdGenerate(), DEFAULT_GENERATE_PROFILE, GenerateOptions, GenerateResult, IntentCheck (+12 more)

### Community 106 - "files"
Cohesion: 0.33
Nodes (6): files, dist, examples, generated, LICENSE, README.md

### Community 108 - "corpus-lock.ts"
Cohesion: 0.27
Nodes (14): canonicalJson(), computeCorpusHash(), CORPUS_LOCK_VERSION, CorpusLock, CorpusLockEntry, frozenThresholds, loadCorpusLock(), lockCandidates() (+6 more)

### Community 116 - "server.test.ts"
Cohesion: 0.12
Nodes (18): EXEC_ROOT_ENV, callTool(), expectIdentical(), FIXTURES, freshOutside(), freshRoot(), frozenRoot(), injectionRoot() (+10 more)

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
- **348 isolated node(s):** `GenerateResult`, `IntentCheck`, `ENV`, `CATALOG`, `MODELS_REQUEST_TIMEOUT_MS` (+343 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SpecBundle` connect `SpecBundle` to `adapter.ts`, `consent.ts`, `check/runner.ts`, `score.ts`, `lifecycle.ts`, `budget.ts`, `engine.ts`, `schemas/index.ts`, `init.ts`, `validation.ts`, `eval/runner.ts`, `compileSpecDir`, `report.ts`, `l14.ts`, `l12.test.ts`, `commands/plan.test.ts`, `SpecBundleSchema`, `eval/runner.test.ts`, `tasks/index.ts`, `compile.test.ts`, `compiler/compile.ts`, `council.test.ts`, `constraint-trace.test.ts`, `l01.test.ts`, `TaskContract`, `generate.test.ts`, `l03.test.ts`, `l04.test.ts`, `l08.test.ts`, `scale-benchmark.test.ts`, `l10.test.ts`, `commands/trace.test.ts`, `generate.ts`?**
  _High betweenness centrality (0.122) - this node is a cross-community bridge._
- **Why does `LlmAdapter` connect `adapter.ts` to `server.ts`, `tasks/index.ts`, `score.ts`, `generate.ts`, `budget.ts`, `council.test.ts`, `eval/runner.ts`, `generate.test.ts`, `server.test.ts`, `args.ts`, `providers.ts`, `eval/runner.test.ts`, `openai-compatible.ts`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Why does `lintBundle()` connect `compileSpecDir` to `consent.ts`, `score.ts`, `engine.ts`, `cli/index.ts`, `validation.ts`, `eval/runner.ts`, `report.ts`, `live-experiment.ts`, `l12.test.ts`, `SpecBundleSchema`, `change.test.ts`, `SpecBundle`, `l01.test.ts`, `l03.test.ts`, `l04.test.ts`, `l08.test.ts`, `scale-benchmark.test.ts`, `l10.test.ts`, `generate.ts`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `runPipeline()` (e.g. with `.chargeAttempts()` and `.chargeTokens()`) actually correct?**
  _`runPipeline()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `GenerateResult`, `IntentCheck`, `ENV` to the rest of the system?**
  _348 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `adapter.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13105413105413105 - nodes in this community are weakly interconnected._
- **Should `consent.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10084033613445378 - nodes in this community are weakly interconnected._