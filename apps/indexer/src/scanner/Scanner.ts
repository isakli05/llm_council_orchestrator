import * as fs from 'fs/promises';
import * as path from 'path';
import { Stats } from 'fs';
import { logger } from '../observability/Logger';

/**
 * Error thrown when a file operation fails during scanning.
 * Provides context about the operation and file path.
 * 
 * Requirements: 14.5
 */
export class ScannerError extends Error {
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
    this.name = 'ScannerError';
    this.code = options.code;
    this.filePath = options.filePath;
    this.operation = options.operation;
    this.cause = options.cause;
  }
}

export interface FileMetadata {
  path: string;
  relativePath: string;
  extension: string;
  size: number;
  modifiedTime: Date;
  isDirectory: boolean;
}

export interface ScannerConfig {
  projectRoot: string;
  ignorePatterns?: string[];
  includeExtensions?: string[];
}

export class Scanner {
  private projectRoot: string;
  private ignorePatterns: RegExp[];
  private includeExtensions: Set<string> | null;

  constructor(config: ScannerConfig) {
    this.projectRoot = path.resolve(config.projectRoot);
    this.ignorePatterns = this.compileIgnorePatterns(config.ignorePatterns || this.getDefaultIgnorePatterns());
    this.includeExtensions = config.includeExtensions ? new Set(config.includeExtensions) : null;
  }

  private getDefaultIgnorePatterns(): string[] {
    return [
      'node_modules',
      'vendor',
      '.next',
      '.nuxt',
      'build',
      'dist',
      'out',
      'cache',
      '.cache',
      '.git',
      '.svn',
      '.hg',
      '__pycache__',
      '*.pyc',
      '.DS_Store',
      'Thumbs.db',
      '.env',
      '.env.local',
      '*.log',
      'coverage',
      '.nyc_output',
      '.pytest_cache',
      '.vscode',
      '.idea',
      '*.min.js',
      '*.min.css',
      '*.map',
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
    ];
  }

  private compileIgnorePatterns(patterns: string[]): RegExp[] {
    return patterns.map(pattern => {
      // Convert glob-like patterns to regex
      const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      return new RegExp(`(^|/)${regexPattern}(/|$)`);
    });
  }

  private shouldIgnore(relativePath: string): boolean {
    return this.ignorePatterns.some(pattern => pattern.test(relativePath));
  }

  private shouldInclude(filePath: string): boolean {
    if (!this.includeExtensions) {
      return true;
    }
    const ext = path.extname(filePath);
    return this.includeExtensions.has(ext);
  }

  async scan(): Promise<FileMetadata[]> {
    // Validate that project root exists and is accessible
    try {
      const stats = await fs.stat(this.projectRoot);
      if (!stats.isDirectory()) {
        throw new ScannerError(
          `Project root is not a directory: ${this.projectRoot}`,
          {
            code: 'INVALID_PROJECT_ROOT',
            filePath: this.projectRoot,
            operation: 'validate',
          }
        );
      }
    } catch (error: any) {
      if (error instanceof ScannerError) {
        throw error;
      }
      throw new ScannerError(
        `Project root does not exist or is not accessible: ${this.projectRoot}`,
        {
          code: 'PROJECT_ROOT_NOT_FOUND',
          filePath: this.projectRoot,
          operation: 'validate',
          cause: error,
        }
      );
    }

    const results: FileMetadata[] = [];
    await this.scanDirectory(this.projectRoot, '', results);
    return results;
  }

  private async scanDirectory(
    absolutePath: string,
    relativePath: string,
    results: FileMetadata[]
  ): Promise<void> {
    try {
      const entries = await fs.readdir(absolutePath, { withFileTypes: true });

      // Separate directories and files for parallel processing
      const directories: Array<{ absolute: string; relative: string }> = [];
      const fileEntries: Array<{ absolute: string; relative: string; name: string }> = [];

      for (const entry of entries) {
        const entryRelativePath = path.join(relativePath, entry.name);
        const entryAbsolutePath = path.join(absolutePath, entry.name);

        // Check ignore patterns
        if (this.shouldIgnore(entryRelativePath)) {
          continue;
        }

        if (entry.isDirectory()) {
          directories.push({ absolute: entryAbsolutePath, relative: entryRelativePath });
        } else if (entry.isFile()) {
          // Check extension filter
          if (!this.shouldInclude(entry.name)) {
            continue;
          }
          fileEntries.push({ absolute: entryAbsolutePath, relative: entryRelativePath, name: entry.name });
        }
      }

      // Process files in parallel using Promise.all
      const filePromises = fileEntries.map(async (file) => {
        try {
          const stats: Stats = await fs.stat(file.absolute);
          return {
            path: file.absolute,
            relativePath: file.relative,
            extension: path.extname(file.name),
            size: stats.size,
            modifiedTime: stats.mtime,
            isDirectory: false,
          } as FileMetadata;
        } catch (err) {
          // Log with proper error context and continue scanning
          // Requirements: 14.5 - Propagate errors with proper context
          const error = err as NodeJS.ErrnoException;
          logger.warn('Failed to stat file during scan', {
            filePath: file.absolute,
            relativePath: file.relative,
            operation: 'stat',
            errorCode: error.code,
            errorMessage: error.message,
          });
          return null;
        }
      });

      // Wait for all file stats to complete and filter out nulls
      const fileResults = await Promise.all(filePromises);
      for (const fileMetadata of fileResults) {
        if (fileMetadata !== null) {
          results.push(fileMetadata);
        }
      }

      // Process subdirectories in parallel using Promise.all
      await Promise.all(
        directories.map(dir => this.scanDirectory(dir.absolute, dir.relative, results))
      );
    } catch (err) {
      // Handle directory read errors gracefully with proper error context
      // Requirements: 14.5 - Add proper error context in catch blocks
      const error = err as NodeJS.ErrnoException;
      logger.warn('Failed to read directory during scan', {
        absolutePath,
        relativePath,
        operation: 'readdir',
        errorCode: error.code,
        errorMessage: error.message,
      });
      // Don't throw - continue scanning other directories
    }
  }

  async scanFile(filePath: string): Promise<FileMetadata | null> {
    // Define paths outside try block so they're accessible in catch
    const absolutePath = path.resolve(this.projectRoot, filePath);
    const relativePath = path.relative(this.projectRoot, absolutePath);
    
    try {
      if (this.shouldIgnore(relativePath)) {
        return null;
      }

      if (!this.shouldInclude(absolutePath)) {
        return null;
      }

      const stats = await fs.stat(absolutePath);
      
      if (!stats.isFile()) {
        return null;
      }

      return {
        path: absolutePath,
        relativePath,
        extension: path.extname(absolutePath),
        size: stats.size,
        modifiedTime: stats.mtime,
        isDirectory: false,
      };
    } catch (err) {
      // Log with proper error context
      // Requirements: 14.5 - Add proper error context in catch blocks
      const error = err as NodeJS.ErrnoException;
      logger.warn('Failed to scan individual file', {
        filePath,
        absolutePath,
        relativePath,
        operation: 'stat',
        errorCode: error.code,
        errorMessage: error.message,
      });
      return null;
    }
  }
}
