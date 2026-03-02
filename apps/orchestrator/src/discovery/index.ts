/**
 * Domain Discovery Engine
 * 
 * Public API for the domain discovery system.
 * Exports all necessary types, classes, and utilities.
 */

// Core components
export { DomainDiscoveryEngine } from './DomainDiscoveryEngine';
export { SignalExtractor } from './SignalExtractor';
export { DomainClassifier } from './DomainClassifier';
export { DomainSpecWriter } from './DomainSpecWriter';

// Types (re-export from shared-types for convenience)
export type {
  Signal,
  Evidence,
  ExclusionMetadata,
  Domain,
  DiscoveryStatistics,
  DiscoveryExecutionMetadata,
  DiscoveryResult,
  DomainExclusion,
  SignalWeightConfig,
  DiscoveryBehaviorConfig,
  PerformanceConfig,
  DiscoveryConfig,
  DiscoveryTimingMetrics,
  SignalQualityMetrics,
  DomainQualityMetrics,
  ReliabilityMetrics,
  ResourceMetrics,
  DiscoveryMetrics,
  CacheStatistics,
} from '@llm/shared-types';

// Local types (not in shared-types)
export type {
  DirectoryNode,
  DependencyInfo,
  IndexMetadata,
  DomainContext,
} from './types';

// Configuration
export {
  DiscoveryConfigManager,
  getGlobalConfig,
  initializeGlobalConfig,
  resetGlobalConfig,
} from './config';

// Metrics
export {
  DiscoveryMetricsCollector,
  MetricsRegistry,
  getGlobalMetricsRegistry,
  resetGlobalMetricsRegistry,
} from './metrics';

// Cache
export {
  LRUCache,
  PatternMatchCache,
  DependencyMappingCache,
  CacheManager,
  getGlobalCacheManager,
  initializeGlobalCacheManager,
  resetGlobalCacheManager,
} from './cache';
