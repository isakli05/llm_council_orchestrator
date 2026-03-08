import axios, { AxiosInstance, AxiosError } from "axios";
import { ChatMessage } from "@llm/shared-types";
import {
  ProviderAdapter,
  ModelCallOptions,
  ModelResponse,
  ThinkingConfig,
} from "../types";

/**
 * Google AI Studio API base URL
 */
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

/**
 * Gemini API content part format
 */
interface GeminiPart {
  text: string;
}

/**
 * Gemini API content format
 */
interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

/**
 * Gemini API generation config
 */
interface GeminiGenerationConfig {
  temperature?: number;
  maxOutputTokens?: number;
  thinkingConfig?: {
    thinkingBudget?: number;
  };
}

/**
 * Gemini API request body
 */
interface GeminiRequest {
  contents: GeminiContent[];
  systemInstruction?: {
    parts: GeminiPart[];
  };
  generationConfig?: GeminiGenerationConfig;
}

/**
 * Gemini API response format
 */
interface GeminiResponse {
  candidates?: Array<{
    content: {
      parts: GeminiPart[];
      role: string;
    };
    finishReason: string;
    safetyRatings?: Array<{
      category: string;
      probability: string;
      blocked?: boolean;
    }>;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
    thoughtsTokenCount?: number;
  };
  promptFeedback?: {
    blockReason?: string;
    safetyRatings?: Array<{
      category: string;
      probability: string;
      blocked?: boolean;
    }>;
  };
}

/**
 * Gemini API error response format
 */
interface GeminiErrorResponse {
  error?: {
    code: number;
    message: string;
    status: string;
    details?: Array<{
      "@type": string;
      reason?: string;
      domain?: string;
      metadata?: Record<string, string>;
    }>;
  };
}

/**
 * Gemini Provider Adapter
 * 
 * Implements the ProviderAdapter interface for Google's Gemini API.
 * Supports gemini-3-pro models with thinking configuration.
 * 
 * @implements {ProviderAdapter}
 */
export class GeminiAdapter implements ProviderAdapter {
  private readonly client: AxiosInstance;
  private readonly apiKey: string;

