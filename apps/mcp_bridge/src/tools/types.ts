/**
 * MCP Tool definitions and types
 */

import { MCPToolDefinition } from "../types/mcp";

export const TOOL_DEFINITIONS: MCPToolDefinition[] = [
  {
    name: "run_pipeline",
    description: "Execute an orchestrator pipeline with specified mode and prompt. Supports domain exclusions for RAA (Retrieval-Augmented Analysis) to skip analysis of specific architectural domains.",
    inputSchema: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          description: "Pipeline mode (e.g., 'legacy_analysis', 'architect', 'migration')",
        },
        prompt: {
          type: "string",
          description: "User prompt for the pipeline",
        },
        projectRoot: {
          type: "string",
          description: "Optional project root directory path (defaults to current working directory)",
        },
        forceReindex: {
          type: "boolean",
          description: "Optional flag to force reindexing of the codebase (defaults to false)",
        },
        roleConfigs: {
          type: "object",
          description: "Optional role-specific configuration overrides",
        },
        modelsOverride: {
          type: "object",
          description: "Optional model overrides for specific roles",
        },
        domainExclusions: {
          type: "array",
          description: "Optional list of domains to exclude from analysis. Each exclusion must include a domainId and justification.",
          items: {
            type: "object",
            properties: {
              domainId: {
                type: "string",
                description: "Unique identifier of the domain to exclude (e.g., 'admin_domain', 'payment_domain')",
              },
              justification: {
                type: "string",
                description: "Required justification for excluding this domain from analysis",
              },
            },
            required: ["domainId", "justification"],
          },
        },
      },
      required: ["mode", "prompt"],
    },
  },
  {
    name: "get_index_state",
    description: "Get the current indexing state of the codebase",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_spec_files",
    description: "Retrieve generated specification files from orchestrator",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_pipeline_progress",
    description: "Get the progress of a running or completed pipeline",
    inputSchema: {
      type: "object",
      properties: {
        runId: {
          type: "string",
          description: "Optional run ID to query specific pipeline execution",
        },
      },
    },
  },
  {
    name: "abort_pipeline",
    description: "Abort a currently running pipeline",
    inputSchema: {
      type: "object",
      properties: {
        runId: {
          type: "string",
          description: "Run ID of the pipeline to abort",
        },
      },
      required: ["runId"],
    },
  },
];
