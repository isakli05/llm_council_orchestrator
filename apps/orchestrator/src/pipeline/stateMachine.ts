import { PipelineMode, PIPELINE_MODES } from "@llm/shared-config";
import { PipelineState, StateTransition, StateContext } from "./states";

/**
 * StateMachine defines step sequences and transition rules for each pipeline mode.
 * Pure functional approach - no side effects, only state transitions.
 */
export class StateMachine {
  private readonly maxRetries = 3;

  /**
   * Get the sequence of states for a given pipeline mode
   */
  getStateSequence(mode: PipelineMode): PipelineState[] {
    switch (mode) {
      case PIPELINE_MODES.QUICK:
        return [
          PipelineState.INIT,
          PipelineState.ANALYZE,
          PipelineState.OUTPUT,
          PipelineState.COMPLETED,
        ];

      case PIPELINE_MODES.FULL:
        return [
          PipelineState.INIT,
          PipelineState.INDEX,
          PipelineState.DISCOVER,
          PipelineState.ANALYZE,
          PipelineState.AGGREGATE,
          PipelineState.OUTPUT,
          PipelineState.COMPLETED,
        ];

      case PIPELINE_MODES.SPEC:
        return [
          PipelineState.INIT,
          PipelineState.INDEX,
          PipelineState.DISCOVER,
          PipelineState.ANALYZE,
          PipelineState.AGGREGATE,
          PipelineState.SPECIFY,
          PipelineState.OUTPUT,
          PipelineState.COMPLETED,
        ];

      case PIPELINE_MODES.REFINEMENT:
        return [
          PipelineState.INIT,
          PipelineState.INDEX,
          PipelineState.DISCOVER,
          PipelineState.ANALYZE,
          PipelineState.GENERATE,
          PipelineState.OUTPUT,
          PipelineState.COMPLETED,
        ];

      default:
        return [PipelineState.INIT, PipelineState.ABORTED];
    }
  }

  /**
   * Determine the next state based on current context
   */
  transition(context: StateContext): StateTransition {
    const { currentState, mode, stepResult, retryCount } = context;

    // If step failed
    if (stepResult && !stepResult.success) {
      // Check if retryable
      if (this.isRetryable(currentState) && retryCount < this.maxRetries) {
        return {
          nextState: currentState, // Stay in same state for retry
          shouldRetry: true,
          retryCount: retryCount + 1,
        };
      }

      // Check if fatal
      if (this.isFatalState(currentState)) {
        return {
          nextState: PipelineState.ABORTED,
          shouldRetry: false,
          error: {
            code: "FATAL_STATE_ERROR",
            message: `Fatal error in state ${currentState}`,
          },
        };
      }

      // Non-fatal, skip to next state
      const sequence = this.getStateSequence(mode as PipelineMode);
      const currentIndex = sequence.indexOf(currentState);
      const nextState = sequence[currentIndex + 1] || PipelineState.ABORTED;

      return {
        nextState,
        shouldRetry: false,
      };
    }

    // Step succeeded, move to next state
    const sequence = this.getStateSequence(mode as PipelineMode);
    const currentIndex = sequence.indexOf(currentState);
    const nextState = sequence[currentIndex + 1] || PipelineState.COMPLETED;

    return {
      nextState,
      shouldRetry: false,
      retryCount: 0, // Reset retry count on success
    };
  }

  /**
   * Check if a state allows retries on failure
   */
  private isRetryable(state: PipelineState): boolean {
    const retryableStates = [
      PipelineState.INDEX,
      PipelineState.ANALYZE,
      PipelineState.AGGREGATE,
    ];
    return retryableStates.includes(state);
  }

  /**
   * Check if failure in this state should abort the entire pipeline
   */
  private isFatalState(state: PipelineState): boolean {
    const fatalStates = [PipelineState.INIT];
    return fatalStates.includes(state);
  }

  /**
   * Check if a guard condition is met for entering a state
   * Guards can check prerequisites like "is index ready?"
   */
  checkGuard(state: PipelineState, context: Record<string, unknown>): boolean {
    switch (state) {
      case PipelineState.INDEX:
        // Always allow INDEX state
        return true;

      case PipelineState.DISCOVER:
        // Require index to be ready
        return context.indexReady === true;

      case PipelineState.ANALYZE:
        // For quick mode, no index or discovery required
        if (context.mode === PIPELINE_MODES.QUICK) {
          return true;
        }
        // For other modes, require discovery to be complete
        return context.discoveryComplete === true;

      case PipelineState.AGGREGATE:
        // Require analysis results
        return context.analysisComplete === true;

      case PipelineState.SPECIFY:
        // Require aggregation complete
        return context.aggregationComplete === true;

      case PipelineState.GENERATE:
        // Require analysis complete
        return context.analysisComplete === true;

      default:
        return true;
    }
  }
}
