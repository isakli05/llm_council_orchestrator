# Comprehensive Shared Package Drift Audit

**Date:** December 12, 2025  
**Auditor:** Kiro AI  
**Scope:** All apps (orchestrator, indexer, mcp_bridge, vscode_extension) and shared packages

---

## Executive Summary

**Finding:** The script's "0 findings" result is **INACCURATE**. Significant type, config, and utility drift exists across `/apps`, but the audit script's regex patterns were too narrow to detect the actual drift patterns in this codebase.

**Conclusion:** **(ii) Shared packages should be used but drift exists in /apps**

The shared packages are partially used (orchestrator imports them), but substantial drift exists where types, configs, and utilities that should be shared are duplicated or defined locally within individual apps.

---

## 1. Shared Packages Current Usage

### 1.1 @llm/shared-types

**Current Exports:**
- `FinalArchitecturalReport` (interface)
- `FinalArchitecturalReportSection` (interface)

**Import Sites:**
- `apps/orchestrator/src/aggregation/Aggregator.ts:1`
- `apps/orchestrator/src/aggregation/types.ts:1`

**Status:** ✅ Used by orchestrator only. NOT imported by indexer, mcp_bridge, or vscode_extension.

---

### 1.2 @llm/shared-config

**Current Exports:**
- `PIPELINE_MODES` (const object with 4 modes)
- `PipelineMode` (type)

**Import Sites:**
- `apps/orchestrator/src/core/orchestratorCore.ts:3`
- `apps/orchestrator/src/pipeline/stateMachine.ts:1`
- `apps/orchestrator/src/pipeline/PipelineEngine.ts:1`
- `apps/orchestrator/src/pipeline/types.ts:1`
- `apps/orchestrator/src/main.ts:1`
- `apps/orchestrator/src/aggregation/Aggregator.ts:2`

**Status:** ✅ Used by orchestrator only. NOT imported by indexer, mcp_bridge, or vscode_extension.

---

### 1.3 @llm/shared-utils

**Current Exports:**
- `safeJson(value: unknown): string` - wrapper around JSON.stringify with formatting

**Import Sites:**
- **No imports found** across any app

**Status:** ❌ Completely unused despite being declared as a dependency in all app package.json files.

---

## 2. Drift Findings

### SECTION A: Shared Types Drift

#### A1. Error Structure Pattern (CRITICAL DRIFT)

**Pattern:**
```typescript
error?: {
  code: string;
  message: string;
  details?: unknown;
}
```

**Found In:**
1. `apps/orchestrator/src/models/types.ts:30-34` (ModelResponse)
2. `apps/orchestrator/src/pipeline/types.ts:21-26` (PipelineStepResult)
3. `apps/orchestrator/src/pipeline/types.ts:36-41` (PipelineResult)
4. `apps/orchestrator/src/pipeline/states.ts:23-27` (StateTransition)
5. `apps/orchestrator/src/indexer/types.ts:17-21` (IndexResult)
6. `apps/orchestrator/src/indexer/types.ts:58-62` (SearchResponse)
7. `apps/orchestrator/src/indexer/types.ts:85-89` (ContextResponse)
8. `apps/orchestrator/src/roles/types.ts:29-33` (RoleResponse)
9. `apps/orchestrator/src/aggregation/types.ts:23-27` (AggregationResult)
10. `apps/mcp_bridge/src/types/orchestrator.ts:15-20` (OrchestratorRunResponse)
11. `apps/mcp_bridge/src/types/orchestrator.ts:24-29` (OrchestratorRunResponse.steps)

**Why Drift:** This is a cross-service contract pattern used in 11+ locations. It represents the standard error response structure for the entire system.

**Duplicated:** Yes, exact same structure across orchestrator and mcp_bridge.

**Recommendation:** Move to `@llm/shared-types` as `ApiError` interface.

---

#### A2. Metadata Structure Pattern (CRITICAL DRIFT)

**Pattern:**
```typescript
metadata?: {
  tokensUsed?: number;
  latencyMs?: number;
  ...
}
```

