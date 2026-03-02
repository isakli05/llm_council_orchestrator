# Design Document: Domain Discovery Engine (RAA)

## Overview

The Domain Discovery Engine introduces a new DISCOVER pipeline state that executes between INDEX and ANALYZE. This state implements Retrieval-Augmented Analysis (RAA) to identify architectural domains in the codebase using signals extracted from the index. All discovered domains default to DEEP analysis unless explicitly excluded by the user.

## Architecture

### System Context

```
┌─────────────────────────────────────────────────────────────┐
│                    LLM Council Orchestrator                 │
│                                                             │
│  ┌──────┐   ┌───────┐   ┌──────────┐   ┌─────────┐          │
│  │ INIT │──▶│ INDEX │──▶│ DISCOVER │──▶│ ANALYZE │──▶...    │
│  └──────┘   └───────┘   └──────────┘   └─────────┘          │
│                              │                              │
│                              ▼                              │
│                    ┌──────────────────┐                     │
│                    │ DiscoveryResult  │                     │
│                    │ - domains[]      │                     │
│                    │ - metadata       │                     │
│                    └──────────────────┘                     │
└─────────────────────────────────────────────────────────────┘
```

### Component Integration

**Existing Components (No Modification Required):**
- `IndexClient`: Provides index metadata to discovery engine
- `StateMachine`: Extended with new DISCOVER state
- `PipelineEngine`: Extended with discovery step execution
- `RoleManager`: Consumes discovery results for domain-specific analysis
- `Aggregator`: Receives domain-tagged outputs

**New Components:**
- `DomainDiscoveryEngine`: Core discovery logic
- `SignalExtractor`: Extracts architectural signals from index
- `DomainClassifier`: Identifies domains from signals
- `DiscoveryResult`: Data structure for discovered domains

## Components and Interfaces

### 1. DomainDiscoveryEngine

**Location:** `apps/orchestrator/src/discovery/DomainDiscoveryEngine.ts`

**Responsibilities:**
- Orchestrate discovery process
- Coordinate signal extraction and domain classification
- Apply user exclusions
- Produce DiscoveryResult

**Interface:**
```typescript
interface DomainDiscoveryEngine {
  /**
   * Execute domain discovery using index metadata
   * @param indexMetadata - Metadata from completed index
   * @param userExclusions - Optional user-specified exclusions
   * @returns DiscoveryResult with all domains tagged as DEEP or EXCLUDED
   */
  discover(
    indexMetadata: IndexMetadata,
    userExclusions?: string[]
  ): Promise<DiscoveryResult>;
}
```

**Input:**
```typescript
interface IndexMetadata {
  totalChunks: number;
  totalFiles: number;
  filesByExtension: Record<string, number>;
  directoryStructure: DirectoryNode[];
  detectedFrameworks: string[];
  dependencies: DependencyInfo[];
}
```

**Output:**
```typescript
interface DiscoveryResult {
  schemaVersion: string;
  discoveredAt: string;
  domains: Domain[];
  statistics: {
    totalDomains: number;
    deepDomains: number;
    excludedDomains: number;
  };
  executionMetadata: {
    discoveryTimeMs: number;
    indexChunksAnalyzed: number;
    signalTypesUsed: string[];
  };
}

interface Domain {
  id: string;
  name: string;
  confidence: number; // 0.0 - 1.0
  analysisDepth: "DEEP" | "EXCLUDED";
  signals: Signal[];
  evidence: Evidence[];
  subDomains?: Domain[];
}

interface Signal {
  type: "file_pattern" | "dependency" | "framework" | "route" | "config";
  value: string;
  weight: number;
}

interface Evidence {
  filePath: string;
  lineRange?: { start: number; end: number };
  snippet?: string;
  relevanceScore: number;
}
```

### 2. SignalExtractor

**Location:** `apps/orchestrator/src/discovery/SignalExtractor.ts`

**Responsibilities:**
- Extract architectural signals from index metadata
- Categorize signals by type
- Weight signals by reliability

