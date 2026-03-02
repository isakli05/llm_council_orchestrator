/**
 * Shutdown Manager
 * 
 * Implements graceful shutdown handling for the orchestrator service.
 * Manages shutdown handlers, tracks in-flight requests, and ensures
 * proper resource cleanup during service termination.
 * 
 * Requirements: 19.1, 19.2, 19.3, 19.4
 * - Handle SIGTERM signal to stop accepting new requests
 * - Register shutdown handlers
 * - Track in-flight requests
 * - Set shutdown timeout to 30 seconds
 * - Wait for in-flight requests to complete
 * - Close database connections
 * - Flush metrics and traces
 * - Force terminate remaining connections after timeout
 */

import { logger } from "./Logger";
import { trace } from "./Trace";

/**
 * Callback type for stopping the server from accepting new connections
 */
type StopAcceptingConnectionsCallback = () => Promise<void>;

/**
 * Callback type for closing database/HTTP client connections
 * Requirements: 19.3 - Close database connections
 */
type CloseConnectionCallback = () => Promise<void>;

/**
 * Callback type for flushing metrics
 * Requirements: 19.3 - Flush metrics and traces
 */
type FlushMetricsCallback = () => Promise<void>;

/**
 * Default shutdown timeout in milliseconds (30 seconds)
 * Requirements: 19.2, 19.4
 */
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 30 * 1000;

/**
 * Shutdown handler function type
 */
type ShutdownHandler = () => Promise<void>;

/**
 * Registered handler with metadata
 */
interface RegisteredHandler {
  name: string;
  handler: ShutdownHandler;
  priority: number;
}

/**
 * Connection draining result
 * Requirements: 19.3
 */
interface DrainResult {
  connectionsClosedCount: number;
  tracesFlushed: boolean;
  metricsFlushed: boolean;
  logsFlushed: boolean;
  durationMs: number;
  errors: string[];
}

/**
 * Shutdown result for a single handler
 */
interface HandlerResult {
  name: string;
  success: boolean;
  durationMs: number;
  error?: string;
}

/**
 * Overall shutdown result
 */
interface ShutdownResult {
  success: boolean;
  totalDurationMs: number;
  handlers: HandlerResult[];
  timedOut: boolean;
  inFlightRequestsAtStart: number;
  inFlightRequestsAtEnd: number;
}

/**
 * Shutdown Manager
 * 
 * Manages graceful shutdown of the orchestrator service by:
 * - Handling SIGTERM signal to initiate shutdown
 * - Stopping new connections when shutdown begins
 * - Registering cleanup handlers for various components
 * - Tracking in-flight requests
 * - Coordinating orderly shutdown with timeout
 * 
 * Requirements: 19.1, 19.2, 19.4
 */
export class ShutdownManager {
  private handlers: RegisteredHandler[] = [];
  private _isShuttingDown: boolean = false;
  private _inFlightRequests: number = 0;
  private shutdownTimeoutMs: number;
  private shutdownPromise: Promise<ShutdownResult> | null = null;
  private stopAcceptingConnectionsCallback: StopAcceptingConnectionsCallback | null = null;
  private signalHandlersRegistered: boolean = false;
  
  /**
   * Registered connection close callbacks
   * Requirements: 19.3 - Close database connections
   */
  private connectionCloseCallbacks: Map<string, CloseConnectionCallback> = new Map();
  
  /**
   * Registered metrics flush callback
   * Requirements: 19.3 - Flush metrics and traces
   */
  private flushMetricsCallback: FlushMetricsCallback | null = null;

  constructor(timeoutMs: number = DEFAULT_SHUTDOWN_TIMEOUT_MS) {
    this.shutdownTimeoutMs = timeoutMs;
  }

  /**
   * Register a callback to stop accepting new connections
   * 
   * This callback is invoked when SIGTERM is received to immediately
   * stop the server from accepting new connections.
   * 
   * Requirements: 19.1
   * - Stop accepting new connections when SIGTERM is received
   * 
   * @param callback - Async function to stop accepting connections
   */
  setStopAcceptingConnectionsCallback(callback: StopAcceptingConnectionsCallback): void {
    this.stopAcceptingConnectionsCallback = callback;
    logger.debug("Stop accepting connections callback registered");
  }

