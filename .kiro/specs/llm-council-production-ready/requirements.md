# Requirements Document

## Introduction

This specification defines the implementation roadmap for making the LLM Council Orchestrator production-ready. The system currently has placeholder implementations for critical components including ModelGateway, IndexClient HTTP integration, RoleManager, and Aggregator. This spec combines urgent (P0) and medium-term (P1) actions into a unified implementation plan.

## Glossary

- **ModelGateway**: Unified interface for calling different LLM providers (OpenAI, Anthropic, Z.AI, Gemini)
- **Provider Adapter**: Implementation of provider-specific API communication logic
- **Thinking Mode**: Native or prompt-based reasoning capability for enhanced model responses
- **IndexClient**: HTTP client for communicating with the Indexer service
- **Indexer Service**: Standalone service for code indexing and semantic search (port 9001)
- **RoleManager**: Orchestrates role-based agent execution with model selection
- **Aggregator**: Synthesizes multiple model outputs into unified results using LLM
- **OpenRouter**: Alternative API gateway supporting multiple LLM providers
- **Embedding Model**: Vector embedding model for semantic search (BGE-Large, E5-Large, BGE-M3)
- **Qdrant**: Vector database for storing and searching code embeddings

## Requirements

### Requirement 1: Model Gateway Core Infrastructure

**User Story:** As a developer, I want a unified ModelGateway that can call multiple LLM providers with thinking mode support, so that the orchestrator can execute role-based analysis with different models.

#### Acceptance Criteria

1. WHEN ModelGateway is initialized THEN the system SHALL load provider configurations from architect.config.json
2. WHEN a model call is requested THEN the system SHALL route to the appropriate provider adapter based on provider type
3. WHEN a provider adapter is not registered THEN the system SHALL return an error with code MODEL_PROVIDER_NOT_FOUND
4. WHEN a model supports native thinking mode THEN the system SHALL include thinking parameters in the API request
5. WHEN a model does not support native thinking THEN the system SHALL apply prompt-level reasoning instructions
6. WHEN a model call times out THEN the system SHALL retry with exponential backoff up to MAX_RETRIES times
7. WHEN all retries fail THEN the system SHALL return a ModelResponse with success=false and retryable=false

### Requirement 2: OpenAI Provider Adapter

**User Story:** As a developer, I want an OpenAI provider adapter that supports gpt-5.2 models with reasoning effort configuration, so that I can use OpenAI's latest thinking models.

#### Acceptance Criteria

1. WHEN OpenAIAdapter is instantiated THEN the system SHALL validate API key from environment variable OPENAI_API_KEY
2. WHEN calling gpt-5.2 model THEN the system SHALL include reasoning.effort parameter in the request
3. WHEN reasoning.effort is "high" THEN the system SHALL set the parameter to maximize reasoning depth
4. WHEN reasoning.effort is "xhigh" THEN the system SHALL set the parameter for extended reasoning (aggregator use case)
5. WHEN API returns 429 rate limit THEN the system SHALL mark error as retryable=true
6. WHEN API returns 401 unauthorized THEN the system SHALL mark error as retryable=false
7. WHEN response includes reasoning tokens THEN the system SHALL include them in metadata.tokensUsed

### Requirement 3: Anthropic Provider Adapter

**User Story:** As a developer, I want an Anthropic provider adapter that supports Claude Opus 4.5 and Sonnet 4.5 with thinking budget tokens, so that I can use Anthropic's extended thinking capability.

#### Acceptance Criteria

1. WHEN AnthropicAdapter is instantiated THEN the system SHALL validate API key from environment variable ANTHROPIC_API_KEY
2. WHEN calling claude-opus-4-5 or claude-sonnet-4-5 THEN the system SHALL include thinking.type="enabled" in request
3. WHEN thinking.budget_tokens is specified THEN the system SHALL set max thinking tokens in the request
4. WHEN thinking.budget_tokens is 4096 THEN the system SHALL allow extended reasoning for architect role
5. WHEN thinking.budget_tokens is 2048 THEN the system SHALL allow moderate reasoning for security role
6. WHEN API returns streaming response THEN the system SHALL aggregate chunks into final response
7. WHEN response includes thinking content THEN the system SHALL include it in metadata

### Requirement 4: Z.AI (GLM) Provider Adapter

**User Story:** As a developer, I want a Z.AI provider adapter that supports glm-4.6 with thinking mode, so that I can use GLM models for legacy analysis.

