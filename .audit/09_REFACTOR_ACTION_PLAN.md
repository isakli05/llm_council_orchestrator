# Refactor 09: Test Realism - Concrete Action Plan

## Overview
This document provides step-by-step instructions for implementing the test realism refactor.

---

## Phase 1: Immediate Cleanup

### Action 1.1: Delete Misleading E2E Test
**File:** `tests/e2e/full-workflow.e2e.test.ts`

**Reason:** This file provides zero value. It only validates mock object shapes and creates false confidence.

**Command:**
```bash
rm tests/e2e/full-workflow.e2e.test.ts
```

**Impact:** 
- Removes ~150 lines of misleading code
- Clarifies that we have no real E2E tests yet
- Prevents false sense of security

---

### Action 1.2: Delete Misleading Integration Test
**File:** `tests/integration/orchestrator-indexer.integration.test.ts`

**Reason:** Claims to test integration but only validates mock function returns.

**Command:**
```bash
rm tests/integration/orchestrator-indexer.integration.test.ts
```

**Impact:**
- Removes ~180 lines of misleading code
- Makes it clear we need real integration tests

---

### Action 1.3: Relocate Real Integration Test
**Current:** `apps/orchestrator/src/__tests__/AsyncNonBlocking.test.ts`  
**Target:** `tests/integration/async-file-operations.integration.test.ts`

**Reason:** This is a real integration test (tests actual file I/O and event loop behavior) but is miscategorized as a unit test.

**Commands:**
```bash
mkdir -p tests/integration
mv apps/orchestrator/src/__tests__/AsyncNonBlocking.test.ts tests/integration/async-file-operations.integration.test.ts
```

**Update imports if needed** (check for relative path issues)

---

### Action 1.4: Update Test Scripts
**File:** `package.json`

**Current:**
```json
{
  "scripts": {
    "test:integration": "vitest run --dir tests/integration",
    "test:e2e": "vitest run --dir tests/e2e"
  }
}
```

**After cleanup, these will run:**
- `test:integration`: Only real integration tests
- `test:e2e`: Nothing (directory will be empty until we add real E2E tests)

**No changes needed** - scripts are already correct, we just removed bad tests.

---

## Phase 2: Add Critical Integration Tests

### Action 2.1: Create Orchestrator-Indexer Real Integration Test

**File:** `tests/integration/orchestrator-indexer-real.integration.test.ts`

**Purpose:** Test the actual HTTP contract between Orchestrator's IndexClient and Indexer's HTTP API.

**Implementation:**
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { IndexerServer } from '../../apps/indexer/src/server';
import { IndexClient } from '../../apps/orchestrator/src/indexer/IndexClient';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';

