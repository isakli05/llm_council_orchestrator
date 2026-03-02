/**
 * MCP Server implementation
 * Handles JSON-RPC message framing over stdio
 */

import * as readline from "readline";
import { formatJson, safeJsonParse } from "@llm/shared-utils";
import { logger } from "../observability/Logger";
import { ToolRegistry } from "../tools/registerTools";
import { MCPRequest, MCPResponse, MCPNotification } from "../types/mcp";

export class MCPServer {
  private toolRegistry: ToolRegistry;
  private rl: readline.Interface;

  constructor(orchestratorUrl?: string) {
    this.toolRegistry = new ToolRegistry(orchestratorUrl);
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    logger.info("MCP Bridge server starting");

    this.rl.on("line", async (line) => {
      try {
        const message = safeJsonParse<MCPRequest | MCPNotification>(line);
        if (!message) {
          throw new Error("Invalid JSON");
        }
        await this.handleMessage(message);
      } catch (err) {
        const error = err as Error;
        logger.error("Failed to parse message", { error: error.message });
      }
    });

    this.rl.on("close", () => {
      logger.info("MCP Bridge server stopped");
      process.exit(0);
    });

    // Send initialization notification
    this.sendNotification("initialized", {});
  }

  /**
   * Handle incoming JSON-RPC message
   */
  private async handleMessage(message: MCPRequest | MCPNotification): Promise<void> {
    // Check if it's a request (has id) or notification (no id)
    if ("id" in message) {
      await this.handleRequest(message as MCPRequest);
    } else {
      await this.handleNotification(message as MCPNotification);
    }
  }

  /**
   * Handle JSON-RPC request
   */
  private async handleRequest(request: MCPRequest): Promise<void> {
    logger.debug("Received request", { method: request.method, id: request.id });

    try {
      let result: unknown;

      switch (request.method) {
        case "initialize":
          result = await this.handleInitialize(request.params || {});
          break;

        case "tools/list":
          result = await this.handleToolsList();
          break;

        case "tools/call":
          result = await this.handleToolsCall(request.params || {});
          break;

        default:
          throw new Error(`Unknown method: ${request.method}`);
      }

      this.sendResponse(request.id, result);
    } catch (err) {
      const error = err as Error;
      logger.error("Request failed", { method: request.method, error: error.message });
      this.sendError(request.id, -32603, error.message);
    }
  }

  /**
   * Handle JSON-RPC notification
   */
  private async handleNotification(notification: MCPNotification): Promise<void> {
    logger.debug("Received notification", { method: notification.method });

    // Handle notifications if needed (e.g., cancellation)
    switch (notification.method) {
      case "notifications/cancelled":
        // Handle cancellation
        break;
      default:
        logger.warn("Unknown notification method", { method: notification.method });
    }
  }

  /**
   * Handle initialize request
   */
  private async handleInitialize(params: Record<string, unknown>): Promise<unknown> {
    logger.info("Client initializing", { params });

    return {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: "llm-council-mcp-bridge",
        version: "0.1.0",
      },
    };
  }

  /**
   * Handle tools/list request
   */
  private async handleToolsList(): Promise<unknown> {
    const tools = this.toolRegistry.getToolDefinitions();

    return {
      tools,
    };
  }

  /**
   * Handle tools/call request
   */
  private async handleToolsCall(params: Record<string, unknown>): Promise<unknown> {
    const { name, arguments: args } = params;

    if (!name || typeof name !== "string") {
      throw new Error("Missing or invalid 'name' parameter");
    }

    const toolArgs = (args as Record<string, unknown>) || {};
    const result = await this.toolRegistry.executeTool(name, toolArgs);

    return result;
  }

  /**
   * Send JSON-RPC response
   */
  private sendResponse(id: string | number, result: unknown): void {
    const response: MCPResponse = {
      jsonrpc: "2.0",
      id,
      result,
    };

    this.sendMessage(response);
  }

  /**
   * Send JSON-RPC error
   */
  private sendError(id: string | number, code: number, message: string): void {
    const response: MCPResponse = {
      jsonrpc: "2.0",
      id,
      error: {
        code,
        message,
      },
    };

    this.sendMessage(response);
  }

  /**
   * Send JSON-RPC notification
   */
  private sendNotification(method: string, params: Record<string, unknown>): void {
    const notification: MCPNotification = {
      jsonrpc: "2.0",
      method,
      params,
    };

    this.sendMessage(notification);
  }

  /**
   * Send message to stdout
   */
  private sendMessage(message: MCPResponse | MCPNotification): void {
    const line = formatJson(message);
    console.log(line);
  }
}
