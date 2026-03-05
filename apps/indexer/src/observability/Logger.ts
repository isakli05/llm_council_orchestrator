import { LogLevel } from "@llm/shared-config";
import { BaseLogger, LogEntry as BaseLogEntry } from "@llm/shared-utils";
import { formatJson } from "@llm/shared-utils";

/**
 * Extended log entry with service context
 */
interface LogEntry extends BaseLogEntry {
  service?: string;
}

/**
 * Logger with child logger support
 */
export class Logger extends BaseLogger {
  private context: Record<string, any>;

  constructor(minLevel: LogLevel = LogLevel.INFO, context: Record<string, any> = {}) {
    super(minLevel);
    this.context = context;
  }

  /**
   * Create child logger with additional context
   */
  child(additionalContext: Record<string, any>): Logger {
    return new Logger(this.minLevel, { ...this.context, ...additionalContext });
  }

  /**
   * Override log to merge context
   */
  protected log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): void {
    const mergedContext = { ...this.context, ...context };
    super.log(level, message, mergedContext, error);
  }

  /**
   * Write log entry to console
   */
  protected write(entry: LogEntry): void {
    const parts = [
      `[${entry.timestamp}]`,
      `[${entry.level.toUpperCase()}]`,
      entry.message,
    ];

    if (entry.context && Object.keys(entry.context).length > 0) {
      parts.push(formatJson(entry.context));
    }

    if (entry.error) {
      parts.push(`\nError: ${entry.error.message}`);
      if (entry.error.stack) {
        parts.push(entry.error.stack);
      }
    }

    const formatted = parts.join(' ');

    switch (entry.level) {
      case LogLevel.DEBUG:
      case LogLevel.INFO:
        console.log(formatted);
        break;
      case LogLevel.WARN:
        console.warn(formatted);
        break;
      case LogLevel.ERROR:
        console.error(formatted);
        break;
    }
  }

  /**
   * Override error to support error parameter
   */
  error(message: string, errorOrContext?: Error | Record<string, any>, context?: Record<string, any>): void {
    if (errorOrContext instanceof Error) {
      super.error(message, context, errorOrContext);
    } else {
      super.error(message, errorOrContext);
    }
  }
}

// Re-export LogLevel for convenience
export { LogLevel };

// Global logger instance
export const logger = new Logger(LogLevel.INFO, { service: 'indexer' });
