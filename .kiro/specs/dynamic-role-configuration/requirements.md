# Requirements Document

## Introduction

This specification defines the API extension for dynamic role-model configuration at runtime. The goal is to enable VSCode extension (and other clients) to configure which models are assigned to which roles, and whether roles run in single or dual-model mode, without modifying config files.

**Design Philosophy:** Minimal API surface, maximum flexibility. No overengineering. Extend existing structures rather than creating new ones.

## Glossary

- **Role**: A specialized analysis agent (legacy_analysis, architect, migration, security, aggregator)
- **Dual-Model Mode**: Running two models in parallel for a single role, aggregating their outputs
- **Single-Model Mode**: Running one model for a role
- **RoleModelConfig**: Per-role model configuration specifying models and execution mode
- **ProviderConfig**: Model configuration including provider, thinking/reasoning settings

## Requirements

### Requirement 1: Role Configuration in Pipeline Request

**User Story:** As a VSCode extension developer, I want to pass role-specific model configurations in the pipeline request, so that users can customize which models run for each role without editing config files.

#### Acceptance Criteria

1. WHEN POST /pipeline/run receives a request with role_configs field THEN the system SHALL use those configurations instead of architect.config.json defaults
2. WHEN role_configs specifies a single model for a role THEN the system SHALL execute that role in single-model mode
3. WHEN role_configs specifies multiple models for a role THEN the system SHALL execute that role in dual-model mode with parallel execution
4. WHEN role_configs omits a role THEN the system SHALL use the default configuration from architect.config.json for that role
5. WHEN role_configs contains an invalid role name THEN the system SHALL return 400 with error code INVALID_ROLE
6. WHEN role_configs contains an invalid model configuration THEN the system SHALL return 400 with error code INVALID_MODEL_CONFIG

### Requirement 2: Model Configuration Structure

**User Story:** As a VSCode extension developer, I want a clear model configuration structure that supports provider selection and thinking/reasoning modes, so that users have full control over model behavior.

#### Acceptance Criteria

1. WHEN a model config includes only model name THEN the system SHALL infer provider from model prefix (gpt-* → openai, claude-* → anthropic, glm-* → zai, gemini-* → gemini)
2. WHEN a model config includes explicit provider THEN the system SHALL use that provider (supporting openai, anthropic, zai, gemini, and their -openrouter variants)
3. WHEN a model config includes thinking configuration THEN the system SHALL pass thinking.type and thinking.budget_tokens to the provider
4. WHEN a model config includes reasoning configuration THEN the system SHALL pass reasoning.effort to the provider
5. WHEN a model config omits optional fields THEN the system SHALL use provider defaults

### Requirement 3: Available Models Endpoint

**User Story:** As a VSCode extension developer, I want to query available models and their capabilities, so that I can populate the UI with valid options.

#### Acceptance Criteria

1. WHEN GET /config/models is called THEN the system SHALL return a list of available models grouped by provider
2. WHEN a provider's API key is missing THEN the system SHALL mark that provider as unavailable in the response
3. WHEN returning model info THEN the system SHALL include model name, provider, and supported features (thinking, reasoning)
4. WHEN returning model info THEN the system SHALL include the default configuration for each model

### Requirement 4: Available Roles Endpoint

**User Story:** As a VSCode extension developer, I want to query available roles and their default configurations, so that I can show users what they can customize.

#### Acceptance Criteria

1. WHEN GET /config/roles is called THEN the system SHALL return all available roles with their default model configurations
2. WHEN returning role info THEN the system SHALL include role name, description, default models, and whether dual-model is supported
3. WHEN returning role info THEN the system SHALL indicate which roles support dual-model execution (legacy_analysis, architect)

### Requirement 5: Configuration Validation

**User Story:** As a developer, I want robust validation of role configurations, so that invalid configurations fail fast with clear error messages.

#### Acceptance Criteria

1. WHEN validating role_configs THEN the system SHALL check that all role names are valid RoleType enum values
2. WHEN validating model configs THEN the system SHALL check that model names are non-empty strings
3. WHEN validating provider names THEN the system SHALL check against the list of supported providers
4. WHEN validation fails THEN the system SHALL return a detailed error message indicating which field failed and why
5. WHEN a configured provider is unavailable (missing API key) THEN the system SHALL return 400 with error code PROVIDER_UNAVAILABLE

### Requirement 6: Default Fallback Behavior

**User Story:** As a developer, I want sensible defaults when role_configs is not provided, so that the system works out of the box.

#### Acceptance Criteria

1. WHEN POST /pipeline/run is called without role_configs THEN the system SHALL use default configurations from architect.config.json
2. WHEN role_configs is provided but empty object THEN the system SHALL use defaults for all roles
3. WHEN role_configs partially specifies roles THEN the system SHALL use defaults for unspecified roles

### Requirement 7: Remove Legacy models_override Field

**User Story:** As a developer, I want to remove the unused models_override field from the API, so that the API surface is clean and unambiguous.

#### Acceptance Criteria

1. WHEN POST /pipeline/run receives models_override field THEN the system SHALL ignore it (no error, just ignored)
2. WHEN updating API documentation THEN the system SHALL remove models_override from the schema
3. WHEN updating validators THEN the system SHALL remove models_override from RunPipelineRequestSchema
