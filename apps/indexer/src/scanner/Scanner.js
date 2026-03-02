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
exports.Scanner = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
class Scanner {
    constructor(config) {
        this.projectRoot = path.resolve(config.projectRoot);
        this.ignorePatterns = this.compileIgnorePatterns(config.ignorePatterns || this.getDefaultIgnorePatterns());
        this.includeExtensions = config.includeExtensions ? new Set(config.includeExtensions) : null;
    }
    getDefaultIgnorePatterns() {
        return [
            'node_modules',
            'vendor',
            '.next',
            '.nuxt',
            'build',
            'dist',
            'out',
            'cache',
            '.cache',
            '.git',
            '.svn',
            '.hg',
            '__pycache__',
            '*.pyc',
            '.DS_Store',
            'Thumbs.db',
            '.env',
            '.env.local',
            '*.log',
            'coverage',
            '.nyc_output',
            '.pytest_cache',
            '.vscode',
            '.idea',
            '*.min.js',
            '*.min.css',
            '*.map',
            'package-lock.json',
            'yarn.lock',
            'pnpm-lock.yaml',
        ];
    }
    compileIgnorePatterns(patterns) {
        return patterns.map(pattern => {
            // Convert glob-like patterns to regex
            const regexPattern = pattern
                .replace(/\./g, '\\.')
                .replace(/\*/g, '.*')
                .replace(/\?/g, '.');
            return new RegExp(`(^|/)${regexPattern}(/|$)`);
        });
    }
    shouldIgnore(relativePath) {
        return this.ignorePatterns.some(pattern => pattern.test(relativePath));
    }
    shouldInclude(filePath) {
        if (!this.includeExtensions) {
            return true;
        }
        const ext = path.extname(filePath);
        return this.includeExtensions.has(ext);
    }
    async scan() {
        const results = [];
        await this.scanDirectory(this.projectRoot, '', results);
        return results;
    }
    async scanDirectory(absolutePath, relativePath, results) {
        try {
            const entries = await fs.readdir(absolutePath, { withFileTypes: true });
            for (const entry of entries) {
                const entryRelativePath = path.join(relativePath, entry.name);
                const entryAbsolutePath = path.join(absolutePath, entry.name);
                // Check ignore patterns
                if (this.shouldIgnore(entryRelativePath)) {
                    continue;
                }
                if (entry.isDirectory()) {
                    await this.scanDirectory(entryAbsolutePath, entryRelativePath, results);
                }
                else if (entry.isFile()) {
                    // Check extension filter
                    if (!this.shouldInclude(entry.name)) {
                        continue;
                    }
                    try {
                        const stats = await fs.stat(entryAbsolutePath);
                        results.push({
                            path: entryAbsolutePath,
                            relativePath: entryRelativePath,
                            extension: path.extname(entry.name),
                            size: stats.size,
                            modifiedTime: stats.mtime,
                            isDirectory: false,
                        });
                    }
                    catch (error) {
                        // Skip files that can't be stat'd
                        console.warn(`Failed to stat file: ${entryAbsolutePath}`, error);
                    }
                }
            }
        }
        catch (error) {
            // Handle directory read errors gracefully
            console.warn(`Failed to read directory: ${absolutePath}`, error);
        }
    }
    async scanFile(filePath) {
        try {
            const absolutePath = path.resolve(this.projectRoot, filePath);
            const relativePath = path.relative(this.projectRoot, absolutePath);
            if (this.shouldIgnore(relativePath)) {
                return null;
            }
            if (!this.shouldInclude(absolutePath)) {
                return null;
            }
            const stats = await fs.stat(absolutePath);
            if (!stats.isFile()) {
                return null;
            }
            return {
                path: absolutePath,
                relativePath,
                extension: path.extname(absolutePath),
                size: stats.size,
                modifiedTime: stats.mtime,
                isDirectory: false,
            };
        }
        catch (error) {
            console.warn(`Failed to scan file: ${filePath}`, error);
            return null;
        }
    }
}
exports.Scanner = Scanner;
