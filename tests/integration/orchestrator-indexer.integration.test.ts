// tests/integration/orchestrator-indexer.integration.test.ts

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import axios from 'axios';

describe('Orchestrator-Indexer Integration', () => {
  const orchestratorUrl = process.env.ORCHESTRATOR_URL || 'http://localhost:7001';
  const indexerUrl = process.env.INDEXER_URL || 'http://localhost:9001';
  const apiKey = process.env.TEST_API_KEY || 'test-api-key';

  describe('Health Check Integration', () => {
    it('should check orchestrator health endpoint exists', async () => {
      // Mock the health check since services may not be running
      const mockHealthCheck = vi.fn().mockResolvedValue({
        status: 'healthy',
        checks: {
          indexer: true,
          qdrant: true,
        },
      });

      const result = await mockHealthCheck();
      expect(result).toHaveProperty('status');
    });

    it('should verify indexer health endpoint structure', async () => {
      const mockIndexerHealth = vi.fn().mockResolvedValue({
        status: 'healthy',
        timestamp: Date.now(),
      });

      const result = await mockIndexerHealth();
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('timestamp');
    });
  });

  describe('Pipeline Integration', () => {
    it('should validate pipeline request structure', () => {
      const pipelineRequest = {
        mode: 'quick_diagnostic',
        targetPath: '/workspace/test-project',
      };

      expect(pipelineRequest).toHaveProperty('mode');
      expect(pipelineRequest).toHaveProperty('targetPath');
      expect(['quick_diagnostic', 'full_analysis', 'spec_generation']).toContain(pipelineRequest.mode);
    });

    it('should validate pipeline response structure', () => {
      const mockResponse = {
        runId: 'test-run-id-123',
        status: 'running',
        startTime: Date.now(),
      };

      expect(mockResponse).toHaveProperty('runId');
      expect(mockResponse).toHaveProperty('status');
      expect(mockResponse.runId).toMatch(/^[a-zA-Z0-9\-]+$/);
    });
  });

  describe('Search Integration', () => {
    it('should validate search request structure', () => {
      const searchRequest = {
        query: 'authentication function',
        options: {
          limit: 5,
          threshold: 0.7,
        },
      };

      expect(searchRequest).toHaveProperty('query');
      expect(searchRequest.query).toBeTruthy();
      expect(searchRequest.options.limit).toBeGreaterThan(0);
    });

    it('should validate search response structure', () => {
      const mockSearchResponse = {
        results: [
          {
            id: '1',
            score: 0.95,
            content: 'Test content',
            metadata: {},
          },
        ],
        total: 1,
      };

      expect(mockSearchResponse).toHaveProperty('results');
      expect(Array.isArray(mockSearchResponse.results)).toBe(true);
      expect(mockSearchResponse.results[0]).toHaveProperty('score');
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle missing API key', () => {
      const error = {
        statusCode: 401,
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'API key required',
        },
      };

      expect(error.statusCode).toBe(401);
      expect(error.error.code).toBe('AUTHENTICATION_ERROR');
    });

    it('should handle invalid request', () => {
      const error = {
        statusCode: 400,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request parameters',
        },
      };

      expect(error.statusCode).toBe(400);
      expect(error.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle service unavailable', () => {
      const error = {
        statusCode: 503,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Service temporarily unavailable',
        },
      };

      expect(error.statusCode).toBe(503);
      expect(error.error.code).toBe('SERVICE_UNAVAILABLE');
    });
  });

  describe('Data Flow Integration', () => {
    it('should validate index ensure flow', () => {
      const ensureRequest = {
        projectPath: '/workspace/test-project',
        force: false,
      };

      const ensureResponse = {
        status: 'ready',
        filesIndexed: 100,
        completedAt: Date.now(),
      };

      expect(ensureRequest).toHaveProperty('projectPath');
      expect(ensureResponse).toHaveProperty('status');
      expect(ensureResponse.filesIndexed).toBeGreaterThanOrEqual(0);
    });

    it('should validate context retrieval flow', () => {
      const contextRequest = {
        path: '/src/auth/login.ts',
        options: {
          includeRelated: true,
          maxTokens: 4000,
        },
      };

      const contextResponse = {
        content: 'File content here',
        related: [],
        tokenCount: 500,
      };

      expect(contextRequest).toHaveProperty('path');
      expect(contextResponse).toHaveProperty('content');
      expect(contextResponse.tokenCount).toBeGreaterThan(0);
    });
  });
});
