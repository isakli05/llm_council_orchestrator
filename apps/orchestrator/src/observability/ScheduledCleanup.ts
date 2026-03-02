/**
 * Scheduled Cleanup Manager
 * 
 * Implements periodic cleanup of traces, caches, and active runs to prevent
 * memory leaks in long-running processes.
 * 
 * Requirements: 13.2, 13.3, 13.4, 13.5, 13.6
 * - Schedule trace cleanup every 15 minutes
 * - Schedule cache cleanup every 15 minutes
 * - Schedule active runs cleanup every 1 hour
 * - Use setInterval with unref() to prevent blocking graceful shutdown
 * - Log memory usage every 5 minutes at INFO level
 * - Trigger aggressive cleanup if heap usage > 80%
 */

import { logger } from "./Logger";
import { trace } from "./Trace";
import { getGlobalCacheManager } from "../discovery/cache";

/**
 * Cleanup intervals in milliseconds
 */
const CLEANUP_INTERVALS = {
  /** Trace cleanup interval: 15 minutes */
  TRACE: 15 * 60 * 1000,
  /** Cache cleanup interval: 15 minutes */
  CACHE: 15 * 60 * 1000,
  /** Active runs cleanup interval: 1 hour */
  ACTIVE_RUNS: 60 * 60 * 1000,
  /** Memory monitoring interval: 5 minutes */
  MEMORY_MONITOR: 5 * 60 * 1000,
} as const;

/**
 * Default configuration for cleanup operations
 */
const CLEANUP_DEFAULTS = {
  /** Number of traces to keep during cleanup */
  TRACES_TO_KEEP: 100,
  /** Heap usage percentage threshold for aggressive cleanup */
  HEAP_USAGE_THRESHOLD: 80,
  /** Number of items removed that triggers a warning */
  CLEANUP_WARNING_THRESHOLD: 50,
} as const;

/**
 * Cleanup statistics for logging
 */
interface CleanupStats {
  type: "trace" | "cache" | "active_runs";
  removedCount: number;
  timestamp: string;
  durationMs: number;
}

/**
 * Active runs cleanup callback type
 * This allows PipelineController to register its cleanup function
 */
type ActiveRunsCleanupCallback = () => number;

/**
 * Memory usage statistics
 */
interface MemoryStats {
  heapUsedMB: number;
  heapTotalMB: number;
  heapUsagePercent: number;
  rssMB: number;
  externalMB: number;
}

/**
 * Scheduled Cleanup Manager
 * 
 * Manages periodic cleanup of system resources to prevent memory leaks.
 * Uses setInterval with unref() to ensure timers don't prevent process exit.
 * 
 * Requirements: 13.2, 13.3, 13.4, 13.5, 13.6
 */
export class ScheduledCleanupManager {
  private traceCleanupTimer: NodeJS.Timeout | null = null;
  private cacheCleanupTimer: NodeJS.Timeout | null = null;
  private activeRunsCleanupTimer: NodeJS.Timeout | null = null;
  private memoryMonitorTimer: NodeJS.Timeout | null = null;
  private activeRunsCleanupCallback: ActiveRunsCleanupCallback | null = null;
  private isRunning: boolean = false;

  /**
   * Start all scheduled cleanup tasks
   * 
   * Requirements: 13.5, 13.6 - Schedule periodic cleanup and memory monitoring
   */
  start(): void {
    if (this.isRunning) {
      logger.warn("ScheduledCleanupManager is already running");
      return;
    }

    logger.info("Starting scheduled cleanup manager", {
      traceIntervalMs: CLEANUP_INTERVALS.TRACE,
      cacheIntervalMs: CLEANUP_INTERVALS.CACHE,
      activeRunsIntervalMs: CLEANUP_INTERVALS.ACTIVE_RUNS,
      memoryMonitorIntervalMs: CLEANUP_INTERVALS.MEMORY_MONITOR,
    });

    this.startTraceCleanup();
    this.startCacheCleanup();
    this.startActiveRunsCleanup();
    this.startMemoryMonitoring();

    this.isRunning = true;
  }

  /**
   * Stop all scheduled cleanup tasks
   */
  stop(): void {
    if (!this.isRunning) {
      logger.warn("ScheduledCleanupManager is not running");
      return;
    }

    logger.info("Stopping scheduled cleanup manager");

    if (this.traceCleanupTimer) {
      clearInterval(this.traceCleanupTimer);
      this.traceCleanupTimer = null;
    }

    if (this.cacheCleanupTimer) {
      clearInterval(this.cacheCleanupTimer);
      this.cacheCleanupTimer = null;
    }

    if (this.activeRunsCleanupTimer) {
      clearInterval(this.activeRunsCleanupTimer);
      this.activeRunsCleanupTimer = null;
    }

    if (this.memoryMonitorTimer) {
      clearInterval(this.memoryMonitorTimer);
      this.memoryMonitorTimer = null;
    }

    this.isRunning = false;
  }

