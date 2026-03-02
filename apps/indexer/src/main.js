"use strict";
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
exports.Indexer = void 0;
const path = __importStar(require("path"));
const IndexController_1 = require("./api/IndexController");
const Logger_1 = require("./observability/Logger");
const Stats_1 = require("./observability/Stats");
class Indexer {
    constructor(config = {}) {
        this.config = {
            storagePath: config.storagePath || path.join(process.cwd(), '.indexer'),
            modelName: config.modelName || 'bge-large',
            device: config.device || 'cpu',
            logLevel: config.logLevel || Logger_1.LogLevel.INFO,
        };
        Logger_1.logger.info('Initializing Indexer', {
            storagePath: this.config.storagePath,
            modelName: this.config.modelName,
            device: this.config.device,
        });
        this.controller = new IndexController_1.IndexController(this.config.storagePath, {
            modelName: this.config.modelName,
            device: this.config.device,
        });
    }
    async start() {
        Logger_1.logger.info('Starting Indexer service');
        await this.controller.initialize();
        Logger_1.logger.info('Indexer service started successfully');
    }
    async shutdown() {
        Logger_1.logger.info('Shutting down Indexer service');
        await this.controller.shutdown();
        Logger_1.logger.info('Indexer service shut down successfully');
    }
    getController() {
        return this.controller;
    }
    getStats() {
        return Stats_1.statsCollector.getStats();
    }
}
exports.Indexer = Indexer;
// CLI entry point
async function main() {
    const indexer = new Indexer({
        storagePath: process.env.INDEXER_STORAGE_PATH,
        modelName: process.env.INDEXER_MODEL_NAME,
        device: process.env.INDEXER_DEVICE || 'cpu',
        logLevel: process.env.LOG_LEVEL || Logger_1.LogLevel.INFO,
    });
    try {
        await indexer.start();
        // Keep process alive
        process.on('SIGINT', async () => {
            Logger_1.logger.info('Received SIGINT, shutting down gracefully');
            await indexer.shutdown();
            process.exit(0);
        });
        process.on('SIGTERM', async () => {
            Logger_1.logger.info('Received SIGTERM, shutting down gracefully');
            await indexer.shutdown();
            process.exit(0);
        });
        Logger_1.logger.info('Indexer is running. Press Ctrl+C to stop.');
    }
    catch (error) {
        Logger_1.logger.error('Failed to start indexer', error);
        process.exit(1);
    }
}
// Run if executed directly
if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}
exports.default = Indexer;
