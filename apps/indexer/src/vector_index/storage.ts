import * as fs from 'fs/promises';
import * as path from 'path';
import { formatJson, safeJsonParse } from '@llm/shared-utils';
import { logger } from '../observability/Logger';

/**
 * Error thrown when a vector storage operation fails.
 * Provides context about the operation and file path.
 * 
 * Requirements: 14.5
 */
export class VectorStorageError extends Error {
  public readonly code: string;
  public readonly filePath: string;
  public readonly operation: string;
  public readonly cause?: Error;

  constructor(
    message: string,
    options: {
      code: string;
      filePath: string;
      operation: string;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'VectorStorageError';
    this.code = options.code;
    this.filePath = options.filePath;
    this.operation = options.operation;
    this.cause = options.cause;
  }
}

export interface StoredVector {
  id: string;
  vector: number[];
  metadata: Record<string, any>;
  content?: string; // Chunk content for search results
}

export interface IndexMetadata {
  dimensions: number;
  count: number;
  version: string;
  createdAt: string;
  updatedAt: string;
}

export class VectorStorage {
  private indexPath: string;
  private metadataPath: string;

  constructor(storagePath: string) {
    this.indexPath = path.join(storagePath, 'vectors.jsonl');
    this.metadataPath = path.join(storagePath, 'metadata.json');
  }

  async ensureDirectory(): Promise<void> {
    try {
      const dir = path.dirname(this.indexPath);
      await fs.mkdir(dir, { recursive: true });
    } catch (err) {
      // Re-throw with proper error context
      // Requirements: 14.5 - Propagate errors to callers with try/catch
      const error = err as NodeJS.ErrnoException;
      const dir = path.dirname(this.indexPath);
      logger.error('Failed to create storage directory', {
        directory: dir,
        operation: 'mkdir',
        errorCode: error.code,
        errorMessage: error.message,
      });
      throw new VectorStorageError(
        `Failed to create storage directory ${dir}: ${error.message}`,
        {
          code: error.code || 'MKDIR_ERROR',
          filePath: dir,
          operation: 'ensureDirectory',
          cause: error,
        }
      );
    }
  }

  async saveVectors(vectors: StoredVector[]): Promise<void> {
    try {
      await this.ensureDirectory();
      
      // Save each vector as a single-line JSON (JSONL format)
      const lines = vectors.map(v => JSON.stringify(v)).join('\n');
      await fs.writeFile(this.indexPath, lines, 'utf-8');
      
      logger.debug('Saved vectors to storage', {
        indexPath: this.indexPath,
        vectorCount: vectors.length,
      });
    } catch (err) {
      // Re-throw with proper error context
      // Requirements: 14.5 - Propagate errors to callers with try/catch
      const error = err as NodeJS.ErrnoException;
      logger.error('Failed to save vectors', {
        indexPath: this.indexPath,
        operation: 'writeFile',
        vectorCount: vectors.length,
        errorCode: error.code,
        errorMessage: error.message,
      });
      throw new VectorStorageError(
        `Failed to save vectors to ${this.indexPath}: ${error.message}`,
        {
          code: error.code || 'SAVE_ERROR',
          filePath: this.indexPath,
          operation: 'saveVectors',
          cause: error,
        }
      );
    }
  }

  async appendVectors(vectors: StoredVector[]): Promise<void> {
    try {
      await this.ensureDirectory();
      
      // Append each vector as a single-line JSON (JSONL format)
      const lines = vectors.map(v => JSON.stringify(v)).join('\n') + '\n';
      await fs.appendFile(this.indexPath, lines, 'utf-8');
      
      logger.debug('Appended vectors to storage', {
        indexPath: this.indexPath,
        vectorCount: vectors.length,
      });
    } catch (err) {
      // Re-throw with proper error context
      // Requirements: 14.5 - Propagate errors to callers with try/catch
      const error = err as NodeJS.ErrnoException;
      logger.error('Failed to append vectors', {
        indexPath: this.indexPath,
        operation: 'appendFile',
        vectorCount: vectors.length,
        errorCode: error.code,
        errorMessage: error.message,
      });
      throw new VectorStorageError(
        `Failed to append vectors to ${this.indexPath}: ${error.message}`,
        {
          code: error.code || 'APPEND_ERROR',
          filePath: this.indexPath,
          operation: 'appendVectors',
          cause: error,
        }
      );
    }
  }

  async loadVectors(): Promise<StoredVector[]> {
    try {
      const content = await fs.readFile(this.indexPath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.length > 0);
      
      const vectors: StoredVector[] = [];
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line) as StoredVector;
          vectors.push(parsed);
        } catch (parseError) {
          logger.warn('Failed to parse vector line', {
            line: line.substring(0, 100),
            error: parseError,
          });
        }
      }
      
