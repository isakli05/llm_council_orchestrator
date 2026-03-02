# Implementation Plan: Domain Discovery Engine

## Task List

- [x] 1. Create domain discovery core infrastructure
  - Create `apps/orchestrator/src/discovery/` directory
  - Define TypeScript interfaces for Domain, Signal, Evidence, DiscoveryResult
  - Create `types.ts` with all discovery-related type definitions
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 2. Implement SignalExtractor
  - [x] 2.1 Create SignalExtractor class with interface methods
    - Implement `extractSignals()` orchestration method
    - Implement `extractFilePatternSignals()` for directory analysis
    - Implement `extractDependencySignals()` for package analysis
    - Implement `extractFrameworkSignals()` for framework detection
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 2.2 Write property test for signal extraction determinism
    - **Property 4: Signal Extraction Determinism**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

  - [x] 2.3 Implement file pattern signal extraction
    - Parse directory structure for domain indicators
    - Apply weight scoring based on pattern reliability
    - Handle nested directories and ambiguous patterns
    - _Requirements: 2.1_

  - [x] 2.4 Implement dependency signal extraction
    - Parse package.json, composer.json, requirements.txt
    - Map dependencies to domain categories
    - Handle version-specific patterns
    - _Requirements: 2.4_

  - [x] 2.5 Implement framework signal extraction
    - Detect Laravel, Express, Django, React, Vue patterns
    - Extract framework-specific architectural signals
    - Handle multi-framework projects
    - _Requirements: 2.5_

  - [ ]* 2.6 Write unit tests for SignalExtractor
    - Test file pattern extraction with various structures
    - Test dependency extraction with different package managers
    - Test framework detection with mixed stacks
    - Test signal weighting logic
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 3. Implement DomainClassifier
  - [x] 3.1 Create DomainClassifier class with interface methods
    - Implement `classify()` to group signals into domains
    - Implement `calculateConfidence()` for confidence scoring
    - Implement `resolveOverlaps()` for domain hierarchy
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 3.2 Write property test for default-deep invariant
    - **Property 1: Default-Deep Invariant**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

  - [x] 3.3 Implement signal grouping algorithm
    - Group signals by semantic similarity
    - Create domain objects from signal clusters
    - Handle ambiguous signals (multiple domain candidates)
    - _Requirements: 3.1_

  - [x] 3.4 Implement confidence calculation
    - Sum signal weights per domain
    - Normalize to 0.0-1.0 range
    - Ensure confidence does NOT affect analysisDepth
    - _Requirements: 3.2_

  - [x] 3.5 Implement default-deep tagging
    - Tag all domains with analysisDepth = "DEEP"
    - Never apply automatic exclusion logic
    - Handle zero-domain case (create fallback domain)
    - _Requirements: 3.3, 3.4, 3.5_

  - [x] 3.6 Implement overlap resolution
    - Detect parent-child domain relationships
    - Create sub-domain hierarchies
    - Preserve DEEP tagging for all domains
    - _Requirements: 3.1_

  - [ ]* 3.7 Write unit tests for DomainClassifier
    - Test signal grouping with overlapping signals
    - Test confidence calculation with various weights
    - Test default-deep enforcement
    - Test overlap resolution with nested domains
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 4. Implement DomainDiscoveryEngine
  - [x] 4.1 Create DomainDiscoveryEngine class with discover() method
    - Orchestrate SignalExtractor and DomainClassifier
    - Apply user exclusions
    - Produce DiscoveryResult
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ]* 4.2 Write property test for discovery completeness
    - **Property 3: Discovery Completeness**
    - **Validates: Requirements 1.5, 11.1**

  - [x] 4.3 Implement user exclusion application
    - Parse user exclusion list
    - Mark excluded domains with analysisDepth = "EXCLUDED"
    - Populate exclusionMetadata with timestamp and justification
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 4.4 Write property test for exclusion preservation
    - **Property 2: Exclusion Preservation**
    - **Validates: Requirements 4.2, 4.3, 4.5**

  - [x] 4.5 Implement retry logic with exponential backoff
    - Retry discovery up to 3 times on failure
    - Apply exponential backoff between retries
    - Log retry attempts
    - _Requirements: 1.4_

  - [x] 4.6 Implement fallback behavior
    - Create fallback DiscoveryResult on max retries exceeded
    - Generate default "general_architecture" domain
    - Set fallbackApplied flag in metadata
    - _Requirements: 1.5, 11.1, 11.2, 11.3, 11.4, 11.5_

  - [ ]* 4.7 Write unit tests for DomainDiscoveryEngine
    - Test end-to-end discovery with mock index metadata
    - Test user exclusion application
    - Test retry logic with transient failures
    - Test fallback behavior
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 5. Integrate DISCOVER state into pipeline
  - [x] 5.1 Add DISCOVER to PipelineState enum
    - Update `apps/orchestrator/src/pipeline/states.ts`
    - Add DISCOVER between INDEX and ANALYZE
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 5.2 Update StateMachine state sequences
    - Update `getStateSequence()` for FULL mode
    - Update `getStateSequence()` for SPEC mode
    - Update `getStateSequence()` for REFINEMENT mode
    - Keep QUICK mode unchanged (no DISCOVER)
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 5.3 Add DISCOVER guard condition
    - Update `checkGuard()` to require indexReady for DISCOVER
    - Update ANALYZE guard to require discoveryComplete
    - _Requirements: 9.1, 9.4_

  - [x] 5.4 Implement executeDiscoveryStep in PipelineEngine
    - Extract index metadata from context
    - Extract user exclusions from request
    - Instantiate DomainDiscoveryEngine
    - Execute discovery and store result in context
    - _Requirements: 1.1, 1.2, 1.3, 9.5_

  - [x] 5.5 Add discovery trace span
    - Create trace span with name "domain_discovery"
    - Record discovery execution time
    - Log discovery statistics
    - _Requirements: 9.4_

  - [ ]* 5.6 Write integration tests for pipeline
    - Test DISCOVER state execution in FULL mode
    - Test state transition from INDEX to DISCOVER to ANALYZE
    - Test context propagation of DiscoveryResult
    - Test QUICK mode skips DISCOVER
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 6. Extend PipelineRequest schema for user exclusions
  - [x] 6.1 Add domainExclusions field to request interface
    - Update `apps/orchestrator/src/api/validators.ts`
    - Define DomainExclusion interface
    - Add validation for exclusion format
    - _Requirements: 4.1_

  - [x] 6.2 Update API request handling
    - Parse domainExclusions from request body
    - Pass exclusions to PipelineEngine
    - Validate exclusion justifications are non-empty
    - _Requirements: 4.1, 4.5_

  - [ ]* 6.3 Write unit tests for request validation
    - Test valid exclusion format
    - Test invalid exclusion format (missing justification)
    - Test empty exclusion list
    - _Requirements: 4.1_

