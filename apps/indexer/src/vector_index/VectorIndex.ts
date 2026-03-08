import { Chunk } from '../chunker/Chunker';
import { EmbeddingResult } from '../embedding/EmbeddingEngine';
import { VectorStorage, StoredVector, IndexMetadata } from './storage';

export interface SearchResult {
  chunkId: string;
  score: number;
  chunk: Chunk;
}

export interface VectorIndexConfig {
  storagePath: string;
  dimensions: number;
}

export class VectorIndex {
  private storage: VectorStorage;
  private dimensions: number;
  private vectors: Map<string, StoredVector>;
  private chunks: Map<string, Chunk>;
  private isLoaded: boolean = false;

  constructor(config: VectorIndexConfig) {
    this.storage = new VectorStorage(config.storagePath);
    this.dimensions = config.dimensions;
    this.vectors = new Map();
    this.chunks = new Map();
  }

  async initialize(): Promise<void> {
    if (this.isLoaded) {
      return;
    }

    await this.load();
    this.isLoaded = true;
  }

  async addEmbeddings(embeddings: EmbeddingResult[], chunks: Chunk[]): Promise<void> {
    const chunkMap = new Map(chunks.map(c => [c.id, c]));

    for (const embedding of embeddings) {
      const chunk = chunkMap.get(embedding.chunkId);
      if (!chunk) {
        console.warn(`Chunk not found for embedding: ${embedding.chunkId}`);
        continue;
      }

      const storedVector: StoredVector = {
        id: embedding.chunkId,
        vector: embedding.embedding,
        metadata: {
          filePath: chunk.filePath,
          relativePath: chunk.relativePath,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          extension: chunk.metadata.extension,
          chunkType: chunk.metadata.chunkType,
          language: chunk.metadata.language,
        },
        content: chunk.content, // Store content for persistence
      };

      this.vectors.set(embedding.chunkId, storedVector);
      this.chunks.set(chunk.id, chunk);
    }
  }

  async search(queryEmbedding: number[], topK: number = 10): Promise<SearchResult[]> {
    if (!this.isLoaded) {
      await this.initialize();
    }

    const results: Array<{ chunkId: string; score: number }> = [];

    for (const [chunkId, storedVector] of this.vectors.entries()) {
      const score = this.cosineSimilarity(queryEmbedding, storedVector.vector);
      results.push({ chunkId, score });
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    // Take top K
    const topResults = results.slice(0, topK);

    // Map to SearchResult with chunk data
    return topResults
      .map(result => {
        const chunk = this.chunks.get(result.chunkId);
        if (!chunk) {
          return null;
        }
        return {
          chunkId: result.chunkId,
          score: result.score,
          chunk,
        };
      })
      .filter((result): result is SearchResult => result !== null);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vector dimensions must match');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  async save(): Promise<void> {
    const vectors = Array.from(this.vectors.values());
    await this.storage.saveVectors(vectors);

    const metadata: IndexMetadata = {
      dimensions: this.dimensions,
      count: this.vectors.size,
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.storage.saveMetadata(metadata);
  }

  async load(): Promise<void> {
    const vectors = await this.storage.loadVectors();
    
    this.vectors.clear();
    this.chunks.clear();

    for (const storedVector of vectors) {
      // Handle backward compatibility: metadata might be undefined in old format
      if (!storedVector.metadata) {
        console.warn(`Skipping vector ${storedVector.id}: missing metadata`);
        continue;
      }
      
      // Add to vectors map
      this.vectors.set(storedVector.id, storedVector);
      
      // Reconstruct chunk from stored vector with content
      const chunk: Chunk = {
        id: storedVector.id,
        filePath: storedVector.metadata.filePath,
        relativePath: storedVector.metadata.relativePath,
        content: storedVector.content || '', // Restore content from storage
        startLine: storedVector.metadata.startLine,
        endLine: storedVector.metadata.endLine,
        tokenCount: storedVector.content ? Math.ceil(storedVector.content.length / 4) : 0,
        hash: storedVector.id.split(':')[2] || '', // Extract hash from chunk ID
        metadata: {
          extension: storedVector.metadata.extension,
          chunkType: storedVector.metadata.chunkType,
          language: storedVector.metadata.language,
        },
      };
      
      this.chunks.set(storedVector.id, chunk);
    }
  }

  async clear(): Promise<void> {
    this.vectors.clear();
    this.chunks.clear();
    await this.storage.clear();
  }

  getStats(): { count: number; dimensions: number } {
    return {
      count: this.vectors.size,
      dimensions: this.dimensions,
    };
  }

  /**
   * Get chunks by file path
   */
  getByPath(path: string, limit: number = 10): StoredVector[] {
    const results: StoredVector[] = [];
    
    for (const vector of this.vectors.values()) {
      if (
        vector.metadata.filePath === path ||
        vector.metadata.filePath.includes(path) ||
        vector.metadata.relativePath === path ||
        vector.metadata.relativePath.includes(path)
      ) {
        results.push(vector);
        if (results.length >= limit) break;
      }
    }
    
    return results;
  }

  /**
   * Get all vectors (for internal use)
   */
  getAllVectors(): Map<string, StoredVector> {
    return this.vectors;
  }

  /**
   * Get all chunks (for internal use)
   */
  getAllChunks(): Map<string, Chunk> {
    return this.chunks;
  }

  hasChunk(chunkId: string): boolean {
    return this.vectors.has(chunkId);
  }

  async removeChunks(chunkIds: string[]): Promise<void> {
    for (const chunkId of chunkIds) {
      this.vectors.delete(chunkId);
      this.chunks.delete(chunkId);
    }
  }

  /**
   * Remove all chunks associated with specific file paths
   */
  async removeByFilePaths(relativePaths: string[]): Promise<number> {
    const pathSet = new Set(relativePaths);
    const chunksToRemove: string[] = [];

    // Find all chunks belonging to deleted files
    for (const [chunkId, vector] of this.vectors.entries()) {
      if (pathSet.has(vector.metadata.relativePath)) {
        chunksToRemove.push(chunkId);
      }
    }

    // Remove identified chunks
    if (chunksToRemove.length > 0) {
      await this.removeChunks(chunksToRemove);
    }
    
    return chunksToRemove.length;
  }
}
