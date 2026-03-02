# Design Document

## Overview

This design extends the existing pipeline API to support dynamic role-model configuration at runtime. The approach is minimal: add one new field to the existing request schema and two new read-only endpoints for UI population. No new services, no new databases, no architectural changes.

**Key Principle:** Extend, don't replace. The existing RoleManager already supports `modelsOverride` - we're just exposing this capability through a cleaner API.

## Architecture

### Changes to Existing Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    POST /pipeline/run                            │
│                                                                   │
│  Request Body (EXTENDED):                                        │
│  {                                                               │
│    pipeline_mode: "full_analysis",                               │
│    prompt: "...",                                                │
│    project_root: "...",                                          │
│    role_configs: {           ← NEW FIELD                         │
│      "architect": { models: [...] },                             │
│      "security": { models: [...] }                               │
│    }                                                             │
│  }                                                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PipelineEngine.execute()                      │
│                                                                   │
│  1. Merge role_configs with defaults from architect.config.json  │
│  2. Pass merged config to RoleManager                            │
│  3. RoleManager.resolveModels() uses the merged config           │
└─────────────────────────────────────────────────────────────────┘
```

### New Endpoints

```
GET /config/models    → Returns available models by provider
GET /config/roles     → Returns available roles with defaults
```

These are read-only, stateless endpoints. No caching needed - they read from architect.config.json and check environment variables.

## Components and Interfaces

### 1. Extended RunPipelineRequest Schema

**Location:** `apps/orchestrator/src/api/validators.ts`

```typescript
// New schema for model configuration
const ModelConfigSchema = z.object({
  model: z.string().min(1),
  provider: z.string().optional(), // Inferred if not provided
  thinking: z.object({
    type: z.enum(["enabled", "disabled"]).optional(),
    budget_tokens: z.number().positive().optional(),
  }).optional(),
  reasoning: z.object({
    effort: z.enum(["low", "medium", "high", "xhigh"]).optional(),
  }).optional(),
});

// New schema for role configuration
const RoleConfigSchema = z.object({
  models: z.array(ModelConfigSchema).min(1).max(3), // 1-3 models per role
});

// Extended request schema
export const RunPipelineRequestSchema = z.object({
  pipeline_mode: PipelineModeSchema,
  prompt: z.string().min(1),
  project_root: safePathValidator.default(process.cwd()),
  force_reindex: z.boolean().optional().default(false),
  role_configs: z.record(z.string(), RoleConfigSchema).optional(), // NEW
  metadata: z.record(z.unknown()).optional(),
  domainExclusions: z.array(DomainExclusionSchema).optional(),
});
```

### 2. ConfigController (New)

**Location:** `apps/orchestrator/src/api/ConfigController.ts`

```typescript
export class ConfigController {
  private config: ArchitectConfig;
  private modelGateway: ModelGateway;

  constructor(config: ArchitectConfig, modelGateway: ModelGateway) {
    this.config = config;
    this.modelGateway = modelGateway;
  }

  /**
   * GET /config/models
   * Returns available models grouped by provider
   */
  async getModels(request: FastifyRequest, reply: FastifyReply) {
    const providers = this.buildProviderList();
    return reply.code(200).send({ ok: true, providers });
  }

  /**
   * GET /config/roles
   * Returns available roles with default configurations
   */
  async getRoles(request: FastifyRequest, reply: FastifyReply) {
    const roles = this.buildRoleList();
    return reply.code(200).send({ ok: true, roles });
  }
}
```

### 3. Role Config Merger

**Location:** `apps/orchestrator/src/pipeline/roleConfigMerger.ts`

```typescript
/**
 * Merges user-provided role_configs with defaults from architect.config.json
 * 
 * Rules:
 * 1. If role_configs is undefined/null, use all defaults
 * 2. If role_configs is empty object, use all defaults
 * 3. If role_configs specifies a role, use that config (no merge with default)
 * 4. If role_configs omits a role, use default for that role
 */
export function mergeRoleConfigs(
  userConfigs: Record<string, RoleModelConfig> | undefined,
  defaults: RoleConfig
): RoleConfig {
  if (!userConfigs || Object.keys(userConfigs).length === 0) {
    return defaults;
  }

  const merged: RoleConfig = { models: {} };
  
  // Start with defaults
  for (const [role, config] of Object.entries(defaults.models)) {
    merged.models[role] = config;
  }
  
  // Override with user configs
  for (const [role, config] of Object.entries(userConfigs)) {
    merged.models[role] = normalizeToProviderConfigs(config.models);
  }
  
  return merged;
}
```

## Data Models

### RoleModelConfig (New Type)

```typescript
/**
 * User-provided configuration for a single role
 */
export interface RoleModelConfig {
  models: ModelConfig[];
}

/**
 * User-provided configuration for a single model
 */
export interface ModelConfig {
  model: string;
  provider?: string; // Optional - inferred from model prefix if not provided
  thinking?: {
    type?: "enabled" | "disabled";
    budget_tokens?: number;
  };
  reasoning?: {
    effort?: "low" | "medium" | "high" | "xhigh";
  };
}
```

### API Response Types

```typescript
/**
 * Response for GET /config/models
 */
