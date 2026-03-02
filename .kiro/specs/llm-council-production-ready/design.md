# Design Document

## Overview

This design document specifies the architecture and implementation details for making the LLM Council Orchestrator production-ready. The system will replace placeholder implementations with fully functional model adapters, HTTP-based indexer communication, LLM-powered aggregation, and robust error handling. The design prioritizes modularity, testability, and operational reliability.

## Architecture

### High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Orchestrator Service (Port 7001)              │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                     ModelGateway                            │ │
│  │  ┌──────────────────────────────────────────────────────┐  │ │
│  │  │  Provider Registry                                    │  │ │
│  │  │  - OpenAIAdapter (official + OpenRouter)             │  │ │
│  │  │  - AnthropicAdapter (official + OpenRouter)          │  │ │
│  │  │  - ZAIAdapter (official + OpenRouter)                │  │ │
│  │  │  - GeminiAdapter (official + OpenRouter)             │  │ │
│  │  └──────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                     RoleManager                             │ │
│  │  - Injects ModelGateway                                    │ │
│  │  - Executes roles with real LLM calls                      │ │
│  │  - Supports dual-model execution                           │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                     Aggregator                              │ │
│  │  - Uses gpt-5.2-pro for synthesis                          │ │
│  │  - Reasoning effort: xhigh                                 │ │
│  │  - Fallback to concatenation on failure                    │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                     IndexClient (HTTP)                      │ │
│  │  - Axios HTTP client                                       │ │
│  │  - Endpoints: POST /index/ensure, POST /search            │ │
│  │  - API Key authentication                                  │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              ↓ HTTP
┌─────────────────────────────────────────────────────────────────┐
│                    Indexer Service (Port 9001)                   │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                  Fastify REST API                           │ │
│  │  - POST /index/ensure (trigger indexing)                   │ │
│  │  - POST /search (semantic search)                          │ │
│  │  - GET /health (health check)                              │ │
│  │  - Middleware: API key validation, Zod validation          │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                  EmbeddingEngine                            │ │
│  │  - OpenAI-compatible HTTP client                           │ │
│  │  - Configurable models: BGE-Large, E5-Large, BGE-M3       │ │
│  │  - Endpoint: http://localhost:8000/embeddings             │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              ↓ HTTP
┌─────────────────────────────────────────────────────────────────┐
│         Local Embedding Server (Docker, Port 8000)              │
│         Model: Configurable via EMBEDDING_MODEL env var         │
└─────────────────────────────────────────────────────────────────┘
                              ↓ gRPC
┌─────────────────────────────────────────────────────────────────┐
│         Qdrant Vector Store (Docker, Port 6333)                 │
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. ModelGateway

**Responsibility:** Unified interface for calling multiple LLM providers with thinking mode support.

**Key Methods:**
- `callModel(modelId, messages, options)` - Single model call
- `callModels(modelIds, messages, options)` - Parallel multi-model calls
- `callWithRetry(modelId, messages, options)` - Retry with exponential backoff
- `registerProvider(type, adapter)` - Register provider adapter

**Provider Adapter Interface:**
```typescript
interface ProviderAdapter {
  call(modelId: string, messages: ChatMessage[], options?: ModelCallOptions): Promise<ModelResponse>;
  supportsThinking(): boolean;
  getThinkingConfig(options: ModelCallOptions): ThinkingConfig | null;
}
```

**Thinking Mode Handling:**
- Native thinking: Include provider-specific parameters (reasoning.effort, thinking.budget_tokens)
- Prompt-based: Prepend system message with reasoning instructions
- Metadata: Include thinking tokens in response metadata

### 2. Provider Adapters

#### OpenAIAdapter
- **Endpoint:** https://api.openai.com/v1/chat/completions
- **Authentication:** Bearer token from OPENAI_API_KEY
- **Thinking:** reasoning.effort parameter (high, xhigh)
- **Models:** gpt-5.2, gpt-5.2-pro
- **Error Handling:** 429 → retryable, 401 → non-retryable

