import { PipelineMode, PIPELINE_MODES, ArchitectConfig } from "@llm/shared-config";
import { IndexStatus, RoleType, FinalArchitecturalReport, ApiError, PipelineExecutionState, DiscoveryResult, RoleModelConfig } from "@llm/shared-types";
import { PipelineContext, PipelineStepResult, PipelineResult, ActivePipelineRun, PipelineConfig, StepError, PipelineStep, DEFAULT_STEP_TIMEOUT_MS } from "./types";
import { DomainDiscoveryEngine } from "../discovery/DomainDiscoveryEngine";
import { DomainExclusion, IndexMetadata } from "../discovery/types";
import { IndexClient } from "../indexer/IndexClient";
import { logger } from "../observability/Logger";
import { trace } from "../observability/Trace";
import { RoleManager } from "../roles/RoleManager";
import { RoleConfig, RoleResponse } from "../roles/types";
import { ModelGateway } from "../models/ModelGateway";
import { Aggregator } from "../aggregation/Aggregator";
import { AggregationInput, AggregationOutput } from "../aggregation/types";
import { PipelineExecutionStateMachine } from "./executionStateMachine";
import { mergeRoleConfigs, validateProviderAvailability } from "./roleConfigMerger";

/**
 * Error thrown when a step times out
 * 
 * Requirements: 24.3 - Skip step on timeout with warning
 */
export class StepTimeoutError extends Error {
  constructor(
    public readonly stepName: string,
    public readonly timeoutMs: number
  ) {
    super(`Step '${stepName}' timed out after ${timeoutMs}ms`);
    this.name = "StepTimeoutError";
  }
}

/**
 * Error thrown when context validation fails
 * 
 * Requirements: 28.5 - Validate required fields before storing
 */
export class ContextValidationError extends Error {
  constructor(
    public readonly field: string,
    public readonly reason: string,
    public readonly details?: unknown
  ) {
    super(`Context validation failed for '${field}': ${reason}`);
    this.name = "ContextValidationError";
  }
}

/**
 * Default role configuration for analysis steps.
 * Maps role types to their default model configurations.
 */
const DEFAULT_ROLE_CONFIG: RoleConfig = {
  models: {
    [RoleType.LEGACY_ANALYSIS]: [
      { model: "gpt-5.2", provider: "openai" },
      { model: "glm-4.6", provider: "zai" },
    ],
    [RoleType.ARCHITECT]: [
      { model: "claude-opus-4-5", provider: "anthropic", thinking: { type: "enabled", budget_tokens: 4096 } },
      { model: "gpt-5.2-pro", provider: "openai", reasoning: { effort: "high" } },
    ],
    [RoleType.MIGRATION]: { model: "gpt-5.2", provider: "openai" },
    [RoleType.SECURITY]: { model: "claude-sonnet-4-5", provider: "anthropic", thinking: { type: "enabled", budget_tokens: 2048 } },
    [RoleType.AGGREGATOR]: { model: "gpt-5.2-pro", provider: "openai", reasoning: { effort: "xhigh" } },
  },
};

/**
 * Roles to execute during ANALYZE step for FULL mode.
 * These roles are executed in parallel where possible.
 */
const FULL_MODE_ANALYSIS_ROLES: RoleType[] = [
  RoleType.LEGACY_ANALYSIS,
  RoleType.ARCHITECT,
  RoleType.MIGRATION,
  RoleType.SECURITY,
];

/**
 * Roles to execute during ANALYZE step for QUICK mode.
 * Reduced set for faster analysis.
 */
const QUICK_MODE_ANALYSIS_ROLES: RoleType[] = [
  RoleType.ARCHITECT,
];

/**
 * Roles to execute for DEEP domain analysis.
 * These roles are executed per-domain with domain-specific context.
 */
const DEEP_DOMAIN_ANALYSIS_ROLES: RoleType[] = [
  RoleType.LEGACY_ANALYSIS,
  RoleType.ARCHITECT,
];

/**
 * PipelineEngine orchestrates the execution of pipeline steps based on mode.
 * It coordinates StateMachine, RoleManager, ModelGateway, IndexClient, and Aggregator.
 * 
 * Supports pipeline cancellation via AbortController pattern.
 * Requirements: 27.7 - Handle cancellation request during execution
 */
export class PipelineEngine {
  private indexClient: IndexClient;
  private modelGateway: ModelGateway;
  private roleManager: RoleManager;
  private roleConfig: RoleConfig;
  private aggregator: Aggregator;
  
  /**
   * Map of active pipeline runs for cancellation support
   * Requirements: 27.7 - Track active runs for cancellation
   */
  private activeRuns: Map<string, ActivePipelineRun> = new Map();
  
  /**
   * Map of state machines for each active pipeline run
   * Requirements: 27.7 - Track state machines for state transitions
   */
  private stateMachines: Map<string, PipelineExecutionStateMachine> = new Map();

  /**
   * Flag to track if API key validation has been performed
   */
  private apiKeyValidationPerformed: boolean = false;

  constructor(
    indexClient?: IndexClient,
    modelGateway?: ModelGateway,
    roleConfig?: RoleConfig,
    aggregator?: Aggregator
  ) {
    // Inject IndexClient dependency, create default if not provided
    this.indexClient = indexClient || new IndexClient();
    
    // Inject ModelGateway dependency, create default if not provided
    this.modelGateway = modelGateway || new ModelGateway();
    
    // Use provided role config or default
    this.roleConfig = roleConfig || DEFAULT_ROLE_CONFIG;
    
    // Create RoleManager with dependencies
    this.roleManager = new RoleManager(this.roleConfig, this.modelGateway, this.indexClient);
    
    // Inject Aggregator dependency, create default if not provided
    // Per Requirements 11.1: Aggregator accepts ModelGateway as a dependency
    this.aggregator = aggregator || new Aggregator(this.modelGateway);
  }

  /**
   * Validate API keys for configured providers and mark unavailable providers.
   * 
   * Per Requirements 15.3:
   * - Check API keys for active providers on startup
   * - Log warning if key is missing
   * - Mark provider as unavailable if key missing
   * 
   * This method should be called once when the pipeline is first executed with a config.
   * 
   * @param config - The loaded architect configuration
   */
  validateApiKeys(config: ArchitectConfig): void {
    if (this.apiKeyValidationPerformed) {
      return; // Only validate once
    }
    
    logger.info("Validating API keys for configured providers");
    
    const validationResult = this.modelGateway.validateAndMarkUnavailableProviders(config, true);
    
    // Log summary
    if (validationResult.unavailableProviders.length > 0) {
      logger.warn("Some providers are unavailable due to missing API keys", {
        unavailableProviders: validationResult.unavailableProviders,
        availableProviders: validationResult.availableProviders,
      });
    } else {
      logger.info("All configured providers have valid API keys", {
        availableProviders: validationResult.availableProviders,
      });
    }
    
    this.apiKeyValidationPerformed = true;
  }

  /**
   * Get the ModelGateway instance for external access (e.g., for testing)
   */
  getModelGateway(): ModelGateway {
    return this.modelGateway;
  }

