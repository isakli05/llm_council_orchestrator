/**
 * Configuration Loader for LLM Council Orchestrator
 * 
 * Loads configuration from architect.config.json and applies environment variable overrides.
 * Follows the configuration override precedence defined in Requirements 15.2:
 * - Environment variables take precedence over config file values
 * 
 * Configuration Priority (highest to lowest):
 * 1. Environment variables
 * 2. architect.config.json values
 * 3. Default values
 */

import { z } from "zod";
import * as fs from "fs";
import * as path from "path";

/**
 * Thinking configuration schema
 */
const ThinkingConfigSchema = z.object({
  type: z.enum(["enabled", "disabled"]).optional(),
  budget_tokens: z.number().optional(),
});

/**
 * Reasoning configuration schema
 */
const ReasoningConfigSchema = z.object({
  effort: z.enum(["low", "medium", "high", "xhigh"]).optional(),
});

/**
 * Provider configuration schema for a model
 */
const ProviderConfigSchema = z.object({
  model: z.string(),
  provider: z.string(),
  base_url: z.string().optional(),
  thinking: ThinkingConfigSchema.optional(),
  reasoning: ReasoningConfigSchema.optional(),
});

/**
 * Provider endpoint configuration schema
 * Includes optional timeout configuration per provider
 */
const ProviderEndpointSchema = z.object({
  endpoint: z.string(),
  envKey: z.string(),
  /** Provider-specific timeout in milliseconds (overrides default) */
  timeout: z.number().optional(),
});

/**
 * Embedding model configuration schema
 */
const EmbeddingModelConfigSchema = z.object({
  dimensions: z.number(),
  maxTokens: z.number(),
});

/**
 * Embedding configuration schema
 */
const EmbeddingConfigSchema = z.object({
  engine: z.string(),
  dimensions: z.number(),
  endpoint: z.string(),
  availableModels: z.record(EmbeddingModelConfigSchema),
});

/**
 * Service configuration schema
 */
const ServiceConfigSchema = z.object({
  url: z.string(),
  timeout: z.number().optional(),
});

/**
 * Services configuration schema
 */
const ServicesConfigSchema = z.object({
  indexer: ServiceConfigSchema,
  qdrant: ServiceConfigSchema,
});

/**
 * Defaults configuration schema
 */
const DefaultsConfigSchema = z.object({
  modelCallTimeout: z.number(),
  httpRequestTimeout: z.number(),
  maxRetries: z.number(),
  backoffBase: z.number(),
});

/**
 * Full architect configuration schema
 */
export const ArchitectConfigSchema = z.object({
  models: z.object({
    legacy_analysis: z.array(ProviderConfigSchema).optional(),
    architect: z.array(ProviderConfigSchema).optional(),
    migration: z.array(ProviderConfigSchema).optional(),
    security: z.array(ProviderConfigSchema).optional(),
    aggregator: ProviderConfigSchema.optional(),
  }),
  providers: z.record(ProviderEndpointSchema),
  embedding: EmbeddingConfigSchema,
  services: ServicesConfigSchema,
  defaults: DefaultsConfigSchema,
});

/**
 * Type definitions derived from schemas
 */
export type ThinkingConfig = z.infer<typeof ThinkingConfigSchema>;
export type ReasoningConfig = z.infer<typeof ReasoningConfigSchema>;
export type ProviderConfigType = z.infer<typeof ProviderConfigSchema>;
export type ArchitectConfig = z.infer<typeof ArchitectConfigSchema>;

/**
 * Environment variable mapping for configuration overrides
 * Maps environment variable names to their config paths
 */