#### AnthropicAdapter
- **Endpoint:** https://api.anthropic.com/v1/messages
- **Authentication:** x-api-key header from ANTHROPIC_API_KEY
- **Thinking:** thinking.type="enabled", thinking.budget_tokens
- **Models:** claude-opus-4-5, claude-sonnet-4-5
- **Streaming:** Aggregate SSE chunks into final response

#### ZAIAdapter
- **Endpoint:** https://api.z.ai/api/coding/paas/v4/chat/completions
- **Authentication:** Bearer token from ZAI_API_KEY
- **Thinking:** thinking.type="enabled"
- **Models:** glm-4.6
- **Normalization:** Convert Z.AI response format to ModelResponse

#### GeminiAdapter
- **Endpoint:** https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
- **Authentication:** API key query parameter from GEMINI_API_KEY
- **Thinking:** generationConfig.thinkingConfig
- **Models:** gemini-3-pro
- **Format Conversion:** ChatMessage → Gemini parts format

#### OpenRouter Support
- **Endpoint:** https://openrouter.ai/api/v1/chat/completions
- **Authentication:** Bearer token from OPENROUTER_API_KEY
- **Headers:** HTTP-Referer, X-Title
- **Provider Selection:** Suffix adapter name with "-openrouter" (e.g., OpenAIOpenRouterAdapter)
- **Model Mapping:** Use OpenRouter model IDs (openai/gpt-5.2, anthropic/claude-opus-4-5)

### 3. IndexClient HTTP Integration

**Responsibility:** HTTP client for communicating with Indexer service.

**Key Methods:**
- `ensureIndex(projectRoot, forceRebuild)` - Trigger indexing
- `semanticSearch(query, limit, filters)` - Search code
- `getStatus()` - Check indexer health

**HTTP Client:**
- Library: Axios
- Base URL: http://localhost:9001 (configurable via INDEXER_URL)
- Timeout: 60 seconds
- Headers: X-API-Key (from INDEXER_API_KEY)
- Retry: 3 attempts with exponential backoff

**Request/Response Formats:**
```typescript
// POST /index/ensure
Request: { project_root: string, force_rebuild?: boolean }
Response: { success: boolean, filesIndexed: number, completedAt: string }

// POST /search
Request: { query: string, limit?: number, filters?: { paths?: string[] } }
Response: { success: boolean, results: SearchResultItem[], totalResults: number }
```

### 4. Indexer REST API

**Responsibility:** Expose indexing and search operations via HTTP.

**Framework:** Fastify (high performance, schema validation)

**Endpoints:**
- `POST /index/ensure` - Trigger indexing
- `POST /search` - Semantic search
- `GET /health` - Health check

**Middleware:**
- API Key Validation: Check X-API-Key header against INDEXER_API_KEY
- Request Validation: Zod schemas for all request bodies
- Error Handling: Structured error responses with codes
- Logging: Request/response logging with correlation IDs

**Security:**
- API key required for all endpoints except /health
- Path sanitization for project_root parameter
- Rate limiting: 100 requests/minute per API key (future enhancement)

### 5. EmbeddingEngine Flexibility

**Responsibility:** Generate embeddings using configurable models.

**Model Configuration:**
```typescript
AVAILABLE_MODELS = {
  'local-bge-large-v1.5': { dimensions: 1024, maxTokens: 512 },
  'multilingual-e5-large-instruct': { dimensions: 1024, maxTokens: 512 },
  'bge-m3': { dimensions: 1024, maxTokens: 8192 },
}
```

**Model Selection:**
- Environment variable: EMBEDDING_MODEL (default: local-bge-large-v1.5)
- Runtime validation: Check model exists in AVAILABLE_MODELS
- Dimension consistency: All models use 1024 dimensions (Qdrant collection compatible)

