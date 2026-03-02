import Fastify, { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import axios from "axios";
import { TIMEOUTS, loadArchitectConfig, getEndpointTimeout } from "@llm/shared-config";
import { 
  isProduction, 
  sanitizeError, 
  createFullErrorDetails,
  negotiateVersion,
  UnsupportedVersionError,
  SUPPORTED_VERSIONS,
  LATEST_STABLE_VERSION,
  getDeprecationHeadersForPath,
  createUnsupportedVersionResponse,
} from "@llm/shared-utils";
import { OrchestratorCore } from "./core/orchestratorCore";
import { PipelineEngine } from "./pipeline/PipelineEngine";
import { IndexClient } from "./indexer/IndexClient";
import { PipelineController } from "./api/PipelineController";
import { ProgressController } from "./api/ProgressController";
import { IndexController } from "./api/IndexController";
import { SpecController } from "./api/SpecController";
import { ConfigController } from "./api/ConfigController";
import { ModelGateway } from "./models/ModelGateway";
import { logger, LogLevel } from "./observability/Logger";
import { scheduledCleanupManager } from "./observability/ScheduledCleanup";
import { shutdownManager } from "./observability/ShutdownManager";
import { mapZodError, ValidationError, PathTraversalError, InvalidFilePathError, SqlInjectionError } from "./api/validators";

/**
 * Server configuration from environment
 */
interface ServerConfig {
  port: number;
  host: string;
  specRoot?: string;
  logLevel: LogLevel;
}

/**
 * Health check response interface
 * Requirements: 22.1, 22.5
 */
interface HealthCheckResponse {
  ok: boolean;
  status: "healthy" | "unhealthy" | "shutting_down";
  version: string;
  uptime: number;
  timestamp: string;
  message?: string;
  shutdown?: {
    inProgress: boolean;
    inFlightRequests?: number;
  };
  checks?: {
    [key: string]: {
      status: "pass" | "fail";
      message?: string;
    };
  };
}

/**
 * Readiness check response interface
 * Requirements: 22.3, 22.4, 22.6, 22.7
 */
interface ReadinessCheckResponse {
  ok: boolean;
  status: "ready" | "not_ready";
  timestamp: string;
  dependencies: {
    [key: string]: {
      status: "pass" | "fail";
      message?: string;
      latencyMs?: number;
    };
  };
  failedDependency?: string;
}

/**
 * Server start time for uptime calculation
 */
let serverStartTime: number = Date.now();

/**
 * Package version (loaded from package.json)
 */
const PACKAGE_VERSION = "0.1.0";

/**
 * Get the server start time (for testing)
 */
export function getServerStartTime(): number {
  return serverStartTime;
}

/**
 * Get the package version (for testing)
 */
export function getPackageVersion(): string {
  return PACKAGE_VERSION;
}

/**
 * Load server configuration from environment
 */
function loadServerConfig(): ServerConfig {
  const port = parseInt(process.env.ORCH_PORT || "7001", 10);
  const host = process.env.ORCH_HOST || "127.0.0.1";
  const specRoot = process.env.ORCH_SPEC_ROOT;
  const logLevelStr = process.env.ORCH_LOG_LEVEL || "info";

  const logLevel =
    LogLevel[logLevelStr.toUpperCase() as keyof typeof LogLevel] || LogLevel.INFO;

  return { port, host, specRoot, logLevel };
}

/**
 * Create and configure Fastify server
 * Requirements: 24.1, 24.5 - HTTP server timeout of 120 seconds with 504 response
 */
async function createServer(config: ServerConfig): Promise<FastifyInstance> {
  const server = Fastify({
    logger: false, // Use our own logger
    // Requirements: 24.1 - Set HTTP server timeout to 120 seconds
    requestTimeout: TIMEOUTS.HTTP_REQUEST,
    // connectionTimeout is needed for onTimeout hook to fire
    connectionTimeout: TIMEOUTS.HTTP_REQUEST,
    bodyLimit: 10485760, // 10MB
  });

  // Requirements: 24.1, 24.4, 24.5 - Log timeout events and return 504 Gateway Timeout
  // The onTimeout hook is called when the request times out and the socket is hung up
  // At this point we cannot send a response, but we can log the timeout event
  server.addHook('onTimeout', async (request, reply) => {
    // Requirements: 24.4, 24.5 - Log timeout events with endpoint-specific timeout info
    const endpointTimeout = (request as any).endpointTimeout || TIMEOUTS.HTTP_REQUEST;
    logger.warn('Request timeout', {
      url: request.url,
      method: request.method,
      elapsedTime: reply.elapsedTime,
      endpointTimeout,
      serverTimeout: TIMEOUTS.HTTP_REQUEST,
      correlationId: request.id,
    });
  });

  // Custom timeout handling to send 504 before socket timeout
  // Requirements: 24.4 - Support endpoint-specific timeout config
  // We use a slightly shorter timeout to ensure we can send the response (5 second buffer)
  
  server.addHook('onRequest', async (request, reply) => {
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
          correlationId: request.id,
        });
        
        reply.code(504).send({
          ok: false,
          error: {
            code: 'GATEWAY_TIMEOUT',
            message: 'Request timeout - the server did not receive a timely response',
          },
        });
      }
    }, responseTimeoutMs);

    // Store timeout ID on request for cleanup
    (request as any).timeoutId = timeoutId;
  });

  // Clean up timeout on response
  server.addHook('onResponse', async (request, _reply) => {
    const timeoutId = (request as any).timeoutId;
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });

  // Also clean up on request abort and cancel in-progress operations
  // Requirements: 24.6 - Detect client disconnect
  // Requirements: 24.7 - Cancel in-progress operations
  server.addHook('onRequestAbort', async (request) => {
    const timeoutId = (request as any).timeoutId;
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // Trigger the request's AbortController if one was created
    // This allows in-progress operations to be cancelled
    const abortController = (request as any).abortController as AbortController | undefined;
    if (abortController && !abortController.signal.aborted) {
      logger.info('Client disconnected, cancelling in-progress operations', {
        url: request.url,
        method: request.method,
        correlationId: request.id,
      });
      abortController.abort();
    }
  });

  // Create AbortController for each request to support cancellation
  // Requirements: 24.6, 24.7 - Support request cancellation via AbortController
  server.addHook('onRequest', async (request, _reply) => {
    // Create an AbortController for this request
    const abortController = new AbortController();
    (request as any).abortController = abortController;
  });

  // Initialize orchestrator components
  const configPath = process.env.ORCH_CONFIG_PATH;
  const orchestratorCore = new OrchestratorCore(configPath);
  const pipelineEngine = new PipelineEngine();
  const indexClient = new IndexClient();

  // Load config
  const orchestratorConfig = orchestratorCore.loadConfig();

  // Initialize ModelGateway for ConfigController
  const modelGateway = new ModelGateway(orchestratorConfig);

  // Initialize controllers
  const pipelineController = new PipelineController(
    pipelineEngine,
    orchestratorConfig
  );
  const progressController = new ProgressController();
  const indexController = new IndexController(indexClient);
  const specController = new SpecController(config.specRoot);
  const configController = new ConfigController(orchestratorConfig, modelGateway);

  // API Version prefix
  // Requirements: 23.1 - Support /api/v1/ prefix for all endpoints
  const API_V1_PREFIX = "/api/v1";

  // Version negotiation middleware
  // Requirements: 23.2, 23.3, 23.4
  // - Support Accept-Version header
  // - Default to latest stable version
  // - Route to appropriate handler
  // - Include Deprecation header for deprecated endpoints
  // - Include Sunset header with date
  // - Include Link header to successor
  server.addHook('onRequest', async (request, reply) => {
    // Skip version negotiation for health check endpoints
    if (request.url.startsWith('/health')) {
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

  // Register routes - Pipeline
  server.post(`${API_V1_PREFIX}/pipeline/run`, async (request, reply) => {
    return pipelineController.runPipeline(request as any, reply);
  });

  server.get(`${API_V1_PREFIX}/pipeline/status/:run_id`, async (request, reply) => {
    return pipelineController.getPipelineStatus(request as any, reply);
  });

  server.get(`${API_V1_PREFIX}/pipeline/result/:run_id`, async (request, reply) => {
    return pipelineController.getPipelineResult(request as any, reply);
  });

  // Register routes - Progress
  server.get(`${API_V1_PREFIX}/pipeline/progress/:run_id`, async (request, reply) => {
    return progressController.getPipelineProgress(request as any, reply);
  });

  // Register routes - Index
  server.post(`${API_V1_PREFIX}/index/ensure`, async (request, reply) => {
    return indexController.ensureIndexed(request as any, reply);
  });

  server.get(`${API_V1_PREFIX}/index/status`, async (request, reply) => {
    return indexController.getIndexStatus(request as any, reply);
  });

  // Register routes - Spec
  server.get(`${API_V1_PREFIX}/spec/project_context`, async (request, reply) => {
    return specController.getProjectContext(request, reply);
  });

  server.get(`${API_V1_PREFIX}/spec/modules`, async (request, reply) => {
    return specController.getModuleSpecs(request, reply);
  });

  // Register routes - Config
  // Requirements: 3.1, 4.1
  server.get(`${API_V1_PREFIX}/config/models`, async (request, reply) => {
    return configController.getModels(request, reply);
  });

  server.get(`${API_V1_PREFIX}/config/roles`, async (request, reply) => {
    return configController.getRoles(request, reply);
  });

  // Liveness probe endpoint
  // Requirements: 22.2
  // - Return 200 if process is running (liveness probe)
  // - Minimal checks for liveness probe
  server.get("/health/live", async (_request, reply) => {
    // Liveness probe: minimal check to verify process is running
    // This endpoint should be fast and lightweight
    return reply.code(200).send({
      ok: true,
      status: "alive",
      timestamp: new Date().toISOString(),
    });
  });

  // Health check endpoint
  // Requirements: 22.1, 22.5, 19.7
  // - Return 200 with status "healthy" if all checks pass
  // - Return 503 if any check fails
  // - Include version and uptime
  // - WHEN health check is called during shutdown THEN the system SHALL return 503 Service Unavailable
  server.get("/health", async (request, reply) => {
    const uptime = Math.floor((Date.now() - serverStartTime) / 1000);
    const timestamp = new Date().toISOString();
    
    // Check if shutdown is in progress
    // Requirements: 19.7
    if (shutdownManager.isShuttingDown()) {
      const response: HealthCheckResponse = {
        ok: false,
        status: "shutting_down",
        version: PACKAGE_VERSION,
        uptime,
        timestamp,
        message: "Service is shutting down",
        shutdown: {
          inProgress: true,
          inFlightRequests: shutdownManager.getInFlightCount(),
        },
      };
      return reply.code(503).send(response);
    }
    
    // Perform health checks
    const checks: { [key: string]: { status: "pass" | "fail"; message?: string } } = {};
    let allChecksPassed = true;
    
    // Basic process health check
    checks["process"] = { status: "pass" };
    
    // Memory check - warn if heap usage is high
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const heapUsagePercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);
    
    if (heapUsagePercent > 90) {
      checks["memory"] = { 
        status: "fail", 
        message: `High memory usage: ${heapUsedMB}MB / ${heapTotalMB}MB (${heapUsagePercent}%)` 
      };
      allChecksPassed = false;
    } else {
      checks["memory"] = { status: "pass" };
    }
    
    // Requirements: 22.1, 22.5
    // Return 200 with status "healthy" if all checks pass
    // Return 503 if any check fails
    if (allChecksPassed) {
      const response: HealthCheckResponse = {
        ok: true,
        status: "healthy",
        version: PACKAGE_VERSION,
        uptime,
        timestamp,
        shutdown: {
          inProgress: false,
        },
        checks,
      };
      return reply.code(200).send(response);
    } else {
      const response: HealthCheckResponse = {
        ok: false,
        status: "unhealthy",
        version: PACKAGE_VERSION,
        uptime,
        timestamp,
        message: "One or more health checks failed",
        shutdown: {
          inProgress: false,
        },
        checks,
      };
      return reply.code(503).send(response);
    }
  });

  // Readiness probe endpoint
  // Requirements: 22.3, 22.4, 22.6, 22.7
  // - Check Qdrant connectivity
  // - Check embedding server connectivity
  // - Return 503 with failed dependency name
  server.get("/health/ready", async (_request, reply) => {
    const timestamp = new Date().toISOString();
    const dependencies: ReadinessCheckResponse["dependencies"] = {};
    let allDependenciesReady = true;
    let failedDependency: string | undefined;

    // Load configuration to get service URLs
    let qdrantUrl = "http://localhost:6333";
    let embeddingUrl = "http://localhost:8000";
    
    try {
      const config = loadArchitectConfig({ throwOnError: false });
      qdrantUrl = process.env.QDRANT_URL || config.services.qdrant.url;
      embeddingUrl = process.env.EMBEDDING_URL || config.embedding.endpoint.replace("/embeddings", "");
    } catch {
      // Use defaults if config loading fails
    }

    // Check Qdrant connectivity
    // Requirements: 22.6 - WHEN Qdrant is unreachable THEN the system SHALL mark indexer as not ready
    try {
      const qdrantStart = Date.now();
      // Qdrant health check endpoint
      const qdrantResponse = await axios.get(`${qdrantUrl}/healthz`, {
        timeout: 5000,
      });
      const qdrantLatency = Date.now() - qdrantStart;
      
      if (qdrantResponse.status === 200) {
        dependencies["qdrant"] = {
          status: "pass",
          latencyMs: qdrantLatency,
        };
      } else {
        dependencies["qdrant"] = {
          status: "fail",
          message: `Unexpected status code: ${qdrantResponse.status}`,
          latencyMs: qdrantLatency,
        };
        allDependenciesReady = false;
        if (!failedDependency) failedDependency = "qdrant";
      }
    } catch (error) {
      const err = error as Error & { code?: string };
      dependencies["qdrant"] = {
        status: "fail",
        message: err.code === "ECONNREFUSED" 
          ? `Qdrant unreachable at ${qdrantUrl}` 
          : `Qdrant health check failed: ${err.message}`,
      };
      allDependenciesReady = false;
      if (!failedDependency) failedDependency = "qdrant";
    }

    // Check embedding server connectivity
    // Requirements: 22.7 - WHEN embedding server is unreachable THEN the system SHALL mark indexer as not ready
    try {
      const embeddingStart = Date.now();
      // Embedding server health check - try /health endpoint first
      const embeddingResponse = await axios.get(`${embeddingUrl}/health`, {
        timeout: 5000,
      });
      const embeddingLatency = Date.now() - embeddingStart;
      
      if (embeddingResponse.status === 200) {
        dependencies["embedding"] = {
          status: "pass",
          latencyMs: embeddingLatency,
        };
      } else {
        dependencies["embedding"] = {
          status: "fail",
          message: `Unexpected status code: ${embeddingResponse.status}`,
          latencyMs: embeddingLatency,
        };
        allDependenciesReady = false;
        if (!failedDependency) failedDependency = "embedding";
      }
    } catch (error) {
      const err = error as Error & { code?: string };
      dependencies["embedding"] = {
        status: "fail",
        message: err.code === "ECONNREFUSED" 
          ? `Embedding server unreachable at ${embeddingUrl}` 
          : `Embedding server health check failed: ${err.message}`,
      };
      allDependenciesReady = false;
      if (!failedDependency) failedDependency = "embedding";
    }

    // Requirements: 22.3, 22.4
    // - Return 200 only if all dependencies are reachable (readiness probe)
    // - Return 503 with failed dependency name
    if (allDependenciesReady) {
      const response: ReadinessCheckResponse = {
        ok: true,
        status: "ready",
        timestamp,
        dependencies,
      };
      return reply.code(200).send(response);
    } else {
      const response: ReadinessCheckResponse = {
        ok: false,
        status: "not_ready",
        timestamp,
        dependencies,
        failedDependency,
      };
      return reply.code(503).send(response);
    }
  });

  // Global error handler
  // Requirements: 12.7
  // - Strip stack traces in production mode
  // - Check NODE_ENV environment variable
  // - Always log full errors internally
  // - Return generic error messages to clients
  server.setErrorHandler((error, request, reply) => {
    // Zod validation errors
    if (error instanceof ZodError) {
      const mappedError = mapZodError(error);
      logger.warn("Validation error", mappedError);
      return reply.code(400).send({
        ok: false,
        error: mappedError,
      });
    }

    // Custom ValidationError (domain ID, justification validation)
    // Requirements: 12.4, 12.5
    if (error instanceof ValidationError) {
      logger.warn("Validation error", {
        code: error.code,
        message: error.message,
        field: error.field,
        details: error.details,
      });
      return reply.code(400).send({
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          details: {
            field: error.field,
            ...((error.details && typeof error.details === 'object') ? error.details : {}),
          },
        },
      });
    }

    // Path traversal errors
    // Requirements: 12.2, 12.3
    if (error instanceof PathTraversalError) {
      logger.warn("Path traversal attempt", {
        code: error.code,
        message: error.message,
        inputPath: error.inputPath,
      });
      return reply.code(400).send({
        ok: false,
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }

    // Invalid file path errors (whitelist validation)
    // Requirements: 12.6
    if (error instanceof InvalidFilePathError) {
      logger.warn("Invalid file path", {
        code: error.code,
        message: error.message,
        inputPath: error.inputPath,
      });
      return reply.code(400).send({
        ok: false,
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }

    // SQL injection detection errors
    // Requirements: 12.6
    if (error instanceof SqlInjectionError) {
      logger.warn("SQL injection attempt detected", {
        code: error.code,
        message: error.message,
      });
      return reply.code(400).send({
        ok: false,
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }

    // Requirements: 12.7 - Always log full errors internally
    // Create full error details for internal logging (includes stack trace)
    const fullErrorDetails = createFullErrorDetails(error, {
      url: request.url,
      method: request.method,
    });

    // Log unexpected errors with full context (always includes stack trace internally)
    logger.error("Unexpected error", {
      message: error.message,
      stack: fullErrorDetails.stack,
      url: request.url,
      method: request.method,
      timestamp: fullErrorDetails.timestamp,
    });

    // Requirements: 12.7 - Sanitize error for API response
    // In production: strip stack traces, use generic messages for internal errors
    // In development: preserve original messages but still don't expose stack traces
    const sanitizedError = sanitizeError({
      code: "UNEXPECTED_ERROR",
      message: error.message,
      statusCode: 500,
      stack: error.stack,
    });

    // Return sanitized error response
    return reply.code(500).send({
      ok: false,
      error: {
        code: sanitizedError.code,
        message: sanitizedError.message,
      },
    });
  });

  return server;
}

/**
 * Start the orchestrator HTTP server
 */
export async function startServer(): Promise<void> {
  const config = loadServerConfig();

  // Configure logger
  const loggerInstance = new (logger.constructor as any)(config.logLevel);
  Object.setPrototypeOf(logger, loggerInstance);

  logger.info("Starting Orchestrator API server", {
    port: config.port,
    host: config.host,
    logLevel: config.logLevel,
  });

  // Set server start time for uptime calculation
  // Requirements: 22.5 - Include uptime in health check
  serverStartTime = Date.now();

  const server = await createServer(config);

  try {
    await server.listen({ port: config.port, host: config.host });
    
    // Start scheduled cleanup manager
    // Requirements: 13.2, 13.3, 13.4, 13.6
    // - Schedule trace cleanup every 15 minutes
    // - Schedule cache cleanup every 15 minutes
    // - Schedule active runs cleanup every 1 hour
    scheduledCleanupManager.start();
    
    // Register shutdown handler to stop scheduled cleanup
    shutdownManager.register("scheduled-cleanup", async () => {
      scheduledCleanupManager.stop();
    }, 50);
    
    // Register callback to stop accepting new connections
    // Requirements: 19.1
    // - WHEN SIGTERM signal is received THEN the system SHALL stop accepting new requests
    shutdownManager.setStopAcceptingConnectionsCallback(async () => {
      // Fastify's close() method stops accepting new connections
      // and waits for existing connections to complete
      await server.close();
    });
    
    // Register IndexClient connection close callback
    // Requirements: 19.3
    // - Close database connections during shutdown
    shutdownManager.registerConnectionClose("index-client", async () => {
      await indexClient.close();
    });
    
    // Register SIGTERM and SIGINT signal handlers
    // Requirements: 19.1
    // - Stop accepting new connections
    // - Set isShuttingDown flag
    // - Trigger shutdown sequence
    shutdownManager.registerSignalHandlers();
    
    logger.info("Orchestrator API server started", {
      address: `http://${config.host}:${config.port}`,
    });
  } catch (error) {
    logger.error("Failed to start server", {
      error: (error as Error).message,
    });
    process.exit(1);
  }
}

// Start server if run directly
if (require.main === module) {
  startServer();
}
