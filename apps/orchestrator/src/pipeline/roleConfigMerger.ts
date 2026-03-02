/**
 * Role Configuration Merger
 * 
 * Merges user-provided role_configs with defaults from architect.config.json.
 * Handles provider inference from model prefixes.
 * Validates provider availability before execution.
 * 
 * Requirements: 1.4, 2.1, 5.5, 6.1, 6.2, 6.3
 */

import { RoleType, ModelConfig, RoleModelConfig, ApiError } from "@llm/shared-types";
import { hasProviderApiKey, ERROR_CODES } from "@llm/shared-config";
import { RoleConfig, RoleProviderConfig } from "../roles/types";

/**
 * Supported providers for inference from model prefix
 */
const MODEL_PREFIX_TO_PROVIDER: Record<string, string> = {
  "gpt-": "openai",
  "claude-": "anthropic",
  "glm-": "zai",
  "gemini-": "gemini",
  "grok-": "grok",
};

/**
 * Infer provider from model name prefix.
 * 
 * Per Requirements 2.1:
 * - gpt-* → openai
 * - claude-* → anthropic
 * - glm-* → zai
 * - gemini-* → gemini
 * 
 * @param modelName - The model name to infer provider from
 * @returns Inferred provider string, or "openai" as default
 */
export function inferProviderFromModel(modelName: string): string {
  const lowerModel = modelName.toLowerCase();
  
  for (const [prefix, provider] of Object.entries(MODEL_PREFIX_TO_PROVIDER)) {
    if (lowerModel.startsWith(prefix)) {
      return provider;
    }
  }
  
  // Default to openai for unknown models
  return "openai";
}

/**
 * Convert a user-provided ModelConfig to a RoleProviderConfig.
 * Infers provider if not explicitly provided.
 * 
 * Per Requirements 2.1, 2.2:
 * - If provider is not provided, infer from model prefix
 * - If provider is provided, use it directly
 * 
 * @param config - User-provided model configuration
 * @returns RoleProviderConfig with provider resolved
 */
export function modelConfigToProviderConfig(config: ModelConfig): RoleProviderConfig {
  return {
    model: config.model,
    provider: config.provider || inferProviderFromModel(config.model),
    thinking: config.thinking,
    reasoning: config.reasoning,
  };
}

/**
 * Convert an array of user-provided ModelConfigs to RoleProviderConfigs.
 * 
 * @param models - Array of user-provided model configurations
 * @returns Array of RoleProviderConfigs
 */
export function normalizeToProviderConfigs(models: ModelConfig[]): RoleProviderConfig[] {
  return models.map(modelConfigToProviderConfig);
}

/**
 * Merges user-provided role_configs with defaults from architect.config.json.
 * 
 * Rules (per Requirements 6.1, 6.2, 6.3):
 * 1. If role_configs is undefined/null, use all defaults
 * 2. If role_configs is empty object, use all defaults
 * 3. If role_configs specifies a role, use that config (no merge with default)
 * 4. If role_configs omits a role, use default for that role
 * 
 * Per Requirements 1.4:
 * - When role_configs omits a role, use default configuration from architect.config.json
 * 
 * @param userConfigs - User-provided role configurations (from API request)
 * @param defaults - Default role configuration (from architect.config.json)
 * @returns Merged RoleConfig with all roles resolved
 */
export function mergeRoleConfigs(
  userConfigs: Record<string, RoleModelConfig> | undefined | null,
  defaults: RoleConfig
): RoleConfig {
  // Per Requirements 6.1, 6.2: If no user configs or empty, use all defaults
  if (!userConfigs || Object.keys(userConfigs).length === 0) {
    return defaults;
  }

  const merged: RoleConfig = { models: {} };

  // Start with defaults for all roles
  // Per Requirements 6.3: Use defaults for unspecified roles
  for (const [role, config] of Object.entries(defaults.models)) {
    merged.models[role] = config;
  }

  // Override with user configs where provided
  // Per Requirements 1.1: Use user configurations instead of defaults
  for (const [role, config] of Object.entries(userConfigs)) {
    // Convert user ModelConfig[] to RoleProviderConfig[]
    merged.models[role] = normalizeToProviderConfigs(config.models);
  }

  return merged;
}

