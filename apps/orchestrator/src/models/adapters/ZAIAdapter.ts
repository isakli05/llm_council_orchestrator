import axios, { AxiosInstance, AxiosError } from "axios";
import { ChatMessage } from "@llm/shared-types";
import {
  ProviderAdapter,
  ModelCallOptions,
  ModelResponse,
  ThinkingConfig,
} from "../types";

/**
 * Z.AI (GLM) API base URL
 * Per Requirements 4.2: Use base_url https://api.z.ai/api/coding/paas/v4
 */
const ZAI_BASE_URL = "https://api.z.ai/api/coding/paas/v4";

/**
 * Z.AI API request message format
 */
interface ZAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Z.AI API request body
 */
interface ZAIRequest {
  model: string;
  messages: ZAIMessage[];
  temperature?: number;
  max_tokens?: number;
  thinking?: {
    type: "enabled" | "disabled";
  };
}

/**
 * Z.AI API response format
 */
interface ZAIResponse {
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
  };
}

/**
 * Z.AI API error response format
 */
interface ZAIErrorResponse {
  error?: {
    message: string;
    type: string;
    code?: string;
  };
  // Z.AI may return Chinese error messages in different formats
  msg?: string;
  code?: string | number;
}


/**
 * Common Chinese error messages and their English translations
 */
const CHINESE_ERROR_TRANSLATIONS: Record<string, string> = {
  "请求参数错误": "Invalid request parameters",
  "认证失败": "Authentication failed",
  "API密钥无效": "Invalid API key",
  "请求频率超限": "Rate limit exceeded",
  "服务暂时不可用": "Service temporarily unavailable",
  "模型不存在": "Model not found",
  "余额不足": "Insufficient balance",
  "请求超时": "Request timeout",
  "内部服务器错误": "Internal server error",
  "参数格式错误": "Invalid parameter format",
  "消息内容为空": "Message content is empty",
  "模型繁忙": "Model is busy",
};

/**
 * Translate Chinese error message to English
 * Per Requirements 4.5: Translate Chinese error messages to English
 * 
 * @param message - The error message (potentially in Chinese)
 * @returns English translation if available, otherwise original message
 */
function translateErrorMessage(message: string): string {
  // Check for exact match
  if (CHINESE_ERROR_TRANSLATIONS[message]) {
    return CHINESE_ERROR_TRANSLATIONS[message];
  }

  // Check for partial match (Chinese message may contain additional context)
  for (const [chinese, english] of Object.entries(CHINESE_ERROR_TRANSLATIONS)) {
    if (message.includes(chinese)) {
      return message.replace(chinese, english);
    }
  }

  // Check if message contains Chinese characters
  const chineseRegex = /[\u4e00-\u9fa5]/;
  if (chineseRegex.test(message)) {
    return `Z.AI Error: ${message}`;
  }

  return message;
}

/**
 * Z.AI (GLM) Provider Adapter
 * 
 * Implements the ProviderAdapter interface for Z.AI's GLM API.
 * Supports glm-4.6 model with thinking mode.
 * 
 * Per Requirements 4.1, 4.2:
 * - Validates API key from ZAI_API_KEY environment variable
 * - Uses base_url https://api.z.ai/api/coding/paas/v4
 * 
 * @implements {ProviderAdapter}
 */
export class ZAIAdapter implements ProviderAdapter {
  private readonly client: AxiosInstance;
  private readonly apiKey: string;

  /**
   * Create a new ZAIAdapter instance.
   * API key validation is deferred to call time to allow adapter registration
   * without requiring all API keys to be present at construction.
   * 
   * Per Requirements 4.1: Validate API key from environment variable ZAI_API_KEY
   */
  constructor() {
    this.apiKey = process.env.ZAI_API_KEY || "";
    this.client = axios.create({
      baseURL: ZAI_BASE_URL,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
    });
  }

  /**
   * Call the Z.AI API with the given model, messages, and options.
   * 
   * @param modelId - The model identifier (e.g., "glm-4.6")
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
          message: "ZAI_API_KEY environment variable is required for Z.AI adapter",
          retryable: false,
        },
      };
    }

    try {
      // Build request body
      const requestBody = this.buildRequestBody(modelId, messages, options);

      // Make API call with abort signal support for provider-level timeouts
      // Per Requirements 24.2: Abort request on timeout
      const response = await this.client.post<ZAIResponse>(
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
      // Per Requirements 4.4: Normalize Z.AI response format to ModelResponse
      const content = data.choices?.[0]?.message?.content || "";
      const finishReason = data.choices?.[0]?.finish_reason;

      // Calculate tokens used
      const tokensUsed = data.usage?.total_tokens;

      return {
        modelId,
        content,
        success: true,
        metadata: {
          tokensUsed,
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
   * Z.AI supports native thinking via the thinking.type parameter.
   * 
   * @returns true - Z.AI supports native thinking mode
   */
  supportsThinking(): boolean {
    return true;
  }

