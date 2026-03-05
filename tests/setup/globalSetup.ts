// tests/setup/globalSetup.ts

import { beforeAll, afterAll, afterEach, vi, expect } from 'vitest';

// Mock environment variables for tests
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.INDEXER_API_KEY = 'test-api-key';
process.env.OPENAI_API_KEY = 'sk-test-openai';
process.env.ANTHROPIC_API_KEY = 'sk-test-anthropic';
process.env.GEMINI_API_KEY = 'test-gemini-key';

// Global timeout
vi.setConfig({
  testTimeout: 30000,
  hookTimeout: 30000,
});

// Console suppression for cleaner test output
const originalConsole = { ...console };
beforeAll(() => {
  console.log = vi.fn();
  console.info = vi.fn();
  console.warn = vi.fn();
  // Keep console.error for debugging
});

afterAll(() => {
  Object.assign(console, originalConsole);
});

// Cleanup after each test
afterEach(() => {
  vi.clearAllMocks();
});

// Custom matchers
expect.extend({
  toBeValidUuid(received: string) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const pass = uuidRegex.test(received);
    return {
      pass,
      message: () => `expected ${received} ${pass ? 'not to be' : 'to be'} a valid UUID`,
    };
  },
  toBeValidTimestamp(received: number) {
    const pass = !isNaN(received) && received > 0 && received <= Date.now() + 86400000;
    return {
      pass,
      message: () => `expected ${received} ${pass ? 'not to be' : 'to be'} a valid timestamp`,
    };
  },
});

// Export for type declarations
declare global {
  namespace Vi {
    interface Assertion {
      toBeValidUuid(): void;
      toBeValidTimestamp(): void;
    }
  }
}
