/**
 * Manual test for DomainDiscoveryEngine
 * 
 * This script tests the basic functionality of the DomainDiscoveryEngine
 * by creating mock index metadata and running discovery.
 */

import { DomainDiscoveryEngine } from './DomainDiscoveryEngine';
import { IndexMetadata, DomainExclusion } from './types';

// Create mock index metadata
const mockIndexMetadata: IndexMetadata = {
  totalChunks: 150,
  totalFiles: 45,
  filesByExtension: {
    '.ts': 30,
    '.js': 10,
    '.json': 5,
  },
  directoryStructure: [
    {
      name: 'src',
      path: 'src',
      isDirectory: true,
      children: [
        {
          name: 'auth',
          path: 'src/auth',
          isDirectory: true,
          children: [],
        },
        {
          name: 'payment',
          path: 'src/payment',
          isDirectory: true,
          children: [],
        },
        {
          name: 'api',
          path: 'src/api',
          isDirectory: true,
          children: [],
        },
      ],
    },
  ],
  detectedFrameworks: ['express', 'react'],
  dependencies: [
    {
      name: 'passport',
      version: '0.6.0',
      source: 'npm',
      isDev: false,
    },
    {
      name: 'stripe',
      version: '12.0.0',
      source: 'npm',
      isDev: false,
    },
    {
      name: 'express',
      version: '4.18.0',
      source: 'npm',
      isDev: false,
    },
    {
      name: 'react',
      version: '18.2.0',
      source: 'npm',
      isDev: false,
    },
  ],
};

async function testBasicDiscovery() {
  console.log('=== Test 1: Basic Discovery (No Exclusions) ===\n');
  
  const engine = new DomainDiscoveryEngine();
  const result = await engine.discover(mockIndexMetadata);
  
  console.log('Discovery Result:');
  console.log(`- Schema Version: ${result.schemaVersion}`);
  console.log(`- Discovered At: ${result.discoveredAt}`);
  console.log(`- Total Domains: ${result.statistics.totalDomains}`);
  console.log(`- Deep Domains: ${result.statistics.deepDomains}`);
  console.log(`- Excluded Domains: ${result.statistics.excludedDomains}`);
  console.log(`- Discovery Time: ${result.executionMetadata.discoveryTimeMs}ms`);
  console.log(`- Fallback Applied: ${result.executionMetadata.fallbackApplied}`);
  console.log('\nDomains:');
  
  for (const domain of result.domains) {
    console.log(`  - ${domain.name} (${domain.id})`);
    console.log(`    Confidence: ${domain.confidence.toFixed(2)}`);
    console.log(`    Analysis Depth: ${domain.analysisDepth}`);
    console.log(`    Signals: ${domain.signals.length}`);
    console.log(`    Evidence: ${domain.evidence.length}`);
  }
  
  console.log('\n');
}

async function testDiscoveryWithExclusions() {
  console.log('=== Test 2: Discovery with User Exclusions ===\n');
  
  const engine = new DomainDiscoveryEngine();
  
  // Create exclusions for payment domain
  const exclusions: DomainExclusion[] = [
    {
      domainId: 'payment_domain',
      justification: 'Payment system is legacy and will be replaced soon',
    },
  ];
  
  const result = await engine.discover(mockIndexMetadata, exclusions);
  
  console.log('Discovery Result:');
  console.log(`- Total Domains: ${result.statistics.totalDomains}`);
  console.log(`- Deep Domains: ${result.statistics.deepDomains}`);
  console.log(`- Excluded Domains: ${result.statistics.excludedDomains}`);
  console.log('\nDomains:');
  
  for (const domain of result.domains) {
    console.log(`  - ${domain.name} (${domain.id})`);
    console.log(`    Analysis Depth: ${domain.analysisDepth}`);
    
    if (domain.exclusionMetadata) {
      console.log(`    Excluded At: ${domain.exclusionMetadata.excludedAt}`);
      console.log(`    Justification: ${domain.exclusionMetadata.justification}`);
    }
  }
  
  console.log('\n');
}

async function testEmptyIndexMetadata() {
  console.log('=== Test 3: Empty Index Metadata (Fallback) ===\n');
  
  const engine = new DomainDiscoveryEngine();
  
  const emptyMetadata: IndexMetadata = {
    totalChunks: 0,
    totalFiles: 0,
    filesByExtension: {},
    directoryStructure: [],
    detectedFrameworks: [],
    dependencies: [],
  };
  
  const result = await engine.discover(emptyMetadata);
  
  console.log('Discovery Result:');
  console.log(`- Total Domains: ${result.statistics.totalDomains}`);
  console.log(`- Deep Domains: ${result.statistics.deepDomains}`);
  console.log(`- Fallback Applied: ${result.executionMetadata.fallbackApplied}`);
  console.log('\nDomains:');
  
  for (const domain of result.domains) {
    console.log(`  - ${domain.name} (${domain.id})`);
    console.log(`    Confidence: ${domain.confidence.toFixed(2)}`);
    console.log(`    Analysis Depth: ${domain.analysisDepth}`);
  }
  
  console.log('\n');
}

// Run all tests
async function runTests() {
  try {
    await testBasicDiscovery();
    await testDiscoveryWithExclusions();
    await testEmptyIndexMetadata();
    
    console.log('✅ All tests completed successfully!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

runTests();
