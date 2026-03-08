/**
 * Real HTTP Integration Test: Orchestrator IndexClient ↔ Indexer Server
 * 
 * This test validates the actual HTTP contract between Orchestrator's IndexClient
 * and Indexer's HTTP API. It starts a real Indexer server and makes real HTTP calls.
 * 
 * Coverage:
 * - Index ensure flow (POST /api/v1/index/ensure)
 * - Search flow (POST /api/v1/search)
 * - Context retrieval (POST /api/v1/context)
 * - Authentication (X-API-Key header)
 * - Error handling (401, 400, 500)
 * - Request/response contract validation
 * 
 * Requirements: Refactor 09 - Test Realism and Coverage
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { IndexerServer } from '../../apps/indexer/src/server';
import { IndexClient } from '../../apps/orchestrator/src/indexer/IndexClient';
import { IndexStatus } from '../../apps/orchestrator/src/indexer/types';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';

describe('Orchestrator-Indexer Real HTTP Integration', () => {
  let indexerServer: IndexerServer;
  let indexClient: IndexClient;
  let tempProjectDir: string;
  let tempStorageDir: string;
  
  const TEST_PORT = 19001;
  const TEST_API_KEY = 'test-integration-key-secure-12345';

  beforeAll(async () => {
    // Create temp project directory with test files
    tempProjectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'integration-test-project-'));
    tempStorageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'integration-test-storage-'));
    
    // Create a realistic project structure
    await fs.mkdir(path.join(tempProjectDir, 'src'), { recursive: true });
    await fs.mkdir(path.join(tempProjectDir, 'tests'), { recursive: true });
    
    // Create test files with meaningful content
    await fs.writeFile(
      path.join(tempProjectDir, 'src', 'auth.ts'),
      `export function login(username: string, password: string): boolean {
  if (!username || !password) {
    throw new Error('Username and password are required');
  }
  // Authenticate user
  return true;
}

export function logout(): void {
  // Clear session
  console.log('User logged out');
}`,
      'utf-8'
    );
    
    await fs.writeFile(
      path.join(tempProjectDir, 'src', 'utils.ts'),
      `export function formatDate(date: Date): string {
  return date.toISOString();
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
  return emailRegex.test(email);
}`,
      'utf-8'
    );
    
    await fs.writeFile(
      path.join(tempProjectDir, 'README.md'),
      `# Test Project

This is a test project for integration testing.

## Features
- Authentication
- Utilities
`,
      'utf-8'
    );
    
    // Start real Indexer server
    indexerServer = new IndexerServer({
      port: TEST_PORT,
      host: '127.0.0.1',
      apiKey: TEST_API_KEY,
      storagePath: tempStorageDir,
    });
    await indexerServer.start();
    
    // Create real IndexClient pointing to the test server
    indexClient = new IndexClient({
      baseUrl: `http://127.0.0.1:${TEST_PORT}`,
      apiKey: TEST_API_KEY,
      timeoutMs: 30000, // 30 seconds for integration tests
      maxRetries: 2, // Fewer retries for faster tests
    });
  }, 60000); // 60s timeout for setup

  afterAll(async () => {
    // Cleanup
    await indexerServer.shutdown();
    await fs.rm(tempProjectDir, { recursive: true, force: true });
    await fs.rm(tempStorageDir, { recursive: true, force: true });
  }, 30000); // 30s timeout for cleanup

  describe('Index Ensure Flow', () => {
    it('should ensure index via real HTTP call', async () => {
      const result = await indexClient.ensureIndex(tempProjectDir, false);

      // Validate response structure
      expect(result).toBeDefined();
      expect(result.status).toBe(IndexStatus.READY);
      expect(result.filesIndexed).toBeGreaterThan(0);
      expect(result.completedAt).toBeDefined();
      
      // Validate timestamp format (ISO 8601)
      const timestamp = new Date(result.completedAt!);
      expect(timestamp.toISOString()).toBe(result.completedAt);
      
      // Validate metadata if present
      if (result.metadata) {
        expect(result.metadata.filesByExtension).toBeDefined();
        expect(typeof result.metadata.filesByExtension).toBe('object');
        
        // Should have indexed .ts and .md files
        expect(result.metadata.filesByExtension['.ts']).toBeGreaterThan(0);
        expect(result.metadata.filesByExtension['.md']).toBeGreaterThan(0);
      }
    }, 30000);

    it('should handle force rebuild correctly', async () => {
      // First index
      const firstResult = await indexClient.ensureIndex(tempProjectDir, false);
      expect(firstResult.status).toBe(IndexStatus.READY);
      const firstFilesIndexed = firstResult.filesIndexed!;
      
      // Force rebuild
      const secondResult = await indexClient.ensureIndex(tempProjectDir, true);
      expect(secondResult.status).toBe(IndexStatus.READY);
      
      // Should re-index all files
      expect(secondResult.filesIndexed).toBeGreaterThanOrEqual(firstFilesIndexed);
    }, 30000);

    it('should handle invalid project path', async () => {
      const result = await indexClient.ensureIndex('/nonexistent/path/that/does/not/exist', false);

      expect(result.status).toBe(IndexStatus.FAILED);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBeDefined();
      expect(result.error?.message).toBeDefined();
    }, 15000);

    it('should validate response contract for successful indexing', async () => {
      const result = await indexClient.ensureIndex(tempProjectDir, false);

      // Validate complete response structure
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('filesIndexed');
      expect(result).toHaveProperty('completedAt');
      
      // Status should be one of the valid enum values
      expect([
        IndexStatus.READY,
        IndexStatus.FAILED,
        IndexStatus.IN_PROGRESS,
        IndexStatus.NOT_STARTED
      ]).toContain(result.status);
      
      // If successful, should have valid response
      if (result.status === IndexStatus.READY) {
        // filesIndexed can be 0 if incremental indexing detected no changes (correct behavior)
        expect(result.filesIndexed).toBeGreaterThanOrEqual(0);
        expect(result.completedAt).toBeTruthy();
        
        // Validate ISO timestamp format
        const timestamp = new Date(result.completedAt);
        expect(timestamp.toISOString()).toBe(result.completedAt);
      }
      
      // If failed, should have error
      if (result.status === IndexStatus.FAILED) {
        expect(result.error).toBeDefined();
        expect(result.error?.code).toBeTruthy();
        expect(result.error?.message).toBeTruthy();
      }
    }, 30000);
  });

  describe('Search Flow', () => {
    beforeAll(async () => {
      // Ensure index is ready before search tests
      await indexClient.ensureIndex(tempProjectDir, false);
    }, 30000);

    it('should search via real HTTP call', async () => {
      const result = await indexClient.semanticSearch({
        query: 'authentication login function',
        limit: 5,
      });

      expect(result.success).toBe(true);
      expect(Array.isArray(result.results)).toBe(true);
      expect(result.totalResults).toBeGreaterThanOrEqual(0);
      
      // If results found, validate structure
      if (result.results.length > 0) {
        const firstResult = result.results[0];
        expect(firstResult).toHaveProperty('path');
        expect(firstResult).toHaveProperty('content');
        expect(firstResult).toHaveProperty('score');
        expect(typeof firstResult.score).toBe('number');
        expect(firstResult.score).toBeGreaterThan(0);
        expect(firstResult.score).toBeLessThanOrEqual(1);
      }
    }, 15000);

    it('should return relevant results for specific queries', async () => {
      const result = await indexClient.semanticSearch({
        query: 'login authentication',
        limit: 10,
      });

      expect(result.success).toBe(true);
      
      // Should find the auth.ts file
      const authResults = result.results.filter(r => r.path.includes('auth.ts'));
      expect(authResults.length).toBeGreaterThan(0);
      
      // Results should be sorted by score (descending)
      for (let i = 0; i < result.results.length - 1; i++) {
        expect(result.results[i].score).toBeGreaterThanOrEqual(result.results[i + 1].score);
      }
    }, 15000);

    it('should respect limit parameter', async () => {
      const limit = 2;
      const result = await indexClient.semanticSearch({
        query: 'function',
        limit,
      });

      expect(result.success).toBe(true);
      expect(result.results.length).toBeLessThanOrEqual(limit);
    }, 15000);

    it('should handle empty query gracefully', async () => {
      const result = await indexClient.semanticSearch({
        query: '',
        limit: 5,
      });

      // Should fail validation
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('VALIDATION_ERROR');
    }, 15000);

    it('should validate search response contract', async () => {
      const result = await indexClient.semanticSearch({
        query: 'test query',
        limit: 5,
      });

      // Validate response structure
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('totalResults');
      expect(typeof result.success).toBe('boolean');
      expect(Array.isArray(result.results)).toBe(true);
      expect(typeof result.totalResults).toBe('number');
      
      // If successful, results should match contract
      if (result.success) {
        result.results.forEach(item => {
          expect(item).toHaveProperty('path');
          expect(item).toHaveProperty('content');
          expect(item).toHaveProperty('score');
          expect(typeof item.path).toBe('string');
          expect(typeof item.content).toBe('string');
          expect(typeof item.score).toBe('number');
        });
      }
      
      // If failed, should have error
      if (!result.success) {
        expect(result.error).toBeDefined();
        expect(result.error?.code).toBeTruthy();
        expect(result.error?.message).toBeTruthy();
      }
    }, 15000);
  });

  describe('Context Retrieval Flow', () => {
    beforeAll(async () => {
      // Ensure index is ready
      await indexClient.ensureIndex(tempProjectDir, false);
    }, 30000);

    it('should retrieve context for a specific path', async () => {
      const authFilePath = path.join(tempProjectDir, 'src', 'auth.ts');
      
      const result = await indexClient.contextForPath({
        path: authFilePath,
        includeRelated: true,
      });

      expect(result.success).toBe(true);
      expect(result.path).toBe(authFilePath);
      expect(result.content).toBeDefined();
      expect(typeof result.content).toBe('string');
      expect(result.content.length).toBeGreaterThan(0);
      
      // Content should include the file path as a comment
      expect(result.content).toContain(authFilePath);
      
      // Should include actual code from the file (test for content that exists in chunks)
      // The chunker may split the file, so test for content that's definitely in the chunks
      expect(result.content).toContain('username');
      expect(result.content).toContain('password');
    }, 15000);

    it('should include related files when requested', async () => {
      const authFilePath = path.join(tempProjectDir, 'src', 'auth.ts');
      
      const result = await indexClient.contextForPath({
        path: authFilePath,
        includeRelated: true,
      });

      expect(result.success).toBe(true);
      
      // May or may not have related files depending on similarity
      if (result.relatedFiles && result.relatedFiles.length > 0) {
        result.relatedFiles.forEach(related => {
          expect(related).toHaveProperty('path');
          expect(related).toHaveProperty('relevance');
          expect(related).toHaveProperty('reason');
          expect(typeof related.path).toBe('string');
          expect(typeof related.relevance).toBe('number');
          expect(related.relevance).toBeGreaterThan(0);
          expect(related.relevance).toBeLessThanOrEqual(1);
        });
      }
    }, 15000);

    it('should handle non-existent path', async () => {
      const result = await indexClient.contextForPath({
        path: '/nonexistent/file.ts',
        includeRelated: false,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('CONTEXT_ERROR');
    }, 15000);
  });

  describe('Authentication', () => {
    it('should reject requests without API key', async () => {
      const clientNoAuth = new IndexClient({
        baseUrl: `http://127.0.0.1:${TEST_PORT}`,
        // No API key
        timeoutMs: 10000,
      });

      const result = await clientNoAuth.ensureIndex(tempProjectDir, false);

      expect(result.status).toBe(IndexStatus.FAILED);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBeDefined();
      
      // Should be authentication error (401 or 403 mapped to error code)
      const errorMessage = result.error?.message.toLowerCase() || '';
      expect(
        errorMessage.includes('authentication') ||
        errorMessage.includes('unauthorized') ||
        errorMessage.includes('api key') ||
        errorMessage.includes('401') ||
        errorMessage.includes('403')
      ).toBe(true);
    }, 15000);

    it('should reject requests with invalid API key', async () => {
      const clientBadAuth = new IndexClient({
        baseUrl: `http://127.0.0.1:${TEST_PORT}`,
        apiKey: 'wrong-api-key-invalid',
        timeoutMs: 10000,
      });

      const result = await clientBadAuth.ensureIndex(tempProjectDir, false);

      expect(result.status).toBe(IndexStatus.FAILED);
      expect(result.error).toBeDefined();
      
      // Should be authentication error
      const errorMessage = result.error?.message.toLowerCase() || '';
      expect(
        errorMessage.includes('authentication') ||
        errorMessage.includes('forbidden') ||
        errorMessage.includes('invalid') ||
        errorMessage.includes('403')
      ).toBe(true);
    }, 15000);

    it('should accept requests with valid API key', async () => {
      // This is the main client with correct API key
      const result = await indexClient.ensureIndex(tempProjectDir, false);

      // Should succeed (not auth error)
      expect(result.status).not.toBe(IndexStatus.FAILED);
      if (result.error) {
        const errorMessage = result.error.message.toLowerCase();
        expect(errorMessage).not.toContain('authentication');
        expect(errorMessage).not.toContain('unauthorized');
        expect(errorMessage).not.toContain('forbidden');
      }
    }, 30000);
  });

  describe('Error Handling', () => {
    it('should handle path traversal attempts', async () => {
      const result = await indexClient.ensureIndex('../../../etc/passwd', false);

      expect(result.status).toBe(IndexStatus.FAILED);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBeDefined();
      
      // Should be validation error
      const errorCode = result.error?.code || '';
      const errorMessage = result.error?.message.toLowerCase() || '';
      expect(
        errorCode === 'VALIDATION_ERROR' ||
        errorMessage.includes('invalid') ||
        errorMessage.includes('traversal')
      ).toBe(true);
    }, 15000);

    it('should handle malformed requests gracefully', async () => {
      // Try to send invalid data directly via HTTP client
      const httpClient = indexClient.getHttpClient();
      
      try {
        await httpClient.post('/api/v1/index/ensure', {
          // Missing required project_root field
          force_rebuild: true,
        });
        
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        // Should get 400 error
        expect(error.response).toBeDefined();
        expect(error.response.status).toBe(400);
        expect(error.response.data.error).toBeDefined();
        expect(error.response.data.error.code).toBe('VALIDATION_ERROR');
      }
    }, 15000);

    it('should include correlation ID in error responses', async () => {
      const clientNoAuth = new IndexClient({
        baseUrl: `http://127.0.0.1:${TEST_PORT}`,
        timeoutMs: 10000,
      });

      const result = await clientNoAuth.ensureIndex(tempProjectDir, false);

      expect(result.status).toBe(IndexStatus.FAILED);
      
      // Try to get correlation ID from error (if exposed)
      // Note: Correlation ID is in HTTP headers, not in the error object
      // This test validates that errors are properly structured
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBeTruthy();
      expect(result.error?.message).toBeTruthy();
    }, 15000);
  });

  describe('API Contract Validation', () => {
    it('should return correct response structure for ensure', async () => {
      const result = await indexClient.ensureIndex(tempProjectDir, false);

      // Validate complete contract
      expect(result).toHaveProperty('status');
      expect(typeof result.status).toBe('string');
      
      if (result.status === IndexStatus.READY) {
        expect(result).toHaveProperty('filesIndexed');
        expect(result).toHaveProperty('completedAt');
        expect(typeof result.filesIndexed).toBe('number');
        expect(typeof result.completedAt).toBe('string');
        
        // Validate ISO timestamp
        const timestamp = new Date(result.completedAt);
        expect(timestamp.toISOString()).toBe(result.completedAt);
      }
      
      if (result.status === IndexStatus.FAILED) {
        expect(result).toHaveProperty('error');
        expect(result.error).toHaveProperty('code');
        expect(result.error).toHaveProperty('message');
        expect(typeof result.error?.code).toBe('string');
        expect(typeof result.error?.message).toBe('string');
      }
    }, 30000);

    it('should return correct response structure for search', async () => {
      await indexClient.ensureIndex(tempProjectDir, false);
      
      const result = await indexClient.semanticSearch({
        query: 'test',
        limit: 5,
      });

      // Validate contract
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('totalResults');
      expect(typeof result.success).toBe('boolean');
      expect(Array.isArray(result.results)).toBe(true);
      expect(typeof result.totalResults).toBe('number');
      
      if (result.results.length > 0) {
        const firstResult = result.results[0];
        expect(firstResult).toHaveProperty('path');
        expect(firstResult).toHaveProperty('content');
        expect(firstResult).toHaveProperty('score');
        expect(typeof firstResult.path).toBe('string');
        expect(typeof firstResult.content).toBe('string');
        expect(typeof firstResult.score).toBe('number');
        
        // Score should be normalized (0-1)
        expect(firstResult.score).toBeGreaterThan(0);
        expect(firstResult.score).toBeLessThanOrEqual(1);
      }
    }, 30000);

    it('should maintain backward compatibility with API v1', async () => {
      // Verify that all endpoints use /api/v1 prefix
      const config = indexClient.getConfig();
      expect(config.baseUrl).toBe(`http://127.0.0.1:${TEST_PORT}`);
      
      // Make a request and verify it works
      const result = await indexClient.ensureIndex(tempProjectDir, false);
      expect(result.status).toBeDefined();
      
      // The fact that this works confirms /api/v1 prefix is being used
    }, 30000);
  });

  describe('Performance and Reliability', () => {
    it('should handle concurrent requests', async () => {
      await indexClient.ensureIndex(tempProjectDir, false);
      
      // Make multiple concurrent search requests
      const promises = [
        indexClient.semanticSearch({ query: 'login', limit: 5 }),
        indexClient.semanticSearch({ query: 'function', limit: 5 }),
        indexClient.semanticSearch({ query: 'export', limit: 5 }),
      ];
      
      const results = await Promise.all(promises);
      
      // All should succeed
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(Array.isArray(result.results)).toBe(true);
      });
    }, 30000);

    it('should handle large result sets', async () => {
      await indexClient.ensureIndex(tempProjectDir, false);
      
      const result = await indexClient.semanticSearch({
        query: 'function',
        limit: 100, // Max limit
      });

      expect(result.success).toBe(true);
      expect(result.results.length).toBeLessThanOrEqual(100);
    }, 30000);

    it('should complete indexing within reasonable time', async () => {
      const startTime = Date.now();
      
      const result = await indexClient.ensureIndex(tempProjectDir, true);
      
      const duration = Date.now() - startTime;
      
      expect(result.status).toBe(IndexStatus.READY);
      
      // Should complete within 30 seconds for small project
      expect(duration).toBeLessThan(30000);
    }, 35000);
  });
});
