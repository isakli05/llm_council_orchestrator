# Drift Resolution Re-Audit Results

**Date:** December 12, 2025  
**Baseline:** COMPREHENSIVE_DRIFT_AUDIT.md  
**Method:** Code inspection, import analysis, structural comparison

---

## 1. Drift Resolution Table

| Audit Item | Status | Evidence |
|------------|--------|----------|
| **A1. Error Structure Pattern** | PARTIAL | `packages/shared-types/src/errors.ts` exports `ApiError` interface ✅<br>Orchestrator imports it ✅<br>**BUT:** `apps/mcp_bridge/src/types/orchestrator.ts:15-20,24-29` still has local duplicate error structures<br>`apps/orchestrator/src/observability/Trace.ts:14-18` has local error structure for spans |
| **A2. Metadata Structure Pattern** | RESOLVED | `packages/shared-types/src/models.ts` exports `ExecutionMetadata` base interface ✅<br>All apps import from shared-types ✅ |
| **A3. Pipeline Status/State Enums** | PARTIAL | `packages/shared-types/src/status.ts` exports all status enums ✅<br>Orchestrator imports `PipelineState` ✅<br>**BUT:** `apps/orchestrator/src/api/validators.ts:32,60,101` has 3 hardcoded Zod enums with different status strings<br>`apps/vscode_extension/src/types/index.ts:7` has local status literals: 'running' \| 'completed' \| 'failed' \| 'aborted'<br>`apps/vscode_extension/webview-ui/src/types/index.ts:21,32` has local status literals<br>`apps/mcp_bridge/src/types/orchestrator.ts:48` has local status literals |
| **A4. Role Types** | RESOLVED | `packages/shared-types/src/roles.ts` exports `RoleType` enum ✅<br>`apps/orchestrator/src/roles/types.ts:1` imports it ✅ |
| **A5. Provider Types** | RESOLVED | `packages/shared-types/src/models.ts` exports `ProviderType` enum ✅<br>`apps/orchestrator/src/models/types.ts:1` imports it ✅ |
| **A6. Chat Message Structure** | RESOLVED | `packages/shared-types/src/models.ts` exports `ChatMessage` interface ✅<br>`apps/orchestrator/src/models/types.ts:1` imports it ✅ |
| **A7. Search Request/Response Types** | RESOLVED | `packages/shared-types/src/indexer.ts` exports all indexer contract types ✅<br>`apps/orchestrator/src/indexer/types.ts:8-9` imports them ✅ |
| **A8. MCP Protocol Types** | N/A | Correctly kept in mcp_bridge (not shared) ✅ |
| **B1. Pipeline Mode String Literals** | PARTIAL | `packages/shared-config/src/index.ts` exports `PIPELINE_MODES` and `PipelineModeSchema` ✅<br>`apps/orchestrator/src/api/validators.ts:2` imports `PipelineModeSchema` ✅<br>**BUT:** `apps/vscode_extension/package.json:92-97` still has hardcoded enum array<br>`apps/vscode_extension/src/utils/config.ts:11` still has hardcoded default 'full_analysis' |
| **B2. Timeout and Retry Constants** | PARTIAL | `packages/shared-config/src/index.ts` exports `TIMEOUTS` and `RETRY_CONFIG` ✅<br>`apps/orchestrator/src/models/ModelGateway.ts:1` imports them ✅<br>`apps/orchestrator/src/server.ts:3` imports `TIMEOUTS` ✅<br>**BUT:** `apps/vscode_extension/package.json:115` still has hardcoded progressPollInterval default (2000)<br>`apps/vscode_extension/src/utils/config.ts:27` still has hardcoded default (2000) |
| **B3. Log Levels** | RESOLVED | `packages/shared-config/src/index.ts` exports `LogLevel` enum ✅<br>All loggers import from shared-config ✅<br>No local LogLevel definitions found ✅ |
| **B4. Error Code Registry** | RESOLVED | `packages/shared-config/src/index.ts` exports `ERROR_CODES` ✅<br>`apps/orchestrator/src/api/validators.ts:2` imports it ✅<br>`apps/orchestrator/src/models/ModelGateway.ts:1` imports it ✅<br>`apps/orchestrator/src/indexer/IndexClient.ts:1` imports it ✅ |
| **C1. JSON Serialization** | PARTIAL | `packages/shared-utils/src/index.ts` exports `formatJson` and `safeJsonParse` ✅<br>Most apps import and use it ✅<br>**BUT:** `apps/indexer/example.ts:33,46,51,56` still has 4 direct `JSON.stringify(value, null, 2)` calls |
| **C2. Logger Implementation** | RESOLVED | `packages/shared-utils/src/logger/BaseLogger.ts` exports base logger ✅<br>`apps/orchestrator/src/observability/Logger.ts:15` extends BaseLogger ✅<br>`apps/indexer/src/observability/Logger.ts:15` extends BaseLogger ✅<br>`apps/mcp_bridge/src/observability/Logger.ts:12` extends BaseLogger ✅<br>VSCode logger correctly kept separate (platform-specific) ✅ |
| **C3. Sleep/Delay Utility** | PARTIAL | `packages/shared-utils/src/index.ts` exports `sleep` utility ✅<br>`apps/orchestrator/src/models/ModelGateway.ts:2` imports it ✅<br>**BUT:** `apps/orchestrator/src/indexer/IndexClient.ts:184-186` still has local `private sleep()` method |
| **C4. Retry Logic with Exponential Backoff** | PARTIAL | `packages/shared-utils/src/index.ts` exports `retryWithBackoff` ✅<br>`apps/orchestrator/src/models/ModelGateway.ts:2` imports it ✅<br>**BUT:** `apps/orchestrator/src/models/ModelGateway.ts:97-115` still has local retry loop implementation instead of using the shared utility |
| **C5. Timeout Wrapper** | RESOLVED | `packages/shared-utils/src/index.ts` exports `withTimeout` ✅<br>`apps/orchestrator/src/models/ModelGateway.ts:2` imports it ✅<br>No local timeout wrapper implementations found ✅ |
| **C6. Error Type Guards** | N/A | Not migrated (low priority item, acceptable) |

