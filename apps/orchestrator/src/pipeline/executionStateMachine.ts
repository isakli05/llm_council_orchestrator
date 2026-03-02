import { PipelineExecutionState } from "@llm/shared-types";
import { EventEmitter } from "events";
import { logger } from "../observability/Logger";

/**
 * State change event data emitted when state transitions occur.
 * Requirements: 27.5
 */
export interface StateChangeEvent {
  previousState: PipelineExecutionState;
  newState: PipelineExecutionState;
  timestamp: string;
  stepContext?: string;
}

/**
 * Error thrown when an invalid state transition is attempted.
 * Requirements: 27.6
 */
export class InvalidStateTransitionError extends Error {
  public readonly currentState: PipelineExecutionState;
  public readonly attemptedState: PipelineExecutionState;
  public readonly code = "INVALID_STATE_TRANSITION";

  constructor(
    currentState: PipelineExecutionState,
    attemptedState: PipelineExecutionState
  ) {
    super(
      `Invalid state transition from ${currentState} to ${attemptedState}`
    );
    this.name = "InvalidStateTransitionError";
    this.currentState = currentState;
    this.attemptedState = attemptedState;
  }
}

/**
 * Valid state transitions map.
 * Defines which states can transition to which other states.
 * Requirements: 27.1, 27.2, 27.3, 27.4
 */
export const VALID_TRANSITIONS: ReadonlyMap<
  PipelineExecutionState,
  ReadonlySet<PipelineExecutionState>
> = new Map<PipelineExecutionState, Set<PipelineExecutionState>>([
  // IDLE can only transition to RUNNING (on pipeline start)
  [
    PipelineExecutionState.IDLE,
    new Set<PipelineExecutionState>([PipelineExecutionState.RUNNING]),
  ],

  // RUNNING can transition to INDEXING, or directly to FAILED/CANCELLED
  [
    PipelineExecutionState.RUNNING,
    new Set<PipelineExecutionState>([
      PipelineExecutionState.INDEXING,
      PipelineExecutionState.FAILED,
      PipelineExecutionState.CANCELLED,
    ]),
  ],

  // INDEXING can transition to DISCOVERING (next step), FAILED, or CANCELLED
  [
    PipelineExecutionState.INDEXING,
    new Set<PipelineExecutionState>([
      PipelineExecutionState.DISCOVERING,
      PipelineExecutionState.FAILED,
      PipelineExecutionState.CANCELLED,
    ]),
  ],

  // DISCOVERING can transition to ANALYZING (next step), FAILED, or CANCELLED
  [
    PipelineExecutionState.DISCOVERING,
    new Set<PipelineExecutionState>([
      PipelineExecutionState.ANALYZING,
      PipelineExecutionState.FAILED,
      PipelineExecutionState.CANCELLED,
    ]),
  ],

  // ANALYZING can transition to AGGREGATING (next step), FAILED, or CANCELLED
  [
    PipelineExecutionState.ANALYZING,
    new Set<PipelineExecutionState>([
      PipelineExecutionState.AGGREGATING,
      PipelineExecutionState.FAILED,
      PipelineExecutionState.CANCELLED,
    ]),
  ],

  // AGGREGATING can transition to COMPLETED (success), FAILED, or CANCELLED
  [
    PipelineExecutionState.AGGREGATING,
    new Set<PipelineExecutionState>([
      PipelineExecutionState.COMPLETED,
      PipelineExecutionState.FAILED,
      PipelineExecutionState.CANCELLED,
    ]),
  ],

  // Terminal states - no transitions allowed
  [PipelineExecutionState.COMPLETED, new Set<PipelineExecutionState>()],
  [PipelineExecutionState.FAILED, new Set<PipelineExecutionState>()],
  [PipelineExecutionState.CANCELLED, new Set<PipelineExecutionState>()],
]);

/**
 * Check if a state transition is valid.
 * @param from - Current state
 * @param to - Target state
 * @returns true if the transition is valid, false otherwise
 */
export function isValidTransition(
  from: PipelineExecutionState,
  to: PipelineExecutionState
): boolean {
  const validTargets = VALID_TRANSITIONS.get(from);
  if (!validTargets) {
    return false;
  }
  return validTargets.has(to);
}

/**
 * Validate a state transition and throw if invalid.
 * Logs invalid transition attempts at WARN level before throwing.
 * 
 * Requirements: 27.6 - Throw InvalidStateTransitionError on invalid transition,
 *                      Log invalid transition attempts at WARN level
 * 
 * @param from - Current state
 * @param to - Target state
 * @throws InvalidStateTransitionError if the transition is not valid
 */
export function validateTransition(
  from: PipelineExecutionState,
  to: PipelineExecutionState
): void {
  if (!isValidTransition(from, to)) {
    // Log invalid transition attempt at WARN level
    // Requirements: 27.6 - Log invalid transition attempts at WARN level
    logger.warn(`Invalid state transition attempted: ${from} → ${to}`, {
      currentState: from,
      attemptedState: to,
      validTransitions: getValidTransitions(from),
    });
    throw new InvalidStateTransitionError(from, to);
  }
}

