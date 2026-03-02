/**
 * Manual test script for DomainDiscoveryEngine fallback behavior
 * Run with: npx ts-node src/discovery/test-fallback.ts
 */

import { DomainDiscoveryEngine } from './DomainDiscoveryEngine';
import { IndexMetadata } from './types';

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

// Test 1: Fallback on max retries exceeded
async function testFallbackOnMaxRetries() {
  console.log('\n📋 Test 1: Fallback on max retries exceeded');
  console.log('='.repeat(60));
  
  const engine = new DomainDiscoveryEngine();
  
  // Mock executeDiscovery to always fail
  const originalExecuteDiscovery = (engine as any).executeDiscovery;
  let callCount = 0;
  (engine as any).executeDiscovery = async () => {
    callCount++;
    throw new Error(`Simulated failure ${callCount}`);
  };
  
  const metadata: IndexMetadata = {
    totalChunks: 10,
    totalFiles: 5,
    filesByExtension: { '.js': 5 },
    directoryStructure: [],
    detectedFrameworks: [],
    dependencies: [],
  };
  
  const result = await engine.discover(metadata);
  
  // Verify retry count
  assertEquals(callCount, 3, 'Should retry exactly 3 times');
  
  // Verify fallback result
  assert(result !== null, 'Result should not be null');
  assertEquals(result.schemaVersion, '1.0.0', 'Schema version should be 1.0.0');
  assertEquals(result.domains.length, 1, 'Should have exactly 1 fallback domain');
  
  // Verify fallback domain
  const domain = result.domains[0];
  assertEquals(domain.id, 'general_architecture_domain', 'Domain ID should be general_architecture_domain');
  assertEquals(domain.name, 'General Architecture', 'Domain name should be General Architecture');
  assertEquals(domain.confidence, 0.5, 'Confidence should be 0.5');
  assertEquals(domain.analysisDepth, 'DEEP', 'Analysis depth should be DEEP');
  assertEquals(domain.signals.length, 0, 'Signals should be empty');
  assertEquals(domain.evidence.length, 0, 'Evidence should be empty');
  
  // Verify statistics
  assertEquals(result.statistics.totalDomains, 1, 'Total domains should be 1');
  assertEquals(result.statistics.deepDomains, 1, 'Deep domains should be 1');
  assertEquals(result.statistics.excludedDomains, 0, 'Excluded domains should be 0');
  
  // Verify fallbackApplied flag
  assertEquals(result.executionMetadata.fallbackApplied, true, 'fallbackApplied should be true');
  assertEquals(result.executionMetadata.discoveryTimeMs, 0, 'Discovery time should be 0');
  assertEquals(result.executionMetadata.indexChunksAnalyzed, 0, 'Index chunks analyzed should be 0');
  assertEquals(result.executionMetadata.signalTypesUsed.length, 0, 'Signal types used should be empty');
  
  // Restore original method
  (engine as any).executeDiscovery = originalExecuteDiscovery;
}

// Test 2: Fallback on validation failure
async function testFallbackOnValidationFailure() {
  console.log('\n📋 Test 2: Fallback on validation failure');
  console.log('='.repeat(60));
  
  const engine = new DomainDiscoveryEngine();
  
  // Mock validateDiscoveryResult to always return false
  const originalValidate = (engine as any).validateDiscoveryResult;
  (engine as any).validateDiscoveryResult = () => false;
  
  const metadata: IndexMetadata = {
    totalChunks: 10,
    totalFiles: 5,
    filesByExtension: { '.js': 5 },
    directoryStructure: [],
    detectedFrameworks: [],
    dependencies: [],
  };
  
  const result = await engine.discover(metadata);
  
  // Verify fallback was applied
  assertEquals(result.executionMetadata.fallbackApplied, true, 'fallbackApplied should be true');
  assertEquals(result.domains.length, 1, 'Should have exactly 1 fallback domain');
  assertEquals(result.domains[0].id, 'general_architecture_domain', 'Should be fallback domain');
  
  // Restore original method
  (engine as any).validateDiscoveryResult = originalValidate;
}

// Test 3: Zero domains handled by classifier
async function testZeroDomainsHandling() {
  console.log('\n📋 Test 3: Zero domains handled by classifier');
  console.log('='.repeat(60));
  
  const engine = new DomainDiscoveryEngine();
  
  // Create metadata with no recognizable patterns
  const metadata: IndexMetadata = {
    totalChunks: 5,
    totalFiles: 2,
    filesByExtension: { '.txt': 2 },
    directoryStructure: [],
    detectedFrameworks: [],
    dependencies: [],
  };
  
  const result = await engine.discover(metadata);
  
  // Should have at least one domain (fallback from classifier)
  assert(result.domains.length >= 1, 'Should have at least 1 domain');
  
  // If only one domain, it should be the fallback
  if (result.domains.length === 1) {
    assertEquals(result.domains[0].id, 'general_architecture_domain', 'Should be fallback domain');
    assertEquals(result.domains[0].analysisDepth, 'DEEP', 'Should be DEEP analysis');
  }
  
  console.log(`   Found ${result.domains.length} domain(s)`);
}

