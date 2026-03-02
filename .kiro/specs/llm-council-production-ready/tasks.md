# Implementation Plan

- [x] 1. Setup project infrastructure and configuration
  - Create environment variable template (.env.example)
  - Update architect.config.json with new model configurations
  - Add Vitest test framework configuration
  - Setup fast-check for property-based testing
  - _Requirements: 15.5_

- [ ] 2. Implement ModelGateway core infrastructure
  - [x] 2.1 Create ProviderAdapter interface
    - Define call() method signature
    - Add supportsThinking() method
    - Add getThinkingConfig() method
    - _Requirements: 1.1, 1.2_
  
  - [x] 2.2 Refactor ModelGateway to use provider registry
    - Replace placeholder logic with provider routing
    - Implement registerProvider() method
    - Add provider availability checking
    - _Requirements: 1.2, 1.3_
  
  - [x] 2.3 Implement thinking mode handling
    - Add native thinking parameter injection
    - Add prompt-based reasoning fallback
    - Include thinking tokens in metadata
    - _Requirements: 1.4, 1.5_
  
  - [x] 2.4 Enhance retry logic with exponential backoff
    - Implement retryable error detection
    - Add exponential backoff calculation
    - Update error response format
    - _Requirements: 1.6, 1.7_

- [ ] 3. Implement OpenAI provider adapter
  - [x] 3.1 Create OpenAIAdapter class
    - Implement ProviderAdapter interface
    - Add API key validation from OPENAI_API_KEY
    - Setup Axios HTTP client with base URL
    - _Requirements: 2.1_
  
  - [x] 3.2 Add reasoning effort support
    - Map reasoning.effort to API parameters
    - Handle "high" and "xhigh" effort levels
    - Include reasoning tokens in response metadata
    - _Requirements: 2.2, 2.3, 2.4, 2.7_
  
  - [x] 3.3 Implement error handling
    - Detect 429 rate limit (retryable=true)
    - Detect 401 unauthorized (retryable=false)
    - Normalize error responses to ModelResponse
    - _Requirements: 2.5, 2.6_

- [ ] 4. Implement Anthropic provider adapter
  - [x] 4.1 Create AnthropicAdapter class
    - Implement ProviderAdapter interface
    - Add API key validation from ANTHROPIC_API_KEY
    - Setup Axios HTTP client with x-api-key header
    - _Requirements: 3.1_
  
  - [x] 4.2 Add thinking budget tokens support
    - Include thinking.type="enabled" in requests
    - Set thinking.budget_tokens parameter
    - Handle 4096 tokens for architect role
    - Handle 2048 tokens for security role
    - _Requirements: 3.2, 3.3, 3.4, 3.5_
  
  - [x] 4.3 Implement streaming response handling
    - Parse SSE (Server-Sent Events) chunks
    - Aggregate chunks into final response
    - Extract thinking content from metadata
    - _Requirements: 3.6, 3.7_

- [ ] 5. Implement Z.AI (GLM) provider adapter
  - [x] 5.1 Create ZAIAdapter class
    - Implement ProviderAdapter interface
    - Add API key validation from ZAI_API_KEY
    - Setup Axios with base_url https://api.z.ai/api/coding/paas/v4
    - _Requirements: 4.1, 4.2_
  
  - [x] 5.2 Add thinking mode support
    - Include thinking.type="enabled" parameter
    - Handle Z.AI-specific thinking format
    - _Requirements: 4.3_
  
  - [x] 5.3 Implement response normalization
    - Convert Z.AI response format to ModelResponse
    - Translate Chinese error messages to English
    - Handle connection failures (retryable=true)
    - _Requirements: 4.4, 4.5, 4.6, 4.7_