/**
 * Get all valid target states from a given state.
 * @param from - Current state
 * @returns Array of valid target states
 */
export function getValidTransitions(
  from: PipelineExecutionState
): PipelineExecutionState[] {
  const validTargets = VALID_TRANSITIONS.get(from);
  return validTargets ? Array.from(validTargets) : [];
}

/**
 * Check if a state is a terminal state (no further transitions possible).
 * @param state - State to check
 * @returns true if the state is terminal
 */
export function isTerminalState(state: PipelineExecutionState): boolean {
  const validTargets = VALID_TRANSITIONS.get(state);
  return !validTargets || validTargets.size === 0;
}

/**
 * Check if a state is an active execution state (not IDLE or terminal).
 * @param state - State to check
 * @returns true if the state represents active execution
 */
export function isActiveState(state: PipelineExecutionState): boolean {
  return (
    state !== PipelineExecutionState.IDLE &&
    !isTerminalState(state)
  );
}

/**
 * Get the step states in execution order.
 * These are the states that represent actual pipeline step execution.
 */
export const STEP_STATES: readonly PipelineExecutionState[] = [
  PipelineExecutionState.INDEXING,
  PipelineExecutionState.DISCOVERING,
  PipelineExecutionState.ANALYZING,
  PipelineExecutionState.AGGREGATING,
] as const;

/**
 * Get the next step state in the execution sequence.
 * @param current - Current step state
 * @returns Next step state, or COMPLETED if at the last step
 */
export function getNextStepState(
  current: PipelineExecutionState
): PipelineExecutionState {
  const currentIndex = STEP_STATES.indexOf(current);
  if (currentIndex === -1) {
    // Not a step state
    if (current === PipelineExecutionState.RUNNING) {
      return PipelineExecutionState.INDEXING;
    }
    return current;
  }
  if (currentIndex === STEP_STATES.length - 1) {
    // Last step, transition to COMPLETED
    return PipelineExecutionState.COMPLETED;
  }
  return STEP_STATES[currentIndex + 1];
}

/**
 * PipelineExecutionStateMachine manages state transitions for pipeline execution.
 * 
 * This class provides:
 * - State tracking for a single pipeline run
 * - Validated state transitions (throws on invalid transitions)
 * - Event emission for state changes
 * - Helper methods for common transition patterns
 * 
 * State Machine Flow:
 * ```
 *      IDLE
 *        │
 *        ▼ start()
 *     RUNNING
 *        │
 *        ├──► INDEXING ──► DISCOVERING ──► ANALYZING ──► AGGREGATING
 *        │         │              │              │              │
 *        │         ▼              ▼              ▼              ▼
 *        │      FAILED         FAILED         FAILED         FAILED
 *        │
 *        └──► CANCELLED (on cancel request)
 *        
 *     AGGREGATING ──► COMPLETED
 * ```
 * 
 * Requirements: 27.1, 27.2, 27.3, 27.4, 27.5, 27.6
 */
export class PipelineExecutionStateMachine extends EventEmitter {
  private _currentState: PipelineExecutionState = PipelineExecutionState.IDLE;
  private readonly _runId: string;
  private _completedSteps: PipelineExecutionState[] = [];

  /**
   * Create a new state machine instance for a pipeline run.
   * @param runId - Unique identifier for the pipeline run
   */
  constructor(runId: string) {
    super();
    this._runId = runId;
  }

  /**
   * Get the current state of the pipeline.
   */
  get currentState(): PipelineExecutionState {
    return this._currentState;
  }

  /**
   * Get the run ID for this state machine.
   */
  get runId(): string {
    return this._runId;
  }

  /**
   * Get the list of completed step states.
   */
  get completedSteps(): readonly PipelineExecutionState[] {
    return [...this._completedSteps];
  }

  /**
   * Transition to a new state.
   * 
   * Validates the transition and throws InvalidStateTransitionError if invalid.
   * Emits a 'stateChange' event on successful transition.
   * Logs state transitions at INFO level.
   * 
   * Requirements: 27.2, 27.5, 27.6
   * 
   * @param newState - Target state to transition to
   * @param stepContext - Optional context about the step (for logging/events)
   * @throws InvalidStateTransitionError if the transition is not valid
   */
  transition(newState: PipelineExecutionState, stepContext?: string): void {
    const previousState = this._currentState;

    // Validate the transition
    // Requirements: 27.6 - Throw InvalidStateTransitionError on invalid transition
    validateTransition(previousState, newState);

    // Perform the transition
    this._currentState = newState;

    // Track completed steps
    if (STEP_STATES.includes(previousState) && !this._completedSteps.includes(previousState)) {
      this._completedSteps.push(previousState);
    }

    // Create timestamp for event
    const timestamp = new Date().toISOString();

    // Emit state change event
    // Requirements: 27.5 - Emit state change event with previous and new state
    const event: StateChangeEvent = {
      previousState,
      newState,
      timestamp,
      stepContext,
    };
    this.emit("stateChange", event);

    // Log state transition at INFO level
    // Requirements: 27.5 - Log state transitions at INFO level
    logger.info(`Pipeline state transition: ${previousState} → ${newState}`, {
      runId: this._runId,
      previousState,
      newState,
      timestamp,
      stepContext,
    });
  }

