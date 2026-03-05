import { 
  TIMEOUTS, 
  RETRY_CONFIG, 
  ERROR_CODES,
  validateApiKeysOnStartup,
  ArchitectConfig,
  ApiKeyValidationResult,
  getProviderTimeout,
} from "@llm/shared-config";
import { withTimeout, retryWithBackoff, sleep } from "@llm/shared-utils";
import {
  ChatMessage,
  ModelCallOptions,
  ModelResponse,
  ProviderType,
  ProviderAdapter,
  ThinkingConfig,
  ProviderConfig,
} from "./types";

// Re-export ProviderConfig for convenience
export { ProviderConfig };

/**
 * HTTP status codes that indicate retryable errors
 */
export const RETRYABLE_HTTP_STATUS_CODES = [
  429, // Too Many Requests (rate limit)
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
] as const;

/**
 * HTTP status codes that indicate non-retryable errors
 */
export const NON_RETRYABLE_HTTP_STATUS_CODES = [
  400, // Bad Request
  401, // Unauthorized
  403, // Forbidden
  404, // Not Found
  422, // Unprocessable Entity
] as const;

/**
 * Error message patterns that indicate retryable errors
 */
export const RETRYABLE_ERROR_PATTERNS = [
  "timeout",
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "ENOTFOUND",
  "rate limit",
  "rate_limit",
  "too many requests",
  "service unavailable",
  "temporarily unavailable",
  "overloaded",
  "capacity",
  "try again",
  "retry",
] as const;

/**
 * Error message patterns that indicate non-retryable errors
 */
export const NON_RETRYABLE_ERROR_PATTERNS = [
  "unauthorized",
  "authentication",
  "invalid api key",
  "invalid_api_key",
  "forbidden",
  "not found",
  "invalid model",
  "model not found",
  "invalid request",
  "malformed",
  "quota exceeded",
  "billing",
] as const;

/**
 * Result of retryable error detection
 */
export interface RetryableErrorResult {
  retryable: boolean;
  reason: string;
  httpStatus?: number;
}

/**
 * Extended error with HTTP status and retry information
 */
export interface ExtendedError extends Error {
  status?: number;
  statusCode?: number;
  code?: string;
  response?: {
    status?: number;
    statusCode?: number;
    data?: unknown;
  };
}

/**
 * Default prompt-based reasoning instructions for models that don't support native thinking.
 * This is prepended to the system message when thinking mode is enabled but the provider
 * doesn't support native thinking parameters.
 */
export const REASONING_PROMPT = `You are an expert analyst with deep reasoning capabilities. Before providing your final answer, think through the problem step by step:

1. First, carefully analyze the question or task at hand
2. Consider multiple perspectives and potential approaches
3. Evaluate the pros and cons of each approach
4. Draw logical conclusions based on your analysis
5. Provide a well-reasoned, comprehensive response

Take your time to think through this thoroughly before responding.

---

`;

/**
 * Provider availability status
 */
export interface ProviderStatus {
  type: ProviderType;
  available: boolean;
  reason?: string;
}

/**
 * ModelGateway provides a unified interface for calling different LLM providers.
 * It handles provider selection, timeout, retry, and basic rate limiting.
 * 
 * The gateway uses a provider registry pattern where adapters are registered
 * for each provider type. When a model call is made, the gateway routes to
 * the appropriate adapter based on the model ID prefix.
 */
export class ModelGateway {
  private readonly defaultTimeout = TIMEOUTS.MODEL_CALL_DEFAULT;
  private readonly maxRetries = RETRY_CONFIG.MAX_RETRIES;
  private providers: Map<ProviderType, ProviderAdapter>;
  private providerAvailability: Map<ProviderType, ProviderStatus>;
  private config?: ArchitectConfig;

  constructor(config?: ArchitectConfig) {
    this.providers = new Map();
    this.providerAvailability = new Map();
    this.config = config;
  }

  /**
   * Set the architect configuration for provider-specific settings.
   * This allows updating the config after construction.
   * 
   * @param config - The architect configuration
   */
  setConfig(config: ArchitectConfig): void {
    this.config = config;
  }