**HTTP Client:**
- Endpoint: http://localhost:8000/embeddings (configurable via EMBEDDING_URL)
- Format: OpenAI-compatible (POST with input array)
- Batch size: 32 chunks per request
- Timeout: 30 seconds per batch

### 6. RoleManager Integration

**Responsibility:** Execute role-based analysis using ModelGateway.

**Dependency Injection:**
```typescript
constructor(config: RoleConfig, modelGateway: ModelGateway, indexClient?: IndexClient)
```

**Execution Flow:**
1. Resolve models from config (resolveModels)
2. Generate role-specific system prompt (getRoleSystemPrompt)
3. Call ModelGateway.callModels (parallel execution)
4. Aggregate outputs into RoleResponse
5. Tag with domainId if domain-specific

**Dual-Model Support:**
- Roles: legacy_analysis, architect
- Execution: Parallel calls to both models
- Aggregation: Include both outputs in RoleResponse.outputs array

### 7. Aggregator LLM-Based Synthesis

**Responsibility:** Synthesize multiple model outputs using LLM.

**Model Configuration:**
- Model: gpt-5.2-pro
- Provider: openai
- Reasoning effort: xhigh
- Temperature: 0.3 (deterministic synthesis)

**Synthesis Prompt Template:**
```
You are an expert aggregator synthesizing multiple AI model outputs into a coherent architectural report.

Input: {N} model outputs from roles: {role_list}
Task: Create a unified, comprehensive report that:
1. Identifies consensus across models
2. Highlights conflicting recommendations with balanced analysis
3. Synthesizes insights into coherent sections
4. Maintains technical accuracy and depth

Output format: FinalArchitecturalReport with sections:
- Executive Summary
- Legacy Analysis
- Architectural Design
- Migration Strategy
- Security Assessment
```

**Fallback Strategy:**
- If LLM synthesis fails: Log warning, use simple concatenation
- If all models fail: Return error with partial results
- If timeout: Return partial synthesis with warning

### 8. PipelineEngine Step Orchestration

**Responsibility:** Orchestrate all pipeline steps with proper state management and context propagation.

**Step Execution Flow:**
```
┌─────────────────────────────────────────────────────────────────┐
│                    PipelineEngine Execution                      │
│                                                                   │
│  FULL Mode:                                                      │
│  ┌───────┐   ┌──────────┐   ┌─────────┐   ┌───────────┐        │
│  │ INDEX │ → │ DISCOVER │ → │ ANALYZE │ → │ AGGREGATE │        │
│  └───────┘   └──────────┘   └─────────┘   └───────────┘        │
│                                                                   │
│  QUICK Mode:                                                     │
│  ┌───────┐   ┌─────────┐                                        │
│  │ INDEX │ → │ ANALYZE │                                        │
│  └───────┘   └─────────┘                                        │
└─────────────────────────────────────────────────────────────────┘
```

**State Machine:**
```
     IDLE
       │
       ▼ start()
    RUNNING
       │
       ├──► INDEXING ──► DISCOVERING ──► ANALYZING ──► AGGREGATING
       │         │              │              │              │
       │         ▼              ▼              ▼              ▼
       │      FAILED         FAILED         FAILED         FAILED
       │
       └──► CANCELLED (on cancel request)
       
    AGGREGATING ──► COMPLETED
```

**Context Management:**
```typescript
interface PipelineContext {
  // Metadata
  runId: string;
  mode: PipelineMode;
  startedAt: string;
  config: PipelineConfig;
  userExclusions: string[];
  
  // Step Results (populated as steps complete)
  indexMetadata?: IndexMetadata;
  discoveryResult?: DiscoveryResult;
  roleResponses?: RoleResponse[];
  finalReport?: FinalArchitecturalReport;
  
  // Execution State
  currentStep: PipelineStep;
  completedSteps: PipelineStep[];
  errors: StepError[];
}
```

