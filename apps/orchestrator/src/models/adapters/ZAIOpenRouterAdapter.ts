import { ModelCallOptions, ThinkingConfig } from "../types";
import { OpenRouterAdapter } from "./OpenRouterAdapter";

/**
 * OpenRouter request with Z.AI-specific thinking parameters
 */
interface ZAIOpenRouterRequest {
  thinking?: {
    type: "enabled" | "disabled";
  };
}

/**
 * Z.AI (GLM) via OpenRouter Provider Adapter
 * 
 * Implements the ProviderAdapter interface for Z.AI GLM models via OpenRouter.
 * Supports glm-4.6 model with thinking mode.
 * 
 * Per Requirements 6.1, 6.2:
 * - When provider="zai-openrouter", uses OpenRouter endpoint
 * - Uses OPENROUTER_API_KEY from environment
 * 
 * @extends {OpenRouterAdapter}
 */
export class ZAIOpenRouterAdapter extends OpenRouterAdapter {
  /**
   * Map of local model IDs to OpenRouter model IDs
   * Note: OpenRouter uses "zhipu" as the provider prefix for Z.AI/GLM models
   */
  private static readonly MODEL_MAPPING: Record<string, string> = {
    "glm-4.6": "zhipu/glm-4.6",
    "glm-4": "zhipu/glm-4",
    "glm-4-plus": "zhipu/glm-4-plus",
    "glm-4-flash": "zhipu/glm-4-flash",
  };

  /**
   * Get the OpenRouter model ID for the given Z.AI model.
   * 
   * Per Requirements 6.6: Map OpenRouter model IDs
   * 
   * @param modelId - The original model identifier (e.g., "glm-4.6")
   * @returns OpenRouter-formatted model ID (e.g., "zhipu/glm-4.6")
   */
  protected getOpenRouterModelId(modelId: string): string {
    // Check if already in OpenRouter format
    if (modelId.startsWith("zhipu/") || modelId.startsWith("zai/")) {
      return modelId;
    }
    
    // Map to OpenRouter format
    return ZAIOpenRouterAdapter.MODEL_MAPPING[modelId] || `zhipu/${modelId}`;
  }

  /**
   * Get the original model ID from an OpenRouter model ID.
   * 
   * Per Requirements 6.6: Map OpenRouter model IDs (reverse mapping)
   * 
   * @param openRouterModelId - The OpenRouter model ID (e.g., "zhipu/glm-4.6")
   * @returns Original model identifier (e.g., "glm-4.6")
   */
  protected getOriginalModelId(openRouterModelId: string): string {
    // Strip "zhipu/" or "zai/" prefix if present
    if (openRouterModelId.startsWith("zhipu/")) {
      return openRouterModelId.slice(6);
    }
    if (openRouterModelId.startsWith("zai/")) {
      return openRouterModelId.slice(4);
    }
    return openRouterModelId;
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
   * Build Z.AI-specific request parameters.
   * Adds thinking configuration for extended reasoning.
   * 
   * @param options - The model call options
   * @returns Additional request parameters with thinking config
   */
  protected buildProviderSpecificParams(
    options?: ModelCallOptions
  ): Partial<ZAIOpenRouterRequest> {
    const params: Partial<ZAIOpenRouterRequest> = {};

    // Add thinking configuration if enabled
    const thinkingConfig = this.getThinkingConfig(options || {});
    if (thinkingConfig) {
      params.thinking = {
        type: "enabled",
      };
    }

    return params;
  }
}