  /**
   * Get the timeout for a specific provider.
   * Uses provider-specific timeout from config if available, otherwise falls back to default.
   * 
   * Per Requirements 24.2: Set timeout per model provider
   * 
   * @param providerString - The provider string (e.g., "openai", "anthropic")
   * @returns Timeout in milliseconds
   */
  getProviderTimeoutMs(providerString: string): number {
    return getProviderTimeout(providerString, this.config);
  }

  /**
   * Register a provider adapter for a specific provider type.
   * This method adds the adapter to the registry and marks the provider as available.
   * 
   * @param type - The provider type to register
   * @param adapter - The provider adapter implementation
   */
  registerProvider(type: ProviderType, adapter: ProviderAdapter): void {
    this.providers.set(type, adapter);
    this.providerAvailability.set(type, {
      type,
      available: true,
    });
  }

  /**
   * Unregister a provider adapter.
   * 
   * @param type - The provider type to unregister
   */
  unregisterProvider(type: ProviderType): void {
    this.providers.delete(type);
    this.providerAvailability.delete(type);
  }

  /**
   * Check if a provider is available (registered and ready).
   * 
   * @param type - The provider type to check
   * @returns true if the provider is registered and available
   */
  isProviderAvailable(type: ProviderType): boolean {
    const status = this.providerAvailability.get(type);
    return status?.available ?? false;
  }

  /**
   * Get the availability status of a provider.
   * 
   * @param type - The provider type to check
   * @returns The provider status or undefined if not registered
   */
  getProviderStatus(type: ProviderType): ProviderStatus | undefined {
    return this.providerAvailability.get(type);
  }

