import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContextBuilder } from '../ContextBuilder';
import { IndexClient } from '../IndexClient';
import { ContextResponse } from '../types';

describe('ContextBuilder', () => {
  let builder: ContextBuilder;
  let mockClient: IndexClient;

  beforeEach(() => {
    // Create mock IndexClient
    mockClient = {
      contextForPath: vi.fn(),
    } as any;

    builder = new ContextBuilder(mockClient);
  });

  describe('buildForRole', () => {
    it('should build context for legacy_analysis role', async () => {
      const mockResponse: ContextResponse = {
        success: true,
        path: '/src/auth/login.ts',
        content: 'function login() { return true; }',
        relatedFiles: [
          { path: '/src/auth/register.ts', relevance: 0.9, reason: 'Similar' },
        ],
      };

      (mockClient.contextForPath as any).mockResolvedValue(mockResponse);

      const result = await builder.buildForRole(
        'legacy_analysis',
        '/src/auth/login.ts'
      );

      expect(result.text).toContain('Primary Context');
      expect(result.text).toContain('function login()');
      expect(result.text).toContain('Related Files');
      expect(result.tokenCount).toBeGreaterThan(0);
      expect(result.sources).toContain('/src/auth/login.ts');
      expect(result.sources).toContain('/src/auth/register.ts');
    });

    it('should apply role-specific token limits', async () => {
      const mockResponse: ContextResponse = {
        success: true,
        path: '/test.ts',
        content: 'x'.repeat(50000), // Very long content
      };

      (mockClient.contextForPath as any).mockResolvedValue(mockResponse);

      // Security role has 4000 token limit
      const result = await builder.buildForRole('security', '/test.ts');

      // Should be truncated
      expect(result.tokenCount).toBeLessThanOrEqual(4000);
      expect(result.text).toContain('[... truncated due to token limit]');
    });

    it('should handle empty context gracefully', async () => {
      const mockResponse: ContextResponse = {
        success: false,
        path: '/nonexistent.ts',
        error: { code: 'NOT_FOUND', message: 'File not found' },
      };

      (mockClient.contextForPath as any).mockResolvedValue(mockResponse);

      const result = await builder.buildForRole('architect', '/nonexistent.ts');

      expect(result.text).toBe('');
      expect(result.tokenCount).toBe(0);
      expect(result.sources).toHaveLength(0);
    });

    it('should respect includeRelated option', async () => {
      const mockResponse: ContextResponse = {
        success: true,
        path: '/test.ts',
        content: 'test content',
      };

      (mockClient.contextForPath as any).mockResolvedValue(mockResponse);

      await builder.buildForRole('security', '/test.ts', {
        includeRelated: false,
      });

      expect(mockClient.contextForPath).toHaveBeenCalledWith(
        expect.objectContaining({
          includeRelated: false,
        })
      );
    });

    it('should use different strategies for different roles', async () => {
      const mockResponse: ContextResponse = {
        success: true,
        path: '/test.ts',
        content: 'test',
      };

      (mockClient.contextForPath as any).mockResolvedValue(mockResponse);

      // Test different roles
      await builder.buildForRole('legacy_analysis', '/test.ts');
      expect(mockClient.contextForPath).toHaveBeenCalledWith(
        expect.objectContaining({ maxRelated: 10 })
      );

      await builder.buildForRole('security', '/test.ts');
      expect(mockClient.contextForPath).toHaveBeenCalledWith(
        expect.objectContaining({ maxRelated: 5 })
      );

      await builder.buildForRole('aggregator', '/test.ts');
      expect(mockClient.contextForPath).toHaveBeenCalledWith(
        expect.objectContaining({ maxRelated: 15 })
      );
    });
  });

  describe('buildForFiles', () => {
    it('should build context for multiple files', async () => {
      const mockResponses: ContextResponse[] = [
        {
          success: true,
          path: '/src/file1.ts',
          content: 'content 1',
        },
        {
          success: true,
          path: '/src/file2.ts',
          content: 'content 2',
        },
      ];

      (mockClient.contextForPath as any)
        .mockResolvedValueOnce(mockResponses[0])
        .mockResolvedValueOnce(mockResponses[1]);

      const result = await builder.buildForFiles([
        '/src/file1.ts',
        '/src/file2.ts',
      ]);

      expect(result.sources).toHaveLength(2);
      expect(result.text).toContain('file1.ts');
      expect(result.text).toContain('file2.ts');
      expect(result.text).toContain('content 1');
      expect(result.text).toContain('content 2');
    });

    it('should handle partial failures in multi-file context', async () => {
      (mockClient.contextForPath as any)
        .mockResolvedValueOnce({
          success: true,
          path: '/src/file1.ts',
          content: 'content 1',
        })
        .mockResolvedValueOnce({
          success: false,
          path: '/src/file2.ts',
          error: { code: 'ERROR', message: 'Failed' },
        });

      const result = await builder.buildForFiles([
        '/src/file1.ts',
        '/src/file2.ts',
      ]);

      // Should include successful file
      expect(result.sources).toHaveLength(1);
      expect(result.sources).toContain('/src/file1.ts');
      expect(result.text).toContain('content 1');
    });

    it('should distribute token budget across files', async () => {
      const mockResponse: ContextResponse = {
        success: true,
        path: '/test.ts',
        content: 'test',
      };

      (mockClient.contextForPath as any).mockResolvedValue(mockResponse);

      await builder.buildForFiles(['/file1.ts', '/file2.ts'], {
        maxTokens: 8000,
      });

      // Each file should get roughly half the budget
      expect(mockClient.contextForPath).toHaveBeenCalledTimes(2);
    });
  });

  describe('token estimation', () => {
    it('should estimate tokens correctly', async () => {
      const mockResponse: ContextResponse = {
        success: true,
        path: '/test.ts',
        content: 'a'.repeat(400), // 400 chars = ~100 tokens
      };

      (mockClient.contextForPath as any).mockResolvedValue(mockResponse);

      const result = await builder.buildForRole('architect', '/test.ts');

      // Should be approximately 100 tokens (400 chars / 4)
      expect(result.tokenCount).toBeGreaterThan(90);
      expect(result.tokenCount).toBeLessThan(150);
    });
  });
});
