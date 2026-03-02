"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.statsCollector = exports.StatsCollector = void 0;
class StatsCollector {
    constructor() {
        this.indexingTimes = [];
        this.searchTimes = [];
        this.startTime = Date.now();
        this.stats = this.initializeStats();
    }
    initializeStats() {
        return {
            indexing: {
                totalIndexOperations: 0,
                totalFilesProcessed: 0,
                totalChunksCreated: 0,
                totalEmbeddingsGenerated: 0,
                averageIndexingTimeMs: 0,
                lastIndexedAt: null,
            },
            search: {
                totalSearches: 0,
                averageSearchTimeMs: 0,
                lastSearchAt: null,
            },
            storage: {
                indexedChunks: 0,
                trackedFiles: 0,
                indexSizeBytes: 0,
            },
            performance: {
                uptimeMs: 0,
                memoryUsageMB: 0,
            },
        };
    }
    recordIndexOperation(filesProcessed, chunksCreated, timeMs) {
        this.stats.indexing.totalIndexOperations++;
        this.stats.indexing.totalFilesProcessed += filesProcessed;
        this.stats.indexing.totalChunksCreated += chunksCreated;
        this.stats.indexing.totalEmbeddingsGenerated += chunksCreated;
        this.stats.indexing.lastIndexedAt = new Date().toISOString();
        this.indexingTimes.push(timeMs);
        if (this.indexingTimes.length > 100) {
            this.indexingTimes.shift();
        }
        this.stats.indexing.averageIndexingTimeMs =
            this.indexingTimes.reduce((sum, t) => sum + t, 0) / this.indexingTimes.length;
    }
    recordSearch(timeMs) {
        this.stats.search.totalSearches++;
        this.stats.search.lastSearchAt = new Date().toISOString();
        this.searchTimes.push(timeMs);
        if (this.searchTimes.length > 100) {
            this.searchTimes.shift();
        }
        this.stats.search.averageSearchTimeMs =
            this.searchTimes.reduce((sum, t) => sum + t, 0) / this.searchTimes.length;
    }
    updateStorageStats(indexedChunks, trackedFiles, indexSizeBytes) {
        this.stats.storage.indexedChunks = indexedChunks;
        this.stats.storage.trackedFiles = trackedFiles;
        this.stats.storage.indexSizeBytes = indexSizeBytes;
    }
    getStats() {
        // Update performance stats
        this.stats.performance.uptimeMs = Date.now() - this.startTime;
        this.stats.performance.memoryUsageMB = process.memoryUsage().heapUsed / 1024 / 1024;
        return { ...this.stats };
    }
    reset() {
        this.stats = this.initializeStats();
        this.indexingTimes = [];
        this.searchTimes = [];
    }
}
exports.StatsCollector = StatsCollector;
// Global stats collector
exports.statsCollector = new StatsCollector();