  /**
   * Get all registered provider types.
   * 
   * @returns Array of registered provider types
   */
  getRegisteredProviders(): ProviderType[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Mark a provider as unavailable (e.g., due to missing API key).
   * 
   * @param type - The provider type to mark as unavailable
   * @param reason - The reason for unavailability
   */
  markProviderUnavailable(type: ProviderType, reason: string): void {
    this.providerAvailability.set(type, {
      type,
      available: false,
      reason,
    });
  }

  /**
   * Validate API keys for all configured providers and mark unavailable providers.
   * 
   * Per Requirements 15.3:
   * - Check API keys for active providers on startup
   * - Log warning if key is missing
   * - Mark provider as unavailable if key missing
   * 
   * @param config - The loaded architect configuration
   * @param logWarnings - Whether to log warnings for missing API keys (default: true)
   * @returns API key validation result with provider availability status
   */
  validateAndMarkUnavailableProviders(
    config: ArchitectConfig,
    logWarnings: boolean = true
  ): ApiKeyValidationResult {
    const validationResult = validateApiKeysOnStartup(config, logWarnings);
    
    // Mark unavailable providers in the gateway
    for (const providerStatus of validationResult.providers) {
      if (!providerStatus.available) {
        try {
          // Convert provider string to ProviderType
          const providerType = this.parseProviderString(providerStatus.provider);
          this.markProviderUnavailable(
            providerType,
            providerStatus.reason || `API key missing: ${providerStatus.envVar}`
          );
        } catch (err) {
          // Provider string couldn't be parsed - log and continue
          if (logWarnings) {
            console.warn(
              `[ModelGateway] Could not mark provider "${providerStatus.provider}" as unavailable: ${(err as Error).message}`
            );
          }
        }
      }
    }
    
    return validationResult;
  }

  /**
   * Get all provider availability statuses.
   * 
   * @returns Map of provider types to their availability status
   */
  getAllProviderStatuses(): Map<ProviderType, ProviderStatus> {
    return new Map(this.providerAvailability);
  }

  /**
   * Get list of unavailable providers with their reasons.
   * 
   * @returns Array of unavailable provider statuses
   */
  getUnavailableProviders(): ProviderStatus[] {
    return Array.from(this.providerAvailability.values())
      .filter(status => !status.available);
  }

  /**
   * Parse a provider string from config and return the corresponding ProviderType.
   * Handles both official providers (e.g., "openai") and OpenRouter variants (e.g., "openai-openrouter").
   * 
   * Per Requirements 6.4, 6.5:
   * - Parse provider field from config (e.g., "openai-openrouter")
   * - Route to appropriate adapter based on suffix
   * - Respect manual provider selection (no auto-fallback)
   * 
   * @param providerString - The provider string from config (e.g., "openai", "openai-openrouter")
   * @returns The corresponding ProviderType enum value
   * @throws Error if the provider string is not recognized
   */
  parseProviderString(providerString: string): ProviderType {
    // Normalize the provider string to lowercase for comparison
    const normalized = providerString.toLowerCase().trim();

    // Check for OpenRouter variants first (suffix "-openrouter")
    if (normalized.endsWith("-openrouter")) {
      // Extract the base provider name (e.g., "openai" from "openai-openrouter")
      const baseProvider = normalized.replace("-openrouter", "");
      
      switch (baseProvider) {
        case "openai":
          return ProviderType.OPENAI_OPENROUTER;
        case "anthropic":
          return ProviderType.ANTHROPIC_OPENROUTER;
        case "zai":
        case "glm":
          return ProviderType.GLM_OPENROUTER;
        case "gemini":
        case "google":
          return ProviderType.GEMINI_OPENROUTER;
        default:
          throw new Error(`Unknown OpenRouter provider variant: ${providerString}`);
      }
    }

    // Handle official providers
    switch (normalized) {
      case "openai":
        return ProviderType.OPENAI;
      case "anthropic":
        return ProviderType.ANTHROPIC;
      case "zai":
      case "glm":
        return ProviderType.GLM;
      case "gemini":
      case "google":
        return ProviderType.GEMINI;
      case "grok":
        return ProviderType.GROK;
      default:
        throw new Error(`Unknown provider: ${providerString}`);
    }
  }

  /**
   * Check if a provider string represents an OpenRouter variant.
   * 
   * @param providerString - The provider string to check
   * @returns true if the provider is an OpenRouter variant
   */
  isOpenRouterProvider(providerString: string): boolean {
    return providerString.toLowerCase().trim().endsWith("-openrouter");
  }

  /**
   * Get the base provider name from a provider string.
   * For OpenRouter variants, returns the base provider (e.g., "openai" from "openai-openrouter").
   * For official providers, returns the provider as-is.
   * 
   * @param providerString - The provider string
   * @returns The base provider name
   */
  getBaseProviderName(providerString: string): string {
    const normalized = providerString.toLowerCase().trim();
    if (normalized.endsWith("-openrouter")) {
      return normalized.replace("-openrouter", "");
    }
    return normalized;
  }

  /**
   * Call a single model.
   * Routes to the appropriate provider adapter based on model ID or explicit provider config.
   * Handles thinking mode by either injecting native parameters or applying prompt-based fallback.
   * 
   * Per Requirements 6.4, 6.5:
   * - When providerConfig is provided, uses the explicit provider (no auto-fallback)
   * - When providerConfig is not provided, determines provider from model ID
   * 
   * Per Requirements 24.2:
   * - Set timeout per model provider
   * - Abort request on timeout
   * - Return partial result if available
   * 
   * @param modelId - The model identifier (e.g., "gpt-5.2", "claude-opus-4-5")
   * @param messages - Array of chat messages
   * @param options - Optional call configuration
   * @param providerConfig - Optional explicit provider configuration from architect.config.json
   * @returns Promise resolving to the model response
   */
  async callModel(
    modelId: string,
    messages: ChatMessage[],
    options?: ModelCallOptions,
    providerConfig?: ProviderConfig
  ): Promise<ModelResponse> {
    const startTime = Date.now();
    
    // Determine provider string for timeout lookup
    const providerString = providerConfig?.provider || this.getProviderStringForModel(modelId);
    
    // Per Requirements 24.2: Set timeout per model provider
    // Priority: options.timeoutMs > provider-specific timeout > default timeout
    const providerTimeout = this.getProviderTimeoutMs(providerString);
    const timeout = options?.timeoutMs || providerTimeout;

    // Track partial result for timeout scenarios
    let partialResult: ModelResponse | null = null;

    try {
      // Determine provider: use explicit config if provided, otherwise infer from model ID
      // Per Requirements 6.4, 6.5: Respect manual provider selection (no auto-fallback)
      let provider: ProviderType;
      
      if (providerConfig?.provider) {
        // Explicit provider specified in config - parse and use it directly
        try {
          provider = this.parseProviderString(providerConfig.provider);
        } catch (parseError) {
          return {
            modelId,
            content: "",
            success: false,
            metadata: {
              latencyMs: Date.now() - startTime,
            },
            error: {
              code: ERROR_CODES.MODEL_PROVIDER_NOT_FOUND,
              message: `Invalid provider in config: ${providerConfig.provider}`,
              retryable: false,
            },
          };
        }
      } else {
        // No explicit provider - infer from model ID
        provider = this.getProviderForModel(modelId);
      }

      // Check provider availability
      const status = this.providerAvailability.get(provider);
      if (status && !status.available) {
        // Per Requirements 6.4: No auto-fallback when provider is explicitly specified
        return {
          modelId,
          content: "",
          success: false,
          metadata: {
            latencyMs: Date.now() - startTime,
          },
          error: {
            code: ERROR_CODES.MODEL_PROVIDER_NOT_FOUND,
            message: `Provider ${provider} is unavailable: ${status.reason || "unknown reason"}`,
            retryable: false,
          },
        };
      }

      // Get provider adapter
      const adapter = this.providers.get(provider);
      if (!adapter) {
        // Per Requirements 6.4: No auto-fallback - return error if adapter not found
        return {
          modelId,
          content: "",
          success: false,
          metadata: {
            latencyMs: Date.now() - startTime,
          },
          error: {
            code: ERROR_CODES.MODEL_PROVIDER_NOT_FOUND,
            message: `No adapter registered for provider: ${provider}`,
            retryable: false,
          },
        };
      }

      // Handle thinking mode
      const { processedMessages, processedOptions } = this.handleThinkingMode(
        adapter,
        messages,
        options
      );

      // Merge provider timeout into options for the adapter
      const optionsWithTimeout: ModelCallOptions = {
        ...processedOptions,
        timeoutMs: timeout,
      };

      // Per Requirements 24.2: Call with provider-specific timeout
      // Use AbortController for proper request cancellation
      const response = await this.callWithProviderTimeout(
        adapter,
        modelId,
        processedMessages,
        optionsWithTimeout,
        timeout,
        providerString,
        (partial) => { partialResult = partial; }
      );

      return response;
    } catch (err) {
      const error = err as Error;
      const latencyMs = Date.now() - startTime;

      // Determine if this is a timeout error
      const isTimeout = error.message.toLowerCase().includes("timeout") ||
                       error.message.toLowerCase().includes("aborted");
      const errorCode = isTimeout ? ERROR_CODES.PROVIDER_TIMEOUT : ERROR_CODES.MODEL_CALL_ERROR;

      // Per Requirements 24.2: Return partial result if available
      if (isTimeout && partialResult && (partialResult as any).content) {
        return {
          ...(partialResult as any),
          success: false,
          metadata: {
            ...(partialResult as any).metadata,
            latencyMs,
            partial: true,
          },
          error: {
            code: ERROR_CODES.PROVIDER_TIMEOUT,
            message: `Provider ${providerString} timed out after ${timeout}ms (partial result available)`,
            retryable: true,
            details: {
              providerTimeout: timeout,
              provider: providerString,
              hasPartialResult: true,
            },
          },
        };
      }

      return this.createErrorResponse(modelId, error, latencyMs, errorCode);
    }
  }

  /**
   * Call a provider adapter with timeout and abort support.
   * 
   * Per Requirements 24.2:
   * - Abort request on timeout
   * - Return partial result if available
   * 
   * @param adapter - The provider adapter to call
   * @param modelId - The model identifier
   * @param messages - Array of chat messages
   * @param options - Call options including timeout
   * @param timeoutMs - Timeout in milliseconds
   * @param providerString - Provider name for error messages
   * @param onPartialResult - Callback to capture partial results
   * @returns Promise resolving to the model response
   */
  private async callWithProviderTimeout(
    adapter: ProviderAdapter,
    modelId: string,
    messages: ChatMessage[],
    options: ModelCallOptions,
    timeoutMs: number,
    providerString: string,
    onPartialResult: (partial: ModelResponse) => void
  ): Promise<ModelResponse> {
    // Create abort controller for request cancellation
    const abortController = new AbortController();
    
    // Set up timeout to abort the request
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, timeoutMs);

    try {
      // Call the adapter with abort signal in options
      const optionsWithAbort = {
        ...options,
        signal: abortController.signal,
      };

      const response = await adapter.call(modelId, messages, optionsWithAbort);
      
      // Clear timeout on successful completion
      clearTimeout(timeoutId);
      
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      
      // Check if this was an abort/timeout
      const err = error as Error;
      if (err.name === "AbortError" || abortController.signal.aborted) {
        throw new Error(`Provider ${providerString} request aborted due to timeout after ${timeoutMs}ms`);
      }
      
      throw error;
    }
  }

