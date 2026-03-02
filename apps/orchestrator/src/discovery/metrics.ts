/**
 * Domain Discovery Engine Metrics
 * 
 * OpenTelemetry-style metrics collection for monitoring and observability.
 * Follows enterprise best practices for instrumentation.
 * 
 * Metrics Categories:
 * - Performance: Timing, throughput, resource usage
 * - Quality: Confidence scores, signal quality, domain coverage
 * - Reliability: Error rates, retry counts, fallback usage
 * - Business: Domain counts, exclusion rates, discovery success
 */

import type {
  DiscoveryTimingMetrics,
  SignalQualityMetrics,
  DomainQualityMetrics,
  ReliabilityMetrics,
  ResourceMetrics,
  DiscoveryMetrics,
} from '@llm/shared-types';

/**
 * Metrics collector for discovery engine
 * Collects and aggregates metrics during discovery process
 */
export class DiscoveryMetricsCollector {
  private startTime: number;
  private phaseTimings: Map<string, number>;
  private phaseStartTimes: Map<string, number>;
  private signals: Array<{ type: string; weight: number; source: string }>;
  private domains: Array<{ confidence: number; analysisDepth: string; hasSubDomains: boolean }>;
  private retryCount: number;
  private fallbackUsed: boolean;
  private validationFailureCount: number;
  private resourceUsage: Partial<ResourceMetrics>;
  private enabled: boolean;
  
  constructor(enabled: boolean = true) {
    this.enabled = enabled;
    this.startTime = Date.now();
    this.phaseTimings = new Map();
    this.phaseStartTimes = new Map();
    this.signals = [];
    this.domains = [];
    this.retryCount = 0;
    this.fallbackUsed = false;
    this.validationFailureCount = 0;
    this.resourceUsage = {};
  }
  
  /**
   * Start timing a phase
   */
  startPhase(phaseName: string): void {
    if (!this.enabled) return;
    this.phaseStartTimes.set(phaseName, Date.now());
  }
  
  /**
   * End timing a phase
   */
  endPhase(phaseName: string): void {
    if (!this.enabled) return;
    
    const startTime = this.phaseStartTimes.get(phaseName);
    if (startTime) {
      const duration = Date.now() - startTime;
      this.phaseTimings.set(phaseName, duration);
      this.phaseStartTimes.delete(phaseName);
    }
  }
  
  /**
   * Record signal extraction
   */
  recordSignals(signals: Array<{ type: string; weight: number; source: string }>): void {
    if (!this.enabled) return;
    this.signals = signals;
  }
  
  /**
   * Record domain classification
   */
  recordDomains(domains: Array<{ confidence: number; analysisDepth: string; subDomains?: unknown[] }>): void {
    if (!this.enabled) return;
    this.domains = domains.map(d => ({
      confidence: d.confidence,
      analysisDepth: d.analysisDepth,
      hasSubDomains: (d.subDomains?.length || 0) > 0,
    }));
  }
  
  /**
   * Record retry attempt
   */
  recordRetry(): void {
    if (!this.enabled) return;
    this.retryCount++;
  }
  
  /**
   * Record fallback usage
   */
  recordFallback(): void {
    if (!this.enabled) return;
    this.fallbackUsed = true;
  }
  
  /**
   * Record validation failure
   */
  recordValidationFailure(): void {
    if (!this.enabled) return;
    this.validationFailureCount++;
  }
  
  /**
   * Record resource usage
   */
  recordResourceUsage(resources: Partial<ResourceMetrics>): void {
    if (!this.enabled) return;
    this.resourceUsage = { ...this.resourceUsage, ...resources };
  }
  
  /**
   * Generate complete metrics snapshot
   */
  generateMetrics(): DiscoveryMetrics {
    const totalMs = Date.now() - this.startTime;
    
    // Calculate timing breakdown
    const timing: DiscoveryTimingMetrics = {
      totalMs,
      signalExtractionMs: this.phaseTimings.get('signal_extraction') || 0,
      classificationMs: this.phaseTimings.get('classification') || 0,
      exclusionApplicationMs: this.phaseTimings.get('exclusion_application') || 0,
      validationMs: this.phaseTimings.get('validation') || 0,
      overheadMs: 0,
    };
    
    // Calculate overhead (time not accounted for in phases)
    const accountedTime = timing.signalExtractionMs + 
                         timing.classificationMs + 
                         timing.exclusionApplicationMs + 
                         timing.validationMs;
    timing.overheadMs = Math.max(0, totalMs - accountedTime);
    
    // Calculate signal quality metrics
    const signalQuality = this.calculateSignalQuality();
    
    // Calculate domain quality metrics
    const domainQuality = this.calculateDomainQuality();
    
    // Calculate reliability metrics
    const reliability: ReliabilityMetrics = {
      retryAttempts: this.retryCount,
      fallbackApplied: this.fallbackUsed,
      validationFailures: this.validationFailureCount,
      successRate: this.fallbackUsed ? 0.0 : 1.0,
    };
    
    // Compile resource metrics
    const resources: ResourceMetrics = {
      indexChunksAnalyzed: this.resourceUsage.indexChunksAnalyzed || 0,
      filesAnalyzed: this.resourceUsage.filesAnalyzed || 0,
      dependenciesAnalyzed: this.resourceUsage.dependenciesAnalyzed || 0,
      frameworksDetected: this.resourceUsage.frameworksDetected || 0,
      directoryNodesTraversed: this.resourceUsage.directoryNodesTraversed || 0,
      peakMemoryMB: this.resourceUsage.peakMemoryMB,
    };
    
    return {
      metricsId: this.generateMetricsId(),
      timestamp: new Date().toISOString(),
      timing,
      signalQuality,
      domainQuality,
      reliability,
      resources,
    };
  }
  
