# Test Realism Audit - Executive Summary

## Critical Findings

### The Problem
Tests labeled as "integration" and "e2e" are actually **mock object shape validators** with 0% real system behavior verification.

### Evidence

**File: `tests/e2e/full-workflow.e2e.test.ts`**
- Claims to be E2E test
- Defines `BASE_URL` and `API_KEY` but never uses them
- Imports `axios` but never makes HTTP calls
- Only validates mock object shapes

**File: `tests/integration/orchestrator-indexer.integration.test.ts`**
- Claims to test Orchestrator-Indexer integration
- Defines service URLs but never connects
- All tests use `vi.fn().mockResolvedValue()`
- Zero real HTTP communication

### Real Tests (Miscategorized)

**Good Examples:**
1. `apps/mcp_bridge/src/__tests__/integration.test.ts` - Real HTTP server, real calls (80% realism)
2. `apps/indexer/src/server.test.ts` - Real Fastify server, real endpoints (90% realism)
3. `apps/orchestrator/src/__tests__/AsyncNonBlocking.test.ts` - Real file I/O, real event loop (100% realism)

## Test Distribution

### Current (Misleading)
```
E2E: 1 file (0 real tests)
Integration: 1 file (0 real tests)
Unit: 25+ files (mostly good)
```

### Actual Reality
```
E2E: 0 real tests
Integration: 2 real tests (in wrong locations)
Unit: 25+ tests (correct)
```

## Critical Contract Gaps

### Protected ✅
- MCP Bridge ↔ Orchestrator API
- Indexer HTTP API
- File System Non-Blocking

### Unprotected ❌
- Orchestrator ↔ Indexer HTTP contract
- Pipeline status/progress flow
- Full workflow (index → analyze → aggregate)
- Error propagation across services
- Auth flow end-to-end

## Recommendations

### Immediate Actions
1. **Delete** misleading tests:
   - `tests/e2e/full-workflow.e2e.test.ts`
   - `tests/integration/orchestrator-indexer.integration.test.ts`

2. **Relocate** real tests:
   - Move `AsyncNonBlocking.test.ts` to `tests/integration/`

### New Tests Needed

**Priority 1: Orchestrator-Indexer Real Integration**
```typescript
// tests/integration/orchestrator-indexer-real.integration.test.ts
describe('Orchestrator-Indexer Real HTTP Contract', () => {
  let indexerServer: IndexerServer;
  let orchestratorClient: IndexClient;
  
  beforeAll(async () => {
    indexerServer = new IndexerServer({ port: 19001 });
    await indexerServer.start();
    orchestratorClient = new IndexClient({ 
      baseUrl: 'http://localhost:19001' 
    });
  });
  
  it('should ensure index via real HTTP', async () => {
    const result = await orchestratorClient.ensureIndexed({
      projectRoot: '/test/project'
    });
    expect(result.success).toBe(true);
    expect(result.filesIndexed).toBeGreaterThan(0);
  });
});
```

**Priority 2: Pipeline Status Flow**
```typescript
// tests/integration/pipeline-status-flow.integration.test.ts
describe('Pipeline Status Flow', () => {
  it('should transition through states correctly', async () => {
    const engine = new PipelineEngine({...});
    const runId = await engine.startPipeline({...});
    
    // Verify RUNNING
    let status = await engine.getStatus(runId);
    expect(status.state).toBe('RUNNING');
    
    // Wait for INDEXING
    await waitForState(engine, runId, 'INDEXING');
    
    // Verify progress updates
    status = await engine.getStatus(runId);
    expect(status.progress).toBeGreaterThan(0);
  });
});
```

**Priority 3: E2E Happy Path**
```typescript
// tests/e2e/quick-diagnostic-workflow.e2e.test.ts
describe('Quick Diagnostic E2E', () => {
  it('should complete full workflow', async () => {
    // 1. Start pipeline
    const response = await fetch('http://localhost:7001/api/v1/pipeline/run', {
      method: 'POST',
      body: JSON.stringify({ mode: 'quick_diagnostic', ... })
    });
    const { run_id } = await response.json();
    
    // 2. Poll for completion
    let status;
    do {
      const statusRes = await fetch(`http://localhost:7001/api/v1/pipeline/progress/${run_id}`);
      status = await statusRes.json();
      await sleep(1000);
    } while (status.state !== 'COMPLETED');
    
    // 3. Get result
    const resultRes = await fetch(`http://localhost:7001/api/v1/pipeline/result/${run_id}`);
    const result = await resultRes.json();
    
    expect(result.report).toBeDefined();
    expect(result.report.summary).toBeTruthy();
  });
});
```

## Test Category Definitions

### Unit Test
- **Scope:** Single function/class in isolation
- **Dependencies:** Mocked
- **Speed:** Very fast (<10ms)
- **Realism:** 30-40%

### Integration Test
- **Scope:** Multiple components working together
- **Dependencies:** Real (or in-memory)
- **Speed:** Medium (100ms-1s)
- **Realism:** 80-90%

### E2E Test
- **Scope:** Full user workflow
- **Dependencies:** All services real
- **Speed:** Slow (1s-10s)
- **Realism:** 90-100%

## Metrics

### Current State
| Category | Files | Real Tests | Realism |
|----------|-------|------------|---------|
| Unit | 25+ | 25+ | 35% |
| Integration | 2 | 2 | 85% |
| E2E | 1 | 0 | 0% |
| **Total** | **28+** | **27+** | **~40%** |

### Target State
| Category | Files | Real Tests | Realism |
|----------|-------|------------|---------|
| Unit | 25+ | 25+ | 35% |
| Integration | 8-10 | 8-10 | 85% |
| E2E | 3-5 | 3-5 | 95% |
| **Total** | **36-40** | **36-40** | **~60%** |

## Success Criteria

- ✅ Test names match actual behavior
- ✅ Critical contracts protected by real tests
- ✅ Test reports provide meaningful signals
- ✅ Team can refactor with confidence

## Implementation Plan

### Phase 1: Cleanup (1-2 days)
- Delete misleading tests
- Relocate real tests
- Document test categories

### Phase 2: Critical Contracts (3-5 days)
- Orchestrator-Indexer real integration
- Pipeline status flow
- Auth integration

### Phase 3: E2E Happy Path (2-3 days)
- Quick diagnostic workflow
- Test infrastructure
- CI/CD integration

### Phase 4: Documentation (1 day)
- Test strategy guide
- Writing guidelines
- Mock vs Real decisions

---

**Report Date:** 2026-03-07  
**Status:** Ready for Review