**Found In:**
1. `apps/orchestrator/src/models/types.ts:25-29` (ModelResponse - includes finishReason)
2. `apps/orchestrator/src/roles/types.ts:44-47` (RoleOutput - tokensUsed, latencyMs)
3. `apps/orchestrator/src/aggregation/types.ts:19-23` (AggregationResult - modelsUsed, contributionSummary)
4. `apps/orchestrator/src/indexer/types.ts:44-48` (SearchResultItem - lineStart, lineEnd, language)

**Why Drift:** Common metadata pattern for tracking execution metrics across services.

**Duplicated:** Partially - different fields but same concept.

**Recommendation:** Create base `ExecutionMetadata` interface in `@llm/shared-types` with common fields (tokensUsed, latencyMs), allow extensions.

---

#### A3. Pipeline Status/State Enums (CRITICAL DRIFT)

**Pattern:** Status string literals used across services

**Found In:**

1. **Orchestrator Pipeline States:**
   - `apps/orchestrator/src/pipeline/states.ts:4-13` - `PipelineState` enum
   - Values: INIT, INDEX, ANALYZE, AGGREGATE, SPECIFY, GENERATE, OUTPUT, ABORTED, COMPLETED

2. **Orchestrator Index Status:**
   - `apps/orchestrator/src/indexer/types.ts:4-10` - `IndexStatus` enum
   - Values: NOT_STARTED, IN_PROGRESS, READY, FAILED

3. **API Validators (Zod schemas):**
   - `apps/orchestrator/src/api/validators.ts:29` - status enum: "pending", "running", "completed", "failed", "cancelled"
   - `apps/orchestrator/src/api/validators.ts:90` - status enum: "not_indexed", "indexing", "ready", "error"

4. **MCP Bridge:**
   - `apps/mcp_bridge/src/types/orchestrator.ts:48` - PipelineProgressResponse status: "running" | "completed" | "failed" | "idle"

5. **VSCode Extension:**
   - `apps/vscode_extension/src/types/index.ts:7` - PipelineRun status: 'running' | 'completed' | 'failed' | 'aborted'
   - `apps/vscode_extension/webview-ui/src/types/index.ts:21` - status: 'running' | 'completed' | 'error'
   - `apps/vscode_extension/webview-ui/src/types/index.ts:32` - TimelineStep status: 'pending' | 'running' | 'completed' | 'error'

**Why Drift:** These are cross-service contracts. Different services use different string literals for the same conceptual states, causing potential integration bugs.

**Duplicated:** Yes, with inconsistent naming (e.g., "failed" vs "error", "cancelled" vs "aborted").

**Recommendation:** Create unified status enums in `@llm/shared-types`:
- `PipelineStatus` (for pipeline execution)
- `IndexStatus` (for indexing state)
- `ExecutionStatus` (generic success/failure states)

---

#### A4. Role Types (MODERATE DRIFT)

**Found In:**
- `apps/orchestrator/src/roles/types.ts:4-10` - `RoleType` enum
- Values: LEGACY_ANALYSIS, ARCHITECT, MIGRATION, SECURITY, AGGREGATOR

**Why Drift:** Role types are referenced in API contracts and should be shared with mcp_bridge and vscode_extension for type safety.

**Duplicated:** No, but should be shared.

**Recommendation:** Move to `@llm/shared-types`.

---

#### A5. Provider Types (MODERATE DRIFT)

**Found In:**
- `apps/orchestrator/src/models/types.ts:40-46` - `ProviderType` enum
- Values: OPENAI, ANTHROPIC, GLM, GEMINI, GROK

**Why Drift:** Provider types are part of the model configuration contract and may be referenced by other services.

**Duplicated:** No, but should be shared.

**Recommendation:** Move to `@llm/shared-types`.

---

#### A6. Chat Message Structure (MODERATE DRIFT)

**Found In:**
- `apps/orchestrator/src/models/types.ts:4-7` - `ChatMessage` interface
```typescript
interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
```