  /**
   * Register a callback for active runs cleanup
   * 
   * This allows the PipelineController to provide its cleanup logic
   * without creating circular dependencies.
   * 
   * @param callback - Function that performs cleanup and returns count of removed items
   */
  registerActiveRunsCleanup(callback: ActiveRunsCleanupCallback): void {
    this.activeRunsCleanupCallback = callback;
    logger.debug("Active runs cleanup callback registered");
  }

  /**
   * Check if the cleanup manager is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Start trace cleanup timer
   * 
   * Requirements: 13.3 - Keep only last 100 traces
   * Requirements: 13.6 - Log removed count at DEBUG level
   */
  private startTraceCleanup(): void {
    this.traceCleanupTimer = setInterval(() => {
      const startTime = Date.now();
      
      try {
        // Get count before cleanup for logging
        const beforeCount = trace.getAllTraces().length;
        
        // Perform cleanup - keep last 100 traces
        trace.cleanup(CLEANUP_DEFAULTS.TRACES_TO_KEEP);
        
        const afterCount = trace.getAllTraces().length;
        const removedCount = beforeCount - afterCount;
        
        this.logCleanupStats({
          type: "trace",
          removedCount,
          timestamp: new Date().toISOString(),
          durationMs: Date.now() - startTime,
        });
      } catch (error) {
        logger.error("Trace cleanup failed", {
          error: (error as Error).message,
        });
      }
    }, CLEANUP_INTERVALS.TRACE);

    // Requirements: 13.6 - Use setInterval with unref() to prevent blocking
    if (this.traceCleanupTimer.unref) {
      this.traceCleanupTimer.unref();
    }
  }

  /**
   * Start cache cleanup timer
   * 
   * Requirements: 13.4 - Remove expired entries based on TTL
   * Requirements: 13.6 - Log removed count at DEBUG level
   */
  private startCacheCleanup(): void {
    this.cacheCleanupTimer = setInterval(() => {
      const startTime = Date.now();
      
      try {
        const cacheManager = getGlobalCacheManager();
        const cleaned = cacheManager.cleanup();
        const totalRemoved = cleaned.pattern + cleaned.dependency;
        
        this.logCleanupStats({
          type: "cache",
          removedCount: totalRemoved,
          timestamp: new Date().toISOString(),
          durationMs: Date.now() - startTime,
        });
      } catch (error) {
        logger.error("Cache cleanup failed", {
          error: (error as Error).message,
        });
      }
    }, CLEANUP_INTERVALS.CACHE);

    // Requirements: 13.6 - Use setInterval with unref() to prevent blocking
    if (this.cacheCleanupTimer.unref) {
      this.cacheCleanupTimer.unref();
    }
  }

  /**
   * Start active runs cleanup timer
   * 
   * Requirements: 13.2 - Schedule cleanup after 1 hour
   * Requirements: 13.6 - Log removed count at DEBUG level
   */
  private startActiveRunsCleanup(): void {
    this.activeRunsCleanupTimer = setInterval(() => {
      const startTime = Date.now();
      
      try {
        let removedCount = 0;
        
        if (this.activeRunsCleanupCallback) {
          removedCount = this.activeRunsCleanupCallback();
        } else {
          logger.debug("No active runs cleanup callback registered");
        }
        
        this.logCleanupStats({
          type: "active_runs",
          removedCount,
          timestamp: new Date().toISOString(),
          durationMs: Date.now() - startTime,
        });
      } catch (error) {
        logger.error("Active runs cleanup failed", {
          error: (error as Error).message,
        });
      }
    }, CLEANUP_INTERVALS.ACTIVE_RUNS);

    // Requirements: 13.6 - Use setInterval with unref() to prevent blocking
    if (this.activeRunsCleanupTimer.unref) {
      this.activeRunsCleanupTimer.unref();
    }
  }

