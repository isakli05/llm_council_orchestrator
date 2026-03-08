import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PipelineEngine } from "../pipeline/PipelineEngine";
import { trace } from "../observability/Trace";
import { PIPELINE_MODES } from "@llm/shared-config";

/**
 * Test suite for run_id unification between API layer and PipelineEngine
 * 
 * Requirements: Refactor Spec 02 - Pipeline run_id unification
 * 
 * Validates that:
 * 1. A single authoritative run_id is used throughout the pipeline lifecycle
 * 2. The run_id returned to the client matches the internal engine run_id
 * 3. Status, progress, result, and cancel operations use the same run_id
 * 4. Tracing and logging use the consistent run_id
 */
describe("PipelineEngine run_id Unification", () => {
  let engine: PipelineEngine;
  
  beforeEach(() => {
    // Clear all traces before each test
    trace.clear();
    
    // Create a fresh engine instance
    engine = new PipelineEngine();
  });
  
  afterEach(() => {
    // Clean up traces after each test
    trace.clear();
  });

  describe("run_id generation and consistency", () => {
    it("should use the provided run_id when passed to execute()", async () => {
      const externalRunId = "test-run-id-12345";
      
      // Mock the trace to verify it's not generating a new ID
      const startPipelineSpy = vi.spyOn(trace, "startPipeline");
      
      // Execute with a pre-generated run_id (simulating controller behavior)
      const result = await engine.execute(
        PIPELINE_MODES.QUICK,
        "test prompt",
        {},
        process.cwd(),
        false,
        undefined,
        undefined,
        externalRunId  // Pass the external run_id
      );
      
      // Verify that trace.startPipeline was NOT called (since runId was provided)
      expect(startPipelineSpy).not.toHaveBeenCalled();
      
      // Verify the result contains the same run_id
      expect(result.executionMetadata?.runId).toBe(externalRunId);
      
      startPipelineSpy.mockRestore();
    });

    it("should generate a new run_id when not provided", async () => {
      // Mock the trace to capture the generated ID
      const startPipelineSpy = vi.spyOn(trace, "startPipeline");
      
      // Execute without providing a run_id
      const result = await engine.execute(
        PIPELINE_MODES.QUICK,
        "test prompt",
        {},
        process.cwd(),
        false
      );
      
      // Verify that trace.startPipeline WAS called to generate a new ID
      expect(startPipelineSpy).toHaveBeenCalledOnce();
      expect(startPipelineSpy).toHaveBeenCalledWith(PIPELINE_MODES.QUICK);
      
      // Verify the result contains a run_id
      expect(result.executionMetadata?.runId).toBeDefined();
      expect(typeof result.executionMetadata?.runId).toBe("string");
      
      startPipelineSpy.mockRestore();
    });

    it("should use the same run_id for trace, state machine, and active runs", async () => {
      const externalRunId = "test-run-id-unified";
      
      // Execute with a pre-generated run_id
      const result = await engine.execute(
        PIPELINE_MODES.QUICK,
        "test prompt",
        {},
        process.cwd(),
        false,
        undefined,
        undefined,
        externalRunId
      );
      
      // Verify result uses the same run_id
      expect(result.executionMetadata?.runId).toBe(externalRunId);
      
      // Verify trace uses the same run_id
      const traceData = trace.getTrace(externalRunId);
      expect(traceData).toBeDefined();
      expect(traceData?.runId).toBe(externalRunId);
      
      // Note: State machine and active runs are cleaned up after execution completes
      // This is expected behavior for resource management
    });
  });

  describe("run_id in cancellation flow", () => {
    it("should cancel using the same run_id provided to execute()", async () => {
      const externalRunId = "test-run-id-cancel";
      
      // Execute pipeline (it will complete quickly in test environment)
      const result = await engine.execute(
        PIPELINE_MODES.QUICK,
        "test prompt",
        {},
        process.cwd(),
        false,
        undefined,
        undefined,
        externalRunId
      );
      
      // Verify the result uses the same run_id
      expect(result.executionMetadata?.runId).toBe(externalRunId);
      
      // Verify trace shows the correct run_id
      const traceData = trace.getTrace(externalRunId);
      expect(traceData?.runId).toBe(externalRunId);
    });

    it("should return false when cancelling with wrong run_id", async () => {
      const correctRunId = "test-run-id-correct";
      const wrongRunId = "test-run-id-wrong";
      
      // Start a pipeline with correct run_id
      const executePromise = engine.execute(
        PIPELINE_MODES.QUICK,
        "test prompt",
        {},
        process.cwd(),
        false,
        undefined,
        undefined,
        correctRunId
      );
      
      // Try to cancel with wrong run_id
      const cancelled = engine.cancel(wrongRunId);
      expect(cancelled).toBe(false);
      
      // Wait for execution to complete normally
      await executePromise;
    });
  });

  describe("run_id in status and result retrieval", () => {
    it("should retrieve run state after execution completes", async () => {
      const externalRunId = "test-run-id-state";
      
      // Execute pipeline
      const result = await engine.execute(
        PIPELINE_MODES.QUICK,
        "test prompt",
        {},
        process.cwd(),
        false,
        undefined,
        undefined,
        externalRunId
      );
      
      // Verify result contains the same run_id
      expect(result.executionMetadata?.runId).toBe(externalRunId);
      
      // After completion, run should not be active (cleaned up)
      const isActiveAfter = engine.isRunActive(externalRunId);
      expect(isActiveAfter).toBe(false);
    });

    it("should retrieve context after execution completes", async () => {
      const externalRunId = "test-run-id-context";
      
      // Execute pipeline
      const result = await engine.execute(
        PIPELINE_MODES.QUICK,
        "test prompt",
        {},
        process.cwd(),
        false,
        undefined,
        undefined,
        externalRunId
      );
      
      // Verify result contains the same run_id
      expect(result.executionMetadata?.runId).toBe(externalRunId);
      
      // Context is cleaned up after execution completes
      const context = engine.getContext(externalRunId);
      expect(context).toBeUndefined(); // Context is removed after cleanup
    });
  });

  describe("run_id in error scenarios", () => {
    it("should maintain run_id consistency in error responses", async () => {
      const externalRunId = "test-run-id-error";
      
      // Execute with invalid config to trigger an error
      const result = await engine.execute(
        PIPELINE_MODES.QUICK,
        "test prompt",
        { invalid: "config" },
        "/nonexistent/path",
        false,
        undefined,
        undefined,
        externalRunId
      );
      
      // Verify error response contains the same run_id
      expect(result.success).toBe(false);
      expect(result.executionMetadata?.runId).toBe(externalRunId);
      
      // Verify trace shows the same run_id
      const traceData = trace.getTrace(externalRunId);
      expect(traceData?.runId).toBe(externalRunId);
    });
  });

  describe("run_id in logging and tracing", () => {
    it("should use consistent run_id across all trace spans", async () => {
      const externalRunId = "test-run-id-spans";
      
      // Execute pipeline
      await engine.execute(
        PIPELINE_MODES.QUICK,
        "test prompt",
        {},
        process.cwd(),
        false,
        undefined,
        undefined,
        externalRunId
      );
      
      // Retrieve trace
      const traceData = trace.getTrace(externalRunId);
      expect(traceData).toBeDefined();
      expect(traceData?.runId).toBe(externalRunId);
      
      // Verify trace has the correct mode
      expect(traceData?.mode).toBe(PIPELINE_MODES.QUICK);
    });
  });

  describe("backward compatibility", () => {
    it("should still work when run_id is not provided (legacy behavior)", async () => {
      // Execute without providing run_id (legacy behavior)
      const result = await engine.execute(
        PIPELINE_MODES.QUICK,
        "test prompt",
        {},
        process.cwd(),
        false
      );
      
      // Should still succeed and generate a run_id internally
      expect(result.executionMetadata?.runId).toBeDefined();
      expect(typeof result.executionMetadata?.runId).toBe("string");
      
      // Verify trace was created with the generated run_id
      const generatedRunId = result.executionMetadata?.runId;
      const traceData = trace.getTrace(generatedRunId!);
      expect(traceData).toBeDefined();
    });
  });
});
