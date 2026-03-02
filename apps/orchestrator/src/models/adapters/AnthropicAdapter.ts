import axios, { AxiosInstance, AxiosError } from "axios";
import { ChatMessage } from "@llm/shared-types";
import {
  ProviderAdapter,
  ModelCallOptions,
  ModelResponse,
  ThinkingConfig,
} from "../types";
import { IncomingMessage } from "http";

/**
 * Anthropic API base URL
 */
const ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";

/**
 * Anthropic API version header value
 */
const ANTHROPIC_API_VERSION = "2023-06-01";

/**
 * Anthropic API request message format
 */
interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Anthropic API request body
 */
interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  system?: string;
  max_tokens: number;
  temperature?: number;
  thinking?: {
    type: "enabled" | "disabled";
    budget_tokens?: number;
  };
}

/**
 * Anthropic API response format
 */
interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: "text" | "thinking";
    text?: string;
    thinking?: string;
  }>;
  model: string;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Anthropic SSE event types for streaming responses
 */
type AnthropicSSEEventType =
  | "message_start"
  | "content_block_start"
  | "content_block_delta"
  | "content_block_stop"
  | "message_delta"
  | "message_stop"
  | "ping"
  | "error";

/**
 * Anthropic SSE message_start event data
 */
interface AnthropicMessageStartEvent {
  type: "message_start";
  message: {
    id: string;
    type: string;
    role: string;
    content: Array<unknown>;
    model: string;
    stop_reason: string | null;
    usage: {
      input_tokens: number;
      output_tokens: number;
    };
  };
}

/**
 * Anthropic SSE content_block_start event data
 */
interface AnthropicContentBlockStartEvent {
  type: "content_block_start";
  index: number;
  content_block: {
    type: "text" | "thinking";
    text?: string;
    thinking?: string;
  };
}

/**
 * Anthropic SSE content_block_delta event data
 */
interface AnthropicContentBlockDeltaEvent {
  type: "content_block_delta";
  index: number;
  delta: {
    type: "text_delta" | "thinking_delta";
    text?: string;
    thinking?: string;
  };
}

/**
 * Anthropic SSE message_delta event data
 */
interface AnthropicMessageDeltaEvent {
  type: "message_delta";
  delta: {
    stop_reason: string;
  };
  usage: {
    output_tokens: number;
  };
}

/**
 * Anthropic SSE error event data
 */
interface AnthropicErrorEvent {
  type: "error";
  error: {
    type: string;
    message: string;
  };
}

/**
 * Union type for all Anthropic SSE events
 */
type AnthropicSSEEvent =
  | AnthropicMessageStartEvent
  | AnthropicContentBlockStartEvent
  | AnthropicContentBlockDeltaEvent
  | AnthropicMessageDeltaEvent
  | AnthropicErrorEvent
  | { type: "content_block_stop" | "message_stop" | "ping" };

/**
 * Aggregated streaming response state
 */
interface StreamingState {
  id: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  stopReason: string;
  contentBlocks: Map<number, { type: "text" | "thinking"; content: string }>;
}


/**
 * Anthropic API error response format
 */
interface AnthropicErrorResponse {
  type: string;
  error?: {
    type: string;
    message: string;
  };
}

/**
 * Anthropic Provider Adapter
 * 
 * Implements the ProviderAdapter interface for Anthropic's API.
 * Supports Claude Opus 4.5 and Sonnet 4.5 models with thinking budget tokens.
 * 
 * @implements {ProviderAdapter}
 */
export class AnthropicAdapter implements ProviderAdapter {
  private readonly client: AxiosInstance;
  private readonly apiKey: string;