#### Acceptance Criteria

1. WHEN ZAIAdapter is instantiated THEN the system SHALL validate API key from environment variable ZAI_API_KEY
2. WHEN calling glm-4.6 model THEN the system SHALL use base_url https://api.z.ai/api/coding/paas/v4
3. WHEN thinking.type is "enabled" THEN the system SHALL include thinking parameter in request
4. WHEN API response format differs from OpenAI THEN the system SHALL normalize to ModelResponse format
5. WHEN API returns Chinese error messages THEN the system SHALL translate to English in error.message
6. WHEN connection fails THEN the system SHALL mark error as retryable=true
7. WHEN model name is invalid THEN the system SHALL mark error as retryable=false

### Requirement 5: Gemini Provider Adapter

**User Story:** As a developer, I want a Gemini provider adapter that supports gemini-3-pro with thinking mode, so that I can use Google's latest models.

#### Acceptance Criteria

1. WHEN GeminiAdapter is instantiated THEN the system SHALL validate API key from environment variable GEMINI_API_KEY
2. WHEN calling gemini-3-pro model THEN the system SHALL use Google AI Studio API endpoint
3. WHEN thinking mode is enabled THEN the system SHALL include thinking configuration in generationConfig
4. WHEN API uses different message format THEN the system SHALL convert ChatMessage to Gemini format
5. WHEN API returns parts array THEN the system SHALL concatenate text parts into single content string
6. WHEN safety filters block response THEN the system SHALL return error with code CONTENT_FILTERED
7. WHEN quota exceeded THEN the system SHALL mark error as retryable=true

### Requirement 6: OpenRouter Dual Support

**User Story:** As a user, I want to choose between official provider APIs and OpenRouter for each model, so that I can optimize for cost, availability, or rate limits.

#### Acceptance Criteria

1. WHEN a model configuration includes provider="openai-openrouter" THEN the system SHALL use OpenRouter endpoint
2. WHEN OpenRouter is selected THEN the system SHALL use OPENROUTER_API_KEY from environment
3. WHEN OpenRouter request is made THEN the system SHALL include HTTP-Referer and X-Title headers
4. WHEN official provider fails THEN the system SHALL NOT automatically fallback to OpenRouter
5. WHEN user configures both official and OpenRouter keys THEN the system SHALL respect provider field in config
6. WHEN OpenRouter response format differs THEN the system SHALL normalize to ModelResponse format
7. WHEN OpenRouter returns model-specific errors THEN the system SHALL preserve original error codes

### Requirement 7: IndexClient HTTP Integration

**User Story:** As a developer, I want IndexClient to communicate with Indexer service via HTTP, so that orchestrator and indexer can run as separate microservices.

#### Acceptance Criteria

1. WHEN IndexClient is instantiated THEN the system SHALL default to endpoint http://localhost:9001
2. WHEN ensureIndex is called THEN the system SHALL make POST request to /index/ensure with project_root
3. WHEN semanticSearch is called THEN the system SHALL make POST request to /search with query and filters
4. WHEN Indexer service is unreachable THEN the system SHALL return IndexResult with status=FAILED
5. WHEN HTTP request times out after 60 seconds THEN the system SHALL return error with code TIMEOUT_ERROR
6. WHEN API key authentication is enabled THEN the system SHALL include X-API-Key header
7. WHEN response status is 200 THEN the system SHALL parse JSON body into IndexResult or SearchResponse

### Requirement 8: Indexer REST API Service

**User Story:** As a developer, I want Indexer to expose a Fastify REST API on port 9001, so that Orchestrator can trigger indexing and search operations.

#### Acceptance Criteria

1. WHEN Indexer service starts THEN the system SHALL listen on port 9001 with host 0.0.0.0
2. WHEN POST /index/ensure is called THEN the system SHALL validate request body with Zod schema
3. WHEN indexing completes THEN the system SHALL return 200 with filesIndexed count and completedAt timestamp
4. WHEN POST /search is called THEN the system SHALL validate query parameter is non-empty string
5. WHEN search completes THEN the system SHALL return 200 with results array and totalResults count
6. WHEN X-API-Key header is missing THEN the system SHALL return 401 Unauthorized
7. WHEN X-API-Key header is invalid THEN the system SHALL return 403 Forbidden
8. WHEN request body validation fails THEN the system SHALL return 400 with Zod error details