const ENV_VAR_MAPPINGS: Record<string, { path: string[]; type: "string" | "number" | "boolean" }> = {
  // Service URLs
  INDEXER_URL: { path: ["services", "indexer", "url"], type: "string" },
  QDRANT_URL: { path: ["services", "qdrant", "url"], type: "string" },
  EMBEDDING_URL: { path: ["embedding", "endpoint"], type: "string" },
  
  // Embedding configuration
  EMBEDDING_MODEL: { path: ["embedding", "engine"], type: "string" },
  
  // Timeout and retry configuration
  MODEL_CALL_TIMEOUT: { path: ["defaults", "modelCallTimeout"], type: "number" },
  HTTP_REQUEST_TIMEOUT: { path: ["defaults", "httpRequestTimeout"], type: "number" },
  MAX_RETRIES: { path: ["defaults", "maxRetries"], type: "number" },
  BACKOFF_BASE: { path: ["defaults", "backoffBase"], type: "number" },
  
  // Indexer timeout
  INDEXER_TIMEOUT: { path: ["services", "indexer", "timeout"], type: "number" },
};

/**
 * Required environment variables for the system to function
 * These are validated on startup
 */
const REQUIRED_ENV_VARS = [
  "INDEXER_API_KEY",
];

/**
 * Provider-specific API key environment variables
 * These are checked based on which providers are configured
 */
const PROVIDER_API_KEY_VARS: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  zai: "ZAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  "openai-openrouter": "OPENROUTER_API_KEY",
  "anthropic-openrouter": "OPENROUTER_API_KEY",
  "zai-openrouter": "OPENROUTER_API_KEY",
  "gemini-openrouter": "OPENROUTER_API_KEY",
};

/**
 * Valid model names for each provider
 * Per Requirements 15.4: Validate model names exist for providers
 */
export const VALID_MODELS_BY_PROVIDER: Record<string, string[]> = {
  openai: ["gpt-5.2", "gpt-5.2-pro"],
  anthropic: ["claude-opus-4-5", "claude-sonnet-4-5"],
  zai: ["glm-4.6"],
  gemini: ["gemini-3-pro"],
  // OpenRouter variants support the same models as their base providers
  "openai-openrouter": ["gpt-5.2", "gpt-5.2-pro"],
  "anthropic-openrouter": ["claude-opus-4-5", "claude-sonnet-4-5"],
  "zai-openrouter": ["glm-4.6"],
  "gemini-openrouter": ["gemini-3-pro"],
};

/**
 * Result of configuration validation
 */
export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  missingApiKeys: string[];
}

/**
 * Configuration loader options
 */
export interface ConfigLoaderOptions {
  /** Path to architect.config.json (optional, will search if not provided) */
  configPath?: string;
  /** Whether to validate API keys for configured providers */
  validateApiKeys?: boolean;
  /** Whether to throw on validation errors */
  throwOnError?: boolean;
}

/**
 * Find architect.config.json by searching upward from current directory
 */
function findConfigPath(startDir?: string): string {
  let currentDir = startDir || process.cwd();
  const configFileName = "architect.config.json";
  const searchedPaths: string[] = [];

  // Search up to 5 levels
  for (let i = 0; i < 5; i++) {
    const configPath = path.join(currentDir, configFileName);
    searchedPaths.push(configPath);
    
    if (fs.existsSync(configPath)) {
      return configPath;
    }
    
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break; // Reached root
    }
    currentDir = parentDir;
  }

  // Check ORCH_CONFIG_PATH environment variable
  if (process.env.ORCH_CONFIG_PATH) {
    const envConfigPath = path.resolve(process.env.ORCH_CONFIG_PATH);
    if (fs.existsSync(envConfigPath)) {
      return envConfigPath;
    }
    searchedPaths.push(envConfigPath);
  }

  throw new Error(
    `Config file not found. Searched paths:\n${searchedPaths.join("\n")}\n` +
    `Current working directory: ${process.cwd()}\n` +
    `Set ORCH_CONFIG_PATH environment variable to specify config location.`
  );
}

/**
 * Parse environment variable value based on type
 */
function parseEnvValue(value: string, type: "string" | "number" | "boolean"): string | number | boolean {
  switch (type) {
    case "number":
      const num = parseInt(value, 10);
      if (isNaN(num)) {
        throw new Error(`Invalid number value: ${value}`);
      }
      return num;
    case "boolean":
      return value.toLowerCase() === "true";
    case "string":
    default:
      return value;
  }
}

/**
 * Set a nested value in an object using a path array
 */
