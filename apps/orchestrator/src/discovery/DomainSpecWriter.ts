/**
 * DomainSpecWriter
 * 
 * Generates domain-specific spec files for discovered domains.
 * Creates YAML spec files for DEEP domains with discovery metadata,
 * confidence scores, and supporting evidence.
 * 
 * Requirements: 7.1, 7.5
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { Domain } from './types';
import { logger } from '../observability/Logger';

/**
 * Helper function to check if a path exists
 * Uses fs.promises.access for async existence check
 */
async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Configuration for spec file generation
 */
export interface SpecWriterConfig {
  /** Output directory for spec files */
  outputDir: string;
  /** Whether to create output directory if it doesn't exist */
  createDir?: boolean;
}

/**
 * Result of spec file generation
 */
export interface SpecWriteResult {
  /** Whether the write was successful */
  success: boolean;
  /** Path to generated spec file */
  filePath?: string;
  /** Error if write failed */
  error?: {
    code: string;
    message: string;
  };
}

/**
 * DomainSpecWriter generates YAML spec files for discovered domains
 * 
 * For each DEEP domain, creates a spec file containing:
 * - Discovery metadata (timestamp, confidence, analysis depth)
 * - Domain information (name, ID, confidence score)
 * - Supporting evidence (file paths, signals)
 * - Signal breakdown by type
 * 
 * Spec files are named using the domain ID (e.g., auth_domain.yaml)
 */
export class DomainSpecWriter {
  private config: SpecWriterConfig;
  
  constructor(config: SpecWriterConfig) {
    this.config = {
      createDir: true,
      ...config,
    };
  }
  
  /**
   * Write spec file for a single DEEP domain
   * 
   * Generates a YAML spec file containing:
   * - Spec metadata (version, generated timestamp)
   * - Discovery metadata (discovered timestamp, confidence, analysis depth)
   * - Domain information (ID, name, confidence)
   * - Signals (grouped by type with weights)
   * - Evidence (file paths with relevance scores)
   * - Sub-domains (if any)
   * 
   * Only writes specs for domains with analysisDepth = "DEEP".
   * Returns error for EXCLUDED domains.
   * 
   * @param domain - Domain to generate spec for
   * @returns SpecWriteResult with success status and file path
   */
  async writeDomainSpec(domain: Domain): Promise<SpecWriteResult> {
    try {
      // Validate domain is DEEP (not EXCLUDED)
      if (domain.analysisDepth !== 'DEEP') {
        logger.warn('Attempted to write spec for non-DEEP domain', {
          domainId: domain.id,
          analysisDepth: domain.analysisDepth,
        });
        
        return {
          success: false,
          error: {
            code: 'INVALID_DOMAIN_DEPTH',
            message: `Cannot write spec for domain with analysisDepth=${domain.analysisDepth}. Only DEEP domains can have specs.`,
          },
        };
      }
      
      // Ensure output directory exists
      if (this.config.createDir && !(await pathExists(this.config.outputDir))) {
        logger.debug('Creating output directory', {
          outputDir: this.config.outputDir,
        });
        await fs.mkdir(this.config.outputDir, { recursive: true });
      }
      
      // Generate spec content
      const specContent = this.generateSpecYaml(domain);
      
      // Determine file path
      const fileName = `${domain.id}.yaml`;
      const filePath = path.join(this.config.outputDir, fileName);
      
      // Write file
      logger.debug('Writing domain spec file', {
        domainId: domain.id,
        filePath,
      });
      
      await fs.writeFile(filePath, specContent, 'utf-8');
      
      logger.info('Domain spec file written successfully', {
        domainId: domain.id,
        domainName: domain.name,
        filePath,
        confidence: domain.confidence,
        signalCount: domain.signals.length,
        evidenceCount: domain.evidence.length,
      });
      
      return {
        success: true,
        filePath,
      };
    } catch (err) {
      const error = err as Error;
      
      logger.error('Failed to write domain spec file', {
        domainId: domain.id,
        error: error.message,
        stack: error.stack,
      });
      
      return {
        success: false,
        error: {
          code: 'SPEC_WRITE_ERROR',
          message: error.message,
        },
      };
    }
  }
  
