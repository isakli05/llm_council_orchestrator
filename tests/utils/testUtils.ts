// tests/utils/testUtils.ts

import { vi, Mock } from 'vitest';
import axios from 'axios';

/**
 * Mock axios instance creator
 */
export function createMockAxios(response: any, error?: Error) {
  const mockAxios = vi.mocked(axios.create);
  
  if (error) {
    mockAxios.mockReturnValue({
      get: vi.fn().mockRejectedValue(error),
      post: vi.fn().mockRejectedValue(error),
      put: vi.fn().mockRejectedValue(error),
      delete: vi.fn().mockRejectedValue(error),
    } as any);
  } else {
    mockAxios.mockReturnValue({
      get: vi.fn().mockResolvedValue({ data: response }),
      post: vi.fn().mockResolvedValue({ data: response }),
      put: vi.fn().mockResolvedValue({ data: response }),
      delete: vi.fn().mockResolvedValue({ data: response }),
    } as any);
  }
  
  return mockAxios;
}

/**
 * Wait for condition
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  
  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Generate random test data
 */
export const TestDataGenerator = {
  uuid: () => `${Math.random().toString(36).substring(2, 10)}-${Date.now()}`,
  
  filePath: () => `/src/module${Math.floor(Math.random() * 100)}/file${Math.floor(Math.random() * 10)}.ts`,
  
  codeChunk: (lines: number = 10) => {
    const chunks = [];
    for (let i = 0; i < lines; i++) {
      chunks.push(`// Line ${i + 1}\nconst var${i} = ${Math.random()};`);
    }
    return chunks.join('\n');
  },
  
  searchQuery: () => {
    const queries = [
      'authentication function',
      'database connection',
      'API endpoint handler',
      'user validation',
      'payment processing',
    ];
    return queries[Math.floor(Math.random() * queries.length)];
  },
  
  modelResponse: (content?: string) => ({
    id: `response-${Date.now()}`,
    content: content || 'This is a test model response',
    model: 'test-model',
    usage: {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    },
  }),
  
  pipelineContext: () => ({
    runId: TestDataGenerator.uuid(),
    mode: 'full_analysis',
    startTime: Date.now(),
    config: {
      models: {},
      timeout: 30000,
    },
  }),
};

/**
 * Mock Fastify request/reply
 */
export function mockFastifyRequest(overrides: Partial<any> = {}) {
  return {
    body: {},
    params: {},
    query: {},
    headers: {},
    ip: '127.0.0.1',
    id: 'test-request-id',
    log: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    },
    ...overrides,
  } as any;
}

export function mockFastifyReply() {
  const reply: any = {
    code: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
  };
  return reply;
}

/**
 * Spy creator with auto-restore
 */
export function createSpy<T extends (...args: any[]) => any>(
  fn: T
): Mock {
  return vi.fn(fn);
}
