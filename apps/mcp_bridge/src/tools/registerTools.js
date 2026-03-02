"use strict";
/**
 * Tool registration and execution handler
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolRegistry = void 0;
const Logger_1 = require("../observability/Logger");
const OrchestratorAdapter_1 = require("../adapter/OrchestratorAdapter");
const types_1 = require("./types");
class ToolRegistry {
    constructor(orchestratorUrl) {
        this.adapter = new OrchestratorAdapter_1.OrchestratorAdapter(orchestratorUrl);
    }
    /**
     * Get all tool definitions
     */
    getToolDefinitions() {
        return types_1.TOOL_DEFINITIONS;
    }
    /**
     * Execute a tool by name
     */
    async executeTool(name, params) {
        Logger_1.logger.info("Executing tool", { name, params });
        try {
            switch (name) {
                case "run_pipeline":
                    return await this.handleRunPipeline(params);
                case "get_index_state":
                    return await this.handleGetIndexState();
                case "get_spec_files":
                    return await this.handleGetSpecFiles();
                case "get_pipeline_progress":
                    return await this.handleGetPipelineProgress(params);
                case "abort_pipeline":
                    return await this.handleAbortPipeline(params);
                default:
                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify({ error: `Unknown tool: ${name}` }),
                            },
                        ],
                        isError: true,
                    };
            }
        }
        catch (err) {
            const error = err;
            Logger_1.logger.error("Tool execution failed", { name, error: error.message });
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({ error: error.message }),
                    },
                ],
                isError: true,
            };
        }
    }
    async handleRunPipeline(params) {
        const { mode, prompt, modelsOverride } = params;
        if (!mode || typeof mode !== "string") {
            throw new Error("Missing or invalid 'mode' parameter");
        }
        if (!prompt || typeof prompt !== "string") {
            throw new Error("Missing or invalid 'prompt' parameter");
        }
        const result = await this.adapter.runPipeline({
            mode,
            prompt,
            modelsOverride: modelsOverride,
        });
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2),
                },
            ],
            isError: !result.success,
        };
    }
    async handleGetIndexState() {
        const result = await this.adapter.getIndexState();
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2),
                },
            ],
            isError: !!result.error,
        };
    }
    async handleGetSpecFiles() {
        const result = await this.adapter.getSpecFiles();
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2),
                },
            ],
        };
    }
    async handleGetPipelineProgress(params) {
        const { runId } = params;
        const result = await this.adapter.getPipelineProgress(runId ? String(runId) : undefined);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2),
                },
            ],
        };
    }
    async handleAbortPipeline(params) {
        const { runId } = params;
        if (!runId || typeof runId !== "string") {
            throw new Error("Missing or invalid 'runId' parameter");
        }
        const result = await this.adapter.abortPipeline(runId);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2),
                },
            ],
            isError: !result.success,
        };
    }
}
exports.ToolRegistry = ToolRegistry;
