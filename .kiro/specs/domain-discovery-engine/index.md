# Domain Discovery Engine - Specification Index

## 📋 Specification Overview

This directory contains the complete architectural specification for the **Domain Discovery Engine**, a new component that introduces Retrieval-Augmented Analysis (RAA) to the LLM Council Orchestrator.

**Specification Version:** 1.0.0  
**Status:** COMPLETE - AWAITING IMPLEMENTATION  
**Created:** 2024-12-12

---

## 📚 Document Structure

### 1. **README.md** - Start Here
**Purpose:** Overview, quick start, and navigation guide  
**Audience:** All stakeholders  
**Read Time:** 10 minutes

**Contents:**
- Purpose and key principles
- Document index
- Quick start for implementers, reviewers, and users
- Example workflows
- Testing strategy
- Non-goals and responsibility model

[→ Read README.md](./README.md)

---

### 2. **requirements.md** - What We're Building
**Purpose:** User stories and acceptance criteria  
**Audience:** Product owners, engineers, QA  
**Read Time:** 30 minutes

**Contents:**
- 12 requirements with user stories
- 60 acceptance criteria (EARS-compliant)
- Glossary of terms
- Requirement traceability

**Key Requirements:**
- Req 1: RAA Phase Execution
- Req 2: Domain Signal Extraction
- Req 3: Default-Deep Domain Tagging
- Req 4: User Exclusion Interface
- Req 5: Discovery Metadata Structure
- Req 6: RAG Deep Analysis Integration
- Req 7: Spec Generation Per Domain
- Req 8: Exclusion Record Persistence
- Req 9: Pipeline State Integration
- Req 10: Responsibility Model
- Req 11: Failure Mode Handling
- Req 12: Non-Goals and Explicit Exclusions

[→ Read requirements.md](./requirements.md)

---

### 3. **design.md** - How We're Building It
**Purpose:** Component architecture and integration design  
**Audience:** Engineers, architects  
**Read Time:** 45 minutes

**Contents:**
- System architecture
- Component interfaces
- Data models
- Pipeline integration
- Error handling
- Testing strategy

**Key Components:**
- `DomainDiscoveryEngine`: Core discovery orchestration
- `SignalExtractor`: Extract architectural signals
- `DomainClassifier`: Classify signals into domains
- Pipeline state integration (DISCOVER state)
- RoleManager integration (domain-aware execution)

[→ Read design.md](./design.md)

---

### 4. **tasks.md** - Implementation Roadmap
**Purpose:** Step-by-step implementation plan  
**Audience:** Engineers  
**Read Time:** 20 minutes

**Contents:**
- 12 top-level tasks
- 40+ sub-tasks with requirement references
- Property-based test specifications
- Checkpoint tasks

**Task Phases:**
1. Core Infrastructure (Tasks 1-4)
2. Pipeline Integration (Tasks 5-6)
3. Role Integration (Tasks 7-8)
4. Finalization (Tasks 9-12)

[→ Read tasks.md](./tasks.md)

---

### 5. **architecture-contract.yaml** - Binding Decisions
**Purpose:** Non-negotiable architectural constraints  
**Audience:** Architects, tech leads  
**Read Time:** 30 minutes

**Contents:**
- 7 binding architectural decisions
- Pipeline architecture (state sequences)
- Domain discovery spec (inputs/outputs/guarantees)
- User override spec (exclusion mechanism)
- RAG deep analysis spec (retrieval strategy)
- Spec output contract (file formats)
- Responsibility model (system vs user)
- Non-goals (explicit exclusions)

**Key Decisions:**
- Indexing = retrieval infrastructure only
- Default-deep rule (no auto-exclusion)
- User exclusion authority
- RAG scope (discovery vs analysis)
- Pipeline autonomy (no user interaction)

[→ Read architecture-contract.yaml](./architecture-contract.yaml)

---

### 6. **data-contracts.yaml** - Data Structure Schemas
**Purpose:** Data structure definitions and validation rules  
**Audience:** Engineers  
**Read Time:** 25 minutes

**Contents:**
- Input contracts (IndexMetadata, UserExclusions)
- Output contracts (DiscoveryResult, Domain, Signal, Evidence)
- Persistence contracts (spec files, exclusion records)
- Validation rules (all data structures)
- Error contracts (failure modes)
- Serialization contracts (JSON/YAML)

**Key Structures:**
- `DiscoveryResult`: Complete discovery output
- `Domain`: Single discovered domain
- `Signal`: Architectural signal
- `Evidence`: Code location supporting discovery

[→ Read data-contracts.yaml](./data-contracts.yaml)

---

### 7. **SPEC_SUMMARY.md** - Executive Summary
**Purpose:** High-level overview and status  
**Audience:** All stakeholders  
**Read Time:** 15 minutes

