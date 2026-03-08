/**
 * Persistence Integrity Tests
 * 
 * Tests for Refactor Spec 07: Indexer persistence integrity
 * Validates that:
 * 1. Deleted files are properly removed from the index
 * 2. Modified files don't leave stale chunks
 * 3. Restart/reload preserves chunk content and search quality
 * 4. Index state remains consistent with file system
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IndexController } from '../api/IndexController';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';

describe('Persistence Integrity', () => {
  let controller: IndexController;
  let tempDir: string;
  let storageDir: string;

  beforeEach(async () => {
    // Create temporary directories
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'indexer-persist-test-'));
    storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'indexer-storage-'));
    
    // Initialize controller
    controller = new IndexController(storageDir, {
      modelName: 'local-bge-large-v1.5',
      device: 'cpu',
    });
    await controller.initialize();
  });

  afterEach(async () => {
    // Cleanup
    await controller.shutdown();
    await fs.rm(tempDir, { recursive: true, force: true });
    await fs.rm(storageDir, { recursive: true, force: true });
  });

  describe('File Deletion Scenarios', () => {
    it('should remove chunks when files are deleted', async () => {
      // Create initial files
      const file1 = path.join(tempDir, 'file1.ts');
      const file2 = path.join(tempDir, 'file2.ts');
      await fs.writeFile(file1, 'export function hello() { return "world"; }');
      await fs.writeFile(file2, 'export function goodbye() { return "farewell"; }');

      // Initial indexing
      const indexResult1 = await controller.ensureIndexed({
        projectRoot: tempDir,
      });
      expect(indexResult1.success).toBe(true);
      expect(indexResult1.stats.addedFiles).toBe(2);
      
      const stats1 = await controller.getStats();
      const initialChunkCount = stats1.stats.indexedChunks;
      expect(initialChunkCount).toBeGreaterThan(0);

      // Delete one file
      await fs.unlink(file1);

      // Re-index
      const indexResult2 = await controller.ensureIndexed({
        projectRoot: tempDir,
      });
      expect(indexResult2.success).toBe(true);
      expect(indexResult2.stats.deletedFiles).toBe(1);

      // Verify chunks were removed
      const stats2 = await controller.getStats();
      expect(stats2.stats.indexedChunks).toBeLessThan(initialChunkCount);
      expect(stats2.stats.indexedChunks).toBeGreaterThan(0); // file2 still indexed
    });

    it('should not return results from deleted files', async () => {
      // Create file with distinctive content
      const file1 = path.join(tempDir, 'unique-function.ts');
      await fs.writeFile(file1, 'export function uniqueSearchTerm() { return "findme"; }');

      // Index
      await controller.ensureIndexed({ projectRoot: tempDir });

      // Search should find it
      const searchBefore = await controller.search({
        query: 'uniqueSearchTerm function',
        topK: 5,
      });
      expect(searchBefore.success).toBe(true);
      expect(searchBefore.results.length).toBeGreaterThan(0);

      // Delete file
      await fs.unlink(file1);
      await controller.ensureIndexed({ projectRoot: tempDir });

      // Search should not find it
      const searchAfter = await controller.search({
        query: 'uniqueSearchTerm function',
        topK: 5,
      });
      expect(searchAfter.success).toBe(true);
      // Results should be empty or not contain the deleted file
      const hasDeletedFile = searchAfter.results.some(
        r => r.chunk.relativePath === 'unique-function.ts'
      );
      expect(hasDeletedFile).toBe(false);
    });

    it('should handle multiple file deletions', async () => {
      // Create multiple files
      const files = [];
      for (let i = 0; i < 5; i++) {
        const filePath = path.join(tempDir, `file${i}.ts`);
        await fs.writeFile(filePath, `export const value${i} = ${i};`);
        files.push(filePath);
      }

      // Index
      const indexResult1 = await controller.ensureIndexed({ projectRoot: tempDir });
      expect(indexResult1.stats.addedFiles).toBe(5);
      const stats1 = await controller.getStats();
      const initialCount = stats1.stats.indexedChunks;

      // Delete 3 files
      await fs.unlink(files[0]);
      await fs.unlink(files[2]);
      await fs.unlink(files[4]);

      // Re-index
      const indexResult2 = await controller.ensureIndexed({ projectRoot: tempDir });
      expect(indexResult2.stats.deletedFiles).toBe(3);

      // Verify chunk count decreased
      const stats2 = await controller.getStats();
      expect(stats2.stats.indexedChunks).toBeLessThan(initialCount);
      expect(stats2.stats.trackedFiles).toBe(2);
    });
  });

  describe('File Update Scenarios', () => {
    it('should replace chunks when file is modified', async () => {
      const file1 = path.join(tempDir, 'mutable.ts');
      await fs.writeFile(file1, 'export const version = 1;');

      // Initial index
      await controller.ensureIndexed({ projectRoot: tempDir });
      const stats1 = await controller.getStats();
      const count1 = stats1.stats.indexedChunks;

      // Modify file
      await fs.writeFile(file1, 'export const version = 2; // updated');

      // Re-index
      const indexResult = await controller.ensureIndexed({ projectRoot: tempDir });
      expect(indexResult.success).toBe(true);
      expect(indexResult.stats.modifiedFiles).toBe(1);

      // Chunk count should remain similar (old removed, new added)
      const stats2 = await controller.getStats();
      expect(stats2.stats.indexedChunks).toBeGreaterThanOrEqual(count1 - 1);
      expect(stats2.stats.indexedChunks).toBeLessThanOrEqual(count1 + 1);
    });

    it('should not have stale content after update', async () => {
      const file1 = path.join(tempDir, 'content-test.ts');
      await fs.writeFile(file1, 'export const OLD_CONTENT = "old";');

      // Index
      await controller.ensureIndexed({ projectRoot: tempDir });

      // Update file
      await fs.writeFile(file1, 'export const NEW_CONTENT = "new";');
      await controller.ensureIndexed({ projectRoot: tempDir });

      // Search for new content
      const searchNew = await controller.search({
        query: 'NEW_CONTENT',
        topK: 5,
      });

      // Should find new content
      const hasNewContent = searchNew.results.some(
        r => r.chunk.content.includes('NEW_CONTENT')
      );
      expect(hasNewContent).toBe(true);

      // Should not find old content
      const hasOldContent = searchNew.results.some(
        r => r.chunk.content.includes('OLD_CONTENT')
      );
      expect(hasOldContent).toBe(false);
    });
  });

  describe('Persistence and Reload Scenarios', () => {
    it('should preserve chunk content after restart', async () => {
      // Create file
      const file1 = path.join(tempDir, 'persist-test.ts');
      const content = 'export function persistentFunction() { return "data"; }';
      await fs.writeFile(file1, content);

      // Index
      await controller.ensureIndexed({ projectRoot: tempDir });

      // Search before restart
      const searchBefore = await controller.search({
        query: 'persistentFunction',
        topK: 5,
      });
      expect(searchBefore.results.length).toBeGreaterThan(0);
      const contentBefore = searchBefore.results[0].chunk.content;
      expect(contentBefore).toBeTruthy();
      expect(contentBefore.length).toBeGreaterThan(0);

      // Simulate restart by creating new controller with same storage
      await controller.shutdown();
      const newController = new IndexController(storageDir, {
        modelName: 'local-bge-large-v1.5',
        device: 'cpu',
      });
      await newController.initialize();

      // Search after restart
      const searchAfter = await newController.search({
        query: 'persistentFunction',
        topK: 5,
      });
      expect(searchAfter.results.length).toBeGreaterThan(0);
      const contentAfter = searchAfter.results[0].chunk.content;
      
      // Content should be preserved
      expect(contentAfter).toBeTruthy();
      expect(contentAfter.length).toBeGreaterThan(0);
      expect(contentAfter).toBe(contentBefore);

      await newController.shutdown();
    });

    it('should maintain search quality after restart', async () => {
      // Create multiple files with related content
      await fs.writeFile(
        path.join(tempDir, 'auth.ts'),
        'export function authenticate(user: string) { return validateUser(user); }'
      );
      await fs.writeFile(
        path.join(tempDir, 'user.ts'),
        'export function validateUser(user: string) { return user.length > 0; }'
      );

      // Index
      await controller.ensureIndexed({ projectRoot: tempDir });

      // Search before restart
      const searchBefore = await controller.search({
        query: 'user authentication validation',
        topK: 5,
      });
      const scoresBefore = searchBefore.results.map(r => r.score);

      // Restart
      await controller.shutdown();
      const newController = new IndexController(storageDir, {
        modelName: 'local-bge-large-v1.5',
        device: 'cpu',
      });
      await newController.initialize();

      // Search after restart
      const searchAfter = await newController.search({
        query: 'user authentication validation',
        topK: 5,
      });
      const scoresAfter = searchAfter.results.map(r => r.score);

      // Scores should be identical (same vectors, same search)
      expect(scoresAfter.length).toBe(scoresBefore.length);
      for (let i = 0; i < scoresBefore.length; i++) {
        expect(scoresAfter[i]).toBeCloseTo(scoresBefore[i], 5);
      }

      await newController.shutdown();
    });

    it('should handle incremental updates after restart', async () => {
      // Create initial file
      const file1 = path.join(tempDir, 'incremental.ts');
      await fs.writeFile(file1, 'export const v1 = 1;');

      // Index
      await controller.ensureIndexed({ projectRoot: tempDir });
      const stats1 = await controller.getStats();

      // Restart
      await controller.shutdown();
      const newController = new IndexController(storageDir, {
        modelName: 'local-bge-large-v1.5',
        device: 'cpu',
      });
      await newController.initialize();

      // Add new file after restart
      const file2 = path.join(tempDir, 'new-file.ts');
      await fs.writeFile(file2, 'export const v2 = 2;');

      // Incremental index
      const indexResult = await newController.ensureIndexed({ projectRoot: tempDir });
      expect(indexResult.success).toBe(true);
      expect(indexResult.stats.addedFiles).toBe(1);
      expect(indexResult.stats.unchangedFiles).toBe(1);

      const stats2 = await newController.getStats();
      expect(stats2.stats.indexedChunks).toBeGreaterThan(stats1.stats.indexedChunks);

      await newController.shutdown();
    });
  });

  describe('Index Consistency', () => {
    it('should maintain consistency between hash tracker and vector index', async () => {
      // Create files
      await fs.writeFile(path.join(tempDir, 'a.ts'), 'export const a = 1;');
      await fs.writeFile(path.join(tempDir, 'b.ts'), 'export const b = 2;');
      await fs.writeFile(path.join(tempDir, 'c.ts'), 'export const c = 3;');

      // Index
      await controller.ensureIndexed({ projectRoot: tempDir });
      const stats1 = await controller.getStats();
      
      // Tracked files should match indexed chunks (roughly)
      expect(stats1.stats.trackedFiles).toBe(3);
      expect(stats1.stats.indexedChunks).toBeGreaterThanOrEqual(3);

      // Delete one file
      await fs.unlink(path.join(tempDir, 'b.ts'));
      await controller.ensureIndexed({ projectRoot: tempDir });
      
      const stats2 = await controller.getStats();
      expect(stats2.stats.trackedFiles).toBe(2);
      expect(stats2.stats.indexedChunks).toBeLessThan(stats1.stats.indexedChunks);
    });

    it('should handle force rebuild correctly', async () => {
      // Create and index files
      await fs.writeFile(path.join(tempDir, 'file1.ts'), 'export const x = 1;');
      await controller.ensureIndexed({ projectRoot: tempDir });
      
      const stats1 = await controller.getStats();
      const count1 = stats1.stats.indexedChunks;

      // Force rebuild
      const rebuildResult = await controller.ensureIndexed({
        projectRoot: tempDir,
        forceRebuild: true,
      });
      expect(rebuildResult.success).toBe(true);
      expect(rebuildResult.stats.addedFiles).toBe(1);

      const stats2 = await controller.getStats();
      expect(stats2.stats.indexedChunks).toBe(count1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty directory', async () => {
      const result = await controller.ensureIndexed({ projectRoot: tempDir });
      expect(result.success).toBe(true);
      expect(result.stats.totalFiles).toBe(0);
      
      const stats = await controller.getStats();
      expect(stats.stats.indexedChunks).toBe(0);
    });

    it('should handle file with no chunks', async () => {
      await fs.writeFile(path.join(tempDir, 'empty.ts'), '');
      
      const result = await controller.ensureIndexed({ projectRoot: tempDir });
      expect(result.success).toBe(true);
    });

    it('should handle rapid file changes', async () => {
      const file = path.join(tempDir, 'rapid.ts');
      
      // Create
      await fs.writeFile(file, 'export const v1 = 1;');
      await controller.ensureIndexed({ projectRoot: tempDir });
      
      // Update
      await fs.writeFile(file, 'export const v2 = 2;');
      await controller.ensureIndexed({ projectRoot: tempDir });
      
      // Update again
      await fs.writeFile(file, 'export const v3 = 3;');
      await controller.ensureIndexed({ projectRoot: tempDir });
      
      // Delete
      await fs.unlink(file);
      const result = await controller.ensureIndexed({ projectRoot: tempDir });
      
      expect(result.success).toBe(true);
      expect(result.stats.deletedFiles).toBe(1);
      
      const stats = await controller.getStats();
      expect(stats.stats.indexedChunks).toBe(0);
    });
  });
});
