# Graph Report - llm_council_orchestrator  (2026-08-27)

## Corpus Check
- 197 files · ~163,077 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1042 nodes · 2402 edges · 73 communities (63 shown, 10 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c01bdeac`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- budget.ts
- namespace-ids.test.ts
- consent.ts
- compileSpecDir
- INPUT_CEILINGS
- check.ts
- acquireSpecRootLock
- check.test.ts
- engine.ts
- compiler/compile.ts
- doctor.ts
- run-eval.test.ts
- http.test.ts
- types.ts
- report.test.ts
- common.ts
- score.test.ts
- evidence.ts
- report.ts
- decisions.ts
- version.ts
- l14.ts
- index.test.ts
- l12.test.ts
- BudgetLedger
- good-fixture-gate.test.ts
- l08.test.ts
- l01.test.ts
- l02.test.ts
- schemas/index.ts
- l03.test.ts
- check/runner.ts
- server.ts
- eval/runner.ts
- l04.test.ts
- l05.test.ts
- l06.test.ts
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
- change.test.ts
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
- `compiledBundle()` --calls--> `compileSpecDir()`  [EXTRACTED]
  packages/spec-core/src/cli/commands/plan.test.ts → packages/spec-core/src/compiler/compile.ts
- `compiledBundle()` --calls--> `compileSpecDir()`  [EXTRACTED]
  packages/spec-core/src/cli/commands/trace.test.ts → packages/spec-core/src/compiler/compile.ts
- `CompileResult` --references--> `SpecBundle`  [EXTRACTED]
  packages/spec-core/src/compiler/compile.ts → packages/spec-core/src/schemas/index.ts
- `scrubbedExecutor()` --calls--> `execInProcessGroup()`  [EXTRACTED]
  packages/spec-core/src/mcp/consent.ts → packages/spec-core/src/check/runner.ts
- `cmdCheck()` --calls--> `runChecks()`  [EXTRACTED]
  packages/spec-core/src/cli/commands/check.ts → packages/spec-core/src/check/runner.ts

## Import Cycles
- None detected.

## Communities (73 total, 10 thin omitted)

### Community 0 - "budget.ts"
Cohesion: 0.14
Nodes (18): BudgetCap, BudgetSpentSnapshot, DEFAULT_WALL_SLACK_MS, MAX_COMPLETIONS, ResolvedRunBudget, resolveRunBudget(), worstCaseAttempts(), worstCaseWallMs() (+10 more)

### Community 1 - "namespace-ids.test.ts"
Cohesion: 0.28
Nodes (8): DecisionIdSchema, RequirementIdSchema, TaskIdSchema, TestIdSchema, RequirementSchema, validRequirement, TaskContractSchema, validTask

### Community 2 - "consent.ts"
Cohesion: 0.14
Nodes (22): authorizeExecution(), checkPreviewDigest(), consentDigestLine(), EXEC_OPT_IN_ENV, EXEC_ROOT_ENV, ExecAuthorization, execOptInFromEnv(), execRootFromEnv() (+14 more)

### Community 3 - "compileSpecDir"
Cohesion: 0.24
Nodes (12): applyUnderLock(), ChangeResult, cmdChange(), findingLine(), cmdFreeze(), FreezeResult, compileLintFreeze(), SECTION_PATHS (+4 more)

### Community 4 - "INPUT_CEILINGS"
Cohesion: 0.18
Nodes (7): ContractIdSchema, ContractSchema, validContract, GlossaryEntrySchema, INPUT_CEILINGS, validManifest, validTask

### Community 5 - "check.ts"
Cohesion: 0.22
Nodes (12): Executor, CheckOptions, CheckResult, cmdCheck(), expectedActual(), renderReport(), loadBundleAtLevel(), loadCheckBundle() (+4 more)

### Community 6 - "acquireSpecRootLock"
Cohesion: 0.22
Nodes (10): SECTION_KEYS, PET_CLINIC, SECTION_FILES, tmpDirs, writeSpecDir(), assertNotSymlink(), acquireSpecRootLock(), breakStaleLock() (+2 more)

### Community 7 - "check.test.ts"
Cohesion: 0.21
Nodes (8): evidenceOf(), evidencePath(), FIXTURES, freshRoot(), initRoot(), makeSpecRoot(), SECTION_FILES, tmpDirs

### Community 8 - "engine.ts"
Cohesion: 0.21
Nodes (12): rule, rule, rule, rule, rule, rule, rule, rule (+4 more)

### Community 9 - "compiler/compile.ts"
Cohesion: 0.17
Nodes (9): ChildOutcome, CLI_JS, SECTION_FILES, tmpDirs, CompileError, CompileResult, deriveTestFiles(), REQUIRED_SECTIONS (+1 more)

### Community 10 - "doctor.ts"
Cohesion: 0.11
Nodes (28): BIN_FILES, BUDGET_ENV, checkBins(), checkBudgetEnv(), checkLock(), checkMcpFlags(), checkNodeVersion(), checkProviderEnv() (+20 more)

### Community 11 - "run-eval.test.ts"
Cohesion: 0.26
Nodes (8): DEFAULT_REPORT_PATH, LIVE_ENV_VARS, missingLiveEnv(), parseArgs(), ParsedArgs, runEvalCli(), FAKE_LIVE_ENV, mockRunEvalAll

### Community 12 - "http.test.ts"
Cohesion: 0.22
Nodes (6): BudgetExceededError, FAKE_ENV, FakeEnv, jsonResponse(), okFetch(), PartialFakeEnv

### Community 13 - "types.ts"
Cohesion: 0.27
Nodes (5): BAD, BadFixtureExpectation, RULES, LINT_RULES, LintRuleId

### Community 14 - "report.test.ts"
Cohesion: 0.36
Nodes (7): captureBadFixtures(), finishEvidence(), runMockEval(), fixtures15(), liveInput(), passInput(), passRuns()

### Community 15 - "common.ts"
Cohesion: 0.27
Nodes (7): ComplexityProfileSchema, IdSchema, ImpactLevelSchema, Sha256Schema, SpecStateSchema, ManifestSchema, validManifest

### Community 16 - "score.test.ts"
Cohesion: 0.22
Nodes (4): PipelineOutcome, PET_CLINIC, U, EvalTaskId

### Community 17 - "evidence.ts"
Cohesion: 0.28
Nodes (5): EvidenceIdSchema, EvidenceItemSchema, validEvidence, LegacyPackageSchema, validLegacy

### Community 18 - "report.ts"
Cohesion: 0.14
Nodes (25): BadFixtureCapture, calcs(), G1_REQUIRED_TOTAL, GateCalcs, GateReportInput, gateVerdict, groundedBundleFor(), renderGateReport() (+17 more)

### Community 19 - "decisions.ts"
Cohesion: 0.25
Nodes (5): DecisionSchema, validDecision, FIXTURES, validManifest, validTask

### Community 20 - "version.ts"
Cohesion: 0.36
Nodes (7): checkSpecSchemaVersion(), ParsedVersion, parseVersion(), SPEC_SCHEMA_VERSION, SpecSchemaVersionFieldSchema, SpecSchemaVersionVerdict, SUPPORTED

### Community 21 - "l14.ts"
Cohesion: 0.43
Nodes (4): EXPECT_GRAMMAR_DOC, EXPECTED_EXIT_PATTERN, isJudgeableExpect(), rule

### Community 22 - "index.test.ts"
Cohesion: 0.29
Nodes (5): validBundle, validManifest, TraceEdgeSchema, IntentSchema, validIntent

### Community 23 - "l12.test.ts"
Cohesion: 0.21
Nodes (8): firstOverlap(), globSegments(), globsOverlap(), rule, segmentsOverlap(), FIXTURES, refMatch(), refPathMatch()

### Community 25 - "good-fixture-gate.test.ts"
Cohesion: 0.29
Nodes (4): GOOD, GOOD_BUNDLES, SECTION_FILES, tmpDirs

### Community 26 - "l08.test.ts"
Cohesion: 0.67
Nodes (3): FIXTURES, inState(), loadBundle()

### Community 29 - "schemas/index.ts"
Cohesion: 0.22
Nodes (6): GOOD, AssumptionIdSchema, SpecBundleForExport, GENERATED_PATH, SpecBundleSchema, TraceEdge

### Community 31 - "check/runner.ts"
Cohesion: 0.05
Nodes (39): parseExpect(), REDACTION_RULES, RedactionRule, redactSecrets(), SecretKind, activeProcessGroups, CheckOutcome, DEFAULT_TIMEOUT_MS (+31 more)

### Community 32 - "server.ts"
Cohesion: 0.11
Nodes (25): DEFAULT_GENERATE_PROFILE, ExecBoundary, generateOptInFromEnv(), GenerateProfile, GenerateVariant, ARG_SPECS, ArgName, ArgValidator (+17 more)

### Community 33 - "eval/runner.ts"
Cohesion: 0.15
Nodes (26): measurePromptSizes(), CLASSIFY_RULES, classifyAndProposeSingle(), classifySingle(), CONSTRAINT_FIDELITY, intentBlock(), JSON_ONLY, judgeMerge() (+18 more)

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
Cohesion: 0.10
Nodes (19): killActiveProcessGroups(), isJsonRpcId(), EPIPE_DRAIN_TIMEOUT_MS, EXIT_CLIENT_GONE, EXIT_DRAIN_TIMEOUT, EXIT_OK, jsonRpcError(), MAX_FRAME_BYTES (+11 more)

### Community 78 - "revision.ts"
Cohesion: 0.12
Nodes (16): backupPathFor(), createDirAtomically(), DEFAULT_STALE_MS, fsyncDir(), LOCK_FILE, LockHeldError, LockIdentity, LockOptions (+8 more)

### Community 82 - "init.ts"
Cohesion: 0.16
Nodes (13): buildSections(), cmdInit(), Contract, Decision, EvidenceItem, GlossaryEntry, InitOptions, InitResult (+5 more)

### Community 84 - "intent-fidelity.test.ts"
Cohesion: 0.18
Nodes (10): FIXTURES, genericBundleFor(), loadFixture(), U, LlmCompleteOptions, LlmResponse, createMockLlm(), MockScript (+2 more)

### Community 86 - "SpecBundle"
Cohesion: 0.06
Nodes (49): applyChangeSet(), ApplyResult, ChangeSet, ChangeSetSchema, formatIssues(), cleanLint, FIXTURES, freeze() (+41 more)

### Community 88 - "commands/trace.test.ts"
Cohesion: 0.17
Nodes (8): cmdTrace(), renderTrace(), compiledBundle(), FIXTURES, SECTION_FILES, tmpDirs, TraceResult, buildTrace()

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
Nodes (25): Command, COMMANDS, GenerateVariant, InitProfile, ParseResult, SingleDirCommand, checkIntent(), cmdGenerate() (+17 more)

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
Nodes (17): generateConsentDigest(), callTool(), expectIdentical(), FIXTURES, freshOutside(), freshRoot(), frozenRoot(), injectionRoot() (+9 more)

### Community 124 - "plan.test.ts"
Cohesion: 0.05
Nodes (28): cmdPlan(), PlanOptions, PlanResult, PlanTask, renderHuman(), renderJson(), compiledBundle(), FIXTURES (+20 more)

### Community 125 - "change.test.ts"
Cohesion: 0.22
Nodes (6): FIXTURES, frozenSpecRoot(), inlineBundle(), makeSpecRoot(), SECTION_FILES, tmpDirs

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
Nodes (14): commandHelp(), parseArgs(), cmdCompile(), compileFailedOutput(), CompileResult, parseEnginesFloor(), cmdLint(), LintResult (+6 more)

## Knowledge Gaps
- **299 isolated node(s):** `name`, `version`, `private`, `packageManager`, `_archival` (+294 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SpecBundle` connect `SpecBundle` to `budget.ts`, `consent.ts`, `compileSpecDir`, `check.ts`, `acquireSpecRootLock`, `engine.ts`, `compiler/compile.ts`, `types.ts`, `score.test.ts`, `report.ts`, `l14.ts`, `l12.test.ts`, `good-fixture-gate.test.ts`, `l08.test.ts`, `l01.test.ts`, `l02.test.ts`, `schemas/index.ts`, `l03.test.ts`, `check/runner.ts`, `eval/runner.ts`, `l04.test.ts`, `l05.test.ts`, `l06.test.ts`, `l07.test.ts`, `l10.test.ts`, `score.ts`, `lint/trace.test.ts`, `generate.test.ts`, `eval/runner.test.ts`, `intent-fidelity.test.ts`, `commands/trace.test.ts`, `generate.ts`, `constraint-trace.test.ts`, `plan.test.ts`, `compile.test.ts`?**
  _High betweenness centrality (0.146) - this node is a cross-community bridge._
- **Why does `SpecBundleSchema` connect `schemas/index.ts` to `eval/runner.ts`, `INPUT_CEILINGS`, `compiler/compile.ts`, `doctor.ts`, `types.ts`, `lint/trace.test.ts`, `report.ts`, `decisions.ts`, `generate.test.ts`, `l14.ts`, `SpecBundle`, `index.test.ts`, `plan.test.ts`, `check/runner.ts`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `runPipeline()` (e.g. with `.chargeAttempts()` and `.chargeTokens()`) actually correct?**
  _`runPipeline()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _299 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `budget.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13756613756613756 - nodes in this community are weakly interconnected._
- **Should `consent.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13666666666666666 - nodes in this community are weakly interconnected._
- **Should `doctor.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10795454545454546 - nodes in this community are weakly interconnected._