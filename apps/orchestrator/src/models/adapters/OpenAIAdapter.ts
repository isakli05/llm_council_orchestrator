import axios, { AxiosInstance, AxiosError } from "axios";
import { ChatMessage } from "@llm/shared-types";
import {
  ProviderAdapter,
  ModelCallOptions,
  ModelResponse,
  ThinkingConfig,
} from "../types";

/**
 * OpenAI API base URL
 */
const OPENAI_BASE_URL = "https://api.openai.com/v1";

/**
 * OpenAI API request message format
 */
interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * OpenAI API request body
 */
interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
  reasoning?: {
    effort?: "low" | "medium" | "high" | "xhigh";
  };
}

/**
 * OpenAI API response format
 */
interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    reasoning_tokens?: number;
  };
}

/**
 * OpenAI API error response format
 */
interface OpenAIErrorResponse {
  error?: {
    message: string;
    type: string;
    code?: string;
  };
}

/**
 * OpenAI Provider Adapter
 * 
 * Implements the ProviderAdapter interface for OpenAI's API.
 * Supports gpt-5.2 models with reasoning effort configuration.
 * 
 * @implements {ProviderAdapter}
 */
export class OpenAIAdapter implements ProviderAdapter {
  private readonly client: AxiosInstance;
  private readonly apiKey: string;

