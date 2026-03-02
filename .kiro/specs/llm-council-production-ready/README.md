# LLM Council Production-Ready Implementation Spec

## Overview

This specification defines the complete implementation roadmap for making the LLM Council Orchestrator production-ready. It combines urgent (P0) and medium-term (P1) actions into a unified plan that replaces placeholder implementations with fully functional components.

## Status

**Created:** December 13, 2025  
**Status:** Ready for Implementation  
**Estimated Timeline:** 3-4 weeks (full-time development)

## Scope

### What's Included

✅ **Model Gateway Infrastructure**
- OpenAI adapter (gpt-5.2, gpt-5.2-pro with reasoning)
- Anthropic adapter (claude-opus-4-5, claude-sonnet-4-5 with thinking)
- Z.AI adapter (glm-4.6 with thinking)
- Gemini adapter (gemini-3-pro with thinking)
- OpenRouter dual support for all providers

✅ **IndexClient HTTP Integration**
- Axios HTTP client for Orchestrator → Indexer communication
- Fastify REST API for Indexer service (port 9001)
- API key authentication
- Retry logic with exponential backoff

✅ **Embedding Model Flexibility**
- Support for BGE-Large, E5-Large, BGE-M3
- Environment variable configuration
- OpenAI-compatible HTTP client
- Dimension consistency (1024)

✅ **RoleManager Integration**
- ModelGateway dependency injection
- Real LLM execution (no placeholders)
- Dual-model support for architect and legacy_analysis roles
- Domain-specific context via RAG

✅ **Aggregator LLM-Based Synthesis**
- gpt-5.2-pro with reasoning effort xhigh
- Synthesis of multiple model outputs
- Fallback to concatenation on failure
- FinalArchitecturalReport generation

✅ **Security Hardening**
- Zod schema validation for all API endpoints
- Path sanitization and traversal prevention
- Input escaping for search queries
- Error sanitization (no stack traces in production)

✅ **Memory Leak Prevention**
- LRU cache for active runs (max 100)
- Scheduled cleanup (traces, cache, runs)
- Memory monitoring and aggressive cleanup
- Graceful shutdown support

✅ **Async Operations Refactor**
- All file I/O operations async (fs.promises)
- Parallel file operations with Promise.all
- Non-blocking event loop
- Proper error propagation

✅ **Configuration Management**
- Environment variable support
- architect.config.json with new model configs
- .env.example template
- docker-compose.yml for orchestration

### What's NOT Included

❌ Test implementation (marked as optional)
❌ VSCode extension UI changes
❌ Rate limiting (future enhancement)
❌ Database persistence (future enhancement)
❌ CI/CD pipeline (future enhancement)

## Model Configuration

The spec uses the following model configuration:

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
    "migration": [
      {
        "model": "gpt-5.2",
        "provider": "openai",
        "reasoning": { "effort": "high" }
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
  }
}
```

## Architecture

### Microservice Pattern

```
Orchestrator (7001) → HTTP → Indexer (9001) → HTTP → Embedding (8000) → gRPC → Qdrant (6333)
```

### Key Components

1. **ModelGateway**: Unified LLM provider interface
2. **Provider Adapters**: OpenAI, Anthropic, Z.AI, Gemini (official + OpenRouter)
3. **IndexClient**: HTTP client for indexer communication
4. **Indexer API**: Fastify REST API with authentication
5. **EmbeddingEngine**: Flexible model selection
6. **RoleManager**: Role-based analysis execution
7. **Aggregator**: LLM-powered synthesis
8. **Security Layer**: Input validation and sanitization
9. **Memory Manager**: LRU cache and cleanup

## Implementation Plan

### Phase 1: Foundation (Week 1)
- Setup infrastructure and configuration
- Implement ModelGateway core
- Implement OpenAI adapter
- Implement Anthropic adapter

### Phase 2: Providers (Week 2)
- Implement Z.AI adapter
- Implement Gemini adapter
- Implement OpenRouter dual support
- Checkpoint: Test all adapters

### Phase 3: Integration (Week 2-3)
- Implement IndexClient HTTP integration
- Implement Indexer REST API
- Implement embedding model flexibility
- Integrate RoleManager with ModelGateway
- Implement LLM-based Aggregator
- Checkpoint: Test end-to-end flow

### Phase 4: Hardening (Week 3-4)
- Implement security input validation
- Implement memory leak prevention
- Refactor to async operations
- Implement configuration management
- Final checkpoint: Full system test

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 8+
- Docker (for Embedding server and Qdrant)
- API keys for: OpenAI, Anthropic, Z.AI, Gemini, OpenRouter (optional)

### Environment Setup

1. Copy `.env.example` to `.env`
2. Fill in API keys
3. Start Docker services: `docker-compose up -d`
4. Install dependencies: `pnpm install`
5. Build: `pnpm build`
6. Start Indexer: `cd apps/indexer && pnpm start`
7. Start Orchestrator: `cd apps/orchestrator && pnpm start`

### Execution

To start implementing this spec:

1. Open `.kiro/specs/llm-council-production-ready/tasks.md`
2. Click "Start task" next to task 1
3. Follow the implementation plan sequentially
4. Run checkpoints to validate progress

## Files

- `requirements.md` - 15 requirements with acceptance criteria
- `design.md` - Architecture, components, data models, correctness properties
- `tasks.md` - 19 tasks with 80+ sub-tasks
- `README.md` - This file

## Success Criteria

The implementation is complete when:

✅ All 5 provider adapters are functional (official + OpenRouter)
✅ Orchestrator communicates with Indexer via HTTP
✅ Indexer exposes Fastify API on port 9001
✅ Embedding model can be switched via environment variable
✅ RoleManager executes roles with real LLM calls
✅ Aggregator synthesizes outputs using gpt-5.2-pro
✅ All API endpoints have input validation
✅ Memory leaks are prevented with LRU cache and cleanup
✅ All file I/O operations are async
✅ Configuration is managed via environment variables
✅ All checkpoints pass

## Notes

- **Thinking Mode**: All models support thinking mode (native or prompt-based)
- **OpenRouter**: Dual support allows users to choose official or OpenRouter per model
- **Embedding**: Default is local-bge-large-v1.5, switchable to E5-Large or BGE-M3
- **Port 9001**: Indexer API runs on port 9001 (not 3001)
- **API Key**: Simple API key authentication for Indexer (INDEXER_API_KEY)
- **No Tests**: Test tasks are marked as optional for faster MVP
- **No Auto-Fallback**: OpenRouter is manual selection, not automatic fallback

## Contact

For questions or clarifications during implementation, refer to:
- Requirements document for acceptance criteria
- Design document for architecture details
- Tasks document for step-by-step implementation

---

**Ready to implement!** Start with task 1 in `tasks.md`.
