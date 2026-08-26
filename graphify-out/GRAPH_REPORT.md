# Graph Report - llm_council_orchestrator  (2026-08-27)

## Corpus Check
- 336 files · ~239,719 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2560 nodes · 5413 edges · 136 communities (107 shown, 29 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 103 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c3b40dd7`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Domain
- common.ts
- lintBundle
- configLoader.ts
- adapters/index.ts
- Aggregator
- plan.test.ts
- PipelineExecutionState
- engine.ts
- ModelGateway
- cli/index.ts
- revision.ts
- VectorIndex.ts
- validators.ts
- LRUCache
- shared-config/src/index.ts
- ShutdownManager
- PipelineEngine
- eval/report.ts
- VectorIndex
- CircuitBreakerManager
- dependencies
- indexer/src/server.ts
- MetricsRegistry
- SignalExtractor
- middleware/tracing.ts
- DiscoveryMetricsCollector
- PipelineController.ts
- PipelineEngine.ts
- commands/trace.test.ts
- ScheduledCleanupManager
- LogLevel
- orchestrator/src/server.ts
- eval/runner.ts
- FileMetadata
- IndexClient
- versionNegotiation.ts
- IndexerServer
- mcp/server.ts
- OrchestratorAdapter.ts
- formatJson
- cache.ts
- DomainClassifier
- run-eval.test.ts
- score.test.ts
- PipelineState
- spec-core/package.json
- indexer/src/main.ts
- test-enterprise-features.ts
- change.test.ts
- test-utils.ts
- scripts
- generate.test.ts
- Trace
- Chunker
- GeminiAdapter
- init.ts
- MCPServer
- discovery/index.ts
- compilerOptions
- HealthController.ts
- schemas/index.ts
- adapter.ts
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
- lifecycle.ts
- registerTools.ts
- errorSanitizer.ts
- @fastify/rate-limit
- shared-utils/package.json
- SpecBundle
- DiscoveryConfigManager
- config.ts
- audit-shared-drift.js
- check/runner.ts
- models/types.ts
- PipelineStatus
- devDependencies
- run-all-examples.ts
- Logger
- EmbeddingEngine
- Scanner
- ModelCallOptions
- CacheManager
- make-bins-executable.js
- orchestrator/tsconfig.json
- shared-config/package.json
- shared-observability/tsconfig.json
- compilerOptions
- packed-install-smoke.sh
- indexer/tsconfig.json
- ZAIAdapter.ts
- ConfigController
- budget.ts
- SpecBundleSchema
- mcp_bridge/tsconfig.json
- indexer/src/api/IndexController.ts
- shared-types/package.json
- ModelGateway.ts
- orchestrator/src/middleware/security.ts
- lint/trace.test.ts
- roleConfigMerger.ts
- indexer/src/api/openapi.ts
- ScheduledCleanup.ts
- ShutdownManager.ts
- GracefulDegradationManager
- verify-observability.sh
- test-api.sh
- mcp/server.test.ts
- l08.test.ts
- discovery.ts
- verify-hardening.sh
- test-discovery-engine.ts
- ZAIOpenRouterAdapter
- .discover
- write-spec.test.ts
- example-pipeline-integration.ts
- fastify
- InvalidRoleError
- AnthropicAdapter
- shared-utils/src/index.ts
- scripts
- @opentelemetry/api
- opossum

## God Nodes (most connected - your core abstractions)
1. `PipelineEngine` - 60 edges
2. `SpecBundle` - 58 edges
3. `ModelGateway` - 55 edges
4. `ModelCallOptions` - 45 edges
5. `lintBundle()` - 36 edges
6. `compileSpecDir()` - 31 edges
7. `PipelineContext` - 30 edges
8. `ChatMessage` - 29 edges
9. `IndexClient` - 28 edges
10. `LogLevel` - 27 edges

## Surprising Connections (you probably didn't know these)
- `ProviderStatus` --references--> `ProviderType`  [EXTRACTED]
  apps/orchestrator/src/models/ModelGateway.ts → packages/shared-types/src/models.ts
- `ProviderAvailabilityResult` --references--> `ApiError`  [EXTRACTED]
  apps/orchestrator/src/pipeline/roleConfigMerger.ts → packages/shared-types/src/errors.ts
- `ConfigController` --references--> `ArchitectConfig`  [EXTRACTED]
  apps/orchestrator/src/api/ConfigController.ts → packages/shared-config/src/configLoader.ts
- `ModelInfo` --references--> `ModelConfig`  [EXTRACTED]
  apps/orchestrator/src/api/ConfigController.ts → packages/shared-types/src/roles.ts
- `RoleInfo` --references--> `ModelConfig`  [EXTRACTED]
  apps/orchestrator/src/api/ConfigController.ts → packages/shared-types/src/roles.ts

## Import Cycles
- 3-file cycle: `packages/shared-utils/src/index.ts -> packages/shared-utils/src/logger/index.ts -> packages/shared-utils/src/logger/ConsoleLogger.ts -> packages/shared-utils/src/index.ts`

## Communities (136 total, 29 thin omitted)

### Community 0 - "Domain"
Cohesion: 0.14
Nodes (20): DomainSpecWriter, pathExists(), SpecWriterConfig, SpecWriteResult, mockDeepDomain, mockDomainWithSpecialChars, mockDomainWithSubDomains, mockExcludedDomain (+12 more)

### Community 1 - "common.ts"
Cohesion: 0.08
Nodes (32): AssumptionIdSchema, ComplexityProfileSchema, ContractIdSchema, DecisionIdSchema, EvidenceIdSchema, IdSchema, ImpactLevelSchema, RequirementIdSchema (+24 more)

### Community 2 - "lintBundle"
Cohesion: 0.10
Nodes (27): cmdCompile(), compileFailedOutput(), CompileResult, cmdFreeze(), FreezeResult, ChildOutcome, CLI_JS, SECTION_FILES (+19 more)

### Community 3 - "configLoader.ts"
Cohesion: 0.07
Nodes (41): applyEnvironmentOverrides(), ArchitectConfigSchema, ConfigLoaderOptions, DefaultsConfigSchema, EmbeddingConfigSchema, EmbeddingModelConfigSchema, ENV_VAR_MAPPINGS, findConfigPath() (+33 more)

### Community 4 - "adapters/index.ts"
Cohesion: 0.10
Nodes (11): AnthropicOpenRouterAdapter, AnthropicOpenRouterRequest, GeminiOpenRouterRequest, OpenAIOpenRouterAdapter, OpenAIOpenRouterRequest, OpenRouterAdapter, OpenRouterErrorResponse, OpenRouterMessage (+3 more)

### Community 5 - "Aggregator"
Cohesion: 0.15
Nodes (13): Aggregator, AGGREGATOR_SYSTEM_PROMPT, buildSynthesisUserPrompt(), createFallbackSections(), formatRoleContributions(), formatRoleTitle(), getExpectedSectionIds(), getExpectedSectionTitles() (+5 more)

### Community 6 - "plan.test.ts"
Cohesion: 0.08
Nodes (20): cmdPlan(), PlanOptions, PlanResult, PlanTask, renderHuman(), renderJson(), compiledBundle(), FIXTURES (+12 more)

### Community 7 - "PipelineExecutionState"
Cohesion: 0.07
Nodes (22): getNextStepState(), getValidTransitions(), InvalidStateTransitionError, isActiveState(), isTerminalState(), isValidTransition(), PipelineExecutionStateMachine, StateChangeEvent (+14 more)

### Community 8 - "engine.ts"
Cohesion: 0.13
Nodes (20): BAD, BadFixtureExpectation, LintRule, RULES, rule, rule, rule, rule (+12 more)

### Community 9 - "ModelGateway"
Cohesion: 0.09
Nodes (12): ModelGateway, ArchitectConfig, ProviderType, ANTHROPIC, ANTHROPIC_OPENROUTER, GEMINI, GEMINI_OPENROUTER, GLM (+4 more)

### Community 10 - "cli/index.ts"
Cohesion: 0.09
Nodes (28): FIXTURES, SECTION_FILES, tmpDirs, cmdGenerate(), DEFAULT_GENERATE_PROFILE, DEFAULT_GENERATE_VARIANT, GenerateOptions, GenerateResult (+20 more)

### Community 11 - "revision.ts"
Cohesion: 0.10
Nodes (26): applyUnderLock(), ChangeResult, cmdChange(), findingLine(), SECTION_KEYS, writeSpecDir(), acquireSpecRootLock(), backupPathFor() (+18 more)

### Community 12 - "VectorIndex.ts"
Cohesion: 0.16
Nodes (6): ChunkerConfig, EmbeddingEngineConfig, IndexMetadata, VectorStorage, VectorStorageError, VectorIndexConfig

### Community 13 - "validators.ts"
Cohesion: 0.06
Nodes (38): containsPathTraversal(), containsSqlInjection(), EnsureIndexedRequestSchema, EnsureIndexedResponseSchema, ErrorResponseSchema, escapeRegexChars(), extractInvalidRoleName(), IndexStatusQuerySchema (+30 more)

### Community 15 - "shared-config/src/index.ts"
Cohesion: 0.13
Nodes (13): OrchestratorCore, PipelineOptions, runOrchestratorPipeline(), mockIndexMetadata, runTest(), testTraceSpan(), PipelineResult, ApiKeyValidationResult (+5 more)

### Community 17 - "PipelineEngine"
Cohesion: 0.16
Nodes (4): PipelineEngine, testDiscoveryMetrics(), PipelineContext, PipelineStepResult

### Community 18 - "eval/report.ts"
Cohesion: 0.09
Nodes (36): createHttpLlm(), BAD, BadFixtureCapture, BadFixtureExpectation, buildMockScripts(), calcs(), captureBadFixtures(), deriveBundle() (+28 more)

### Community 20 - "CircuitBreakerManager"
Cohesion: 0.10
Nodes (12): CircuitBreakerConfig, CircuitBreakerManager, CircuitBreakerStats, defaultConfig, providerConfigs, ProviderName, DegradationLevel, DEGRADED (+4 more)

### Community 21 - "dependencies"
Cohesion: 0.05
Nodes (39): @opentelemetry/exporter-metrics-otlp-grpc, @opentelemetry/exporter-trace-otlp-grpc, @opentelemetry/resources, @opentelemetry/sdk-metrics, @opentelemetry/sdk-node, @opentelemetry/sdk-trace-base, @opentelemetry/semantic-conventions, dependencies (+31 more)

### Community 22 - "indexer/src/server.ts"
Cohesion: 0.08
Nodes (26): ApiError, ApiErrorResponse, containsPathTraversal(), containsSqlInjection(), ContextApiResponse, ContextRequest, ContextRequestSchema, DEFAULT_CONFIG (+18 more)

### Community 25 - "middleware/tracing.ts"
Cohesion: 0.18
Nodes (6): fastify, FastifyRequest, setupTracing(), tracer, initializeTracing(), TracingConfig

### Community 26 - "DiscoveryMetricsCollector"
Cohesion: 0.12
Nodes (10): DiscoveryMetricsCollector, getGlobalMetricsRegistry(), MetricsRegistry, resetGlobalMetricsRegistry(), DiscoveryMetrics, DiscoveryTimingMetrics, DomainQualityMetrics, ReliabilityMetrics (+2 more)

### Community 27 - "PipelineController.ts"
Cohesion: 0.24
Nodes (6): PipelineController, StoredRunEntry, DomainExclusion, RoleConfigsInput, RunPipelineRequest, RunPipelineRequestSchema

### Community 28 - "PipelineEngine.ts"
Cohesion: 0.11
Nodes (23): AggregationInput, AggregationResult, ContextValidationError, DEEP_DOMAIN_ANALYSIS_ROLES, DEFAULT_ROLE_CONFIG, FULL_MODE_ANALYSIS_ROLES, QUICK_MODE_ANALYSIS_ROLES, StepTimeoutError (+15 more)

### Community 29 - "commands/trace.test.ts"
Cohesion: 0.18
Nodes (9): cmdTrace(), renderTrace(), compiledBundle(), FIXTURES, SECTION_FILES, tmpDirs, TraceResult, buildTrace() (+1 more)

### Community 31 - "LogLevel"
Cohesion: 0.12
Nodes (12): IndexerConfig, LogEntry, LogEntry, ServerConfig, LogLevel, DEBUG, ERROR, INFO (+4 more)

### Community 32 - "orchestrator/src/server.ts"
Cohesion: 0.09
Nodes (15): ProgressController, SpecController, InvalidFilePathError, PathTraversalError, SqlInjectionError, defaultConfig, RateLimitConfig, setupRateLimiting() (+7 more)

### Community 33 - "eval/runner.ts"
Cohesion: 0.13
Nodes (24): BudgetLedger, LlmUsage, CLASSIFY_RULES, classifyAndProposeSingle(), classifySingle(), intentBlock(), JSON_ONLY, judgeMerge() (+16 more)

### Community 34 - "FileMetadata"
Cohesion: 0.11
Nodes (11): FRAMEWORK_PATTERNS, MetadataAnalyzer, ProjectMetadata, ChangeDetectionResult, FileHash, IncrementalTrackerError, Logger, FileMetadata (+3 more)

### Community 35 - "IndexClient"
Cohesion: 0.05
Nodes (39): IndexController, EnsureIndexedRequest, IndexStatusQuery, ContextBuilder, ContextBuilderOptions, createContextBuilder(), FormattedContext, RoleType (+31 more)

### Community 36 - "versionNegotiation.ts"
Cohesion: 0.14
Nodes (22): RFC-8594, ApiVersion, clearDeprecatedEndpoints(), createUnsupportedVersionResponse(), DEPRECATED_ENDPOINTS, DeprecatedEndpointConfig, DeprecationHeaders, generateDeprecationHeaders() (+14 more)

### Community 37 - "IndexerServer"
Cohesion: 0.16
Nodes (3): generateCorrelationId(), IndexerServer, main()

### Community 38 - "mcp/server.ts"
Cohesion: 0.07
Nodes (49): authorizeExecution(), checkPreviewDigest(), consentDigestLine(), EXEC_OPT_IN_ENV, EXEC_ROOT_ENV, ExecAuthorization, ExecBoundary, execOptInFromEnv() (+41 more)

### Community 39 - "OrchestratorAdapter.ts"
Cohesion: 0.16
Nodes (8): OrchestratorAdapter, DomainExclusion, IndexStateResponse, OrchestratorRunRequest, OrchestratorRunResponse, PipelineProgressResponse, SpecFilesResponse, safeJsonParse()

### Community 40 - "formatJson"
Cohesion: 0.45
Nodes (3): ToolRegistry, MCPToolResult, formatJson()

### Community 41 - "cache.ts"
Cohesion: 0.12
Nodes (4): CacheEntry, DependencyMappingCache, PatternMatchCache, CacheStatistics

### Community 43 - "run-eval.test.ts"
Cohesion: 0.26
Nodes (8): DEFAULT_REPORT_PATH, LIVE_ENV_VARS, missingLiveEnv(), parseArgs(), ParsedArgs, runEvalCli(), FAKE_LIVE_ENV, mockRunEvalAll

### Community 44 - "score.test.ts"
Cohesion: 0.25
Nodes (3): PipelineOutcome, PET_CLINIC, U

### Community 45 - "PipelineState"
Cohesion: 0.16
Nodes (14): StateMachine, StateContext, StateTransition, PipelineState, ABORTED, AGGREGATE, ANALYZE, COMPLETED (+6 more)

### Community 46 - "spec-core/package.json"
Cohesion: 0.05
Nodes (37): bin, lco, lco-mcp, dependencies, zod, description, devDependencies, @types/node (+29 more)

### Community 47 - "indexer/src/main.ts"
Cohesion: 0.15
Nodes (5): example(), Indexer, main(), IndexerStats, StatsCollector

### Community 48 - "test-enterprise-features.ts"
Cohesion: 0.30
Nodes (14): initializeGlobalCacheManager(), resetGlobalCacheManager(), initializeGlobalConfig(), resetGlobalConfig(), assert(), assertEquals(), runAllTests(), sleep() (+6 more)

### Community 49 - "change.test.ts"
Cohesion: 0.22
Nodes (6): FIXTURES, frozenSpecRoot(), inlineBundle(), makeSpecRoot(), SECTION_FILES, tmpDirs

### Community 50 - "test-utils.ts"
Cohesion: 0.10
Nodes (23): DomainExclusionSchema, RoleConfigsSchema, validateDomainExclusion(), ValidationError, apiKeyArb, chatMessageArb, chatMessagesArb, DEFAULT_NUM_RUNS (+15 more)

### Community 51 - "scripts"
Cohesion: 0.06
Nodes (35): devDependencies, axios, fast-check, tsx, @types/node, typescript, vite-tsconfig-paths, vitest (+27 more)

### Community 52 - "generate.test.ts"
Cohesion: 0.11
Nodes (11): complete(), FAKE_ENV, fetchSpy(), jsonResponse(), PET_CLINIC, SECTION_FILES, SESSION_SERVICE, tmpDirs (+3 more)

### Community 56 - "init.ts"
Cohesion: 0.10
Nodes (19): FIXTURES, freshRoot(), initRoot(), makeSpecRoot(), SECTION_FILES, tmpDirs, buildSections(), cmdInit() (+11 more)

### Community 57 - "MCPServer"
Cohesion: 0.28
Nodes (3): MCPServer, MCPNotification, MCPRequest

### Community 58 - "discovery/index.ts"
Cohesion: 0.21
Nodes (9): DOMAIN_MAPPINGS, IMPORTANT: Confidence does NOT affect analysisDepth, SIGNAL_WEIGHTS, DependencyInfo, DirectoryNode, DomainContext, IndexMetadata, createMockIndexMetadata() (+1 more)

### Community 59 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, declaration, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck (+6 more)

### Community 60 - "HealthController.ts"
Cohesion: 0.19
Nodes (8): HealthCheckResult, HealthController, NOTE: Qdrant is optional and not in the critical data path, setupMetrics(), trackLlmCall(), trackPipelineRun(), trackPipelineStep(), getOrchestratorMetrics()

### Community 61 - "schemas/index.ts"
Cohesion: 0.05
Nodes (16): FIXTURES, SECTION_FILES, tmpDirs, FIXTURES, FIXTURES, FIXTURES, FIXTURES, FIXTURES (+8 more)

### Community 62 - "adapter.ts"
Cohesion: 0.33
Nodes (7): LlmAdapter, LlmCompleteOptions, LlmResponse, createMockLlm(), MockScript, SCRIPT, HandleRpcOptions

### Community 63 - "dependencies"
Cohesion: 0.04
Nodes (44): dependencies, axios, fastify, @fastify/cors, @fastify/helmet, @fastify/rate-limit, @llm/shared-config, @llm/shared-observability (+36 more)

### Community 64 - "dependencies"
Cohesion: 0.12
Nodes (17): dependencies, @fastify/cors, @fastify/helmet, @llm/shared-config, @llm/shared-observability, @llm/shared-types, @llm/shared-utils, uuid (+9 more)

### Community 66 - "ChatMessage"
Cohesion: 0.31
Nodes (4): ModelResponse, ProviderAdapter, ProviderConfig, ChatMessage

### Community 67 - "AnthropicAdapter.ts"
Cohesion: 0.15
Nodes (12): AnthropicContentBlockDeltaEvent, AnthropicContentBlockStartEvent, AnthropicErrorEvent, AnthropicErrorResponse, AnthropicMessage, AnthropicMessageDeltaEvent, AnthropicMessageStartEvent, AnthropicRequest (+4 more)

### Community 68 - "eval/runner.test.ts"
Cohesion: 0.27
Nodes (7): complete(), counterOnlyUnresolvedBundle(), et01Bundle(), PET_CLINIC, proposalAJson(), unresolvedAddedBundle(), unresolvedPlusLintDirtyBundle()

### Community 69 - "RequestContextLogger"
Cohesion: 0.13
Nodes (11): fastify, FastifyRequest, setupLogging(), createLogger(), CreateLoggerOptions, defaultContext, getIndexerLogger(), getMcpBridgeLogger() (+3 more)

### Community 70 - "mcp_bridge/package.json"
Cohesion: 0.07
Nodes (27): dependencies, @llm/shared-config, @llm/shared-types, @llm/shared-utils, devDependencies, ts-node, @types/node, typescript (+19 more)

### Community 71 - "orchestrator/package.json"
Cohesion: 0.33
Nodes (5): main, name, private, type, version

### Community 73 - "lifecycle.ts"
Cohesion: 0.10
Nodes (26): applyChangeSet(), ApplyResult, ChangeSet, ChangeSetSchema, formatIssues(), cleanLint, FIXTURES, checkTransition() (+18 more)

### Community 74 - "registerTools.ts"
Cohesion: 0.28
Nodes (7): Logger, main(), TOOL_DEFINITIONS, MCPError, MCPResponse, MCPToolDefinition, DomainExclusionInput

### Community 75 - "errorSanitizer.ts"
Cohesion: 0.19
Nodes (10): createFullErrorDetails(), FullErrorDetails, GENERIC_ERROR_MESSAGES, INTERNAL_ERROR_STATUS_CODES, isProduction(), SanitizedError, sanitizeError(), sanitizeErrorObject() (+2 more)

### Community 77 - "shared-utils/package.json"
Cohesion: 0.22
Nodes (8): dependencies, @llm/shared-config, @llm/shared-config, main, name, private, types, version

### Community 78 - "SpecBundle"
Cohesion: 0.11
Nodes (24): CompileResult, freeze(), FreezeResult, cleanLint, FIXTURES, frozenPetClinic(), inState(), loadBundle() (+16 more)

### Community 80 - "config.ts"
Cohesion: 0.28
Nodes (7): DEFAULT_BEHAVIOR_CONFIG, DEFAULT_PERFORMANCE_CONFIG, DEFAULT_SIGNAL_WEIGHTS, getGlobalConfig(), DiscoveryBehaviorConfig, PerformanceConfig, SignalWeightConfig

### Community 81 - "audit-shared-drift.js"
Cohesion: 0.29
Nodes (10): APPS_DIR, AUDIT_DIR, ensureAuditDir(), formatCandidates(), groupBy(), main(), ROOT, scanFile() (+2 more)

### Community 82 - "check/runner.ts"
Cohesion: 0.11
Nodes (20): parseExpect(), CheckOutcome, DEFAULT_TIMEOUT_MS, Executor, OUTPUT_TAIL_LIMIT, runChecks(), RunChecksOptions, RunChecksResult (+12 more)

### Community 83 - "models/types.ts"
Cohesion: 0.20
Nodes (9): GeminiContent, GeminiErrorResponse, GeminiGenerationConfig, GeminiPart, GeminiRequest, GeminiResponse, ModelResponseMetadata, ExecutionMetadata (+1 more)

### Community 84 - "PipelineStatus"
Cohesion: 0.17
Nodes (11): ExecutionStatus, ERROR, PENDING, RUNNING, SUCCESS, PipelineStatus, CANCELLED, COMPLETED (+3 more)

### Community 85 - "devDependencies"
Cohesion: 0.12
Nodes (17): devDependencies, axios, fast-check, ts-node, @types/node, @types/opossum, @types/uuid, typescript (+9 more)

### Community 86 - "run-all-examples.ts"
Cohesion: 0.46
Nodes (6): exampleHybridCmsDiscovery(), exampleNodejsMicroservicesDiscovery(), examplePhpMonolithDiscovery(), exampleUserExclusionWorkflow(), runAllExamples(), sleep()

### Community 88 - "EmbeddingEngine"
Cohesion: 0.11
Nodes (13): Chunk, DimensionMismatchError, EmbeddingEngine, EmbeddingRequest, EmbeddingResponse, EmbeddingResult, EXPECTED_EMBEDDING_DIMENSION, AVAILABLE_MODELS (+5 more)

### Community 90 - "ModelCallOptions"
Cohesion: 0.13
Nodes (8): GeminiOpenRouterAdapter, OpenAIAdapter, OpenAIErrorResponse, OpenAIMessage, OpenAIRequest, OpenAIResponse, ModelCallOptions, ThinkingConfig

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

### Community 99 - "ZAIAdapter.ts"
Cohesion: 0.18
Nodes (7): CHINESE_ERROR_TRANSLATIONS, translateErrorMessage(), ZAIAdapter, ZAIErrorResponse, ZAIMessage, ZAIRequest, ZAIResponse

### Community 101 - "budget.ts"
Cohesion: 0.10
Nodes (19): BudgetCap, BudgetExceededError, BudgetSpentSnapshot, DEFAULT_WALL_SLACK_MS, MAX_COMPLETIONS, ResolvedRunBudget, resolveRunBudget(), worstCaseAttempts() (+11 more)

### Community 102 - "SpecBundleSchema"
Cohesion: 0.11
Nodes (13): EXPECT_GRAMMAR_DOC, EXPECTED_EXIT_PATTERN, isJudgeableExpect(), ClosureFinding, ClosureFindingCode, closureFindings(), DuplicateTaskId, GOOD (+5 more)

### Community 103 - "mcp_bridge/tsconfig.json"
Cohesion: 0.18
Nodes (10): compilerOptions, outDir, rootDir, exclude, extends, include, dist, node_modules (+2 more)

### Community 104 - "indexer/src/api/IndexController.ts"
Cohesion: 0.12
Nodes (9): ContextRequest, ContextResponse, EnsureIndexedRequest, EnsureIndexedResponse, IndexController, SearchRequest, SearchResponse, StatsResponse (+1 more)

### Community 105 - "shared-types/package.json"
Cohesion: 0.33
Nodes (5): main, name, private, types, version

### Community 106 - "ModelGateway.ts"
Cohesion: 0.14
Nodes (11): ExtendedError, NON_RETRYABLE_ERROR_PATTERNS, NON_RETRYABLE_HTTP_STATUS_CODES, ProviderStatus, REASONING_PROMPT, RETRYABLE_ERROR_PATTERNS, RETRYABLE_HTTP_STATUS_CODES, RetryableErrorResult (+3 more)

### Community 107 - "orchestrator/src/middleware/security.ts"
Cohesion: 0.38
Nodes (4): defaultConfig, SecurityConfig, SecurityUtils, setupSecurity()

### Community 108 - "lint/trace.test.ts"
Cohesion: 0.22
Nodes (7): DecSpec, GOOD, mkBundle(), mkTask(), ReqSpec, TaskSpec, testWith()

### Community 109 - "roleConfigMerger.ts"
Cohesion: 0.12
Nodes (20): ModelInfo, ModelsResponse, ProviderInfo, RoleInfo, RolesResponse, extractProvidersFromConfig(), getValidRoleNames(), inferProviderFromModel() (+12 more)

### Community 110 - "indexer/src/api/openapi.ts"
Cohesion: 0.22
Nodes (4): openApiSpec, openApiSpec, LATEST_STABLE_VERSION, SUPPORTED_VERSIONS

### Community 111 - "ScheduledCleanup.ts"
Cohesion: 0.20
Nodes (7): ActiveRunsCleanupCallback, CLEANUP_DEFAULTS, CLEANUP_INTERVALS, CleanupStats, MemoryStats, PipelineTrace, TraceSpan

### Community 112 - "ShutdownManager.ts"
Cohesion: 0.20
Nodes (9): CloseConnectionCallback, DrainResult, FlushMetricsCallback, HandlerResult, RegisteredHandler, SHUTDOWN_TIMEOUT_MS, ShutdownHandler, ShutdownResult (+1 more)

### Community 116 - "mcp/server.test.ts"
Cohesion: 0.15
Nodes (14): callTool(), expectIdentical(), FIXTURES, freshRoot(), frozenRoot(), injectionRoot(), inlineConforming(), inlineUnresolved() (+6 more)

### Community 117 - "l08.test.ts"
Cohesion: 0.67
Nodes (3): FIXTURES, inState(), loadBundle()

### Community 118 - "discovery.ts"
Cohesion: 0.29
Nodes (6): AnalysisDepth, DiscoveryExecutionMetadata, DiscoveryStatistics, Evidence, ExclusionMetadata, SignalType

### Community 124 - "test-discovery-engine.ts"
Cohesion: 0.53
Nodes (5): mockIndexMetadata, runTests(), testBasicDiscovery(), testDiscoveryWithExclusions(), testEmptyIndexMetadata()

### Community 126 - ".discover"
Cohesion: 0.21
Nodes (13): DomainDiscoveryEngine, testAllDomainsExcluded(), testExampleStructure(), assert(), assertEquals(), runAllTests(), testFallbackOnMaxRetries(), testFallbackOnValidationFailure() (+5 more)

### Community 127 - "write-spec.test.ts"
Cohesion: 0.40
Nodes (3): PET_CLINIC, SECTION_FILES, tmpDirs

### Community 142 - "shared-utils/src/index.ts"
Cohesion: 0.24
Nodes (8): domainIdValidator, DOMAIN_ID_PATTERN, DomainExclusionValidationResult, isValidDomainId(), isValidJustification(), RetryOptions, validateDomainExclusion(), withTimeout()

### Community 186 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, dev, start, test, test:watch

## Knowledge Gaps
- **698 isolated node(s):** `PET_CLINIC`, `SESSION_SERVICE`, `SECTION_FILES`, `tmpDirs`, `FAKE_ENV` (+693 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **29 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ModelGateway` connect `ModelGateway` to `orchestrator/src/server.ts`, `ChatMessage`, `IndexClient`, `ConfigController`, `Aggregator`, `ModelGateway.ts`, `roleConfigMerger.ts`, `PipelineEngine`, `ModelCallOptions`, `PipelineEngine.ts`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Why does `PipelineEngine` connect `PipelineEngine` to `orchestrator/src/server.ts`, `IndexClient`, `Aggregator`, `PipelineExecutionState`, `ModelGateway`, `shared-config/src/index.ts`, `discovery/index.ts`, `PipelineController.ts`, `PipelineEngine.ts`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Why does `IndexController` connect `indexer/src/api/IndexController.ts` to `IncrementalTracker`, `FileMetadata`, `IndexerServer`, `indexer/src/main.ts`, `VectorIndex`, `Chunker`, `indexer/src/server.ts`, `EmbeddingEngine`, `Scanner`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **What connects `PET_CLINIC`, `SESSION_SERVICE`, `SECTION_FILES` to the rest of the system?**
  _698 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Domain` be split into smaller, more focused modules?**
  _Cohesion score 0.14260249554367202 - nodes in this community are weakly interconnected._
- **Should `common.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07617051013277429 - nodes in this community are weakly interconnected._
- **Should `lintBundle` be split into smaller, more focused modules?**
  _Cohesion score 0.09851551956815115 - nodes in this community are weakly interconnected._