  /**
   * Create a new GeminiAdapter instance.
   * API key validation is deferred to call time to allow adapter registration
   * without requiring all API keys to be present at construction.
   */
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || "";
    this.client = axios.create({
      baseURL: GEMINI_BASE_URL,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  /**
   * Call the Gemini API with the given model, messages, and options.
   * 
   * @param modelId - The model identifier (e.g., "gemini-3-pro")
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
          message: "GEMINI_API_KEY environment variable is required for Gemini adapter",
          retryable: false,
        },
      };
    }

    try {
      // Build request body
      const requestBody = this.buildRequestBody(messages, options);

      // Make API call with API key as query parameter and abort signal support
      // Per Requirements 24.2: Abort request on timeout
      const response = await this.client.post<GeminiResponse>(
        `/models/${modelId}:generateContent`,
        requestBody,
        {
          params: {
            key: this.apiKey,
          },
          timeout: options?.timeoutMs,
          signal: options?.signal,
        }
      );

      const latencyMs = Date.now() - startTime;
      const data = response.data;

      // Check for blocked content
      if (data.promptFeedback?.blockReason) {
        return {
          modelId,
          content: "",
          success: false,
          metadata: {
            latencyMs,
          },
          error: {
            code: "CONTENT_FILTERED",
            message: `Content blocked by safety filters: ${data.promptFeedback.blockReason}`,
            retryable: false,
          },
        };
      }

      // Check for safety filter blocks in candidates
      const candidate = data.candidates?.[0];
      if (candidate?.safetyRatings?.some(r => r.blocked)) {
        return {
          modelId,
          content: "",
          success: false,
          metadata: {
            latencyMs,
          },
          error: {
            code: "CONTENT_FILTERED",
            message: "Response blocked by safety filters",
            retryable: false,
          },
        };
      }

      // Extract content from response - concatenate all text parts
      const content = this.extractContent(data);
      const finishReason = candidate?.finishReason;

      // Calculate tokens used
      const tokensUsed = data.usageMetadata?.totalTokenCount;
      const thinkingTokens = data.usageMetadata?.thoughtsTokenCount;

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
   * Gemini supports native thinking via generationConfig.thinkingConfig.
   * 
   * @returns true - Gemini supports native thinking mode
   */
  supportsThinking(): boolean {
    return true;
  }

  /**
   * Get the thinking configuration for a model call.
   * Returns the Gemini-specific thinkingConfig parameters.
   * 
   * @param options - The model call options containing thinking configuration
   * @returns ThinkingConfig with budget_tokens, or null if not enabled
   */
  getThinkingConfig(options: ModelCallOptions): ThinkingConfig | null {
    if (!options.thinking || options.thinking.type === "disabled") {
      return null;
    }

    // Gemini uses thinkingConfig with thinkingBudget
    // Map effort levels to budget tokens if budget_tokens not specified
    let budgetTokens = options.thinking.budget_tokens;
    
    if (!budgetTokens && options.thinking.effort) {
      // Map effort levels to reasonable token budgets
      const effortToBudget: Record<string, number> = {
        low: 1024,
        medium: 2048,
        high: 4096,
        xhigh: 8192,
      };
      budgetTokens = effortToBudget[options.thinking.effort] || 2048;
    }

    return {
      type: "enabled",
      budget_tokens: budgetTokens || 2048,
    };
  }

  /**
   * Build the Gemini API request body.
   * Converts ChatMessage format to Gemini's content format.
   * 
   * @param messages - Array of chat messages
   * @param options - Optional call configuration
   * @returns Gemini API request body
   */
  private buildRequestBody(
    messages: ChatMessage[],
    options?: ModelCallOptions
  ): GeminiRequest {
    const requestBody: GeminiRequest = {
      contents: [],
    };

    // Separate system message from conversation messages
    const systemMessage = messages.find(msg => msg.role === "system");
    const conversationMessages = messages.filter(msg => msg.role !== "system");

    // Add system instruction if present
    if (systemMessage) {
      requestBody.systemInstruction = {
        parts: [{ text: systemMessage.content }],
      };
    }

    // Convert conversation messages to Gemini format
    requestBody.contents = conversationMessages.map(msg => ({
      role: this.mapRole(msg.role),
      parts: [{ text: msg.content }],
    }));

    // Build generation config
    const generationConfig: GeminiGenerationConfig = {};

    // Add temperature if specified
    if (options?.temperature !== undefined) {
      generationConfig.temperature = options.temperature;
    }

    // Add max tokens if specified
    if (options?.maxTokens !== undefined) {
      generationConfig.maxOutputTokens = options.maxTokens;
    }

    // Add thinking config if enabled
    const thinkingConfig = this.getThinkingConfig(options || {});
    if (thinkingConfig && thinkingConfig.budget_tokens) {
      generationConfig.thinkingConfig = {
        thinkingBudget: thinkingConfig.budget_tokens,
      };
    }

    // Only add generationConfig if it has properties
    if (Object.keys(generationConfig).length > 0) {
      requestBody.generationConfig = generationConfig;
    }

    return requestBody;
  }

  /**
   * Map ChatMessage role to Gemini role.
   * Gemini uses "user" and "model" roles.
   * 
   * @param role - ChatMessage role
   * @returns Gemini role
   */
  private mapRole(role: "system" | "user" | "assistant"): "user" | "model" {
    switch (role) {
      case "assistant":
        return "model";
      case "user":
      default:
        return "user";
    }
  }

  /**
   * Extract content from Gemini response.
   * Concatenates all text parts from the response into a single string.
   * 
   * @param data - Gemini API response
   * @returns Concatenated content string
   */
  private extractContent(data: GeminiResponse): string {
    const candidate = data.candidates?.[0];
    if (!candidate?.content?.parts) {
      return "";
    }

    // Concatenate all text parts into single content string
    return candidate.content.parts
      .map(part => part.text)
      .filter(Boolean)
      .join("");
  }

  /**
   * Handle API errors and convert to ModelResponse format.
   * 
   * Implements error handling per Requirements 5.6 and 5.7:
   * - Safety filter blocks return CONTENT_FILTERED error
   * - Quota exceeded errors are marked as retryable=true
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
    const axiosError = error as AxiosError<GeminiErrorResponse>;
    const status = axiosError.response?.status;
    const errorData = axiosError.response?.data;

    // Determine error message
    let message = "Unknown error occurred";
    if (errorData?.error?.message) {
      message = errorData.error.message;
    } else if (axiosError.message) {
      message = axiosError.message;
    }

    // Determine error code based on HTTP status and error details
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
   * Per Requirements 5.6 and 5.7:
   * - Safety filter blocks → retryable=false, code=CONTENT_FILTERED
   * - Quota exceeded → retryable=true
   * - 429 (rate limit) → retryable=true
   * - 401/403 (auth errors) → retryable=false
   * - 5xx (server errors) → retryable=true
   * - Network errors (no status) → retryable=true
   * 
   * @param status - HTTP status code (undefined for network errors)
   * @param errorData - Error response data from Gemini API
   * @returns Object with error code, retryable flag, and classification reason
   */
  private classifyError(
    status: number | undefined,
    errorData: GeminiErrorResponse | undefined
  ): { code: string; retryable: boolean; reason: string } {
    // Network errors (no status) are typically retryable
    if (!status) {
      return {
        code: "NETWORK_ERROR",
        retryable: true,
        reason: "Network error - no HTTP status received",
      };
    }

    // Check for quota exceeded in error details
    const errorStatus = errorData?.error?.status;
    if (errorStatus === "RESOURCE_EXHAUSTED" || 
        errorData?.error?.message?.toLowerCase().includes("quota")) {
      return {
        code: "QUOTA_EXCEEDED",
        retryable: true,
        reason: "Quota exceeded - request can be retried after backoff",
      };
    }

    // 429 Rate Limit - retryable
    if (status === 429) {
      return {
        code: "RATE_LIMIT_ERROR",
        retryable: true,
        reason: "Rate limit exceeded - request can be retried after backoff",
      };
    }

    // 401 Unauthorized - not retryable
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

    // 400 Bad Request - check for safety filter
    if (status === 400) {
      if (errorData?.error?.message?.toLowerCase().includes("safety") ||
          errorData?.error?.message?.toLowerCase().includes("blocked")) {
        return {
          code: "CONTENT_FILTERED",
          retryable: false,
          reason: "Content blocked by safety filters",
        };
      }
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

    // Use error status from response if available
    if (errorStatus) {
      return {
        code: errorStatus,
        retryable: false,
        reason: `API error: ${errorStatus}`,
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
