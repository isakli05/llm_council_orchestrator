"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeMessage = exports.isSensitiveMessage = exports.sanitizeErrorObject = exports.createFullErrorDetails = exports.sanitizeError = exports.GENERIC_ERROR_MESSAGES = exports.isProduction = void 0;

/**
 * Error Sanitization Utilities
 * 
 * Provides utilities for sanitizing error responses based on environment.
 * In production mode, stack traces are stripped and generic messages are returned.
 * Full error details are always logged internally.
 * 
 * Requirements: 12.7
 */

/**
 * Determines if the current environment is production.
 * Checks NODE_ENV environment variable.
 */
function isProduction() {
    return process.env.NODE_ENV === 'production';
}
exports.isProduction = isProduction;

/**
 * Generic error messages for different error categories.
 */
exports.GENERIC_ERROR_MESSAGES = {
    INTERNAL_ERROR: 'An unexpected error occurred',
    DATABASE_ERROR: 'A database error occurred',
    SERVICE_UNAVAILABLE: 'Service temporarily unavailable',
    TIMEOUT_ERROR: 'Request timed out',
    UNKNOWN_ERROR: 'An error occurred',
};

/**
 * Error codes that should always use generic messages in production.
 */
const SENSITIVE_ERROR_CODES = new Set([
    'INTERNAL_ERROR',
    'DATABASE_ERROR',
    'CONNECTION_ERROR',
    'UNEXPECTED_ERROR',
]);

/**
 * HTTP status codes that indicate internal errors.
 */
const INTERNAL_ERROR_STATUS_CODES = new Set([500, 502, 503, 504]);

/**
 * Sanitizes an error for API response based on environment.
 */
function sanitizeError(options) {
    var _a;
    const { code, message, statusCode, details, forceProduction } = options;
    const isProd = forceProduction !== null && forceProduction !== void 0 ? forceProduction : isProduction();
    
    const isInternalError = 
        (statusCode !== undefined && INTERNAL_ERROR_STATUS_CODES.has(statusCode)) ||
        SENSITIVE_ERROR_CODES.has(code);
    
    if (isProd && isInternalError) {
        return {
            code,
            message: exports.GENERIC_ERROR_MESSAGES[code] || exports.GENERIC_ERROR_MESSAGES.UNKNOWN_ERROR,
        };
    }
    
    const sanitized = {
        code,
        message,
    };
    
    if (details !== undefined && (!isProd || !isInternalError)) {
        sanitized.details = details;
    }
    
    return sanitized;
}
exports.sanitizeError = sanitizeError;

/**
 * Creates full error details for internal logging.
 */
function createFullErrorDetails(error, additionalContext) {
    const timestamp = new Date().toISOString();
    
    if (error instanceof Error) {
        return {
            code: error.code || 'UNKNOWN_ERROR',
            message: error.message,
            stack: error.stack,
            details: additionalContext,
            timestamp,
        };
    }
    
    return {
        code: 'UNKNOWN_ERROR',
        message: String(error),
        details: additionalContext,
        timestamp,
    };
}
exports.createFullErrorDetails = createFullErrorDetails;

/**
 * Sanitizes an Error object for API response.
 */
function sanitizeErrorObject(error, statusCode, forceProduction) {
    if (statusCode === void 0) { statusCode = 500; }
    const fullDetails = createFullErrorDetails(error);
    
    const sanitized = sanitizeError({
        code: fullDetails.code,
        message: fullDetails.message,
        statusCode,
        stack: fullDetails.stack,
        details: fullDetails.details,
        forceProduction,
    });
    
    return { fullDetails, sanitized };
}
exports.sanitizeErrorObject = sanitizeErrorObject;

/**
 * Checks if an error message should be considered sensitive.
 */
function isSensitiveMessage(message) {
    const sensitivePatterns = [
        /password/i,
        /secret/i,
        /api[_-]?key/i,
        /token/i,
        /credential/i,
        /connection string/i,
        /database.*error/i,
        /sql.*error/i,
        /internal.*error/i,
        /stack.*trace/i,
        /at\s+\w+\s+\(/i,
    ];
    
    return sensitivePatterns.some(pattern => pattern.test(message));
}
exports.isSensitiveMessage = isSensitiveMessage;

/**
 * Sanitizes an error message by removing potentially sensitive information.
 */
function sanitizeMessage(message) {
    if (!message) return 'An error occurred';
    
    let sanitized = message.replace(/\s+at\s+\w+\s+\([^)]+\)/g, '');
    sanitized = sanitized.replace(/\/[^\s]+\.(js|ts|json)/g, '[path]');
    sanitized = sanitized.replace(
        /(password|secret|api[_-]?key|token|credential)[=:]\s*['"]?[^'"\s]+['"]?/gi,
        '$1=[REDACTED]'
    );
    
    return sanitized.trim() || 'An error occurred';
}
exports.sanitizeMessage = sanitizeMessage;
