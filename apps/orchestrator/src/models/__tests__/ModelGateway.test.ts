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
  });
});
