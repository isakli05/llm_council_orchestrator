import { PipelineMode } from "@llm/shared-config";
import { ApiError, FinalArchitecturalReport, PipelineExecutionState, DiscoveryResult } from "@llm/shared-types";
import { IndexMetadata, DomainExclusion } from "../discovery/types";
import { RoleResponse } from "../roles/types";

// Re-export DiscoveryResult for convenience
export type { DiscoveryResult };

/**
 * Default timeout for pipeline steps in milliseconds (5 minutes)
 * Can be overridden via PipelineConfig.stepTimeoutMs
 * 
 * Requirements: 24.3 - Set timeout per pipeline step
 */
export const DEFAULT_STEP_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Pipeline configuration options
 * Contains user-provided configuration for pipeline execution.
 * 
 * Requirements: 28.2 - Include user configuration
 */
export interface PipelineConfig {
  /** Maximum number of retries for failed steps */
  maxRetries?: number;
  /** Timeout in milliseconds for each step */
  stepTimeoutMs?: number;
  /** Whether to continue on non-critical step failures */
  continueOnNonCriticalFailure?: boolean;
  /** Custom model configurations per role */
  modelOverrides?: Record<string, string | string[]>;
  /** Additional provider-specific options */
  providerOptions?: Record<string, unknown>;
}

/**
 * Error information for a failed pipeline step
 * 
 * Requirements: 28.7 - Include partial context in error response
 */
export interface StepError {
  /** Name of the step that failed */
  stepName: string;
  /** Error code for categorization */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Additional error details */
  details?: unknown;
  /** Whether the error is retryable */
  retryable?: boolean;
  /** Timestamp when the error occurred */
  occurredAt: string;
}

/**
 * Pipeline step identifier
 * Represents the different steps in pipeline execution.
 * 
 * Requirements: 28.1, 28.2, 28.3 - Track step execution
 */
export type PipelineStep = 
  | "initialize"
  | "index"
  | "discover"
  | "legacy_analysis"
  | "architect_analysis"
  | "migration_analysis"
  | "security_analysis"
  | "quick_analysis"
  | "deep_domain_analysis"
  | "aggregate"
  | "spec_generation"
  | "context_load"
  | "refinement_analysis";

/**
 * Context for a single pipeline execution
 * 
 * Maintains execution context across steps, providing access to results
 * from previous steps and tracking execution state.
 * 
 * Requirements: 28.1, 28.2, 28.3, 28.4, 28.5, 28.6, 28.7
 * - 28.1: Store IndexMetadata after INDEX step
 * - 28.2: Store DiscoveryResult after DISCOVER step
 * - 28.3: Store RoleResponse array after ANALYZE step
 * - 28.4: Provide read-only access to previous step results
 * - 28.5: Validate required fields before storing
 * - 28.6: Include full context in successful PipelineResult
 * - 28.7: Include partial context in error response
 */
export interface PipelineContext {
  // ============================================
  // Pipeline Metadata (Requirements: 28.1, 28.2)
  // ============================================
  
  /** Unique identifier for this pipeline run */
  runId: string;
  
  /** Pipeline execution mode (QUICK, FULL, SPEC, REFINEMENT) */
  mode: PipelineMode;
  
  /** ISO timestamp when pipeline execution started */
  startedAt: string;
  
  /** User prompt for analysis */
  prompt: string;
  
  /** Pipeline configuration options */
  config: PipelineConfig;
  
  // ============================================
  // User Configuration (Requirements: 28.2)
  // ============================================
  
  /** Root directory of the project to analyze */
  projectRoot: string;
  
  /** Whether to force a full reindex */
  forceReindex?: boolean;
  
  /** User-specified domain exclusions */
  userExclusions?: DomainExclusion[];
  
  // ============================================
  // Step Results (Requirements: 28.1, 28.2, 28.3)
  // Populated as steps complete
  // ============================================
  
  /** 
   * Index metadata from INDEX step
   * Requirements: 28.1 - Store IndexMetadata after INDEX step
   */
  indexMetadata?: IndexMetadata;
  
  /** Whether indexing has completed successfully */
  indexReady?: boolean;
  
  /** 
   * Discovery result from DISCOVER step
   * Requirements: 28.2 - Store DiscoveryResult after DISCOVER step
   */
  discoveryResult?: DiscoveryResult;
  
  /** Whether discovery has completed successfully */
  discoveryComplete?: boolean;
  