**Why Drift:** Standard LLM message format that could be used across services.

**Duplicated:** No, but should be shared.

**Recommendation:** Move to `@llm/shared-types`.

---

#### A7. Search Request/Response Types (MODERATE DRIFT)

**Found In:**
- `apps/orchestrator/src/indexer/types.ts:26-35` - `SearchRequest` interface
- `apps/orchestrator/src/indexer/types.ts:40-48` - `SearchResultItem` interface
- `apps/orchestrator/src/indexer/types.ts:53-63` - `SearchResponse` interface

**Why Drift:** These are contracts between orchestrator and indexer services. Should be shared.

**Duplicated:** No, but should be shared for type safety across service boundaries.

**Recommendation:** Move to `@llm/shared-types` as `IndexerTypes` namespace.

---

#### A8. MCP Protocol Types (LOW DRIFT)

**Found In:**
- `apps/mcp_bridge/src/types/mcp.ts:6-42` - MCP protocol types (MCPRequest, MCPResponse, MCPError, etc.)

**Why Drift:** These are MCP-specific and only used by mcp_bridge. Not cross-service.

**Duplicated:** No.

**Recommendation:** Keep in mcp_bridge (not shared).

---

### SECTION B: Shared Config / Policy Drift

#### B1. Pipeline Mode String Literals (CRITICAL DRIFT)

**Current State:**
- ✅ `@llm/shared-config` exports `PIPELINE_MODES` with 4 modes
- ❌ `apps/orchestrator/src/api/validators.ts:7-12` duplicates these as Zod enum:
  ```typescript
  pipeline_mode: z.enum([
    "quick_diagnostic",
    "full_analysis",
    "spec_generation",
    "refinement",
  ])
  ```
- ❌ `apps/vscode_extension/package.json:95-100` duplicates in VSCode config:
  ```json
  "enum": [
    "quick_diagnostic",
    "full_analysis",
    "spec_generation",
    "refinement"
  ]
  ```
- ❌ `apps/vscode_extension/src/utils/config.ts:11` hardcodes default: `'full_analysis'`

**Why Drift:** The shared config exists but is not used consistently. Validators and configs duplicate the values.

**Duplicated:** Yes, in 3 locations (shared-config, validators, vscode config).

**Recommendation:** 
1. Keep source of truth in `@llm/shared-config`
2. Create Zod schema export in shared-config: `export const PipelineModeSchema = z.enum([...])`
3. Update validators to import from shared-config
4. Generate VSCode package.json enum from shared-config during build

---

#### B2. Timeout and Retry Constants (CRITICAL DRIFT)

**Found In:**
1. `apps/orchestrator/src/models/ModelGateway.ts:14-15`
   ```typescript
   private readonly defaultTimeout = 30000; // 30 seconds
   private readonly maxRetries = 2;
   ```

2. `apps/orchestrator/src/server.ts:44`
   ```typescript
   requestTimeout: 600000, // 10 minutes
   ```

3. `apps/vscode_extension/package.json:115`
   ```json
   "llmCouncil.progressPollInterval": {
     "default": 2000
   }
   ```

**Why Drift:** These are policy constants that should be centralized for consistency and easy tuning.

**Duplicated:** Different timeout values across different contexts.

**Recommendation:** Move to `@llm/shared-config`:
```typescript
export const TIMEOUTS = {
  MODEL_CALL_DEFAULT: 30000,
  HTTP_REQUEST: 600000,
  PROGRESS_POLL_INTERVAL: 2000,
} as const;

export const RETRY_CONFIG = {
  MAX_RETRIES: 2,
  BACKOFF_BASE: 1000,
} as const;
```

---

#### B3. Log Levels (MODERATE DRIFT)

**Found In:**
1. `apps/orchestrator/src/observability/Logger.ts:4-9` - `LogLevel` enum (lowercase: "debug", "info", "warn", "error")
2. `apps/indexer/src/observability/Logger.ts:1-5` - `LogLevel` enum (uppercase: "DEBUG", "INFO", "WARN", "ERROR")
3. `apps/mcp_bridge/src/observability/Logger.ts:5` - type alias (lowercase: "debug" | "info" | "warn" | "error")

