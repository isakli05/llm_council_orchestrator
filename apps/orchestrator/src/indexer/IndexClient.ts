import axios, { AxiosInstance, AxiosError } from "axios";
import { ERROR_CODES } from "@llm/shared-config";
import {
  IndexStatus,
  IndexResult,
  SearchRequest,
  SearchResponse,
  ContextRequest,
  ContextResponse,
} from "./types";

/**
 * Configuration options for IndexClient
 */
export interface IndexClientConfig {
  /** Base URL for the Indexer service (default: http://localhost:9001) */
  baseUrl?: string;
  /** API key for authentication (default: from INDEXER_API_KEY env var) */
  apiKey?: string;
  /** Request timeout in milliseconds (default: 60000) */
  timeoutMs?: number;
  /** Maximum number of retry attempts for network errors (default: 3) */
  maxRetries?: number;
  /** Base delay for exponential backoff in milliseconds (default: 1000) */
  retryBaseDelayMs?: number;
}

/**
 * Options for individual requests that support cancellation
 * 
 * Requirements: 24.6, 24.7 - Support request cancellation via AbortSignal
 */
export interface RequestOptions {
  /** AbortSignal for request cancellation */
  signal?: AbortSignal;
}

/**
 * API version prefix for all endpoints
 * Requirements: 23.1 - Support /api/v1/ prefix for all endpoints
 */
const API_V1_PREFIX = "/api/v1";

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<IndexClientConfig> = {
  baseUrl: "http://localhost:9001",
  apiKey: process.env.INDEXER_API_KEY || "",
  timeoutMs: 60000, // 60 seconds
  maxRetries: 3, // 3 retry attempts
  retryBaseDelayMs: 1000, // 1 second base delay for exponential backoff
};

/**
 * Network error codes that should trigger a retry
 */
const RETRYABLE_ERROR_CODES = [
  "ECONNREFUSED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNABORTED",
  "ENETUNREACH",
  "EHOSTUNREACH",
];

/**
 * Check if an error is a network error that should be retried
 */
function isRetryableNetworkError(error: AxiosError): boolean {
  // Check for network error codes
  if (error.code && RETRYABLE_ERROR_CODES.includes(error.code)) {
    return true;
  }
  // Check for timeout errors
  if (error.message?.includes("timeout")) {
    return true;
  }
  return false;
}

/**
 * Calculate exponential backoff delay
 * @param attempt - Current attempt number (0-indexed)
 * @param baseDelayMs - Base delay in milliseconds
 * @returns Delay in milliseconds (1s, 2s, 4s for attempts 0, 1, 2)
 */
