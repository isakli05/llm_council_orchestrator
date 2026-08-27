# Graph Report - llm_council_orchestrator  (2026-08-27)

## Corpus Check
- 337 files · ~245,762 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2572 nodes · 5443 edges · 140 communities (108 shown, 32 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 103 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `80e5fa2a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Domain
- schemas/index.ts
- cli.test.ts
- configLoader.ts
- models/types.ts
- orchestratorCore.ts
- plan.test.ts
- PipelineExecutionState
- engine.ts
- ModelGateway
- cli/index.ts
- closure.ts
- VectorStorage
- validators.ts
- LRUCache
- EmbeddingEngine
- ShutdownManager
- PipelineEngine
- eval/report.ts
- VectorIndex
- CircuitBreakerManager
- dependencies
- indexer/src/server.ts
- init.ts
- EmbeddingEngine.ts
- consent.ts
- DiscoveryMetricsCollector
- orchestrator/src/server.ts
- PipelineEngine.ts
- commands/trace.test.ts
- ScheduledCleanupManager
- LogLevel
- PipelineController.ts
- eval/runner.ts
- FileMetadata
- IndexClient
- versionNegotiation.ts
- IndexerServer
- mcp/server.ts
- OrchestratorAdapter.ts
- formatJson
- cache.ts
- SignalExtractor
- run-eval.test.ts
- intent-fidelity.test.ts
- PipelineState
- spec-core/package.json
- indexer/src/main.ts
- test-enterprise-features.ts
- consent.test.ts
- test-utils.ts
- devDependencies
- generate.test.ts
- Trace
- Chunker
- GeminiAdapter.ts
- RoleManager
- MCPServer
- discovery/index.ts
- compilerOptions
- HealthController.ts
- lintBundle
- Aggregator.ts
- dependencies
- dependencies
- IncrementalTracker
- ChatMessage
- shared-types/src/index.ts
- eval/runner.test.ts
- RequestContextLogger
- mcp_bridge/package.json
- orchestrator/package.json
- LRUCache
- SpecBundle
- shared-utils/src/index.ts
- errorSanitizer.ts
- @fastify/rate-limit
- shared-utils/package.json
- revision.ts
- DiscoveryConfigManager
- MetricsRegistry
- audit-shared-drift.js
- check/runner.ts
- middleware/tracing.ts
- PipelineStatus
- devDependencies
- acquireSpecRootLock
- Logger
- DomainClassifier
- Scanner
- run-all-examples.ts
- CacheManager
- make-bins-executable.js
- orchestrator/tsconfig.json
- shared-config/package.json
- shared-observability/tsconfig.json
- compilerOptions
- packed-install-smoke.sh
- indexer/tsconfig.json
- ModelCallOptions
- ConfigController.ts
- budget.ts
- check.test.ts
- mcp_bridge/tsconfig.json
- indexer/src/api/IndexController.ts
- shared-types/package.json
- ModelGateway.ts
- ScheduledCleanup.ts
- SpecBundleSchema
- roleConfigMerger.ts
- indexer/src/api/openapi.ts
- ShutdownManager.ts
- config.ts
- l02.test.ts
- verify-observability.sh
- test-api.sh
- mcp/server.test.ts
- l03.test.ts
- discovery.ts
- verify-hardening.sh
- test-discovery-engine.ts
- GracefulDegradationManager
- .discover
- orchestrator/src/middleware/security.ts
- OpenAIOpenRouterAdapter
- fastify
- containsPathTraversal
- l08.test.ts
- example-pipeline-integration.ts
- InvalidRoleError
- l06.test.ts
- l12.test.ts
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

## Communities (140 total, 32 thin omitted)

### Community 0 - "Domain"
Cohesion: 0.14
Nodes (20): DomainSpecWriter, pathExists(), SpecWriterConfig, SpecWriteResult, mockDeepDomain, mockDomainWithSpecialChars, mockDomainWithSubDomains, mockExcludedDomain (+12 more)

### Community 1 - "schemas/index.ts"
Cohesion: 0.09
Nodes (33): AssumptionIdSchema, ComplexityProfileSchema, ContractIdSchema, DecisionIdSchema, EvidenceIdSchema, IdSchema, ImpactLevelSchema, RequirementIdSchema (+25 more)

### Community 2 - "cli.test.ts"
Cohesion: 0.22
Nodes (3): FIXTURES, SECTION_FILES, tmpDirs

### Community 3 - "configLoader.ts"
Cohesion: 0.07
Nodes (44): applyEnvironmentOverrides(), ArchitectConfigSchema, ConfigLoaderOptions, DefaultsConfigSchema, EmbeddingConfigSchema, EmbeddingModelConfigSchema, ENV_VAR_MAPPINGS, findConfigPath() (+36 more)

### Community 4 - "models/types.ts"
Cohesion: 0.09
Nodes (13): AnthropicOpenRouterAdapter, AnthropicOpenRouterRequest, GeminiOpenRouterAdapter, GeminiOpenRouterRequest, OpenAIOpenRouterRequest, OpenRouterAdapter, OpenRouterErrorResponse, OpenRouterMessage (+5 more)

### Community 5 - "orchestratorCore.ts"
Cohesion: 0.15
Nodes (11): OrchestratorCore, PipelineOptions, runOrchestratorPipeline(), mockIndexMetadata, runTest(), testTraceSpan(), PipelineResult, ApiKeyValidationResult (+3 more)

### Community 6 - "plan.test.ts"
Cohesion: 0.08
Nodes (21): cmdPlan(), PlanOptions, PlanResult, PlanTask, renderHuman(), renderJson(), compiledBundle(), FIXTURES (+13 more)

### Community 7 - "PipelineExecutionState"
Cohesion: 0.07
Nodes (22): getNextStepState(), getValidTransitions(), InvalidStateTransitionError, isActiveState(), isTerminalState(), isValidTransition(), PipelineExecutionStateMachine, StateChangeEvent (+14 more)

### Community 8 - "engine.ts"
Cohesion: 0.09
Nodes (23): BAD, BadFixtureExpectation, LintRule, RULES, rule, FIXTURES, rule, rule (+15 more)

### Community 9 - "ModelGateway"
Cohesion: 0.09
Nodes (12): ModelGateway, ArchitectConfig, ProviderType, ANTHROPIC, ANTHROPIC_OPENROUTER, GEMINI, GEMINI_OPENROUTER, GLM (+4 more)

### Community 10 - "cli/index.ts"
Cohesion: 0.11
Nodes (28): checkIntent(), cmdGenerate(), DEFAULT_GENERATE_PROFILE, DEFAULT_GENERATE_VARIANT, GenerateOptions, GenerateResult, IntentCheck, lintReason() (+20 more)

### Community 11 - "closure.ts"
Cohesion: 0.32
Nodes (5): ClosureFinding, ClosureFindingCode, closureFindings(), DuplicateTaskId, duplicateTaskIds()

### Community 13 - "validators.ts"
Cohesion: 0.06
Nodes (37): containsSqlInjection(), domainIdValidator, EnsureIndexedRequestSchema, EnsureIndexedResponseSchema, ErrorResponseSchema, escapeRegexChars(), extractInvalidRoleName(), IndexStatusQuerySchema (+29 more)

### Community 17 - "PipelineEngine"
Cohesion: 0.16
Nodes (4): PipelineEngine, testDiscoveryMetrics(), PipelineContext, PipelineStepResult

### Community 18 - "eval/report.ts"
Cohesion: 0.10
Nodes (31): BAD, BadFixtureCapture, BadFixtureExpectation, badgeIntentConstraints(), buildMockScripts(), calcs(), deriveBundle(), EvalEvidence (+23 more)

### Community 20 - "CircuitBreakerManager"
Cohesion: 0.09
Nodes (13): CircuitBreakerConfig, CircuitBreakerManager, CircuitBreakerStats, defaultConfig, providerConfigs, ProviderName, DegradationLevel, DEGRADED (+5 more)

### Community 21 - "dependencies"
Cohesion: 0.05
Nodes (39): @opentelemetry/exporter-metrics-otlp-grpc, @opentelemetry/exporter-trace-otlp-grpc, @opentelemetry/resources, @opentelemetry/sdk-metrics, @opentelemetry/sdk-node, @opentelemetry/sdk-trace-base, @opentelemetry/semantic-conventions, dependencies (+31 more)

### Community 22 - "indexer/src/server.ts"
Cohesion: 0.09
Nodes (26): ApiError, ApiErrorResponse, containsPathTraversal(), containsSqlInjection(), ContextApiResponse, ContextRequest, ContextRequestSchema, DEFAULT_CONFIG (+18 more)

### Community 23 - "init.ts"
Cohesion: 0.11
Nodes (16): buildSections(), cmdInit(), Contract, Decision, EvidenceItem, GlossaryEntry, InitOptions, InitResult (+8 more)

### Community 24 - "EmbeddingEngine.ts"
Cohesion: 0.13
Nodes (15): ChunkerConfig, DimensionMismatchError, EmbeddingEngineConfig, EmbeddingRequest, EmbeddingResponse, EmbeddingResult, EXPECTED_EMBEDDING_DIMENSION, AVAILABLE_MODELS (+7 more)

### Community 25 - "consent.ts"
Cohesion: 0.15
Nodes (14): consentDigestLine(), EXEC_OPT_IN_ENV, ExecAuthorization, ExecBoundary, execOptInFromEnv(), execRootFromEnv(), GenerateProfile, GenerateVariant (+6 more)

### Community 26 - "DiscoveryMetricsCollector"
Cohesion: 0.12
Nodes (10): DiscoveryMetricsCollector, getGlobalMetricsRegistry(), MetricsRegistry, resetGlobalMetricsRegistry(), DiscoveryMetrics, DiscoveryTimingMetrics, DomainQualityMetrics, ReliabilityMetrics (+2 more)

### Community 27 - "orchestrator/src/server.ts"
Cohesion: 0.12
Nodes (13): ProgressController, SpecController, defaultConfig, RateLimitConfig, setupRateLimiting(), setupSecurity(), createServer(), HealthCheckResponse (+5 more)

### Community 28 - "PipelineEngine.ts"
Cohesion: 0.12
Nodes (20): AggregationInput, AggregationResult, ContextValidationError, DEEP_DOMAIN_ANALYSIS_ROLES, DEFAULT_ROLE_CONFIG, FULL_MODE_ANALYSIS_ROLES, QUICK_MODE_ANALYSIS_ROLES, StepTimeoutError (+12 more)

### Community 29 - "commands/trace.test.ts"
Cohesion: 0.10
Nodes (16): cmdTrace(), renderTrace(), compiledBundle(), FIXTURES, SECTION_FILES, tmpDirs, TraceResult, buildTrace() (+8 more)

### Community 31 - "LogLevel"
Cohesion: 0.12
Nodes (10): IndexerConfig, Logger, FastifyRequest, ServerConfig, LogLevel, DEBUG, ERROR, INFO (+2 more)

### Community 32 - "PipelineController.ts"
Cohesion: 0.24
Nodes (6): PipelineController, StoredRunEntry, DomainExclusion, RoleConfigsInput, RunPipelineRequest, RunPipelineRequestSchema

### Community 33 - "eval/runner.ts"
Cohesion: 0.12
Nodes (26): validateGenerationOutput(), BudgetLedger, LlmUsage, CLASSIFY_RULES, classifyAndProposeSingle(), classifySingle(), CONSTRAINT_FIDELITY, intentBlock() (+18 more)

### Community 34 - "FileMetadata"
Cohesion: 0.21
Nodes (7): FRAMEWORK_PATTERNS, MetadataAnalyzer, ProjectMetadata, ChangeDetectionResult, FileMetadata, ScannerConfig, ScannerError

### Community 35 - "IndexClient"
Cohesion: 0.08
Nodes (29): IndexController, EnsureIndexedRequest, IndexStatusQuery, ContextBuilder, ContextBuilderOptions, createContextBuilder(), FormattedContext, RoleType (+21 more)

### Community 36 - "versionNegotiation.ts"
Cohesion: 0.15
Nodes (21): RFC-8594, ApiVersion, clearDeprecatedEndpoints(), DEPRECATED_ENDPOINTS, DeprecatedEndpointConfig, DeprecationHeaders, generateDeprecationHeaders(), getDeprecatedEndpointConfig() (+13 more)

### Community 37 - "IndexerServer"
Cohesion: 0.14
Nodes (3): generateCorrelationId(), IndexerServer, main()

### Community 38 - "mcp/server.ts"
Cohesion: 0.13
Nodes (19): generateOptInFromEnv(), ARG_SPECS, ArgName, ArgValidator, CallContext, CoreResult, DIR_PROPERTY, errorResponse() (+11 more)

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

### Community 44 - "intent-fidelity.test.ts"
Cohesion: 0.12
Nodes (11): FIXTURES, U, PipelineOutcome, advisoryInventions(), assertionPasses(), normalizeForTermMatch(), RunUsage, scoreRun() (+3 more)

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

### Community 49 - "consent.test.ts"
Cohesion: 0.15
Nodes (16): authorizeExecution(), checkPreviewDigest(), EXEC_ROOT_ENV, GENERATE_OPT_IN_ENV, refuseGenerateConsentMissing(), refuseGenerateNotOptedIn(), scrubbedEnv(), scrubbedExecutor() (+8 more)

### Community 50 - "test-utils.ts"
Cohesion: 0.10
Nodes (24): DomainExclusionSchema, RoleConfigsSchema, validateDomainExclusion(), ValidationError, apiKeyArb, chatMessageArb, chatMessagesArb, DEFAULT_NUM_RUNS (+16 more)

### Community 51 - "devDependencies"
Cohesion: 0.07
Nodes (27): axios, fast-check, _archival, devDependencies, axios, fast-check, tsx, @types/node (+19 more)

### Community 52 - "generate.test.ts"
Cohesion: 0.11
Nodes (11): complete(), FAKE_ENV, fetchSpy(), jsonResponse(), PET_CLINIC, SECTION_FILES, SESSION_SERVICE, tmpDirs (+3 more)

### Community 55 - "GeminiAdapter.ts"
Cohesion: 0.16
Nodes (7): GeminiAdapter, GeminiContent, GeminiErrorResponse, GeminiGenerationConfig, GeminiPart, GeminiRequest, GeminiResponse

### Community 56 - "RoleManager"
Cohesion: 0.17
Nodes (9): RoleManager, RoleProviderConfig, RoleRequest, RoleType, AGGREGATOR, ARCHITECT, LEGACY_ANALYSIS, MIGRATION (+1 more)

### Community 57 - "MCPServer"
Cohesion: 0.17
Nodes (9): Logger, main(), TOOL_DEFINITIONS, MCPServer, MCPError, MCPNotification, MCPRequest, MCPResponse (+1 more)

### Community 58 - "discovery/index.ts"
Cohesion: 0.21
Nodes (9): DOMAIN_MAPPINGS, IMPORTANT: Confidence does NOT affect analysisDepth, SIGNAL_WEIGHTS, DependencyInfo, DirectoryNode, DomainContext, IndexMetadata, createMockIndexMetadata() (+1 more)

### Community 59 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, declaration, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck (+6 more)

### Community 60 - "HealthController.ts"
Cohesion: 0.19
Nodes (8): HealthCheckResult, HealthController, NOTE: Qdrant is optional and not in the critical data path, setupMetrics(), trackLlmCall(), trackPipelineRun(), trackPipelineStep(), getOrchestratorMetrics()

### Community 61 - "lintBundle"
Cohesion: 0.06
Nodes (42): applyUnderLock(), ChangeResult, cmdChange(), findingLine(), FIXTURES, frozenSpecRoot(), inlineBundle(), makeSpecRoot() (+34 more)

### Community 62 - "Aggregator.ts"
Cohesion: 0.13
Nodes (14): Aggregator, AGGREGATOR_SYSTEM_PROMPT, buildSynthesisUserPrompt(), createFallbackSections(), formatRoleContributions(), formatRoleTitle(), getExpectedSectionIds(), getExpectedSectionTitles() (+6 more)

### Community 63 - "dependencies"
Cohesion: 0.04
Nodes (44): dependencies, axios, fastify, @fastify/cors, @fastify/helmet, @fastify/rate-limit, @llm/shared-config, @llm/shared-observability (+36 more)

### Community 64 - "dependencies"
Cohesion: 0.12
Nodes (17): dependencies, @fastify/cors, @fastify/helmet, @llm/shared-config, @llm/shared-observability, @llm/shared-types, @llm/shared-utils, uuid (+9 more)

### Community 66 - "ChatMessage"
Cohesion: 0.15
Nodes (9): OpenAIAdapter, OpenAIErrorResponse, OpenAIMessage, OpenAIRequest, OpenAIResponse, ModelResponse, ProviderAdapter, ProviderConfig (+1 more)

### Community 67 - "shared-types/src/index.ts"
Cohesion: 0.09
Nodes (17): AnthropicContentBlockDeltaEvent, AnthropicContentBlockStartEvent, AnthropicErrorEvent, AnthropicErrorResponse, AnthropicMessage, AnthropicMessageDeltaEvent, AnthropicMessageStartEvent, AnthropicRequest (+9 more)

### Community 68 - "eval/runner.test.ts"
Cohesion: 0.17
Nodes (13): LlmAdapter, LlmCompleteOptions, LlmResponse, createMockLlm(), MockScript, SCRIPT, complete(), counterOnlyUnresolvedBundle() (+5 more)

### Community 69 - "RequestContextLogger"
Cohesion: 0.13
Nodes (11): fastify, FastifyRequest, setupLogging(), createLogger(), CreateLoggerOptions, defaultContext, getIndexerLogger(), getMcpBridgeLogger() (+3 more)

### Community 70 - "mcp_bridge/package.json"
Cohesion: 0.07
Nodes (27): dependencies, @llm/shared-config, @llm/shared-types, @llm/shared-utils, devDependencies, ts-node, @types/node, typescript (+19 more)

### Community 71 - "orchestrator/package.json"
Cohesion: 0.33
Nodes (5): main, name, private, type, version

### Community 73 - "SpecBundle"
Cohesion: 0.06
Nodes (48): applyChangeSet(), ApplyResult, ChangeSet, ChangeSetSchema, formatIssues(), cleanLint, FIXTURES, freeze() (+40 more)

### Community 74 - "shared-utils/src/index.ts"
Cohesion: 0.13
Nodes (12): FileHash, IncrementalTrackerError, LogEntry, LogEntry, DomainExclusionInput, DomainExclusionValidationResult, isValidJustification(), RetryOptions (+4 more)

### Community 75 - "errorSanitizer.ts"
Cohesion: 0.19
Nodes (10): createFullErrorDetails(), FullErrorDetails, GENERIC_ERROR_MESSAGES, INTERNAL_ERROR_STATUS_CODES, isProduction(), SanitizedError, sanitizeError(), sanitizeErrorObject() (+2 more)

### Community 77 - "shared-utils/package.json"
Cohesion: 0.22
Nodes (8): dependencies, @llm/shared-config, @llm/shared-config, main, name, private, types, version

### Community 78 - "revision.ts"
Cohesion: 0.13
Nodes (16): backupPathFor(), createDirAtomically(), DEFAULT_STALE_MS, fsyncDir(), LOCK_FILE, LockHeldError, LockIdentity, LockOptions (+8 more)

### Community 81 - "audit-shared-drift.js"
Cohesion: 0.29
Nodes (10): APPS_DIR, AUDIT_DIR, ensureAuditDir(), formatCandidates(), groupBy(), main(), ROOT, scanFile() (+2 more)

### Community 82 - "check/runner.ts"
Cohesion: 0.11
Nodes (20): parseExpect(), CheckOutcome, DEFAULT_TIMEOUT_MS, Executor, OUTPUT_TAIL_LIMIT, runChecks(), RunChecksOptions, RunChecksResult (+12 more)

### Community 83 - "middleware/tracing.ts"
Cohesion: 0.20
Nodes (6): fastify, FastifyRequest, setupTracing(), tracer, initializeTracing(), TracingConfig

### Community 84 - "PipelineStatus"
Cohesion: 0.17
Nodes (11): ExecutionStatus, ERROR, PENDING, RUNNING, SUCCESS, PipelineStatus, CANCELLED, COMPLETED (+3 more)

### Community 85 - "devDependencies"
Cohesion: 0.12
Nodes (17): devDependencies, axios, fast-check, ts-node, @types/node, @types/opossum, @types/uuid, typescript (+9 more)

### Community 86 - "acquireSpecRootLock"
Cohesion: 0.23
Nodes (9): SECTION_KEYS, PET_CLINIC, SECTION_FILES, tmpDirs, writeSpecDir(), acquireSpecRootLock(), breakStaleLock(), readHolder() (+1 more)

### Community 90 - "run-all-examples.ts"
Cohesion: 0.46
Nodes (6): exampleHybridCmsDiscovery(), exampleNodejsMicroservicesDiscovery(), examplePhpMonolithDiscovery(), exampleUserExclusionWorkflow(), runAllExamples(), sleep()

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
Cohesion: 0.17
Nodes (8): CHINESE_ERROR_TRANSLATIONS, translateErrorMessage(), ZAIAdapter, ZAIErrorResponse, ZAIMessage, ZAIRequest, ZAIResponse, ModelCallOptions

### Community 100 - "ConfigController.ts"
Cohesion: 0.20
Nodes (7): ConfigController, ModelInfo, ModelsResponse, ProviderInfo, RoleInfo, RolesResponse, ModelConfig

### Community 101 - "budget.ts"
Cohesion: 0.09
Nodes (21): BudgetCap, BudgetExceededError, BudgetSpentSnapshot, DEFAULT_WALL_SLACK_MS, MAX_COMPLETIONS, ResolvedRunBudget, resolveRunBudget(), RunBudgetSpec (+13 more)

### Community 102 - "check.test.ts"
Cohesion: 0.22
Nodes (6): FIXTURES, freshRoot(), initRoot(), makeSpecRoot(), SECTION_FILES, tmpDirs

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
Cohesion: 0.17
Nodes (11): ExtendedError, NON_RETRYABLE_ERROR_PATTERNS, NON_RETRYABLE_HTTP_STATUS_CODES, ProviderStatus, REASONING_PROMPT, RETRYABLE_ERROR_PATTERNS, RETRYABLE_HTTP_STATUS_CODES, RetryableErrorResult (+3 more)

### Community 107 - "ScheduledCleanup.ts"
Cohesion: 0.20
Nodes (7): ActiveRunsCleanupCallback, CLEANUP_DEFAULTS, CLEANUP_INTERVALS, CleanupStats, MemoryStats, PipelineTrace, TraceSpan

### Community 108 - "SpecBundleSchema"
Cohesion: 0.15
Nodes (8): EXPECT_GRAMMAR_DOC, EXPECTED_EXIT_PATTERN, isJudgeableExpect(), GOOD, rule, SpecBundleForExport, GENERATED_PATH, SpecBundleSchema

### Community 109 - "roleConfigMerger.ts"
Cohesion: 0.15
Nodes (15): extractProvidersFromConfig(), getValidRoleNames(), inferProviderFromModel(), isValidRoleName(), mergeRoleConfigs(), MODEL_PREFIX_TO_PROVIDER, modelConfigToProviderConfig(), normalizeToProviderConfigs() (+7 more)

### Community 110 - "indexer/src/api/openapi.ts"
Cohesion: 0.22
Nodes (4): openApiSpec, openApiSpec, LATEST_STABLE_VERSION, SUPPORTED_VERSIONS

### Community 111 - "ShutdownManager.ts"
Cohesion: 0.20
Nodes (9): CloseConnectionCallback, DrainResult, FlushMetricsCallback, HandlerResult, RegisteredHandler, SHUTDOWN_TIMEOUT_MS, ShutdownHandler, ShutdownResult (+1 more)

### Community 112 - "config.ts"
Cohesion: 0.28
Nodes (7): DEFAULT_BEHAVIOR_CONFIG, DEFAULT_PERFORMANCE_CONFIG, DEFAULT_SIGNAL_WEIGHTS, getGlobalConfig(), DiscoveryBehaviorConfig, PerformanceConfig, SignalWeightConfig

### Community 116 - "mcp/server.test.ts"
Cohesion: 0.14
Nodes (15): generateConsentDigest(), callTool(), expectIdentical(), FIXTURES, freshRoot(), frozenRoot(), injectionRoot(), inlineConforming() (+7 more)

### Community 117 - "l03.test.ts"
Cohesion: 0.17
Nodes (3): FIXTURES, FIXTURES, FIXTURES

### Community 118 - "discovery.ts"
Cohesion: 0.29
Nodes (6): AnalysisDepth, DiscoveryExecutionMetadata, DiscoveryStatistics, Evidence, ExclusionMetadata, SignalType

### Community 124 - "test-discovery-engine.ts"
Cohesion: 0.53
Nodes (5): mockIndexMetadata, runTests(), testBasicDiscovery(), testDiscoveryWithExclusions(), testEmptyIndexMetadata()

### Community 126 - ".discover"
Cohesion: 0.21
Nodes (13): DomainDiscoveryEngine, testAllDomainsExcluded(), testExampleStructure(), assert(), assertEquals(), runAllTests(), testFallbackOnMaxRetries(), testFallbackOnValidationFailure() (+5 more)

### Community 127 - "orchestrator/src/middleware/security.ts"
Cohesion: 0.47
Nodes (3): defaultConfig, SecurityConfig, SecurityUtils

### Community 130 - "containsPathTraversal"
Cohesion: 0.50
Nodes (5): containsPathTraversal(), isValidFilePath(), safePathValidator, sanitizePath(), validateAndSanitizeFilePath()

### Community 131 - "l08.test.ts"
Cohesion: 0.67
Nodes (3): FIXTURES, inState(), loadBundle()

### Community 186 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, dev, start, test, test:watch

## Knowledge Gaps
- **699 isolated node(s):** `SCRUBBED_ENV_KEYS`, `ExecAuthorization`, `SpecWriterConfig`, `SpecWriteResult`, `GenerateOptions` (+694 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **32 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `EmbeddingEngine` connect `EmbeddingEngine` to `indexer/src/api/IndexController.ts`, `EmbeddingEngine.ts`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Why does `IndexController` connect `indexer/src/api/IndexController.ts` to `IncrementalTracker`, `IndexerServer`, `EmbeddingEngine`, `indexer/src/main.ts`, `VectorIndex`, `Chunker`, `indexer/src/server.ts`, `Scanner`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Why does `PipelineEngine` connect `PipelineEngine` to `PipelineController.ts`, `IndexClient`, `orchestratorCore.ts`, `PipelineExecutionState`, `ModelGateway`, `roleConfigMerger.ts`, `RoleManager`, `discovery/index.ts`, `orchestrator/src/server.ts`, `PipelineEngine.ts`, `Aggregator.ts`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **What connects `SCRUBBED_ENV_KEYS`, `ExecAuthorization`, `SpecWriterConfig` to the rest of the system?**
  _699 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Domain` be split into smaller, more focused modules?**
  _Cohesion score 0.14260249554367202 - nodes in this community are weakly interconnected._
- **Should `schemas/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08506493506493507 - nodes in this community are weakly interconnected._
- **Should `configLoader.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06802721088435375 - nodes in this community are weakly interconnected._