**Interface:**
```typescript
interface SignalExtractor {
  /**
   * Extract all architectural signals from index
   */
  extractSignals(indexMetadata: IndexMetadata): Signal[];
  
  /**
   * Extract file pattern signals (directory structure)
   */
  extractFilePatternSignals(directoryStructure: DirectoryNode[]): Signal[];
  
  /**
   * Extract dependency signals (package.json, composer.json, etc.)
   */
  extractDependencySignals(dependencies: DependencyInfo[]): Signal[];
  
  /**
   * Extract framework signals (Laravel, Express, Django, etc.)
   */
  extractFrameworkSignals(detectedFrameworks: string[]): Signal[];
}
```

**Signal Extraction Rules:**

1. **File Pattern Signals:**
   - `/auth` directory → authentication domain (weight: 0.9)
   - `/payment` directory → payment domain (weight: 0.9)
   - `/admin` directory → admin domain (weight: 0.8)
   - `/api` directory → api domain (weight: 0.7)
   - `/models` directory → data domain (weight: 0.6)

2. **Dependency Signals:**
   - `passport`, `jwt` → authentication domain (weight: 0.9)
   - `stripe`, `paypal` → payment domain (weight: 0.95)
   - `express`, `fastify` → api domain (weight: 0.8)
   - `react`, `vue` → frontend domain (weight: 0.8)

3. **Framework Signals:**
   - Laravel detected → php_monolith domain (weight: 0.7)
   - Express detected → node_api domain (weight: 0.7)
   - Django detected → python_monolith domain (weight: 0.7)

### 3. DomainClassifier

**Location:** `apps/orchestrator/src/discovery/DomainClassifier.ts`

**Responsibilities:**
- Group signals into domains
- Calculate domain confidence scores
- Resolve domain overlaps
- Apply default-deep tagging

**Interface:**
```typescript
interface DomainClassifier {
  /**
   * Classify signals into domains
   * All domains are tagged as DEEP by default
   */
  classify(signals: Signal[]): Domain[];
  
  /**
   * Calculate confidence score for a domain
   * Confidence does NOT affect analysisDepth (always DEEP)
   */
  calculateConfidence(domain: Domain): number;
  
  /**
   * Resolve overlapping domains (e.g., auth + api)
   * Creates parent-child relationships
   */
  resolveOverlaps(domains: Domain[]): Domain[];
}
```

**Classification Algorithm:**

1. **Signal Grouping:**
   - Group signals by semantic similarity
   - Signals with shared keywords map to same domain
   - Example: `passport`, `/auth`, `jwt` → authentication domain

2. **Confidence Calculation:**
   ```
   confidence = (sum of signal weights) / (max possible weight)
   confidence = clamp(confidence, 0.0, 1.0)
   ```

3. **Default-Deep Enforcement:**
   ```typescript
   for (const domain of domains) {
     domain.analysisDepth = "DEEP"; // Always DEEP, never auto-exclude
   }
   ```

4. **Overlap Resolution:**
   - If domain A contains domain B (e.g., api contains auth_api):
     - Make B a sub-domain of A
     - Both remain DEEP
   - If domains are peers (e.g., auth and payment):
     - Keep as separate top-level domains
     - Both remain DEEP

### 4. Pipeline State Integration

**Modified File:** `apps/orchestrator/src/pipeline/states.ts`

**New State:**
```typescript
export enum PipelineState {
  INIT = "INIT",
  INDEX = "INDEX",
  DISCOVER = "DISCOVER", // NEW
  ANALYZE = "ANALYZE",
  AGGREGATE = "AGGREGATE",
  SPECIFY = "SPECIFY",
  GENERATE = "GENERATE",
  OUTPUT = "OUTPUT",
  ABORTED = "ABORTED",
  COMPLETED = "COMPLETED",
}
```

**Modified File:** `apps/orchestrator/src/pipeline/stateMachine.ts`

**Updated State Sequences:**
```typescript
getStateSequence(mode: PipelineMode): PipelineState[] {
  switch (mode) {
    case PIPELINE_MODES.QUICK:
      return [
        PipelineState.INIT,
        PipelineState.ANALYZE, // No INDEX, no DISCOVER
        PipelineState.OUTPUT,
        PipelineState.COMPLETED,
      ];

    case PIPELINE_MODES.FULL:
      return [
        PipelineState.INIT,
        PipelineState.INDEX,
        PipelineState.DISCOVER, // NEW
        PipelineState.ANALYZE,
        PipelineState.AGGREGATE,
        PipelineState.OUTPUT,
        PipelineState.COMPLETED,
      ];

    case PIPELINE_MODES.SPEC:
      return [
        PipelineState.INIT,
        PipelineState.INDEX,
        PipelineState.DISCOVER, // NEW
        PipelineState.ANALYZE,
        PipelineState.AGGREGATE,
        PipelineState.SPECIFY,
        PipelineState.OUTPUT,
        PipelineState.COMPLETED,
      ];

    case PIPELINE_MODES.REFINEMENT:
      return [
        PipelineState.INIT,
        PipelineState.INDEX,
        PipelineState.DISCOVER, // NEW
        PipelineState.ANALYZE,
        PipelineState.GENERATE,
        PipelineState.OUTPUT,
        PipelineState.COMPLETED,
      ];
  }
}
```