  /**
   * Get the provider string for a model ID (for timeout lookup).
   * 
   * @param modelId - The model identifier
   * @returns Provider string (e.g., "openai", "anthropic")
   */
  private getProviderStringForModel(modelId: string): string {
    if (modelId.startsWith("gpt-")) {
      return "openai";
    }
    if (modelId.startsWith("claude-")) {
      return "anthropic";
    }
    if (modelId.startsWith("glm-")) {
      return "zai";
    }
    if (modelId.startsWith("gemini-")) {
      return "gemini";
    }
    if (modelId.startsWith("grok-")) {
      return "grok";
    }
    return "openai"; // Default
  }

  /**
   * Handle thinking mode for a model call.
   * If the provider supports native thinking, the options are passed through with thinking config.
   * If the provider doesn't support native thinking but thinking is enabled, 
   * a prompt-based reasoning fallback is applied by prepending instructions to the system message.
   * 
   * @param adapter - The provider adapter
   * @param messages - Original chat messages
   * @param options - Original call options
   * @returns Processed messages and options with thinking mode handled
   */
  private handleThinkingMode(
    adapter: ProviderAdapter,
    messages: ChatMessage[],
    options?: ModelCallOptions
  ): { processedMessages: ChatMessage[]; processedOptions: ModelCallOptions | undefined } {
    // If no thinking config or thinking is disabled, pass through unchanged
    if (!options?.thinking || options.thinking.type === "disabled") {
      return { processedMessages: messages, processedOptions: options };
    }

    // Check if provider supports native thinking
    if (adapter.supportsThinking()) {
      // Provider supports native thinking - pass through with thinking config
      // The adapter will handle injecting the appropriate parameters
      return { processedMessages: messages, processedOptions: options };
    }

    // Provider doesn't support native thinking - apply prompt-based fallback
    return this.applyPromptBasedReasoning(messages, options);
  }

