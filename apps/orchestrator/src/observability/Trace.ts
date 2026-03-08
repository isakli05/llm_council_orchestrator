import { v4 as uuidv4 } from "uuid";
import { logger } from "./Logger";

/**
 * Trace span for a single operation
 */
export interface TraceSpan {
  spanId: string;
  name: string;
  startTime: string;
  endTime?: string;
  durationMs?: number;
  status: "started" | "completed" | "failed";
  error?: {
    message: string;
    stack?: string;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Pipeline trace containing all spans
 * 
 * Requirements: 27.7 - Support cancelled status for pipeline cancellation
 */
export interface PipelineTrace {
  runId: string;
  mode: string;
  startTime: string;
  endTime?: string;
  totalDurationMs?: number;
  spans: TraceSpan[];
  status: "running" | "completed" | "failed" | "cancelled";
}

/**
 * Trace manages pipeline execution tracing with spans for each operation.
 */
export class Trace {
  private traces: Map<string, PipelineTrace> = new Map();

  /**
   * Start a new pipeline trace
   */
  startPipeline(mode: string): string {
    const runId = uuidv4();
    const trace: PipelineTrace = {
      runId,
      mode,
      startTime: new Date().toISOString(),
      spans: [],
      status: "running",
    };

    this.traces.set(runId, trace);
    logger.setRunId(runId);
    logger.info(`Pipeline started`, { mode, runId });

    return runId;
  }

  /**
   * Initialize a pipeline trace with a provided runId
   * 
   * This is used when the runId is generated externally (e.g., by the API controller)
   * to maintain ID consistency across the entire pipeline lifecycle.
   * 
   * @param runId - The pre-generated run ID
   * @param mode - Pipeline execution mode
   */
  initializePipeline(runId: string, mode: string): void {
    // Check if trace already exists (it might have been created by the controller)
    if (this.traces.has(runId)) {
      logger.debug(`Trace already exists for runId: ${runId}`);
      return;
    }

    const trace: PipelineTrace = {
      runId,
      mode,
      startTime: new Date().toISOString(),
      spans: [],
      status: "running",
    };

    this.traces.set(runId, trace);
    logger.setRunId(runId);
    logger.info(`Pipeline initialized with external runId`, { mode, runId });
  }

  /**
   * End a pipeline trace
   * 
   * Requirements: 27.7 - Support cancelled status for pipeline cancellation
   */
  endPipeline(runId: string, status: "completed" | "failed" | "cancelled"): void {
    const trace = this.traces.get(runId);
    if (!trace) {
      logger.warn(`Trace not found for runId: ${runId}`);
      return;
    }

    const endTime = new Date().toISOString();
    const startMs = new Date(trace.startTime).getTime();
    const endMs = new Date(endTime).getTime();

    trace.endTime = endTime;
    trace.totalDurationMs = endMs - startMs;
    trace.status = status;

    logger.info(`Pipeline ${status}`, {
      runId,
      durationMs: trace.totalDurationMs,
    });
    logger.clearRunId();
  }

  /**
   * Start a span within a pipeline
   */
  startSpan(runId: string, name: string, metadata?: Record<string, unknown>): string {
    const trace = this.traces.get(runId);
    if (!trace) {
      logger.warn(`Trace not found for runId: ${runId}`);
      return "";
    }

    const spanId = uuidv4();
    const span: TraceSpan = {
      spanId,
      name,
      startTime: new Date().toISOString(),
      status: "started",
      metadata,
    };

    trace.spans.push(span);
    logger.debug(`Span started: ${name}`, { spanId, metadata });

    return spanId;
  }

  /**
   * End a span
   */
  endSpan(
    runId: string,
    spanId: string,
    status: "completed" | "failed",
    error?: { message: string; stack?: string }
  ): void {
    const trace = this.traces.get(runId);
    if (!trace) {
      logger.warn(`Trace not found for runId: ${runId}`);
      return;
    }

    const span = trace.spans.find((s) => s.spanId === spanId);
    if (!span) {
      logger.warn(`Span not found: ${spanId}`);
      return;
    }

    const endTime = new Date().toISOString();
    const startMs = new Date(span.startTime).getTime();
    const endMs = new Date(endTime).getTime();

    span.endTime = endTime;
    span.durationMs = endMs - startMs;
    span.status = status;
    span.error = error;

    const logLevel = status === "failed" ? "error" : "debug";
    logger[logLevel](`Span ${status}: ${span.name}`, {
      spanId,
      durationMs: span.durationMs,
      error,
    });
  }

  /**
   * Get trace for a pipeline
   */
  getTrace(runId: string): PipelineTrace | undefined {
    return this.traces.get(runId);
  }

  /**
   * Get all traces
   */
  getAllTraces(): PipelineTrace[] {
    return Array.from(this.traces.values());
  }

  /**
   * Clear old traces (keep last N)
   */
  cleanup(keepLast: number = 100): void {
    const traces = Array.from(this.traces.entries());
    if (traces.length <= keepLast) {
      return;
    }

    // Sort by start time, keep most recent
    traces.sort((a, b) => {
      return (
        new Date(b[1].startTime).getTime() - new Date(a[1].startTime).getTime()
      );
    });

    const toKeep = traces.slice(0, keepLast);
    this.traces = new Map(toKeep);

    logger.debug(`Trace cleanup completed`, {
      kept: toKeep.length,
      removed: traces.length - toKeep.length,
    });
  }

  /**
   * Flush all traces during shutdown
   * 
   * This method ensures all trace data is persisted/exported before shutdown.
   * In the current implementation, traces are stored in memory, so this
   * method logs a summary and clears the traces.
   * 
   * In a production environment with external trace collectors (e.g., Jaeger, Zipkin),
   * this method would flush pending spans to the collector.
   * 
   * Requirements: 19.3 - Flush metrics and traces during shutdown
   * 
   * @returns Promise that resolves when traces are flushed
   */
  async flush(): Promise<void> {
    const allTraces = this.getAllTraces();
    const runningTraces = allTraces.filter(t => t.status === "running");
    
    // Mark any running traces as cancelled due to shutdown
    for (const runningTrace of runningTraces) {
      this.endPipeline(runningTrace.runId, "cancelled");
    }
    
    logger.info("Flushing traces during shutdown", {
      totalTraces: allTraces.length,
      runningTracesCancelled: runningTraces.length,
      completedTraces: allTraces.filter(t => t.status === "completed").length,
      failedTraces: allTraces.filter(t => t.status === "failed").length,
    });
    
    // In a production environment with external trace collectors,
    // we would call the exporter's flush method here.
    // For now, we just ensure all traces are properly ended.
  }

  /**
   * Clear all traces
   * 
   * Useful for testing or complete cleanup during shutdown.
   */
  clear(): void {
    const count = this.traces.size;
    this.traces.clear();
    logger.debug("All traces cleared", { clearedCount: count });
  }
}

// Export singleton instance
export const trace = new Trace();
