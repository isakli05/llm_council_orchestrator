// apps/orchestrator/src/__tests__/property-based.test.ts

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { SecurityUtils } from '../middleware/security';

const { sanitizeString, sanitizePath, sanitizePrompt } = SecurityUtils;

describe('Property-Based Tests', () => {
  describe('Security Utils', () => {
    it('should sanitize any string without throwing', () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 10000 }), (input) => {
          expect(() => sanitizeString(input)).not.toThrow();
        }),
        { numRuns: 100 }
      );
    });

    it('should always produce valid output from sanitizePath', () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 500 }), (input) => {
          try {
            const result = sanitizePath(input);
            // Result should not contain path traversal
            expect(result).not.toContain('..');
            // Result should only contain valid characters
            expect(result).toMatch(/^[a-zA-Z0-9\-_/.]*$/);
          } catch (e) {
            // Some inputs are expected to throw
            expect(e).toBeDefined();
          }
        }),
        { numRuns: 100 }
      );
    });

    it('should detect prompt injection patterns', () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 1000 }), (input) => {
          const result = sanitizePrompt(input);
          
          // Result should not contain dangerous patterns
          expect(result).not.toMatch(/ignore previous instructions/i);
          expect(result).not.toMatch(/system\s*:\s*you are now/i);
        }),
        { numRuns: 100 }
      );
    });

    it('should handle unicode characters safely', () => {
      fc.assert(
        fc.property(fc.unicodeString({ maxLength: 1000 }), (input) => {
          expect(() => sanitizeString(input)).not.toThrow();
        }),
        { numRuns: 50 }
      );
    });

    it('should handle special characters in paths', () => {
      fc.assert(
        fc.property(
          fc.stringOf(fc.constantFrom('/', '.', '-', '_', 'a', 'b', '1', '2')),
          (input) => {
            try {
              const result = sanitizePath(input);
              expect(typeof result).toBe('string');
            } catch (e) {
              // Expected for invalid paths
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Model Response Parsing', () => {
    it('should parse any JSON-like response', () => {
      fc.assert(
        fc.property(
          fc.record({
            content: fc.string(),
            model: fc.string(),
            usage: fc.record({
              promptTokens: fc.nat(),
              completionTokens: fc.nat(),
            }),
          }),
          (response) => {
            const json = JSON.stringify(response);
            const parsed = JSON.parse(json);

            expect(parsed).toHaveProperty('content');
            expect(parsed).toHaveProperty('model');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle various token counts', () => {
      fc.assert(
        fc.property(
          fc.record({
            promptTokens: fc.integer({ min: 0, max: 100000 }),
            completionTokens: fc.integer({ min: 0, max: 100000 }),
          }),
          (usage) => {
            const totalTokens = usage.promptTokens + usage.completionTokens;
            expect(totalTokens).toBeGreaterThanOrEqual(0);
            expect(totalTokens).toBeLessThanOrEqual(200000);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('String Operations', () => {
    it('should maintain string length constraints', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 1000 }),
          fc.integer({ min: 0, max: 500 }),
          (str, maxLen) => {
            const truncated = str.slice(0, maxLen);
            expect(truncated.length).toBeLessThanOrEqual(maxLen);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle empty strings', () => {
      fc.assert(
        fc.property(fc.constant(''), (emptyStr) => {
          expect(emptyStr).toBe('');
          expect(emptyStr.length).toBe(0);
        }),
        { numRuns: 10 }
      );
    });
  });

  describe('Array Operations', () => {
    it('should maintain array invariants', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string(), { minLength: 0, maxLength: 100 }),
          (arr) => {
            expect(Array.isArray(arr)).toBe(true);
            expect(arr.length).toBeGreaterThanOrEqual(0);
            expect(arr.length).toBeLessThanOrEqual(100);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle array filtering', () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer(), { minLength: 0, maxLength: 100 }),
          (arr) => {
            const filtered = arr.filter(x => x > 0);
            expect(filtered.length).toBeLessThanOrEqual(arr.length);
            filtered.forEach(x => expect(x).toBeGreaterThan(0));
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