### Requirement 9: Embedding Model Flexibility

**User Story:** As a user, I want to easily switch between embedding models (BGE-Large, E5-Large, BGE-M3) without rebuilding the index, so that I can optimize for hardware and language requirements.

#### Acceptance Criteria

1. WHEN EMBEDDING_MODEL environment variable is set THEN the system SHALL use specified model from AVAILABLE_MODELS
2. WHEN EMBEDDING_MODEL is "local-bge-large-v1.5" THEN the system SHALL use 1024 dimensions
3. WHEN EMBEDDING_MODEL is "multilingual-e5-large-instruct" THEN the system SHALL use 1024 dimensions
4. WHEN EMBEDDING_MODEL is "bge-m3" THEN the system SHALL use 1024 dimensions and 8192 max tokens
5. WHEN embedding model is changed THEN the system SHALL NOT require Qdrant collection recreation
6. WHEN EmbeddingEngine calls embedding endpoint THEN the system SHALL use OpenAI-compatible format
7. WHEN embedding endpoint is http://localhost:8000 THEN the system SHALL make POST to /embeddings

### Requirement 10: RoleManager ModelGateway Integration

**User Story:** As a developer, I want RoleManager to use ModelGateway for executing role-based analysis, so that placeholder model responses are replaced with real LLM outputs.

#### Acceptance Criteria

1. WHEN RoleManager is instantiated THEN the system SHALL inject ModelGateway dependency
2. WHEN executeRole is called THEN the system SHALL resolve models from config using resolveModels method
3. WHEN multiple models are configured for a role THEN the system SHALL call ModelGateway.callModels in parallel
4. WHEN ModelGateway returns success=false THEN the system SHALL include error in RoleResponse
5. WHEN all model calls succeed THEN the system SHALL return RoleResponse with outputs array
6. WHEN role supports dual-model execution THEN the system SHALL execute both models and aggregate outputs
7. WHEN executeRoleForDomains is called THEN the system SHALL execute role for each DEEP domain with domain-specific context

### Requirement 11: Aggregator LLM-Based Synthesis

**User Story:** As a developer, I want Aggregator to use gpt-5.2-pro with extended reasoning to synthesize multiple model outputs, so that final reports are coherent and comprehensive.

#### Acceptance Criteria

1. WHEN Aggregator is instantiated THEN the system SHALL inject ModelGateway dependency
2. WHEN aggregate is called THEN the system SHALL extract contributions from all role responses
3. WHEN aggregating for FULL mode THEN the system SHALL call ModelGateway with aggregator system prompt
4. WHEN calling aggregator model THEN the system SHALL use gpt-5.2-pro with reasoning.effort="xhigh"
5. WHEN model returns synthesis THEN the system SHALL structure into FinalArchitecturalReport sections
6. WHEN synthesis fails THEN the system SHALL fallback to simple concatenation with warning
7. WHEN multiple models provide conflicting outputs THEN the system SHALL instruct LLM to identify conflicts and provide balanced synthesis

### Requirement 12: Security Input Validation

**User Story:** As a developer, I want comprehensive input validation and path sanitization, so that the system is protected against injection attacks and path traversal.

#### Acceptance Criteria

1. WHEN API endpoint receives request THEN the system SHALL validate all parameters with Zod schemas
2. WHEN file path is provided THEN the system SHALL sanitize using path.normalize and validate against project root
3. WHEN path traversal is detected (../) THEN the system SHALL return 400 Bad Request with error code PATH_TRAVERSAL
4. WHEN domain exclusion is provided THEN the system SHALL validate domainId matches pattern ^[a-z0-9_]+_domain$
5. WHEN justification is empty string THEN the system SHALL return 400 with error code VALIDATION_ERROR
6. WHEN SQL-like characters are detected in search query THEN the system SHALL escape or reject input
7. WHEN error occurs in production THEN the system SHALL NOT expose stack traces in API responses

### Requirement 13: Memory Leak Prevention

**User Story:** As a developer, I want automatic cleanup of completed pipeline runs and cached data, so that the system does not accumulate unbounded memory usage.

#### Acceptance Criteria