- [ ] 6. Implement Gemini provider adapter
  - [x] 6.1 Create GeminiAdapter class
    - Implement ProviderAdapter interface
    - Add API key validation from GEMINI_API_KEY
    - Setup Axios with Google AI Studio endpoint
    - _Requirements: 5.1, 5.2_
  
  - [x] 6.2 Add thinking configuration support
    - Include thinking config in generationConfig
    - Handle Gemini-specific thinking parameters
    - _Requirements: 5.3_
  
  - [x] 6.3 Implement message format conversion
    - Convert ChatMessage to Gemini parts format
    - Concatenate parts array into single content string
    - Handle safety filter blocks (CONTENT_FILTERED error)
    - Handle quota exceeded (retryable=true)
    - _Requirements: 5.4, 5.5, 5.6, 5.7_

- [ ] 7. Implement OpenRouter dual support
  - [x] 7.1 Create OpenRouter adapter variants
    - Create OpenAIOpenRouterAdapter
    - Create AnthropicOpenRouterAdapter
    - Create ZAIOpenRouterAdapter
    - Create GeminiOpenRouterAdapter
    - _Requirements: 6.1, 6.2_
  
  - [x] 7.2 Add OpenRouter-specific headers
    - Include HTTP-Referer header
    - Include X-Title header
    - Use OPENROUTER_API_KEY for authentication
    - _Requirements: 6.3_
  
  - [x] 7.3 Implement provider selection logic
    - Parse provider field from config (e.g., "openai-openrouter")
    - Route to appropriate adapter based on suffix
    - Respect manual provider selection (no auto-fallback)
    - _Requirements: 6.4, 6.5_
  
  - [x] 7.4 Add response normalization
    - Handle OpenRouter response format differences
    - Preserve original error codes
    - Map OpenRouter model IDs
    - _Requirements: 6.6, 6.7_

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Implement IndexClient HTTP integration
  - [x] 9.1 Create HTTP client with Axios
    - Setup Axios instance with base URL http://localhost:9001
    - Add X-API-Key header from INDEXER_API_KEY
    - Set timeout to 60 seconds
    - _Requirements: 7.1, 7.6_
  
  - [x] 9.2 Implement ensureIndex method
    - Make POST request to /index/ensure
    - Send project_root and force_rebuild parameters
    - Parse IndexResult from response
    - Handle service unreachable (status=FAILED)
    - _Requirements: 7.2, 7.4_
  
  - [x] 9.3 Implement semanticSearch method
    - Make POST request to /search
    - Send query, limit, and filters parameters
    - Parse SearchResponse from response
    - Handle timeout errors (TIMEOUT_ERROR)
    - _Requirements: 7.3, 7.5_
  
  - [x] 9.4 Add retry logic with exponential backoff
    - Retry on network errors (3 attempts)
    - Implement exponential backoff (1s, 2s, 4s)
    - Return error after all retries exhausted
    - _Requirements: 7.7_

- [ ] 10. Implement Indexer REST API service
  - [x] 10.1 Setup Fastify server
    - Initialize Fastify instance
    - Configure to listen on port 9001, host 0.0.0.0
    - Add health check endpoint GET /health
    - _Requirements: 8.1, 8.8_
  
  - [x] 10.2 Implement API key authentication middleware
    - Check X-API-Key header on all endpoints except /health
    - Return 401 if header missing
    - Return 403 if header invalid
    - Compare against INDEXER_API_KEY environment variable
    - _Requirements: 8.6, 8.7_
  
  - [x] 10.3 Implement POST /index/ensure endpoint
    - Add Zod schema validation for request body
    - Call IndexController.ensureIndexed
    - Return 200 with filesIndexed and completedAt
    - Return 400 on validation errors with Zod details
    - _Requirements: 8.2, 8.3, 8.8_
  
  - [x] 10.4 Implement POST /search endpoint
    - Add Zod schema validation for request body
    - Validate query parameter is non-empty
    - Call IndexController.search
    - Return 200 with results array and totalResults
    - _Requirements: 8.4, 8.5_
  
  - [x] 10.5 Add error handling middleware
    - Catch all unhandled errors
    - Return structured error responses
    - Log errors with correlation IDs
    - _Requirements: 8.8_