**Key Methods:**
- `execute(mode, prompt, config, indexMetadata?, exclusions?)` - Execute full pipeline
- `executeStep(step, context)` - Execute single step
- `getContext(runId)` - Get read-only context copy
- `cancel(runId)` - Cancel running pipeline

### 9. Security Input Validation

**Validation Layers:**

**Layer 1: Zod Schema Validation**
- All API endpoints validate request bodies
- Type-safe parsing with detailed error messages
- Custom validators for domain-specific rules

**Layer 2: Path Sanitization**
```typescript
function sanitizePath(inputPath: string, projectRoot: string): string {
  const normalized = path.normalize(inputPath);
  const resolved = path.resolve(projectRoot, normalized);
  
  if (!resolved.startsWith(projectRoot)) {
    throw new PathTraversalError();
  }
  
  return resolved;
}
```

**Layer 3: Input Escaping**
- Search queries: Escape special regex characters
- File paths: Validate against whitelist of allowed characters
- Domain IDs: Validate against pattern ^[a-z0-9_]+_domain$

**Error Sanitization:**
- Production: Strip stack traces from API responses
- Development: Include stack traces for debugging
- Logging: Always log full error details internally

### 9. Memory Management

**LRU Cache for Active Runs:**
```typescript
class LRUCache<K, V> {
  private maxSize: number = 100;
  private cache: Map<K, V>;
  
  set(key: K, value: V): void {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
}
```

**Cleanup Strategies:**
- Trace cleanup: Keep last 100 traces, run every 15 minutes
- Cache cleanup: Remove expired entries based on TTL
- Active runs cleanup: Remove completed runs after 1 hour
- Scheduled cleanup: setInterval with unref() to prevent blocking shutdown

**Memory Monitoring:**
- Log memory usage at INFO level every 5 minutes
- Trigger aggressive cleanup if heap usage > 80%
- Emit warning if cleanup removes > 50 items

## Data Models

### ModelCallOptions
```typescript
interface ModelCallOptions {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  thinking?: {
    type?: 'enabled' | 'disabled';
    effort?: 'low' | 'medium' | 'high' | 'xhigh';
    budget_tokens?: number;
  };
}
```

### ModelResponse
```typescript
interface ModelResponse {
  modelId: string;
  content: string;
  success: boolean;
  metadata?: {
    tokensUsed?: number;
    thinkingTokens?: number;
    latencyMs?: number;
    finishReason?: string;
  };
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}
```

### ProviderConfig
```typescript
interface ProviderConfig {
  model: string;
  provider: 'openai' | 'anthropic' | 'zai' | 'gemini' | 
           'openai-openrouter' | 'anthropic-openrouter' | 
           'zai-openrouter' | 'gemini-openrouter';
  base_url?: string;
  thinking?: {
    type?: 'enabled';
    budget_tokens?: number;
  };
  reasoning?: {
    effort?: 'low' | 'medium' | 'high' | 'xhigh';
  };
}
```

### IndexRequest
```typescript
interface IndexRequest {
  project_root: string;
  force_rebuild?: boolean;
}

interface IndexResponse {
  success: boolean;
  filesIndexed: number;
  completedAt: string;
  error?: ApiError;
}
```