function setNestedValue(obj: Record<string, unknown>, pathArr: string[], value: unknown): void {
  let current = obj;
  for (let i = 0; i < pathArr.length - 1; i++) {
    const key = pathArr[i];
    if (!(key in current) || typeof current[key] !== "object" || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[pathArr[pathArr.length - 1]] = value;
}

/**
 * Apply environment variable overrides to configuration
 * Per Requirements 15.2: Environment variables take precedence over config file values
 */
function applyEnvironmentOverrides(config: Record<string, unknown>): void {
  for (const [envVar, mapping] of Object.entries(ENV_VAR_MAPPINGS)) {
    const envValue = process.env[envVar];
    if (envValue !== undefined && envValue !== "") {
      try {
        const parsedValue = parseEnvValue(envValue, mapping.type);
        setNestedValue(config, mapping.path, parsedValue);
      } catch (error) {
        console.warn(`Warning: Failed to parse environment variable ${envVar}: ${(error as Error).message}`);
      }
    }
  }
}

/**
 * Get all configured providers from the config
 */
function getConfiguredProviders(config: ArchitectConfig): Set<string> {
  const providers = new Set<string>();
  
  // Check model configurations
  const modelGroups = [
    config.models.legacy_analysis,
    config.models.architect,
    config.models.migration,
    config.models.security,
  ];
  
  for (const group of modelGroups) {
    if (group) {
      for (const modelConfig of group) {
        providers.add(modelConfig.provider);
      }
    }
  }
  
  // Check aggregator
  if (config.models.aggregator) {
    providers.add(config.models.aggregator.provider);
  }
  
  return providers;
}

/**
 * Validate required environment variables
 */
function validateRequiredEnvVars(): string[] {
  const errors: string[] = [];
  
  for (const envVar of REQUIRED_ENV_VARS) {
    if (!process.env[envVar]) {
      errors.push(`Missing required environment variable: ${envVar}`);
    }
  }
  
  return errors;
}

/**
 * Model validation error details
 */
export interface ModelValidationError {
  role: string;
  model: string;
  provider: string;
  validModels: string[];
}

/**
 * Validate that model names are valid for their configured providers
 * Per Requirements 15.4: Validate model names exist for providers
 * 
 * @param config - The loaded architect configuration
 * @returns Array of validation errors for invalid model names
 */
function validateModelNamesForProviders(config: ArchitectConfig): ModelValidationError[] {
  const errors: ModelValidationError[] = [];
  
  // Check model configurations for each role
  const roleModelConfigs: Array<{ role: string; configs: ProviderConfigType[] | ProviderConfigType | undefined }> = [
    { role: "legacy_analysis", configs: config.models.legacy_analysis },
    { role: "architect", configs: config.models.architect },
    { role: "migration", configs: config.models.migration },
    { role: "security", configs: config.models.security },
    { role: "aggregator", configs: config.models.aggregator },
  ];
  
  for (const { role, configs } of roleModelConfigs) {
    if (!configs) continue;
    
    // Handle both array and single config
    const configArray = Array.isArray(configs) ? configs : [configs];
    
    for (const modelConfig of configArray) {
      const { model, provider } = modelConfig;
      const validModels = VALID_MODELS_BY_PROVIDER[provider];
      
      if (!validModels) {
        // Unknown provider - this is handled by schema validation
        continue;
      }
      
      if (!validModels.includes(model)) {
        errors.push({
          role,
          model,
          provider,
          validModels,
        });
      }
    }
  }
  
  return errors;
}

/**
 * Format model validation errors into human-readable strings
 */
function formatModelValidationErrors(errors: ModelValidationError[]): string[] {
  return errors.map(err => 
    `Invalid model "${err.model}" for provider "${err.provider}" in role "${err.role}". ` +
    `Valid models for ${err.provider}: ${err.validModels.join(", ")}`
  );
}

/**
 * Validate API keys for configured providers
 * Per Requirements 15.3: Log warning if key is missing, mark provider as unavailable
 */
function validateProviderApiKeys(config: ArchitectConfig): { warnings: string[]; missingApiKeys: string[] } {
  const warnings: string[] = [];
  const missingApiKeys: string[] = [];
  const configuredProviders = getConfiguredProviders(config);
  
  for (const provider of configuredProviders) {
    const envVar = PROVIDER_API_KEY_VARS[provider];
    if (envVar && !process.env[envVar]) {
      warnings.push(`API key missing for provider "${provider}": ${envVar} not set. Provider will be unavailable.`);
      missingApiKeys.push(provider);
    }
  }
  
  return { warnings, missingApiKeys };
}

/**
 * Load and validate configuration from architect.config.json with environment variable overrides
 * 
 * Per Requirements 15.1, 15.2, 15.4:
 * - Loads architect.config.json from project root
 * - Overrides with environment variables if set
 * - Fails startup with clear error if config is invalid JSON
 * 
 * @param options - Configuration loader options
 * @returns Loaded and validated configuration
 */
export function loadArchitectConfig(options: ConfigLoaderOptions = {}): ArchitectConfig {
  const { configPath, validateApiKeys = true, throwOnError = true } = options;
  
  // Find config file
  const resolvedPath = configPath || findConfigPath();
  
  // Load and parse JSON
  let rawConfig: Record<string, unknown>;
  try {
    const rawContent = fs.readFileSync(resolvedPath, "utf-8");
    rawConfig = JSON.parse(rawContent);
  } catch (error) {
    const err = error as Error;
    if (err.name === "SyntaxError") {
      throw new Error(`Invalid JSON in config file ${resolvedPath}: ${err.message}`);
    }
    throw new Error(`Failed to load config file ${resolvedPath}: ${err.message}`);
  }
  
  // Apply environment variable overrides
  // Per Requirements 15.2: Environment variables take precedence
  applyEnvironmentOverrides(rawConfig);
  
  // Validate with Zod schema
  // Per Requirements 15.4: Fail startup with clear error if invalid
  const parseResult = ArchitectConfigSchema.safeParse(rawConfig);
  if (!parseResult.success) {
    const errorMessages = parseResult.error.errors.map(
      (e) => `  - ${e.path.join(".")}: ${e.message}`
    ).join("\n");
    
    if (throwOnError) {
      throw new Error(`Invalid configuration in ${resolvedPath}:\n${errorMessages}`);
    }
  }
  
  const config = parseResult.success ? parseResult.data : (rawConfig as unknown as ArchitectConfig);
  
  // Validate model names for providers
  // Per Requirements 15.4: Validate model names exist for providers
  if (throwOnError) {
    const modelValidationErrors = validateModelNamesForProviders(config);
    if (modelValidationErrors.length > 0) {
      const errorMessages = formatModelValidationErrors(modelValidationErrors)
        .map(msg => `  - ${msg}`)
        .join("\n");
      throw new Error(`Invalid model configuration in ${resolvedPath}:\n${errorMessages}`);
    }
  }
  
  return config;
}

/**
 * Validate configuration and environment variables
 * Returns validation result with errors, warnings, and missing API keys
 * 
 * Per Requirements 15.4: Validate model names exist for providers
 * 
 * @param config - Configuration to validate
 * @returns Validation result
 */
export function validateConfig(config: ArchitectConfig): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Validate required environment variables
  errors.push(...validateRequiredEnvVars());
  
  // Validate model names for providers
  // Per Requirements 15.4: Validate model names exist for providers
  const modelValidationErrors = validateModelNamesForProviders(config);
  errors.push(...formatModelValidationErrors(modelValidationErrors));
  
  // Validate provider API keys
  const apiKeyValidation = validateProviderApiKeys(config);
  warnings.push(...apiKeyValidation.warnings);
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    missingApiKeys: apiKeyValidation.missingApiKeys,
  };
}