**Contents:**
- Document status matrix
- Specification completeness checklist
- Key architectural decisions summary
- Implementation roadmap with estimates
- Testing requirements summary
- Example scenarios
- Validation checklist
- Risk assessment
- Next steps

[→ Read SPEC_SUMMARY.md](./SPEC_SUMMARY.md)

---

## 🎯 Reading Paths

### For Product Owners
1. README.md (overview)
2. requirements.md (user stories)
3. SPEC_SUMMARY.md (status and roadmap)

**Time:** 55 minutes

---

### For Architects
1. README.md (overview)
2. architecture-contract.yaml (binding decisions)
3. design.md (component architecture)
4. SPEC_SUMMARY.md (validation checklist)

**Time:** 90 minutes

---

### For Engineers (Implementers)
1. README.md (overview)
2. requirements.md (acceptance criteria)
3. design.md (component interfaces)
4. tasks.md (implementation plan)
5. data-contracts.yaml (data schemas)

**Time:** 120 minutes

---

### For QA Engineers
1. README.md (overview)
2. requirements.md (acceptance criteria)
3. design.md (testing strategy)
4. tasks.md (test specifications)

**Time:** 75 minutes

---

### For Users
1. README.md (overview and examples)
2. requirements.md (Req 4: User Exclusion Interface)
3. SPEC_SUMMARY.md (example scenarios)

**Time:** 30 minutes

---

## 🔑 Key Concepts

### RAA (Retrieval-Augmented Analysis)
Discovery phase that identifies architectural domains using index metadata (not semantic search).

### Default-Deep Rule
All discovered domains default to DEEP analysis. System never auto-excludes domains.

### User Exclusion Authority
Only users may exclude domains. Exclusions are explicit decisions with required justification.

### RAG (Retrieval-Augmented Generation)
Domain-specific context retrieval for deep analysis (separate from discovery).

### Domain
Logical area of system functionality (e.g., authentication, payment, admin).

### Signal
Metadata indicating domain presence (e.g., file patterns, dependencies, frameworks).

### Evidence
Code locations supporting domain discovery (file paths, line ranges, snippets).

---

## 📊 Specification Metrics

| Metric | Value |
|--------|-------|
| Total Requirements | 12 |
| Acceptance Criteria | 60 |
| Top-Level Tasks | 12 |
| Sub-Tasks | 40+ |
| Property Tests | 4 |
| New Components | 3 |
| Modified Components | 4 |
| Data Structures | 8 |
| Validation Rules | 30+ |
| Estimated Effort | 10-15 days |

---

## ✅ Specification Status

| Category | Status |
|----------|--------|
| Requirements | ✅ Complete |
| Design | ✅ Complete |
| Tasks | ✅ Complete |
| Contracts | ✅ Complete |
| Documentation | ✅ Complete |
| Review | ⏳ Pending |
| Approval | ⏳ Pending |
| Implementation | ❌ Not Started |

---

## 🚀 Next Steps

1. **Stakeholder Review** (1-2 days)
   - Product owner reviews requirements
   - Architect reviews design and contracts
   - Tech lead reviews tasks and estimates

2. **Approval** (1 day)
   - Sign-off on architectural contract
   - Approval to begin implementation

3. **Implementation** (10-15 days)
   - Phase 1: Core Infrastructure (3-5 days)
   - Phase 2: Pipeline Integration (2-3 days)
   - Phase 3: Role Integration (3-4 days)
   - Phase 4: Finalization (2-3 days)

4. **Testing & Validation** (3-5 days)
   - Unit tests
   - Integration tests
   - Property-based tests
   - End-to-end validation

5. **Documentation & Deployment** (2-3 days)
   - User guides
   - API documentation
   - Feature flag rollout

**Total Timeline:** 17-26 days (3-5 weeks)

---

## 📞 Contact & Support

### Questions About Requirements
- Review: `requirements.md`
- Contact: Product Owner

### Questions About Architecture
- Review: `architecture-contract.yaml`, `design.md`
- Contact: Architecture Team

### Questions About Implementation
- Review: `tasks.md`, `data-contracts.yaml`
- Contact: Tech Lead

### Questions About Testing
- Review: `design.md` (Testing Strategy section)
- Contact: QA Lead

---

## 📝 Document Maintenance

- **Location:** `.kiro/specs/domain-discovery-engine/`
- **Version Control:** Git-tracked
- **Update Policy:** As needed during implementation
- **Owner:** Architecture Team
- **Last Updated:** 2024-12-12

---

## 🔒 Specification Integrity

This specification is **BINDING** and represents the architectural contract for the Domain Discovery Engine. Changes to binding decisions require:

1. Architecture review
2. Impact assessment
3. Stakeholder approval
4. Version increment

**Current Version:** 1.0.0  
**Schema Version:** 1.0.0  
**Status:** COMPLETE - AWAITING REVIEW

---

**End of Index**
