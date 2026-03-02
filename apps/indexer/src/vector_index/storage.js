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
exports.VectorStorage = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
class VectorStorage {
    constructor(storagePath) {
        this.indexPath = path.join(storagePath, 'vectors.jsonl');
        this.metadataPath = path.join(storagePath, 'metadata.json');
    }
    async ensureDirectory() {
        const dir = path.dirname(this.indexPath);
        await fs.mkdir(dir, { recursive: true });
    }
    async saveVectors(vectors) {
        await this.ensureDirectory();
        const lines = vectors.map(v => JSON.stringify(v)).join('\n');
        await fs.writeFile(this.indexPath, lines, 'utf-8');
    }
    async appendVectors(vectors) {
        await this.ensureDirectory();
        const lines = vectors.map(v => JSON.stringify(v)).join('\n') + '\n';
        await fs.appendFile(this.indexPath, lines, 'utf-8');
    }
    async loadVectors() {
        try {
            const content = await fs.readFile(this.indexPath, 'utf-8');
            const lines = content.trim().split('\n').filter(line => line.length > 0);
            return lines.map(line => JSON.parse(line));
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }
    async saveMetadata(metadata) {
        await this.ensureDirectory();
        await fs.writeFile(this.metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
    }
    async loadMetadata() {
        try {
            const content = await fs.readFile(this.metadataPath, 'utf-8');
            return JSON.parse(content);
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                return null;
            }
            throw error;
        }
    }
    async clear() {
        try {
            await fs.unlink(this.indexPath);
        }
        catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
        try {
            await fs.unlink(this.metadataPath);
        }
        catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
    }
}
exports.VectorStorage = VectorStorage;
