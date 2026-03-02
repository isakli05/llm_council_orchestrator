# Shared Package Enforcement - Cleanup Report

**Date:** December 12, 2025  
**Scope:** apps/orchestrator, apps/indexer, apps/mcp_bridge  
**Excluded:** apps/vscode_extension (out of scope)

---

## 1. Deleted Local Definitions

### apps/orchestrator/src/indexer/IndexClient.ts
- **Deleted:** `private sleep(ms: number): Promise<void>` method (lines 184-186)
- **Reason:** Duplicate of `sleep` from `@llm/shared-utils`

### apps/orchestrator/src/models/ModelGateway.ts
- **Deleted:** Manual retry loop with exponential backoff (lines 97-115)
- **Reason:** Replaced with `retryWithBackoff` from `@llm/shared-utils`

### apps/orchestrator/src/api/validators.ts
- **Deleted:** Hardcoded status enum `z.enum(["pending", "running", "completed", "failed", "cancelled"])`
- **Deleted:** Hardcoded status enum `z.enum(["pending", "running", "success", "error"])`
- **Deleted:** Hardcoded status enum `z.enum(["not_indexed", "indexing", "ready", "error"])`
- **Reason:** Replaced with `z.nativeEnum()` using shared enums

### apps/mcp_bridge/src/types/orchestrator.ts
- **Deleted:** Local error structure `{ code: string; message: string; details?: unknown }` (2 instances)
- **Reason:** Replaced with `ApiError` from `@llm/shared-types`

### apps/indexer/example.ts
- **Deleted:** 4 instances of `JSON.stringify(value, null, 2)`
- **Reason:** Replaced with `formatJson` from `@llm/shared-utils`

---

## 2. Refactored Files

### apps/orchestrator/src/api/validators.ts
**Changes:**
- Added import: `import { PipelineStatus, ExecutionStatus, IndexStatus } from "@llm/shared-types"`
- Replaced `z.enum(["pending", "running", "completed", "failed", "cancelled"])` → `z.nativeEnum(PipelineStatus)`
- Replaced `z.enum(["pending", "running", "success", "error"])` → `z.nativeEnum(ExecutionStatus)`
- Replaced `z.enum(["not_indexed", "indexing", "ready", "error"])` → `z.nativeEnum(IndexStatus)`
- **Impact:** API validators now enforce shared status enums, preventing status string drift

### apps/orchestrator/src/models/ModelGateway.ts
**Changes:**
- Refactored `callWithRetry()` method to use `retryWithBackoff` from shared-utils
- Removed manual retry loop (18 lines → 20 lines with proper error handling)
- **Impact:** Retry logic now centralized, consistent backoff behavior

### apps/orchestrator/src/indexer/IndexClient.ts
**Changes:**
- Removed local `sleep()` method
- Changed `await this.sleep(100)` → `await sleep(100)` (using imported utility)
- **Impact:** No duplicate sleep implementations

### apps/mcp_bridge/src/types/orchestrator.ts
**Changes:**
- Added import: `import { ApiError } from "@llm/shared-types"`
- Replaced local error structures with `ApiError` type (2 locations)
- **Impact:** Error contracts now consistent across services

### apps/indexer/example.ts
**Changes:**
- Added import: `import { formatJson } from '@llm/shared-utils'`
- Changed import: `LogLevel` now from `@llm/shared-config` (was from local Logger)
- Replaced 4 instances of `JSON.stringify(value, null, 2)` → `formatJson(value)`
- **Impact:** Example code demonstrates proper shared utility usage

---

## 3. Confirmation Checklist

### ✅ No status string literals remain outside shared-types
- **Verified:** All hardcoded status enums in validators replaced with `z.nativeEnum()`
- **Verified:** No `z.enum([...])` with status strings found in orchestrator/indexer/mcp_bridge
- **Exception:** `apps/orchestrator/src/observability/Trace.ts` uses internal status literals for observability (not cross-service API)
- **Exception:** `apps/mcp_bridge/src/types/orchestrator.ts` PipelineProgressResponse uses MCP-specific status (documented as intentional)

### ✅ No duplicate error structures remain
- **Verified:** All local `error?: { code: string; message: string; ... }` patterns replaced with `ApiError`
- **Verified:** No inline error object definitions found in API types
- **Exception:** `apps/orchestrator/src/observability/Trace.ts` uses internal error structure for span tracing (not cross-service API)

### ✅ No local retry or sleep implementations remain
- **Verified:** No `private sleep()` methods found
- **Verified:** No `for (let attempt = 0; ...)` retry loops found
- **Verified:** No `callWithTimeout` or manual `Promise.race` timeout wrappers found
- **Verified:** All retry logic uses `retryWithBackoff` from shared-utils
- **Verified:** All sleep calls use `sleep` from shared-utils
- **Verified:** All timeout wrappers use `withTimeout` from shared-utils

### ✅ All shared imports are actively used
- **Verified:** `sleep` imported and used in IndexClient
- **Verified:** `retryWithBackoff` imported and used in ModelGateway
- **Verified:** `withTimeout` imported and used in ModelGateway
- **Verified:** `formatJson` imported and used in 8 files
- **Verified:** `safeJsonParse` imported and used in 4 files
- **Verified:** `BaseLogger` imported and extended in 3 loggers
- **Verified:** `LogLevel` imported from shared-config in all loggers
- **Verified:** Status enums imported and used in validators
- **Verified:** `ApiError` imported and used in MCP bridge types

---

## 4. TypeScript Compilation Status

### apps/orchestrator
```
✅ npx tsc --noEmit --project apps/orchestrator/tsconfig.json
Exit Code: 0 (Success)
```

### apps/indexer
```
✅ npx tsc --noEmit --project apps/indexer/tsconfig.json
Exit Code: 0 (Success)
```

### apps/mcp_bridge
```
✅ npx tsc --noEmit --project apps/mcp_bridge/tsconfig.json
Exit Code: 0 (Success)
```

---

## 5. Remaining Acceptable Exceptions

### Internal Observability Types (Not Cross-Service)
**File:** `apps/orchestrator/src/observability/Trace.ts`
- Local error structure: `{ message: string; stack?: string }`
- Local status literals: `"started" | "completed" | "failed"`
- **Justification:** Internal tracing/observability, not exposed as API contract

### MCP-Specific Status
**File:** `apps/mcp_bridge/src/types/orchestrator.ts`
- `status: "running" | "completed" | "failed" | "idle"`
- **Justification:** MCP protocol-specific status, documented as intentional

---

## 6. Summary Statistics

| Metric | Count |
|--------|-------|
| Files Modified | 5 |
| Local Definitions Deleted | 10 |
| Hardcoded Enums Replaced | 3 |
| Retry Loops Eliminated | 1 |
| Sleep Implementations Removed | 1 |
| JSON.stringify Calls Replaced | 4 |
| Error Structures Unified | 2 |
| TypeScript Errors | 0 |

---

## 7. Final Statement

**Shared packages are now the single enforced source of truth; all local drift has been eliminated.**
