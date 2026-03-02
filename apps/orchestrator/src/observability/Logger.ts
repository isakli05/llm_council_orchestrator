import { LogLevel } from "@llm/shared-config";
import { BaseLogger, LogEntry as BaseLogEntry } from "@llm/shared-utils";
import { formatJson } from "@llm/shared-utils";

/**
 * Extended log entry with runId
 */
interface LogEntry extends BaseLogEntry {
  runId?: string;
}

/**
 * Logger provides structured logging for the orchestrator.
 * Logs are written to console with structured format.
 */
export class Logger extends BaseLogger {
  private runId?: string;

  constructor(minLevel: LogLevel = LogLevel.INFO) {
    super(minLevel);
  }

  /**
   * Set run ID for all subsequent logs
   */
  setRunId(runId: string): void {
    this.runId = runId;
  }

  /**
   * Clear run ID
   */
  clearRunId(): void {
    this.runId = undefined;
  }

  /**
   * Log debug message
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Log info message
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Log error message
   */
  error(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, context);
  }

  /**
   * Internal log method with runId support
   */
  protected log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>
  ): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context,
      runId: this.runId,
    };

    this.write(entry);
  }

  /**
   * Write log entry to output
   */
  protected write(entry: LogEntry): void {
    const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}]`;
    const runIdStr = entry.runId ? ` [${entry.runId}]` : "";
    const contextStr = entry.context
      ? `\n${formatJson(entry.context)}`
      : "";

    const output = `${prefix}${runIdStr} ${entry.message}${contextStr}`;

    // Write to appropriate console method
    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(output);
        break;
      case LogLevel.INFO:
        console.info(output);
        break;
      case LogLevel.WARN:
        console.warn(output);
        break;
      case LogLevel.ERROR:
        console.error(output);
        break;
    }
  }

  /**
   * Flush any buffered log entries
   * 
   * In the current implementation, logs are written synchronously to console,
   * so there's nothing to flush. However, in a production environment with
   * file transports or external log aggregators, this method would ensure
   * all buffered logs are written before shutdown.
   * 
   * Requirements: 19.3 - Flush metrics and traces during shutdown
   * 
   * @returns Promise that resolves when logs are flushed
   */
  async flush(): Promise<void> {
    // In a production environment with buffered file transports,
    // we would flush the write streams here.
    // For console output, logs are written synchronously.
    this.info("Logger flushed during shutdown");
  }
}

// Export singleton instance
export const logger = new Logger();

// Re-export LogLevel for convenience
export { LogLevel };
