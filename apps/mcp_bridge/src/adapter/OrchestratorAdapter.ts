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

  constructor(baseUrl: string = "http://localhost:3005") {
    this.baseUrl = baseUrl;
  }

  /**
   * Execute a pipeline via orchestrator
   */
  async runPipeline(request: OrchestratorRunRequest): Promise<OrchestratorRunResponse> {
    logger.info("Calling orchestrator runPipeline", { mode: request.mode });

    try {
      const response = await this.post<OrchestratorRunResponse>("/run", request);
      return response;
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
      const response = await this.get<IndexStateResponse>("/index/state");
      return response;
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
      const response = await this.get<SpecFilesResponse>("/spec/output");
      return response;
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

    try {
      const endpoint = runId ? `/progress?runId=${runId}` : "/progress";
      const response = await this.get<PipelineProgressResponse>(endpoint);
      return response;
    } catch (err) {
      const error = err as Error;
      logger.error("Failed to get pipeline progress", { error: error.message });
      return {
        status: "idle",
      };
    }
  }

  /**
   * Abort a running pipeline
   */
  async abortPipeline(runId: string): Promise<{ success: boolean; message: string }> {
    logger.info("Calling orchestrator abortPipeline", { runId });

    try {
      const response = await this.post<{ success: boolean; message: string }>(
        "/abort",
        { runId }
      );
      return response;
    } catch (err) {
      const error = err as Error;
      logger.error("Failed to abort pipeline", { error: error.message });
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
