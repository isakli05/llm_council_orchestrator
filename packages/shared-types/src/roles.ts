/**
 * Available role types in the system
 */
export enum RoleType {
  LEGACY_ANALYSIS = "legacy_analysis",
  ARCHITECT = "architect",
  MIGRATION = "migration",
  SECURITY = "security",
  AGGREGATOR = "aggregator",
}

/**
 * Thinking configuration for models that support extended thinking
 * Used primarily with Claude models
 */
export interface ThinkingConfig {
  /** Whether thinking is enabled or disabled */
  type?: "enabled" | "disabled";
  /** Token budget for thinking (when enabled) */
  budget_tokens?: number;
}

/**
 * Reasoning configuration for models that support reasoning effort
 * Used primarily with OpenAI models
 */
export interface ReasoningConfig {
  /** Reasoning effort level */
  effort?: "low" | "medium" | "high" | "xhigh";
}

/**
 * User-provided configuration for a single model
 * Supports provider selection and thinking/reasoning modes
 */
export interface ModelConfig {
  /** Model name (e.g., "gpt-4o", "claude-opus-4-5") */
  model: string;
  /** 
   * Provider name - optional, inferred from model prefix if not provided
   * Supports: openai, anthropic, zai, gemini, and their -openrouter variants
   */
  provider?: string;
  /** Thinking configuration for models that support it */
  thinking?: ThinkingConfig;
  /** Reasoning configuration for models that support it */
  reasoning?: ReasoningConfig;
}

/**
 * User-provided configuration for a single role
 * Specifies which models to use for the role
 */
export interface RoleModelConfig {
  /** Array of model configurations (1-3 models per role) */
  models: ModelConfig[];
}
