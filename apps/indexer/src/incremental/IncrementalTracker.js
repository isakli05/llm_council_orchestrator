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
exports.IncrementalTracker = void 0;
const fs = __importStar(require("fs/promises"));
const crypto = __importStar(require("crypto"));
const path = __importStar(require("path"));
class IncrementalTracker {
    constructor(storagePath) {
        this.storagePath = storagePath;
        this.hashStorePath = path.join(storagePath, 'file_hashes.json');
        this.fileHashes = new Map();
    }
    async initialize() {
        await this.load();
    }
    async detectChanges(currentFiles) {
        const result = {
            added: [],
            modified: [],
            deleted: [],
            unchanged: [],
        };
        const currentPaths = new Set();
        // Check each current file
        for (const file of currentFiles) {
            currentPaths.add(file.relativePath);
            const hash = await this.computeFileHash(file.path);
            const stored = this.fileHashes.get(file.relativePath);
            if (!stored) {
                // New file
                result.added.push(file);
            }
            else if (stored.hash !== hash || stored.size !== file.size) {
                // Modified file
                result.modified.push(file);
            }
            else {
                // Unchanged file
                result.unchanged.push(file);
            }
        }
        // Check for deleted files
        for (const [relativePath] of this.fileHashes) {
            if (!currentPaths.has(relativePath)) {
                result.deleted.push(relativePath);
            }
        }
        return result;
    }
    async updateHashes(files) {
        for (const file of files) {
            const hash = await this.computeFileHash(file.path);
            this.fileHashes.set(file.relativePath, {
                relativePath: file.relativePath,
                hash,
                modifiedTime: file.modifiedTime.toISOString(),
                size: file.size,
            });
        }
    }
    async removeHashes(relativePaths) {
        for (const relativePath of relativePaths) {
            this.fileHashes.delete(relativePath);
        }
    }
    async computeFileHash(filePath) {
        try {
            const content = await fs.readFile(filePath);
            return crypto.createHash('sha256').update(content).digest('hex');
        }
        catch (error) {
            console.warn(`Failed to compute hash for file: ${filePath}`, error);
            return '';
        }
    }
    async save() {
        const dir = path.dirname(this.hashStorePath);
        await fs.mkdir(dir, { recursive: true });
        const data = Array.from(this.fileHashes.values());
        await fs.writeFile(this.hashStorePath, JSON.stringify(data, null, 2), 'utf-8');
    }
    async load() {
        try {
            const content = await fs.readFile(this.hashStorePath, 'utf-8');
            const data = JSON.parse(content);
            this.fileHashes.clear();
            for (const fileHash of data) {
                this.fileHashes.set(fileHash.relativePath, fileHash);
            }
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                // No existing hash store, start fresh
                this.fileHashes.clear();
            }
            else {
                throw error;
            }
        }
    }
    async clear() {
        this.fileHashes.clear();
        try {
            await fs.unlink(this.hashStorePath);
        }
        catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
    }
    getStats() {
        return {
            trackedFiles: this.fileHashes.size,
        };
    }
    hasFile(relativePath) {
        return this.fileHashes.has(relativePath);
    }
    getFileHash(relativePath) {
        return this.fileHashes.get(relativePath);
    }
}
exports.IncrementalTracker = IncrementalTracker;
