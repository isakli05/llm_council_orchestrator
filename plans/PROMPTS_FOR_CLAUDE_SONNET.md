# Claude Sonnet 4.5 Başlangıç Promptları

Her geliştirme dokümanı için hazır promptlar. Sırayla kopyalayıp yapıştırın.

---

## 1. INDEXER_API_DEVELOPMENT.md Promptu

```
You are tasked with implementing the Indexer REST API for the LLM Council Orchestrator project.

## Context
This is a monorepo project with three main applications:
- apps/orchestrator - Main orchestration service (port 7001)
- apps/indexer - Code indexing and semantic search service (port 9001)
- apps/mcp_bridge - MCP protocol bridge

## Your Task
Read the development document at: plans/INDEXER_API_DEVELOPMENT.md

## Instructions
1. First, verify the gaps mentioned in section "1. EKSİKLİK TESPİTİ VE DOĞRULAMA" by running the verification commands
2. Examine the existing code structure in apps/indexer/src/
3. Follow the implementation steps in section "3. GELİŞTİRME TALİMATLARI" exactly
4. Implement the following:
   - Fastify server with CORS and API key authentication
   - POST /api/v1/index/ensure endpoint
   - POST /api/v1/search endpoint
   - POST /api/v1/context endpoint
   - GET /health and /health/ready endpoints
5. Write the tests as specified in section "4. TEST SENARYOLARI"
6. Verify your implementation using section "5. DOĞRULAMA KRİTERLERİ"

## Important Rules
- Do NOT create new files unless specified in the document
- Reuse existing modules (Scanner, Chunker, EmbeddingEngine, VectorIndex)
- Follow TypeScript strict mode
- Use the exact file paths mentioned in the document
- Run tests after implementation

## Expected Output
Report what you implemented and any issues encountered.
```

---

## 2. RAG_IMPLEMENTATION_GUIDE.md Promptu

```
You are tasked with implementing the RAG (Retrieval-Augmented Generation) system for the LLM Council Orchestrator project.

## Context
This is a monorepo project with three main applications:
- apps/orchestrator - Main orchestration service (port 7001)
- apps/indexer - Code indexing and semantic search service (port 9001)
- apps/mcp_bridge - MCP protocol bridge

The Indexer API should already be implemented from the previous task.

## Your Task
Read the development document at: plans/RAG_IMPLEMENTATION_GUIDE.md

## Instructions
1. First, verify the gaps mentioned in section "1. EKSİKLİK TESPİTİ VE DOĞRULAMA"
2. Find the TODO in apps/orchestrator/src/indexer/IndexClient.ts (contextForPath function)
3. Follow the implementation steps in section "3. GELİŞTİRME TALİMATLARI" exactly
4. Implement the following:
   - Complete IndexClient.contextForPath() method
   - Create ContextBuilder service (apps/orchestrator/src/indexer/ContextBuilder.ts)
   - Integrate with RoleManager for RAG context
   - Add getContext endpoint to Indexer
   - Add VectorIndex helper methods
5. Write the tests as specified
6. Verify your implementation using section "5. DOĞRULAMA KRİTERLERİ"

## Important Rules
- The Indexer API must be running for integration tests
- Context must be formatted correctly for each role type
- Token limits must be respected
- Run tests after implementation

## Expected Output
Report what you implemented and any issues encountered.
```

---

## 3. PRODUCTION_HARDENING.md Promptu

```
You are tasked with implementing production hardening features for the LLM Council Orchestrator project.

## Context
This is a monorepo project with three main applications:
- apps/orchestrator - Main orchestration service (port 7001)
- apps/indexer - Code indexing and semantic search service (port 9001)
- apps/mcp_bridge - MCP protocol bridge

The Indexer API and RAG system should already be implemented.

## Your Task
Read the development document at: plans/PRODUCTION_HARDENING.md

## Instructions
1. First, verify the gaps mentioned in section "1. EKSİKLİK TESPİTİ VE DOĞRULAMA"
2. Check for existing rate limiting, circuit breaker, and security implementations
3. Follow the implementation steps in section "3. GELİŞTİRME TALİMATLARI" exactly
4. Implement the following:
   - Rate limiting middleware (@fastify/rate-limit)
   - Circuit breaker for model providers (opossum)
   - Security middleware (helmet, CORS, input sanitization)
   - Graceful degradation manager
   - Enhanced input validation with Zod
5. Integrate all middleware with the Fastify servers
6. Write the tests as specified in section "4. TEST SENARYOLARI"
7. Verify your implementation using section "5. DOĞRULAMA KRİTERLERİ"

## Required npm packages (install if not present):
- @fastify/rate-limit
- @fastify/helmet
- @fastify/cors
- opossum

## Important Rules
- Security middleware must be registered first
- Rate limiting should use API key + IP combination
- Circuit breaker should have proper fallback mechanisms
- Do NOT break existing functionality

## Expected Output
Report what you implemented and any issues encountered.
```

