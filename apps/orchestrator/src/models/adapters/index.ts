/**
 * Provider Adapters
 * 
 * This module exports all provider adapter implementations for the ModelGateway.
 * Each adapter implements the ProviderAdapter interface and handles communication
 * with a specific LLM provider API.
 * 
 * Official Provider Adapters:
 * - OpenAIAdapter: Direct OpenAI API
 * - AnthropicAdapter: Direct Anthropic API
 * - ZAIAdapter: Direct Z.AI (GLM) API
 * - GeminiAdapter: Direct Google Gemini API
 * 
 * OpenRouter Adapters (per Requirements 6.1, 6.2):
 * - OpenAIOpenRouterAdapter: OpenAI models via OpenRouter
 * - AnthropicOpenRouterAdapter: Anthropic models via OpenRouter
 * - ZAIOpenRouterAdapter: Z.AI models via OpenRouter
 * - GeminiOpenRouterAdapter: Gemini models via OpenRouter
 */

// Official provider adapters
export { OpenAIAdapter } from "./OpenAIAdapter";
export { AnthropicAdapter } from "./AnthropicAdapter";
export { ZAIAdapter } from "./ZAIAdapter";
export { GeminiAdapter } from "./GeminiAdapter";

// OpenRouter adapters (per Requirements 6.1, 6.2)
export { OpenRouterAdapter } from "./OpenRouterAdapter";
export { OpenAIOpenRouterAdapter } from "./OpenAIOpenRouterAdapter";
export { AnthropicOpenRouterAdapter } from "./AnthropicOpenRouterAdapter";
export { ZAIOpenRouterAdapter } from "./ZAIOpenRouterAdapter";
export { GeminiOpenRouterAdapter } from "./GeminiOpenRouterAdapter";
