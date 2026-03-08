import {
  IndexStatus,
  SearchRequest,
  SearchResponse,
  SearchResultItem,
  ContextRequest,
  ContextResponse,
} from "@llm/shared-types";
import { ApiError } from "@llm/shared-types";

// Re-export for convenience
export {
  IndexStatus,
  SearchRequest,
  SearchResponse,
  SearchResultItem,
  ContextRequest,
  ContextResponse,
};

/**
 * Index operation result
 */
export interface IndexResult {
  status: IndexStatus;
  filesIndexed?: number;
  error?: ApiError;
  completedAt?: string;
  metadata?: {
    filesByExtension: Record<string, number>;
    directoryStructure: Array<{
      name: string;
      path: string;
      fileCount: number;
    }>;
    detectedFrameworks: string[];
    dependencies: Array<{
      name: string;
      version: string;
      source: string;
      isDev: boolean;
    }>;
  };
}
