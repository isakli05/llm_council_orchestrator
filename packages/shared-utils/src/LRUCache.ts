/**
 * LRU (Least Recently Used) Cache Implementation
 * 
 * A generic cache that automatically evicts the least recently used entries
 * when the cache reaches its maximum size. Uses Map for O(1) access.
 * 
 * Requirements: 13.1
 * 
 * @example
 * const cache = new LRUCache<string, object>(100);
 * cache.set('key1', { data: 'value1' });
 * const value = cache.get('key1'); // Returns { data: 'value1' }
 */
export class LRUCache<K, V> {
  private cache: Map<K, V>;
  private readonly maxSize: number;
  private evictionCount: number;

  /**
   * Creates a new LRU cache instance
   * 
   * @param maxSize - Maximum number of entries the cache can hold (default: 100)
   */
  constructor(maxSize: number = 100) {
    if (maxSize <= 0) {
      throw new Error('LRUCache maxSize must be a positive integer');
    }
    this.cache = new Map();
    this.maxSize = maxSize;
    this.evictionCount = 0;
  }

  /**
   * Gets a value from the cache
   * 
   * If the key exists, the entry is moved to the end (most recently used position).
   * 
   * @param key - The key to look up
   * @returns The value if found, undefined otherwise
   */
  get(key: K): V | undefined {
    const value = this.cache.get(key);
    
    if (value === undefined) {
      return undefined;
    }
    
    // Move to end (most recently used) by deleting and re-inserting
    this.cache.delete(key);
    this.cache.set(key, value);
    
    return value;
  }

  /**
   * Sets a value in the cache
   * 
   * If the cache is at capacity, the least recently used entry is evicted.
   * If the key already exists, it is updated and moved to most recently used position.
   * 
   * @param key - The key to set
   * @param value - The value to store
   */
  set(key: K, value: V): void {
    // If key exists, delete it first (will be re-added at end)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict least recently used (first entry in Map)
      this.evictLRU();
    }
    
    this.cache.set(key, value);
  }

  /**
   * Checks if a key exists in the cache
   * 
   * Note: This does NOT update the access order (unlike get)
   * 
   * @param key - The key to check
   * @returns true if the key exists, false otherwise
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /**
   * Deletes an entry from the cache
   * 
   * @param key - The key to delete
   * @returns true if the entry was deleted, false if it didn't exist
   */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clears all entries from the cache
   */
  clear(): void {
    this.cache.clear();
    this.evictionCount = 0;
  }

  /**
   * Gets the current number of entries in the cache
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Gets the maximum size of the cache
   */
  get capacity(): number {
    return this.maxSize;
  }

  /**
   * Gets the total number of evictions that have occurred
   */
  get evictions(): number {
    return this.evictionCount;
  }

  /**
   * Gets all keys in the cache (in order from least to most recently used)
   * 
   * @returns Array of keys
   */
  keys(): K[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Gets all values in the cache (in order from least to most recently used)
   * 
   * @returns Array of values
   */
  values(): V[] {
    return Array.from(this.cache.values());
  }

  /**
   * Gets all entries in the cache (in order from least to most recently used)
   * 
   * @returns Array of [key, value] tuples
   */
  entries(): [K, V][] {
    return Array.from(this.cache.entries());
  }

  /**
   * Iterates over all entries in the cache
   * 
   * @param callback - Function to call for each entry
   */
  forEach(callback: (value: V, key: K, cache: LRUCache<K, V>) => void): void {
    this.cache.forEach((value, key) => {
      callback(value, key, this);
    });
  }

  /**
   * Evicts the least recently used entry (first entry in Map)
   * 
   * @returns The evicted key, or undefined if cache was empty
   */
  private evictLRU(): K | undefined {
    const firstKey = this.cache.keys().next().value;
    
    if (firstKey !== undefined) {
      this.cache.delete(firstKey);
      this.evictionCount++;
      return firstKey;
    }
    
    return undefined;
  }
}