  /**
   * Start the pipeline execution.
   * Transitions from IDLE to RUNNING.
   * 
   * Requirements: 27.2 - Transition IDLE → RUNNING on pipeline start
   * 
   * @throws InvalidStateTransitionError if not in IDLE state
   */
  start(): void {
    this.transition(PipelineExecutionState.RUNNING, "pipeline_start");
  }

  /**
   * Transition to the next step state in the execution sequence.
   * 
   * Requirements: 27.3 - Transition through step states on step completion
   * 
   * @param stepContext - Optional context about the completed step
   * @throws InvalidStateTransitionError if the transition is not valid
   */
  completeStep(stepContext?: string): void {
    const nextState = getNextStepState(this._currentState);
    this.transition(nextState, stepContext);
  }

  /**
   * Transition to INDEXING state.
   * Called when the INDEX step begins.
   * 
   * @throws InvalidStateTransitionError if not in RUNNING state
   */
  startIndexing(): void {
    this.transition(PipelineExecutionState.INDEXING, "index_start");
  }

  /**
   * Transition to DISCOVERING state.
   * Called when the DISCOVER step begins.
   * 
   * @throws InvalidStateTransitionError if not in INDEXING state
   */
  startDiscovering(): void {
    this.transition(PipelineExecutionState.DISCOVERING, "discover_start");
  }

  /**
   * Transition to ANALYZING state.
   * Called when the ANALYZE step begins.
   * 
   * @throws InvalidStateTransitionError if not in DISCOVERING state
   */
  startAnalyzing(): void {
    this.transition(PipelineExecutionState.ANALYZING, "analyze_start");
  }

  /**
   * Transition to AGGREGATING state.
   * Called when the AGGREGATE step begins.
   * 
   * @throws InvalidStateTransitionError if not in ANALYZING state
   */
  startAggregating(): void {
    this.transition(PipelineExecutionState.AGGREGATING, "aggregate_start");
  }

  /**
   * Transition to COMPLETED state.
   * Called when all pipeline steps complete successfully.
   * 
   * Requirements: 27.4 - Transition to COMPLETED when all steps done
   * 
   * @throws InvalidStateTransitionError if not in AGGREGATING state
   */
  complete(): void {
    this.transition(PipelineExecutionState.COMPLETED, "pipeline_complete");
  }

  /**
   * Transition to FAILED state.
   * Called when a step fails and the pipeline cannot continue.
   * 
   * Requirements: 27.3 - Transition to FAILED on step failure
   * 
   * @param stepContext - Context about the failure (e.g., which step failed)
   * @throws InvalidStateTransitionError if already in a terminal state
   */
  fail(stepContext?: string): void {
    this.transition(PipelineExecutionState.FAILED, stepContext || "pipeline_failed");
  }

  /**
   * Transition to CANCELLED state.
   * Called when the pipeline is cancelled by user request.
   * 
   * Requirements: 27.7 - Transition to CANCELLED state on cancellation
   * 
   * @throws InvalidStateTransitionError if already in a terminal state
   */
  cancel(): void {
    this.transition(PipelineExecutionState.CANCELLED, "pipeline_cancelled");
  }

  /**
   * Check if the pipeline is in a terminal state (COMPLETED, FAILED, or CANCELLED).
   */
  isTerminal(): boolean {
    return isTerminalState(this._currentState);
  }

  /**
   * Check if the pipeline is actively executing (not IDLE or terminal).
   */
  isActive(): boolean {
    return isActiveState(this._currentState);
  }

  /**
   * Check if the pipeline can transition to a given state.
   * @param targetState - State to check
   * @returns true if the transition is valid
   */
  canTransitionTo(targetState: PipelineExecutionState): boolean {
    return isValidTransition(this._currentState, targetState);
  }

  /**
   * Get all valid states that can be transitioned to from the current state.
   * @returns Array of valid target states
   */
  getValidNextStates(): PipelineExecutionState[] {
    return getValidTransitions(this._currentState);
  }

  /**
   * Reset the state machine to IDLE state.
   * This is useful for reusing the state machine instance.
   * Note: This bypasses normal transition validation.
   */
  reset(): void {
    const previousState = this._currentState;
    this._currentState = PipelineExecutionState.IDLE;
    this._completedSteps = [];

    const event: StateChangeEvent = {
      previousState,
      newState: PipelineExecutionState.IDLE,
      timestamp: new Date().toISOString(),
      stepContext: "state_machine_reset",
    };
    this.emit("stateChange", event);
  }
}
