import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IndexClient } from '../IndexClient';
import { IndexStatus } from '../types';
import axios from 'axios';

// Mock axios
vi.mock('axios');
const mockedAxios = axios as any;

describe('IndexClient - RAG contextForPath', () => {
  let client: IndexClient;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create axios instance mock
    const mockAxiosInstance = {
      post: vi.fn(),
      get: vi.fn(),
    };

    mockedAxios.create = vi.fn(() => mockAxiosInstance);

    client = new IndexClient({
      baseUrl: 'http://test:9001',
      apiKey: 'test-key',
    });

    // Set index status to READY
    (client as any).currentIndexStatus = IndexStatus.READY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should fetch context for a path successfully', async () => {
    const mockResponse = {
      data: {
        success: true,
        context: [
          {
            content: 'function login() { return true; }',
            filePath: '/src/auth/login.ts',
            startLine: 10,
            endLine: 15,
          },
          {
            content: 'export const validateUser = () => {}',
            filePath: '/src/auth/login.ts',
            startLine: 20,
            endLine: 25,
          },
        ],
        related: [
          { path: '/src/auth/register.ts', relevance: 0.92 },
          { path: '/src/auth/utils.ts', relevance: 0.85 },
        ],
      },
    };

    const mockAxiosInstance = mockedAxios.create();
    mockAxiosInstance.post.mockResolvedValue(mockResponse);

    const result = await client.contextForPath({
      path: '/src/auth/login.ts',
      includeRelated: true,
    });

    expect(result.success).toBe(true);
    expect(result.path).toBe('/src/auth/login.ts');
    expect(result.content).toContain('function login()');
    expect(result.content).toContain('validateUser');
    expect(result.relatedFiles).toHaveLength(2);
    expect(result.relatedFiles?.[0].path).toBe('/src/auth/register.ts');
    expect(result.relatedFiles?.[0].relevance).toBe(0.92);
  });

  it('should handle context without related files', async () => {
    const mockResponse = {
      data: {
        success: true,
        context: [
          {
            content: 'const config = {}',
            filePath: '/src/config.ts',
            startLine: 1,
            endLine: 5,
          },
        ],
        related: undefined,
      },
    };

    const mockAxiosInstance = mockedAxios.create();
    mockAxiosInstance.post.mockResolvedValue(mockResponse);

    const result = await client.contextForPath({
      path: '/src/config.ts',
      includeRelated: false,
    });

    expect(result.success).toBe(true);
    expect(result.relatedFiles).toBeUndefined();
  });

  it('should handle API errors gracefully', async () => {
    const mockAxiosInstance = mockedAxios.create();
    mockAxiosInstance.post.mockRejectedValue(new Error('Network error'));

    const result = await client.contextForPath({
      path: '/src/nonexistent.ts',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error?.code).toBe('CONTEXT_ERROR');
  });

  it('should throw error when index is not ready', async () => {
    (client as any).currentIndexStatus = "indexing" as any;

    const result = await client.contextForPath({
      path: '/src/test.ts',
    });

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('Index not ready');
  });

  it('should format content with file locations', async () => {
    const mockResponse = {
      data: {
        success: true,
        context: [
          {
            content: 'class User {}',
            filePath: '/src/models/User.ts',
            startLine: 5,
            endLine: 10,
          },
        ],
        related: [],
      },
    };

    const mockAxiosInstance = mockedAxios.create();
    mockAxiosInstance.post.mockResolvedValue(mockResponse);

    const result = await client.contextForPath({
      path: '/src/models/User.ts',
    });

    expect(result.content).toContain('// /src/models/User.ts:5-10');
    expect(result.content).toContain('class User {}');
  });

  it('should assign appropriate reasons based on relevance scores', async () => {
    const mockResponse = {
      data: {
        success: true,
        context: [{ content: 'test', filePath: '/test.ts' }],
        related: [
          { path: '/high.ts', relevance: 0.95 },
          { path: '/medium.ts', relevance: 0.85 },
          { path: '/low.ts', relevance: 0.75 },
        ],
      },
    };

    const mockAxiosInstance = mockedAxios.create();
    mockAxiosInstance.post.mockResolvedValue(mockResponse);

    const result = await client.contextForPath({
      path: '/test.ts',
      includeRelated: true,
    });

    expect(result.relatedFiles?.[0].reason).toBe('Highly similar functionality');
    expect(result.relatedFiles?.[1].reason).toBe('Similar functionality');
    expect(result.relatedFiles?.[2].reason).toBe('Related code');
  });
});
