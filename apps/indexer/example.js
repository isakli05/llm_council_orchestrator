"use strict";
/**
 * Example usage of the Indexer service
 *
 * This demonstrates how to use the Indexer programmatically
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const main_1 = __importDefault(require("./src/main"));
const Logger_1 = require("./src/observability/Logger");
async function example() {
    // Create indexer instance
    const indexer = new main_1.default({
        storagePath: './.indexer-data',
        modelName: 'bge-large',
        device: 'cpu',
        logLevel: Logger_1.LogLevel.INFO,
    });
    // Start the indexer
    await indexer.start();
    const controller = indexer.getController();
    // Example 1: Index a project
    console.log('\n=== Indexing Project ===');
    const indexResult = await controller.ensureIndexed({
        projectRoot: './src',
        ignorePatterns: ['node_modules', 'dist', '*.test.ts'],
        includeExtensions: ['.ts', '.js', '.json'],
        forceRebuild: false,
    });
    console.log('Index Result:', JSON.stringify(indexResult, null, 2));
    // Example 2: Perform semantic search
    console.log('\n=== Semantic Search ===');
    const searchResult = await controller.search({
        query: 'how to scan files and create chunks',
        topK: 5,
        filters: {
            extensions: ['.ts'],
            chunkTypes: ['code'],
        },
    });
    console.log('Search Results:', JSON.stringify(searchResult, null, 2));
    // Example 3: Get indexer statistics
    console.log('\n=== Indexer Stats ===');
    const stats = await controller.getStats();
    console.log('Stats:', JSON.stringify(stats, null, 2));
    // Example 4: Get performance metrics
    console.log('\n=== Performance Metrics ===');
    const perfStats = indexer.getStats();
    console.log('Performance:', JSON.stringify(perfStats, null, 2));
    // Shutdown
    await indexer.shutdown();
}
// Run example
if (require.main === module) {
    example().catch(error => {
        console.error('Example failed:', error);
        process.exit(1);
    });
}