1. WHEN PipelineController stores activeRuns THEN the system SHALL implement LRU cache with max size 100
2. WHEN pipeline completes THEN the system SHALL schedule cleanup after 1 hour
3. WHEN Trace.cleanup is called THEN the system SHALL keep only last 100 traces
4. WHEN Cache.cleanup is called THEN the system SHALL remove expired entries based on TTL
5. WHEN memory usage exceeds threshold THEN the system SHALL trigger aggressive cleanup
6. WHEN cleanup runs THEN the system SHALL log removed count at DEBUG level
7. WHEN system starts THEN the system SHALL schedule periodic cleanup every 15 minutes

### Requirement 14: Async Operations Refactor

**User Story:** As a developer, I want all file I/O operations to be asynchronous, so that the system does not block the event loop and maintains high throughput.

#### Acceptance Criteria

1. WHEN DomainSpecWriter writes spec file THEN the system SHALL use fs.promises.writeFile instead of fs.writeFileSync
2. WHEN Scanner reads directory THEN the system SHALL use fs.promises.readdir instead of fs.readdirSync
3. WHEN IncrementalTracker loads hashes THEN the system SHALL use fs.promises.readFile instead of fs.readFileSync
4. WHEN multiple files are written THEN the system SHALL use Promise.all for parallel writes
5. WHEN file operation fails THEN the system SHALL propagate error to caller with proper error handling
6. WHEN async operation is awaited THEN the system SHALL not block other concurrent operations
7. WHEN system starts THEN the system SHALL initialize all async resources before accepting requests

### Requirement 15: Configuration Management

**User Story:** As a user, I want to configure all model providers, API keys, and endpoints through environment variables and config files, so that I can deploy to different environments without code changes.

#### Acceptance Criteria

1. WHEN system starts THEN the system SHALL load architect.config.json from project root
2. WHEN environment variable is set THEN the system SHALL override config file values
3. WHEN API key is missing for active provider THEN the system SHALL log warning and mark provider as unavailable
4. WHEN config file is invalid JSON THEN the system SHALL fail startup with clear error message
5. WHEN .env.example is provided THEN the system SHALL document all required environment variables
6. WHEN docker-compose.yml is used THEN the system SHALL mount config files as volumes
7. WHEN config changes THEN the system SHALL require restart (no hot reload for MVP)

### Requirement 16: Rate Limiting

**User Story:** As a system administrator, I want rate limiting on all API endpoints, so that the system is protected against abuse and denial-of-service attacks.

#### Acceptance Criteria

1. WHEN a client exceeds 100 requests per minute THEN the system SHALL return 429 Too Many Requests
2. WHEN rate limit is exceeded THEN the system SHALL include Retry-After header in response
3. WHEN rate limiting is configured THEN the system SHALL use sliding window algorithm
4. WHEN API key is provided THEN the system SHALL track rate limits per API key
5. WHEN API key is not provided THEN the system SHALL track rate limits per IP address
6. WHEN rate limit configuration is changed THEN the system SHALL apply new limits without restart
7. WHEN rate limit is approaching (80%) THEN the system SHALL include X-RateLimit-Remaining header

### Requirement 17: Circuit Breaker Pattern

**User Story:** As a developer, I want circuit breaker protection for external service calls, so that cascading failures are prevented and the system degrades gracefully.

#### Acceptance Criteria

1. WHEN external service fails 5 consecutive times THEN the system SHALL open the circuit breaker
2. WHEN circuit breaker is open THEN the system SHALL return cached response or fallback immediately
3. WHEN circuit breaker is open for 30 seconds THEN the system SHALL transition to half-open state
4. WHEN half-open circuit receives successful response THEN the system SHALL close the circuit
5. WHEN half-open circuit receives failed response THEN the system SHALL reopen the circuit
6. WHEN circuit state changes THEN the system SHALL emit metric event with service name and new state
7. WHEN circuit breaker is configured THEN the system SHALL support per-service threshold configuration

### Requirement 18: Distributed Tracing

**User Story:** As a DevOps engineer, I want distributed tracing across all services, so that I can debug performance issues and track request flows in production.

#### Acceptance Criteria

1. WHEN a request enters the system THEN the system SHALL generate unique trace ID (W3C Trace Context format)
2. WHEN calling downstream services THEN the system SHALL propagate trace ID via traceparent header
3. WHEN span completes THEN the system SHALL record duration, status, and metadata
4. WHEN OpenTelemetry collector is configured THEN the system SHALL export traces via OTLP protocol
5. WHEN error occurs THEN the system SHALL attach error details to current span
6. WHEN trace sampling is configured THEN the system SHALL sample traces at configured rate (default 10%)
7. WHEN service name is configured THEN the system SHALL include service.name attribute in all spans

