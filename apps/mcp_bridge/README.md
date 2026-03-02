# MCP Bridge

MCP (Model Context Protocol) adapter for LLM Council Orchestrator.

## Overview

The MCP Bridge exposes orchestrator pipeline capabilities to MCP-compatible AI coding assistants like Cursor, Claude Code, Cline, Kiro, and Continue.

## Architecture

- **Transport Layer** (`src/transport/`): MCP protocol implementation over stdio
- **Tool Layer** (`src/tools/`): MCP tool definitions and registration
- **Adapter Layer** (`src/adapter/`): Orchestrator API client
- **Observability** (`src/observability/`): Logging utilities

## Available Tools

1. **run_pipeline** - Execute orchestrator pipeline
2. **get_index_state** - Get codebase indexing status
3. **get_spec_files** - Retrieve generated specifications
4. **get_pipeline_progress** - Query pipeline execution progress
5. **abort_pipeline** - Cancel running pipeline

## Usage

```bash
# Install dependencies
pnpm install

# Start MCP server
pnpm start

# Development mode with auto-reload
pnpm dev
```

## Environment Variables

- `ORCHESTRATOR_URL` - Orchestrator endpoint (default: `http://localhost:3005`)
- `LOG_LEVEL` - Logging level: debug, info, warn, error (default: `info`)

## Configuration

MCP clients should configure this bridge in their MCP settings:

```json
{
  "mcpServers": {
    "llm-council": {
      "command": "node",
      "args": ["path/to/apps/mcp_bridge/src/server.ts"]
    }
  }
}
```
