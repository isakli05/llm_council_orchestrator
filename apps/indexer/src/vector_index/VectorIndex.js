"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VectorIndex = void 0;
const storage_1 = require("./storage");
class VectorIndex {
    constructor(config) {
        this.isLoaded = false;
        this.storage = new storage_1.VectorStorage(config.storagePath);
        this.dimensions = config.dimensions;
        this.vectors = new Map();
        this.chunks = new Map();
    }
    async initialize() {
        if (this.isLoaded) {
            return;
        }
        await this.load();
        this.isLoaded = true;
    }
    async addEmbeddings(embeddings, chunks) {
        const chunkMap = new Map(chunks.map(c => [c.id, c]));
        for (const embedding of embeddings) {
            const chunk = chunkMap.get(embedding.chunkId);
            if (!chunk) {
                console.warn(`Chunk not found for embedding: ${embedding.chunkId}`);
                continue;
            }
            const storedVector = {
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
            };
            this.vectors.set(embedding.chunkId, storedVector);
            this.chunks.set(chunk.id, chunk);
        }
    }
    async search(queryEmbedding, topK = 10) {
        if (!this.isLoaded) {
            await this.initialize();
        }
        const results = [];
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
            .filter((result) => result !== null);
    }
    cosineSimilarity(a, b) {
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
    async save() {
        const vectors = Array.from(this.vectors.values());
        await this.storage.saveVectors(vectors);
        const metadata = {
            dimensions: this.dimensions,
            count: this.vectors.size,
            version: '1.0.0',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        await this.storage.saveMetadata(metadata);
    }
    async load() {
        const vectors = await this.storage.loadVectors();
        this.vectors.clear();
        this.chunks.clear();
        for (const storedVector of vectors) {
            this.vectors.set(storedVector.id, storedVector);
            // Reconstruct chunk from metadata
            const chunk = {
                id: storedVector.id,
                filePath: storedVector.metadata.filePath,
                relativePath: storedVector.metadata.relativePath,
                content: '', // Content not stored in index
                startLine: storedVector.metadata.startLine,
                endLine: storedVector.metadata.endLine,
                tokenCount: 0,
                hash: '',
                metadata: {
                    extension: storedVector.metadata.extension,
                    chunkType: storedVector.metadata.chunkType,
                    language: storedVector.metadata.language,
                },
            };
            this.chunks.set(storedVector.id, chunk);
        }
    }
    async clear() {
        this.vectors.clear();
        this.chunks.clear();
        await this.storage.clear();
    }
    getStats() {
        return {
            count: this.vectors.size,
            dimensions: this.dimensions,
        };
    }
    hasChunk(chunkId) {
        return this.vectors.has(chunkId);
    }
    async removeChunks(chunkIds) {
        for (const chunkId of chunkIds) {
            this.vectors.delete(chunkId);
            this.chunks.delete(chunkId);
        }
    }
}
exports.VectorIndex = VectorIndex;
