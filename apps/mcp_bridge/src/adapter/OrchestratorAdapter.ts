/**
 * Adapter for communicating with Orchestrator API
 */

import * as http from "http";
import { formatJson, safeJsonParse } from "@llm/shared-utils";
import { logger } from "../observability/Logger";
import {
  OrchestratorRunRequest,
  OrchestratorRunResponse,
  IndexStateResponse,
  SpecFilesResponse,
  PipelineProgressResponse,
} from "../types/orchestrator";

export class OrchestratorAdapter {
  private baseUrl: string;

  constructor(baseUrl: string = "http://localhost:7001") {
    // Default port 7001 matches orchestrator's actual default port
    this.baseUrl = baseUrl;
  }

  /**
   * Execute a pipeline via orchestrator
   */
  async runPipeline(request: OrchestratorRunRequest): Promise<OrchestratorRunResponse> {
    logger.info("Calling orchestrator runPipeline", { mode: request.mode });

    try {
      // Transform request to match orchestrator's expected format
      const orchestratorRequest = {
        pipeline_mode: request.mode,
        prompt: request.prompt,
        project_root: request.projectRoot || process.cwd(),
        force_reindex: request.forceReindex || false,
        role_configs: request.roleConfigs,
        domainExclusions: request.domainExclusions,
      };

      const response = await this.post<any>("/api/v1/pipeline/run", orchestratorRequest);
      
      // Transform response to match MCP bridge's expected format
      return {
        success: response.ok || false,
        mode: request.mode,
        data: response,
      };
    } catch (err) {
      const error = err as Error;
      logger.error("Failed to run pipeline", { error: error.message });
      return {
        success: false,
        mode: request.mode,
        error: {
          code: "ORCHESTRATOR_ERROR",
          message: error.message,
        },
      };
    }
  }

  /**
   * Get index state from orchestrator
   */
  async getIndexState(): Promise<IndexStateResponse> {
    logger.info("Calling orchestrator getIndexState");

    try {
      const response = await this.get<any>("/api/v1/index/status");
      
      // Transform orchestrator response to MCP bridge format
      return {
        indexed: response.status === "ready",
        fileCount: response.documents_count,
        lastIndexedAt: response.last_indexed_at,
      };
    } catch (err) {
      const error = err as Error;
      logger.error("Failed to get index state", { error: error.message });
      return {
        indexed: false,
        error: error.message,
      };
    }
  }

  /**
   * Get spec files from orchestrator
   */
  async getSpecFiles(): Promise<SpecFilesResponse> {
    logger.info("Calling orchestrator getSpecFiles");

    try {
      // Get both project context and module specs
      const [projectContextResponse, modulesResponse] = await Promise.all([
        this.get<any>("/api/v1/spec/project_context").catch(() => null),
        this.get<any>("/api/v1/spec/modules").catch(() => null),
      ]);

      const files: Array<{ path: string; content: string }> = [];

      // Add project context if available
      if (projectContextResponse?.ok && projectContextResponse.content) {
        files.push({
          path: projectContextResponse.filename || "project_context.yaml",
          content: projectContextResponse.content,
        });
      }

      // Add module specs if available
      if (modulesResponse?.ok && modulesResponse.modules) {
        for (const module of modulesResponse.modules) {
          files.push({
            path: module.filename || `${module.name}_module.yaml`,
            content: module.content,
          });
        }
      }

      return { files };
    } catch (err) {
      const error = err as Error;
      logger.error("Failed to get spec files", { error: error.message });
      return {
        files: [],
      };
    }
  }

  /**
   * Get pipeline progress
   */
  async getPipelineProgress(runId?: string): Promise<PipelineProgressResponse> {
    logger.info("Calling orchestrator getPipelineProgress", { runId });

    if (!runId) {
      logger.warn("No runId provided for progress query");
      return {
        status: "idle",
      };
    }

    try {
      const response = await this.get<any>(`/api/v1/pipeline/progress/${runId}`);
      
      // Transform orchestrator response to MCP bridge format
      return {
        runId: response.run_id,
        status: this.mapProgressStatus(response),
        currentStep: response.trace?.[response.trace.length - 1]?.name,
        progress: this.calculateProgress(response.trace),
      };
    } catch (err) {
      const error = err as Error;
      logger.error("Failed to get pipeline progress", { error: error.message });
      return {
        runId,
        status: "idle",
      };
    }
  }

  /**
   * Map orchestrator trace status to MCP bridge status
   */
  private mapProgressStatus(response: any): "running" | "completed" | "failed" | "idle" {
    if (!response.trace || response.trace.length === 0) {
      return "idle";
    }

    const hasRunning = response.trace.some((span: any) => span.status === "running");
    if (hasRunning) {
      return "running";
    }

    const hasFailed = response.trace.some((span: any) => span.status === "error");
    if (hasFailed) {
      return "failed";
    }

    const allCompleted = response.trace.every((span: any) => span.status === "success");
    if (allCompleted) {
      return "completed";
    }

    return "running";
  }

  /**
   * Calculate progress percentage from trace spans
   */
  private calculateProgress(trace?: any[]): number | undefined {
    if (!trace || trace.length === 0) {
      return undefined;
    }

    const completedSpans = trace.filter(
      (span: any) => span.status === "success" || span.status === "error"
    ).length;

    return Math.round((completedSpans / trace.length) * 100);
  }

  /**
   * Cancel a running pipeline
   * Note: Orchestrator uses "cancel" terminology, not "abort"
   */
  async abortPipeline(runId: string): Promise<{ success: boolean; message: string }> {
    logger.info("Calling orchestrator cancelPipeline", { runId });

    try {
      const response = await this.post<any>(
        `/api/v1/pipeline/cancel/${runId}`,
        {}
      );
      
      return {
        success: response.ok || false,
        message: response.message || "Pipeline cancellation initiated",
      };
    } catch (err) {
      const error = err as Error;
      logger.error("Failed to cancel pipeline", { error: error.message });
      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * Generic GET request
   */
  private async get<T>(path: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);

      const req = http.get(url, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            const parsed = safeJsonParse<T>(data);
            if (parsed) {
              resolve(parsed);
            } else {
              reject(new Error("Invalid JSON response"));
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on("error", (err) => {
        reject(err);
      });

      req.end();
    });
  }

  /**
   * Generic POST request
   */
  private async post<T>(path: string, body: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const payload = formatJson(body);

      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      };

      const req = http.request(options, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            const parsed = safeJsonParse<T>(data);
            if (parsed) {
              resolve(parsed);
            } else {
              reject(new Error("Invalid JSON response"));
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on("error", (err) => {
        reject(err);
      });

      req.write(payload);
      req.end();
    });
  }
}