export interface ModelsResponse {
  ok: true;
  providers: ProviderInfo[];
}

export interface ProviderInfo {
  name: string;           // "openai", "anthropic", etc.
  available: boolean;     // true if API key is configured
  models: ModelInfo[];
}

export interface ModelInfo {
  name: string;           // "gpt-5.2", "claude-opus-4-5", etc.
  supportsThinking: boolean;
  supportsReasoning: boolean;
  defaultConfig: ModelConfig;
}

/**
 * Response for GET /config/roles
 */
export interface RolesResponse {
  ok: true;
  roles: RoleInfo[];
}

export interface RoleInfo {
  name: string;           // "architect", "security", etc.
  description: string;
  supportsDualModel: boolean;
  defaultModels: ModelConfig[];
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Role Config Override
*For any* valid role_configs provided in the request, the RoleManager should receive exactly those model configurations for the specified roles, not the defaults from architect.config.json.
**Validates: Requirements 1.1**

### Property 2: Model Count Determines Execution Mode
*For any* role configuration, if models array has length 1, exactly one model call should be made; if length > 1, multiple model calls should be made in parallel.
**Validates: Requirements 1.2, 1.3**

### Property 3: Default Fallback for Omitted Roles
*For any* role_configs that omits a role, that role should receive its default configuration from architect.config.json.
**Validates: Requirements 1.4, 6.1, 6.3**

### Property 4: Provider Inference from Model Prefix
*For any* model config without explicit provider, the provider should be correctly inferred: gpt-* → openai, claude-* → anthropic, glm-* → zai, gemini-* → gemini.
**Validates: Requirements 2.1**

### Property 5: Explicit Provider Override
*For any* model config with explicit provider, that provider should be used regardless of model prefix.
**Validates: Requirements 2.2**

### Property 6: Thinking Config Passthrough
*For any* model config with thinking configuration, the thinking.type and thinking.budget_tokens should be passed to the provider adapter unchanged.
**Validates: Requirements 2.3**

### Property 7: Reasoning Config Passthrough
*For any* model config with reasoning configuration, the reasoning.effort should be passed to the provider adapter unchanged.
**Validates: Requirements 2.4**

### Property 8: Invalid Role Rejection
*For any* role_configs containing a role name not in RoleType enum, the system should return 400 with error code INVALID_ROLE.
**Validates: Requirements 1.5, 5.1**

### Property 9: Invalid Model Config Rejection
*For any* role_configs containing an empty model name or invalid provider, the system should return 400 with appropriate error code.
**Validates: Requirements 1.6, 5.2, 5.3**

### Property 10: Provider Availability Check
*For any* model config specifying a provider without a configured API key, the system should return 400 with error code PROVIDER_UNAVAILABLE.
**Validates: Requirements 5.5**

### Property 11: Models Endpoint Response Structure
*For any* GET /config/models request, the response should contain all providers with their availability status and model lists.
**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

### Property 12: Roles Endpoint Response Structure
*For any* GET /config/roles request, the response should contain all roles with their descriptions, dual-model support flags, and default configurations.
**Validates: Requirements 4.1, 4.2, 4.3**

## Error Handling

### Validation Errors

| Error Code | HTTP Status | Condition |
|------------|-------------|-----------|
| INVALID_ROLE | 400 | Role name not in RoleType enum |
| INVALID_MODEL_CONFIG | 400 | Empty model name or malformed config |
| INVALID_PROVIDER | 400 | Provider not in supported list |
| PROVIDER_UNAVAILABLE | 400 | Provider API key not configured |
| VALIDATION_ERROR | 400 | General Zod validation failure |

### Error Response Format

```typescript
{
  ok: false,
  error: {
    code: "INVALID_ROLE",
    message: "Invalid role name: 'invalid_role'",
    details: {
      field: "role_configs.invalid_role",
      validRoles: ["legacy_analysis", "architect", "migration", "security", "aggregator"]
    }
  }
}
```

## Testing Strategy

### Unit Tests

1. **RoleConfigMerger tests:**
   - Merge with undefined user config
   - Merge with empty user config
   - Merge with partial user config
   - Merge with full user config

2. **Validation tests:**
   - Valid role names
   - Invalid role names
   - Valid model configs
   - Invalid model configs
   - Provider inference

3. **ConfigController tests:**
   - GET /config/models response structure
   - GET /config/roles response structure
   - Provider availability detection

### Property-Based Tests

Using fast-check library:

1. **Property 1-3:** Generate random role_configs and verify correct behavior
2. **Property 4-5:** Generate model names and verify provider inference
3. **Property 6-7:** Generate thinking/reasoning configs and verify passthrough
4. **Property 8-10:** Generate invalid inputs and verify error responses
5. **Property 11-12:** Verify endpoint response structures

### Integration Tests

1. Full pipeline execution with custom role_configs
2. Pipeline execution with partial role_configs
3. Pipeline execution without role_configs (defaults)
