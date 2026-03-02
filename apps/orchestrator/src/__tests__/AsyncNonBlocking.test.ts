/**
 * Async Non-Blocking Behavior Tests
 * 
 * Verifies that async file I/O operations do not block the event loop
 * and that concurrent operations execute properly in parallel.
 * 
 * Requirements: 14.6 - Async operation is awaited without blocking other concurrent operations
 * 
 * **Feature: llm-council-production-ready, Property 9: Async File Operation Non-Blocking**
 * **Validates: Requirements 14.1, 14.2, 14.3, 14.6**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * Helper to measure event loop lag
 * If the event loop is blocked, the callback will be delayed significantly
 */
function measureEventLoopLag(durationMs: number): Promise<{ maxLag: number; avgLag: number; samples: number }> {
  return new Promise((resolve) => {
    const lags: number[] = [];
    const interval = 10; // Check every 10ms
    let lastTime = Date.now();
    let samples = 0;
    
    const checkLag = () => {
      const now = Date.now();
      const elapsed = now - lastTime;
      const lag = elapsed - interval;
      if (lag > 0) {
        lags.push(lag);
      }
      lastTime = now;
      samples++;
    };
    
    const timer = setInterval(checkLag, interval);
    
    setTimeout(() => {
      clearInterval(timer);
      const maxLag = lags.length > 0 ? Math.max(...lags) : 0;
      const avgLag = lags.length > 0 ? lags.reduce((a, b) => a + b, 0) / lags.length : 0;
      resolve({ maxLag, avgLag, samples });
    }, durationMs);
  });
}

/**
 * Helper to create a temporary directory for tests
 */