  /**
   * Write exclusion record for a single EXCLUDED domain
   * 
   * Generates a YAML exclusion record file containing:
   * - Exclusion metadata (timestamp, justification, warning)
   * - Original discovery metadata (confidence, analysis depth)
   * - Domain information (ID, name, confidence)
   * - Signals (grouped by type with weights)
   * - Evidence (file paths with relevance scores)
   * - Warning about non-analysis
   * 
   * Only writes exclusion records for domains with analysisDepth = "EXCLUDED".
   * Returns error for DEEP domains.
   * 
   * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
   * 
   * @param domain - Domain to generate exclusion record for
   * @returns SpecWriteResult with success status and file path
   */
  async writeExclusionRecord(domain: Domain): Promise<SpecWriteResult> {
    try {
      // Validate domain is EXCLUDED (not DEEP)
      if (domain.analysisDepth !== 'EXCLUDED') {
        logger.warn('Attempted to write exclusion record for non-EXCLUDED domain', {
          domainId: domain.id,
          analysisDepth: domain.analysisDepth,
        });
        
        return {
          success: false,
          error: {
            code: 'INVALID_DOMAIN_DEPTH',
            message: `Cannot write exclusion record for domain with analysisDepth=${domain.analysisDepth}. Only EXCLUDED domains can have exclusion records.`,
          },
        };
      }
      
      // Validate exclusionMetadata exists
      if (!domain.exclusionMetadata) {
        logger.error('EXCLUDED domain missing exclusionMetadata', {
          domainId: domain.id,
        });
        
        return {
          success: false,
          error: {
            code: 'MISSING_EXCLUSION_METADATA',
            message: `EXCLUDED domain ${domain.id} is missing exclusionMetadata`,
          },
        };
      }
      
      // Ensure output directory exists
      if (this.config.createDir && !(await pathExists(this.config.outputDir))) {
        logger.debug('Creating output directory', {
          outputDir: this.config.outputDir,
        });
        await fs.mkdir(this.config.outputDir, { recursive: true });
      }
      
      // Generate exclusion record content
      const exclusionContent = this.generateExclusionYaml(domain);
      
      // Determine file path with .excluded.yaml suffix
      const fileName = `${domain.id}.excluded.yaml`;
      const filePath = path.join(this.config.outputDir, fileName);
      
      // Write file
      logger.debug('Writing exclusion record file', {
        domainId: domain.id,
        filePath,
      });
      
      await fs.writeFile(filePath, exclusionContent, 'utf-8');
      
      logger.info('Exclusion record file written successfully', {
        domainId: domain.id,
        domainName: domain.name,
        filePath,
        excludedAt: domain.exclusionMetadata.excludedAt,
        justification: domain.exclusionMetadata.justification,
      });
      
      return {
        success: true,
        filePath,
      };
    } catch (err) {
      const error = err as Error;
      
      logger.error('Failed to write exclusion record file', {
        domainId: domain.id,
        error: error.message,
        stack: error.stack,
      });
      
      return {
        success: false,
        error: {
          code: 'EXCLUSION_WRITE_ERROR',
          message: error.message,
        },
      };
    }
  }
  
  /**
   * Write spec files for multiple domains
   * 
   * Filters to DEEP domains only and writes a spec file for each.
   * Uses Promise.all for parallel writes to improve performance.
   * Continues processing remaining domains if one fails.
   * 
   * @param domains - Array of domains to generate specs for
   * @returns Array of SpecWriteResult for each domain
   */
  async writeDomainSpecs(domains: Domain[]): Promise<SpecWriteResult[]> {
    logger.info('Writing spec files for domains', {
      totalDomains: domains.length,
      deepDomains: domains.filter(d => d.analysisDepth === 'DEEP').length,
    });
    
    // Filter to DEEP domains only
    const deepDomains = domains.filter(d => d.analysisDepth === 'DEEP');
    
    // Write specs for all DEEP domains in parallel using Promise.all
    // Each writeDomainSpec handles its own errors, so Promise.all won't reject
    const results = await Promise.all(
      deepDomains.map(domain => this.writeDomainSpec(domain))
    );
    
    // Log summary
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    
    logger.info('Domain spec writing complete', {
      totalProcessed: results.length,
      successful: successCount,
      failed: failureCount,
    });
    
    return results;
  }
  
