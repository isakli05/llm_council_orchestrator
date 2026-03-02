"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateDomainExclusion = exports.isValidJustification = exports.isValidDomainId = exports.DOMAIN_ID_PATTERN = exports.retryWithBackoff = exports.withTimeout = exports.sleep = exports.safeJsonParse = exports.formatJson = void 0;

// Common utilities for orchestrator and bridge.

/**
 * Format JSON with indentation
 */
const formatJson = (value) => JSON.stringify(value, null, 2);
exports.formatJson = formatJson;

/**
 * Safely parse JSON with error handling
 */
function safeJsonParse(text, fallback) {
    try {
        return JSON.parse(text);
    }
    catch (_a) {
        return fallback;
    }
}
exports.safeJsonParse = safeJsonParse;

/**
 * Sleep for specified milliseconds
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
exports.sleep = sleep;

/**
 * Execute a function with timeout
 */
async function withTimeout(fn, timeoutMs, errorMessage = "Operation timeout") {
    return Promise.race([
        fn(),
        new Promise((_, reject) => setTimeout(() => reject(new Error(errorMessage)), timeoutMs)),
    ]);
}
exports.withTimeout = withTimeout;

/**
 * Retry a function with exponential backoff
 */
async function retryWithBackoff(fn, options) {
    let lastError = null;
    for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error;
            // Check if error is retryable
            if (options.isRetryable && !options.isRetryable(lastError)) {
                throw lastError;
            }
            // Don't sleep after last attempt
            if (attempt < options.maxRetries) {
                await (0, exports.sleep)(Math.pow(2, attempt) * options.backoffBase);
            }
        }
    }
    throw lastError;
}
exports.retryWithBackoff = retryWithBackoff;

// Note: Logger and error sanitization utilities are exported from TypeScript source only
// For JS consumers, import from the TypeScript source directly

// ============================================================================
// Domain Validation Utilities
// Requirements: 12.4, 12.5
// ============================================================================

/**
 * Domain ID pattern: must match ^[a-z0-9_]+_domain$
 * Requirements: 12.4
 */
exports.DOMAIN_ID_PATTERN = /^[a-z0-9_]+_domain$/;

/**
 * Validates domain ID matches the required pattern
 * Requirements: 12.4
 */
function isValidDomainId(domainId) {
    return exports.DOMAIN_ID_PATTERN.test(domainId);
}
exports.isValidDomainId = isValidDomainId;

/**
 * Validates justification is a non-empty string (not just whitespace)
 * Requirements: 12.5
 */
function isValidJustification(justification) {
    return typeof justification === 'string' && justification.trim().length > 0;
}
exports.isValidJustification = isValidJustification;

/**
 * Validates a domain exclusion object and returns validation result
 * Requirements: 12.4, 12.5
 */
function validateDomainExclusion(exclusion) {
    const errors = [];
    // Validate domainId
    if (!exclusion.domainId || typeof exclusion.domainId !== 'string') {
        errors.push({
            field: 'domainId',
            message: 'Domain ID must be a non-empty string',
            code: 'VALIDATION_ERROR',
        });
    }
    else if (!isValidDomainId(exclusion.domainId)) {
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
    }
    else if (!isValidJustification(exclusion.justification)) {
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
exports.validateDomainExclusion = validateDomainExclusion;