  /**
   * Apply prompt-based reasoning fallback for providers that don't support native thinking.
   * This prepends reasoning instructions to the system message.
   * 
   * @param messages - Original chat messages
   * @param options - Original call options
   * @returns Messages with reasoning prompt prepended to system message
   */
  private applyPromptBasedReasoning(
    messages: ChatMessage[],
    options?: ModelCallOptions
  ): { processedMessages: ChatMessage[]; processedOptions: ModelCallOptions | undefined } {
    const processedMessages = [...messages];
    
    // Find the system message index
    const systemMessageIndex = processedMessages.findIndex(
      (msg) => msg.role === "system"
    );

    if (systemMessageIndex >= 0) {
      // Prepend reasoning prompt to existing system message
      processedMessages[systemMessageIndex] = {
        ...processedMessages[systemMessageIndex],
        content: REASONING_PROMPT + processedMessages[systemMessageIndex].content,
      };
    } else {
      // No system message exists - add one with reasoning prompt
      processedMessages.unshift({
        role: "system",
        content: REASONING_PROMPT.trim(),
      });
    }

    // Remove thinking config from options since we're using prompt-based fallback
    // This prevents the adapter from trying to use native thinking parameters
    const processedOptions = options
      ? { ...options, thinking: undefined }
      : undefined;

    return { processedMessages, processedOptions };
  }

  /**
   * Check if thinking mode is enabled in the options.
   * 
   * @param options - Model call options
   * @returns true if thinking mode is enabled
   */
  isThinkingEnabled(options?: ModelCallOptions): boolean {
    return options?.thinking?.type === "enabled" || 
           (options?.thinking !== undefined && options.thinking.type !== "disabled");
  }