  /**
   * Write exclusion records for multiple domains
   * 
   * Filters to EXCLUDED domains only and writes an exclusion record for each.
   * Uses Promise.all for parallel writes to improve performance.
   * Continues processing remaining domains if one fails.
   * 
   * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
   * 
   * @param domains - Array of domains to generate exclusion records for
   * @returns Array of SpecWriteResult for each excluded domain
   */
  async writeExclusionRecords(domains: Domain[]): Promise<SpecWriteResult[]> {
    logger.info('Writing exclusion records for domains', {
      totalDomains: domains.length,
      excludedDomains: domains.filter(d => d.analysisDepth === 'EXCLUDED').length,
    });
    
    // Filter to EXCLUDED domains only
    const excludedDomains = domains.filter(d => d.analysisDepth === 'EXCLUDED');
    
    // Write exclusion records for all EXCLUDED domains in parallel using Promise.all
    // Each writeExclusionRecord handles its own errors, so Promise.all won't reject
    const results = await Promise.all(
      excludedDomains.map(domain => this.writeExclusionRecord(domain))
    );
    
    // Log summary
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    
    logger.info('Exclusion record writing complete', {
      totalProcessed: results.length,
      successful: successCount,
      failed: failureCount,
    });
    
    return results;
  }
  
  /**
   * Generate YAML content for exclusion record
   * 
   * Creates a structured YAML document with:
   * - Warning about non-analysis
   * - Exclusion metadata (timestamp, justification)
   * - Original discovery metadata (confidence, analysis depth)
   * - Domain information (ID, name, confidence)
   * - Signals (grouped by type)
   * - Evidence (file paths with relevance)
   * 
   * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
   * 
   * @param domain - EXCLUDED domain to generate YAML for
   * @returns YAML string
   */
  private generateExclusionYaml(domain: Domain): string {
    const lines: string[] = [];
    
    // Header comment with warning
    lines.push('# Domain Exclusion Record');
    lines.push('# Generated by Domain Discovery Engine (RAA)');
    lines.push('#');
    lines.push('# ⚠️  WARNING: This domain was EXCLUDED from analysis');
    lines.push('# This domain was discovered but explicitly excluded by the user.');
    lines.push('# No role-based analysis or spec generation was performed for this domain.');
    lines.push('# The exclusion decision is the responsibility of the user.');
    lines.push('');
    
    // Record metadata
    lines.push('record_version: "1.0.0"');
    lines.push(`generated_at: "${new Date().toISOString()}"`);
    lines.push('record_type: "exclusion"');
    lines.push('');
    
    // Exclusion metadata section
    lines.push('exclusion:');
    lines.push(`  excluded_at: "${domain.exclusionMetadata!.excludedAt}"`);
    lines.push(`  justification: "${this.escapeYamlString(domain.exclusionMetadata!.justification)}"`);
    lines.push(`  status: "not_analyzed"`);
    lines.push('');
    
    // Original discovery metadata section
    lines.push('original_discovery:');
    lines.push(`  analysis_depth: "${domain.analysisDepth}"`);
    lines.push(`  confidence: ${domain.confidence.toFixed(3)}`);
    lines.push('');
    
    // Domain information section
    lines.push('domain:');
    lines.push(`  id: "${domain.id}"`);
    lines.push(`  name: "${domain.name}"`);
    lines.push(`  confidence: ${domain.confidence.toFixed(3)}`);
    lines.push('');
    
    // Signals section
    lines.push('signals:');
    if (domain.signals.length === 0) {
      lines.push('  []');
    } else {
      // Group signals by type
      const signalsByType = this.groupSignalsByType(domain.signals);
      
      for (const [type, signals] of Object.entries(signalsByType)) {
        lines.push(`  ${type}:`);
        for (const signal of signals) {
          lines.push(`    - value: "${this.escapeYamlString(signal.value)}"`);
          lines.push(`      weight: ${signal.weight.toFixed(3)}`);
          lines.push(`      source: "${signal.source}"`);
        }
      }
    }
    lines.push('');
    
    // Evidence section
    lines.push('evidence:');
    if (domain.evidence.length === 0) {
      lines.push('  []');
    } else {
      for (const evidence of domain.evidence) {
        lines.push(`  - file_path: "${this.escapeYamlString(evidence.filePath)}"`);
        lines.push(`    relevance_score: ${evidence.relevanceScore.toFixed(3)}`);
        
        if (evidence.lineRange) {
          lines.push(`    line_range:`);
          lines.push(`      start: ${evidence.lineRange.start}`);
          lines.push(`      end: ${evidence.lineRange.end}`);
        }
        
        if (evidence.snippet) {
          // Escape and format snippet for YAML
          const escapedSnippet = this.escapeYamlString(evidence.snippet);
          lines.push(`    snippet: "${escapedSnippet}"`);
        }
      }
    }
    lines.push('');
    
    // Warning footer
    lines.push('# This exclusion record documents a domain that was discovered but not analyzed.');
    lines.push('# To analyze this domain, remove it from the exclusion list in future pipeline runs.');
    lines.push('');
    
    return lines.join('\n');
  }
  
