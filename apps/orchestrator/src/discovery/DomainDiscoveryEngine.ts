/**
 * DomainDiscoveryEngine
 * 
 * Core discovery logic that orchestrates signal extraction and domain classification.
 * Implements Retrieval-Augmented Analysis (RAA) to identify architectural domains.
 * 
 * All discovered domains default to DEEP analysis unless explicitly excluded by user.
 */

import { 
  IndexMetadata, 
  DiscoveryResult, 
  Domain, 
  DomainExclusion,
  Signal,
} from './types';
import { SignalExtractor } from './SignalExtractor';
import { DomainClassifier } from './DomainClassifier';
import { logger } from '../observability/Logger';

/**
 * DomainDiscoveryEngine orchestrates the discovery process
 * 
 * Workflow:
 * 1. Extract signals from index metadata (SignalExtractor)
 * 2. Classify signals into domains (DomainClassifier)
 * 3. Apply user exclusions (mark domains as EXCLUDED)
 * 4. Produce DiscoveryResult with all domains and metadata
 * 
 * Handles:
 * - Retry logic with exponential backoff (up to 3 attempts)
 * - Fallback behavior when discovery fails
 * - Validation of discovery results
 * - Zero-domain handling (creates fallback domain)
 */
export class DomainDiscoveryEngine {
  private signalExtractor: SignalExtractor;
  private domainClassifier: DomainClassifier;
  
  constructor() {
    this.signalExtractor = new SignalExtractor();
    this.domainClassifier = new DomainClassifier();
  }
  