/**
 * Load configuration and validate all requirements
 * This is the main entry point for configuration loading
 * 
 * @param options - Configuration loader options
 * @returns Loaded configuration and validation result
 */
export function loadAndValidateConfig(options: ConfigLoaderOptions = {}): {
  config: ArchitectConfig;
  validation: ConfigValidationResult;
} {
  const config = loadArchitectConfig(options);
  const validation = validateConfig(config);
  
  // Log warnings
  for (const warning of validation.warnings) {
    console.warn(`[Config] ${warning}`);
  }
  
  // Log errors
  for (const error of validation.errors) {
    console.error(`[Config] ${error}`);
  }
  
  return { config, validation };
}

/**
 * Get API key for a provider from environment variables
 * 
 * @param provider - Provider name
 * @returns API key or undefined if not set
 */
export function getProviderApiKey(provider: string): string | undefined {
  const envVar = PROVIDER_API_KEY_VARS[provider];
  return envVar ? process.env[envVar] : undefined;
}

/**
 * Check if a provider has a valid API key configured
 * 
 * @param provider - Provider name
 * @returns true if API key is set
 */
export function hasProviderApiKey(provider: string): boolean {
  return !!getProviderApiKey(provider);
}

/**
 * Provider availability status for API key validation
 */
export interface ProviderAvailabilityStatus {
  provider: string;
  available: boolean;
  envVar: string;
  reason?: string;
}

