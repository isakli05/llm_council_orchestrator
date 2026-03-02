import { ModelCallOptions, ThinkingConfig } from "../types";
import { OpenRouterAdapter } from "./OpenRouterAdapter";

/**
 * OpenRouter request with OpenAI-specific reasoning parameters
 */
interface OpenAIOpenRouterRequest {
  reasoning?: {
    effort?: "low" | "medium" | "high" | "xhigh";
  };
}

/**
 * OpenAI via OpenRouter Provider Adapter
 * 
 * Implements the ProviderAdapter interface for OpenAI models via OpenRouter.
 * Supports gpt-5.2 models with reasoning effort configuration.
 * 
 * Per Requirements 6.1, 6.2:
 * - When provider="openai-openrouter", uses OpenRouter endpoint
 * - Uses OPENROUTER_API_KEY from environment
 * 
 * @extends {OpenRouterAdapter}
 */
export class OpenAIOpenRouterAdapter extends OpenRouterAdapter {
  /**
   * Map of local model IDs to OpenRouter model IDs
   */
  private static readonly MODEL_MAPPING: Record<string, string> = {
    "gpt-5.2": "openai/gpt-5.2",
    "gpt-5.2-pro": "openai/gpt-5.2-pro",
    "gpt-4o": "openai/gpt-4o",
    "gpt-4o-mini": "openai/gpt-4o-mini",
    "gpt-4-turbo": "openai/gpt-4-turbo",
    "gpt-4": "openai/gpt-4",
    "gpt-3.5-turbo": "openai/gpt-3.5-turbo",
  };

  /**
   * Get the OpenRouter model ID for the given OpenAI model.
   * 
   * Per Requirements 6.6: Map OpenRouter model IDs
   * 
   * @param modelId - The original model identifier (e.g., "gpt-5.2")
   * @returns OpenRouter-formatted model ID (e.g., "openai/gpt-5.2")
   */
  protected getOpenRouterModelId(modelId: string): string {
    // Check if already in OpenRouter format
    if (modelId.startsWith("openai/")) {
      return modelId;
    }
    
    // Map to OpenRouter format
    return OpenAIOpenRouterAdapter.MODEL_MAPPING[modelId] || `openai/${modelId}`;
  }

  /**
   * Get the original model ID from an OpenRouter model ID.
   * 
   * Per Requirements 6.6: Map OpenRouter model IDs (reverse mapping)
   * 
   * @param openRouterModelId - The OpenRouter model ID (e.g., "openai/gpt-5.2")
   * @returns Original model identifier (e.g., "gpt-5.2")
   */
  protected getOriginalModelId(openRouterModelId: string): string {
    // Strip "openai/" prefix if present
    if (openRouterModelId.startsWith("openai/")) {
      return openRouterModelId.slice(7);
    }
    return openRouterModelId;
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
   * Build OpenAI-specific request parameters.
   * Adds reasoning.effort parameter for thinking mode.
   * 
   * @param options - The model call options
   * @returns Additional request parameters with reasoning config
   */
  protected buildProviderSpecificParams(
    options?: ModelCallOptions
  ): Partial<OpenAIOpenRouterRequest> {
    const params: Partial<OpenAIOpenRouterRequest> = {};

    // Add reasoning effort if thinking is enabled
    const thinkingConfig = this.getThinkingConfig(options || {});
    if (thinkingConfig && thinkingConfig.effort) {
      params.reasoning = {
        effort: thinkingConfig.effort,
      };
    }

    return params;
  }
}
