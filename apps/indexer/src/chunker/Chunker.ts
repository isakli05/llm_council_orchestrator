import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import { FileMetadata } from '../scanner/Scanner';

export interface Chunk {
  id: string;
  filePath: string;
  relativePath: string;
  content: string;
  startLine: number;
  endLine: number;
  tokenCount: number;
  hash: string;
  metadata: {
    extension: string;
    chunkType: 'code' | 'text' | 'config';
    language?: string;
  };
}

export interface ChunkerConfig {
  maxTokens?: number;
  overlapTokens?: number;
}

export class Chunker {
  private maxTokens: number;
  private overlapTokens: number;

  constructor(config: ChunkerConfig = {}) {
    this.maxTokens = config.maxTokens || 512;
    this.overlapTokens = config.overlapTokens || 50;
  }

  async chunkFile(file: FileMetadata): Promise<Chunk[]> {
    try {
      const content = await fs.readFile(file.path, 'utf-8');
      return this.chunkContent(content, file);
    } catch (error) {
      console.warn(`Failed to read file for chunking: ${file.path}`, error);
      return [];
    }
  }

  async chunkFiles(files: FileMetadata[]): Promise<Chunk[]> {
    const allChunks: Chunk[] = [];
    
    for (const file of files) {
      const chunks = await this.chunkFile(file);
      allChunks.push(...chunks);
    }
    
    return allChunks;
  }

  private chunkContent(content: string, file: FileMetadata): Chunk[] {
    const chunks: Chunk[] = [];
    const lines = content.split('\n');
    const chunkType = this.determineChunkType(file.extension);
    const language = this.detectLanguage(file.extension);

    // For code files, try structure-aware chunking
    if (chunkType === 'code' && this.isStructuredLanguage(file.extension)) {
      const structuredChunks = this.structureAwareChunk(lines, file, chunkType, language);
      if (structuredChunks.length > 0) {
        return structuredChunks;
      }
    }

    // Fallback to simple line-based chunking
    return this.simpleLineChunk(lines, file, chunkType, language);
  }

  private simpleLineChunk(
    lines: string[],
    file: FileMetadata,
    chunkType: 'code' | 'text' | 'config',
    language?: string
  ): Chunk[] {
    const chunks: Chunk[] = [];
    let currentChunk: string[] = [];
    let currentTokens = 0;
    let startLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineTokens = this.estimateTokens(line);

      if (currentTokens + lineTokens > this.maxTokens && currentChunk.length > 0) {
        // Create chunk
        chunks.push(this.createChunk(
          currentChunk.join('\n'),
          file,
          startLine,
          i - 1,
          currentTokens,
          chunkType,
          language
        ));

        // Start new chunk with overlap
        const overlapLines = this.getOverlapLines(currentChunk);
        currentChunk = [...overlapLines, line];
        currentTokens = this.estimateTokens(currentChunk.join('\n'));
        startLine = i - overlapLines.length;
      } else {
        currentChunk.push(line);
        currentTokens += lineTokens;
      }
    }

    // Add remaining chunk
    if (currentChunk.length > 0) {
      chunks.push(this.createChunk(
        currentChunk.join('\n'),
        file,
        startLine,
        lines.length - 1,
        currentTokens,
        chunkType,
        language
      ));
    }