  /**
   * Register a callback to close a database/HTTP client connection
   * 
   * Requirements: 19.3
   * - Close database connections during shutdown
   * 
   * @param name - Descriptive name for the connection (for logging)
   * @param callback - Async function to close the connection
   */
  registerConnectionClose(name: string, callback: CloseConnectionCallback): void {
    if (this._isShuttingDown) {
      logger.warn("Cannot register connection close callback during shutdown", { name });
      return;
    }
    
    this.connectionCloseCallbacks.set(name, callback);
    logger.debug("Connection close callback registered", { name });
  }

  /**
   * Unregister a connection close callback
   * 
   * @param name - Name of the connection callback to remove
   * @returns true if callback was found and removed
   */
  unregisterConnectionClose(name: string): boolean {
    const removed = this.connectionCloseCallbacks.delete(name);
    if (removed) {
      logger.debug("Connection close callback unregistered", { name });
    }
    return removed;
  }

  /**
   * Register a callback to flush metrics
   * 
   * Requirements: 19.3
   * - Flush metrics during shutdown
   * 
   * @param callback - Async function to flush metrics
   */
  setFlushMetricsCallback(callback: FlushMetricsCallback): void {
    this.flushMetricsCallback = callback;
    logger.debug("Flush metrics callback registered");
  }

  /**
   * Drain all connections and flush data
   * 
   * This method performs the following during shutdown:
   * 1. Wait for in-flight requests to complete
   * 2. Close all registered database/HTTP client connections
   * 3. Flush traces
   * 4. Flush metrics
   * 5. Flush logs
   * 
   * Requirements: 19.3
   * - Wait for in-flight requests to complete
   * - Close database connections
   * - Flush metrics and traces
   * 
   * @returns Promise resolving to drain result
   */
  async drainConnections(): Promise<DrainResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let connectionsClosedCount = 0;
    let tracesFlushed = false;
    let metricsFlushed = false;
    let logsFlushed = false;

    logger.info("Starting connection draining", {
      registeredConnections: this.connectionCloseCallbacks.size,
      inFlightRequests: this._inFlightRequests,
    });

    // 1. Wait for in-flight requests to complete (already handled by shutdown sequence)
    // This is called after waitForInFlightRequests in the shutdown sequence

