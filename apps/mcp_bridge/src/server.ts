/**
 * MCP Bridge Server Entrypoint
 * Starts the MCP server and connects to orchestrator
 */

import { LogLevel } from "@llm/shared-config";
import { MCPServer } from "./transport/MCPServer";
import { logger } from "./observability/Logger";

async function main() {
  try {
    // Get orchestrator URL from environment or use default
    // Default port 7001 matches orchestrator's actual default port
    const orchestratorUrl = process.env.ORCHESTRATOR_URL || "http://localhost:7001";

    // Set log level from environment
    const logLevelStr = process.env.LOG_LEVEL || "info";
    const logLevel = logLevelStr as LogLevel;
    logger.setMinLevel(logLevel);

    logger.info("Starting MCP Bridge", { orchestratorUrl });

    // Create and start MCP server
    const server = new MCPServer(orchestratorUrl);
    await server.start();

    logger.info("MCP Bridge ready");
  } catch (err) {
    const error = err as Error;
    logger.error("Failed to start MCP Bridge", { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// Handle process signals
process.on("SIGINT", () => {
  logger.info("Received SIGINT, shutting down");
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("Received SIGTERM, shutting down");
  process.exit(0);
});

// Start server
main();