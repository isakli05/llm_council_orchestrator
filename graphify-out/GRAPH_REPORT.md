# Graph Report - llm_council_orchestrator  (2026-08-26)

## Corpus Check
- 314 files · ~201,069 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2342 nodes · 4829 edges · 131 communities (99 shown, 32 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 99 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `88e3c1cb`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- SpecBundle
- schemas/index.ts
- cli/index.ts
- configLoader.ts
- models/types.ts
- PipelineEngine.ts
- lintBundle
- PipelineExecutionState
- engine.ts
- ModelGateway
- Aggregator
- RequestContextLogger
- SignalExtractor
- validators.ts
- discovery/types.ts
- EmbeddingEngine
- ShutdownManager
- PipelineEngine
- eval/report.ts
- VectorIndex
- CircuitBreakerManager
- dependencies
- indexer/src/server.ts
- test-spec-writer.ts
- init.ts
- shared-types/src/index.ts
- discovery/index.ts
- check/runner.test.ts
- change.test.ts
- commands/trace.test.ts
- plan.test.ts
- LogLevel
- orchestrator/src/server.ts
- eval/runner.ts
- FileMetadata
- RoleManager.ts
- versionNegotiation.ts
- IndexerServer
- mcp/server.ts
- OrchestratorAdapter.ts
- indexer/src/main.ts
- cache.ts
- ScheduledCleanupManager
- ModelCallOptions
- Trace
- PipelineState
- spec-core/package.json
- shared-utils/src/index.ts
- test-enterprise-features.ts
- EmbeddingEngine.ts
- test-utils.ts
- scripts
- indexer/src/api/IndexController.ts
- DiscoveryMetricsCollector
- Chunker
- GeminiAdapter.ts
- LRUCache
- MCPServer
- .discover
- compilerOptions
- HealthController.ts
- validators.test.ts
- generate.test.ts
- dependencies
- dependencies
- IncrementalTracker
- createServer
- AnthropicAdapter.ts
- errorSanitizer.ts
- run-eval.test.ts
- mcp_bridge/package.json
- orchestrator/package.json
- LRUCache
- PipelineExecutionStateMachine
- AnthropicAdapter
- PipelineStatus
- @fastify/rate-limit
- shared-utils/package.json
- formatJson
- DiscoveryConfigManager
- test-discovery-engine.ts
- audit-shared-drift.js
- middleware/tracing.ts
- ConfigController.ts
- ShutdownManager.ts
- devDependencies
- ChatMessage
- Logger
- roleConfigMerger.ts
- Scanner
- Domain
- CacheManager
- config.ts
- orchestrator/tsconfig.json
- shared-config/package.json
- shared-observability/tsconfig.json
- compilerOptions
- executionStateMachine.ts
- indexer/tsconfig.json
- VectorStorage
- ConfigController
- http.test.ts
- indexer/src/api/openapi.ts
- mcp_bridge/tsconfig.json
- ScheduledCleanup.ts
- shared-types/package.json
- Logger
- compile.test.ts
- containsPathTraversal
- example-pipeline-integration.ts
- .isTerminal
- ExecutionStatus
- models.ts
- mapZodError
- verify-observability.sh
- test-api.sh
- PipelineEngine.test.ts
- @llm/shared-config
- verify-hardening.sh
- IndexClient
- ZAIAdapter.ts
- MetricsRegistry
- VectorIndex.ts
- GracefulDegradationManager
- scripts
- @opentelemetry/api
- opossum

## God Nodes (most connected - your core abstractions)
1. `PipelineEngine` - 60 edges
2. `ModelGateway` - 55 edges
3. `SpecBundle` - 46 edges
4. `ModelCallOptions` - 45 edges
5. `lintBundle()` - 32 edges
6. `PipelineContext` - 30 edges
7. `ChatMessage` - 29 edges
8. `compileSpecDir()` - 29 edges
9. `IndexClient` - 28 edges
10. `LogLevel` - 27 edges

## Surprising Connections (you probably didn't know these)
- `StateChangeEvent` --references--> `PipelineExecutionState`  [EXTRACTED]
  apps/orchestrator/src/pipeline/executionStateMachine.ts → packages/shared-types/src/status.ts
- `ProviderAvailabilityResult` --references--> `ApiError`  [EXTRACTED]
  apps/orchestrator/src/pipeline/roleConfigMerger.ts → packages/shared-types/src/errors.ts
- `example()` --calls--> `formatJson()`  [EXTRACTED]
  apps/indexer/example.ts → packages/shared-utils/src/index.ts
- `IndexerConfig` --references--> `LogLevel`  [EXTRACTED]
  apps/indexer/src/main.ts → packages/shared-config/src/index.ts
- `LogEntry` --inherits--> `LogEntry`  [EXTRACTED]
  apps/indexer/src/observability/Logger.ts → packages/shared-utils/src/logger/BaseLogger.ts

## Import Cycles
- 3-file cycle: `packages/shared-utils/src/index.ts -> packages/shared-utils/src/logger/index.ts -> packages/shared-utils/src/logger/ConsoleLogger.ts -> packages/shared-utils/src/index.ts`

## Communities (131 total, 32 thin omitted)

### Community 0 - "SpecBundle"
Cohesion: 0.11
Nodes (20): cleanLint, FIXTURES, freeze(), FreezeResult, cleanLint, FIXTURES, artifactHashes(), HASHED_SECTIONS (+12 more)

### Community 1 - "schemas/index.ts"
Cohesion: 0.07
Nodes (34): BAD, BadFixtureExpectation, GOOD, ComplexityProfileSchema, IdSchema, ImpactLevelSchema, Sha256Schema, SpecState (+26 more)

### Community 2 - "cli/index.ts"
Cohesion: 0.10
Nodes (28): FIXTURES, SECTION_FILES, tmpDirs, cmdCompile(), compileFailedOutput(), CompileResult, cmdFreeze(), FreezeResult (+20 more)

### Community 3 - "configLoader.ts"
Cohesion: 0.06
Nodes (44): OrchestratorCore, runOrchestratorPipeline(), ApiKeyValidationResult, applyEnvironmentOverrides(), ArchitectConfigSchema, ConfigLoaderOptions, ConfigValidationResult, DefaultsConfigSchema (+36 more)

### Community 4 - "models/types.ts"
Cohesion: 0.09
Nodes (14): AnthropicOpenRouterAdapter, AnthropicOpenRouterRequest, GeminiOpenRouterAdapter, GeminiOpenRouterRequest, OpenAIOpenRouterAdapter, OpenAIOpenRouterRequest, OpenRouterAdapter, OpenRouterErrorResponse (+6 more)

### Community 5 - "PipelineEngine.ts"
Cohesion: 0.09
Nodes (27): StoredRunEntry, PipelineOptions, PipelineTrace, TraceSpan, ContextValidationError, DEEP_DOMAIN_ANALYSIS_ROLES, DEFAULT_ROLE_CONFIG, FULL_MODE_ANALYSIS_ROLES (+19 more)

### Community 6 - "lintBundle"
Cohesion: 0.06
Nodes (14): compileLintFreeze(), SECTION_PATHS, tmpDirs, lintBundle(), FIXTURES, FIXTURES, FIXTURES, FIXTURES (+6 more)

### Community 7 - "PipelineExecutionState"
Cohesion: 0.15
Nodes (11): InvalidStateTransitionError, PipelineExecutionState, AGGREGATING, ANALYZING, CANCELLED, COMPLETED, DISCOVERING, FAILED (+3 more)

### Community 8 - "engine.ts"
Cohesion: 0.15
Nodes (18): LintRule, RULES, FIXTURES, rule, rule, rule, rule, rule (+10 more)

### Community 9 - "ModelGateway"
Cohesion: 0.06
Nodes (24): ExtendedError, ModelGateway, NON_RETRYABLE_ERROR_PATTERNS, NON_RETRYABLE_HTTP_STATUS_CODES, ProviderStatus, REASONING_PROMPT, RETRYABLE_ERROR_PATTERNS, RETRYABLE_HTTP_STATUS_CODES (+16 more)

### Community 10 - "Aggregator"
Cohesion: 0.26
Nodes (3): Aggregator, AggregationOutput, ModelContribution

### Community 11 - "RequestContextLogger"
Cohesion: 0.13
Nodes (11): fastify, FastifyRequest, setupLogging(), createLogger(), CreateLoggerOptions, defaultContext, getIndexerLogger(), getMcpBridgeLogger() (+3 more)

### Community 13 - "validators.ts"
Cohesion: 0.07
Nodes (31): containsSqlInjection(), EnsureIndexedRequestSchema, EnsureIndexedResponseSchema, ErrorResponseSchema, escapeRegexChars(), IndexStatusQuerySchema, IndexStatusResponseSchema, justificationValidator (+23 more)

### Community 14 - "discovery/types.ts"
Cohesion: 0.24
Nodes (11): exampleHybridCmsDiscovery(), exampleNodejsMicroservicesDiscovery(), examplePhpMonolithDiscovery(), exampleUserExclusionWorkflow(), runAllExamples(), sleep(), SIGNAL_WEIGHTS, DependencyInfo (+3 more)

### Community 17 - "PipelineEngine"
Cohesion: 0.17
Nodes (3): PipelineEngine, PipelineContext, PipelineStepResult

### Community 18 - "eval/report.ts"
Cohesion: 0.08
Nodes (37): BAD, BadFixtureCapture, BadFixtureExpectation, buildMockScripts(), calcs(), captureBadFixtures(), deriveBundle(), EvalEvidence (+29 more)

### Community 20 - "CircuitBreakerManager"
Cohesion: 0.09
Nodes (13): CircuitBreakerConfig, CircuitBreakerManager, CircuitBreakerStats, defaultConfig, providerConfigs, ProviderName, DegradationLevel, DEGRADED (+5 more)

### Community 21 - "dependencies"
Cohesion: 0.05
Nodes (39): @opentelemetry/exporter-metrics-otlp-grpc, @opentelemetry/exporter-trace-otlp-grpc, @opentelemetry/resources, @opentelemetry/sdk-metrics, @opentelemetry/sdk-node, @opentelemetry/sdk-trace-base, @opentelemetry/semantic-conventions, dependencies (+31 more)

### Community 22 - "indexer/src/server.ts"
Cohesion: 0.08
Nodes (26): ApiError, ApiErrorResponse, containsPathTraversal(), containsSqlInjection(), ContextApiResponse, ContextRequest, ContextRequestSchema, DEFAULT_CONFIG (+18 more)

### Community 23 - "test-spec-writer.ts"
Cohesion: 0.13
Nodes (19): DomainSpecWriter, pathExists(), SpecWriterConfig, SpecWriteResult, mockDeepDomain, mockDomainWithSpecialChars, mockDomainWithSubDomains, mockExcludedDomain (+11 more)

### Community 24 - "init.ts"
Cohesion: 0.09
Nodes (21): FIXTURES, freshRoot(), initRoot(), makeSpecRoot(), SECTION_FILES, tmpDirs, buildSections(), cmdInit() (+13 more)

### Community 25 - "shared-types/src/index.ts"
Cohesion: 0.17
Nodes (18): AGGREGATOR_SYSTEM_PROMPT, buildSynthesisUserPrompt(), createFallbackSections(), formatRoleContributions(), formatRoleTitle(), getExpectedSectionIds(), getExpectedSectionTitles(), validateSynthesisResponse() (+10 more)

### Community 26 - "discovery/index.ts"
Cohesion: 0.20
Nodes (9): getGlobalMetricsRegistry(), MetricsRegistry, resetGlobalMetricsRegistry(), DiscoveryMetrics, DiscoveryTimingMetrics, DomainQualityMetrics, ReliabilityMetrics, ResourceMetrics (+1 more)

### Community 27 - "check/runner.test.ts"
Cohesion: 0.11
Nodes (20): CheckOutcome, DEFAULT_TIMEOUT_MS, Executor, OUTPUT_TAIL_LIMIT, parseExpect(), runChecks(), RunChecksOptions, RunChecksResult (+12 more)

### Community 28 - "change.test.ts"
Cohesion: 0.14
Nodes (16): ChangeResult, cmdChange(), findingLine(), FIXTURES, frozenSpecRoot(), loadBundle(), makeSpecRoot(), SECTION_FILES (+8 more)

### Community 29 - "commands/trace.test.ts"
Cohesion: 0.10
Nodes (16): cmdTrace(), renderTrace(), compiledBundle(), FIXTURES, SECTION_FILES, tmpDirs, TraceResult, buildTrace() (+8 more)

### Community 30 - "plan.test.ts"
Cohesion: 0.13
Nodes (12): cmdPlan(), PlanOptions, PlanResult, renderHuman(), renderJson(), compiledBundle(), FIXTURES, SECTION_FILES (+4 more)

### Community 31 - "LogLevel"
Cohesion: 0.12
Nodes (12): IndexerConfig, LogEntry, LogEntry, ServerConfig, LogLevel, DEBUG, ERROR, INFO (+4 more)

### Community 32 - "orchestrator/src/server.ts"
Cohesion: 0.08
Nodes (16): ProgressController, InvalidFilePathError, PathTraversalError, SqlInjectionError, defaultConfig, RateLimitConfig, setupRateLimiting(), defaultConfig (+8 more)

### Community 33 - "eval/runner.ts"
Cohesion: 0.12
Nodes (21): CLASSIFY_RULES, classifyAndProposeSingle(), classifySingle(), intentBlock(), JSON_ONLY, judgeMerge(), PITFALLS, propose() (+13 more)

### Community 34 - "FileMetadata"
Cohesion: 0.16
Nodes (9): FRAMEWORK_PATTERNS, MetadataAnalyzer, ProjectMetadata, ChangeDetectionResult, FileHash, IncrementalTrackerError, FileMetadata, ScannerConfig (+1 more)

### Community 35 - "RoleManager.ts"
Cohesion: 0.14
Nodes (13): DomainContext, createContextBuilder(), ProviderConfig, RoleManager, RoleConfig, RoleProviderConfig, RoleRequest, RoleType (+5 more)

### Community 36 - "versionNegotiation.ts"
Cohesion: 0.14
Nodes (22): RFC-8594, ApiVersion, clearDeprecatedEndpoints(), createUnsupportedVersionResponse(), DEPRECATED_ENDPOINTS, DeprecatedEndpointConfig, DeprecationHeaders, generateDeprecationHeaders() (+14 more)

### Community 37 - "IndexerServer"
Cohesion: 0.13
Nodes (4): generateCorrelationId(), IndexerServer, main(), getEndpointTimeout()

### Community 38 - "mcp/server.ts"
Cohesion: 0.13
Nodes (20): CoreResult, DIR_PROPERTY, errorResponse(), handleRpcLine(), handleToolsCall(), isPlainObject(), JsonRpcId, OPTIONAL_ARG_TYPES (+12 more)

### Community 39 - "OrchestratorAdapter.ts"
Cohesion: 0.16
Nodes (8): OrchestratorAdapter, DomainExclusion, IndexStateResponse, OrchestratorRunRequest, OrchestratorRunResponse, PipelineProgressResponse, SpecFilesResponse, safeJsonParse()

### Community 40 - "indexer/src/main.ts"
Cohesion: 0.15
Nodes (5): example(), Indexer, main(), IndexerStats, StatsCollector

### Community 41 - "cache.ts"
Cohesion: 0.12
Nodes (4): CacheEntry, DependencyMappingCache, PatternMatchCache, CacheStatistics

### Community 45 - "PipelineState"
Cohesion: 0.16
Nodes (14): StateMachine, StateContext, StateTransition, PipelineState, ABORTED, AGGREGATE, ANALYZE, COMPLETED (+6 more)

### Community 46 - "spec-core/package.json"
Cohesion: 0.06
Nodes (35): bin, lco, lco-mcp, dependencies, zod, description, devDependencies, @types/node (+27 more)

### Community 47 - "shared-utils/src/index.ts"
Cohesion: 0.21
Nodes (11): Logger, TOOL_DEFINITIONS, MCPError, MCPResponse, MCPToolDefinition, DomainExclusionInput, DomainExclusionValidationResult, isValidJustification() (+3 more)

### Community 48 - "test-enterprise-features.ts"
Cohesion: 0.44
Nodes (12): initializeGlobalCacheManager(), resetGlobalCacheManager(), initializeGlobalConfig(), resetGlobalConfig(), assert(), assertEquals(), runAllTests(), sleep() (+4 more)

### Community 49 - "EmbeddingEngine.ts"
Cohesion: 0.17
Nodes (11): DimensionMismatchError, EmbeddingEngineConfig, EmbeddingRequest, EmbeddingResponse, EXPECTED_EMBEDDING_DIMENSION, AVAILABLE_MODELS, DEFAULT_EMBEDDING_MODEL, detectDevice() (+3 more)

### Community 50 - "test-utils.ts"
Cohesion: 0.14
Nodes (16): apiKeyArb, chatMessageArb, chatMessagesArb, DEFAULT_NUM_RUNS, domainIdArb, fcConfig, httpStatusArb, modelCallOptionsArb (+8 more)

### Community 51 - "scripts"
Cohesion: 0.06
Nodes (35): devDependencies, axios, fast-check, tsx, @types/node, typescript, vite-tsconfig-paths, vitest (+27 more)

### Community 52 - "indexer/src/api/IndexController.ts"
Cohesion: 0.12
Nodes (9): ContextRequest, ContextResponse, EnsureIndexedRequest, EnsureIndexedResponse, IndexController, SearchRequest, SearchResponse, StatsResponse (+1 more)

### Community 53 - "DiscoveryMetricsCollector"
Cohesion: 0.21
Nodes (3): DiscoveryMetricsCollector, testMetricsCollection(), testMetricsRegistry()

### Community 55 - "GeminiAdapter.ts"
Cohesion: 0.16
Nodes (7): GeminiAdapter, GeminiContent, GeminiErrorResponse, GeminiGenerationConfig, GeminiPart, GeminiRequest, GeminiResponse

### Community 57 - "MCPServer"
Cohesion: 0.25
Nodes (4): main(), MCPServer, MCPNotification, MCPRequest

### Community 58 - ".discover"
Cohesion: 0.18
Nodes (14): DomainDiscoveryEngine, testAllDomainsExcluded(), testExampleStructure(), assert(), assertEquals(), runAllTests(), testFallbackOnMaxRetries(), testFallbackOnValidationFailure() (+6 more)

### Community 59 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, declaration, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck (+6 more)

### Community 60 - "HealthController.ts"
Cohesion: 0.19
Nodes (8): HealthCheckResult, HealthController, NOTE: Qdrant is optional and not in the critical data path, setupMetrics(), trackLlmCall(), trackPipelineRun(), trackPipelineStep(), getOrchestratorMetrics()

### Community 61 - "validators.test.ts"
Cohesion: 0.14
Nodes (11): DomainExclusionSchema, domainIdValidator, InvalidRoleError, RoleConfigsSchema, validateDomainExclusion(), ValidationError, invalidDomainIdArb, invalidJustificationArb (+3 more)

### Community 62 - "generate.test.ts"
Cohesion: 0.07
Nodes (25): cmdGenerate(), GenerateOptions, GenerateResult, lintReason(), lintRejections(), FAKE_ENV, PET_CLINIC, SECTION_FILES (+17 more)

### Community 63 - "dependencies"
Cohesion: 0.04
Nodes (44): dependencies, axios, fastify, @fastify/cors, @fastify/helmet, @fastify/rate-limit, @llm/shared-config, @llm/shared-observability (+36 more)

### Community 64 - "dependencies"
Cohesion: 0.12
Nodes (17): dependencies, fastify, @fastify/cors, @fastify/helmet, @llm/shared-observability, @llm/shared-types, @llm/shared-utils, uuid (+9 more)

### Community 66 - "createServer"
Cohesion: 0.14
Nodes (6): PipelineController, SpecController, DomainExclusion, RoleConfigsInput, RunPipelineRequest, createServer()

### Community 67 - "AnthropicAdapter.ts"
Cohesion: 0.15
Nodes (12): AnthropicContentBlockDeltaEvent, AnthropicContentBlockStartEvent, AnthropicErrorEvent, AnthropicErrorResponse, AnthropicMessage, AnthropicMessageDeltaEvent, AnthropicMessageStartEvent, AnthropicRequest (+4 more)

### Community 68 - "errorSanitizer.ts"
Cohesion: 0.19
Nodes (10): createFullErrorDetails(), FullErrorDetails, GENERIC_ERROR_MESSAGES, INTERNAL_ERROR_STATUS_CODES, isProduction(), SanitizedError, sanitizeError(), sanitizeErrorObject() (+2 more)

### Community 69 - "run-eval.test.ts"
Cohesion: 0.26
Nodes (8): DEFAULT_REPORT_PATH, LIVE_ENV_VARS, missingLiveEnv(), parseArgs(), ParsedArgs, runEvalCli(), FAKE_LIVE_ENV, mockRunEvalAll

### Community 70 - "mcp_bridge/package.json"
Cohesion: 0.07
Nodes (27): dependencies, @llm/shared-config, @llm/shared-types, @llm/shared-utils, devDependencies, ts-node, @types/node, typescript (+19 more)

### Community 71 - "orchestrator/package.json"
Cohesion: 0.33
Nodes (5): main, name, private, type, version

### Community 75 - "PipelineStatus"
Cohesion: 0.33
Nodes (6): PipelineStatus, CANCELLED, COMPLETED, FAILED, PENDING, RUNNING

### Community 77 - "shared-utils/package.json"
Cohesion: 0.22
Nodes (8): dependencies, @llm/shared-config, @llm/shared-config, main, name, private, types, version

### Community 78 - "formatJson"
Cohesion: 0.45
Nodes (3): ToolRegistry, MCPToolResult, formatJson()

### Community 80 - "test-discovery-engine.ts"
Cohesion: 0.53
Nodes (5): mockIndexMetadata, runTests(), testBasicDiscovery(), testDiscoveryWithExclusions(), testEmptyIndexMetadata()

### Community 81 - "audit-shared-drift.js"
Cohesion: 0.29
Nodes (10): APPS_DIR, AUDIT_DIR, ensureAuditDir(), formatCandidates(), groupBy(), main(), ROOT, scanFile() (+2 more)

### Community 82 - "middleware/tracing.ts"
Cohesion: 0.18
Nodes (6): fastify, FastifyRequest, setupTracing(), tracer, initializeTracing(), TracingConfig

### Community 83 - "ConfigController.ts"
Cohesion: 0.24
Nodes (8): ModelInfo, ModelsResponse, ProviderInfo, RoleInfo, RolesResponse, ModelConfig, ReasoningConfig, ThinkingConfig

### Community 84 - "ShutdownManager.ts"
Cohesion: 0.20
Nodes (9): CloseConnectionCallback, DrainResult, FlushMetricsCallback, HandlerResult, RegisteredHandler, SHUTDOWN_TIMEOUT_MS, ShutdownHandler, ShutdownResult (+1 more)

### Community 85 - "devDependencies"
Cohesion: 0.12
Nodes (17): devDependencies, axios, fast-check, ts-node, @types/node, @types/opossum, @types/uuid, typescript (+9 more)

### Community 86 - "ChatMessage"
Cohesion: 0.17
Nodes (7): OpenAIErrorResponse, OpenAIMessage, OpenAIRequest, OpenAIResponse, ModelResponse, ProviderAdapter, ChatMessage

### Community 88 - "roleConfigMerger.ts"
Cohesion: 0.26
Nodes (11): extractProvidersFromConfig(), getValidRoleNames(), inferProviderFromModel(), isValidRoleName(), mergeRoleConfigs(), MODEL_PREFIX_TO_PROVIDER, modelConfigToProviderConfig(), normalizeToProviderConfigs() (+3 more)

### Community 90 - "Domain"
Cohesion: 0.16
Nodes (10): DOMAIN_MAPPINGS, DomainClassifier, IMPORTANT: Confidence does NOT affect analysisDepth, AnalysisDepth, DiscoveryExecutionMetadata, DiscoveryStatistics, Domain, Evidence (+2 more)

### Community 92 - "config.ts"
Cohesion: 0.28
Nodes (7): DEFAULT_BEHAVIOR_CONFIG, DEFAULT_PERFORMANCE_CONFIG, DEFAULT_SIGNAL_WEIGHTS, getGlobalConfig(), DiscoveryBehaviorConfig, PerformanceConfig, SignalWeightConfig

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

### Community 97 - "executionStateMachine.ts"
Cohesion: 0.24
Nodes (7): getNextStepState(), getValidTransitions(), isValidTransition(), StateChangeEvent, STEP_STATES, VALID_TRANSITIONS, validateTransition()

### Community 98 - "indexer/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src, ../../tsconfig.json

### Community 101 - "http.test.ts"
Cohesion: 0.29
Nodes (5): FAKE_ENV, FakeEnv, jsonResponse(), okFetch(), PartialFakeEnv

### Community 102 - "indexer/src/api/openapi.ts"
Cohesion: 0.22
Nodes (4): openApiSpec, openApiSpec, LATEST_STABLE_VERSION, SUPPORTED_VERSIONS

### Community 103 - "mcp_bridge/tsconfig.json"
Cohesion: 0.18
Nodes (10): compilerOptions, outDir, rootDir, exclude, extends, include, dist, node_modules (+2 more)

### Community 104 - "ScheduledCleanup.ts"
Cohesion: 0.29
Nodes (5): ActiveRunsCleanupCallback, CLEANUP_DEFAULTS, CLEANUP_INTERVALS, CleanupStats, MemoryStats

### Community 105 - "shared-types/package.json"
Cohesion: 0.33
Nodes (5): main, name, private, types, version

### Community 107 - "compile.test.ts"
Cohesion: 0.33
Nodes (3): FIXTURES, SECTION_FILES, tmpDirs

### Community 108 - "containsPathTraversal"
Cohesion: 0.50
Nodes (5): containsPathTraversal(), isValidFilePath(), safePathValidator, sanitizePath(), validateAndSanitizeFilePath()

### Community 111 - "ExecutionStatus"
Cohesion: 0.40
Nodes (5): ExecutionStatus, ERROR, PENDING, RUNNING, SUCCESS

### Community 112 - "models.ts"
Cohesion: 0.67
Nodes (3): ModelResponseMetadata, ExecutionMetadata, ModelMetadata

### Community 113 - "mapZodError"
Cohesion: 0.67
Nodes (3): extractInvalidRoleName(), isInvalidRoleError(), mapZodError()

### Community 127 - "IndexClient"
Cohesion: 0.07
Nodes (29): IndexController, EnsureIndexedRequest, IndexStatusQuery, ContextBuilder, ContextBuilderOptions, FormattedContext, RoleType, calculateBackoffDelay() (+21 more)

### Community 138 - "ZAIAdapter.ts"
Cohesion: 0.18
Nodes (7): CHINESE_ERROR_TRANSLATIONS, translateErrorMessage(), ZAIAdapter, ZAIErrorResponse, ZAIMessage, ZAIRequest, ZAIResponse

### Community 171 - "VectorIndex.ts"
Cohesion: 0.25
Nodes (5): ChunkerConfig, EmbeddingResult, IndexMetadata, VectorStorageError, VectorIndexConfig

### Community 186 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, dev, start, test, test:watch

## Knowledge Gaps
- **659 isolated node(s):** `name`, `version`, `private`, `main`, `type` (+654 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **32 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Logger` connect `Logger` to `orchestrator/src/server.ts`, `executionStateMachine.ts`, `createServer`, `PipelineEngine.ts`, `ScheduledCleanup.ts`, `ModelGateway`, `discovery/types.ts`, `ShutdownManager.ts`, `test-spec-writer.ts`, `LogLevel`, `IndexClient`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Why does `ModelGateway` connect `ModelGateway` to `orchestrator/src/server.ts`, `RoleManager.ts`, `ConfigController`, `PipelineEngine.ts`, `Aggregator`, `ModelCallOptions`, `PipelineEngine`, `ConfigController.ts`, `ChatMessage`, `shared-types/src/index.ts`, `IndexClient`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `PipelineEngine` connect `PipelineEngine` to `orchestrator/src/server.ts`, `createServer`, `configLoader.ts`, `RoleManager.ts`, `PipelineEngine.ts`, `ModelGateway`, `Aggregator`, `PipelineExecutionStateMachine`, `.isTerminal`, `IndexClient`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _659 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `SpecBundle` be split into smaller, more focused modules?**
  _Cohesion score 0.10795454545454546 - nodes in this community are weakly interconnected._
- **Should `schemas/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06502732240437159 - nodes in this community are weakly interconnected._
- **Should `cli/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10121457489878542 - nodes in this community are weakly interconnected._