    return chunks;
  }

  private structureAwareChunk(
    lines: string[],
    file: FileMetadata,
    chunkType: 'code' | 'text' | 'config',
    language?: string
  ): Chunk[] {
    const chunks: Chunk[] = [];
    const blocks = this.detectCodeBlocks(lines);

    for (const block of blocks) {
      const blockLines = lines.slice(block.start, block.end + 1);
      const content = blockLines.join('\n');
      const tokens = this.estimateTokens(content);

      if (tokens <= this.maxTokens) {
        // Block fits in one chunk
        chunks.push(this.createChunk(
          content,
          file,
          block.start,
          block.end,
          tokens,
          chunkType,
          language
        ));
      } else {
        // Block too large, split it
        const subChunks = this.simpleLineChunk(blockLines, file, chunkType, language);
        chunks.push(...subChunks);
      }
    }

    return chunks;
  }

  private detectCodeBlocks(lines: string[]): Array<{ start: number; end: number; type: string }> {
    const blocks: Array<{ start: number; end: number; type: string }> = [];
    let currentBlock: { start: number; type: string } | null = null;
    let braceDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Detect function/class/method starts
      if (this.isBlockStart(line)) {
        if (currentBlock && braceDepth === 0) {
          blocks.push({ start: currentBlock.start, end: i - 1, type: currentBlock.type });
        }
        currentBlock = { start: i, type: 'block' };
      }

      // Track brace depth
      braceDepth += (line.match(/{/g) || []).length;
      braceDepth -= (line.match(/}/g) || []).length;

      // Close block when braces balance
      if (currentBlock && braceDepth === 0 && line.includes('}')) {
        blocks.push({ start: currentBlock.start, end: i, type: currentBlock.type });
        currentBlock = null;
      }
    }

    // Close any remaining block
    if (currentBlock) {
      blocks.push({ start: currentBlock.start, end: lines.length - 1, type: currentBlock.type });
    }

    return blocks.length > 0 ? blocks : [{ start: 0, end: lines.length - 1, type: 'file' }];
  }

  private isBlockStart(line: string): boolean {
    const patterns = [
      /^(export\s+)?(async\s+)?function\s+/,
      /^(export\s+)?(default\s+)?class\s+/,
      /^(public|private|protected)\s+(async\s+)?[\w<>]+\s+\w+\s*\(/,
      /^\s*(public|private|protected)?\s*\w+\s*\([^)]*\)\s*{/,
    ];
    return patterns.some(pattern => pattern.test(line));
  }

  private getOverlapLines(chunk: string[]): string[] {
    const overlapLineCount = Math.min(
      Math.ceil(this.overlapTokens / 10), // Rough estimate
      Math.floor(chunk.length / 4),
      chunk.length
    );
    return chunk.slice(-overlapLineCount);
  }

  private createChunk(
    content: string,
    file: FileMetadata,
    startLine: number,
    endLine: number,
    tokenCount: number,
    chunkType: 'code' | 'text' | 'config',
    language?: string
  ): Chunk {
    const hash = this.generateHash(content);
    const id = this.generateChunkId(file.relativePath, startLine, hash);

    return {
      id,
      filePath: file.path,
      relativePath: file.relativePath,
      content,
      startLine,
      endLine,
      tokenCount,
      hash,
      metadata: {
        extension: file.extension,
        chunkType,
        language,
      },
    };
  }

  private generateHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  private generateChunkId(relativePath: string, startLine: number, hash: string): string {
    return `${relativePath}:${startLine}:${hash}`;
  }

  private estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  private determineChunkType(extension: string): 'code' | 'text' | 'config' {
    const codeExtensions = ['.ts', '.js', '.tsx', '.jsx', '.php', '.py', '.java', '.go', '.rs', '.c', '.cpp', '.cs'];
    const configExtensions = ['.json', '.yaml', '.yml', '.toml', '.ini', '.env'];
    
    if (codeExtensions.includes(extension)) {
      return 'code';
    }
    if (configExtensions.includes(extension)) {
      return 'config';
    }
    return 'text';
  }

  private detectLanguage(extension: string): string | undefined {
    const languageMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.php': 'php',
      '.py': 'python',
      '.java': 'java',
      '.go': 'go',
      '.rs': 'rust',
      '.c': 'c',
      '.cpp': 'cpp',
      '.cs': 'csharp',
      '.rb': 'ruby',
      '.sql': 'sql',
    };
    return languageMap[extension];
  }

  private isStructuredLanguage(extension: string): boolean {
    const structured = ['.ts', '.tsx', '.js', '.jsx', '.php', '.py', '.java', '.go', '.rs', '.c', '.cpp', '.cs'];
    return structured.includes(extension);
  }
}