  /**
   * Calculate signal quality metrics
   */
  private calculateSignalQuality(): SignalQualityMetrics {
    if (this.signals.length === 0) {
      return {
        totalSignals: 0,
        signalsByType: {},
        averageWeight: 0,
        minWeight: 0,
        maxWeight: 0,
        uniqueSources: 0,
      };
    }
    
    // Group signals by type
    const signalsByType: Record<string, number> = {};
    const sources = new Set<string>();
    let totalWeight = 0;
    let minWeight = 1.0;
    let maxWeight = 0.0;
    
    for (const signal of this.signals) {
      signalsByType[signal.type] = (signalsByType[signal.type] || 0) + 1;
      sources.add(signal.source);
      totalWeight += signal.weight;
      minWeight = Math.min(minWeight, signal.weight);
      maxWeight = Math.max(maxWeight, signal.weight);
    }
    
    return {
      totalSignals: this.signals.length,
      signalsByType,
      averageWeight: totalWeight / this.signals.length,
      minWeight,
      maxWeight,
      uniqueSources: sources.size,
    };
  }
  
  /**
   * Calculate domain quality metrics
   */
  private calculateDomainQuality(): DomainQualityMetrics {
    if (this.domains.length === 0) {
      return {
        totalDomains: 0,
        domainsByDepth: { deep: 0, excluded: 0 },
        averageConfidence: 0,
        minConfidence: 0,
        maxConfidence: 0,
        lowConfidenceDomains: 0,
        domainsWithSubDomains: 0,
        totalSubDomains: 0,
      };
    }
    
    let deepCount = 0;
    let excludedCount = 0;
    let totalConfidence = 0;
    let minConfidence = 1.0;
    let maxConfidence = 0.0;
    let lowConfidenceCount = 0;
    let domainsWithSubDomains = 0;
    
    const LOW_CONFIDENCE_THRESHOLD = 0.3;
    
    for (const domain of this.domains) {
      if (domain.analysisDepth === 'DEEP') {
        deepCount++;
      } else if (domain.analysisDepth === 'EXCLUDED') {
        excludedCount++;
      }
      
      totalConfidence += domain.confidence;
      minConfidence = Math.min(minConfidence, domain.confidence);
      maxConfidence = Math.max(maxConfidence, domain.confidence);
      
      if (domain.confidence < LOW_CONFIDENCE_THRESHOLD) {
        lowConfidenceCount++;
      }
      
      if (domain.hasSubDomains) {
        domainsWithSubDomains++;
      }
    }
    
    return {
      totalDomains: this.domains.length,
      domainsByDepth: {
        deep: deepCount,
        excluded: excludedCount,
      },
      averageConfidence: totalConfidence / this.domains.length,
      minConfidence,
      maxConfidence,
      lowConfidenceDomains: lowConfidenceCount,
      domainsWithSubDomains,
      totalSubDomains: 0, // Would need to count actual sub-domains
    };
  }
  
