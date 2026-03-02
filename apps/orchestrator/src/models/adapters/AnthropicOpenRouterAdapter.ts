import { ModelCallOptions, ThinkingConfig } from "../types";
import { OpenRouterAdapter } from "./OpenRouterAdapter";

/**
 * OpenRouter request with Anthropic-specific thinking parameters
 */
interface AnthropicOpenRouterRequest {
  thinking?: {
    type: "enabled" | "disabled";
    budget_tokens?: number;
  };
}

/**
 * Anthropic via OpenRouter Provider Adapter
 * 
 * Implements the ProviderAdapter interface for Anthropic models via OpenRouter.
 * Supports Claude Opus 4.5 and Sonnet 4.5 models with thinking budget tokens.
 * 
 * Per Requirements 6.1, 6.2:
 * - When provider="anthropic-openrouter", uses OpenRouter endpoint
 * - Uses OPENROUTER_API_KEY from environment
 * 
 * @extends {OpenRouterAdapter}
 */
export class AnthropicOpenRouterAdapter extends OpenRouterAdapter {
  /**
   * Map of local model IDs to OpenRouter model IDs
   */
  private static readonly MODEL_MAPPING: Record<string, string> = {
    "claude-opus-4-5": "anthropic/claude-opus-4-5",
    "claude-sonnet-4-5": "anthropic/claude-sonnet-4-5",
    "claude-3-opus": "anthropic/claude-3-opus",
    "claude-3-sonnet": "anthropic/claude-3-sonnet",
    "claude-3-haiku": "anthropic/claude-3-haiku",
    "claude-3.5-sonnet": "anthropic/claude-3.5-sonnet",
    "claude-3.5-haiku": "anthropic/claude-3.5-haiku",
  };

  /**
   * Get the OpenRouter model ID for the given Anthropic model.
   * 
   * Per Requirements 6.6: Map OpenRouter model IDs
   * 
   * @param modelId - The original model identifier (e.g., "claude-opus-4-5")
   * @returns OpenRouter-formatted model ID (e.g., "anthropic/claude-opus-4-5")
   */
  protected getOpenRouterModelId(modelId: string): string {
    // Check if already in OpenRouter format
    if (modelId.startsWith("anthropic/")) {
      return modelId;
    }
    
    // Map to OpenRouter format
    return AnthropicOpenRouterAdapter.MODEL_MAPPING[modelId] || `anthropic/${modelId}`;
  }

  /**
   * Get the original model ID from an OpenRouter model ID.
   * 
   * Per Requirements 6.6: Map OpenRouter model IDs (reverse mapping)
   * 
   * @param openRouterModelId - The OpenRouter model ID (e.g., "anthropic/claude-opus-4-5")
   * @returns Original model identifier (e.g., "claude-opus-4-5")
   */
  protected getOriginalModelId(openRouterModelId: string): string {
    // Strip "anthropic/" prefix if present
    if (openRouterModelId.startsWith("anthropic/")) {
      return openRouterModelId.slice(10);
    }
    return openRouterModelId;
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
   * Build Anthropic-specific request parameters.
   * Adds thinking configuration for extended reasoning.
   * 
   * @param options - The model call options
   * @returns Additional request parameters with thinking config
   */
  protected buildProviderSpecificParams(
    options?: ModelCallOptions
  ): Partial<AnthropicOpenRouterRequest> {
    const params: Partial<AnthropicOpenRouterRequest> = {};

    // Add thinking configuration if enabled
    const thinkingConfig = this.getThinkingConfig(options || {});
    if (thinkingConfig) {
      params.thinking = {
        type: "enabled",
        budget_tokens: thinkingConfig.budget_tokens,
      };
    }

    return params;
  }
}