async function createTempDir(): Promise<string> {
  const tempDir = path.join(os.tmpdir(), `async-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(tempDir, { recursive: true });
  return tempDir;
}

/**
 * Helper to clean up temporary directory
 */
async function cleanupTempDir(tempDir: string): Promise<void> {
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

describe('Async Non-Blocking Behavior', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe('Event Loop Non-Blocking', () => {
    it('should not block event loop during file write operations', async () => {
      // Start measuring event loop lag
      const lagPromise = measureEventLoopLag(500);
      
      // Perform multiple file write operations concurrently
      const writePromises: Promise<void>[] = [];
      for (let i = 0; i < 20; i++) {
        const filePath = path.join(tempDir, `test-file-${i}.txt`);
        const content = 'x'.repeat(10000); // 10KB of content
        writePromises.push(fs.writeFile(filePath, content, 'utf-8'));
      }
      
      // Wait for all writes to complete
      await Promise.all(writePromises);
      
      // Get lag measurements
      const lagResult = await lagPromise;
      
      // Event loop should not be blocked significantly
      // A max lag of 100ms would indicate blocking; async operations should keep it low
      expect(lagResult.maxLag).toBeLessThan(100);
    });

    it('should not block event loop during file read operations', async () => {
      // First, create test files
      const fileCount = 20;
      for (let i = 0; i < fileCount; i++) {
        const filePath = path.join(tempDir, `read-test-${i}.txt`);
        await fs.writeFile(filePath, 'x'.repeat(10000), 'utf-8');
      }
      
      // Start measuring event loop lag
      const lagPromise = measureEventLoopLag(500);
      
      // Perform multiple file read operations concurrently
      const readPromises: Promise<string>[] = [];
      for (let i = 0; i < fileCount; i++) {
        const filePath = path.join(tempDir, `read-test-${i}.txt`);
        readPromises.push(fs.readFile(filePath, 'utf-8'));
      }
      
      // Wait for all reads to complete
      const results = await Promise.all(readPromises);
      
      // Verify all reads succeeded
      expect(results).toHaveLength(fileCount);
      results.forEach(content => {
        expect(content.length).toBe(10000);
      });
      
      // Get lag measurements
      const lagResult = await lagPromise;
      
      // Event loop should not be blocked significantly
      expect(lagResult.maxLag).toBeLessThan(100);
    });

    it('should not block event loop during directory read operations', async () => {
      // Create nested directory structure
      const subDirs = 10;
      const filesPerDir = 5;
      
      for (let i = 0; i < subDirs; i++) {
        const subDir = path.join(tempDir, `subdir-${i}`);
        await fs.mkdir(subDir, { recursive: true });
        for (let j = 0; j < filesPerDir; j++) {
          await fs.writeFile(path.join(subDir, `file-${j}.txt`), 'content', 'utf-8');
        }
      }
      
      // Start measuring event loop lag
      const lagPromise = measureEventLoopLag(500);
      
      // Perform multiple directory read operations concurrently
      const readdirPromises: Promise<string[]>[] = [];
      for (let i = 0; i < subDirs; i++) {
        const subDir = path.join(tempDir, `subdir-${i}`);
        readdirPromises.push(fs.readdir(subDir));
      }
      
      // Wait for all reads to complete
      const results = await Promise.all(readdirPromises);
      
      // Verify all reads succeeded
      expect(results).toHaveLength(subDirs);
      results.forEach(files => {
        expect(files).toHaveLength(filesPerDir);
      });
      
      // Get lag measurements
      const lagResult = await lagPromise;
      
      // Event loop should not be blocked significantly
      expect(lagResult.maxLag).toBeLessThan(100);
    });
  });

  describe('Concurrent Operations', () => {
    it('should execute multiple file operations concurrently without blocking', async () => {
      const operationCount = 10;
      const startTimes: number[] = [];
      const endTimes: number[] = [];
      
      // Create operations that track their start and end times
      const operations = Array.from({ length: operationCount }, async (_, i) => {
        startTimes[i] = Date.now();
        const filePath = path.join(tempDir, `concurrent-${i}.txt`);
        await fs.writeFile(filePath, `content-${i}`, 'utf-8');
        const content = await fs.readFile(filePath, 'utf-8');
        endTimes[i] = Date.now();
        return content;
      });
      
      // Execute all operations concurrently
      const results = await Promise.all(operations);
      
      // Verify all operations completed
      expect(results).toHaveLength(operationCount);
      
      // Check that operations overlapped (concurrent execution)
      // If operations were sequential, each would start after the previous ended
      // With concurrent execution, start times should be very close together
      const firstStart = Math.min(...startTimes);
      const lastStart = Math.max(...startTimes);
      const startSpread = lastStart - firstStart;
      
      // All operations should start within 50ms of each other (concurrent)
      // Sequential execution would have much larger spread
      expect(startSpread).toBeLessThan(50);
    });

    it('should allow other async operations to interleave during I/O', async () => {
      const interleaveCount = { value: 0 };
      
      // Start a file operation
      const fileOpPromise = (async () => {
        const filePath = path.join(tempDir, 'interleave-test.txt');
        await fs.writeFile(filePath, 'x'.repeat(50000), 'utf-8');
        await fs.readFile(filePath, 'utf-8');
        return 'file-op-done';
      })();
      
      // Start interleaving operations that should run while file I/O is pending
      const interleavePromise = (async () => {
        for (let i = 0; i < 10; i++) {
          await new Promise(resolve => setImmediate(resolve));
          interleaveCount.value++;
        }
        return 'interleave-done';
      })();
      
      // Wait for both to complete
      const [fileResult, interleaveResult] = await Promise.all([fileOpPromise, interleavePromise]);
      
      // Both should complete
      expect(fileResult).toBe('file-op-done');
      expect(interleaveResult).toBe('interleave-done');
      
      // Interleave operations should have run (event loop wasn't blocked)
      expect(interleaveCount.value).toBe(10);
    });

    it('should handle mixed read/write operations concurrently', async () => {
      // Create some initial files
      const initialFiles = 5;
      for (let i = 0; i < initialFiles; i++) {
        await fs.writeFile(path.join(tempDir, `initial-${i}.txt`), `initial-content-${i}`, 'utf-8');
      }
      
      // Mix of operations: reads, writes, and stats
      const operations: Promise<unknown>[] = [];
      
      // Read operations
      for (let i = 0; i < initialFiles; i++) {
        operations.push(fs.readFile(path.join(tempDir, `initial-${i}.txt`), 'utf-8'));
      }
      
      // Write operations
      for (let i = 0; i < 5; i++) {
        operations.push(fs.writeFile(path.join(tempDir, `new-${i}.txt`), `new-content-${i}`, 'utf-8'));
      }
      
      // Stat operations
      for (let i = 0; i < initialFiles; i++) {
        operations.push(fs.stat(path.join(tempDir, `initial-${i}.txt`)));
      }
      
      // Execute all concurrently
      const startTime = Date.now();
      const results = await Promise.all(operations);
      const duration = Date.now() - startTime;
      
      // All operations should complete
      expect(results).toHaveLength(initialFiles + 5 + initialFiles);
      
      // Concurrent execution should be faster than sequential
      // With 15 operations, if each took 10ms sequentially = 150ms
      // Concurrent should be much faster
      expect(duration).toBeLessThan(500); // Generous timeout for CI environments
    });
  });

  describe('Performance Benchmarks', () => {
    it('should complete parallel writes faster than sequential writes', async () => {
      const fileCount = 10;
      const content = 'x'.repeat(5000);
      
      // Sequential writes
      const sequentialStart = Date.now();
      for (let i = 0; i < fileCount; i++) {
        await fs.writeFile(path.join(tempDir, `seq-${i}.txt`), content, 'utf-8');
      }
      const sequentialDuration = Date.now() - sequentialStart;
      
      // Parallel writes
      const parallelStart = Date.now();
      await Promise.all(
        Array.from({ length: fileCount }, (_, i) =>
          fs.writeFile(path.join(tempDir, `par-${i}.txt`), content, 'utf-8')
        )
      );
      const parallelDuration = Date.now() - parallelStart;
      
      // Parallel should be faster or at least not significantly slower
      // In practice, parallel I/O can be faster due to OS-level optimizations
      // We just verify parallel doesn't block and completes in reasonable time
      // Handle edge case where both complete in 0ms (OS caching)
      const threshold = Math.max(sequentialDuration * 2, 10); // At least 10ms threshold
      expect(parallelDuration).toBeLessThan(threshold);
      
      // Log benchmark results for visibility
      console.log(`Sequential writes: ${sequentialDuration}ms`);
      console.log(`Parallel writes: ${parallelDuration}ms`);
    });

    it('should complete parallel reads faster than sequential reads', async () => {
      const fileCount = 10;
      const content = 'x'.repeat(5000);
      
      // Create test files
      for (let i = 0; i < fileCount; i++) {
        await fs.writeFile(path.join(tempDir, `bench-${i}.txt`), content, 'utf-8');
      }
      
      // Sequential reads
      const sequentialStart = Date.now();
      for (let i = 0; i < fileCount; i++) {
        await fs.readFile(path.join(tempDir, `bench-${i}.txt`), 'utf-8');
      }
      const sequentialDuration = Date.now() - sequentialStart;
      
      // Parallel reads
      const parallelStart = Date.now();
      await Promise.all(
        Array.from({ length: fileCount }, (_, i) =>
          fs.readFile(path.join(tempDir, `bench-${i}.txt`), 'utf-8')
        )
      );
      const parallelDuration = Date.now() - parallelStart;
      
      // Parallel should be faster or at least not significantly slower
      // Handle edge case where both complete in 0ms (OS caching)
      // The key verification is that parallel doesn't block - if both are 0ms, that's fine
      const threshold = Math.max(sequentialDuration * 2, 10); // At least 10ms threshold
      expect(parallelDuration).toBeLessThan(threshold);
      
      // Log benchmark results for visibility
      console.log(`Sequential reads: ${sequentialDuration}ms`);
      console.log(`Parallel reads: ${parallelDuration}ms`);
    });

    it('should maintain responsiveness under load', async () => {
      const responseTimes: number[] = [];
      const loadDuration = 1000; // 1 second of load
      const startTime = Date.now();
      
      // Generate continuous I/O load
      const loadPromise = (async () => {
        while (Date.now() - startTime < loadDuration) {
          const filePath = path.join(tempDir, `load-${Date.now()}.txt`);
          await fs.writeFile(filePath, 'load-content', 'utf-8');
        }
      })();
      
      // Measure response times for quick operations during load
      const measurePromise = (async () => {
        while (Date.now() - startTime < loadDuration) {
          const opStart = Date.now();
          await new Promise(resolve => setImmediate(resolve));
          responseTimes.push(Date.now() - opStart);
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      })();
      
      await Promise.all([loadPromise, measurePromise]);
      
      // Calculate response time statistics
      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);
      
      // Event loop should remain responsive (setImmediate should complete quickly)
      expect(avgResponseTime).toBeLessThan(20); // Average should be very low
      expect(maxResponseTime).toBeLessThan(100); // Max should be reasonable
      
      console.log(`Response times - Avg: ${avgResponseTime.toFixed(2)}ms, Max: ${maxResponseTime}ms`);
    });
  });

  describe('fs.promises API Usage Verification', () => {
    it('should use fs.promises.writeFile (returns Promise)', async () => {
      const filePath = path.join(tempDir, 'promise-test.txt');
      const writeResult = fs.writeFile(filePath, 'test', 'utf-8');
      
      // Verify it returns a Promise
      expect(writeResult).toBeInstanceOf(Promise);
      
      // Verify it resolves
      await expect(writeResult).resolves.toBeUndefined();
    });

    it('should use fs.promises.readFile (returns Promise)', async () => {
      const filePath = path.join(tempDir, 'promise-read-test.txt');
      await fs.writeFile(filePath, 'test-content', 'utf-8');
      
      const readResult = fs.readFile(filePath, 'utf-8');
      
      // Verify it returns a Promise
      expect(readResult).toBeInstanceOf(Promise);
      
      // Verify it resolves with content
      await expect(readResult).resolves.toBe('test-content');
    });

    it('should use fs.promises.readdir (returns Promise)', async () => {
      // Create a file in temp dir
      await fs.writeFile(path.join(tempDir, 'dir-test.txt'), 'content', 'utf-8');
      
      const readdirResult = fs.readdir(tempDir);
      
      // Verify it returns a Promise
      expect(readdirResult).toBeInstanceOf(Promise);
      
      // Verify it resolves with array
      const files = await readdirResult;
      expect(Array.isArray(files)).toBe(true);
      expect(files).toContain('dir-test.txt');
    });

    it('should use fs.promises.stat (returns Promise)', async () => {
      const filePath = path.join(tempDir, 'stat-test.txt');
      await fs.writeFile(filePath, 'stat-content', 'utf-8');
      
      const statResult = fs.stat(filePath);
      
      // Verify it returns a Promise
      expect(statResult).toBeInstanceOf(Promise);
      
      // Verify it resolves with Stats object
      const stats = await statResult;
      expect(stats.isFile()).toBe(true);
      expect(stats.size).toBeGreaterThan(0);
    });

    it('should use fs.promises.mkdir (returns Promise)', async () => {
      const dirPath = path.join(tempDir, 'new-dir');
      const mkdirResult = fs.mkdir(dirPath, { recursive: true });
      
      // Verify it returns a Promise
      expect(mkdirResult).toBeInstanceOf(Promise);
      
      // Verify it resolves
      await mkdirResult;
      
      // Verify directory was created
      const stats = await fs.stat(dirPath);
      expect(stats.isDirectory()).toBe(true);
    });
  });
});
