// apps/orchestrator/src/resilience/gracefulDegradation.ts

import { circuitBreakerManager } from './circuitBreaker';

export enum DegradationLevel {
  FULL = 'full',           // All features available
  DEGRADED = 'degraded',   // Some features limited
  MINIMAL = 'minimal',     // Only critical features
  EMERGENCY = 'emergency', // Fallback responses only
}

export interface ServiceHealth {
  provider: string;
  available: boolean;
  latency?: number;
  errorRate?: number;
  lastCheck: number;
}

export class GracefulDegradationManager {
  private currentLevel: DegradationLevel = DegradationLevel.FULL;
  private serviceHealth: Map<string, ServiceHealth> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startHealthChecks();
  }

  /**
   * Mevcut degradation seviyesini döndürür.
   */
  getLevel(): DegradationLevel {
    return this.currentLevel;
  }

  /**
   * Servis durumuna göre degradation seviyesini günceller.
   */
  updateLevel(): void {
    const availableProviders = circuitBreakerManager.getAvailableProviders();
    const totalProviders = 5; // openai, anthropic, zai, gemini, openrouter

    const availableRatio = availableProviders.length / totalProviders;

    if (availableRatio >= 0.8) {
      this.currentLevel = DegradationLevel.FULL;
    } else if (availableRatio >= 0.5) {
      this.currentLevel = DegradationLevel.DEGRADED;
    } else if (availableRatio >= 0.2) {
      this.currentLevel = DegradationLevel.MINIMAL;
    } else {
      this.currentLevel = DegradationLevel.EMERGENCY;
    }

    console.info(`[Degradation] Level updated to: ${this.currentLevel}`);
  }

  /**
   * Özelliğin kullanılabilir olup olmadığını kontrol eder.
   */
  isFeatureAvailable(feature: string): boolean {
    const featureRequirements: Record<string, DegradationLevel[]> = {
      'full_analysis': [DegradationLevel.FULL, DegradationLevel.DEGRADED],
      'quick_diagnostic': [DegradationLevel.FULL, DegradationLevel.DEGRADED, DegradationLevel.MINIMAL],
      'spec_generation': [DegradationLevel.FULL],
      'refinement': [DegradationLevel.FULL, DegradationLevel.DEGRADED],
      'semantic_search': [DegradationLevel.FULL, DegradationLevel.DEGRADED, DegradationLevel.MINIMAL],
      'basic_query': [DegradationLevel.FULL, DegradationLevel.DEGRADED, DegradationLevel.MINIMAL, DegradationLevel.EMERGENCY],
    };

    const allowedLevels = featureRequirements[feature] || [DegradationLevel.FULL];
    return allowedLevels.includes(this.currentLevel);
  }

  /**
   * Seviyeye göre response döndürür.
   */
  getDegradedResponse(feature: string): any {
    const responses: Record<DegradationLevel, Record<string, any>> = {
      [DegradationLevel.FULL]: {},
      [DegradationLevel.DEGRADED]: {
        message: 'Service is operating with limited capacity. Some features may be slower.',
        availableProviders: circuitBreakerManager.getAvailableProviders(),
      },
      [DegradationLevel.MINIMAL]: {
        message: 'Service is in minimal mode. Only basic features are available.',
        availableFeatures: ['quick_diagnostic', 'semantic_search'],
      },
      [DegradationLevel.EMERGENCY]: {
        message: 'Service is experiencing issues. Please try again later.',
        status: 'degraded',
      },
    };

    return responses[this.currentLevel];
  }

  /**
   * Periyodik sağlık kontrolü başlatır.
   */
  private startHealthChecks(): void {
    this.checkInterval = setInterval(() => {
      this.updateLevel();
    }, 30000); // Her 30 saniyede
  }

  /**
   * Cleanup.
   */
  shutdown(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }
}

// Singleton
export const gracefulDegradation = new GracefulDegradationManager();
