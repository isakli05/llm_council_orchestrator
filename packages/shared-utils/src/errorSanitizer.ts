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
 * 
 * @returns true if NODE_ENV is 'production', false otherwise
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Generic error messages for different error categories.
 * Used in production to avoid exposing internal details.
 */
export const GENERIC_ERROR_MESSAGES: Record<string, string> = {
  INTERNAL_ERROR: 'An unexpected error occurred',
  DATABASE_ERROR: 'A database error occurred',
  SERVICE_UNAVAILABLE: 'Service temporarily unavailable',
  TIMEOUT_ERROR: 'Request timed out',
  UNKNOWN_ERROR: 'An error occurred',
};

/**
 * Error codes that should always use generic messages in production.
 * These are typically internal errors that shouldn't expose details.
 */
const SENSITIVE_ERROR_CODES = new Set([
  'INTERNAL_ERROR',
  'DATABASE_ERROR',
  'CONNECTION_ERROR',
  'UNEXPECTED_ERROR',
]);

/**
 * HTTP status codes that indicate internal errors (should be sanitized in production).
 */
const INTERNAL_ERROR_STATUS_CODES = new Set([500, 502, 503, 504]);

/**
 * Options for sanitizing an error.
 */
export interface SanitizeErrorOptions {
  /** The error code (e.g., 'INTERNAL_ERROR', 'VALIDATION_ERROR') */
  code: string;
  /** The original error message */
  message: string;
  /** HTTP status code */
  statusCode?: number;
  /** Stack trace (will be stripped in production) */
  stack?: string;
  /** Additional error details (will be stripped in production for internal errors) */
  details?: unknown;
  /** Force production mode (useful for testing) */
  forceProduction?: boolean;
}

/**
 * Sanitized error response suitable for API responses.
 */
export interface SanitizedError {
  /** Error code */
  code: string;
  /** Sanitized error message (generic in production for internal errors) */
  message: string;
  /** Error details (only included in non-production for internal errors) */
  details?: unknown;
}

/**
 * Full error details for internal logging.
 */
export interface FullErrorDetails {
  /** Error code */
  code: string;
  /** Original error message */
  message: string;
  /** HTTP status code */
  statusCode?: number;
  /** Stack trace */
  stack?: string;
  /** Additional error details */
  details?: unknown;
  /** Timestamp when the error occurred */
  timestamp: string;
}

/**
 * Sanitizes an error for API response based on environment.
 * 
 * In production mode:
 * - Stack traces are never included
 * - Internal errors (5xx) return generic messages
 * - Sensitive error codes return generic messages
 * - Details are stripped for internal errors
 * 
 * In non-production mode:
 * - Original messages are preserved
 * - Details are included
 * - Stack traces are still not included in API responses (but logged)
 * 
 * Requirements: 12.7
 * 
 * @param options - Error sanitization options
 * @returns Sanitized error suitable for API response
 * 
 * @example
 * // In production with internal error
 * sanitizeError({ code: 'INTERNAL_ERROR', message: 'Database connection failed', statusCode: 500 })
 * // Returns: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }
 * 
 * // In development with same error
 * sanitizeError({ code: 'INTERNAL_ERROR', message: 'Database connection failed', statusCode: 500 })
 * // Returns: { code: 'INTERNAL_ERROR', message: 'Database connection failed' }
 */
export function sanitizeError(options: SanitizeErrorOptions): SanitizedError {
  const { code, message, statusCode, details, forceProduction } = options;
  const isProd = forceProduction ?? isProduction();
  
  // Determine if this is an internal/sensitive error
  const isInternalError = 
    (statusCode !== undefined && INTERNAL_ERROR_STATUS_CODES.has(statusCode)) ||
    SENSITIVE_ERROR_CODES.has(code);
  
  // In production, use generic messages for internal errors
  if (isProd && isInternalError) {
    return {
      code,
      message: GENERIC_ERROR_MESSAGES[code] || GENERIC_ERROR_MESSAGES.UNKNOWN_ERROR,
    };
  }
  
  // In non-production or for non-internal errors, return original message
  const sanitized: SanitizedError = {
    code,
    message,
  };
  
  // Include details only if not in production or not an internal error
  if (details !== undefined && (!isProd || !isInternalError)) {
    sanitized.details = details;
  }
  
  return sanitized;
}

/**
 * Creates full error details for internal logging.
 * This should always be called before sanitizing to ensure full error context is logged.
 * 
 * Requirements: 12.7 - Always log full errors internally
 * 
 * @param error - The original error
 * @param additionalContext - Additional context to include in the log
 * @returns Full error details for logging
 * 
 * @example
 * const fullDetails = createFullErrorDetails(error, { requestId: '123', userId: 'abc' });
 * logger.error('Request failed', fullDetails);
 */
export function createFullErrorDetails(
  error: Error | unknown,
  additionalContext?: Record<string, unknown>
): FullErrorDetails {
  const timestamp = new Date().toISOString();
  
  if (error instanceof Error) {
    return {
      code: (error as any).code || 'UNKNOWN_ERROR',
      message: error.message,
      stack: error.stack,
      details: additionalContext,
      timestamp,
    };
  }
  
  // Handle non-Error objects
  return {
    code: 'UNKNOWN_ERROR',
    message: String(error),
    details: additionalContext,
    timestamp,
  };
}

/**
 * Sanitizes an Error object for API response.
 * Convenience function that combines createFullErrorDetails and sanitizeError.
 * 
 * Requirements: 12.7
 * 
 * @param error - The original error
 * @param statusCode - HTTP status code
 * @param forceProduction - Force production mode (useful for testing)
 * @returns Object containing both full details (for logging) and sanitized error (for response)
 * 
 * @example
 * const { fullDetails, sanitized } = sanitizeErrorObject(error, 500);
 * logger.error('Request failed', fullDetails);
 * reply.status(500).send({ error: sanitized });
 */
export function sanitizeErrorObject(
  error: Error | unknown,
  statusCode: number = 500,
  forceProduction?: boolean
): { fullDetails: FullErrorDetails; sanitized: SanitizedError } {
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

/**
 * Checks if an error message should be considered sensitive.
 * Sensitive messages may contain internal implementation details.
 * 
 * @param message - The error message to check
 * @returns true if the message appears to contain sensitive information
 */
export function isSensitiveMessage(message: string): boolean {
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
    /at\s+\w+\s+\(/i, // Stack trace pattern
  ];
  
  return sensitivePatterns.some(pattern => pattern.test(message));
}

/**
 * Sanitizes an error message by removing potentially sensitive information.
 * This is a more aggressive sanitization for messages that may contain secrets.
 * 
 * @param message - The error message to sanitize
 * @returns Sanitized message with sensitive information removed
 */
export function sanitizeMessage(message: string): string {
  if (!message) return 'An error occurred';
  
  // Remove potential stack traces
  let sanitized = message.replace(/\s+at\s+\w+\s+\([^)]+\)/g, '');
  
  // Remove file paths
  sanitized = sanitized.replace(/\/[^\s]+\.(js|ts|json)/g, '[path]');
  
  // Remove potential secrets (key=value patterns with sensitive keys)
  sanitized = sanitized.replace(
    /(password|secret|api[_-]?key|token|credential)[=:]\s*['"]?[^'"\s]+['"]?/gi,
    '$1=[REDACTED]'
  );
  
  return sanitized.trim() || 'An error occurred';
}
