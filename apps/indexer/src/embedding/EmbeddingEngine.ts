import axios, { AxiosInstance, AxiosError } from 'axios';
import { Chunk } from '../chunker/Chunker';
import { ModelConfig, getModelConfig, detectDevice, getEmbeddingModelFromEnv } from './model_config';
import { logger } from '../observability/Logger';

/**
 * Expected dimension for all embedding models to maintain Qdrant collection compatibility
 */
export const EXPECTED_EMBEDDING_DIMENSION = 1024;

/**
 * Error thrown when embedding dimensions don't match expected value
 */
export class DimensionMismatchError extends Error {
  constructor(
    public readonly expectedDimension: number,
    public readonly actualDimension: number,
    public readonly modelName: string
  ) {
    super(
      `Embedding dimension mismatch: expected ${expectedDimension}, got ${actualDimension} from model "${modelName}". ` +
      `All models must return ${expectedDimension}-dimensional vectors for Qdrant collection compatibility.`
    );
    this.name = 'DimensionMismatchError';
  }
}

export interface EmbeddingResult {
  chunkId: string;
  embedding: number[];
  dimensions: number;
}

export interface EmbeddingEngineConfig {
  modelName?: string;
  device?: 'cpu' | 'gpu';
  batchSize?: number;
  embeddingUrl?: string;
}

/**
 * OpenAI-compatible embedding request format
 */
interface EmbeddingRequest {
  input: string[];
  model: string;
}

/**
 * OpenAI-compatible embedding response format
 */
interface EmbeddingResponse {
  object: string;
  data: Array<{
    object: string;
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

export class EmbeddingEngine {
  private modelConfig: ModelConfig;
  private device: 'cpu' | 'gpu';
  private batchSize: number;
  private embeddingUrl: string;
  private httpClient: AxiosInstance;
  private isInitialized: boolean = false;
  private previousModelName: string | null = null;

  constructor(config: EmbeddingEngineConfig = {}) {
    // Use provided modelName, or fall back to environment variable (which defaults to 'local-bge-large-v1.5')
    const modelName = config.modelName || getEmbeddingModelFromEnv();
    this.modelConfig = getModelConfig(modelName);
    this.device = config.device || detectDevice();
    this.batchSize = config.batchSize || 32;
    this.embeddingUrl = config.embeddingUrl || process.env.EMBEDDING_URL || 'http://localhost:8000';
    
    // Validate model dimensions at construction time
    this.validateModelDimensions(this.modelConfig);
    
    // Initialize Axios HTTP client
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    // Add Authorization header if API key is provided
    const apiKey = process.env.EMBEDDING_API_KEY;
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    
    this.httpClient = axios.create({
      baseURL: this.embeddingUrl,
      timeout: 30000, // 30 seconds per batch
      headers,
    });
  }

  /**
   * Validates that the model configuration specifies the expected dimension.
   * All models must return 1024-dimensional vectors for Qdrant collection compatibility.
   * 
   * @throws DimensionMismatchError if model dimensions don't match expected value
   */
  private validateModelDimensions(config: ModelConfig): void {
    if (config.dimensions !== EXPECTED_EMBEDDING_DIMENSION) {
      throw new DimensionMismatchError(
        EXPECTED_EMBEDDING_DIMENSION,
        config.dimensions,
        config.name
      );
    }
  }

  /**
   * Validates that the actual embedding vector has the expected dimension.
   * 
   * @throws DimensionMismatchError if embedding dimension doesn't match expected value
   */
  private validateEmbeddingDimension(embedding: number[]): void {
    if (embedding.length !== EXPECTED_EMBEDDING_DIMENSION) {
      throw new DimensionMismatchError(
        EXPECTED_EMBEDDING_DIMENSION,
        embedding.length,
        this.modelConfig.name
      );
    }
  }

  /**
   * Detects and logs if the model has changed since the last operation.
   * This helps track potential issues with index consistency.
   */
  private detectModelChange(): void {
    const currentModelName = this.modelConfig.name;
    
    if (this.previousModelName !== null && this.previousModelName !== currentModelName) {
      logger.warn(
        `Embedding model changed from "${this.previousModelName}" to "${currentModelName}". ` +
        `This may affect index consistency if the previous index was built with a different model.`,
        { previousModel: this.previousModelName, currentModel: currentModelName }
      );
    }
    
    this.previousModelName = currentModelName;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    console.log(`Initializing embedding engine with model: ${this.modelConfig.name}`);
    console.log(`Embedding endpoint: ${this.embeddingUrl}`);
    
    // Verify connectivity to embedding server
    await this.verifyConnection();
    
    this.isInitialized = true;
    console.log('Embedding engine initialized successfully');
  }

  private async verifyConnection(): Promise<void> {
    try {
      // Make a test request with minimal input to verify the server is reachable
      const testRequest: EmbeddingRequest = {
        input: ['test'],
        model: this.modelConfig.name,
      };
      
      await this.httpClient.post<EmbeddingResponse>('/embeddings', testRequest);
      console.log('Embedding server connection verified');
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.code === 'ECONNREFUSED') {
        console.warn(`Warning: Embedding server not reachable at ${this.embeddingUrl}. Requests will fail until server is available.`);
      } else {
        console.warn(`Warning: Embedding server health check failed: ${axiosError.message}`);
      }
      // Don't throw - allow initialization to complete, requests will fail later if server is down
    }
  }

  async embedChunk(chunk: Chunk): Promise<EmbeddingResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const embedding = await this.generateEmbedding(chunk.content);
    
    return {
      chunkId: chunk.id,
      embedding,
      dimensions: this.modelConfig.dimensions,
    };
  }