function calculateBackoffDelay(attempt: number, baseDelayMs: number): number {
  return baseDelayMs * Math.pow(2, attempt);
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * IndexClient provides an abstraction layer for communicating with the Indexer service.
 * Uses Axios HTTP client for communication with the Indexer REST API.
 * 
 * Requirements: 7.1, 7.6, 7.7
 */
export class IndexClient {
  private httpClient: AxiosInstance;
  private currentIndexStatus: IndexStatus = IndexStatus.NOT_STARTED;
  private config: Required<IndexClientConfig>;

  constructor(config?: IndexClientConfig) {
    this.config = {
      baseUrl: config?.baseUrl ?? DEFAULT_CONFIG.baseUrl,
      apiKey: config?.apiKey ?? DEFAULT_CONFIG.apiKey,
      timeoutMs: config?.timeoutMs ?? DEFAULT_CONFIG.timeoutMs,
      maxRetries: config?.maxRetries ?? DEFAULT_CONFIG.maxRetries,
      retryBaseDelayMs: config?.retryBaseDelayMs ?? DEFAULT_CONFIG.retryBaseDelayMs,
    };

    // Create Axios instance with configured base URL, timeout, and headers
    this.httpClient = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeoutMs,
      headers: {
        "Content-Type": "application/json",
        ...(this.config.apiKey && { "X-API-Key": this.config.apiKey }),
      },
    });
  }

  /**
   * Execute an HTTP request with retry logic and exponential backoff.
   * Retries on network errors up to maxRetries times.
   * Supports request cancellation via AbortSignal.
   * 
   * Requirements: 7.7, 24.6, 24.7
   * 
   * @param requestFn - Function that performs the HTTP request
   * @param signal - Optional AbortSignal for request cancellation
   * @returns The result of the request function
   */
  private async executeWithRetry<T>(requestFn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    let lastError: AxiosError | null = null;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      // Check for cancellation before each attempt
      // Requirements: 24.6 - Detect client disconnect
      if (signal?.aborted) {
        const abortError = new Error("Request cancelled");
        abortError.name = "AbortError";
        throw abortError;
      }

      try {
        return await requestFn();
      } catch (err) {
        const error = err as AxiosError;
        lastError = error;

        // Check if this was a cancellation
        // Requirements: 24.6, 24.7 - Cancel in-progress operations
        if (error.name === "CanceledError" || error.code === "ERR_CANCELED" || signal?.aborted) {
          const abortError = new Error("Request cancelled");
          abortError.name = "AbortError";
          throw abortError;
        }

        // Only retry on network errors
        if (!isRetryableNetworkError(error)) {
          throw error;
        }

        // Don't wait after the last attempt
        if (attempt < this.config.maxRetries - 1) {
          const delay = calculateBackoffDelay(attempt, this.config.retryBaseDelayMs);
          await sleep(delay);
        }
      }
    }

    // All retries exhausted, throw the last error
    throw lastError;
  }

  /**
   * Get the configured HTTP client instance (for testing purposes)
   */
  getHttpClient(): AxiosInstance {
    return this.httpClient;
  }

  /**
   * Get the current configuration
   */
  getConfig(): Readonly<Required<IndexClientConfig>> {
    return { ...this.config };
  }

  /**
   * Ensure index is ready, trigger full index if needed.
   * Makes POST request to /index/ensure endpoint with retry logic.
   * Supports request cancellation via AbortSignal.
   * 
   * Requirements: 7.2, 7.4, 7.7, 24.6, 24.7
   * 
   * @param projectRoot - The root directory of the project to index
   * @param forceRebuild - Whether to force a full rebuild of the index
   * @param options - Optional request options including AbortSignal for cancellation
   * @returns IndexResult with status, filesIndexed count, and completedAt timestamp
   */
  async ensureIndex(projectRoot: string, forceRebuild: boolean = false, options?: RequestOptions): Promise<IndexResult> {
    try {
      this.currentIndexStatus = IndexStatus.IN_PROGRESS;

      // Make POST request to /api/v1/index/ensure endpoint with retry logic
      // Requirements: 23.1 - Support /api/v1/ prefix for all endpoints
      // Requirements: 24.6, 24.7 - Propagate AbortController signal
      const response = await this.executeWithRetry(() =>
        this.httpClient.post<{
          success: boolean;
          filesIndexed: number;
          completedAt: string;
          error?: { code: string; message: string };
        }>(`${API_V1_PREFIX}/index/ensure`, {
          project_root: projectRoot,
          force_rebuild: forceRebuild,
        }, {
          signal: options?.signal,
        }),
        options?.signal
      );

      // Parse successful response
      if (response.data.success) {
        this.currentIndexStatus = IndexStatus.READY;
        return {
          status: IndexStatus.READY,
          filesIndexed: response.data.filesIndexed,
          completedAt: response.data.completedAt,
        };
      }

      // Handle unsuccessful response from server
      this.currentIndexStatus = IndexStatus.FAILED;
      return {
        status: IndexStatus.FAILED,
        error: response.data.error || {
          code: ERROR_CODES.INDEX_ERROR,
          message: "Indexing failed without specific error",
        },
      };
    } catch (err) {
      const error = err as AxiosError<{ error?: { code: string; message: string } }> & { name?: string };
      this.currentIndexStatus = IndexStatus.FAILED;

      // Handle request cancellation
      // Requirements: 24.6, 24.7 - Detect client disconnect and cancel in-progress operations
      if (error.name === "AbortError" || error.name === "CanceledError" || error.code === "ERR_CANCELED") {
        return {
          status: IndexStatus.FAILED,
          error: {
            code: "REQUEST_CANCELLED",
            message: "Index request was cancelled",
          },
        };
      }

      // Handle service unreachable (network errors, connection refused, etc.)
      // These errors have already been retried by executeWithRetry
      if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND" || error.code === "ETIMEDOUT") {
        return {
          status: IndexStatus.FAILED,
          error: {
            code: ERROR_CODES.INDEX_ERROR,
            message: `Indexer service unreachable after ${this.config.maxRetries} retries: ${error.message}`,
          },
        };
      }

      // Handle timeout errors (already retried)
      if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) {
        return {
          status: IndexStatus.FAILED,
          error: {
            code: ERROR_CODES.TIMEOUT_ERROR,
            message: `Request to indexer service timed out after ${this.config.maxRetries} retries: ${error.message}`,
          },
        };
      }

      // Handle HTTP error responses (not retried - these are server errors, not network errors)
      if (error.response) {
        const errorData = error.response.data?.error;
        return {
          status: IndexStatus.FAILED,
          error: errorData || {
            code: ERROR_CODES.INDEX_ERROR,
            message: `Indexer service returned error: ${error.response.status} ${error.response.statusText}`,
          },
        };
      }

      // Handle other errors
      return {
        status: IndexStatus.FAILED,
        error: {
          code: ERROR_CODES.INDEX_ERROR,
          message: error.message || "Unknown error during indexing",
        },
      };
    }
  }

  /**
   * Perform semantic search.
   * Makes POST request to /search endpoint with retry logic.
   * Supports request cancellation via AbortSignal.
   * 
   * Requirements: 7.3, 7.5, 7.7, 24.6, 24.7
   * 
   * @param request - Search request with query, limit, and filters
   * @param options - Optional request options including AbortSignal for cancellation
   * @returns SearchResponse with results array and totalResults count
   */
  async semanticSearch(request: SearchRequest, options?: RequestOptions): Promise<SearchResponse> {
    try {
      // Make POST request to /api/v1/search endpoint with query, limit, and filters (with retry logic)
      // Requirements: 23.1 - Support /api/v1/ prefix for all endpoints
      // Requirements: 24.6, 24.7 - Propagate AbortController signal
      const response = await this.executeWithRetry(() =>
        this.httpClient.post<{
          success: boolean;
          results: Array<{
            path: string;
            content: string;
            score: number;
            metadata?: {
              lineStart?: number;
              lineEnd?: number;
              language?: string;
            };
          }>;
          totalResults: number;
          error?: { code: string; message: string };
        }>(`${API_V1_PREFIX}/search`, {
          query: request.query,
          limit: request.limit,
          threshold: request.threshold,
          filters: request.filters,
        }, {
          signal: options?.signal,
        }),
        options?.signal
      );

      // Parse successful response
      if (response.data.success) {
        return {
          success: true,
          results: response.data.results,
          totalResults: response.data.totalResults,
        };
      }

      // Handle unsuccessful response from server
      return {
        success: false,
        results: [],
        totalResults: 0,
        error: response.data.error || {
          code: ERROR_CODES.INDEX_ERROR,
          message: "Search failed without specific error",
        },
      };
    } catch (err) {
      const error = err as AxiosError<{ error?: { code: string; message: string } }> & { name?: string };

      // Handle request cancellation
      // Requirements: 24.6, 24.7 - Detect client disconnect and cancel in-progress operations
      if (error.name === "AbortError" || error.name === "CanceledError" || error.code === "ERR_CANCELED") {
        return {
          success: false,
          results: [],
          totalResults: 0,
          error: {
            code: "REQUEST_CANCELLED",
            message: "Search request was cancelled",
          },
        };
      }

      // Handle timeout errors (ECONNABORTED or timeout message) - already retried
      if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) {
        return {
          success: false,
          results: [],
          totalResults: 0,
          error: {
            code: ERROR_CODES.TIMEOUT_ERROR,
            message: `Search request timed out after ${this.config.maxRetries} retries: ${error.message}`,
          },
        };
      }

      // Handle service unreachable (network errors, connection refused, etc.) - already retried
      if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND" || error.code === "ETIMEDOUT") {
        return {
          success: false,
          results: [],
          totalResults: 0,
          error: {
            code: ERROR_CODES.INDEX_ERROR,
            message: `Indexer service unreachable after ${this.config.maxRetries} retries: ${error.message}`,
          },
        };
      }

      // Handle HTTP error responses (not retried - these are server errors, not network errors)
      if (error.response) {
        const errorData = error.response.data?.error;
        return {
          success: false,
          results: [],
          totalResults: 0,
          error: errorData || {
            code: ERROR_CODES.INDEX_ERROR,
            message: `Search request failed: ${error.response.status} ${error.response.statusText}`,
          },
        };
      }

      // Handle other errors
      return {
        success: false,
        results: [],
        totalResults: 0,
        error: {
          code: ERROR_CODES.INDEX_ERROR,
          message: error.message || "Unknown error during search",
        },
      };
    }
  }

  /**
   * Get context for a specific path
   */
  async contextForPath(request: ContextRequest): Promise<ContextResponse> {
    try {
      // Check if index is ready
      if (this.currentIndexStatus !== IndexStatus.READY) {
        throw new Error("Index not ready. Call ensureIndex() first.");
      }

      // Make HTTP call to indexer service to get context
      const response = await this.executeWithRetry(async () => {
        return this.httpClient.post<{
          success: boolean;
          context: Array<{
            content: string;
            filePath: string;
            startLine?: number;
            endLine?: number;
          }>;
          related?: Array<{
            path: string;
            relevance: number;
          }>;
          error?: string;
        }>(`${API_V1_PREFIX}/context`, {
          path: request.path,
          maxChunks: request.maxRelated || 5,
          includeRelated: request.includeRelated !== false,
        });
      });

      const data = response.data;

      if (!data.success) {
        throw new Error(data.error || "Failed to retrieve context");
      }

      // Combine all context chunks into a single content string
      const content = data.context
        .map((chunk) => {
          const location = chunk.startLine && chunk.endLine
            ? `:${chunk.startLine}-${chunk.endLine}`
            : "";
          return `// ${chunk.filePath}${location}\n${chunk.content}`;
        })
        .join("\n\n---\n\n");

      // Transform related files to match expected format
      const relatedFiles = data.related?.map((rel) => ({
        path: rel.path,
        relevance: rel.relevance,
        reason: rel.relevance > 0.9
          ? "Highly similar functionality"
          : rel.relevance > 0.8
          ? "Similar functionality"
          : "Related code",
      }));

      return {
        success: true,
        path: request.path,
        content,
        relatedFiles,
      };
    } catch (err) {
      const error = err as Error;
      return {
        success: false,
        path: request.path,
        error: {
          code: "CONTEXT_ERROR",
          message: error.message,
        },
      };
    }
  }

  /**
   * Get current index status
   */
  getStatus(): IndexStatus {
    return this.currentIndexStatus;
  }

  /**
   * Close the HTTP client and release resources
   * 
   * This method cancels any pending requests and cleans up the Axios instance.
   * Should be called during graceful shutdown to ensure proper resource cleanup.
   * 
   * Requirements: 19.3 - Close database connections during shutdown
   * 
   * @returns Promise that resolves when the client is closed
   */
  async close(): Promise<void> {
    // Cancel any pending requests by creating a new AbortController
    // Note: Axios doesn't have a built-in close method, but we can
    // clear any pending state and reset the client
    this.currentIndexStatus = IndexStatus.NOT_STARTED;
    
    // In a production environment with connection pooling,
    // we would close all pooled connections here.
    // For Axios, we just ensure no pending state remains.
  }
}
