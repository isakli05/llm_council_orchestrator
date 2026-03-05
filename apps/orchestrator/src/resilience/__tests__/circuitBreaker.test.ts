// apps/orchestrator/src/resilience/__tests__/circuitBreaker.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { circuitBreakerManager } from '../circuitBreaker';

describe('CircuitBreaker', () => {
  beforeEach(() => {
    // Reset circuit breakers
    circuitBreakerManager['breakers'].clear();
  });

  it('should create breaker for provider', () => {
    const fn = vi.fn().mockResolvedValue({ success: true });
    const breaker = circuitBreakerManager.getBreaker('openai', fn);

    expect(breaker).toBeDefined();
    expect(circuitBreakerManager.isAvailable('openai')).toBe(true);
  });

  it('should open circuit after failures', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('API Error'));
    const breaker = circuitBreakerManager.getBreaker('anthropic', fn, {
      failureThreshold: 50,
      volumeThreshold: 5,
      timeout: 1000,
    });

    // Trigger failures
    for (let i = 0; i < 10; i++) {
      try {
        await breaker.fire();
      } catch (e) {
        // Expected
      }
    }

    expect(breaker.opened).toBe(true);
    expect(circuitBreakerManager.isAvailable('anthropic')).toBe(false);
  });

  it('should return available providers', () => {
    const fn = vi.fn().mockResolvedValue({});
    
    circuitBreakerManager.getBreaker('openai', fn);
    circuitBreakerManager.getBreaker('anthropic', fn);

    const available = circuitBreakerManager.getAvailableProviders();
    expect(available).toContain('openai');
    expect(available).toContain('anthropic');
  });

  it('should get stats for provider', () => {
    const fn = vi.fn().mockResolvedValue({});
    circuitBreakerManager.getBreaker('gemini', fn);

    const stats = circuitBreakerManager.getStats('gemini');
    expect(stats).toBeDefined();
    expect(stats).toHaveProperty('failures');
    expect(stats).toHaveProperty('successes');
  });

  it('should get all stats', () => {
    const fn = vi.fn().mockResolvedValue({});
    
    circuitBreakerManager.getBreaker('openai', fn);
    circuitBreakerManager.getBreaker('zai', fn);

    const allStats = circuitBreakerManager.getAllStats();
    expect(allStats.size).toBe(2);
    expect(allStats.has('openai')).toBe(true);
    expect(allStats.has('zai')).toBe(true);
  });
});