  /**
   * Get the thinking configuration from options.
   * 
   * @param options - Model call options
   * @returns ThinkingConfig or null if not enabled
   */
  getThinkingConfig(options?: ModelCallOptions): ThinkingConfig | null {
    if (!this.isThinkingEnabled(options)) {
      return null;
    }
    return options?.thinking || null;
  }

  /**
   * Call multiple models in parallel.
   * 
   * @param modelIds - Array of model identifiers
   * @param messages - Array of chat messages
   * @param options - Optional call configuration
   * @param providerConfigs - Optional array of provider configurations (one per model)
   * @returns Promise resolving to array of model responses
   */
  async callModels(
    modelIds: string[],
    messages: ChatMessage[],
    options?: ModelCallOptions,
    providerConfigs?: ProviderConfig[]
  ): Promise<ModelResponse[]> {
    const calls = modelIds.map((modelId, index) =>
      this.callModel(modelId, messages, options, providerConfigs?.[index])
    );
    return Promise.all(calls);
  }

  /**
   * Call multiple models with their provider configurations in parallel.
   * This is a convenience method that takes an array of ProviderConfig objects
   * and calls each model with its corresponding provider configuration.
   * 
   * Per Requirements 6.4, 6.5:
   * - Uses explicit provider from each config (no auto-fallback)
   * - Routes to appropriate adapter based on provider field
   * 
   * @param configs - Array of provider configurations from architect.config.json
   * @param messages - Array of chat messages
   * @param options - Optional call configuration (merged with config-level options)
   * @returns Promise resolving to array of model responses
   */
  async callModelsWithConfigs(
    configs: ProviderConfig[],
    messages: ChatMessage[],
    options?: ModelCallOptions
  ): Promise<ModelResponse[]> {
    const calls = configs.map((config) => {
      // Merge config-level thinking/reasoning options with call options
      const mergedOptions: ModelCallOptions = {
        ...options,
        thinking: config.thinking || config.reasoning ? {
          type: config.thinking?.type || "enabled",
          budget_tokens: config.thinking?.budget_tokens,
          effort: config.reasoning?.effort,
        } : options?.thinking,
      };
      
      return this.callModel(config.model, messages, mergedOptions, config);
    });
    return Promise.all(calls);
  }

  /**
   * Call a model with retry logic using exponential backoff.
   * Retries are only attempted for errors marked as retryable.
   * After all retries are exhausted, returns the last error response with retryable=false.
   * 
   * Per Requirements 6.4, 6.5:
   * - When providerConfig is provided, uses the explicit provider (no auto-fallback)
   * - Retries use the same provider - no fallback to alternative providers
   * 
   * @param modelId - The model identifier
   * @param messages - Array of chat messages
   * @param options - Optional call configuration
   * @param providerConfig - Optional explicit provider configuration
   * @returns Promise resolving to the model response
   */
  async callWithRetry(
    modelId: string,
    messages: ChatMessage[],
    options?: ModelCallOptions,
    providerConfig?: ProviderConfig
  ): Promise<ModelResponse> {
    const startTime = Date.now();
    let lastResponse: ModelResponse | null = null;
    let attemptCount = 0;

    return retryWithBackoff(
      async () => {
        attemptCount++;
        const response = await this.callModel(modelId, messages, options, providerConfig);
        lastResponse = response;

        // If the response indicates a retryable error, throw to trigger retry
        if (!response.success && response.error?.retryable) {
          const error = new Error(response.error.message) as ExtendedError;
          (error as any).retryable = true;
          (error as any).response = response;
          (error as any).attemptNumber = attemptCount;
          throw error;
        }
        return response;
      },
      {
        maxRetries: this.maxRetries,
        backoffBase: RETRY_CONFIG.BACKOFF_BASE,
        isRetryable: (error) => {
          // Use our enhanced retryable detection
          const extError = error as ExtendedError;
          if ((extError as any).retryable === true) {
            return true;
          }
          return this.detectRetryableError(error).retryable;
        },
      }
    ).catch((error) => {
      const totalLatencyMs = Date.now() - startTime;

      // If all retries failed, return the last error response with updated metadata
      if (lastResponse && !lastResponse.success) {
        // Update the response to indicate all retries exhausted
        return {
          ...lastResponse,
          metadata: {
            ...lastResponse.metadata,
            latencyMs: totalLatencyMs,
          },
          error: {
            ...lastResponse.error!,
            retryable: false, // No longer retryable after all attempts exhausted
            details: {
              ...(lastResponse.error?.details as object || {}),
              retriesExhausted: true,
              totalAttempts: attemptCount,
            },
          },
        };
      }

      // Fallback error response if no previous response exists
      return this.createErrorResponse(
        modelId,
        error instanceof Error ? error : new Error(String(error)),
        totalLatencyMs,
        ERROR_CODES.MODEL_CALL_ERROR
      );
    });
  }

