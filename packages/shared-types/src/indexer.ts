/**
 * Semantic search request
 */
export interface SearchRequest {
  query: string;
  limit?: number;
  threshold?: number;
  filters?: {
    fileTypes?: string[];
    paths?: string[];
  };
}

/**
 * Single search result item
 */
export interface SearchResultItem {
  path: string;
  content: string;
  score: number;
  metadata?: {
    lineStart?: number;
    lineEnd?: number;
    language?: string;
  };
}

/**
 * Semantic search response
 */
export interface SearchResponse {
  success: boolean;
  results: SearchResultItem[];
  totalResults: number;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Context request for a specific path
 */
export interface ContextRequest {
  path: string;
  includeRelated?: boolean;
  maxRelated?: number;
}

/**
 * Context response
 */
export interface ContextResponse {
  success: boolean;
  path: string;
  content?: string;
  relatedFiles?: Array<{
    path: string;
    relevance: number;
    reason: string;
  }>;
  error?: {
    code: string;
    message: string;
  };
}