### SearchRequest
```typescript
interface SearchRequest {
  query: string;
  limit?: number;
  filters?: {
    paths?: string[];
    extensions?: string[];
  };
}

interface SearchResponse {
  success: boolean;
  results: SearchResultItem[];
  totalResults: number;
  error?: ApiError;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Model Adapter Registration Completeness
*For any* provider type in ProviderType enum, when ModelGateway is initialized, there should exist a registered adapter for that provider type, or the provider should be marked as unavailable in logs.
**Validates: Requirements 1.1, 1.2**

### Property 2: Thinking Mode Parameter Inclusion
*For any* model call where thinking mode is enabled in config, the API request to the provider should include the appropriate thinking parameters (reasoning.effort, thinking.budget_tokens, or thinking.type).
**Validates: Requirements 1.4, 1.5, 2.3, 3.2**

### Property 3: Retry Logic Consistency
*For any* failed model call where error.retryable is true, the system should retry up to MAX_RETRIES times with exponential backoff, and only return failure after all retries are exhausted.
**Validates: Requirements 1.6, 1.7, 2.5**

### Property 4: HTTP Client Timeout Enforcement
*For any* HTTP request made by IndexClient, if the request does not complete within 60 seconds, the system should abort the request and return an error with code TIMEOUT_ERROR.
**Validates: Requirements 7.5**

### Property 5: API Key Validation Enforcement
*For any* request to Indexer API endpoints (except /health), if the X-API-Key header is missing or invalid, the system should return 401 or 403 status code and not execute the requested operation.
**Validates: Requirements 8.6, 8.7**

### Property 6: Embedding Model Dimension Consistency
*For any* embedding model selected via EMBEDDING_MODEL environment variable, the model configuration should specify 1024 dimensions to maintain compatibility with existing Qdrant collections.
**Validates: Requirements 9.2, 9.3, 9.4, 9.5**

### Property 7: Path Traversal Prevention
*For any* file path provided in API requests, after sanitization with path.normalize and path.resolve, the resolved path should start with the project root path, otherwise the system should reject with PATH_TRAVERSAL error.
**Validates: Requirements 12.2, 12.3**

### Property 8: LRU Cache Size Limit
*For any* LRU cache instance, when the cache size reaches maxSize, adding a new entry should evict the least recently used entry, ensuring the cache never exceeds maxSize.
**Validates: Requirements 13.1**

### Property 9: Async File Operation Non-Blocking
*For any* file I/O operation (read, write, readdir), the operation should use fs.promises API and return a Promise, ensuring the event loop is not blocked during I/O.
**Validates: Requirements 14.1, 14.2, 14.3, 14.6**

### Property 10: Configuration Override Precedence
*For any* configuration parameter, if both architect.config.json and an environment variable are set, the environment variable value should take precedence.
**Validates: Requirements 15.2**

### Property 11: Provider Response Normalization
*For any* provider adapter response, regardless of the provider's native response format, the adapter should normalize the response to the ModelResponse interface format.
**Validates: Requirements 4.4, 5.5, 6.6**

### Property 12: Aggregator Fallback Behavior
*For any* aggregation operation, if LLM synthesis fails or times out, the system should fallback to simple concatenation and log a warning, ensuring the pipeline does not fail completely.
**Validates: Requirements 11.6**

### Property 13: Parallel Model Execution
*For any* role configuration with multiple models, when RoleManager executes the role, all model calls should be initiated in parallel (Promise.all), not sequentially.
**Validates: Requirements 10.3**

### Property 14: OpenRouter Dual Support
*For any* model configuration with provider suffix "-openrouter", the system should use OpenRouter endpoint and OPENROUTER_API_KEY, not the official provider endpoint.
**Validates: Requirements 6.1, 6.2, 6.5**

### Property 15: Memory Cleanup Scheduling
*For any* cleanup operation (trace, cache, active runs), the system should schedule periodic cleanup using setInterval with unref() to prevent blocking graceful shutdown.
**Validates: Requirements 13.6**

### Property 16: Rate Limit Enforcement
*For any* client making requests, if the client exceeds 100 requests within a 60-second sliding window, subsequent requests should receive 429 status code until the window resets.
**Validates: Requirements 16.1, 16.3**

### Property 17: Circuit Breaker State Transitions
*For any* circuit breaker instance, after 5 consecutive failures the circuit should open, and after 30 seconds in open state it should transition to half-open, allowing one test request.
**Validates: Requirements 17.1, 17.3, 17.4, 17.5**

### Property 18: Trace Context Propagation
*For any* request entering the system, a unique trace ID should be generated and propagated to all downstream service calls via traceparent header.
**Validates: Requirements 18.1, 18.2**

### Property 19: Graceful Shutdown Completion
*For any* shutdown initiated by SIGTERM, the system should stop accepting new requests immediately and wait up to 30 seconds for in-flight requests before terminating.
**Validates: Requirements 19.1, 19.2, 19.4**

### Property 20: Log Redaction Consistency
*For any* log entry containing sensitive data patterns (API keys, passwords), the sensitive values should be redacted before writing to any log transport.
**Validates: Requirements 20.5**

### Property 21: Metrics Histogram Recording
*For any* completed HTTP request, the request duration should be recorded in http_request_duration_seconds histogram with method, path, and status labels.
**Validates: Requirements 21.2**

### Property 22: Health Check Dependency Reporting
*For any* health check request to /health/ready, if any dependency (Qdrant, embedding server) is unreachable, the response should be 503 with the failed dependency name.
**Validates: Requirements 22.3, 22.4, 22.6, 22.7**

### Property 23: API Version Routing
*For any* API request with /api/v1/ prefix, the request should be routed to v1 handlers regardless of Accept-Version header value.
**Validates: Requirements 23.1, 23.3**

### Property 24: Request Timeout Enforcement
*For any* HTTP request exceeding 120 seconds server timeout, the system should abort the request and return 504 Gateway Timeout status.
**Validates: Requirements 24.1**

### Property 25: Connection Pool Size Limit
*For any* connection pool instance, the number of active connections should never exceed maxConnections (10), and pending requests should queue up to maxPendingRequests (100).
**Validates: Requirements 25.1, 25.3, 25.4**

### Property 26: Pipeline Step Execution Order
*For any* FULL mode pipeline execution, steps should execute in order: INDEX → DISCOVER → ANALYZE → AGGREGATE, with each step completing before the next begins.
**Validates: Requirements 26.1**

### Property 27: Pipeline State Machine Validity
*For any* pipeline state transition, the transition should only occur between valid states as defined in the state machine, and invalid transitions should throw InvalidStateTransitionError.
**Validates: Requirements 27.2, 27.6**

### Property 28: Pipeline Context Immutability
*For any* step accessing pipeline context, the returned context should be a read-only copy that cannot be mutated, ensuring data integrity across steps.
**Validates: Requirements 28.4**

## Error Handling

### Error Categories

**1. Retryable Errors:**
- Network timeouts (ETIMEDOUT, ECONNRESET)
- Rate limits (429)
- Service unavailable (503)
- Temporary provider errors

**2. Non-Retryable Errors:**
- Authentication failures (401, 403)
- Invalid model names (404)
- Malformed requests (400)
- Quota exceeded (permanent)

**3. Validation Errors:**
- Zod schema validation failures
- Path traversal attempts
- Missing required parameters
- Type mismatches

### Error Response Format
```typescript
interface ApiError {
  code: string;
  message: string;
  details?: unknown;
  retryable?: boolean;
}
```

### Error Codes Registry
- `MODEL_PROVIDER_NOT_FOUND`: Provider adapter not registered
- `MODEL_CALL_ERROR`: Generic model call failure
- `TIMEOUT_ERROR`: Request timeout
- `PATH_TRAVERSAL`: Path traversal attempt detected
- `VALIDATION_ERROR`: Request validation failed
- `AUTHENTICATION_ERROR`: API key invalid or missing
- `CONTENT_FILTERED`: Response blocked by safety filters
- `QUOTA_EXCEEDED`: API quota exceeded

### Error Logging Strategy
- ERROR level: All errors with full context
- WARN level: Retryable errors, fallback activations
- INFO level: Successful operations, cleanup events
- DEBUG level: Detailed request/response data

## Rate Limiting

### Architecture
```
┌─────────────────────────────────────────────────────────────────┐
│                    Rate Limiter Middleware                       │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Sliding Window Algorithm                                   │ │
│  │  - Window size: 60 seconds                                 │ │
│  │  - Max requests: 100 per window                            │ │
│  │  - Key: API key or IP address                              │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  In-Memory Store (Redis-compatible interface)              │ │
│  │  - Token bucket per client                                 │ │
│  │  - Automatic expiration                                    │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**Response Headers:**
- `X-RateLimit-Limit`: Maximum requests per window
- `X-RateLimit-Remaining`: Remaining requests in current window
- `X-RateLimit-Reset`: Unix timestamp when window resets
- `Retry-After`: Seconds until rate limit resets (on 429)

