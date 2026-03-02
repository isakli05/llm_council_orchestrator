/**
 * Run All Discovery Examples
 * 
 * This script runs all domain discovery examples in sequence to demonstrate
 * the various capabilities of the Domain Discovery Engine.
 * 
 * Run with: npx ts-node src/discovery/run-all-examples.ts
 */

import { examplePhpMonolithDiscovery } from './example-php-monolith';
import { exampleNodejsMicroservicesDiscovery } from './example-nodejs-microservices';
import { exampleHybridCmsDiscovery } from './example-hybrid-cms';
import { exampleUserExclusionWorkflow } from './example-user-exclusion';

async function runAllExamples() {
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                   Domain Discovery Engine - Examples                       ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');
  console.log();
  console.log('This script demonstrates the Domain Discovery Engine capabilities through');
  console.log('four comprehensive examples:');
  console.log();
  console.log('  1. PHP Monolith Discovery - Laravel e-commerce application');
  console.log('  2. Node.js Microservices Discovery - Distributed architecture');
  console.log('  3. Hybrid CMS Discovery - WordPress + React headless CMS');
  console.log('  4. User Exclusion Workflow - Excluding legacy/deprecated domains');
  console.log();
  console.log('Each example will run in sequence. Press Ctrl+C to cancel.');
  console.log();
  
  // Wait a moment for user to read
  await sleep(2000);
  
  const examples = [
    {
      name: 'PHP Monolith Discovery',
      fn: examplePhpMonolithDiscovery,
    },
    {
      name: 'Node.js Microservices Discovery',
      fn: exampleNodejsMicroservicesDiscovery,
    },
    {
      name: 'Hybrid CMS Discovery',
      fn: exampleHybridCmsDiscovery,
    },
    {
      name: 'User Exclusion Workflow',
      fn: exampleUserExclusionWorkflow,
    },
  ];
  
  let successCount = 0;
  let failureCount = 0;
  
  for (let i = 0; i < examples.length; i++) {
    const example = examples[i];
    
    console.log('\n' + '═'.repeat(80));
    console.log(`Example ${i + 1}/${examples.length}: ${example.name}`);
    console.log('═'.repeat(80));
    console.log();
    
    try {
      await example.fn();
      successCount++;
      console.log(`\n✅ Example ${i + 1} completed successfully`);
    } catch (error) {
      failureCount++;
      console.error(`\n❌ Example ${i + 1} failed:`, error);
    }
    
    // Pause between examples
    if (i < examples.length - 1) {
      console.log('\n⏸️  Pausing for 2 seconds before next example...');
      await sleep(2000);
    }
  }
  
  // Final summary
  console.log('\n\n' + '╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                            Examples Summary                                ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`Total Examples: ${examples.length}`);
  console.log(`✅ Successful: ${successCount}`);
  console.log(`❌ Failed: ${failureCount}`);
  console.log();
  
  if (failureCount === 0) {
    console.log('🎉 All examples completed successfully!');
    console.log();
    console.log('Key Takeaways:');
    console.log('  • Discovery works across multiple technology stacks (PHP, Node.js, hybrid)');
    console.log('  • All domains default to DEEP analysis (no automatic exclusions)');
    console.log('  • Users have full control over exclusions with required justifications');
    console.log('  • Exclusion records preserve information about excluded domains');
    console.log('  • Discovery adapts to different architectural patterns (monolith, microservices)');
    console.log();
    console.log('Next Steps:');
    console.log('  • Review the generated spec files in example-output/');
    console.log('  • Try running individual examples with different configurations');
    console.log('  • Integrate discovery into your pipeline workflow');
    console.log();
  } else {
    console.log('⚠️  Some examples failed. Please review the errors above.');
    console.log();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run all examples
if (require.main === module) {
  runAllExamples()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Fatal error:', error);
      process.exit(1);
    });
}

export { runAllExamples };
