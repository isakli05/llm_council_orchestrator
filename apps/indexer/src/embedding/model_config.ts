export interface ModelConfig {
  name: string;
  dimensions: number;
  maxTokens: number;
  device: 'cpu' | 'gpu';
}

export const AVAILABLE_MODELS: Record<string, ModelConfig> = {
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

export const DEFAULT_EMBEDDING_MODEL = 'local-bge-large-v1.5';

export function getModelConfig(modelName: string): ModelConfig {
  const config = AVAILABLE_MODELS[modelName];
  if (!config) {
    throw new Error(`Unknown model: ${modelName}. Available models: ${Object.keys(AVAILABLE_MODELS).join(', ')}`);
  }
  return config;
}

/**
 * Gets the embedding model name from the EMBEDDING_MODEL environment variable.
 * Defaults to "local-bge-large-v1.5" if not set.
 * Validates that the model exists in AVAILABLE_MODELS.
 * 
 * @returns The validated model name
 * @throws Error if the model specified in EMBEDDING_MODEL is not in AVAILABLE_MODELS
 */
export function getEmbeddingModelFromEnv(): string {
  const modelName = process.env.EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
  
  if (!AVAILABLE_MODELS[modelName]) {
    throw new Error(
      `Invalid EMBEDDING_MODEL: "${modelName}". Available models: ${Object.keys(AVAILABLE_MODELS).join(', ')}`
    );
  }
  
  return modelName;
}

export function detectDevice(): 'cpu' | 'gpu' {
  // Simple detection - can be enhanced with actual GPU detection
  // For now, default to CPU
  return 'cpu';
}