### Requirement 19: Graceful Shutdown

**User Story:** As a system administrator, I want graceful shutdown handling, so that in-flight requests complete and resources are properly released during deployments.

#### Acceptance Criteria

1. WHEN SIGTERM signal is received THEN the system SHALL stop accepting new requests
2. WHEN shutdown is initiated THEN the system SHALL wait up to 30 seconds for in-flight requests
3. WHEN in-flight requests complete THEN the system SHALL close database connections
4. WHEN shutdown timeout expires THEN the system SHALL force terminate remaining connections
5. WHEN shutdown completes THEN the system SHALL exit with code 0 for clean shutdown
6. WHEN shutdown fails THEN the system SHALL exit with code 1 and log error details
7. WHEN health check is called during shutdown THEN the system SHALL return 503 Service Unavailable

### Requirement 20: Advanced Logging Infrastructure

**User Story:** As a DevOps engineer, I want structured JSON logging with multiple transports, so that logs can be aggregated and analyzed in production monitoring systems.

#### Acceptance Criteria

1. WHEN log event occurs THEN the system SHALL output structured JSON with timestamp, level, message, and context
2. WHEN correlation ID exists THEN the system SHALL include correlationId field in all log entries
3. WHEN file transport is configured THEN the system SHALL write logs to rotating files (max 100MB, 7 days retention)
4. WHEN log level is configured via LOG_LEVEL THEN the system SHALL filter logs below configured level
5. WHEN sensitive data is logged THEN the system SHALL redact API keys, passwords, and PII
6. WHEN error is logged THEN the system SHALL include stack trace and error code
7. WHEN external log aggregator is configured THEN the system SHALL support stdout JSON output for container environments

### Requirement 21: Metrics and Monitoring

**User Story:** As a DevOps engineer, I want Prometheus-compatible metrics exposed, so that I can monitor system health and performance in production dashboards.

#### Acceptance Criteria

1. WHEN GET /metrics is called THEN the system SHALL return Prometheus-format metrics
2. WHEN HTTP request completes THEN the system SHALL record http_request_duration_seconds histogram
3. WHEN model call completes THEN the system SHALL record model_call_duration_seconds histogram with provider label
4. WHEN error occurs THEN the system SHALL increment error_total counter with error_code label
5. WHEN pipeline executes THEN the system SHALL record pipeline_execution_duration_seconds histogram with mode label
6. WHEN memory usage changes THEN the system SHALL expose nodejs_heap_size_bytes gauge
7. WHEN active connections change THEN the system SHALL expose active_connections gauge

### Requirement 22: Health Check Endpoints

**User Story:** As a DevOps engineer, I want comprehensive health check endpoints, so that load balancers and orchestrators can properly manage service instances.

#### Acceptance Criteria

1. WHEN GET /health is called THEN the system SHALL return 200 with status "healthy" if all checks pass
2. WHEN GET /health/live is called THEN the system SHALL return 200 if process is running (liveness probe)
3. WHEN GET /health/ready is called THEN the system SHALL return 200 only if all dependencies are reachable (readiness probe)
4. WHEN dependency check fails THEN the system SHALL return 503 with failed dependency name
5. WHEN health check includes details THEN the system SHALL report uptime, version, and dependency statuses
6. WHEN Qdrant is unreachable THEN the system SHALL mark indexer as not ready
7. WHEN embedding server is unreachable THEN the system SHALL mark indexer as not ready

### Requirement 23: API Versioning

**User Story:** As an API consumer, I want versioned API endpoints, so that breaking changes do not affect existing integrations.

#### Acceptance Criteria

1. WHEN API request is made THEN the system SHALL support /api/v1/ prefix for all endpoints
2. WHEN Accept-Version header is provided THEN the system SHALL route to appropriate version handler
3. WHEN version is not specified THEN the system SHALL default to latest stable version (v1)
4. WHEN deprecated endpoint is called THEN the system SHALL include Deprecation header with sunset date
5. WHEN breaking change is introduced THEN the system SHALL create new version (v2) without modifying v1
6. WHEN API documentation is generated THEN the system SHALL include version in OpenAPI spec
7. WHEN unsupported version is requested THEN the system SHALL return 400 with supported versions list

### Requirement 24: Request Timeout Management

**User Story:** As a developer, I want configurable request timeouts at multiple levels, so that slow operations do not block system resources indefinitely.

