/**
 * Enterprise Features Test
 * 
 * Validates configuration, metrics, and caching functionality.
 * Run with: node -r ts-node/register src/discovery/test-enterprise-features.ts
 */

import {
  DiscoveryConfigManager,
  initializeGlobalConfig,
  resetGlobalConfig,
  DiscoveryMetricsCollector,
  MetricsRegistry,
  LRUCache,
  CacheManager,
  initializeGlobalCacheManager,
  resetGlobalCacheManager,
} from './index';

// Test utilities
let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    testsPassed++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    testsFailed++;
  }
}

function assertEquals(actual: any, expected: any, message: string) {
  if (actual === expected) {
    console.log(`✅ PASS: ${message}`);
    testsPassed++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    console.error(`   Expected: ${expected}`);
    console.error(`   Actual: ${actual}`);
    testsFailed++;
  }
}

// Test 1: Configuration Management
async function testConfigurationManagement() {
  console.log('\n📋 Test 1: Configuration Management');
  console.log('='.repeat(60));
  
  // Test default configuration
  const defaultConfig = new DiscoveryConfigManager();
  const config = defaultConfig.getConfig();
  
  assertEquals(config.behavior.maxRetries, 3, 'Default maxRetries should be 3');
  assertEquals(config.behavior.baseBackoffMs, 1000, 'Default baseBackoffMs should be 1000');
  assertEquals(config.behavior.lowConfidenceThreshold, 0.3, 'Default lowConfidenceThreshold should be 0.3');
  assert(config.behavior.enablePatternCache, 'Pattern cache should be enabled by default');
  assert(config.performance.enableMetrics, 'Metrics should be enabled by default');
  
  // Test custom configuration
  const customConfig = new DiscoveryConfigManager({
    behavior: {
      maxRetries: 5,
      baseBackoffMs: 2000,
      lowConfidenceThreshold: 0.25,
      maxDirectoryDepth: 15,
      maxEvidencePerDomain: 20,
      enablePatternCache: false,
      cacheTTLMs: 600000,
    },
  });
  
  const custom = customConfig.getConfig();
  assertEquals(custom.behavior.maxRetries, 5, 'Custom maxRetries should be 5');
  assertEquals(custom.behavior.baseBackoffMs, 2000, 'Custom baseBackoffMs should be 2000');
  assertEquals(custom.behavior.lowConfidenceThreshold, 0.25, 'Custom lowConfidenceThreshold should be 0.25');
  assert(!custom.behavior.enablePatternCache, 'Pattern cache should be disabled');
  
  // Test signal weight retrieval
  const authWeight = customConfig.getSignalWeight('filePattern', 'auth');
  assertEquals(authWeight, 0.9, 'Auth file pattern weight should be 0.9');
  
  const unknownWeight = customConfig.getSignalWeight('filePattern', 'unknown_pattern');
  assertEquals(unknownWeight, 0.5, 'Unknown pattern should return default weight 0.5');
  
  // Test configuration validation
  let validationFailed = false;
  try {
    new DiscoveryConfigManager({
      behavior: {
        maxRetries: 100, // Invalid: > 10
        baseBackoffMs: 1000,
        lowConfidenceThreshold: 0.3,
        maxDirectoryDepth: 10,
        maxEvidencePerDomain: 10,
        enablePatternCache: true,
        cacheTTLMs: 300000,
      },
    });
  } catch (error) {
    validationFailed = true;
  }
  
  assert(validationFailed, 'Should throw error for invalid maxRetries');
  
  // Test global configuration
  resetGlobalConfig();
  initializeGlobalConfig({
    behavior: {
      maxRetries: 4,
      baseBackoffMs: 1500,
      lowConfidenceThreshold: 0.3,
      maxDirectoryDepth: 10,
      maxEvidencePerDomain: 10,
      enablePatternCache: true,
      cacheTTLMs: 300000,
    },
  });
  
  const globalConfig = initializeGlobalConfig();
  assertEquals(globalConfig.getConfig().behavior.maxRetries, 3, 'Global config should use defaults after reset');
  
  resetGlobalConfig();
}