---

## 4. TEST_STRATEGY.md Promptu

```
You are tasked with implementing a comprehensive test strategy for the LLM Council Orchestrator project.

## Context
This is a monorepo project with three main applications:
- apps/orchestrator - Main orchestration service (port 7001)
- apps/indexer - Code indexing and semantic search service (port 9001)
- apps/mcp_bridge - MCP protocol bridge

Production hardening features should already be implemented.

## Your Task
Read the development document at: plans/TEST_STRATEGY.md

## Instructions
1. First, check current test coverage by running: pnpm test:coverage
2. Examine the existing test structure in apps/orchestrator/src/__tests__/
3. Follow the implementation steps in section "3. GELİŞTİRME TALİMATLARI" exactly
4. Implement the following:
   - Update vitest.config.ts with proper configuration
   - Create tests/setup/globalSetup.ts
   - Create tests/utils/testUtils.ts
   - Create comprehensive unit tests for:
     - Pipeline Engine
     - Model Gateway
     - Indexer components
   - Create property-based tests using fast-check
   - Create integration tests in tests/integration/
   - Create E2E tests in tests/e2e/
5. Run all tests and ensure they pass
6. Verify coverage meets thresholds (80% for most modules)

## Target Coverage
- Pipeline Engine: 85%
- Model Gateway: 80%
- Indexer: 75%
- Aggregator: 80%
- Security: 90%

## Important Rules
- Use vitest as the test framework
- Use fast-check for property-based testing
- Mock external services (LLM APIs, Qdrant, etc.)
- Tests must be deterministic and not flaky

## Expected Output
Report test coverage achieved and any failing tests.
```

---

## 5. OBSERVABILITY_SETUP.md Promptu

```
You are tasked with implementing observability (logging, tracing, metrics) for the LLM Council Orchestrator project.

## Context
This is a monorepo project with three main applications:
- apps/orchestrator - Main orchestration service (port 7001)
- apps/indexer - Code indexing and semantic search service (port 9001)
- apps/mcp_bridge - MCP protocol bridge

All previous features should be implemented and tested.

## Your Task
Read the development document at: plans/OBSERVABILITY_SETUP.md

## Instructions
1. First, verify the gaps mentioned in section "1. EKSİKLİK TESPİTİ VE DOĞRULAMA"
2. Check for existing logging implementations
3. Follow the implementation steps in section "3. GELİŞTİRME TALİMATLARI" exactly
4. Implement the following:
   - Create packages/shared-observability/ package with:
     - logger.ts (Pino structured logging)
     - tracing.ts (OpenTelemetry setup)
     - metrics.ts (Prometheus metrics)
   - Add logging middleware to Fastify servers
   - Add tracing middleware with OpenTelemetry
   - Add metrics endpoint (/metrics) to servers
   - Create enhanced HealthController
   - Create monitoring/ directory with:
     - prometheus.yml
     - alert_rules.yml
     - docker-compose.observability.yml
5. Verify all endpoints work:
   - GET /health
   - GET /health/ready
   - GET /health/detailed
   - GET /metrics

## Required npm packages (install if not present):
- pino
- pino-pretty
- @opentelemetry/api
- @opentelemetry/sdk-node
- @opentelemetry/exporter-trace-otlp-grpc
- @opentelemetry/exporter-metrics-otlp-grpc
- prom-client

## Important Rules
- Logs must be in JSON format in production
- Sensitive data (API keys, passwords) must be redacted
- Metrics must follow Prometheus naming conventions
- Tracing spans must have proper parent-child relationships

## Expected Output
Report what you implemented and verify all observability endpoints work.
```

---

## Kullanım Sırası

1. **INDEXER_API_DEVELOPMENT.md** → Indexer REST API
2. **RAG_IMPLEMENTATION_GUIDE.md** → RAG sistemi
3. **PRODUCTION_HARDENING.md** → Security ve resilience
4. **TEST_STRATEGY.md** → Test coverage
5. **OBSERVABILITY_SETUP.md** → Logging, tracing, metrics

Her promptu kopyalayıp Claude Sonnet 4.5'e verin. Bir görev tamamlandığında bir sonrakine geçin.
