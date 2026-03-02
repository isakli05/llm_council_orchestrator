/**
 * Example: User Exclusion Workflow
 * 
 * This example demonstrates how users can exclude specific domains from
 * analysis while maintaining documentation of what was excluded and why.
 * 
 * Run with: npx ts-node src/discovery/example-user-exclusion.ts
 */

import { DomainDiscoveryEngine } from './DomainDiscoveryEngine';
import { DomainSpecWriter } from './DomainSpecWriter';
import { IndexMetadata, DomainExclusion } from './types';
import * as path from 'path';

async function exampleUserExclusionWorkflow() {
  console.log('=== Example: User Exclusion Workflow ===\n');
  console.log('This example demonstrates a complete workflow where a user:');
  console.log('1. Runs initial discovery to see all domains');
  console.log('2. Decides to exclude certain domains');
  console.log('3. Re-runs discovery with exclusions');
  console.log('4. Generates specs with exclusion records');
  console.log();
  
  // Simulate index metadata from a large enterprise application
  const enterpriseIndexMetadata: IndexMetadata = {
    totalChunks: 2500,
    totalFiles: 650,
    filesByExtension: {
      '.ts': 420,
      '.js': 150,
      '.php': 50,
      '.json': 20,
      '.yaml': 10,
    },
    directoryStructure: [
      {
        name: 'src',
        path: 'src',
        isDirectory: true,
        children: [
          { name: 'auth', path: 'src/auth', isDirectory: true, children: [] },
          { name: 'payment', path: 'src/payment', isDirectory: true, children: [] },
          { name: 'admin', path: 'src/admin', isDirectory: true, children: [] },
          { name: 'api', path: 'src/api', isDirectory: true, children: [] },
          { name: 'legacy-admin', path: 'src/legacy-admin', isDirectory: true, children: [] },
          { name: 'deprecated-api-v1', path: 'src/deprecated-api-v1', isDirectory: true, children: [] },
          { name: 'test-utils', path: 'src/test-utils', isDirectory: true, children: [] },
        ],
      },
    ],
    detectedFrameworks: ['Express', 'React'],
    dependencies: [
      { name: 'express', version: '4.18.2', source: 'npm', isDev: false },
      { name: 'passport', version: '0.6.0', source: 'npm', isDev: false },
      { name: 'stripe', version: '12.0.0', source: 'npm', isDev: false },
      { name: 'react', version: '18.2.0', source: 'npm', isDev: false },
    ],
  };
  
  const engine = new DomainDiscoveryEngine();
  
  // ============================================================================
  // STEP 1: Initial Discovery (No Exclusions)
  // ============================================================================
  console.log('─'.repeat(80));
  console.log('STEP 1: Initial Discovery (No Exclusions)');
  console.log('─'.repeat(80));
  console.log('Running discovery to see all domains in the codebase...\n');
  
  const initialResult = await engine.discover(enterpriseIndexMetadata);
  
  console.log(`✅ Discovery complete: ${initialResult.statistics.totalDomains} domains found\n`);
  console.log('Discovered Domains:');
  
  for (const domain of initialResult.domains) {
    console.log(`  ${domain.analysisDepth === 'DEEP' ? '🟢' : '🔴'} ${domain.name} (${domain.id})`);
    console.log(`     Confidence: ${(domain.confidence * 100).toFixed(1)}%`);
    console.log(`     Analysis Depth: ${domain.analysisDepth}`);
    console.log(`     Signals: ${domain.signals.length}`);
    console.log();
  }
  
  console.log('Observation: All domains are tagged as DEEP by default.');
  console.log('This includes legacy and deprecated code that may not be relevant.\n');
  
  // ============================================================================
  // STEP 2: User Decision - Define Exclusions
  // ============================================================================
  console.log('─'.repeat(80));
  console.log('STEP 2: User Decision - Define Exclusions');
  console.log('─'.repeat(80));
  console.log('After reviewing the domains, the user decides to exclude:');
  console.log('  • Legacy Admin Panel - Being replaced in Q2 2024');
  console.log('  • Deprecated API v1 - Sunset scheduled for March 2024');
  console.log('  • Test Utilities - Not part of production architecture\n');
  
  const exclusions: DomainExclusion[] = [
    {
      domainId: 'legacy_admin_domain',
      justification: 'Legacy admin panel scheduled for replacement in Q2 2024. New admin panel (src/admin) is the focus of modernization effort.',
    },
    {
      domainId: 'deprecated_api_v1_domain',
      justification: 'API v1 is deprecated and will be sunset on March 31, 2024. All clients have migrated to v2. No further development or analysis needed.',
    },
    {
      domainId: 'test_utilities_domain',
      justification: 'Test utilities and fixtures are not part of the production architecture. Focus analysis on business logic and production code.',
    },
  ];
  
  console.log('Exclusions defined with clear justifications.\n');
  
  // ============================================================================
  // STEP 3: Re-run Discovery with Exclusions
  // ============================================================================
  console.log('─'.repeat(80));
  console.log('STEP 3: Re-run Discovery with Exclusions');
  console.log('─'.repeat(80));
  console.log('Running discovery again with user-specified exclusions...\n');
  
  const finalResult = await engine.discover(enterpriseIndexMetadata, exclusions);
  
  console.log(`✅ Discovery complete with exclusions applied\n`);
  console.log('Statistics:');
  console.log(`  Total Domains: ${finalResult.statistics.totalDomains}`);
  console.log(`  Deep Domains: ${finalResult.statistics.deepDomains}`);
  console.log(`  Excluded Domains: ${finalResult.statistics.excludedDomains}`);
  console.log();
  
  console.log('Final Domain Status:');
  
  const deepDomains = finalResult.domains.filter(d => d.analysisDepth === 'DEEP');
  const excludedDomains = finalResult.domains.filter(d => d.analysisDepth === 'EXCLUDED');
  
  if (deepDomains.length > 0) {
    console.log('\n🟢 DEEP Domains (Will be analyzed):');
    for (const domain of deepDomains) {
      console.log(`  • ${domain.name}`);
      console.log(`    Confidence: ${(domain.confidence * 100).toFixed(1)}%`);
      console.log(`    Signals: ${domain.signals.length}`);
    }
  }
  
  if (excludedDomains.length > 0) {
    console.log('\n🔴 EXCLUDED Domains (Will not be analyzed):');
    for (const domain of excludedDomains) {
      console.log(`  • ${domain.name}`);
      console.log(`    Original Confidence: ${(domain.confidence * 100).toFixed(1)}%`);
      if (domain.exclusionMetadata) {
        console.log(`    Excluded At: ${domain.exclusionMetadata.excludedAt}`);
        console.log(`    Justification: ${domain.exclusionMetadata.justification}`);
      }
    }
  }
  
  // ============================================================================
  // STEP 4: Generate Specs with Exclusion Records
  // ============================================================================
  console.log('\n' + '─'.repeat(80));
  console.log('STEP 4: Generate Specs with Exclusion Records');
  console.log('─'.repeat(80));
  console.log('Generating domain-specific spec files...\n');
  
  const outputDir = path.join(process.cwd(), 'example-output', 'exclusion-workflow');
  const writer = new DomainSpecWriter({
    outputDir,
    createDir: true,
  });
  
  const writeResults = await writer.writeDomainSpecs(finalResult.domains);
  
  const successCount = writeResults.filter(r => r.success).length;
  const failureCount = writeResults.filter(r => !r.success).length;
  
  console.log(`✅ Spec generation complete: ${successCount} files created, ${failureCount} failures\n`);
  
  console.log('Generated Files:');
  
  // Group by type
  const specFiles = writeResults.filter(r => r.success && r.filePath && !r.filePath.includes('.excluded.'));
  const exclusionFiles = writeResults.filter(r => r.success && r.filePath && r.filePath.includes('.excluded.'));
  const indexFiles = writeResults.filter(r => r.success && r.filePath && r.filePath.includes('index.yaml'));
  
  if (specFiles.length > 0) {
    console.log('\n📄 Domain Spec Files (DEEP domains):');
    for (const result of specFiles) {
      if (result.filePath) {
        console.log(`  • ${path.basename(result.filePath)}`);
      }
    }
  }
  
  if (exclusionFiles.length > 0) {
    console.log('\n📋 Exclusion Records (EXCLUDED domains):');
    for (const result of exclusionFiles) {
      if (result.filePath) {
        console.log(`  • ${path.basename(result.filePath)}`);
      }
    }
  }
  
  if (indexFiles.length > 0) {
    console.log('\n📑 Master Index:');
    for (const result of indexFiles) {
      if (result.filePath) {
        console.log(`  • ${path.basename(result.filePath)}`);
      }
    }
  }
  
  // ============================================================================
  // Summary
  // ============================================================================
  console.log('\n' + '─'.repeat(80));
  console.log('📊 Workflow Summary');
  console.log('─'.repeat(80));
  console.log();
  console.log('What happened:');
  console.log('  1. ✅ Initial discovery found all domains (including legacy/deprecated)');
  console.log('  2. ✅ User reviewed domains and defined exclusions with justifications');
  console.log('  3. ✅ Discovery re-run with exclusions applied');
  console.log('  4. ✅ Spec files generated for DEEP domains');
  console.log('  5. ✅ Exclusion records created for EXCLUDED domains');
  console.log();
  console.log('Key Benefits:');
  console.log('  • User maintains full control over what gets analyzed');
  console.log('  • Exclusions are documented with clear justifications');
  console.log('  • Excluded domains are preserved in exclusion records');
  console.log('  • No automatic exclusions - all decisions are explicit');
  console.log('  • Analysis focuses on relevant, active code');
  console.log();
  console.log('Files Generated:');
  console.log(`  • ${deepDomains.length} domain spec files (DEEP domains)`);
  console.log(`  • ${excludedDomains.length} exclusion records (EXCLUDED domains)`);
  console.log('  • 1 master index file (all domains)');
  console.log();
  console.log('Next Steps:');
  console.log('  • Review generated spec files');
  console.log('  • Proceed with domain-aware analysis (ANALYZE state)');
  console.log('  • Generate detailed architecture documentation');
  console.log();
  console.log('✅ User exclusion workflow complete!');
}

// Run example
if (require.main === module) {
  exampleUserExclusionWorkflow()
    .then(() => {
      console.log('\n✅ Example completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Example failed:', error);
      process.exit(1);
    });
}

export { exampleUserExclusionWorkflow };