**Why Drift:** Same concept, different implementations. Inconsistent casing.

**Duplicated:** Yes, 3 implementations.

**Recommendation:** Move to `@llm/shared-config`:
```typescript
export enum LogLevel {
  DEBUG = "debug",
  INFO = "info",
  WARN = "warn",
  ERROR = "error",
}
```

---

#### B4. HTTP Status Codes and Error Codes (LOW DRIFT)

**Found In:**
- Various error code strings like "MODEL_CALL_ERROR", "INDEX_ERROR", "VALIDATION_ERROR" scattered across services
- No centralized error code registry

**Why Drift:** Error codes should be centralized for documentation and consistency.

**Duplicated:** No, but should be centralized.

**Recommendation:** Create error code registry in `@llm/shared-config`:
```typescript
export const ERROR_CODES = {
  // Model errors
  MODEL_CALL_ERROR: "MODEL_CALL_ERROR",
  MODEL_TIMEOUT: "MODEL_TIMEOUT",
  
  // Index errors
  INDEX_ERROR: "INDEX_ERROR",
  INDEX_NOT_READY: "INDEX_NOT_READY",
  
  // Validation errors
  VALIDATION_ERROR: "VALIDATION_ERROR",
  
  // ... etc
} as const;
```

---

### SECTION C: Shared Utils Drift

#### C1. JSON Serialization (CRITICAL DRIFT)

**Current State:**
- ✅ `@llm/shared-utils` exports `safeJson(value): string` - JSON.stringify with formatting
- ❌ **Completely unused** - no imports found

**Actual Usage:**
- `JSON.stringify(value, null, 2)` appears in **15+ locations** across all apps:
  1. `apps/orchestrator/src/observability/Logger.ts:116`
  2. `apps/indexer/example.ts:33, 46, 51, 56`
  3. `apps/indexer/src/incremental/IncrementalTracker.ts:107`
  4. `apps/indexer/src/vector_index/storage.ts:35, 42, 61`
  5. `apps/mcp_bridge/src/tools/registerTools.ts:89, 103, 117, 136, 155`
  6. And more...

**Why Drift:** The shared util exists but is not used. Direct JSON.stringify calls are duplicated everywhere.

**Duplicated:** Yes, 15+ times.

**Recommendation:** 
1. Rename `safeJson` to `formatJson` for clarity
2. Add `safeJsonParse` utility with error handling
3. Update all apps to import from `@llm/shared-utils`

---

#### C2. Logger Implementation (CRITICAL DRIFT)

**Found In:**
1. `apps/orchestrator/src/observability/Logger.ts` - Full Logger class (145 lines)
2. `apps/indexer/src/observability/Logger.ts` - Full Logger class (105 lines)
3. `apps/mcp_bridge/src/observability/Logger.ts` - Minimal Logger class (60 lines)
4. `apps/vscode_extension/src/utils/logger.ts` - VSCode-specific logger

**Similarities:**
- All implement: debug(), info(), warn(), error()
- All have LogLevel enum/type
- All format timestamps
- All write to console

**Differences:**
- Orchestrator: supports runId, context objects
- Indexer: supports child loggers, error objects
- MCP Bridge: JSON output format
- VSCode: uses OutputChannel

**Why Drift:** Core logging functionality is duplicated 3 times with slight variations.

**Duplicated:** Yes, 3 implementations.

**Recommendation:** Create base logger in `@llm/shared-utils`:
```typescript
export abstract class BaseLogger {
  // Common functionality
  protected abstract write(entry: LogEntry): void;
}

export class ConsoleLogger extends BaseLogger {
  // Console implementation
}
```
Each app can extend for specific needs (runId, OutputChannel, etc.).

---

#### C3. Sleep/Delay Utility (MODERATE DRIFT)

