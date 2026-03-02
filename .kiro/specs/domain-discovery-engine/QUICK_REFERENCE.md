# Domain Discovery Engine - Quick Reference Card

## 🎯 One-Sentence Summary
The Domain Discovery Engine adds a RAA (Retrieval-Augmented Analysis) phase that discovers architectural domains after indexing and tags all domains as DEEP by default, allowing only users to exclude domains.

---

## 🔑 Core Principles (5 Rules)

1. **Indexing ≠ Discovery** - Indexing produces data, discovery identifies domains
2. **Default-Deep** - All domains tagged DEEP, never auto-excluded
3. **User Authority** - Only users may exclude domains
4. **RAG for Analysis** - Discovery uses metadata, analysis uses RAG
5. **No Interaction** - Pipeline runs end-to-end without user prompts

---

## 📊 Pipeline States

### Before
```
INIT → INDEX → ANALYZE → AGGREGATE → OUTPUT → COMPLETED
```

### After
```
INIT → INDEX → DISCOVER → ANALYZE → AGGREGATE → OUTPUT → COMPLETED
                  ↓
          DiscoveryResult
```

---

## 🏗️ Key Components

| Component | Purpose | Location |
|-----------|---------|----------|
| `DomainDiscoveryEngine` | Orchestrate discovery | `apps/orchestrator/src/discovery/` |
| `SignalExtractor` | Extract signals | `apps/orchestrator/src/discovery/` |
| `DomainClassifier` | Classify domains | `apps/orchestrator/src/discovery/` |

---

## 📦 Data Structures

### DiscoveryResult
```typescript
{
  schemaVersion: "1.0.0",
  discoveredAt: ISO8601,
  domains: Domain[],
  statistics: { totalDomains, deepDomains, excludedDomains },
  executionMetadata: { discoveryTimeMs, fallbackApplied }
}
```

### Domain
```typescript
{
  id: string,                           // "auth_domain"
  name: string,                         // "Authentication"
  confidence: number,                   // 0.0 - 1.0
  analysisDepth: "DEEP" | "EXCLUDED",  // Default: DEEP
  signals: Signal[],
  evidence: Evidence[],
  subDomains?: Domain[],
  exclusionMetadata?: { excludedAt, justification }
}
```

### Signal
```typescript
{
  type: "file_pattern" | "dependency" | "framework" | "route" | "config",
  value: string,      // "/auth", "passport", "Laravel"
  weight: number,     // 0.0 - 1.0
  source: string      // "directory_structure"
}
```

---

## 🔄 Discovery Process

1. **Extract Signals** - File patterns, dependencies, frameworks
2. **Classify Domains** - Group signals into domains
3. **Calculate Confidence** - Weight signals (does NOT affect depth)
4. **Apply Default-Deep** - Tag all domains as DEEP
5. **Apply User Exclusions** - Mark excluded domains
6. **Return Result** - DiscoveryResult with all domains

---

## 👤 User Exclusion

### Request Format
```json
{
  "mode": "full_analysis",
  "prompt": "Analyze this codebase",
  "domainExclusions": [
    {
      "domainId": "admin_domain",
      "justification": "Legacy, will be replaced"
    }
  ]
}
```

### Exclusion Effect
- Domain marked as `analysisDepth: "EXCLUDED"`
- No role-based analysis for that domain
- Exclusion record generated (not silently dropped)
- User owns the risk

---

## 📄 Output Files

### DEEP Domain
```
auth_domain.yaml
├── header (id, name, confidence, analysisDepth: DEEP)
├── discovery_metadata (signals, evidence)
├── architectural_analysis (role outputs, synthesis)
├── recommendations
└── confidence_assessment
```

### EXCLUDED Domain
```
admin_domain.excluded.yaml
├── header (id, name, analysisDepth: EXCLUDED)
├── exclusion_metadata (justification, excludedAt)
├── original_discovery (confidence, signals, evidence)
└── warning ("This domain was not analyzed")
```

### Master Index
```
domain_index.yaml
├── summary (total, deep, excluded counts)
└── domains (list with status and spec paths)
```

---

## ⚠️ Failure Handling

### Discovery Failure Scenarios
All three failure scenarios create a fallback domain:

1. **Discovery fails after max retries** → Create fallback domain
2. **Discovery produces malformed output** → Create fallback domain  
3. **Discovery produces zero domains** → Create fallback domain

### Fallback Behavior
- **Retry:** Up to 3 times with exponential backoff
- **Fallback:** Create "general_architecture" domain with DEEP analysis
- **Continue:** Pipeline never aborts, never reverts to static role-only execution

### Fallback Domain
```typescript
{
  id: "general_architecture",
  name: "General Architecture",
  confidence: 0.5,
  analysisDepth: "DEEP",
  signals: [],
  evidence: []
}
```

---

## ✅ Validation Rules

### DiscoveryResult
- ✅ domains array MUST NOT be empty
- ✅ All domains MUST have unique id
- ✅ All domains MUST have at least one signal
- ✅ EXCLUDED domains MUST have exclusionMetadata
- ✅ DEEP domains MUST NOT have exclusionMetadata

