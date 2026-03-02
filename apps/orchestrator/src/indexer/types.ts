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
}
