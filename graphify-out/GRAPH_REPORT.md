# Graph Report - llm_council_orchestrator  (2026-08-27)

## Corpus Check
- 348 files · ~264,281 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2668 nodes · 5656 edges · 136 communities (110 shown, 26 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 104 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `52e5a85d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Domain
- common.ts
- compiler/freeze.ts
- configLoader.ts
- ThinkingConfig
- PipelineEngine.ts
- lifecycle.ts
- PipelineExecutionState
- engine.ts
- ModelGateway
- cli/index.ts
- Aggregator
- VectorStorage
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
- schemas/index.ts
- EmbeddingEngine
- EmbeddingEngine.ts
- discovery/index.ts
- orchestrator/src/server.ts
- Trace
- SpecBundleSchema
- ScheduledCleanupManager
- DiscoveryMetricsCollector
- validators.test.ts
- eval/runner.ts
- FileMetadata
- IndexClient
- versionNegotiation.ts
- IndexerServer
- mcp/server.ts
- OrchestratorAdapter.ts
- formatJson
- cache.ts
- init.ts
- indexer/src/api/openapi.ts
- intent-fidelity.test.ts
- PipelineState
- spec-core/package.json
- LogLevel
- test-enterprise-features.ts
- OpenAIAdapter
- test-utils.ts
- devDependencies
- generate.test.ts
- errorSanitizer.ts
- Chunker
- GeminiAdapter.ts
- GracefulDegradationManager
- MCPServer
- orchestrator/src/middleware/security.ts
- compilerOptions
- HealthController.ts
- compileSpecDir
- commands/trace.test.ts
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
- registerTools.ts
- stdio.ts
- @fastify/rate-limit
- shared-utils/package.json
- revision.ts
- DiscoveryConfigManager
- discovery/types.ts
- audit-shared-drift.js
- check/runner.ts
- indexer/src/api/IndexController.ts
- PipelineStatus
- devDependencies
- SpecBundle
- Logger
- lint/trace.test.ts
- Scanner
- StatsCollector
- CacheManager
- make-bins-executable.js
- orchestrator/tsconfig.json
- shared-config/package.json
- shared-observability/tsconfig.json
- compilerOptions
- packed-install-smoke.sh
- indexer/tsconfig.json
- ModelCallOptions
- check.test.ts
- budget.ts
- BaseLogger
- mcp_bridge/tsconfig.json
- adapter.ts
- shared-types/package.json
- closure.ts
- PipelineController.ts
- containsPathTraversal
- roleConfigMerger.ts
- BudgetLedger
- run-eval.test.ts
- config.ts
- middleware/tracing.ts
- verify-observability.sh
- test-api.sh
- mcp/server.test.ts
- ExecutionStatus
- test-fallback.ts
- verify-hardening.sh
- plan.test.ts
- Logger
- l08.test.ts
- fastify
- readiness.ts
- InvalidFilePathError
- PathTraversalError
- SqlInjectionError
- AnthropicAdapter
- scripts
- @opentelemetry/api
- opossum

## God Nodes (most connected - your core abstractions)
1. `PipelineEngine` - 60 edges
2. `SpecBundle` - 60 edges
3. `ModelGateway` - 55 edges
4. `ModelCallOptions` - 45 edges
5. `lintBundle()` - 36 edges
6. `compileSpecDir()` - 34 edges
7. `PipelineContext` - 30 edges
8. `ChatMessage` - 29 edges
9. `IndexClient` - 28 edges
10. `LogLevel` - 27 edges

## Surprising Connections (you probably didn't know these)
- `ProviderAvailabilityResult` --references--> `ApiError`  [EXTRACTED]
  apps/orchestrator/src/pipeline/roleConfigMerger.ts → packages/shared-types/src/errors.ts
- `LogEntry` --inherits--> `LogEntry`  [EXTRACTED]
  apps/indexer/src/observability/Logger.ts → packages/shared-utils/src/logger/BaseLogger.ts
- `LogEntry` --inherits--> `LogEntry`  [EXTRACTED]
  apps/orchestrator/src/observability/Logger.ts → packages/shared-utils/src/logger/BaseLogger.ts
- `Logger` --inherits--> `BaseLogger`  [EXTRACTED]
  apps/indexer/src/observability/Logger.ts → packages/shared-utils/src/logger/BaseLogger.ts
- `Logger` --inherits--> `BaseLogger`  [EXTRACTED]
  apps/mcp_bridge/src/observability/Logger.ts → packages/shared-utils/src/logger/BaseLogger.ts

## Import Cycles
- 3-file cycle: `packages/shared-utils/src/index.ts -> packages/shared-utils/src/logger/index.ts -> packages/shared-utils/src/logger/ConsoleLogger.ts -> packages/shared-utils/src/index.ts`

## Communities (136 total, 26 thin omitted)

### Community 0 - "Domain"
Cohesion: 0.07
Nodes (32): DOMAIN_MAPPINGS, DomainClassifier, IMPORTANT: Confidence does NOT affect analysisDepth, DomainSpecWriter, pathExists(), SIGNAL_WEIGHTS, SignalExtractor, mockDeepDomain (+24 more)

### Community 1 - "common.ts"
Cohesion: 0.14
Nodes (18): AssumptionIdSchema, ComplexityProfileSchema, ContractIdSchema, DecisionIdSchema, IdSchema, ImpactLevelSchema, RequirementIdSchema, Sha256Schema (+10 more)

### Community 2 - "compiler/freeze.ts"
Cohesion: 0.06
Nodes (27): FIXTURES, SECTION_FILES, tmpDirs, cmdVerify(), VerifyResult, cleanLint, FIXTURES, FreezeResult (+19 more)

### Community 3 - "configLoader.ts"
Cohesion: 0.07
Nodes (41): applyEnvironmentOverrides(), ArchitectConfigSchema, ConfigLoaderOptions, DefaultsConfigSchema, EmbeddingConfigSchema, EmbeddingModelConfigSchema, ENV_VAR_MAPPINGS, findConfigPath() (+33 more)

### Community 4 - "ThinkingConfig"
Cohesion: 0.08
Nodes (13): AnthropicOpenRouterAdapter, AnthropicOpenRouterRequest, GeminiOpenRouterAdapter, GeminiOpenRouterRequest, OpenAIOpenRouterRequest, OpenRouterAdapter, OpenRouterErrorResponse, OpenRouterMessage (+5 more)

### Community 5 - "PipelineEngine.ts"
Cohesion: 0.08
Nodes (31): AggregationInput, AggregationResult, OrchestratorCore, PipelineOptions, runOrchestratorPipeline(), ContextValidationError, DEEP_DOMAIN_ANALYSIS_ROLES, DEFAULT_ROLE_CONFIG (+23 more)

### Community 6 - "lifecycle.ts"
Cohesion: 0.12
Nodes (24): applyChangeSet(), ApplyResult, ChangeSetSchema, formatIssues(), checkTransition(), FREEZE_REFUSAL_HINTS, LIFECYCLE_STATES, LIFECYCLE_TRANSITIONS (+16 more)

### Community 7 - "PipelineExecutionState"
Cohesion: 0.07
Nodes (22): getNextStepState(), getValidTransitions(), InvalidStateTransitionError, isActiveState(), isTerminalState(), isValidTransition(), PipelineExecutionStateMachine, StateChangeEvent (+14 more)

### Community 8 - "engine.ts"
Cohesion: 0.15
Nodes (18): LintRule, RULES, rule, rule, rule, rule, rule, rule (+10 more)

### Community 9 - "ModelGateway"
Cohesion: 0.06
Nodes (28): ExtendedError, ModelGateway, NON_RETRYABLE_ERROR_PATTERNS, NON_RETRYABLE_HTTP_STATUS_CODES, ProviderStatus, REASONING_PROMPT, RETRYABLE_ERROR_PATTERNS, RETRYABLE_HTTP_STATUS_CODES (+20 more)

### Community 10 - "cli/index.ts"
Cohesion: 0.10
Nodes (34): cmdCompile(), compileFailedOutput(), CompileResult, checkIntent(), cmdGenerate(), DEFAULT_GENERATE_PROFILE, DEFAULT_GENERATE_VARIANT, GenerateOptions (+26 more)

### Community 11 - "Aggregator"
Cohesion: 0.13
Nodes (13): Aggregator, AGGREGATOR_SYSTEM_PROMPT, buildSynthesisUserPrompt(), createFallbackSections(), formatRoleContributions(), formatRoleTitle(), getExpectedSectionIds(), getExpectedSectionTitles() (+5 more)

### Community 13 - "validators.ts"
Cohesion: 0.06
Nodes (36): containsSqlInjection(), domainIdValidator, EnsureIndexedRequestSchema, EnsureIndexedResponseSchema, ErrorResponseSchema, escapeRegexChars(), extractInvalidRoleName(), IndexStatusQuerySchema (+28 more)

### Community 15 - "version.ts"
Cohesion: 0.36
Nodes (7): checkSpecSchemaVersion(), ParsedVersion, parseVersion(), SPEC_SCHEMA_VERSION, SpecSchemaVersionFieldSchema, SpecSchemaVersionVerdict, SUPPORTED

### Community 17 - "PipelineEngine"
Cohesion: 0.15
Nodes (3): PipelineEngine, PipelineContext, PipelineStepResult

### Community 18 - "eval/report.ts"
Cohesion: 0.10
Nodes (31): createHttpLlm(), BAD, BadFixtureCapture, BadFixtureExpectation, badgeIntentConstraints(), buildMockScripts(), calcs(), deriveBundle() (+23 more)

### Community 20 - "CircuitBreakerManager"
Cohesion: 0.09
Nodes (13): CircuitBreakerConfig, CircuitBreakerManager, CircuitBreakerStats, defaultConfig, providerConfigs, ProviderName, DegradationLevel, DEGRADED (+5 more)

### Community 21 - "dependencies"
Cohesion: 0.05
Nodes (39): @opentelemetry/exporter-metrics-otlp-grpc, @opentelemetry/exporter-trace-otlp-grpc, @opentelemetry/resources, @opentelemetry/sdk-metrics, @opentelemetry/sdk-node, @opentelemetry/sdk-trace-base, @opentelemetry/semantic-conventions, dependencies (+31 more)

### Community 22 - "indexer/src/server.ts"
Cohesion: 0.09
Nodes (26): ApiError, ApiErrorResponse, containsPathTraversal(), containsSqlInjection(), ContextApiResponse, ContextRequest, ContextRequestSchema, DEFAULT_CONFIG (+18 more)

### Community 23 - "schemas/index.ts"
Cohesion: 0.10
Nodes (18): EvidenceIdSchema, DecisionSchema, validDecision, EvidenceItemSchema, validEvidence, GlossaryEntrySchema, validBundle, validManifest (+10 more)

### Community 24 - "EmbeddingEngine"
Cohesion: 0.21
Nodes (3): Chunk, EmbeddingEngine, ModelConfig

### Community 25 - "EmbeddingEngine.ts"
Cohesion: 0.15
Nodes (13): ChunkerConfig, DimensionMismatchError, EmbeddingEngineConfig, EmbeddingRequest, EmbeddingResponse, EmbeddingResult, EXPECTED_EMBEDDING_DIMENSION, AVAILABLE_MODELS (+5 more)

### Community 26 - "discovery/index.ts"
Cohesion: 0.20
Nodes (9): getGlobalMetricsRegistry(), MetricsRegistry, resetGlobalMetricsRegistry(), DiscoveryMetrics, DiscoveryTimingMetrics, DomainQualityMetrics, ReliabilityMetrics, ResourceMetrics (+1 more)

### Community 27 - "orchestrator/src/server.ts"
Cohesion: 0.12
Nodes (13): ProgressController, SpecController, defaultConfig, RateLimitConfig, setupRateLimiting(), setupSecurity(), createServer(), HealthCheckResponse (+5 more)

### Community 28 - "Trace"
Cohesion: 0.08
Nodes (16): CloseConnectionCallback, DrainResult, FlushMetricsCallback, HandlerResult, RegisteredHandler, SHUTDOWN_TIMEOUT_MS, ShutdownHandler, ShutdownResult (+8 more)

### Community 29 - "SpecBundleSchema"
Cohesion: 0.13
Nodes (10): EXPECT_GRAMMAR_DOC, EXPECTED_EXIT_PATTERN, isJudgeableExpect(), BAD, BadFixtureExpectation, GOOD, rule, SpecBundleForExport (+2 more)

### Community 30 - "ScheduledCleanupManager"
Cohesion: 0.16
Nodes (7): getGlobalCacheManager(), ActiveRunsCleanupCallback, CLEANUP_DEFAULTS, CLEANUP_INTERVALS, CleanupStats, MemoryStats, ScheduledCleanupManager

### Community 31 - "DiscoveryMetricsCollector"
Cohesion: 0.21
Nodes (3): DiscoveryMetricsCollector, testMetricsCollection(), testMetricsRegistry()

### Community 32 - "validators.test.ts"
Cohesion: 0.15
Nodes (10): DomainExclusionSchema, InvalidRoleError, RoleConfigsSchema, validateDomainExclusion(), ValidationError, invalidDomainIdArb, invalidJustificationArb, validJustificationArb (+2 more)

### Community 33 - "eval/runner.ts"
Cohesion: 0.10
Nodes (29): LlmAdapter, CLASSIFY_RULES, classifyAndProposeSingle(), classifySingle(), CONSTRAINT_FIDELITY, intentBlock(), JSON_ONLY, judgeMerge() (+21 more)

### Community 34 - "FileMetadata"
Cohesion: 0.16
Nodes (9): FRAMEWORK_PATTERNS, MetadataAnalyzer, ProjectMetadata, ChangeDetectionResult, FileHash, IncrementalTrackerError, FileMetadata, ScannerConfig (+1 more)

### Community 35 - "IndexClient"
Cohesion: 0.05
Nodes (40): IndexController, EnsureIndexedRequest, IndexStatusQuery, DomainContext, ContextBuilder, ContextBuilderOptions, createContextBuilder(), FormattedContext (+32 more)

### Community 36 - "versionNegotiation.ts"
Cohesion: 0.15
Nodes (21): RFC-8594, ApiVersion, clearDeprecatedEndpoints(), DEPRECATED_ENDPOINTS, DeprecatedEndpointConfig, DeprecationHeaders, generateDeprecationHeaders(), getDeprecatedEndpointConfig() (+13 more)

### Community 37 - "IndexerServer"
Cohesion: 0.14
Nodes (3): generateCorrelationId(), IndexerServer, main()

### Community 38 - "mcp/server.ts"
Cohesion: 0.07
Nodes (48): ChangeSet, authorizeExecution(), checkPreviewDigest(), consentDigestLine(), EXEC_OPT_IN_ENV, ExecAuthorization, ExecBoundary, execOptInFromEnv() (+40 more)

### Community 39 - "OrchestratorAdapter.ts"
Cohesion: 0.16
Nodes (8): OrchestratorAdapter, DomainExclusion, IndexStateResponse, OrchestratorRunRequest, OrchestratorRunResponse, PipelineProgressResponse, SpecFilesResponse, safeJsonParse()

### Community 40 - "formatJson"
Cohesion: 0.45
Nodes (3): ToolRegistry, MCPToolResult, formatJson()

### Community 41 - "cache.ts"
Cohesion: 0.12
Nodes (4): CacheEntry, DependencyMappingCache, PatternMatchCache, CacheStatistics

### Community 42 - "init.ts"
Cohesion: 0.15
Nodes (12): buildSections(), Contract, Decision, EvidenceItem, GlossaryEntry, InitOptions, InitResult, Intent (+4 more)

### Community 43 - "indexer/src/api/openapi.ts"
Cohesion: 0.22
Nodes (4): openApiSpec, openApiSpec, LATEST_STABLE_VERSION, SUPPORTED_VERSIONS

### Community 44 - "intent-fidelity.test.ts"
Cohesion: 0.19
Nodes (8): FIXTURES, U, advisoryInventions(), assertionPasses(), normalizeForTermMatch(), RunUsage, scoreRun(), searchableBundleText()

### Community 45 - "PipelineState"
Cohesion: 0.15
Nodes (14): StateMachine, StateContext, StateTransition, PipelineState, ABORTED, AGGREGATE, ANALYZE, COMPLETED (+6 more)

### Community 46 - "spec-core/package.json"
Cohesion: 0.04
Nodes (45): bin, lco, lco-mcp, dependencies, zod, description, devDependencies, @types/node (+37 more)

### Community 47 - "LogLevel"
Cohesion: 0.18
Nodes (10): example(), Indexer, IndexerConfig, main(), ServerConfig, LogLevel, DEBUG, ERROR (+2 more)

### Community 48 - "test-enterprise-features.ts"
Cohesion: 0.44
Nodes (12): initializeGlobalCacheManager(), resetGlobalCacheManager(), initializeGlobalConfig(), resetGlobalConfig(), assert(), assertEquals(), runAllTests(), sleep() (+4 more)

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

### Community 58 - "orchestrator/src/middleware/security.ts"
Cohesion: 0.47
Nodes (3): defaultConfig, SecurityConfig, SecurityUtils

### Community 59 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, declaration, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck (+6 more)

### Community 60 - "HealthController.ts"
Cohesion: 0.19
Nodes (8): HealthCheckResult, HealthController, NOTE: Qdrant is optional and not in the critical data path, setupMetrics(), trackLlmCall(), trackPipelineRun(), trackPipelineStep(), getOrchestratorMetrics()

### Community 61 - "compileSpecDir"
Cohesion: 0.07
Nodes (33): applyUnderLock(), ChangeResult, cmdChange(), findingLine(), FIXTURES, frozenSpecRoot(), inlineBundle(), makeSpecRoot() (+25 more)

### Community 62 - "commands/trace.test.ts"
Cohesion: 0.18
Nodes (9): cmdTrace(), renderTrace(), compiledBundle(), FIXTURES, SECTION_FILES, tmpDirs, TraceResult, buildTrace() (+1 more)

### Community 63 - "dependencies"
Cohesion: 0.04
Nodes (44): dependencies, axios, fastify, @fastify/cors, @fastify/helmet, @fastify/rate-limit, @llm/shared-config, @llm/shared-observability (+36 more)

### Community 64 - "dependencies"
Cohesion: 0.12
Nodes (17): dependencies, @fastify/cors, @fastify/helmet, @llm/shared-config, @llm/shared-observability, @llm/shared-types, @llm/shared-utils, uuid (+9 more)

### Community 66 - "ChatMessage"
Cohesion: 0.17
Nodes (12): OpenAIErrorResponse, OpenAIMessage, OpenAIRequest, OpenAIResponse, ModelResponse, ModelResponseMetadata, ProviderAdapter, ProviderConfig (+4 more)

### Community 67 - "AnthropicAdapter.ts"
Cohesion: 0.15
Nodes (12): AnthropicContentBlockDeltaEvent, AnthropicContentBlockStartEvent, AnthropicErrorEvent, AnthropicErrorResponse, AnthropicMessage, AnthropicMessageDeltaEvent, AnthropicMessageStartEvent, AnthropicRequest (+4 more)

### Community 68 - "eval/runner.test.ts"
Cohesion: 0.27
Nodes (7): complete(), counterOnlyUnresolvedBundle(), et01Bundle(), PET_CLINIC, proposalAJson(), unresolvedAddedBundle(), unresolvedPlusLintDirtyBundle()

### Community 69 - "RequestContextLogger"
Cohesion: 0.08
Nodes (13): fastify, FastifyRequest, setupLogging(), createLogger(), CreateLoggerOptions, defaultContext, getIndexerLogger(), getMcpBridgeLogger() (+5 more)

### Community 70 - "mcp_bridge/package.json"
Cohesion: 0.07
Nodes (27): dependencies, @llm/shared-config, @llm/shared-types, @llm/shared-utils, devDependencies, ts-node, @types/node, typescript (+19 more)

### Community 71 - "orchestrator/package.json"
Cohesion: 0.33
Nodes (5): main, name, private, type, version

### Community 73 - "ConfigController.ts"
Cohesion: 0.18
Nodes (7): ConfigController, ModelInfo, ModelsResponse, ProviderInfo, RoleInfo, RolesResponse, ModelConfig

### Community 74 - "registerTools.ts"
Cohesion: 0.25
Nodes (7): Logger, main(), TOOL_DEFINITIONS, MCPError, MCPResponse, MCPToolDefinition, validateDomainExclusion()

### Community 75 - "stdio.ts"
Cohesion: 0.10
Nodes (20): isJsonRpcId(), isPlainObject(), validateJsonRpcEnvelope(), EPIPE_DRAIN_TIMEOUT_MS, EXIT_CLIENT_GONE, EXIT_DRAIN_TIMEOUT, EXIT_OK, jsonRpcError() (+12 more)

### Community 77 - "shared-utils/package.json"
Cohesion: 0.22
Nodes (8): dependencies, @llm/shared-config, @llm/shared-config, main, name, private, types, version

### Community 78 - "revision.ts"
Cohesion: 0.09
Nodes (26): SECTION_KEYS, PET_CLINIC, SECTION_FILES, tmpDirs, writeSpecDir(), assertNotSymlink(), acquireSpecRootLock(), backupPathFor() (+18 more)

### Community 80 - "discovery/types.ts"
Cohesion: 0.12
Nodes (23): DomainDiscoveryEngine, SpecWriterConfig, SpecWriteResult, exampleHybridCmsDiscovery(), exampleNodejsMicroservicesDiscovery(), examplePhpMonolithDiscovery(), examplePipelineFlow(), executeSpecifyStep() (+15 more)

### Community 81 - "audit-shared-drift.js"
Cohesion: 0.29
Nodes (10): APPS_DIR, AUDIT_DIR, ensureAuditDir(), formatCandidates(), groupBy(), main(), ROOT, scanFile() (+2 more)

### Community 82 - "check/runner.ts"
Cohesion: 0.07
Nodes (28): parseExpect(), REDACTION_RULES, RedactionRule, redactSecrets(), SecretKind, activeProcessGroups, CheckOutcome, DEFAULT_TIMEOUT_MS (+20 more)

### Community 83 - "indexer/src/api/IndexController.ts"
Cohesion: 0.12
Nodes (9): ContextRequest, ContextResponse, EnsureIndexedRequest, EnsureIndexedResponse, IndexController, SearchRequest, SearchResponse, StatsResponse (+1 more)

### Community 84 - "PipelineStatus"
Cohesion: 0.33
Nodes (6): PipelineStatus, CANCELLED, COMPLETED, FAILED, PENDING, RUNNING

### Community 85 - "devDependencies"
Cohesion: 0.12
Nodes (17): devDependencies, axios, fast-check, ts-node, @types/node, @types/opossum, @types/uuid, typescript (+9 more)

### Community 86 - "SpecBundle"
Cohesion: 0.05
Nodes (29): Executor, CheckOptions, CheckResult, cmdCheck(), expectedActual(), renderReport(), cmdFreeze(), FreezeResult (+21 more)

### Community 88 - "lint/trace.test.ts"
Cohesion: 0.22
Nodes (7): DecSpec, GOOD, mkBundle(), mkTask(), ReqSpec, TaskSpec, testWith()

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

### Community 99 - "ModelCallOptions"
Cohesion: 0.13
Nodes (9): OpenAIOpenRouterAdapter, CHINESE_ERROR_TRANSLATIONS, translateErrorMessage(), ZAIAdapter, ZAIErrorResponse, ZAIMessage, ZAIRequest, ZAIResponse (+1 more)

### Community 100 - "check.test.ts"
Cohesion: 0.21
Nodes (9): evidenceOf(), evidencePath(), FIXTURES, freshRoot(), initRoot(), makeSpecRoot(), SECTION_FILES, tmpDirs (+1 more)

### Community 101 - "budget.ts"
Cohesion: 0.10
Nodes (19): BudgetCap, BudgetExceededError, BudgetSpentSnapshot, DEFAULT_WALL_SLACK_MS, MAX_COMPLETIONS, ResolvedRunBudget, resolveRunBudget(), worstCaseAttempts() (+11 more)

### Community 102 - "BaseLogger"
Cohesion: 0.18
Nodes (5): LogEntry, LogEntry, BaseLogger, LogEntry, ConsoleLogger

### Community 103 - "mcp_bridge/tsconfig.json"
Cohesion: 0.18
Nodes (10): compilerOptions, outDir, rootDir, exclude, extends, include, dist, node_modules (+2 more)

### Community 104 - "adapter.ts"
Cohesion: 0.42
Nodes (6): LlmCompleteOptions, LlmResponse, createMockLlm(), MockScript, SCRIPT, MockEvalScripts

### Community 105 - "shared-types/package.json"
Cohesion: 0.33
Nodes (5): main, name, private, types, version

### Community 106 - "closure.ts"
Cohesion: 0.33
Nodes (4): ClosureFinding, ClosureFindingCode, closureFindings(), DuplicateTaskId

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
Nodes (9): runEvalAll(), DEFAULT_REPORT_PATH, LIVE_ENV_VARS, missingLiveEnv(), parseArgs(), ParsedArgs, runEvalCli(), FAKE_LIVE_ENV (+1 more)

### Community 112 - "config.ts"
Cohesion: 0.28
Nodes (7): DEFAULT_BEHAVIOR_CONFIG, DEFAULT_PERFORMANCE_CONFIG, DEFAULT_SIGNAL_WEIGHTS, getGlobalConfig(), DiscoveryBehaviorConfig, PerformanceConfig, SignalWeightConfig

### Community 113 - "middleware/tracing.ts"
Cohesion: 0.20
Nodes (6): fastify, FastifyRequest, setupTracing(), tracer, initializeTracing(), TracingConfig

### Community 116 - "mcp/server.test.ts"
Cohesion: 0.13
Nodes (16): EXEC_ROOT_ENV, generateConsentDigest(), callTool(), expectIdentical(), FIXTURES, freshRoot(), frozenRoot(), injectionRoot() (+8 more)

### Community 117 - "ExecutionStatus"
Cohesion: 0.40
Nodes (5): ExecutionStatus, ERROR, PENDING, RUNNING, SUCCESS

### Community 118 - "test-fallback.ts"
Cohesion: 0.58
Nodes (8): assert(), assertEquals(), runAllTests(), testFallbackOnMaxRetries(), testFallbackOnValidationFailure(), testRetryWithSuccess(), testSuccessfulDiscovery(), testZeroDomainsHandling()

### Community 124 - "plan.test.ts"
Cohesion: 0.08
Nodes (19): cmdPlan(), PlanOptions, PlanResult, PlanTask, renderHuman(), renderJson(), FIXTURES, SECTION_FILES (+11 more)

### Community 125 - "Logger"
Cohesion: 0.22
Nodes (4): Logger, FastifyRequest, IndexMetadata, VectorStorageError

### Community 126 - "l08.test.ts"
Cohesion: 0.67
Nodes (3): FIXTURES, inState(), loadBundle()

### Community 128 - "readiness.ts"
Cohesion: 0.50
Nodes (3): evaluateReleaseReadiness(), ReleaseReadiness, ReleaseReadinessInput

### Community 186 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, dev, start, test, test:watch

## Knowledge Gaps
- **721 isolated node(s):** `ExecutorResult`, `RunChecksOptions`, `RunChecksResult`, `OUTPUT_TAIL_LIMIT`, `EVIDENCE_FILE_MODE` (+716 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **26 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SpecBundle` connect `SpecBundle` to `compiler/freeze.ts`, `lifecycle.ts`, `engine.ts`, `cli/index.ts`, `eval/report.ts`, `schemas/index.ts`, `SpecBundleSchema`, `eval/runner.ts`, `mcp/server.ts`, `intent-fidelity.test.ts`, `generate.test.ts`, `compileSpecDir`, `commands/trace.test.ts`, `eval/runner.test.ts`, `revision.ts`, `check/runner.ts`, `lint/trace.test.ts`, `budget.ts`, `closure.ts`, `plan.test.ts`, `l08.test.ts`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Why does `ScheduledCleanupManager` connect `ScheduledCleanupManager` to `orchestrator/src/server.ts`, `PipelineController.ts`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Why does `ModelResponse` connect `ChatMessage` to `AnthropicAdapter.ts`, `ThinkingConfig`, `ModelCallOptions`, `ModelGateway`, `AnthropicAdapter`, `OpenAIAdapter`, `GeminiAdapter.ts`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **What connects `ExecutorResult`, `RunChecksOptions`, `RunChecksResult` to the rest of the system?**
  _721 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Domain` be split into smaller, more focused modules?**
  _Cohesion score 0.06540825285338016 - nodes in this community are weakly interconnected._
- **Should `common.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1425287356321839 - nodes in this community are weakly interconnected._
- **Should `compiler/freeze.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06280193236714976 - nodes in this community are weakly interconnected._