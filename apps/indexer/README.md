# LLM Council Indexer

A standalone service that scans project files, chunks source code, generates local embeddings, maintains a vector index, and provides semantic search APIs.

## Architecture

The Indexer is built with 7 core modules:

### 1. Scanner Module (`src/scanner/`)
- Scans project directory tree
- Applies ignore patterns (node_modules, vendor, build, etc.)
- Collects file metadata (path, size, modified time)
- Supports extension filtering

### 2. Chunker Module (`src/chunker/`)
- Splits files into semantic chunks
- Structure-aware chunking for code (function/class boundaries)
- Configurable token limits with overlap
- Generates stable chunk hashes

### 3. Embedding Module (`src/embedding/`)
- Local embedding generation (CPU/GPU)
- Supports multiple models (bge-large, bge-m3, e5-large)
- Batch processing for efficiency
- No remote API calls

### 4. Vector Index Module (`src/vector_index/`)
- In-memory vector storage with disk persistence
- Cosine similarity search
- Incremental updates
- JSONL-based storage format

### 5. Incremental Tracker Module (`src/incremental/`)
- SHA-256 file hash tracking
- Detects added, modified, deleted files
- Avoids reprocessing unchanged files
- Persistent hash store

### 6. API Module (`src/api/`)
- `ensureIndexed()` - Index or update project
- `search()` - Semantic search with filters
- `getStats()` - Index statistics

### 7. Observability Module (`src/observability/`)
- Structured logging with levels
- Performance metrics collection
- Index statistics tracking

## Usage

### Programmatic API

```typescript
import Indexer from '@llm/indexer';

const indexer = new Indexer({
  storagePath: './.indexer-data',
  modelName: 'bge-large',
  device: 'cpu',
});

await indexer.start();
const controller = indexer.getController();

// Index a project
const result = await controller.ensureIndexed({
  projectRoot: './src',
  ignorePatterns: ['node_modules', 'dist'],
  includeExtensions: ['.ts', '.js'],
});

// Search
const searchResult = await controller.search({
  query: 'authentication logic',
  topK: 10,
});

await indexer.shutdown();
```

### Environment Variables

- `INDEXER_STORAGE_PATH` - Storage directory (default: `.indexer`)
- `INDEXER_MODEL_NAME` - Embedding model (default: `bge-large`)
- `INDEXER_DEVICE` - Device type: `cpu` or `gpu` (default: `cpu`)
- `LOG_LEVEL` - Log level: `DEBUG`, `INFO`, `WARN`, `ERROR` (default: `INFO`)

## File Structure

```
apps/indexer/
├── src/
│   ├── api/
│   │   └── IndexController.ts      # Main API interface
│   ├── scanner/
│   │   └── Scanner.ts              # File system scanning
│   ├── chunker/
│   │   └── Chunker.ts              # Code chunking
│   ├── embedding/
│   │   ├── EmbeddingEngine.ts      # Embedding generation
│   │   └── model_config.ts         # Model configurations
│   ├── vector_index/
│   │   ├── VectorIndex.ts          # Vector search
│   │   └── storage.ts              # Persistence layer
│   ├── incremental/
│   │   └── IncrementalTracker.ts   # Change detection
│   ├── observability/
│   │   ├── Logger.ts               # Structured logging
│   │   └── Stats.ts                # Metrics collection
│   └── main.ts                     # Entry point
├── example.ts                      # Usage examples
└── package.json
```

## Features

- **Incremental Indexing**: Only processes changed files
- **Structure-Aware Chunking**: Respects code boundaries (functions, classes)
- **Local Embeddings**: No external API dependencies
- **Persistent Storage**: JSONL format for forward compatibility
- **Fast Search**: In-memory cosine similarity search
- **Comprehensive Logging**: Structured logs with context
- **Performance Metrics**: Track indexing and search performance

## Constraints

- All embedding operations are local (no remote APIs)
- Index format is forward-compatible
- All operations are async/non-blocking
- Handles large projects efficiently with incremental updates

## Development

See `development_specs/` for detailed module specifications.