- [ ] 11. Implement embedding model flexibility
  - [x] 11.1 Update model configuration
    - Add multilingual-e5-large-instruct to AVAILABLE_MODELS
    - Add bge-m3 to AVAILABLE_MODELS
    - Ensure all models use 1024 dimensions
    - _Requirements: 9.2, 9.3, 9.4_
  
  - [x] 11.2 Add environment variable support
    - Read EMBEDDING_MODEL environment variable
    - Default to "local-bge-large-v1.5" if not set
    - Validate model exists in AVAILABLE_MODELS
    - _Requirements: 9.1_
  
  - [x] 11.3 Refactor EmbeddingEngine to use HTTP client
    - Replace pseudo-embedding with HTTP POST to /embeddings
    - Use OpenAI-compatible request format
    - Set endpoint to http://localhost:8000 (configurable via EMBEDDING_URL)
    - Handle batch size of 32 chunks per request
    - _Requirements: 9.6, 9.7_
  
  - [x] 11.4 Add dimension consistency validation
    - Verify all models return 1024-dimensional vectors
    - Throw error if dimension mismatch detected
    - Log warning if model change detected
    - _Requirements: 9.5_

- [ ] 12. Integrate RoleManager with ModelGateway
  - [x] 12.1 Add ModelGateway dependency injection
    - Update RoleManager constructor to accept ModelGateway
    - Remove placeholder executeModels method
    - _Requirements: 10.1_
  
  - [x] 12.2 Implement real model execution
    - Call ModelGateway.callModels for parallel execution
    - Pass resolved models from config
    - Include role-specific system prompt
    - _Requirements: 10.2, 10.3_
  
  - [x] 12.3 Handle model call failures
    - Check ModelResponse.success for each output
    - Include errors in RoleResponse
    - Continue execution if some models succeed
    - _Requirements: 10.4_
  
  - [x] 12.4 Implement dual-model aggregation
    - Detect dual-model roles (legacy_analysis, architect)
    - Execute both models in parallel
    - Include both outputs in RoleResponse.outputs array
    - _Requirements: 10.5, 10.6_
  
  - [x] 12.5 Add domain-specific context support
    - Implement executeRoleForDomains method
    - Filter to DEEP domains only
    - Retrieve domain context via RAG
    - Tag responses with domainId
    - _Requirements: 10.7_

- [ ] 13. Implement LLM-based Aggregator
  - [x] 13.1 Add ModelGateway dependency injection
    - Update Aggregator constructor to accept ModelGateway
    - Remove placeholder aggregation methods
    - _Requirements: 11.1_
  
  - [x] 13.2 Implement contribution extraction
    - Extract ModelContribution from all RoleResponse outputs
    - Calculate weights based on role and model
    - Group contributions by role
    - _Requirements: 11.2_
  
  - [x] 13.3 Create synthesis prompt template
    - Design system prompt for aggregator role
    - Include instructions for consensus identification
    - Include instructions for conflict resolution
    - Specify FinalArchitecturalReport output format
    - _Requirements: 11.7_
  
  - [x] 13.4 Implement LLM synthesis for FULL mode
    - Call ModelGateway with gpt-5.2-pro
    - Set reasoning.effort="xhigh"
    - Set temperature=0.3 for deterministic output
    - Parse response into FinalArchitecturalReport sections
    - _Requirements: 11.3, 11.4, 11.5_
  
  - [x] 13.5 Add fallback strategy
    - Detect synthesis failures (timeout, error)
    - Log warning with error details
    - Fallback to simple concatenation
    - Include warning in report metadata
    - _Requirements: 11.6_