  /**
   * Execute a pipeline based on mode and context
   * 
   * Supports cancellation via AbortController pattern.
   * Requirements: 27.7 - Handle cancellation request during execution
   * Requirements: 1.1, 1.4 - Support role_configs for per-role model configuration
   * 
   * @param mode - Pipeline execution mode (QUICK, FULL, SPEC, REFINEMENT)
   * @param prompt - User prompt for analysis
   * @param config - Pipeline configuration
   * @param projectRoot - Root directory of the project to analyze
   * @param forceReindex - Whether to force a full reindex
   * @param roleConfigs - Optional per-role model configurations (replaces modelsOverride)
   * @param domainExclusions - Optional domain exclusions
   * @param runId - Optional pre-generated run ID (if not provided, a new one will be generated)
   */
  async execute(
    mode: PipelineMode,
    prompt: string,
    config: unknown,
    projectRoot: string = process.cwd(),
    forceReindex: boolean = false,
    roleConfigs?: Record<string, RoleModelConfig>,
    domainExclusions?: DomainExclusion[],
    runId?: string
  ): Promise<PipelineResult> {
    // Per Requirements 15.3: Validate API keys for configured providers on startup
    // This marks unavailable providers in the ModelGateway
    if (config && typeof config === 'object' && 'models' in config) {
      this.validateApiKeys(config as ArchitectConfig);
    }
    
    // Use provided runId or generate a new one
    // If runId is provided by the controller, use it to maintain ID consistency
    // across the entire pipeline lifecycle (API response, tracing, state management)
    const pipelineRunId = runId || trace.startPipeline(mode);
    
    // If runId was provided externally, initialize the trace
    if (runId) {
      trace.initializePipeline(runId, mode);
    }
    
    // Create AbortController for cancellation support
    // Requirements: 27.7 - Handle cancellation request during execution
    const abortController = new AbortController();
    
    // Normalize config to PipelineConfig type
    // Requirements: 28.2 - Include user configuration
    const pipelineConfig: PipelineConfig = typeof config === 'object' && config !== null
      ? config as PipelineConfig
      : {};
    
    // Merge user-provided role_configs with defaults
    // Requirements: 1.1, 1.4 - Use role_configs instead of defaults, fallback for omitted roles
    const mergedRoleConfig = mergeRoleConfigs(roleConfigs, this.roleConfig);
    
    // Per Requirements 5.5: Validate provider availability before execution
    // Return PROVIDER_UNAVAILABLE error if any provider is missing API key
    const providerValidation = validateProviderAvailability(mergedRoleConfig);
    if (!providerValidation.valid) {
      // End pipeline trace with failure
      trace.endPipeline(pipelineRunId, "failed");
      
      const completedAt = new Date().toISOString();
      const startedAt = new Date().toISOString(); // Just started, so use current time
      
      return {
        success: false,
        mode,
        error: providerValidation.error,
        completedAt,
        executionMetadata: {
          runId: pipelineRunId,
          durationMs: 0,
          stepsCompleted: [],
          totalStepsAttempted: 0,
          successfulSteps: 0,
          failedSteps: 0,
          startedAt,
          completedAt,
        },
      };
    }
    
    // Update RoleManager with merged configuration
    // Requirements: 1.1 - Pass merged config to RoleManager
    this.roleManager = new RoleManager(mergedRoleConfig, this.modelGateway, this.indexClient);
    
    const context: PipelineContext = {
      // Pipeline metadata (Requirements: 28.1, 28.2)
      runId: pipelineRunId,
      mode,
      startedAt: new Date().toISOString(),
      prompt,
      config: pipelineConfig,
      
      // User configuration (Requirements: 28.2)
      projectRoot,
      forceReindex,
      userExclusions: domainExclusions,
      
      // Execution state - initialized empty (Requirements: 28.1, 28.2, 28.3)
      completedSteps: [],
      errors: [],
      
      // Cancellation support (Requirements: 27.7)
      abortController,
      cancelled: false,
    };
    
    // Create state machine for this run
    // Requirements: 27.7 - Track state for cancellation
    const stateMachine = new PipelineExecutionStateMachine(pipelineRunId);
    this.stateMachines.set(pipelineRunId, stateMachine);
    
    // Register active run for cancellation support
    // Requirements: 27.7 - Track active runs for cancellation
    const activeRun: ActivePipelineRun = {
      runId: pipelineRunId,
      context,
      abortController,
      startedAt: context.startedAt,
    };
    this.activeRuns.set(pipelineRunId, activeRun);

    try {
      // Start the state machine
      stateMachine.start();
      
      // Determine steps based on mode
      const steps = this.determineSteps(mode);
      const stepResults: PipelineStepResult[] = [];
      const warnings: Array<{ step: string; message: string; error?: ApiError }> = [];

      // Execute each step
      for (const stepName of steps) {
        // Check for cancellation before each step
        // Requirements: 27.7 - Handle cancellation request during execution
        if (this.isCancelled(pipelineRunId)) {
          return this.handleCancellation(pipelineRunId, context, stepResults);
        }
        
        // Update current step in context and active run
        // Requirements: 28.1, 28.2, 28.3 - Track execution state
        context.currentStep = stepName as PipelineStep;
        activeRun.currentStep = stepName;
        
        // Execute step with timeout
        // Requirements: 24.3 - Set timeout per pipeline step
        const stepResult = await this.executeStepWithTimeout(stepName, context);
        stepResults.push(stepResult);
        
        // Check for cancellation after step execution
        // Requirements: 27.7 - Handle cancellation request during execution
        if (this.isCancelled(pipelineRunId)) {
          return this.handleCancellation(pipelineRunId, context, stepResults);
        }

        // Handle step failure
        // Requirements: 26.4, 26.8, 28.7
        if (!stepResult.success) {
          // Record error in context
          // Requirements: 28.7 - Include partial context in error response
          const stepError: StepError = {
            stepName,
            code: stepResult.error?.code || "STEP_FAILED",
            message: stepResult.error?.message || `Step '${stepName}' failed`,
            details: stepResult.error?.details,
            retryable: false,
            occurredAt: new Date().toISOString(),
          };
          context.errors.push(stepError);
          
          // Record failure in trace span with error details
          // Requirements: 26.8 - Record failure in trace span with error details
          this.recordStepFailureInTrace(pipelineRunId, stepName, stepResult.error);

          // Check if this is a critical step failure
          // Requirements: 26.4 - Abort pipeline on critical step failure (INDEX)
          if (this.isCriticalStep(stepName)) {
            logger.error(`Critical step '${stepName}' failed, aborting pipeline`, {
              stepName,
              error: stepResult.error,
              completedSteps: context.completedSteps,
            });

            // End pipeline trace with failure
            trace.endPipeline(pipelineRunId, "failed");

            // Calculate completion timestamp for critical failure
            const criticalFailureCompletedAt = new Date().toISOString();
            
            // Build execution metadata for critical failure
            // Requirements: 28.7 - Include execution metadata in error response
            const criticalFailureExecutionMetadata = this.buildExecutionMetadata(
              context, 
              stepResults, 
              criticalFailureCompletedAt
            );

            // Requirements: 28.7 - Include partial results in error response
            return {
              success: false,
              mode,
              error: {
                code: "CRITICAL_STEP_FAILED",
                message: `Critical step '${stepName}' failed, pipeline aborted`,
                details: {
                  failedStep: stepName,
                  stepError: stepResult.error,
                  partialContext: this.extractPartialContext(context),
                },
              },
              data: this.buildPartialResults(stepResults, context),
              steps: stepResults,
              // Requirements: 28.7 - Include execution metadata in error response
              executionMetadata: criticalFailureExecutionMetadata,
              completedAt: criticalFailureCompletedAt,
            };
          }

          // Non-critical step failure: continue with warning
          // Requirements: 26.8 - Continue with warning on non-critical failures
          logger.warn(`Non-critical step '${stepName}' failed, continuing pipeline`, {
            stepName,
            error: stepResult.error,
            remainingSteps: steps.slice(steps.indexOf(stepName) + 1),
          });

          warnings.push({
            step: stepName,
            message: `Step '${stepName}' failed but pipeline continued`,
            error: stepResult.error,
          });
        } else {
          // Step succeeded - add to completedSteps
          // Requirements: 28.1, 28.2, 28.3 - Track completed steps
          context.completedSteps.push(stepName as PipelineStep);
        }
      }

      // Aggregate results
      const finalData = await this.aggregateResults(stepResults, context);

      // End pipeline trace with success
      trace.endPipeline(pipelineRunId, "completed");

      // Calculate completion timestamp
      const completedAt = new Date().toISOString();

      // Build execution metadata
      // Requirements: 28.6, 28.7 - Include execution metadata (duration, steps completed)
      const executionMetadata = this.buildExecutionMetadata(context, stepResults, completedAt);

      // Build full context for successful result
      // Requirements: 28.6 - Include full context in successful PipelineResult
      const fullContext = this.buildFullContext(context, executionMetadata);

      // Build final result
      const result: PipelineResult = {
        success: true,
        mode,
        data: finalData,
        // Requirements: 28.6 - Include full context in successful PipelineResult
        context: fullContext,
        steps: stepResults,
        // Requirements: 28.6, 28.7 - Include execution metadata
        executionMetadata,
        completedAt,
      };

      // Include warnings if any non-critical steps failed
      if (warnings.length > 0) {
        result.error = {
          code: "PIPELINE_COMPLETED_WITH_WARNINGS",
          message: `Pipeline completed but ${warnings.length} step(s) failed`,
          details: { warnings },
        };
      }

      return result;
    } catch (err) {
      const error = err as Error;
      
      // Record unexpected error in trace
      this.recordUnexpectedErrorInTrace(pipelineRunId, error);
      
      // Transition state machine to FAILED
      const sm = this.stateMachines.get(pipelineRunId);
      if (sm && !sm.isTerminal()) {
        try {
          sm.fail(`pipeline_error: ${error.message}`);
        } catch {
          // Ignore state transition errors during error handling
        }
      }
      
      // End pipeline trace with failure
      trace.endPipeline(pipelineRunId, "failed");
      
      // Calculate completion timestamp for error response
      const errorCompletedAt = new Date().toISOString();
      
      // Build execution metadata for error response
      // Requirements: 28.7 - Include execution metadata in error response
      const errorExecutionMetadata = this.buildExecutionMetadata(context, [], errorCompletedAt);
      
      // Requirements: 28.7 - Include partial context in error response
      return {
        success: false,
        mode,
        error: {
          code: "PIPELINE_EXECUTION_ERROR",
          message: error.message,
          details: {
            stack: error.stack,
            partialContext: this.extractPartialContext(context),
          },
        },
        data: this.buildPartialResults([], context),
        // Requirements: 28.7 - Include execution metadata in error response
        executionMetadata: errorExecutionMetadata,
        completedAt: errorCompletedAt,
      };
    } finally {
      // Cleanup: Remove from active runs and state machines
      // Requirements: 27.7 - Release resources
      this.cleanupRun(pipelineRunId);
    }
  }
  
  /**
   * Cancel a running pipeline
   * 
   * Handles cancellation request during execution:
   * 1. Marks the pipeline as cancelled
   * 2. Triggers the AbortController to signal cancellation
   * 3. Transitions state machine to CANCELLED state
   * 
   * Requirements: 27.7 - Handle cancellation request during execution
   * 
   * @param runId - The ID of the pipeline run to cancel
   * @returns true if cancellation was initiated, false if run not found or already terminal
   */
  cancel(runId: string): boolean {
    const activeRun = this.activeRuns.get(runId);
    if (!activeRun) {
      logger.warn(`Cannot cancel pipeline: run not found`, { runId });
      return false;
    }
    
    const stateMachine = this.stateMachines.get(runId);
    if (stateMachine?.isTerminal()) {
      logger.warn(`Cannot cancel pipeline: already in terminal state`, { 
        runId, 
        state: stateMachine.currentState 
      });
      return false;
    }
    
    logger.info(`Cancelling pipeline`, { 
      runId, 
      currentStep: activeRun.currentStep,
      currentState: stateMachine?.currentState 
    });
    
    // Mark context as cancelled
    // Requirements: 27.7 - Handle cancellation request during execution
    activeRun.context.cancelled = true;
    
    // Trigger AbortController to signal cancellation to in-progress operations
    // Requirements: 27.7 - Cleanup in-progress operations
    activeRun.abortController.abort();
    
    // Transition state machine to CANCELLED state
    // Requirements: 27.7 - Transition to CANCELLED state
    if (stateMachine && !stateMachine.isTerminal()) {
      try {
        stateMachine.cancel();
      } catch (err) {
        logger.warn(`Failed to transition state machine to CANCELLED`, { 
          runId, 
          error: (err as Error).message 
        });
      }
    }
    
    return true;
  }
  
  /**
   * Check if a pipeline run has been cancelled
   * 
   * @param runId - The ID of the pipeline run to check
   * @returns true if the pipeline has been cancelled
   */
  private isCancelled(runId: string): boolean {
    const activeRun = this.activeRuns.get(runId);
    return activeRun?.context.cancelled === true || 
           activeRun?.abortController.signal.aborted === true;
  }
  
  /**
   * Handle pipeline cancellation
   * 
   * Creates the appropriate response when a pipeline is cancelled:
   * 1. Records cancellation in trace
   * 2. Builds partial results from completed steps
   * 3. Returns cancellation result
   * 
   * Requirements: 27.7 - Transition to CANCELLED state, Cleanup in-progress operations
   * 
   * @param runId - The ID of the cancelled pipeline run
   * @param context - The pipeline execution context
   * @param stepResults - Results from steps that completed before cancellation
   * @returns PipelineResult indicating cancellation
   */
  private handleCancellation(
    runId: string,
    context: PipelineContext,
    stepResults: PipelineStepResult[]
  ): PipelineResult {
    logger.info(`Pipeline cancelled`, {
      runId,
      completedSteps: stepResults.filter(s => s.success).map(s => s.stepName),
      totalSteps: stepResults.length,
    });
    
    // Record cancellation in trace
    const spanId = trace.startSpan(runId, "cancellation", {
      completedSteps: stepResults.length,
      reason: "user_requested",
    });
    trace.endSpan(runId, spanId, "completed");
    
    // End pipeline trace with cancelled status
    trace.endPipeline(runId, "cancelled");
    
    // Build partial results from completed steps
    const partialResults = this.buildPartialResults(stepResults, context);
    
    // Calculate completion timestamp for cancellation
    const cancellationCompletedAt = new Date().toISOString();
    
    // Build execution metadata for cancellation
    // Requirements: 28.7 - Include execution metadata in error response
    const cancellationExecutionMetadata = this.buildExecutionMetadata(
      context, 
      stepResults, 
      cancellationCompletedAt
    );
    
    return {
      success: false,
      mode: context.mode,
      error: {
        code: "PIPELINE_CANCELLED",
        message: "Pipeline execution was cancelled by user request",
        details: {
          completedSteps: stepResults.filter(s => s.success).map(s => s.stepName),
          partialContext: this.extractPartialContext(context),
        },
      },
      data: partialResults,
      steps: stepResults,
      // Requirements: 28.7 - Include execution metadata in error response
      executionMetadata: cancellationExecutionMetadata,
      completedAt: cancellationCompletedAt,
    };
  }
  
  /**
   * Cleanup resources for a completed or cancelled pipeline run
   * 
   * Requirements: 27.7 - Release resources
   * 
   * @param runId - The ID of the pipeline run to cleanup
   */
  private cleanupRun(runId: string): void {
    // Remove from active runs
    this.activeRuns.delete(runId);
    
    // Remove state machine
    this.stateMachines.delete(runId);
    
    logger.debug(`Pipeline run cleaned up`, { runId });
  }

