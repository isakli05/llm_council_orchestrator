import { RoleType, RoleRequest, RoleResponse, RoleOutput, RoleConfig, RoleProviderConfig } from "./types";
import { Domain, DomainContext } from "../discovery/types";
import { IndexClient } from "../indexer/IndexClient";
import { SearchRequest } from "../indexer/types";
import { ModelGateway, ProviderConfig } from "../models/ModelGateway";
import { ChatMessage } from "../models/types";

/**
 * RoleManager coordinates role agent execution with model selection and dual-model support.
 * It handles role-specific prompt templating and parallel model calls.
 * 
 * Per Requirements 10.1: RoleManager accepts ModelGateway as a dependency for executing
 * role-based analysis with real LLM calls.
 */
export class RoleManager {
  private config: RoleConfig;
  private modelGateway: ModelGateway;
  private indexClient?: IndexClient;

  /**
   * Create a new RoleManager instance.
   * 
   * @param config - Role configuration from architect.config.json
   * @param modelGateway - ModelGateway instance for executing LLM calls
   * @param indexClient - Optional IndexClient for domain context retrieval via RAG
   */
  constructor(config: RoleConfig, modelGateway: ModelGateway, indexClient?: IndexClient) {
    this.config = config;
    this.modelGateway = modelGateway;
    this.indexClient = indexClient;
  }

