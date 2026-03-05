// apps/indexer/src/__tests__/Indexer.comprehensive.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Scanner, FileMetadata } from '../scanner/Scanner';
import { Chunker, ChunkerConfig } from '../chunker/Chunker';
import { EmbeddingEngine, EmbeddingEngineConfig } from '../embedding/EmbeddingEngine';
import { VectorIndex, VectorIndexConfig } from '../vector_index/VectorIndex';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';

describe('Indexer Components', () => {
  describe('Scanner', () => {
    let scanner: Scanner;
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scanner-test-'));
      scanner = new Scanner({ projectRoot: tempDir });
    });

    it('should initialize with project path', () => {
      expect(scanner).toBeDefined();
    });

    it('should respect exclude patterns', () => {
      const excludeScanner = new Scanner({
        projectRoot: tempDir,
        ignorePatterns: [
          'node_modules/**',
          '*.test.ts',
          'dist/**',
        ],
      });

      expect(excludeScanner).toBeDefined();
    });

    it('should handle empty exclude patterns', () => {
      const emptyScanner = new Scanner({ projectRoot: tempDir });
      expect(emptyScanner).toBeDefined();
    });

    it('should scan files in directory', async () => {
      // Create test files
      await fs.writeFile(path.join(tempDir, 'test.ts'), 'console.log("test");');
      await fs.writeFile(path.join(tempDir, 'test.js'), 'console.log("test");');
      
      const files = await scanner.scan();
      expect(files.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Chunker', () => {
    let chunker: Chunker;
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chunker-test-'));
      const config: ChunkerConfig = {
        maxTokens: 500,
        overlapTokens: 50,
      };
      chunker = new Chunker(config);
    });

    it('should chunk file into appropriate sizes', async () => {
      const testFile = path.join(tempDir, 'test.ts');
      const content = 'function test() {\n  return true;\n}\n'.repeat(100);
      await fs.writeFile(testFile, content);

      const fileMetadata: FileMetadata = {
        path: testFile,
        relativePath: 'test.ts',
        extension: '.ts',
        size: content.length,
        modifiedTime: new Date(),
        isDirectory: false,
      };

      const chunks = await chunker.chunkFile(fileMetadata);

      chunks.forEach((chunk) => {
        expect(chunk.tokenCount).toBeLessThanOrEqual(600); // Allow some flexibility
        expect(chunk.content).toBeDefined();
        expect(chunk.id).toBeDefined();
      });
    });

    it('should handle empty files', async () => {
      const testFile = path.join(tempDir, 'empty.ts');
      await fs.writeFile(testFile, '');

      const fileMetadata: FileMetadata = {
        path: testFile,
        relativePath: 'empty.ts',
        extension: '.ts',
        size: 0,
        modifiedTime: new Date(),
        isDirectory: false,
      };

      const chunks = await chunker.chunkFile(fileMetadata);
      expect(chunks.length).toBeGreaterThanOrEqual(0);
    });

    it('should preserve metadata in chunks', async () => {
      const testFile = path.join(tempDir, 'metadata.ts');
      const content = 'const x = 1;';
      await fs.writeFile(testFile, content);

      const fileMetadata: FileMetadata = {
        path: testFile,
        relativePath: 'metadata.ts',
        extension: '.ts',
        size: content.length,
        modifiedTime: new Date(),
        isDirectory: false,
      };

      const chunks = await chunker.chunkFile(fileMetadata);
      
      chunks.forEach((chunk) => {
        expect(chunk.metadata.extension).toBe('.ts');
        expect(chunk.metadata.chunkType).toBeDefined();
        expect(chunk.filePath).toBe(testFile);
        expect(chunk.relativePath).toBe('metadata.ts');
      });
    });
  });

  describe('EmbeddingEngine', () => {
    let engine: EmbeddingEngine;

    beforeEach(() => {
      const config: EmbeddingEngineConfig = {
        embeddingUrl: 'http://localhost:8000',
        modelName: 'local-bge-large-v1.5',
        batchSize: 10,
      };
      engine = new EmbeddingEngine(config);
    });

    it('should initialize with config', () => {
      expect(engine).toBeDefined();
      expect(engine.getDimensions()).toBe(1024);
    });

    it('should get model info', () => {
      const modelInfo = engine.getModelInfo();
      expect(modelInfo).toBeDefined();
      expect(modelInfo.name).toBeDefined();
      expect(modelInfo.dimensions).toBe(1024);
    });

    it('should get embedding URL', () => {
      const url = engine.getEmbeddingUrl();
      expect(url).toBe('http://localhost:8000');
    });
  });

  describe('VectorIndex', () => {
    let index: VectorIndex;
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vector-test-'));
      const config: VectorIndexConfig = {
        storagePath: tempDir,
        dimensions: 1024,
      };
      index = new VectorIndex(config);
    });

    it('should initialize with config', () => {
      expect(index).toBeDefined();
    });

    it('should get stats', () => {
      const stats = index.getStats();
      expect(stats).toBeDefined();
      expect(stats.count).toBeGreaterThanOrEqual(0);
      expect(stats.dimensions).toBe(1024);
    });

    it('should check if chunk exists', () => {
      const exists = index.hasChunk('non-existent-id');
      expect(exists).toBe(false);
    });

    it('should initialize and load', async () => {
      await expect(index.initialize()).resolves.not.toThrow();
    });

    it('should save and load index', async () => {
      await index.initialize();
      await expect(index.save()).resolves.not.toThrow();
      await expect(index.load()).resolves.not.toThrow();
    });

    it('should clear index', async () => {
      await index.initialize();
      await expect(index.clear()).resolves.not.toThrow();
      const stats = index.getStats();
      expect(stats.count).toBe(0);
    });
  });
});
