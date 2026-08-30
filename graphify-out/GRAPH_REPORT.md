# Graph Report - llm_council_orchestrator  (2026-08-30)

## Corpus Check
- 223 files · ~199,454 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1259 nodes · 3040 edges · 84 communities (74 shown, 10 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `28ea94c0`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- budget.ts
- adapter.ts
- consent.ts
- check/runner.ts
- eval/runner.ts
- lifecycle.ts
- acquireSpecRootLock
- check.test.ts
- engine.ts
- schemas/index.ts
- doctor.ts
- run-eval.test.ts
- cli/index.ts
- aggregate.ts
- revision.ts
- TaskContract
- LlmRole
- lintBundle
- report.ts
- live-experiment.ts
- clarify.test.ts
- l14.ts
- report.test.ts
- l12.test.ts
- types.ts
- commands/plan.test.ts
- freeze.test.ts
- SpecBundle
- all-bad-fixtures.test.ts
- providers.ts
- eval/runner.test.ts
- openai-compatible.ts
- server.ts
- tasks/index.ts
- compileSpecDir
- compile.test.ts
- init-concurrency.test.ts
- paths.ts
- devDependencies
- check/runner.test.ts
- models.ts
- council.test.ts
- execInProcessGroup
- llm-config.ts
- constraint-trace.test.ts
- runner-roles.test.ts
- spec-core/package.json
- provider.ts
- l01.test.ts
- l02.test.ts
- good-fixture-gate.test.ts
- package.json
- generate.test.ts
- l03.test.ts
- runPipeline
- council.ts
- redact.ts
- l04.test.ts
- l08.test.ts
- compilerOptions
- l05.test.ts
- cli.test.ts
- aggregate.test.ts
- scale-benchmark.test.ts
- l06.test.ts
- l07.test.ts
- l10.test.ts
- scripts
- stdio.ts
- init.ts
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
6. `LlmAdapter` - 23 edges
7. `EVAL_TASKS` - 22 edges
8. `SpecBundleSchema` - 21 edges
9. `runDecomposedCouncil()` - 19 edges
10. `TaskContract` - 19 edges

## Surprising Connections (you probably didn't know these)
- `compiledBundle()` --calls--> `compileSpecDir()`  [EXTRACTED]
  packages/spec-core/src/cli/commands/plan.test.ts → packages/spec-core/src/compiler/compile.ts
- `compiledBundle()` --calls--> `compileSpecDir()`  [EXTRACTED]
  packages/spec-core/src/cli/commands/trace.test.ts → packages/spec-core/src/compiler/compile.ts
- `ApplyResult` --references--> `SpecBundle`  [EXTRACTED]
  packages/spec-core/src/compiler/changeset.ts → packages/spec-core/src/schemas/index.ts
- `HandleRpcOptions` --references--> `LlmAdapter`  [EXTRACTED]
  packages/spec-core/src/mcp/server.ts → packages/spec-core/src/eval/llm/adapter.ts
- `runChecks()` --calls--> `redactSecrets()`  [EXTRACTED]
  packages/spec-core/src/check/runner.ts → packages/spec-core/src/check/redact.ts

## Import Cycles
- 3-file cycle: `packages/spec-core/src/eval/budget.ts -> packages/spec-core/src/eval/llm/http.ts -> packages/spec-core/src/llm/openai-compatible.ts -> packages/spec-core/src/eval/budget.ts`

## Communities (84 total, 10 thin omitted)

### Community 0 - "budget.ts"
Cohesion: 0.06
Nodes (50): Command, COMMANDS, GenerateVariant, InitProfile, ParseResult, SingleDirCommand, DEFAULT_GENERATE_VARIANT, MAX_INTENT_CHARS (+42 more)

### Community 1 - "adapter.ts"
Cohesion: 0.24
Nodes (9): LlmAdapter, LlmCompleteOptions, LlmResponse, MockScript, SCRIPT, MockEvalScripts, LlmRoute, LlmProvenance (+1 more)

### Community 2 - "consent.ts"
Cohesion: 0.11
Nodes (28): authorizeExecution(), checkPreviewDigest(), consentDigestLine(), EXEC_OPT_IN_ENV, EXEC_ROOT_ENV, ExecAuthorization, execOptInFromEnv(), execRootFromEnv() (+20 more)

### Community 3 - "check/runner.ts"
Cohesion: 0.14
Nodes (17): parseExpect(), activeProcessGroups, CheckOutcome, EVIDENCE_FILE_MODE, evidenceRunName(), ExecutorResult, FORCE_SETTLE_GRACE_MS, GROUP_KILL_GRACE_MS (+9 more)

### Community 4 - "eval/runner.ts"
Cohesion: 0.21
Nodes (11): ClassifierOutputSchema, firstIssues(), parseJsonOrBlock(), resolutionErasure(), RoleUsage, stripJsonFences(), unresolvedDecisionIds(), isLlmPlan() (+3 more)

### Community 5 - "lifecycle.ts"
Cohesion: 0.12
Nodes (24): applyChangeSet(), ApplyResult, ChangeSetSchema, formatIssues(), checkTransition(), FREEZE_REFUSAL_HINTS, LIFECYCLE_STATES, LIFECYCLE_TRANSITIONS (+16 more)

### Community 6 - "acquireSpecRootLock"
Cohesion: 0.22
Nodes (10): SECTION_KEYS, PET_CLINIC, SECTION_FILES, tmpDirs, writeSpecDir(), assertNotSymlink(), acquireSpecRootLock(), breakStaleLock() (+2 more)

### Community 7 - "check.test.ts"
Cohesion: 0.21
Nodes (8): evidenceOf(), evidencePath(), FIXTURES, freshRoot(), initRoot(), makeSpecRoot(), SECTION_FILES, tmpDirs

### Community 8 - "engine.ts"
Cohesion: 0.21
Nodes (12): rule, rule, rule, rule, rule, rule, rule, rule (+4 more)

### Community 9 - "schemas/index.ts"
Cohesion: 0.05
Nodes (50): GOOD, AssumptionIdSchema, ComplexityProfileSchema, ContractIdSchema, DecisionIdSchema, EvidenceIdSchema, IdSchema, ImpactLevelSchema (+42 more)

### Community 10 - "doctor.ts"
Cohesion: 0.10
Nodes (30): BIN_FILES, BUDGET_ENV, checkBins(), checkBudgetEnv(), checkLlmConfig(), checkLock(), checkMcpFlags(), checkNodeVersion() (+22 more)

### Community 11 - "run-eval.test.ts"
Cohesion: 0.26
Nodes (9): runEvalAll(), DEFAULT_REPORT_PATH, LIVE_ENV_VARS, missingLiveEnv(), parseArgs(), ParsedArgs, runEvalCli(), FAKE_LIVE_ENV (+1 more)

### Community 12 - "cli/index.ts"
Cohesion: 0.32
Nodes (11): commandHelp(), parseArgs(), cmdCompile(), normalizeFileIntent(), cmdTrace(), readBudgetEnv(), readEnginesFloor(), readVersion() (+3 more)

### Community 13 - "aggregate.ts"
Cohesion: 0.15
Nodes (23): Aggregation, VariantCost, calcs(), GateCalcs, GateReportInput, gateVerdict, renderGateReport(), PipelineVariant (+15 more)

### Community 14 - "revision.ts"
Cohesion: 0.12
Nodes (16): backupPathFor(), createDirAtomically(), DEFAULT_STALE_MS, fsyncDir(), LOCK_FILE, LockHeldError, LockIdentity, LockOptions (+8 more)

### Community 15 - "TaskContract"
Cohesion: 0.13
Nodes (18): cmdPlan(), PlanOptions, PlanResult, PlanTask, renderHuman(), renderJson(), TopoResult, topoSort() (+10 more)

### Community 16 - "LlmRole"
Cohesion: 0.24
Nodes (6): DecomposedCouncilDeps, ClarificationQuestion, PipelineOutcome, PipelineTask, PipelineUsage, LlmRole

### Community 17 - "lintBundle"
Cohesion: 0.13
Nodes (18): applyUnderLock(), ChangeResult, cmdChange(), findingLine(), FIXTURES, frozenSpecRoot(), inlineBundle(), makeSpecRoot() (+10 more)

### Community 18 - "report.ts"
Cohesion: 0.15
Nodes (19): BadFixtureCapture, groundedBundleFor(), BAD, BadFixtureExpectation, buildMockScripts(), deriveBundle(), EvalEvidence, finishEvidence() (+11 more)

### Community 19 - "live-experiment.ts"
Cohesion: 0.24
Nodes (12): aggregateEmitted(), EMITTED_SCHEMA, EmittedOutcome, renderAggregation(), emittedFileName(), ParsedExperimentArgs, parseExperimentArgs(), runEmittingEval() (+4 more)

### Community 20 - "clarify.test.ts"
Cohesion: 0.20
Nodes (7): AnswersParseResult, MAX_ANSWER_CHARS, MAX_ANSWERS, BASE, complete(), unresolvedBundle(), EvalTaskId

### Community 21 - "l14.ts"
Cohesion: 0.43
Nodes (4): EXPECT_GRAMMAR_DOC, EXPECTED_EXIT_PATTERN, isJudgeableExpect(), rule

### Community 22 - "report.test.ts"
Cohesion: 0.60
Nodes (4): fixtures15(), liveInput(), passInput(), passRuns()

### Community 23 - "l12.test.ts"
Cohesion: 0.21
Nodes (8): firstOverlap(), globSegments(), globsOverlap(), rule, segmentsOverlap(), FIXTURES, refMatch(), refPathMatch()

### Community 24 - "types.ts"
Cohesion: 0.27
Nodes (5): BAD, BadFixtureExpectation, RULES, LINT_RULES, LintRuleId

### Community 25 - "commands/plan.test.ts"
Cohesion: 0.17
Nodes (4): compiledBundle(), FIXTURES, SECTION_FILES, tmpDirs

### Community 26 - "freeze.test.ts"
Cohesion: 0.38
Nodes (5): cleanLint, FIXTURES, frozenPetClinic(), inState(), loadBundle()

### Community 27 - "SpecBundle"
Cohesion: 0.22
Nodes (8): cleanLint, FIXTURES, CompileResult, FreezeResult, cleanLint, FIXTURES, LintResult, SpecBundle

### Community 28 - "all-bad-fixtures.test.ts"
Cohesion: 0.16
Nodes (11): artifactHashes(), HASHED_SECTIONS, sha256Content(), FIXTURES, HASHED_KEYS, verifyFrozen(), VerifyResult, BAD (+3 more)

### Community 29 - "providers.ts"
Cohesion: 0.25
Nodes (13): ResolvedRole, createOpenAiCompatibleLlm(), OpenAiCompatibleConfig, ProviderKind, RoutingMode, buildRoleAdapter(), openRouterCost(), RoleCallContext (+5 more)

### Community 30 - "eval/runner.test.ts"
Cohesion: 0.24
Nodes (7): complete(), counterOnlyUnresolvedBundle(), et01Bundle(), PET_CLINIC, proposalAJson(), unresolvedAddedBundle(), unresolvedPlusLintDirtyBundle()

### Community 31 - "openai-compatible.ts"
Cohesion: 0.27
Nodes (7): ChatResponse, CostExtractor, parseSuccess(), extractProvenance(), extractUsageDetails(), HTTP_BACKOFF_SCHEDULE_MS, isPlainObject()

### Community 32 - "server.ts"
Cohesion: 0.10
Nodes (25): DEFAULT_GENERATE_PROFILE, ExecBoundary, generateOptInFromEnv(), GenerateProfile, GenerateVariant, ARG_SPECS, ArgName, ArgValidator (+17 more)

### Community 33 - "tasks/index.ts"
Cohesion: 0.09
Nodes (18): allUnGrounded(), ConstraintFailure, FIXTURES, genericBundleFor(), loadFixture(), U, advisoryInventions(), assertionPasses() (+10 more)

### Community 34 - "compileSpecDir"
Cohesion: 0.24
Nodes (12): compileFailedOutput(), CompileResult, cmdLint(), LintResult, cmdVerify(), VerifyResult, duplicateTaskIds(), CompileError (+4 more)

### Community 35 - "compile.test.ts"
Cohesion: 0.29
Nodes (3): FIXTURES, SECTION_FILES, tmpDirs

### Community 36 - "init-concurrency.test.ts"
Cohesion: 0.33
Nodes (4): ChildOutcome, CLI_JS, SECTION_FILES, tmpDirs

### Community 37 - "paths.ts"
Cohesion: 0.24
Nodes (11): checkMcpDir(), effectiveMcpRoot, isInside(), McpDirCheck, McpRootSource, PathEscapeError, readContainmentError(), resolveNearestExisting() (+3 more)

### Community 38 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, @types/node, typescript, vitest, @vitest/coverage-v8, zod-to-json-schema, @types/node, typescript (+3 more)

### Community 39 - "check/runner.test.ts"
Cohesion: 0.12
Nodes (9): DEFAULT_TIMEOUT_MS, Executor, killActiveProcessGroups(), FakeCall, FIXTURES, PET_CLINIC, tmpDirs, Verification (+1 more)

### Community 40 - "models.ts"
Cohesion: 0.15
Nodes (12): BUILTIN_PROVIDERS, cmdModels(), fmt(), MAX_CATALOG_BYTES, ModelCatalogEntry, MODELS_REQUEST_TIMEOUT_MS, ModelsOptions, ModelsResult (+4 more)

### Community 41 - "council.test.ts"
Cohesion: 0.28
Nodes (6): BUNDLE_OK(), CLASSIFIER_BLOCK, CLASSIFIER_OK, complete(), et01Bundle(), PET_CLINIC

### Community 43 - "llm-config.ts"
Cohesion: 0.09
Nodes (19): RFC-7230, BaseUrlSchema, HeaderNameSchema, LINK_LOCAL_PREFIXES, LlmConfig, LlmConfigSchema, METADATA_HOSTS, OpenRouterRoutingSchema (+11 more)

### Community 44 - "constraint-trace.test.ts"
Cohesion: 0.10
Nodes (33): et07Requirement(), et12Requirement(), failureCodes(), FIXTURES, genericBundleFor(), groundedEt01(), groundedEt02(), groundedEt04() (+25 more)

### Community 45 - "runner-roles.test.ts"
Cohesion: 0.33
Nodes (3): complete(), et01Bundle(), PET_CLINIC

### Community 46 - "spec-core/package.json"
Cohesion: 0.22
Nodes (8): description, engines, node, license, main, name, type, version

### Community 47 - "provider.ts"
Cohesion: 0.70
Nodes (3): OPENROUTER_DEFAULT_BASE_URL, PROVIDER_KINDS, ROUTELLM_DEFAULT_BASE_URL

### Community 50 - "good-fixture-gate.test.ts"
Cohesion: 0.21
Nodes (8): CheckResult, cmdCheck(), expectedActual(), renderReport(), GOOD, GOOD_BUNDLES, SECTION_FILES, tmpDirs

### Community 51 - "package.json"
Cohesion: 0.25
Nodes (7): _archival, name, packageManager, private, scripts, test:spec, version

### Community 52 - "generate.test.ts"
Cohesion: 0.10
Nodes (12): complete(), FAKE_ENV, fetchSpy(), jsonResponse(), PET_CLINIC, PROFILE_CONFIG, SECTION_FILES, SESSION_SERVICE (+4 more)

### Community 54 - "runPipeline"
Cohesion: 0.31
Nodes (4): BudgetLedger, LlmUsage, lintReason(), runPipeline()

### Community 55 - "council.ts"
Cohesion: 0.20
Nodes (21): runDecomposedCouncil(), CLARIFY_RULES, CLASSIFY_RULES, CONSTRAINT_FIDELITY, decomposedClassifier(), decomposedJudge(), decomposedJudgeAlone(), decomposedJudgeSingle() (+13 more)

### Community 56 - "redact.ts"
Cohesion: 0.47
Nodes (4): REDACTION_RULES, RedactionRule, redactSecrets(), SecretKind

### Community 58 - "l08.test.ts"
Cohesion: 0.67
Nodes (3): FIXTURES, inState(), loadBundle()

### Community 59 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, declaration, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck (+6 more)

### Community 61 - "cli.test.ts"
Cohesion: 0.22
Nodes (3): FIXTURES, SECTION_FILES, tmpDirs

### Community 62 - "aggregate.test.ts"
Cohesion: 0.27
Nodes (8): loadRunDir(), parseEmittedOutcome(), baseScore(), BLOCKED, EmitOverrides, emittedRecord(), GREENFIELD, writeRunDir()

### Community 63 - "scale-benchmark.test.ts"
Cohesion: 0.18
Nodes (7): ClosureFinding, ClosureFindingCode, closureFindings(), DuplicateTaskId, CEILINGS_MS, mkTask(), syntheticBundle()

### Community 74 - "scripts"
Cohesion: 0.22
Nodes (9): scripts, build, lint, prepublishOnly, pretest, smoke:packed, test, test:coverage (+1 more)

### Community 75 - "stdio.ts"
Cohesion: 0.10
Nodes (20): isJsonRpcId(), isPlainObject(), validateJsonRpcEnvelope(), EPIPE_DRAIN_TIMEOUT_MS, EXIT_CLIENT_GONE, EXIT_DRAIN_TIMEOUT, EXIT_OK, jsonRpcError() (+12 more)

### Community 82 - "init.ts"
Cohesion: 0.18
Nodes (12): buildSections(), cmdInit(), Contract, Decision, EvidenceItem, GlossaryEntry, InitOptions, InitResult (+4 more)

### Community 88 - "commands/trace.test.ts"
Cohesion: 0.10
Nodes (15): renderTrace(), compiledBundle(), FIXTURES, SECTION_FILES, tmpDirs, TraceResult, buildTrace(), DecSpec (+7 more)

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
Cohesion: 0.17
Nodes (20): buildLlmPlanFromProfile(), checkIntent(), clarificationBlock(), cmdGenerate(), GenerateOptions, GenerateResult, IntentCheck, lintReason() (+12 more)

### Community 106 - "files"
Cohesion: 0.33
Nodes (6): files, dist, examples, generated, LICENSE, README.md

### Community 108 - "corpus-lock.ts"
Cohesion: 0.24
Nodes (16): canonicalJson(), computeCorpusHash(), CORPUS_LOCK_VERSION, CorpusLock, CorpusLockEntry, frozenThresholds, loadCorpusLock(), lockCandidates() (+8 more)

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
- **346 isolated node(s):** `name`, `version`, `private`, `packageManager`, `_archival` (+341 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SpecBundle` connect `SpecBundle` to `budget.ts`, `consent.ts`, `check/runner.ts`, `eval/runner.ts`, `lifecycle.ts`, `acquireSpecRootLock`, `engine.ts`, `schemas/index.ts`, `TaskContract`, `LlmRole`, `lintBundle`, `report.ts`, `clarify.test.ts`, `l14.ts`, `l12.test.ts`, `types.ts`, `commands/plan.test.ts`, `freeze.test.ts`, `all-bad-fixtures.test.ts`, `eval/runner.test.ts`, `tasks/index.ts`, `compileSpecDir`, `compile.test.ts`, `check/runner.test.ts`, `council.test.ts`, `constraint-trace.test.ts`, `runner-roles.test.ts`, `l01.test.ts`, `l02.test.ts`, `good-fixture-gate.test.ts`, `generate.test.ts`, `l03.test.ts`, `council.ts`, `l04.test.ts`, `l08.test.ts`, `l05.test.ts`, `scale-benchmark.test.ts`, `l06.test.ts`, `l07.test.ts`, `l10.test.ts`, `commands/trace.test.ts`, `generate.ts`?**
  _High betweenness centrality (0.109) - this node is a cross-community bridge._
- **Why does `lintBundle()` connect `lintBundle` to `eval/runner.ts`, `engine.ts`, `schemas/index.ts`, `TaskContract`, `report.ts`, `live-experiment.ts`, `l12.test.ts`, `types.ts`, `all-bad-fixtures.test.ts`, `tasks/index.ts`, `compileSpecDir`, `l01.test.ts`, `l02.test.ts`, `good-fixture-gate.test.ts`, `l03.test.ts`, `runPipeline`, `l04.test.ts`, `l08.test.ts`, `l05.test.ts`, `scale-benchmark.test.ts`, `l06.test.ts`, `l07.test.ts`, `l10.test.ts`, `generate.ts`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Why does `LlmAdapter` connect `adapter.ts` to `budget.ts`, `tasks/index.ts`, `server.ts`, `eval/runner.ts`, `generate.ts`, `council.test.ts`, `runner-roles.test.ts`, `clarify.test.ts`, `generate.test.ts`, `server.test.ts`, `providers.ts`, `eval/runner.test.ts`, `openai-compatible.ts`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `runPipeline()` (e.g. with `.chargeAttempts()` and `.chargeTokens()`) actually correct?**
  _`runPipeline()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _346 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `budget.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06060606060606061 - nodes in this community are weakly interconnected._
- **Should `consent.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10967741935483871 - nodes in this community are weakly interconnected._