# Requirements Document: Domain Discovery Engine (RAA)

## Introduction

The Domain Discovery Engine introduces a Retrieval-Augmented Analysis (RAA) phase into the LLM Council Orchestrator pipeline. This phase executes after indexing and before role-based analysis to discover architectural domains present in the codebase. The engine identifies domains but never excludes them—all discovered domains default to DEEP analysis unless explicitly excluded by the user.

## Glossary

- **Domain Discovery Engine**: System component that identifies architectural domains in a codebase after indexing completes
- **RAA (Retrieval-Augmented Analysis)**: The discovery phase that uses indexed data to identify domains without making exclusion decisions
- **Architectural Domain**: A logical area of system functionality (e.g., authentication, payment processing, admin panel, API layer)
- **Domain Signal**: Metadata extracted from the index that indicates the presence of a domain (e.g., file patterns, dependencies, route definitions)
- **Default-Deep Rule**: Architectural constraint that all discovered domains receive deep analysis unless user explicitly excludes them
- **User Exclusion**: Explicit user action to mark a domain as excluded from analysis and spec generation
- **RAG (Retrieval-Augmented Generation)**: Context-aware generation using domain-specific retrieval for deep analysis and spec generation
- **Discovery Metadata**: Structured output from RAA containing discovered domains, confidence scores, and supporting evidence
- **Exclusion Record**: Persistent record of user-excluded domains with timestamp and justification

## Requirements

### Requirement 1: RAA Phase Execution

**User Story:** As a system architect, I want the orchestrator to automatically discover architectural domains after indexing, so that analysis is tailored to the actual codebase structure.

#### Acceptance Criteria

1. WHEN the pipeline completes the INDEX state THEN the system SHALL transition to a new DISCOVER state before ANALYZE
2. WHEN the DISCOVER state executes THEN the system SHALL consume index metadata without re-scanning files
3. WHEN the DISCOVER state completes THEN the system SHALL produce a DiscoveryResult containing all identified domains
4. WHEN the DISCOVER state fails THEN the system SHALL retry up to 3 times before aborting the pipeline
5. WHEN the DISCOVER state produces zero domains THEN the system SHALL create a fallback domain "general_architecture" with analysisDepth = "DEEP"

### Requirement 2: Domain Signal Extraction

**User Story:** As a domain discovery engine, I want to extract architectural signals from the indexed codebase, so that I can identify which domains are present.

#### Acceptance Criteria

1. WHEN analyzing file paths THEN the system SHALL identify domain indicators from directory structure (e.g., `/auth`, `/payment`, `/admin`)
2. WHEN analyzing file extensions THEN the system SHALL categorize files by technology stack (e.g., `.php` → PHP monolith, `.tsx` → React frontend)
3. WHEN analyzing file content chunks THEN the system SHALL extract framework-specific patterns (e.g., Laravel routes, Express middleware, Django models)
4. WHEN analyzing dependency metadata THEN the system SHALL identify third-party integrations (e.g., Stripe SDK → payment domain, Passport → auth domain)
5. WHEN analyzing code structure THEN the system SHALL detect architectural patterns (e.g., MVC, microservices, monolith)

### Requirement 3: Default-Deep Domain Tagging

**User Story:** As a system architect, I want all discovered domains to default to deep analysis, so that no critical architecture is accidentally overlooked.

#### Acceptance Criteria

1. WHEN a domain is discovered THEN the system SHALL tag it with analysisDepth = "DEEP" by default
2. WHEN a domain has low confidence score THEN the system SHALL still tag it as "DEEP" (confidence does not affect depth)
3. WHEN a domain is ambiguous THEN the system SHALL include it with "DEEP" tag and mark ambiguity in metadata
4. WHEN zero domains are discovered THEN the system SHALL create a fallback domain "general_architecture" with "DEEP" tag
5. WHEN a domain is discovered THEN the system SHALL NOT apply any automatic exclusion logic regardless of heuristics

### Requirement 4: User Exclusion Interface

**User Story:** As a user, I want to explicitly exclude domains from analysis, so that I can focus the orchestrator on areas I care about.

#### Acceptance Criteria

1. WHEN the user provides an exclusion list in the request THEN the system SHALL mark specified domains as excluded before ANALYZE state
2. WHEN a domain is excluded THEN the system SHALL set analysisDepth = "EXCLUDED" and record the exclusion timestamp
3. WHEN a domain is excluded THEN the system SHALL NOT execute role-based analysis for that domain
4. WHEN a domain is excluded THEN the system SHALL NOT generate specs for that domain
5. WHEN a domain is excluded THEN the system SHALL persist the exclusion decision in the final output with user-provided justification

### Requirement 5: Discovery Metadata Structure

**User Story:** As a downstream pipeline component, I want structured discovery metadata, so that I can consume domain information consistently.

#### Acceptance Criteria

1. WHEN discovery completes THEN the system SHALL produce a DiscoveryResult with schema version identifier
2. WHEN discovery completes THEN the system SHALL include for each domain: id, name, confidence, analysisDepth, signals, and evidence
3. WHEN discovery completes THEN the system SHALL include aggregate statistics: totalDomains, deepDomains, excludedDomains
4. WHEN discovery completes THEN the system SHALL include execution metadata: discoveryTimeMs, indexChunksAnalyzed, signalTypesUsed
5. WHEN discovery completes THEN the system SHALL serialize DiscoveryResult as JSON for pipeline context propagation

