/**
 * Tests for Configuration Loader
 * 
 * Validates Requirements 15.2:
 * - Environment variables take precedence over config file values
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  loadArchitectConfig,
  validateConfig,
  loadAndValidateConfig,
  getProviderApiKey,
  hasProviderApiKey,
  validateApiKeysOnStartup,
  getProviderApiKeyEnvVar,
  getProviderApiKeyMappings,
  ArchitectConfig,
} from "./configLoader";
import { getEndpointTimeout, ENDPOINT_TIMEOUTS, TIMEOUTS } from "./index";

// Mock fs module
vi.mock("fs");

// Sample valid configuration
const VALID_CONFIG: ArchitectConfig = {
  models: {
    legacy_analysis: [
      {
        model: "glm-4.6",
        provider: "zai",
        thinking: { type: "enabled" },
      },
    ],
    architect: [
      {
        model: "gpt-5.2",
        provider: "openai",
        reasoning: { effort: "high" },
      },
    ],
    aggregator: {
      model: "gpt-5.2-pro",
      provider: "openai",
      reasoning: { effort: "xhigh" },
    },
  },
  providers: {
    openai: {
      endpoint: "https://api.openai.com/v1/chat/completions",
      envKey: "OPENAI_API_KEY",
    },
    zai: {
      endpoint: "https://api.z.ai/api/coding/paas/v4/chat/completions",
      envKey: "ZAI_API_KEY",
    },
  },
  embedding: {
    engine: "local-bge-large-v1.5",
    dimensions: 1024,
    endpoint: "http://localhost:8000/embeddings",
    availableModels: {
      "local-bge-large-v1.5": { dimensions: 1024, maxTokens: 512 },
    },
  },
  services: {
    indexer: { url: "http://localhost:9001", timeout: 60000 },
    qdrant: { url: "http://localhost:6333" },
  },
  defaults: {
    modelCallTimeout: 30000,
    httpRequestTimeout: 120000,
    maxRetries: 3,
    backoffBase: 1000,
  },
};

describe("configLoader", () => {
  const originalEnv = process.env;
  const mockConfigPath = "/test/architect.config.json";

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
    vi.clearAllMocks();
    
    // Setup default mocks
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(VALID_CONFIG));
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("loadArchitectConfig", () => {
    it("should load config from specified path", () => {
      const config = loadArchitectConfig({ configPath: mockConfigPath });
      
      expect(fs.readFileSync).toHaveBeenCalledWith(mockConfigPath, "utf-8");
      expect(config.models.aggregator?.model).toBe("gpt-5.2-pro");
    });

    it("should throw error for invalid JSON", () => {
      vi.mocked(fs.readFileSync).mockReturnValue("{ invalid json }");
      
      expect(() => loadArchitectConfig({ configPath: mockConfigPath }))
        .toThrow(/Invalid JSON/);
    });

    it("should throw error when config file not found", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error("ENOENT: no such file or directory");
      });
      
      expect(() => loadArchitectConfig({ configPath: mockConfigPath }))
        .toThrow(/Failed to load config file/);
    });

    describe("environment variable overrides (Requirements 15.2)", () => {
      it("should override INDEXER_URL from environment", () => {
        process.env.INDEXER_URL = "http://custom-indexer:9999";
        
        const config = loadArchitectConfig({ configPath: mockConfigPath });
        
        expect(config.services.indexer.url).toBe("http://custom-indexer:9999");
      });

      it("should override QDRANT_URL from environment", () => {
        process.env.QDRANT_URL = "http://custom-qdrant:6334";
        
        const config = loadArchitectConfig({ configPath: mockConfigPath });
        
        expect(config.services.qdrant.url).toBe("http://custom-qdrant:6334");
      });

      it("should override EMBEDDING_URL from environment", () => {
        process.env.EMBEDDING_URL = "http://custom-embedding:8001";
        
        const config = loadArchitectConfig({ configPath: mockConfigPath });
        
        expect(config.embedding.endpoint).toBe("http://custom-embedding:8001");
      });

      it("should override EMBEDDING_MODEL from environment", () => {
        process.env.EMBEDDING_MODEL = "bge-m3";
        
        const config = loadArchitectConfig({ configPath: mockConfigPath });
        
        expect(config.embedding.engine).toBe("bge-m3");
      });

      it("should override MODEL_CALL_TIMEOUT from environment", () => {
        process.env.MODEL_CALL_TIMEOUT = "60000";
        
        const config = loadArchitectConfig({ configPath: mockConfigPath });
        
        expect(config.defaults.modelCallTimeout).toBe(60000);
      });

      it("should override MAX_RETRIES from environment", () => {
        process.env.MAX_RETRIES = "5";
        
        const config = loadArchitectConfig({ configPath: mockConfigPath });
        
        expect(config.defaults.maxRetries).toBe(5);
      });

      it("should override multiple values from environment", () => {
        process.env.INDEXER_URL = "http://indexer:9001";
        process.env.EMBEDDING_MODEL = "multilingual-e5-large-instruct";
        process.env.MAX_RETRIES = "4";
        
        const config = loadArchitectConfig({ configPath: mockConfigPath });
        
        expect(config.services.indexer.url).toBe("http://indexer:9001");
        expect(config.embedding.engine).toBe("multilingual-e5-large-instruct");
        expect(config.defaults.maxRetries).toBe(4);
      });

      it("should not override when environment variable is empty", () => {
        process.env.INDEXER_URL = "";
        
        const config = loadArchitectConfig({ configPath: mockConfigPath });
        
        expect(config.services.indexer.url).toBe("http://localhost:9001");
      });
    });
  });

  describe("validateConfig", () => {
    it("should return valid when all required env vars are set", () => {
      process.env.INDEXER_API_KEY = "test-key";
      process.env.OPENAI_API_KEY = "sk-test";
      process.env.ZAI_API_KEY = "zai-test";
      
      const result = validateConfig(VALID_CONFIG);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should return error when INDEXER_API_KEY is missing", () => {
      delete process.env.INDEXER_API_KEY;
      
      const result = validateConfig(VALID_CONFIG);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing required environment variable: INDEXER_API_KEY");
    });

    it("should return warning when provider API key is missing", () => {
      process.env.INDEXER_API_KEY = "test-key";
      delete process.env.OPENAI_API_KEY;
      
      const result = validateConfig(VALID_CONFIG);
      
      expect(result.warnings.some(w => w.includes("openai"))).toBe(true);
      expect(result.missingApiKeys).toContain("openai");
    });

    it("should detect all missing provider API keys", () => {
      process.env.INDEXER_API_KEY = "test-key";
      delete process.env.OPENAI_API_KEY;
      delete process.env.ZAI_API_KEY;
      
      const result = validateConfig(VALID_CONFIG);
      
      expect(result.missingApiKeys).toContain("openai");
      expect(result.missingApiKeys).toContain("zai");
    });
  });

  describe("getProviderApiKey", () => {
    it("should return API key for known provider", () => {
      process.env.OPENAI_API_KEY = "sk-test-key";
      
      expect(getProviderApiKey("openai")).toBe("sk-test-key");
    });

    it("should return undefined for unknown provider", () => {
      expect(getProviderApiKey("unknown-provider")).toBeUndefined();
    });

    it("should return undefined when env var not set", () => {
      delete process.env.OPENAI_API_KEY;
      
      expect(getProviderApiKey("openai")).toBeUndefined();
    });
  });

  describe("hasProviderApiKey", () => {
    it("should return true when API key is set", () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-test";
      
      expect(hasProviderApiKey("anthropic")).toBe(true);
    });

    it("should return false when API key is not set", () => {
      delete process.env.ANTHROPIC_API_KEY;
      
      expect(hasProviderApiKey("anthropic")).toBe(false);
    });
  });

  describe("validateApiKeysOnStartup (Requirements 15.3)", () => {
    it("should return all providers as available when API keys are set", () => {
      process.env.OPENAI_API_KEY = "sk-test";
      process.env.ZAI_API_KEY = "zai-test";
      
      const result = validateApiKeysOnStartup(VALID_CONFIG, false);
      
      expect(result.availableProviders).toContain("openai");
      expect(result.availableProviders).toContain("zai");
      expect(result.unavailableProviders).toHaveLength(0);
    });

    it("should mark providers as unavailable when API keys are missing", () => {
      delete process.env.OPENAI_API_KEY;
      delete process.env.ZAI_API_KEY;
      
      const result = validateApiKeysOnStartup(VALID_CONFIG, false);
      
      expect(result.unavailableProviders).toContain("openai");
      expect(result.unavailableProviders).toContain("zai");
      expect(result.availableProviders).toHaveLength(0);
    });

    it("should return provider status with correct availability flag", () => {
      process.env.OPENAI_API_KEY = "sk-test";
      delete process.env.ZAI_API_KEY;
      
      const result = validateApiKeysOnStartup(VALID_CONFIG, false);
      
      const openaiStatus = result.providers.find(p => p.provider === "openai");
      const zaiStatus = result.providers.find(p => p.provider === "zai");
      
      expect(openaiStatus?.available).toBe(true);
      expect(zaiStatus?.available).toBe(false);
      expect(zaiStatus?.reason).toContain("ZAI_API_KEY");
    });

    it("should include environment variable name in provider status", () => {
      delete process.env.OPENAI_API_KEY;
      
      const result = validateApiKeysOnStartup(VALID_CONFIG, false);
      
      const openaiStatus = result.providers.find(p => p.provider === "openai");
      expect(openaiStatus?.envVar).toBe("OPENAI_API_KEY");
    });

    it("should generate warnings for missing API keys", () => {
      delete process.env.OPENAI_API_KEY;
      
      const result = validateApiKeysOnStartup(VALID_CONFIG, false);
      
      expect(result.warnings.some(w => w.includes("openai"))).toBe(true);
      expect(result.warnings.some(w => w.includes("OPENAI_API_KEY"))).toBe(true);
    });

    it("should not generate warnings when all API keys are present", () => {
      process.env.OPENAI_API_KEY = "sk-test";
      process.env.ZAI_API_KEY = "zai-test";
      
      const result = validateApiKeysOnStartup(VALID_CONFIG, false);
      
      expect(result.warnings).toHaveLength(0);
    });

    it("should treat empty string API key as missing", () => {
      process.env.OPENAI_API_KEY = "";
      
      const result = validateApiKeysOnStartup(VALID_CONFIG, false);
      
      expect(result.unavailableProviders).toContain("openai");
    });

    it("should treat whitespace-only API key as missing", () => {
      process.env.OPENAI_API_KEY = "   ";
      
      const result = validateApiKeysOnStartup(VALID_CONFIG, false);
      
      expect(result.unavailableProviders).toContain("openai");
    });
  });

  describe("getProviderApiKeyEnvVar", () => {
    it("should return correct env var for known providers", () => {
      expect(getProviderApiKeyEnvVar("openai")).toBe("OPENAI_API_KEY");
      expect(getProviderApiKeyEnvVar("anthropic")).toBe("ANTHROPIC_API_KEY");
      expect(getProviderApiKeyEnvVar("zai")).toBe("ZAI_API_KEY");
      expect(getProviderApiKeyEnvVar("gemini")).toBe("GEMINI_API_KEY");
    });

    it("should return correct env var for OpenRouter variants", () => {
      expect(getProviderApiKeyEnvVar("openai-openrouter")).toBe("OPENROUTER_API_KEY");
      expect(getProviderApiKeyEnvVar("anthropic-openrouter")).toBe("OPENROUTER_API_KEY");
    });

    it("should return undefined for unknown providers", () => {
      expect(getProviderApiKeyEnvVar("unknown-provider")).toBeUndefined();
    });
  });

  describe("getProviderApiKeyMappings", () => {
    it("should return all provider API key mappings", () => {
      const mappings = getProviderApiKeyMappings();
      
      expect(mappings.openai).toBe("OPENAI_API_KEY");
      expect(mappings.anthropic).toBe("ANTHROPIC_API_KEY");
      expect(mappings.zai).toBe("ZAI_API_KEY");
      expect(mappings.gemini).toBe("GEMINI_API_KEY");
      expect(mappings["openai-openrouter"]).toBe("OPENROUTER_API_KEY");
    });

    it("should return a copy that does not affect the original", () => {
      const mappings = getProviderApiKeyMappings();
      mappings.openai = "MODIFIED";
      
      const newMappings = getProviderApiKeyMappings();
      expect(newMappings.openai).toBe("OPENAI_API_KEY");
    });
  });

  describe("model name validation (Requirements 15.4)", () => {
    it("should accept valid model names for providers", () => {
      const validConfig: ArchitectConfig = {
        ...VALID_CONFIG,
        models: {
          legacy_analysis: [
            { model: "glm-4.6", provider: "zai" },
            { model: "gpt-5.2", provider: "openai" },
          ],
          architect: [
            { model: "claude-opus-4-5", provider: "anthropic" },
          ],
          aggregator: {
            model: "gpt-5.2-pro",
            provider: "openai",
          },
        },
      };
      
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validConfig));
      
      // Should not throw
      expect(() => loadArchitectConfig({ configPath: mockConfigPath })).not.toThrow();
    });

    it("should throw error for invalid model name for provider", () => {
      const invalidConfig: ArchitectConfig = {
        ...VALID_CONFIG,
        models: {
          ...VALID_CONFIG.models,
          legacy_analysis: [
            { model: "invalid-model", provider: "openai" },
          ],
        },
      };
      
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(invalidConfig));
      
      expect(() => loadArchitectConfig({ configPath: mockConfigPath }))
        .toThrow(/Invalid model "invalid-model" for provider "openai"/);
    });

    it("should include valid models in error message", () => {
      const invalidConfig: ArchitectConfig = {
        ...VALID_CONFIG,
        models: {
          ...VALID_CONFIG.models,
          architect: [
            { model: "gpt-4", provider: "openai" },
          ],
        },
      };
      
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(invalidConfig));
      
      expect(() => loadArchitectConfig({ configPath: mockConfigPath }))
        .toThrow(/Valid models for openai: gpt-5\.2, gpt-5\.2-pro/);
    });

    it("should validate model names for OpenRouter variants", () => {
      const invalidConfig: ArchitectConfig = {
        ...VALID_CONFIG,
        models: {
          ...VALID_CONFIG.models,
          security: [
            { model: "invalid-claude", provider: "anthropic-openrouter" },
          ],
        },
      };
      
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(invalidConfig));
      
      expect(() => loadArchitectConfig({ configPath: mockConfigPath }))
        .toThrow(/Invalid model "invalid-claude" for provider "anthropic-openrouter"/);
    });

    it("should validate aggregator model name", () => {
      const invalidConfig: ArchitectConfig = {
        ...VALID_CONFIG,
        models: {
          ...VALID_CONFIG.models,
          aggregator: {
            model: "invalid-aggregator-model",
            provider: "openai",
          },
        },
      };
      
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(invalidConfig));
      
      expect(() => loadArchitectConfig({ configPath: mockConfigPath }))
        .toThrow(/Invalid model "invalid-aggregator-model" for provider "openai"/);
    });

    it("should not throw when throwOnError is false", () => {
      const invalidConfig: ArchitectConfig = {
        ...VALID_CONFIG,
        models: {
          ...VALID_CONFIG.models,
          legacy_analysis: [
            { model: "invalid-model", provider: "openai" },
          ],
        },
      };
      
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(invalidConfig));
      
      // Should not throw when throwOnError is false
      expect(() => loadArchitectConfig({ configPath: mockConfigPath, throwOnError: false })).not.toThrow();
    });

    it("should include model validation errors in validateConfig result", () => {
      process.env.INDEXER_API_KEY = "test-key";
      
      const invalidConfig: ArchitectConfig = {
        ...VALID_CONFIG,
        models: {
          ...VALID_CONFIG.models,
          legacy_analysis: [
            { model: "invalid-model", provider: "openai" },
          ],
        },
      };
      
      const result = validateConfig(invalidConfig);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("Invalid model"))).toBe(true);
    });

    it("should validate multiple invalid models", () => {
      const invalidConfig: ArchitectConfig = {
        ...VALID_CONFIG,
        models: {
          legacy_analysis: [
            { model: "bad-model-1", provider: "openai" },
            { model: "bad-model-2", provider: "zai" },
          ],
          architect: [
            { model: "bad-model-3", provider: "anthropic" },
          ],
          aggregator: {
            model: "gpt-5.2-pro",
            provider: "openai",
          },
        },
      };
      
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(invalidConfig));
      
      try {
        loadArchitectConfig({ configPath: mockConfigPath });
        expect.fail("Should have thrown");
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain("bad-model-1");
        expect(message).toContain("bad-model-2");
        expect(message).toContain("bad-model-3");
      }
    });
  });
});


describe("getEndpointTimeout (Requirements 24.4)", () => {
  describe("exact path matching", () => {
    it("should return configured timeout for exact path match", () => {
      const timeout = getEndpointTimeout("POST", "/api/v1/pipeline/run");
      expect(timeout).toBe(ENDPOINT_TIMEOUTS["POST /api/v1/pipeline/run"]);
    });

    it("should return configured timeout for GET health endpoint", () => {
      const timeout = getEndpointTimeout("GET", "/health");
      expect(timeout).toBe(ENDPOINT_TIMEOUTS["GET /health"]);
    });

    it("should return configured timeout for POST index/ensure", () => {
      const timeout = getEndpointTimeout("POST", "/api/v1/index/ensure");
      expect(timeout).toBe(ENDPOINT_TIMEOUTS["POST /api/v1/index/ensure"]);
    });

    it("should be case-insensitive for HTTP method", () => {
      const timeout1 = getEndpointTimeout("post", "/api/v1/pipeline/run");
      const timeout2 = getEndpointTimeout("POST", "/api/v1/pipeline/run");
      const timeout3 = getEndpointTimeout("Post", "/api/v1/pipeline/run");
      
      expect(timeout1).toBe(timeout2);
      expect(timeout2).toBe(timeout3);
    });
  });

  describe("wildcard path matching", () => {
    it("should match wildcard patterns for path parameters", () => {
      const timeout = getEndpointTimeout("GET", "/api/v1/pipeline/status/abc-123");
      expect(timeout).toBe(ENDPOINT_TIMEOUTS["GET /api/v1/pipeline/status/*"]);
    });

    it("should match wildcard patterns for result endpoint", () => {
      const timeout = getEndpointTimeout("GET", "/api/v1/pipeline/result/run-456");
      expect(timeout).toBe(ENDPOINT_TIMEOUTS["GET /api/v1/pipeline/result/*"]);
    });

    it("should match wildcard patterns for progress endpoint", () => {
      const timeout = getEndpointTimeout("GET", "/api/v1/pipeline/progress/xyz-789");
      expect(timeout).toBe(ENDPOINT_TIMEOUTS["GET /api/v1/pipeline/progress/*"]);
    });
  });

  describe("default timeout fallback", () => {
    it("should return default HTTP_REQUEST timeout for unknown endpoints", () => {
      const timeout = getEndpointTimeout("GET", "/api/v1/unknown/endpoint");
      expect(timeout).toBe(TIMEOUTS.HTTP_REQUEST);
    });

    it("should return default timeout for unknown HTTP methods", () => {
      const timeout = getEndpointTimeout("DELETE", "/api/v1/pipeline/run");
      expect(timeout).toBe(TIMEOUTS.HTTP_REQUEST);
    });

    it("should return default timeout for paths not in config", () => {
      const timeout = getEndpointTimeout("POST", "/custom/endpoint");
      expect(timeout).toBe(TIMEOUTS.HTTP_REQUEST);
    });
  });

  describe("endpoint timeout values", () => {
    it("should have longer timeout for pipeline/run than status check", () => {
      const runTimeout = getEndpointTimeout("POST", "/api/v1/pipeline/run");
      const statusTimeout = getEndpointTimeout("GET", "/api/v1/pipeline/status/123");
      
      expect(runTimeout).toBeGreaterThan(statusTimeout);
    });

    it("should have longer timeout for index/ensure than health check", () => {
      const indexTimeout = getEndpointTimeout("POST", "/api/v1/index/ensure");
      const healthTimeout = getEndpointTimeout("GET", "/health");
      
      expect(indexTimeout).toBeGreaterThan(healthTimeout);
    });

    it("should have short timeout for health endpoints", () => {
      const healthTimeout = getEndpointTimeout("GET", "/health");
      const liveTimeout = getEndpointTimeout("GET", "/health/live");
      
      expect(healthTimeout).toBeLessThanOrEqual(10000);
      expect(liveTimeout).toBeLessThanOrEqual(10000);
    });
  });
});
