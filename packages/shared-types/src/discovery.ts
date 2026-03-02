/**
 * Domain Discovery Engine Types
 * Schema Version: 1.0.0
 * 
 * These types define the data structures used by the Domain Discovery Engine (RAA)
 * to identify architectural domains in a codebase after indexing completes.
 */

/**
 * Type of architectural signal extracted from the codebase
 */
export type SignalType = "file_pattern" | "dependency" | "framework" | "route" | "config";

/**
 * Analysis depth for a discovered domain
 * - DEEP: Domain will receive full analysis and spec generation
 * - EXCLUDED: Domain explicitly excluded by user, no analysis performed
 */
export type AnalysisDepth = "DEEP" | "EXCLUDED";

/**
 * Signal extracted from index metadata indicating presence of a domain
 */
export interface Signal {
  /** Type of signal */
  type: SignalType;
  /** Signal value (e.g., "/auth", "passport", "Laravel") */
  value: string;
  /** Reliability weight of this signal (0.0 - 1.0) */
  weight: number;
  /** Source where signal was extracted from */
  source: string;
}

/**
 * Evidence supporting the discovery of a domain
 */
export interface Evidence {
  /** Relative path to the file containing evidence */
  filePath: string;
  /** Optional line range where evidence was found */
  lineRange?: {
    start: number;
    end: number;
  };
  /** Optional code snippet (max 200 chars) */
  snippet?: string;
  /** Relevance score for this evidence (0.0 - 1.0) */
  relevanceScore: number;
}

/**
 * Metadata about a user exclusion decision
 */
export interface ExclusionMetadata {
  /** ISO 8601 timestamp when domain was excluded */
  excludedAt: string;
  /** User-provided justification for exclusion */
  justification: string;
}

/**
 * Discovered architectural domain
 */
export interface Domain {
  /** Unique identifier (e.g., "auth_domain") */
  id: string;
  /** Human-readable name (e.g., "Authentication") */
  name: string;
  /** Confidence score (0.0 - 1.0) - does NOT affect analysisDepth */
  confidence: number;
  /** Analysis depth - defaults to DEEP unless user excludes */
  analysisDepth: AnalysisDepth;
  /** Signals that led to discovery of this domain */
  signals: Signal[];
  /** Code locations supporting discovery */
  evidence: Evidence[];
  /** Optional nested sub-domains */
  subDomains?: Domain[];
  /** Metadata if domain was excluded by user */
  exclusionMetadata?: ExclusionMetadata;
}

/**
 * Statistics about discovered domains
 */
export interface DiscoveryStatistics {
  /** Total number of domains discovered */
  totalDomains: number;
  /** Number of domains tagged for deep analysis */
  deepDomains: number;
  /** Number of domains excluded by user */
  excludedDomains: number;
}

/**
 * Metadata about discovery execution
 */
export interface DiscoveryExecutionMetadata {
  /** Time taken to execute discovery in milliseconds */
  discoveryTimeMs: number;
  /** Number of index chunks analyzed */
  indexChunksAnalyzed: number;
  /** Types of signals used in discovery */
  signalTypesUsed: string[];
  /** Whether fallback was applied due to discovery failure */
  fallbackApplied: boolean;
}

/**
 * Complete result of domain discovery process
 */
export interface DiscoveryResult {
  /** Schema version for compatibility tracking */
  schemaVersion: string;
  /** ISO 8601 timestamp when discovery was executed */
  discoveredAt: string;
  /** All discovered domains */
  domains: Domain[];
  /** Aggregate statistics */
  statistics: DiscoveryStatistics;
  /** Execution metadata */
  executionMetadata: DiscoveryExecutionMetadata;
}

/**
 * User-specified domain exclusion
 */
export interface DomainExclusion {
  /** ID of domain to exclude */
  domainId: string;
  /** User justification for exclusion (required) */
  justification: string;
}