describe('Orchestrator-Indexer Real HTTP Integration', () => {
  let indexerServer: IndexerServer;
  let indexClient: IndexClient;
  let tempProjectDir: string;
  const TEST_PORT = 19001;
  const TEST_API_KEY = 'test-integration-key';

  beforeAll(async () => {
    // Create temp project directory
    tempProjectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'integration-test-'));
    
    // Create some test files
    await fs.writeFile(
      path.join(tempProjectDir, 'test.ts'),
      'export function hello() { return "world"; }',
      'utf-8'
    );
    
    // Start real Indexer server
    indexerServer = new IndexerServer({
      port: TEST_PORT,
      host: '127.0.0.1',
      apiKey: TEST_API_KEY,
    });
    await indexerServer.start();
    
    // Create real IndexClient
    indexClient = new IndexClient({
      baseUrl: `http://127.0.0.1:${TEST_PORT}`,
      apiKey: TEST_API_KEY,
    });
  });

  afterAll(async () => {
    await indexerServer.shutdown();
    await fs.rm(tempProjectDir, { recursive: true, force: true });
  });

  describe('Index Ensure Flow', () => {
    it('should ensure index via real HTTP call', async () => {
      const result = await indexClient.ensureIndexed({
        projectRoot: tempProjectDir,
        forceRebuild: false,
      });

      expect(result.success).toBe(true);
      expect(result.filesIndexed).toBeGreaterThan(0);
      expect(result.status).toBe('ready');
    });

    it('should handle force rebuild', async () => {
      const result = await indexClient.ensureIndexed({
        projectRoot: tempProjectDir,
        forceRebuild: true,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Search Flow', () => {
    it('should search via real HTTP call', async () => {
      // First ensure index
      await indexClient.ensureIndexed({
        projectRoot: tempProjectDir,
      });

      // Then search
      const result = await indexClient.search({
        query: 'hello function',
        limit: 5,
      });

      expect(result.success).toBe(true);
      expect(Array.isArray(result.results)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle 401 when API key is missing', async () => {
      const clientNoAuth = new IndexClient({
        baseUrl: `http://127.0.0.1:${TEST_PORT}`,
        // No API key
      });

      const result = await clientNoAuth.ensureIndexed({
        projectRoot: tempProjectDir,
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('AUTHENTICATION_ERROR');
    });

    it('should handle 400 when project root is invalid', async () => {
      const result = await indexClient.ensureIndexed({
        projectRoot: '/nonexistent/path',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('API Contract Validation', () => {
    it('should return correct response structure for ensure', async () => {
      const result = await indexClient.ensureIndexed({
        projectRoot: tempProjectDir,
      });

      // Validate response structure matches contract
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('filesIndexed');
      expect(result).toHaveProperty('lastIndexedAt');
    });

    it('should return correct response structure for search', async () => {
      await indexClient.ensureIndexed({ projectRoot: tempProjectDir });
      
      const result = await indexClient.search({
        query: 'test',
        limit: 5,
      });

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('totalResults');
      
      if (result.results.length > 0) {
        const firstResult = result.results[0];
        expect(firstResult).toHaveProperty('chunk');
        expect(firstResult).toHaveProperty('score');
        expect(firstResult.chunk).toHaveProperty('content');
        expect(firstResult.chunk).toHaveProperty('metadata');
      }
    });
  });
});
```

**Estimated Time:** 2-3 hours  
**Priority:** HIGH  
**Dependencies:** None

---

### Action 2.2: Create Pipeline Status Flow Integration Test

**File:** `tests/integration/pipeline-status-flow.integration.test.ts`

**Purpose:** Test that pipeline state transitions and progress updates work correctly.

**Implementation:**
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PipelineEngine } from '../../apps/orchestrator/src/pipeline/PipelineEngine';
import { PipelineExecutionState } from '@llm/shared-types';

// Mock external dependencies but test real state machine
vi.mock('../../apps/orchestrator/src/indexer/IndexClient');
vi.mock('../../apps/orchestrator/src/models/ModelGateway');

describe('Pipeline Status Flow Integration', () => {
  let engine: PipelineEngine;

  beforeEach(() => {
    engine = new PipelineEngine({
      indexClient: {} as any, // Mocked
      modelGateway: {} as any, // Mocked
    });
  });

  describe('State Transitions', () => {
    it('should transition from IDLE to RUNNING on start', async () => {
      const runId = 'test-run-123';
      
      // Start pipeline (will fail due to mocks, but we test state)
      const promise = engine.startPipeline({
        mode: 'quick_diagnostic',
        targetPath: '/test',
        runId,
      }).catch(() => {}); // Ignore errors from mocks

      // Check initial state
      const status = await engine.getStatus(runId);
      expect(status.state).toBe(PipelineExecutionState.RUNNING);
      
      await promise;
    });

    it('should update progress during execution', async () => {
      const runId = 'test-run-456';
      
      // Mock successful indexing
      vi.spyOn(engine as any, 'runIndexing').mockResolvedValue({
        filesIndexed: 100,
      });
      
      const promise = engine.startPipeline({
        mode: 'quick_diagnostic',
        targetPath: '/test',
        runId,
      }).catch(() => {});

      // Wait a bit for indexing to start
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const status = await engine.getStatus(runId);
      expect(status.progress).toBeGreaterThan(0);
      expect(status.progress).toBeLessThanOrEqual(100);
      
      await promise;
    });
  });

  describe('Cancellation Flow', () => {
    it('should transition to CANCELLED when cancelled', async () => {
      const runId = 'test-run-789';
      
      // Start pipeline
      const promise = engine.startPipeline({
        mode: 'quick_diagnostic',
        targetPath: '/test',
        runId,
      }).catch(() => {});

      // Cancel immediately
      await engine.cancelPipeline(runId);
      
      // Check state
      const status = await engine.getStatus(runId);
      expect(status.state).toBe(PipelineExecutionState.CANCELLED);
      
      await promise;
    });
  });

  describe('Error Handling', () => {
    it('should transition to FAILED on error', async () => {
      const runId = 'test-run-error';
      
      // Mock indexing failure
      vi.spyOn(engine as any, 'runIndexing').mockRejectedValue(
        new Error('Indexing failed')
      );
      
      await engine.startPipeline({
        mode: 'quick_diagnostic',
        targetPath: '/test',
        runId,
      }).catch(() => {});

      const status = await engine.getStatus(runId);
      expect(status.state).toBe(PipelineExecutionState.FAILED);
      expect(status.error).toBeDefined();
    });
  });
});
```

**Estimated Time:** 2-3 hours  
**Priority:** HIGH  
**Dependencies:** None

---

### Action 2.3: Create Orchestrator Auth Integration Test

**File:** `tests/integration/orchestrator-auth.integration.test.ts`

**Purpose:** Test that Orchestrator's auth middleware works correctly.

**Implementation:**
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createServer } from '../../apps/orchestrator/src/server';

describe('Orchestrator Auth Integration', () => {
  let app: FastifyInstance;
  const TEST_API_KEY = 'test-orchestrator-key';

  beforeAll(async () => {
    app = await createServer({
      port: 17001,
      apiKey: TEST_API_KEY,
    });
    await app.listen({ port: 17001, host: '127.0.0.1' });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Public Endpoints', () => {
    it('should allow access to /health without API key', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Protected Endpoints', () => {
    it('should return 401 when API key is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/pipeline/run',
        payload: {
          mode: 'quick_diagnostic',
          targetPath: '/test',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('AUTHENTICATION_ERROR');
    });

    it('should return 403 when API key is invalid', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/pipeline/run',
        payload: {
          mode: 'quick_diagnostic',
          targetPath: '/test',
        },
        headers: {
          'x-api-key': 'wrong-key',
        },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('AUTHENTICATION_ERROR');
    });

    it('should allow access with valid API key', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/pipeline/run',
        payload: {
          mode: 'quick_diagnostic',
          targetPath: '/test',
        },
        headers: {
          'x-api-key': TEST_API_KEY,
        },
      });

      // Should not be 401 or 403
      expect(response.statusCode).not.toBe(401);
      expect(response.statusCode).not.toBe(403);
    });
  });
});
```

**Estimated Time:** 1-2 hours  
**Priority:** MEDIUM  
**Dependencies:** Orchestrator server must have auth middleware implemented

---

## Phase 3: Add E2E Tests

### Action 3.1: Create Quick Diagnostic E2E Test

**File:** `tests/e2e/quick-diagnostic-workflow.e2e.test.ts`

**Purpose:** Test the complete quick diagnostic workflow end-to-end.

**Implementation:**
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createServer as createOrchestrator } from '../../apps/orchestrator/src/server';
import { IndexerServer } from '../../apps/indexer/src/server';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';

describe('Quick Diagnostic E2E Workflow', () => {
  let orchestrator: FastifyInstance;
  let indexer: IndexerServer;
  let tempProjectDir: string;
  const ORCHESTRATOR_PORT = 17001;
  const INDEXER_PORT = 19001;
  const API_KEY = 'e2e-test-key';

  beforeAll(async () => {
    // Create temp project
    tempProjectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-test-'));
    await fs.writeFile(
      path.join(tempProjectDir, 'index.ts'),
      'export function main() { console.log("Hello"); }',
      'utf-8'
    );

    // Start Indexer
    indexer = new IndexerServer({
      port: INDEXER_PORT,
      host: '127.0.0.1',
      apiKey: API_KEY,
    });
    await indexer.start();

    // Start Orchestrator
    orchestrator = await createOrchestrator({
      port: ORCHESTRATOR_PORT,
      apiKey: API_KEY,
      indexerUrl: `http://127.0.0.1:${INDEXER_PORT}`,
    });
    await orchestrator.listen({ 
      port: ORCHESTRATOR_PORT, 
      host: '127.0.0.1' 
    });
  }, 30000); // 30s timeout for setup

  afterAll(async () => {
    await orchestrator.close();
    await indexer.shutdown();
    await fs.rm(tempProjectDir, { recursive: true, force: true });
  });

  it('should complete quick diagnostic workflow', async () => {
    // 1. Start pipeline
    const startResponse = await orchestrator.inject({
      method: 'POST',
      url: '/api/v1/pipeline/run',
      headers: { 'x-api-key': API_KEY },
      payload: {
        mode: 'quick_diagnostic',
        targetPath: tempProjectDir,
      },
    });

    expect(startResponse.statusCode).toBe(200);
    const startBody = JSON.parse(startResponse.body);
    expect(startBody.ok).toBe(true);
    expect(startBody.run_id).toBeDefined();
    
    const runId = startBody.run_id;

    // 2. Poll for completion
    let completed = false;
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds max

    while (!completed && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const progressResponse = await orchestrator.inject({
        method: 'GET',
        url: `/api/v1/pipeline/progress/${runId}`,
        headers: { 'x-api-key': API_KEY },
      });

      const progressBody = JSON.parse(progressResponse.body);
      
      if (progressBody.state === 'COMPLETED') {
        completed = true;
      } else if (progressBody.state === 'FAILED') {
        throw new Error(`Pipeline failed: ${progressBody.error}`);
      }
      
      attempts++;
    }

    expect(completed).toBe(true);

    // 3. Get result
    const resultResponse = await orchestrator.inject({
      method: 'GET',
      url: `/api/v1/pipeline/result/${runId}`,
      headers: { 'x-api-key': API_KEY },
    });

    expect(resultResponse.statusCode).toBe(200);
    const resultBody = JSON.parse(resultResponse.body);
    expect(resultBody.ok).toBe(true);
    expect(resultBody.report).toBeDefined();
    expect(resultBody.report.summary).toBeTruthy();
  }, 60000); // 60s timeout for full workflow
});
```

**Estimated Time:** 3-4 hours  
**Priority:** MEDIUM  
**Dependencies:** Both Orchestrator and Indexer servers must be working

---

## Phase 4: Documentation

### Action 4.1: Create Test Strategy Document

**File:** `docs/TEST_STRATEGY.md`

**Content:**
```markdown
# Test Strategy

## Test Categories

### Unit Tests
- **Location:** `apps/*/src/**/__tests__/*.test.ts`
- **Purpose:** Test individual functions/classes in isolation
- **Dependencies:** Mocked
- **Speed:** <10ms per test
- **When to use:** Testing business logic, algorithms, utilities

### Integration Tests
- **Location:** `tests/integration/*.integration.test.ts`
- **Purpose:** Test multiple components working together
- **Dependencies:** Real (or in-memory)
- **Speed:** 100ms-1s per test
- **When to use:** Testing HTTP contracts, database operations, file I/O

### E2E Tests
- **Location:** `tests/e2e/*.e2e.test.ts`
- **Purpose:** Test complete user workflows
- **Dependencies:** All services running
- **Speed:** 1s-10s per test
- **When to use:** Testing critical happy paths, major features

## Naming Conventions

- Unit tests: `ComponentName.test.ts`
- Integration tests: `feature-name.integration.test.ts`
- E2E tests: `workflow-name.e2e.test.ts`

## Mock vs Real Decision Tree

```
Is it testing a single function/class?
├─ Yes → Unit test (mock dependencies)
└─ No → Is it testing HTTP/network communication?
    ├─ Yes → Integration test (real HTTP, may mock backend)
    └─ No → Is it testing complete workflow?
        ├─ Yes → E2E test (all real services)
        └─ No → Integration test (real components, mock external)
```

## Running Tests

```bash
# All tests
pnpm test

# Unit tests only
pnpm test:unit

# Integration tests only
pnpm test:integration

# E2E tests only
pnpm test:e2e

# With coverage
pnpm test:coverage
```

## Writing Good Tests

### DO
- ✅ Test behavior, not implementation
- ✅ Use descriptive test names
- ✅ Test error cases
- ✅ Clean up resources (files, servers, etc.)
- ✅ Use real dependencies for integration/e2e tests

### DON'T
- ❌ Mock everything in integration tests
- ❌ Test implementation details
- ❌ Write flaky tests (timing-dependent)
- ❌ Mislabel test categories
- ❌ Skip cleanup in afterAll/afterEach
```

**Estimated Time:** 1 hour  
**Priority:** LOW  
**Dependencies:** None

---

## Summary

### Total Effort Estimate
- Phase 1 (Cleanup): 1-2 hours
- Phase 2 (Integration Tests): 5-7 hours
- Phase 3 (E2E Tests): 3-4 hours
- Phase 4 (Documentation): 1 hour
- **Total: 10-14 hours (1.5-2 days)**

### Priority Order
1. **Phase 1** - Immediate cleanup (removes misleading tests)
2. **Action 2.1** - Orchestrator-Indexer integration (critical contract)
3. **Action 2.2** - Pipeline status flow (critical behavior)
4. **Action 2.3** - Auth integration (security critical)
5. **Action 3.1** - E2E happy path (user-facing validation)
6. **Phase 4** - Documentation (knowledge sharing)

### Success Metrics
- ✅ Zero misleading tests
- ✅ 3+ real integration tests
- ✅ 1+ real E2E test
- ✅ Test names match behavior
- ✅ Critical contracts protected

---

**Document Version:** 1.0  
**Last Updated:** 2026-03-07