  /** 
   * Role responses from ANALYZE step
   * Requirements: 28.3 - Store RoleResponse array after ANALYZE step
   */
  roleResponses?: RoleResponse[];
  
  /** Whether analysis has completed successfully */
  analysisComplete?: boolean;
  
  /** 
   * Final aggregated report from AGGREGATE step
   * Requirements: 28.6 - Include full context in successful PipelineResult
   */
  finalReport?: FinalArchitecturalReport;
  
  /** Whether aggregation has completed successfully */
  aggregationComplete?: boolean;
  
  // ============================================
  // Execution State (Requirements: 27.1, 27.2)
  // ============================================
  
  /** 
   * Current step being executed
   * Updated as pipeline progresses through steps
   */
  currentStep?: PipelineStep;
  
  /** 
   * Array of completed step names
   * Tracks which steps have finished successfully
   */
  completedSteps: PipelineStep[];
  
  /** 
   * Array of errors from failed steps
   * Requirements: 28.7 - Include partial context in error response
   */
  errors: StepError[];
  
  // ============================================
  // Cancellation Support (Requirements: 27.7)
  // ============================================
  
  /** AbortController for cancellation support */
  abortController?: AbortController;
  
  /** Whether the pipeline has been cancelled */
  cancelled?: boolean;
}

/**
 * Represents an active pipeline run with its execution state
 * Used for tracking and managing running pipelines
 * 
 * Requirements: 27.7 - Support pipeline cancellation
 */
export interface ActivePipelineRun {
  runId: string;
  context: PipelineContext;
  abortController: AbortController;
  startedAt: string;
  currentStep?: string;
}

/**
 * Result from a single pipeline step
 */
export interface PipelineStepResult {
  stepName: string;
  success: boolean;
  data?: unknown;
  error?: ApiError;
  executedAt: string;
}

/**
 * Execution metadata for pipeline results
 * 
 * Requirements: 28.6, 28.7 - Include execution metadata in results
 */
export interface ExecutionMetadata {
  /** Pipeline run identifier - consistent across API, tracing, and state management */
  runId: string;
  /** Total duration of pipeline execution in milliseconds */
  durationMs: number;
  /** Array of step names that completed successfully */
  stepsCompleted: string[];
  /** Total number of steps attempted */
  totalStepsAttempted: number;
  /** Number of steps that succeeded */
  successfulSteps: number;
  /** Number of steps that failed */
  failedSteps: number;
  /** ISO timestamp when pipeline started */
  startedAt: string;
  /** ISO timestamp when pipeline completed */
  completedAt: string;
}

/**
 * Full context data included in successful pipeline results
 * 
 * Requirements: 28.6 - Include full context in successful PipelineResult
 */
export interface PipelineResultContext {
  /** Pipeline run identifier */
  runId: string;
  /** Pipeline execution mode */
  mode: PipelineMode;
  /** Project root directory */
  projectRoot: string;
  /** Index metadata from INDEX step (if completed) */
  indexMetadata?: IndexMetadata;
  /** Discovery result from DISCOVER step (if completed) */
  discoveryResult?: DiscoveryResult;
  /** Role responses from ANALYZE step (if completed) */
  roleResponses?: RoleResponse[];
  /** Final aggregated report from AGGREGATE step (if completed) */
  finalReport?: FinalArchitecturalReport;
  /** Execution metadata with timing and step information */
  executionMetadata: ExecutionMetadata;
}

/**
 * Final result returned to the user
 * 
 * Requirements: 28.6, 28.7
 * - 28.6: Include full context in successful PipelineResult
 * - 28.7: Include partial context in error response
 */
export interface PipelineResult {
  success: boolean;
  mode: PipelineMode;
  /** 
   * Full context data for successful results, partial context for errors
   * Requirements: 28.6, 28.7
   */
  data?: unknown;
  /** 
   * Full pipeline context (only included on success)
   * Requirements: 28.6 - Include full context in successful PipelineResult
   */
  context?: PipelineResultContext;
  error?: ApiError;
  steps?: PipelineStepResult[];
  /** 
   * Execution metadata with duration and steps completed
   * Requirements: 28.6, 28.7 - Include execution metadata
   */
  executionMetadata?: ExecutionMetadata;
  completedAt?: string;
}

/**
 * Read-only version of PipelineContext for step access
 * 
 * This type represents an immutable copy of the pipeline context
 * that prevents direct mutation of context data.
 * 
 * Requirements: 28.4 - Provide read-only access to previous step results
 */
export type ReadonlyPipelineContext = Readonly<PipelineContext>;