- [ ] 14. Implement PipelineEngine step orchestration
  - [x] 14.1 Implement INDEX step execution
    - Call IndexClient.ensureIndex with project root
    - Wait for indexing completion
    - Store IndexMetadata in pipeline context
    - Handle indexing failures with proper error context
    - _Requirements: 26.3, 26.4, 28.1_
  
  - [x] 14.2 Implement ANALYZE step execution
    - Call RoleManager.executeRole for each configured role
    - Execute roles in parallel where possible
    - Store RoleResponse array in pipeline context
    - Handle partial failures (continue if some roles succeed)
    - _Requirements: 26.5, 28.3_
  
  - [x] 14.3 Implement ANALYZE step for DEEP domains
    - Call RoleManager.executeRoleForDomains with domain context
    - Filter to DEEP domains only from DiscoveryResult
    - Retrieve domain-specific context via RAG (IndexClient.semanticSearch)
    - Tag responses with domainId
    - _Requirements: 26.6_
  
  - [x] 14.4 Implement AGGREGATE step execution
    - Call Aggregator.aggregate with all role responses
    - Pass pipeline mode for aggregation strategy selection
    - Store FinalArchitecturalReport in pipeline context
    - Handle aggregation failures with fallback
    - _Requirements: 26.7_
  
  - [x] 14.5 Implement step failure handling
    - Record failure in trace span with error details
    - Abort pipeline on critical step failure (INDEX)
    - Continue with warning on non-critical failures
    - Include partial results in error response
    - _Requirements: 26.4, 26.8, 28.7_

- [ ] 15. Implement PipelineEngine state machine
  - [x] 15.1 Create PipelineState enum and transitions
    - Define states: IDLE, RUNNING, INDEXING, DISCOVERING, ANALYZING, AGGREGATING, COMPLETED, FAILED, CANCELLED
    - Define valid transitions between states
    - Implement transition validation
    - _Requirements: 27.1, 27.2, 27.3, 27.4_
  
  - [x] 15.2 Implement state transition logic
    - Transition IDLE → RUNNING on pipeline start
    - Transition through step states on step completion
    - Transition to FAILED on step failure
    - Transition to COMPLETED when all steps done
    - _Requirements: 27.2, 27.3, 27.4_
  
  - [x] 15.3 Add state change events
    - Emit state change event with previous and new state
    - Include timestamp and step context
    - Log state transitions at INFO level
    - _Requirements: 27.5_
  
  - [x] 15.4 Implement invalid transition handling
    - Throw InvalidStateTransitionError on invalid transition
    - Include current state and attempted transition in error
    - Log invalid transition attempts at WARN level
    - _Requirements: 27.6_
  
  - [x] 15.5 Implement pipeline cancellation
    - Handle cancellation request during execution
    - Transition to CANCELLED state
    - Cleanup in-progress operations
    - Release resources
    - _Requirements: 27.7_

- [x] 16. Implement PipelineEngine context management
  - [x] 16.1 Create PipelineContext interface
    - Define fields for each step result (indexMetadata, discoveryResult, roleResponses, finalReport)
    - Include pipeline metadata (runId, mode, startedAt)
    - Include user configuration and exclusions
    - _Requirements: 28.1, 28.2, 28.3_
  
  - [x] 16.2 Implement context updates after each step
    - Store IndexMetadata after INDEX step
    - Store DiscoveryResult after DISCOVER step
    - Store RoleResponse array after ANALYZE step
    - Validate required fields before storing
    - _Requirements: 28.1, 28.2, 28.3, 28.5_
  
  - [x] 16.3 Implement read-only context access
    - Provide getContext method for step access
    - Return immutable copy of context
    - Prevent direct mutation of context
    - _Requirements: 28.4_
  
  - [x] 16.4 Include context in pipeline result
    - Include full context in successful PipelineResult
    - Include partial context in error response
    - Include execution metadata (duration, steps completed)
    - _Requirements: 28.6, 28.7_

- [x] 17. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 18. Implement security input validation
  - [x] 18.1 Add Zod schemas for all API endpoints
    - Create schemas for RunPipelineRequest
    - Create schemas for IndexRequest
    - Create schemas for SearchRequest
    - Add custom validators for domain-specific rules
    - _Requirements: 12.1_
  
  - [x] 18.2 Implement path sanitization utility
    - Create sanitizePath function with path.normalize
    - Validate resolved path starts with project root
    - Throw PathTraversalError if traversal detected
    - _Requirements: 12.2, 12.3_
  
  - [x] 18.3 Add domain ID validation
    - Validate domainId matches pattern ^[a-z0-9_]+_domain$
    - Validate justification is non-empty string
    - Return 400 VALIDATION_ERROR on failure
    - _Requirements: 12.4, 12.5_
  
  - [x] 18.4 Implement input escaping
    - Escape special regex characters in search queries
    - Validate file paths against whitelist
    - Reject SQL-like characters if detected
    - _Requirements: 12.6_
  
  - [x] 18.5 Add error sanitization
    - Strip stack traces in production mode
    - Check NODE_ENV environment variable
    - Always log full errors internally
    - Return generic error messages to clients
    - _Requirements: 12.7_

