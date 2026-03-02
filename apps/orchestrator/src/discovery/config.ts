/**
 * Domain Discovery Engine Configuration
 * 
 * Centralized configuration for discovery engine with environment-aware defaults.
 * Follows enterprise best practices for externalized configuration.
 * 
 * Configuration Priority (highest to lowest):
 * 1. Runtime overrides (passed to constructor)
 * 2. Environment variables
 * 3. Default values
 */

import type {
  SignalWeightConfig,
  DiscoveryBehaviorConfig,
  PerformanceConfig,
  DiscoveryConfig,
} from '@llm/shared-types';

/**
 * Default signal weights
 * These can be overridden via configuration
 */
const DEFAULT_SIGNAL_WEIGHTS: SignalWeightConfig = {
  filePatterns: {
    auth: 0.9,
    payment: 0.9,
    admin: 0.8,
    api: 0.7,
    models: 0.6,
    controllers: 0.6,
    services: 0.6,
    routes: 0.7,
    middleware: 0.6,
    config: 0.5,
    database: 0.6,
    migrations: 0.6,
    tests: 0.4,
    public: 0.5,
    assets: 0.5,
    views: 0.6,
    templates: 0.6,
  },
  dependencies: {
    // Authentication
    passport: 0.9,
    jwt: 0.9,
    jsonwebtoken: 0.9,
    'express-session': 0.8,
    'cookie-parser': 0.7,
    bcrypt: 0.8,
    bcryptjs: 0.8,
    
    // Payment
    stripe: 0.95,
    paypal: 0.95,
    braintree: 0.95,
    square: 0.95,
    
    // API/Web frameworks
    express: 0.8,
    fastify: 0.8,
    koa: 0.8,
    hapi: 0.8,
    nestjs: 0.8,
    '@nestjs/core': 0.8,
    
    // Frontend
    react: 0.8,
    vue: 0.8,
    angular: 0.8,
    '@angular/core': 0.8,
    svelte: 0.8,
    
    // Database
    mongoose: 0.7,
    sequelize: 0.7,
    typeorm: 0.7,
    prisma: 0.7,
    '@prisma/client': 0.7,
    knex: 0.7,
    
    // Testing
    jest: 0.5,
    mocha: 0.5,
    vitest: 0.5,
    cypress: 0.5,
  },
  frameworks: {
    laravel: 0.7,
    express: 0.7,
    django: 0.7,
    flask: 0.7,
    rails: 0.7,
    'spring-boot': 0.7,
    nestjs: 0.7,
  },
};

/**
 * Default behavior configuration
 */
const DEFAULT_BEHAVIOR_CONFIG: DiscoveryBehaviorConfig = {
  maxRetries: 3,
  baseBackoffMs: 1000,
  lowConfidenceThreshold: 0.3,
  maxDirectoryDepth: 10,
  maxEvidencePerDomain: 10,
  enablePatternCache: true,
  cacheTTLMs: 300000, // 5 minutes
};

/**
 * Default performance configuration
 */
const DEFAULT_PERFORMANCE_CONFIG: PerformanceConfig = {
  enableMetrics: true,
  enableDetailedTiming: true,
  signalBatchSize: 100,
  enableParallelProcessing: false, // Conservative default for stability
};

/**
 * Configuration manager for discovery engine
 * Handles loading, merging, and validation of configuration
 */
export class DiscoveryConfigManager {
  private config: DiscoveryConfig;
  
  constructor(overrides?: Partial<DiscoveryConfig>) {
    // Load configuration with priority: overrides > env vars > defaults
    this.config = this.loadConfiguration(overrides);
    this.validateConfiguration();
  }
  
  /**
   * Get current configuration
   */
  getConfig(): Readonly<DiscoveryConfig> {
    return Object.freeze({ ...this.config });
  }
  