#### Acceptance Criteria

1. WHEN HTTP request exceeds server timeout (120s) THEN the system SHALL return 504 Gateway Timeout
2. WHEN model call exceeds provider timeout THEN the system SHALL abort request and return partial result
3. WHEN pipeline step exceeds step timeout THEN the system SHALL skip step and continue with warning
4. WHEN timeout is configured per endpoint THEN the system SHALL respect endpoint-specific timeout
5. WHEN timeout occurs THEN the system SHALL log timeout event with request details
6. WHEN client disconnects THEN the system SHALL cancel in-progress operations (request cancellation)
7. WHEN AbortController signal is triggered THEN the system SHALL propagate cancellation to downstream calls

### Requirement 25: Database Connection Management

**User Story:** As a developer, I want proper connection pooling and management for Qdrant, so that the system handles high concurrency without connection exhaustion.

#### Acceptance Criteria

1. WHEN Qdrant client is initialized THEN the system SHALL create connection pool with max 10 connections
2. WHEN connection is acquired THEN the system SHALL return existing connection from pool if available
3. WHEN all connections are in use THEN the system SHALL queue requests up to 100 pending
4. WHEN queue is full THEN the system SHALL return 503 with error code CONNECTION_POOL_EXHAUSTED
5. WHEN connection is idle for 60 seconds THEN the system SHALL close and remove from pool
6. WHEN connection fails THEN the system SHALL remove from pool and create new connection
7. WHEN pool health is checked THEN the system SHALL report active, idle, and pending connection counts

### Requirement 26: PipelineEngine Step Orchestration

**User Story:** As a developer, I want PipelineEngine to orchestrate all pipeline steps (INDEX, DISCOVER, ANALYZE, AGGREGATE) with proper state management, so that the full analysis pipeline executes end-to-end with real implementations.

#### Acceptance Criteria

1. WHEN pipeline mode is FULL THEN the system SHALL execute steps in order: INDEX → DISCOVER → ANALYZE → AGGREGATE
2. WHEN pipeline mode is QUICK THEN the system SHALL execute steps: INDEX → ANALYZE (skip DISCOVER)
3. WHEN INDEX step executes THEN the system SHALL call IndexClient.ensureIndex and wait for completion
4. WHEN INDEX step fails THEN the system SHALL abort pipeline and return error with step context
5. WHEN ANALYZE step executes THEN the system SHALL call RoleManager.executeRole for each configured role
6. WHEN ANALYZE step executes for DEEP domains THEN the system SHALL call RoleManager.executeRoleForDomains with domain context
7. WHEN AGGREGATE step executes THEN the system SHALL call Aggregator.aggregate with all role responses
8. WHEN any step fails THEN the system SHALL record failure in trace span with error details

### Requirement 27: PipelineEngine State Machine

**User Story:** As a developer, I want PipelineEngine to use a proper state machine for step transitions, so that pipeline execution is predictable and debuggable.

#### Acceptance Criteria

1. WHEN pipeline starts THEN the system SHALL transition state from IDLE to RUNNING
2. WHEN step completes successfully THEN the system SHALL transition to next step state
3. WHEN step fails THEN the system SHALL transition to FAILED state
4. WHEN all steps complete THEN the system SHALL transition to COMPLETED state
5. WHEN state transition occurs THEN the system SHALL emit state change event with previous and new state
6. WHEN invalid state transition is attempted THEN the system SHALL throw InvalidStateTransitionError
7. WHEN pipeline is cancelled THEN the system SHALL transition to CANCELLED state and cleanup resources

### Requirement 28: PipelineEngine Context Management

**User Story:** As a developer, I want PipelineEngine to maintain execution context across steps, so that each step has access to results from previous steps.

#### Acceptance Criteria

1. WHEN INDEX step completes THEN the system SHALL store IndexMetadata in pipeline context
2. WHEN DISCOVER step completes THEN the system SHALL store DiscoveryResult in pipeline context
3. WHEN ANALYZE step completes THEN the system SHALL store RoleResponse array in pipeline context
4. WHEN step accesses context THEN the system SHALL provide read-only access to previous step results
5. WHEN context is updated THEN the system SHALL validate required fields are present
6. WHEN pipeline completes THEN the system SHALL include full context in PipelineResult
7. WHEN pipeline fails mid-execution THEN the system SHALL include partial context in error response