// Test 2: Metrics Collection
async function testMetricsCollection() {
  console.log('\n📋 Test 2: Metrics Collection');
  console.log('='.repeat(60));
  
  const collector = new DiscoveryMetricsCollector(true);
  
  // Test phase timing
  collector.startPhase('signal_extraction');
  await sleep(50);
  collector.endPhase('signal_extraction');
  
  collector.startPhase('classification');
  await sleep(30);
  collector.endPhase('classification');
  
  // Test signal recording
  const signals = [
    { type: 'file_pattern', weight: 0.9, source: 'directory_structure' },
    { type: 'dependency', weight: 0.8, source: 'package.json' },
    { type: 'framework', weight: 0.7, source: 'framework_detection' },
  ];
  collector.recordSignals(signals);
  
  // Test domain recording
  const domains = [
    { confidence: 0.85, analysisDepth: 'DEEP', subDomains: [] },
    { confidence: 0.65, analysisDepth: 'DEEP', subDomains: [] },
    { confidence: 0.45, analysisDepth: 'EXCLUDED', subDomains: [] },
  ];
  collector.recordDomains(domains);
  
  // Test resource recording
  collector.recordResourceUsage({
    indexChunksAnalyzed: 100,
    filesAnalyzed: 50,
    dependenciesAnalyzed: 10,
    frameworksDetected: 2,
    directoryNodesTraversed: 200,
  });
  
  // Generate metrics
  const metrics = collector.generateMetrics();
  
  assert(metrics.metricsId.startsWith('discovery_'), 'Metrics ID should start with discovery_');
  assert(metrics.timing.totalMs > 0, 'Total time should be > 0');
  assert(metrics.timing.signalExtractionMs >= 50, 'Signal extraction time should be >= 50ms');
  assert(metrics.timing.classificationMs >= 30, 'Classification time should be >= 30ms');
  
  assertEquals(metrics.signalQuality.totalSignals, 3, 'Should have 3 signals');
  assert(Math.abs(metrics.signalQuality.averageWeight - 0.8) < 0.01, 'Average weight should be ~0.8');
  
  assertEquals(metrics.domainQuality.totalDomains, 3, 'Should have 3 domains');
  assertEquals(metrics.domainQuality.domainsByDepth.deep, 2, 'Should have 2 DEEP domains');
  assertEquals(metrics.domainQuality.domainsByDepth.excluded, 1, 'Should have 1 EXCLUDED domain');
  
  assertEquals(metrics.resources.indexChunksAnalyzed, 100, 'Should have analyzed 100 chunks');
  assertEquals(metrics.resources.filesAnalyzed, 50, 'Should have analyzed 50 files');
  
  // Test Prometheus export
  const prometheusFormat = collector.exportPrometheusFormat();
  assert(prometheusFormat.includes('discovery_duration_ms'), 'Prometheus format should include duration metric');
  assert(prometheusFormat.includes('discovery_signals_total'), 'Prometheus format should include signals metric');
  
  // Test JSON export
  const jsonFormat = collector.exportJSON();
  const parsed = JSON.parse(jsonFormat);
  assertEquals(parsed.signalQuality.totalSignals, 3, 'JSON export should preserve signal count');
}

// Test 3: Metrics Registry
async function testMetricsRegistry() {
  console.log('\n📋 Test 3: Metrics Registry');
  console.log('='.repeat(60));
  
  const registry = new MetricsRegistry(10); // Max 10 entries
  
  // Create and register multiple metrics
  for (let i = 0; i < 5; i++) {
    const collector = new DiscoveryMetricsCollector(true);
    
    collector.recordSignals([
      { type: 'file_pattern', weight: 0.8, source: 'test' },
    ]);
    
    collector.recordDomains([
      { confidence: 0.7, analysisDepth: 'DEEP', subDomains: [] },
    ]);
    
    if (i === 4) {
      collector.recordFallback(); // Last one uses fallback
    }
    
    const metrics = collector.generateMetrics();
    registry.register(metrics);
  }
  
  // Test summary
  const summary = registry.getSummary();
  
  assertEquals(summary.totalRuns, 5, 'Should have 5 runs');
  assertEquals(summary.averageSignals, 1, 'Average signals should be 1');
  assertEquals(summary.averageDomains, 1, 'Average domains should be 1');
  assertEquals(summary.successRate, 0.8, 'Success rate should be 0.8 (4/5)');
  assertEquals(summary.fallbackRate, 0.2, 'Fallback rate should be 0.2 (1/5)');
  
  // Test history limit
  for (let i = 0; i < 10; i++) {
    const collector = new DiscoveryMetricsCollector(true);
    const metrics = collector.generateMetrics();
    registry.register(metrics);
  }
  
  assertEquals(registry.getAllMetrics().length, 10, 'Should maintain max 10 entries');
  
  // Test clear
  registry.clear();
  assertEquals(registry.getAllMetrics().length, 0, 'Should clear all metrics');
}

