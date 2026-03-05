import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { IndexerServer } from '../../server';
import * as path from 'path';
import * as fs from 'fs/promises';

describe('IndexController API Tests', () => {
  let server: IndexerServer;
  const testStoragePath = path.join(process.cwd(), '.test-indexer');

  beforeAll(async () => {
    // Create test storage directory
    await fs.mkdir(testStoragePath, { recursive: true });

    // Initialize server without API key for testing
    server = new IndexerServer({
      port: 9002, // Use different port for testing
      host: '127.0.0.1',
      storagePath: testStoragePath,
      apiKey: undefined, // Disable auth for tests
    });

    await server.start();
  });

  afterAll(async () => {
    await server.shutdown();
    
    // Clean up test storage
    try {
      await fs.rm(testStoragePath, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to clean up test storage:', error);
    }
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await server.getServer().inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('status', 'healthy');
      expect(body).toHaveProperty('version');
      expect(body).toHaveProperty('uptime');
      expect(body).toHaveProperty('timestamp');
    });
  });

  describe('GET /health/ready', () => {
    it('should return readiness status', async () => {
      const response = await server.getServer().inject({
        method: 'GET',
        url: '/health/ready',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('status');
      expect(body).toHaveProperty('checks');
      expect(body).toHaveProperty('timestamp');
    });
  });

  describe('POST /api/v1/index/ensure', () => {
    it('should validate request body', async () => {
      const response = await server.getServer().inject({
        method: 'POST',
        url: '/api/v1/index/ensure',
        payload: {
          // Missing project_root
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should reject path traversal attempts', async () => {
      const response = await server.getServer().inject({
        method: 'POST',
        url: '/api/v1/index/ensure',
        payload: {
          project_root: '../../../etc/passwd',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should accept valid project path', async () => {
      const response = await server.getServer().inject({
        method: 'POST',
        url: '/api/v1/index/ensure',
        payload: {
          project_root: process.cwd(),
          force_rebuild: false,
        },
      });

      // May succeed or fail depending on environment, but should not be validation error
      const body = JSON.parse(response.body);
      if (!body.success) {
        expect(body.error?.code).not.toBe('VALIDATION_ERROR');
      }
    });
  });

  describe('POST /api/v1/search', () => {
    it('should validate request body', async () => {
      const response = await server.getServer().inject({
        method: 'POST',
        url: '/api/v1/search',
        payload: {
          // Missing query
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should reject SQL injection attempts', async () => {
      const response = await server.getServer().inject({
        method: 'POST',
        url: '/api/v1/search',
        payload: {
          query: "'; DROP TABLE users; --",
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should accept valid search query', async () => {
      const response = await server.getServer().inject({
        method: 'POST',
        url: '/api/v1/search',
        payload: {
          query: 'test function',
          limit: 5,
        },
      });

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('success');
      expect(body).toHaveProperty('results');
      expect(body).toHaveProperty('totalResults');
    });
  });

  describe('POST /api/v1/context', () => {
    it('should validate request body', async () => {
      const response = await server.getServer().inject({
        method: 'POST',
        url: '/api/v1/context',
        payload: {
          // Missing path
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should reject path traversal attempts', async () => {
      const response = await server.getServer().inject({
        method: 'POST',
        url: '/api/v1/context',
        payload: {
          path: '../../../etc/passwd',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should accept valid path', async () => {
      const response = await server.getServer().inject({
        method: 'POST',
        url: '/api/v1/context',
        payload: {
          path: 'src/main.ts',
          options: {
            maxChunks: 5,
            includeRelated: true,
          },
        },
      });

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('success');
      expect(body).toHaveProperty('path');
      expect(body).toHaveProperty('context');
    });
  });

  describe('API Key Authentication', () => {
    let authServer: IndexerServer;
    const authTestPort = 9003;

    beforeAll(async () => {
      authServer = new IndexerServer({
        port: authTestPort,
        host: '127.0.0.1',
        storagePath: path.join(testStoragePath, 'auth-test'),
        apiKey: 'test-api-key-123',
      });
      await authServer.start();
    });

    afterAll(async () => {
      await authServer.shutdown();
    });

    it('should reject requests without API key', async () => {
      const response = await authServer.getServer().inject({
        method: 'POST',
        url: '/api/v1/search',
        payload: {
          query: 'test',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error?.code).toBe('AUTHENTICATION_ERROR');
    });

    it('should reject requests with invalid API key', async () => {
      const response = await authServer.getServer().inject({
        method: 'POST',
        url: '/api/v1/search',
        headers: {
          'x-api-key': 'wrong-key',
        },
        payload: {
          query: 'test',
        },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error?.code).toBe('AUTHENTICATION_ERROR');
    });

    it('should accept requests with valid API key', async () => {
      const response = await authServer.getServer().inject({
        method: 'POST',
        url: '/api/v1/search',
        headers: {
          'x-api-key': 'test-api-key-123',
        },
        payload: {
          query: 'test',
        },
      });

      expect(response.statusCode).not.toBe(401);
      expect(response.statusCode).not.toBe(403);
    });

    it('should allow health check without API key', async () => {
      const response = await authServer.getServer().inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
    });
  });
});