  // ============================================
  // Context Update Methods (Requirements: 28.1, 28.2, 28.3, 28.5)
  // ============================================

  /**
   * Update context with IndexMetadata after INDEX step
   * 
   * Validates required fields before storing:
   * - totalFiles must be a non-negative number
   * - totalChunks must be a non-negative number
   * - filesByExtension must be an object
   * - directoryStructure must be an array
   * - detectedFrameworks must be an array
   * - dependencies must be an array
   * 
   * Requirements: 28.1 - Store IndexMetadata after INDEX step
   * Requirements: 28.5 - Validate required fields before storing
   * 
   * @param context - Pipeline execution context to update
   * @param indexMetadata - Index metadata to store
   * @throws ContextValidationError if validation fails
   */
  updateContextWithIndexMetadata(
    context: PipelineContext,
    indexMetadata: IndexMetadata
  ): void {
    // Validate required fields
    // Requirements: 28.5 - Validate required fields before storing
    this.validateIndexMetadata(indexMetadata);

    // Store IndexMetadata in pipeline context
    // Requirements: 28.1 - Store IndexMetadata after INDEX step
    context.indexMetadata = indexMetadata;
    context.indexReady = true;

    logger.debug("Context updated with IndexMetadata", {
      runId: context.runId,
      totalFiles: indexMetadata.totalFiles,
      totalChunks: indexMetadata.totalChunks,
      detectedFrameworks: indexMetadata.detectedFrameworks?.length || 0,
    });
  }

  /**
   * Validate IndexMetadata required fields
   * 
   * Requirements: 28.5 - Validate required fields before storing
   * 
   * @param indexMetadata - Index metadata to validate
   * @throws ContextValidationError if validation fails
   */
  private validateIndexMetadata(indexMetadata: IndexMetadata): void {
    if (indexMetadata === null || indexMetadata === undefined) {
      throw new ContextValidationError(
        "indexMetadata",
        "IndexMetadata cannot be null or undefined"
      );
    }

    if (typeof indexMetadata.totalFiles !== "number" || indexMetadata.totalFiles < 0) {
      throw new ContextValidationError(
        "indexMetadata.totalFiles",
        "totalFiles must be a non-negative number",
        { received: indexMetadata.totalFiles }
      );
    }

    if (typeof indexMetadata.totalChunks !== "number" || indexMetadata.totalChunks < 0) {
      throw new ContextValidationError(
        "indexMetadata.totalChunks",
        "totalChunks must be a non-negative number",
        { received: indexMetadata.totalChunks }
      );
    }

    if (typeof indexMetadata.filesByExtension !== "object" || indexMetadata.filesByExtension === null) {
      throw new ContextValidationError(
        "indexMetadata.filesByExtension",
        "filesByExtension must be an object",
        { received: typeof indexMetadata.filesByExtension }
      );
    }

    if (!Array.isArray(indexMetadata.directoryStructure)) {
      throw new ContextValidationError(
        "indexMetadata.directoryStructure",
        "directoryStructure must be an array",
        { received: typeof indexMetadata.directoryStructure }
      );
    }

    if (!Array.isArray(indexMetadata.detectedFrameworks)) {
      throw new ContextValidationError(
        "indexMetadata.detectedFrameworks",
        "detectedFrameworks must be an array",
        { received: typeof indexMetadata.detectedFrameworks }
      );
    }

    if (!Array.isArray(indexMetadata.dependencies)) {
      throw new ContextValidationError(
        "indexMetadata.dependencies",
        "dependencies must be an array",
        { received: typeof indexMetadata.dependencies }
      );
    }
  }

  /**
   * Update context with DiscoveryResult after DISCOVER step
   * 
   * Validates required fields before storing:
   * - domains must be an array
   * - statistics must be an object with required fields
   * - executionMetadata must be an object with required fields
   * 
   * Requirements: 28.2 - Store DiscoveryResult after DISCOVER step
   * Requirements: 28.5 - Validate required fields before storing
   * 
   * @param context - Pipeline execution context to update
   * @param discoveryResult - Discovery result to store
   * @throws ContextValidationError if validation fails
   */
  updateContextWithDiscoveryResult(
    context: PipelineContext,
    discoveryResult: DiscoveryResult
  ): void {
    // Validate required fields
    // Requirements: 28.5 - Validate required fields before storing
    this.validateDiscoveryResult(discoveryResult);

    // Store DiscoveryResult in pipeline context
    // Requirements: 28.2 - Store DiscoveryResult after DISCOVER step
    context.discoveryResult = discoveryResult;
    context.discoveryComplete = true;

    logger.debug("Context updated with DiscoveryResult", {
      runId: context.runId,
      totalDomains: discoveryResult.statistics.totalDomains,
      deepDomains: discoveryResult.statistics.deepDomains,
      excludedDomains: discoveryResult.statistics.excludedDomains,
    });
  }

  /**
   * Validate DiscoveryResult required fields
   * 
   * Requirements: 28.5 - Validate required fields before storing
   * 
   * @param discoveryResult - Discovery result to validate
   * @throws ContextValidationError if validation fails
   */
  private validateDiscoveryResult(discoveryResult: DiscoveryResult): void {
    if (discoveryResult === null || discoveryResult === undefined) {
      throw new ContextValidationError(
        "discoveryResult",
        "DiscoveryResult cannot be null or undefined"
      );
    }

    if (!Array.isArray(discoveryResult.domains)) {
      throw new ContextValidationError(
        "discoveryResult.domains",
        "domains must be an array",
        { received: typeof discoveryResult.domains }
      );
    }

    // Validate statistics object
    if (typeof discoveryResult.statistics !== "object" || discoveryResult.statistics === null) {
      throw new ContextValidationError(
        "discoveryResult.statistics",
        "statistics must be an object",
        { received: typeof discoveryResult.statistics }
      );
    }

    const stats = discoveryResult.statistics;
    if (typeof stats.totalDomains !== "number" || stats.totalDomains < 0) {
      throw new ContextValidationError(
        "discoveryResult.statistics.totalDomains",
        "totalDomains must be a non-negative number",
        { received: stats.totalDomains }
      );
    }

    if (typeof stats.deepDomains !== "number" || stats.deepDomains < 0) {
      throw new ContextValidationError(
        "discoveryResult.statistics.deepDomains",
        "deepDomains must be a non-negative number",
        { received: stats.deepDomains }
      );
    }

    if (typeof stats.excludedDomains !== "number" || stats.excludedDomains < 0) {
      throw new ContextValidationError(
        "discoveryResult.statistics.excludedDomains",
        "excludedDomains must be a non-negative number",
        { received: stats.excludedDomains }
      );
    }

    // Validate executionMetadata object
    if (typeof discoveryResult.executionMetadata !== "object" || discoveryResult.executionMetadata === null) {
      throw new ContextValidationError(
        "discoveryResult.executionMetadata",
        "executionMetadata must be an object",
        { received: typeof discoveryResult.executionMetadata }
      );
    }

    const execMeta = discoveryResult.executionMetadata;
    if (typeof execMeta.discoveryTimeMs !== "number" || execMeta.discoveryTimeMs < 0) {
      throw new ContextValidationError(
        "discoveryResult.executionMetadata.discoveryTimeMs",
        "discoveryTimeMs must be a non-negative number",
        { received: execMeta.discoveryTimeMs }
      );
    }
  }

  /**
   * Update context with RoleResponse array after ANALYZE step
   * 
   * Validates required fields before storing:
   * - roleResponses must be an array
   * - Each RoleResponse must have required fields (role, success, outputs, executedAt)
   * 
   * Requirements: 28.3 - Store RoleResponse array after ANALYZE step
   * Requirements: 28.5 - Validate required fields before storing
   * 
   * @param context - Pipeline execution context to update
   * @param roleResponses - Array of role responses to store (appends to existing)
   * @throws ContextValidationError if validation fails
   */
  updateContextWithRoleResponses(
    context: PipelineContext,
    roleResponses: RoleResponse[]
  ): void {
    // Validate required fields
    // Requirements: 28.5 - Validate required fields before storing
    this.validateRoleResponses(roleResponses);

    // Initialize roleResponses array if not exists
    if (!context.roleResponses) {
      context.roleResponses = [];
    }

    // Append new role responses to existing array
    // Requirements: 28.3 - Store RoleResponse array after ANALYZE step
    context.roleResponses.push(...roleResponses);

    // Mark analysis as complete if at least one role succeeded
    const hasSuccessfulRoles = context.roleResponses.some(r => r.success);
    context.analysisComplete = hasSuccessfulRoles;

    logger.debug("Context updated with RoleResponses", {
      runId: context.runId,
      newResponsesCount: roleResponses.length,
      totalResponsesCount: context.roleResponses.length,
      successfulCount: context.roleResponses.filter(r => r.success).length,
      analysisComplete: context.analysisComplete,
    });
  }

  /**
   * Validate RoleResponse array required fields
   * 
   * Requirements: 28.5 - Validate required fields before storing
   * 
   * @param roleResponses - Array of role responses to validate
   * @throws ContextValidationError if validation fails
   */
  private validateRoleResponses(roleResponses: RoleResponse[]): void {
    if (!Array.isArray(roleResponses)) {
      throw new ContextValidationError(
        "roleResponses",
        "roleResponses must be an array",
        { received: typeof roleResponses }
      );
    }

    // Validate each RoleResponse in the array
    for (let i = 0; i < roleResponses.length; i++) {
      const response = roleResponses[i];
      
      if (response === null || response === undefined) {
        throw new ContextValidationError(
          `roleResponses[${i}]`,
          "RoleResponse cannot be null or undefined"
        );
      }

      if (typeof response.role !== "string" || response.role.length === 0) {
        throw new ContextValidationError(
          `roleResponses[${i}].role`,
          "role must be a non-empty string",
          { received: response.role }
        );
      }

      if (typeof response.success !== "boolean") {
        throw new ContextValidationError(
          `roleResponses[${i}].success`,
          "success must be a boolean",
          { received: typeof response.success }
        );
      }

      if (!Array.isArray(response.outputs)) {
        throw new ContextValidationError(
          `roleResponses[${i}].outputs`,
          "outputs must be an array",
          { received: typeof response.outputs }
        );
      }

      if (typeof response.executedAt !== "string" || response.executedAt.length === 0) {
        throw new ContextValidationError(
          `roleResponses[${i}].executedAt`,
          "executedAt must be a non-empty string",
          { received: response.executedAt }
        );
      }
    }
  }

  /**
   * Update context with FinalArchitecturalReport after AGGREGATE step
   * 
   * Validates required fields before storing:
   * - finalReport must be an object
   * - finalReport must have required sections
   * 
   * Requirements: 28.6 - Include full context in successful PipelineResult
   * Requirements: 28.5 - Validate required fields before storing
   * 
   * @param context - Pipeline execution context to update
   * @param finalReport - Final architectural report to store
   * @throws ContextValidationError if validation fails
   */
  updateContextWithFinalReport(
    context: PipelineContext,
    finalReport: FinalArchitecturalReport
  ): void {
    // Validate required fields
    // Requirements: 28.5 - Validate required fields before storing
    this.validateFinalReport(finalReport);

    // Store FinalArchitecturalReport in pipeline context
    // Requirements: 28.6 - Include full context in successful PipelineResult
    context.finalReport = finalReport;
    context.aggregationComplete = true;

    logger.debug("Context updated with FinalArchitecturalReport", {
      runId: context.runId,
      hasSections: !!finalReport.sections,
      hasMetadata: !!finalReport.metadata,
    });
  }