  /**
   * Create a new OpenAIAdapter instance.
   * API key validation is deferred to call time to allow adapter registration
   * without requiring all API keys to be present at construction.
   */
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || "";
    this.client = axios.create({
      baseURL: OPENAI_BASE_URL,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
    });
  }

  /**
   * Call the OpenAI API with the given model, messages, and options.
   * 
   * @param modelId - The model identifier (e.g., "gpt-5.2", "gpt-5.2-pro")
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
          message: "OPENAI_API_KEY environment variable is required for OpenAI adapter",
          retryable: false,
        },
      };
    }

    try {
      // Build request body
      const requestBody = this.buildRequestBody(modelId, messages, options);

      // Make API call with abort signal support for provider-level timeouts
      // Per Requirements 24.2: Abort request on timeout
      const response = await this.client.post<OpenAIResponse>(
        "/chat/completions",
        requestBody,
        {
          timeout: options?.timeoutMs,
          signal: options?.signal,
        }
      );

      const latencyMs = Date.now() - startTime;
      const data = response.data;

      // Extract content from response
      const content = data.choices?.[0]?.message?.content || "";
      const finishReason = data.choices?.[0]?.finish_reason;

      // Calculate tokens used
      const tokensUsed = data.usage?.total_tokens;
      const thinkingTokens = data.usage?.reasoning_tokens;

      return {
        modelId,
        content,
        success: true,
        metadata: {
          tokensUsed,
          thinkingTokens,
          latencyMs,
          finishReason,
        },
      };
    } catch (error) {
      return this.handleError(modelId, error, Date.now() - startTime);
    }
  }

  /**
   * Check if this provider supports native thinking/reasoning mode.
   * OpenAI supports native thinking via the reasoning.effort parameter.
   * 
   * @returns true - OpenAI supports native thinking mode
   */
  supportsThinking(): boolean {
    return true;
  }

  /**
   * Get the thinking configuration for a model call.
   * Returns the OpenAI-specific reasoning.effort parameter.
   * 
   * @param options - The model call options containing thinking configuration
   * @returns ThinkingConfig with effort level, or null if not enabled
   */
  getThinkingConfig(options: ModelCallOptions): ThinkingConfig | null {
    if (!options.thinking || options.thinking.type === "disabled") {
      return null;
    }

    // OpenAI uses reasoning.effort parameter
    return {
      type: "enabled",
      effort: options.thinking.effort || "high",
    };
  }

  /**
   * Build the OpenAI API request body.
   * 
   * @param modelId - The model identifier
   * @param messages - Array of chat messages
   * @param options - Optional call configuration
   * @returns OpenAI API request body
   */
  private buildRequestBody(
    modelId: string,
    messages: ChatMessage[],
    options?: ModelCallOptions
  ): OpenAIRequest {
    const requestBody: OpenAIRequest = {
      model: modelId,
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

    // Add reasoning effort if thinking is enabled
    const thinkingConfig = this.getThinkingConfig(options || {});
    if (thinkingConfig && thinkingConfig.effort) {
      requestBody.reasoning = {
        effort: thinkingConfig.effort,
      };
    }

    return requestBody;
  }

  /**
   * Handle API errors and convert to ModelResponse format.
   * 
   * Implements error handling per Requirements 2.5 and 2.6:
   * - 429 rate limit errors are marked as retryable=true
   * - 401 unauthorized errors are marked as retryable=false
   * - All errors are normalized to ModelResponse format
   * 
   * @param modelId - The model identifier
   * @param error - The error that occurred
   * @param latencyMs - Time elapsed since request start
   * @returns ModelResponse with error details
   */
  private handleError(
    modelId: string,
    error: unknown,
    latencyMs: number
  ): ModelResponse {
    const axiosError = error as AxiosError<OpenAIErrorResponse>;
    const status = axiosError.response?.status;
    const errorData = axiosError.response?.data;

    // Determine error message
    let message = "Unknown error occurred";
    if (errorData?.error?.message) {
      message = errorData.error.message;
    } else if (axiosError.message) {
      message = axiosError.message;
    }

    // Determine error code based on HTTP status
    const { code, retryable, reason } = this.classifyError(status, errorData);

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
        details: {
          httpStatus: status,
          reason,
        },
      },
    };
  }

  /**
   * Classify an error based on HTTP status code and response data.
   * 
   * Per Requirements 2.5 and 2.6:
   * - 429 (rate limit) → retryable=true, code=RATE_LIMIT_ERROR
   * - 401 (unauthorized) → retryable=false, code=AUTHENTICATION_ERROR
   * - 5xx (server errors) → retryable=true
   * - Network errors (no status) → retryable=true
   * - Other errors → retryable=false
   * 
   * @param status - HTTP status code (undefined for network errors)
   * @param errorData - Error response data from OpenAI API
   * @returns Object with error code, retryable flag, and classification reason
   */
  private classifyError(
    status: number | undefined,
    errorData: OpenAIErrorResponse | undefined
  ): { code: string; retryable: boolean; reason: string } {
    // Network errors (no status) are typically retryable
    if (!status) {
      return {
        code: "NETWORK_ERROR",
        retryable: true,
        reason: "Network error - no HTTP status received",
      };
    }

    // 429 Rate Limit - retryable (Requirement 2.5)
    if (status === 429) {
      return {
        code: "RATE_LIMIT_ERROR",
        retryable: true,
        reason: "Rate limit exceeded - request can be retried after backoff",
      };
    }

    // 401 Unauthorized - not retryable (Requirement 2.6)
    if (status === 401) {
      return {
        code: "AUTHENTICATION_ERROR",
        retryable: false,
        reason: "Invalid or missing API key - request cannot be retried",
      };
    }

    // 403 Forbidden - not retryable
    if (status === 403) {
      return {
        code: "AUTHORIZATION_ERROR",
        retryable: false,
        reason: "Access denied - request cannot be retried",
      };
    }

    // 400 Bad Request - not retryable
    if (status === 400) {
      return {
        code: "VALIDATION_ERROR",
        retryable: false,
        reason: "Invalid request parameters - request cannot be retried",
      };
    }

    // 404 Not Found - not retryable (invalid model name)
    if (status === 404) {
      return {
        code: "MODEL_NOT_FOUND",
        retryable: false,
        reason: "Model not found - request cannot be retried",
      };
    }

    // 5xx Server errors - retryable
    if (status >= 500 && status < 600) {
      return {
        code: `SERVER_ERROR_${status}`,
        retryable: true,
        reason: "Server error - request can be retried",
      };
    }

    // Use error code from response if available
    const apiErrorCode = errorData?.error?.code;
    if (apiErrorCode) {
      return {
        code: apiErrorCode.toUpperCase(),
        retryable: false,
        reason: `API error: ${apiErrorCode}`,
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