    // 2. Close all registered database/HTTP client connections
    for (const [name, callback] of this.connectionCloseCallbacks) {
      try {
        logger.debug("Closing connection", { name });
        await callback();
        connectionsClosedCount++;
        logger.debug("Connection closed successfully", { name });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`Failed to close connection '${name}': ${errorMessage}`);
        logger.error("Failed to close connection", { name, error: errorMessage });
      }
    }

    // 3. Flush traces
    try {
      logger.debug("Flushing traces");
      await trace.flush();
      tracesFlushed = true;
      logger.debug("Traces flushed successfully");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to flush traces: ${errorMessage}`);
      logger.error("Failed to flush traces", { error: errorMessage });
    }

    // 4. Flush metrics
    if (this.flushMetricsCallback) {
      try {
        logger.debug("Flushing metrics");
        await this.flushMetricsCallback();
        metricsFlushed = true;
        logger.debug("Metrics flushed successfully");
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`Failed to flush metrics: ${errorMessage}`);
        logger.error("Failed to flush metrics", { error: errorMessage });
      }
    } else {
      // No metrics callback registered, consider it flushed
      metricsFlushed = true;
    }

    // 5. Flush logs
    try {
      logger.debug("Flushing logs");
      await logger.flush();
      logsFlushed = true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to flush logs: ${errorMessage}`);
      // Can't log this error since logger might be broken
    }

    const durationMs = Date.now() - startTime;

    const result: DrainResult = {
      connectionsClosedCount,
      tracesFlushed,
      metricsFlushed,
      logsFlushed,
      durationMs,
      errors,
    };

    logger.info("Connection draining completed", {
      connectionsClosedCount,
      tracesFlushed,
      metricsFlushed,
      logsFlushed,
      durationMs,
      errorCount: errors.length,
    });

    return result;
  }

  /**
   * Register SIGTERM and SIGINT signal handlers
   * 
   * Requirements: 19.1
   * - WHEN SIGTERM signal is received THEN the system SHALL stop accepting new requests
   * - Set isShuttingDown flag
   * - Trigger shutdown sequence
   * 
   * This method should be called once during server startup.
   * Multiple calls are safe and will be ignored.
   */
  registerSignalHandlers(): void {
    if (this.signalHandlersRegistered) {
      logger.debug("Signal handlers already registered, skipping");
      return;
    }

    const handleSignal = async (signal: string): Promise<void> => {
      logger.info(`Received ${signal} signal, initiating graceful shutdown`, {
        signal,
        inFlightRequests: this._inFlightRequests,
      });

      // Set isShuttingDown flag immediately
      // Requirements: 19.1 - Stop accepting new requests
      this._isShuttingDown = true;

      // Stop accepting new connections
      // Requirements: 19.1 - Stop accepting new connections
      if (this.stopAcceptingConnectionsCallback) {
        try {
          logger.info("Stopping server from accepting new connections");
          await this.stopAcceptingConnectionsCallback();
          logger.info("Server stopped accepting new connections");
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error("Failed to stop accepting connections", { error: errorMessage });
        }
      }

      // Trigger shutdown sequence
      // Requirements: 19.2, 19.4 - Wait for in-flight requests and execute handlers
      try {
        const result = await this.shutdown();
        
        // Requirements: 19.5, 19.6 - Exit codes
        if (result.success) {
          logger.info("Graceful shutdown completed successfully", {
            totalDurationMs: result.totalDurationMs,
          });
          process.exit(0);
        } else {
          logger.error("Graceful shutdown completed with errors", {
            totalDurationMs: result.totalDurationMs,
            timedOut: result.timedOut,
            failedHandlers: result.handlers.filter(h => !h.success).map(h => h.name),
          });
          process.exit(1);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error("Shutdown failed with exception", { error: errorMessage });
        process.exit(1);
      }
    };

    // Register SIGTERM handler (standard termination signal)
    process.on("SIGTERM", () => {
      handleSignal("SIGTERM").catch((error) => {
        logger.error("SIGTERM handler failed", { error: String(error) });
        process.exit(1);
      });
    });

    // Register SIGINT handler (Ctrl+C)
    process.on("SIGINT", () => {
      handleSignal("SIGINT").catch((error) => {
        logger.error("SIGINT handler failed", { error: String(error) });
        process.exit(1);
      });
    });

    this.signalHandlersRegistered = true;
    logger.info("Signal handlers registered for graceful shutdown", {
      signals: ["SIGTERM", "SIGINT"],
    });
  }

  /**
   * Check if signal handlers have been registered
   * 
   * @returns true if signal handlers are registered
   */
  areSignalHandlersRegistered(): boolean {
    return this.signalHandlersRegistered;
  }

  /**
   * Register a shutdown handler
   * 
   * Handlers are executed in order of priority (lower numbers first).
   * Handlers with the same priority are executed in registration order.
   * 
   * @param name - Descriptive name for the handler (for logging)
   * @param handler - Async function to execute during shutdown
   * @param priority - Execution priority (default: 100, lower = earlier)
   */
  register(name: string, handler: ShutdownHandler, priority: number = 100): void {
    if (this._isShuttingDown) {
      logger.warn("Cannot register shutdown handler during shutdown", { name });
      return;
    }

    this.handlers.push({ name, handler, priority });
    
    // Sort by priority (lower first), then by registration order
    this.handlers.sort((a, b) => a.priority - b.priority);
    
    logger.debug("Shutdown handler registered", { name, priority });
  }

  /**
   * Unregister a shutdown handler by name
   * 
   * @param name - Name of the handler to remove
   * @returns true if handler was found and removed
   */
  unregister(name: string): boolean {
    const index = this.handlers.findIndex(h => h.name === name);
    if (index !== -1) {
      this.handlers.splice(index, 1);
      logger.debug("Shutdown handler unregistered", { name });
      return true;
    }
    return false;
  }

  /**
   * Check if shutdown is in progress
   * 
   * @returns true if shutdown has been initiated
   */
  isShuttingDown(): boolean {
    return this._isShuttingDown;
  }

  /**
   * Get current count of in-flight requests
   * 
   * @returns Number of requests currently being processed
   */
  getInFlightCount(): number {
    return this._inFlightRequests;
  }

  /**
   * Increment in-flight request counter
   * 
   * Call this when a new request starts processing.
   * Returns false if shutdown is in progress (request should be rejected).
   * 
   * @returns true if request was accepted, false if shutting down
   */
  trackRequest(): boolean {
    if (this._isShuttingDown) {
      return false;
    }
    this._inFlightRequests++;
    return true;
  }

  /**
   * Decrement in-flight request counter
   * 
   * Call this when a request completes (success or failure).
   */
  untrackRequest(): void {
    if (this._inFlightRequests > 0) {
      this._inFlightRequests--;
    }
  }

  /**
   * Initiate graceful shutdown
   * 
   * Requirements: 19.2, 19.4
   * - Wait up to 30 seconds for in-flight requests
   * - Execute all registered handlers
   * - Force terminate after timeout
   * 
   * @param timeoutMs - Optional override for shutdown timeout
   * @returns Promise resolving to shutdown result
   */
  async shutdown(timeoutMs?: number): Promise<ShutdownResult> {
    // If already shutting down, return existing promise
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    this._isShuttingDown = true;
    const timeout = timeoutMs ?? this.shutdownTimeoutMs;
    const startTime = Date.now();
    const inFlightAtStart = this._inFlightRequests;

    logger.info("Initiating graceful shutdown", {
      timeoutMs: timeout,
      inFlightRequests: inFlightAtStart,
      registeredHandlers: this.handlers.length,
    });

    this.shutdownPromise = this.executeShutdown(timeout, startTime, inFlightAtStart);
    return this.shutdownPromise;
  }

  /**
   * Execute the shutdown sequence
   * 
   * Requirements: 19.3
   * - Wait for in-flight requests to complete
   * - Close database connections
   * - Flush metrics and traces
   */
  private async executeShutdown(
    timeoutMs: number,
    startTime: number,
    inFlightAtStart: number
  ): Promise<ShutdownResult> {
    const handlerResults: HandlerResult[] = [];
    let timedOut = false;

    // Create timeout promise
    const timeoutPromise = new Promise<'timeout'>((resolve) => {
      setTimeout(() => resolve('timeout'), timeoutMs);
    });

    // Wait for in-flight requests to complete (with timeout)
    // Requirements: 19.3 - Wait for in-flight requests to complete
    const waitResult = await Promise.race([
      this.waitForInFlightRequests(),
      timeoutPromise,
    ]);

    if (waitResult === 'timeout' && this._inFlightRequests > 0) {
      logger.warn("Shutdown timeout reached with in-flight requests remaining", {
        remainingRequests: this._inFlightRequests,
        timeoutMs,
      });
      timedOut = true;
    }

    // Calculate remaining time for handlers
    const elapsedMs = Date.now() - startTime;
    const remainingTimeMs = Math.max(0, timeoutMs - elapsedMs);

    // Execute handlers with remaining time budget
    for (const { name, handler } of this.handlers) {
      const handlerStart = Date.now();
      
      try {
        // Create handler timeout
        const handlerTimeout = Math.min(remainingTimeMs, 5000); // Max 5s per handler
        
        await Promise.race([
          handler(),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Handler timeout')), handlerTimeout)
          ),
        ]);

        handlerResults.push({
          name,
          success: true,
          durationMs: Date.now() - handlerStart,
        });

        logger.debug("Shutdown handler completed", {
          name,
          durationMs: Date.now() - handlerStart,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        handlerResults.push({
          name,
          success: false,
          durationMs: Date.now() - handlerStart,
          error: errorMessage,
        });

        logger.error("Shutdown handler failed", {
          name,
          error: errorMessage,
          durationMs: Date.now() - handlerStart,
        });
      }
    }

    // Drain connections and flush data after handlers complete
    // Requirements: 19.3 - Close database connections, flush metrics and traces
    const drainStart = Date.now();
    try {
      const drainResult = await this.drainConnections();
      
      handlerResults.push({
        name: "connection-draining",
        success: drainResult.errors.length === 0,
        durationMs: drainResult.durationMs,
        error: drainResult.errors.length > 0 ? drainResult.errors.join("; ") : undefined,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      handlerResults.push({
        name: "connection-draining",
        success: false,
        durationMs: Date.now() - drainStart,
        error: errorMessage,
      });

      logger.error("Connection draining failed", { error: errorMessage });
    }

    const totalDurationMs = Date.now() - startTime;
    const allHandlersSucceeded = handlerResults.every(r => r.success);

    const result: ShutdownResult = {
      success: allHandlersSucceeded && !timedOut,
      totalDurationMs,
      handlers: handlerResults,
      timedOut,
      inFlightRequestsAtStart: inFlightAtStart,
      inFlightRequestsAtEnd: this._inFlightRequests,
    };

    logger.info("Graceful shutdown completed", {
      success: result.success,
      totalDurationMs: result.totalDurationMs,
      handlersExecuted: handlerResults.length,
      handlersFailed: handlerResults.filter(r => !r.success).length,
      timedOut: result.timedOut,
      inFlightRequestsAtEnd: result.inFlightRequestsAtEnd,
    });

    return result;
  }

  /**
   * Wait for all in-flight requests to complete
   * 
   * Polls every 100ms until no requests remain.
   */
  private async waitForInFlightRequests(): Promise<void> {
    const pollIntervalMs = 100;
    
    while (this._inFlightRequests > 0) {
      logger.debug("Waiting for in-flight requests", {
        remaining: this._inFlightRequests,
      });
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }
  }

  /**
   * Reset the shutdown manager state
   * 
   * Primarily useful for testing. Clears all handlers and resets state.
   * Note: Signal handlers cannot be unregistered from process, but the
   * signalHandlersRegistered flag is reset to allow re-registration tracking.
   */
  reset(): void {
    this.handlers = [];
    this._isShuttingDown = false;
    this._inFlightRequests = 0;
    this.shutdownPromise = null;
    this.stopAcceptingConnectionsCallback = null;
    this.connectionCloseCallbacks.clear();
    this.flushMetricsCallback = null;
    // Note: We don't reset signalHandlersRegistered because process signal
    // handlers cannot be easily removed. This is intentional.
    logger.debug("Shutdown manager reset");
  }

  /**
   * Get list of registered handler names
   * 
   * @returns Array of handler names in execution order
   */
  getRegisteredHandlers(): string[] {
    return this.handlers.map(h => h.name);
  }

  /**
   * Get the configured shutdown timeout
   * 
   * @returns Timeout in milliseconds
   */
  getTimeoutMs(): number {
    return this.shutdownTimeoutMs;
  }

  /**
   * Get list of registered connection close callback names
   * 
   * @returns Array of connection names
   */
  getRegisteredConnections(): string[] {
    return Array.from(this.connectionCloseCallbacks.keys());
  }

  /**
   * Check if a metrics flush callback is registered
   * 
   * @returns true if a metrics flush callback is registered
   */
  hasMetricsFlushCallback(): boolean {
    return this.flushMetricsCallback !== null;
  }
}

/**
 * Singleton instance of the shutdown manager
 */
export const shutdownManager = new ShutdownManager();

/**
 * Default shutdown timeout constant (exported for testing)
 */
export const SHUTDOWN_TIMEOUT_MS = DEFAULT_SHUTDOWN_TIMEOUT_MS;

/**
 * Export types for external use
 */
export type { DrainResult, ShutdownResult, HandlerResult };
