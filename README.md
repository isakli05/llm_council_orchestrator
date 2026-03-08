# LLM Council Orchestrator Monorepo

[![CI](https://github.com/isakli05/llm_council_orchestrator/actions/workflows/ci.yml/badge.svg)](https://github.com/isakli05/llm_council_orchestrator/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/pnpm-workspace-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Repo Visibility](https://img.shields.io/badge/visibility-public-blue)](https://github.com/isakli05/llm_council_orchestrator)

A multi-model LLM orchestration system that coordinates multiple AI providers (OpenAI, Anthropic, Z.AI, Gemini) for comprehensive code analysis and architectural recommendations.

## Highlights

- Multi-provider orchestration with configurable model routing and aggregation.
- Domain-oriented pipeline architecture (discovery, indexing, role-based analysis, synthesis).
- Monorepo structure with reusable shared packages for types, config loading, and utilities.
- Docker Compose deployment for local or production-like environments.

## Architecture

This monorepo consists of three main applications:
- **Orchestrator** (apps/orchestrator) - Main service for LLM coordination and pipeline execution (port 7001)
- **Indexer** (apps/indexer) - Code indexing and semantic search service (port 9001)
- **MCP Bridge** (apps/mcp_bridge) - Model Context Protocol interface for VSCode extension

And three shared packages:
- packages/shared-types
- packages/shared-utils
- packages/shared-config

## Workspace Layout

```text
apps/
  docs/          # Architecture and service design references
  orchestrator/  # Main orchestration API and pipeline engine
  indexer/       # Indexing and semantic search service
  mcp_bridge/    # MCP server bridge for editor integrations
packages/
  shared-types/  # Shared type contracts
  shared-utils/  # Shared utilities
  shared-config/ # Layered config loading and validation
```

## Quick Start

1. Clone and install dependencies:
   ```bash
   cd llm_council_orchestrator
   pnpm install
   ```

2. Copy and configure environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

3. Start services with Docker Compose:
   ```bash
   docker compose up -d
   ```

### Useful Commands

```bash
pnpm dev            # Run workspace dev scripts in parallel
pnpm build          # Build all packages/apps
pnpm test           # Run test suite
pnpm test:coverage  # Run tests with coverage
```

## Configuration

The LLM Council system uses a layered configuration approach with environment variables taking precedence over config files.

### Configuration Priority

Configuration values are resolved in the following order (highest to lowest priority):

1. **Environment variables** - Set in `.env` file or shell
2. **architect.config.json** - JSON configuration file
3. **Default values** - Built-in defaults

> **Important:** Configuration changes require a service restart. Hot reload is not supported.

### Environment Variables

Copy `.env.example` to `.env` and configure the following variables:

#### LLM Provider API Keys

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key for gpt-5.2, gpt-5.2-pro models |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for claude-opus-4-5, claude-sonnet-4-5 |
| `ZAI_API_KEY` | No | Z.AI API key for glm-4.6 models |
| `GEMINI_API_KEY` | No | Google Gemini API key for gemini-3-pro |
| `OPENROUTER_API_KEY` | No | OpenRouter API key for alternative routing |

#### Service Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ORCH_PORT` | 7001 | Orchestrator API port |
| `ORCH_HOST` | 127.0.0.1 | Orchestrator API host |
| `ORCH_LOG_LEVEL` | info | Log level (debug, info, warn, error) |
| `ORCH_CONFIG_PATH` | ./architect.config.json | Path to config file |
| `INDEXER_URL` | http://localhost:9001 | Indexer service URL |
| `INDEXER_API_KEY` | - | **Required** - API key for indexer authentication |
| `INDEXER_PORT` | 9001 | Indexer service port |
| `INDEXER_HOST` | 0.0.0.0 | Indexer service host |

#### Embedding Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `EMBEDDING_URL` | http://localhost:8000 | Embedding server URL |
| `EMBEDDING_MODEL` | local-bge-large-v1.5 | Embedding model to use |

Available embedding models (all use 1024 dimensions):
- `local-bge-large-v1.5` - Default, good general performance
- `multilingual-e5-large-instruct` - Better for multilingual codebases
- `bge-m3` - Extended context (8192 tokens)

#### Vector Storage

The indexer uses **local file-based vector storage** with in-memory cosine similarity search. This provides:
- Simple deployment with no external database dependencies
- Fast search for typical project sizes
- Portable index files for easy backup/restore

See `apps/indexer/VECTOR_STORAGE_ARCHITECTURE.md` for details.

**Optional Qdrant Integration:**

| Variable | Default | Description |
|----------|---------|-------------|
| `QDRANT_URL` | http://localhost:6333 | Qdrant URL (optional, not currently used) |

> **Note:** Qdrant is included in docker-compose for future migration but is not in the critical data path. To start Qdrant: `docker compose --profile qdrant up`

#### Runtime Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | development | Environment (development, production, test) |
| `LOG_LEVEL` | info | Global log level |

> **Security Note:** In production (`NODE_ENV=production`), stack traces are stripped from API error responses.

### Configuration File (architect.config.json)

The `architect.config.json` file defines model configurations, provider endpoints, and service settings.

#### Example Configuration

```json
{
  "models": {
    "legacy_analysis": [
      {
        "model": "glm-4.6",
        "provider": "zai",
        "base_url": "https://api.z.ai/api/coding/paas/v4",
        "thinking": { "type": "enabled" }
      },
      {
        "model": "gpt-5.2",
        "provider": "openai",
        "reasoning": { "effort": "high" }
      }
    ],
    "architect": [
      {
        "model": "gpt-5.2",
        "provider": "openai",
        "reasoning": { "effort": "high" }
      },
      {
        "model": "claude-opus-4-5",
        "provider": "anthropic",
        "thinking": { "type": "enabled", "budget_tokens": 4096 }
      }
    ],
    "security": [
      {
        "model": "claude-sonnet-4-5",
        "provider": "anthropic",
        "thinking": { "type": "enabled", "budget_tokens": 2048 }
      }
    ],
    "aggregator": {
      "model": "gpt-5.2-pro",
      "provider": "openai",
      "reasoning": { "effort": "xhigh" }
    }
  },
  "providers": {
    "openai": {
      "endpoint": "https://api.openai.com/v1/chat/completions",
      "envKey": "OPENAI_API_KEY"
    },
    "anthropic": {
      "endpoint": "https://api.anthropic.com/v1/messages",
      "envKey": "ANTHROPIC_API_KEY"
    }
  },
  "embedding": {
    "engine": "local-bge-large-v1.5",
    "dimensions": 1024,
    "endpoint": "http://localhost:8000/embeddings"
  },
  "services": {
    "indexer": { "url": "http://localhost:9001", "timeout": 60000 },
    "qdrant": { "url": "http://localhost:6333" }
  },
  "defaults": {
    "modelCallTimeout": 30000,
    "httpRequestTimeout": 120000,
    "maxRetries": 3,
    "backoffBase": 1000
  }
}
```

#### Model Configuration Options

| Field | Description |
|-------|-------------|
| `model` | Model identifier (e.g., "gpt-5.2", "claude-opus-4-5") |
| `provider` | Provider type: openai, anthropic, zai, gemini, or *-openrouter variants |
| `base_url` | Custom API endpoint (optional) |
| `thinking.type` | Enable thinking mode: "enabled" or "disabled" |
| `thinking.budget_tokens` | Max thinking tokens (Anthropic) |
| `reasoning.effort` | Reasoning effort: "low", "medium", "high", "xhigh" (OpenAI) |

#### Using OpenRouter

To use OpenRouter as an alternative provider, append `-openrouter` to the provider name:

```json
{
  "model": "gpt-5.2",
  "provider": "openai-openrouter"
}
```

Set `OPENROUTER_API_KEY` and optionally `OPENROUTER_REFERER` and `OPENROUTER_TITLE` headers.

### Docker Compose Deployment

For containerized deployment, use `docker-compose.yml`:

```bash
# Start all services
docker compose up -d

# Start with MCP Bridge (for VSCode extension)
docker compose --profile mcp up -d

# View logs
docker compose logs -f orchestrator

# Stop services
docker compose down
```

#### Service URLs in Docker

When running in Docker, services communicate using container names:

| Service | Internal URL | External URL | Status |
|---------|--------------|--------------|--------|
| Orchestrator | http://orchestrator:7001 | http://localhost:7001 | Required |
| Indexer | http://indexer:9001 | http://localhost:9001 | Required |
| Embedding | http://embedding:80 | http://localhost:8000 | Required |
| Qdrant | http://qdrant:6333 | http://localhost:6333 | Optional (not in data path) |

#### Production Configuration

For production, create `architect.config.production.json` and mount it as a volume:

```yaml
volumes:
  - ./architect.config.production.json:/app/architect.config.json:ro
```

### Configuration Validation

On startup, the system validates:
- JSON syntax of config files
- Required API keys for active providers
- Model names exist for configured providers

If validation fails, the service will not start and will log a clear error message.

### Memory Management

The system includes automatic memory management (not configurable via environment):
- Trace cleanup: every 15 minutes (keeps last 100)
- Cache cleanup: every 15 minutes (removes expired entries)
- Active runs cleanup: every 1 hour
- Memory monitoring: every 5 minutes
- Aggressive cleanup triggered at 80% heap usage

## Development

### Local Development Setup

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Start infrastructure services:
   ```bash
   docker compose up -d embedding
   ```
   
   Optional: Start Qdrant (not required for basic operation):
   ```bash
   docker compose --profile qdrant up -d
   ```

3. Run services in development mode:
   ```bash
   # Terminal 1: Indexer
   cd apps/indexer && pnpm dev

   # Terminal 2: Orchestrator
   cd apps/orchestrator && pnpm dev
   ```

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run specific test file
pnpm test apps/orchestrator/src/__tests__/PipelineEngine.test.ts
```

## API Documentation

### API Versioning

All API endpoints are prefixed with `/api/v1/` for versioning support (Requirements: 23.1).

**Orchestrator Endpoints (port 7001):**
- `POST /api/v1/pipeline/run` - Start a new pipeline
- `GET /api/v1/pipeline/status/:run_id` - Get pipeline status
- `GET /api/v1/pipeline/result/:run_id` - Get pipeline result
- `GET /api/v1/pipeline/progress/:run_id` - Get pipeline progress
- `POST /api/v1/index/ensure` - Ensure index is ready
- `GET /api/v1/index/status` - Get index status
- `GET /api/v1/spec/project_context` - Get project context spec
- `GET /api/v1/spec/modules` - Get module specs

**Indexer Endpoints (port 9001):**
- `POST /api/v1/index/ensure` - Trigger indexing
- `POST /api/v1/search` - Semantic search
- `GET /health` - Health check (not versioned)

**Health Check Endpoints (not versioned):**
- `GET /health` - Overall health status
- `GET /health/live` - Liveness probe
- `GET /health/ready` - Readiness probe

See individual service documentation:
- [Orchestrator Design](apps/docs/ORCHESTRATOR_DESIGN.md)
- [Indexer Design](apps/docs/INDEXER_DESIGN.md)
- [Pipeline Engine](apps/docs/PIPELINE_ENGINE.md)
- [MCP Bridge Guide](apps/docs/MCP_BRIDGE_GUIDE.md)
