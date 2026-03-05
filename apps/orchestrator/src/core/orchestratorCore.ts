import * as fs from "fs";
import * as path from "path";
import { 
  PipelineMode, 
  PIPELINE_MODES,
  loadArchitectConfig,
  validateConfig,
  validateApiKeysOnStartup,
  ArchitectConfig,
  ConfigValidationResult,
  ApiKeyValidationResult,
} from "@llm/shared-config";
import { PipelineEngine } from "../pipeline/PipelineEngine";
import { PipelineResult } from "../pipeline/types";

// Re-export ArchitectConfig for backward compatibility
export type { ArchitectConfig } from "@llm/shared-config";

/**
 * Options for pipeline execution
 */
export interface PipelineOptions {
  modelsOverride?: Record<string, string | string[]>;
}

// Re-export PipelineResult from pipeline types
export type { PipelineResult } from "../pipeline/types";

/**
 * OrchestratorCore handles config loading, validation, and delegates to PipelineEngine
 */
export class OrchestratorCore {
  private config: ArchitectConfig | null = null;
  private configPath?: string;
  private pipelineEngine: PipelineEngine;
  private configValidation: ConfigValidationResult | null = null;
  private apiKeyValidation: ApiKeyValidationResult | null = null;

  constructor(configPath?: string) {
    // Store config path if provided, otherwise let loadArchitectConfig find it
    this.configPath = configPath;
    this.pipelineEngine = new PipelineEngine();
  }

  /**
   * Load and validate architect.config.json with environment variable overrides
   * 
   * Per Requirements 15.1, 15.2, 15.3:
   * - Loads architect.config.json from project root
   * - Overrides with environment variables if set
   * - Validates required variables are present
   * - Checks API keys for active providers on startup
   * - Logs warning if key is missing
   * - Marks provider as unavailable if key missing
   */
  public loadConfig(): ArchitectConfig {
    if (this.config) {
      return this.config;
    }

    try {
      // Load config using the new config loader
      // This handles environment variable overrides per Requirements 15.2
      this.config = loadArchitectConfig({
        configPath: this.configPath,
        validateApiKeys: true,
        throwOnError: true,
      });

      // Validate configuration and environment variables
      this.configValidation = validateConfig(this.config);

      // Log warnings for missing API keys
      for (const warning of this.configValidation.warnings) {
        console.warn(`[OrchestratorCore] ${warning}`);
      }

      // Log errors but don't throw - allow startup with partial functionality
      for (const error of this.configValidation.errors) {
        console.error(`[OrchestratorCore] ${error}`);
      }

      // Per Requirements 15.3: Check API keys for active providers on startup
      // Log warning if key is missing, mark provider as unavailable
      this.apiKeyValidation = validateApiKeysOnStartup(this.config, true);
      
      // Log summary of provider availability
      if (this.apiKeyValidation.unavailableProviders.length > 0) {
        console.warn(
          `[OrchestratorCore] ${this.apiKeyValidation.unavailableProviders.length} provider(s) unavailable due to missing API keys: ${this.apiKeyValidation.unavailableProviders.join(", ")}`
        );
      }
      
      if (this.apiKeyValidation.availableProviders.length > 0) {
        console.info(
          `[OrchestratorCore] ${this.apiKeyValidation.availableProviders.length} provider(s) available: ${this.apiKeyValidation.availableProviders.join(", ")}`
        );
      }

      return this.config;
    } catch (err) {
      const error = err as Error;
      throw new Error(`Failed to load config: ${error.message}`);
    }
  }

  /**
   * Get the configuration validation result
   * Returns null if config hasn't been loaded yet
   */
  public getConfigValidation(): ConfigValidationResult | null {
    return this.configValidation;
  }

  /**
   * Get list of providers with missing API keys
   * Useful for marking providers as unavailable
   */
  public getMissingApiKeyProviders(): string[] {
    return this.configValidation?.missingApiKeys || [];
  }

  /**
   * Get the API key validation result
   * Returns null if config hasn't been loaded yet
   * 
   * Per Requirements 15.3: Provides access to API key validation results
   */
  public getApiKeyValidation(): ApiKeyValidationResult | null {
    return this.apiKeyValidation;
  }

  /**
   * Get list of available providers (those with valid API keys)
   * 
   * Per Requirements 15.3: Check API keys for active providers
   */
  public getAvailableProviders(): string[] {
    return this.apiKeyValidation?.availableProviders || [];
  }

  /**
   * Get list of unavailable providers (those with missing API keys)
   * 
   * Per Requirements 15.3: Mark provider as unavailable if key missing
   */
  public getUnavailableProviders(): string[] {
    return this.apiKeyValidation?.unavailableProviders || [];
  }

  /**
   * Validate pipeline request parameters
   */
  private validateRequest(mode: PipelineMode, prompt: string): void {
    // Validate mode
    const validModes = Object.values(PIPELINE_MODES);
    if (!validModes.includes(mode)) {
      throw new Error(
        `Invalid pipeline mode: ${mode}. Must be one of: ${validModes.join(", ")}`
      );
    }

    // Validate prompt (allow empty for specific modes if needed in future)
    if (!prompt || prompt.trim().length === 0) {
      throw new Error("Prompt cannot be empty");
    }
  }

  /**
   * Execute a pipeline request
   * This is the main public API of the orchestrator core
   */
  async runPipeline(
    mode: PipelineMode,
    prompt: string,
    options?: PipelineOptions
  ): Promise<PipelineResult> {
    try {
      // Load config
      const config = this.loadConfig();

      // Validate request
      this.validateRequest(mode, prompt);

      // Delegate to PipelineEngine
      return await this.pipelineEngine.execute(
        mode,
        prompt,
        config,
        options?.modelsOverride as any
      );
    } catch (err) {
      const error = err as Error;
      return {
        success: false,
        mode,
        error: {
          code: "ORCHESTRATOR_ERROR",
          message: error.message,
          details: error.stack,
        },
      };
    }
  }
}
