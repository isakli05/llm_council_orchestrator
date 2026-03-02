/**
 * Example: DomainSpecWriter Pipeline Integration
 * 
 * This example demonstrates how to integrate DomainSpecWriter
 * into the pipeline's SPECIFY state.
 */

import * as path from 'path';
import { DomainDiscoveryEngine } from './DomainDiscoveryEngine';
import { DomainSpecWriter } from './DomainSpecWriter';
import { IndexMetadata, Domain, DiscoveryResult } from './types';

/**
 * Example SPECIFY step handler that could be added to PipelineEngine
 * 
 * This would be called during the SPECIFY state to generate
 * domain-specific spec files from the discovery result.
 */
async function executeSpecifyStep(context: {
  discoveryResult?: DiscoveryResult;
  outputDir?: string;
}) {
  // Validate discovery result exists
  if (!context.discoveryResult) {
    throw new Error('Discovery result not found in context. SPECIFY requires completed DISCOVER step.');
  }

  // Configure spec writer
  const outputDir = context.outputDir || path.join(process.cwd(), 'output', 'domain-specs');
  const writer = new DomainSpecWriter({
    outputDir,
    createDir: true,
  });

  // Generate spec files for all DEEP domains
  console.log('Generating domain spec files...');
  const results = await writer.writeDomainSpecs(context.discoveryResult.domains);

  // Log results
  const successCount = results.filter(r => r.success).length;
  const failureCount = results.filter(r => !r.success).length;

  console.log(`Domain specs generated: ${successCount} successful, ${failureCount} failed`);

  // Return results
  return {
    success: failureCount === 0,
    specFiles: results.filter(r => r.success).map(r => r.filePath),
    errors: results.filter(r => !r.success).map(r => r.error),
  };
}

/**
 * Example: Complete pipeline flow from discovery to spec generation
 */
async function examplePipelineFlow() {
  console.log('=== Example Pipeline Flow: DISCOVER → SPECIFY ===\n');

  // Step 1: Execute DISCOVER state
  console.log('Step 1: Executing DISCOVER state...');
  
  const mockIndexMetadata: IndexMetadata = {
    totalChunks: 100,
    totalFiles: 30,
    filesByExtension: { '.ts': 25, '.json': 5 },
    directoryStructure: [
      {
        name: 'src',
        path: 'src',
        isDirectory: true,
        children: [
          { name: 'auth', path: 'src/auth', isDirectory: true, children: [] },
          { name: 'api', path: 'src/api', isDirectory: true, children: [] },
        ],
      },
    ],
    detectedFrameworks: ['express'],
    dependencies: [
      { name: 'passport', version: '0.6.0', source: 'npm', isDev: false },
      { name: 'express', version: '4.18.0', source: 'npm', isDev: false },
    ],
  };

  const discoveryEngine = new DomainDiscoveryEngine();
  const discoveryResult = await discoveryEngine.discover(mockIndexMetadata);

  console.log(`✅ Discovery complete: ${discoveryResult.statistics.totalDomains} domains found\n`);

  // Step 2: Execute SPECIFY state
  console.log('Step 2: Executing SPECIFY state...');
  
  const specifyResult = await executeSpecifyStep({
    discoveryResult,
    outputDir: path.join(process.cwd(), 'example-output', 'specs'),
  });

  if (specifyResult.success) {
    console.log(`✅ Spec generation complete: ${specifyResult.specFiles.length} files created`);
    console.log('\nGenerated files:');
    for (const filePath of specifyResult.specFiles) {
      console.log(`  - ${filePath}`);
    }
  } else {
    console.log(`❌ Spec generation had errors: ${specifyResult.errors.length} failures`);
  }

  console.log('\n=== Pipeline Flow Complete ===');
}

// Run example if executed directly
if (require.main === module) {
  examplePipelineFlow()
    .then(() => {
      console.log('\n✅ Example completed successfully');
    })
    .catch((error) => {
      console.error('\n❌ Example failed:', error);
      process.exit(1);
    });
}

export { executeSpecifyStep, examplePipelineFlow };
