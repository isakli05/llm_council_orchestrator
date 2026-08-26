# Graph Report - llm_council_orchestrator  (2026-08-27)

## Corpus Check
- 336 files · ~239,719 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2564 nodes · 5421 edges · 130 communities (102 shown, 28 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 103 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8d5e587c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Domain
- schemas/index.ts
- lintBundle
- configLoader.ts
- ModelCallOptions
- Aggregator
- plan.ts
- PipelineExecutionState
- engine.ts
- ModelGateway
- cli/index.ts
- revision.ts
- VectorStorage
- validators.ts
- LRUCache
- mcp/server.ts
- ShutdownManager
- PipelineEngine
- eval/report.ts
- VectorIndex
- CircuitBreakerManager
- dependencies
- indexer/src/server.ts
- MetricsRegistry
- DomainClassifier
- test-fallback.ts
- DiscoveryMetricsCollector
- RoleManager
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
- consent.ts
- OrchestratorAdapter.ts
- formatJson
- cache.ts
- shared-types/src/index.ts
- run-eval.test.ts
- score.test.ts
- PipelineState
- spec-core/package.json
- IndexController
- test-enterprise-features.ts
- plan.test.ts
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
- SpecBundle
- eval/runner.test.ts
- dependencies
- dependencies
- IncrementalTracker
- ModelResponse
- AnthropicAdapter.ts
- StatsCollector
- RequestContextLogger
- mcp_bridge/package.json
- orchestrator/package.json
- LRUCache
- lifecycle.ts
- registerTools.ts
- errorSanitizer.ts
- @fastify/rate-limit
- shared-utils/package.json
- compiler/freeze.ts
- DiscoveryConfigManager
- config.ts
- audit-shared-drift.js
- check.ts
- ChatMessage
- PipelineStatus
- devDependencies
- run-all-examples.ts
- Logger
- EmbeddingEngine
- Scanner
- OpenAIAdapter
- CacheManager
- make-bins-executable.js
- orchestrator/tsconfig.json
- shared-config/package.json
- shared-observability/tsconfig.json
- compilerOptions
- packed-install-smoke.sh
- indexer/tsconfig.json
- ZAIAdapter.ts
- ConfigController.ts
- budget.ts
- SpecBundleSchema
- mcp_bridge/tsconfig.json
- indexer/src/api/IndexController.ts
- shared-types/package.json
- ModelGateway.ts
- orchestrator/src/middleware/security.ts
- orchestrator/src/api/IndexController.ts
- roleConfigMerger.ts
- @llm/shared-config
- InvalidFilePathError
- PathTraversalError
- verify-observability.sh
- test-api.sh
- mcp/server.test.ts
- l08.test.ts
- verify-hardening.sh
- SqlInjectionError
- .discover
- containsPathTraversal
- AnthropicAdapter
- validators.test.ts
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
- `LogEntry` --inherits--> `LogEntry`  [EXTRACTED]
  apps/orchestrator/src/observability/Logger.ts → packages/shared-utils/src/logger/BaseLogger.ts
- `ProviderAvailabilityResult` --references--> `ApiError`  [EXTRACTED]
  apps/orchestrator/src/pipeline/roleConfigMerger.ts → packages/shared-types/src/errors.ts
- `example()` --calls--> `formatJson()`  [EXTRACTED]
  apps/indexer/example.ts → packages/shared-utils/src/index.ts
- `IndexerConfig` --references--> `LogLevel`  [EXTRACTED]
  apps/indexer/src/main.ts → packages/shared-config/src/index.ts

## Import Cycles
- 3-file cycle: `packages/shared-utils/src/index.ts -> packages/shared-utils/src/logger/index.ts -> packages/shared-utils/src/logger/ConsoleLogger.ts -> packages/shared-utils/src/index.ts`

## Communities (130 total, 28 thin omitted)

### Community 0 - "Domain"
Cohesion: 0.14
Nodes (20): DomainSpecWriter, pathExists(), SpecWriterConfig, SpecWriteResult, mockDeepDomain, mockDomainWithSpecialChars, mockDomainWithSubDomains, mockExcludedDomain (+12 more)

### Community 1 - "schemas/index.ts"
Cohesion: 0.08
Nodes (35): AssumptionIdSchema, ComplexityProfileSchema, ContractIdSchema, DecisionIdSchema, EvidenceIdSchema, IdSchema, ImpactLevelSchema, RequirementIdSchema (+27 more)

### Community 2 - "lintBundle"
Cohesion: 0.06
Nodes (40): applyUnderLock(), ChangeResult, cmdChange(), findingLine(), FIXTURES, frozenSpecRoot(), inlineBundle(), makeSpecRoot() (+32 more)

### Community 3 - "configLoader.ts"
Cohesion: 0.05
Nodes (49): OrchestratorCore, runOrchestratorPipeline(), ApiKeyValidationResult, applyEnvironmentOverrides(), ArchitectConfigSchema, ConfigLoaderOptions, ConfigValidationResult, DefaultsConfigSchema (+41 more)

### Community 4 - "ModelCallOptions"
Cohesion: 0.09
Nodes (14): AnthropicOpenRouterAdapter, AnthropicOpenRouterRequest, GeminiOpenRouterAdapter, GeminiOpenRouterRequest, OpenAIOpenRouterAdapter, OpenAIOpenRouterRequest, OpenRouterErrorResponse, OpenRouterMessage (+6 more)

### Community 5 - "Aggregator"
Cohesion: 0.22
Nodes (5): Aggregator, buildSynthesisUserPrompt(), AggregationOutput, ContributionsByRole, ModelContribution

### Community 6 - "plan.ts"
Cohesion: 0.13
Nodes (17): cmdPlan(), PlanOptions, PlanResult, PlanTask, renderHuman(), renderJson(), TopoResult, topoSort() (+9 more)

### Community 7 - "PipelineExecutionState"
Cohesion: 0.07
Nodes (22): getNextStepState(), getValidTransitions(), InvalidStateTransitionError, isActiveState(), isTerminalState(), isValidTransition(), PipelineExecutionStateMachine, StateChangeEvent (+14 more)

### Community 8 - "engine.ts"
Cohesion: 0.13
Nodes (20): BAD, BadFixtureExpectation, LintRule, RULES, rule, rule, rule, rule (+12 more)

### Community 9 - "ModelGateway"
Cohesion: 0.08
Nodes (13): ModelGateway, ProviderConfig, ArchitectConfig, ProviderType, ANTHROPIC, ANTHROPIC_OPENROUTER, GEMINI, GEMINI_OPENROUTER (+5 more)

### Community 10 - "cli/index.ts"
Cohesion: 0.13
Nodes (24): cmdGenerate(), DEFAULT_GENERATE_VARIANT, GenerateOptions, GenerateResult, lintReason(), lintRejections(), MAX_INTENT_CHARS, normalizeIntent() (+16 more)

### Community 11 - "revision.ts"
Cohesion: 0.06
Nodes (39): parseExpect(), CheckOutcome, DEFAULT_TIMEOUT_MS, OUTPUT_TAIL_LIMIT, runChecks(), RunChecksOptions, RunChecksResult, tail() (+31 more)

### Community 12 - "VectorStorage"
Cohesion: 0.17
Nodes (4): IndexMetadata, VectorStorage, VectorStorageError, safeJsonParse()

### Community 13 - "validators.ts"
Cohesion: 0.08
Nodes (30): containsSqlInjection(), EnsureIndexedResponseSchema, ErrorResponseSchema, escapeRegexChars(), extractInvalidRoleName(), IndexStatusResponseSchema, isInvalidRoleError(), justificationValidator (+22 more)

### Community 15 - "mcp/server.ts"
Cohesion: 0.12
Nodes (22): DEFAULT_GENERATE_PROFILE, ExecBoundary, generateOptInFromEnv(), GenerateProfile, GenerateVariant, ARG_SPECS, ArgName, ArgValidator (+14 more)

### Community 17 - "PipelineEngine"
Cohesion: 0.16
Nodes (3): PipelineEngine, PipelineContext, PipelineStepResult

### Community 18 - "eval/report.ts"
Cohesion: 0.10
Nodes (35): BAD, BadFixtureCapture, BadFixtureExpectation, buildMockScripts(), calcs(), captureBadFixtures(), deriveBundle(), EvalEvidence (+27 more)

### Community 20 - "CircuitBreakerManager"
Cohesion: 0.07
Nodes (14): CircuitBreakerConfig, CircuitBreakerManager, CircuitBreakerStats, defaultConfig, providerConfigs, ProviderName, DegradationLevel, DEGRADED (+6 more)

### Community 21 - "dependencies"
Cohesion: 0.05
Nodes (39): @opentelemetry/exporter-metrics-otlp-grpc, @opentelemetry/exporter-trace-otlp-grpc, @opentelemetry/resources, @opentelemetry/sdk-metrics, @opentelemetry/sdk-node, @opentelemetry/sdk-trace-base, @opentelemetry/semantic-conventions, dependencies (+31 more)

### Community 22 - "indexer/src/server.ts"
Cohesion: 0.08
Nodes (26): ApiError, ApiErrorResponse, containsPathTraversal(), containsSqlInjection(), ContextApiResponse, ContextRequest, ContextRequestSchema, DEFAULT_CONFIG (+18 more)

### Community 24 - "DomainClassifier"
Cohesion: 0.13
Nodes (9): DomainClassifier, SignalExtractor, AnalysisDepth, DiscoveryExecutionMetadata, DiscoveryStatistics, Evidence, ExclusionMetadata, Signal (+1 more)

### Community 25 - "test-fallback.ts"
Cohesion: 0.58
Nodes (8): assert(), assertEquals(), runAllTests(), testFallbackOnMaxRetries(), testFallbackOnValidationFailure(), testRetryWithSuccess(), testSuccessfulDiscovery(), testZeroDomainsHandling()

### Community 26 - "DiscoveryMetricsCollector"
Cohesion: 0.12
Nodes (10): DiscoveryMetricsCollector, getGlobalMetricsRegistry(), MetricsRegistry, resetGlobalMetricsRegistry(), DiscoveryMetrics, DiscoveryTimingMetrics, DomainQualityMetrics, ReliabilityMetrics (+2 more)

### Community 27 - "RoleManager"
Cohesion: 0.17
Nodes (9): RoleManager, RoleProviderConfig, RoleRequest, RoleType, AGGREGATOR, ARCHITECT, LEGACY_ANALYSIS, MIGRATION (+1 more)

### Community 28 - "PipelineEngine.ts"
Cohesion: 0.09
Nodes (25): PipelineOptions, PipelineTrace, TraceSpan, ContextValidationError, DEEP_DOMAIN_ANALYSIS_ROLES, DEFAULT_ROLE_CONFIG, FULL_MODE_ANALYSIS_ROLES, QUICK_MODE_ANALYSIS_ROLES (+17 more)

### Community 29 - "commands/trace.test.ts"
Cohesion: 0.10
Nodes (16): cmdTrace(), renderTrace(), compiledBundle(), FIXTURES, SECTION_FILES, tmpDirs, TraceResult, buildTrace() (+8 more)

### Community 30 - "ScheduledCleanupManager"
Cohesion: 0.16
Nodes (7): getGlobalCacheManager(), ActiveRunsCleanupCallback, CLEANUP_DEFAULTS, CLEANUP_INTERVALS, CleanupStats, MemoryStats, ScheduledCleanupManager

### Community 31 - "LogLevel"
Cohesion: 0.12
Nodes (13): IndexerConfig, LogEntry, Logger, main(), ServerConfig, LogLevel, DEBUG, ERROR (+5 more)

### Community 32 - "orchestrator/src/server.ts"
Cohesion: 0.08
Nodes (17): PipelineController, StoredRunEntry, ProgressController, SpecController, DomainExclusion, RoleConfigsInput, RunPipelineRequest, RunPipelineRequestSchema (+9 more)

### Community 33 - "eval/runner.ts"
Cohesion: 0.13
Nodes (24): BudgetLedger, LlmUsage, CLASSIFY_RULES, classifyAndProposeSingle(), classifySingle(), intentBlock(), JSON_ONLY, judgeMerge() (+16 more)

### Community 34 - "FileMetadata"
Cohesion: 0.11
Nodes (11): FRAMEWORK_PATTERNS, MetadataAnalyzer, ProjectMetadata, ChangeDetectionResult, FileHash, IncrementalTrackerError, Logger, FileMetadata (+3 more)

### Community 35 - "IndexClient"
Cohesion: 0.08
Nodes (29): IndexController, EnsureIndexedRequest, ContextBuilder, ContextBuilderOptions, createContextBuilder(), FormattedContext, RoleType, calculateBackoffDelay() (+21 more)

### Community 36 - "versionNegotiation.ts"
Cohesion: 0.10
Nodes (26): openApiSpec, openApiSpec, RFC-8594, ApiVersion, clearDeprecatedEndpoints(), createUnsupportedVersionResponse(), DEPRECATED_ENDPOINTS, DeprecatedEndpointConfig (+18 more)

### Community 37 - "IndexerServer"
Cohesion: 0.13
Nodes (4): generateCorrelationId(), IndexerServer, main(), createFullErrorDetails()

### Community 38 - "consent.ts"
Cohesion: 0.12
Nodes (26): authorizeExecution(), checkPreviewDigest(), consentDigestLine(), EXEC_OPT_IN_ENV, EXEC_ROOT_ENV, ExecAuthorization, execOptInFromEnv(), execRootFromEnv() (+18 more)

### Community 39 - "OrchestratorAdapter.ts"
Cohesion: 0.19
Nodes (7): OrchestratorAdapter, DomainExclusion, IndexStateResponse, OrchestratorRunRequest, OrchestratorRunResponse, PipelineProgressResponse, SpecFilesResponse

### Community 40 - "formatJson"
Cohesion: 0.45
Nodes (3): ToolRegistry, MCPToolResult, formatJson()

### Community 41 - "cache.ts"
Cohesion: 0.12
Nodes (4): CacheEntry, DependencyMappingCache, PatternMatchCache, CacheStatistics

### Community 42 - "shared-types/src/index.ts"
Cohesion: 0.17
Nodes (15): AGGREGATOR_SYSTEM_PROMPT, createFallbackSections(), formatRoleContributions(), formatRoleTitle(), getExpectedSectionIds(), getExpectedSectionTitles(), validateSynthesisResponse(), AggregationInput (+7 more)

### Community 43 - "run-eval.test.ts"
Cohesion: 0.26
Nodes (8): DEFAULT_REPORT_PATH, LIVE_ENV_VARS, missingLiveEnv(), parseArgs(), ParsedArgs, runEvalCli(), FAKE_LIVE_ENV, mockRunEvalAll

### Community 45 - "PipelineState"
Cohesion: 0.16
Nodes (14): StateMachine, StateContext, StateTransition, PipelineState, ABORTED, AGGREGATE, ANALYZE, COMPLETED (+6 more)

### Community 46 - "spec-core/package.json"
Cohesion: 0.05
Nodes (37): bin, lco, lco-mcp, dependencies, zod, description, devDependencies, @types/node (+29 more)

### Community 47 - "IndexController"
Cohesion: 0.16
Nodes (4): example(), IndexController, Indexer, main()

### Community 48 - "test-enterprise-features.ts"
Cohesion: 0.30
Nodes (14): initializeGlobalCacheManager(), resetGlobalCacheManager(), initializeGlobalConfig(), resetGlobalConfig(), assert(), assertEquals(), runAllTests(), sleep() (+6 more)

### Community 49 - "plan.test.ts"
Cohesion: 0.17
Nodes (4): compiledBundle(), FIXTURES, SECTION_FILES, tmpDirs

### Community 50 - "test-utils.ts"
Cohesion: 0.14
Nodes (16): apiKeyArb, chatMessageArb, chatMessagesArb, DEFAULT_NUM_RUNS, domainIdArb, fcConfig, httpStatusArb, modelCallOptionsArb (+8 more)

### Community 51 - "scripts"
Cohesion: 0.06
Nodes (35): devDependencies, axios, fast-check, tsx, @types/node, typescript, vite-tsconfig-paths, vitest (+27 more)

### Community 52 - "generate.test.ts"
Cohesion: 0.11
Nodes (11): complete(), FAKE_ENV, fetchSpy(), jsonResponse(), PET_CLINIC, SECTION_FILES, SESSION_SERVICE, tmpDirs (+3 more)

### Community 56 - "init.ts"
Cohesion: 0.09
Nodes (20): FIXTURES, freshRoot(), initRoot(), makeSpecRoot(), SECTION_FILES, tmpDirs, buildSections(), cmdInit() (+12 more)

### Community 58 - "discovery/index.ts"
Cohesion: 0.24
Nodes (9): DOMAIN_MAPPINGS, IMPORTANT: Confidence does NOT affect analysisDepth, SIGNAL_WEIGHTS, DependencyInfo, DirectoryNode, DomainContext, IndexMetadata, createMockIndexMetadata() (+1 more)

### Community 59 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, declaration, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck (+6 more)

### Community 60 - "HealthController.ts"
Cohesion: 0.10
Nodes (14): HealthCheckResult, HealthController, NOTE: Qdrant is optional and not in the critical data path, setupMetrics(), trackLlmCall(), trackPipelineRun(), trackPipelineStep(), fastify (+6 more)

### Community 61 - "SpecBundle"
Cohesion: 0.05
Nodes (21): ApplyResult, ChangeSet, ChangeSetSchema, cleanLint, FIXTURES, ClosureFinding, ClosureFindingCode, closureFindings() (+13 more)

### Community 62 - "eval/runner.test.ts"
Cohesion: 0.15
Nodes (15): LlmAdapter, LlmCompleteOptions, LlmResponse, createMockLlm(), MockScript, SCRIPT, MockEvalScripts, complete() (+7 more)

### Community 63 - "dependencies"
Cohesion: 0.04
Nodes (44): dependencies, axios, fastify, @fastify/cors, @fastify/helmet, @fastify/rate-limit, @llm/shared-config, @llm/shared-observability (+36 more)

### Community 64 - "dependencies"
Cohesion: 0.12
Nodes (17): dependencies, fastify, @fastify/cors, @fastify/helmet, @llm/shared-observability, @llm/shared-types, @llm/shared-utils, uuid (+9 more)

### Community 67 - "AnthropicAdapter.ts"
Cohesion: 0.15
Nodes (12): AnthropicContentBlockDeltaEvent, AnthropicContentBlockStartEvent, AnthropicErrorEvent, AnthropicErrorResponse, AnthropicMessage, AnthropicMessageDeltaEvent, AnthropicMessageStartEvent, AnthropicRequest (+4 more)

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
Cohesion: 0.13
Nodes (21): applyChangeSet(), formatIssues(), checkTransition(), FREEZE_REFUSAL_HINTS, LIFECYCLE_STATES, LIFECYCLE_TRANSITIONS, LifecycleFinding, LifecycleFindingCode (+13 more)

### Community 74 - "registerTools.ts"
Cohesion: 0.29
Nodes (7): TOOL_DEFINITIONS, MCPError, MCPRequest, MCPResponse, MCPToolDefinition, DomainExclusionInput, validateDomainExclusion()

### Community 75 - "errorSanitizer.ts"
Cohesion: 0.20
Nodes (9): FullErrorDetails, GENERIC_ERROR_MESSAGES, INTERNAL_ERROR_STATUS_CODES, isProduction(), SanitizedError, sanitizeError(), sanitizeErrorObject(), SanitizeErrorOptions (+1 more)

### Community 77 - "shared-utils/package.json"
Cohesion: 0.22
Nodes (8): dependencies, @llm/shared-config, @llm/shared-config, main, name, private, types, version

### Community 78 - "compiler/freeze.ts"
Cohesion: 0.07
Nodes (25): FIXTURES, SECTION_FILES, tmpDirs, freeze(), FreezeResult, cleanLint, FIXTURES, frozenPetClinic() (+17 more)

### Community 80 - "config.ts"
Cohesion: 0.28
Nodes (7): DEFAULT_BEHAVIOR_CONFIG, DEFAULT_PERFORMANCE_CONFIG, DEFAULT_SIGNAL_WEIGHTS, getGlobalConfig(), DiscoveryBehaviorConfig, PerformanceConfig, SignalWeightConfig

### Community 81 - "audit-shared-drift.js"
Cohesion: 0.29
Nodes (10): APPS_DIR, AUDIT_DIR, ensureAuditDir(), formatCandidates(), groupBy(), main(), ROOT, scanFile() (+2 more)

### Community 82 - "check.ts"
Cohesion: 0.43
Nodes (6): Executor, CheckOptions, CheckResult, cmdCheck(), expectedActual(), renderReport()

### Community 83 - "ChatMessage"
Cohesion: 0.12
Nodes (16): GeminiContent, GeminiErrorResponse, GeminiGenerationConfig, GeminiPart, GeminiRequest, GeminiResponse, OpenAIErrorResponse, OpenAIMessage (+8 more)

### Community 84 - "PipelineStatus"
Cohesion: 0.17
Nodes (11): ExecutionStatus, ERROR, PENDING, RUNNING, SUCCESS, PipelineStatus, CANCELLED, COMPLETED (+3 more)

### Community 85 - "devDependencies"
Cohesion: 0.12
Nodes (17): devDependencies, axios, fast-check, ts-node, @types/node, @types/opossum, @types/uuid, typescript (+9 more)

### Community 86 - "run-all-examples.ts"
Cohesion: 0.46
Nodes (6): exampleHybridCmsDiscovery(), exampleNodejsMicroservicesDiscovery(), examplePhpMonolithDiscovery(), exampleUserExclusionWorkflow(), runAllExamples(), sleep()

### Community 87 - "Logger"
Cohesion: 0.13
Nodes (11): LogEntry, Logger, CloseConnectionCallback, DrainResult, FlushMetricsCallback, HandlerResult, RegisteredHandler, SHUTDOWN_TIMEOUT_MS (+3 more)

### Community 88 - "EmbeddingEngine"
Cohesion: 0.14
Nodes (7): EmbeddingEngine, AVAILABLE_MODELS, DEFAULT_EMBEDDING_MODEL, detectDevice(), getEmbeddingModelFromEnv(), getModelConfig(), ModelConfig

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

### Community 100 - "ConfigController.ts"
Cohesion: 0.18
Nodes (7): ConfigController, ModelInfo, ModelsResponse, ProviderInfo, RoleInfo, RolesResponse, ModelConfig

### Community 101 - "budget.ts"
Cohesion: 0.10
Nodes (20): BudgetCap, BudgetExceededError, BudgetSpentSnapshot, createBudgetLedger(), DEFAULT_WALL_SLACK_MS, MAX_COMPLETIONS, ResolvedRunBudget, resolveRunBudget() (+12 more)

### Community 102 - "SpecBundleSchema"
Cohesion: 0.18
Nodes (8): EXPECT_GRAMMAR_DOC, EXPECTED_EXIT_PATTERN, isJudgeableExpect(), GOOD, rule, SpecBundleForExport, GENERATED_PATH, SpecBundleSchema

### Community 103 - "mcp_bridge/tsconfig.json"
Cohesion: 0.18
Nodes (10): compilerOptions, outDir, rootDir, exclude, extends, include, dist, node_modules (+2 more)

### Community 104 - "indexer/src/api/IndexController.ts"
Cohesion: 0.14
Nodes (17): ContextRequest, ContextResponse, EnsureIndexedRequest, EnsureIndexedResponse, SearchRequest, SearchResponse, StatsResponse, Chunk (+9 more)

### Community 105 - "shared-types/package.json"
Cohesion: 0.33
Nodes (5): main, name, private, types, version

### Community 106 - "ModelGateway.ts"
Cohesion: 0.16
Nodes (13): ExtendedError, NON_RETRYABLE_ERROR_PATTERNS, NON_RETRYABLE_HTTP_STATUS_CODES, ProviderStatus, REASONING_PROMPT, RETRYABLE_ERROR_PATTERNS, RETRYABLE_HTTP_STATUS_CODES, RetryableErrorResult (+5 more)

### Community 107 - "orchestrator/src/middleware/security.ts"
Cohesion: 0.38
Nodes (4): defaultConfig, SecurityConfig, SecurityUtils, setupSecurity()

### Community 108 - "orchestrator/src/api/IndexController.ts"
Cohesion: 0.33
Nodes (3): EnsureIndexedRequestSchema, IndexStatusQuery, IndexStatusQuerySchema

### Community 109 - "roleConfigMerger.ts"
Cohesion: 0.17
Nodes (14): extractProvidersFromConfig(), getValidRoleNames(), inferProviderFromModel(), isValidRoleName(), mergeRoleConfigs(), MODEL_PREFIX_TO_PROVIDER, modelConfigToProviderConfig(), normalizeToProviderConfigs() (+6 more)

### Community 116 - "mcp/server.test.ts"
Cohesion: 0.14
Nodes (15): generateConsentDigest(), callTool(), expectIdentical(), FIXTURES, freshRoot(), frozenRoot(), injectionRoot(), inlineConforming() (+7 more)

### Community 117 - "l08.test.ts"
Cohesion: 0.67
Nodes (3): FIXTURES, inState(), loadBundle()

### Community 126 - ".discover"
Cohesion: 0.17
Nodes (12): DomainDiscoveryEngine, examplePipelineFlow(), executeSpecifyStep(), testAllDomainsExcluded(), mockIndexMetadata, runTests(), testBasicDiscovery(), testDiscoveryWithExclusions() (+4 more)

### Community 127 - "containsPathTraversal"
Cohesion: 0.50
Nodes (5): containsPathTraversal(), isValidFilePath(), safePathValidator, sanitizePath(), validateAndSanitizeFilePath()

### Community 142 - "validators.test.ts"
Cohesion: 0.13
Nodes (12): DomainExclusionSchema, domainIdValidator, InvalidRoleError, RoleConfigsSchema, validateDomainExclusion(), ValidationError, invalidDomainIdArb, invalidJustificationArb (+4 more)

### Community 186 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, dev, start, test, test:watch

## Knowledge Gaps
- **697 isolated node(s):** `name`, `version`, `private`, `main`, `type` (+692 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **28 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ModelGateway` connect `ModelGateway` to `orchestrator/src/server.ts`, `IndexClient`, `ConfigController.ts`, `Aggregator`, `ModelCallOptions`, `shared-types/src/index.ts`, `ModelGateway.ts`, `PipelineEngine`, `ChatMessage`, `RoleManager`, `PipelineEngine.ts`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Why does `Logger` connect `Logger` to `orchestrator/src/server.ts`, `Domain`, `PipelineExecutionState`, `ModelGateway.ts`, `orchestrator/src/api/IndexController.ts`, `discovery/index.ts`, `PipelineEngine.ts`, `ScheduledCleanupManager`, `LogLevel`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Why does `PipelineEngine` connect `PipelineEngine` to `orchestrator/src/server.ts`, `IndexClient`, `configLoader.ts`, `Aggregator`, `PipelineExecutionState`, `ModelGateway`, `shared-types/src/index.ts`, `RoleManager`, `PipelineEngine.ts`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _697 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Domain` be split into smaller, more focused modules?**
  _Cohesion score 0.14260249554367202 - nodes in this community are weakly interconnected._
- **Should `schemas/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07796610169491526 - nodes in this community are weakly interconnected._
- **Should `lintBundle` be split into smaller, more focused modules?**
  _Cohesion score 0.060109289617486336 - nodes in this community are weakly interconnected._