  /**
   * Generate YAML content for domain spec
   * 
   * Creates a structured YAML document with:
   * - Spec metadata (version, generated timestamp)
   * - Discovery metadata (discovered timestamp, confidence, analysis depth)
   * - Domain information (ID, name, confidence)
   * - Signals (grouped by type)
   * - Evidence (file paths with relevance)
   * - Sub-domains (if any)
   * 
   * @param domain - Domain to generate YAML for
   * @returns YAML string
   */
  private generateSpecYaml(domain: Domain): string {
    const lines: string[] = [];
    
    // Header comment
    lines.push('# Domain Specification');
    lines.push('# Generated by Domain Discovery Engine (RAA)');
    lines.push('');
    
    // Spec metadata
    lines.push('spec_version: "1.0.0"');
    lines.push(`generated_at: "${new Date().toISOString()}"`);
    lines.push('');
    
    // Discovery metadata section
    lines.push('discovery_metadata:');
    lines.push(`  analysis_depth: "${domain.analysisDepth}"`);
    lines.push(`  confidence: ${domain.confidence.toFixed(3)}`);
    lines.push('');
    
    // Domain information section
    lines.push('domain:');
    lines.push(`  id: "${domain.id}"`);
    lines.push(`  name: "${domain.name}"`);
    lines.push(`  confidence: ${domain.confidence.toFixed(3)}`);
    lines.push('');
    
    // Signals section
    lines.push('signals:');
    if (domain.signals.length === 0) {
      lines.push('  []');
    } else {
      // Group signals by type
      const signalsByType = this.groupSignalsByType(domain.signals);
      
      for (const [type, signals] of Object.entries(signalsByType)) {
        lines.push(`  ${type}:`);
        for (const signal of signals) {
          lines.push(`    - value: "${this.escapeYamlString(signal.value)}"`);
          lines.push(`      weight: ${signal.weight.toFixed(3)}`);
          lines.push(`      source: "${signal.source}"`);
        }
      }
    }
    lines.push('');
    
    // Evidence section
    lines.push('evidence:');
    if (domain.evidence.length === 0) {
      lines.push('  []');
    } else {
      for (const evidence of domain.evidence) {
        lines.push(`  - file_path: "${this.escapeYamlString(evidence.filePath)}"`);
        lines.push(`    relevance_score: ${evidence.relevanceScore.toFixed(3)}`);
        
        if (evidence.lineRange) {
          lines.push(`    line_range:`);
          lines.push(`      start: ${evidence.lineRange.start}`);
          lines.push(`      end: ${evidence.lineRange.end}`);
        }
        
        if (evidence.snippet) {
          // Escape and format snippet for YAML
          const escapedSnippet = this.escapeYamlString(evidence.snippet);
          lines.push(`    snippet: "${escapedSnippet}"`);
        }
      }
    }
    lines.push('');
    
    // Sub-domains section (if any)
    if (domain.subDomains && domain.subDomains.length > 0) {
      lines.push('sub_domains:');
      for (const subDomain of domain.subDomains) {
        lines.push(`  - id: "${subDomain.id}"`);
        lines.push(`    name: "${subDomain.name}"`);
        lines.push(`    confidence: ${subDomain.confidence.toFixed(3)}`);
        lines.push(`    analysis_depth: "${subDomain.analysisDepth}"`);
      }
      lines.push('');
    }
    
    return lines.join('\n');
  }
  
  /**
   * Group signals by type for organized YAML output
   * 
   * @param signals - Array of signals
   * @returns Object mapping signal type to array of signals
   */
  private groupSignalsByType(signals: Array<{
    type: string;
    value: string;
    weight: number;
    source: string;
  }>): Record<string, Array<{
    value: string;
    weight: number;
    source: string;
  }>> {
    const grouped: Record<string, Array<{
      value: string;
      weight: number;
      source: string;
    }>> = {};
    
    for (const signal of signals) {
      if (!grouped[signal.type]) {
        grouped[signal.type] = [];
      }
      
      grouped[signal.type].push({
        value: signal.value,
        weight: signal.weight,
        source: signal.source,
      });
    }
    
    return grouped;
  }
  
