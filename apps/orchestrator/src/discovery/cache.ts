/**
 * Domain Discovery Engine Cache
 * 
 * High-performance caching layer for pattern matching and signal extraction.
 * Implements LRU (Least Recently Used) eviction policy with TTL support.
 * 
 * Performance Benefits:
 * - Reduces redundant pattern matching operations
 * - Improves throughput for large codebases
 * - Minimizes CPU usage during signal extraction
 */

import type { CacheStatistics } from '@llm/shared-types';

/**
 * Cache entry with metadata
 */
interface CacheEntry<T> {
  /** Cached value */
  value: T;
  /** Timestamp when entry was created */
  createdAt: number;
  /** Timestamp when entry was last accessed */
  lastAccessedAt: number;
  /** Number of times entry was accessed */
  accessCount: number;
}

/**
 * LRU Cache with TTL support
 * Thread-safe for concurrent access
 */
export class LRUCache<K, V> {
  private cache: Map<K, CacheEntry<V>>;
  private maxSize: number;
  private ttlMs: number;
  private hits: number;
  private misses: number;
  private evictions: number;
  private expirations: number;
  
  constructor(maxSize: number = 1000, ttlMs: number = 300000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    this.expirations = 0;
  }
  
  /**
   * Get value from cache
   * Returns undefined if not found or expired
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.misses++;
      return undefined;
    }
    
    // Check if entry has expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.expirations++;
      this.misses++;
      return undefined;
    }
    
    // Update access metadata
    entry.lastAccessedAt = Date.now();
    entry.accessCount++;
    
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    
    this.hits++;
    return entry.value;
  }
  
  /**
   * Set value in cache
   * Evicts least recently used entry if cache is full
   */
  set(key: K, value: V): void {
    // Remove existing entry if present
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    
    // Evict LRU entry if cache is full
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }
    
    // Add new entry
    const entry: CacheEntry<V> = {
      value,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      accessCount: 0,
    };
    
    this.cache.set(key, entry);
  }
  
  /**
   * Check if key exists in cache (without updating access time)
   */
  has(key: K): boolean {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return false;
    }
    
    // Check if expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.expirations++;
      return false;
    }
    
    return true;
  }
  
  /**
   * Delete entry from cache
   */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }
  
  /**
   * Clear all entries from cache
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    this.expirations = 0;
  }
  
  /**
   * Get cache statistics
   */
  getStatistics(): CacheStatistics {
    const total = this.hits + this.misses;
    
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      size: this.cache.size,
      maxSize: this.maxSize,
      evictions: this.evictions,
      expirations: this.expirations,
    };
  }
  
  /**
   * Get all keys in cache
   */
  keys(): K[] {
    return Array.from(this.cache.keys());
  }
  
  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }
  
  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    // First entry in Map is least recently used (due to our access pattern)
    const firstKey = this.cache.keys().next().value;
    
    if (firstKey !== undefined) {
      this.cache.delete(firstKey);
      this.evictions++;
    }
  }
  
  /**
   * Check if entry has expired
   */
  private isExpired(entry: CacheEntry<V>): boolean {
    if (this.ttlMs === 0) {
      return false; // No expiration
    }
    
    const age = Date.now() - entry.createdAt;
    return age > this.ttlMs;
  }
  
  /**
   * Clean up expired entries
   * Should be called periodically for long-running processes
   */
  cleanup(): number {
    let cleaned = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        this.expirations++;
        cleaned++;
      }
    }
    
    return cleaned;
  }
}

/**
 * Pattern matching cache for signal extraction
 * Caches results of expensive pattern matching operations
 */
export class PatternMatchCache {
  private cache: LRUCache<string, string>;
  private enabled: boolean;
  
  constructor(enabled: boolean = true, maxSize: number = 1000, ttlMs: number = 300000) {
    this.cache = new LRUCache(maxSize, ttlMs);
    this.enabled = enabled;
  }
  
  /**
   * Get cached domain name for a signal value
   */
  getDomainName(signalValue: string, signalType: string): string | undefined {
    if (!this.enabled) {
      return undefined;
    }
    
    const cacheKey = this.createCacheKey(signalValue, signalType);
    return this.cache.get(cacheKey);
  }
  
  /**
   * Cache domain name for a signal value
   */
  setDomainName(signalValue: string, signalType: string, domainName: string): void {
    if (!this.enabled) {
      return;
    }
    
    const cacheKey = this.createCacheKey(signalValue, signalType);
    this.cache.set(cacheKey, domainName);
  }
  
  /**
   * Get cache statistics
   */
  getStatistics(): CacheStatistics {
    return this.cache.getStatistics();
  }
  
  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
  }
  
  /**
   * Cleanup expired entries
   */
  cleanup(): number {
    return this.cache.cleanup();
  }
  
  /**
   * Create cache key from signal value and type
   */
  private createCacheKey(signalValue: string, signalType: string): string {
    return `${signalType}:${signalValue.toLowerCase()}`;
  }
}

/**
 * Dependency mapping cache
 * Caches dependency-to-domain mappings
 */
export class DependencyMappingCache {
  private cache: LRUCache<string, Array<{ domain: string; weight: number }>>;
  private enabled: boolean;
  
  constructor(enabled: boolean = true, maxSize: number = 500, ttlMs: number = 300000) {
    this.cache = new LRUCache(maxSize, ttlMs);
    this.enabled = enabled;
  }
  