/**
 * Result of API key validation for all providers
 */
export interface ApiKeyValidationResult {
  /** All providers that were checked */
  providers: ProviderAvailabilityStatus[];
  /** Providers that are available (have valid API keys) */
  availableProviders: string[];
  /** Providers that are unavailable (missing API keys) */
  unavailableProviders: string[];
  /** Warnings for missing API keys */
  warnings: string[];
}

/**
 * Validate API keys for all configured providers on startup
 * 
 * Per Requirements 15.3:
 * - Check API keys for active providers on startup
 * - Log warning if key is missing
 * - Mark provider as unavailable if key missing
 * 
 * @param config - The loaded architect configuration
 * @param logWarnings - Whether to log warnings for missing API keys (default: true)
 * @returns Validation result with provider availability status
 */
export function validateApiKeysOnStartup(
  config: ArchitectConfig,
  logWarnings: boolean = true
): ApiKeyValidationResult {
  const providers: ProviderAvailabilityStatus[] = [];
  const availableProviders: string[] = [];
  const unavailableProviders: string[] = [];
  const warnings: string[] = [];
  
  // Get all configured providers
  const configuredProviders = getConfiguredProviders(config);
  
  for (const provider of configuredProviders) {
    const envVar = PROVIDER_API_KEY_VARS[provider];
    
    if (!envVar) {
      // Provider doesn't require an API key (shouldn't happen with known providers)
      providers.push({
        provider,
        available: true,
        envVar: "N/A",
        reason: "No API key required",
      });
      availableProviders.push(provider);
      continue;
    }
    
    const apiKey = process.env[envVar];
    const hasKey = !!apiKey && apiKey.trim().length > 0;
    
    if (hasKey) {
      providers.push({
        provider,
        available: true,
        envVar,
      });
      availableProviders.push(provider);
    } else {
      const reason = `API key missing: ${envVar} environment variable not set`;
      providers.push({
        provider,
        available: false,
        envVar,
        reason,
      });
      unavailableProviders.push(provider);
      
      const warning = `[API Key Validation] Provider "${provider}" is unavailable: ${reason}`;
      warnings.push(warning);
      
      // Log warning if enabled
      // Per Requirements 15.3: Log warning if key is missing
      if (logWarnings) {
        console.warn(warning);
      }
    }
  }
  
  return {
    providers,
    availableProviders,
    unavailableProviders,
    warnings,
  };
}

/**
 * Get the environment variable name for a provider's API key
 * 
 * @param provider - Provider name
 * @returns Environment variable name or undefined if not found
 */
export function getProviderApiKeyEnvVar(provider: string): string | undefined {
  return PROVIDER_API_KEY_VARS[provider];
}

/**
 * Get all provider API key environment variable mappings
 * 
 * @returns Record of provider names to environment variable names
 */
export function getProviderApiKeyMappings(): Record<string, string> {
  return { ...PROVIDER_API_KEY_VARS };
}
