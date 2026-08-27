# Graph Report - llm_council_orchestrator  (2026-08-27)

## Corpus Check
- 358 files · ~280,876 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2708 nodes · 5727 edges · 147 communities (114 shown, 33 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 104 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a6c8a62e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- test-spec-writer.ts
- schemas/index.ts
- SpecBundle
- configLoader.ts
- models/types.ts
- PipelineEngine.ts
- lifecycle.ts
- PipelineExecutionState
- engine.ts
- ModelGateway
- doctor.ts
- Aggregator.ts
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
- .execute
- EmbeddingEngine.ts
- Domain
- discovery/index.ts
- orchestrator/src/server.ts
- shared-config/src/index.ts
- SpecBundleSchema
- ScheduledCleanupManager
- DiscoveryMetricsCollector
- consent.ts
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
- ModelCallOptions
- intent-fidelity.test.ts
- PipelineState
- spec-core/package.json
- indexer/src/main.ts
- test-enterprise-features.ts
- paths.ts
- test-utils.ts
- devDependencies
- generate.test.ts
- errorSanitizer.ts
- Chunker
- GeminiAdapter.ts
- GracefulDegradationManager
- MCPServer
- SignalExtractor
- compilerOptions
- HealthController.ts
- compileSpecDir
- ModelGateway.ts
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
- ConfigController.ts
- shared-utils/src/index.ts
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
- lintBundle
- Logger
- commands/trace.test.ts
- Scanner
- EmbeddingEngine
- CacheManager
- make-bins-executable.js
- orchestrator/tsconfig.json
- shared-config/package.json
- shared-observability/tsconfig.json
- compilerOptions
- packed-install-smoke.sh
- indexer/tsconfig.json
- check/runner.test.ts
- check.test.ts
- cli/index.ts
- LogLevel
- mcp_bridge/tsconfig.json
- PipelineExecutionStateMachine
- shared-types/package.json
- change.ts
- PipelineController.ts
- containsPathTraversal
- roleConfigMerger.ts
- executionStateMachine.ts
- run-eval.test.ts
- config.ts
- MetricsRegistry
- verify-observability.sh
- test-api.sh
- mcp/server.test.ts
- Trace
- test-fallback.ts
- verify-hardening.sh
- good-fixture-gate.test.ts
- change.test.ts
- cli.test.ts
- fastify
- readiness.ts
- ShutdownManager.ts
- http.test.ts
- write-spec.ts
- ScheduledCleanup.ts
- compile.test.ts
- OpenAIOpenRouterAdapter
- example-pipeline-integration.ts
- InvalidFilePathError
- AnthropicAdapter
- InvalidRoleError
- PathTraversalError
- SqlInjectionError
- ValidationError
- limits.ts
- scripts
- @opentelemetry/api
- opossum

## God Nodes (most connected - your core abstractions)
1. `PipelineEngine` - 60 edges
2. `SpecBundle` - 59 edges
3. `ModelGateway` - 55 edges
4. `ModelCallOptions` - 45 edges
5. `compileSpecDir()` - 36 edges
6. `lintBundle()` - 36 edges
7. `PipelineContext` - 30 edges
8. `ChatMessage` - 29 edges
9. `IndexClient` - 28 edges
10. `LogLevel` - 27 edges

## Surprising Connections (you probably didn't know these)
- `ProviderAvailabilityResult` --references--> `ApiError`  [EXTRACTED]
  apps/orchestrator/src/pipeline/roleConfigMerger.ts → packages/shared-types/src/errors.ts
- `ProviderStatus` --references--> `ProviderType`  [EXTRACTED]
  apps/orchestrator/src/models/ModelGateway.ts → packages/shared-types/src/models.ts
- `StateChangeEvent` --references--> `PipelineExecutionState`  [EXTRACTED]
  apps/orchestrator/src/pipeline/executionStateMachine.ts → packages/shared-types/src/status.ts
- `LogEntry` --inherits--> `LogEntry`  [EXTRACTED]
  apps/orchestrator/src/observability/Logger.ts → packages/shared-utils/src/logger/BaseLogger.ts
- `ServerConfig` --references--> `LogLevel`  [EXTRACTED]
  apps/orchestrator/src/server.ts → packages/shared-config/src/index.ts

## Import Cycles
- 3-file cycle: `packages/shared-utils/src/index.ts -> packages/shared-utils/src/logger/index.ts -> packages/shared-utils/src/logger/ConsoleLogger.ts -> packages/shared-utils/src/index.ts`

## Communities (147 total, 33 thin omitted)

### Community 0 - "test-spec-writer.ts"
Cohesion: 0.13
Nodes (19): DomainSpecWriter, pathExists(), SpecWriterConfig, SpecWriteResult, mockDeepDomain, mockDomainWithSpecialChars, mockDomainWithSubDomains, mockExcludedDomain (+11 more)

### Community 1 - "schemas/index.ts"
Cohesion: 0.09
Nodes (33): AssumptionIdSchema, ComplexityProfileSchema, ContractIdSchema, DecisionIdSchema, EvidenceIdSchema, IdSchema, ImpactLevelSchema, RequirementIdSchema (+25 more)

### Community 2 - "SpecBundle"
Cohesion: 0.10
Nodes (23): cleanLint, FIXTURES, FreezeResult, cleanLint, FIXTURES, frozenPetClinic(), inState(), loadBundle() (+15 more)

### Community 3 - "configLoader.ts"
Cohesion: 0.08
Nodes (38): applyEnvironmentOverrides(), ArchitectConfigSchema, ConfigLoaderOptions, DefaultsConfigSchema, EmbeddingConfigSchema, EmbeddingModelConfigSchema, ENV_VAR_MAPPINGS, findConfigPath() (+30 more)

### Community 4 - "models/types.ts"
Cohesion: 0.09
Nodes (13): AnthropicOpenRouterAdapter, AnthropicOpenRouterRequest, GeminiOpenRouterAdapter, GeminiOpenRouterRequest, OpenAIOpenRouterRequest, OpenRouterAdapter, OpenRouterErrorResponse, OpenRouterMessage (+5 more)

### Community 5 - "PipelineEngine.ts"
Cohesion: 0.13
Nodes (18): AggregationInput, AggregationResult, ContextValidationError, DEEP_DOMAIN_ANALYSIS_ROLES, DEFAULT_ROLE_CONFIG, FULL_MODE_ANALYSIS_ROLES, QUICK_MODE_ANALYSIS_ROLES, StepTimeoutError (+10 more)

### Community 6 - "lifecycle.ts"
Cohesion: 0.14
Nodes (21): freeze(), checkTransition(), FREEZE_REFUSAL_HINTS, LIFECYCLE_STATES, LIFECYCLE_TRANSITIONS, LifecycleFinding, LifecycleFindingCode, LifecycleOperation (+13 more)

### Community 7 - "PipelineExecutionState"
Cohesion: 0.13
Nodes (12): InvalidStateTransitionError, LocalPipelineExecutionState, PipelineExecutionState, AGGREGATING, ANALYZING, CANCELLED, COMPLETED, DISCOVERING (+4 more)

### Community 8 - "engine.ts"
Cohesion: 0.15
Nodes (18): LintRule, RULES, rule, rule, rule, rule, rule, rule (+10 more)

### Community 9 - "ModelGateway"
Cohesion: 0.09
Nodes (12): ModelGateway, ArchitectConfig, ProviderType, ANTHROPIC, ANTHROPIC_OPENROUTER, GEMINI, GEMINI_OPENROUTER, GLM (+4 more)

### Community 10 - "doctor.ts"
Cohesion: 0.11
Nodes (22): BIN_FILES, BUDGET_ENV, checkBins(), checkBudgetEnv(), checkLock(), checkMcpFlags(), checkNodeVersion(), checkProviderEnv() (+14 more)

### Community 11 - "Aggregator.ts"
Cohesion: 0.13
Nodes (14): Aggregator, AGGREGATOR_SYSTEM_PROMPT, buildSynthesisUserPrompt(), createFallbackSections(), formatRoleContributions(), formatRoleTitle(), getExpectedSectionIds(), getExpectedSectionTitles() (+6 more)

### Community 13 - "validators.ts"
Cohesion: 0.07
Nodes (34): containsSqlInjection(), domainIdValidator, EnsureIndexedRequestSchema, EnsureIndexedResponseSchema, ErrorResponseSchema, escapeRegexChars(), extractInvalidRoleName(), IndexStatusQuerySchema (+26 more)

### Community 15 - "version.ts"
Cohesion: 0.36
Nodes (7): checkSpecSchemaVersion(), ParsedVersion, parseVersion(), SPEC_SCHEMA_VERSION, SpecSchemaVersionFieldSchema, SpecSchemaVersionVerdict, SUPPORTED

### Community 17 - "PipelineEngine"
Cohesion: 0.16
Nodes (4): PipelineEngine, PipelineContext, PipelineStepResult, FinalArchitecturalReport

### Community 18 - "eval/report.ts"
Cohesion: 0.10
Nodes (33): createHttpLlm(), BAD, BadFixtureCapture, BadFixtureExpectation, badgeIntentConstraints(), buildMockScripts(), calcs(), captureBadFixtures() (+25 more)

### Community 20 - "CircuitBreakerManager"
Cohesion: 0.09
Nodes (13): CircuitBreakerConfig, CircuitBreakerManager, CircuitBreakerStats, defaultConfig, providerConfigs, ProviderName, DegradationLevel, DEGRADED (+5 more)

### Community 21 - "dependencies"
Cohesion: 0.05
Nodes (39): @opentelemetry/exporter-metrics-otlp-grpc, @opentelemetry/exporter-trace-otlp-grpc, @opentelemetry/resources, @opentelemetry/sdk-metrics, @opentelemetry/sdk-node, @opentelemetry/sdk-trace-base, @opentelemetry/semantic-conventions, dependencies (+31 more)

### Community 22 - "indexer/src/server.ts"
Cohesion: 0.09
Nodes (26): ApiError, ApiErrorResponse, containsPathTraversal(), containsSqlInjection(), ContextApiResponse, ContextRequest, ContextRequestSchema, DEFAULT_CONFIG (+18 more)

### Community 23 - ".execute"
Cohesion: 0.15
Nodes (8): OrchestratorCore, PipelineOptions, runOrchestratorPipeline(), PipelineResult, ApiKeyValidationResult, ConfigValidationResult, PIPELINE_MODES, PipelineMode

### Community 24 - "EmbeddingEngine.ts"
Cohesion: 0.13
Nodes (15): ChunkerConfig, DimensionMismatchError, EmbeddingEngineConfig, EmbeddingRequest, EmbeddingResponse, EmbeddingResult, EXPECTED_EMBEDDING_DIMENSION, AVAILABLE_MODELS (+7 more)

### Community 25 - "Domain"
Cohesion: 0.16
Nodes (10): DOMAIN_MAPPINGS, DomainClassifier, IMPORTANT: Confidence does NOT affect analysisDepth, AnalysisDepth, DiscoveryExecutionMetadata, DiscoveryStatistics, Domain, Evidence (+2 more)

### Community 26 - "discovery/index.ts"
Cohesion: 0.20
Nodes (9): getGlobalMetricsRegistry(), MetricsRegistry, resetGlobalMetricsRegistry(), DiscoveryMetrics, DiscoveryTimingMetrics, DomainQualityMetrics, ReliabilityMetrics, ResourceMetrics (+1 more)

### Community 27 - "orchestrator/src/server.ts"
Cohesion: 0.10
Nodes (16): ProgressController, SpecController, defaultConfig, RateLimitConfig, setupRateLimiting(), defaultConfig, SecurityConfig, SecurityUtils (+8 more)

### Community 28 - "shared-config/src/index.ts"
Cohesion: 0.14
Nodes (11): PipelineTrace, TraceSpan, testDiscoveryMetrics(), mockIndexMetadata, runTest(), testTraceSpan(), DEFAULT_PROVIDER_TIMEOUTS, ENDPOINT_TIMEOUTS (+3 more)

### Community 29 - "SpecBundleSchema"
Cohesion: 0.13
Nodes (10): EXPECT_GRAMMAR_DOC, EXPECTED_EXIT_PATTERN, isJudgeableExpect(), BAD, BadFixtureExpectation, GOOD, rule, SpecBundleForExport (+2 more)

### Community 31 - "DiscoveryMetricsCollector"
Cohesion: 0.21
Nodes (3): DiscoveryMetricsCollector, testMetricsCollection(), testMetricsRegistry()

### Community 32 - "consent.ts"
Cohesion: 0.12
Nodes (27): loadBundleAtLevel(), authorizeExecution(), checkPreviewDigest(), consentDigestLine(), EXEC_OPT_IN_ENV, ExecAuthorization, execOptInFromEnv(), execRootFromEnv() (+19 more)

### Community 33 - "eval/runner.ts"
Cohesion: 0.13
Nodes (24): BudgetLedger, CLASSIFY_RULES, classifyAndProposeSingle(), classifySingle(), CONSTRAINT_FIDELITY, intentBlock(), JSON_ONLY, judgeMerge() (+16 more)

### Community 34 - "FileMetadata"
Cohesion: 0.21
Nodes (7): FRAMEWORK_PATTERNS, MetadataAnalyzer, ProjectMetadata, ChangeDetectionResult, FileMetadata, ScannerConfig, ScannerError

### Community 35 - "IndexClient"
Cohesion: 0.05
Nodes (40): IndexController, EnsureIndexedRequest, IndexStatusQuery, DomainContext, ContextBuilder, ContextBuilderOptions, createContextBuilder(), FormattedContext (+32 more)

### Community 36 - "versionNegotiation.ts"
Cohesion: 0.10
Nodes (26): openApiSpec, openApiSpec, RFC-8594, ApiVersion, clearDeprecatedEndpoints(), createUnsupportedVersionResponse(), DEPRECATED_ENDPOINTS, DeprecatedEndpointConfig (+18 more)

### Community 37 - "IndexerServer"
Cohesion: 0.14
Nodes (3): generateCorrelationId(), IndexerServer, main()

### Community 38 - "mcp/server.ts"
Cohesion: 0.11
Nodes (26): DEFAULT_GENERATE_PROFILE, ExecBoundary, generateOptInFromEnv(), GenerateProfile, GenerateVariant, ARG_SPECS, ArgName, ArgValidator (+18 more)

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
Cohesion: 0.13
Nodes (12): Contract, Decision, EvidenceItem, GlossaryEntry, InitOptions, InitResult, Intent, Requirement (+4 more)

### Community 43 - "ModelCallOptions"
Cohesion: 0.17
Nodes (8): CHINESE_ERROR_TRANSLATIONS, translateErrorMessage(), ZAIAdapter, ZAIErrorResponse, ZAIMessage, ZAIRequest, ZAIResponse, ModelCallOptions

### Community 44 - "intent-fidelity.test.ts"
Cohesion: 0.12
Nodes (11): FIXTURES, U, PipelineOutcome, advisoryInventions(), assertionPasses(), normalizeForTermMatch(), RunUsage, scoreRun() (+3 more)

### Community 45 - "PipelineState"
Cohesion: 0.16
Nodes (14): StateMachine, StateContext, StateTransition, PipelineState, ABORTED, AGGREGATE, ANALYZE, COMPLETED (+6 more)

### Community 46 - "spec-core/package.json"
Cohesion: 0.04
Nodes (45): bin, lco, lco-mcp, dependencies, zod, description, devDependencies, @types/node (+37 more)

### Community 47 - "indexer/src/main.ts"
Cohesion: 0.15
Nodes (5): example(), Indexer, main(), IndexerStats, StatsCollector

### Community 48 - "test-enterprise-features.ts"
Cohesion: 0.44
Nodes (12): initializeGlobalCacheManager(), resetGlobalCacheManager(), initializeGlobalConfig(), resetGlobalConfig(), assert(), assertEquals(), runAllTests(), sleep() (+4 more)

### Community 49 - "paths.ts"
Cohesion: 0.22
Nodes (12): cmdFreeze(), FreezeResult, assertNoSymlinkBelow(), assertWritableSpecDir(), checkMcpDir(), isInside(), McpDirCheck, PathEscapeError (+4 more)

### Community 50 - "test-utils.ts"
Cohesion: 0.11
Nodes (23): DomainExclusionSchema, RoleConfigsSchema, validateDomainExclusion(), apiKeyArb, chatMessageArb, chatMessagesArb, DEFAULT_NUM_RUNS, domainIdArb (+15 more)

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
Cohesion: 0.17
Nodes (9): Logger, main(), TOOL_DEFINITIONS, MCPServer, MCPError, MCPNotification, MCPRequest, MCPResponse (+1 more)

### Community 58 - "SignalExtractor"
Cohesion: 0.27
Nodes (5): SIGNAL_WEIGHTS, SignalExtractor, DependencyInfo, DirectoryNode, Signal

### Community 59 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, declaration, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck (+6 more)

### Community 60 - "HealthController.ts"
Cohesion: 0.10
Nodes (14): HealthCheckResult, HealthController, NOTE: Qdrant is optional and not in the critical data path, setupMetrics(), trackLlmCall(), trackPipelineRun(), trackPipelineStep(), fastify (+6 more)

### Community 61 - "compileSpecDir"
Cohesion: 0.09
Nodes (21): cmdCompile(), compileFailedOutput(), CompileResult, ChildOutcome, CLI_JS, SECTION_FILES, tmpDirs, cmdLint() (+13 more)

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
Cohesion: 0.15
Nodes (9): OpenAIAdapter, OpenAIErrorResponse, OpenAIMessage, OpenAIRequest, OpenAIResponse, ModelResponse, ProviderAdapter, ProviderConfig (+1 more)

### Community 67 - "shared-types/src/index.ts"
Cohesion: 0.09
Nodes (17): AnthropicContentBlockDeltaEvent, AnthropicContentBlockStartEvent, AnthropicErrorEvent, AnthropicErrorResponse, AnthropicMessage, AnthropicMessageDeltaEvent, AnthropicMessageStartEvent, AnthropicRequest (+9 more)

### Community 68 - "eval/runner.test.ts"
Cohesion: 0.15
Nodes (15): LlmAdapter, LlmCompleteOptions, LlmResponse, createMockLlm(), MockScript, SCRIPT, MockEvalScripts, complete() (+7 more)

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

### Community 74 - "shared-utils/src/index.ts"
Cohesion: 0.13
Nodes (12): FileHash, IncrementalTrackerError, LogEntry, LogEntry, DomainExclusionInput, DomainExclusionValidationResult, isValidJustification(), RetryOptions (+4 more)

### Community 75 - "stdio.ts"
Cohesion: 0.10
Nodes (17): killActiveProcessGroups(), EPIPE_DRAIN_TIMEOUT_MS, EXIT_CLIENT_GONE, EXIT_DRAIN_TIMEOUT, EXIT_OK, jsonRpcError(), MAX_FRAME_BYTES, MAX_IN_FLIGHT (+9 more)

### Community 77 - "shared-utils/package.json"
Cohesion: 0.22
Nodes (8): dependencies, @llm/shared-config, @llm/shared-config, main, name, private, types, version

### Community 78 - "revision.ts"
Cohesion: 0.12
Nodes (20): acquireSpecRootLock(), backupPathFor(), breakStaleLock(), createDirAtomically(), DEFAULT_STALE_MS, fsyncDir(), LOCK_FILE, LockHeldError (+12 more)

### Community 80 - "discovery/types.ts"
Cohesion: 0.14
Nodes (20): DomainDiscoveryEngine, exampleHybridCmsDiscovery(), exampleNodejsMicroservicesDiscovery(), examplePhpMonolithDiscovery(), exampleUserExclusionWorkflow(), runAllExamples(), sleep(), testAllDomainsExcluded() (+12 more)

### Community 81 - "audit-shared-drift.js"
Cohesion: 0.29
Nodes (10): APPS_DIR, AUDIT_DIR, ensureAuditDir(), formatCandidates(), groupBy(), main(), ROOT, scanFile() (+2 more)

### Community 82 - "check/runner.ts"
Cohesion: 0.10
Nodes (26): parseExpect(), REDACTION_RULES, RedactionRule, redactSecrets(), SecretKind, activeProcessGroups, CheckOutcome, EVIDENCE_FILE_MODE (+18 more)

### Community 83 - "indexer/src/api/IndexController.ts"
Cohesion: 0.12
Nodes (9): ContextRequest, ContextResponse, EnsureIndexedRequest, EnsureIndexedResponse, IndexController, SearchRequest, SearchResponse, StatsResponse (+1 more)

### Community 84 - "PipelineStatus"
Cohesion: 0.17
Nodes (11): ExecutionStatus, ERROR, PENDING, RUNNING, SUCCESS, PipelineStatus, CANCELLED, COMPLETED (+3 more)

### Community 85 - "devDependencies"
Cohesion: 0.12
Nodes (17): devDependencies, axios, fast-check, ts-node, @types/node, @types/opossum, @types/uuid, typescript (+9 more)

### Community 86 - "lintBundle"
Cohesion: 0.06
Nodes (16): compileLintFreeze(), SECTION_PATHS, tmpDirs, lintBundle(), FIXTURES, FIXTURES, FIXTURES, FIXTURES (+8 more)

### Community 88 - "commands/trace.test.ts"
Cohesion: 0.10
Nodes (16): cmdTrace(), renderTrace(), compiledBundle(), FIXTURES, SECTION_FILES, tmpDirs, TraceResult, buildTrace() (+8 more)

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

### Community 99 - "check/runner.test.ts"
Cohesion: 0.11
Nodes (8): DEFAULT_TIMEOUT_MS, execCommand(), execInProcessGroup(), FakeCall, FIXTURES, PET_CLINIC, tmpDirs, Verification

### Community 100 - "check.test.ts"
Cohesion: 0.17
Nodes (11): evidenceOf(), evidencePath(), FIXTURES, freshRoot(), initRoot(), makeSpecRoot(), SECTION_FILES, tmpDirs (+3 more)

### Community 101 - "cli/index.ts"
Cohesion: 0.07
Nodes (49): Command, COMMANDS, GenerateVariant, InitProfile, parseArgs(), ParseResult, SingleDirCommand, checkIntent() (+41 more)

### Community 102 - "LogLevel"
Cohesion: 0.12
Nodes (10): IndexerConfig, Logger, FastifyRequest, ServerConfig, LogLevel, DEBUG, ERROR, INFO (+2 more)

### Community 103 - "mcp_bridge/tsconfig.json"
Cohesion: 0.18
Nodes (10): compilerOptions, outDir, rootDir, exclude, extends, include, dist, node_modules (+2 more)

### Community 105 - "shared-types/package.json"
Cohesion: 0.33
Nodes (5): main, name, private, types, version

### Community 106 - "change.ts"
Cohesion: 0.15
Nodes (15): applyUnderLock(), ChangeResult, cmdChange(), findingLine(), applyChangeSet(), ApplyResult, ChangeSet, ChangeSetSchema (+7 more)

### Community 107 - "PipelineController.ts"
Cohesion: 0.20
Nodes (6): PipelineController, StoredRunEntry, DomainExclusion, RoleConfigsInput, RunPipelineRequest, RunPipelineRequestSchema

### Community 108 - "containsPathTraversal"
Cohesion: 0.50
Nodes (5): containsPathTraversal(), isValidFilePath(), safePathValidator, sanitizePath(), validateAndSanitizeFilePath()

### Community 109 - "roleConfigMerger.ts"
Cohesion: 0.17
Nodes (14): extractProvidersFromConfig(), getValidRoleNames(), inferProviderFromModel(), isValidRoleName(), mergeRoleConfigs(), MODEL_PREFIX_TO_PROVIDER, modelConfigToProviderConfig(), normalizeToProviderConfigs() (+6 more)

### Community 110 - "executionStateMachine.ts"
Cohesion: 0.19
Nodes (9): getNextStepState(), getValidTransitions(), isActiveState(), isTerminalState(), isValidTransition(), StateChangeEvent, STEP_STATES, VALID_TRANSITIONS (+1 more)

### Community 111 - "run-eval.test.ts"
Cohesion: 0.26
Nodes (8): DEFAULT_REPORT_PATH, LIVE_ENV_VARS, missingLiveEnv(), parseArgs(), ParsedArgs, runEvalCli(), FAKE_LIVE_ENV, mockRunEvalAll

### Community 112 - "config.ts"
Cohesion: 0.28
Nodes (7): DEFAULT_BEHAVIOR_CONFIG, DEFAULT_PERFORMANCE_CONFIG, DEFAULT_SIGNAL_WEIGHTS, getGlobalConfig(), DiscoveryBehaviorConfig, PerformanceConfig, SignalWeightConfig

### Community 116 - "mcp/server.test.ts"
Cohesion: 0.13
Nodes (16): EXEC_ROOT_ENV, generateConsentDigest(), callTool(), expectIdentical(), FIXTURES, freshRoot(), frozenRoot(), injectionRoot() (+8 more)

### Community 118 - "test-fallback.ts"
Cohesion: 0.58
Nodes (8): assert(), assertEquals(), runAllTests(), testFallbackOnMaxRetries(), testFallbackOnValidationFailure(), testRetryWithSuccess(), testSuccessfulDiscovery(), testZeroDomainsHandling()

### Community 124 - "good-fixture-gate.test.ts"
Cohesion: 0.09
Nodes (19): cmdPlan(), PlanOptions, PlanResult, PlanTask, renderHuman(), renderJson(), TopoResult, topoSort() (+11 more)

### Community 125 - "change.test.ts"
Cohesion: 0.22
Nodes (6): FIXTURES, frozenSpecRoot(), inlineBundle(), makeSpecRoot(), SECTION_FILES, tmpDirs

### Community 126 - "cli.test.ts"
Cohesion: 0.22
Nodes (3): FIXTURES, SECTION_FILES, tmpDirs

### Community 128 - "readiness.ts"
Cohesion: 0.50
Nodes (3): evaluateReleaseReadiness(), ReleaseReadiness, ReleaseReadinessInput

### Community 129 - "ShutdownManager.ts"
Cohesion: 0.20
Nodes (9): CloseConnectionCallback, DrainResult, FlushMetricsCallback, HandlerResult, RegisteredHandler, SHUTDOWN_TIMEOUT_MS, ShutdownHandler, ShutdownResult (+1 more)

### Community 130 - "http.test.ts"
Cohesion: 0.25
Nodes (6): createBudgetLedger(), FAKE_ENV, FakeEnv, jsonResponse(), okFetch(), PartialFakeEnv

### Community 131 - "write-spec.ts"
Cohesion: 0.28
Nodes (6): SECTION_KEYS, PET_CLINIC, SECTION_FILES, tmpDirs, writeSpecDir(), assertNotSymlink()

### Community 132 - "ScheduledCleanup.ts"
Cohesion: 0.29
Nodes (5): ActiveRunsCleanupCallback, CLEANUP_DEFAULTS, CLEANUP_INTERVALS, CleanupStats, MemoryStats

### Community 133 - "compile.test.ts"
Cohesion: 0.29
Nodes (3): FIXTURES, SECTION_FILES, tmpDirs

### Community 186 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, dev, start, test, test:watch

## Knowledge Gaps
- **738 isolated node(s):** `ExecutorResult`, `RunChecksOptions`, `RunChecksResult`, `OUTPUT_TAIL_LIMIT`, `EVIDENCE_FILE_MODE` (+733 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **33 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SpecBundle` connect `SpecBundle` to `schemas/index.ts`, `write-spec.ts`, `compile.test.ts`, `lifecycle.ts`, `engine.ts`, `eval/report.ts`, `SpecBundleSchema`, `consent.ts`, `eval/runner.ts`, `intent-fidelity.test.ts`, `generate.test.ts`, `compileSpecDir`, `eval/runner.test.ts`, `check/runner.ts`, `lintBundle`, `commands/trace.test.ts`, `check/runner.test.ts`, `cli/index.ts`, `change.ts`, `good-fixture-gate.test.ts`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `ModelGateway` connect `ModelGateway` to `ChatMessage`, `shared-types/src/index.ts`, `IndexClient`, `PipelineEngine.ts`, `ConfigController.ts`, `Aggregator.ts`, `ModelCallOptions`, `PipelineEngine`, `orchestrator/src/server.ts`, `ModelGateway.ts`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `PipelineEngine` connect `PipelineEngine` to `IndexClient`, `PipelineEngine.ts`, `.isTerminal`, `PipelineExecutionStateMachine`, `ModelGateway`, `Aggregator.ts`, `PipelineController.ts`, `.execute`, `orchestrator/src/server.ts`, `shared-config/src/index.ts`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **What connects `ExecutorResult`, `RunChecksOptions`, `RunChecksResult` to the rest of the system?**
  _738 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `test-spec-writer.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13257575757575757 - nodes in this community are weakly interconnected._
- **Should `schemas/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08506493506493507 - nodes in this community are weakly interconnected._
- **Should `SpecBundle` be split into smaller, more focused modules?**
  _Cohesion score 0.09915966386554621 - nodes in this community are weakly interconnected._