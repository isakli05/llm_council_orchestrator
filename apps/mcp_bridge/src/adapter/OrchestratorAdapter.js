"use strict";
/**
 * Adapter for communicating with Orchestrator API
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
exports.OrchestratorAdapter = void 0;
const http = __importStar(require("http"));
const Logger_1 = require("../observability/Logger");
class OrchestratorAdapter {
    constructor(baseUrl = "http://localhost:3005") {
        this.baseUrl = baseUrl;
    }
    /**
     * Execute a pipeline via orchestrator
     */
    async runPipeline(request) {
        Logger_1.logger.info("Calling orchestrator runPipeline", { mode: request.mode });
        try {
            const response = await this.post("/run", request);
            return response;
        }
        catch (err) {
            const error = err;
            Logger_1.logger.error("Failed to run pipeline", { error: error.message });
            return {
                success: false,
                mode: request.mode,
                error: {
                    code: "ORCHESTRATOR_ERROR",
                    message: error.message,
                },
            };
        }
    }
    /**
     * Get index state from orchestrator
     */
    async getIndexState() {
        Logger_1.logger.info("Calling orchestrator getIndexState");
        try {
            const response = await this.get("/index/state");
            return response;
        }
        catch (err) {
            const error = err;
            Logger_1.logger.error("Failed to get index state", { error: error.message });
            return {
                indexed: false,
                error: error.message,
            };
        }
    }
    /**
     * Get spec files from orchestrator
     */
    async getSpecFiles() {
        Logger_1.logger.info("Calling orchestrator getSpecFiles");
        try {
            const response = await this.get("/spec/output");
            return response;
        }
        catch (err) {
            const error = err;
            Logger_1.logger.error("Failed to get spec files", { error: error.message });
            return {
                files: [],
            };
        }
    }
    /**
     * Get pipeline progress
     */
    async getPipelineProgress(runId) {
        Logger_1.logger.info("Calling orchestrator getPipelineProgress", { runId });
        try {
            const endpoint = runId ? `/progress?runId=${runId}` : "/progress";
            const response = await this.get(endpoint);
            return response;
        }
        catch (err) {
            const error = err;
            Logger_1.logger.error("Failed to get pipeline progress", { error: error.message });
            return {
                status: "idle",
            };
        }
    }
    /**
     * Abort a running pipeline
     */
    async abortPipeline(runId) {
        Logger_1.logger.info("Calling orchestrator abortPipeline", { runId });
        try {
            const response = await this.post("/abort", { runId });
            return response;
        }
        catch (err) {
            const error = err;
            Logger_1.logger.error("Failed to abort pipeline", { error: error.message });
            return {
                success: false,
                message: error.message,
            };
        }
    }
    /**
     * Generic GET request
     */
    async get(path) {
        return new Promise((resolve, reject) => {
            const url = new URL(path, this.baseUrl);
            const req = http.get(url, (res) => {
                let data = "";
                res.on("data", (chunk) => {
                    data += chunk;
                });
                res.on("end", () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            resolve(JSON.parse(data));
                        }
                        catch (err) {
                            reject(new Error("Invalid JSON response"));
                        }
                    }
                    else {
                        reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    }
                });
            });
            req.on("error", (err) => {
                reject(err);
            });
            req.end();
        });
    }
    /**
     * Generic POST request
     */
    async post(path, body) {
        return new Promise((resolve, reject) => {
            const url = new URL(path, this.baseUrl);
            const payload = JSON.stringify(body);
            const options = {
                hostname: url.hostname,
                port: url.port,
                path: url.pathname + url.search,
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Content-Length": Buffer.byteLength(payload),
                },
            };
            const req = http.request(options, (res) => {
                let data = "";
                res.on("data", (chunk) => {
                    data += chunk;
                });
                res.on("end", () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            resolve(JSON.parse(data));
                        }
                        catch (err) {
                            reject(new Error("Invalid JSON response"));
                        }
                    }
                    else {
                        reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    }
                });
            });
            req.on("error", (err) => {
                reject(err);
            });
            req.write(payload);
            req.end();
        });
    }
}
exports.OrchestratorAdapter = OrchestratorAdapter;