  /**
   * Get the thinking configuration for a model call.
   * Returns the Z.AI-specific thinking.type parameter.
   * 
   * Per Requirements 4.3: Include thinking.type="enabled" parameter
   * 
   * @param options - The model call options containing thinking configuration
   * @returns ThinkingConfig with type, or null if not enabled
   */
  getThinkingConfig(options: ModelCallOptions): ThinkingConfig | null {
    if (!options.thinking || options.thinking.type === "disabled") {
      return null;
    }

    // Z.AI uses thinking.type parameter
    return {
      type: "enabled",
    };
  }

  /**
   * Build the Z.AI API request body.
   * 
   * @param modelId - The model identifier
   * @param messages - Array of chat messages
   * @param options - Optional call configuration
   * @returns Z.AI API request body
   */
  private buildRequestBody(
    modelId: string,
    messages: ChatMessage[],
    options?: ModelCallOptions
  ): ZAIRequest {
    const requestBody: ZAIRequest = {
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

    // Add thinking configuration if enabled
    // Per Requirements 4.3: Include thinking.type="enabled" parameter
    const thinkingConfig = this.getThinkingConfig(options || {});
    if (thinkingConfig) {
      requestBody.thinking = {
        type: "enabled",
      };
    }

    return requestBody;
  }

  /**
   * Handle API errors and convert to ModelResponse format.
   * 
   * Per Requirements 4.5, 4.6, 4.7:
   * - Translate Chinese error messages to English
   * - Connection failures are marked as retryable=true
   * - Invalid model names are marked as retryable=false
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
    const axiosError = error as AxiosError<ZAIErrorResponse>;
    const status = axiosError.response?.status;
    const errorData = axiosError.response?.data;

    // Determine error message and translate if Chinese
    // Per Requirements 4.5: Translate Chinese error messages to English
    let message = "Unknown error occurred";
    if (errorData?.error?.message) {
      message = translateErrorMessage(errorData.error.message);
    } else if (errorData?.msg) {
      message = translateErrorMessage(errorData.msg);
    } else if (axiosError.message) {
      message = axiosError.message;
    }

    // Determine error code based on HTTP status
    const { code, retryable, reason } = this.classifyError(status, errorData, axiosError);

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
   * Per Requirements 4.6, 4.7:
   * - Connection failures → retryable=true
   * - Invalid model names → retryable=false
   * - 429 (rate limit) → retryable=true
   * - 401 (unauthorized) → retryable=false
   * - 5xx (server errors) → retryable=true
   * - Network errors (no status) → retryable=true
   * 
   * @param status - HTTP status code (undefined for network errors)
   * @param errorData - Error response data from Z.AI API
   * @param axiosError - The original Axios error for network error detection
   * @returns Object with error code, retryable flag, and classification reason
   */
  private classifyError(
    status: number | undefined,
    errorData: ZAIErrorResponse | undefined,
    axiosError: AxiosError<ZAIErrorResponse>
  ): { code: string; retryable: boolean; reason: string } {
    // Network/connection errors (no status) are retryable
    // Per Requirements 4.6: Connection failures are retryable=true
    if (!status) {
      // Check for specific network error codes
      const errorCode = axiosError.code;
      if (errorCode === "ECONNREFUSED" || errorCode === "ENOTFOUND" || 
          errorCode === "ETIMEDOUT" || errorCode === "ECONNRESET") {
        return {
          code: "CONNECTION_ERROR",
          retryable: true,
          reason: "Connection failed - request can be retried",
        };
      }
      return {
        code: "NETWORK_ERROR",
        retryable: true,
        reason: "Network error - no HTTP status received",
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

    // 400 Bad Request - not retryable
    if (status === 400) {
      return {
        code: "VALIDATION_ERROR",
        retryable: false,
        reason: "Invalid request parameters - request cannot be retried",
      };
    }

    // 404 Not Found - not retryable (invalid model name)
    // Per Requirements 4.7: Invalid model names are retryable=false
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
    const apiErrorCode = errorData?.error?.code || errorData?.code;
    if (apiErrorCode) {
      const codeStr = String(apiErrorCode).toUpperCase();
      return {
        code: codeStr,
        retryable: false,
        reason: `API error: ${codeStr}`,
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
