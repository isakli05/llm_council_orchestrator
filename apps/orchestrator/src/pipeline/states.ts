import { PipelineState, ApiError } from "@llm/shared-types";

// Re-export for convenience
export { PipelineState };

/**
 * Transition result from state machine
 */
export interface StateTransition {
  nextState: PipelineState;
  shouldRetry: boolean;
  retryCount?: number;
  error?: ApiError;
}

/**
 * Context for state transitions
 */
export interface StateContext {
  currentState: PipelineState;
  mode: string;
  stepResult?: {
    success: boolean;
    error?: unknown;
  };
  retryCount: number;
  maxRetries: number;
}