- [ ] 7. Implement domain-aware RoleManager
  - [x] 7.1 Add executeRoleForDomains method
    - Filter domains to DEEP only
    - Execute role for each DEEP domain
    - Collect domain-specific responses
    - _Requirements: 6.1, 6.2_

  - [x] 7.2 Implement domain context retrieval (RAG)
    - Construct domain-specific search query
    - Call IndexClient.semanticSearch with domain filters
    - Retrieve top-K chunks per domain
    - Handle zero-result case gracefully
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 7.3 Update role execution to include domain context
    - Pass domain name, confidence, evidence to role
    - Pass retrieved chunks to role
    - Tag role output with domain ID
    - _Requirements: 6.2, 6.3_

  - [ ]* 7.4 Write integration tests for RoleManager
    - Test domain-aware role execution
    - Test RAG context retrieval per domain
    - Test exclusion filtering (EXCLUDED domains not analyzed)
    - Test zero-chunk retrieval handling
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 8. Implement spec generation per domain
  - [x] 8.1 Create domain-specific spec writer
    - Generate spec file per DEEP domain (e.g., `auth_domain.yaml`)
    - Include discovery metadata in spec header
    - Include domain confidence and evidence
    - _Requirements: 7.1, 7.5_

  - [x] 8.2 Create exclusion record writer
    - Generate exclusion record per EXCLUDED domain (e.g., `payment_domain.excluded.yaml`)
    - Include original discovery metadata
    - Include exclusion wtimestamp and justification
    - Include warning about non-analysis
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 8.3 Create master index file
    - List all domains (DEEP and EXCLUDED)
    - Include spec file paths
    - Include domain status (deep/excluded)
    - _Requirements: 7.3_

  - [x] 8.4 Handle spec generation failures
    - Log error if spec generation fails for a domain
    - Continue with remaining domains
    - Include failure notice in master index
    - _Requirements: 7.4_

  - [ ]* 8.5 Write unit tests for spec generation
    - Test domain spec file creation
    - Test exclusion record creation
    - Test master index creation
    - Test failure handling
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 9. Update shared types and config
  - [x] 9.1 Add discovery types to shared-types package
    - Export Domain, Signal, Evidence, DiscoveryResult interfaces
    - Version as 1.0.0
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 9.2 Update MCP Bridge tool definitions
    - Add domainExclusions parameter to run_pipeline tool
    - Update tool documentation
    - _Requirements: 4.1_

  - [ ]* 9.3 Write unit tests for shared types
    - Test type serialization/deserialization
    - Test schema version compatibility
    - _Requirements: 5.1, 5.5_

- [ ] 10. Add observability and logging
  - [x] 10.1 Add discovery-specific log messages
    - Log discovery start with index metadata summary
    - Log discovered domains with confidence scores
    - Log user exclusions applied
    - Log fallback activation
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 10.2 Add discovery metrics to trace
    - Record discovery execution time
    - Record number of domains discovered
    - Record number of signals extracted
    - Record fallback flag
    - _Requirements: 5.4, 9.4_

  - [x] 10.3 Add warning logs for edge cases
    - Warn when zero domains discovered
    - Warn when all domains excluded
    - Warn when confidence is very low (<0.3)
    - Warn when fallback is applied
    - _Requirements: 1.5, 11.4_

- [ ] 11. Documentation and examples
  - [x] 11.1 Create discovery engine README
    - Explain RAA concept
    - Document signal types and weights
    - Document default-deep rule
    - Provide usage examples
    - _Requirements: All_

  - [x] 11.2 Create user exclusion guide
    - Explain how to exclude domains
    - Provide exclusion justification examples
    - Document exclusion record format
    - Explain exclusion risks
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 11.3 Create domain discovery examples
    - Example: PHP monolith discovery
    - Example: Node.js microservice discovery
    - Example: Hybrid CMS discovery
    - Example: User exclusion workflow
    - _Requirements: All_

- [x] 12. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
