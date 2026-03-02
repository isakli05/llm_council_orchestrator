import { ModelCallOptions, ThinkingConfig } from "../types";
import { OpenRouterAdapter } from "./OpenRouterAdapter";

/**
 * OpenRouter request with Gemini-specific thinking parameters
 * Note: OpenRouter may handle Gemini thinking differently than direct API
 */
interface GeminiOpenRouterRequest {
  // Gemini thinking config via OpenRouter
  // OpenRouter normalizes this to their format
  thinking?: {
    type: "enabled" | "disabled";
    budget_tokens?: number;
  };
}

/**
 * Gemini via OpenRouter Provider Adapter
 * 
 * Implements the ProviderAdapter interface for Google Gemini models via OpenRouter.
 * Supports gemini-3-pro models with thinking configuration.
 * 
 * Per Requirements 6.1, 6.2:
 * - When provider="gemini-openrouter", uses OpenRouter endpoint
 * - Uses OPENROUTER_API_KEY from environment
 * 
 * @extends {OpenRouterAdapter}
 */
export class GeminiOpenRouterAdapter extends OpenRouterAdapter {
  /**
   * Map of local model IDs to OpenRouter model IDs
   */
  private static readonly MODEL_MAPPING: Record<string, string> = {
    "gemini-3-pro": "google/gemini-3-pro",
    "gemini-2.0-flash": "google/gemini-2.0-flash",
    "gemini-2.0-flash-thinking": "google/gemini-2.0-flash-thinking",
    "gemini-1.5-pro": "google/gemini-1.5-pro",
    "gemini-1.5-flash": "google/gemini-1.5-flash",
    "gemini-pro": "google/gemini-pro",
  };

  /**
   * Get the OpenRouter model ID for the given Gemini model.
   * 
   * Per Requirements 6.6: Map OpenRouter model IDs
   * 
   * @param modelId - The original model identifier (e.g., "gemini-3-pro")
   * @returns OpenRouter-formatted model ID (e.g., "google/gemini-3-pro")
   */
  protected getOpenRouterModelId(modelId: string): string {
    // Check if already in OpenRouter format
    if (modelId.startsWith("google/")) {
      return modelId;
    }
    
    // Map to OpenRouter format
    return GeminiOpenRouterAdapter.MODEL_MAPPING[modelId] || `google/${modelId}`;
  }

  /**
   * Get the original model ID from an OpenRouter model ID.
   * 
   * Per Requirements 6.6: Map OpenRouter model IDs (reverse mapping)
   * 
   * @param openRouterModelId - The OpenRouter model ID (e.g., "google/gemini-3-pro")
   * @returns Original model identifier (e.g., "gemini-3-pro")
   */
  protected getOriginalModelId(openRouterModelId: string): string {
    // Strip "google/" prefix if present
    if (openRouterModelId.startsWith("google/")) {
      return openRouterModelId.slice(7);
    }
    return openRouterModelId;
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
   * Build Gemini-specific request parameters.
   * Adds thinking configuration for extended reasoning.
   * 
   * Note: OpenRouter normalizes Gemini's thinkingConfig to their format
   * 
   * @param options - The model call options
   * @returns Additional request parameters with thinking config
   */
  protected buildProviderSpecificParams(
    options?: ModelCallOptions
  ): Partial<GeminiOpenRouterRequest> {
    const params: Partial<GeminiOpenRouterRequest> = {};

    // Add thinking configuration if enabled
    const thinkingConfig = this.getThinkingConfig(options || {});
    if (thinkingConfig && thinkingConfig.budget_tokens) {
      params.thinking = {
        type: "enabled",
        budget_tokens: thinkingConfig.budget_tokens,
      };
    }

    return params;
  }
}