  /**
   * Validate FinalArchitecturalReport required fields
   * 
   * Requirements: 28.5 - Validate required fields before storing
   * 
   * @param finalReport - Final report to validate
   * @throws ContextValidationError if validation fails
   */
  private validateFinalReport(finalReport: FinalArchitecturalReport): void {
    if (finalReport === null || finalReport === undefined) {
      throw new ContextValidationError(
        "finalReport",
        "FinalArchitecturalReport cannot be null or undefined"
      );
    }

    if (typeof finalReport !== "object") {
      throw new ContextValidationError(
        "finalReport",
        "FinalArchitecturalReport must be an object",
        { received: typeof finalReport }
      );
    }
  }
  
  /**
   * Get the current state of a pipeline run
   * 
   * @param runId - The ID of the pipeline run
   * @returns The current execution state, or undefined if not found
   */
  getRunState(runId: string): PipelineExecutionState | undefined {
    return this.stateMachines.get(runId)?.currentState;
  }
  
  /**
   * Check if a pipeline run is active (not in terminal state)
   * 
   * @param runId - The ID of the pipeline run
   * @returns true if the run is active, false if terminal or not found
   */
  isRunActive(runId: string): boolean {
    const stateMachine = this.stateMachines.get(runId);
    return stateMachine ? !stateMachine.isTerminal() : false;
  }

  /**
   * Get read-only access to pipeline context for a given run
   * 
   * Returns an immutable deep copy of the context that cannot be mutated.
   * This ensures data integrity across steps by preventing direct modification
   * of the context object.
   * 
   * Requirements: 28.4 - Provide read-only access to previous step results
   * - Provide getContext method for step access
   * - Return immutable copy of context
   * - Prevent direct mutation of context
   * 
   * @param runId - The ID of the pipeline run
   * @returns A frozen, immutable copy of the pipeline context, or undefined if not found
   */
  getContext(runId: string): Readonly<PipelineContext> | undefined {
    const activeRun = this.activeRuns.get(runId);
    if (!activeRun) {
      logger.debug(`Context not found for runId`, { runId });
      return undefined;
    }

    // Create a deep immutable copy of the context
    // Requirements: 28.4 - Return immutable copy of context
    return this.createImmutableContextCopy(activeRun.context);
  }

  /**
   * Create a deep immutable copy of the pipeline context
   * 
   * This method creates a deep clone of the context and recursively freezes
   * all nested objects to prevent any mutation.
   * 
   * Requirements: 28.4 - Prevent direct mutation of context
   * 
   * @param context - The original pipeline context
   * @returns A deeply frozen copy of the context
   */
  private createImmutableContextCopy(context: PipelineContext): Readonly<PipelineContext> {
    // Deep clone the context to avoid sharing references
    const clonedContext = this.deepClone(context);
    
    // Recursively freeze the cloned context to make it immutable
    return this.deepFreeze(clonedContext) as Readonly<PipelineContext>;
  }