  /**
   * Get signal weight for a specific pattern
   * Returns default weight if pattern not found
   */
  getSignalWeight(type: 'filePattern' | 'dependency' | 'framework', pattern: string): number {
    const lowerPattern = pattern.toLowerCase();
    
    switch (type) {
      case 'filePattern':
        return this.config.signalWeights.filePatterns[lowerPattern] ?? 0.5;
      case 'dependency':
        return this.config.signalWeights.dependencies[lowerPattern] ?? 0.5;
      case 'framework':
        return this.config.signalWeights.frameworks[lowerPattern] ?? 0.5;
      default:
        return 0.5;
    }
  }
  
  /**
   * Update configuration at runtime
   * Useful for A/B testing or dynamic tuning
   */
  updateConfig(updates: Partial<DiscoveryConfig>): void {
    this.config = this.mergeConfigs(this.config, updates);
    this.validateConfiguration();
  }
  
  /**
   * Load configuration from multiple sources
   */
  private loadConfiguration(overrides?: Partial<DiscoveryConfig>): DiscoveryConfig {
    // Start with defaults
    const config: DiscoveryConfig = {
      signalWeights: { ...DEFAULT_SIGNAL_WEIGHTS },
      behavior: { ...DEFAULT_BEHAVIOR_CONFIG },
      performance: { ...DEFAULT_PERFORMANCE_CONFIG },
    };
    
    // Apply environment variables
    this.applyEnvironmentVariables(config);
    
    // Apply runtime overrides
    if (overrides) {
      return this.mergeConfigs(config, overrides);
    }
    
    return config;
  }
  
  /**
   * Apply environment variables to configuration
   * Follows 12-factor app principles
   */
  private applyEnvironmentVariables(config: DiscoveryConfig): void {
    // Behavior configuration from env vars
    if (process.env.DISCOVERY_MAX_RETRIES) {
      config.behavior.maxRetries = parseInt(process.env.DISCOVERY_MAX_RETRIES, 10);
    }
    
    if (process.env.DISCOVERY_BASE_BACKOFF_MS) {
      config.behavior.baseBackoffMs = parseInt(process.env.DISCOVERY_BASE_BACKOFF_MS, 10);
    }
    
    if (process.env.DISCOVERY_LOW_CONFIDENCE_THRESHOLD) {
      config.behavior.lowConfidenceThreshold = parseFloat(process.env.DISCOVERY_LOW_CONFIDENCE_THRESHOLD);
    }
    
    if (process.env.DISCOVERY_MAX_DIRECTORY_DEPTH) {
      config.behavior.maxDirectoryDepth = parseInt(process.env.DISCOVERY_MAX_DIRECTORY_DEPTH, 10);
    }
    
    if (process.env.DISCOVERY_ENABLE_PATTERN_CACHE) {
      config.behavior.enablePatternCache = process.env.DISCOVERY_ENABLE_PATTERN_CACHE === 'true';
    }
    
    if (process.env.DISCOVERY_CACHE_TTL_MS) {
      config.behavior.cacheTTLMs = parseInt(process.env.DISCOVERY_CACHE_TTL_MS, 10);
    }
    
    // Performance configuration from env vars
    if (process.env.DISCOVERY_ENABLE_METRICS) {
      config.performance.enableMetrics = process.env.DISCOVERY_ENABLE_METRICS === 'true';
    }
    
    if (process.env.DISCOVERY_ENABLE_DETAILED_TIMING) {
      config.performance.enableDetailedTiming = process.env.DISCOVERY_ENABLE_DETAILED_TIMING === 'true';
    }
    
    if (process.env.DISCOVERY_SIGNAL_BATCH_SIZE) {
      config.performance.signalBatchSize = parseInt(process.env.DISCOVERY_SIGNAL_BATCH_SIZE, 10);
    }
    
    if (process.env.DISCOVERY_ENABLE_PARALLEL_PROCESSING) {
      config.performance.enableParallelProcessing = process.env.DISCOVERY_ENABLE_PARALLEL_PROCESSING === 'true';
    }
  }
  