  /**
   * Determine provider type from model ID.
   * Maps model ID prefixes to their corresponding provider types.
   * 
   * @param modelId - The model identifier
   * @returns The provider type for the model
   */
  private getProviderForModel(modelId: string): ProviderType {
    // Check for OpenRouter variants first (model ID might include provider hint)
    if (modelId.includes("-openrouter")) {
      if (modelId.startsWith("gpt-")) {
        return ProviderType.OPENAI_OPENROUTER;
      }
      if (modelId.startsWith("claude-")) {
        return ProviderType.ANTHROPIC_OPENROUTER;
      }
      if (modelId.startsWith("glm-")) {
        return ProviderType.GLM_OPENROUTER;
      }
      if (modelId.startsWith("gemini-")) {
        return ProviderType.GEMINI_OPENROUTER;
      }
    }

    // Standard provider detection based on model prefix
    if (modelId.startsWith("gpt-")) {
      return ProviderType.OPENAI;
    }
    if (modelId.startsWith("claude-")) {
      return ProviderType.ANTHROPIC;
    }
    if (modelId.startsWith("glm-")) {
      return ProviderType.GLM;
    }
    if (modelId.startsWith("gemini-")) {
      return ProviderType.GEMINI;
    }
    if (modelId.startsWith("grok-")) {
      return ProviderType.GROK;
    }

    // Default to OpenAI for unknown models
    return ProviderType.OPENAI;
  }

  /**
   * Check if an error is retryable based on error message patterns and HTTP status codes.
   * This method provides a simple boolean result for backward compatibility.
   * 
   * @param error - The error to check
   * @returns true if the error is retryable
   */
  private isRetryableError(error: Error): boolean {
    return this.detectRetryableError(error).retryable;
  }

  /**
   * Detect if an error is retryable with detailed information.
   * Analyzes HTTP status codes, error codes, and message patterns to determine
   * if the error is transient and worth retrying.
   * 
   * @param error - The error to analyze
   * @returns RetryableErrorResult with retryable flag, reason, and optional HTTP status
   */
  detectRetryableError(error: Error | ExtendedError): RetryableErrorResult {
    const extError = error as ExtendedError;
    const message = error.message.toLowerCase();

    // Extract HTTP status code from various error formats
    const httpStatus = this.extractHttpStatus(extError);

    // Check HTTP status codes first (most reliable indicator)
    if (httpStatus !== undefined) {
      if (RETRYABLE_HTTP_STATUS_CODES.includes(httpStatus as typeof RETRYABLE_HTTP_STATUS_CODES[number])) {
        return {
          retryable: true,
          reason: `HTTP ${httpStatus} is a retryable status code`,
          httpStatus,
        };
      }
      if (NON_RETRYABLE_HTTP_STATUS_CODES.includes(httpStatus as typeof NON_RETRYABLE_HTTP_STATUS_CODES[number])) {
        return {
          retryable: false,
          reason: `HTTP ${httpStatus} is a non-retryable status code`,
          httpStatus,
        };
      }
    }

    // Check for non-retryable patterns first (they take precedence over retryable patterns)
    for (const pattern of NON_RETRYABLE_ERROR_PATTERNS) {
      if (message.includes(pattern)) {
        return {
          retryable: false,
          reason: `Error message contains non-retryable pattern: "${pattern}"`,
          httpStatus,
        };
      }
    }

    // Check for retryable patterns
    for (const pattern of RETRYABLE_ERROR_PATTERNS) {
      if (message.includes(pattern)) {
        return {
          retryable: true,
          reason: `Error message contains retryable pattern: "${pattern}"`,
          httpStatus,
        };
      }
    }

    // Check error code if available
    if (extError.code) {
      const code = extError.code.toLowerCase();
      if (code.includes("timeout") || code.includes("econnreset") || code.includes("etimedout")) {
        return {
          retryable: true,
          reason: `Error code "${extError.code}" indicates a transient network error`,
          httpStatus,
        };
      }
    }

    // Default: unknown errors are not retryable to avoid infinite retry loops
    return {
      retryable: false,
      reason: "Unknown error type - defaulting to non-retryable",
      httpStatus,
    };
  }

