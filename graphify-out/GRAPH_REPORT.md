# Graph Report - llm_council_orchestrator  (2026-08-30)

## Corpus Check
- 223 files · ~197,807 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1248 nodes · 3027 edges · 81 communities (78 shown, 3 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `4e417f23`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- budget.ts
- adapter.ts
- consent.ts
- check/runner.ts
- namespace-ids.test.ts
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
- commands/plan.ts
- index.test.ts
- change.test.ts
- report.ts
- live-experiment.ts
- tasks/index.ts
- l14.ts
- EVAL_TASKS
- scale-benchmark.test.ts
- constraints.ts
- commands/plan.test.ts
- freeze.test.ts
- SpecBundle
- all-bad-fixtures.test.ts
- openai-compatible.ts
- eval/runner.test.ts
- revision.test.ts
- server.ts
- score.ts
- compileSpecDir
- compile.test.ts
- init-concurrency.test.ts
- paths.ts
- devDependencies
- check/runner.test.ts
- llm-config.ts
- lint/trace.test.ts
- execInProcessGroup
- handleToolsCall
- constraint-trace.test.ts
- check.ts
- spec-core/package.json
- common.ts
- http.test.ts
- version.ts
- good-fixture-gate.test.ts
- package.json
- generate.test.ts
- decisions.ts
- BudgetLedger
- eval/runner.ts
- redact.ts
- contracts.ts
- l08.test.ts
- compilerOptions
- intent-fidelity.test.ts
- cli.test.ts
- aggregate.test.ts
- TaskContract
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
- `PlanTask` --references--> `TaskContract`  [EXTRACTED]
  packages/spec-core/src/cli/commands/plan.ts → packages/spec-core/src/schemas/tasks.ts
- `compiledBundle()` --calls--> `compileSpecDir()`  [EXTRACTED]
  packages/spec-core/src/cli/commands/trace.test.ts → packages/spec-core/src/compiler/compile.ts
- `ApplyResult` --references--> `SpecBundle`  [EXTRACTED]
  packages/spec-core/src/compiler/changeset.ts → packages/spec-core/src/schemas/index.ts
- `CompileResult` --references--> `SpecBundle`  [EXTRACTED]
  packages/spec-core/src/compiler/compile.ts → packages/spec-core/src/schemas/index.ts

## Import Cycles
- 3-file cycle: `packages/spec-core/src/eval/budget.ts -> packages/spec-core/src/eval/llm/http.ts -> packages/spec-core/src/llm/openai-compatible.ts -> packages/spec-core/src/eval/budget.ts`

## Communities (81 total, 3 thin omitted)

### Community 0 - "budget.ts"
Cohesion: 0.17
Nodes (17): BudgetCap, BudgetSpentSnapshot, DEFAULT_WALL_SLACK_MS, MAX_COMPLETIONS, maxCompletions(), ResolvedRunBudget, resolveRunBudget(), worstCaseAttempts() (+9 more)

### Community 1 - "adapter.ts"
Cohesion: 0.28
Nodes (9): LlmAdapter, LlmCompleteOptions, LlmResponse, createMockLlm(), MockScript, SCRIPT, LlmRoute, LlmProvenance (+1 more)

### Community 2 - "consent.ts"
Cohesion: 0.11
Nodes (27): authorizeExecution(), checkPreviewDigest(), consentDigestLine(), EXEC_OPT_IN_ENV, ExecAuthorization, execOptInFromEnv(), execRootFromEnv(), GENERATE_OPT_IN_ENV (+19 more)

### Community 3 - "check/runner.ts"
Cohesion: 0.16
Nodes (15): parseExpect(), activeProcessGroups, EVIDENCE_FILE_MODE, evidenceRunName(), ExecutorResult, FORCE_SETTLE_GRACE_MS, GROUP_KILL_GRACE_MS, MAX_BUFFER_BYTES (+7 more)

### Community 4 - "namespace-ids.test.ts"
Cohesion: 0.25
Nodes (9): AssumptionIdSchema, DecisionIdSchema, RequirementIdSchema, TaskIdSchema, TestIdSchema, RequirementSchema, validRequirement, TaskContractSchema (+1 more)

### Community 5 - "lifecycle.ts"
Cohesion: 0.11
Nodes (28): applyChangeSet(), ApplyResult, ChangeSetSchema, formatIssues(), cleanLint, FIXTURES, freeze(), checkTransition() (+20 more)

### Community 6 - "acquireSpecRootLock"
Cohesion: 0.17
Nodes (13): buildSections(), cmdInit(), pathExists(), SECTION_KEYS, PET_CLINIC, SECTION_FILES, tmpDirs, writeSpecDir() (+5 more)

### Community 7 - "check.test.ts"
Cohesion: 0.21
Nodes (8): evidenceOf(), evidencePath(), FIXTURES, freshRoot(), initRoot(), makeSpecRoot(), SECTION_FILES, tmpDirs

### Community 8 - "engine.ts"
Cohesion: 0.15
Nodes (17): BAD, BadFixtureExpectation, RULES, rule, rule, rule, rule, rule (+9 more)

### Community 9 - "schemas/index.ts"
Cohesion: 0.16
Nodes (10): GOOD, SpecBundleForExport, GENERATED_PATH, GlossaryEntrySchema, SpecBundleSchema, IntentSchema, validIntent, INPUT_CEILINGS (+2 more)

### Community 10 - "doctor.ts"
Cohesion: 0.11
Nodes (29): BIN_FILES, BUDGET_ENV, checkBins(), checkBudgetEnv(), checkLlmConfig(), checkLock(), checkMcpFlags(), checkNodeVersion() (+21 more)

### Community 11 - "run-eval.test.ts"
Cohesion: 0.25
Nodes (7): DEFAULT_REPORT_PATH, LIVE_ENV_VARS, parseArgs(), ParsedArgs, runEvalCli(), FAKE_LIVE_ENV, mockRunEvalAll

### Community 12 - "cli/index.ts"
Cohesion: 0.23
Nodes (15): commandHelp(), parseArgs(), cmdCheck(), cmdCompile(), parseEnginesFloor(), cmdModels(), cmdVerify(), readBudgetEnv() (+7 more)

### Community 13 - "aggregate.ts"
Cohesion: 0.19
Nodes (14): Aggregation, VariantCost, binomialCdf(), binomialPmf(), binomialTail(), bisect(), choose(), clopperPearson95() (+6 more)

### Community 14 - "revision.ts"
Cohesion: 0.26
Nodes (11): backupPathFor(), createDirAtomically(), fsyncDir(), LockIdentity, LockOptions, nextSuffix(), serialize(), SpecRootLock (+3 more)

### Community 15 - "commands/plan.ts"
Cohesion: 0.14
Nodes (16): cmdPlan(), PlanOptions, PlanResult, PlanTask, renderHuman(), renderJson(), TopoResult, topoSort() (+8 more)

### Community 16 - "index.test.ts"
Cohesion: 0.19
Nodes (8): EvidenceIdSchema, EvidenceItemSchema, validEvidence, validBundle, validManifest, TraceEdgeSchema, LegacyPackageSchema, validLegacy

### Community 17 - "change.test.ts"
Cohesion: 0.22
Nodes (6): FIXTURES, frozenSpecRoot(), inlineBundle(), makeSpecRoot(), SECTION_FILES, tmpDirs

### Community 18 - "report.ts"
Cohesion: 0.14
Nodes (21): BadFixtureCapture, groundedBundleFor(), BAD, BadFixtureExpectation, buildMockScripts(), deriveBundle(), EvalEvidence, finishEvidence() (+13 more)

### Community 19 - "live-experiment.ts"
Cohesion: 0.25
Nodes (11): aggregateEmitted(), EMITTED_SCHEMA, EmittedOutcome, renderAggregation(), emittedFileName(), ParsedExperimentArgs, parseExperimentArgs(), runEmittingEval() (+3 more)

### Community 20 - "tasks/index.ts"
Cohesion: 0.14
Nodes (10): BASE, complete(), unresolvedBundle(), DeterministicAssertion, EvalTask, EvalTaskId, EvalTaskKind, IntentConstraint (+2 more)

### Community 21 - "l14.ts"
Cohesion: 0.43
Nodes (4): EXPECT_GRAMMAR_DOC, EXPECTED_EXIT_PATTERN, isJudgeableExpect(), rule

### Community 22 - "EVAL_TASKS"
Cohesion: 0.22
Nodes (15): calcs(), G1_REQUIRED_TOTAL, GateCalcs, GateReportInput, gateVerdict, renderGateReport(), fixtures15(), liveInput() (+7 more)

### Community 23 - "scale-benchmark.test.ts"
Cohesion: 0.13
Nodes (11): firstOverlap(), globSegments(), globsOverlap(), rule, segmentsOverlap(), FIXTURES, refMatch(), refPathMatch() (+3 more)

### Community 24 - "constraints.ts"
Cohesion: 0.25
Nodes (17): anchorSentences(), checkConstraintTrace(), commitmentSurfaces(), ConstraintFailureCode, containsTerm(), containsWholeTerm(), evaluateCandidate(), expandNumberToken() (+9 more)

### Community 25 - "commands/plan.test.ts"
Cohesion: 0.17
Nodes (4): compiledBundle(), FIXTURES, SECTION_FILES, tmpDirs

### Community 26 - "freeze.test.ts"
Cohesion: 0.38
Nodes (5): cleanLint, FIXTURES, frozenPetClinic(), inState(), loadBundle()

### Community 27 - "SpecBundle"
Cohesion: 0.07
Nodes (10): FreezeResult, FIXTURES, FIXTURES, FIXTURES, FIXTURES, FIXTURES, FIXTURES, FIXTURES (+2 more)

### Community 28 - "all-bad-fixtures.test.ts"
Cohesion: 0.11
Nodes (16): artifactHashes(), HASHED_SECTIONS, sha256Content(), FIXTURES, HASHED_KEYS, cleanLint, FIXTURES, verifyFrozen() (+8 more)

### Community 29 - "openai-compatible.ts"
Cohesion: 0.16
Nodes (19): ResolvedRole, ChatResponse, CostExtractor, createOpenAiCompatibleLlm(), parseSuccess(), extractProvenance(), extractUsageDetails(), HTTP_BACKOFF_SCHEDULE_MS (+11 more)

### Community 30 - "eval/runner.test.ts"
Cohesion: 0.24
Nodes (7): complete(), counterOnlyUnresolvedBundle(), et01Bundle(), PET_CLINIC, proposalAJson(), unresolvedAddedBundle(), unresolvedPlusLintDirtyBundle()

### Community 31 - "revision.test.ts"
Cohesion: 0.17
Nodes (5): DEFAULT_STALE_MS, LOCK_FILE, LockHeldError, fsyncCtl, tmpDirs

### Community 32 - "server.ts"
Cohesion: 0.10
Nodes (19): DEFAULT_GENERATE_PROFILE, ExecBoundary, GenerateProfile, GenerateVariant, ARG_SPECS, ArgName, ArgValidator, CallContext (+11 more)

### Community 33 - "score.ts"
Cohesion: 0.19
Nodes (9): allUnGrounded(), ConstraintFailure, advisoryInventions(), assertionPasses(), constraintFailuresFor(), RunUsage, scoreRun(), PET_CLINIC (+1 more)

### Community 34 - "compileSpecDir"
Cohesion: 0.14
Nodes (22): applyUnderLock(), ChangeResult, cmdChange(), findingLine(), compileFailedOutput(), CompileResult, cmdFreeze(), FreezeResult (+14 more)

### Community 35 - "compile.test.ts"
Cohesion: 0.29
Nodes (3): FIXTURES, SECTION_FILES, tmpDirs

### Community 36 - "init-concurrency.test.ts"
Cohesion: 0.33
Nodes (4): ChildOutcome, CLI_JS, SECTION_FILES, tmpDirs

### Community 37 - "paths.ts"
Cohesion: 0.22
Nodes (13): assertNoSymlinkBelow(), assertWritableSpecDir(), checkMcpDir(), effectiveMcpRoot, isInside(), McpDirCheck, McpRootSource, PathEscapeError (+5 more)

### Community 38 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, @types/node, typescript, vitest, @vitest/coverage-v8, zod-to-json-schema, @types/node, typescript (+3 more)

### Community 39 - "check/runner.test.ts"
Cohesion: 0.13
Nodes (7): DEFAULT_TIMEOUT_MS, killActiveProcessGroups(), FakeCall, FIXTURES, PET_CLINIC, tmpDirs, Verification

### Community 40 - "llm-config.ts"
Cohesion: 0.09
Nodes (25): BUILTIN_PROVIDERS, fmt(), MAX_CATALOG_BYTES, ModelCatalogEntry, MODELS_REQUEST_TIMEOUT_MS, ModelsOptions, ModelsResult, parseCatalog() (+17 more)

### Community 41 - "lint/trace.test.ts"
Cohesion: 0.22
Nodes (7): DecSpec, GOOD, mkBundle(), mkTask(), ReqSpec, TaskSpec, testWith()

### Community 43 - "handleToolsCall"
Cohesion: 0.25
Nodes (11): generateOptInFromEnv(), errorResponse(), handleRpcLine(), handleToolsCall(), isJsonRpcId(), isPlainObject(), loadLlmConfigForProfiles(), parseToolInput() (+3 more)

### Community 44 - "constraint-trace.test.ts"
Cohesion: 0.18
Nodes (13): et07Requirement(), et12Requirement(), failureCodes(), FIXTURES, genericBundleFor(), groundedEt01(), groundedEt02(), groundedEt04() (+5 more)

### Community 45 - "check.ts"
Cohesion: 0.38
Nodes (6): CheckOutcome, Executor, CheckOptions, CheckResult, expectedActual(), renderReport()

### Community 46 - "spec-core/package.json"
Cohesion: 0.22
Nodes (8): description, engines, node, license, main, name, type, version

### Community 47 - "common.ts"
Cohesion: 0.27
Nodes (7): ComplexityProfileSchema, IdSchema, ImpactLevelSchema, Sha256Schema, SpecStateSchema, ManifestSchema, validManifest

### Community 48 - "http.test.ts"
Cohesion: 0.17
Nodes (10): BudgetExceededError, createBudgetLedger(), FAKE_ENV, FakeEnv, jsonResponse(), okFetch(), PartialFakeEnv, baseConfig() (+2 more)

### Community 49 - "version.ts"
Cohesion: 0.36
Nodes (7): checkSpecSchemaVersion(), ParsedVersion, parseVersion(), SPEC_SCHEMA_VERSION, SpecSchemaVersionFieldSchema, SpecSchemaVersionVerdict, SUPPORTED

### Community 50 - "good-fixture-gate.test.ts"
Cohesion: 0.29
Nodes (4): GOOD, GOOD_BUNDLES, SECTION_FILES, tmpDirs

### Community 51 - "package.json"
Cohesion: 0.25
Nodes (7): _archival, name, packageManager, private, scripts, test:spec, version

### Community 52 - "generate.test.ts"
Cohesion: 0.10
Nodes (12): complete(), FAKE_ENV, fetchSpy(), jsonResponse(), PET_CLINIC, PROFILE_CONFIG, SECTION_FILES, SESSION_SERVICE (+4 more)

### Community 53 - "decisions.ts"
Cohesion: 0.25
Nodes (5): DecisionSchema, validDecision, FIXTURES, validManifest, validTask

### Community 55 - "eval/runner.ts"
Cohesion: 0.05
Nodes (67): GenerateOptions, ResolvedProfile, CouncilTopology, DecomposedCouncilDeps, runDecomposedCouncil(), BUNDLE_OK(), CLASSIFIER_BLOCK, CLASSIFIER_OK (+59 more)

### Community 56 - "redact.ts"
Cohesion: 0.47
Nodes (4): REDACTION_RULES, RedactionRule, redactSecrets(), SecretKind

### Community 57 - "contracts.ts"
Cohesion: 0.50
Nodes (3): ContractIdSchema, ContractSchema, validContract

### Community 58 - "l08.test.ts"
Cohesion: 0.67
Nodes (3): FIXTURES, inState(), loadBundle()

### Community 59 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, declaration, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck (+6 more)

### Community 60 - "intent-fidelity.test.ts"
Cohesion: 0.22
Nodes (5): FIXTURES, genericBundleFor(), loadFixture(), U, ConstraintTraceAssertion

### Community 61 - "cli.test.ts"
Cohesion: 0.22
Nodes (3): FIXTURES, SECTION_FILES, tmpDirs

### Community 62 - "aggregate.test.ts"
Cohesion: 0.27
Nodes (8): loadRunDir(), parseEmittedOutcome(), baseScore(), BLOCKED, EmitOverrides, emittedRecord(), GREENFIELD, writeRunDir()

### Community 63 - "TaskContract"
Cohesion: 0.22
Nodes (6): ChangeSet, ClosureFinding, ClosureFindingCode, closureFindings(), DuplicateTaskId, TaskContract

### Community 74 - "scripts"
Cohesion: 0.22
Nodes (9): scripts, build, lint, prepublishOnly, pretest, smoke:packed, test, test:coverage (+1 more)

### Community 75 - "stdio.ts"
Cohesion: 0.11
Nodes (16): EPIPE_DRAIN_TIMEOUT_MS, EXIT_CLIENT_GONE, EXIT_DRAIN_TIMEOUT, EXIT_OK, jsonRpcError(), MAX_FRAME_BYTES, MAX_IN_FLIGHT, McpStdioServer (+8 more)

### Community 82 - "init.ts"
Cohesion: 0.18
Nodes (10): Contract, Decision, EvidenceItem, GlossaryEntry, InitOptions, InitResult, Intent, Requirement (+2 more)

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

### Community 101 - "generate.ts"
Cohesion: 0.11
Nodes (27): Command, COMMANDS, GenerateVariant, InitProfile, ParseResult, SingleDirCommand, buildLlmPlanFromProfile(), checkIntent() (+19 more)

### Community 106 - "files"
Cohesion: 0.33
Nodes (6): files, dist, examples, generated, LICENSE, README.md

### Community 108 - "corpus-lock.ts"
Cohesion: 0.25
Nodes (15): canonicalJson(), computeCorpusHash(), CORPUS_LOCK_VERSION, CorpusLock, CorpusLockEntry, frozenThresholds, loadCorpusLock(), lockCandidates() (+7 more)

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
- **342 isolated node(s):** `name`, `version`, `private`, `packageManager`, `_archival` (+337 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SpecBundle` connect `SpecBundle` to `budget.ts`, `consent.ts`, `check/runner.ts`, `lifecycle.ts`, `acquireSpecRootLock`, `engine.ts`, `schemas/index.ts`, `commands/plan.ts`, `report.ts`, `tasks/index.ts`, `l14.ts`, `scale-benchmark.test.ts`, `constraints.ts`, `commands/plan.test.ts`, `freeze.test.ts`, `all-bad-fixtures.test.ts`, `eval/runner.test.ts`, `score.ts`, `compileSpecDir`, `compile.test.ts`, `check/runner.test.ts`, `lint/trace.test.ts`, `constraint-trace.test.ts`, `check.ts`, `good-fixture-gate.test.ts`, `generate.test.ts`, `eval/runner.ts`, `l08.test.ts`, `intent-fidelity.test.ts`, `TaskContract`, `commands/trace.test.ts`, `generate.ts`?**
  _High betweenness centrality (0.111) - this node is a cross-community bridge._
- **Why does `lintBundle()` connect `compileSpecDir` to `score.ts`, `generate.ts`, `engine.ts`, `commands/plan.ts`, `change.test.ts`, `report.ts`, `live-experiment.ts`, `good-fixture-gate.test.ts`, `scale-benchmark.test.ts`, `eval/runner.ts`, `l08.test.ts`, `SpecBundle`, `all-bad-fixtures.test.ts`, `TaskContract`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `SpecBundleSchema` connect `schemas/index.ts` to `compileSpecDir`, `check/runner.test.ts`, `engine.ts`, `lint/trace.test.ts`, `doctor.ts`, `index.test.ts`, `report.ts`, `generate.test.ts`, `l14.ts`, `scale-benchmark.test.ts`, `eval/runner.ts`, `decisions.ts`, `all-bad-fixtures.test.ts`, `TaskContract`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `runPipeline()` (e.g. with `.chargeAttempts()` and `.chargeTokens()`) actually correct?**
  _`runPipeline()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _342 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `consent.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11264367816091954 - nodes in this community are weakly interconnected._
- **Should `lifecycle.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11174242424242424 - nodes in this community are weakly interconnected._