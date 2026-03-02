# Domain Discovery Engine - Architecture

## 📁 File Organization

### Shared Types (`packages/shared-types/`)

**Purpose:** Type definitions shared across multiple applications (orchestrator, MCP bridge, VSCode extension)

```
packages/shared-types/src/
├── discovery.ts              ← Core discovery types (Domain, Signal, Evidence, etc.)
├── discovery-config.ts       ← Configuration types
└── discovery-metrics.ts      ← Metrics types
```

**What goes here:**
- ✅ Type definitions that multiple apps need
- ✅ Interface definitions
- ✅ Enum definitions
- ❌ NO implementations
- ❌ NO classes
- ❌ NO business logic

**Example:**
```typescript
// ✅ GOOD - Type definition
export interface Domain {
  id: string;
  name: string;
  confidence: number;
  // ...
}

// ❌ BAD - Implementation
export class DomainDiscoveryEngine {
  discover() { /* ... */ }
}
```

### Orchestrator Implementation (`apps/orchestrator/src/discovery/`)

**Purpose:** Discovery engine implementation specific to orchestrator

```
apps/orchestrator/src/discovery/
├── types.ts                  ← Local types + re-exports from shared-types
├── config.ts                 ← ConfigManager IMPLEMENTATION
├── metrics.ts                ← MetricsCollector IMPLEMENTATION
├── cache.ts                  ← Cache IMPLEMENTATION
├── DomainDiscoveryEngine.ts  ← Discovery IMPLEMENTATION
├── SignalExtractor.ts        ← Signal extraction IMPLEMENTATION
├── DomainClassifier.ts       ← Classification IMPLEMENTATION
└── DomainSpecWriter.ts       ← Spec generation IMPLEMENTATION
```

**What goes here:**
- ✅ Implementation classes
- ✅ Business logic
- ✅ Local types (IndexMetadata, DirectoryNode)
- ✅ Re-exports of shared types for convenience
- ❌ NO types that other apps need

## 🔄 Type Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    @llm/shared-types                        │
│                                                             │
│  discovery.ts          ← Domain, Signal, Evidence          │
│  discovery-config.ts   ← Config types                      │
│  discovery-metrics.ts  ← Metrics types                     │
│                                                             │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ import
                   ▼
┌─────────────────────────────────────────────────────────────┐
│              apps/orchestrator/src/discovery                │
│                                                             │
│  types.ts              ← Re-exports + local types          │
│  config.ts             ← Uses config types                 │
│  metrics.ts            ← Uses metrics types                │
│  DomainDiscoveryEngine ← Uses Domain, Signal types         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 🎯 Why This Architecture?

### 1. Separation of Concerns

**Types (shared-types):**
- Contract between applications
- Can be versioned independently
- No runtime dependencies

**Implementation (orchestrator):**
- Business logic
- Runtime behavior
- Can be changed without affecting other apps

### 2. Reusability

**MCP Bridge** can use discovery types:
```typescript
import { Domain, DiscoveryResult } from '@llm/shared-types';

// Can work with discovery results without importing orchestrator
function processDomains(result: DiscoveryResult) {
  // ...
}
```

**VSCode Extension** can use discovery types:
```typescript
import { Domain } from '@llm/shared-types';

// Can display domains without importing orchestrator
function renderDomainTree(domains: Domain[]) {
  // ...
}
```

### 3. Type Safety

All apps share the same type definitions:
- No type mismatches
- Compile-time safety
- IDE autocomplete works everywhere

## 📊 Type Categories

### Shared Types (in `@llm/shared-types`)

#### Core Discovery Types (`discovery.ts`)
- `Signal` - Architectural signal
- `Evidence` - Supporting evidence
- `Domain` - Discovered domain
- `DiscoveryResult` - Complete result
- `DomainExclusion` - User exclusion
- `AnalysisDepth` - DEEP | EXCLUDED
- `SignalType` - Signal categories

**Used by:** Orchestrator, MCP Bridge, VSCode Extension

#### Configuration Types (`discovery-config.ts`)
- `SignalWeightConfig` - Signal weights
- `DiscoveryBehaviorConfig` - Behavior settings
- `PerformanceConfig` - Performance settings
- `DiscoveryConfig` - Complete config

**Used by:** Orchestrator (primary), potentially MCP Bridge for config validation

#### Metrics Types (`discovery-metrics.ts`)
- `DiscoveryTimingMetrics` - Timing data
- `SignalQualityMetrics` - Signal quality
- `DomainQualityMetrics` - Domain quality
- `ReliabilityMetrics` - Reliability data
- `ResourceMetrics` - Resource usage
- `DiscoveryMetrics` - Complete metrics
- `CacheStatistics` - Cache stats

**Used by:** Orchestrator (primary), potentially monitoring tools