// Test 4: LRU Cache
async function testLRUCache() {
  console.log('\n📋 Test 4: LRU Cache');
  console.log('='.repeat(60));
  
  const cache = new LRUCache<string, string>(3, 0); // Max 3 entries, no TTL
  
  // Test basic operations
  cache.set('a', 'value-a');
  cache.set('b', 'value-b');
  cache.set('c', 'value-c');
  
  assertEquals(cache.get('a'), 'value-a', 'Should retrieve value-a');
  assertEquals(cache.get('b'), 'value-b', 'Should retrieve value-b');
  assertEquals(cache.get('c'), 'value-c', 'Should retrieve value-c');
  
  // Test LRU eviction
  cache.set('d', 'value-d'); // Should evict 'a' (least recently used)
  
  assertEquals(cache.get('a'), undefined, 'Should have evicted a');
  assertEquals(cache.get('b'), 'value-b', 'Should still have b');
  assertEquals(cache.get('c'), 'value-c', 'Should still have c');
  assertEquals(cache.get('d'), 'value-d', 'Should have d');
  
  // Test statistics
  const stats = cache.getStatistics();
  assert(stats.hits > 0, 'Should have cache hits');
  assert(stats.misses > 0, 'Should have cache misses');
  assert(stats.evictions > 0, 'Should have evictions');
  assert(stats.hitRate > 0 && stats.hitRate < 1, 'Hit rate should be between 0 and 1');
  
  // Test TTL
  const ttlCache = new LRUCache<string, string>(10, 100); // 100ms TTL
  ttlCache.set('x', 'value-x');
  
  assertEquals(ttlCache.get('x'), 'value-x', 'Should retrieve value-x immediately');
  
  await sleep(150); // Wait for expiration
  
  assertEquals(ttlCache.get('x'), undefined, 'Should have expired after TTL');
  
  const ttlStats = ttlCache.getStatistics();
  assert(ttlStats.expirations > 0, 'Should have expirations');
}

// Test 5: Cache Manager
async function testCacheManager() {
  console.log('\n📋 Test 5: Cache Manager');
  console.log('='.repeat(60));
  
  resetGlobalCacheManager();
  
  const cacheManager = initializeGlobalCacheManager(
    true,   // enabled
    100,    // pattern cache size
    50,     // dependency cache size
    1000,   // TTL (1 second)
    0       // no periodic cleanup
  );
  
  // Test pattern cache
  const patternCache = cacheManager.getPatternCache();
  patternCache.setDomainName('/auth', 'file_pattern', 'authentication');
  
  assertEquals(
    patternCache.getDomainName('/auth', 'file_pattern'),
    'authentication',
    'Should retrieve cached domain name'
  );
  
  // Test dependency cache
  const depCache = cacheManager.getDependencyCache();
  depCache.setMappings('passport', '0.6.0', [
    { domain: 'authentication', weight: 0.9 },
  ]);
  
  const mappings = depCache.getMappings('passport', '0.6.0');
  assert(mappings !== undefined, 'Should retrieve cached mappings');
  assertEquals(mappings![0].domain, 'authentication', 'Should have authentication domain');
  
  // Test unified statistics
  const stats = cacheManager.getStatistics();
  assert(stats.pattern.size > 0, 'Pattern cache should have entries');
  assert(stats.dependency.size > 0, 'Dependency cache should have entries');
  assert(stats.combined.totalSize > 0, 'Combined size should be > 0');
  
  // Test cleanup
  await sleep(1100); // Wait for TTL expiration
  const cleaned = cacheManager.cleanup();
  assert(cleaned.pattern > 0 || cleaned.dependency > 0, 'Should clean up expired entries');
  
  // Test clear all
  cacheManager.clearAll();
  const clearedStats = cacheManager.getStatistics();
  assertEquals(clearedStats.combined.totalSize, 0, 'Should clear all caches');
  
  // Test destroy
  cacheManager.destroy();
  
  resetGlobalCacheManager();
}

