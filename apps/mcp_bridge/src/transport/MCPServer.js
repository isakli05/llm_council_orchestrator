"use strict";
/**
 * MCP Server implementation
 * Handles JSON-RPC message framing over stdio
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MCPServer = void 0;
const readline = __importStar(require("readline"));
const Logger_1 = require("../observability/Logger");
const registerTools_1 = require("../tools/registerTools");
class MCPServer {
    constructor(orchestratorUrl) {
        this.toolRegistry = new registerTools_1.ToolRegistry(orchestratorUrl);
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: false,
        });
    }
    /**
     * Start the MCP server
     */
    async start() {
        Logger_1.logger.info("MCP Bridge server starting");
        this.rl.on("line", async (line) => {
            try {
                const message = JSON.parse(line);
                await this.handleMessage(message);
            }
            catch (err) {
                const error = err;
                Logger_1.logger.error("Failed to parse message", { error: error.message });
            }
        });
        this.rl.on("close", () => {
            Logger_1.logger.info("MCP Bridge server stopped");
            process.exit(0);
        });
        // Send initialization notification
        this.sendNotification("initialized", {});
    }
    /**
     * Handle incoming JSON-RPC message
     */
    async handleMessage(message) {
        // Check if it's a request (has id) or notification (no id)
        if ("id" in message) {
            await this.handleRequest(message);
        }
        else {
            await this.handleNotification(message);
        }
    }
    /**
     * Handle JSON-RPC request
     */
    async handleRequest(request) {
        Logger_1.logger.debug("Received request", { method: request.method, id: request.id });
        try {
            let result;
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
        }
        catch (err) {
            const error = err;
            Logger_1.logger.error("Request failed", { method: request.method, error: error.message });
            this.sendError(request.id, -32603, error.message);
        }
    }
    /**
     * Handle JSON-RPC notification
     */
    async handleNotification(notification) {
        Logger_1.logger.debug("Received notification", { method: notification.method });
        // Handle notifications if needed (e.g., cancellation)
        switch (notification.method) {
            case "notifications/cancelled":
                // Handle cancellation
                break;
            default:
                Logger_1.logger.warn("Unknown notification method", { method: notification.method });
        }
    }
    /**
     * Handle initialize request
     */
    async handleInitialize(params) {
        Logger_1.logger.info("Client initializing", { params });
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
    async handleToolsList() {
        const tools = this.toolRegistry.getToolDefinitions();
        return {
            tools,
        };
    }
    /**
     * Handle tools/call request
     */
    async handleToolsCall(params) {
        const { name, arguments: args } = params;
        if (!name || typeof name !== "string") {
            throw new Error("Missing or invalid 'name' parameter");
        }
        const toolArgs = args || {};
        const result = await this.toolRegistry.executeTool(name, toolArgs);
        return result;
    }
    /**
     * Send JSON-RPC response
     */
    sendResponse(id, result) {
        const response = {
            jsonrpc: "2.0",
            id,
            result,
        };
        this.sendMessage(response);
    }
    /**
     * Send JSON-RPC error
     */
    sendError(id, code, message) {
        const response = {
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
    sendNotification(method, params) {
        const notification = {
            jsonrpc: "2.0",
            method,
            params,
        };
        this.sendMessage(notification);
    }
    /**
     * Send message to stdout
     */
    sendMessage(message) {
        const line = JSON.stringify(message);
        console.log(line);
    }
}
exports.MCPServer = MCPServer;
