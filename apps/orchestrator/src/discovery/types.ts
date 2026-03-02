/**
 * Domain Discovery Engine - Local Types
 * 
 * These types are specific to the orchestrator's discovery implementation.
 * For shared discovery types (Domain, Signal, etc.), see @llm/shared-types.
 */

// Re-export shared types for convenience
export type {
  Signal,
  Evidence,
  ExclusionMetadata,
  Domain,
  DiscoveryStatistics,
  DiscoveryExecutionMetadata,
  DiscoveryResult,
  DomainExclusion,
  AnalysisDepth,
  SignalType,
} from '@llm/shared-types';

/**
 * Directory node in file structure
 */
export interface DirectoryNode {
  /** Directory or file name */
  name: string;
  /** Path relative to project root */
  path: string;
  /** Whether this is a directory */
  isDirectory: boolean;
  /** Child nodes (for directories) */
  children?: DirectoryNode[];
}

/**
 * Dependency information from package managers
 */
export interface DependencyInfo {
  /** Package name */
  name: string;
  /** Package version */
  version: string;
  /** Package manager type */
  source: "npm" | "composer" | "pip" | "maven" | "other";
  /** Whether this is a dev dependency */
  isDev: boolean;
}

/**
 * Index metadata provided to discovery engine
 */
export interface IndexMetadata {
  /** Total number of chunks in index */
  totalChunks: number;
  /** Total number of files indexed */
  totalFiles: number;
  /** File count by extension */
  filesByExtension: Record<string, number>;
  /** Directory structure */
  directoryStructure: DirectoryNode[];
  /** Detected frameworks */
  detectedFrameworks: string[];
  /** Dependencies from package managers */
  dependencies: DependencyInfo[];
}

/**
 * Domain-specific context for RAG
 */
export interface DomainContext {
  /** Domain name */
  domain: string;
  /** Retrieved code chunks */
  chunks: Array<{
    filePath: string;
    content: string;
    lineRange?: { start: number; end: number };
  }>;
}