- [ ] 19. Implement memory leak prevention
  - [x] 19.1 Create LRU cache implementation
    - Implement LRUCache class with maxSize=100
    - Add eviction logic for oldest entries
    - Use Map for O(1) access
    - _Requirements: 13.1_
  
  - [x] 19.2 Replace activeRuns Map with LRU cache
    - Update PipelineController to use LRUCache
    - Set maxSize to 100 runs
    - Add automatic eviction on overflow
    - _Requirements: 13.1_
  
  - [x] 19.3 Implement scheduled cleanup
    - Schedule trace cleanup every 15 minutes
    - Schedule cache cleanup every 15 minutes
    - Schedule active runs cleanup every 1 hour
    - Use setInterval with unref() to prevent blocking
    - _Requirements: 13.2, 13.3, 13.4, 13.6_
  
  - [x] 19.4 Add memory monitoring
    - Log memory usage every 5 minutes at INFO level
    - Calculate heap usage percentage
    - Trigger aggressive cleanup if usage > 80%
    - Emit warning if cleanup removes > 50 items
    - _Requirements: 13.5_
  
  - [x] 19.5 Implement cleanup logging
    - Log removed count at DEBUG level
    - Include cleanup type (trace, cache, runs)
    - Include timestamp and duration
    - _Requirements: 13.6_

- [ ] 20. Refactor to async operations
  - [x] 20.1 Refactor DomainSpecWriter to async
    - Replace fs.writeFileSync with fs.promises.writeFile
    - Update writeDomainSpec to async/await
    - Update writeExclusionRecord to async/await
    - Update writeMasterIndex to async/await
    - _Requirements: 14.1_
  
  - [x] 20.2 Refactor Scanner to async
    - Replace fs.readdirSync with fs.promises.readdir
    - Replace fs.statSync with fs.promises.stat
    - Update scan method to async/await
    - Update scanDirectory to async/await
    - _Requirements: 14.2_
  
  - [x] 20.3 Refactor IncrementalTracker to async
    - Replace fs.readFileSync with fs.promises.readFile
    - Replace fs.writeFileSync with fs.promises.writeFile
    - Update load method to async/await
    - Update save method to async/await
    - _Requirements: 14.3_
  
  - [x] 20.4 Add parallel file operations
    - Use Promise.all for multiple file writes
    - Use Promise.all for multiple file reads
    - Ensure proper error handling for parallel ops
    - _Requirements: 14.4_
  
  - [x] 20.5 Update error handling for async
    - Propagate errors to callers with try/catch
    - Add proper error context in catch blocks
    - Ensure no unhandled promise rejections
    - _Requirements: 14.5_
  
  - [x] 20.6 Verify non-blocking behavior
    - Test concurrent operations don't block
    - Verify event loop is not blocked during I/O
    - Add performance benchmarks
    - _Requirements: 14.6_