  /**
   * Get cached domain mappings for a dependency
   */
  getMappings(depName: string, depVersion: string): Array<{ domain: string; weight: number }> | undefined {
    if (!this.enabled) {
      return undefined;
    }
    
    const cacheKey = this.createCacheKey(depName, depVersion);
    return this.cache.get(cacheKey);
  }
  
  /**
   * Cache domain mappings for a dependency
   */
  setMappings(depName: string, depVersion: string, mappings: Array<{ domain: string; weight: number }>): void {
    if (!this.enabled) {
      return;
    }
    
    const cacheKey = this.createCacheKey(depName, depVersion);
    this.cache.set(cacheKey, mappings);
  }
  
  /**
   * Get cache statistics
   */
  getStatistics(): CacheStatistics {
    return this.cache.getStatistics();
  }
  
  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
  }
  
  /**
   * Cleanup expired entries
   */
  cleanup(): number {
    return this.cache.cleanup();
  }
  
  /**
   * Create cache key from dependency name and version
   */
  private createCacheKey(depName: string, depVersion: string): string {
    return `${depName.toLowerCase()}@${depVersion}`;
  }
}

/**
 * Unified cache manager for discovery engine
 * Manages all cache instances and provides unified statistics
 */
export class CacheManager {
  private patternCache: PatternMatchCache;
  private dependencyCache: DependencyMappingCache;
  private cleanupIntervalMs: number;
  private cleanupTimer: NodeJS.Timeout | null;
  
  constructor(
    enabled: boolean = true,
    patternCacheSize: number = 1000,
    dependencyCacheSize: number = 500,
    ttlMs: number = 300000,
    cleanupIntervalMs: number = 60000
  ) {
    this.patternCache = new PatternMatchCache(enabled, patternCacheSize, ttlMs);
    this.dependencyCache = new DependencyMappingCache(enabled, dependencyCacheSize, ttlMs);
    this.cleanupIntervalMs = cleanupIntervalMs;
    this.cleanupTimer = null;
    
    // Start periodic cleanup if enabled
    if (enabled && cleanupIntervalMs > 0) {
      this.startPeriodicCleanup();
    }
  }
  
  /**
   * Get pattern match cache
   */
  getPatternCache(): PatternMatchCache {
    return this.patternCache;
  }
  
  /**
   * Get dependency mapping cache
   */
  getDependencyCache(): DependencyMappingCache {
    return this.dependencyCache;
  }
  
  /**
   * Get unified cache statistics
   */
  getStatistics(): {
    pattern: CacheStatistics;
    dependency: CacheStatistics;
    combined: {
      totalHits: number;
      totalMisses: number;
      overallHitRate: number;
      totalSize: number;
      totalEvictions: number;
      totalExpirations: number;
    };
  } {
    const patternStats = this.patternCache.getStatistics();
    const dependencyStats = this.dependencyCache.getStatistics();
    
    const totalHits = patternStats.hits + dependencyStats.hits;
    const totalMisses = patternStats.misses + dependencyStats.misses;
    const total = totalHits + totalMisses;
    
    return {
      pattern: patternStats,
      dependency: dependencyStats,
      combined: {
        totalHits,
        totalMisses,
        overallHitRate: total > 0 ? totalHits / total : 0,
        totalSize: patternStats.size + dependencyStats.size,
        totalEvictions: patternStats.evictions + dependencyStats.evictions,
        totalExpirations: patternStats.expirations + dependencyStats.expirations,
      },
    };
  }
  
  /**
   * Clear all caches
   */
  clearAll(): void {
    this.patternCache.clear();
    this.dependencyCache.clear();
  }
  
  /**
   * Manually trigger cleanup of expired entries
   */
  cleanup(): { pattern: number; dependency: number } {
    return {
      pattern: this.patternCache.cleanup(),
      dependency: this.dependencyCache.cleanup(),
    };
  }
  
  /**
   * Start periodic cleanup
   */
  private startPeriodicCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const cleaned = this.cleanup();
      
      // Log cleanup if significant number of entries were cleaned
      if (cleaned.pattern + cleaned.dependency > 10) {
        // Could log here if logger is available
        // logger.debug('Cache cleanup completed', cleaned);
      }
    }, this.cleanupIntervalMs);
    
    // Ensure timer doesn't prevent process exit
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }
  
  /**
   * Stop periodic cleanup
   */
  stopPeriodicCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
  
  /**
   * Destroy cache manager and cleanup resources
   */
  destroy(): void {
    this.stopPeriodicCleanup();
    this.clearAll();
  }
}

/**
 * Global cache manager instance
 */
let globalCacheManager: CacheManager | null = null;

/**
 * Get global cache manager
 */
export function getGlobalCacheManager(): CacheManager {
  if (!globalCacheManager) {
    globalCacheManager = new CacheManager();
  }
  return globalCacheManager;
}

/**
 * Initialize global cache manager with custom settings
 */
export function initializeGlobalCacheManager(
  enabled: boolean = true,
  patternCacheSize: number = 1000,
  dependencyCacheSize: number = 500,
  ttlMs: number = 300000,
  cleanupIntervalMs: number = 60000
): CacheManager {
  // Destroy existing manager if present
  if (globalCacheManager) {
    globalCacheManager.destroy();
  }
  
  globalCacheManager = new CacheManager(
    enabled,
    patternCacheSize,
    dependencyCacheSize,
    ttlMs,
    cleanupIntervalMs
  );
  
  return globalCacheManager;
}

/**
 * Reset global cache manager (primarily for testing)
 */
export function resetGlobalCacheManager(): void {
  if (globalCacheManager) {
    globalCacheManager.destroy();
  }
  globalCacheManager = null;
}
