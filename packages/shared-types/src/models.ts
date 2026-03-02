/**
 * Chat message structure for LLM interactions
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Provider types for LLM services
 */
export enum ProviderType {
  OPENAI = "openai",
  ANTHROPIC = "anthropic",
  GLM = "glm",
  GEMINI = "gemini",
  GROK = "grok",
  // OpenRouter variants
  OPENAI_OPENROUTER = "openai-openrouter",
  ANTHROPIC_OPENROUTER = "anthropic-openrouter",
  GLM_OPENROUTER = "zai-openrouter",
  GEMINI_OPENROUTER = "gemini-openrouter",
}

/**
 * Base execution metadata
 */
export interface ExecutionMetadata {
  tokensUsed?: number;
  latencyMs?: number;
}

/**
 * Extended metadata for model responses
 */
export interface ModelMetadata extends ExecutionMetadata {
  finishReason?: string;
}
