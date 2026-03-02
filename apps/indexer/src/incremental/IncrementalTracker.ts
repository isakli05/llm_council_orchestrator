import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import * as path from 'path';
import { formatJson, safeJsonParse } from '@llm/shared-utils';
import { FileMetadata } from '../scanner/Scanner';
import { logger } from '../observability/Logger';

/**
 * Error thrown when an incremental tracking operation fails.
 * Provides context about the operation and file path.
 * 
 * Requirements: 14.5
 */
export class IncrementalTrackerError extends Error {
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
    this.name = 'IncrementalTrackerError';
    this.code = options.code;
    this.filePath = options.filePath;
    this.operation = options.operation;
    this.cause = options.cause;
  }
}

export interface FileHash {
  relativePath: string;
  hash: string;
  modifiedTime: string;
  size: number;
}

export interface ChangeDetectionResult {
  added: FileMetadata[];
  modified: FileMetadata[];
  deleted: string[];
  unchanged: FileMetadata[];
}

export class IncrementalTracker {
  private storagePath: string;
  private hashStorePath: string;
  private fileHashes: Map<string, FileHash>;

  constructor(storagePath: string) {
    this.storagePath = storagePath;
    this.hashStorePath = path.join(storagePath, 'file_hashes.json');
    this.fileHashes = new Map();
  }

  async initialize(): Promise<void> {
    await this.load();
  }

  async detectChanges(currentFiles: FileMetadata[]): Promise<ChangeDetectionResult> {
    const result: ChangeDetectionResult = {
      added: [],
      modified: [],
      deleted: [],
      unchanged: [],
    };

    const currentPaths = new Set<string>();

    // Compute hashes for all files in parallel using Promise.all
    const fileHashResults = await Promise.all(
      currentFiles.map(async (file) => ({
        file,
        hash: await this.computeFileHash(file.path),
      }))
    );

    // Check each current file against stored hashes
    for (const { file, hash } of fileHashResults) {
      currentPaths.add(file.relativePath);
      const stored = this.fileHashes.get(file.relativePath);

      if (!stored) {
        // New file
        result.added.push(file);
      } else if (stored.hash !== hash || stored.size !== file.size) {
        // Modified file
        result.modified.push(file);
      } else {
        // Unchanged file
        result.unchanged.push(file);
      }
    }

    // Check for deleted files
    for (const [relativePath] of this.fileHashes) {
      if (!currentPaths.has(relativePath)) {
        result.deleted.push(relativePath);
      }
    }

    return result;
  }

  async updateHashes(files: FileMetadata[]): Promise<void> {
    // Compute all file hashes in parallel using Promise.all
    const hashResults = await Promise.all(
      files.map(async (file) => {
        const hash = await this.computeFileHash(file.path);
        return {
          relativePath: file.relativePath,
          hash,
          modifiedTime: file.modifiedTime.toISOString(),
          size: file.size,
        };
      })
    );
    
    // Update the hash map with all results
    for (const fileHash of hashResults) {
      this.fileHashes.set(fileHash.relativePath, fileHash);
    }
  }

  async removeHashes(relativePaths: string[]): Promise<void> {
    for (const relativePath of relativePaths) {
      this.fileHashes.delete(relativePath);
    }
  }

  private async computeFileHash(filePath: string): Promise<string> {
    try {
      const content = await fs.readFile(filePath);
      return crypto.createHash('sha256').update(content).digest('hex');
    } catch (err) {
      // Log with proper error context
      // Requirements: 14.5 - Add proper error context in catch blocks
      const error = err as NodeJS.ErrnoException;
      logger.warn('Failed to compute hash for file', {
        filePath,
        operation: 'readFile',
        errorCode: error.code,
        errorMessage: error.message,
      });
      return '';
    }
  }

  async save(): Promise<void> {
    try {
      const dir = path.dirname(this.hashStorePath);
      await fs.mkdir(dir, { recursive: true });

      const data = Array.from(this.fileHashes.values());
      await fs.writeFile(this.hashStorePath, formatJson(data), 'utf-8');
      
      logger.debug('Saved file hashes to storage', {
        hashStorePath: this.hashStorePath,
        fileCount: this.fileHashes.size,
      });
    } catch (err) {
      // Re-throw with proper error context
      // Requirements: 14.5 - Propagate errors to callers with try/catch
      const error = err as NodeJS.ErrnoException;
      logger.error('Failed to save file hashes', {
        hashStorePath: this.hashStorePath,
        operation: 'writeFile',
        errorCode: error.code,
        errorMessage: error.message,
      });
      throw new IncrementalTrackerError(
        `Failed to save file hashes to ${this.hashStorePath}: ${error.message}`,
        {
          code: error.code || 'SAVE_ERROR',
          filePath: this.hashStorePath,
          operation: 'save',
          cause: error,
        }
      );
    }
  }

  async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.hashStorePath, 'utf-8');
      const data = safeJsonParse<FileHash[]>(content, []) || [];
      
      this.fileHashes.clear();
      for (const fileHash of data) {
        this.fileHashes.set(fileHash.relativePath, fileHash);
      }
      
      logger.debug('Loaded file hashes from storage', {
        hashStorePath: this.hashStorePath,
        fileCount: this.fileHashes.size,
      });
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'ENOENT') {
        // No existing hash store, start fresh
        logger.debug('No existing hash store found, starting fresh', {
          hashStorePath: this.hashStorePath,
        });
        this.fileHashes.clear();
      } else {
        // Re-throw with proper error context
        // Requirements: 14.5 - Propagate errors to callers with try/catch
        logger.error('Failed to load file hashes', {
          hashStorePath: this.hashStorePath,
          operation: 'readFile',
          errorCode: error.code,
          errorMessage: error.message,
        });
        throw new IncrementalTrackerError(
          `Failed to load file hashes from ${this.hashStorePath}: ${error.message}`,
          {
            code: error.code || 'LOAD_ERROR',
            filePath: this.hashStorePath,
            operation: 'load',
            cause: error,
          }
        );
      }
    }
  }

  async clear(): Promise<void> {
    this.fileHashes.clear();
    try {
      await fs.unlink(this.hashStorePath);
      logger.debug('Cleared hash store', {
        hashStorePath: this.hashStorePath,
      });
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code !== 'ENOENT') {
        // Re-throw with proper error context
        // Requirements: 14.5 - Propagate errors to callers with try/catch
        logger.error('Failed to clear hash store', {
          hashStorePath: this.hashStorePath,
          operation: 'unlink',
          errorCode: error.code,
          errorMessage: error.message,
        });
        throw new IncrementalTrackerError(
          `Failed to clear hash store at ${this.hashStorePath}: ${error.message}`,
          {
            code: error.code || 'CLEAR_ERROR',
            filePath: this.hashStorePath,
            operation: 'clear',
            cause: error,
          }
        );
      }
      // ENOENT is fine - file doesn't exist, nothing to clear
    }
  }

  getStats(): { trackedFiles: number } {
    return {
      trackedFiles: this.fileHashes.size,
    };
  }

  hasFile(relativePath: string): boolean {
    return this.fileHashes.has(relativePath);
  }

  getFileHash(relativePath: string): FileHash | undefined {
    return this.fileHashes.get(relativePath);
  }
}
