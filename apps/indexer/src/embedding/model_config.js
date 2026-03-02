"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AVAILABLE_MODELS = void 0;
exports.getModelConfig = getModelConfig;
exports.detectDevice = detectDevice;
exports.AVAILABLE_MODELS = {
    'bge-large': {
        name: 'BAAI/bge-large-en-v1.5',
        dimensions: 1024,
        maxTokens: 512,
        device: 'cpu',
    },
    'local-bge-large-v1.5': {
        name: 'BAAI/bge-large-en-v1.5',
        dimensions: 1024,
        maxTokens: 512,
        device: 'cpu',
    },
    'bge-m3': {
        name: 'BAAI/bge-m3',
        dimensions: 1024,
        maxTokens: 8192,
        device: 'cpu',
    },
    'e5-large': {
        name: 'intfloat/e5-large-v2',
        dimensions: 1024,
        maxTokens: 512,
        device: 'cpu',
    },
    'multilingual-e5-large-instruct': {
        name: 'intfloat/multilingual-e5-large-instruct',
        dimensions: 1024,
        maxTokens: 512,
        device: 'cpu',
    },
};
function getModelConfig(modelName) {
    const config = exports.AVAILABLE_MODELS[modelName];
    if (!config) {
        throw new Error(`Unknown model: ${modelName}. Available models: ${Object.keys(exports.AVAILABLE_MODELS).join(', ')}`);
    }
    return config;
}
function detectDevice() {
    // Simple detection - can be enhanced with actual GPU detection
    // For now, default to CPU
    return 'cpu';
}