### Domain
- ✅ id MUST match pattern `^[a-z0-9_]+$`
- ✅ confidence MUST be 0.0 - 1.0
- ✅ analysisDepth MUST be "DEEP" or "EXCLUDED"

### User Exclusion
- ✅ domainId MUST exist in discovery result
- ✅ justification MUST be non-empty (min 10 chars)

---

## 🧪 Testing Requirements

### Unit Tests
- SignalExtractor (signal extraction)
- DomainClassifier (classification, confidence)
- DomainDiscoveryEngine (end-to-end discovery)

### Integration Tests
- Pipeline (DISCOVER state execution)
- RoleManager (domain-aware execution)

### Property Tests
1. **Default-Deep Invariant** - All non-excluded domains are DEEP
2. **Exclusion Preservation** - All excluded domains have metadata
3. **Discovery Completeness** - Result never empty
4. **Signal Determinism** - Same input = same signals

---

## 🚫 Non-Goals

The system does **NOT**:
- ❌ Auto-exclude domains based on heuristics
- ❌ Prioritize domains by importance
- ❌ Generate code during discovery
- ❌ Interact with users during discovery
- ❌ Modify the index or codebase
- ❌ Apply confidence thresholds for exclusion

---

## 📈 Responsibility Model

### System Guarantees
- ✅ All detectable domains discovered
- ✅ No auto-exclusion without user consent
- ✅ Default-deep tagging enforced
- ✅ User exclusions applied exactly
- ✅ Exclusion records persisted

### User Responsibilities
- 👤 Validate domain boundaries
- 👤 Judge domain significance
- 👤 Accept exclusion risk
- 👤 Provide exclusion justification

---

## 📊 Signal Types & Weights

| Signal Type | Example | Weight | Source |
|-------------|---------|--------|--------|
| file_pattern | `/auth` | 0.9 | Directory structure |
| dependency | `passport` | 0.9 | package.json |
| framework | `Laravel` | 0.7 | Framework detection |
| route | `/api/auth` | 0.8 | Route definitions |
| config | `auth.php` | 0.6 | Config files |

---

## 🔍 Common Domains

| Domain ID | Name | Typical Signals |
|-----------|------|-----------------|
| auth_domain | Authentication | `/auth`, `passport`, `jwt` |
| payment_domain | Payment Processing | `/payment`, `stripe`, `paypal` |
| admin_domain | Admin Panel | `/admin`, `admin-lte` |
| api_domain | API Layer | `/api`, `express`, `fastify` |
| frontend_domain | Frontend | `/components`, `react`, `vue` |

---

## ⏱️ Performance Targets

| Metric | Target |
|--------|--------|
| Discovery Time | < 5 seconds (typical codebase) |
| Signal Extraction | Linear with file count |
| Domain Classification | Linear with signal count |
| Memory Usage | < 100MB additional |

---

## 📚 Document Quick Links

| Document | Purpose | Read Time |
|----------|---------|-----------|
| [README.md](./README.md) | Overview | 10 min |
| [requirements.md](./requirements.md) | User stories | 30 min |
| [design.md](./design.md) | Architecture | 45 min |
| [tasks.md](./tasks.md) | Implementation | 20 min |
| [architecture-contract.yaml](./architecture-contract.yaml) | Binding decisions | 30 min |
| [data-contracts.yaml](./data-contracts.yaml) | Data schemas | 25 min |

---

## 🚀 Implementation Timeline

| Phase | Tasks | Effort |
|-------|-------|--------|
| Phase 1 | Core Infrastructure | 3-5 days |
| Phase 2 | Pipeline Integration | 2-3 days |
| Phase 3 | Role Integration | 3-4 days |
| Phase 4 | Finalization | 2-3 days |
| **Total** | | **10-15 days** |

---

## 💡 Example Scenarios

### Scenario 1: No Exclusions
**Input:** Full analysis, no exclusions  
**Output:** All domains DEEP, all analyzed  
**Files:** N spec files (one per domain)

### Scenario 2: With Exclusions
**Input:** Full analysis, exclude admin_domain  
**Output:** Admin EXCLUDED, others DEEP  
**Files:** (N-1) spec files + 1 exclusion record

### Scenario 3: Discovery Failure (Fallback)
**Input:** Full analysis  
**Output:** Fallback domain "general_architecture" with DEEP analysis  
**Files:** 1 spec file (fallback domain)

---

## 🔧 Configuration

### Pipeline Mode Support
- ✅ FULL - Includes DISCOVER state
- ✅ SPEC - Includes DISCOVER state
- ✅ REFINEMENT - Includes DISCOVER state
- ❌ QUICK - Skips DISCOVER state

### Environment Variables
```bash
# None required - discovery uses existing index metadata
```

---

## 📞 Support

| Question Type | Resource |
|---------------|----------|
| Requirements | requirements.md |
| Architecture | architecture-contract.yaml |
| Implementation | tasks.md |
| Data Structures | data-contracts.yaml |
| Examples | ARCHITECTURE_DIAGRAMS.md |

---

**Version:** 1.0.0  
**Status:** COMPLETE - AWAITING IMPLEMENTATION  
**Last Updated:** 2024-12-12
