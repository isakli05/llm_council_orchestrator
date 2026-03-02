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
exports.Chunker = void 0;
const fs = __importStar(require("fs/promises"));
const crypto = __importStar(require("crypto"));
class Chunker {
    constructor(config = {}) {
        this.maxTokens = config.maxTokens || 512;
        this.overlapTokens = config.overlapTokens || 50;
    }
    async chunkFile(file) {
        try {
            const content = await fs.readFile(file.path, 'utf-8');
            return this.chunkContent(content, file);
        }
        catch (error) {
            console.warn(`Failed to read file for chunking: ${file.path}`, error);
            return [];
        }
    }
    async chunkFiles(files) {
        const allChunks = [];
        for (const file of files) {
            const chunks = await this.chunkFile(file);
            allChunks.push(...chunks);
        }
        return allChunks;
    }
    chunkContent(content, file) {
        const chunks = [];
        const lines = content.split('\n');
        const chunkType = this.determineChunkType(file.extension);
        const language = this.detectLanguage(file.extension);
        // For code files, try structure-aware chunking
        if (chunkType === 'code' && this.isStructuredLanguage(file.extension)) {
            const structuredChunks = this.structureAwareChunk(lines, file, chunkType, language);
            if (structuredChunks.length > 0) {
                return structuredChunks;
            }
        }
        // Fallback to simple line-based chunking
        return this.simpleLineChunk(lines, file, chunkType, language);
    }
    simpleLineChunk(lines, file, chunkType, language) {
        const chunks = [];
        let currentChunk = [];
        let currentTokens = 0;
        let startLine = 0;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineTokens = this.estimateTokens(line);
            if (currentTokens + lineTokens > this.maxTokens && currentChunk.length > 0) {
                // Create chunk
                chunks.push(this.createChunk(currentChunk.join('\n'), file, startLine, i - 1, currentTokens, chunkType, language));
                // Start new chunk with overlap
                const overlapLines = this.getOverlapLines(currentChunk);
                currentChunk = [...overlapLines, line];
                currentTokens = this.estimateTokens(currentChunk.join('\n'));
                startLine = i - overlapLines.length;
            }
            else {
                currentChunk.push(line);
                currentTokens += lineTokens;
            }
        }
        // Add remaining chunk
        if (currentChunk.length > 0) {
            chunks.push(this.createChunk(currentChunk.join('\n'), file, startLine, lines.length - 1, currentTokens, chunkType, language));
        }
        return chunks;
    }
    structureAwareChunk(lines, file, chunkType, language) {
        const chunks = [];
        const blocks = this.detectCodeBlocks(lines);
        for (const block of blocks) {
            const blockLines = lines.slice(block.start, block.end + 1);
            const content = blockLines.join('\n');
            const tokens = this.estimateTokens(content);
            if (tokens <= this.maxTokens) {
                // Block fits in one chunk
                chunks.push(this.createChunk(content, file, block.start, block.end, tokens, chunkType, language));
            }
            else {
                // Block too large, split it
                const subChunks = this.simpleLineChunk(blockLines, file, chunkType, language);
                chunks.push(...subChunks);
            }
        }
        return chunks;
    }
    detectCodeBlocks(lines) {
        const blocks = [];
        let currentBlock = null;
        let braceDepth = 0;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            // Detect function/class/method starts
            if (this.isBlockStart(line)) {
                if (currentBlock && braceDepth === 0) {
                    blocks.push({ start: currentBlock.start, end: i - 1, type: currentBlock.type });
                }
                currentBlock = { start: i, type: 'block' };
            }
            // Track brace depth
            braceDepth += (line.match(/{/g) || []).length;
            braceDepth -= (line.match(/}/g) || []).length;
            // Close block when braces balance
            if (currentBlock && braceDepth === 0 && line.includes('}')) {
                blocks.push({ start: currentBlock.start, end: i, type: currentBlock.type });
                currentBlock = null;
            }
        }
        // Close any remaining block
        if (currentBlock) {
            blocks.push({ start: currentBlock.start, end: lines.length - 1, type: currentBlock.type });
        }
        return blocks.length > 0 ? blocks : [{ start: 0, end: lines.length - 1, type: 'file' }];
    }
    isBlockStart(line) {
        const patterns = [
            /^(export\s+)?(async\s+)?function\s+/,
            /^(export\s+)?(default\s+)?class\s+/,
            /^(public|private|protected)\s+(async\s+)?[\w<>]+\s+\w+\s*\(/,
            /^\s*(public|private|protected)?\s*\w+\s*\([^)]*\)\s*{/,
        ];
        return patterns.some(pattern => pattern.test(line));
    }
    getOverlapLines(chunk) {
        const overlapLineCount = Math.min(Math.ceil(this.overlapTokens / 10), // Rough estimate
        Math.floor(chunk.length / 4), chunk.length);
        return chunk.slice(-overlapLineCount);
    }
    createChunk(content, file, startLine, endLine, tokenCount, chunkType, language) {
        const hash = this.generateHash(content);
        const id = this.generateChunkId(file.relativePath, startLine, hash);
        return {
            id,
            filePath: file.path,
            relativePath: file.relativePath,
            content,
            startLine,
            endLine,
            tokenCount,
            hash,
            metadata: {
                extension: file.extension,
                chunkType,
                language,
            },
        };
    }
    generateHash(content) {
        return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
    }
    generateChunkId(relativePath, startLine, hash) {
        return `${relativePath}:${startLine}:${hash}`;
    }
    estimateTokens(text) {
        // Rough estimation: ~4 characters per token
        return Math.ceil(text.length / 4);
    }
    determineChunkType(extension) {
        const codeExtensions = ['.ts', '.js', '.tsx', '.jsx', '.php', '.py', '.java', '.go', '.rs', '.c', '.cpp', '.cs'];
        const configExtensions = ['.json', '.yaml', '.yml', '.toml', '.ini', '.env'];
        if (codeExtensions.includes(extension)) {
            return 'code';
        }
        if (configExtensions.includes(extension)) {
            return 'config';
        }
        return 'text';
    }
    detectLanguage(extension) {
        const languageMap = {
            '.ts': 'typescript',
            '.tsx': 'typescript',
            '.js': 'javascript',
            '.jsx': 'javascript',
            '.php': 'php',
            '.py': 'python',
            '.java': 'java',
            '.go': 'go',
            '.rs': 'rust',
            '.c': 'c',
            '.cpp': 'cpp',
            '.cs': 'csharp',
            '.rb': 'ruby',
            '.sql': 'sql',
        };
        return languageMap[extension];
    }
    isStructuredLanguage(extension) {
        const structured = ['.ts', '.tsx', '.js', '.jsx', '.php', '.py', '.java', '.go', '.rs', '.c', '.cpp', '.cs'];
        return structured.includes(extension);
    }
}
exports.Chunker = Chunker;
