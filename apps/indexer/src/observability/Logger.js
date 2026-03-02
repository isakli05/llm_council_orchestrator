"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.Logger = exports.LogLevel = void 0;
var LogLevel;
(function (LogLevel) {
    LogLevel["DEBUG"] = "DEBUG";
    LogLevel["INFO"] = "INFO";
    LogLevel["WARN"] = "WARN";
    LogLevel["ERROR"] = "ERROR";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
class Logger {
    constructor(minLevel = LogLevel.INFO, context = {}) {
        this.minLevel = minLevel;
        this.context = context;
    }
    shouldLog(level) {
        const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
        const minIndex = levels.indexOf(this.minLevel);
        const currentIndex = levels.indexOf(level);
        return currentIndex >= minIndex;
    }
    formatEntry(entry) {
        const parts = [
            `[${entry.timestamp}]`,
            `[${entry.level}]`,
            entry.message,
        ];
        if (entry.context && Object.keys(entry.context).length > 0) {
            parts.push(JSON.stringify(entry.context));
        }
        if (entry.error) {
            parts.push(`\nError: ${entry.error.message}`);
            if (entry.error.stack) {
                parts.push(entry.error.stack);
            }
        }
        return parts.join(' ');
    }
    log(level, message, context, error) {
        if (!this.shouldLog(level)) {
            return;
        }
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            context: { ...this.context, ...context },
            error,
        };
        const formatted = this.formatEntry(entry);
        switch (level) {
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
    debug(message, context) {
        this.log(LogLevel.DEBUG, message, context);
    }
    info(message, context) {
        this.log(LogLevel.INFO, message, context);
    }
    warn(message, context) {
        this.log(LogLevel.WARN, message, context);
    }
    error(message, error, context) {
        this.log(LogLevel.ERROR, message, context, error);
    }
    child(additionalContext) {
        return new Logger(this.minLevel, { ...this.context, ...additionalContext });
    }
}
exports.Logger = Logger;
// Global logger instance
exports.logger = new Logger(LogLevel.INFO, { service: 'indexer' });
