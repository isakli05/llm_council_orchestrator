"use strict";
/**
 * Minimal logging utility for MCP Bridge
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
class Logger {
    constructor() {
        this.minLevel = "info";
        this.levels = {
            debug: 0,
            info: 1,
            warn: 2,
            error: 3,
        };
    }
    setMinLevel(level) {
        this.minLevel = level;
    }
    shouldLog(level) {
        return this.levels[level] >= this.levels[this.minLevel];
    }
    log(level, message, meta) {
        if (!this.shouldLog(level))
            return;
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            ...(meta && typeof meta === 'object' && meta !== null ? { meta } : {}),
        };
        const output = JSON.stringify(logEntry);
        if (level === "error") {
            console.error(output);
        }
        else {
            console.log(output);
        }
    }
    debug(message, meta) {
        this.log("debug", message, meta);
    }
    info(message, meta) {
        this.log("info", message, meta);
    }
    warn(message, meta) {
        this.log("warn", message, meta);
    }
    error(message, meta) {
        this.log("error", message, meta);
    }
}
exports.logger = new Logger();