## Circuit Breaker

### State Machine
```
     ┌──────────────────────────────────────────┐
     │                                          │
     ▼                                          │
┌─────────┐    5 failures    ┌─────────┐       │
│ CLOSED  │ ───────────────► │  OPEN   │       │
└─────────┘                  └─────────┘       │
     ▲                            │            │
     │                            │ 30s        │
     │                            ▼            │
     │    success           ┌───────────┐      │
     └───────────────────── │ HALF-OPEN │ ─────┘
                   failure  └───────────┘
```

**Configuration per Service:**
```typescript
interface CircuitBreakerConfig {
  failureThreshold: number;      // Default: 5
  successThreshold: number;      // Default: 2
  timeout: number;               // Default: 30000ms
  volumeThreshold: number;       // Default: 10 (min requests before opening)
}
```

## Distributed Tracing

### OpenTelemetry Integration
```
┌─────────────────────────────────────────────────────────────────┐
│                    Trace Context Propagation                     │
│                                                                   │
│  Request → [traceparent: 00-{traceId}-{spanId}-01]              │
│                                                                   │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│  │ Gateway  │───►│ Pipeline │───►│ RoleMgr  │───►│ ModelGW  │  │
│  │  Span    │    │   Span   │    │   Span   │    │   Span   │  │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘  │
│       │               │               │               │          │
│       └───────────────┴───────────────┴───────────────┘          │
│                           │                                       │
│                           ▼                                       │
│              ┌─────────────────────────┐                         │
│              │  OTLP Exporter          │                         │
│              │  → Jaeger/Zipkin/etc    │                         │
│              └─────────────────────────┘                         │
└─────────────────────────────────────────────────────────────────┘
```

