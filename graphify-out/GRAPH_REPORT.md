# Graph Report - llm_council_orchestrator  (2026-08-27)

## Corpus Check
- 199 files · ~168,509 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1064 nodes · 2460 edges · 59 communities (58 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b537674e`
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
- sign-test.ts
- scale-benchmark.test.ts
- plan.test.ts
- score.ts
- change.test.ts
- report.ts
- init-concurrency.test.ts
- l14.ts
- TaskContract
- eval/runner.ts
- l08.test.ts
- SpecBundle
- server.ts
- prompts.ts
- devDependencies
- constraints.ts
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
- adapter.ts
- compiler/freeze.ts
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
- plan.ts
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
- `FreezeResult` --references--> `SpecBundle`  [EXTRACTED]
  packages/spec-core/src/compiler/freeze.ts → packages/spec-core/src/schemas/index.ts
- `CompileResult` --references--> `SpecBundle`  [EXTRACTED]
  packages/spec-core/src/compiler/compile.ts → packages/spec-core/src/schemas/index.ts
- `compiledBundle()` --calls--> `compileSpecDir()`  [EXTRACTED]
  packages/spec-core/src/cli/commands/plan.test.ts → packages/spec-core/src/compiler/compile.ts
- `compiledBundle()` --calls--> `compileSpecDir()`  [EXTRACTED]
  packages/spec-core/src/cli/commands/trace.test.ts → packages/spec-core/src/compiler/compile.ts
- `checkLock()` --calls--> `acquireSpecRootLock()`  [EXTRACTED]
  packages/spec-core/src/cli/commands/doctor.ts → packages/spec-core/src/storage/revision.ts

## Import Cycles
- None detected.

## Communities (59 total, 1 thin omitted)

### Community 0 - "budget.ts"
Cohesion: 0.14
Nodes (18): BudgetCap, BudgetSpentSnapshot, DEFAULT_WALL_SLACK_MS, MAX_COMPLETIONS, ResolvedRunBudget, resolveRunBudget(), worstCaseAttempts(), worstCaseWallMs() (+10 more)

### Community 1 - "check/runner.ts"
Cohesion: 0.05
Nodes (46): parseExpect(), REDACTION_RULES, RedactionRule, redactSecrets(), SecretKind, activeProcessGroups, CheckOutcome, DEFAULT_TIMEOUT_MS (+38 more)

### Community 2 - "consent.ts"
Cohesion: 0.11
Nodes (27): authorizeExecution(), checkPreviewDigest(), consentDigestLine(), EXEC_OPT_IN_ENV, ExecAuthorization, execOptInFromEnv(), execRootFromEnv(), GENERATE_OPT_IN_ENV (+19 more)

### Community 3 - "compileSpecDir"
Cohesion: 0.18
Nodes (13): applyUnderLock(), ChangeResult, cmdChange(), findingLine(), compileLintFreeze(), SECTION_PATHS, tmpDirs, applyChangeSet() (+5 more)

### Community 4 - "schemas/index.ts"
Cohesion: 0.06
Nodes (49): GOOD, AssumptionIdSchema, ComplexityProfileSchema, ContractIdSchema, DecisionIdSchema, EvidenceIdSchema, IdSchema, ImpactLevelSchema (+41 more)

### Community 5 - "lifecycle.ts"
Cohesion: 0.14
Nodes (20): checkTransition(), FREEZE_REFUSAL_HINTS, LIFECYCLE_STATES, LIFECYCLE_TRANSITIONS, LifecycleFinding, LifecycleFindingCode, LifecycleOperation, LifecycleState (+12 more)

### Community 6 - "acquireSpecRootLock"
Cohesion: 0.22
Nodes (10): SECTION_KEYS, PET_CLINIC, SECTION_FILES, tmpDirs, writeSpecDir(), assertNotSymlink(), acquireSpecRootLock(), breakStaleLock() (+2 more)

### Community 7 - "check.test.ts"
Cohesion: 0.21
Nodes (8): evidenceOf(), evidencePath(), FIXTURES, freshRoot(), initRoot(), makeSpecRoot(), SECTION_FILES, tmpDirs

### Community 8 - "engine.ts"
Cohesion: 0.15
Nodes (17): BAD, BadFixtureExpectation, RULES, rule, rule, rule, rule, rule (+9 more)

### Community 9 - "lintBundle"
Cohesion: 0.16
Nodes (14): compileFailedOutput(), CompileResult, cmdFreeze(), FreezeResult, cmdLint(), LintResult, cmdVerify(), VerifyResult (+6 more)

### Community 10 - "doctor.ts"
Cohesion: 0.11
Nodes (28): BIN_FILES, BUDGET_ENV, checkBins(), checkBudgetEnv(), checkLock(), checkMcpFlags(), checkNodeVersion(), checkProviderEnv() (+20 more)

### Community 11 - "run-eval.test.ts"
Cohesion: 0.26
Nodes (9): runEvalAll(), DEFAULT_REPORT_PATH, LIVE_ENV_VARS, missingLiveEnv(), parseArgs(), ParsedArgs, runEvalCli(), FAKE_LIVE_ENV (+1 more)

### Community 12 - "http.test.ts"
Cohesion: 0.17
Nodes (8): BudgetExceededError, createHttpLlm(), FAKE_ENV, FakeEnv, jsonResponse(), okFetch(), PartialFakeEnv, runLiveEval()

### Community 13 - "sign-test.ts"
Cohesion: 0.19
Nodes (15): renderGateReport(), binomialCdf(), binomialPmf(), binomialTail(), bisect(), choose(), clopperPearson95(), formatP() (+7 more)

### Community 14 - "scale-benchmark.test.ts"
Cohesion: 0.17
Nodes (8): ClosureFinding, ClosureFindingCode, closureFindings(), DuplicateTaskId, duplicateTaskIds(), CEILINGS_MS, mkTask(), syntheticBundle()

### Community 15 - "plan.test.ts"
Cohesion: 0.17
Nodes (4): compiledBundle(), FIXTURES, SECTION_FILES, tmpDirs

### Community 16 - "score.ts"
Cohesion: 0.08
Nodes (22): allUnGrounded(), FIXTURES, genericBundleFor(), loadFixture(), U, PipelineOutcome, advisoryInventions(), assertionPasses() (+14 more)

### Community 17 - "change.test.ts"
Cohesion: 0.22
Nodes (6): FIXTURES, frozenSpecRoot(), inlineBundle(), makeSpecRoot(), SECTION_FILES, tmpDirs

### Community 18 - "report.ts"
Cohesion: 0.11
Nodes (30): ConstraintFailure, BadFixtureCapture, calcs(), GateCalcs, GateReportInput, gateVerdict, groundedBundleFor(), BAD (+22 more)

### Community 20 - "init-concurrency.test.ts"
Cohesion: 0.33
Nodes (4): ChildOutcome, CLI_JS, SECTION_FILES, tmpDirs

### Community 21 - "l14.ts"
Cohesion: 0.43
Nodes (4): EXPECT_GRAMMAR_DOC, EXPECTED_EXIT_PATTERN, isJudgeableExpect(), rule

### Community 23 - "TaskContract"
Cohesion: 0.16
Nodes (10): PlanTask, firstOverlap(), globSegments(), globsOverlap(), rule, segmentsOverlap(), FIXTURES, refMatch() (+2 more)

### Community 24 - "eval/runner.ts"
Cohesion: 0.15
Nodes (13): BudgetLedger, LlmUsage, ClassifierOutputSchema, firstIssues(), lintReason(), parseJsonOrBlock(), PipelineTask, PipelineUsage (+5 more)

### Community 26 - "l08.test.ts"
Cohesion: 0.67
Nodes (3): FIXTURES, inState(), loadBundle()

### Community 27 - "SpecBundle"
Cohesion: 0.06
Nodes (15): ApplyResult, ChangeSet, ChangeSetSchema, formatIssues(), cleanLint, FIXTURES, FIXTURES, FIXTURES (+7 more)

### Community 32 - "server.ts"
Cohesion: 0.11
Nodes (25): DEFAULT_GENERATE_PROFILE, ExecBoundary, generateOptInFromEnv(), GenerateProfile, GenerateVariant, ARG_SPECS, ArgName, ArgValidator (+17 more)

### Community 33 - "prompts.ts"
Cohesion: 0.24
Nodes (15): measurePromptSizes(), CLASSIFY_RULES, classifyAndProposeSingle(), classifySingle(), CONSTRAINT_FIDELITY, intentBlock(), JSON_ONLY, judgeMerge() (+7 more)

### Community 38 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, @types/node, typescript, vitest, @vitest/coverage-v8, zod-to-json-schema, @types/node, typescript (+3 more)

### Community 44 - "constraints.ts"
Cohesion: 0.25
Nodes (17): anchorSentences(), checkConstraintTrace(), commitmentSurfaces(), ConstraintFailureCode, containsTerm(), containsWholeTerm(), evaluateCandidate(), expandNumberToken() (+9 more)

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

### Community 84 - "adapter.ts"
Cohesion: 0.44
Nodes (6): LlmAdapter, LlmCompleteOptions, LlmResponse, createMockLlm(), MockScript, SCRIPT

### Community 86 - "compiler/freeze.ts"
Cohesion: 0.10
Nodes (21): freeze(), FreezeResult, cleanLint, FIXTURES, frozenPetClinic(), inState(), loadBundle(), artifactHashes() (+13 more)

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
Cohesion: 0.14
Nodes (21): Command, COMMANDS, GenerateVariant, InitProfile, ParseResult, SingleDirCommand, checkIntent(), cmdGenerate() (+13 more)

### Community 106 - "files"
Cohesion: 0.33
Nodes (6): files, dist, examples, generated, LICENSE, README.md

### Community 108 - "corpus-lock.ts"
Cohesion: 0.24
Nodes (16): canonicalJson(), computeCorpusHash(), CORPUS_LOCK_VERSION, CorpusLock, CorpusLockEntry, frozenThresholds, loadCorpusLock(), lockCandidates() (+8 more)

### Community 111 - "constraint-trace.test.ts"
Cohesion: 0.23
Nodes (10): et07Requirement(), failureCodes(), FIXTURES, genericBundleFor(), groundedEt01(), loadFixture(), specOutcome(), task() (+2 more)

### Community 116 - "server.test.ts"
Cohesion: 0.13
Nodes (17): EXEC_ROOT_ENV, callTool(), expectIdentical(), FIXTURES, freshOutside(), freshRoot(), frozenRoot(), injectionRoot() (+9 more)

### Community 124 - "plan.ts"
Cohesion: 0.15
Nodes (15): cmdPlan(), PlanOptions, PlanResult, renderHuman(), renderJson(), TopoResult, topoSort(), LevelLoadResult (+7 more)

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
Nodes (10): commandHelp(), parseArgs(), cmdCheck(), cmdCompile(), parseEnginesFloor(), normalizeFileIntent(), readBudgetEnv(), readEnginesFloor() (+2 more)

## Knowledge Gaps
- **304 isolated node(s):** `tmpDirs`, `SECRET_LENGTH`, `BASE_OPTS`, `CHECK_NAMES`, `CheckStatus` (+299 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SpecBundle` connect `SpecBundle` to `budget.ts`, `check/runner.ts`, `consent.ts`, `compileSpecDir`, `schemas/index.ts`, `lifecycle.ts`, `acquireSpecRootLock`, `engine.ts`, `lintBundle`, `scale-benchmark.test.ts`, `plan.test.ts`, `score.ts`, `report.ts`, `l14.ts`, `TaskContract`, `eval/runner.ts`, `l08.test.ts`, `constraints.ts`, `generate.test.ts`, `eval/runner.test.ts`, `compiler/freeze.ts`, `commands/trace.test.ts`, `generate.ts`, `constraint-trace.test.ts`, `plan.ts`, `compile.test.ts`?**
  _High betweenness centrality (0.122) - this node is a cross-community bridge._
- **Why does `lintBundle()` connect `lintBundle` to `compileSpecDir`, `generate.ts`, `engine.ts`, `scale-benchmark.test.ts`, `score.ts`, `change.test.ts`, `report.ts`, `compiler/freeze.ts`, `TaskContract`, `eval/runner.ts`, `l08.test.ts`, `SpecBundle`, `plan.ts`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Why does `compileSpecDir()` connect `compileSpecDir` to `check/runner.ts`, `cli/index.ts`, `lintBundle`, `doctor.ts`, `scale-benchmark.test.ts`, `plan.test.ts`, `change.test.ts`, `generate.test.ts`, `init-concurrency.test.ts`, `commands/trace.test.ts`, `plan.ts`, `cli.test.ts`, `compile.test.ts`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `runPipeline()` (e.g. with `.chargeAttempts()` and `.chargeTokens()`) actually correct?**
  _`runPipeline()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `tmpDirs`, `SECRET_LENGTH`, `BASE_OPTS` to the rest of the system?**
  _304 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `budget.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13756613756613756 - nodes in this community are weakly interconnected._
- **Should `check/runner.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.051587301587301584 - nodes in this community are weakly interconnected._