**Found In:**
1. `apps/orchestrator/src/models/ModelGateway.ts:183-185`
   ```typescript
   private sleep(ms: number): Promise<void> {
     return new Promise((resolve) => setTimeout(resolve, ms));
   }
   ```

2. `apps/orchestrator/src/indexer/IndexClient.ts:183-185`
   ```typescript
   private sleep(ms: number): Promise<void> {
     return new Promise((resolve) => setTimeout(resolve, ms));
   }
   ```

**Why Drift:** Identical utility function duplicated in 2 classes.

**Duplicated:** Yes, exact duplicate.

**Recommendation:** Move to `@llm/shared-utils`:
```typescript
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
```

---

#### C4. Retry Logic with Exponential Backoff (MODERATE DRIFT)

**Found In:**
- `apps/orchestrator/src/models/ModelGateway.ts:87-113` - Full retry implementation with exponential backoff

**Pattern:**
```typescript
for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
  // ... try operation
  if (attempt < this.maxRetries) {
    await this.sleep(Math.pow(2, attempt) * 1000);
  }
}
```

**Why Drift:** Retry logic is a common pattern that should be reusable.

**Duplicated:** No, but should be shared.

**Recommendation:** Create retry utility in `@llm/shared-utils`:
```typescript
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries: number;
    backoffBase: number;
    isRetryable?: (error: Error) => boolean;
  }
): Promise<T>
```

---

#### C5. Timeout Wrapper (MODERATE DRIFT)

**Found In:**
- `apps/orchestrator/src/models/ModelGateway.ts:143-152` - Promise.race timeout wrapper

**Pattern:**
```typescript
private async callWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Model call timeout")), timeoutMs)
    ),
  ]);
}
```

**Why Drift:** Timeout wrapper is a common pattern that should be reusable.

**Duplicated:** No, but should be shared.

**Recommendation:** Move to `@llm/shared-utils`:
```typescript
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  errorMessage = "Operation timeout"
): Promise<T>
```

---

#### C6. Error Type Guards (LOW DRIFT)

**Found In:**
- `apps/orchestrator/src/models/ModelGateway.ts:172-181` - `isRetryableError(error: Error): boolean`

**Why Drift:** Error classification logic could be shared.

**Duplicated:** No, but could be useful across services.

**Recommendation:** Consider adding to `@llm/shared-utils` if needed elsewhere.

---

## 3. Why the Script Found "0 Findings"

The audit script (`scripts/audit-shared-drift.js`) used overly narrow regex patterns:

1. **TYPE_REGEX:** `/^\s*(export\s+)?(interface|type|enum)\s+(\w+)/`
   - Only detects exact duplicates by name
   - Misses structural duplicates (e.g., error pattern used 11 times with different parent types)

2. **CONFIG_REGEX:** `/\b(general_architecture|DEEP|EXCLUDED|PIPELINE_MODES|analysisDepth)\b/`
   - Hardcoded to specific strings that don't exist in this codebase
   - Misses actual config drift (timeout values, retry counts, log levels)

3. **UTIL_REGEX:** `/\b(function|const)\s+(validate|assert|safe|normalize|hash)\w*/`
   - Only looks for specific function name prefixes
   - Misses actual duplicated utilities (sleep, JSON.stringify, Logger classes)

4. **Grouping Logic:** Only flags items with 2+ exact name matches
   - Misses structural patterns
   - Misses single-location items that should be shared

---

## 4. Ordered Migration Plan

### Phase 1: Critical Error Contracts (Week 1)
1. Create `ApiError` interface in `@llm/shared-types` for standardized error structure
2. Create unified status enums (`PipelineStatus`, `IndexStatus`, `ExecutionStatus`)
3. Update all apps to import these types
4. Run type checks to ensure no breakage

### Phase 2: Pipeline Mode Consolidation (Week 1)
5. Export Zod schema from `@llm/shared-config` for pipeline modes
6. Update `apps/orchestrator/src/api/validators.ts` to import schema
7. Update VSCode extension config to reference shared constants
8. Test end-to-end pipeline execution

