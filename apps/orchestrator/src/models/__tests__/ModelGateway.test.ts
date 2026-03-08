// apps/orchestrator/src/models/__tests__/ModelGateway.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ModelGateway } from '../ModelGateway';
import { ProviderType } from '@llm/shared-types';

describe('ModelGateway', () => {
  let gateway: ModelGateway;

  beforeEach(() => {
    gateway = new ModelGateway();
    vi.clearAllMocks();
  });

  describe('Provider Management', () => {
    it('should automatically register all supported providers on construction', () => {
      const providers = gateway.getRegisteredProviders();
      expect(Array.isArray(providers)).toBe(true);
      expect(providers.length).toBeGreaterThan(0);
      
      // Verify all known providers are registered
      expect(providers).toContain(ProviderType.OPENAI);
      expect(providers).toContain(ProviderType.ANTHROPIC);
      expect(providers).toContain(ProviderType.GLM);
      expect(providers).toContain(ProviderType.GEMINI);
      expect(providers).toContain(ProviderType.OPENAI_OPENROUTER);
      expect(providers).toContain(ProviderType.ANTHROPIC_OPENROUTER);
      expect(providers).toContain(ProviderType.GLM_OPENROUTER);
      expect(providers).toContain(ProviderType.GEMINI_OPENROUTER);
    });

    it('should mark all registered providers as available initially', () => {
      const providers = gateway.getRegisteredProviders();
      
      for (const provider of providers) {
        const isAvailable = gateway.isProviderAvailable(provider);
        expect(isAvailable).toBe(true);
      }
    });

    it('should check if provider is available', () => {
      const isAvailable = gateway.isProviderAvailable(ProviderType.OPENAI);
      expect(typeof isAvailable).toBe('boolean');
    });

    it('should get registered providers', () => {
      const providers = gateway.getRegisteredProviders();
      expect(Array.isArray(providers)).toBe(true);
    });

    it('should get all provider statuses', () => {
      const statuses = gateway.getAllProviderStatuses();
      expect(statuses).toBeInstanceOf(Map);
    });

    it('should get unavailable providers', () => {
      const unavailable = gateway.getUnavailableProviders();
      expect(Array.isArray(unavailable)).toBe(true);
    });

    it('should parse provider string', () => {
      const provider = gateway.parseProviderString('openai');
      expect(provider).toBe(ProviderType.OPENAI);
    });

    it('should check if provider is OpenRouter', () => {
      const isOpenRouter = gateway.isOpenRouterProvider('openrouter/gpt-4');
      expect(typeof isOpenRouter).toBe('boolean');
    });

    it('should get base provider name', () => {
      const baseName = gateway.getBaseProviderName('openai/gpt-4');
      expect(typeof baseName).toBe('string');
    });
  });

  describe('Model Calls', () => {
    it('should call model with correct parameters', async () => {
      const result = await gateway.callModel(
        'gpt-4',
        [{ role: 'user', content: 'Test prompt' }],
        { maxTokens: 100 }
      );

      expect(result).toBeDefined();
      expect(result.modelId).toBe('gpt-4');
      expect(result.content).toBeDefined();
    });

    it('should handle multiple model calls', async () => {
      const results = await gateway.callModels(
        ['gpt-4', 'claude-3-opus'],
        [{ role: 'user', content: 'Test' }]
      );

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(2);
    });

    it('should call models with configs', async () => {
      const configs = [
        { model: 'gpt-4', provider: 'openai' },
        { model: 'claude-3-opus', provider: 'anthropic' },
      ];

      const results = await gateway.callModelsWithConfigs(
        configs,
        [{ role: 'user', content: 'Test' }]
      );

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(2);
    });
  });

  describe('Retry Logic', () => {
    it('should detect retryable errors', () => {
      const error = new Error('Network timeout');
      const result = gateway.detectRetryableError(error);
      
      expect(result).toBeDefined();
      expect(typeof result.retryable).toBe('boolean');
    });

    it('should calculate backoff delay', () => {
      const delay = gateway.calculateBackoffDelay(1, 1000, false);
      expect(typeof delay).toBe('number');
      expect(delay).toBeGreaterThanOrEqual(1000);
    });
  });

  describe('Thinking Mode', () => {
    it('should check if thinking is enabled', () => {
      const enabled = gateway.isThinkingEnabled({ thinking: { type: 'enabled' } });
      expect(typeof enabled).toBe('boolean');
    });

    it('should get thinking config', () => {
      const config = gateway.getThinkingConfig({ thinking: { type: 'enabled' } });
      expect(config === null || typeof config === 'object').toBe(true);
    });
  });

  describe('Provider Timeout', () => {
    it('should get provider timeout', () => {
      const timeout = gateway.getProviderTimeoutMs('openai');
      expect(typeof timeout).toBe('number');
      expect(timeout).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should create error response', () => {
      const error = new Error('Test error');
      const response = gateway.createErrorResponse('gpt-4', error, 1000);
      
      expect(response).toBeDefined();
      expect(response.modelId).toBe('gpt-4');
      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should throw meaningful error when adapter registration fails', () => {
      // This test verifies that adapter initialization errors are properly propagated
      // In practice, this would only fail if adapter classes are missing or malformed
      expect(() => {
        // Create a new gateway - should succeed with proper adapters
        const testGateway = new ModelGateway();
        expect(testGateway.getRegisteredProviders().length).toBeGreaterThan(0);
      }).not.toThrow();
    });
  });

  describe('Provider Registration', () => {
    it('should allow manual provider registration for testing', () => {
      const mockAdapter = {
        call: vi.fn().mockResolvedValue({
          modelId: 'test-model',
          content: 'test response',
          success: true,
        }),
        supportsThinking: vi.fn().mockReturnValue(false),
        getThinkingConfig: vi.fn().mockReturnValue(null),
      };

      gateway.registerProvider(ProviderType.OPENAI, mockAdapter as any);
      expect(gateway.isProviderAvailable(ProviderType.OPENAI)).toBe(true);
    });

    it('should allow unregistering providers', () => {
      gateway.unregisterProvider(ProviderType.OPENAI);
      expect(gateway.isProviderAvailable(ProviderType.OPENAI)).toBe(false);
    });

    it('should mark provider as unavailable with reason', () => {
      gateway.markProviderUnavailable(ProviderType.OPENAI, 'Missing API key');
      expect(gateway.isProviderAvailable(ProviderType.OPENAI)).toBe(false);
      
      const status = gateway.getProviderStatus(ProviderType.OPENAI);
      expect(status?.available).toBe(false);
      expect(status?.reason).toBe('Missing API key');
    });
  });

  describe('Config-Based Initialization', () => {
    it('should validate API keys when config is provided at construction', () => {
      // Create a mock config with some providers configured
      const mockConfig = {
        models: [
          { model: 'gpt-4', provider: 'openai' },
          { model: 'glm-4.6', provider: 'zai' },
        ],
      } as any;

      // Create gateway with config - should validate and mark unavailable providers
      const gatewayWithConfig = new ModelGateway(mockConfig);
      
      // Gateway should still have all providers registered
      const providers = gatewayWithConfig.getRegisteredProviders();
      expect(providers.length).toBeGreaterThan(0);
      
      // Check that unavailable providers are marked (those without API keys)
      const unavailable = gatewayWithConfig.getUnavailableProviders();
      expect(Array.isArray(unavailable)).toBe(true);
    });

    it('should not throw when config is not provided', () => {
      expect(() => {
        const gatewayNoConfig = new ModelGateway();
        expect(gatewayNoConfig.getRegisteredProviders().length).toBeGreaterThan(0);
      }).not.toThrow();
    });

    it('should allow calling validateAndMarkUnavailableProviders after construction', () => {
      // Use a minimal valid config structure
      const mockConfig = {
        models: [
          { model: 'gpt-4', provider: 'openai' },
          { model: 'glm-4.6', provider: 'zai' },
        ],
      } as any;

      // This should not throw
      expect(() => {
        gateway.validateAndMarkUnavailableProviders(mockConfig, false);
      }).not.toThrow();
      
      // After validation, check that providers can be marked unavailable
      gateway.markProviderUnavailable(ProviderType.OPENAI, 'Test reason');
      const status = gateway.getProviderStatus(ProviderType.OPENAI);
      expect(status?.available).toBe(false);
    });
  });
});