---

## 2. Remaining Issues

### CRITICAL

#### Issue 1: Status Enum Drift in Validators
**Files:**
- `apps/orchestrator/src/api/validators.ts:32` - hardcoded `z.enum(["pending", "running", "completed", "failed", "cancelled"])`
- `apps/orchestrator/src/api/validators.ts:60` - hardcoded `z.enum(["pending", "running", "success", "error"])`
- `apps/orchestrator/src/api/validators.ts:101` - hardcoded `z.enum(["not_indexed", "indexing", "ready", "error"])`

**What's Wrong:** Shared enums exist in `@llm/shared-types` (`PipelineStatus`, `ExecutionStatus`, `IndexStatus`) but validators use hardcoded string literals. This violates the audit requirement to eliminate status string inconsistencies.

**Why It Violates:** Audit item A3 explicitly required consolidating status enums to "prevent integration bugs from inconsistent status strings." The validators are API contracts and must use shared enums.

---

#### Issue 2: Status Literals in VSCode Extension
**Files:**
- `apps/vscode_extension/src/types/index.ts:7` - `status: 'running' | 'completed' | 'failed' | 'aborted'`
- `apps/vscode_extension/webview-ui/src/types/index.ts:21` - `status: 'running' | 'completed' | 'error'`
- `apps/vscode_extension/webview-ui/src/types/index.ts:32` - `status: 'pending' | 'running' | 'completed' | 'error'`

**What's Wrong:** VSCode extension defines its own status literals instead of importing from `@llm/shared-types`.

**Why It Violates:** Audit item A3 required sharing status enums across all services including vscode_extension. Different status strings ('aborted' vs 'cancelled', 'error' vs 'failed') create integration bugs.

---

#### Issue 3: Error Structure in MCP Bridge
**Files:**
- `apps/mcp_bridge/src/types/orchestrator.ts:15-20` - local error structure in `OrchestratorRunResponse`
- `apps/mcp_bridge/src/types/orchestrator.ts:24-29` - local error structure in steps array

**What's Wrong:** MCP bridge still defines local error structures instead of importing `ApiError` from `@llm/shared-types`.

**Why It Violates:** Audit item A1 (CRITICAL DRIFT) required moving the error pattern to shared-types. This was found in 11+ locations and represents "cross-service contract pattern."

---

### MODERATE

#### Issue 4: Pipeline Mode in VSCode Config
**Files:**
- `apps/vscode_extension/package.json:92-97` - hardcoded enum array
- `apps/vscode_extension/src/utils/config.ts:11` - hardcoded default 'full_analysis'

**What's Wrong:** VSCode extension duplicates pipeline mode values instead of referencing shared-config.

