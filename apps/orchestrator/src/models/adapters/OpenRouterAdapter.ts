import axios, { AxiosInstance, AxiosError } from "axios";
import { ChatMessage } from "@llm/shared-types";
import {
  ProviderAdapter,
  ModelCallOptions,
  ModelResponse,
  ThinkingConfig,
} from "../types";

/**
 * OpenRouter API base URL
 * Per Requirements 6.1: Use OpenRouter endpoint for models with provider suffix "-openrouter"
 */
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * OpenRouter API request message format (OpenAI-compatible)
 */
interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * OpenRouter API request body
 */
interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  max_tokens?: number;
  // Provider-specific parameters
  reasoning?: {
    effort?: "low" | "medium" | "high" | "xhigh";
  };
  // Anthropic-style thinking
  thinking?: {
    type: "enabled" | "disabled";
    budget_tokens?: number;
  };
}

/**
 * OpenRouter API response format
 * 
 * Per Requirements 6.6: Handle OpenRouter response format differences
 * OpenRouter responses may include additional fields not present in direct provider APIs
 */
interface OpenRouterResponse {
  id: string;
  object: string;
  created: number;
  /** Model ID returned by OpenRouter (may differ from requested model) */
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
      /** Optional thinking/reasoning content (provider-specific) */
      reasoning_content?: string;
    };
    finish_reason: string;
    /** OpenRouter may include native response from provider */
    native_response_id?: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    /** Reasoning tokens (OpenAI-style) */
    reasoning_tokens?: number;
    /** Thinking tokens (Anthropic-style) */
    thinking_tokens?: number;
    /** Cache tokens (if caching is enabled) */
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  /** OpenRouter-specific metadata */
  openrouter?: {
    /** Generation ID for tracking */
    generation_id?: string;
    /** Provider that actually served the request */
    provider?: string;
    /** Model variant used */
    model_variant?: string;
  };
  /** System fingerprint for reproducibility */
  system_fingerprint?: string;
}

/**
 * OpenRouter API error response format
 * 
 * Per Requirements 6.7: Preserve original error codes from OpenRouter
 * OpenRouter may return provider-specific error codes that should be preserved
 */
interface OpenRouterErrorResponse {
  error?: {
    message: string;
    type: string;
    /** Error code - can be string or number depending on provider */
    code?: string | number;
    /** Provider-specific error code (preserved from upstream provider) */
    provider_error_code?: string | number;
    /** Additional metadata about the error */
    metadata?: {
      /** Provider that returned the error */
      provider?: string;
      /** Raw error from provider */
      raw?: unknown;
    };
  };
}

/**
 * Base OpenRouter Provider Adapter
 * 
 * Provides common functionality for all OpenRouter adapter variants.
 * Each provider-specific adapter extends this class to handle
 * provider-specific thinking configurations and model ID mappings.
 * 
 * Per Requirements 6.1, 6.2, 6.3:
 * - Uses OpenRouter endpoint when provider suffix is "-openrouter"
 * - Uses OPENROUTER_API_KEY from environment
 * - Includes HTTP-Referer and X-Title headers
 * 
 * @implements {ProviderAdapter}
 */
export abstract class OpenRouterAdapter implements ProviderAdapter {
  protected readonly client: AxiosInstance;
  protected readonly apiKey: string;

  /**
   * Create a new OpenRouterAdapter instance.
   * API key validation is deferred to call time to allow adapter registration
   * without requiring all API keys to be present at construction.
   * 
   * Per Requirements 6.2: Use OPENROUTER_API_KEY from environment
   */
  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY || "";
    
