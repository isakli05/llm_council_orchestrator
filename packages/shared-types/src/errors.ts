/**
 * Standard API error structure used across all services
 */
export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Details about retryable error detection
 */
export interface RetryableErrorDetails {
  /** Reason why the error was classified as retryable or non-retryable */
  reason?: string;
  /** HTTP status code if available */
  httpStatus?: number;
}

/**
 * Error response with optional retry flag
 */
export interface RetryableError extends ApiError {
  retryable?: boolean;
  /** Additional details about the error classification */
  details?: RetryableErrorDetails | unknown;
}
