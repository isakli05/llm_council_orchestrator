# Domain Discovery Engine Specification

## Overview

This specification defines the **Domain Discovery Engine** for the LLM Council Orchestrator. The engine implements a **Retrieval-Augmented Analysis (RAA)** phase that discovers architectural domains in a codebase after indexing completes.

## Purpose

The Domain Discovery Engine addresses a critical architectural gap: the current system executes all roles (legacy, architect, migration, security) on every project regardless of relevance. This leads to:

- **Over-analysis** on modern codebases (wasted LLM tokens)
- **Under-analysis** on complex systems (critical domains receive equal weight as boilerplate)
- **Fixed-bias analysis** (all projects analyzed identically)

The Domain Discovery Engine solves this by:

1. **Discovering** which architectural domains exist in the codebase
2. **Tagging** all domains as DEEP by default (no auto-exclusion)
3. **Allowing** users to explicitly exclude domains
4. **Enabling** domain-specific RAG retrieval for deep analysis

## Key Principles

### 1. Indexing ≠ Discovery

- **Indexing** produces retrieval infrastructure (embeddings, chunks, metadata)
- **Discovery** identifies architectural domains using index metadata
- These are separate concerns with separate responsibilities

### 2. Default-Deep Rule

- All discovered domains default to **DEEP** analysis
- System **never** auto-excludes domains based on heuristics
- Only **users** may exclude domains (explicit choice)

### 3. User Authority

- Users own exclusion decisions and their risks
- Excluded domains generate **exclusion records** (not silently dropped)
- System warns but allows exclusions

### 4. RAG for Deep Analysis

- Discovery uses **index metadata** (not semantic search)
- Deep analysis uses **RAG retrieval** (domain-specific context)
- Separation of concerns: discovery ≠ analysis

### 5. Pipeline Autonomy

- Pipeline runs **end-to-end** without user interaction
- No step-by-step confirmations or interactive wizards
- User input is **optional** request parameter

## Specification Documents

### 1. [requirements.md](./requirements.md)
**User stories and acceptance criteria** following EARS (Easy Approach to Requirements Syntax) and INCOSE quality rules.

**Key Requirements:**
- RAA phase execution (Req 1)
- Domain signal extraction (Req 2)
- Default-deep domain tagging (Req 3)
- User exclusion interface (Req 4)
- Discovery metadata structure (Req 5)
- RAG deep analysis integration (Req 6)
- Spec generation per domain (Req 7)
- Exclusion record persistence (Req 8)
- Pipeline state integration (Req 9)
- Responsibility model (Req 10)
- Failure mode handling (Req 11)
- Non-goals and explicit exclusions (Req 12)

### 2. [design.md](./design.md)
**Comprehensive architectural design** including components, interfaces, data models, and integration points.

**Key Components:**
- `DomainDiscoveryEngine`: Core discovery orchestration
- `SignalExtractor`: Extract architectural signals from index
- `DomainClassifier`: Classify signals into domains
- Pipeline state integration (DISCOVER state)
- RoleManager integration (domain-aware execution)
- Spec generation per domain

**Key Design Decisions:**
- DISCOVER state executes between INDEX and ANALYZE
- All domains tagged as DEEP unless user excludes
- RAG retrieval occurs in RoleManager, not discovery
- Fallback to default domain on discovery failure

### 3. [tasks.md](./tasks.md)
**Implementation task list** with numbered checkboxes, sub-tasks, and requirement references.

**Task Structure:**
1. Create domain discovery core infrastructure
2. Implement SignalExtractor
3. Implement DomainClassifier
4. Implement DomainDiscoveryEngine
5. Integrate DISCOVER state into pipeline
6. Extend PipelineRequest schema for user exclusions
7. Implement domain-aware RoleManager
8. Implement spec generation per domain
9. Update shared types and config
10. Add observability and logging
11. Documentation and examples
12. Checkpoint - Ensure all tests pass

### 4. [architecture-contract.yaml](./architecture-contract.yaml)
**Binding architectural contract** defining non-negotiable decisions, guarantees, and constraints.

**Key Sections:**
- Architectural decisions (binding)
- Pipeline architecture (state sequences)
- Domain discovery spec (inputs/outputs/guarantees)
- User override spec (exclusion mechanism)
- RAG deep analysis spec (retrieval strategy)
- Spec output contract (file formats)
- Responsibility model (system vs user)
- Non-goals (explicit exclusions)

### 5. [data-contracts.yaml](./data-contracts.yaml)
**Data structure contracts** defining schemas, validation rules, and serialization formats.

**Key Sections:**
- Input contracts (IndexMetadata, UserExclusions)
- Output contracts (DiscoveryResult, Domain, Signal, Evidence)
- Persistence contracts (spec files, exclusion records, master index)
- Validation rules (all data structures)
- Error contracts (failure modes)
- Serialization contracts (JSON/YAML)

## Quick Start

### For Implementers

1. **Read requirements.md** to understand user stories and acceptance criteria
2. **Read design.md** to understand component architecture and integration
3. **Follow tasks.md** to implement components in order
4. **Reference architecture-contract.yaml** for binding decisions
5. **Reference data-contracts.yaml** for data structure schemas

