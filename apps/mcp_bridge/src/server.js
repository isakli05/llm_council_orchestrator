"use strict";
/**
 * MCP Bridge Server Entrypoint
 * Starts the MCP server and connects to orchestrator
 */
Object.defineProperty(exports, "__esModule", { value: true });
const MCPServer_1 = require("./transport/MCPServer");
const Logger_1 = require("./observability/Logger");
async function main() {
    try {
        // Get orchestrator URL from environment or use default
        const orchestratorUrl = process.env.ORCHESTRATOR_URL || "http://localhost:3005";
        // Set log level from environment
        const logLevel = (process.env.LOG_LEVEL || "info");
        Logger_1.logger.setMinLevel(logLevel);
        Logger_1.logger.info("Starting MCP Bridge", { orchestratorUrl });
        // Create and start MCP server
        const server = new MCPServer_1.MCPServer(orchestratorUrl);
        await server.start();
        Logger_1.logger.info("MCP Bridge ready");
    }
    catch (err) {
        const error = err;
        Logger_1.logger.error("Failed to start MCP Bridge", { error: error.message, stack: error.stack });
        process.exit(1);
    }
}
// Handle process signals
process.on("SIGINT", () => {
    Logger_1.logger.info("Received SIGINT, shutting down");
    process.exit(0);
});
process.on("SIGTERM", () => {
    Logger_1.logger.info("Received SIGTERM, shutting down");
    process.exit(0);
});
// Start server
main();
