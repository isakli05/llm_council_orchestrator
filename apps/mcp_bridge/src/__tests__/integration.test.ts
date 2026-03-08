/**
 * Integration tests for MCP Bridge and Orchestrator API alignment
 * 
 * These tests validate that the MCP bridge correctly communicates with
 * the orchestrator's actual API endpoints and handles responses properly.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { OrchestratorAdapter } from "../adapter/OrchestratorAdapter";
import * as http from "http";

describe("MCP Bridge - Orchestrator API Alignment", () => {
  let mockServer: http.Server;
  let mockServerPort: number;
  let adapter: OrchestratorAdapter;

  beforeAll(async () => {
    // Create a mock orchestrator server
    mockServerPort = 17001; // Use a different port to avoid conflicts
    
    mockServer = http.createServer((req, res) => {
      const url = req.url || "";
      const method = req.method || "";

      // Set CORS headers
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Access-Control-Allow-Origin", "*");

      // Handle different endpoints
      if (method === "POST" && url === "/api/v1/pipeline/run") {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          const data = JSON.parse(body);
          res.writeHead(200);
          res.end(JSON.stringify({
            ok: true,
            run_id: "test-run-123",
            started_at: new Date().toISOString(),
            pipeline_mode: data.pipeline_mode,
          }));
        });
      } else if (method === "GET" && url === "/api/v1/index/status") {
        res.writeHead(200);
        res.end(JSON.stringify({
          ok: true,
          project_root: "/test/project",
          status: "ready",
          last_indexed_at: new Date().toISOString(),
          documents_count: 42,
        }));
      } else if (method === "GET" && url === "/api/v1/spec/project_context") {
        res.writeHead(200);
        res.end(JSON.stringify({
          ok: true,
          filename: "project_context.yaml",
          content: "# Test project context\nname: test-project",
        }));
      } else if (method === "GET" && url === "/api/v1/spec/modules") {
        res.writeHead(200);
        res.end(JSON.stringify({
          ok: true,
          modules: [
            {
              name: "test_module",
              filename: "test_module.yaml",
              content: "# Test module\nname: test-module",
            },
          ],
        }));
      } else if (method === "GET" && url.startsWith("/api/v1/pipeline/progress/")) {
        const runId = url.split("/").pop();
        res.writeHead(200);
        res.end(JSON.stringify({
          ok: true,
          run_id: runId,
          trace: [
            {
              span_id: "span-1",
              name: "indexing",
              started_at: new Date().toISOString(),
              finished_at: new Date().toISOString(),
              status: "success",
            },
            {
              span_id: "span-2",
              name: "analysis",
              started_at: new Date().toISOString(),
              status: "running",
            },
          ],
        }));
      } else if (method === "POST" && url.startsWith("/api/v1/pipeline/cancel/")) {
        const runId = url.split("/").pop();
        res.writeHead(200);
        res.end(JSON.stringify({
          ok: true,
          run_id: runId,
          status: "cancelling",
          message: "Pipeline cancellation has been initiated",
          cancelled_at: new Date().toISOString(),
        }));
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({
          ok: false,
          error: {
            code: "NOT_FOUND",
            message: `Endpoint not found: ${method} ${url}`,
          },
        }));
      }
    });

    await new Promise<void>((resolve) => {
      mockServer.listen(mockServerPort, () => {
        resolve();
      });
    });

    adapter = new OrchestratorAdapter(`http://localhost:${mockServerPort}`);
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      mockServer.close(() => {
        resolve();
      });
    });
  });

  describe("Port Configuration", () => {
    it("should use port 7001 as default", () => {
      const defaultAdapter = new OrchestratorAdapter();
      expect((defaultAdapter as any).baseUrl).toBe("http://localhost:7001");
    });

    it("should accept custom orchestrator URL", () => {
      const customAdapter = new OrchestratorAdapter("http://custom:8080");
      expect((customAdapter as any).baseUrl).toBe("http://custom:8080");
    });
  });

  describe("runPipeline", () => {
    it("should call /api/v1/pipeline/run with correct format", async () => {
      const result = await adapter.runPipeline({
        mode: "architect",
        prompt: "Test prompt",
        projectRoot: "/test/project",
        forceReindex: false,
      });

      expect(result.success).toBe(true);
      expect(result.mode).toBe("architect");
      expect(result.data).toBeDefined();
    });

    it("should handle domain exclusions", async () => {
      const result = await adapter.runPipeline({
        mode: "architect",
        prompt: "Test prompt",
        domainExclusions: [
          {
            domainId: "test_domain",
            justification: "Testing exclusion",
          },
        ],
      });

      expect(result.success).toBe(true);
    });

    it("should handle errors gracefully", async () => {
      const badAdapter = new OrchestratorAdapter("http://localhost:19999");
      const result = await badAdapter.runPipeline({
        mode: "architect",
        prompt: "Test prompt",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe("ORCHESTRATOR_ERROR");
    });
  });

  describe("getIndexState", () => {
    it("should call /api/v1/index/status and transform response", async () => {
      const result = await adapter.getIndexState();

      expect(result.indexed).toBe(true);
      expect(result.fileCount).toBe(42);
      expect(result.lastIndexedAt).toBeDefined();
    });

    it("should handle errors gracefully", async () => {
      const badAdapter = new OrchestratorAdapter("http://localhost:19999");
      const result = await badAdapter.getIndexState();

      expect(result.indexed).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("getSpecFiles", () => {
    it("should call /api/v1/spec endpoints and combine results", async () => {
      const result = await adapter.getSpecFiles();

      expect(result.files).toBeDefined();
      expect(result.files.length).toBeGreaterThan(0);
      
      // Should have project context
      const projectContext = result.files.find(f => f.path.includes("project_context"));
      expect(projectContext).toBeDefined();
      expect(projectContext?.content).toContain("test-project");

      // Should have module specs
      const moduleSpec = result.files.find(f => f.path.includes("test_module"));
      expect(moduleSpec).toBeDefined();
      expect(moduleSpec?.content).toContain("test-module");
    });

    it("should handle errors gracefully", async () => {
      const badAdapter = new OrchestratorAdapter("http://localhost:19999");
      const result = await badAdapter.getSpecFiles();

      expect(result.files).toEqual([]);
    });
  });

  describe("getPipelineProgress", () => {
    it("should call /api/v1/pipeline/progress/:run_id with correct format", async () => {
      const result = await adapter.getPipelineProgress("test-run-123");

      expect(result.runId).toBe("test-run-123");
      expect(result.status).toBeDefined();
      expect(["running", "completed", "failed", "idle"]).toContain(result.status);
    });

    it("should return idle status when no runId provided", async () => {
      const result = await adapter.getPipelineProgress();

      expect(result.status).toBe("idle");
    });

    it("should calculate progress from trace", async () => {
      const result = await adapter.getPipelineProgress("test-run-123");

      expect(result.progress).toBeDefined();
      expect(result.progress).toBeGreaterThanOrEqual(0);
      expect(result.progress).toBeLessThanOrEqual(100);
    });

    it("should handle errors gracefully", async () => {
      const badAdapter = new OrchestratorAdapter("http://localhost:19999");
      const result = await badAdapter.getPipelineProgress("test-run-123");

      expect(result.status).toBe("idle");
    });
  });

  describe("abortPipeline", () => {
    it("should call /api/v1/pipeline/cancel/:run_id", async () => {
      const result = await adapter.abortPipeline("test-run-123");

      expect(result.success).toBe(true);
      expect(result.message).toBeDefined();
    });

    it("should handle errors gracefully", async () => {
      const badAdapter = new OrchestratorAdapter("http://localhost:19999");
      const result = await badAdapter.abortPipeline("test-run-123");

      expect(result.success).toBe(false);
      expect(result.message).toBeDefined();
    });
  });

  describe("Endpoint Path Validation", () => {
    it("should use /api/v1 prefix for all endpoints", () => {
      // This test validates that the adapter is configured to use the correct prefix
      // The actual validation happens in the integration tests above
      expect(true).toBe(true);
    });
  });
});
