# Graph Report - llm_council_orchestrator  (2026-08-27)

## Corpus Check
- 197 files · ~163,077 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1038 nodes · 2397 edges · 70 communities (61 shown, 9 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `cd6760eb`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- budget.ts
- paths.ts
- consent.ts
- compileSpecDir
- schemas/index.ts
- check.ts
- write-spec.ts
- check.test.ts
- engine.ts
- compiler/compile.ts
- doctor.ts
- run-eval.test.ts
- http.test.ts
- types.ts
- report.test.ts
- check/runner.test.ts
- score.test.ts
- revision.test.ts
- report.ts
- redact.ts
- init-concurrency.test.ts
- l14.ts
- execInProcessGroup
- l12.test.ts
- eval/runner.ts
- good-fixture-gate.test.ts
- l08.test.ts
- l01.test.ts
- l02.test.ts
- l03.test.ts
- check/runner.ts
- server.ts
- envelope.ts
- l04.test.ts
- l05.test.ts
- l07.test.ts
- devDependencies
- l10.test.ts
- score.ts
- spec-core/package.json
- lint/trace.test.ts
- package.json
- generate.test.ts
- compilerOptions
- cli.test.ts
- eval/runner.test.ts
- scripts
- stdio.ts
- revision.ts
- init.ts
- intent-fidelity.test.ts
- SpecBundle
- commands/trace.test.ts
- make-bins-executable.js
- packed-install-smoke.sh
- prepublish-check.js
- generate.ts
- files
- corpus-lock.ts
- prepublish-check.boundary.test.ts
- constraint-trace.test.ts
- server.test.ts
- plan.test.ts
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
4. `runPipeline()` - 28 edges
5. `runCli()` - 23 edges
6. `SpecBundleSchema` - 21 edges
7. `TaskContract` - 19 edges
8. `freeze()` - 18 edges
9. `LintFinding` - 17 edges
10. `acquireSpecRootLock()` - 17 edges

## Surprising Connections (you probably didn't know these)
- `CompileResult` --references--> `SpecBundle`  [EXTRACTED]
  packages/spec-core/src/compiler/compile.ts → packages/spec-core/src/schemas/index.ts
- `compiledBundle()` --calls--> `compileSpecDir()`  [EXTRACTED]
  packages/spec-core/src/cli/commands/plan.test.ts → packages/spec-core/src/compiler/compile.ts
- `compiledBundle()` --calls--> `compileSpecDir()`  [EXTRACTED]
  packages/spec-core/src/cli/commands/trace.test.ts → packages/spec-core/src/compiler/compile.ts
- `GenerateOptions` --references--> `LlmAdapter`  [EXTRACTED]
  packages/spec-core/src/cli/commands/generate.ts → packages/spec-core/src/eval/llm/adapter.ts
- `CallContext` --references--> `LlmAdapter`  [EXTRACTED]
  packages/spec-core/src/mcp/server.ts → packages/spec-core/src/eval/llm/adapter.ts

## Import Cycles
- None detected.

## Communities (70 total, 9 thin omitted)

### Community 0 - "budget.ts"
Cohesion: 0.14
Nodes (12): BudgetCap, BudgetExceededError, BudgetSpentSnapshot, DEFAULT_WALL_SLACK_MS, MAX_COMPLETIONS, ResolvedRunBudget, LlmUsage, BACKOFF_MS (+4 more)

### Community 1 - "paths.ts"
Cohesion: 0.22
Nodes (13): assertNoSymlinkBelow(), assertWritableSpecDir(), checkMcpDir(), effectiveMcpRoot, isInside(), McpDirCheck, McpRootSource, PathEscapeError (+5 more)

### Community 2 - "consent.ts"
Cohesion: 0.12
Nodes (26): authorizeExecution(), checkPreviewDigest(), consentDigestLine(), EXEC_OPT_IN_ENV, ExecAuthorization, execOptInFromEnv(), execRootFromEnv(), GENERATE_OPT_IN_ENV (+18 more)

### Community 3 - "compileSpecDir"
Cohesion: 0.15
Nodes (15): applyUnderLock(), ChangeResult, cmdChange(), findingLine(), FIXTURES, frozenSpecRoot(), inlineBundle(), makeSpecRoot() (+7 more)

### Community 4 - "schemas/index.ts"
Cohesion: 0.05
Nodes (50): GOOD, AssumptionIdSchema, ComplexityProfileSchema, ContractIdSchema, DecisionIdSchema, EvidenceIdSchema, IdSchema, ImpactLevelSchema (+42 more)

### Community 5 - "check.ts"
Cohesion: 0.38
Nodes (6): CheckOutcome, Executor, CheckOptions, CheckResult, expectedActual(), renderReport()

### Community 6 - "write-spec.ts"
Cohesion: 0.28
Nodes (6): SECTION_KEYS, PET_CLINIC, SECTION_FILES, tmpDirs, writeSpecDir(), assertNotSymlink()

### Community 7 - "check.test.ts"
Cohesion: 0.21
Nodes (8): evidenceOf(), evidencePath(), FIXTURES, freshRoot(), initRoot(), makeSpecRoot(), SECTION_FILES, tmpDirs

### Community 8 - "engine.ts"
Cohesion: 0.16
Nodes (13): rule, rule, rule, rule, rule, rule, FIXTURES, rule (+5 more)

### Community 9 - "compiler/compile.ts"
Cohesion: 0.21
Nodes (8): CompileResult, LintResult, VerifyResult, CompileError, CompileResult, deriveTestFiles(), REQUIRED_SECTIONS, SectionName

### Community 10 - "doctor.ts"
Cohesion: 0.11
Nodes (28): BIN_FILES, BUDGET_ENV, checkBins(), checkBudgetEnv(), checkLock(), checkMcpFlags(), checkNodeVersion(), checkProviderEnv() (+20 more)

### Community 11 - "run-eval.test.ts"
Cohesion: 0.26
Nodes (8): DEFAULT_REPORT_PATH, LIVE_ENV_VARS, missingLiveEnv(), parseArgs(), ParsedArgs, runEvalCli(), FAKE_LIVE_ENV, mockRunEvalAll

### Community 12 - "http.test.ts"
Cohesion: 0.29
Nodes (5): FAKE_ENV, FakeEnv, jsonResponse(), okFetch(), PartialFakeEnv

### Community 13 - "types.ts"
Cohesion: 0.27
Nodes (5): BAD, BadFixtureExpectation, RULES, LINT_RULES, LintRuleId

### Community 14 - "report.test.ts"
Cohesion: 0.36
Nodes (7): captureBadFixtures(), finishEvidence(), runMockEval(), fixtures15(), liveInput(), passInput(), passRuns()

### Community 15 - "check/runner.test.ts"
Cohesion: 0.13
Nodes (7): DEFAULT_TIMEOUT_MS, killActiveProcessGroups(), FakeCall, FIXTURES, PET_CLINIC, tmpDirs, Verification

### Community 16 - "score.test.ts"
Cohesion: 0.22
Nodes (4): PipelineOutcome, PET_CLINIC, U, EvalTaskId

### Community 17 - "revision.test.ts"
Cohesion: 0.18
Nodes (5): DEFAULT_STALE_MS, LOCK_FILE, LockHeldError, fsyncCtl, tmpDirs

### Community 18 - "report.ts"
Cohesion: 0.14
Nodes (25): BadFixtureCapture, calcs(), G1_REQUIRED_TOTAL, GateCalcs, GateReportInput, gateVerdict, groundedBundleFor(), renderGateReport() (+17 more)

### Community 19 - "redact.ts"
Cohesion: 0.47
Nodes (4): REDACTION_RULES, RedactionRule, redactSecrets(), SecretKind

### Community 20 - "init-concurrency.test.ts"
Cohesion: 0.33
Nodes (4): ChildOutcome, CLI_JS, SECTION_FILES, tmpDirs

### Community 21 - "l14.ts"
Cohesion: 0.43
Nodes (4): EXPECT_GRAMMAR_DOC, EXPECTED_EXIT_PATTERN, isJudgeableExpect(), rule

### Community 23 - "l12.test.ts"
Cohesion: 0.21
Nodes (8): firstOverlap(), globSegments(), globsOverlap(), rule, segmentsOverlap(), FIXTURES, refMatch(), refPathMatch()

### Community 24 - "eval/runner.ts"
Cohesion: 0.15
Nodes (14): BudgetLedger, LlmAdapter, buildValidationRetryPrompt(), ClassifierOutputSchema, firstIssues(), lintReason(), parseJsonOrBlock(), PipelineTask (+6 more)

### Community 25 - "good-fixture-gate.test.ts"
Cohesion: 0.29
Nodes (4): GOOD, GOOD_BUNDLES, SECTION_FILES, tmpDirs

### Community 26 - "l08.test.ts"
Cohesion: 0.67
Nodes (3): FIXTURES, inState(), loadBundle()

### Community 31 - "check/runner.ts"
Cohesion: 0.16
Nodes (15): parseExpect(), activeProcessGroups, EVIDENCE_FILE_MODE, evidenceRunName(), ExecutorResult, FORCE_SETTLE_GRACE_MS, GROUP_KILL_GRACE_MS, MAX_BUFFER_BYTES (+7 more)

### Community 32 - "server.ts"
Cohesion: 0.11
Nodes (26): DEFAULT_GENERATE_PROFILE, ExecBoundary, generateOptInFromEnv(), GenerateProfile, GenerateVariant, ARG_SPECS, ArgName, ArgValidator (+18 more)

### Community 33 - "envelope.ts"
Cohesion: 0.16
Nodes (22): worstCaseAttempts(), worstCaseWallMs(), computeCostEnvelope(), CostEnvelope, measurePromptSizes(), PromptSize, renderCostEnvelopeTable(), VariantEnvelope (+14 more)

### Community 38 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, @types/node, typescript, vitest, @vitest/coverage-v8, zod-to-json-schema, @types/node, typescript (+3 more)

### Community 44 - "score.ts"
Cohesion: 0.19
Nodes (20): allUnGrounded(), anchorSentences(), checkConstraintTrace(), commitmentSurfaces(), ConstraintFailure, ConstraintFailureCode, containsTerm(), evaluateCandidate() (+12 more)

### Community 46 - "spec-core/package.json"
Cohesion: 0.22
Nodes (8): description, engines, node, license, main, name, type, version

### Community 49 - "lint/trace.test.ts"
Cohesion: 0.22
Nodes (7): DecSpec, GOOD, mkBundle(), mkTask(), ReqSpec, TaskSpec, testWith()

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
Cohesion: 0.11
Nodes (16): EPIPE_DRAIN_TIMEOUT_MS, EXIT_CLIENT_GONE, EXIT_DRAIN_TIMEOUT, EXIT_OK, jsonRpcError(), MAX_FRAME_BYTES, MAX_IN_FLIGHT, McpStdioServer (+8 more)

### Community 78 - "revision.ts"
Cohesion: 0.21
Nodes (15): acquireSpecRootLock(), backupPathFor(), breakStaleLock(), createDirAtomically(), fsyncDir(), LockIdentity, LockOptions, nextSuffix() (+7 more)

### Community 82 - "init.ts"
Cohesion: 0.18
Nodes (12): buildSections(), cmdInit(), Contract, Decision, EvidenceItem, GlossaryEntry, InitOptions, InitResult (+4 more)

### Community 84 - "intent-fidelity.test.ts"
Cohesion: 0.18
Nodes (10): FIXTURES, genericBundleFor(), loadFixture(), U, LlmCompleteOptions, LlmResponse, createMockLlm(), MockScript (+2 more)

### Community 86 - "SpecBundle"
Cohesion: 0.06
Nodes (49): applyChangeSet(), ApplyResult, ChangeSet, ChangeSetSchema, formatIssues(), cleanLint, FIXTURES, freeze() (+41 more)

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
Cohesion: 0.12
Nodes (23): Command, COMMANDS, GenerateVariant, InitProfile, ParseResult, SingleDirCommand, checkIntent(), cmdGenerate() (+15 more)

### Community 106 - "files"
Cohesion: 0.33
Nodes (6): files, dist, examples, generated, LICENSE, README.md

### Community 108 - "corpus-lock.ts"
Cohesion: 0.23
Nodes (14): canonicalJson(), computeCorpusHash(), CORPUS_LOCK_VERSION, CorpusLock, CorpusLockEntry, frozenThresholds, loadCorpusLock(), lockCandidates() (+6 more)

### Community 111 - "constraint-trace.test.ts"
Cohesion: 0.12
Nodes (15): failureCodes(), FIXTURES, genericBundleFor(), groundedEt01(), loadFixture(), specOutcome(), task(), U (+7 more)

### Community 116 - "server.test.ts"
Cohesion: 0.13
Nodes (17): EXEC_ROOT_ENV, callTool(), expectIdentical(), FIXTURES, freshOutside(), freshRoot(), frozenRoot(), injectionRoot() (+9 more)

### Community 124 - "plan.test.ts"
Cohesion: 0.05
Nodes (30): cmdPlan(), PlanOptions, PlanResult, PlanTask, renderHuman(), renderJson(), compiledBundle(), FIXTURES (+22 more)

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
Cohesion: 0.24
Nodes (15): commandHelp(), parseArgs(), cmdCheck(), cmdCompile(), compileFailedOutput(), parseEnginesFloor(), cmdFreeze(), FreezeResult (+7 more)

## Knowledge Gaps
- **299 isolated node(s):** `name`, `version`, `private`, `packageManager`, `_archival` (+294 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SpecBundle` connect `SpecBundle` to `budget.ts`, `consent.ts`, `compileSpecDir`, `schemas/index.ts`, `check.ts`, `write-spec.ts`, `engine.ts`, `compiler/compile.ts`, `types.ts`, `check/runner.test.ts`, `score.test.ts`, `report.ts`, `l14.ts`, `l12.test.ts`, `eval/runner.ts`, `good-fixture-gate.test.ts`, `l08.test.ts`, `l01.test.ts`, `l02.test.ts`, `l03.test.ts`, `check/runner.ts`, `l04.test.ts`, `l05.test.ts`, `l07.test.ts`, `l10.test.ts`, `score.ts`, `lint/trace.test.ts`, `generate.test.ts`, `eval/runner.test.ts`, `intent-fidelity.test.ts`, `commands/trace.test.ts`, `generate.ts`, `constraint-trace.test.ts`, `plan.test.ts`, `compile.test.ts`?**
  _High betweenness centrality (0.124) - this node is a cross-community bridge._
- **Why does `lintBundle()` connect `compileSpecDir` to `schemas/index.ts`, `cli/index.ts`, `engine.ts`, `compiler/compile.ts`, `types.ts`, `report.test.ts`, `report.ts`, `l12.test.ts`, `eval/runner.ts`, `good-fixture-gate.test.ts`, `l08.test.ts`, `l01.test.ts`, `l02.test.ts`, `l03.test.ts`, `l04.test.ts`, `l05.test.ts`, `l07.test.ts`, `l10.test.ts`, `score.ts`, `SpecBundle`, `generate.ts`, `plan.test.ts`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `SpecBundleSchema` connect `schemas/index.ts` to `compiler/compile.ts`, `doctor.ts`, `types.ts`, `check/runner.test.ts`, `lint/trace.test.ts`, `report.ts`, `generate.test.ts`, `l14.ts`, `SpecBundle`, `eval/runner.ts`, `plan.test.ts`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `runPipeline()` (e.g. with `.chargeAttempts()` and `.chargeTokens()`) actually correct?**
  _`runPipeline()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _299 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `budget.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._
- **Should `consent.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11822660098522167 - nodes in this community are weakly interconnected._