- [ ] 21. Implement configuration management
  - [x] 21.1 Create .env.example template
    - Document all required environment variables
    - Include API keys for all providers
    - Include service URLs (Indexer, Embedding, Qdrant)
    - Include optional configuration variables
    - _Requirements: 15.5_
  
  - [x] 21.2 Update architect.config.json
    - Replace placeholder model names with real configs
    - Add provider field for each model
    - Add thinking/reasoning configuration
    - Add base_url for Z.AI provider
    - _Requirements: 15.1_
  
  - [x] 21.3 Implement environment variable override
    - Load config from architect.config.json
    - Override with environment variables if set
    - Validate required variables are present
    - _Requirements: 15.2_
  
  - [x] 21.4 Add API key validation
    - Check API keys for active providers on startup
    - Log warning if key is missing
    - Mark provider as unavailable if key missing
    - _Requirements: 15.3_
  
  - [x] 21.5 Implement config validation
    - Validate JSON syntax on load
    - Fail startup with clear error if invalid
    - Validate model names exist for providers
    - _Requirements: 15.4_
  
  - [x] 21.6 Create docker-compose.yml
    - Define services: orchestrator, indexer, embedding, qdrant
    - Mount config files as volumes
    - Set environment variables
    - Configure service dependencies
    - _Requirements: 15.6_
  
  - [x] 21.7 Document configuration
    - Add README section for configuration
    - Document all environment variables
    - Provide example configurations
    - Document restart requirement for config changes
    - _Requirements: 15.7_

- [x] 22. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ]* 23. Implement rate limiting (Phase 2 - Optional)
  - [ ] 23.1 Create rate limiter middleware
    - Implement sliding window algorithm
    - Track requests per API key or IP address
    - Set default limit to 100 requests per minute
    - _Requirements: 16.1, 16.3, 16.4, 16.5_
  
  - [ ] 23.2 Add rate limit response headers
    - Include X-RateLimit-Limit header
    - Include X-RateLimit-Remaining header
    - Include X-RateLimit-Reset header
    - Include Retry-After header on 429 responses
    - _Requirements: 16.2, 16.7_
  
  - [ ] 23.3 Implement configurable rate limits
    - Load rate limit config from environment
    - Support per-endpoint rate limit overrides
    - Apply new limits without restart
    - _Requirements: 16.6_

  - [ ]* 23.4 Write property test for rate limiting
    - **Property 16: Rate Limit Enforcement**
    - **Validates: Requirements 16.1, 16.3**

- [ ]* 24. Implement circuit breaker pattern (Phase 2 - Optional)
  - [ ] 24.1 Create CircuitBreaker class
    - Implement CLOSED, OPEN, HALF-OPEN states
    - Track consecutive failures per service
    - Set failure threshold to 5
    - _Requirements: 17.1, 17.2_
  
  - [ ] 24.2 Implement state transitions
    - Open circuit after 5 consecutive failures
    - Transition to half-open after 30 seconds
    - Close circuit on successful half-open request
    - Reopen on failed half-open request
    - _Requirements: 17.3, 17.4, 17.5_
  
  - [ ] 24.3 Add circuit breaker metrics
    - Emit metric event on state change
    - Include service name and new state
    - Track failure counts per service
    - _Requirements: 17.6_
  
  - [ ] 24.4 Implement per-service configuration
    - Support custom thresholds per service
    - Support custom timeout per service
    - Load config from architect.config.json
    - _Requirements: 17.7_

  - [ ]* 24.5 Write property test for circuit breaker
    - **Property 17: Circuit Breaker State Transitions**
    - **Validates: Requirements 17.1, 17.3, 17.4, 17.5**

- [ ]* 25. Implement distributed tracing (Phase 2 - Optional)
  - [ ] 25.1 Setup OpenTelemetry SDK
    - Initialize TracerProvider
    - Configure OTLP exporter
    - Set service name from config
    - _Requirements: 18.4, 18.7_
  
  - [ ] 25.2 Implement trace context propagation
    - Generate W3C Trace Context trace ID
    - Propagate traceparent header to downstream calls
    - Extract trace context from incoming requests
    - _Requirements: 18.1, 18.2_
  
  - [ ] 25.3 Add span instrumentation
    - Create spans for HTTP handlers
    - Create spans for model calls
    - Create spans for pipeline steps
    - Record duration and status
    - _Requirements: 18.3_
  
  - [ ] 25.4 Implement error recording
    - Attach error details to current span
    - Set span status to ERROR on failure
    - Include error type and message
    - _Requirements: 18.5_
  
  - [ ] 25.5 Configure trace sampling
    - Implement configurable sampling rate
    - Default to 10% sampling
    - Support 100% sampling for errors
    - _Requirements: 18.6_

  - [ ]* 25.6 Write property test for trace propagation
    - **Property 18: Trace Context Propagation**
    - **Validates: Requirements 18.1, 18.2**