**Guard Condition:**
```typescript
checkGuard(state: PipelineState, context: Record<string, unknown>): boolean {
  switch (state) {
    case PipelineState.DISCOVER:
      // Require index to be ready
      return context.indexReady === true;
      
    case PipelineState.ANALYZE:
      // Require discovery to be complete (or skipped in QUICK mode)
      if (context.mode === PIPELINE_MODES.QUICK) {
        return true;
      }
      return context.discoveryComplete === true;
      
    // ... existing guards
  }
}
```

### 5. PipelineEngine Integration

**Modified File:** `apps/orchestrator/src/pipeline/PipelineEngine.ts`

**New Step Handler:**
```typescript
private async executeStep(
  stepName: string,
  context: PipelineContext
): Promise<PipelineStepResult> {
  switch (stepName) {
    case "discover":
      return await this.executeDiscoveryStep(context);
    
    // ... existing step handlers
  }
}

private async executeDiscoveryStep(
  context: PipelineContext
): Promise<PipelineStepResult> {
  try {
    // Get index metadata from context
    const indexMetadata = context.indexMetadata;
    
    // Get user exclusions from request
    const userExclusions = context.userExclusions || [];
    
    // Execute discovery
    const discoveryEngine = new DomainDiscoveryEngine();
    const discoveryResult = await discoveryEngine.discover(
      indexMetadata,
      userExclusions
    );
    
    // Store in context for downstream states
    context.discoveryResult = discoveryResult;
    context.discoveryComplete = true;
    
    return {
      stepName: "discover",
      success: true,
      data: discoveryResult,
      executedAt: new Date().toISOString(),
    };
  } catch (err) {
    const error = err as Error;
    return {
      stepName: "discover",
      success: false,
      error: {
        code: "DISCOVERY_ERROR",
        message: error.message,
        details: error.stack,
      },
      executedAt: new Date().toISOString(),
    };
  }
}
```

### 6. RoleManager Integration

**Modified File:** `apps/orchestrator/src/roles/RoleManager.ts`

**Domain-Aware Role Execution:**
```typescript
async executeRoleForDomains(
  role: RoleType,
  domains: Domain[],
  context: PipelineContext
): Promise<RoleResponse[]> {
  const responses: RoleResponse[] = [];
  
  // Filter to DEEP domains only
  const deepDomains = domains.filter(d => d.analysisDepth === "DEEP");
  
  for (const domain of deepDomains) {
    // Retrieve domain-specific context using RAG
    const domainContext = await this.retrieveDomainContext(domain, context);
    
    // Execute role with domain-specific context
    const response = await this.executeRole({
      role,
      prompt: context.prompt,
      context: {
        ...context,
        domain: domain.name,
        domainConfidence: domain.confidence,
        domainEvidence: domain.evidence,
        retrievedChunks: domainContext.chunks,
      },
    });
    
    responses.push(response);
  }
  
  return responses;
}

private async retrieveDomainContext(
  domain: Domain,
  context: PipelineContext
): Promise<DomainContext> {
  // Use IndexClient to perform semantic search
  const searchQuery = this.constructDomainQuery(domain);
  const searchResults = await context.indexClient.semanticSearch({
    query: searchQuery,
    limit: 20,
    filters: {
      // Filter by domain evidence file paths
      paths: domain.evidence.map(e => e.filePath),
    },
  });
  
  return {
    domain: domain.name,
    chunks: searchResults.results,
  };
}
```

### 7. User Exclusion Handling