  /**
   * Write master index file listing all domains
   * 
   * Creates a master index YAML file that lists all domains (DEEP and EXCLUDED)
   * with their spec file paths and status. This provides a single entry point
   * for navigating all discovered domains and their documentation.
   * 
   * Includes failure notices for domains where spec generation failed.
   * 
   * Requirements: 7.3, 7.4
   * 
   * @param domains - Array of all domains (DEEP and EXCLUDED)
   * @param specResults - Results from writing domain specs
   * @param exclusionResults - Results from writing exclusion records
   * @returns SpecWriteResult with success status and file path
   */
  async writeMasterIndex(
    domains: Domain[],
    specResults: SpecWriteResult[],
    exclusionResults: SpecWriteResult[]
  ): Promise<SpecWriteResult> {
    try {
      // Ensure output directory exists
      if (this.config.createDir && !(await pathExists(this.config.outputDir))) {
        logger.debug('Creating output directory', {
          outputDir: this.config.outputDir,
        });
        await fs.mkdir(this.config.outputDir, { recursive: true });
      }
      
      // Create mapping of domain ID to file path and failure info
      const domainFilePaths = new Map<string, string>();
      const domainFailures = new Map<string, { code: string; message: string }>();
      
      // Add spec file paths for DEEP domains
      for (const result of specResults) {
        if (result.success && result.filePath) {
          const fileName = path.basename(result.filePath);
          const domainId = fileName.replace('.yaml', '');
          domainFilePaths.set(domainId, fileName);
        } else if (!result.success && result.error) {
          // Extract domain ID from error context or infer from result
          // Since we don't have domain ID in the result, we'll need to match by index
          // This will be handled in generateMasterIndexYaml by checking if path exists
          const domainIndex = specResults.indexOf(result);
          const deepDomains = domains.filter(d => d.analysisDepth === 'DEEP');
          if (domainIndex >= 0 && domainIndex < deepDomains.length) {
            const domainId = deepDomains[domainIndex].id;
            domainFailures.set(domainId, result.error);
          }
        }
      }
      
      // Add exclusion record paths for EXCLUDED domains
      for (const result of exclusionResults) {
        if (result.success && result.filePath) {
          const fileName = path.basename(result.filePath);
          const domainId = fileName.replace('.excluded.yaml', '');
          domainFilePaths.set(domainId, fileName);
        } else if (!result.success && result.error) {
          // Extract domain ID from error context or infer from result
          const domainIndex = exclusionResults.indexOf(result);
          const excludedDomains = domains.filter(d => d.analysisDepth === 'EXCLUDED');
          if (domainIndex >= 0 && domainIndex < excludedDomains.length) {
            const domainId = excludedDomains[domainIndex].id;
            domainFailures.set(domainId, result.error);
          }
        }
      }
      
      // Generate master index content with failure information
      const indexContent = this.generateMasterIndexYaml(domains, domainFilePaths, domainFailures);
      
      // Determine file path
      const fileName = 'domain_index.yaml';
      const filePath = path.join(this.config.outputDir, fileName);
      
      // Write file
      logger.debug('Writing master index file', {
        filePath,
        totalDomains: domains.length,
      });
      
      await fs.writeFile(filePath, indexContent, 'utf-8');
      
      const failureCount = domainFailures.size;
      
      logger.info('Master index file written successfully', {
        filePath,
        totalDomains: domains.length,
        deepDomains: domains.filter(d => d.analysisDepth === 'DEEP').length,
        excludedDomains: domains.filter(d => d.analysisDepth === 'EXCLUDED').length,
        failedSpecs: failureCount,
      });
      
      return {
        success: true,
        filePath,
      };
    } catch (err) {
      const error = err as Error;
      
      logger.error('Failed to write master index file', {
        error: error.message,
        stack: error.stack,
      });
      
      return {
        success: false,
        error: {
          code: 'INDEX_WRITE_ERROR',
          message: error.message,
        },
      };
    }
  }
  
