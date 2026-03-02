// Common utilities for orchestrator and bridge.

/**
 * Format JSON with indentation
 */
export const formatJson = (value: unknown): string =>
  JSON.stringify(value, null, 2);

/**
 * Safely parse JSON with error handling
 */
export function safeJsonParse<T = unknown>(
  text: string,
  fallback?: T
): T | undefined {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

/**
 * Sleep for specified milliseconds
 */
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Execute a function with timeout
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  errorMessage = "Operation timeout"
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
}

/**
 * Retry options
 */
export interface RetryOptions {
  maxRetries: number;
  backoffBase: number;
  isRetryable?: (error: Error) => boolean;
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Check if error is retryable
      if (options.isRetryable && !options.isRetryable(lastError)) {
        throw lastError;
      }

      // Don't sleep after last attempt
      if (attempt < options.maxRetries) {
        await sleep(Math.pow(2, attempt) * options.backoffBase);
      }
    }
  }

  throw lastError;
}

// Re-export logger
export * from "./logger";

// Re-export error sanitization utilities
export * from "./errorSanitizer";

// Re-export LRU cache
export * from "./LRUCache";

// Re-export version negotiation utilities
export * from "./versionNegotiation";

// ============================================================================
// Domain Validation Utilities
// Requirements: 12.4, 12.5
// ============================================================================

/**
 * Domain ID pattern: must match ^[a-z0-9_]+_domain$
 * Requirements: 12.4
 */
export const DOMAIN_ID_PATTERN = /^[a-z0-9_]+_domain$/;

/**
 * Validates domain ID matches the required pattern
 * Requirements: 12.4
 * 
 * @param domainId - The domain ID to validate
 * @returns true if the domain ID matches the pattern ^[a-z0-9_]+_domain$
 * 
 * @example
 * isValidDomainId('auth_domain') // true
 * isValidDomainId('payment_domain') // true
 * isValidDomainId('invalid') // false
 * isValidDomainId('UPPER_domain') // false
 */
export function isValidDomainId(domainId: string): boolean {
  return DOMAIN_ID_PATTERN.test(domainId);
}

/**
 * Validates justification is a non-empty string (not just whitespace)
 * Requirements: 12.5
 * 
 * @param justification - The justification string to validate
 * @returns true if the justification is a non-empty string with non-whitespace content
 * 
 * @example
 * isValidJustification('This is a valid justification') // true
 * isValidJustification('') // false
 * isValidJustification('   ') // false
 */
export function isValidJustification(justification: string): boolean {
  return typeof justification === 'string' && justification.trim().length > 0;
}

/**
 * Domain exclusion interface
 */
export interface DomainExclusionInput {
  domainId: string;
  justification: string;
}

/**
 * Validation result for domain exclusion
 */
export interface DomainExclusionValidationResult {
  valid: boolean;
  errors: Array<{
    field: string;
    message: string;
    code: string;
  }>;
}

/**
 * Validates a domain exclusion object and returns validation result
 * Requirements: 12.4, 12.5
 * 
 * @param exclusion - The domain exclusion to validate
 * @returns Validation result with errors if any
 */
export function validateDomainExclusion(exclusion: DomainExclusionInput): DomainExclusionValidationResult {
  const errors: Array<{ field: string; message: string; code: string }> = [];

  // Validate domainId
  if (!exclusion.domainId || typeof exclusion.domainId !== 'string') {
    errors.push({
      field: 'domainId',
      message: 'Domain ID must be a non-empty string',
      code: 'VALIDATION_ERROR',
    });
  } else if (!isValidDomainId(exclusion.domainId)) {
    errors.push({
      field: 'domainId',
      message: `Domain ID must match pattern: ^[a-z0-9_]+_domain$ (e.g., 'auth_domain', 'payment_domain'). Got: '${exclusion.domainId}'`,
      code: 'VALIDATION_ERROR',
    });
  }

  // Validate justification
  if (!exclusion.justification || typeof exclusion.justification !== 'string') {
    errors.push({
      field: 'justification',
      message: 'Justification must be a non-empty string',
      code: 'VALIDATION_ERROR',
    });
  } else if (!isValidJustification(exclusion.justification)) {
    errors.push({
      field: 'justification',
      message: 'Justification cannot be empty or only whitespace',
      code: 'VALIDATION_ERROR',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}