- [ ] 26. Implement graceful shutdown
  - [x] 26.1 Create ShutdownManager
    - Register shutdown handlers
    - Track in-flight requests
    - Set shutdown timeout to 30 seconds
    - _Requirements: 19.2, 19.4_
  
  - [x] 26.2 Handle SIGTERM signal
    - Stop accepting new connections
    - Set isShuttingDown flag
    - Trigger shutdown sequence
    - _Requirements: 19.1_
  
  - [x] 26.3 Implement connection draining
    - Wait for in-flight requests to complete
    - Close database connections
    - Flush metrics and traces
    - _Requirements: 19.3_
  
  - [x] 26.4 Update health check for shutdown
    - Return 503 during shutdown
    - Include shutdown status in response
    - _Requirements: 19.7_
  
  - [x] 26.5 Implement exit codes
    - Exit with code 0 on clean shutdown
    - Exit with code 1 on shutdown failure
    - Log shutdown completion status
    - _Requirements: 19.5, 19.6_

  - [ ]* 26.6 Write property test for graceful shutdown
    - **Property 19: Graceful Shutdown Completion**
    - **Validates: Requirements 19.1, 19.2, 19.4**

- [ ]* 27. Implement advanced logging infrastructure (Phase 2 - Optional)
  - [ ] 27.1 Create structured JSON logger
    - Output JSON format with timestamp, level, message
    - Include correlationId in all entries
    - Include service name in all entries
    - _Requirements: 20.1, 20.2_
  
  - [ ] 27.2 Implement file transport with rotation
    - Write logs to rotating files
    - Set max file size to 100MB
    - Set retention to 7 days
    - _Requirements: 20.3_
  
  - [ ] 27.3 Add log level configuration
    - Read LOG_LEVEL from environment
    - Filter logs below configured level
    - Support ERROR, WARN, INFO, DEBUG, TRACE
    - _Requirements: 20.4_
  
  - [ ] 27.4 Implement sensitive data redaction
    - Redact API keys (sk-*, key-*)
    - Redact passwords
    - Redact PII patterns (email, phone)
    - _Requirements: 20.5_
  
  - [ ] 27.5 Add error logging enhancements
    - Include stack trace for errors
    - Include error code
    - Support stdout JSON for containers
    - _Requirements: 20.6, 20.7_

  - [ ]* 27.6 Write property test for log redaction
    - **Property 20: Log Redaction Consistency**
    - **Validates: Requirements 20.5**

- [ ]* 28. Implement metrics and monitoring (Phase 2 - Optional)
  - [ ] 28.1 Setup Prometheus client
    - Initialize prom-client library
    - Create default metrics (nodejs_*)
    - Expose GET /metrics endpoint
    - _Requirements: 21.1, 21.6_
  
  - [ ] 28.2 Add HTTP request metrics
    - Create http_request_duration_seconds histogram
    - Add method, path, status labels
    - Record on request completion
    - _Requirements: 21.2_
  
  - [ ] 28.3 Add model call metrics
    - Create model_call_duration_seconds histogram
    - Add provider, model, status labels
    - Record tokens used
    - _Requirements: 21.3_
  
  - [ ] 28.4 Add error and pipeline metrics
    - Create error_total counter
    - Create pipeline_execution_duration_seconds histogram
    - Add appropriate labels
    - _Requirements: 21.4, 21.5_
  
  - [ ] 28.5 Add connection metrics
    - Create active_connections gauge
    - Track per service
    - Update on connection change
    - _Requirements: 21.7_

  - [ ]* 28.6 Write property test for metrics recording
    - **Property 21: Metrics Histogram Recording**
    - **Validates: Requirements 21.2**

