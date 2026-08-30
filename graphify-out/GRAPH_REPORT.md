# Graph Report - llm_council_orchestrator  (2026-08-28)

## Corpus Check
- 203 files · ~175,086 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1098 nodes · 2576 edges · 64 communities (63 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ffa553d9`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- budget.ts
- check/runner.ts
- consent.ts
- compileSpecDir
- schemas/index.ts
- lifecycle.ts
- acquireSpecRootLock
- check.test.ts
- engine.ts
- lintBundle
- doctor.ts
- run-eval.test.ts
- http.test.ts
- aggregate.ts
- TaskContract
- plan.test.ts
- score.ts
- change.test.ts
- report.ts
- live-experiment.ts
- init-concurrency.test.ts
- l14.ts
- lint/trace.test.ts
- scale-benchmark.test.ts
- eval/runner.ts
- aggregate.test.ts
- l08.test.ts
- SpecBundle
- hash.ts
- report.test.ts
- freeze.test.ts
- server.ts
- envelope.ts
- devDependencies
- constraint-trace.test.ts
- spec-core/package.json
- package.json
- generate.test.ts
- compilerOptions
- cli.test.ts
- eval/runner.test.ts
- scripts
- stdio.ts
- revision.ts
- init.ts
- http.ts
- all-bad-fixtures.test.ts
- commands/trace.test.ts
- make-bins-executable.js
- packed-install-smoke.sh
- prepublish-check.js
- generate.ts
- files
- corpus-lock.ts
- prepublish-check.boundary.test.ts
- server.test.ts
- validation.ts
- bin
- compile.test.ts
- readiness.ts
- dependencies
- repository
- cli/index.ts

## God Nodes (most connected - your core abstractions)
1. `SpecBundle` - 64 edges
2. `compileSpecDir()` - 37 edges
3. `lintBundle()` - 36 edges
4. `runPipeline()` - 30 edges
5. `runCli()` - 23 edges
6. `SpecBundleSchema` - 21 edges
7. `TaskContract` - 19 edges
8. `EVAL_TASKS` - 19 edges
9. `freeze()` - 18 edges
10. `LintFinding` - 17 edges

## Surprising Connections (you probably didn't know these)
- `CompileResult` --references--> `SpecBundle`  [EXTRACTED]
  packages/spec-core/src/compiler/compile.ts → packages/spec-core/src/schemas/index.ts
- `compiledBundle()` --calls--> `compileSpecDir()`  [EXTRACTED]
  packages/spec-core/src/cli/commands/plan.test.ts → packages/spec-core/src/compiler/compile.ts
- `compiledBundle()` --calls--> `compileSpecDir()`  [EXTRACTED]
  packages/spec-core/src/cli/commands/trace.test.ts → packages/spec-core/src/compiler/compile.ts
- `runPipeline()` --calls--> `classifySingle()`  [EXTRACTED]
  packages/spec-core/src/eval/runner.ts → packages/spec-core/src/eval/prompts.ts
- `runPipeline()` --calls--> `propose()`  [EXTRACTED]
  packages/spec-core/src/eval/runner.ts → packages/spec-core/src/eval/prompts.ts

## Import Cycles
- None detected.

## Communities (64 total, 1 thin omitted)

### Community 0 - "budget.ts"
Cohesion: 0.18
Nodes (12): BudgetCap, BudgetExceededError, BudgetSpentSnapshot, DEFAULT_WALL_SLACK_MS, MAX_COMPLETIONS, ResolvedRunBudget, resolveRunBudget(), worstCaseAttempts() (+4 more)

### Community 1 - "check/runner.ts"
Cohesion: 0.05
Nodes (45): parseExpect(), REDACTION_RULES, RedactionRule, redactSecrets(), SecretKind, activeProcessGroups, CheckOutcome, DEFAULT_TIMEOUT_MS (+37 more)

### Community 2 - "consent.ts"
Cohesion: 0.12
Nodes (26): authorizeExecution(), checkPreviewDigest(), consentDigestLine(), EXEC_OPT_IN_ENV, ExecAuthorization, execOptInFromEnv(), execRootFromEnv(), GENERATE_OPT_IN_ENV (+18 more)

### Community 3 - "compileSpecDir"
Cohesion: 0.18
Nodes (11): CompileResult, compileLintFreeze(), SECTION_PATHS, tmpDirs, LintResult, CompileError, CompileResult, compileSpecDir() (+3 more)

### Community 4 - "schemas/index.ts"
Cohesion: 0.05
Nodes (51): BAD, BadFixtureExpectation, GOOD, AssumptionIdSchema, ComplexityProfileSchema, ContractIdSchema, DecisionIdSchema, EvidenceIdSchema (+43 more)

### Community 5 - "lifecycle.ts"
Cohesion: 0.10
Nodes (29): applyChangeSet(), ChangeSet, ChangeSetSchema, formatIssues(), cleanLint, FIXTURES, checkTransition(), FREEZE_REFUSAL_HINTS (+21 more)

### Community 6 - "acquireSpecRootLock"
Cohesion: 0.22
Nodes (10): SECTION_KEYS, PET_CLINIC, SECTION_FILES, tmpDirs, writeSpecDir(), assertNotSymlink(), acquireSpecRootLock(), breakStaleLock() (+2 more)

### Community 7 - "check.test.ts"
Cohesion: 0.21
Nodes (8): evidenceOf(), evidencePath(), FIXTURES, freshRoot(), initRoot(), makeSpecRoot(), SECTION_FILES, tmpDirs

### Community 8 - "engine.ts"
Cohesion: 0.19
Nodes (14): RULES, rule, rule, rule, rule, rule, rule, rule (+6 more)

### Community 9 - "lintBundle"
Cohesion: 0.18
Nodes (12): applyUnderLock(), ChangeResult, cmdChange(), findingLine(), cmdFreeze(), FreezeResult, GOOD, GOOD_BUNDLES (+4 more)

### Community 10 - "doctor.ts"
Cohesion: 0.11
Nodes (28): BIN_FILES, BUDGET_ENV, checkBins(), checkBudgetEnv(), checkLock(), checkMcpFlags(), checkNodeVersion(), checkProviderEnv() (+20 more)

### Community 11 - "run-eval.test.ts"
Cohesion: 0.26
Nodes (9): runEvalAll(), DEFAULT_REPORT_PATH, LIVE_ENV_VARS, missingLiveEnv(), parseArgs(), ParsedArgs, runEvalCli(), FAKE_LIVE_ENV (+1 more)

### Community 12 - "http.test.ts"
Cohesion: 0.29
Nodes (5): FAKE_ENV, FakeEnv, jsonResponse(), okFetch(), PartialFakeEnv

### Community 13 - "aggregate.ts"
Cohesion: 0.15
Nodes (20): Aggregation, VariantCost, calcs(), gateVerdict, renderGateReport(), PipelineVariant, binomialCdf(), binomialPmf() (+12 more)

### Community 14 - "TaskContract"
Cohesion: 0.19
Nodes (8): PlanTask, ClosureFinding, ClosureFindingCode, closureFindings(), DuplicateTaskId, duplicateTaskIds(), rule, TaskContract

### Community 15 - "plan.test.ts"
Cohesion: 0.12
Nodes (13): cmdPlan(), PlanOptions, PlanResult, renderHuman(), renderJson(), compiledBundle(), FIXTURES, SECTION_FILES (+5 more)

### Community 16 - "score.ts"
Cohesion: 0.09
Nodes (20): allUnGrounded(), FIXTURES, genericBundleFor(), loadFixture(), U, PipelineOutcome, advisoryInventions(), assertionPasses() (+12 more)

### Community 17 - "change.test.ts"
Cohesion: 0.21
Nodes (7): FIXTURES, frozenSpecRoot(), inlineBundle(), makeSpecRoot(), SECTION_FILES, tmpDirs, freeze()

### Community 18 - "report.ts"
Cohesion: 0.16
Nodes (17): BadFixtureCapture, groundedBundleFor(), BAD, BadFixtureExpectation, buildMockScripts(), deriveBundle(), EvalEvidence, fixtureNameFor() (+9 more)

### Community 19 - "live-experiment.ts"
Cohesion: 0.18
Nodes (16): aggregateEmitted(), EMITTED_SCHEMA, EmittedOutcome, renderAggregation(), verifyCorpusLock(), emittedFileName(), ParsedExperimentArgs, parseExperimentArgs() (+8 more)

### Community 20 - "init-concurrency.test.ts"
Cohesion: 0.33
Nodes (4): ChildOutcome, CLI_JS, SECTION_FILES, tmpDirs

### Community 21 - "l14.ts"
Cohesion: 0.43
Nodes (4): EXPECT_GRAMMAR_DOC, EXPECTED_EXIT_PATTERN, isJudgeableExpect(), rule

### Community 22 - "lint/trace.test.ts"
Cohesion: 0.22
Nodes (7): DecSpec, GOOD, mkBundle(), mkTask(), ReqSpec, TaskSpec, testWith()

### Community 23 - "scale-benchmark.test.ts"
Cohesion: 0.13
Nodes (11): firstOverlap(), globSegments(), globsOverlap(), rule, segmentsOverlap(), FIXTURES, refMatch(), refPathMatch() (+3 more)

### Community 24 - "eval/runner.ts"
Cohesion: 0.16
Nodes (13): BudgetLedger, LlmUsage, buildValidationRetryPrompt(), ClassifierOutputSchema, firstIssues(), lintReason(), parseJsonOrBlock(), PipelineTask (+5 more)

### Community 25 - "aggregate.test.ts"
Cohesion: 0.27
Nodes (8): loadRunDir(), parseEmittedOutcome(), baseScore(), BLOCKED, EmitOverrides, emittedRecord(), GREENFIELD, writeRunDir()

### Community 26 - "l08.test.ts"
Cohesion: 0.67
Nodes (3): FIXTURES, inState(), loadBundle()

### Community 27 - "SpecBundle"
Cohesion: 0.07
Nodes (11): ApplyResult, FreezeResult, FIXTURES, FIXTURES, FIXTURES, FIXTURES, FIXTURES, FIXTURES (+3 more)

### Community 28 - "hash.ts"
Cohesion: 0.31
Nodes (6): artifactHashes(), HASHED_SECTIONS, sha256Content(), FIXTURES, HASHED_KEYS, generateConsentDigest()

### Community 29 - "report.test.ts"
Cohesion: 0.36
Nodes (7): ConstraintFailure, GateReportInput, fixtures15(), liveInput(), passInput(), passRuns(), RunScore

### Community 30 - "freeze.test.ts"
Cohesion: 0.38
Nodes (5): cleanLint, FIXTURES, frozenPetClinic(), inState(), loadBundle()

### Community 32 - "server.ts"
Cohesion: 0.11
Nodes (24): ExecBoundary, generateOptInFromEnv(), GenerateProfile, GenerateVariant, ARG_SPECS, ArgName, ArgValidator, CallContext (+16 more)

### Community 33 - "envelope.ts"
Cohesion: 0.18
Nodes (20): computeCostEnvelope(), CostEnvelope, measurePromptSizes(), PromptSize, renderCostEnvelopeTable(), VariantEnvelope, CLASSIFY_RULES, classifyAndProposeSingle() (+12 more)

### Community 38 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, @types/node, typescript, vitest, @vitest/coverage-v8, zod-to-json-schema, @types/node, typescript (+3 more)

### Community 44 - "constraint-trace.test.ts"
Cohesion: 0.10
Nodes (32): et07Requirement(), et12Requirement(), failureCodes(), FIXTURES, genericBundleFor(), groundedEt01(), groundedEt02(), groundedEt04() (+24 more)

### Community 46 - "spec-core/package.json"
Cohesion: 0.22
Nodes (8): description, engines, node, license, main, name, type, version

### Community 51 - "package.json"
Cohesion: 0.25
Nodes (7): _archival, name, packageManager, private, scripts, test:spec, version

### Community 52 - "generate.test.ts"
Cohesion: 0.11
Nodes (11): complete(), FAKE_ENV, fetchSpy(), jsonResponse(), PET_CLINIC, SECTION_FILES, SESSION_SERVICE, tmpDirs (+3 more)

### Community 59 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, declaration, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck (+6 more)

### Community 61 - "cli.test.ts"
Cohesion: 0.22
Nodes (3): FIXTURES, SECTION_FILES, tmpDirs

### Community 68 - "eval/runner.test.ts"
Cohesion: 0.24
Nodes (7): complete(), counterOnlyUnresolvedBundle(), et01Bundle(), PET_CLINIC, proposalAJson(), unresolvedAddedBundle(), unresolvedPlusLintDirtyBundle()

### Community 74 - "scripts"
Cohesion: 0.22
Nodes (9): scripts, build, lint, prepublishOnly, pretest, smoke:packed, test, test:coverage (+1 more)

### Community 75 - "stdio.ts"
Cohesion: 0.10
Nodes (19): killActiveProcessGroups(), isJsonRpcId(), EPIPE_DRAIN_TIMEOUT_MS, EXIT_CLIENT_GONE, EXIT_DRAIN_TIMEOUT, EXIT_OK, jsonRpcError(), MAX_FRAME_BYTES (+11 more)

### Community 78 - "revision.ts"
Cohesion: 0.13
Nodes (16): backupPathFor(), createDirAtomically(), DEFAULT_STALE_MS, fsyncDir(), LOCK_FILE, LockHeldError, LockIdentity, LockOptions (+8 more)

### Community 82 - "init.ts"
Cohesion: 0.16
Nodes (13): buildSections(), cmdInit(), Contract, Decision, EvidenceItem, GlossaryEntry, InitOptions, InitResult (+5 more)

### Community 84 - "http.ts"
Cohesion: 0.28
Nodes (7): LlmAdapter, LlmCompleteOptions, LlmResponse, BACKOFF_MS, HttpChatResponse, MockScript, SCRIPT

### Community 86 - "all-bad-fixtures.test.ts"
Cohesion: 0.21
Nodes (9): compileFailedOutput(), cmdVerify(), VerifyResult, verifyFrozen(), VerifyResult, BAD, BadFixtureExpectation, FIXTURES (+1 more)

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
Cohesion: 0.13
Nodes (23): Command, COMMANDS, GenerateVariant, InitProfile, ParseResult, SingleDirCommand, checkIntent(), cmdGenerate() (+15 more)

### Community 106 - "files"
Cohesion: 0.33
Nodes (6): files, dist, examples, generated, LICENSE, README.md

### Community 108 - "corpus-lock.ts"
Cohesion: 0.21
Nodes (16): canonicalJson(), computeCorpusHash(), CORPUS_LOCK_VERSION, CorpusLock, CorpusLockEntry, frozenThresholds, loadCorpusLock(), lockCandidates() (+8 more)

### Community 116 - "server.test.ts"
Cohesion: 0.13
Nodes (17): EXEC_ROOT_ENV, callTool(), expectIdentical(), FIXTURES, freshOutside(), freshRoot(), frozenRoot(), injectionRoot() (+9 more)

### Community 124 - "validation.ts"
Cohesion: 0.22
Nodes (6): LevelLoadResult, FIXTURES, SECTION_FILES, tmpDirs, VALIDATION_LEVELS, ValidationLevel

### Community 126 - "bin"
Cohesion: 0.67
Nodes (3): bin, lco, lco-mcp

### Community 127 - "compile.test.ts"
Cohesion: 0.29
Nodes (3): FIXTURES, SECTION_FILES, tmpDirs

### Community 128 - "readiness.ts"
Cohesion: 0.50
Nodes (3): evaluateReleaseReadiness(), ReleaseReadiness, ReleaseReadinessInput

### Community 129 - "dependencies"
Cohesion: 0.67
Nodes (3): dependencies, zod, zod

### Community 131 - "repository"
Cohesion: 0.67
Nodes (3): repository, type, url

### Community 133 - "cli/index.ts"
Cohesion: 0.35
Nodes (10): commandHelp(), parseArgs(), cmdCheck(), cmdCompile(), parseEnginesFloor(), cmdLint(), readBudgetEnv(), readEnginesFloor() (+2 more)

## Knowledge Gaps
- **307 isolated node(s):** `LOCK_PATH`, `JSON_ONLY`, `SCHEMA_TEXT`, `SCHEMA_BLOCK`, `PITFALLS` (+302 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SpecBundle` connect `SpecBundle` to `budget.ts`, `check/runner.ts`, `consent.ts`, `compileSpecDir`, `schemas/index.ts`, `lifecycle.ts`, `acquireSpecRootLock`, `engine.ts`, `lintBundle`, `TaskContract`, `plan.test.ts`, `score.ts`, `report.ts`, `l14.ts`, `lint/trace.test.ts`, `scale-benchmark.test.ts`, `eval/runner.ts`, `l08.test.ts`, `hash.ts`, `freeze.test.ts`, `constraint-trace.test.ts`, `generate.test.ts`, `eval/runner.test.ts`, `all-bad-fixtures.test.ts`, `commands/trace.test.ts`, `generate.ts`, `validation.ts`, `compile.test.ts`?**
  _High betweenness centrality (0.151) - this node is a cross-community bridge._
- **Why does `lintBundle()` connect `lintBundle` to `compileSpecDir`, `generate.ts`, `cli/index.ts`, `engine.ts`, `TaskContract`, `plan.test.ts`, `score.ts`, `change.test.ts`, `report.ts`, `live-experiment.ts`, `all-bad-fixtures.test.ts`, `scale-benchmark.test.ts`, `eval/runner.ts`, `l08.test.ts`, `SpecBundle`, `validation.ts`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `SpecBundleSchema` connect `schemas/index.ts` to `check/runner.ts`, `compileSpecDir`, `engine.ts`, `doctor.ts`, `TaskContract`, `report.ts`, `generate.test.ts`, `l14.ts`, `all-bad-fixtures.test.ts`, `lint/trace.test.ts`, `eval/runner.ts`, `scale-benchmark.test.ts`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `runPipeline()` (e.g. with `.chargeAttempts()` and `.chargeTokens()`) actually correct?**
  _`runPipeline()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `LOCK_PATH`, `JSON_ONLY`, `SCHEMA_TEXT` to the rest of the system?**
  _307 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `check/runner.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.051715309779825906 - nodes in this community are weakly interconnected._
- **Should `consent.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11576354679802955 - nodes in this community are weakly interconnected._