  async embedChunks(chunks: Chunk[]): Promise<EmbeddingResult[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const results: EmbeddingResult[] = [];
    
    // Process in batches of 32 chunks per request
    for (let i = 0; i < chunks.length; i += this.batchSize) {
      const batch = chunks.slice(i, i + this.batchSize);
      const batchResults = await this.processBatch(batch);
      results.push(...batchResults);
    }
    
    return results;
  }

  private async processBatch(chunks: Chunk[]): Promise<EmbeddingResult[]> {
    const texts = chunks.map(chunk => chunk.content);
    const embeddings = await this.generateEmbeddingsBatch(texts);

    return chunks.map((chunk, index) => ({
      chunkId: chunk.id,
      embedding: embeddings[index],
      dimensions: this.modelConfig.dimensions,
    }));
  }

  /**
   * Generate embeddings for a batch of texts using HTTP POST to /embeddings
   * Uses OpenAI-compatible request format
   */
  private async generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    // Detect model changes before making requests
    this.detectModelChange();
    
    const request: EmbeddingRequest = {
      input: texts,
      model: this.modelConfig.name,
    };

    try {
      const response = await this.httpClient.post<EmbeddingResponse>('/embeddings', request);
      
      // Sort by index to ensure correct order
      const sortedData = response.data.data.sort((a, b) => a.index - b.index);
      const embeddings = sortedData.map(item => item.embedding);
      
      // Validate dimensions of all returned embeddings
      for (const embedding of embeddings) {
        this.validateEmbeddingDimension(embedding);
      }
      
      return embeddings;
    } catch (error) {
      // Re-throw DimensionMismatchError as-is
      if (error instanceof DimensionMismatchError) {
        throw error;
      }
      
      const axiosError = error as AxiosError;
      
      if (axiosError.code === 'ECONNREFUSED') {
        throw new Error(`Embedding server not reachable at ${this.embeddingUrl}`);
      }
      
      if (axiosError.code === 'ETIMEDOUT' || axiosError.code === 'ECONNABORTED') {
        throw new Error(`Embedding request timed out after 30 seconds`);
      }
      
      if (axiosError.response) {
        const status = axiosError.response.status;
        const data = axiosError.response.data as { error?: { message?: string } };
        const message = data?.error?.message || axiosError.message;
        throw new Error(`Embedding request failed with status ${status}: ${message}`);
      }
      
      throw new Error(`Embedding request failed: ${axiosError.message}`);
    }
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    const embeddings = await this.generateEmbeddingsBatch([text]);
    return embeddings[0];
  }

  async embedQuery(query: string): Promise<number[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return this.generateEmbedding(query);
  }

  getDimensions(): number {
    return this.modelConfig.dimensions;
  }

  getModelInfo(): ModelConfig {
    return { ...this.modelConfig };
  }

  /**
   * Get the configured embedding URL
   */
  getEmbeddingUrl(): string {
    return this.embeddingUrl;
  }

  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    console.log('Shutting down embedding engine');
    this.isInitialized = false;
  }
}
