"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IndexController = void 0;
const Scanner_1 = require("../scanner/Scanner");
const Chunker_1 = require("../chunker/Chunker");
const EmbeddingEngine_1 = require("../embedding/EmbeddingEngine");
const VectorIndex_1 = require("../vector_index/VectorIndex");
const IncrementalTracker_1 = require("../incremental/IncrementalTracker");
class IndexController {
    constructor(storagePath, embeddingConfig) {
        this.scanner = null;
        this.currentProjectRoot = null;
        this.chunker = new Chunker_1.Chunker({ maxTokens: 512, overlapTokens: 50 });
        this.embeddingEngine = new EmbeddingEngine_1.EmbeddingEngine(embeddingConfig);
        this.vectorIndex = new VectorIndex_1.VectorIndex({
            storagePath,
            dimensions: this.embeddingEngine.getDimensions(),
        });
        this.incrementalTracker = new IncrementalTracker_1.IncrementalTracker(storagePath);
    }
    async initialize() {
        await this.embeddingEngine.initialize();
        await this.vectorIndex.initialize();
        await this.incrementalTracker.initialize();
    }
    async ensureIndexed(request) {
        const startTime = Date.now();
        try {
            // Initialize scanner for this project
            this.scanner = new Scanner_1.Scanner({
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
        }
        catch (error) {
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
    async search(request) {
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
        }
        catch (error) {
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
    async getStats() {
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
        }
        catch (error) {
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
    async shutdown() {
        await this.embeddingEngine.shutdown();
    }
}
exports.IndexController = IndexController;