### Requirement 6: RAG Deep Analysis Integration

**User Story:** As a role agent, I want domain-specific context retrieval, so that my analysis is grounded in relevant code sections.

#### Acceptance Criteria

1. WHEN a role analyzes a DEEP domain THEN the system SHALL retrieve top-K chunks semantically related to that domain
2. WHEN constructing role context THEN the system SHALL include domain name, confidence score, and supporting evidence
3. WHEN constructing role context THEN the system SHALL include retrieved code chunks with file paths and line numbers
4. WHEN a domain has multiple sub-domains THEN the system SHALL retrieve context for each sub-domain independently
5. WHEN retrieval returns zero chunks THEN the system SHALL proceed with domain metadata only and log a warning

### Requirement 7: Spec Generation Per Domain

**User Story:** As a user, I want separate spec files per discovered domain, so that architectural documentation is modular and navigable.

#### Acceptance Criteria

1. WHEN spec generation executes for a DEEP domain THEN the system SHALL create a domain-specific spec file (e.g., `auth_domain.yaml`)
2. WHEN spec generation executes for an EXCLUDED domain THEN the system SHALL create an exclusion record file (e.g., `payment_domain.excluded.yaml`)
3. WHEN spec generation completes THEN the system SHALL create a master index file listing all domains and their spec paths
4. WHEN spec generation fails for a domain THEN the system SHALL log the error and continue with remaining domains
5. WHEN spec generation completes THEN the system SHALL include discovery metadata in each spec file header

### Requirement 8: Exclusion Record Persistence

**User Story:** As a user, I want excluded domains to be documented, so that I understand what was not analyzed and why.

#### Acceptance Criteria

1. WHEN a domain is excluded THEN the system SHALL create an exclusion record with domain name, exclusion timestamp, and user justification
2. WHEN an exclusion record is created THEN the system SHALL include the original discovery metadata (confidence, signals, evidence)
3. WHEN an exclusion record is created THEN the system SHALL include a warning that this domain was not analyzed
4. WHEN an exclusion record is created THEN the system SHALL persist it alongside generated specs
5. WHEN an exclusion record is created THEN the system SHALL include it in the master index with "excluded" status

### Requirement 9: Pipeline State Integration

**User Story:** As a pipeline engine, I want the DISCOVER state to integrate seamlessly with existing states, so that the pipeline remains deterministic and traceable.

#### Acceptance Criteria

1. WHEN the pipeline mode is FULL THEN the state sequence SHALL be [INIT, INDEX, DISCOVER, ANALYZE, AGGREGATE, OUTPUT, COMPLETED]
2. WHEN the pipeline mode is QUICK THEN the state sequence SHALL be [INIT, ANALYZE, OUTPUT, COMPLETED] (no DISCOVER)
3. WHEN the pipeline mode is SPEC THEN the state sequence SHALL be [INIT, INDEX, DISCOVER, ANALYZE, AGGREGATE, SPECIFY, OUTPUT, COMPLETED]
4. WHEN the DISCOVER state executes THEN the system SHALL create a trace span with name "domain_discovery"
5. WHEN the DISCOVER state completes THEN the system SHALL propagate DiscoveryResult in pipeline context for downstream states

### Requirement 10: Responsibility Model

**User Story:** As a system architect, I want clear responsibility boundaries, so that I understand what the system guarantees versus what I must verify.

#### Acceptance Criteria

1. WHEN discovery completes THEN the system SHALL guarantee that all detectable domains are included in DiscoveryResult
2. WHEN discovery completes THEN the system SHALL NOT guarantee that all domains are architecturally significant (user must judge)
3. WHEN discovery completes THEN the system SHALL NOT guarantee that domain boundaries are correct (user must validate)
4. WHEN discovery completes THEN the system SHALL NOT guarantee that excluded domains are truly irrelevant (user owns exclusion risk)
5. WHEN discovery completes THEN the system SHALL guarantee that no domains are auto-excluded without user consent

### Requirement 11: Failure Mode Handling

**User Story:** As a system operator, I want graceful degradation when discovery fails, so that the pipeline can still produce useful output.

#### Acceptance Criteria

1. WHEN discovery fails after max retries THEN the system SHALL create a fallback domain "general_architecture" with analysisDepth = "DEEP"
2. WHEN discovery produces malformed output THEN the system SHALL create a fallback domain "general_architecture" with analysisDepth = "DEEP"
3. WHEN discovery times out THEN the system SHALL create a fallback domain "general_architecture" with analysisDepth = "DEEP"
4. WHEN discovery falls back THEN the system SHALL include a warning in the final output explaining the fallback
5. WHEN discovery falls back THEN the system SHALL NOT fail the entire pipeline

### Requirement 12: Non-Goals and Explicit Exclusions

**User Story:** As a system architect, I want explicit documentation of what the discovery engine does NOT do, so that expectations are clear.

#### Acceptance Criteria

1. THE system SHALL NOT automatically exclude domains based on heuristics (e.g., "this looks modern, skip legacy analysis")
2. THE system SHALL NOT prioritize domains by importance (all DEEP domains receive equal analysis weight)
3. THE system SHALL NOT generate code or migration plans during discovery (discovery is read-only)
4. THE system SHALL NOT interact with the user during discovery (no prompts, confirmations, or wizards)
5. THE system SHALL NOT modify the index or codebase during discovery (discovery is side-effect-free)
