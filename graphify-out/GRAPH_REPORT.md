# Graph Report - llm_council_orchestrator  (2026-08-27)

## Corpus Check
- 358 files · ~280,876 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2745 nodes · 5843 edges · 141 communities (117 shown, 24 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 104 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `41c4ea25`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Domain
- schemas/index.ts
- all-bad-fixtures.test.ts
- configLoader.ts
- models/types.ts
- PipelineEngine.ts
- lifecycle.ts
- PipelineExecutionState
- engine.ts
- ModelGateway
- doctor.ts
- Aggregator
- shared-types/src/index.ts
- validators.ts
- LRUCache
- version.ts
- ShutdownManager
- PipelineEngine
- eval/report.ts
- VectorIndex
- CircuitBreakerManager
- dependencies
- indexer/src/server.ts
- l12.test.ts
- EmbeddingEngine
- DomainClassifier
- DiscoveryMetricsCollector
- orchestrator/src/server.ts
- middleware/tracing.ts
- SpecBundleSchema
- ScheduledCleanupManager
- OpenAIAdapter.ts
- mcp/server.ts
- eval/runner.ts
- indexer/src/api/IndexController.ts
- IndexClient
- versionNegotiation.ts
- IndexerServer
- devDependencies
- OrchestratorAdapter.ts
- shared-utils/src/index.ts
- cache.ts
- init.ts
- ModelCallOptions
- intent-fidelity.test.ts
- PipelineState
- spec-core/package.json
- IndexController
- test-enterprise-features.ts
- lint/trace.test.ts
- test-utils.ts
- devDependencies
- generate.test.ts
- errorSanitizer.ts
- Chunker
- GeminiAdapter.ts
- StatsCollector
- MCPServer
- discovery/index.ts
- compilerOptions
- HealthController.ts
- init-concurrency.test.ts
- ModelGateway.ts
- dependencies
- dependencies
- IncrementalTracker
- ChatMessage
- AnthropicAdapter.ts
- eval/runner.test.ts
- RequestContextLogger
- mcp_bridge/package.json
- orchestrator/package.json
- LRUCache
- ConfigController.ts
- scripts
- stdio.ts
- @fastify/rate-limit
- shared-utils/package.json
- revision.ts
- DiscoveryConfigManager
- .discover
- audit-shared-drift.js
- check.test.ts
- run-all-examples.ts
- PipelineStatus
- devDependencies
- SpecBundle
- Logger
- cli/index.ts
- Scanner
- l14.ts
- CacheManager
- make-bins-executable.js
- orchestrator/tsconfig.json
- shared-config/package.json
- shared-observability/tsconfig.json
- compilerOptions
- packed-install-smoke.sh
- indexer/tsconfig.json
- check/runner.ts
- prepublish-check.js
- generate.ts
- LogLevel
- mcp_bridge/tsconfig.json
- ZAIOpenRouterAdapter
- shared-types/package.json
- files
- PipelineController.ts
- containsPathTraversal
- roleConfigMerger.ts
- prepublish-check.boundary.test.ts
- run-eval.test.ts
- config.ts
- MetricsRegistry
- verify-observability.sh
- test-api.sh
- mcp/server.test.ts
- Trace
- test-fallback.ts
- verify-hardening.sh
- plan.test.ts
- change.test.ts
- bin
- fastify
- readiness.ts
- dependencies
- http.test.ts
- repository
- compile.test.ts
- InvalidFilePathError
- AnthropicAdapter
- validators.test.ts
- PathTraversalError
- SqlInjectionError
- scripts
- @opentelemetry/api
- opossum

## God Nodes (most connected - your core abstractions)
1. `SpecBundle` - 62 edges
2. `PipelineEngine` - 60 edges
3. `ModelGateway` - 55 edges
4. `ModelCallOptions` - 45 edges
5. `compileSpecDir()` - 37 edges
6. `lintBundle()` - 36 edges
7. `PipelineContext` - 30 edges
8. `ChatMessage` - 29 edges
9. `IndexClient` - 28 edges
10. `LogLevel` - 27 edges

## Surprising Connections (you probably didn't know these)
- `IndexerConfig` --references--> `LogLevel`  [EXTRACTED]
  apps/indexer/src/main.ts → packages/shared-config/src/index.ts
- `ProviderStatus` --references--> `ProviderType`  [EXTRACTED]
  apps/orchestrator/src/models/ModelGateway.ts → packages/shared-types/src/models.ts
- `ProviderAvailabilityResult` --references--> `ApiError`  [EXTRACTED]
  apps/orchestrator/src/pipeline/roleConfigMerger.ts → packages/shared-types/src/errors.ts
- `example()` --calls--> `formatJson()`  [EXTRACTED]
  apps/indexer/example.ts → packages/shared-utils/src/index.ts
- `LogEntry` --inherits--> `LogEntry`  [EXTRACTED]
  apps/indexer/src/observability/Logger.ts → packages/shared-utils/src/logger/BaseLogger.ts

## Import Cycles
- 3-file cycle: `packages/shared-utils/src/index.ts -> packages/shared-utils/src/logger/index.ts -> packages/shared-utils/src/logger/ConsoleLogger.ts -> packages/shared-utils/src/index.ts`

## Communities (141 total, 24 thin omitted)

### Community 0 - "Domain"
Cohesion: 0.14
Nodes (20): DomainSpecWriter, pathExists(), SpecWriterConfig, SpecWriteResult, mockDeepDomain, mockDomainWithSpecialChars, mockDomainWithSubDomains, mockExcludedDomain (+12 more)

### Community 1 - "schemas/index.ts"
Cohesion: 0.08
Nodes (36): AssumptionIdSchema, ComplexityProfileSchema, ContractIdSchema, DecisionIdSchema, EvidenceIdSchema, IdSchema, ImpactLevelSchema, RequirementIdSchema (+28 more)

### Community 2 - "all-bad-fixtures.test.ts"
Cohesion: 0.13
Nodes (13): artifactHashes(), HASHED_SECTIONS, sha256Content(), FIXTURES, HASHED_KEYS, cleanLint, FIXTURES, verifyFrozen() (+5 more)

### Community 3 - "configLoader.ts"
Cohesion: 0.06
Nodes (42): OrchestratorCore, runOrchestratorPipeline(), ApiKeyValidationResult, applyEnvironmentOverrides(), ArchitectConfigSchema, ConfigLoaderOptions, ConfigValidationResult, DefaultsConfigSchema (+34 more)

### Community 4 - "models/types.ts"
Cohesion: 0.09
Nodes (16): AnthropicOpenRouterAdapter, AnthropicOpenRouterRequest, GeminiOpenRouterAdapter, GeminiOpenRouterRequest, OpenAIOpenRouterAdapter, OpenAIOpenRouterRequest, OpenRouterAdapter, OpenRouterErrorResponse (+8 more)

### Community 5 - "PipelineEngine.ts"
Cohesion: 0.10
Nodes (26): PipelineOptions, PipelineTrace, TraceSpan, ContextValidationError, DEEP_DOMAIN_ANALYSIS_ROLES, DEFAULT_ROLE_CONFIG, FULL_MODE_ANALYSIS_ROLES, QUICK_MODE_ANALYSIS_ROLES (+18 more)

### Community 6 - "lifecycle.ts"
Cohesion: 0.09
Nodes (33): applyChangeSet(), ApplyResult, ChangeSetSchema, formatIssues(), cleanLint, FIXTURES, freeze(), cleanLint (+25 more)

### Community 7 - "PipelineExecutionState"
Cohesion: 0.07
Nodes (22): getNextStepState(), getValidTransitions(), InvalidStateTransitionError, isActiveState(), isTerminalState(), isValidTransition(), PipelineExecutionStateMachine, StateChangeEvent (+14 more)

### Community 8 - "engine.ts"
Cohesion: 0.17
Nodes (15): RULES, rule, rule, rule, rule, rule, rule, rule (+7 more)

### Community 9 - "ModelGateway"
Cohesion: 0.09
Nodes (12): ModelGateway, ArchitectConfig, ProviderType, ANTHROPIC, ANTHROPIC_OPENROUTER, GEMINI, GEMINI_OPENROUTER, GLM (+4 more)

### Community 10 - "doctor.ts"
Cohesion: 0.10
Nodes (30): BIN_FILES, BUDGET_ENV, checkBins(), checkBudgetEnv(), checkLock(), checkMcpFlags(), checkNodeVersion(), checkProviderEnv() (+22 more)

### Community 11 - "Aggregator"
Cohesion: 0.22
Nodes (3): Aggregator, AggregationOutput, ModelContribution

### Community 12 - "shared-types/src/index.ts"
Cohesion: 0.14
Nodes (20): AGGREGATOR_SYSTEM_PROMPT, buildSynthesisUserPrompt(), createFallbackSections(), formatRoleContributions(), formatRoleTitle(), getExpectedSectionIds(), getExpectedSectionTitles(), validateSynthesisResponse() (+12 more)

### Community 13 - "validators.ts"
Cohesion: 0.07
Nodes (34): containsSqlInjection(), EnsureIndexedRequestSchema, EnsureIndexedResponseSchema, ErrorResponseSchema, escapeRegexChars(), extractInvalidRoleName(), IndexStatusQuerySchema, IndexStatusResponseSchema (+26 more)

### Community 15 - "version.ts"
Cohesion: 0.36
Nodes (7): checkSpecSchemaVersion(), ParsedVersion, parseVersion(), SPEC_SCHEMA_VERSION, SpecSchemaVersionFieldSchema, SpecSchemaVersionVerdict, SUPPORTED

### Community 17 - "PipelineEngine"
Cohesion: 0.15
Nodes (4): PipelineEngine, testDiscoveryMetrics(), PipelineContext, PipelineStepResult

### Community 18 - "eval/report.ts"
Cohesion: 0.12
Nodes (32): BadFixtureCapture, calcs(), G1_REQUIRED_TOTAL, GateCalcs, GateReportInput, gateVerdict, renderGateReport(), BAD (+24 more)

### Community 19 - "VectorIndex"
Cohesion: 0.10
Nodes (7): EmbeddingResult, IndexMetadata, StoredVector, VectorStorage, VectorStorageError, VectorIndex, VectorIndexConfig

### Community 20 - "CircuitBreakerManager"
Cohesion: 0.07
Nodes (14): CircuitBreakerConfig, CircuitBreakerManager, CircuitBreakerStats, defaultConfig, providerConfigs, ProviderName, DegradationLevel, DEGRADED (+6 more)

### Community 21 - "dependencies"
Cohesion: 0.05
Nodes (39): @opentelemetry/exporter-metrics-otlp-grpc, @opentelemetry/exporter-trace-otlp-grpc, @opentelemetry/resources, @opentelemetry/sdk-metrics, @opentelemetry/sdk-node, @opentelemetry/sdk-trace-base, @opentelemetry/semantic-conventions, dependencies (+31 more)

### Community 22 - "indexer/src/server.ts"
Cohesion: 0.08
Nodes (26): ApiError, ApiErrorResponse, containsPathTraversal(), containsSqlInjection(), ContextApiResponse, ContextRequest, ContextRequestSchema, DEFAULT_CONFIG (+18 more)

### Community 23 - "l12.test.ts"
Cohesion: 0.21
Nodes (8): firstOverlap(), globSegments(), globsOverlap(), rule, segmentsOverlap(), FIXTURES, refMatch(), refPathMatch()

### Community 24 - "EmbeddingEngine"
Cohesion: 0.11
Nodes (13): Chunk, DimensionMismatchError, EmbeddingEngine, EmbeddingEngineConfig, EmbeddingRequest, EmbeddingResponse, EXPECTED_EMBEDDING_DIMENSION, AVAILABLE_MODELS (+5 more)

### Community 25 - "DomainClassifier"
Cohesion: 0.13
Nodes (9): DomainClassifier, SignalExtractor, AnalysisDepth, DiscoveryExecutionMetadata, DiscoveryStatistics, Evidence, ExclusionMetadata, Signal (+1 more)

### Community 26 - "DiscoveryMetricsCollector"
Cohesion: 0.12
Nodes (10): DiscoveryMetricsCollector, getGlobalMetricsRegistry(), MetricsRegistry, resetGlobalMetricsRegistry(), DiscoveryMetrics, DiscoveryTimingMetrics, DomainQualityMetrics, ReliabilityMetrics (+2 more)

### Community 27 - "orchestrator/src/server.ts"
Cohesion: 0.10
Nodes (15): ProgressController, SpecController, defaultConfig, RateLimitConfig, setupRateLimiting(), defaultConfig, SecurityConfig, SecurityUtils (+7 more)

### Community 28 - "middleware/tracing.ts"
Cohesion: 0.18
Nodes (6): fastify, FastifyRequest, setupTracing(), tracer, initializeTracing(), TracingConfig

### Community 29 - "SpecBundleSchema"
Cohesion: 0.07
Nodes (18): PlanTask, ClosureFinding, ClosureFindingCode, closureFindings(), DuplicateTaskId, BAD, BadFixtureExpectation, GOOD (+10 more)

### Community 30 - "ScheduledCleanupManager"
Cohesion: 0.16
Nodes (7): getGlobalCacheManager(), ActiveRunsCleanupCallback, CLEANUP_DEFAULTS, CLEANUP_INTERVALS, CleanupStats, MemoryStats, ScheduledCleanupManager

### Community 31 - "OpenAIAdapter.ts"
Cohesion: 0.21
Nodes (5): OpenAIAdapter, OpenAIErrorResponse, OpenAIMessage, OpenAIRequest, OpenAIResponse

### Community 32 - "mcp/server.ts"
Cohesion: 0.06
Nodes (57): DEFAULT_GENERATE_PROFILE, ChangeSet, loadBundleAtLevel(), authorizeExecution(), checkPreviewDigest(), consentDigestLine(), EXEC_OPT_IN_ENV, EXEC_ROOT_ENV (+49 more)

### Community 33 - "eval/runner.ts"
Cohesion: 0.12
Nodes (25): BudgetLedger, LlmUsage, CLASSIFY_RULES, classifyAndProposeSingle(), classifySingle(), CONSTRAINT_FIDELITY, intentBlock(), JSON_ONLY (+17 more)

### Community 34 - "indexer/src/api/IndexController.ts"
Cohesion: 0.11
Nodes (18): FRAMEWORK_PATTERNS, MetadataAnalyzer, ProjectMetadata, ContextRequest, ContextResponse, EnsureIndexedRequest, EnsureIndexedResponse, SearchRequest (+10 more)

### Community 35 - "IndexClient"
Cohesion: 0.05
Nodes (39): IndexController, EnsureIndexedRequest, IndexStatusQuery, ContextBuilder, ContextBuilderOptions, createContextBuilder(), FormattedContext, RoleType (+31 more)

### Community 36 - "versionNegotiation.ts"
Cohesion: 0.10
Nodes (26): openApiSpec, openApiSpec, RFC-8594, ApiVersion, clearDeprecatedEndpoints(), createUnsupportedVersionResponse(), DEPRECATED_ENDPOINTS, DeprecatedEndpointConfig (+18 more)

### Community 37 - "IndexerServer"
Cohesion: 0.14
Nodes (4): generateCorrelationId(), IndexerServer, main(), getEndpointTimeout()

### Community 38 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, @types/node, typescript, vitest, @vitest/coverage-v8, zod-to-json-schema, @types/node, typescript (+3 more)

### Community 39 - "OrchestratorAdapter.ts"
Cohesion: 0.16
Nodes (8): OrchestratorAdapter, DomainExclusion, IndexStateResponse, OrchestratorRunRequest, OrchestratorRunResponse, PipelineProgressResponse, SpecFilesResponse, safeJsonParse()

### Community 40 - "shared-utils/src/index.ts"
Cohesion: 0.15
Nodes (15): Logger, main(), ToolRegistry, TOOL_DEFINITIONS, MCPError, MCPResponse, MCPToolDefinition, MCPToolResult (+7 more)

### Community 41 - "cache.ts"
Cohesion: 0.12
Nodes (4): CacheEntry, DependencyMappingCache, PatternMatchCache, CacheStatistics

### Community 42 - "init.ts"
Cohesion: 0.14
Nodes (14): buildSections(), cmdInit(), Contract, Decision, EvidenceItem, GlossaryEntry, InitOptions, InitResult (+6 more)

### Community 43 - "ModelCallOptions"
Cohesion: 0.15
Nodes (8): CHINESE_ERROR_TRANSLATIONS, translateErrorMessage(), ZAIAdapter, ZAIErrorResponse, ZAIMessage, ZAIRequest, ZAIResponse, ModelCallOptions

### Community 44 - "intent-fidelity.test.ts"
Cohesion: 0.12
Nodes (11): FIXTURES, U, PipelineOutcome, advisoryInventions(), assertionPasses(), normalizeForTermMatch(), RunUsage, scoreRun() (+3 more)

### Community 45 - "PipelineState"
Cohesion: 0.16
Nodes (14): StateMachine, StateContext, StateTransition, PipelineState, ABORTED, AGGREGATE, ANALYZE, COMPLETED (+6 more)

### Community 46 - "spec-core/package.json"
Cohesion: 0.22
Nodes (8): description, engines, node, license, main, name, type, version

### Community 47 - "IndexController"
Cohesion: 0.14
Nodes (5): example(), IndexController, Indexer, IndexerConfig, main()

### Community 48 - "test-enterprise-features.ts"
Cohesion: 0.30
Nodes (14): initializeGlobalCacheManager(), resetGlobalCacheManager(), initializeGlobalConfig(), resetGlobalConfig(), assert(), assertEquals(), runAllTests(), sleep() (+6 more)

### Community 49 - "lint/trace.test.ts"
Cohesion: 0.22
Nodes (7): DecSpec, GOOD, mkBundle(), mkTask(), ReqSpec, TaskSpec, testWith()

### Community 50 - "test-utils.ts"
Cohesion: 0.14
Nodes (16): apiKeyArb, chatMessageArb, chatMessagesArb, DEFAULT_NUM_RUNS, domainIdArb, fcConfig, httpStatusArb, modelCallOptionsArb (+8 more)

### Community 51 - "devDependencies"
Cohesion: 0.07
Nodes (27): _archival, devDependencies, axios, fast-check, tsx, @types/node, typescript, vite-tsconfig-paths (+19 more)

### Community 52 - "generate.test.ts"
Cohesion: 0.11
Nodes (11): complete(), FAKE_ENV, fetchSpy(), jsonResponse(), PET_CLINIC, SECTION_FILES, SESSION_SERVICE, tmpDirs (+3 more)

### Community 53 - "errorSanitizer.ts"
Cohesion: 0.19
Nodes (10): createFullErrorDetails(), FullErrorDetails, GENERIC_ERROR_MESSAGES, INTERNAL_ERROR_STATUS_CODES, isProduction(), SanitizedError, sanitizeError(), sanitizeErrorObject() (+2 more)

### Community 55 - "GeminiAdapter.ts"
Cohesion: 0.16
Nodes (7): GeminiAdapter, GeminiContent, GeminiErrorResponse, GeminiGenerationConfig, GeminiPart, GeminiRequest, GeminiResponse

### Community 57 - "MCPServer"
Cohesion: 0.28
Nodes (3): MCPServer, MCPNotification, MCPRequest

### Community 58 - "discovery/index.ts"
Cohesion: 0.24
Nodes (9): DOMAIN_MAPPINGS, IMPORTANT: Confidence does NOT affect analysisDepth, SIGNAL_WEIGHTS, DependencyInfo, DirectoryNode, DomainContext, IndexMetadata, createMockIndexMetadata() (+1 more)

### Community 59 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, declaration, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck (+6 more)

### Community 60 - "HealthController.ts"
Cohesion: 0.19
Nodes (8): HealthCheckResult, HealthController, NOTE: Qdrant is optional and not in the critical data path, setupMetrics(), trackLlmCall(), trackPipelineRun(), trackPipelineStep(), getOrchestratorMetrics()

### Community 61 - "init-concurrency.test.ts"
Cohesion: 0.33
Nodes (4): ChildOutcome, CLI_JS, SECTION_FILES, tmpDirs

### Community 62 - "ModelGateway.ts"
Cohesion: 0.17
Nodes (11): ExtendedError, NON_RETRYABLE_ERROR_PATTERNS, NON_RETRYABLE_HTTP_STATUS_CODES, ProviderStatus, REASONING_PROMPT, RETRYABLE_ERROR_PATTERNS, RETRYABLE_HTTP_STATUS_CODES, RetryableErrorResult (+3 more)

### Community 63 - "dependencies"
Cohesion: 0.04
Nodes (44): dependencies, axios, fastify, @fastify/cors, @fastify/helmet, @fastify/rate-limit, @llm/shared-config, @llm/shared-observability (+36 more)

### Community 64 - "dependencies"
Cohesion: 0.12
Nodes (17): dependencies, @fastify/cors, @fastify/helmet, @llm/shared-config, @llm/shared-observability, @llm/shared-types, @llm/shared-utils, uuid (+9 more)

### Community 66 - "ChatMessage"
Cohesion: 0.23
Nodes (4): ModelResponse, ProviderAdapter, ProviderConfig, ChatMessage

### Community 67 - "AnthropicAdapter.ts"
Cohesion: 0.15
Nodes (12): AnthropicContentBlockDeltaEvent, AnthropicContentBlockStartEvent, AnthropicErrorEvent, AnthropicErrorResponse, AnthropicMessage, AnthropicMessageDeltaEvent, AnthropicMessageStartEvent, AnthropicRequest (+4 more)

### Community 68 - "eval/runner.test.ts"
Cohesion: 0.15
Nodes (14): LlmAdapter, LlmCompleteOptions, LlmResponse, createMockLlm(), MockScript, SCRIPT, MockEvalScripts, complete() (+6 more)

### Community 69 - "RequestContextLogger"
Cohesion: 0.13
Nodes (11): fastify, FastifyRequest, setupLogging(), createLogger(), CreateLoggerOptions, defaultContext, getIndexerLogger(), getMcpBridgeLogger() (+3 more)

### Community 70 - "mcp_bridge/package.json"
Cohesion: 0.07
Nodes (27): dependencies, @llm/shared-config, @llm/shared-types, @llm/shared-utils, devDependencies, ts-node, @types/node, typescript (+19 more)

### Community 71 - "orchestrator/package.json"
Cohesion: 0.33
Nodes (5): main, name, private, type, version

### Community 73 - "ConfigController.ts"
Cohesion: 0.20
Nodes (7): ConfigController, ModelInfo, ModelsResponse, ProviderInfo, RoleInfo, RolesResponse, ModelConfig

### Community 74 - "scripts"
Cohesion: 0.22
Nodes (9): scripts, build, lint, prepublishOnly, pretest, smoke:packed, test, test:coverage (+1 more)

### Community 75 - "stdio.ts"
Cohesion: 0.11
Nodes (16): EPIPE_DRAIN_TIMEOUT_MS, EXIT_CLIENT_GONE, EXIT_DRAIN_TIMEOUT, EXIT_OK, jsonRpcError(), MAX_FRAME_BYTES, MAX_IN_FLIGHT, McpStdioServer (+8 more)

### Community 77 - "shared-utils/package.json"
Cohesion: 0.22
Nodes (8): dependencies, @llm/shared-config, @llm/shared-config, main, name, private, types, version

### Community 78 - "revision.ts"
Cohesion: 0.08
Nodes (29): applyUnderLock(), ChangeResult, cmdChange(), findingLine(), SECTION_KEYS, PET_CLINIC, SECTION_FILES, tmpDirs (+21 more)

### Community 80 - ".discover"
Cohesion: 0.17
Nodes (12): DomainDiscoveryEngine, examplePipelineFlow(), executeSpecifyStep(), testAllDomainsExcluded(), mockIndexMetadata, runTests(), testBasicDiscovery(), testDiscoveryWithExclusions() (+4 more)

### Community 81 - "audit-shared-drift.js"
Cohesion: 0.29
Nodes (10): APPS_DIR, AUDIT_DIR, ensureAuditDir(), formatCandidates(), groupBy(), main(), ROOT, scanFile() (+2 more)

### Community 82 - "check.test.ts"
Cohesion: 0.10
Nodes (22): parseExpect(), REDACTION_RULES, RedactionRule, redactSecrets(), SecretKind, CheckOutcome, Executor, runChecks() (+14 more)

### Community 83 - "run-all-examples.ts"
Cohesion: 0.46
Nodes (6): exampleHybridCmsDiscovery(), exampleNodejsMicroservicesDiscovery(), examplePhpMonolithDiscovery(), exampleUserExclusionWorkflow(), runAllExamples(), sleep()

### Community 84 - "PipelineStatus"
Cohesion: 0.17
Nodes (11): ExecutionStatus, ERROR, PENDING, RUNNING, SUCCESS, PipelineStatus, CANCELLED, COMPLETED (+3 more)

### Community 85 - "devDependencies"
Cohesion: 0.12
Nodes (17): devDependencies, axios, fast-check, ts-node, @types/node, @types/opossum, @types/uuid, typescript (+9 more)

### Community 86 - "SpecBundle"
Cohesion: 0.06
Nodes (14): CompileResult, FreezeResult, FIXTURES, FIXTURES, FIXTURES, FIXTURES, FIXTURES, FIXTURES (+6 more)

### Community 88 - "cli/index.ts"
Cohesion: 0.07
Nodes (38): commandHelp(), FIXTURES, SECTION_FILES, tmpDirs, cmdCompile(), compileFailedOutput(), CompileResult, cmdFreeze() (+30 more)

### Community 90 - "l14.ts"
Cohesion: 0.43
Nodes (4): EXPECT_GRAMMAR_DOC, EXPECTED_EXIT_PATTERN, isJudgeableExpect(), rule

### Community 92 - "make-bins-executable.js"
Cohesion: 0.50
Nodes (3): BINS, { join }, { readFileSync, chmodSync }

### Community 93 - "orchestrator/tsconfig.json"
Cohesion: 0.18
Nodes (10): compilerOptions, outDir, rootDir, exclude, extends, include, dist, node_modules (+2 more)

### Community 94 - "shared-config/package.json"
Cohesion: 0.22
Nodes (8): dependencies, zod, zod, main, name, private, types, version

### Community 95 - "shared-observability/tsconfig.json"
Cohesion: 0.14
Nodes (13): compilerOptions, declaration, declarationMap, outDir, rootDir, exclude, extends, include (+5 more)

### Community 96 - "compilerOptions"
Cohesion: 0.15
Nodes (12): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, module, moduleResolution, resolveJsonModule, skipLibCheck, strict (+4 more)

### Community 97 - "packed-install-smoke.sh"
Cohesion: 1.00
Nodes (3): run(), say(), packed-install-smoke.sh script

### Community 98 - "indexer/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src, ../../tsconfig.json

### Community 99 - "check/runner.ts"
Cohesion: 0.06
Nodes (31): activeProcessGroups, DEFAULT_TIMEOUT_MS, EVIDENCE_FILE_MODE, evidenceRunName(), execCommand(), execInProcessGroup(), ExecutorResult, FORCE_SETTLE_GRACE_MS (+23 more)

### Community 100 - "prepublish-check.js"
Cohesion: 0.29
Nodes (5): describe, pkg, result, { spawnSync }, status

### Community 101 - "generate.ts"
Cohesion: 0.08
Nodes (39): Command, COMMANDS, GenerateVariant, InitProfile, parseArgs(), ParseResult, SingleDirCommand, checkIntent() (+31 more)

### Community 102 - "LogLevel"
Cohesion: 0.11
Nodes (13): LogEntry, Logger, FastifyRequest, LogEntry, ServerConfig, LogLevel, DEBUG, ERROR (+5 more)

### Community 103 - "mcp_bridge/tsconfig.json"
Cohesion: 0.18
Nodes (10): compilerOptions, outDir, rootDir, exclude, extends, include, dist, node_modules (+2 more)

### Community 105 - "shared-types/package.json"
Cohesion: 0.33
Nodes (5): main, name, private, types, version

### Community 106 - "files"
Cohesion: 0.33
Nodes (6): files, dist, examples, generated, LICENSE, README.md

### Community 107 - "PipelineController.ts"
Cohesion: 0.18
Nodes (5): PipelineController, StoredRunEntry, DomainExclusion, RoleConfigsInput, RunPipelineRequest

### Community 108 - "containsPathTraversal"
Cohesion: 0.50
Nodes (5): containsPathTraversal(), isValidFilePath(), safePathValidator, sanitizePath(), validateAndSanitizeFilePath()

### Community 109 - "roleConfigMerger.ts"
Cohesion: 0.17
Nodes (14): extractProvidersFromConfig(), getValidRoleNames(), inferProviderFromModel(), isValidRoleName(), mergeRoleConfigs(), MODEL_PREFIX_TO_PROVIDER, modelConfigToProviderConfig(), normalizeToProviderConfigs() (+6 more)

### Community 111 - "run-eval.test.ts"
Cohesion: 0.26
Nodes (8): DEFAULT_REPORT_PATH, LIVE_ENV_VARS, missingLiveEnv(), parseArgs(), ParsedArgs, runEvalCli(), FAKE_LIVE_ENV, mockRunEvalAll

### Community 112 - "config.ts"
Cohesion: 0.28
Nodes (7): DEFAULT_BEHAVIOR_CONFIG, DEFAULT_PERFORMANCE_CONFIG, DEFAULT_SIGNAL_WEIGHTS, getGlobalConfig(), DiscoveryBehaviorConfig, PerformanceConfig, SignalWeightConfig

### Community 116 - "mcp/server.test.ts"
Cohesion: 0.15
Nodes (14): callTool(), expectIdentical(), FIXTURES, freshRoot(), frozenRoot(), injectionRoot(), inlineConforming(), inlineUnresolved() (+6 more)

### Community 117 - "Trace"
Cohesion: 0.10
Nodes (10): CloseConnectionCallback, DrainResult, FlushMetricsCallback, HandlerResult, RegisteredHandler, SHUTDOWN_TIMEOUT_MS, ShutdownHandler, ShutdownResult (+2 more)

### Community 118 - "test-fallback.ts"
Cohesion: 0.58
Nodes (8): assert(), assertEquals(), runAllTests(), testFallbackOnMaxRetries(), testFallbackOnValidationFailure(), testRetryWithSuccess(), testSuccessfulDiscovery(), testZeroDomainsHandling()

### Community 124 - "plan.test.ts"
Cohesion: 0.08
Nodes (18): cmdPlan(), PlanOptions, PlanResult, renderHuman(), renderJson(), compiledBundle(), FIXTURES, SECTION_FILES (+10 more)

### Community 125 - "change.test.ts"
Cohesion: 0.22
Nodes (6): FIXTURES, frozenSpecRoot(), inlineBundle(), makeSpecRoot(), SECTION_FILES, tmpDirs

### Community 126 - "bin"
Cohesion: 0.67
Nodes (3): bin, lco, lco-mcp

### Community 128 - "readiness.ts"
Cohesion: 0.50
Nodes (3): evaluateReleaseReadiness(), ReleaseReadiness, ReleaseReadinessInput

### Community 129 - "dependencies"
Cohesion: 0.67
Nodes (3): dependencies, zod, zod

### Community 130 - "http.test.ts"
Cohesion: 0.29
Nodes (5): FAKE_ENV, FakeEnv, jsonResponse(), okFetch(), PartialFakeEnv

### Community 131 - "repository"
Cohesion: 0.67
Nodes (3): repository, type, url

### Community 133 - "compile.test.ts"
Cohesion: 0.29
Nodes (3): FIXTURES, SECTION_FILES, tmpDirs

### Community 139 - "validators.test.ts"
Cohesion: 0.14
Nodes (11): DomainExclusionSchema, domainIdValidator, InvalidRoleError, RoleConfigsSchema, validateDomainExclusion(), ValidationError, invalidDomainIdArb, invalidJustificationArb (+3 more)

### Community 186 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, dev, start, test, test:watch

## Knowledge Gaps
- **737 isolated node(s):** `name`, `version`, `private`, `main`, `type` (+732 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **24 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ModelGateway` connect `ModelGateway` to `ChatMessage`, `IndexClient`, `PipelineEngine.ts`, `ConfigController.ts`, `Aggregator`, `shared-types/src/index.ts`, `ModelCallOptions`, `PipelineEngine`, `orchestrator/src/server.ts`, `ModelGateway.ts`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Why does `PipelineEngine` connect `PipelineEngine` to `configLoader.ts`, `IndexClient`, `PipelineEngine.ts`, `PipelineExecutionState`, `ModelGateway`, `Aggregator`, `PipelineController.ts`, `shared-types/src/index.ts`, `orchestrator/src/server.ts`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Why does `LogLevel` connect `LogLevel` to `PipelineEngine.ts`, `shared-utils/src/index.ts`, `IndexController`, `Logger`, `orchestrator/src/server.ts`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _737 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Domain` be split into smaller, more focused modules?**
  _Cohesion score 0.14260249554367202 - nodes in this community are weakly interconnected._
- **Should `schemas/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07740384615384616 - nodes in this community are weakly interconnected._
- **Should `all-bad-fixtures.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.12857142857142856 - nodes in this community are weakly interconnected._