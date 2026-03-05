/**
 * Tests for PipelineEngine cancellation functionality
 * 
 * Requirements: 27.7 - Handle cancellation request during execution
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { PipelineExecutionState } from "@llm/shared-types";

// Define local PipelineExecutionState for use in tests and mocks
const LocalPipelineExecutionState = {
  IDLE: "IDLE",
  RUNNING: "RUNNING",
  INDEXING: "INDEXING",
  DISCOVERING: "DISCOVERING",
  ANALYZING: "ANALYZING",
  AGGREGATING: "AGGREGATING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

// Mock @llm/shared-types - must be before any imports that use it
vi.mock("@llm/shared-types", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@llm/shared-types")>();
  return {
    ...actual,
    PipelineExecutionState: {
      IDLE: "IDLE",
      RUNNING: "RUNNING",
      INDEXING: "INDEXING",
      DISCOVERING: "DISCOVERING",
      ANALYZING: "ANALYZING",
      AGGREGATING: "AGGREGATING",
      COMPLETED: "COMPLETED",
      FAILED: "FAILED",
      CANCELLED: "CANCELLED",
    },
  };
});

// Mock the logger to avoid initialization issues
vi.mock("../observability/Logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    setRunId: vi.fn(),
    clearRunId: vi.fn(),
  },
}));

import { PipelineExecutionStateMachine } from "../pipeline/executionStateMachine";

/**
 * Tests for PipelineExecutionStateMachine cancellation
 * 
 * Requirements: 27.7 - Transition to CANCELLED state
 */
describe("PipelineExecutionStateMachine Cancellation", () => {
  let stateMachine: PipelineExecutionStateMachine;

  beforeEach(() => {
    stateMachine = new PipelineExecutionStateMachine("test-run-id");
  });

  describe("cancel method", () => {
    it("should transition from RUNNING to CANCELLED", () => {
      stateMachine.start(); // IDLE -> RUNNING
      stateMachine.cancel();
      expect(stateMachine.currentState).toBe("cancelled" as any);
    });

    it("should transition from INDEXING to CANCELLED", () => {
      stateMachine.start(); // IDLE -> RUNNING
      stateMachine.startIndexing(); // RUNNING -> INDEXING
      stateMachine.cancel();
      expect(stateMachine.currentState).toBe("cancelled" as any);
    });

    it("should transition from DISCOVERING to CANCELLED", () => {
      stateMachine.start();
      stateMachine.startIndexing();
      stateMachine.startDiscovering();
      stateMachine.cancel();
      expect(stateMachine.currentState).toBe("cancelled" as any);
    });

    it("should transition from ANALYZING to CANCELLED", () => {
      stateMachine.start();
      stateMachine.startIndexing();
      stateMachine.startDiscovering();
      stateMachine.startAnalyzing();
      stateMachine.cancel();
      expect(stateMachine.currentState).toBe("cancelled" as any);
    });

    it("should transition from AGGREGATING to CANCELLED", () => {
      stateMachine.start();
      stateMachine.startIndexing();
      stateMachine.startDiscovering();
      stateMachine.startAnalyzing();
      stateMachine.startAggregating();
      stateMachine.cancel();
      expect(stateMachine.currentState).toBe("cancelled" as any);
    });

    it("should emit stateChange event when cancelled", () => {
      const stateChangeHandler = vi.fn();
      stateMachine.on("stateChange", stateChangeHandler);

      stateMachine.start();
      stateMachine.cancel();

      // Should have been called twice: once for start, once for cancel
      expect(stateChangeHandler).toHaveBeenCalledTimes(2);
      
      // Check the cancel event
      const cancelEvent = stateChangeHandler.mock.calls[1][0];
      expect(cancelEvent.previousState).toBe("running" as any);
      expect(cancelEvent.newState).toBe("cancelled" as any);
      expect(cancelEvent.stepContext).toBe("pipeline_cancelled");
    });
  });

  describe("isTerminal after cancellation", () => {
    it("should return true after cancellation", () => {
      stateMachine.start();
      stateMachine.cancel();
      expect(stateMachine.isTerminal()).toBe(true);
    });
  });

  describe("canTransitionTo after cancellation", () => {
    it("should not allow any transitions from CANCELLED state", () => {
      stateMachine.start();
      stateMachine.cancel();
      
      expect(stateMachine.canTransitionTo('running' as any)).toBe(false);
      expect(stateMachine.canTransitionTo('indexing' as any)).toBe(false);
      expect(stateMachine.canTransitionTo('completed' as any)).toBe(false);
      expect(stateMachine.canTransitionTo('failed' as any)).toBe(false);
    });
  });

  describe("getValidNextStates after cancellation", () => {
    it("should return empty array from CANCELLED state", () => {
      stateMachine.start();
      stateMachine.cancel();
      
      expect(stateMachine.getValidNextStates()).toEqual([]);
    });
  });
});