  /**
   * Generate YAML content for master index
   * 
   * Creates a structured YAML document with:
   * - Index metadata (version, generated timestamp)
   * - Summary statistics (total, deep, excluded, failed counts)
   * - List of all domains with:
   *   - Domain ID and name
   *   - Status (deep/excluded)
   *   - Confidence score
   *   - Spec file path
   *   - Failure information (if spec generation failed)
   * 
   * Requirements: 7.3, 7.4
   * 
   * @param domains - Array of all domains
   * @param domainFilePaths - Map of domain ID to file path
   * @param domainFailures - Map of domain ID to failure information
   * @returns YAML string
   */
  private generateMasterIndexYaml(
    domains: Domain[],
    domainFilePaths: Map<string, string>,
    domainFailures: Map<string, { code: string; message: string }> = new Map()
  ): string {
    const lines: string[] = [];
    
    // Header comment
    lines.push('# Domain Discovery Master Index');
    lines.push('# Generated by Domain Discovery Engine (RAA)');
    lines.push('#');
    lines.push('# This file provides a complete index of all discovered domains,');
    lines.push('# including both DEEP domains (analyzed) and EXCLUDED domains (not analyzed).');
    lines.push('');
    
    // Index metadata
    lines.push('index_version: "1.0.0"');
    lines.push(`generated_at: "${new Date().toISOString()}"`);
    lines.push('');
    
    // Summary statistics
    const deepDomains = domains.filter(d => d.analysisDepth === 'DEEP');
    const excludedDomains = domains.filter(d => d.analysisDepth === 'EXCLUDED');
    const failedCount = domainFailures.size;
    
    lines.push('summary:');
    lines.push(`  total_domains: ${domains.length}`);
    lines.push(`  deep_domains: ${deepDomains.length}`);
    lines.push(`  excluded_domains: ${excludedDomains.length}`);
    lines.push(`  failed_specs: ${failedCount}`);
    lines.push('');
    
    // Domains list
    lines.push('domains:');
    
    if (domains.length === 0) {
      lines.push('  []');
    } else {
      for (const domain of domains) {
        lines.push(`  - id: "${domain.id}"`);
        lines.push(`    name: "${domain.name}"`);
        lines.push(`    status: "${domain.analysisDepth === 'DEEP' ? 'deep' : 'excluded'}"`);
        lines.push(`    confidence: ${domain.confidence.toFixed(3)}`);
        
        // Check if spec generation failed for this domain
        const failure = domainFailures.get(domain.id);
        const filePath = domainFilePaths.get(domain.id);
        
        if (failure) {
          // Spec generation failed - include failure notice
          lines.push(`    spec_file: null`);
          lines.push(`    generation_failed: true`);
          lines.push(`    failure_reason:`);
          lines.push(`      code: "${failure.code}"`);
          lines.push(`      message: "${this.escapeYamlString(failure.message)}"`);
        } else if (filePath) {
          // Spec generation succeeded
          lines.push(`    spec_file: "${filePath}"`);
          lines.push(`    generation_failed: false`);
        } else {
          // No file path and no failure recorded (shouldn't happen, but handle gracefully)
          lines.push(`    spec_file: null`);
          lines.push(`    generation_failed: true`);
          lines.push(`    failure_reason:`);
          lines.push(`      code: "UNKNOWN_ERROR"`);
          lines.push(`      message: "Spec generation failed with unknown error"`);
        }
        
        // Add exclusion info for EXCLUDED domains
        if (domain.analysisDepth === 'EXCLUDED' && domain.exclusionMetadata) {
          lines.push(`    excluded_at: "${domain.exclusionMetadata.excludedAt}"`);
          lines.push(`    exclusion_reason: "${this.escapeYamlString(domain.exclusionMetadata.justification)}"`);
        }
        
        // Add sub-domains count if any
        if (domain.subDomains && domain.subDomains.length > 0) {
          lines.push(`    sub_domains_count: ${domain.subDomains.length}`);
        }
      }
    }
    
    lines.push('');
    
    // Footer with navigation help
    lines.push('# Navigation:');
    lines.push('# - DEEP domains have spec files (*.yaml) with full analysis');
    lines.push('# - EXCLUDED domains have exclusion records (*.excluded.yaml) documenting why they were not analyzed');
    lines.push('# - Domains with generation_failed: true had errors during spec generation');
    lines.push('# - Use the spec_file path to locate the detailed documentation for each domain');
    lines.push('');
    
    return lines.join('\n');
  }
  
  /**
   * Escape special characters in YAML strings
   * Handles quotes, newlines, and other special characters
   * 
   * @param str - String to escape
   * @returns Escaped string safe for YAML
   */
  private escapeYamlString(str: string): string {
    return str
      .replace(/\\/g, '\\\\')  // Escape backslashes
      .replace(/"/g, '\\"')     // Escape double quotes
      .replace(/\n/g, '\\n')    // Escape newlines
      .replace(/\r/g, '\\r')    // Escape carriage returns
      .replace(/\t/g, '\\t');   // Escape tabs
  }
}