**Request Schema Extension:**
```typescript
interface PipelineRequest {
  mode: PipelineMode;
  prompt: string;
  modelsOverride?: Record<string, string | string[]>;
  domainExclusions?: DomainExclusion[]; // NEW
}

interface DomainExclusion {
  domainId: string;
  justification: string;
}
```

**Exclusion Application:**
```typescript
// In DomainDiscoveryEngine.discover()
applyUserExclusions(
  domains: Domain[],
  exclusions: DomainExclusion[]
): Domain[] {
  const exclusionMap = new Map(
    exclusions.map(e => [e.domainId, e.justification])
  );
  
  for (const domain of domains) {
    if (exclusionMap.has(domain.id)) {
      domain.analysisDepth = "EXCLUDED";
      domain.exclusionMetadata = {
        excludedAt: new Date().toISOString(),
        justification: exclusionMap.get(domain.id)!,
      };
    }
  }
  
  return domains;
}
```

## Data Models

### Domain

```typescript
interface Domain {
  id: string;                    // Unique identifier (e.g., "auth_domain")
  name: string;                  // Human-readable name (e.g., "Authentication")
  confidence: number;            // 0.0 - 1.0 (does NOT affect analysisDepth)
  analysisDepth: "DEEP" | "EXCLUDED";
  signals: Signal[];             // Signals that led to discovery
  evidence: Evidence[];          // Code locations supporting discovery
  subDomains?: Domain[];         // Nested domains (e.g., auth_api under api)
  exclusionMetadata?: {
    excludedAt: string;
    justification: string;
  };
}
```

### Signal

```typescript
interface Signal {
  type: "file_pattern" | "dependency" | "framework" | "route" | "config";
  value: string;                 // Signal value (e.g., "/auth", "passport")
  weight: number;                // 0.0 - 1.0 (reliability of signal)
  source: string;                // Where signal was extracted (e.g., "directory_structure")
}
```

### Evidence

```typescript
interface Evidence {
  filePath: string;              // Relative path to file
  lineRange?: {
    start: number;
    end: number;
  };
  snippet?: string;              // Code snippet (max 200 chars)
  relevanceScore: number;        // 0.0 - 1.0 (how relevant to domain)
}
```

### DiscoveryResult

```typescript
interface DiscoveryResult {
  schemaVersion: string;         // "1.0.0"
  discoveredAt: string;          // ISO 8601 timestamp
  domains: Domain[];
  statistics: {
    totalDomains: number;
    deepDomains: number;
    excludedDomains: number;
  };
  executionMetadata: {
    discoveryTimeMs: number;
    indexChunksAnalyzed: number;
    signalTypesUsed: string[];
    fallbackApplied: boolean;    // True if discovery failed and fell back
  };
}
```

## Error Handling

### Retry Logic

```typescript
async discover(
  indexMetadata: IndexMetadata,
  userExclusions?: string[]
): Promise<DiscoveryResult> {
  const maxRetries = 3;
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await this.executeDiscovery(indexMetadata, userExclusions);
    } catch (err) {
      lastError = err as Error;
      logger.warn(`Discovery attempt ${attempt + 1} failed`, {
        error: lastError.message,
      });
      
      if (attempt < maxRetries - 1) {
        await this.sleep(Math.pow(2, attempt) * 1000); // Exponential backoff
      }
    }
  }
  
  // Fallback: return default domain
  logger.error("Discovery failed after max retries, falling back", {
    error: lastError?.message,
  });
  
  return this.createFallbackResult();
}
```

### Fallback Behavior

```typescript
private createFallbackResult(): DiscoveryResult {
  return {
    schemaVersion: "1.0.0",
    discoveredAt: new Date().toISOString(),
    domains: [
      {
        id: "general_architecture",
        name: "General Architecture",
        confidence: 0.5,
        analysisDepth: "DEEP",
        signals: [],
        evidence: [],
      },
    ],
    statistics: {
      totalDomains: 1,
      deepDomains: 1,
      excludedDomains: 0,
    },
    executionMetadata: {
      discoveryTimeMs: 0,
      indexChunksAnalyzed: 0,
      signalTypesUsed: [],
      fallbackApplied: true,
    },
  };
}

private validateDiscoveryResult(result: DiscoveryResult): boolean {
  // Validate schema structure
  if (!result.schemaVersion || !result.domains || !Array.isArray(result.domains)) {
    return false;
  }
  
  // Validate each domain has required fields
  for (const domain of result.domains) {
    if (!domain.id || !domain.name || !domain.analysisDepth) {
      return false;
    }
    if (domain.analysisDepth !== "DEEP" && domain.analysisDepth !== "EXCLUDED") {
      return false;
    }
  }
  
  return true;
}
```

