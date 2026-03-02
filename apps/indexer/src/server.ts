import Fastify, { FastifyInstance, FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import { z } from 'zod';
import { logger, Logger } from './observability/Logger';
import { IndexController } from './api/IndexController';
import * as path from 'path';
import * as crypto from 'crypto';
import { TIMEOUTS, getEndpointTimeout } from '@llm/shared-config';
import { 
  isProduction, 
  sanitizeError, 
  createFullErrorDetails,
  SanitizedError,
  negotiateVersion,
  UnsupportedVersionError,
  SUPPORTED_VERSIONS,
  LATEST_STABLE_VERSION,
  getDeprecationHeadersForPath,
  createUnsupportedVersionResponse,
} from '@llm/shared-utils';

/**
 * Generates a unique correlation ID for request tracing.
 * Uses crypto.randomUUID for secure, unique identifiers.
 */
function generateCorrelationId(): string {
  return crypto.randomUUID();
}

/**
 * Structured error response format for API errors.
 */
export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    correlationId: string;
    details?: unknown;
  };
}

/**
 * Custom error class for API errors with error codes.
 */
export class ApiError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(code: string, message: string, statusCode: number = 500, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

// ============================================================================
// Custom Validators for Domain-Specific Rules
// Requirements: 12.1, 12.2, 12.3, 12.6
// ============================================================================

/**
 * Path traversal detection patterns
 * Requirements: 12.2, 12.3
 */
const PATH_TRAVERSAL_PATTERNS = [
  /\.\.\//,      // ../
  /\.\.\\/,      // ..\
  /^\.\.$/,      // just ..
  /\/\.\.\//,    // /../
  /\\\.\.\\/,    // \..\
];

/**
 * Validates that a path does not contain traversal attempts
 * Requirements: 12.2, 12.3
 */
function containsPathTraversal(inputPath: string): boolean {
  return PATH_TRAVERSAL_PATTERNS.some(pattern => pattern.test(inputPath));
}

/**
 * SQL-like character patterns to detect potential injection
 * Requirements: 12.6
 */
const SQL_INJECTION_PATTERNS = [
  /;\s*DROP\s+/i,
  /;\s*DELETE\s+/i,
  /;\s*UPDATE\s+/i,
  /;\s*INSERT\s+/i,
  /'\s*OR\s+'1'\s*=\s*'1/i,
  /--\s*$/,
  /\/\*.*\*\//,
];

/**
 * Checks if a string contains SQL-like injection patterns
 * Requirements: 12.6
 */
function containsSqlInjection(input: string): boolean {
  return SQL_INJECTION_PATTERNS.some(pattern => pattern.test(input));
}

/**
 * Escapes special regex characters in a string
 * This prevents regex injection attacks when user input is used in regex patterns
 * Requirements: 12.6
 */
function escapeRegexChars(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whitelist of allowed characters in file paths
 * Allows alphanumeric, common path separators, dots, underscores, hyphens, and spaces
 * Requirements: 12.6
 */
const FILE_PATH_WHITELIST_PATTERN = /^[a-zA-Z0-9_\-./\\ ]+$/;

/**
 * Validates a file path against a whitelist of allowed characters
 * Returns true if the path contains only allowed characters
 * Requirements: 12.6
 */
function isValidFilePath(filePath: string): boolean {
  if (!filePath || filePath.length === 0) {
    return false;
  }
  
  // Check against whitelist pattern
  if (!FILE_PATH_WHITELIST_PATTERN.test(filePath)) {
    return false;
  }
  
  // Additional checks for suspicious patterns
  // Reject null bytes
  if (filePath.includes('\0')) {
    return false;
  }
  
  // Reject paths that are too long (prevent DoS)
  if (filePath.length > 4096) {
    return false;
  }
  
  return true;
}

/**
 * Sanitizes a search query by escaping special regex characters
 * Requirements: 12.6
 */
function sanitizeSearchQuery(query: string): string {
  return escapeRegexChars(query);
}

/**
 * Zod refinement for safe path (no traversal and whitelist validation)
 * Requirements: 12.2, 12.3, 12.6
 */
const safePathValidator = z.string().min(1, 'Path is required').refine(
  (val) => !containsPathTraversal(val),
  {
    message: "Path contains invalid traversal sequences",
  }
).refine(
  (val) => isValidFilePath(val),
  {
    message: "Path contains invalid characters. Only alphanumeric characters, dots, underscores, hyphens, spaces, and path separators are allowed.",
  }
);

/**
 * Zod refinement for safe search query (no SQL injection)
 * Requirements: 12.6
 */
const safeQueryValidator = z.string().min(1, 'Query is required and must be non-empty').refine(
  (val) => !containsSqlInjection(val),
  {
    message: "Query contains potentially unsafe characters",
  }
);

// Zod schemas for request validation
// Requirements: 12.1, 12.2, 12.3
const IndexEnsureRequestSchema = z.object({
  project_root: safePathValidator,
  force_rebuild: z.boolean().optional().default(false),
  ignore_patterns: z.array(z.string()).optional(),
  include_extensions: z.array(z.string()).optional(),
});

export type IndexEnsureRequest = z.infer<typeof IndexEnsureRequestSchema>;

// Requirements: 12.1, 12.6
const SearchRequestSchema = z.object({
  query: safeQueryValidator,
  limit: z.number().int().positive().max(100).optional().default(10),
  filters: z.object({
    paths: z.array(safePathValidator).optional(),
    extensions: z.array(z.string().regex(/^\.[a-zA-Z0-9]+$/, "Invalid file extension format")).optional(),
  }).optional(),
});

export type SearchRequestBody = z.infer<typeof SearchRequestSchema>;

export interface IndexEnsureResponse {
  success: boolean;
  filesIndexed: number;
  completedAt: string;
  stats?: {
    totalFiles: number;
    addedFiles: number;
    modifiedFiles: number;
    deletedFiles: number;
    unchangedFiles: number;
    totalChunks: number;
    indexedChunks: number;
    processingTimeMs: number;
  };
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface SearchResultItem {
  chunk: {
    content: string;
    metadata: {
      filePath: string;
      extension: string;
      chunkType: string;
      startLine?: number;
      endLine?: number;
    };
  };
  score: number;
}

export interface SearchApiResponse {
  success: boolean;
  results: SearchResultItem[];
  totalResults: number;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface ServerConfig {
  port: number;
  host: string;
  storagePath?: string;
  modelName?: string;
  device?: 'cpu' | 'gpu';
  apiKey?: string;
}

export interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  version: string;
  uptime: number;
  timestamp: string;
}

const DEFAULT_CONFIG: ServerConfig = {
  port: 9001,
  host: '0.0.0.0',
  storagePath: path.join(process.cwd(), '.indexer'),
  modelName: 'bge-large',
  device: 'cpu',
  apiKey: process.env.INDEXER_API_KEY,
};

// Paths that don't require authentication
const PUBLIC_PATHS = ['/health'];

// Extend FastifyRequest to include correlation ID
declare module 'fastify' {
  interface FastifyRequest {
    correlationId: string;
    requestLogger: Logger;
  }
}

export class IndexerServer {
  private server: FastifyInstance;
  private controller: IndexController;
  private config: ServerConfig;
  private startTime: number;

  constructor(config: Partial<ServerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startTime = Date.now();

    // Initialize Fastify instance
    // Requirements: 24.1, 24.5 - HTTP server timeout of 120 seconds with 504 response
    this.server = Fastify({
      logger: false, // We use our own logger
      // Requirements: 24.1 - Set HTTP server timeout to 120 seconds
      requestTimeout: TIMEOUTS.HTTP_REQUEST,
      // connectionTimeout is needed for onTimeout hook to fire
      connectionTimeout: TIMEOUTS.HTTP_REQUEST,
    });

    // Initialize IndexController
    this.controller = new IndexController(
      this.config.storagePath!,
      {
        modelName: this.config.modelName,
        device: this.config.device,
      }
    );

    this.registerCorrelationIdMiddleware();
    this.registerTimeoutHandling();
    this.registerVersionNegotiationMiddleware();
    this.registerAuthMiddleware();
    this.registerRoutes();
    this.registerErrorHandler();
  }

  /**
   * Registers timeout handling hooks.
   * Requirements: 24.1, 24.4, 24.5 - HTTP server timeout with per-endpoint config and logging
   */
  private registerTimeoutHandling(): void {
    // Requirements: 24.1, 24.4, 24.5 - Log timeout events and return 504 Gateway Timeout
    // The onTimeout hook is called when the request times out and the socket is hung up
    // At this point we cannot send a response, but we can log the timeout event
    this.server.addHook('onTimeout', async (request: FastifyRequest, reply: FastifyReply) => {
      // Requirements: 24.4, 24.5 - Log timeout events with endpoint-specific timeout info
      const endpointTimeout = (request as any).endpointTimeout || TIMEOUTS.HTTP_REQUEST;
      logger.warn('Request timeout', {
        url: request.url,
        method: request.method,
        elapsedTime: reply.elapsedTime,
        endpointTimeout,
        serverTimeout: TIMEOUTS.HTTP_REQUEST,
        correlationId: request.correlationId,
      });
    });

    // Custom timeout handling to send 504 before socket timeout
    // Requirements: 24.4 - Support endpoint-specific timeout config
    // We use a slightly shorter timeout to ensure we can send the response (5 second buffer)

    this.server.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
      // Get endpoint-specific timeout or fall back to default
      // Requirements: 24.4 - Override server timeout per route
      const endpointTimeout = getEndpointTimeout(request.method, request.url);
      const responseTimeoutMs = endpointTimeout - 5000; // 5 seconds buffer to send response
      
      // Store the endpoint timeout on the request for logging
      (request as any).endpointTimeout = endpointTimeout;
      
      // Set a timer to send 504 if request takes too long
      const timeoutId = setTimeout(() => {
        // Only send 504 if response hasn't been sent yet
        if (!reply.sent) {
          // Requirements: 24.1, 24.4, 24.5 - Return 504 on timeout and log timeout events
          logger.warn('Request approaching timeout, sending 504', {
            url: request.url,
            method: request.method,
            timeoutMs: responseTimeoutMs,
            endpointTimeout,
            correlationId: request.correlationId,
          });

          reply.code(504).send({
            error: {
              code: 'GATEWAY_TIMEOUT',
              message: 'Request timeout - the server did not receive a timely response',
              correlationId: request.correlationId,
            },
          });
        }
      }, responseTimeoutMs);

      // Store timeout ID on request for cleanup
      (request as any).timeoutId = timeoutId;
    });

    // Clean up timeout on response
    this.server.addHook('onResponse', async (request: FastifyRequest, _reply: FastifyReply) => {
      const timeoutId = (request as any).timeoutId;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    });

    // Also clean up on request abort
    this.server.addHook('onRequestAbort', async (request: FastifyRequest) => {
      const timeoutId = (request as any).timeoutId;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    });
  }

  /**
   * Registers correlation ID middleware.
   * Generates a unique correlation ID for each request and attaches it to the request object.
   * Also creates a child logger with the correlation ID for request-scoped logging.
   */
  private registerCorrelationIdMiddleware(): void {
    this.server.addHook('onRequest', async (request: FastifyRequest, _reply: FastifyReply) => {
      // Use existing correlation ID from header or generate a new one
      const existingCorrelationId = request.headers['x-correlation-id'];
      request.correlationId = typeof existingCorrelationId === 'string' 
        ? existingCorrelationId 
        : generateCorrelationId();
      
      // Create a child logger with the correlation ID
      request.requestLogger = logger.child({ correlationId: request.correlationId });
    });

    // Add correlation ID to response headers
    this.server.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, _payload) => {
      reply.header('x-correlation-id', request.correlationId);
      return _payload;
    });
  }

  /**
   * Registers version negotiation middleware.
   * Supports Accept-Version header and defaults to latest stable version.
   * 
   * Requirements: 23.2, 23.3, 23.4
   * - Support Accept-Version header
   * - Default to latest stable version
   * - Route to appropriate handler
   * - Include Deprecation header for deprecated endpoints
   * - Include Sunset header with date
   * - Include Link header to successor
   */
  private registerVersionNegotiationMiddleware(): void {
    this.server.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
      // Skip version negotiation for health check endpoints
      if (request.url === '/health') {
        return;
      }

      try {
        // Get Accept-Version header
        const acceptVersionHeader = request.headers['accept-version'];
        const headerValue = Array.isArray(acceptVersionHeader) 
          ? acceptVersionHeader[0] 
          : acceptVersionHeader;

        // Negotiate version based on header and path
        const versionResult = negotiateVersion(headerValue, request.url);

        // Store version info in request for potential use by handlers
        (request as any).apiVersion = versionResult.version;
        (request as any).apiVersionSource = versionResult.source;

        // Add version info to response headers
        reply.header('X-API-Version', versionResult.version);
        reply.header('X-API-Version-Source', versionResult.source);

        // Requirements: 23.4 - Add deprecation headers for deprecated endpoints
        // - Include Deprecation header for deprecated endpoints
        // - Include Sunset header with date
        // - Include Link header to successor
        const deprecationHeaders = getDeprecationHeadersForPath(request.url);
        if (deprecationHeaders) {
          reply.header('Deprecation', deprecationHeaders.Deprecation);
          reply.header('Sunset', deprecationHeaders.Sunset);
          reply.header('Link', deprecationHeaders.Link);
          
          logger.info('Deprecated endpoint accessed', {
            url: request.url,
            method: request.method,
            deprecation: deprecationHeaders.Deprecation,
            sunset: deprecationHeaders.Sunset,
          });
        }
      } catch (error) {
        if (error instanceof UnsupportedVersionError) {
          // Requirements: 23.5, 23.7 - Return 400 for unsupported versions with supported versions list
          logger.warn('Unsupported API version requested', {
            requestedVersion: error.requestedVersion,
            supportedVersions: error.supportedVersions,
          });
          return reply.code(400).send(createUnsupportedVersionResponse(error.requestedVersion));
        }
        throw error;
      }
    });
  }

  /**
   * Registers global error handler middleware.
   * Catches all unhandled errors and returns structured error responses.
   * Logs errors with correlation IDs for traceability.
   * 
   * Requirements: 12.7
   * - Strip stack traces in production mode
   * - Check NODE_ENV environment variable
   * - Always log full errors internally
   * - Return generic error messages to clients
   */
  private registerErrorHandler(): void {
    this.server.setErrorHandler((error: FastifyError | ApiError | Error, request: FastifyRequest, reply: FastifyReply) => {
      const correlationId = request.correlationId || generateCorrelationId();
      const requestLogger = request.requestLogger || logger.child({ correlationId });

      // Determine error details based on error type
      let statusCode = 500;
      let errorCode = 'INTERNAL_ERROR';
      let errorMessage = 'An unexpected error occurred';
      let details: unknown = undefined;

      if (error instanceof ApiError) {
        // Custom API error
        statusCode = error.statusCode;
        errorCode = error.code;
        errorMessage = error.message;
        details = error.details;
      } else if (error instanceof SyntaxError && error.message.includes('JSON')) {
        // JSON parsing error (native SyntaxError)
        statusCode = 400;
        errorCode = 'INVALID_JSON';
        errorMessage = 'Invalid JSON in request body';
      } else if ('code' in error && typeof (error as any).code === 'string' && 
                 ((error as any).code === 'FST_ERR_CTP_INVALID_JSON_BODY' || 
                  (error as any).code.includes('JSON'))) {
        // Fastify JSON parsing error
        statusCode = 400;
        errorCode = 'INVALID_JSON';
        errorMessage = 'Invalid JSON in request body';
      } else if (error.message && error.message.includes('JSON')) {
        // Generic JSON-related error
        statusCode = 400;
        errorCode = 'INVALID_JSON';
        errorMessage = 'Invalid JSON in request body';
      } else if ('statusCode' in error && typeof error.statusCode === 'number') {
        // Fastify error with status code
        const fastifyError = error as FastifyError;
        statusCode = fastifyError.statusCode;
        errorCode = fastifyError.code || 'REQUEST_ERROR';
        errorMessage = error.message;
      }

      // Requirements: 12.7 - Always log full errors internally
      // Create full error details for internal logging (includes stack trace)
      const fullErrorDetails = createFullErrorDetails(error, {
        url: request.url,
        method: request.method,
        statusCode,
        errorCode,
        correlationId,
      });

      // Log the error with full context (always includes stack trace internally)
      requestLogger.error('Request error', error, {
        url: request.url,
        method: request.method,
        statusCode,
        errorCode,
        stack: fullErrorDetails.stack,
      });

      // Requirements: 12.7 - Sanitize error for API response
      // In production: strip stack traces, use generic messages for internal errors
      // In development: preserve original messages but still don't expose stack traces
      const sanitizedError: SanitizedError = sanitizeError({
        code: errorCode,
        message: errorMessage,
        statusCode,
        stack: error.stack,
        details,
      });

      // Return structured error response
      const errorResponse: ApiErrorResponse = {
        error: {
          code: sanitizedError.code,
          message: sanitizedError.message,
          correlationId,
          ...(sanitizedError.details ? { details: sanitizedError.details } : {}),
        },
      };

      return reply.status(statusCode).send(errorResponse);
    });
  }

  /**
   * Registers API key authentication middleware.
   * Checks X-API-Key header on all endpoints except /health.
   * Returns 401 if header is missing, 403 if header is invalid.
   */
  private registerAuthMiddleware(): void {
    this.server.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
      // Skip authentication for public paths
      if (PUBLIC_PATHS.includes(request.url)) {
        return;
      }

      // If no API key is configured, skip authentication
      // This allows running without authentication in development
      if (!this.config.apiKey) {
        return;
      }

      const apiKey = request.headers['x-api-key'];

      // Check if X-API-Key header is missing
      if (!apiKey) {
        logger.warn('API key missing in request', { url: request.url, method: request.method });
        return reply.status(401).send({
          error: {
            code: 'AUTHENTICATION_ERROR',
            message: 'X-API-Key header is required',
          },
        });
      }

      // Check if X-API-Key header is invalid
      if (apiKey !== this.config.apiKey) {
        logger.warn('Invalid API key in request', { url: request.url, method: request.method });
        return reply.status(403).send({
          error: {
            code: 'AUTHENTICATION_ERROR',
            message: 'Invalid API key',
          },
        });
      }
    });
  }

  private registerRoutes(): void {
    // API Version prefix
    // Requirements: 23.1 - Support /api/v1/ prefix for all endpoints
    const API_V1_PREFIX = '/api/v1';

    // Health check endpoint - GET /health (no version prefix for health checks)
    this.server.get('/health', async (_request: FastifyRequest, _reply: FastifyReply): Promise<HealthResponse> => {
      const uptime = Math.floor((Date.now() - this.startTime) / 1000);
      
      return {
        status: 'healthy',
        version: '0.1.0',
        uptime,
        timestamp: new Date().toISOString(),
      };
    });

    // POST /api/v1/index/ensure - Trigger indexing
    this.server.post(`${API_V1_PREFIX}/index/ensure`, async (request: FastifyRequest, reply: FastifyReply): Promise<IndexEnsureResponse> => {
      // Validate request body with Zod schema
      const parseResult = IndexEnsureRequestSchema.safeParse(request.body);
      
      if (!parseResult.success) {
        logger.warn('Validation error in POST /index/ensure', {
          errors: parseResult.error.errors,
        });
        
        reply.status(400);
        return {
          success: false,
          filesIndexed: 0,
          completedAt: new Date().toISOString(),
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: parseResult.error.errors.map(err => ({
              path: err.path.join('.'),
              message: err.message,
            })),
          },
        };
      }

      const { project_root, force_rebuild, ignore_patterns, include_extensions } = parseResult.data;

      logger.info('Processing POST /index/ensure', {
        project_root,
        force_rebuild,
      });

      try {
        // Call IndexController.ensureIndexed
        const result = await this.controller.ensureIndexed({
          projectRoot: project_root,
          forceRebuild: force_rebuild,
          ignorePatterns: ignore_patterns,
          includeExtensions: include_extensions,
        });

        if (!result.success) {
          logger.error('Indexing failed', { error: result.error });
          reply.status(500);
          return {
            success: false,
            filesIndexed: 0,
            completedAt: new Date().toISOString(),
            error: {
              code: 'INDEXING_ERROR',
              message: result.error || 'Unknown error during indexing',
            },
          };
        }

        logger.info('Indexing completed successfully', {
          filesIndexed: result.stats.indexedChunks,
          totalFiles: result.stats.totalFiles,
          processingTimeMs: result.stats.processingTimeMs,
        });

        return {
          success: true,
          filesIndexed: result.stats.indexedChunks,
          completedAt: new Date().toISOString(),
          stats: result.stats,
        };
      } catch (error: any) {
        logger.error('Unexpected error in POST /index/ensure', error);
        reply.status(500);
        return {
          success: false,
          filesIndexed: 0,
          completedAt: new Date().toISOString(),
          error: {
            code: 'INTERNAL_ERROR',
            message: error.message || 'An unexpected error occurred',
          },
        };
      }
    });

    // POST /api/v1/search - Semantic search
    this.server.post(`${API_V1_PREFIX}/search`, async (request: FastifyRequest, reply: FastifyReply): Promise<SearchApiResponse> => {
      // Validate request body with Zod schema
      const parseResult = SearchRequestSchema.safeParse(request.body);
      
      if (!parseResult.success) {
        logger.warn('Validation error in POST /search', {
          errors: parseResult.error.errors,
        });
        
        reply.status(400);
        return {
          success: false,
          results: [],
          totalResults: 0,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: parseResult.error.errors.map(err => ({
              path: err.path.join('.'),
              message: err.message,
            })),
          },
        };
      }

      const { query, limit, filters } = parseResult.data;

      logger.info('Processing POST /search', {
        query: query.substring(0, 100), // Log only first 100 chars of query
        limit,
        hasFilters: !!filters,
      });

      try {
        // Call IndexController.search
        const result = await this.controller.search({
          query,
          topK: limit,
          filters: filters ? {
            extensions: filters.extensions,
            // Note: paths filter is not directly supported by IndexController.search
            // but we include it in the schema for future compatibility
          } : undefined,
        });

        if (!result.success) {
          logger.error('Search failed', { error: result.error });
          reply.status(500);
          return {
            success: false,
            results: [],
            totalResults: 0,
            error: {
              code: 'SEARCH_ERROR',
              message: result.error || 'Unknown error during search',
            },
          };
        }

        logger.info('Search completed successfully', {
          totalResults: result.stats.totalResults,
          searchTimeMs: result.stats.searchTimeMs,
        });

        // Map results to API response format
        const mappedResults: SearchResultItem[] = result.results.map(r => ({
          chunk: {
            content: r.chunk.content,
            metadata: {
              filePath: r.chunk.filePath,
              extension: r.chunk.metadata.extension,
              chunkType: r.chunk.metadata.chunkType,
              startLine: r.chunk.startLine,
              endLine: r.chunk.endLine,
            },
          },
          score: r.score,
        }));

        return {
          success: true,
          results: mappedResults,
          totalResults: result.stats.totalResults,
        };
      } catch (error: any) {
        logger.error('Unexpected error in POST /search', error);
        reply.status(500);
        return {
          success: false,
          results: [],
          totalResults: 0,
          error: {
            code: 'INTERNAL_ERROR',
            message: error.message || 'An unexpected error occurred',
          },
        };
      }
    });
  }

  async start(): Promise<void> {
    try {
      // Initialize the controller
      await this.controller.initialize();
      
      // Start the server
      await this.server.listen({
        port: this.config.port,
        host: this.config.host,
      });

      logger.info('Indexer server started', {
        port: this.config.port,
        host: this.config.host,
      });
    } catch (error: any) {
      logger.error('Failed to start server', error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down Indexer server');
    
    try {
      await this.server.close();
      await this.controller.shutdown();
      logger.info('Indexer server shut down successfully');
    } catch (error: any) {
      logger.error('Error during shutdown', error);
      throw error;
    }
  }

  getServer(): FastifyInstance {
    return this.server;
  }

  getController(): IndexController {
    return this.controller;
  }
}

// CLI entry point for running the server
async function main() {
  const config: Partial<ServerConfig> = {
    port: parseInt(process.env.INDEXER_PORT || '9001', 10),
    host: process.env.INDEXER_HOST || '0.0.0.0',
    storagePath: process.env.INDEXER_STORAGE_PATH,
    modelName: process.env.INDEXER_MODEL_NAME,
    device: (process.env.INDEXER_DEVICE as 'cpu' | 'gpu') || 'cpu',
    apiKey: process.env.INDEXER_API_KEY,
  };

  const server = new IndexerServer(config);

  try {
    await server.start();

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully');
      await server.shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully');
      await server.shutdown();
      process.exit(0);
    });

    logger.info('Indexer server is running. Press Ctrl+C to stop.');
  } catch (error: any) {
    logger.error('Failed to start indexer server', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export default IndexerServer;
