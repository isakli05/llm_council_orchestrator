import { z } from "zod";

// Export configuration loader
export * from "./configLoader";

/**
 * Pipeline modes
 */
export const PIPELINE_MODES = {
  QUICK: "quick_diagnostic",
  FULL: "full_analysis",
  SPEC: "spec_generation",
  REFINEMENT: "refinement"
} as const;

export type PipelineMode = (typeof PIPELINE_MODES)[keyof typeof PIPELINE_MODES];

/**
 * Zod schema for pipeline mode validation
 */
export const PipelineModeSchema = z.enum([
  "quick_diagnostic",
  "full_analysis",
  "spec_generation",
  "refinement",
]);

/**
 * Timeout configurations (milliseconds)
 * Requirements: 24.1 - HTTP server timeout of 120 seconds
 * Requirements: 24.4 - Support endpoint-specific timeout config
 */
export const TIMEOUTS = {
  MODEL_CALL_DEFAULT: 30000, // 30 seconds
  HTTP_REQUEST: 120000, // 120 seconds (Requirements: 24.1)
  PROGRESS_POLL_INTERVAL: 2000, // 2 seconds
} as const;

/**
 * Per-endpoint timeout configuration
 * Requirements: 24.4 - Support endpoint-specific timeout config
 * 
 * Maps endpoint patterns to their specific timeout values in milliseconds.
 * Patterns support wildcards (*) for path parameters.
 * If an endpoint is not listed, the default HTTP_REQUEST timeout is used.
 */
export const ENDPOINT_TIMEOUTS: Record<string, number> = {
  // Pipeline endpoints - longer timeout for complex operations
  "POST /api/v1/pipeline/run": 180000, // 3 minutes - pipeline execution can take longer
  "GET /api/v1/pipeline/result/*": 60000, // 1 minute - result retrieval
  "GET /api/v1/pipeline/status/*": 30000, // 30 seconds - status check is quick
  "GET /api/v1/pipeline/progress/*": 30000, // 30 seconds - progress check is quick
  
  // Index endpoints - indexing can take time
  "POST /api/v1/index/ensure": 300000, // 5 minutes - indexing large codebases
  "GET /api/v1/index/status": 30000, // 30 seconds - status check is quick
  "POST /api/v1/search": 60000, // 1 minute - semantic search
  
  // Spec endpoints - quick operations
  "GET /api/v1/spec/project_context": 30000, // 30 seconds
  "GET /api/v1/spec/modules": 30000, // 30 seconds
  
  // Health endpoints - should be very fast
  "GET /health": 5000, // 5 seconds
  "GET /health/live": 5000, // 5 seconds
  "GET /health/ready": 10000, // 10 seconds - includes dependency checks
} as const;

/**
 * Get the timeout for a specific endpoint
 * Requirements: 24.4 - Support endpoint-specific timeout config
 * 
 * @param method - HTTP method (GET, POST, etc.)
 * @param path - Request path (e.g., "/api/v1/pipeline/run")
 * @returns Timeout in milliseconds
 */
export function getEndpointTimeout(method: string, path: string): number {
  // Normalize method to uppercase
  const normalizedMethod = method.toUpperCase();
  
  // Try exact match first
  const exactKey = `${normalizedMethod} ${path}`;
  if (ENDPOINT_TIMEOUTS[exactKey] !== undefined) {
    return ENDPOINT_TIMEOUTS[exactKey];
  }
  
  // Try pattern matching with wildcards
  for (const [pattern, timeout] of Object.entries(ENDPOINT_TIMEOUTS)) {
    const [patternMethod, patternPath] = pattern.split(' ');
    
    if (patternMethod !== normalizedMethod) {
      continue;
    }
    
    // Convert pattern to regex (replace * with .+)
    const regexPattern = patternPath
      .replace(/\*/g, '[^/]+') // Replace * with non-slash characters
      .replace(/\//g, '\\/'); // Escape forward slashes
    
    const regex = new RegExp(`^${regexPattern}$`);
    if (regex.test(path)) {
      return timeout;
    }
  }
  
  // Fall back to default HTTP request timeout
  return TIMEOUTS.HTTP_REQUEST;
}

/**
 * Retry configuration
 */
export const RETRY_CONFIG = {
  MAX_RETRIES: 2,
  BACKOFF_BASE: 1000, // 1 second
} as const;

/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = "debug",
  INFO = "info",
  WARN = "warn",
  ERROR = "error",
}

/**
 * Error code registry
 */
export const ERROR_CODES = {
  // Model errors
  MODEL_CALL_ERROR: "MODEL_CALL_ERROR",
  MODEL_TIMEOUT: "MODEL_TIMEOUT",
  MODEL_PROVIDER_NOT_FOUND: "MODEL_PROVIDER_NOT_FOUND",
  PROVIDER_TIMEOUT: "PROVIDER_TIMEOUT",
  
  // Index errors
  INDEX_ERROR: "INDEX_ERROR",
  INDEX_NOT_READY: "INDEX_NOT_READY",
  
  // Validation errors
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_ROLE: "INVALID_ROLE",
  INVALID_MODEL_CONFIG: "INVALID_MODEL_CONFIG",
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
  
  // Pipeline errors
  PIPELINE_ERROR: "PIPELINE_ERROR",
  PIPELINE_ABORTED: "PIPELINE_ABORTED",
  
  // Generic errors
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
  TIMEOUT_ERROR: "TIMEOUT_ERROR",
} as const;

/**
 * Default provider timeouts in milliseconds
 * Used when no provider-specific timeout is configured
 */
export const DEFAULT_PROVIDER_TIMEOUTS: Record<string, number> = {
  openai: 60000,
  anthropic: 90000,
  zai: 60000,
  gemini: 60000,
  "openai-openrouter": 90000,
  "anthropic-openrouter": 90000,
  "zai-openrouter": 90000,
  "gemini-openrouter": 90000,
} as const;

/**
 * Get the timeout for a specific provider
 * Returns the provider-specific timeout from config, or the default timeout
 * 
 * @param providerName - The provider name (e.g., "openai", "anthropic")
 * @param config - Optional architect config to check for provider-specific timeout
 * @returns Timeout in milliseconds
 */
export function getProviderTimeout(
  providerName: string,
  config?: { providers?: Record<string, { timeout?: number }> }
): number {
  // Check config for provider-specific timeout
  if (config?.providers?.[providerName]?.timeout) {
    return config.providers[providerName].timeout;
  }
  
  // Fall back to default provider timeout
  if (DEFAULT_PROVIDER_TIMEOUTS[providerName]) {
    return DEFAULT_PROVIDER_TIMEOUTS[providerName];
  }
  
  // Fall back to default model call timeout
  return TIMEOUTS.MODEL_CALL_DEFAULT;
}