    // Per Requirements 6.3: Include HTTP-Referer and X-Title headers
    this.client = axios.create({
      baseURL: OPENROUTER_BASE_URL,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "HTTP-Referer": process.env.OPENROUTER_REFERER || "https://llm-council.local",
        "X-Title": process.env.OPENROUTER_TITLE || "LLM Council Orchestrator",
      },
    });
  }

  /**
   * Get the OpenRouter model ID for the given model.
   * Each provider adapter maps its model IDs to OpenRouter format.
   * 
   * Per Requirements 6.6: Map OpenRouter model IDs
   * 
   * @param modelId - The original model identifier
   * @returns OpenRouter-formatted model ID (e.g., "openai/gpt-5.2")
   */
  protected abstract getOpenRouterModelId(modelId: string): string;

  /**
   * Get the original model ID from an OpenRouter model ID.
   * Used to normalize responses back to the original model ID format.
   * 
   * Per Requirements 6.6: Map OpenRouter model IDs (reverse mapping)
   * 
   * @param openRouterModelId - The OpenRouter model ID (e.g., "openai/gpt-5.2")
   * @returns Original model identifier (e.g., "gpt-5.2")
   */
  protected getOriginalModelId(openRouterModelId: string): string {
    // Default implementation: strip provider prefix
    const parts = openRouterModelId.split("/");
    return parts.length > 1 ? parts.slice(1).join("/") : openRouterModelId;
  }

  /**
   * Check if this provider supports native thinking/reasoning mode.
   * @returns true if the provider supports native thinking mode
   */
  abstract supportsThinking(): boolean;

  /**
   * Get the thinking configuration for a model call.
   * @param options - The model call options containing thinking configuration
   * @returns ThinkingConfig with provider-specific parameters, or null
   */
  abstract getThinkingConfig(options: ModelCallOptions): ThinkingConfig | null;

  /**
   * Build provider-specific request parameters.
   * Override in subclasses to add provider-specific thinking parameters.
   * 
   * @param options - The model call options
   * @returns Additional request parameters
   */
  protected buildProviderSpecificParams(
    options?: ModelCallOptions
  ): Partial<OpenRouterRequest> {
    return {};
  }

  /**
   * Call the OpenRouter API with the given model, messages, and options.
   * 
   * Per Requirements 6.6: Normalize OpenRouter response format to ModelResponse
   * 
   * @param modelId - The model identifier (will be mapped to OpenRouter format)
   * @param messages - Array of chat messages to send to the model
   * @param options - Optional call configuration including thinking mode
   * @returns Promise resolving to the model response
   */
  async call(
    modelId: string,
    messages: ChatMessage[],
    options?: ModelCallOptions
  ): Promise<ModelResponse> {
    const startTime = Date.now();

    // Validate API key at call time
    if (!this.apiKey) {
      return {
        modelId,
        content: "",
        success: false,
        metadata: {
          latencyMs: Date.now() - startTime,
        },
        error: {
          code: "AUTHENTICATION_ERROR",
          message: "OPENROUTER_API_KEY environment variable is required for OpenRouter adapter",
          retryable: false,
        },
      };
    }

    try {
      // Build request body
      const requestBody = this.buildRequestBody(modelId, messages, options);

      // Make API call with abort signal support for provider-level timeouts
      // Per Requirements 24.2: Abort request on timeout
      const response = await this.client.post<OpenRouterResponse>(
        "/chat/completions",
        requestBody,
        {
          timeout: options?.timeoutMs,
          signal: options?.signal,
        }
      );

      const latencyMs = Date.now() - startTime;
      
      // Normalize the response to ModelResponse format
      return this.normalizeResponse(modelId, response.data, latencyMs);
    } catch (error) {
      return this.handleError(modelId, error, Date.now() - startTime);
    }
  }

  /**
   * Normalize OpenRouter API response to ModelResponse format.
   * 
   * Per Requirements 6.6: Handle OpenRouter response format differences
   * - Extracts content from choices array
   * - Handles thinking/reasoning content from various providers
   * - Normalizes token usage across different provider formats
   * - Maps OpenRouter model IDs back to original format
   * 
   * @param requestedModelId - The model ID that was requested
   * @param data - The raw OpenRouter API response
   * @param latencyMs - Time elapsed since request start
   * @returns Normalized ModelResponse
   */
  protected normalizeResponse(
    requestedModelId: string,
    data: OpenRouterResponse,
    latencyMs: number
  ): ModelResponse {
    // Extract content from response
    const choice = data.choices?.[0];
    const content = choice?.message?.content || "";
    const finishReason = choice?.finish_reason;
    
    // Extract thinking/reasoning content if present
    const thinkingContent = choice?.message?.reasoning_content;

    // Normalize token usage - handle both OpenAI and Anthropic style
    const tokensUsed = data.usage?.total_tokens;
    // OpenRouter may return reasoning_tokens (OpenAI) or thinking_tokens (Anthropic)
    const thinkingTokens = data.usage?.reasoning_tokens || data.usage?.thinking_tokens;

    // Build normalized response
    const response: ModelResponse = {
      // Use the requested model ID, not the one returned by OpenRouter
      // This ensures consistency with what the caller expects
      modelId: requestedModelId,
      content,
      success: true,
      metadata: {
        tokensUsed,
        latencyMs,
        finishReason,
      },
    };

    // Add thinking tokens if present
    if (thinkingTokens !== undefined) {
      response.metadata!.thinkingTokens = thinkingTokens;
    }

    // Add thinking content if present
    if (thinkingContent) {
      response.metadata!.thinkingContent = thinkingContent;
    }

    // Add OpenRouter-specific metadata for debugging/tracking
    if (data.openrouter) {
      (response.metadata as Record<string, unknown>).openrouter = {
        generationId: data.openrouter.generation_id,
        provider: data.openrouter.provider,
        modelVariant: data.openrouter.model_variant,
        // Include the actual model ID returned by OpenRouter for reference
        actualModelId: data.model,
      };
    } else if (data.model && data.model !== this.getOpenRouterModelId(requestedModelId)) {
      // If OpenRouter returned a different model than requested, note it
      (response.metadata as Record<string, unknown>).actualModelId = data.model;
    }

    // Include system fingerprint if present (useful for reproducibility)
    if (data.system_fingerprint) {
      (response.metadata as Record<string, unknown>).systemFingerprint = data.system_fingerprint;
    }

    return response;
  }

  /**
   * Build the OpenRouter API request body.
   * 
   * @param modelId - The model identifier
   * @param messages - Array of chat messages
   * @param options - Optional call configuration
   * @returns OpenRouter API request body
   */
  protected buildRequestBody(
    modelId: string,
    messages: ChatMessage[],
    options?: ModelCallOptions
  ): OpenRouterRequest {
    const requestBody: OpenRouterRequest = {
      model: this.getOpenRouterModelId(modelId),
      messages: messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
    };

    // Add temperature if specified
    if (options?.temperature !== undefined) {
      requestBody.temperature = options.temperature;
    }

    // Add max tokens if specified
    if (options?.maxTokens !== undefined) {
      requestBody.max_tokens = options.maxTokens;
    }

    // Add provider-specific parameters
    const providerParams = this.buildProviderSpecificParams(options);
    Object.assign(requestBody, providerParams);

    return requestBody;
  }

  /**
   * Handle API errors and convert to ModelResponse format.
   * 
   * Per Requirements 6.6, 6.7:
   * - Normalize OpenRouter response format to ModelResponse
   * - Preserve original error codes from both OpenRouter and upstream providers
   * 
   * @param modelId - The model identifier
   * @param error - The error that occurred
   * @param latencyMs - Time elapsed since request start
   * @returns ModelResponse with error details
   */
  protected handleError(
    modelId: string,
    error: unknown,
    latencyMs: number
  ): ModelResponse {
    const axiosError = error as AxiosError<OpenRouterErrorResponse>;
    const status = axiosError.response?.status;
    const errorData = axiosError.response?.data;

    // Determine error message
    let message = "Unknown error occurred";
    if (errorData?.error?.message) {
      message = errorData.error.message;
    } else if (axiosError.message) {
      message = axiosError.message;
    }

    // Determine error code based on HTTP status and response data
    // Per Requirements 6.7: Preserve original error codes
    const { code, retryable, reason, providerErrorCode } = this.classifyError(status, errorData);

    // Build error details with preserved original codes
    const errorDetails: Record<string, unknown> = {
      httpStatus: status,
      reason,
    };

    // Preserve provider-specific error code if present
    // Per Requirements 6.7: Preserve original error codes from upstream providers
    if (providerErrorCode) {
      errorDetails.providerErrorCode = providerErrorCode;
    }

    // Include error type from OpenRouter response
    if (errorData?.error?.type) {
      errorDetails.errorType = errorData.error.type;
    }

    // Include provider metadata if available
    if (errorData?.error?.metadata?.provider) {
      errorDetails.provider = errorData.error.metadata.provider;
    }

    return {
      modelId,
      content: "",
      success: false,
      metadata: {
        latencyMs,
      },
      error: {
        code,
        message,
        retryable,
        details: errorDetails,
      },
    };
  }

  /**
   * Classify an error based on HTTP status code and response data.
   * 
   * Per Requirements 6.7: Preserve original error codes from OpenRouter and upstream providers
   * 
   * @param status - HTTP status code (undefined for network errors)
   * @param errorData - Error response data from OpenRouter API
   * @returns Object with error code, retryable flag, classification reason, and optional provider error code
   */
  protected classifyError(
    status: number | undefined,
    errorData: OpenRouterErrorResponse | undefined
  ): { code: string; retryable: boolean; reason: string; providerErrorCode?: string | number } {
    // Extract provider error code if present (preserve original codes per Requirements 6.7)
    const providerErrorCode = errorData?.error?.provider_error_code || errorData?.error?.code;

    // Network errors (no status) are typically retryable
    if (!status) {
      return {
        code: "NETWORK_ERROR",
        retryable: true,
        reason: "Network error - no HTTP status received",
        providerErrorCode,
      };
    }

    // 429 Rate Limit - retryable
    if (status === 429) {
      return {
        code: "RATE_LIMIT_ERROR",
        retryable: true,
        reason: "Rate limit exceeded - request can be retried after backoff",
        providerErrorCode,
      };
    }

    // 401 Unauthorized - not retryable
    if (status === 401) {
      return {
        code: "AUTHENTICATION_ERROR",
        retryable: false,
        reason: "Invalid or missing API key - request cannot be retried",
        providerErrorCode,
      };
    }

    // 403 Forbidden - not retryable
    if (status === 403) {
      return {
        code: "AUTHORIZATION_ERROR",
        retryable: false,
        reason: "Access denied - request cannot be retried",
        providerErrorCode,
      };
    }

    // 400 Bad Request - not retryable
    if (status === 400) {
      return {
        code: "VALIDATION_ERROR",
        retryable: false,
        reason: "Invalid request parameters - request cannot be retried",
        providerErrorCode,
      };
    }

    // 404 Not Found - not retryable (invalid model name)
    if (status === 404) {
      return {
        code: "MODEL_NOT_FOUND",
        retryable: false,
        reason: "Model not found - request cannot be retried",
        providerErrorCode,
      };
    }

    // 502/503 Service errors - retryable (OpenRouter-specific)
    if (status === 502 || status === 503) {
      return {
        code: "SERVICE_UNAVAILABLE",
        retryable: true,
        reason: "Service temporarily unavailable - request can be retried",
        providerErrorCode,
      };
    }

    // 5xx Server errors - retryable
    if (status >= 500 && status < 600) {
      return {
        code: `SERVER_ERROR_${status}`,
        retryable: true,
        reason: "Server error - request can be retried",
        providerErrorCode,
      };
    }

    // Use error code from response if available
    // Per Requirements 6.7: Preserve original error codes
    if (providerErrorCode) {
      const codeStr = String(providerErrorCode).toUpperCase();
      return {
        code: codeStr,
        retryable: false,
        reason: `API error: ${codeStr}`,
        providerErrorCode,
      };
    }

    // Default: unknown error, not retryable
    return {
      code: `HTTP_${status}`,
      retryable: false,
      reason: `Unexpected HTTP status ${status}`,
    };
  }
}
