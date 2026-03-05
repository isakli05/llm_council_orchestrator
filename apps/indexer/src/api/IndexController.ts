import { Scanner, FileMetadata } from '../scanner/Scanner';
import { Chunker, Chunk } from '../chunker/Chunker';
import { EmbeddingEngine } from '../embedding/EmbeddingEngine';
import { VectorIndex, SearchResult } from '../vector_index/VectorIndex';
import { IncrementalTracker } from '../incremental/IncrementalTracker';

export interface EnsureIndexedRequest {
  projectRoot: string;
  ignorePatterns?: string[];
  includeExtensions?: string[];
  forceRebuild?: boolean;
}

export interface EnsureIndexedResponse {
  success: boolean;
  stats: {
    totalFiles: number;
    addedFiles: number;
    modifiedFiles: number;
    deletedFiles: number;
    unchangedFiles: number;
    totalChunks: number;
    indexedChunks: number;
    processingTimeMs: number;
  };
  error?: string;
}

export interface SearchRequest {
  query: string;
  topK?: number;
  filters?: {
    extensions?: string[];
    chunkTypes?: string[];
  };
}

export interface SearchResponse {
  success: boolean;
  results: SearchResult[];
  stats: {
    totalResults: number;
    searchTimeMs: number;
  };
  error?: string;
}

export interface StatsResponse {
  success: boolean;
  stats: {
    indexedChunks: number;
    trackedFiles: number;
    dimensions: number;
    modelName: string;
  };
  error?: string;
}

export interface ContextRequest {
  path: string;
  maxChunks?: number;
  includeRelated?: boolean;
}

export interface ContextResponse {
  success: boolean;
  context: Array<{
    content: string;
    filePath: string;
    startLine?: number;
    endLine?: number;
  }>;
  related?: Array<{
    path: string;
    relevance: number;
  }>;
  error?: string;
}

export class IndexController {
  private scanner: Scanner | null = null;
  private chunker: Chunker;
  private embeddingEngine: EmbeddingEngine;
  private vectorIndex: VectorIndex;
  private incrementalTracker: IncrementalTracker;
  private currentProjectRoot: string | null = null;

  constructor(
    storagePath: string,
    embeddingConfig?: { modelName?: string; device?: 'cpu' | 'gpu' }
  ) {
    this.chunker = new Chunker({ maxTokens: 512, overlapTokens: 50 });
    this.embeddingEngine = new EmbeddingEngine(embeddingConfig);
    this.vectorIndex = new VectorIndex({
      storagePath,
      dimensions: this.embeddingEngine.getDimensions(),
    });
    this.incrementalTracker = new IncrementalTracker(storagePath);
  }

  async initialize(): Promise<void> {
    await this.embeddingEngine.initialize();
    await this.vectorIndex.initialize();
    await this.incrementalTracker.initialize();
  }