**Span Attributes:**
- `service.name`: Service identifier
- `http.method`, `http.url`, `http.status_code`
- `model.provider`, `model.name`, `model.tokens`
- `error.type`, `error.message`

## Graceful Shutdown

### Shutdown Sequence
```
SIGTERM received
     │
     ▼
┌─────────────────────────────────────────┐
│ 1. Stop accepting new connections       │
│ 2. Set health check to return 503       │
│ 3. Wait for in-flight requests (30s)    │
│ 4. Close database connections           │
│ 5. Flush metrics and traces             │
│ 6. Exit process                         │
└─────────────────────────────────────────┘
```

**Implementation:**
```typescript
interface ShutdownManager {
  register(name: string, handler: () => Promise<void>): void;
  shutdown(timeout: number): Promise<void>;
  isShuttingDown(): boolean;
}
```

## Advanced Logging

### Log Format (JSON)
```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "message": "Pipeline execution completed",
  "correlationId": "abc-123-def",
  "service": "orchestrator",
  "context": {
    "runId": "run-456",
    "mode": "full_analysis",
    "durationMs": 5432
  }
}
```

**Log Levels:** ERROR > WARN > INFO > DEBUG > TRACE

**Transports:**
- Console (development)
- File with rotation (production)
- Stdout JSON (container environments)

**Sensitive Data Redaction:**
- API keys: `sk-***REDACTED***`
- Passwords: `[REDACTED]`
- PII patterns: Email, phone, SSN

## Metrics (Prometheus)

