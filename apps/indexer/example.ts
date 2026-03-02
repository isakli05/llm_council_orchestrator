/**
 * Example usage of the Indexer service
 * 
 * This demonstrates how to use the Indexer programmatically
 */

import Indexer from './src/main';
import { LogLevel } from '@llm/shared-config';
import { formatJson } from '@llm/shared-utils';

async function example() {
  // Create indexer instance
  const indexer = new Indexer({
    storagePath: './.indexer-data',
    modelName: 'bge-large',
    device: 'cpu',
    logLevel: LogLevel.INFO,
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

  console.log('Index Result:', formatJson(indexResult));

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

  console.log('Search Results:', formatJson(searchResult));

  // Example 3: Get indexer statistics
  console.log('\n=== Indexer Stats ===');
  const stats = await controller.getStats();
  console.log('Stats:', formatJson(stats));

  // Example 4: Get performance metrics
  console.log('\n=== Performance Metrics ===');
  const perfStats = indexer.getStats();
  console.log('Performance:', formatJson(perfStats));

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