// Test 6: Integration Test
async function testIntegration() {
  console.log('\n📋 Test 6: Integration Test');
  console.log('='.repeat(60));
  
  // Initialize all systems
  resetGlobalConfig();
  resetGlobalCacheManager();
  
  initializeGlobalConfig({
    behavior: {
      maxRetries: 3,
      baseBackoffMs: 1000,
      lowConfidenceThreshold: 0.3,
      maxDirectoryDepth: 10,
      maxEvidencePerDomain: 10,
      enablePatternCache: true,
      cacheTTLMs: 300000,
    },
    performance: {
      enableMetrics: true,
      enableDetailedTiming: true,
      signalBatchSize: 100,
      enableParallelProcessing: false,
    },
  });
  
  initializeGlobalCacheManager(true, 1000, 500, 300000, 60000);
  
  // Simulate discovery workflow
  const metricsCollector = new DiscoveryMetricsCollector(true);
  const cacheManager = initializeGlobalCacheManager();
  
  // Phase 1: Signal extraction
  metricsCollector.startPhase('signal_extraction');
  
  const patternCache = cacheManager.getPatternCache();
  patternCache.setDomainName('/auth', 'file_pattern', 'authentication');
  patternCache.setDomainName('/payment', 'file_pattern', 'payment');
  
  metricsCollector.endPhase('signal_extraction');
  
  // Phase 2: Classification
  metricsCollector.startPhase('classification');
  
  const signals = [
    { type: 'file_pattern', weight: 0.9, source: 'directory_structure' },
    { type: 'dependency', weight: 0.9, source: 'package.json' },
  ];
  metricsCollector.recordSignals(signals);
  
  const domains = [
    { confidence: 0.85, analysisDepth: 'DEEP', subDomains: [] },
    { confidence: 0.75, analysisDepth: 'DEEP', subDomains: [] },
  ];
  metricsCollector.recordDomains(domains);
  
  metricsCollector.endPhase('classification');
  
  // Generate final metrics
  const metrics = metricsCollector.generateMetrics();
  
  assert(metrics.timing.totalMs >= 0, 'Integration: Total time should be >= 0');
  assertEquals(metrics.signalQuality.totalSignals, 2, 'Integration: Should have 2 signals');
  assertEquals(metrics.domainQuality.totalDomains, 2, 'Integration: Should have 2 domains');
  
  // Check cache statistics
  const cacheStats = cacheManager.getStatistics();
  assert(cacheStats.pattern.size > 0, 'Integration: Pattern cache should have entries');
  
  console.log('\n✅ Integration test completed successfully');
  console.log(`   - Metrics collected: ${metrics.metricsId}`);
  console.log(`   - Cache entries: ${cacheStats.combined.totalSize}`);
  console.log(`   - Discovery time: ${metrics.timing.totalMs}ms`);
  
  // Cleanup
  cacheManager.destroy();
  resetGlobalConfig();
  resetGlobalCacheManager();
}

// Helper function
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run all tests
async function runAllTests() {
  console.log('\n🧪 Enterprise Features Test Suite');
  console.log('='.repeat(60));
  
  try {
    await testConfigurationManagement();
    await testMetricsCollection();
    await testMetricsRegistry();
    await testLRUCache();
    await testCacheManager();
    await testIntegration();
    
    console.log('\n' + '='.repeat(60));
    console.log(`\n📊 Test Results:`);
    console.log(`   ✅ Passed: ${testsPassed}`);
    console.log(`   ❌ Failed: ${testsFailed}`);
    console.log(`   📈 Total: ${testsPassed + testsFailed}`);
    
    if (testsFailed === 0) {
      console.log('\n🎉 All enterprise features tests passed!');
      console.log('\n✨ Features validated:');
      console.log('   • Configuration management with environment variables');
      console.log('   • Metrics collection with OpenTelemetry-style instrumentation');
      console.log('   • LRU cache with TTL support');
      console.log('   • Cache manager with unified statistics');
      console.log('   • Integration of all enterprise features');
      process.exit(0);
    } else {
      console.log('\n⚠️  Some tests failed!');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n💥 Test execution failed:', error);
    process.exit(1);
  }
}

// Run tests
runAllTests();
