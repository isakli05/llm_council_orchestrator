# Vector Storage Architecture Decision

## Status: ACTIVE
**Date:** 2026-03-07  
**Decision:** Local File-Based Vector Index

## Context

The indexer service was initially designed with references to Qdrant vector database in configuration, Docker Compose, and health checks. However, the actual implementation uses a local file-based vector index with in-memory cosine similarity search.

This architectural drift created confusion about:
- Which component is in the critical data path
- What dependencies are actually required for operation
- How to properly configure health/readiness checks
- Capacity planning and scaling expectations

## Decision

We have chosen to **formalize and document the local file-based vector index** as the production vector storage strategy for the following reasons:

### Rationale

1. **Simplicity**: The local index implementation is simpler, has no external dependencies, and is easier to deploy
2. **Performance**: For the expected scale (single project indexing), in-memory search is fast enough
3. **Portability**: File-based storage makes the index portable and easy to backup/restore
4. **Current Reality**: The implementation already works this way and has been tested
5. **Deployment Simplicity**: No need to manage a separate vector database service

### Trade-offs Accepted

1. **Scale Limitations**: In-memory index limits the total corpus size to available RAM
2. **No Distributed Search**: Cannot scale horizontally across multiple indexer instances
3. **Basic Search**: Only cosine similarity, no advanced filtering or hybrid search
4. **Persistence Model**: File-based persistence is simpler but less robust than a database

### When to Reconsider

This decision should be revisited if:
- Index size exceeds 1GB or 100K+ chunks
- Need for distributed/multi-tenant indexing emerges
- Advanced search features (hybrid search, filtering) are required
- High availability/replication becomes necessary

## Implementation

### Vector Storage: `VectorIndex.ts`

- **Storage Format**: JSONL files for vectors, JSON for metadata
- **Search Algorithm**: In-memory cosine similarity
- **Persistence**: File-based with incremental updates
- **Location**: Configurable via `INDEXER_STORAGE_PATH` (default: `.indexer/`)

### Dependencies

**Required:**
- Embedding server (for generating embeddings)

**Not Required:**
- Qdrant (removed from critical path)

### Health Checks

- **Liveness**: Process is running
- **Readiness**: Embedding server is reachable, controller is initialized

## Migration Path (Future)

If Qdrant integration is needed in the future:

1. Create `QdrantVectorIndex` implementing the same interface as `VectorIndex`
2. Add configuration flag to choose storage backend
3. Implement migration tool to export/import between backends
4. Update health checks to include Qdrant when it's the active backend

## References

- Implementation: `apps/indexer/src/vector_index/VectorIndex.ts`
- Storage: `apps/indexer/src/vector_index/storage.ts`
- Configuration: `apps/indexer/src/server.ts`
- Refactor Spec: `plans/critical_risk_refactors/06_indexer_qdrant_alignment.md`
