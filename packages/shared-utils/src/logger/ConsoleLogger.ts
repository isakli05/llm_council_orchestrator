import { LogLevel } from "@llm/shared-config";
import { BaseLogger, LogEntry } from "./BaseLogger";
import { formatJson } from "../index";

/**
 * Console-based logger implementation
 */
export class ConsoleLogger extends BaseLogger {
  /**
   * Write log entry to console
   */
  protected write(entry: LogEntry): void {
    const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}]`;
    const contextStr = entry.context
      ? `\n${formatJson(entry.context)}`
      : "";
    const errorStr = entry.error
      ? `\nError: ${entry.error.message}${entry.error.stack ? `\n${entry.error.stack}` : ""}`
      : "";

    const output = `${prefix} ${entry.message}${contextStr}${errorStr}`;

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
}
