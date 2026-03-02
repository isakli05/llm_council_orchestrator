# Implementation Plan

- [x] 1. Add new type definitions
  - [x] 1.1 Create RoleModelConfig and ModelConfig interfaces
    - Add to `packages/shared-types/src/roles.ts`
    - Define ModelConfig with model, provider, thinking, reasoning fields
    - Define RoleModelConfig with models array
    - Export from index.ts
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 1.2 Write property test for provider inference
    - **Property 4: Provider Inference from Model Prefix**
    - **Validates: Requirements 2.1**

- [x] 2. Extend API validators
  - [x] 2.1 Add ModelConfigSchema and RoleConfigSchema
    - Create ModelConfigSchema with optional provider, thinking, reasoning
    - Create RoleConfigSchema with models array (min 1, max 3)
    - Add role_configs field to RunPipelineRequestSchema
    - Remove models_override field from schema
    - _Requirements: 1.1, 1.2, 1.3, 5.2, 5.3, 7.3_

  - [x] 2.2 Add role name validation
    - Create custom Zod refinement for RoleType enum validation
    - Return INVALID_ROLE error code for invalid role names
    - Include valid roles list in error details
    - _Requirements: 1.5, 5.1, 5.4_

  - [ ]* 2.3 Write property test for invalid role rejection
    - **Property 8: Invalid Role Rejection**
    - **Validates: Requirements 1.5, 5.1**

  - [ ]* 2.4 Write property test for invalid model config rejection
    - **Property 9: Invalid Model Config Rejection**
    - **Validates: Requirements 1.6, 5.2, 5.3**

- [x] 3. Implement role config merger
  - [x] 3.1 Create roleConfigMerger.ts
    - Create `apps/orchestrator/src/pipeline/roleConfigMerger.ts`
    - Implement mergeRoleConfigs function
    - Handle undefined, empty, partial, and full user configs
    - Implement provider inference from model prefix
    - _Requirements: 1.4, 2.1, 6.1, 6.2, 6.3_

  - [ ]* 3.2 Write property test for role config override
    - **Property 1: Role Config Override**
    - **Validates: Requirements 1.1**

  - [ ]* 3.3 Write property test for default fallback
    - **Property 3: Default Fallback for Omitted Roles**
    - **Validates: Requirements 1.4, 6.1, 6.3**

- [x] 4. Integrate with PipelineEngine
  - [x] 4.1 Update PipelineEngine.execute() signature
    - Replace modelsOverride parameter with roleConfigs
    - Call mergeRoleConfigs to merge user config with defaults
    - Pass merged config to RoleManager constructor
    - _Requirements: 1.1, 1.4_

  - [x] 4.2 Add provider availability check
    - Before execution, validate all configured providers have API keys
    - Return PROVIDER_UNAVAILABLE error if any provider is missing key
    - _Requirements: 5.5_

  - [ ]* 4.3 Write property test for provider availability
    - **Property 10: Provider Availability Check**
    - **Validates: Requirements 5.5**

- [x] 5. Update PipelineController
  - [x] 5.1 Update runPipeline handler
    - Extract role_configs from validated request body
    - Pass role_configs to PipelineEngine.execute()
    - Remove models_override handling
    - _Requirements: 1.1, 7.1_

  - [ ]* 5.2 Write property test for model count execution mode
    - **Property 2: Model Count Determines Execution Mode**
    - **Validates: Requirements 1.2, 1.3**

- [x] 6. Implement ConfigController
  - [x] 6.1 Create ConfigController class
    - Create `apps/orchestrator/src/api/ConfigController.ts`
    - Inject ArchitectConfig and ModelGateway dependencies
    - _Requirements: 3.1, 4.1_

  - [x] 6.2 Implement GET /config/models endpoint
    - Build provider list from architect.config.json
    - Check API key availability for each provider
    - Include model capabilities (thinking, reasoning support)
    - Include default configurations
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 6.3 Implement GET /config/roles endpoint
    - Return all RoleType enum values with descriptions
    - Include supportsDualModel flag (true for legacy_analysis, architect)
    - Include default model configurations from architect.config.json
    - _Requirements: 4.1, 4.2, 4.3_

  - [ ]* 6.4 Write property test for models endpoint response
    - **Property 11: Models Endpoint Response Structure**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**

  - [ ]* 6.5 Write property test for roles endpoint response
    - **Property 12: Roles Endpoint Response Structure**
    - **Validates: Requirements 4.1, 4.2, 4.3**

- [x] 7. Register new routes
  - [x] 7.1 Update server.ts with new routes
    - Add GET /api/v1/config/models route
    - Add GET /api/v1/config/roles route
    - Instantiate ConfigController with dependencies
    - _Requirements: 3.1, 4.1_

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ]* 9. Write integration property tests
  - [ ]* 9.1 Write property test for thinking config passthrough
    - **Property 6: Thinking Config Passthrough**
    - **Validates: Requirements 2.3**

  - [ ]* 9.2 Write property test for reasoning config passthrough
    - **Property 7: Reasoning Config Passthrough**
    - **Validates: Requirements 2.4**

  - [ ]* 9.3 Write property test for explicit provider override
    - **Property 5: Explicit Provider Override**
    - **Validates: Requirements 2.2**

- [x] 10. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