  /**
   * Generate unique metrics ID
   */
  private generateMetricsId(): string {
    return `discovery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Export metrics in Prometheus format
   * Useful for integration with monitoring systems
   */
  exportPrometheusFormat(): string {
    const metrics = this.generateMetrics();
    const lines: string[] = [];
    
    // Timing metrics
    lines.push(`# HELP discovery_duration_ms Total discovery duration in milliseconds`);
    lines.push(`# TYPE discovery_duration_ms gauge`);
    lines.push(`discovery_duration_ms ${metrics.timing.totalMs}`);
    
    lines.push(`# HELP discovery_phase_duration_ms Phase duration in milliseconds`);
    lines.push(`# TYPE discovery_phase_duration_ms gauge`);
    lines.push(`discovery_phase_duration_ms{phase="signal_extraction"} ${metrics.timing.signalExtractionMs}`);
    lines.push(`discovery_phase_duration_ms{phase="classification"} ${metrics.timing.classificationMs}`);
    lines.push(`discovery_phase_duration_ms{phase="exclusion_application"} ${metrics.timing.exclusionApplicationMs}`);
    lines.push(`discovery_phase_duration_ms{phase="validation"} ${metrics.timing.validationMs}`);
    
    // Signal metrics
    lines.push(`# HELP discovery_signals_total Total signals extracted`);
    lines.push(`# TYPE discovery_signals_total gauge`);
    lines.push(`discovery_signals_total ${metrics.signalQuality.totalSignals}`);
    
    lines.push(`# HELP discovery_signal_weight_avg Average signal weight`);
    lines.push(`# TYPE discovery_signal_weight_avg gauge`);
    lines.push(`discovery_signal_weight_avg ${metrics.signalQuality.averageWeight}`);
    
    // Domain metrics
    lines.push(`# HELP discovery_domains_total Total domains discovered`);
    lines.push(`# TYPE discovery_domains_total gauge`);
    lines.push(`discovery_domains_total ${metrics.domainQuality.totalDomains}`);
    
    lines.push(`# HELP discovery_domains_by_depth Domains by analysis depth`);
    lines.push(`# TYPE discovery_domains_by_depth gauge`);
    lines.push(`discovery_domains_by_depth{depth="deep"} ${metrics.domainQuality.domainsByDepth.deep}`);
    lines.push(`discovery_domains_by_depth{depth="excluded"} ${metrics.domainQuality.domainsByDepth.excluded}`);
    
    lines.push(`# HELP discovery_domain_confidence_avg Average domain confidence`);
    lines.push(`# TYPE discovery_domain_confidence_avg gauge`);
    lines.push(`discovery_domain_confidence_avg ${metrics.domainQuality.averageConfidence}`);
    
    // Reliability metrics
    lines.push(`# HELP discovery_retry_attempts_total Total retry attempts`);
    lines.push(`# TYPE discovery_retry_attempts_total counter`);
    lines.push(`discovery_retry_attempts_total ${metrics.reliability.retryAttempts}`);
    
    lines.push(`# HELP discovery_fallback_used Whether fallback was used`);
    lines.push(`# TYPE discovery_fallback_used gauge`);
    lines.push(`discovery_fallback_used ${metrics.reliability.fallbackApplied ? 1 : 0}`);
    
    lines.push(`# HELP discovery_success_rate Discovery success rate`);
    lines.push(`# TYPE discovery_success_rate gauge`);
    lines.push(`discovery_success_rate ${metrics.reliability.successRate}`);
    
    return lines.join('\n');
  }
  
  /**
   * Export metrics in JSON format
   */
  exportJSON(): string {
    return JSON.stringify(this.generateMetrics(), null, 2);
  }
}

/**
 * Global metrics registry for aggregating metrics across multiple discoveries
 */
export class MetricsRegistry {
  private metrics: DiscoveryMetrics[] = [];
  private maxHistorySize: number;
  
  constructor(maxHistorySize: number = 100) {
    this.maxHistorySize = maxHistorySize;
  }
  
  /**
   * Register metrics from a discovery run
   */
  register(metrics: DiscoveryMetrics): void {
    this.metrics.push(metrics);
    
    // Trim history if exceeds max size
    if (this.metrics.length > this.maxHistorySize) {
      this.metrics = this.metrics.slice(-this.maxHistorySize);
    }
  }
  
  /**
   * Get all metrics
   */
  getAllMetrics(): DiscoveryMetrics[] {
    return [...this.metrics];
  }
  
  /**
   * Get metrics summary (aggregated statistics)
   */
  getSummary(): {
    totalRuns: number;
    averageDuration: number;
    averageSignals: number;
    averageDomains: number;
    successRate: number;
    fallbackRate: number;
  } {
    if (this.metrics.length === 0) {
      return {
        totalRuns: 0,
        averageDuration: 0,
        averageSignals: 0,
        averageDomains: 0,
        successRate: 0,
        fallbackRate: 0,
      };
    }
    
    const totalDuration = this.metrics.reduce((sum, m) => sum + m.timing.totalMs, 0);
    const totalSignals = this.metrics.reduce((sum, m) => sum + m.signalQuality.totalSignals, 0);
    const totalDomains = this.metrics.reduce((sum, m) => sum + m.domainQuality.totalDomains, 0);
    const successfulRuns = this.metrics.filter(m => !m.reliability.fallbackApplied).length;
    const fallbackRuns = this.metrics.filter(m => m.reliability.fallbackApplied).length;
    
    return {
      totalRuns: this.metrics.length,
      averageDuration: totalDuration / this.metrics.length,
      averageSignals: totalSignals / this.metrics.length,
      averageDomains: totalDomains / this.metrics.length,
      successRate: successfulRuns / this.metrics.length,
      fallbackRate: fallbackRuns / this.metrics.length,
    };
  }
  
  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
  }
}

/**
 * Singleton metrics registry
 */
let globalRegistry: MetricsRegistry | null = null;

/**
 * Get global metrics registry
 */
export function getGlobalMetricsRegistry(): MetricsRegistry {
  if (!globalRegistry) {
    globalRegistry = new MetricsRegistry();
  }
  return globalRegistry;
}

/**
 * Reset global metrics registry (primarily for testing)
 */
export function resetGlobalMetricsRegistry(): void {
  globalRegistry = null;
}
