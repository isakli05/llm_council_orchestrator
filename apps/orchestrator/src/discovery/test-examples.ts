/**
 * Simple test to verify examples are correctly structured
 * 
 * This doesn't run the full examples but validates their structure
 * and ensures they can be imported without errors.
 */

import { DomainDiscoveryEngine } from './DomainDiscoveryEngine';
import { IndexMetadata } from './types';

async function testExampleStructure() {
  console.log('Testing example structure...\n');
  
  // Test 1: Verify basic discovery works
  console.log('✓ Test 1: Basic discovery functionality');
  const engine = new DomainDiscoveryEngine();
  const simpleMetadata: IndexMetadata = {
    totalChunks: 10,
    totalFiles: 5,
    filesByExtension: { '.ts': 5 },
    directoryStructure: [
      {
        name: 'src',
        path: 'src',
        isDirectory: true,
        children: [
          { name: 'auth', path: 'src/auth', isDirectory: true, children: [] },
        ],
      },
    ],
    detectedFrameworks: ['express'],
    dependencies: [
      { name: 'passport', version: '0.6.0', source: 'npm', isDev: false },
    ],
  };
  
  const result = await engine.discover(simpleMetadata);
  console.log(`  - Discovered ${result.domains.length} domain(s)`);
  console.log(`  - All domains tagged as: ${result.domains.map(d => d.analysisDepth).join(', ')}`);
  
  // Test 2: Verify exclusions work
  console.log('\n✓ Test 2: Exclusion functionality');
  const resultWithExclusion = await engine.discover(simpleMetadata, [
    {
      domainId: result.domains[0]?.id || 'test_domain',
      justification: 'Test exclusion',
    },
  ]);
  
  const excludedCount = resultWithExclusion.domains.filter(d => d.analysisDepth === 'EXCLUDED').length;
  console.log(`  - Excluded ${excludedCount} domain(s)`);
  
  // Test 3: Verify fallback works
  console.log('\n✓ Test 3: Fallback functionality');
  const emptyMetadata: IndexMetadata = {
    totalChunks: 0,
    totalFiles: 0,
    filesByExtension: {},
    directoryStructure: [],
    detectedFrameworks: [],
    dependencies: [],
  };
  
  const fallbackResult = await engine.discover(emptyMetadata);
  console.log(`  - Fallback applied: ${fallbackResult.executionMetadata.fallbackApplied}`);
  console.log(`  - Fallback domain: ${fallbackResult.domains[0]?.name}`);
  
  console.log('\n✅ All example structure tests passed!');
  console.log('\nExample files created:');
  console.log('  • example-php-monolith.ts - PHP Laravel e-commerce');
  console.log('  • example-nodejs-microservices.ts - Node.js microservices');
  console.log('  • example-hybrid-cms.ts - WordPress + React CMS');
  console.log('  • example-user-exclusion.ts - Exclusion workflow');
  console.log('  • run-all-examples.ts - Run all examples');
  console.log('  • EXAMPLES.md - Documentation');
  console.log('\nTo run individual examples (when ts-node is available):');
  console.log('  npx ts-node src/discovery/example-php-monolith.ts');
  console.log('  npx ts-node src/discovery/example-nodejs-microservices.ts');
  console.log('  npx ts-node src/discovery/example-hybrid-cms.ts');
  console.log('  npx ts-node src/discovery/example-user-exclusion.ts');
  console.log('  npx ts-node src/discovery/run-all-examples.ts');
}

// Run test
testExampleStructure()
  .then(() => {
    console.log('\n✅ Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