  /**
   * Create a new AnthropicAdapter instance.
   * Validates that the ANTHROPIC_API_KEY environment variable is set.
   * 
   * @throws {Error} If ANTHROPIC_API_KEY environment variable is not set
   */
  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY environment variable is required for Anthropic adapter"
      );
    }

    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: ANTHROPIC_BASE_URL,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": ANTHROPIC_API_VERSION,
      },
    });
  }

  /**
   * Call the Anthropic API with the given model, messages, and options.
   * 
   * @param modelId - The model identifier (e.g., "claude-opus-4-5", "claude-sonnet-4-5")
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

    try {
      // Build request body
      const requestBody = this.buildRequestBody(modelId, messages, options);

      // Make API call with abort signal support for provider-level timeouts
      // Per Requirements 24.2: Abort request on timeout
      const response = await this.client.post<AnthropicResponse>(
        "/messages",
        requestBody,
        {
          timeout: options?.timeoutMs,
          signal: options?.signal,
        }
      );

      const latencyMs = Date.now() - startTime;
      const data = response.data;

      // Extract content from response - handle both text and thinking content
      const textContent = data.content
        .filter((block) => block.type === "text")
        .map((block) => block.text || "")
        .join("");

      const thinkingContent = data.content
        .filter((block) => block.type === "thinking")
        .map((block) => block.thinking || "")
        .join("");

      // Calculate tokens used
      const tokensUsed = data.usage.input_tokens + data.usage.output_tokens;

      return {
        modelId,
        content: textContent,
        success: true,
        metadata: {
          tokensUsed,
          thinkingTokens: thinkingContent.length > 0 ? data.usage.output_tokens : undefined,
          latencyMs,
          finishReason: data.stop_reason,
        },
      };
    } catch (error) {
      return this.handleError(modelId, error, Date.now() - startTime);
    }
  }

  /**
   * Call the Anthropic API with streaming enabled.
   * Parses SSE (Server-Sent Events) chunks and aggregates them into a final response.
   * 
   * @param modelId - The model identifier (e.g., "claude-opus-4-5", "claude-sonnet-4-5")
   * @param messages - Array of chat messages to send to the model
   * @param options - Optional call configuration including thinking mode
   * @returns Promise resolving to the model response
   */
  async callWithStreaming(
    modelId: string,
    messages: ChatMessage[],
    options?: ModelCallOptions
  ): Promise<ModelResponse> {
    const startTime = Date.now();

    try {
      // Build request body with streaming enabled
      const requestBody = {
        ...this.buildRequestBody(modelId, messages, options),
        stream: true,
      };

      // Make streaming API call with abort signal support for provider-level timeouts
      // Per Requirements 24.2: Abort request on timeout
      const response = await this.client.post<IncomingMessage>(
        "/messages",
        requestBody,
        {
          timeout: options?.timeoutMs,
          signal: options?.signal,
          responseType: "stream",
        }
      );

      // Parse and aggregate SSE chunks
      const result = await this.parseSSEStream(response.data);
      const latencyMs = Date.now() - startTime;

      // Extract text and thinking content from aggregated blocks
      const textContent = Array.from(result.contentBlocks.values())
        .filter((block) => block.type === "text")
        .map((block) => block.content)
        .join("");

      const thinkingContent = Array.from(result.contentBlocks.values())
        .filter((block) => block.type === "thinking")
        .map((block) => block.content)
        .join("");

      // Calculate tokens used
      const tokensUsed = result.inputTokens + result.outputTokens;

      return {
        modelId,
        content: textContent,
        success: true,
        metadata: {
          tokensUsed,
          thinkingTokens: thinkingContent.length > 0 ? result.outputTokens : undefined,
          latencyMs,
          finishReason: result.stopReason,
          thinkingContent: thinkingContent.length > 0 ? thinkingContent : undefined,
        },
      };
    } catch (error) {
      return this.handleError(modelId, error, Date.now() - startTime);
    }
  }

  /**
   * Parse SSE (Server-Sent Events) stream from Anthropic API.
   * Aggregates chunks into a final response state.
   * 
   * @param stream - The readable stream from the HTTP response
   * @returns Promise resolving to the aggregated streaming state
   */
  private parseSSEStream(stream: IncomingMessage): Promise<StreamingState> {
    return new Promise((resolve, reject) => {
      const state: StreamingState = {
        id: "",
        model: "",
        inputTokens: 0,
        outputTokens: 0,
        stopReason: "",
        contentBlocks: new Map(),
      };

      let buffer = "";

      stream.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();

        // Process complete SSE events (separated by double newlines)
        const events = buffer.split("\n\n");
        buffer = events.pop() || ""; // Keep incomplete event in buffer

        for (const eventStr of events) {
          if (!eventStr.trim()) continue;

          try {
            const event = this.parseSSEEvent(eventStr);
            if (event) {
              this.processSSEEvent(event, state);
            }
          } catch (parseError) {
            // Log parse error but continue processing
            console.warn("Failed to parse SSE event:", parseError);
          }
        }
      });

      stream.on("end", () => {
        // Process any remaining data in buffer
        if (buffer.trim()) {
          try {
            const event = this.parseSSEEvent(buffer);
            if (event) {
              this.processSSEEvent(event, state);
            }
          } catch (parseError) {
            console.warn("Failed to parse final SSE event:", parseError);
          }
        }
        resolve(state);
      });

      stream.on("error", (error: Error) => {
        reject(error);
      });
    });
  }

  /**
   * Parse a single SSE event string into an event object.
   * 
   * @param eventStr - The raw SSE event string
   * @returns Parsed event object or null if invalid
   */
  private parseSSEEvent(eventStr: string): AnthropicSSEEvent | null {
    const lines = eventStr.split("\n");
    let eventType: AnthropicSSEEventType | null = null;
    let eventData = "";

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        eventType = line.slice(7).trim() as AnthropicSSEEventType;
      } else if (line.startsWith("data: ")) {
        eventData = line.slice(6);
      }
    }

    if (!eventType || !eventData) {
      return null;
    }

    try {
      const data = JSON.parse(eventData);
      return { type: eventType, ...data } as AnthropicSSEEvent;
    } catch {
      return null;
    }
  }

  /**
   * Process a single SSE event and update the streaming state.
   * 
   * @param event - The parsed SSE event
   * @param state - The streaming state to update
   */
  private processSSEEvent(event: AnthropicSSEEvent, state: StreamingState): void {
    switch (event.type) {
      case "message_start": {
        const msgEvent = event as AnthropicMessageStartEvent;
        state.id = msgEvent.message.id;
        state.model = msgEvent.message.model;
        state.inputTokens = msgEvent.message.usage.input_tokens;
        state.outputTokens = msgEvent.message.usage.output_tokens;
        break;
      }

      case "content_block_start": {
        const blockEvent = event as AnthropicContentBlockStartEvent;
        const blockType = blockEvent.content_block.type;
        const initialContent =
          blockType === "text"
            ? blockEvent.content_block.text || ""
            : blockEvent.content_block.thinking || "";
        state.contentBlocks.set(blockEvent.index, {
          type: blockType,
          content: initialContent,
        });
        break;
      }

      case "content_block_delta": {
        const deltaEvent = event as AnthropicContentBlockDeltaEvent;
        const block = state.contentBlocks.get(deltaEvent.index);
        if (block) {
          const deltaContent =
            deltaEvent.delta.type === "text_delta"
              ? deltaEvent.delta.text || ""
              : deltaEvent.delta.thinking || "";
          block.content += deltaContent;
        }
        break;
      }

      case "message_delta": {
        const msgDeltaEvent = event as AnthropicMessageDeltaEvent;
        state.stopReason = msgDeltaEvent.delta.stop_reason;
        state.outputTokens = msgDeltaEvent.usage.output_tokens;
        break;
      }

      case "error": {
        const errorEvent = event as AnthropicErrorEvent;
        throw new Error(`Anthropic streaming error: ${errorEvent.error.message}`);
      }

      case "content_block_stop":
      case "message_stop":
      case "ping":
        // These events don't require state updates
        break;
    }
  }

  /**
   * Check if this provider supports native thinking/reasoning mode.
   * Anthropic supports native thinking via the thinking.budget_tokens parameter.
   * 
   * @returns true - Anthropic supports native thinking mode
   */
  supportsThinking(): boolean {
    return true;
  }

  /**
   * Get the thinking configuration for a model call.
   * Returns the Anthropic-specific thinking.budget_tokens parameter.
   * 
   * @param options - The model call options containing thinking configuration
   * @returns ThinkingConfig with budget_tokens, or null if not enabled
   */
  getThinkingConfig(options: ModelCallOptions): ThinkingConfig | null {
    if (!options.thinking || options.thinking.type === "disabled") {
      return null;
    }

    // Anthropic uses thinking.budget_tokens parameter
    // Default to 2048 if not specified
    return {
      type: "enabled",
      budget_tokens: options.thinking.budget_tokens || 2048,
    };
  }


  /**
   * Build the Anthropic API request body.
   * 
   * @param modelId - The model identifier
   * @param messages - Array of chat messages
   * @param options - Optional call configuration
   * @returns Anthropic API request body
   */
  private buildRequestBody(
    modelId: string,
    messages: ChatMessage[],
    options?: ModelCallOptions
  ): AnthropicRequest {
    // Extract system message if present (Anthropic uses separate system field)
    const systemMessage = messages.find((msg) => msg.role === "system");
    const nonSystemMessages = messages.filter((msg) => msg.role !== "system");

    const requestBody: AnthropicRequest = {
      model: modelId,
      messages: nonSystemMessages.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
      max_tokens: options?.maxTokens || 4096,
    };

    // Add system message if present
    if (systemMessage) {
      requestBody.system = systemMessage.content;
    }

    // Add temperature if specified
    if (options?.temperature !== undefined) {
      requestBody.temperature = options.temperature;
    }

    // Add thinking configuration if enabled
    const thinkingConfig = this.getThinkingConfig(options || {});
    if (thinkingConfig) {
      requestBody.thinking = {
        type: "enabled",
        budget_tokens: thinkingConfig.budget_tokens,
      };
    }

    return requestBody;
  }

  /**
   * Handle API errors and convert to ModelResponse format.
   * 
   * Implements error handling similar to OpenAI adapter:
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
    const axiosError = error as AxiosError<AnthropicErrorResponse>;
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
   * - 429 (rate limit) → retryable=true, code=RATE_LIMIT_ERROR
   * - 401 (unauthorized) → retryable=false, code=AUTHENTICATION_ERROR
   * - 5xx (server errors) → retryable=true
   * - Network errors (no status) → retryable=true
   * - Other errors → retryable=false
   * 
   * @param status - HTTP status code (undefined for network errors)
   * @param errorData - Error response data from Anthropic API
   * @returns Object with error code, retryable flag, and classification reason
   */
  private classifyError(
    status: number | undefined,
    errorData: AnthropicErrorResponse | undefined
  ): { code: string; retryable: boolean; reason: string } {
    // Network errors (no status) are typically retryable
    if (!status) {
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
    if (status === 404) {
      return {
        code: "MODEL_NOT_FOUND",
        retryable: false,
        reason: "Model not found - request cannot be retried",
      };
    }

    // 529 Overloaded - retryable (Anthropic-specific)
    if (status === 529) {
      return {
        code: "OVERLOADED_ERROR",
        retryable: true,
        reason: "API overloaded - request can be retried after backoff",
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

    // Use error type from response if available
    const apiErrorType = errorData?.error?.type;
    if (apiErrorType) {
      return {
        code: apiErrorType.toUpperCase().replace(/_/g, "_"),
        retryable: false,
        reason: `API error: ${apiErrorType}`,
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