### For Reviewers

1. **Verify requirements.md** against EARS/INCOSE quality rules
2. **Verify design.md** against architectural contract
3. **Verify tasks.md** covers all requirements
4. **Verify data-contracts.yaml** defines all data structures

### For Users

1. **Understand default-deep rule**: All domains analyzed unless you exclude
2. **Understand exclusion risk**: You own the decision to skip domains
3. **Review exclusion records**: See what was not analyzed and why
4. **Provide exclusion justification**: Required field (min 10 chars)

## Example Workflow

### 1. User Request (No Exclusions)
```json
{
  "mode": "full_analysis",
  "prompt": "Analyze this e-commerce platform"
}
```

**Pipeline Flow:**
```
INIT → INDEX → DISCOVER → ANALYZE → AGGREGATE → OUTPUT
```

**Discovery Output:**
```yaml
domains:
  - id: auth_domain
    name: Authentication
    analysisDepth: DEEP
    confidence: 0.92
    
  - id: payment_domain
    name: Payment Processing
    analysisDepth: DEEP
    confidence: 0.88
    
  - id: admin_domain
    name: Admin Panel
    analysisDepth: DEEP
    confidence: 0.75
```

**Result:** All 3 domains receive deep analysis and spec generation.

---

### 2. User Request (With Exclusions)
```json
{
  "mode": "full_analysis",
  "prompt": "Analyze this e-commerce platform",
  "domainExclusions": [
    {
      "domainId": "admin_domain",
      "justification": "Admin panel is legacy and will be replaced"
    }
  ]
}
```

**Discovery Output:**
```yaml
domains:
  - id: auth_domain
    name: Authentication
    analysisDepth: DEEP
    confidence: 0.92
    
  - id: payment_domain
    name: Payment Processing
    analysisDepth: DEEP
    confidence: 0.88
    
  - id: admin_domain
    name: Admin Panel
    analysisDepth: EXCLUDED
    confidence: 0.75
    exclusionMetadata:
      excludedAt: "2024-12-12T10:30:00Z"
      justification: "Admin panel is legacy and will be replaced"
```

**Result:**
- Auth and payment domains receive deep analysis
- Admin domain generates exclusion record (no analysis)

---

### 3. Discovery Failure (Fallback)
```json
{
  "mode": "full_analysis",
  "prompt": "Analyze this codebase"
}
```

**Discovery Output (after 3 retries):**
```yaml
domains:
  - id: general_architecture
    name: General Architecture
    analysisDepth: DEEP
    confidence: 0.5

executionMetadata:
  fallbackApplied: true
```

**Result:** Pipeline continues with fallback domain "general_architecture" tagged as DEEP (no abort, no revert to static role-only execution).

## Testing Strategy

### Unit Tests
- SignalExtractor: Test signal extraction with various codebases
- DomainClassifier: Test domain classification and confidence calculation
- DomainDiscoveryEngine: Test end-to-end discovery with mock data

### Integration Tests
- Pipeline: Test DISCOVER state execution and transitions
- RoleManager: Test domain-aware role execution with RAG retrieval

### Property-Based Tests
1. **Default-Deep Invariant**: All non-excluded domains have analysisDepth=DEEP
2. **Exclusion Preservation**: All excluded domains have exclusionMetadata
3. **Discovery Completeness**: DiscoveryResult never empty (fallback if needed)
4. **Signal Extraction Determinism**: Same input produces same signals

## Non-Goals

The Domain Discovery Engine **does NOT**:

1. Auto-exclude domains based on heuristics
2. Prioritize domains by importance
3. Generate code or migration plans
4. Interact with users during discovery
5. Modify the index or codebase
6. Generate specs during discovery
7. Execute roles during discovery
8. Apply confidence thresholds for exclusion

## Responsibility Model

### System Guarantees
- All detectable domains discovered
- No auto-exclusion without user consent
- Default-deep tagging enforced
- User exclusions applied exactly
- Exclusion records persisted
- Fallback on discovery failure

### User Responsibilities
- Validate domain boundaries
- Judge domain significance
- Accept exclusion risk
- Provide exclusion justification

### Shared Responsibilities
- Interpret confidence scores
- Refine domain definitions over time

## Versioning

- **Schema Version:** 1.0.0
- **Breaking Changes:** Modifying DiscoveryResult schema, changing default-deep rule (prohibited)
- **Non-Breaking Changes:** Adding signal types, improving classification

## References

- **EARS Syntax:** Easy Approach to Requirements Syntax
- **INCOSE:** International Council on Systems Engineering
- **RAA:** Retrieval-Augmented Analysis
- **RAG:** Retrieval-Augmented Generation
- **MCP:** Model Context Protocol

## Status

- **Specification Status:** COMPLETE
- **Implementation Status:** NOT STARTED
- **Review Status:** PENDING

## Contact

For questions or clarifications, refer to:
- Architecture contract: `architecture-contract.yaml`
- Data contracts: `data-contracts.yaml`
- Requirements: `requirements.md`
- Design: `design.md`