- [ ] 29. Implement health check endpoints
  - [x] 29.1 Create /health endpoint
    - Return 200 with status "healthy" if all checks pass
    - Return 503 if any check fails
    - Include version and uptime
    - _Requirements: 22.1, 22.5_
  
  - [x] 29.2 Create /health/live endpoint
    - Return 200 if process is running
    - Minimal checks for liveness probe
    - _Requirements: 22.2_
  
  - [x] 29.3 Create /health/ready endpoint
    - Check Qdrant connectivity
    - Check embedding server connectivity
    - Return 503 with failed dependency name
    - _Requirements: 22.3, 22.4, 22.6, 22.7_

  - [ ]* 29.4 Write property test for health checks
    - **Property 22: Health Check Dependency Reporting**
    - **Validates: Requirements 22.3, 22.4, 22.6, 22.7**

- [ ]* 30. Implement API versioning (Phase 2 - Optional)
  - [x] 30.1 Add version prefix to routes
    - Prefix all endpoints with /api/v1/
    - Update route registrations
    - Update client documentation
    - _Requirements: 23.1_
  
  - [x] 30.2 Implement version negotiation
    - Support Accept-Version header
    - Default to latest stable version
    - Route to appropriate handler
    - _Requirements: 23.2, 23.3_
  
  - [x] 30.3 Add deprecation support
    - Include Deprecation header for deprecated endpoints
    - Include Sunset header with date
    - Include Link header to successor
    - _Requirements: 23.4_
  
  - [x] 30.4 Handle unsupported versions
    - Return 400 for unsupported versions
    - Include list of supported versions
    - Update OpenAPI spec with version
    - _Requirements: 23.5, 23.6, 23.7_

  - [ ]* 30.5 Write property test for API versioning
    - **Property 23: API Version Routing**
    - **Validates: Requirements 23.1, 23.3**

- [ ] 31. Implement request timeout management
  - [x] 31.1 Configure server-level timeout
    - Set HTTP server timeout to 120 seconds
    - Return 504 on timeout
    - Log timeout events
    - _Requirements: 24.1, 24.5_
  
  - [x] 31.2 Implement provider-level timeouts
    - Set timeout per model provider
    - Abort request on timeout
    - Return partial result if available
    - _Requirements: 24.2_
  
  - [x] 31.3 Implement step-level timeouts
    - Set timeout per pipeline step
    - Skip step on timeout with warning
    - Continue pipeline execution
    - _Requirements: 24.3_
  
  - [x] 31.4 Add request cancellation support
    - Detect client disconnect
    - Cancel in-progress operations
    - Propagate AbortController signal
    - _Requirements: 24.6, 24.7_
  
  - [x] 31.5 Implement per-endpoint timeouts
    - Support endpoint-specific timeout config
    - Override server timeout per route
    - _Requirements: 24.4_

  - [ ]* 31.6 Write property test for timeout enforcement
    - **Property 24: Request Timeout Enforcement**
    - **Validates: Requirements 24.1**

- [ ]* 32. Implement database connection management (Phase 2 - Optional)
  - [ ] 32.1 Create connection pool for Qdrant
    - Initialize pool with max 10 connections
    - Set min connections to 2
    - Configure idle timeout to 60 seconds
    - _Requirements: 25.1, 25.5_
  
  - [ ] 32.2 Implement connection acquisition
    - Return existing connection from pool
    - Queue requests when pool exhausted
    - Set max pending to 100
    - _Requirements: 25.2, 25.3_
  
  - [ ] 32.3 Handle pool exhaustion
    - Return 503 when queue full
    - Include CONNECTION_POOL_EXHAUSTED error code
    - Log pool exhaustion events
    - _Requirements: 25.4_
  
  - [ ] 32.4 Implement connection health management
    - Remove failed connections from pool
    - Create new connection on failure
    - Report pool health metrics
    - _Requirements: 25.6, 25.7_

  - [ ]* 32.5 Write property test for connection pool
    - **Property 25: Connection Pool Size Limit**
    - **Validates: Requirements 25.1, 25.3, 25.4**

- [x] 33. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