/**
 * Get the list of valid role names from RoleType enum.
 * 
 * @returns Array of valid role name strings
 */
export function getValidRoleNames(): string[] {
  return Object.values(RoleType);
}

/**
 * Check if a role name is valid.
 * 
 * @param roleName - Role name to validate
 * @returns true if the role name is valid
 */
export function isValidRoleName(roleName: string): boolean {
  return getValidRoleNames().includes(roleName as RoleType);
}

/**
 * Result of provider availability validation
 */
export interface ProviderAvailabilityResult {
  /** Whether all providers are available */
  valid: boolean;
  /** List of unavailable providers with their roles */
  unavailableProviders: Array<{
    provider: string;
    role: string;
    model: string;
  }>;
  /** Error to return if validation fails */
  error?: ApiError;
}

/**
 * Extract all unique providers from a merged role configuration.
 * 
 * @param roleConfig - The merged role configuration
 * @returns Array of provider info with role and model context
 */
function extractProvidersFromConfig(
  roleConfig: RoleConfig
): Array<{ provider: string; role: string; model: string }> {
  const providers: Array<{ provider: string; role: string; model: string }> = [];

  for (const [role, config] of Object.entries(roleConfig.models)) {
    if (!config) continue;

    // Handle array of configs
    if (Array.isArray(config)) {
      for (const providerConfig of config) {
        if (typeof providerConfig === "object" && "provider" in providerConfig) {
          providers.push({
            provider: providerConfig.provider,
            role,
            model: providerConfig.model,
          });
        } else if (typeof providerConfig === "string") {
          // Legacy string format - infer provider
          providers.push({
            provider: inferProviderFromModel(providerConfig),
            role,
            model: providerConfig,
          });
        }
      }
    } else if (typeof config === "object" && "provider" in config) {
      // Single config object
      providers.push({
        provider: config.provider,
        role,
        model: config.model,
      });
    } else if (typeof config === "string") {
      // Legacy string format - infer provider
      providers.push({
        provider: inferProviderFromModel(config),
        role,
        model: config,
      });
    }
  }

  return providers;
}

/**
 * Validate that all providers in the merged role configuration have API keys available.
 * 
 * Per Requirements 5.5:
 * - When a configured provider is unavailable (missing API key), return 400 with error code PROVIDER_UNAVAILABLE
 * 
 * @param roleConfig - The merged role configuration to validate
 * @returns Validation result with unavailable providers and error if any
 */
export function validateProviderAvailability(
  roleConfig: RoleConfig
): ProviderAvailabilityResult {
  const providers = extractProvidersFromConfig(roleConfig);
  const unavailableProviders: Array<{ provider: string; role: string; model: string }> = [];
  const checkedProviders = new Set<string>();

  for (const { provider, role, model } of providers) {
    // Skip if we've already checked this provider
    if (checkedProviders.has(provider)) {
      // Still record if unavailable for the error details
      if (!hasProviderApiKey(provider)) {
        unavailableProviders.push({ provider, role, model });
      }
      continue;
    }
    checkedProviders.add(provider);

    // Check if provider has API key
    if (!hasProviderApiKey(provider)) {
      unavailableProviders.push({ provider, role, model });
    }
  }

  if (unavailableProviders.length === 0) {
    return { valid: true, unavailableProviders: [] };
  }

  // Build error response
  const uniqueProviders = [...new Set(unavailableProviders.map(p => p.provider))];
  const error: ApiError = {
    code: ERROR_CODES.PROVIDER_UNAVAILABLE,
    message: `Provider(s) unavailable due to missing API key: ${uniqueProviders.join(", ")}`,
    details: {
      unavailableProviders: unavailableProviders.map(p => ({
        provider: p.provider,
        role: p.role,
        model: p.model,
      })),
    },
  };

  return {
    valid: false,
    unavailableProviders,
    error,
  };
}