// Test 4: Successful discovery (no fallback)
async function testSuccessfulDiscovery() {
  console.log('\n📋 Test 4: Successful discovery (no fallback)');
  console.log('='.repeat(60));
  
  const engine = new DomainDiscoveryEngine();
  
  // Create metadata with recognizable patterns
  const metadata: IndexMetadata = {
    totalChunks: 20,
    totalFiles: 10,
    filesByExtension: { '.js': 10 },
    directoryStructure: [
      {
        name: 'auth',
        path: '/auth',
        isDirectory: true,
        children: [],
      },
      {
        name: 'api',
        path: '/api',
        isDirectory: true,
        children: [],
      },
    ],
    detectedFrameworks: ['express'],
    dependencies: [
      {
        name: 'passport',
        version: '0.6.0',
        source: 'npm',
        isDev: false,
      },
    ],
  };
  
  const result = await engine.discover(metadata);
  
  // Should NOT use fallback
  assertEquals(result.executionMetadata.fallbackApplied, false, 'fallbackApplied should be false');
  assert(result.domains.length > 0, 'Should have discovered domains');
  
  console.log(`   Discovered ${result.domains.length} domain(s):`);
  result.domains.forEach(d => {
    console.log(`   - ${d.name} (confidence: ${d.confidence.toFixed(2)}, depth: ${d.analysisDepth})`);
  });
}

// Test 5: Retry with eventual success
async function testRetryWithSuccess() {
  console.log('\n📋 Test 5: Retry with eventual success');
  console.log('='.repeat(60));
  
  const engine = new DomainDiscoveryEngine();
  
  // Mock executeDiscovery to fail first 2 times, succeed on 3rd
  let callCount = 0;
  const originalExecuteDiscovery = (engine as any).executeDiscovery;
  (engine as any).executeDiscovery = async (metadata: IndexMetadata, exclusions: any) => {
    callCount++;
    if (callCount < 3) {
      throw new Error(`Attempt ${callCount} failed`);
    }
    // Return valid result on 3rd attempt
    return {
      schemaVersion: '1.0.0',
      discoveredAt: new Date().toISOString(),
      domains: [{
        id: 'test_domain',
        name: 'Test Domain',
        confidence: 0.8,
        analysisDepth: 'DEEP',
        signals: [],
        evidence: [],
      }],
      statistics: {
        totalDomains: 1,
        deepDomains: 1,
        excludedDomains: 0,
      },
      executionMetadata: {
        discoveryTimeMs: 100,
        indexChunksAnalyzed: 10,
        signalTypesUsed: [],
        fallbackApplied: false,
      },
    };
  };
  
  const metadata: IndexMetadata = {
    totalChunks: 10,
    totalFiles: 5,
    filesByExtension: { '.js': 5 },
    directoryStructure: [],
    detectedFrameworks: [],
    dependencies: [],
  };
  
  const result = await engine.discover(metadata);
  
  // Should succeed on 3rd attempt
  assertEquals(callCount, 3, 'Should have called executeDiscovery 3 times');
  assertEquals(result.executionMetadata.fallbackApplied, false, 'fallbackApplied should be false');
  assertEquals(result.domains[0].id, 'test_domain', 'Should have test domain');
  
  // Restore original method
  (engine as any).executeDiscovery = originalExecuteDiscovery;
}

// Run all tests
async function runAllTests() {
  console.log('\n🧪 Domain Discovery Engine - Fallback Behavior Tests');
  console.log('='.repeat(60));
  
  try {
    await testFallbackOnMaxRetries();
    await testFallbackOnValidationFailure();
    await testZeroDomainsHandling();
    await testSuccessfulDiscovery();
    await testRetryWithSuccess();
    
    console.log('\n' + '='.repeat(60));
    console.log(`\n📊 Test Results:`);
    console.log(`   ✅ Passed: ${testsPassed}`);
    console.log(`   ❌ Failed: ${testsFailed}`);
    console.log(`   📈 Total: ${testsPassed + testsFailed}`);
    
    if (testsFailed === 0) {
      console.log('\n🎉 All tests passed!');
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
