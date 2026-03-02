import { RoleType, ExecutionMetadata, ApiError } from "@llm/shared-types";

// Re-export for convenience
export { RoleType };

/**
 * Provider configuration for a model in a role.
 * This matches the structure in architect.config.json.
 */
export interface RoleProviderConfig {
  /** The model identifier (e.g., "gpt-5.2", "claude-opus-4-5") */
  model: string;
  /** The provider type string (e.g., "openai", "openai-openrouter", "anthropic") */
  provider: string;
  /** Optional base URL override for the provider */
  base_url?: string;
  /** Thinking configuration for providers that support it */
  thinking?: {
    type?: "enabled" | "disabled";
    budget_tokens?: number;
  };
  /** Reasoning configuration for OpenAI-style providers */
  reasoning?: {
    effort?: "low" | "medium" | "high" | "xhigh";
  };
}

/**
 * Request to execute a role
 */
export interface RoleRequest {
  role: RoleType;
  prompt: string;
  context?: Record<string, unknown>;
  /** Override models - can be model IDs or full provider configs */
  modelsOverride?: string | string[] | RoleProviderConfig | RoleProviderConfig[];
}

/**
 * Response from a role execution
 */
export interface RoleResponse {
  role: RoleType;
  success: boolean;
  outputs: RoleOutput[];
  error?: ApiError;
  executedAt: string;
  domainId?: string; // Domain ID when role is executed for a specific domain
}

/**
 * Single output from a model in a role
 * (roles can have multiple models running in parallel)
 * 
 * Per Requirements 10.4: When ModelGateway returns success=false,
 * the error is included in RoleOutput for individual model failures.
 */
export interface RoleOutput {
  modelId: string;
  content: string;
  metadata?: ExecutionMetadata;
  /** Error details if the model call failed (per Requirements 10.4) */
  error?: ApiError;
}

/**
 * Role configuration from architect.config.json
 * 
 * Per Requirements 10.2: Models are configured as ProviderConfig arrays
 * to support provider-specific settings like thinking/reasoning modes.
 */
export interface RoleConfig {
  /** 
   * Models configuration per role.
   * Can be:
   * - A single ProviderConfig object (e.g., aggregator role)
   * - An array of ProviderConfig objects (e.g., legacy_analysis, architect roles)
   * - Legacy format: string or string[] (model IDs only)
   */
  models: Record<string, RoleProviderConfig | RoleProviderConfig[] | string | string[]>;
}
