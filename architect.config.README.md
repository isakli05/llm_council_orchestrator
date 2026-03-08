# Architect Configuration Guide

This file documents the `architect.config.json` configuration structure.

## Configuration Sections

### Models

Defines model configurations for each role in the pipeline:
- `legacy_analysis`: Models for analyzing legacy code
- `architect`: Models for architectural decisions
- `migration`: Models for migration planning
- `security`: Models for security analysis
- `aggregator`: Single model for aggregating results

Each model configuration includes:
- `model`: Model identifier
- `provider`: Provider name (openai, anthropic, zai, gemini)
- `base_url`: Optional custom endpoint
- `thinking`: Optional thinking configuration
- `reasoning`: Optional reasoning effort configuration

### Providers

Provider endpoint configurations:
- `endpoint`: API endpoint URL
- `envKey`: Environment variable name for API key
- `timeout`: Request timeout in milliseconds

### Embedding

Embedding model configuration:
- `engine`: Model identifier
- `dimensions`: Vector dimensions (1024 for all models)
- `endpoint`: Embedding server URL
- `availableModels`: List of supported models with their specs

### Services

Service URLs and timeouts:
- `indexer`: Indexer service configuration
- `qdrant`: **Optional** - Qdrant URL (not currently used in data path)

> **Note on Qdrant:** The indexer currently uses local file-based vector storage. Qdrant configuration is preserved for future migration but is not in the critical data path. See `apps/indexer/VECTOR_STORAGE_ARCHITECTURE.md` for details.

### Defaults

Default timeout and retry settings:
- `modelCallTimeout`: Timeout for individual model calls
- `httpRequestTimeout`: Timeout for HTTP requests
- `maxRetries`: Maximum retry attempts
- `backoffBase`: Base delay for exponential backoff

## Environment Variable Overrides

Environment variables take precedence over config file values. See `.env.example` for the complete list of overridable settings.

## Configuration Priority

1. Environment variables (highest)
2. architect.config.json
3. Built-in defaults (lowest)