  /**
   * Execute domain discovery using index metadata
   * 
   * Orchestrates the complete discovery process:
   * 1. Extract signals from index
   * 2. Classify signals into domains
   * 3. Apply user exclusions
   * 4. Produce DiscoveryResult
   * 
   * Implements retry logic with exponential backoff (up to 3 attempts).
   * Falls back to default domain if all attempts fail.
   * 
   * @param indexMetadata - Metadata from completed index
   * @param userExclusions - Optional user-specified exclusions
   * @returns DiscoveryResult with all domains tagged as DEEP or EXCLUDED
   */
  async discover(
    indexMetadata: IndexMetadata,
    userExclusions?: DomainExclusion[]
  ): Promise<DiscoveryResult> {
    const maxRetries = 3;
    let lastError: Error | null = null;
    
    // Retry loop with exponential backoff
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Log discovery start with comprehensive index metadata summary
        logger.info('Starting domain discovery', {
          attempt: attempt + 1,
          maxRetries,
          indexMetadata: {
            totalChunks: indexMetadata.totalChunks,
            totalFiles: indexMetadata.totalFiles,
            filesByExtension: Object.keys(indexMetadata.filesByExtension).length,
            detectedFrameworks: indexMetadata.detectedFrameworks,
            dependenciesCount: indexMetadata.dependencies.length,
            directoryNodesCount: indexMetadata.directoryStructure.length,
          },
          userExclusionsCount: userExclusions?.length || 0,
        });
        
        // Execute discovery
        const result = await this.executeDiscovery(indexMetadata, userExclusions);
        
        // Validate result
        if (!this.validateDiscoveryResult(result)) {
          logger.error('Discovery validation failed', {
            hasSchemaVersion: !!result.schemaVersion,
            hasDomains: !!result.domains,
            domainsCount: result.domains?.length || 0,
          });
          throw new Error('Discovery produced invalid result');
        }
        
        // Log discovered domains with confidence scores
        logger.info('Domain discovery completed successfully', {
          totalDomains: result.statistics.totalDomains,
          deepDomains: result.statistics.deepDomains,
          excludedDomains: result.statistics.excludedDomains,
          discoveryTimeMs: result.executionMetadata.discoveryTimeMs,
          domains: result.domains.map(d => ({
            id: d.id,
            name: d.name,
            confidence: d.confidence,
            analysisDepth: d.analysisDepth,
            signalCount: d.signals.length,
            evidenceCount: d.evidence.length,
          })),
        });
        
        return result;
      } catch (err) {
        lastError = err as Error;
        
        logger.warn(`Discovery attempt ${attempt + 1} failed`, {
          error: lastError.message,
          stack: lastError.stack,
        });
        
        // Apply exponential backoff before retry (except on last attempt)
        if (attempt < maxRetries - 1) {
          const backoffMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
          logger.debug(`Applying exponential backoff: ${backoffMs}ms`);
          await this.sleep(backoffMs);
        }
      }
    }
    
    // All retries failed - fall back to default domain
    logger.error('Discovery failed after max retries, falling back to default domain', {
      error: lastError?.message,
      stack: lastError?.stack,
    });
    
    return this.createFallbackResult();
  }
  
  /**
   * Execute the core discovery logic
   * 
   * @param indexMetadata - Index metadata to analyze
   * @param userExclusions - Optional user exclusions
   * @returns DiscoveryResult
   */
  private async executeDiscovery(
    indexMetadata: IndexMetadata,
    userExclusions?: DomainExclusion[]
  ): Promise<DiscoveryResult> {
    const startTime = Date.now();
    
    // Step 1: Extract signals from index metadata
    logger.info('Extracting signals from index metadata', {
      totalFiles: indexMetadata.totalFiles,
      totalChunks: indexMetadata.totalChunks,
      dependenciesCount: indexMetadata.dependencies.length,
      frameworksCount: indexMetadata.detectedFrameworks.length,
    });
    
    const signals = this.signalExtractor.extractSignals(indexMetadata);
    
    // Group signals by type for detailed logging
    const signalsByType = signals.reduce((acc, signal) => {
      acc[signal.type] = (acc[signal.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    logger.info('Signal extraction complete', {
      totalSignals: signals.length,
      signalTypes: this.getUniqueSignalTypes(signals),
      signalsByType,
      averageWeight: signals.length > 0 
        ? (signals.reduce((sum, s) => sum + s.weight, 0) / signals.length).toFixed(3)
        : 0,
    });
    
    // Step 2: Classify signals into domains
    logger.info('Classifying signals into domains', {
      totalSignals: signals.length,
    });
    
    let domains = this.domainClassifier.classify(signals);
    
    // Check if zero domains were discovered (before exclusions)
    if (domains.length === 0) {
      logger.warn('Zero domains discovered from signals', {
        totalSignals: signals.length,
        signalTypes: this.getUniqueSignalTypes(signals),
        reason: 'No signals could be classified into domains',
        action: 'Fallback domain will be created',
      });
    }
    
    logger.info('Domain classification complete', {
      totalDomains: domains.length,
      domains: domains.map(d => ({
        id: d.id,
        name: d.name,
        confidence: d.confidence,
        analysisDepth: d.analysisDepth,
        signalCount: d.signals.length,
        evidenceCount: d.evidence.length,
        hasSubDomains: (d.subDomains?.length || 0) > 0,
        subDomainCount: d.subDomains?.length || 0,
      })),
    });
    
    // Step 3: Apply user exclusions
    if (userExclusions && userExclusions.length > 0) {
      logger.info('Applying user exclusions', {
        exclusionCount: userExclusions.length,
        exclusions: userExclusions.map(e => ({
          domainId: e.domainId,
          justification: e.justification,
        })),
      });
      
      domains = this.applyUserExclusions(domains, userExclusions);
      
      // Log the results of applying exclusions
      const excludedDomains = domains.filter(d => d.analysisDepth === 'EXCLUDED');
      const deepDomains = domains.filter(d => d.analysisDepth === 'DEEP');
      
      logger.info('User exclusions applied', {
        excludedCount: excludedDomains.length,
        remainingDeepDomains: deepDomains.length,
        excludedDomains: excludedDomains.map(d => ({
          id: d.id,
          name: d.name,
          excludedAt: d.exclusionMetadata?.excludedAt,
          justification: d.exclusionMetadata?.justification,
        })),
      });
      
      // Warn if all domains are excluded
      if (deepDomains.length === 0 && domains.length > 0) {
        logger.warn('All discovered domains have been excluded by user', {
          totalDomains: domains.length,
          excludedDomains: domains.length,
          impact: 'No domains will receive deep analysis',
          recommendation: 'Consider reviewing exclusion criteria',
        });
      }
    }
    
    // Step 4: Calculate statistics
    const statistics = this.calculateStatistics(domains);
    
    // Warn about low confidence domains (confidence < 0.3)
    const lowConfidenceDomains = domains.filter(d => d.confidence < 0.3 && d.analysisDepth === 'DEEP');
    if (lowConfidenceDomains.length > 0) {
      logger.warn('Low confidence domains detected', {
        count: lowConfidenceDomains.length,
        threshold: 0.3,
        domains: lowConfidenceDomains.map(d => ({
          id: d.id,
          name: d.name,
          confidence: d.confidence,
          signalCount: d.signals.length,
        })),
        note: 'These domains will still receive DEEP analysis (default-deep rule)',
      });
    }
    
    // Step 5: Build execution metadata
    const executionMetadata = {
      discoveryTimeMs: Date.now() - startTime,
      indexChunksAnalyzed: indexMetadata.totalChunks,
      signalTypesUsed: this.getUniqueSignalTypes(signals),
      fallbackApplied: false,
    };
    
    // Step 6: Produce DiscoveryResult
    const result: DiscoveryResult = {
      schemaVersion: '1.0.0',
      discoveredAt: new Date().toISOString(),
      domains,
      statistics,
      executionMetadata,
    };
    
    return result;
  }
  
  /**
   * Apply user exclusions to domains
   * Marks specified domains as EXCLUDED and adds exclusion metadata
   * 
   * @param domains - Array of discovered domains
   * @param exclusions - User-specified exclusions
   * @returns Domains with exclusions applied
   */
  private applyUserExclusions(
    domains: Domain[],
    exclusions: DomainExclusion[]
  ): Domain[] {
    // Create exclusion map for quick lookup
    const exclusionMap = new Map<string, string>();
    for (const exclusion of exclusions) {
      exclusionMap.set(exclusion.domainId, exclusion.justification);
    }
    
    // Apply exclusions to matching domains
    for (const domain of domains) {
      if (exclusionMap.has(domain.id)) {
        // Mark domain as EXCLUDED
        domain.analysisDepth = 'EXCLUDED';
        
        // Add exclusion metadata
        domain.exclusionMetadata = {
          excludedAt: new Date().toISOString(),
          justification: exclusionMap.get(domain.id)!,
        };
        
        logger.info('Domain excluded by user', {
          domainId: domain.id,
          domainName: domain.name,
          confidence: domain.confidence,
          justification: domain.exclusionMetadata.justification,
          signalCount: domain.signals.length,
        });
      }
    }
    
    return domains;
  }
  
  /**
   * Calculate statistics about discovered domains
   * 
   * @param domains - Array of domains
   * @returns Statistics object
   */
  private calculateStatistics(domains: Domain[]) {
    const totalDomains = domains.length;
    const deepDomains = domains.filter(d => d.analysisDepth === 'DEEP').length;
    const excludedDomains = domains.filter(d => d.analysisDepth === 'EXCLUDED').length;
    
    return {
      totalDomains,
      deepDomains,
      excludedDomains,
    };
  }
  
  /**
   * Get unique signal types from signals array
   * 
   * @param signals - Array of signals
   * @returns Array of unique signal types
   */
  private getUniqueSignalTypes(signals: Signal[]): string[] {
    const types = new Set<string>();
    for (const signal of signals) {
      types.add(signal.type);
    }
    return Array.from(types);
  }
  
  /**
   * Validate discovery result structure
   * Ensures result has required fields and valid data
   * 
   * @param result - DiscoveryResult to validate
   * @returns True if valid, false otherwise
   */
  private validateDiscoveryResult(result: DiscoveryResult): boolean {
    // Validate schema structure
    if (!result.schemaVersion || !result.domains || !Array.isArray(result.domains)) {
      logger.error('Invalid discovery result: missing required fields', {
        hasSchemaVersion: !!result.schemaVersion,
        hasDomains: !!result.domains,
        isDomainsArray: Array.isArray(result.domains),
      });
      return false;
    }
    
    // Validate each domain has required fields
    for (const domain of result.domains) {
      if (!domain.id || !domain.name || !domain.analysisDepth) {
        logger.error('Invalid domain: missing required fields', {
          domainId: domain.id,
          hasName: !!domain.name,
          hasAnalysisDepth: !!domain.analysisDepth,
        });
        return false;
      }
      
      // Validate analysisDepth is valid
      if (domain.analysisDepth !== 'DEEP' && domain.analysisDepth !== 'EXCLUDED') {
        logger.error('Invalid domain: invalid analysisDepth', {
          domainId: domain.id,
          analysisDepth: domain.analysisDepth,
        });
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Create fallback result when discovery fails
   * Returns a default "general_architecture" domain with DEEP analysis
   * 
   * This ensures the pipeline never fails completely due to discovery issues.
   * The fallback domain allows analysis to proceed with a generic domain.
   * 
   * @returns Fallback DiscoveryResult
   */
  private createFallbackResult(): DiscoveryResult {
    // Log fallback activation with detailed information
    logger.warn('Fallback activated: Creating default domain due to discovery failure', {
      reason: 'Discovery failed after max retries or produced invalid result',
      fallbackDomain: {
        id: 'general_architecture_domain',
        name: 'General Architecture',
        confidence: 0.5,
        analysisDepth: 'DEEP',
      },
      impact: 'Analysis will proceed with generic domain instead of discovered domains',
    });
    
    const fallbackResult: DiscoveryResult = {
      schemaVersion: '1.0.0',
      discoveredAt: new Date().toISOString(),
      domains: [
        {
          id: 'general_architecture_domain',
          name: 'General Architecture',
          confidence: 0.5,
          analysisDepth: 'DEEP' as const,
          signals: [],
          evidence: [],
        },
      ],
      statistics: {
        totalDomains: 1,
        deepDomains: 1,
        excludedDomains: 0,
      },
      executionMetadata: {
        discoveryTimeMs: 0,
        indexChunksAnalyzed: 0,
        signalTypesUsed: [],
        fallbackApplied: true,
      },
    };
    
    logger.info('Fallback discovery result created', {
      fallbackApplied: true,
      domains: fallbackResult.domains.map(d => ({
        id: d.id,
        name: d.name,
        confidence: d.confidence,
        analysisDepth: d.analysisDepth,
      })),
    });
    
    return fallbackResult;
  }
  
  /**
   * Sleep for specified milliseconds
   * Used for exponential backoff between retries
   * 
   * @param ms - Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