### Local Types (in `apps/orchestrator/src/discovery/types.ts`)

#### Orchestrator-Specific Types
- `DirectoryNode` - File system structure
- `DependencyInfo` - Package dependencies
- `IndexMetadata` - Index data
- `DomainContext` - RAG context

**Used by:** Orchestrator only

**Why local?**
- Specific to orchestrator's indexing implementation
- Other apps don't need these
- Can change without affecting other apps

## 🔧 Implementation Classes (Orchestrator Only)

### Configuration (`config.ts`)
```typescript
export class DiscoveryConfigManager {
  // Uses types from @llm/shared-types
  constructor(overrides?: Partial<DiscoveryConfig>) { }
  getConfig(): Readonly<DiscoveryConfig> { }
}
```

### Metrics (`metrics.ts`)
```typescript
export class DiscoveryMetricsCollector {
  // Uses types from @llm/shared-types
  generateMetrics(): DiscoveryMetrics { }
}
```

### Cache (`cache.ts`)
```typescript
export class CacheManager {
  // Uses CacheStatistics from @llm/shared-types
  getStatistics(): { pattern: CacheStatistics; /* ... */ } { }
}
```

### Discovery (`DomainDiscoveryEngine.ts`)
```typescript
export class DomainDiscoveryEngine {
  // Uses types from @llm/shared-types
  async discover(
    indexMetadata: IndexMetadata,
    userExclusions?: DomainExclusion[]
  ): Promise<DiscoveryResult> { }
}
```

## 📦 Import Patterns

### In Orchestrator

```typescript
// ✅ GOOD - Import types from shared-types
import type { Domain, Signal } from '@llm/shared-types';

// ✅ GOOD - Import local types
import type { IndexMetadata } from './types';

// ✅ GOOD - Import implementations
import { DomainDiscoveryEngine } from './DomainDiscoveryEngine';
```

### In MCP Bridge

```typescript
// ✅ GOOD - Import types from shared-types
import type { Domain, DiscoveryResult } from '@llm/shared-types';

// ❌ BAD - Don't import orchestrator implementations
import { DomainDiscoveryEngine } from '@llm/orchestrator'; // NO!
```

### In VSCode Extension

```typescript
// ✅ GOOD - Import types from shared-types
import type { Domain } from '@llm/shared-types';

// ❌ BAD - Don't import orchestrator implementations
import { DomainDiscoveryEngine } from '@llm/orchestrator'; // NO!
```

## 🎓 Best Practices

### 1. Adding New Types

**Question:** Where should this type go?

**Decision Tree:**
```
Will other apps (MCP Bridge, VSCode Extension) need this type?
├─ YES → Add to @llm/shared-types
│         └─ discovery.ts (core types)
│         └─ discovery-config.ts (config types)
│         └─ discovery-metrics.ts (metrics types)
│
└─ NO  → Add to apps/orchestrator/src/discovery/types.ts
          └─ Keep it local
```

### 2. Adding New Implementation

**Always** goes in `apps/orchestrator/src/discovery/`

```typescript
// ✅ GOOD
// apps/orchestrator/src/discovery/MyNewFeature.ts
import type { Domain } from '@llm/shared-types';

export class MyNewFeature {
  process(domain: Domain) { /* ... */ }
}
```

### 3. Modifying Existing Types

**If type is in shared-types:**
- Consider impact on other apps
- Update version if breaking change
- Document changes

**If type is local:**
- Change freely
- Only affects orchestrator

## 🔍 Quick Reference

| Type | Location | Used By | Can Change? |
|------|----------|---------|-------------|
| `Domain` | shared-types | All apps | Carefully |
| `Signal` | shared-types | All apps | Carefully |
| `DiscoveryConfig` | shared-types | Orchestrator | Carefully |
| `DiscoveryMetrics` | shared-types | Orchestrator, Monitoring | Carefully |
| `IndexMetadata` | orchestrator | Orchestrator only | Freely |
| `DirectoryNode` | orchestrator | Orchestrator only | Freely |
| `DiscoveryConfigManager` | orchestrator | Orchestrator only | Freely |
| `DomainDiscoveryEngine` | orchestrator | Orchestrator only | Freely |

## ✅ Summary

**Shared Types (`@llm/shared-types`):**
- ✅ Type definitions only
- ✅ Used by multiple apps
- ✅ Versioned carefully
- ❌ No implementations

**Orchestrator (`apps/orchestrator/src/discovery/`):**
- ✅ Implementation classes
- ✅ Business logic
- ✅ Local types
- ✅ Re-exports shared types
- ❌ No types other apps need

**This architecture ensures:**
- 🎯 Clear separation of concerns
- 🔄 Type reusability across apps
- 🛡️ Type safety everywhere
- 📦 Minimal coupling
- 🚀 Easy to maintain and extend
