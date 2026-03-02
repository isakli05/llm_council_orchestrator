import { ChatMessage, ProviderType, ModelMetadata } from "@llm/shared-types";
import { RetryableError } from "@llm/shared-types";

/**
 * Thinking mode configuration for models that support extended reasoning
 */
export interface ThinkingConfig {
  /** Type of thinking mode - enabled or disabled */
  type?: "enabled" | "disabled";
  /** Reasoning effort level (OpenAI-style) */
  effort?: "low" | "medium" | "high" | "xhigh";
  /** Budget tokens for thinking (Anthropic-style) */
  budget_tokens?: number;
}

/**
 * Options for model calls
 */
export interface ModelCallOptions {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  /** Thinking mode configuration for extended reasoning */
  thinking?: ThinkingConfig;
  /** AbortSignal for request cancellation (used for provider-level timeouts) */
  signal?: AbortSignal;
}

/**
 * Extended metadata for model responses including thinking tokens
 */
export interface ModelResponseMetadata extends ModelMetadata {
  /** Number of tokens used for thinking/reasoning */
  thinkingTokens?: number;
  /** The actual thinking/reasoning content from the model (Anthropic streaming) */
  thinkingContent?: string;
  /** Indicates if this is a partial result due to timeout (Requirements 24.2) */
  partial?: boolean;
}

/**
 * Response from a model call
 */
export interface ModelResponse {
  modelId: string;
  content: string;
  success: boolean;
  metadata?: ModelResponseMetadata;
  error?: RetryableError;
}

/**
 * Provider adapter interface for LLM providers.
 * Each provider (OpenAI, Anthropic, Z.AI, Gemini) implements this interface
 * to provide a unified way to call different LLM APIs.
 */
export interface ProviderAdapter {
  /**
   * Call the LLM provider with the given model, messages, and options.
   * @param modelId - The model identifier (e.g., "gpt-5.2", "claude-opus-4-5")
   * @param messages - Array of chat messages to send to the model
   * @param options - Optional call configuration including thinking mode
   * @returns Promise resolving to the model response
   */
  call(
    modelId: string,
    messages: ChatMessage[],
    options?: ModelCallOptions
  ): Promise<ModelResponse>;

  /**
   * Check if this provider supports native thinking/reasoning mode.
   * Providers like OpenAI (reasoning.effort) and Anthropic (thinking.budget_tokens)
   * support native thinking, while others may require prompt-based reasoning.
   * @returns true if the provider supports native thinking mode
   */
  supportsThinking(): boolean;

  /**
   * Get the thinking configuration for a model call.
   * Returns the provider-specific thinking parameters based on the options,
   * or null if thinking is not enabled or not supported.
   * @param options - The model call options containing thinking configuration
   * @returns ThinkingConfig with provider-specific parameters, or null
   */
  getThinkingConfig(options: ModelCallOptions): ThinkingConfig | null;
}

/**
 * Provider configuration from architect.config.json
 * Used to explicitly specify which provider to use for a model call
 * 
 * Per Requirements 6.4, 6.5:
 * - Parse provider field from config (e.g., "openai-openrouter")
 * - Route to appropriate adapter based on suffix
 * - Respect manual provider selection (no auto-fallback)
 */
export interface ProviderConfig {
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

// Re-export for convenience
export { ChatMessage, ProviderType };
