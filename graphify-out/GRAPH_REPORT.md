# Graph Report - llm_council_orchestrator  (2026-08-27)

## Corpus Check
- 341 files · ~254,185 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2609 nodes · 5550 edges · 139 communities (105 shown, 34 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 103 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `4ed78f53`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- test-spec-writer.ts
- schemas/index.ts
- SpecBundle
- configLoader.ts
- ModelCallOptions
- PipelineEngine.ts
- plan.test.ts
- PipelineExecutionState
- engine.ts
- ModelGateway
- cli/index.ts
- Aggregator
- VectorStorage
- validators.ts
- LRUCache
- check.test.ts
- ShutdownManager
- PipelineEngine
- eval/report.ts
- VectorIndex
- CircuitBreakerManager
- dependencies
- indexer/src/server.ts
- shared-config/src/index.ts
- EmbeddingEngine
- indexer/src/api/IndexController.ts
- DiscoveryMetricsCollector
- orchestrator/src/server.ts
- Trace
- SpecBundleSchema
- ScheduledCleanupManager
- LogLevel
- Domain
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
- IndexController
- test-enterprise-features.ts
- Aggregator.ts
- test-utils.ts
- devDependencies
- generate.test.ts
- .discover
- Chunker
- GeminiAdapter
- GracefulDegradationManager
- MCPServer
- orchestrator/src/middleware/security.ts
- compilerOptions
- HealthController.ts
- lintBundle
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
- cli.test.ts
- registerTools.ts
- errorSanitizer.ts
- @fastify/rate-limit
- shared-utils/package.json
- revision.ts
- DiscoveryConfigManager
- discovery/index.ts
- audit-shared-drift.js
- check/runner.ts
- shared-types/src/index.ts
- PipelineStatus
- devDependencies
- l04.test.ts
- Logger
- SignalExtractor
- Scanner
- InvalidRoleError
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
- lint/trace.test.ts
- mcp_bridge/tsconfig.json
- StatsCollector
- shared-types/package.json
- l08.test.ts
- MetricsRegistry
- ShutdownManager.ts
- roleConfigMerger.ts
- adapter.ts
- run-eval.test.ts
- config.ts
- middleware/tracing.ts
- verify-observability.sh
- test-api.sh
- mcp/server.test.ts
- l01.test.ts
- test-fallback.ts
- verify-hardening.sh
- l02.test.ts
- l03.test.ts
- example-pipeline-integration.ts
- l06.test.ts
- l07.test.ts
- PipelineController.ts
- containsPathTraversal
- l10.test.ts
- l12.test.ts
- @llm/shared-config
- ValidationError
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
- `LogEntry` --inherits--> `LogEntry`  [EXTRACTED]
  apps/indexer/src/observability/Logger.ts → packages/shared-utils/src/logger/BaseLogger.ts
- `ProviderAvailabilityResult` --references--> `ApiError`  [EXTRACTED]
  apps/orchestrator/src/pipeline/roleConfigMerger.ts → packages/shared-types/src/errors.ts
- `example()` --calls--> `formatJson()`  [EXTRACTED]
  apps/indexer/example.ts → packages/shared-utils/src/index.ts
- `IndexerConfig` --references--> `LogLevel`  [EXTRACTED]
  apps/indexer/src/main.ts → packages/shared-config/src/index.ts
- `Logger` --inherits--> `BaseLogger`  [EXTRACTED]
  apps/indexer/src/observability/Logger.ts → packages/shared-utils/src/logger/BaseLogger.ts

## Import Cycles
- 3-file cycle: `packages/shared-utils/src/index.ts -> packages/shared-utils/src/logger/index.ts -> packages/shared-utils/src/logger/ConsoleLogger.ts -> packages/shared-utils/src/index.ts`

## Communities (139 total, 34 thin omitted)

### Community 0 - "test-spec-writer.ts"
Cohesion: 0.13
Nodes (19): DomainSpecWriter, pathExists(), SpecWriterConfig, SpecWriteResult, mockDeepDomain, mockDomainWithSpecialChars, mockDomainWithSubDomains, mockExcludedDomain (+11 more)

### Community 1 - "schemas/index.ts"
Cohesion: 0.08
Nodes (34): AssumptionIdSchema, ComplexityProfileSchema, ContractIdSchema, DecisionIdSchema, EvidenceIdSchema, IdSchema, ImpactLevelSchema, RequirementIdSchema (+26 more)

### Community 2 - "SpecBundle"
Cohesion: 0.06
Nodes (50): applyChangeSet(), ApplyResult, ChangeSetSchema, formatIssues(), cleanLint, FIXTURES, CompileResult, freeze() (+42 more)

### Community 3 - "configLoader.ts"
Cohesion: 0.08
Nodes (38): applyEnvironmentOverrides(), ArchitectConfigSchema, ConfigLoaderOptions, DefaultsConfigSchema, EmbeddingConfigSchema, EmbeddingModelConfigSchema, ENV_VAR_MAPPINGS, findConfigPath() (+30 more)

### Community 4 - "ModelCallOptions"
Cohesion: 0.07
Nodes (16): AnthropicOpenRouterAdapter, AnthropicOpenRouterRequest, GeminiOpenRouterAdapter, GeminiOpenRouterRequest, OpenAIOpenRouterAdapter, OpenAIOpenRouterRequest, OpenRouterAdapter, OpenRouterErrorResponse (+8 more)

### Community 5 - "PipelineEngine.ts"
Cohesion: 0.11
Nodes (17): ContextValidationError, DEEP_DOMAIN_ANALYSIS_ROLES, DEFAULT_ROLE_CONFIG, FULL_MODE_ANALYSIS_ROLES, QUICK_MODE_ANALYSIS_ROLES, StepTimeoutError, ActivePipelineRun, DEFAULT_STEP_TIMEOUT_MS (+9 more)

### Community 6 - "plan.test.ts"
Cohesion: 0.11
Nodes (13): cmdPlan(), PlanOptions, PlanResult, PlanTask, renderHuman(), renderJson(), compiledBundle(), FIXTURES (+5 more)

### Community 7 - "PipelineExecutionState"
Cohesion: 0.06
Nodes (22): getNextStepState(), getValidTransitions(), InvalidStateTransitionError, isActiveState(), isTerminalState(), isValidTransition(), PipelineExecutionStateMachine, StateChangeEvent (+14 more)

### Community 8 - "engine.ts"
Cohesion: 0.15
Nodes (18): LintRule, RULES, rule, rule, rule, rule, rule, rule (+10 more)

### Community 9 - "ModelGateway"
Cohesion: 0.05
Nodes (28): ExtendedError, ModelGateway, NON_RETRYABLE_ERROR_PATTERNS, NON_RETRYABLE_HTTP_STATUS_CODES, ProviderStatus, REASONING_PROMPT, RETRYABLE_ERROR_PATTERNS, RETRYABLE_HTTP_STATUS_CODES (+20 more)

### Community 10 - "cli/index.ts"
Cohesion: 0.12
Nodes (28): checkIntent(), cmdGenerate(), DEFAULT_GENERATE_VARIANT, GenerateOptions, GenerateResult, IntentCheck, lintReason(), lintRejections() (+20 more)

### Community 11 - "Aggregator"
Cohesion: 0.26
Nodes (3): Aggregator, AggregationOutput, ModelContribution

### Community 12 - "VectorStorage"
Cohesion: 0.21
Nodes (3): IndexMetadata, VectorStorage, VectorStorageError

### Community 13 - "validators.ts"
Cohesion: 0.05
Nodes (38): containsSqlInjection(), domainIdValidator, EnsureIndexedRequestSchema, EnsureIndexedResponseSchema, ErrorResponseSchema, escapeRegexChars(), extractInvalidRoleName(), IndexStatusQuerySchema (+30 more)

### Community 15 - "check.test.ts"
Cohesion: 0.14
Nodes (15): CheckOutcome, Executor, CheckOptions, CheckResult, cmdCheck(), expectedActual(), renderReport(), evidenceOf() (+7 more)

### Community 17 - "PipelineEngine"
Cohesion: 0.18
Nodes (3): PipelineEngine, PipelineContext, PipelineStepResult

### Community 18 - "eval/report.ts"
Cohesion: 0.11
Nodes (31): BAD, BadFixtureCapture, BadFixtureExpectation, badgeIntentConstraints(), buildMockScripts(), calcs(), deriveBundle(), EvalEvidence (+23 more)

### Community 20 - "CircuitBreakerManager"
Cohesion: 0.09
Nodes (13): CircuitBreakerConfig, CircuitBreakerManager, CircuitBreakerStats, defaultConfig, providerConfigs, ProviderName, DegradationLevel, DEGRADED (+5 more)

### Community 21 - "dependencies"
Cohesion: 0.05
Nodes (39): @opentelemetry/exporter-metrics-otlp-grpc, @opentelemetry/exporter-trace-otlp-grpc, @opentelemetry/resources, @opentelemetry/sdk-metrics, @opentelemetry/sdk-node, @opentelemetry/sdk-trace-base, @opentelemetry/semantic-conventions, dependencies (+31 more)

### Community 22 - "indexer/src/server.ts"
Cohesion: 0.08
Nodes (26): ApiError, ApiErrorResponse, containsPathTraversal(), containsSqlInjection(), ContextApiResponse, ContextRequest, ContextRequestSchema, DEFAULT_CONFIG (+18 more)

### Community 23 - "shared-config/src/index.ts"
Cohesion: 0.17
Nodes (11): OrchestratorCore, PipelineOptions, runOrchestratorPipeline(), PipelineResult, ApiKeyValidationResult, ConfigValidationResult, DEFAULT_PROVIDER_TIMEOUTS, ENDPOINT_TIMEOUTS (+3 more)

### Community 24 - "EmbeddingEngine"
Cohesion: 0.14
Nodes (7): EmbeddingEngine, AVAILABLE_MODELS, DEFAULT_EMBEDDING_MODEL, detectDevice(), getEmbeddingModelFromEnv(), getModelConfig(), ModelConfig

### Community 25 - "indexer/src/api/IndexController.ts"
Cohesion: 0.14
Nodes (17): ContextRequest, ContextResponse, EnsureIndexedRequest, EnsureIndexedResponse, SearchRequest, SearchResponse, StatsResponse, Chunk (+9 more)

### Community 26 - "DiscoveryMetricsCollector"
Cohesion: 0.12
Nodes (10): DiscoveryMetricsCollector, getGlobalMetricsRegistry(), MetricsRegistry, resetGlobalMetricsRegistry(), DiscoveryMetrics, DiscoveryTimingMetrics, DomainQualityMetrics, ReliabilityMetrics (+2 more)

### Community 27 - "orchestrator/src/server.ts"
Cohesion: 0.12
Nodes (13): ProgressController, SpecController, defaultConfig, RateLimitConfig, setupRateLimiting(), setupSecurity(), createServer(), HealthCheckResponse (+5 more)

### Community 28 - "Trace"
Cohesion: 0.12
Nodes (7): PipelineTrace, Trace, TraceSpan, testDiscoveryMetrics(), mockIndexMetadata, runTest(), testTraceSpan()

### Community 29 - "SpecBundleSchema"
Cohesion: 0.10
Nodes (15): EXPECT_GRAMMAR_DOC, EXPECTED_EXIT_PATTERN, isJudgeableExpect(), ClosureFinding, ClosureFindingCode, closureFindings(), DuplicateTaskId, BAD (+7 more)

### Community 30 - "ScheduledCleanupManager"
Cohesion: 0.16
Nodes (7): getGlobalCacheManager(), ActiveRunsCleanupCallback, CLEANUP_DEFAULTS, CLEANUP_INTERVALS, CleanupStats, MemoryStats, ScheduledCleanupManager

### Community 31 - "LogLevel"
Cohesion: 0.13
Nodes (11): IndexerConfig, LogEntry, ServerConfig, LogLevel, DEBUG, ERROR, INFO, WARN (+3 more)

### Community 32 - "Domain"
Cohesion: 0.16
Nodes (10): DOMAIN_MAPPINGS, DomainClassifier, IMPORTANT: Confidence does NOT affect analysisDepth, AnalysisDepth, DiscoveryExecutionMetadata, DiscoveryStatistics, Domain, Evidence (+2 more)

### Community 33 - "eval/runner.ts"
Cohesion: 0.12
Nodes (25): BudgetLedger, LlmUsage, CLASSIFY_RULES, classifyAndProposeSingle(), classifySingle(), CONSTRAINT_FIDELITY, intentBlock(), JSON_ONLY (+17 more)

### Community 34 - "FileMetadata"
Cohesion: 0.11
Nodes (12): FRAMEWORK_PATTERNS, MetadataAnalyzer, ProjectMetadata, ChangeDetectionResult, FileHash, IncrementalTrackerError, LogEntry, Logger (+4 more)

### Community 35 - "IndexClient"
Cohesion: 0.05
Nodes (40): IndexController, EnsureIndexedRequest, IndexStatusQuery, ContextBuilder, ContextBuilderOptions, createContextBuilder(), FormattedContext, RoleType (+32 more)

### Community 36 - "versionNegotiation.ts"
Cohesion: 0.14
Nodes (22): RFC-8594, ApiVersion, clearDeprecatedEndpoints(), createUnsupportedVersionResponse(), DEPRECATED_ENDPOINTS, DeprecatedEndpointConfig, DeprecationHeaders, generateDeprecationHeaders() (+14 more)

### Community 37 - "IndexerServer"
Cohesion: 0.14
Nodes (3): generateCorrelationId(), IndexerServer, main()

### Community 38 - "mcp/server.ts"
Cohesion: 0.05
Nodes (58): DEFAULT_GENERATE_PROFILE, ChangeSet, LevelLoadResult, loadBundleAtLevel(), FIXTURES, SECTION_FILES, tmpDirs, VALIDATION_LEVELS (+50 more)

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
Cohesion: 0.12
Nodes (14): buildSections(), Contract, Decision, EvidenceItem, GlossaryEntry, InitOptions, InitResult, Intent (+6 more)

### Community 43 - "indexer/src/api/openapi.ts"
Cohesion: 0.22
Nodes (4): openApiSpec, openApiSpec, LATEST_STABLE_VERSION, SUPPORTED_VERSIONS

### Community 44 - "intent-fidelity.test.ts"
Cohesion: 0.12
Nodes (11): FIXTURES, U, PipelineOutcome, advisoryInventions(), assertionPasses(), normalizeForTermMatch(), RunUsage, scoreRun() (+3 more)

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

### Community 49 - "Aggregator.ts"
Cohesion: 0.23
Nodes (15): AGGREGATOR_SYSTEM_PROMPT, buildSynthesisUserPrompt(), createFallbackSections(), formatRoleContributions(), formatRoleTitle(), getExpectedSectionIds(), getExpectedSectionTitles(), validateSynthesisResponse() (+7 more)

### Community 50 - "test-utils.ts"
Cohesion: 0.10
Nodes (24): DomainExclusionSchema, RoleConfigsSchema, validateDomainExclusion(), apiKeyArb, chatMessageArb, chatMessagesArb, DEFAULT_NUM_RUNS, domainIdArb (+16 more)

### Community 51 - "devDependencies"
Cohesion: 0.07
Nodes (27): _archival, devDependencies, axios, fast-check, tsx, @types/node, typescript, vite-tsconfig-paths (+19 more)

### Community 52 - "generate.test.ts"
Cohesion: 0.11
Nodes (11): complete(), FAKE_ENV, fetchSpy(), jsonResponse(), PET_CLINIC, SECTION_FILES, SESSION_SERVICE, tmpDirs (+3 more)

### Community 53 - ".discover"
Cohesion: 0.20
Nodes (9): DomainDiscoveryEngine, testAllDomainsExcluded(), mockIndexMetadata, runTests(), testBasicDiscovery(), testDiscoveryWithExclusions(), testEmptyIndexMetadata(), testExampleStructure() (+1 more)

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

### Community 61 - "lintBundle"
Cohesion: 0.06
Nodes (40): applyUnderLock(), ChangeResult, cmdChange(), findingLine(), FIXTURES, frozenSpecRoot(), inlineBundle(), makeSpecRoot() (+32 more)

### Community 62 - "commands/trace.test.ts"
Cohesion: 0.18
Nodes (9): cmdTrace(), renderTrace(), compiledBundle(), FIXTURES, SECTION_FILES, tmpDirs, TraceResult, buildTrace() (+1 more)

### Community 63 - "dependencies"
Cohesion: 0.04
Nodes (44): dependencies, axios, fastify, @fastify/cors, @fastify/helmet, @fastify/rate-limit, @llm/shared-config, @llm/shared-observability (+36 more)

### Community 64 - "dependencies"
Cohesion: 0.12
Nodes (17): dependencies, fastify, @fastify/cors, @fastify/helmet, @llm/shared-observability, @llm/shared-types, @llm/shared-utils, uuid (+9 more)

### Community 66 - "ChatMessage"
Cohesion: 0.15
Nodes (9): OpenAIAdapter, OpenAIErrorResponse, OpenAIMessage, OpenAIRequest, OpenAIResponse, ModelResponse, ProviderAdapter, ProviderConfig (+1 more)

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

### Community 73 - "cli.test.ts"
Cohesion: 0.22
Nodes (3): FIXTURES, SECTION_FILES, tmpDirs

### Community 74 - "registerTools.ts"
Cohesion: 0.28
Nodes (7): Logger, main(), TOOL_DEFINITIONS, MCPError, MCPResponse, MCPToolDefinition, validateDomainExclusion()

### Community 75 - "errorSanitizer.ts"
Cohesion: 0.19
Nodes (10): createFullErrorDetails(), FullErrorDetails, GENERIC_ERROR_MESSAGES, INTERNAL_ERROR_STATUS_CODES, isProduction(), SanitizedError, sanitizeError(), sanitizeErrorObject() (+2 more)

### Community 77 - "shared-utils/package.json"
Cohesion: 0.22
Nodes (8): dependencies, @llm/shared-config, @llm/shared-config, main, name, private, types, version

### Community 78 - "revision.ts"
Cohesion: 0.09
Nodes (27): cmdInit(), SECTION_KEYS, PET_CLINIC, SECTION_FILES, tmpDirs, writeSpecDir(), assertNotSymlink(), acquireSpecRootLock() (+19 more)

### Community 80 - "discovery/index.ts"
Cohesion: 0.21
Nodes (13): exampleHybridCmsDiscovery(), exampleNodejsMicroservicesDiscovery(), examplePhpMonolithDiscovery(), exampleUserExclusionWorkflow(), runAllExamples(), sleep(), SIGNAL_WEIGHTS, DependencyInfo (+5 more)

### Community 81 - "audit-shared-drift.js"
Cohesion: 0.29
Nodes (10): APPS_DIR, AUDIT_DIR, ensureAuditDir(), formatCandidates(), groupBy(), main(), ROOT, scanFile() (+2 more)

### Community 82 - "check/runner.ts"
Cohesion: 0.07
Nodes (35): parseExpect(), REDACTION_RULES, RedactionRule, redactSecrets(), SecretKind, DEFAULT_TIMEOUT_MS, EVIDENCE_FILE_MODE, evidenceRunName() (+27 more)

### Community 83 - "shared-types/src/index.ts"
Cohesion: 0.17
Nodes (11): GeminiContent, GeminiErrorResponse, GeminiGenerationConfig, GeminiPart, GeminiRequest, GeminiResponse, ModelResponseMetadata, RetryableError (+3 more)

### Community 84 - "PipelineStatus"
Cohesion: 0.17
Nodes (11): ExecutionStatus, ERROR, PENDING, RUNNING, SUCCESS, PipelineStatus, CANCELLED, COMPLETED (+3 more)

### Community 85 - "devDependencies"
Cohesion: 0.12
Nodes (17): devDependencies, axios, fast-check, ts-node, @types/node, @types/opossum, @types/uuid, typescript (+9 more)

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
Cohesion: 0.22
Nodes (6): CHINESE_ERROR_TRANSLATIONS, translateErrorMessage(), ZAIErrorResponse, ZAIMessage, ZAIRequest, ZAIResponse

### Community 100 - "ConfigController.ts"
Cohesion: 0.20
Nodes (7): ConfigController, ModelInfo, ModelsResponse, ProviderInfo, RoleInfo, RolesResponse, ModelConfig

### Community 101 - "budget.ts"
Cohesion: 0.10
Nodes (20): BudgetCap, BudgetExceededError, BudgetSpentSnapshot, DEFAULT_WALL_SLACK_MS, MAX_COMPLETIONS, ResolvedRunBudget, resolveRunBudget(), worstCaseAttempts() (+12 more)

### Community 102 - "lint/trace.test.ts"
Cohesion: 0.22
Nodes (7): DecSpec, GOOD, mkBundle(), mkTask(), ReqSpec, TaskSpec, testWith()

### Community 103 - "mcp_bridge/tsconfig.json"
Cohesion: 0.18
Nodes (10): compilerOptions, outDir, rootDir, exclude, extends, include, dist, node_modules (+2 more)

### Community 105 - "shared-types/package.json"
Cohesion: 0.33
Nodes (5): main, name, private, types, version

### Community 106 - "l08.test.ts"
Cohesion: 0.67
Nodes (3): FIXTURES, inState(), loadBundle()

### Community 108 - "ShutdownManager.ts"
Cohesion: 0.20
Nodes (9): CloseConnectionCallback, DrainResult, FlushMetricsCallback, HandlerResult, RegisteredHandler, SHUTDOWN_TIMEOUT_MS, ShutdownHandler, ShutdownResult (+1 more)

### Community 109 - "roleConfigMerger.ts"
Cohesion: 0.19
Nodes (13): extractProvidersFromConfig(), getValidRoleNames(), inferProviderFromModel(), isValidRoleName(), mergeRoleConfigs(), MODEL_PREFIX_TO_PROVIDER, modelConfigToProviderConfig(), normalizeToProviderConfigs() (+5 more)

### Community 110 - "adapter.ts"
Cohesion: 0.42
Nodes (6): LlmCompleteOptions, LlmResponse, createMockLlm(), MockScript, SCRIPT, MockEvalScripts

### Community 111 - "run-eval.test.ts"
Cohesion: 0.26
Nodes (8): DEFAULT_REPORT_PATH, LIVE_ENV_VARS, missingLiveEnv(), parseArgs(), ParsedArgs, runEvalCli(), FAKE_LIVE_ENV, mockRunEvalAll

### Community 112 - "config.ts"
Cohesion: 0.28
Nodes (7): DEFAULT_BEHAVIOR_CONFIG, DEFAULT_PERFORMANCE_CONFIG, DEFAULT_SIGNAL_WEIGHTS, getGlobalConfig(), DiscoveryBehaviorConfig, PerformanceConfig, SignalWeightConfig

### Community 113 - "middleware/tracing.ts"
Cohesion: 0.20
Nodes (6): fastify, FastifyRequest, setupTracing(), tracer, initializeTracing(), TracingConfig

### Community 116 - "mcp/server.test.ts"
Cohesion: 0.13
Nodes (16): EXEC_ROOT_ENV, generateConsentDigest(), callTool(), expectIdentical(), FIXTURES, freshRoot(), frozenRoot(), injectionRoot() (+8 more)

### Community 118 - "test-fallback.ts"
Cohesion: 0.58
Nodes (8): assert(), assertEquals(), runAllTests(), testFallbackOnMaxRetries(), testFallbackOnValidationFailure(), testRetryWithSuccess(), testSuccessfulDiscovery(), testZeroDomainsHandling()

### Community 129 - "PipelineController.ts"
Cohesion: 0.24
Nodes (6): PipelineController, StoredRunEntry, DomainExclusion, RoleConfigsInput, RunPipelineRequest, RunPipelineRequestSchema

### Community 130 - "containsPathTraversal"
Cohesion: 0.50
Nodes (5): containsPathTraversal(), isValidFilePath(), safePathValidator, sanitizePath(), validateAndSanitizeFilePath()

### Community 186 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, dev, start, test, test:watch

## Knowledge Gaps
- **702 isolated node(s):** `name`, `version`, `private`, `main`, `type` (+697 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **34 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ModelGateway` connect `ModelGateway` to `ChatMessage`, `IndexClient`, `ConfigController.ts`, `ModelCallOptions`, `PipelineEngine.ts`, `Aggregator`, `roleConfigMerger.ts`, `Aggregator.ts`, `PipelineEngine`, `orchestrator/src/server.ts`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Why does `Logger` connect `Logger` to `test-spec-writer.ts`, `PipelineController.ts`, `IndexClient`, `PipelineEngine.ts`, `PipelineExecutionState`, `ModelGateway`, `ShutdownManager.ts`, `discovery/index.ts`, `orchestrator/src/server.ts`, `Trace`, `ScheduledCleanupManager`, `LogLevel`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Why does `PipelineEngine` connect `PipelineEngine` to `PipelineController.ts`, `IndexClient`, `PipelineEngine.ts`, `PipelineExecutionState`, `ModelGateway`, `Aggregator`, `roleConfigMerger.ts`, `shared-config/src/index.ts`, `orchestrator/src/server.ts`, `Trace`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _702 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `test-spec-writer.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13257575757575757 - nodes in this community are weakly interconnected._
- **Should `schemas/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08270676691729323 - nodes in this community are weakly interconnected._
- **Should `SpecBundle` be split into smaller, more focused modules?**
  _Cohesion score 0.06057692307692308 - nodes in this community are weakly interconnected._