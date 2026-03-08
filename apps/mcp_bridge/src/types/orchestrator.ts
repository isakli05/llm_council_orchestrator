/**
 * Orchestrator API Types
 */

import { ApiError } from "@llm/shared-types";

export interface DomainExclusion {
  domainId: string;
  justification: string;
}

export interface OrchestratorRunRequest {
  mode: string;
  prompt: string;
  projectRoot?: string;
  forceReindex?: boolean;
  roleConfigs?: Record<string, any>;
  modelsOverride?: Record<string, string | string[]>;
  domainExclusions?: DomainExclusion[];
}

export interface OrchestratorRunResponse {
  success: boolean;
  mode: string;
  data?: unknown;
  error?: ApiError;
  steps?: Array<{
    stepName: string;
    success: boolean;
    data?: unknown;
    error?: ApiError;
    executedAt: string;
  }>;
  completedAt?: string;
}

export interface IndexStateResponse {
  indexed: boolean;
  fileCount?: number;
  lastIndexedAt?: string;
  error?: string;
}

export interface SpecFilesResponse {
  files: Array<{
    path: string;
    content: string;
  }>;
}

export interface PipelineProgressResponse {
  runId?: string;
  status: "running" | "completed" | "failed" | "idle"; // Keep as-is: MCP-specific status
  currentStep?: string;
  progress?: number;
}