**Why It Violates:** Audit item B1 (CRITICAL DRIFT) required generating VSCode package.json enum from shared-config during build. The shared `PipelineModeSchema` exists but isn't used.

---

#### Issue 5: Local Sleep Implementation
**Files:**
- `apps/orchestrator/src/indexer/IndexClient.ts:184-186` - private sleep method

**What's Wrong:** IndexClient has local sleep implementation despite importing `sleep` from shared-utils at line 2.

**Why It Violates:** Audit item C3 (MODERATE DRIFT) required eliminating duplicate sleep implementations. The shared utility exists and is imported but not used.

---

#### Issue 6: Local Retry Logic
**Files:**
- `apps/orchestrator/src/models/ModelGateway.ts:97-115` - manual retry loop

**What's Wrong:** ModelGateway implements its own retry loop despite importing `retryWithBackoff` from shared-utils at line 2.

**Why It Violates:** Audit item C4 (MODERATE DRIFT) required using shared retry utility. The implementation exists and is imported but not used.

---

### MINOR

#### Issue 7: JSON.stringify in Example File
**Files:**
- `apps/indexer/example.ts:33,46,51,56` - 4 instances of `JSON.stringify(value, null, 2)`

**What's Wrong:** Example file uses direct JSON.stringify instead of `formatJson`.

**Why It Violates:** Audit item C1 (CRITICAL DRIFT) required replacing all JSON.stringify calls. However, this is an example file, so impact is minimal.

---

#### Issue 8: Timeout Config in VSCode
**Files:**
- `apps/vscode_extension/package.json:115` - hardcoded progressPollInterval: 2000
- `apps/vscode_extension/src/utils/config.ts:27` - hardcoded default: 2000

**What's Wrong:** VSCode extension hardcodes poll interval instead of importing from shared-config.

**Why It Violates:** Audit item B2 (CRITICAL DRIFT) required centralizing timeout constants. `TIMEOUTS.PROGRESS_POLL_INTERVAL` exists in shared-config but isn't used.

---

#### Issue 9: Error Structure in Trace
**Files:**
- `apps/orchestrator/src/observability/Trace.ts:14-18` - local error structure in TraceSpan

**What's Wrong:** Trace spans define local error structure `{ message: string; stack?: string }` instead of using `ApiError`.

**Why It Violates:** Audit item A1 required standardizing error structures. However, this is internal observability (not cross-service), so impact is lower.

---

## 3. Regression Risks

### Risk 1: Unused Shared Utilities
**Evidence:**
- `retryWithBackoff` is imported but not used in ModelGateway
- `sleep` is imported but not used in IndexClient

**Risk:** Developers may not realize shared utilities exist and continue creating local implementations. The refactor imported utilities but didn't replace the local code.

---

### Risk 2: Inconsistent Status Strings Remain
**Evidence:**
- Validators use: "pending", "running", "completed", "failed", "cancelled"
- Validators also use: "pending", "running", "success", "error"
- VSCode uses: "running", "completed", "failed", "aborted"
- VSCode webview uses: "running", "completed", "error"
- MCP bridge uses: "running", "completed", "failed", "idle"

**Risk:** The original audit identified this as causing "potential integration bugs." The refactor created shared enums but didn't enforce their use. Services still use different strings for the same concepts.

---

### Risk 3: Partial Migration Pattern
**Evidence:**
- Multiple files import shared utilities but still use local implementations
- Shared types exist but local duplicates remain

**Risk:** This creates confusion about which implementation to use and suggests the refactor was incomplete or not validated.

---

## 4. Final Verdict

**FAIL – Significant audit items still unresolved**

**Justification:**

The refactor successfully created comprehensive shared packages with all required types, configs, and utilities. However, **critical drift items remain unresolved** because the refactor stopped at creating shared packages without completing the migration:

1. **Status enum drift (A3 - CRITICAL)** remains across 3 apps with 8+ locations using hardcoded status strings instead of shared enums
2. **Error structure drift (A1 - CRITICAL)** persists in MCP bridge types
3. **Imported but unused utilities** in 2 locations indicate incomplete migration
4. **Pipeline mode duplication (B1 - CRITICAL)** remains in VSCode extension config

The audit explicitly required eliminating these patterns to "prevent integration bugs" and establish "single source of truth." Creating shared packages satisfies only 50% of the requirement—the other 50% is updating all apps to actually use them.

**Estimated Completion:** 70% of audit items resolved, 30% remain (primarily in validators, VSCode extension, and MCP bridge types).