  /**
   * Execute a role with appropriate model(s).
   * 
   * Per Requirements 10.2: Resolves models from config and calls ModelGateway
   * for parallel execution with role-specific system prompt.
   * 
   * Per Requirements 10.3: Multiple models are executed in parallel via
   * ModelGateway.callModelsWithConfigs which uses Promise.all internally.
   * 
   * Per Requirements 10.4: Checks ModelResponse.success for each output,
   * includes errors in RoleResponse, and continues execution if some models succeed.
   */
  async executeRole(request: RoleRequest): Promise<RoleResponse> {
    try {
      // Determine which models to use for this role
      // Per Requirements 10.2: Resolve models from config using resolveModels method
      const providerConfigs = this.resolveModels(request.role, request.modelsOverride);

      // Generate role-specific system prompt
      // Per Requirements 10.2: Include role-specific system prompt
      const systemPrompt = this.getRoleSystemPrompt(request.role);

      // Execute model calls (parallel if multiple models)
      // Per Requirements 10.3: Call ModelGateway.callModelsWithConfigs for parallel execution
      const outputs = await this.executeModels(
        providerConfigs,
        systemPrompt,
        request.prompt,
        request.context
      );

      // Per Requirements 10.4: Check ModelResponse.success for each output
      // Continue execution if some models succeed
      const successfulOutputs = outputs.filter(output => !output.error);
      const failedOutputs = outputs.filter(output => output.error);

      // Determine overall success: at least one model must succeed
      const hasSuccessfulOutputs = successfulOutputs.length > 0;

      // Build response with error aggregation if any models failed
      const response: RoleResponse = {
        role: request.role,
        success: hasSuccessfulOutputs,
        outputs, // Include all outputs (both successful and failed)
        executedAt: new Date().toISOString(),
      };

      // Per Requirements 10.4: Include errors in RoleResponse when some models fail
      if (failedOutputs.length > 0) {
        const failedModelIds = failedOutputs.map(o => o.modelId).join(", ");
        const errorMessages = failedOutputs
          .map(o => `${o.modelId}: ${o.error?.message || "Unknown error"}`)
          .join("; ");

        response.error = {
          code: hasSuccessfulOutputs ? "PARTIAL_MODEL_FAILURE" : "ALL_MODELS_FAILED",
          message: hasSuccessfulOutputs
            ? `Some models failed: ${failedModelIds}. ${successfulOutputs.length}/${outputs.length} models succeeded.`
            : `All models failed: ${failedModelIds}`,
          details: {
            failedModels: failedOutputs.map(o => ({
              modelId: o.modelId,
              error: o.error,
            })),
            successfulModels: successfulOutputs.map(o => o.modelId),
            totalModels: outputs.length,
            successCount: successfulOutputs.length,
            failureCount: failedOutputs.length,
            errorMessages,
          },
        };
      }

      return response;
    } catch (err) {
      const error = err as Error;
      return {
        role: request.role,
        success: false,
        outputs: [],
        error: {
          code: "ROLE_EXECUTION_ERROR",
          message: error.message,
          details: error.stack,
        },
        executedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Resolve which models to use for a role.
   * Returns an array of ProviderConfig objects for use with ModelGateway.callModelsWithConfigs.
   * 
   * Per Requirements 10.2: Resolve models from config using resolveModels method.
   * Priority: override > config
   * 
   * @param role - The role type to resolve models for
   * @param override - Optional override for models (can be model IDs or full provider configs)
   * @returns Array of ProviderConfig objects
   */
  private resolveModels(
    role: RoleType, 
    override?: string | string[] | RoleProviderConfig | RoleProviderConfig[]
  ): ProviderConfig[] {
    // Handle override if provided
    if (override) {
      return this.normalizeToProviderConfigs(override);
    }

    // Get models from config
    const configModels = this.config.models[role];
    if (!configModels) {
      throw new Error(`No models configured for role: ${role}`);
    }

    return this.normalizeToProviderConfigs(configModels);
  }

  /**
   * Normalize various model configuration formats to ProviderConfig[].
   * Handles:
   * - Single string (model ID) -> ProviderConfig with inferred provider
   * - Array of strings (model IDs) -> ProviderConfig[] with inferred providers
   * - Single RoleProviderConfig -> ProviderConfig[]
   * - Array of RoleProviderConfig -> ProviderConfig[]
   * 
   * @param models - Models in various formats
   * @returns Normalized array of ProviderConfig objects
   */
  private normalizeToProviderConfigs(
    models: string | string[] | RoleProviderConfig | RoleProviderConfig[]
  ): ProviderConfig[] {
    // Handle array input
    if (Array.isArray(models)) {
      return models.map((m) => this.toProviderConfig(m));
    }

    // Handle single value
    return [this.toProviderConfig(models)];
  }

  /**
   * Convert a single model specification to ProviderConfig.
   * 
   * @param model - Model ID string or RoleProviderConfig object
   * @returns ProviderConfig object
   */
  private toProviderConfig(model: string | RoleProviderConfig): ProviderConfig {
    // If it's already a provider config object, return as-is
    if (typeof model === "object" && model !== null) {
      return {
        model: model.model,
        provider: model.provider,
        base_url: model.base_url,
        thinking: model.thinking,
        reasoning: model.reasoning,
      };
    }

    // It's a string (model ID) - infer provider from model prefix
    const provider = this.inferProviderFromModelId(model);
    return {
      model,
      provider,
    };
  }

  /**
   * Infer provider type from model ID prefix.
   * 
   * @param modelId - The model identifier
   * @returns Provider string
   */
  private inferProviderFromModelId(modelId: string): string {
    if (modelId.startsWith("gpt-")) {
      return "openai";
    }
    if (modelId.startsWith("claude-")) {
      return "anthropic";
    }
    if (modelId.startsWith("glm-")) {
      return "zai";
    }
    if (modelId.startsWith("gemini-")) {
      return "gemini";
    }
    if (modelId.startsWith("grok-")) {
      return "grok";
    }
    // Default to openai for unknown models
    return "openai";
  }

  /**
   * Get role-specific system prompt
   */
  private getRoleSystemPrompt(role: RoleType): string {
    const prompts: Record<RoleType, string> = {
      [RoleType.LEGACY_ANALYSIS]: `You are a Legacy Code Analyzer. Your task is to analyze existing codebases, identify technical debt, outdated patterns, and areas requiring modernization. Provide detailed insights about code quality, maintainability, and potential risks.`,

      [RoleType.ARCHITECT]: `You are a Software Architect. Your task is to design comprehensive architectural solutions, define system boundaries, select appropriate technologies, and create detailed architectural documentation. Focus on scalability, maintainability, and best practices.`,

      [RoleType.MIGRATION]: `You are a Migration Specialist. Your task is to plan and guide code migrations, refactoring efforts, and technology transitions. Provide step-by-step migration strategies, identify risks, and suggest mitigation approaches.`,

      [RoleType.SECURITY]: `You are a Security Analyst. Your task is to identify security vulnerabilities, assess risks, and recommend security best practices. Focus on authentication, authorization, data protection, and common security pitfalls.`,

      [RoleType.AGGREGATOR]: `You are an Aggregator. Your task is to synthesize multiple analysis outputs, identify consensus and conflicts, and produce a unified, coherent final report. Critically evaluate different perspectives and create a balanced synthesis.`,
    };

    return prompts[role];
  }

  /**
   * Execute multiple models in parallel using ModelGateway.
   * 
   * Per Requirements 10.2, 10.3: Calls ModelGateway.callModelsWithConfigs for parallel execution
   * with resolved models from config and role-specific system prompt.
   * 
   * @param providerConfigs - Array of ProviderConfig objects with model and provider settings
   * @param systemPrompt - Role-specific system prompt
   * @param userPrompt - User prompt for the role
   * @param context - Optional additional context
   * @returns Array of RoleOutput from each model
   */
  private async executeModels(
    providerConfigs: ProviderConfig[],
    systemPrompt: string,
    userPrompt: string,
    context?: Record<string, unknown>
  ): Promise<RoleOutput[]> {
    // Build chat messages with system prompt and user prompt
    // Per Requirements 10.2: Include role-specific system prompt
    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: this.buildUserMessage(userPrompt, context) },
    ];

    // Call ModelGateway.callModelsWithConfigs for parallel execution
    // Per Requirements 10.3: Execute all model calls in parallel using Promise.all internally
    // This method passes the full ProviderConfig to each model call, ensuring:
    // - Correct provider routing (openai, anthropic, zai, gemini, or openrouter variants)
    // - Thinking/reasoning configuration is applied per model
    // - Base URL overrides are respected
    const responses = await this.modelGateway.callModelsWithConfigs(providerConfigs, messages);

    // Convert ModelResponse array to RoleOutput array
    // Per Requirements 10.4: Include error in RoleOutput when model call fails
    return responses.map((response) => ({
      modelId: response.modelId,
      content: response.success ? response.content : "",
      metadata: response.metadata,
      error: response.error,
    }));
  }

  /**
   * Build the user message with optional context.
   * 
   * @param userPrompt - The base user prompt
   * @param context - Optional context to include
   * @returns Formatted user message
   */
  private buildUserMessage(userPrompt: string, context?: Record<string, unknown>): string {
    if (!context || Object.keys(context).length === 0) {
      return userPrompt;
    }

    // Include relevant context in the user message
    const contextStr = JSON.stringify(context, null, 2);
    return `${userPrompt}\n\n<context>\n${contextStr}\n</context>`;
  }

  /**
   * Check if a role supports dual-model execution
   */
  isDualModelRole(role: RoleType): boolean {
    const dualModelRoles = [RoleType.LEGACY_ANALYSIS, RoleType.ARCHITECT];
    return dualModelRoles.includes(role);
  }

  /**
   * Execute a role for each DEEP domain
   * Filters domains to DEEP only and collects domain-specific responses
   * Supports request cancellation via AbortSignal.
   * 
   * Requirements: 24.6, 24.7 - Support request cancellation
   * 
   * @param role - Role type to execute
   * @param domains - All discovered domains
   * @param prompt - User prompt for the role
   * @param context - Additional context for role execution
   * @param modelsOverride - Optional model override (can be model IDs or full provider configs)
   * @param signal - Optional AbortSignal for request cancellation
   * @returns Array of role responses, one per DEEP domain
   */
  async executeRoleForDomains(
    role: RoleType,
    domains: Domain[],
    prompt: string,
    context?: Record<string, unknown>,
    modelsOverride?: string | string[] | RoleProviderConfig | RoleProviderConfig[],
    signal?: AbortSignal
  ): Promise<RoleResponse[]> {
    const responses: RoleResponse[] = [];

    // Filter to DEEP domains only (exclude EXCLUDED domains)
    const deepDomains = domains.filter(d => d.analysisDepth === "DEEP");

    // Execute role for each DEEP domain
    for (const domain of deepDomains) {
      // Check for cancellation before processing each domain
      // Requirements: 24.6 - Detect client disconnect
      if (signal?.aborted) {
        throw new Error("Request cancelled");
      }

      // Retrieve domain-specific context using RAG
      // Requirements: 24.7 - Propagate AbortController signal
      const domainContext = await this.retrieveDomainContext(domain, signal);

      // Create domain-specific context with retrieved chunks
      const enrichedContext = {
        ...context,
        domain: domain.name,
        domainId: domain.id,
        domainConfidence: domain.confidence,
        domainEvidence: domain.evidence,
        domainSignals: domain.signals,
        retrievedChunks: domainContext.chunks,
      };

      // Execute role with domain-specific context
      const response = await this.executeRole({
        role,
        prompt,
        context: enrichedContext,
        modelsOverride,
      });

      // Tag role output with domain ID
      response.domainId = domain.id;

      responses.push(response);
    }

    return responses;
  }

  /**
   * Retrieve domain-specific context using RAG
   * Constructs a domain-specific search query and retrieves relevant code chunks
   * Supports request cancellation via AbortSignal.
   * 
   * Requirements: 24.6, 24.7 - Support request cancellation
   * 
   * @param domain - Domain to retrieve context for
   * @param signal - Optional AbortSignal for request cancellation
   * @returns DomainContext with retrieved chunks
   */
  private async retrieveDomainContext(domain: Domain, signal?: AbortSignal): Promise<DomainContext> {
    // If no IndexClient is available, return empty context
    if (!this.indexClient) {
      console.warn(`No IndexClient available for domain context retrieval: ${domain.name}`);
      return {
        domain: domain.name,
        chunks: [],
      };
    }

    try {
      // Construct domain-specific search query
      const searchQuery = this.constructDomainQuery(domain);

      // Extract file paths from domain evidence for filtering
      const evidencePaths = domain.evidence.map(e => e.filePath);

      // Build search request with domain filters
      const searchRequest: SearchRequest = {
        query: searchQuery,
        limit: 20, // Top-K chunks per domain
        filters: {
          paths: evidencePaths.length > 0 ? evidencePaths : undefined,
        },
      };

      // Call IndexClient.semanticSearch with abort signal
      // Requirements: 24.7 - Propagate AbortController signal
      const searchResponse = await this.indexClient.semanticSearch(searchRequest, { signal });

      // Handle zero-result case gracefully
      if (!searchResponse.success || searchResponse.results.length === 0) {
        console.warn(`Zero results retrieved for domain: ${domain.name}`);
        return {
          domain: domain.name,
          chunks: [],
        };
      }

      // Transform search results to DomainContext chunks
      const chunks = searchResponse.results.map(result => ({
        filePath: result.path,
        content: result.content,
        lineRange: result.metadata?.lineStart && result.metadata?.lineEnd
          ? { start: result.metadata.lineStart, end: result.metadata.lineEnd }
          : undefined,
      }));

      return {
        domain: domain.name,
        chunks,
      };
    } catch (error) {
      // Handle errors gracefully - log and return empty context
      const err = error as Error;
      console.error(`Error retrieving domain context for ${domain.name}:`, err.message);
      return {
        domain: domain.name,
        chunks: [],
      };
    }
  }

  /**
   * Construct a domain-specific search query from domain metadata
   * Combines domain name, signals, and evidence to create a comprehensive query
   * 
   * @param domain - Domain to construct query for
   * @returns Search query string
   */
  private constructDomainQuery(domain: Domain): string {
    const queryParts: string[] = [];

    // Add domain name
    queryParts.push(domain.name);

    // Add high-weight signal values (weight > 0.7)
    const highWeightSignals = domain.signals
      .filter(s => s.weight > 0.7)
      .map(s => s.value)
      .slice(0, 5); // Limit to top 5 signals

    queryParts.push(...highWeightSignals);

    // Combine into a single query string
    return queryParts.join(" ");
  }
}