### Exposed Metrics
```
# HTTP Metrics
http_request_duration_seconds{method, path, status}
http_requests_total{method, path, status}

# Model Metrics
model_call_duration_seconds{provider, model, status}
model_call_total{provider, model, status}
model_tokens_used{provider, model, type}

# Pipeline Metrics
pipeline_execution_duration_seconds{mode, status}
pipeline_steps_total{step, status}

# System Metrics
nodejs_heap_size_bytes
nodejs_active_handles
active_connections{service}

# Circuit Breaker Metrics
circuit_breaker_state{service}
circuit_breaker_failures_total{service}
```

## Health Checks

### Endpoints
```
GET /health         → Overall health (200/503)
GET /health/live    → Liveness probe (200/503)
GET /health/ready   → Readiness probe (200/503)
```

### Response Format
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 3600,
  "checks": {
    "qdrant": { "status": "healthy", "latencyMs": 5 },
    "embedding": { "status": "healthy", "latencyMs": 12 },
    "modelGateway": { "status": "degraded", "message": "OpenAI rate limited" }
  }
}
```

## API Versioning

### URL Structure
```
/api/v1/pipeline/run
/api/v1/index/ensure
/api/v1/search
```

### Version Negotiation
1. URL path prefix (primary): `/api/v1/`
2. Accept-Version header (secondary): `Accept-Version: v1`
3. Default: Latest stable version

### Deprecation Headers
```
Deprecation: true
Sunset: Sat, 01 Jun 2025 00:00:00 GMT
Link: </api/v2/pipeline/run>; rel="successor-version"
```

## Connection Pooling

### Qdrant Connection Pool
```typescript
interface ConnectionPoolConfig {
  maxConnections: number;        // Default: 10
  minConnections: number;        // Default: 2
  maxPendingRequests: number;    // Default: 100
  idleTimeoutMs: number;         // Default: 60000
  acquireTimeoutMs: number;      // Default: 10000
}
```

**Pool States:**
- Active: Currently in use
- Idle: Available for reuse
- Pending: Waiting for connection

## Testing Strategy

### Unit Testing
- **Framework:** Vitest (fast, modern, ESM support)
- **Coverage Target:** 80% line coverage
- **Mocking:** vi.mock for external dependencies
- **Test Files:** Co-located with source (*.test.ts)

**Unit Test Scope:**
- Provider adapters: Mock HTTP responses
- ModelGateway: Mock provider adapters
- RoleManager: Mock ModelGateway
- Aggregator: Mock ModelGateway
- IndexClient: Mock Axios
- Validation functions: Test edge cases
- Path sanitization: Test traversal attempts
- LRU Cache: Test eviction logic
- Rate limiter: Test sliding window
- Circuit breaker: Test state transitions

### Integration Testing
- **Scope:** End-to-end API flows
- **Setup:** Test Indexer service on random port
- **Fixtures:** Sample code repositories
- **Cleanup:** Teardown test data after each test

**Integration Test Scope:**
- Orchestrator → Indexer HTTP communication
- Indexer → Embedding server communication
- Indexer → Qdrant communication
- Full pipeline execution (mocked LLM calls)
- Health check endpoints
- Metrics endpoint

### Property-Based Testing
- **Framework:** fast-check (TypeScript property testing)
- **Properties:** Validate correctness properties from design
- **Generators:** Custom generators for domain objects

**Property Test Examples:**
- Path sanitization: Generate random paths, verify no traversal
- LRU cache: Generate random operations, verify size limit
- Retry logic: Generate random failures, verify retry count
- Config override: Generate random configs, verify precedence
- Rate limiter: Generate random request patterns, verify limits
- Circuit breaker: Generate failure sequences, verify state transitions

### Test Execution
- **Command:** `npm test` (runs all tests)
- **Watch Mode:** `npm test -- --watch`
- **Coverage:** `npm test -- --coverage`
- **CI Integration:** Run tests on every commit

### Test Data Management
- **Fixtures:** Store in `__fixtures__` directories
- **Mocks:** Store in `__mocks__` directories
- **Test Configs:** Separate test config files
- **Cleanup:** Automatic cleanup in afterEach hooks