**Malformed Output Handling:**

When discovery produces malformed output (invalid schema, missing required fields, or corrupted data), the system SHALL:
1. Log the validation error with details
2. Call `createFallbackResult()` to generate a fallback domain
3. Set `fallbackApplied: true` in execution metadata
4. Continue pipeline execution with the fallback domain

**Zero-Domain Handling:**

When discovery produces zero domains (empty array), the system SHALL:
1. Log a warning about zero domains discovered
2. Call `createFallbackResult()` to generate a fallback domain
3. Set `fallbackApplied: true` in execution metadata
4. Continue pipeline execution with the fallback domain

Both scenarios ensure the pipeline never reverts to static role-only execution without domain context.

## Testing Strategy

### Unit Tests

1. **SignalExtractor Tests:**
   - Test file pattern extraction with various directory structures
   - Test dependency extraction with different package managers
   - Test framework detection with mixed stacks

2. **DomainClassifier Tests:**
   - Test signal grouping with overlapping signals
   - Test confidence calculation with various signal weights
   - Test default-deep enforcement (all domains tagged DEEP)
   - Test overlap resolution with nested domains

3. **DomainDiscoveryEngine Tests:**
   - Test end-to-end discovery with mock index metadata
   - Test user exclusion application
   - Test retry logic with transient failures
   - Test fallback behavior when discovery fails

### Integration Tests

1. **Pipeline Integration:**
   - Test DISCOVER state execution in FULL mode
   - Test state transition from INDEX to DISCOVER to ANALYZE
   - Test context propagation of DiscoveryResult

2. **RoleManager Integration:**
   - Test domain-aware role execution
   - Test RAG context retrieval per domain
   - Test exclusion filtering (EXCLUDED domains not analyzed)

### Property-Based Tests

**Property 1: Default-Deep Invariant**
*For any* index metadata and user exclusions, all discovered domains that are not explicitly excluded SHALL have analysisDepth = "DEEP"
**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

**Property 2: Exclusion Preservation**
*For any* user exclusion list, all excluded domains SHALL appear in DiscoveryResult with analysisDepth = "EXCLUDED" and exclusionMetadata populated
**Validates: Requirements 4.2, 4.3, 4.5**

**Property 3: Discovery Completeness**
*For any* index metadata, if discovery succeeds, DiscoveryResult.domains SHALL NOT be empty (fallback domain created if needed)
**Validates: Requirements 1.5, 11.1**

**Property 4: Signal Extraction Determinism**
*For any* index metadata, running signal extraction twice SHALL produce identical signals
**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

## Non-Goals

The Domain Discovery Engine explicitly does NOT:

1. **Automatic Exclusion:** Never auto-exclude domains based on heuristics (e.g., "modern code doesn't need legacy analysis")
2. **Domain Prioritization:** Never rank domains by importance (all DEEP domains receive equal analysis)
3. **Code Generation:** Never generate code, migrations, or refactoring plans during discovery
4. **User Interaction:** Never prompt user for input during discovery (fully automated)
5. **Index Modification:** Never modify the index or codebase (read-only operation)
6. **Spec Generation:** Never generate specs during discovery (deferred to SPECIFY state)
7. **Role Execution:** Never execute roles during discovery (deferred to ANALYZE state)
8. **Confidence Thresholding:** Never exclude low-confidence domains (confidence is informational only)

## Responsibility Model

### System Guarantees

The system GUARANTEES:
- All detectable domains are included in DiscoveryResult
- No domains are auto-excluded without user consent
- All discovered domains default to DEEP analysis
- User exclusions are applied exactly as specified
- Exclusion records are persisted with justification
- Discovery failures trigger fallback (never abort pipeline)

### User Responsibilities

The user MUST:
- Validate that discovered domains are architecturally significant
- Verify that domain boundaries are correct
- Accept risk of excluding domains (system warns but allows)
- Provide justification for exclusions (required field)

### Shared Responsibilities

Both system and user:
- Interpret confidence scores (system provides, user judges)
- Refine domain definitions over time (system learns, user guides)