  /**
   * Deep merge two configuration objects
   */
  private mergeConfigs(base: DiscoveryConfig, overrides: Partial<DiscoveryConfig>): DiscoveryConfig {
    return {
      signalWeights: {
        filePatterns: {
          ...base.signalWeights.filePatterns,
          ...(overrides.signalWeights?.filePatterns || {}),
        },
        dependencies: {
          ...base.signalWeights.dependencies,
          ...(overrides.signalWeights?.dependencies || {}),
        },
        frameworks: {
          ...base.signalWeights.frameworks,
          ...(overrides.signalWeights?.frameworks || {}),
        },
      },
      behavior: {
        ...base.behavior,
        ...(overrides.behavior || {}),
      },
      performance: {
        ...base.performance,
        ...(overrides.performance || {}),
      },
    };
  }
  
  /**
   * Validate configuration values
   * Throws error if configuration is invalid
   */
  private validateConfiguration(): void {
    const { behavior, performance } = this.config;
    
    // Validate behavior config
    if (behavior.maxRetries < 1 || behavior.maxRetries > 10) {
      throw new Error(`Invalid maxRetries: ${behavior.maxRetries}. Must be between 1 and 10.`);
    }
    
    if (behavior.baseBackoffMs < 100 || behavior.baseBackoffMs > 10000) {
      throw new Error(`Invalid baseBackoffMs: ${behavior.baseBackoffMs}. Must be between 100 and 10000.`);
    }
    
    if (behavior.lowConfidenceThreshold < 0 || behavior.lowConfidenceThreshold > 1) {
      throw new Error(`Invalid lowConfidenceThreshold: ${behavior.lowConfidenceThreshold}. Must be between 0 and 1.`);
    }
    
    if (behavior.maxDirectoryDepth < 1 || behavior.maxDirectoryDepth > 50) {
      throw new Error(`Invalid maxDirectoryDepth: ${behavior.maxDirectoryDepth}. Must be between 1 and 50.`);
    }
    
    if (behavior.maxEvidencePerDomain < 1 || behavior.maxEvidencePerDomain > 100) {
      throw new Error(`Invalid maxEvidencePerDomain: ${behavior.maxEvidencePerDomain}. Must be between 1 and 100.`);
    }
    
    if (behavior.cacheTTLMs < 0) {
      throw new Error(`Invalid cacheTTLMs: ${behavior.cacheTTLMs}. Must be non-negative.`);
    }
    
    // Validate performance config
    if (performance.signalBatchSize < 1 || performance.signalBatchSize > 10000) {
      throw new Error(`Invalid signalBatchSize: ${performance.signalBatchSize}. Must be between 1 and 10000.`);
    }
    
    // Validate signal weights (all must be between 0 and 1)
    this.validateWeights(this.config.signalWeights.filePatterns, 'filePatterns');
    this.validateWeights(this.config.signalWeights.dependencies, 'dependencies');
    this.validateWeights(this.config.signalWeights.frameworks, 'frameworks');
  }
  
  /**
   * Validate weight values
   */
  private validateWeights(weights: Record<string, number>, category: string): void {
    for (const [key, weight] of Object.entries(weights)) {
      if (weight < 0 || weight > 1) {
        throw new Error(`Invalid weight for ${category}.${key}: ${weight}. Must be between 0 and 1.`);
      }
    }
  }
}

/**
 * Singleton instance for global configuration access
 * Can be overridden for testing or custom configurations
 */
let globalConfigManager: DiscoveryConfigManager | null = null;

/**
 * Get global configuration manager instance
 * Creates instance with defaults if not already initialized
 */
export function getGlobalConfig(): DiscoveryConfigManager {
  if (!globalConfigManager) {
    globalConfigManager = new DiscoveryConfigManager();
  }
  return globalConfigManager;
}

/**
 * Initialize global configuration with custom settings
 * Should be called once at application startup
 */
export function initializeGlobalConfig(config?: Partial<DiscoveryConfig>): DiscoveryConfigManager {
  globalConfigManager = new DiscoveryConfigManager(config);
  return globalConfigManager;
}

/**
 * Reset global configuration (primarily for testing)
 */
export function resetGlobalConfig(): void {
  globalConfigManager = null;
}
