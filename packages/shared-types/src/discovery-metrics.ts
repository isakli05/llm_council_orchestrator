/**
 * Domain Discovery Engine Metrics Types
 * Schema Version: 1.0.0
 * 
 * Metrics types for monitoring and observability of the discovery engine.
 * Compatible with OpenTelemetry and Prometheus formats.
 */

/**
 * Timing breakdown for discovery phases
 */
export interface DiscoveryTimingMetrics {
  /** Total discovery time in milliseconds */
  totalMs: number;
  /** Signal extraction time */
  signalExtractionMs: number;
  /** Domain classification time */
  classificationMs: number;
  /** User exclusion application time */
  exclusionApplicationMs: number;
  /** Validation time */
  validationMs: number;
  /** Overhead time (logging, metrics, etc.) */
  overheadMs: number;
}

/**
 * Signal quality metrics
 */
export interface SignalQualityMetrics {
  /** Total signals extracted */
  totalSignals: number;
  /** Signals by type */
  signalsByType: Record<string, number>;
  /** Average signal weight */
  averageWeight: number;
  /** Min/max signal weights */
  minWeight: number;
  maxWeight: number;
  /** Unique signal sources */
  uniqueSources: number;
}

/**
 * Domain quality metrics
 */
export interface DomainQualityMetrics {
  /** Total domains discovered */
  totalDomains: number;
  /** Domains by analysis depth */
  domainsByDepth: {
    deep: number;
    excluded: number;
  };
  /** Average domain confidence */
  averageConfidence: number;
  /** Min/max confidence scores */
  minConfidence: number;
  maxConfidence: number;
  /** Domains with low confidence (< threshold) */
  lowConfidenceDomains: number;
  /** Domains with sub-domains */
  domainsWithSubDomains: number;
  /** Total sub-domains */
  totalSubDomains: number;
}

/**
 * Reliability metrics
 */
export interface ReliabilityMetrics {
  /** Number of retry attempts */
  retryAttempts: number;
  /** Whether fallback was applied */
  fallbackApplied: boolean;
  /** Validation failures */
  validationFailures: number;
  /** Success rate (0.0 - 1.0) */
  successRate: number;
}

/**
 * Resource usage metrics
 */
export interface ResourceMetrics {
  /** Index chunks analyzed */
  indexChunksAnalyzed: number;
  /** Files analyzed */
  filesAnalyzed: number;
  /** Dependencies analyzed */
  dependenciesAnalyzed: number;
  /** Frameworks detected */
  frameworksDetected: number;
  /** Directory nodes traversed */
  directoryNodesTraversed: number;
  /** Peak memory usage in MB (if available) */
  peakMemoryMB?: number;
}

/**
 * Complete metrics snapshot
 */
export interface DiscoveryMetrics {
  /** Unique metrics ID */
  metricsId: string;
  /** Timestamp of metrics collection */
  timestamp: string;
  /** Timing breakdown */
  timing: DiscoveryTimingMetrics;
  /** Signal quality */
  signalQuality: SignalQualityMetrics;
  /** Domain quality */
  domainQuality: DomainQualityMetrics;
  /** Reliability */
  reliability: ReliabilityMetrics;
  /** Resource usage */
  resources: ResourceMetrics;
}

/**
 * Cache statistics for monitoring
 */
export interface CacheStatistics {
  /** Total cache hits */
  hits: number;
  /** Total cache misses */
  misses: number;
  /** Hit rate (0.0 - 1.0) */
  hitRate: number;
  /** Current cache size */
  size: number;
  /** Maximum cache size */
  maxSize: number;
  /** Number of evictions */
  evictions: number;
  /** Number of expired entries */
  expirations: number;
}