  /**
   * Start memory monitoring timer
   * 
   * Requirements: 13.5 - Log memory usage every 5 minutes
   * - Calculate heap usage percentage
   * - Trigger aggressive cleanup if usage > 80%
   */
  private startMemoryMonitoring(): void {
    this.memoryMonitorTimer = setInterval(() => {
      try {
        const memoryStats = this.getMemoryStats();
        
        // Log memory usage at INFO level
        logger.info("Memory usage report", {
          heapUsedMB: memoryStats.heapUsedMB.toFixed(2),
          heapTotalMB: memoryStats.heapTotalMB.toFixed(2),
          heapUsagePercent: memoryStats.heapUsagePercent.toFixed(1),
          rssMB: memoryStats.rssMB.toFixed(2),
          externalMB: memoryStats.externalMB.toFixed(2),
        });

        // Trigger aggressive cleanup if heap usage > 80%
        if (memoryStats.heapUsagePercent > CLEANUP_DEFAULTS.HEAP_USAGE_THRESHOLD) {
          logger.warn("High memory usage detected, triggering aggressive cleanup", {
            heapUsagePercent: memoryStats.heapUsagePercent.toFixed(1),
            threshold: CLEANUP_DEFAULTS.HEAP_USAGE_THRESHOLD,
          });
          
          this.triggerAggressiveCleanup();
        }
      } catch (error) {
        logger.error("Memory monitoring failed", {
          error: (error as Error).message,
        });
      }
    }, CLEANUP_INTERVALS.MEMORY_MONITOR);

    // Requirements: 13.6 - Use setInterval with unref() to prevent blocking
    if (this.memoryMonitorTimer.unref) {
      this.memoryMonitorTimer.unref();
    }
  }

  /**
   * Get current memory statistics
   * 
   * Requirements: 13.5 - Calculate heap usage percentage
   */
  getMemoryStats(): MemoryStats {
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / (1024 * 1024);
    const heapTotalMB = memUsage.heapTotal / (1024 * 1024);
    const heapUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    const rssMB = memUsage.rss / (1024 * 1024);
    const externalMB = memUsage.external / (1024 * 1024);

    return {
      heapUsedMB,
      heapTotalMB,
      heapUsagePercent,
      rssMB,
      externalMB,
    };
  }

  /**
   * Trigger aggressive cleanup when memory usage is high
   * 
   * Requirements: 13.5 - Trigger aggressive cleanup if usage > 80%
   * - Emit warning if cleanup removes > 50 items
   */
  private triggerAggressiveCleanup(): void {
    const results = this.triggerCleanupNow();
    const totalRemoved = results.trace + results.cache + results.activeRuns;

    // Emit warning if cleanup removes > 50 items
    if (totalRemoved > CLEANUP_DEFAULTS.CLEANUP_WARNING_THRESHOLD) {
      logger.warn("Aggressive cleanup removed significant number of items", {
        totalRemoved,
        traceRemoved: results.trace,
        cacheRemoved: results.cache,
        activeRunsRemoved: results.activeRuns,
        warningThreshold: CLEANUP_DEFAULTS.CLEANUP_WARNING_THRESHOLD,
      });
    } else {
      logger.info("Aggressive cleanup completed", {
        totalRemoved,
        traceRemoved: results.trace,
        cacheRemoved: results.cache,
        activeRunsRemoved: results.activeRuns,
      });
    }
  }

  /**
   * Log cleanup statistics
   * 
   * Requirements: 13.6 - Log removed count at DEBUG level
   */
  private logCleanupStats(stats: CleanupStats): void {
    logger.debug(`${stats.type} cleanup completed`, {
      type: stats.type,
      removed: stats.removedCount,
      timestamp: stats.timestamp,
      durationMs: stats.durationMs,
    });
  }

  /**
   * Manually trigger all cleanup operations
   * Useful for testing or when memory pressure is detected
   * 
   * @returns Object containing cleanup results for each type
   */
  triggerCleanupNow(): { trace: number; cache: number; activeRuns: number } {
    const results = {
      trace: 0,
      cache: 0,
      activeRuns: 0,
    };

    // Trace cleanup
    try {
      const beforeCount = trace.getAllTraces().length;
      trace.cleanup(CLEANUP_DEFAULTS.TRACES_TO_KEEP);
      results.trace = beforeCount - trace.getAllTraces().length;
    } catch (error) {
      logger.error("Manual trace cleanup failed", {
        error: (error as Error).message,
      });
    }

    // Cache cleanup
    try {
      const cacheManager = getGlobalCacheManager();
      const cleaned = cacheManager.cleanup();
      results.cache = cleaned.pattern + cleaned.dependency;
    } catch (error) {
      logger.error("Manual cache cleanup failed", {
        error: (error as Error).message,
      });
    }

    // Active runs cleanup
    try {
      if (this.activeRunsCleanupCallback) {
        results.activeRuns = this.activeRunsCleanupCallback();
      }
    } catch (error) {
      logger.error("Manual active runs cleanup failed", {
        error: (error as Error).message,
      });
    }

    logger.info("Manual cleanup completed", results);
    return results;
  }
}

/**
 * Singleton instance of the cleanup manager
 */
export const scheduledCleanupManager = new ScheduledCleanupManager();
