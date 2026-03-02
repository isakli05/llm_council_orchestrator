/**
 * Test utilities for property-based testing with fast-check
 * 
 * This module provides common generators and test helpers for the LLM Council Orchestrator.
 */

import * as fc from 'fast-check';

/**
 * Default number of test iterations for property-based tests.
 * Set to 100 as per design document requirements.
 */
export const DEFAULT_NUM_RUNS = 100;

/**
 * Fast-check configuration with project defaults
 */
export const fcConfig: fc.Parameters<unknown> = {
  numRuns: DEFAULT_NUM_RUNS,
  verbose: false,
  endOnFailure: true,
};

/**
 * Generator for valid provider types
 */
export const providerTypeArb = fc.constantFrom(
  'openai',
  'anthropic',
  'zai',
  'gemini',
  'openai-openrouter',
  'anthropic-openrouter',
  'zai-openrouter',
  'gemini-openrouter'
);

/**
 * Generator for valid model IDs
 */
export const modelIdArb = fc.constantFrom(
  'gpt-5.2',
  'gpt-5.2-pro',
  'claude-opus-4-5',
  'claude-sonnet-4-5',
  'glm-4.6',
  'gemini-3-pro'
);

/**
 * Generator for reasoning effort levels
 */
export const reasoningEffortArb = fc.constantFrom('low', 'medium', 'high', 'xhigh');

/**
 * Generator for thinking budget tokens (valid range)
 */
export const thinkingBudgetArb = fc.integer({ min: 1024, max: 8192 });

/**
 * Generator for valid domain IDs (matches pattern ^[a-z0-9_]+_domain$)
 */
export const domainIdArb = fc
  .stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_'.split('')), { minLength: 1, maxLength: 20 })
  .map(s => `${s}_domain`);

/**
 * Generator for invalid domain IDs (does NOT match pattern ^[a-z0-9_]+_domain$)
 * Requirements: 12.4 - For negative testing
 */
export const invalidDomainIdArb = fc.oneof(
  // Missing _domain suffix
  fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_'.split('')), { minLength: 1, maxLength: 20 }),
  // Contains uppercase letters
  fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')), { minLength: 1, maxLength: 10 }).map(s => `${s}_domain`),
  // Contains special characters
  fc.constantFrom('auth-domain', 'payment.domain', 'user@domain', 'test domain', 'test_Domain'),
  // Empty string
  fc.constant(''),
  // Just _domain
  fc.constant('_domain'),
  // Whitespace only
  fc.constant('   '),
);

/**
 * Generator for valid justifications (non-empty, non-whitespace strings)
 * Requirements: 12.5
 */
export const validJustificationArb = fc.string({ minLength: 1, maxLength: 500 }).filter(s => s.trim().length > 0);

/**
 * Generator for invalid justifications (empty or whitespace-only strings)
 * Requirements: 12.5 - For negative testing
 */
export const invalidJustificationArb = fc.oneof(
  fc.constant(''),
  fc.constant('   '),
  fc.constant('\t'),
  fc.constant('\n'),
  fc.constant('  \t\n  '),
);

/**
 * Generator for non-empty strings (for justifications, queries, etc.)
 */
export const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 500 });

/**
 * Generator for valid file paths (no path traversal)
 */
export const safeFilePathArb = fc
  .array(
    fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_-'.split('')), { minLength: 1, maxLength: 20 }),
    { minLength: 1, maxLength: 5 }
  )
  .map(parts => parts.join('/'));

/**
 * Generator for path traversal attempts (for negative testing)
 */
export const pathTraversalArb = fc.constantFrom(
  '../etc/passwd',
  '../../secret',
  'foo/../../../bar',
  '/absolute/path',
  'normal/path/../../../escape'
);

/**
 * Generator for API keys (mock format)
 */
export const apiKeyArb = fc.constantFrom(
  'sk-test-key-12345',
  'sk-ant-test-key-67890',
  'key-test-abcdef'
);

/**
 * Generator for HTTP status codes
 */
export const httpStatusArb = {
  success: fc.constantFrom(200, 201, 204),
  clientError: fc.constantFrom(400, 401, 403, 404, 429),
  serverError: fc.constantFrom(500, 502, 503, 504),
  retryable: fc.constantFrom(429, 500, 502, 503, 504),
  nonRetryable: fc.constantFrom(400, 401, 403, 404),
};

/**
 * Generator for ChatMessage objects
 */
export const chatMessageArb = fc.record({
  role: fc.constantFrom('system', 'user', 'assistant'),
  content: nonEmptyStringArb,
});

/**
 * Generator for arrays of ChatMessages
 */
export const chatMessagesArb = fc.array(chatMessageArb, { minLength: 1, maxLength: 10 });

/**
 * Generator for ModelCallOptions
 */
export const modelCallOptionsArb = fc.record({
  temperature: fc.option(fc.float({ min: 0, max: 2, noNaN: true }), { nil: undefined }),
  maxTokens: fc.option(fc.integer({ min: 1, max: 4096 }), { nil: undefined }),
  timeoutMs: fc.option(fc.integer({ min: 1000, max: 120000 }), { nil: undefined }),
  thinking: fc.option(
    fc.record({
      type: fc.option(fc.constantFrom('enabled', 'disabled'), { nil: undefined }),
      effort: fc.option(reasoningEffortArb, { nil: undefined }),
      budget_tokens: fc.option(thinkingBudgetArb, { nil: undefined }),
    }),
    { nil: undefined }
  ),
});

/**
 * Helper to run a property test with standard configuration
 */
export function runProperty<T>(
  name: string,
  arb: fc.Arbitrary<T>,
  predicate: (value: T) => boolean | void,
  config: Partial<fc.Parameters<[T]>> = {}
): void {
  fc.assert(
    fc.property(arb, predicate),
    { numRuns: DEFAULT_NUM_RUNS, verbose: false, endOnFailure: true, ...config }
  );
}

/**
 * Helper to run an async property test with standard configuration
 */
export async function runAsyncProperty<T>(
  name: string,
  arb: fc.Arbitrary<T>,
  predicate: (value: T) => Promise<boolean | void>,
  config: Partial<fc.Parameters<[T]>> = {}
): Promise<void> {
  await fc.assert(
    fc.asyncProperty(arb, predicate),
    { numRuns: DEFAULT_NUM_RUNS, verbose: false, endOnFailure: true, ...config }
  );
}
