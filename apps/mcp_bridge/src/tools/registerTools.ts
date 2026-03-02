/**
 * Tool registration and execution handler
 */

import { formatJson, validateDomainExclusion, DomainExclusionInput } from "@llm/shared-utils";
import { logger } from "../observability/Logger";
import { OrchestratorAdapter } from "../adapter/OrchestratorAdapter";
import { MCPToolResult } from "../types/mcp";
import { TOOL_DEFINITIONS } from "./types";

export class ToolRegistry {
  private adapter: OrchestratorAdapter;

  constructor(orchestratorUrl?: string) {
    this.adapter = new OrchestratorAdapter(orchestratorUrl);
  }

  /**
   * Get all tool definitions
   */
  getToolDefinitions() {
    return TOOL_DEFINITIONS;
  }

  /**
   * Execute a tool by name
   */
  async executeTool(name: string, params: Record<string, unknown>): Promise<MCPToolResult> {
    logger.info("Executing tool", { name, params });

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
                text: formatJson({ error: `Unknown tool: ${name}` }),
              },
            ],
            isError: true,
          };
      }
    } catch (err) {
      const error = err as Error;
      logger.error("Tool execution failed", { name, error: error.message });
      return {
        content: [
          {
            type: "text",
            text: formatJson({ error: error.message }),
          },
        ],
        isError: true,
      };
    }
  }

  private async handleRunPipeline(params: Record<string, unknown>): Promise<MCPToolResult> {
    const { mode, prompt, modelsOverride, domainExclusions } = params;

    if (!mode || typeof mode !== "string") {
      throw new Error("Missing or invalid 'mode' parameter");
    }

    if (!prompt || typeof prompt !== "string") {
      throw new Error("Missing or invalid 'prompt' parameter");
    }

    // Validate domainExclusions if provided
    // Requirements: 12.4, 12.5
    if (domainExclusions !== undefined) {
      if (!Array.isArray(domainExclusions)) {
        throw new Error("'domainExclusions' must be an array");
      }

      for (let i = 0; i < domainExclusions.length; i++) {
        const exclusion = domainExclusions[i];
        if (typeof exclusion !== "object" || exclusion === null) {
          throw new Error(`Domain exclusion at index ${i} must be an object`);
        }

        const { domainId, justification } = exclusion as Record<string, unknown>;

        // Use shared validation utility
        const validationResult = validateDomainExclusion({
          domainId: domainId as string,
          justification: justification as string,
        } as DomainExclusionInput);

        if (!validationResult.valid) {
          const errorMessages = validationResult.errors
            .map(e => `${e.field}: ${e.message}`)
            .join('; ');
          throw new Error(`Domain exclusion at index ${i} validation failed: ${errorMessages}`);
        }
      }
    }

    const result = await this.adapter.runPipeline({
      mode,
      prompt,
      modelsOverride: modelsOverride as Record<string, string | string[]> | undefined,
      domainExclusions: domainExclusions as Array<{ domainId: string; justification: string }> | undefined,
    });

    return {
      content: [
        {
          type: "text",
          text: formatJson(result),
        },
      ],
      isError: !result.success,
    };
  }

  private async handleGetIndexState(): Promise<MCPToolResult> {
    const result = await this.adapter.getIndexState();

    return {
      content: [
        {
          type: "text",
          text: formatJson(result),
        },
      ],
      isError: !!result.error,
    };
  }

  private async handleGetSpecFiles(): Promise<MCPToolResult> {
    const result = await this.adapter.getSpecFiles();

    return {
      content: [
        {
          type: "text",
          text: formatJson(result),
        },
      ],
    };
  }

  private async handleGetPipelineProgress(
    params: Record<string, unknown>
  ): Promise<MCPToolResult> {
    const { runId } = params;

    const result = await this.adapter.getPipelineProgress(
      runId ? String(runId) : undefined
    );

    return {
      content: [
        {
          type: "text",
          text: formatJson(result),
        },
      ],
    };
  }

  private async handleAbortPipeline(params: Record<string, unknown>): Promise<MCPToolResult> {
    const { runId } = params;

    if (!runId || typeof runId !== "string") {
      throw new Error("Missing or invalid 'runId' parameter");
    }

    const result = await this.adapter.abortPipeline(runId);

    return {
      content: [
        {
          type: "text",
          text: formatJson(result),
        },
      ],
      isError: !result.success,
    };
  }
}
