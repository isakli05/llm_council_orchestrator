"use strict";
/**
 * MCP Tool definitions and types
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOOL_DEFINITIONS = void 0;
exports.TOOL_DEFINITIONS = [
    {
        name: "run_pipeline",
        description: "Execute an orchestrator pipeline with specified mode and prompt",
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
                modelsOverride: {
                    type: "object",
                    description: "Optional model overrides",
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