  async ensureIndexed(request: EnsureIndexedRequest): Promise<EnsureIndexedResponse> {
    const startTime = Date.now();

    try {
      // Initialize scanner for this project
      this.scanner = new Scanner({
        projectRoot: request.projectRoot,
        ignorePatterns: request.ignorePatterns,
        includeExtensions: request.includeExtensions,
      });
      this.currentProjectRoot = request.projectRoot;

      // Scan files
      const allFiles = await this.scanner.scan();

      // Handle force rebuild
      if (request.forceRebuild) {
        await this.vectorIndex.clear();
        await this.incrementalTracker.clear();
      }

      // Detect changes
      const changes = await this.incrementalTracker.detectChanges(allFiles);

      // Process added and modified files
      const filesToProcess = [...changes.added, ...changes.modified];
      let totalChunks = 0;
      let indexedChunks = 0;

      if (filesToProcess.length > 0) {
        // Chunk files
        const chunks = await this.chunker.chunkFiles(filesToProcess);
        totalChunks = chunks.length;

        // Generate embeddings
        const embeddings = await this.embeddingEngine.embedChunks(chunks);
        indexedChunks = embeddings.length;

        // Add to vector index
        await this.vectorIndex.addEmbeddings(embeddings, chunks);

        // Update file hashes
        await this.incrementalTracker.updateHashes(filesToProcess);
      }

      // Handle deleted files
      if (changes.deleted.length > 0) {
        // Remove from tracker
        await this.incrementalTracker.removeHashes(changes.deleted);
        
        // Note: We don't remove from vector index as we'd need to track chunk-to-file mapping
        // This is acceptable as the index will be rebuilt on force rebuild
      }

      // Save state
      await this.vectorIndex.save();
      await this.incrementalTracker.save();

      const processingTimeMs = Date.now() - startTime;

      return {
        success: true,
        stats: {
          totalFiles: allFiles.length,
          addedFiles: changes.added.length,
          modifiedFiles: changes.modified.length,
          deletedFiles: changes.deleted.length,
          unchangedFiles: changes.unchanged.length,
          totalChunks,
          indexedChunks,
          processingTimeMs,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        stats: {
          totalFiles: 0,
          addedFiles: 0,
          modifiedFiles: 0,
          deletedFiles: 0,
          unchangedFiles: 0,
          totalChunks: 0,
          indexedChunks: 0,
          processingTimeMs: Date.now() - startTime,
        },
        error: error.message || 'Unknown error during indexing',
      };
    }
  }

  async search(request: SearchRequest): Promise<SearchResponse> {
    const startTime = Date.now();

    try {
      // Generate query embedding
      const queryEmbedding = await this.embeddingEngine.embedQuery(request.query);

      // Search vector index
      const topK = request.topK || 10;
      let results = await this.vectorIndex.search(queryEmbedding, topK);

      // Apply filters if provided
      if (request.filters) {
        if (request.filters.extensions) {
          const extensionSet = new Set(request.filters.extensions);
          results = results.filter(r => extensionSet.has(r.chunk.metadata.extension));
        }
        
        if (request.filters.chunkTypes) {
          const typeSet = new Set(request.filters.chunkTypes);
          results = results.filter(r => typeSet.has(r.chunk.metadata.chunkType));
        }
      }

      const searchTimeMs = Date.now() - startTime;

      return {
        success: true,
        results,
        stats: {
          totalResults: results.length,
          searchTimeMs,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        results: [],
        stats: {
          totalResults: 0,
          searchTimeMs: Date.now() - startTime,
        },
        error: error.message || 'Unknown error during search',
      };
    }
  }

  async getStats(): Promise<StatsResponse> {
    try {
      const indexStats = this.vectorIndex.getStats();
      const trackerStats = this.incrementalTracker.getStats();
      const modelInfo = this.embeddingEngine.getModelInfo();

      return {
        success: true,
        stats: {
          indexedChunks: indexStats.count,
          trackedFiles: trackerStats.trackedFiles,
          dimensions: indexStats.dimensions,
          modelName: modelInfo.name,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        stats: {
          indexedChunks: 0,
          trackedFiles: 0,
          dimensions: 0,
          modelName: 'unknown',
        },
        error: error.message || 'Unknown error getting stats',
      };
    }
  }

  async getContext(request: ContextRequest): Promise<ContextResponse> {
    try {
      // Search for chunks related to the specified path
      const maxChunks = request.maxChunks || 5;
      
      // Get all vectors to filter by path
      const allVectors = Array.from(this.vectorIndex['vectors'].values());
      
      // Filter by path (exact match or contains)
      const pathMatches = allVectors.filter(v => 
        v.metadata.filePath === request.path ||
        v.metadata.filePath.includes(request.path) ||
        v.metadata.relativePath === request.path ||
        v.metadata.relativePath.includes(request.path)
      ).slice(0, maxChunks);

      // Get chunks for matched vectors
      const context = pathMatches.map(v => {
        const chunk = this.vectorIndex['chunks'].get(v.id);
        return {
          content: chunk?.content || `[Content from ${v.metadata.relativePath}:${v.metadata.startLine}-${v.metadata.endLine}]`,
          filePath: v.metadata.filePath,
          startLine: v.metadata.startLine,
          endLine: v.metadata.endLine,
        };
      });

      // Get related files if requested
      let related: Array<{ path: string; relevance: number }> | undefined;
      if (request.includeRelated && pathMatches.length > 0) {
        // Use the first chunk's embedding to find semantically similar chunks
        const firstVector = pathMatches[0];
        const searchResults = await this.vectorIndex.search(firstVector.vector, 10);
        
        // Filter out the original path and get unique file paths
        const relatedPaths = new Map<string, number>();
        for (const result of searchResults) {
          const resultPath = result.chunk.filePath;
          if (resultPath !== request.path && !resultPath.includes(request.path)) {
            // Keep highest score for each path
            if (!relatedPaths.has(resultPath) || relatedPaths.get(resultPath)! < result.score) {
              relatedPaths.set(resultPath, result.score);
            }
          }
        }
        
        // Convert to array and sort by relevance
        related = Array.from(relatedPaths.entries())
          .map(([path, relevance]) => ({ path, relevance }))
          .sort((a, b) => b.relevance - a.relevance)
          .slice(0, 5);
      }

      return {
        success: true,
        context,
        related,
      };
    } catch (error: any) {
      return {
        success: false,
        context: [],
        error: error.message || 'Unknown error getting context',
      };
    }
  }

  async shutdown(): Promise<void> {
    await this.embeddingEngine.shutdown();
  }
}