  /**
   * Extract HTTP status code from various error formats.
   * Different HTTP libraries and providers format errors differently,
   * so we check multiple possible locations for the status code.
   * 
   * @param error - The error to extract status from
   * @returns HTTP status code or undefined if not found
   */
  private extractHttpStatus(error: ExtendedError): number | undefined {
    // Direct status property (common in Axios errors)
    if (typeof error.status === "number") {
      return error.status;
    }

    // statusCode property (common in some Node.js HTTP errors)
    if (typeof error.statusCode === "number") {
      return error.statusCode;
    }

    // Nested in response object (Axios error format)
    if (error.response) {
      if (typeof error.response.status === "number") {
        return error.response.status;
      }
      if (typeof error.response.statusCode === "number") {
        return error.response.statusCode;
      }
    }

    // Try to extract from error message (e.g., "Request failed with status code 429")
    const statusMatch = error.message.match(/status\s*(?:code\s*)?(\d{3})/i);
    if (statusMatch) {
      return parseInt(statusMatch[1], 10);
    }

    // Check for status code directly in message (e.g., "429 Too Many Requests")
    const directStatusMatch = error.message.match(/\b(4\d{2}|5\d{2})\b/);
    if (directStatusMatch) {
      return parseInt(directStatusMatch[1], 10);
    }

    return undefined;
  }

  /**
   * Calculate exponential backoff delay for a given retry attempt.
   * Uses the formula: backoffBase * 2^attempt with optional jitter.
   * 
   * @param attempt - The current retry attempt (0-indexed)
   * @param backoffBase - Base delay in milliseconds (default from RETRY_CONFIG)
   * @param addJitter - Whether to add random jitter to prevent thundering herd
   * @returns Delay in milliseconds
   */
  calculateBackoffDelay(
    attempt: number,
    backoffBase: number = RETRY_CONFIG.BACKOFF_BASE,
    addJitter: boolean = true
  ): number {
    // Calculate base exponential delay: backoffBase * 2^attempt
    const exponentialDelay = backoffBase * Math.pow(2, attempt);

    // Cap the delay at 30 seconds to prevent excessive waits
    const cappedDelay = Math.min(exponentialDelay, 30000);

    if (addJitter) {
      // Add random jitter (0-25% of the delay) to prevent thundering herd
      const jitter = Math.random() * 0.25 * cappedDelay;
      return Math.floor(cappedDelay + jitter);
    }

    return cappedDelay;
  }

  /**
   * Create a standardized error response with proper error format.
   * This ensures consistent error responses across all model calls.
   * 
   * @param modelId - The model identifier
   * @param error - The error that occurred
   * @param latencyMs - Time elapsed since request start
   * @param errorCode - Optional specific error code (defaults to MODEL_CALL_ERROR)
   * @returns Standardized ModelResponse with error details
   */
  createErrorResponse(
    modelId: string,
    error: Error | ExtendedError,
    latencyMs: number,
    errorCode?: string
  ): ModelResponse {
    const retryableResult = this.detectRetryableError(error);

    return {
      modelId,
      content: "",
      success: false,
      metadata: {
        latencyMs,
      },
      error: {
        code: errorCode || ERROR_CODES.MODEL_CALL_ERROR,
        message: error.message,
        retryable: retryableResult.retryable,
        details: {
          reason: retryableResult.reason,
          httpStatus: retryableResult.httpStatus,
        },
      },
    };
  }
}
