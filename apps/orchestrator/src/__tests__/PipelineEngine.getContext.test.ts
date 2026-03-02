/**
 * Tests for PipelineEngine getContext method
 * 
 * Requirements: 28.4 - Provide read-only access to previous step results
 * - Provide getContext method for step access
 * - Return immutable copy of context
 * - Prevent direct mutation of context
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @llm/shared-types with all required exports
vi.mock("@llm/shared-types", () => ({
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
  RoleType: {
    LEGACY_ANALYSIS: "legacy_analysis",
    ARCHITECT: "architect",
    MIGRATION: "migration",
    SECURITY: "security",
    AGGREGATOR: "aggregator",
  },
  IndexStatus: {
    PENDING: "PENDING",
    IN_PROGRESS: "IN_PROGRESS",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
  },
}));

// Mock @llm/shared-config with required exports
vi.mock("@llm/shared-config", () => ({
  TIMEOUTS: {
    MODEL_CALL_DEFAULT: 60000,
    MODEL_CALL_EXTENDED: 120000,
    HTTP_REQUEST: 30000,
  },
  RETRY_CONFIG: {
    MAX_RETRIES: 3,
    BASE_DELAY_MS: 1000,
    MAX_DELAY_MS: 10000,
  },
  PipelineMode: {
    QUICK: "QUICK",
    FULL: "FULL",
    SPEC: "SPEC",
    REFINEMENT: "REFINEMENT",
  },
  PIPELINE_MODES: ["QUICK", "FULL", "SPEC", "REFINEMENT"],
  ProviderType: {
    OPENAI: "openai",
    ANTHROPIC: "anthropic",
    ZAI: "zai",
    GEMINI: "gemini",
    OPENAI_OPENROUTER: "openai-openrouter",
    ANTHROPIC_OPENROUTER: "anthropic-openrouter",
    ZAI_OPENROUTER: "zai-openrouter",
    GEMINI_OPENROUTER: "gemini-openrouter",
  },
}));

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

// Mock the trace module
vi.mock("../observability/Trace", () => ({
  trace: {
    startPipeline: vi.fn(() => "test-trace-id"),
    endPipeline: vi.fn(),
    startSpan: vi.fn(() => "test-span-id"),
    endSpan: vi.fn(),
    getTrace: vi.fn(),
  },
}));

// Import PipelineEngine after mocks are set up
import { PipelineEngine } from "../pipeline/PipelineEngine";

describe("PipelineEngine getContext", () => {
  let engine: PipelineEngine;

  beforeEach(() => {
    engine = new PipelineEngine();
  });

  describe("getContext method", () => {
    it("should return undefined for non-existent runId", () => {
      const context = engine.getContext("non-existent-run-id");
      expect(context).toBeUndefined();
    });
  });

  describe("immutability of returned context", () => {
    it("should return a frozen object that cannot be modified", () => {
      // Access the private activeRuns map to set up test data
      const activeRuns = (engine as unknown as { activeRuns: Map<string, unknown> }).activeRuns;
      
      // Create a mock context
      const mockContext = {
        runId: "test-run-123",
        mode: "FULL",
        startedAt: new Date().toISOString(),
        prompt: "Test prompt",
        config: {},
        projectRoot: "/test/path",
        completedSteps: ["index"],
        errors: [],
        indexMetadata: {
          totalFiles: 10,
          totalChunks: 50,
          filesByExtension: { ".ts": 5, ".js": 5 },
          directoryStructure: ["/src", "/test"],
          detectedFrameworks: ["react"],
          dependencies: ["lodash"],
        },
      };
      
      // Set up the active run
      activeRuns.set("test-run-123", {
        runId: "test-run-123",
        context: mockContext,
        abortController: new AbortController(),
        startedAt: mockContext.startedAt,
      });
      
      // Get the context
      const context = engine.getContext("test-run-123");
      
      // Verify it's defined
      expect(context).toBeDefined();
      
      // Verify the object is frozen
      expect(Object.isFrozen(context)).toBe(true);
      
      // Verify nested objects are also frozen
      if (context?.indexMetadata) {
        expect(Object.isFrozen(context.indexMetadata)).toBe(true);
      }
      
      // Verify arrays are frozen
      expect(Object.isFrozen(context?.completedSteps)).toBe(true);
      expect(Object.isFrozen(context?.errors)).toBe(true);
    });

    it("should not allow modification of returned context properties", () => {
      const activeRuns = (engine as unknown as { activeRuns: Map<string, unknown> }).activeRuns;
      
      const mockContext = {
        runId: "test-run-456",
        mode: "QUICK",
        startedAt: new Date().toISOString(),
        prompt: "Test prompt",
        config: {},
        projectRoot: "/test/path",
        completedSteps: ["index"],
        errors: [],
      };
      
      activeRuns.set("test-run-456", {
        runId: "test-run-456",
        context: mockContext,
        abortController: new AbortController(),
        startedAt: mockContext.startedAt,
      });
      
      const context = engine.getContext("test-run-456");
      
      // Attempting to modify should throw in strict mode or silently fail
      expect(() => {
        (context as { runId: string }).runId = "modified";
      }).toThrow();
    });

    it("should return a copy that does not affect the original context", () => {
      const activeRuns = (engine as unknown as { activeRuns: Map<string, unknown> }).activeRuns;
      
      const originalContext = {
        runId: "test-run-789",
        mode: "FULL",
        startedAt: new Date().toISOString(),
        prompt: "Test prompt",
        config: { maxRetries: 3 },
        projectRoot: "/test/path",
        completedSteps: ["index", "discover"],
        errors: [],
        roleResponses: [
          {
            role: "architect",
            success: true,
            outputs: [{ modelId: "gpt-4", content: "test" }],
            executedAt: new Date().toISOString(),
          },
        ],
      };
      
      activeRuns.set("test-run-789", {
        runId: "test-run-789",
        context: originalContext,
        abortController: new AbortController(),
        startedAt: originalContext.startedAt,
      });
      
      // Get the context
      const context = engine.getContext("test-run-789");
      
      // Verify it's a different object reference
      expect(context).not.toBe(originalContext);
      
      // Verify nested objects are different references
      expect(context?.config).not.toBe(originalContext.config);
      expect(context?.completedSteps).not.toBe(originalContext.completedSteps);
      expect(context?.roleResponses).not.toBe(originalContext.roleResponses);
      
      // Verify the values are the same
      expect(context?.runId).toBe(originalContext.runId);
      expect(context?.mode).toBe(originalContext.mode);
      expect(context?.completedSteps).toEqual(originalContext.completedSteps);
    });

    it("should exclude AbortController from the returned context", () => {
      const activeRuns = (engine as unknown as { activeRuns: Map<string, unknown> }).activeRuns;
      
      const mockContext = {
        runId: "test-run-abc",
        mode: "FULL",
        startedAt: new Date().toISOString(),
        prompt: "Test prompt",
        config: {},
        projectRoot: "/test/path",
        completedSteps: [],
        errors: [],
        abortController: new AbortController(),
        cancelled: false,
      };
      
      activeRuns.set("test-run-abc", {
        runId: "test-run-abc",
        context: mockContext,
        abortController: mockContext.abortController,
        startedAt: mockContext.startedAt,
      });
      
      const context = engine.getContext("test-run-abc");
      
      // AbortController should not be in the returned context
      expect(context?.abortController).toBeUndefined();
      
      // Other properties should still be present
      expect(context?.runId).toBe("test-run-abc");
      expect(context?.cancelled).toBe(false);
    });

    it("should handle nested arrays and objects correctly", () => {
      const activeRuns = (engine as unknown as { activeRuns: Map<string, unknown> }).activeRuns;
      
      const mockContext = {
        runId: "test-run-nested",
        mode: "FULL",
        startedAt: new Date().toISOString(),
        prompt: "Test prompt",
        config: {
          maxRetries: 3,
          providerOptions: {
            openai: { temperature: 0.7 },
            anthropic: { maxTokens: 1000 },
          },
        },
        projectRoot: "/test/path",
        completedSteps: ["index", "discover", "analyze"],
        errors: [
          {
            stepName: "analyze",
            code: "TIMEOUT",
            message: "Step timed out",
            occurredAt: new Date().toISOString(),
          },
        ],
        roleResponses: [
          {
            role: "architect",
            success: true,
            outputs: [
              { modelId: "gpt-4", content: "analysis 1" },
              { modelId: "claude-3", content: "analysis 2" },
            ],
            executedAt: new Date().toISOString(),
          },
        ],
      };
      
      activeRuns.set("test-run-nested", {
        runId: "test-run-nested",
        context: mockContext,
        abortController: new AbortController(),
        startedAt: mockContext.startedAt,
      });
      
      const context = engine.getContext("test-run-nested");
      
      // Verify deeply nested objects are frozen
      expect(Object.isFrozen(context?.config?.providerOptions)).toBe(true);
      expect(Object.isFrozen(context?.errors?.[0])).toBe(true);
      expect(Object.isFrozen(context?.roleResponses?.[0]?.outputs?.[0])).toBe(true);
      
      // Verify values are preserved
      expect(context?.config?.providerOptions?.openai?.temperature).toBe(0.7);
      expect(context?.errors?.[0]?.code).toBe("TIMEOUT");
      expect(context?.roleResponses?.[0]?.outputs?.length).toBe(2);
    });
  });
});
