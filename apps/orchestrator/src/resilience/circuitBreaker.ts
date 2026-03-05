// apps/orchestrator/src/resilience/circuitBreaker.ts

import CircuitBreaker from 'opossum';
import { EventEmitter } from 'events';

// Type definitions for opossum if @types/opossum is not available
type CircuitBreakerStats = {
  failures: number;
  successes: number;
  rejects: number;
  fires: number;
  timeouts: number;
  cacheHits: number;
  cacheMisses: number;
  semaphoreRejections: number;
  percentiles: Record<string, number>;
  latencyMean: number;
  latencyTimes: number[];
};

export type ProviderName = 'openai' | 'anthropic' | 'zai' | 'gemini' | 'openrouter';

export interface CircuitBreakerConfig {
  volumeThreshold: number;    // Minimum requests before calculating failure rate
  failureThreshold: number;   // Failure rate percentage to trip circuit
  timeout: number;            // Time in ms before timing out
  resetTimeout: number;       // Time in ms before attempting to close circuit
  rollingCountTimeout: number; // Time window for failure rate calculation
}

const defaultConfig: CircuitBreakerConfig = {
  volumeThreshold: 10,
  failureThreshold: 50,       // 50% failure rate
  timeout: 30000,             // 30 seconds
  resetTimeout: 60000,        // 1 minute
  rollingCountTimeout: 60000, // 1 minute window
};

// Provider-specific configs
const providerConfigs: Partial<Record<ProviderName, Partial<CircuitBreakerConfig>>> = {
  openai: {
    timeout: 60000,
    resetTimeout: 120000,
  },
  anthropic: {
    timeout: 45000,
    resetTimeout: 90000,
  },
  zai: {
    timeout: 30000,
    resetTimeout: 60000,
  },
  gemini: {
    timeout: 45000,
    resetTimeout: 90000,
  },
  openrouter: {
    timeout: 60000,
    resetTimeout: 120000,
  },
};

class CircuitBreakerManager extends EventEmitter {
  private breakers: Map<ProviderName, CircuitBreaker> = new Map();
  private states: Map<ProviderName, any> = new Map();

  /**
   * Circuit breaker oluşturur veya mevcut olanı döndürür.
   */
  getBreaker(
    provider: ProviderName,
    fn: (...args: any[]) => Promise<any>,
    customConfig?: Partial<CircuitBreakerConfig>
  ): CircuitBreaker {
    if (this.breakers.has(provider)) {
      return this.breakers.get(provider)!;
    }

    const config = {
      ...defaultConfig,
      ...providerConfigs[provider],
      ...customConfig,
    };

    const breaker = new CircuitBreaker(fn, {
      timeout: config.timeout,
      errorThresholdPercentage: config.failureThreshold,
      resetTimeout: config.resetTimeout,
      volumeThreshold: config.volumeThreshold,
      rollingCountTimeout: config.rollingCountTimeout,
    });

    // Event listeners
    breaker.on('open', () => {
      this.emit('circuit:open', { provider, timestamp: Date.now() });
      console.warn(`[CircuitBreaker] ${provider} circuit OPENED`);
    });

    breaker.on('halfOpen', () => {
      this.emit('circuit:halfOpen', { provider, timestamp: Date.now() });
      console.info(`[CircuitBreaker] ${provider} circuit HALF-OPEN`);
    });

    breaker.on('close', () => {
      this.emit('circuit:close', { provider, timestamp: Date.now() });
      console.info(`[CircuitBreaker] ${provider} circuit CLOSED`);
    });

    breaker.on('fallback', (result: any) => {
      this.emit('circuit:fallback', { provider, result });
      console.warn(`[CircuitBreaker] ${provider} using FALLBACK`);
    });

    breaker.on('failure', (error: any) => {
      this.emit('circuit:failure', { provider, error });
    });

    breaker.on('timeout', () => {
      this.emit('circuit:timeout', { provider });
      console.warn(`[CircuitBreaker] ${provider} TIMEOUT`);
    });

    this.breakers.set(provider, breaker);
    return breaker;
  }

  /**
   * Provider durumunu döndürür.
   */
  getStats(provider: ProviderName): any | undefined {
    const breaker = this.breakers.get(provider);
    return breaker?.stats;
  }

  /**
   * Tüm provider durumlarını döndürür.
   */
  getAllStats(): Map<ProviderName, any> {
    const stats = new Map<ProviderName, any>();
    this.breakers.forEach((breaker, provider) => {
      stats.set(provider, breaker.stats);
    });
    return stats;
  }

  /**
   * Provider'ın kullanılabilir olup olmadığını kontrol eder.
   */
  isAvailable(provider: ProviderName): boolean {
    const breaker = this.breakers.get(provider);
    if (!breaker) return true;
    return !breaker.opened;
  }

  /**
   * Kullanılabilir provider'ları listeler.
   */
  getAvailableProviders(): ProviderName[] {
    const available: ProviderName[] = [];
    this.breakers.forEach((breaker, provider) => {
      if (!breaker.opened) {
        available.push(provider);
      }
    });
    return available;
  }

  /**
   * Circuit breaker'ı manuel olarak resetler.
   */
  async reset(provider: ProviderName): Promise<void> {
    const breaker = this.breakers.get(provider);
    if (breaker) {
      await breaker.close();
    }
  }

  /**
   * Tüm circuit breaker'ları kapatır.
   */
  async shutdown(): Promise<void> {
    const promises: Promise<void>[] = [];
    this.breakers.forEach((breaker) => {
      promises.push(Promise.resolve(breaker.shutdown()));
    });
    await Promise.all(promises);
  }
}

// Singleton instance
export const circuitBreakerManager = new CircuitBreakerManager();