  /**
   * Deep clone an object, handling special cases like Date, Array, and nested objects
   * 
   * Note: AbortController cannot be cloned, so we exclude it from the copy
   * to maintain immutability of the returned context.
   * 
   * @param obj - The object to clone
   * @returns A deep clone of the object
   */
  private deepClone<T>(obj: T): T {
    // Handle null and undefined
    if (obj === null || obj === undefined) {
      return obj;
    }

    // Handle primitive types
    if (typeof obj !== 'object') {
      return obj;
    }

    // Handle Date
    if (obj instanceof Date) {
      return new Date(obj.getTime()) as unknown as T;
    }

    // Handle Array
    if (Array.isArray(obj)) {
      return obj.map(item => this.deepClone(item)) as unknown as T;
    }

    // Handle AbortController - cannot be cloned, exclude from copy
    if (obj instanceof AbortController) {
      return undefined as unknown as T;
    }

    // Handle plain objects
    const clonedObj: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      // Skip AbortController property
      if (key === 'abortController') {
        continue;
      }
      clonedObj[key] = this.deepClone((obj as Record<string, unknown>)[key]);
    }
    return clonedObj as T;
  }

  /**
   * Recursively freeze an object and all its nested properties
   * 
   * Requirements: 28.4 - Prevent direct mutation of context
   * 
   * @param obj - The object to freeze
   * @returns The frozen object
   */
  private deepFreeze<T>(obj: T): T {
    // Handle null, undefined, and primitives
    if (obj === null || obj === undefined || typeof obj !== 'object') {
      return obj;
    }

    // Freeze the object itself
    Object.freeze(obj);

    // Recursively freeze all properties
    for (const key of Object.keys(obj)) {
      const value = (obj as Record<string, unknown>)[key];
      if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
        this.deepFreeze(value);
      }
    }

    return obj;
  }

  /**
   * Record step failure in trace span with comprehensive error details
   * 
   * Requirements: 26.8 - Record failure in trace span with error details
   * 
   * @param runId - Pipeline run ID
   * @param stepName - Name of the failed step
   * @param error - Error details from the step
   */
  private recordStepFailureInTrace(
    runId: string,
    stepName: string,
    error?: ApiError
  ): void {
    const traceData = trace.getTrace(runId);
    if (!traceData) {
      logger.warn(`Cannot record step failure: trace not found for runId ${runId}`);
      return;
    }

    // Find the span for this step (may already be ended by the step itself)
    const span = traceData.spans.find(
      s => s.name === stepName || s.name.includes(stepName)
    );

    if (span) {
      // Ensure error details are recorded in the span
      if (!span.error && error) {
        span.error = {
          message: error.message,
          stack: typeof error.details === 'string' ? error.details : JSON.stringify(error.details),
        };
      }

      // Add failure metadata if not already present
      if (span.metadata) {
        span.metadata.failureCode = error?.code;
        span.metadata.failureRecorded = true;
      }
    }

    // Log the failure for observability
    logger.error(`Step failure recorded in trace`, {
      runId,
      stepName,
      errorCode: error?.code,
      errorMessage: error?.message,
    });
  }

  /**
   * Record unexpected error in trace
   * 
   * @param runId - Pipeline run ID
   * @param error - The unexpected error
   */
  private recordUnexpectedErrorInTrace(runId: string, error: Error): void {
    const traceData = trace.getTrace(runId);
    if (!traceData) {
      return;
    }

    // Create a special span for the unexpected error
    const spanId = trace.startSpan(runId, "unexpected_error", {
      errorType: error.name,
      errorMessage: error.message,
    });

    trace.endSpan(runId, spanId, "failed", {
      message: error.message,
      stack: error.stack,
    });
  }

  /**
   * Extract partial context from pipeline context for error responses
   * 
   * Requirements: 28.7 - Include partial context in error response
   * 
   * @param context - Pipeline execution context
   * @returns Partial context with completed step results
   */
  private extractPartialContext(context: PipelineContext): Record<string, unknown> {
    const partialContext: Record<string, unknown> = {
      mode: context.mode,
      startedAt: context.startedAt,
      runId: context.runId,
      projectRoot: context.projectRoot,
    };

    // Include index metadata if available
    if (context.indexMetadata) {
      partialContext.indexMetadata = {
        totalFiles: context.indexMetadata.totalFiles,
        totalChunks: context.indexMetadata.totalChunks,
        detectedFrameworks: context.indexMetadata.detectedFrameworks,
      };
      partialContext.indexReady = context.indexReady;
    }

    // Include discovery result summary if available
    if (context.discoveryResult) {
      partialContext.discoveryResult = {
        totalDomains: context.discoveryResult.statistics.totalDomains,
        deepDomains: context.discoveryResult.statistics.deepDomains,
        excludedDomains: context.discoveryResult.statistics.excludedDomains,
      };
      partialContext.discoveryComplete = context.discoveryComplete;
    }

    // Include role responses summary if available
    if (context.roleResponses && context.roleResponses.length > 0) {
      partialContext.roleResponses = {
        count: context.roleResponses.length,
        successfulCount: context.roleResponses.filter(r => r.success).length,
        roles: [...new Set(context.roleResponses.map(r => r.role))],
      };
      partialContext.analysisComplete = context.analysisComplete;
    }

    // Include final report summary if available
    if (context.finalReport) {
      partialContext.hasFinalReport = true;
      partialContext.aggregationComplete = context.aggregationComplete;
    }

    return partialContext;
  }

  /**
   * Build partial results from completed steps
   * 
   * Requirements: 28.7 - Include partial results in error response
   * 
   * @param stepResults - Array of step results (may be incomplete)
   * @param context - Pipeline execution context
   * @returns Partial results object
   */
  private buildPartialResults(
    stepResults: PipelineStepResult[],
    context: PipelineContext
  ): Record<string, unknown> {
    const partialResults: Record<string, unknown> = {
      mode: context.mode,
      totalSteps: stepResults.length,
      successfulSteps: stepResults.filter(s => s.success).length,
      failedSteps: stepResults.filter(s => !s.success).length,
      completedStepNames: stepResults.filter(s => s.success).map(s => s.stepName),
      failedStepNames: stepResults.filter(s => !s.success).map(s => s.stepName),
    };

    // Include successful step data
    const successfulStepData: Record<string, unknown> = {};
    for (const step of stepResults.filter(s => s.success)) {
      if (step.data) {
        successfulStepData[step.stepName] = step.data;
      }
    }
    if (Object.keys(successfulStepData).length > 0) {
      partialResults.stepData = successfulStepData;
    }

    // Include context data that was successfully populated
    if (context.indexMetadata) {
      partialResults.indexMetadata = context.indexMetadata;
    }
    if (context.discoveryResult) {
      partialResults.discoveryResult = context.discoveryResult;
    }
    if (context.roleResponses && context.roleResponses.length > 0) {
      partialResults.roleResponses = context.roleResponses;
    }
    if (context.finalReport) {
      partialResults.finalReport = context.finalReport;
    }

    return partialResults;
  }

  /**
   * Determine which steps to execute based on pipeline mode
   * 
   * Requirements: 26.1, 26.2
   * - FULL mode: INDEX → DISCOVER → ANALYZE → AGGREGATE
   * - QUICK mode: INDEX → ANALYZE (skip DISCOVER)
   */
  private determineSteps(mode: PipelineMode): string[] {
    switch (mode) {
      case PIPELINE_MODES.QUICK:
        // QUICK mode: INDEX → ANALYZE (skip DISCOVER)
        return ["initialize", "index", "quick_analysis"];

      case PIPELINE_MODES.FULL:
        // FULL mode: INDEX → DISCOVER → ANALYZE (global + domain-specific) → AGGREGATE
        // Per Requirements 26.1, 26.6: Execute domain-specific analysis for DEEP domains
        return [
          "initialize",
          "index",
          "discover",
          "legacy_analysis",
          "architect_analysis",
          "migration_analysis",
          "security_analysis",
          "deep_domain_analysis", // Per Requirements 26.6: DEEP domain analysis with RAG context
          "aggregate",
        ];

      case PIPELINE_MODES.SPEC:
        return [
          "initialize",
          "index",
          "architect_analysis",
          "spec_generation",
        ];

      case PIPELINE_MODES.REFINEMENT:
        return [
          "initialize",
          "context_load",
          "refinement_analysis",
        ];

      default:
        return ["initialize"];
    }
  }

  /**
   * Execute a single pipeline step with timeout
   * 
   * Wraps step execution with a configurable timeout. If the step times out:
   * 1. Logs a warning with step name and timeout duration
   * 2. Returns a failed PipelineStepResult with STEP_TIMEOUT error code
   * 3. Allows pipeline to continue execution (non-critical failure)
   * 
   * Requirements: 24.3 - Set timeout per pipeline step, skip step on timeout with warning
   * 
   * @param stepName - Name of the step to execute
   * @param context - Pipeline execution context
   * @returns PipelineStepResult with success or timeout error
   */
  private async executeStepWithTimeout(
    stepName: string,
    context: PipelineContext
  ): Promise<PipelineStepResult> {
    // Get step timeout from config or use default
    // Requirements: 24.3 - Set timeout per pipeline step
    const timeoutMs = context.config?.stepTimeoutMs ?? DEFAULT_STEP_TIMEOUT_MS;
    
    // Start trace span for step timeout tracking
    const runId = context.runId || "";
    
    logger.debug(`Executing step '${stepName}' with timeout ${timeoutMs}ms`, {
      stepName,
      timeoutMs,
      runId,
    });
    
    // Create timeout promise
    const timeoutPromise = new Promise<PipelineStepResult>((resolve) => {
      setTimeout(() => {
        // Log warning when step times out
        // Requirements: 24.3 - Skip step on timeout with warning
        logger.warn(`Step '${stepName}' timed out after ${timeoutMs}ms, skipping`, {
          stepName,
          timeoutMs,
          runId,
        });
        
        resolve({
          stepName,
          success: false,
          error: {
            code: "STEP_TIMEOUT",
            message: `Step '${stepName}' timed out after ${timeoutMs}ms`,
            details: {
              stepName,
              timeoutMs,
              runId,
            },
          },
          executedAt: new Date().toISOString(),
        });
      }, timeoutMs);
    });
    
    // Race between step execution and timeout
    // Requirements: 24.3 - Continue pipeline execution on timeout
    const result = await Promise.race([
      this.executeStep(stepName, context),
      timeoutPromise,
    ]);
    
    return result;
  }

  /**
   * Execute a single pipeline step
   * Routes to specific step handlers based on step name.
   */
  private async executeStep(
    stepName: string,
    context: PipelineContext
  ): Promise<PipelineStepResult> {
    try {
      // Route to specific step handlers
      switch (stepName) {
        case "index":
          return await this.executeIndexStep(context);
        case "discover":
          return await this.executeDiscoveryStep(context);
        // Analysis steps - route to executeAnalyzeStep with appropriate roles
        case "legacy_analysis":
          return await this.executeAnalyzeStep(context, [RoleType.LEGACY_ANALYSIS]);
        case "architect_analysis":
          return await this.executeAnalyzeStep(context, [RoleType.ARCHITECT]);
        case "migration_analysis":
          return await this.executeAnalyzeStep(context, [RoleType.MIGRATION]);
        case "security_analysis":
          return await this.executeAnalyzeStep(context, [RoleType.SECURITY]);
        case "quick_analysis":
          return await this.executeAnalyzeStep(context, QUICK_MODE_ANALYSIS_ROLES);
        case "deep_domain_analysis":
          // Per Requirements 26.6: Execute ANALYZE step for DEEP domains with domain-specific context
          return await this.executeAnalyzeStepForDomains(context, DEEP_DOMAIN_ANALYSIS_ROLES);
        case "aggregate":
          // Per Requirements 26.7: Execute AGGREGATE step with all role responses
          return await this.executeAggregateStep(context);
        default:
          // Placeholder implementation for other steps
          // Real implementation will delegate to appropriate services based on step type
          return {
            stepName,
            success: true,
            data: {
              message: `Step '${stepName}' executed (placeholder)`,
              context: {
                mode: context.mode,
                prompt: context.prompt.substring(0, 50) + "...",
              },
            },
            executedAt: new Date().toISOString(),
          };
      }
    } catch (err) {
      const error = err as Error;
      return {
        stepName,
        success: false,
        error: {
          code: "STEP_EXECUTION_ERROR",
          message: error.message,
          details: error.stack,
        },
        executedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Execute the INDEX pipeline step
   * 
   * Orchestrates code indexing using the IndexClient:
   * 1. Calls IndexClient.ensureIndex with project root
   * 2. Waits for indexing completion
   * 3. Stores IndexMetadata in pipeline context
   * 4. Handles indexing failures with proper error context
   * 
   * Creates a trace span named "index" to track execution time
   * and log indexing statistics.
   * 
   * Records indexing metrics in trace:
   * - Indexing execution time
   * - Number of files indexed
   * - Index status
   * 
   * Requirements: 26.3, 26.4, 28.1
   * 
   * @param context - Pipeline execution context
   * @returns PipelineStepResult with indexing data
   */
  private async executeIndexStep(
    context: PipelineContext
  ): Promise<PipelineStepResult> {
    // Start trace span for indexing
    const runId = context.runId || "";
    const spanId = trace.startSpan(runId, "index", {
      mode: context.mode,
      projectRoot: context.projectRoot,
      forceReindex: context.forceReindex || false,
    });

    try {
      logger.info("Starting INDEX step", {
        mode: context.mode,
        projectRoot: context.projectRoot,
        forceReindex: context.forceReindex || false,
      });

      // Call IndexClient.ensureIndex with project root
      // Requirements: 24.6, 24.7 - Propagate AbortController signal for request cancellation
      const indexResult = await this.indexClient.ensureIndex(
        context.projectRoot,
        context.forceReindex || false,
        { signal: context.abortController?.signal }
      );

      // Handle indexing failures
      if (indexResult.status === IndexStatus.FAILED) {
        const errorMessage = indexResult.error?.message || "Indexing failed without specific error";
        const errorCode = indexResult.error?.code || "INDEX_ERROR";

        logger.error("INDEX step failed", {
          error: errorMessage,
          errorCode,
          projectRoot: context.projectRoot,
        });

        // End trace span with failure
        trace.endSpan(runId, spanId, "failed", {
          message: `${errorCode}: ${errorMessage}`,
        });

        return {
          stepName: "index",
          success: false,
          error: {
            code: errorCode,
            message: errorMessage,
            details: {
              projectRoot: context.projectRoot,
              forceReindex: context.forceReindex,
            },
          },
          executedAt: new Date().toISOString(),
        };
      }

      // Build IndexMetadata from the result
      // Extract rich metadata from indexer response
      const indexMetadata: IndexMetadata = {
        totalChunks: indexResult.metadata?.directoryStructure.reduce((sum, dir) => sum + dir.fileCount, 0) || 0,
        totalFiles: indexResult.filesIndexed || 0,
        filesByExtension: indexResult.metadata?.filesByExtension || {},
        directoryStructure: (indexResult.metadata?.directoryStructure || []).map(dir => ({
          name: dir.name,
          path: dir.path,
          isDirectory: true,
          children: [],
        })),
        detectedFrameworks: indexResult.metadata?.detectedFrameworks || [],
        dependencies: (indexResult.metadata?.dependencies || []).map(dep => ({
          name: dep.name,
          version: dep.version,
          source: dep.source as "npm" | "composer" | "pip" | "maven" | "other",
          isDev: dep.isDev,
        })),
      };

      // Store IndexMetadata in pipeline context with validation
      // Requirements: 28.1 - Store IndexMetadata after INDEX step
      // Requirements: 28.5 - Validate required fields before storing
      this.updateContextWithIndexMetadata(context, indexMetadata);

      // Log indexing statistics with metadata summary
      logger.info("INDEX step completed successfully", {
        filesIndexed: indexResult.filesIndexed,
        completedAt: indexResult.completedAt,
        projectRoot: context.projectRoot,
        metadata: {
          totalChunks: indexMetadata.totalChunks,
          extensionCount: Object.keys(indexMetadata.filesByExtension).length,
          topExtensions: Object.entries(indexMetadata.filesByExtension)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([ext, count]) => `${ext}:${count}`),
          directoryCount: indexMetadata.directoryStructure.length,
          frameworkCount: indexMetadata.detectedFrameworks.length,
          frameworks: indexMetadata.detectedFrameworks,
          dependencyCount: indexMetadata.dependencies.length,
        },
      });

      // Update trace span with indexing metrics
      const traceData = trace.getTrace(runId);
      const span = traceData?.spans.find(s => s.spanId === spanId);
      if (span && span.metadata) {
        span.metadata.filesIndexed = indexResult.filesIndexed;
        span.metadata.completedAt = indexResult.completedAt;
        span.metadata.status = indexResult.status;
      }

      // End trace span with success
      trace.endSpan(runId, spanId, "completed");

      return {
        stepName: "index",
        success: true,
        data: {
          status: indexResult.status,
          filesIndexed: indexResult.filesIndexed,
          completedAt: indexResult.completedAt,
          indexMetadata,
        },
        executedAt: new Date().toISOString(),
      };
    } catch (err) {
      const error = err as Error;

      logger.error("INDEX step failed with exception", {
        error: error.message,
        stack: error.stack,
        projectRoot: context.projectRoot,
      });

      // End trace span with failure
      trace.endSpan(runId, spanId, "failed", {
        message: error.message,
        stack: error.stack,
      });

      return {
        stepName: "index",
        success: false,
        error: {
          code: "INDEX_ERROR",
          message: error.message,
          details: {
            stack: error.stack,
            projectRoot: context.projectRoot,
          },
        },
        executedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Execute the DISCOVER pipeline step
   * 
   * Orchestrates domain discovery using the DomainDiscoveryEngine:
   * 1. Extracts index metadata from context
   * 2. Extracts user exclusions from context
   * 3. Instantiates DomainDiscoveryEngine
   * 4. Executes discovery and stores result in context
   * 
   * Creates a trace span named "domain_discovery" to track execution time
   * and log discovery statistics.
   * 
   * Records discovery metrics in trace:
   * - Discovery execution time (discoveryTimeMs)
   * - Number of domains discovered (totalDomains)
   * - Number of signals extracted (totalSignals)
   * - Fallback flag (fallbackApplied)
   * 
   * Requirements: 1.1, 1.2, 1.3, 5.4, 9.4, 9.5
   * 
   * @param context - Pipeline execution context
   * @returns PipelineStepResult with discovery data
   */
  private async executeDiscoveryStep(
    context: PipelineContext
  ): Promise<PipelineStepResult> {
    // Start trace span for discovery
    const runId = context.runId || "";
    const spanId = trace.startSpan(runId, "domain_discovery", {
      mode: context.mode,
      hasIndexMetadata: !!context.indexMetadata,
      userExclusionsCount: context.userExclusions?.length || 0,
    });

    try {
      logger.info("Starting DISCOVER step", {
        mode: context.mode,
        hasIndexMetadata: !!context.indexMetadata,
        userExclusionsCount: context.userExclusions?.length || 0,
      });

      // Extract index metadata from context
      const indexMetadata = context.indexMetadata;
      
      // Validate that index metadata exists
      if (!indexMetadata) {
        throw new Error(
          "Index metadata not found in context. DISCOVER step requires completed INDEX step."
        );
      }

      // Extract user exclusions from context (optional)
      const userExclusions = context.userExclusions || [];

      // Instantiate DomainDiscoveryEngine
      const discoveryEngine = new DomainDiscoveryEngine();

      // Execute discovery
      logger.debug("Executing domain discovery", {
        totalChunks: indexMetadata.totalChunks,
        totalFiles: indexMetadata.totalFiles,
        exclusionsProvided: userExclusions.length,
      });

      const discoveryResult = await discoveryEngine.discover(
        indexMetadata,
        userExclusions
      );

      // Store result in context for downstream states with validation
      // Requirements: 28.2 - Store DiscoveryResult after DISCOVER step
      // Requirements: 28.5 - Validate required fields before storing
      this.updateContextWithDiscoveryResult(context, discoveryResult);

      // Calculate total signals extracted across all domains
      const totalSignals = discoveryResult.domains.reduce(
        (sum, domain) => sum + domain.signals.length,
        0
      );

      // Log discovery statistics
      logger.info("DISCOVER step completed successfully", {
        totalDomains: discoveryResult.statistics.totalDomains,
        deepDomains: discoveryResult.statistics.deepDomains,
        excludedDomains: discoveryResult.statistics.excludedDomains,
        discoveryTimeMs: discoveryResult.executionMetadata.discoveryTimeMs,
        totalSignals,
        fallbackApplied: discoveryResult.executionMetadata.fallbackApplied,
      });

      // Update trace span with discovery metrics
      const span = trace.getTrace(runId)?.spans.find(s => s.spanId === spanId);
      if (span && span.metadata) {
        // Add discovery metrics to span metadata
        span.metadata.discoveryTimeMs = discoveryResult.executionMetadata.discoveryTimeMs;
        span.metadata.totalDomains = discoveryResult.statistics.totalDomains;
        span.metadata.deepDomains = discoveryResult.statistics.deepDomains;
        span.metadata.excludedDomains = discoveryResult.statistics.excludedDomains;
        span.metadata.totalSignals = totalSignals;
        span.metadata.fallbackApplied = discoveryResult.executionMetadata.fallbackApplied;
        span.metadata.signalTypesUsed = discoveryResult.executionMetadata.signalTypesUsed;
      }

      // End trace span with success
      trace.endSpan(runId, spanId, "completed");

      return {
        stepName: "discover",
        success: true,
        data: discoveryResult,
        executedAt: new Date().toISOString(),
      };
    } catch (err) {
      const error = err as Error;
      
      logger.error("DISCOVER step failed", {
        error: error.message,
        stack: error.stack,
      });

      // End trace span with failure
      trace.endSpan(runId, spanId, "failed", {
        message: error.message,
        stack: error.stack,
      });

      return {
        stepName: "discover",
        success: false,
        error: {
          code: "DISCOVERY_ERROR",
          message: error.message,
          details: error.stack,
        },
        executedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Execute the ANALYZE pipeline step
   * 
   * Orchestrates role-based analysis using the RoleManager:
   * 1. Calls RoleManager.executeRole for each configured role
   * 2. Executes roles in parallel where possible
   * 3. Stores RoleResponse array in pipeline context
   * 4. Handles partial failures (continue if some roles succeed)
   * 
   * Creates a trace span named "analyze" to track execution time
   * and log analysis statistics.
   * 
   * Records analysis metrics in trace:
   * - Analysis execution time
   * - Number of roles executed
   * - Number of successful/failed roles
   * - Total model outputs
   * 
   * Requirements: 26.5, 28.3
   * 
   * @param context - Pipeline execution context
   * @param roles - Array of role types to execute
   * @returns PipelineStepResult with analysis data
   */
  private async executeAnalyzeStep(
    context: PipelineContext,
    roles: RoleType[]
  ): Promise<PipelineStepResult> {
    // Generate step name based on roles
    const stepName = roles.length === 1 
      ? `${roles[0]}_analysis` 
      : "analyze";

    // Start trace span for analysis
    const runId = context.runId || "";
    const spanId = trace.startSpan(runId, stepName, {
      mode: context.mode,
      roles: roles,
      rolesCount: roles.length,
    });

    const startTime = Date.now();

    try {
      logger.info(`Starting ANALYZE step`, {
        mode: context.mode,
        roles: roles,
        rolesCount: roles.length,
        hasDiscoveryResult: !!context.discoveryResult,
      });

      // Build context for role execution
      const roleContext: Record<string, unknown> = {
        projectRoot: context.projectRoot,
        mode: context.mode,
      };

      // Include discovery result if available (for domain-aware analysis)
      if (context.discoveryResult) {
        roleContext.discoveryResult = {
          totalDomains: context.discoveryResult.statistics.totalDomains,
          deepDomains: context.discoveryResult.statistics.deepDomains,
          domains: context.discoveryResult.domains.map(d => ({
            id: d.id,
            name: d.name,
            analysisDepth: d.analysisDepth,
            confidence: d.confidence,
          })),
        };
      }

      // Include index metadata if available
      if (context.indexMetadata) {
        roleContext.indexMetadata = {
          totalFiles: context.indexMetadata.totalFiles,
          totalChunks: context.indexMetadata.totalChunks,
          detectedFrameworks: context.indexMetadata.detectedFrameworks,
        };
      }

      // Execute all roles in parallel
      // Per Requirements 26.5: Execute roles in parallel where possible
      // Note: RoleManager already has merged role config from constructor, no need for modelsOverride
      const rolePromises = roles.map(role => 
        this.roleManager.executeRole({
          role,
          prompt: context.prompt,
          context: roleContext,
        })
      );

      // Wait for all role executions to complete
      const roleResponses = await Promise.all(rolePromises);

      // Analyze results for partial failure handling
      // Per Requirements 26.5: Handle partial failures (continue if some roles succeed)
      const successfulResponses = roleResponses.filter(r => r.success);
      const failedResponses = roleResponses.filter(r => !r.success);

      // Calculate total outputs across all roles
      const totalOutputs = roleResponses.reduce(
        (sum, r) => sum + r.outputs.length,
        0
      );

      // Calculate successful outputs
      const successfulOutputs = roleResponses.reduce(
        (sum, r) => sum + r.outputs.filter(o => !o.error).length,
        0
      );

      // Store RoleResponse array in pipeline context with validation
      // Requirements: 28.3 - Store RoleResponse array after ANALYZE step
      // Requirements: 28.5 - Validate required fields before storing
      this.updateContextWithRoleResponses(context, roleResponses);

      // Check if at least one role succeeded
      const hasSuccessfulRoles = successfulResponses.length > 0;

      const executionTimeMs = Date.now() - startTime;

      // Log analysis statistics
      logger.info(`ANALYZE step completed`, {
        roles: roles,
        totalRoles: roles.length,
        successfulRoles: successfulResponses.length,
        failedRoles: failedResponses.length,
        totalOutputs,
        successfulOutputs,
        executionTimeMs,
        partialSuccess: hasSuccessfulRoles && failedResponses.length > 0,
      });

      // Update trace span with analysis metrics
      const traceData = trace.getTrace(runId);
      const span = traceData?.spans.find(s => s.spanId === spanId);
      if (span && span.metadata) {
        span.metadata.executionTimeMs = executionTimeMs;
        span.metadata.totalRoles = roles.length;
        span.metadata.successfulRoles = successfulResponses.length;
        span.metadata.failedRoles = failedResponses.length;
        span.metadata.totalOutputs = totalOutputs;
        span.metadata.successfulOutputs = successfulOutputs;
      }

      // End trace span
      trace.endSpan(runId, spanId, hasSuccessfulRoles ? "completed" : "failed");

      // Build result with partial failure information if applicable
      const result: PipelineStepResult = {
        stepName,
        success: hasSuccessfulRoles,
        data: {
          roleResponses,
          statistics: {
            totalRoles: roles.length,
            successfulRoles: successfulResponses.length,
            failedRoles: failedResponses.length,
            totalOutputs,
            successfulOutputs,
            executionTimeMs,
          },
        },
        executedAt: new Date().toISOString(),
      };

      // Include error details if there were failures
      // Per Requirements 26.5: Handle partial failures
      if (failedResponses.length > 0) {
        const failedRoleNames = failedResponses.map(r => r.role).join(", ");
        const errorMessages = failedResponses
          .map(r => `${r.role}: ${r.error?.message || "Unknown error"}`)
          .join("; ");

        result.error = {
          code: hasSuccessfulRoles ? "PARTIAL_ANALYSIS_FAILURE" : "ALL_ROLES_FAILED",
          message: hasSuccessfulRoles
            ? `Some roles failed: ${failedRoleNames}. ${successfulResponses.length}/${roles.length} roles succeeded.`
            : `All roles failed: ${failedRoleNames}`,
          details: {
            failedRoles: failedResponses.map(r => ({
              role: r.role,
              error: r.error,
            })),
            successfulRoles: successfulResponses.map(r => r.role),
            errorMessages,
          },
        };
      }

      return result;
    } catch (err) {
      const error = err as Error;
      const executionTimeMs = Date.now() - startTime;

      logger.error(`ANALYZE step failed with exception`, {
        error: error.message,
        stack: error.stack,
        roles: roles,
      });

      // End trace span with failure
      trace.endSpan(runId, spanId, "failed", {
        message: error.message,
        stack: error.stack,
      });

      return {
        stepName,
        success: false,
        error: {
          code: "ANALYSIS_ERROR",
          message: error.message,
          details: {
            stack: error.stack,
            roles: roles,
            executionTimeMs,
          },
        },
        executedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Execute the ANALYZE step for DEEP domains
   * 
   * Orchestrates domain-specific analysis using RoleManager.executeRoleForDomains:
   * 1. Filters to DEEP domains only from DiscoveryResult
   * 2. Calls RoleManager.executeRoleForDomains with domain context
   * 3. Retrieves domain-specific context via RAG (IndexClient.semanticSearch)
   * 4. Tags responses with domainId
   * 5. Stores domain-specific RoleResponse array in pipeline context
   * 
   * Creates a trace span named "deep_domain_analysis" to track execution time
   * and log domain analysis statistics.
   * 
   * Records analysis metrics in trace:
   * - Analysis execution time
   * - Number of DEEP domains analyzed
   * - Number of roles executed per domain
   * - Total domain-specific outputs
   * 
   * Requirements: 26.6
   * 
   * @param context - Pipeline execution context
   * @param roles - Array of role types to execute for each DEEP domain
   * @returns PipelineStepResult with domain analysis data
   */
  private async executeAnalyzeStepForDomains(
    context: PipelineContext,
    roles: RoleType[]
  ): Promise<PipelineStepResult> {
    const stepName = "deep_domain_analysis";

    // Start trace span for domain analysis
    const runId = context.runId || "";
    const spanId = trace.startSpan(runId, stepName, {
      mode: context.mode,
      roles: roles,
      rolesCount: roles.length,
      hasDiscoveryResult: !!context.discoveryResult,
    });

    const startTime = Date.now();

    try {
      logger.info(`Starting ANALYZE step for DEEP domains`, {
        mode: context.mode,
        roles: roles,
        rolesCount: roles.length,
        hasDiscoveryResult: !!context.discoveryResult,
      });

      // Validate that discovery result exists
      if (!context.discoveryResult) {
        logger.warn("No discovery result available for DEEP domain analysis, skipping step");
        
        // End trace span with skip status
        trace.endSpan(runId, spanId, "completed");

        return {
          stepName,
          success: true,
          data: {
            skipped: true,
            reason: "No discovery result available for DEEP domain analysis",
            domainResponses: [],
          },
          executedAt: new Date().toISOString(),
        };
      }

      // Filter to DEEP domains only from DiscoveryResult
      // Per Requirements 26.6: Filter to DEEP domains only
      const deepDomains = context.discoveryResult.domains.filter(
        d => d.analysisDepth === "DEEP"
      );

      // If no DEEP domains, skip analysis
      if (deepDomains.length === 0) {
        logger.info("No DEEP domains found for analysis, skipping step");
        
        // End trace span with skip status
        trace.endSpan(runId, spanId, "completed");

        return {
          stepName,
          success: true,
          data: {
            skipped: true,
            reason: "No DEEP domains found for analysis",
            domainResponses: [],
          },
          executedAt: new Date().toISOString(),
        };
      }

      logger.info(`Found ${deepDomains.length} DEEP domains for analysis`, {
        domainIds: deepDomains.map(d => d.id),
        domainNames: deepDomains.map(d => d.name),
      });

      // Execute roles for each DEEP domain
      // Per Requirements 26.6: Call RoleManager.executeRoleForDomains with domain context
      // This method internally:
      // - Retrieves domain-specific context via RAG (IndexClient.semanticSearch)
      // - Tags responses with domainId
      const allDomainResponses: RoleResponse[] = [];
      const roleExecutionResults: Array<{
        role: RoleType;
        domainCount: number;
        successCount: number;
        failureCount: number;
      }> = [];

      // Execute each role for all DEEP domains
      for (const role of roles) {
        try {
          // Call RoleManager.executeRoleForDomains
          // This method handles:
          // - Filtering to DEEP domains (already done, but method re-filters for safety)
          // - Retrieving domain-specific context via RAG
          // - Tagging responses with domainId
          // Requirements: 24.6, 24.7 - Propagate AbortController signal for request cancellation
          // Note: RoleManager already has merged role config from constructor, no need for modelsOverride
          const domainResponses = await this.roleManager.executeRoleForDomains(
            role,
            deepDomains,
            context.prompt,
            {
              projectRoot: context.projectRoot,
              mode: context.mode,
              indexMetadata: context.indexMetadata ? {
                totalFiles: context.indexMetadata.totalFiles,
                totalChunks: context.indexMetadata.totalChunks,
                detectedFrameworks: context.indexMetadata.detectedFrameworks,
              } : undefined,
            },
            undefined, // modelsOverride no longer needed - RoleManager has merged config
            context.abortController?.signal
          );

          // Collect all domain responses
          allDomainResponses.push(...domainResponses);

          // Track execution results per role
          const successCount = domainResponses.filter(r => r.success).length;
          const failureCount = domainResponses.filter(r => !r.success).length;

          roleExecutionResults.push({
            role,
            domainCount: domainResponses.length,
            successCount,
            failureCount,
          });

          logger.debug(`Completed ${role} for DEEP domains`, {
            role,
            domainCount: domainResponses.length,
            successCount,
            failureCount,
          });
        } catch (err) {
          const error = err as Error;
          logger.error(`Failed to execute ${role} for DEEP domains`, {
            role,
            error: error.message,
          });

          // Track failure for this role
          roleExecutionResults.push({
            role,
            domainCount: 0,
            successCount: 0,
            failureCount: deepDomains.length,
          });
        }
      }

      // Store domain-specific RoleResponse array in pipeline context with validation
      // Requirements: 28.3 - Store RoleResponse array after ANALYZE step
      // Requirements: 28.5 - Validate required fields before storing
      this.updateContextWithRoleResponses(context, allDomainResponses);

      // Calculate statistics
      const totalDomainResponses = allDomainResponses.length;
      const successfulDomainResponses = allDomainResponses.filter(r => r.success).length;
      const failedDomainResponses = allDomainResponses.filter(r => !r.success).length;
      const totalOutputs = allDomainResponses.reduce(
        (sum, r) => sum + r.outputs.length,
        0
      );

      const executionTimeMs = Date.now() - startTime;

      // Log analysis statistics
      logger.info(`ANALYZE step for DEEP domains completed`, {
        deepDomainsCount: deepDomains.length,
        rolesExecuted: roles.length,
        totalDomainResponses,
        successfulDomainResponses,
        failedDomainResponses,
        totalOutputs,
        executionTimeMs,
      });

      // Update trace span with analysis metrics
      const traceData = trace.getTrace(runId);
      const span = traceData?.spans.find(s => s.spanId === spanId);
      if (span && span.metadata) {
        span.metadata.executionTimeMs = executionTimeMs;
        span.metadata.deepDomainsCount = deepDomains.length;
        span.metadata.rolesExecuted = roles.length;
        span.metadata.totalDomainResponses = totalDomainResponses;
        span.metadata.successfulDomainResponses = successfulDomainResponses;
        span.metadata.failedDomainResponses = failedDomainResponses;
        span.metadata.totalOutputs = totalOutputs;
        span.metadata.roleExecutionResults = roleExecutionResults;
      }

      // Determine overall success: at least one domain response must succeed
      const hasSuccessfulResponses = successfulDomainResponses > 0;

      // End trace span
      trace.endSpan(runId, spanId, hasSuccessfulResponses ? "completed" : "failed");

      // Build result
      const result: PipelineStepResult = {
        stepName,
        success: hasSuccessfulResponses,
        data: {
          domainResponses: allDomainResponses,
          statistics: {
            deepDomainsCount: deepDomains.length,
            rolesExecuted: roles.length,
            totalDomainResponses,
            successfulDomainResponses,
            failedDomainResponses,
            totalOutputs,
            executionTimeMs,
            roleExecutionResults,
          },
        },
        executedAt: new Date().toISOString(),
      };

      // Include error details if there were failures
      if (failedDomainResponses > 0) {
        const failedDomainIds = allDomainResponses
          .filter(r => !r.success)
          .map(r => r.domainId)
          .filter((id): id is string => !!id);

        result.error = {
          code: hasSuccessfulResponses ? "PARTIAL_DOMAIN_ANALYSIS_FAILURE" : "ALL_DOMAIN_ANALYSIS_FAILED",
          message: hasSuccessfulResponses
            ? `Some domain analyses failed. ${successfulDomainResponses}/${totalDomainResponses} succeeded.`
            : `All domain analyses failed.`,
          details: {
            failedDomainIds,
            failedResponses: allDomainResponses
              .filter(r => !r.success)
              .map(r => ({
                domainId: r.domainId,
                role: r.role,
                error: r.error,
              })),
            roleExecutionResults,
          },
        };
      }

      return result;
    } catch (err) {
      const error = err as Error;
      const executionTimeMs = Date.now() - startTime;

      logger.error(`ANALYZE step for DEEP domains failed with exception`, {
        error: error.message,
        stack: error.stack,
        roles: roles,
      });

      // End trace span with failure
      trace.endSpan(runId, spanId, "failed", {
        message: error.message,
        stack: error.stack,
      });

      return {
        stepName,
        success: false,
        error: {
          code: "DOMAIN_ANALYSIS_ERROR",
          message: error.message,
          details: {
            stack: error.stack,
            roles: roles,
            executionTimeMs,
          },
        },
        executedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Execute the AGGREGATE pipeline step
   * 
   * Orchestrates aggregation of all role responses using the Aggregator:
   * 1. Calls Aggregator.aggregate with all role responses
   * 2. Passes pipeline mode for aggregation strategy selection
   * 3. Stores FinalArchitecturalReport in pipeline context
   * 4. Handles aggregation failures with fallback
   * 
   * Creates a trace span named "aggregate" to track execution time
   * and log aggregation statistics.
   * 
   * Records aggregation metrics in trace:
   * - Aggregation execution time
   * - Number of role responses aggregated
   * - Number of contributions extracted
   * - Whether fallback was used
   * 
   * Requirements: 26.7
   * 
   * @param context - Pipeline execution context
   * @returns PipelineStepResult with aggregation data
   */
  private async executeAggregateStep(
    context: PipelineContext
  ): Promise<PipelineStepResult> {
    const stepName = "aggregate";

    // Start trace span for aggregation
    const runId = context.runId || "";
    const spanId = trace.startSpan(runId, stepName, {
      mode: context.mode,
      hasRoleResponses: !!context.roleResponses,
      roleResponsesCount: context.roleResponses?.length || 0,
    });

    const startTime = Date.now();

    try {
      logger.info("Starting AGGREGATE step", {
        mode: context.mode,
        hasRoleResponses: !!context.roleResponses,
        roleResponsesCount: context.roleResponses?.length || 0,
      });

      // Validate that role responses exist
      if (!context.roleResponses || context.roleResponses.length === 0) {
        logger.warn("No role responses available for aggregation, skipping step");
        
        // End trace span with skip status
        trace.endSpan(runId, spanId, "completed");

        return {
          stepName,
          success: true,
          data: {
            skipped: true,
            reason: "No role responses available for aggregation",
          },
          executedAt: new Date().toISOString(),
        };
      }

      // Build aggregation input
      // Per Requirements 26.7: Pass pipeline mode for aggregation strategy selection
      const aggregationInput: AggregationInput = {
        mode: context.mode,
        roleResponses: context.roleResponses,
        context: {
          projectRoot: context.projectRoot,
          prompt: context.prompt,
          hasDiscoveryResult: !!context.discoveryResult,
          totalDomains: context.discoveryResult?.statistics.totalDomains || 0,
        },
      };

      logger.debug("Calling Aggregator.aggregate", {
        mode: context.mode,
        roleResponsesCount: context.roleResponses.length,
        totalOutputs: context.roleResponses.reduce(
          (sum, r) => sum + r.outputs.length,
          0
        ),
      });

      // Call Aggregator.aggregate with all role responses
      // Per Requirements 26.7: Call Aggregator.aggregate with all role responses
      const aggregationResult = await this.aggregator.aggregate(aggregationInput);

      const executionTimeMs = Date.now() - startTime;

      // Handle aggregation failures
      // Per Requirements 26.7: Handle aggregation failures with fallback
      if (!aggregationResult.success) {
        const errorMessage = aggregationResult.error?.message || "Aggregation failed without specific error";
        const errorCode = aggregationResult.error?.code || "AGGREGATION_ERROR";

        logger.error("AGGREGATE step failed", {
          error: errorMessage,
          errorCode,
          mode: context.mode,
          executionTimeMs,
        });

        // End trace span with failure
        trace.endSpan(runId, spanId, "failed", {
          message: `${errorCode}: ${errorMessage}`,
        });

        return {
          stepName,
          success: false,
          error: {
            code: errorCode,
            message: errorMessage,
            details: {
              mode: context.mode,
              roleResponsesCount: context.roleResponses.length,
              executionTimeMs,
            },
          },
          executedAt: new Date().toISOString(),
        };
      }

      // Extract FinalArchitecturalReport from aggregation output
      // Per Requirements 26.7: Store FinalArchitecturalReport in pipeline context
      let finalReport: FinalArchitecturalReport | undefined;
      let usedFallback = false;

      if (aggregationResult.output.type === "report") {
        finalReport = aggregationResult.output.data;
        // Check if fallback was used (indicated by metadata.usedFallback)
        usedFallback = finalReport.metadata?.usedFallback === true;
      }

      // Store FinalArchitecturalReport in pipeline context with validation
      // Requirements: 28.6 - Include full context in successful PipelineResult
      // Requirements: 28.5 - Validate required fields before storing
      if (finalReport) {
        this.updateContextWithFinalReport(context, finalReport);
      }

      // Calculate statistics
      const modelsUsed = aggregationResult.metadata?.modelsUsed || [];
      const contributionCount = Object.keys(aggregationResult.metadata?.contributionSummary || {}).length;

      // Log aggregation statistics
      logger.info("AGGREGATE step completed successfully", {
        mode: context.mode,
        outputType: aggregationResult.output.type,
        modelsUsedCount: modelsUsed.length,
        contributionCount,
        usedFallback,
        executionTimeMs,
        hasFinalReport: !!finalReport,
      });

      // Update trace span with aggregation metrics
      const traceData = trace.getTrace(runId);
      const span = traceData?.spans.find(s => s.spanId === spanId);
      if (span && span.metadata) {
        span.metadata.executionTimeMs = executionTimeMs;
        span.metadata.outputType = aggregationResult.output.type;
        span.metadata.modelsUsedCount = modelsUsed.length;
        span.metadata.contributionCount = contributionCount;
        span.metadata.usedFallback = usedFallback;
        span.metadata.hasFinalReport = !!finalReport;
      }

      // End trace span with success
      trace.endSpan(runId, spanId, "completed");

      // Build result
      const result: PipelineStepResult = {
        stepName,
        success: true,
        data: {
          output: aggregationResult.output,
          finalReport,
          statistics: {
            modelsUsed,
            contributionCount,
            usedFallback,
            executionTimeMs,
          },
          metadata: aggregationResult.metadata,
        },
        executedAt: new Date().toISOString(),
      };

      // Include warning if fallback was used
      // Per Requirements 11.6: Include warning in report metadata when fallback is used
      if (usedFallback) {
        result.error = {
          code: "AGGREGATION_FALLBACK_USED",
          message: "LLM synthesis failed, fallback concatenation was used",
          details: {
            warning: finalReport?.metadata?.warning,
            synthesisError: finalReport?.metadata?.synthesisError,
          },
        };
      }

      return result;
    } catch (err) {
      const error = err as Error;
      const executionTimeMs = Date.now() - startTime;

      logger.error("AGGREGATE step failed with exception", {
        error: error.message,
        stack: error.stack,
        mode: context.mode,
      });

      // End trace span with failure
      trace.endSpan(runId, spanId, "failed", {
        message: error.message,
        stack: error.stack,
      });

      return {
        stepName,
        success: false,
        error: {
          code: "AGGREGATION_ERROR",
          message: error.message,
          details: {
            stack: error.stack,
            mode: context.mode,
            executionTimeMs,
          },
        },
        executedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Determine if a step is critical (failure should abort pipeline)
   * 
   * Requirements: 26.4 - INDEX step failure should abort pipeline
   */
  private isCriticalStep(stepName: string): boolean {
    const criticalSteps = ["initialize", "index", "full_index"];
    return criticalSteps.includes(stepName);
  }

  /**
   * Aggregate results from all pipeline steps into final output
   * 
   * Combines step results and context data into a meaningful final result.
   * This method constructs the final data payload that represents the actual
   * value produced by the pipeline, not just execution metadata.
   * 
   * Requirements: 04 - Pipeline final result completion
   * - Return real aggregate data instead of placeholder
   * - Include FinalArchitecturalReport when available
   * - Provide meaningful analysis summary and decisions
   * - Make clear what data is available vs. placeholder
   */
  private async aggregateResults(
    stepResults: PipelineStepResult[],
    context: PipelineContext
  ): Promise<unknown> {
    // Build comprehensive final data based on what was actually produced
    const finalData: Record<string, unknown> = {
      mode: context.mode,
      summary: this.buildPipelineSummary(stepResults, context),
    };

    // Include FinalArchitecturalReport if aggregate step completed successfully
    // This is the primary output for FULL mode pipelines
    if (context.finalReport) {
      finalData.report = context.finalReport;
      finalData.reportAvailable = true;
      
      // Extract key insights from the report for quick access
      finalData.insights = {
        sectionsCount: context.finalReport.sections.length,
        sectionTitles: context.finalReport.sections.map(s => s.title),
        generatedAt: context.finalReport.generatedAt,
        usedFallback: context.finalReport.metadata?.usedFallback || false,
      };
      
      // Include warning if fallback was used
      if (context.finalReport.metadata?.warning) {
        finalData.warning = context.finalReport.metadata.warning;
      }
    } else {
      finalData.reportAvailable = false;
      finalData.reportStatus = this.determineReportStatus(stepResults, context);
    }

    // Include discovery results summary if available
    if (context.discoveryResult) {
      finalData.discovery = {
        totalDomains: context.discoveryResult.statistics.totalDomains,
        deepDomains: context.discoveryResult.statistics.deepDomains,
        excludedDomains: context.discoveryResult.statistics.excludedDomains,
        domains: (context.discoveryResult.domains || []).map(d => ({
          id: d.id,
          name: d.name,
          analysisDepth: d.analysisDepth,
          confidence: d.confidence,
          signalsCount: d.signals?.length || 0,
        })),
      };
    }

    // Include analysis summary if role responses are available
    if (context.roleResponses && context.roleResponses.length > 0) {
      const successfulResponses = context.roleResponses.filter(r => r.success);
      const rolesSummary: Record<string, unknown> = {};
      
      // Group responses by role for summary
      for (const response of successfulResponses) {
        if (!rolesSummary[response.role]) {
          rolesSummary[response.role] = {
            executedAt: response.executedAt,
            outputsCount: response.outputs.length,
            domainSpecific: !!response.domainId,
          };
        }
      }
      
      finalData.analysis = {
        totalRoles: new Set(context.roleResponses.map(r => r.role)).size,
        successfulRoles: new Set(successfulResponses.map(r => r.role)).size,
        totalOutputs: context.roleResponses.reduce((sum, r) => sum + r.outputs.length, 0),
        rolesSummary,
      };
    }

    // Include index metadata summary if available
    if (context.indexMetadata) {
      finalData.index = {
        totalFiles: context.indexMetadata.totalFiles,
        totalChunks: context.indexMetadata.totalChunks,
        detectedFrameworks: context.indexMetadata.detectedFrameworks,
        topExtensions: Object.entries(context.indexMetadata.filesByExtension || {})
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10)
          .map(([ext, count]) => ({ extension: ext, count })),
      };
    }

    // Include execution summary
    finalData.execution = {
      totalSteps: stepResults.length,
      successfulSteps: stepResults.filter(s => s.success).length,
      failedSteps: stepResults.filter(s => !s.success).length,
      completedStepNames: stepResults.filter(s => s.success).map(s => s.stepName),
      failedStepNames: stepResults.filter(s => !s.success).map(s => s.stepName),
    };

    return finalData;
  }

  /**
   * Build a human-readable summary of the pipeline execution
   * 
   * Requirements: 04 - Pipeline final result completion
   * 
   * @param stepResults - Array of step results
   * @param context - Pipeline execution context
   * @returns Summary string describing what was accomplished
   */
  private buildPipelineSummary(
    stepResults: PipelineStepResult[],
    context: PipelineContext
  ): string {
    const successfulSteps = stepResults.filter(s => s.success).length;
    const totalSteps = stepResults.length;
    
    // Build summary based on what was actually completed
    const parts: string[] = [];
    
    if (context.indexReady) {
      parts.push(`indexed ${context.indexMetadata?.totalFiles || 0} files`);
    }
    
    if (context.discoveryComplete) {
      parts.push(`discovered ${context.discoveryResult?.statistics.totalDomains || 0} domains`);
    }
    
    if (context.analysisComplete) {
      const rolesCount = context.roleResponses 
        ? new Set(context.roleResponses.filter(r => r.success).map(r => r.role)).size 
        : 0;
      parts.push(`analyzed with ${rolesCount} roles`);
    }
    
    if (context.aggregationComplete) {
      parts.push(`generated final architectural report`);
    }
    
    if (parts.length === 0) {
      return `Pipeline completed ${successfulSteps}/${totalSteps} steps`;
    }
    
    return `Pipeline ${parts.join(', ')} (${successfulSteps}/${totalSteps} steps completed)`;
  }

  /**
   * Determine why the final report is not available
   * 
   * Requirements: 04 - Pipeline final result completion
   * - Make clear what placeholder data represents
   * - Explicitly state when features are not yet supported
   * 
   * @param stepResults - Array of step results
   * @param context - Pipeline execution context
   * @returns Status message explaining report availability
   */
  private determineReportStatus(
    stepResults: PipelineStepResult[],
    context: PipelineContext
  ): string {
    // Check if aggregate step was attempted
    const aggregateStep = stepResults.find(s => s.stepName === "aggregate");
    
    if (!aggregateStep) {
      // Aggregate step not in pipeline (e.g., QUICK mode)
      if (context.mode === PIPELINE_MODES.QUICK) {
        return "Final report not generated in QUICK mode - use FULL mode for comprehensive analysis";
      }
      return "Aggregate step not executed in this pipeline mode";
    }
    
    if (!aggregateStep.success) {
      // Aggregate step failed
      return `Report generation failed: ${aggregateStep.error?.message || "Unknown error"}`;
    }
    
    if (!context.roleResponses || context.roleResponses.length === 0) {
      return "No analysis data available to aggregate";
    }
    
    // Aggregate step succeeded but no report in context (shouldn't happen)
    return "Report generation completed but report not found in context";
  }

  /**
   * Build execution metadata for pipeline results
   * 
   * Calculates duration, steps completed, and other execution statistics.
   * 
   * Requirements: 28.6, 28.7 - Include execution metadata in results
   * 
   * @param context - Pipeline execution context
   * @param stepResults - Array of step results
   * @param completedAt - ISO timestamp when pipeline completed
   * @returns ExecutionMetadata object
   */
  private buildExecutionMetadata(
    context: PipelineContext,
    stepResults: PipelineStepResult[],
    completedAt: string
  ): import("./types").ExecutionMetadata {
    const startTime = new Date(context.startedAt).getTime();
    const endTime = new Date(completedAt).getTime();
    const durationMs = endTime - startTime;

    const successfulSteps = stepResults.filter(s => s.success);
    const failedSteps = stepResults.filter(s => !s.success);

    return {
      runId: context.runId,
      durationMs,
      stepsCompleted: successfulSteps.map(s => s.stepName),
      totalStepsAttempted: stepResults.length,
      successfulSteps: successfulSteps.length,
      failedSteps: failedSteps.length,
      startedAt: context.startedAt,
      completedAt,
    };
  }

  /**
   * Build full context for successful pipeline results
   * 
   * Creates a PipelineResultContext containing all step results and metadata.
   * 
   * Requirements: 28.6 - Include full context in successful PipelineResult
   * 
   * @param context - Pipeline execution context
   * @param executionMetadata - Execution metadata
   * @returns PipelineResultContext object
   */
  private buildFullContext(
    context: PipelineContext,
    executionMetadata: import("./types").ExecutionMetadata
  ): import("./types").PipelineResultContext {
    return {
      runId: context.runId,
      mode: context.mode,
      projectRoot: context.projectRoot,
      indexMetadata: context.indexMetadata,
      discoveryResult: context.discoveryResult,
      roleResponses: context.roleResponses,
      finalReport: context.finalReport,
      executionMetadata,
    };
  }
}