      logger.debug('Loaded vectors from storage', {
        indexPath: this.indexPath,
        vectorCount: vectors.length,
      });
      
      return vectors;
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'ENOENT') {
        logger.debug('No existing vector index found, returning empty array', {
          indexPath: this.indexPath,
        });
        return [];
      }
      // Re-throw with proper error context
      // Requirements: 14.5 - Propagate errors to callers with try/catch
      logger.error('Failed to load vectors', {
        indexPath: this.indexPath,
        operation: 'readFile',
        errorCode: error.code,
        errorMessage: error.message,
      });
      throw new VectorStorageError(
        `Failed to load vectors from ${this.indexPath}: ${error.message}`,
        {
          code: error.code || 'LOAD_ERROR',
          filePath: this.indexPath,
          operation: 'loadVectors',
          cause: error,
        }
      );
    }
  }

  async saveMetadata(metadata: IndexMetadata): Promise<void> {
    try {
      await this.ensureDirectory();
      // Use formatJson for metadata since it's a single object (pretty-print is fine)
      await fs.writeFile(this.metadataPath, formatJson(metadata), 'utf-8');
      
      logger.debug('Saved index metadata', {
        metadataPath: this.metadataPath,
        dimensions: metadata.dimensions,
        count: metadata.count,
      });
    } catch (err) {
      // Re-throw with proper error context
      // Requirements: 14.5 - Propagate errors to callers with try/catch
      const error = err as NodeJS.ErrnoException;
      logger.error('Failed to save index metadata', {
        metadataPath: this.metadataPath,
        operation: 'writeFile',
        errorCode: error.code,
        errorMessage: error.message,
      });
      throw new VectorStorageError(
        `Failed to save index metadata to ${this.metadataPath}: ${error.message}`,
        {
          code: error.code || 'SAVE_ERROR',
          filePath: this.metadataPath,
          operation: 'saveMetadata',
          cause: error,
        }
      );
    }
  }

  async loadMetadata(): Promise<IndexMetadata | null> {
    try {
      const content = await fs.readFile(this.metadataPath, 'utf-8');
      const metadata = safeJsonParse<IndexMetadata>(content) || null;
      
      if (metadata) {
        logger.debug('Loaded index metadata', {
          metadataPath: this.metadataPath,
          dimensions: metadata.dimensions,
          count: metadata.count,
        });
      }
      
      return metadata;
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'ENOENT') {
        logger.debug('No existing index metadata found', {
          metadataPath: this.metadataPath,
        });
        return null;
      }
      // Re-throw with proper error context
      // Requirements: 14.5 - Propagate errors to callers with try/catch
      logger.error('Failed to load index metadata', {
        metadataPath: this.metadataPath,
        operation: 'readFile',
        errorCode: error.code,
        errorMessage: error.message,
      });
      throw new VectorStorageError(
        `Failed to load index metadata from ${this.metadataPath}: ${error.message}`,
        {
          code: error.code || 'LOAD_ERROR',
          filePath: this.metadataPath,
          operation: 'loadMetadata',
          cause: error,
        }
      );
    }
  }

  async clear(): Promise<void> {
    const errors: Array<{ path: string; error: NodeJS.ErrnoException }> = [];
    
    // Clear index file
    try {
      await fs.unlink(this.indexPath);
      logger.debug('Cleared vector index file', {
        indexPath: this.indexPath,
      });
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code !== 'ENOENT') {
        errors.push({ path: this.indexPath, error });
      }
      // ENOENT is fine - file doesn't exist, nothing to clear
    }
    
    // Clear metadata file
    try {
      await fs.unlink(this.metadataPath);
      logger.debug('Cleared index metadata file', {
        metadataPath: this.metadataPath,
      });
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code !== 'ENOENT') {
        errors.push({ path: this.metadataPath, error });
      }
      // ENOENT is fine - file doesn't exist, nothing to clear
    }
    
    // If any errors occurred, throw with proper context
    // Requirements: 14.5 - Propagate errors to callers with try/catch
    if (errors.length > 0) {
      const firstError = errors[0];
      logger.error('Failed to clear vector storage', {
        indexPath: this.indexPath,
        metadataPath: this.metadataPath,
        operation: 'unlink',
        failedPaths: errors.map(e => e.path),
        errorCode: firstError.error.code,
        errorMessage: firstError.error.message,
      });
      throw new VectorStorageError(
        `Failed to clear vector storage: ${firstError.error.message}`,
        {
          code: firstError.error.code || 'CLEAR_ERROR',
          filePath: firstError.path,
          operation: 'clear',
          cause: firstError.error,
        }
      );
    }
  }
}
