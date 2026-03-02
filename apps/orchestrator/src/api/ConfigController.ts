import { FastifyRequest, FastifyReply } from "fastify";
import { ArchitectConfig } from "@llm/shared-config";
import { ModelGateway } from "../models/ModelGateway";
import { RoleType, ModelConfig } from "@llm/shared-types";

/**
 * Provider information for the models endpoint response
 */
export interface ProviderInfo {
  /** Provider name (e.g., "openai", "anthropic") */
  name: string;
  /** Whether the provider is available (API key configured) */
  available: boolean;
  /** Reason for unavailability if not available */
  reason?: string;
  /** List of models for this provider */
  models: ModelInfo[];
}

/**
 * Model information for the models endpoint response
 */
export interface ModelInfo {
  /** Model name (e.g., "gpt-5.2", "claude-opus-4-5") */
  name: string;
  /** Whether the model supports thinking mode */
  supportsThinking: boolean;
  /** Whether the model supports reasoning mode */
  supportsReasoning: boolean;
  /** Default configuration for this model */
  defaultConfig: ModelConfig;
}

/**
 * Role information for the roles endpoint response
 */
export interface RoleInfo {
  /** Role name (e.g., "architect", "security") */
  name: string;
  /** Human-readable description of the role */
  description: string;
  /** Whether the role supports dual-model execution */
  supportsDualModel: boolean;
  /** Default model configurations for this role */
  defaultModels: ModelConfig[];
}

/**
 * Response for GET /config/models endpoint
 */
export interface ModelsResponse {
  ok: true;
  providers: ProviderInfo[];
}

/**
 * Response for GET /config/roles endpoint
 */
export interface RolesResponse {
  ok: true;
  roles: RoleInfo[];
}

/**
 * ConfigController handles configuration discovery endpoints.
 * 
 * Provides read-only endpoints for:
 * - GET /config/models: Available models grouped by provider
 * - GET /config/roles: Available roles with default configurations
 * 
 * Requirements: 3.1, 4.1
 */
export class ConfigController {
  private config: ArchitectConfig;
  private modelGateway: ModelGateway;

  constructor(config: ArchitectConfig, modelGateway: ModelGateway) {
    this.config = config;
    this.modelGateway = modelGateway;
  }

  /**
   * GET /config/models
   * Returns available models grouped by provider
   * 
   * Requirements: 3.1, 3.2, 3.3, 3.4
   * - Return list of available models grouped by provider
   * - Mark providers as unavailable if API key is missing
   * - Include model capabilities (thinking, reasoning support)
   * - Include default configurations
   */
  async getModels(_request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const providers = this.buildProviderList();
    return reply.code(200).send({ ok: true, providers });
  }

  /**
   * GET /config/roles
   * Returns available roles with default configurations
   * 
   * Requirements: 4.1, 4.2, 4.3
   * - Return all available roles with default model configurations
   * - Include role name, description, default models
   * - Indicate which roles support dual-model execution
   */
  async getRoles(_request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const roles = this.buildRoleList();
    return reply.code(200).send({ ok: true, roles });
  }

  /**
   * Build the list of providers with their availability status and models
   */
  private buildProviderList(): ProviderInfo[] {
    const providers: ProviderInfo[] = [];
    const configProviders = this.config.providers || {};

    for (const [providerName, providerConfig] of Object.entries(configProviders)) {
      // Check if provider is available (has API key)
      const envKey = providerConfig.envKey;
      const hasApiKey = envKey ? !!process.env[envKey] : false;

      // Get models configured for this provider
      const models = this.getModelsForProvider(providerName);

      providers.push({
        name: providerName,
        available: hasApiKey,
        reason: hasApiKey ? undefined : `Missing API key: ${envKey}`,
        models,
      });
    }

    return providers;
  }

  /**
   * Get all models configured for a specific provider
   */
  private getModelsForProvider(providerName: string): ModelInfo[] {
    const models: ModelInfo[] = [];
    const seenModels = new Set<string>();
    const configModels = this.config.models || {};

    // Iterate through all role configurations to find models for this provider
    for (const roleConfig of Object.values(configModels)) {
      const roleModels = Array.isArray(roleConfig) ? roleConfig : [roleConfig];
      
      for (const modelConfig of roleModels) {
        if (modelConfig.provider === providerName && !seenModels.has(modelConfig.model)) {
          seenModels.add(modelConfig.model);
          
          models.push({
            name: modelConfig.model,
            supportsThinking: this.modelSupportsThinking(modelConfig.model, providerName),
            supportsReasoning: this.modelSupportsReasoning(modelConfig.model, providerName),
            defaultConfig: {
              model: modelConfig.model,
              provider: modelConfig.provider,
              thinking: modelConfig.thinking,
              reasoning: modelConfig.reasoning,
            },
          });
        }
      }
    }

    return models;
  }

  /**
   * Check if a model supports thinking mode based on provider
   */
  private modelSupportsThinking(modelName: string, providerName: string): boolean {
    // Anthropic models support thinking mode
    if (providerName === "anthropic" || providerName === "anthropic-openrouter") {
      return modelName.startsWith("claude-");
    }
    // Z.AI models support thinking mode
    if (providerName === "zai" || providerName === "zai-openrouter") {
      return modelName.startsWith("glm-");
    }
    return false;
  }

  /**
   * Check if a model supports reasoning mode based on provider
   */
  private modelSupportsReasoning(modelName: string, providerName: string): boolean {
    // OpenAI models support reasoning mode
    if (providerName === "openai" || providerName === "openai-openrouter") {
      return modelName.startsWith("gpt-");
    }
    return false;
  }

  /**
   * Build the list of roles with their descriptions and default configurations
   */
  private buildRoleList(): RoleInfo[] {
    const roles: RoleInfo[] = [];
    const configModels = this.config.models || {};

    // Role descriptions
    const roleDescriptions: Record<string, string> = {
      [RoleType.LEGACY_ANALYSIS]: "Analyzes legacy code patterns and identifies modernization opportunities",
      [RoleType.ARCHITECT]: "Designs system architecture and provides high-level technical guidance",
      [RoleType.MIGRATION]: "Plans and executes code migration strategies",
      [RoleType.SECURITY]: "Identifies security vulnerabilities and recommends mitigations",
      [RoleType.AGGREGATOR]: "Synthesizes outputs from multiple roles into cohesive recommendations",
    };

    // Roles that support dual-model execution
    const dualModelRoles = new Set([RoleType.LEGACY_ANALYSIS, RoleType.ARCHITECT]);

    for (const roleType of Object.values(RoleType)) {
      const roleConfig = configModels[roleType];
      const roleModels = roleConfig 
        ? (Array.isArray(roleConfig) ? roleConfig : [roleConfig])
        : [];

      const defaultModels: ModelConfig[] = roleModels.map((m) => ({
        model: m.model,
        provider: m.provider,
        thinking: m.thinking,
        reasoning: m.reasoning,
      }));

      roles.push({
        name: roleType,
        description: roleDescriptions[roleType] || `Role: ${roleType}`,
        supportsDualModel: dualModelRoles.has(roleType),
        defaultModels,
      });
    }

    return roles;
  }
}