/**
 * Tests for VALID_TRANSITIONS including CANCELLED state
 * 
 * Requirements: 27.7 - Transition to CANCELLED state
 */
describe("VALID_TRANSITIONS for CANCELLED state", () => {
  it("should allow RUNNING to transition to CANCELLED", () => {
    const stateMachine = new PipelineExecutionStateMachine("test");
    stateMachine.start();
    expect(stateMachine.canTransitionTo("cancelled" as any)).toBe(true);
  });

  it("should allow INDEXING to transition to CANCELLED", () => {
    const stateMachine = new PipelineExecutionStateMachine("test");
    stateMachine.start();
    stateMachine.startIndexing();
    expect(stateMachine.canTransitionTo(PipelineExecutionState.CANCELLED)).toBe(true);
  });

  it("should allow DISCOVERING to transition to CANCELLED", () => {
    const stateMachine = new PipelineExecutionStateMachine("test");
    stateMachine.start();
    stateMachine.startIndexing();
    stateMachine.startDiscovering();
    expect(stateMachine.canTransitionTo(PipelineExecutionState.CANCELLED)).toBe(true);
  });

  it("should allow ANALYZING to transition to CANCELLED", () => {
    const stateMachine = new PipelineExecutionStateMachine("test");
    stateMachine.start();
    stateMachine.startIndexing();
    stateMachine.startDiscovering();
    stateMachine.startAnalyzing();
    expect(stateMachine.canTransitionTo(PipelineExecutionState.CANCELLED)).toBe(true);
  });

  it("should allow AGGREGATING to transition to CANCELLED", () => {
    const stateMachine = new PipelineExecutionStateMachine("test");
    stateMachine.start();
    stateMachine.startIndexing();
    stateMachine.startDiscovering();
    stateMachine.startAnalyzing();
    stateMachine.startAggregating();
    expect(stateMachine.canTransitionTo(PipelineExecutionState.CANCELLED)).toBe(true);
  });

  it("should NOT allow IDLE to transition to CANCELLED", () => {
    const stateMachine = new PipelineExecutionStateMachine("test");
    expect(stateMachine.canTransitionTo(PipelineExecutionState.CANCELLED)).toBe(false);
  });

  it("should NOT allow COMPLETED to transition to CANCELLED", () => {
    const stateMachine = new PipelineExecutionStateMachine("test");
    stateMachine.start();
    stateMachine.startIndexing();
    stateMachine.startDiscovering();
    stateMachine.startAnalyzing();
    stateMachine.startAggregating();
    stateMachine.complete();
    expect(stateMachine.canTransitionTo("cancelled" as any)).toBe(false);
  });

  it("should NOT allow FAILED to transition to CANCELLED", () => {
    const stateMachine = new PipelineExecutionStateMachine("test");
    stateMachine.start();
    stateMachine.fail("test failure");
    expect(stateMachine.canTransitionTo("cancelled" as any)).toBe(false);
  });
});


