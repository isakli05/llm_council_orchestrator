/**
 * Smoke tests to verify test infrastructure is working correctly.
 * 
 * These tests validate that Vitest and fast-check are properly configured.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { 
  DEFAULT_NUM_RUNS, 
  fcConfig, 
  providerTypeArb, 
  domainIdArb,
  safeFilePathArb,
  runProperty 
} from './test-utils';

describe('Test Infrastructure', () => {
  describe('Vitest Setup', () => {
    it('should run basic assertions', () => {
      expect(1 + 1).toBe(2);
    });

    it('should support async tests', async () => {
      const result = await Promise.resolve(42);
      expect(result).toBe(42);
    });
  });

  describe('Fast-check Setup', () => {
    it('should run property-based tests', () => {
      fc.assert(
        fc.property(fc.integer(), (n) => {
          return n + 0 === n;
        }),
        { numRuns: 100 }
      );
    });

    it('should use default configuration', () => {
      expect(DEFAULT_NUM_RUNS).toBe(100);
      expect(fcConfig.numRuns).toBe(100);
    });
  });

  describe('Custom Generators', () => {
    it('should generate valid provider types', () => {
      fc.assert(
        fc.property(providerTypeArb, (provider) => {
          const validProviders = [
            'openai', 'anthropic', 'zai', 'gemini',
            'openai-openrouter', 'anthropic-openrouter', 
            'zai-openrouter', 'gemini-openrouter'
          ];
          return validProviders.includes(provider);
        }),
        fcConfig
      );
    });

    it('should generate valid domain IDs matching pattern', () => {
      fc.assert(
        fc.property(domainIdArb, (domainId) => {
          const pattern = /^[a-z0-9_]+_domain$/;
          return pattern.test(domainId);
        }),
        fcConfig
      );
    });

    it('should generate safe file paths without traversal', () => {
      fc.assert(
        fc.property(safeFilePathArb, (path) => {
          return !path.includes('..') && !path.startsWith('/');
        }),
        fcConfig
      );
    });
  });

  describe('runProperty Helper', () => {
    it('should execute property tests with standard config', () => {
      runProperty(
        'addition is commutative',
        fc.tuple(fc.integer(), fc.integer()),
        ([a, b]) => {
          expect(a + b).toBe(b + a);
        }
      );
    });
  });
});