### Phase 3: Core Utilities (Week 2)
9. Implement `formatJson`, `safeJsonParse`, `sleep`, `withTimeout`, `retryWithBackoff` in `@llm/shared-utils`
10. Replace all direct JSON.stringify/parse calls with shared utils
11. Replace duplicated sleep/timeout implementations

### Phase 4: Configuration Constants (Week 2)
12. Move timeout/retry constants to `@llm/shared-config`
13. Move LogLevel enum to `@llm/shared-config`
14. Create error code registry in `@llm/shared-config`
15. Update all apps to import from shared-config

### Phase 5: Logger Consolidation (Week 3)
16. Design base logger interface in `@llm/shared-utils`
17. Refactor orchestrator logger to extend base
18. Refactor indexer logger to extend base
19. Refactor mcp_bridge logger to extend base
20. Keep VSCode logger separate (platform-specific)

### Phase 6: Model and Role Types (Week 3)
21. Move `ChatMessage`, `ProviderType`, `RoleType` to `@llm/shared-types`
22. Move indexer contract types (`SearchRequest`, `SearchResponse`) to `@llm/shared-types`
23. Update all imports across apps

### Phase 7: Metadata Standardization (Week 4)
24. Create base `ExecutionMetadata` interface in `@llm/shared-types`
25. Refactor all metadata fields to extend base interface
26. Ensure backward compatibility

### Phase 8: Validation and Testing (Week 4)
27. Run full type checking across all apps
28. Run integration tests
29. Update documentation
30. Create migration guide for future developers

---

## 5. Recommendations Summary

### Immediate Actions (High Priority)
1. **Standardize error structures** - 11+ locations use same pattern
2. **Consolidate pipeline mode strings** - Already in shared-config but not used consistently
3. **Share status enums** - Prevent integration bugs from inconsistent status strings
4. **Implement shared JSON utilities** - Replace 15+ duplicate JSON.stringify calls

### Medium Priority
5. **Consolidate logger implementations** - 3 duplicate implementations
6. **Share timeout/retry configs** - Centralize policy constants
7. **Move cross-service types** - Role types, provider types, search contracts

### Low Priority
8. **Refactor metadata structures** - Create base interfaces
9. **Create error code registry** - Centralize error codes
10. **Document shared package usage** - Prevent future drift

---

## 6. Estimated Impact

### Code Reduction
- **~500 lines** of duplicated code can be eliminated
- **~30 type definitions** can be consolidated
- **~15 utility functions** can be shared

### Risk Reduction
- **Eliminate type mismatches** between services (especially status strings)
- **Prevent integration bugs** from inconsistent contracts
- **Improve maintainability** with single source of truth

### Developer Experience
- **Faster development** with reusable utilities
- **Better type safety** across service boundaries
- **Clearer contracts** between services

---

## Appendix: Complete File Inventory

### Orchestrator Types
- `src/aggregation/types.ts` - 5 interfaces
- `src/pipeline/types.ts` - 3 interfaces
- `src/pipeline/states.ts` - 1 enum, 2 interfaces
- `src/indexer/types.ts` - 1 enum, 6 interfaces
- `src/models/types.ts` - 1 enum, 4 interfaces, 1 interface
- `src/roles/types.ts` - 1 enum, 4 interfaces
- `src/observability/Logger.ts` - 1 enum, 1 interface, 1 class

### Indexer Types
- `src/observability/Logger.ts` - 1 enum, 1 interface, 1 class

### MCP Bridge Types
- `src/types/mcp.ts` - 6 interfaces
- `src/types/orchestrator.ts` - 4 interfaces
- `src/observability/Logger.ts` - 1 type, 1 class

### VSCode Extension Types
- `src/types/index.ts` - 3 interfaces
- `src/types/messages.ts` - 40+ message interfaces
- `webview-ui/src/types/index.ts` - 5 interfaces, 1 type

---

**End of Audit Report**
