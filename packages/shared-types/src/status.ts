/**
 * Pipeline execution status
 */
export enum PipelineStatus {
  PENDING = "pending",
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
}

/**
 * Pipeline execution state machine states
 * Used for tracking the current execution phase of a pipeline run.
 * 
 * State transitions:
 * - IDLE → RUNNING (on pipeline start)
 * - RUNNING → INDEXING (when indexing begins)
 * - INDEXING → DISCOVERING (when discovery begins)
 * - DISCOVERING → ANALYZING (when analysis begins)
 * - ANALYZING → AGGREGATING (when aggregation begins)
 * - AGGREGATING → COMPLETED (when pipeline finishes successfully)
 * - Any active state → FAILED (on step failure)
 * - Any active state → CANCELLED (on cancellation request)
 * 
 * Requirements: 27.1, 27.2, 27.3, 27.4
 */
export enum PipelineExecutionState {
  /** Initial state before pipeline starts */
  IDLE = "IDLE",
  /** Pipeline has started but not yet executing a specific step */
  RUNNING = "RUNNING",
  /** Currently executing the INDEX step */
  INDEXING = "INDEXING",
  /** Currently executing the DISCOVER step */
  DISCOVERING = "DISCOVERING",
  /** Currently executing the ANALYZE step */
  ANALYZING = "ANALYZING",
  /** Currently executing the AGGREGATE step */
  AGGREGATING = "AGGREGATING",
  /** Pipeline completed successfully */
  COMPLETED = "COMPLETED",
  /** Pipeline failed due to an error */
  FAILED = "FAILED",
  /** Pipeline was cancelled by user request */
  CANCELLED = "CANCELLED",
}

/**
 * Index operation status
 */
export enum IndexStatus {
  NOT_STARTED = "not_started",
  IN_PROGRESS = "in_progress",
  READY = "ready",
  FAILED = "failed",
}

/**
 * Generic execution status
 */
export enum ExecutionStatus {
  PENDING = "pending",
  RUNNING = "running",
  SUCCESS = "success",
  ERROR = "error",
}

/**
 * Pipeline state machine states
 */
export enum PipelineState {
  INIT = "INIT",
  INDEX = "INDEX",
  DISCOVER = "DISCOVER",
  ANALYZE = "ANALYZE",
  AGGREGATE = "AGGREGATE",
  SPECIFY = "SPECIFY",
  GENERATE = "GENERATE",
  OUTPUT = "OUTPUT",
  ABORTED = "ABORTED",
  COMPLETED = "COMPLETED",
}
