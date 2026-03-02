/**
 * Domain Discovery Engine Configuration Types
 * Schema Version: 1.0.0
 * 
 * Configuration types for the Domain Discovery Engine.
 * These types define how discovery behavior can be customized.
 */

/**
 * Signal weight configuration for different signal types
 */
export interface SignalWeightConfig {
  /** File pattern weights by directory name */
  filePatterns: Record<string, number>;
  /** Dependency weights by package name */
  dependencies: Record<string, number>;
  /** Framework weights by framework name */
  frameworks: Record<string, number>;
}

/**
 * Discovery engine behavior configuration
 */
export interface DiscoveryBehaviorConfig {
  /** Maximum retry attempts on failure */
  maxRetries: number;
  /** Base backoff delay in milliseconds (exponential backoff) */
  baseBackoffMs: number;
  /** Confidence threshold for low-confidence warnings (0.0 - 1.0) */
  lowConfidenceThreshold: number;
  /** Maximum depth for directory traversal */
  maxDirectoryDepth: number;
  /** Maximum evidence items per domain */
  maxEvidencePerDomain: number;
  /** Enable pattern matching cache for performance */
  enablePatternCache: boolean;
  /** Cache TTL in milliseconds (0 = no expiration) */
  cacheTTLMs: number;
}

/**
 * Performance tuning configuration
 */
export interface PerformanceConfig {
  /** Enable performance metrics collection */
  enableMetrics: boolean;
  /** Enable detailed timing breakdowns */
  enableDetailedTiming: boolean;
  /** Batch size for signal processing */
  signalBatchSize: number;
  /** Enable parallel processing where applicable */
  enableParallelProcessing: boolean;
}

/**
 * Complete discovery engine configuration
 */
export interface DiscoveryConfig {
  /** Signal weight configuration */
  signalWeights: SignalWeightConfig;
  /** Discovery behavior configuration */
  behavior: DiscoveryBehaviorConfig;
  /** Performance tuning configuration */
  performance: PerformanceConfig;
}
