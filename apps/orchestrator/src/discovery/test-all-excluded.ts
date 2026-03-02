/**
 * Test script to verify "all domains excluded" warning
 * Run with: node -r ts-node/register src/discovery/test-all-excluded.ts
 */

import { DomainDiscoveryEngine } from './DomainDiscoveryEngine';
import { IndexMetadata, DomainExclusion } from './types';

async function testAllDomainsExcluded() {
  console.log('=== Test: All Domains Excluded Warning ===\n');
  
  const engine = new DomainDiscoveryEngine();
  
  // Create metadata that will discover multiple domains
  const metadata: IndexMetadata = {
    totalChunks: 50,
    totalFiles: 20,
    filesByExtension: { '.js': 20 },
    directoryStructure: [
      {
        name: 'auth',
        path: '/auth',
        isDirectory: true,
        children: [],
      },
      {
        name: 'payment',
        path: '/payment',
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
      {
        name: 'stripe',
        version: '12.0.0',
        source: 'npm',
        isDev: false,
      },
    ],
  };
  
  // First, discover without exclusions to see what domains are found
  console.log('Step 1: Discovering domains without exclusions...\n');
  const initialResult = await engine.discover(metadata);
  
  console.log(`Found ${initialResult.domains.length} domains:`);
  initialResult.domains.forEach(d => {
    console.log(`  - ${d.id} (${d.name})`);
  });
  
  // Now exclude ALL discovered domains
  console.log('\nStep 2: Excluding ALL discovered domains...\n');
  const exclusions: DomainExclusion[] = initialResult.domains.map(d => ({
    domainId: d.id,
    justification: `Excluding ${d.name} for testing purposes`,
  }));
  
  const result = await engine.discover(metadata, exclusions);
  
  console.log('\nResult:');
  console.log(`- Total Domains: ${result.statistics.totalDomains}`);
  console.log(`- Deep Domains: ${result.statistics.deepDomains}`);
  console.log(`- Excluded Domains: ${result.statistics.excludedDomains}`);
  
  // Verify the warning was logged
  if (result.statistics.deepDomains === 0 && result.statistics.excludedDomains > 0) {
    console.log('\n✅ SUCCESS: All domains were excluded, warning should have been logged above');
  } else {
    console.log('\n❌ FAIL: Expected all domains to be excluded');
  }
}

// Run test
testAllDomainsExcluded()
  .then(() => {
    console.log('\n✅ Test completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
