/**
 * Minimal logging utility for MCP Bridge with JSON output
 */

import { LogLevel } from "@llm/shared-config";
import { BaseLogger, LogEntry } from "@llm/shared-utils";
import { formatJson } from "@llm/shared-utils";

/**
 * JSON logger for MCP Bridge
 */
class Logger extends BaseLogger {
  /**
   * Write log entry as JSON
   */
  protected write(entry: LogEntry): void {
    const logEntry = {
      timestamp: entry.timestamp,
      level: entry.level,
      message: entry.message,
      ...(entry.context && Object.keys(entry.context).length > 0 ? { meta: entry.context } : {}),
    };

    const output = formatJson(logEntry);

    if (entry.level === LogLevel.ERROR) {
      console.error(output);
    } else {
      console.log(output);
    }
  }

  /**
   * Set minimum log level
   */
  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }
}

// Re-export LogLevel for convenience
export { LogLevel };

export const logger = new Logger();
