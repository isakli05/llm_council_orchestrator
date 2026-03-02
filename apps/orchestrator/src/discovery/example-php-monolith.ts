/**
 * Example: PHP Monolith Discovery
 * 
 * This example demonstrates how the Domain Discovery Engine identifies
 * domains in a PHP monolith application (Laravel-based e-commerce platform).
 * 
 * Run with: npx ts-node src/discovery/example-php-monolith.ts
 */

import { DomainDiscoveryEngine } from './DomainDiscoveryEngine';
import { IndexMetadata } from './types';

async function examplePhpMonolithDiscovery() {
  console.log('=== Example: PHP Monolith Discovery (Laravel E-commerce) ===\n');
  
  // Simulate index metadata from a Laravel e-commerce application
  const laravelIndexMetadata: IndexMetadata = {
    totalChunks: 850,
    totalFiles: 180,
    filesByExtension: {
      '.php': 145,
      '.blade.php': 25,
      '.json': 5,
      '.env': 1,
      '.js': 4,
    },
    directoryStructure: [
      {
        name: 'app',
        path: 'app',
        isDirectory: true,
        children: [
          {
            name: 'Http',
            path: 'app/Http',
            isDirectory: true,
            children: [
              {
                name: 'Controllers',
                path: 'app/Http/Controllers',
                isDirectory: true,
                children: [
                  { name: 'Auth', path: 'app/Http/Controllers/Auth', isDirectory: true, children: [] },
                  { name: 'Admin', path: 'app/Http/Controllers/Admin', isDirectory: true, children: [] },
                  { name: 'Payment', path: 'app/Http/Controllers/Payment', isDirectory: true, children: [] },
                  { name: 'Product', path: 'app/Http/Controllers/Product', isDirectory: true, children: [] },
                ],
              },
              {
                name: 'Middleware',
                path: 'app/Http/Middleware',
                isDirectory: true,
                children: [],
              },
            ],
          },
          {
            name: 'Models',
            path: 'app/Models',
            isDirectory: true,
            children: [],
          },
          {
            name: 'Services',
            path: 'app/Services',
            isDirectory: true,
            children: [
              { name: 'Payment', path: 'app/Services/Payment', isDirectory: true, children: [] },
              { name: 'Notification', path: 'app/Services/Notification', isDirectory: true, children: [] },
            ],
          },
        ],
      },
      {
        name: 'routes',
        path: 'routes',
        isDirectory: true,
        children: [
          { name: 'web.php', path: 'routes/web.php', isDirectory: false, children: [] },
          { name: 'api.php', path: 'routes/api.php', isDirectory: false, children: [] },
        ],
      },
      {
        name: 'resources',
        path: 'resources',
        isDirectory: true,
        children: [
          {
            name: 'views',
            path: 'resources/views',
            isDirectory: true,
            children: [
              { name: 'admin', path: 'resources/views/admin', isDirectory: true, children: [] },
              { name: 'auth', path: 'resources/views/auth', isDirectory: true, children: [] },
            ],
          },
        ],
      },
      {
        name: 'database',
        path: 'database',
        isDirectory: true,
        children: [
          { name: 'migrations', path: 'database/migrations', isDirectory: true, children: [] },
        ],
      },
    ],
    detectedFrameworks: ['Laravel'],
    dependencies: [
      {
        name: 'laravel/framework',
        version: '10.0.0',
        source: 'composer',
        isDev: false,
      },
      {
        name: 'laravel/passport',
        version: '11.8.0',
        source: 'composer',
        isDev: false,
      },
      {
        name: 'stripe/stripe-php',
        version: '12.0.0',
        source: 'composer',
        isDev: false,
      },
      {
        name: 'guzzlehttp/guzzle',
        version: '7.5.0',
        source: 'composer',
        isDev: false,
      },
      {
        name: 'doctrine/dbal',
        version: '3.6.0',
        source: 'composer',
        isDev: false,
      },
      {
        name: 'laravel/sanctum',
        version: '3.2.0',
        source: 'composer',
        isDev: false,
      },
    ],
  };
  
  // Execute discovery
  const engine = new DomainDiscoveryEngine();
  const result = await engine.discover(laravelIndexMetadata);
  
  // Display results
  console.log('Discovery Results:');
  console.log('─'.repeat(80));
  console.log(`Schema Version: ${result.schemaVersion}`);
  console.log(`Discovered At: ${result.discoveredAt}`);
  console.log(`Discovery Time: ${result.executionMetadata.discoveryTimeMs}ms`);
  console.log(`Fallback Applied: ${result.executionMetadata.fallbackApplied}`);
  console.log();
  
  console.log('Statistics:');
  console.log(`  Total Domains: ${result.statistics.totalDomains}`);
  console.log(`  Deep Domains: ${result.statistics.deepDomains}`);
  console.log(`  Excluded Domains: ${result.statistics.excludedDomains}`);
  console.log();
  
  console.log('Discovered Domains:');
  console.log('─'.repeat(80));
  
  for (const domain of result.domains) {
    console.log(`\n📦 ${domain.name} (${domain.id})`);
    console.log(`   Confidence: ${(domain.confidence * 100).toFixed(1)}%`);
    console.log(`   Analysis Depth: ${domain.analysisDepth}`);
    console.log(`   Signals: ${domain.signals.length}`);
    
    // Show top signals
    if (domain.signals.length > 0) {
      console.log('   Top Signals:');
      const topSignals = domain.signals
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 3);
      
      for (const signal of topSignals) {
        console.log(`     - ${signal.type}: "${signal.value}" (weight: ${signal.weight})`);
      }
    }
    
    // Show evidence
    if (domain.evidence.length > 0) {
      console.log(`   Evidence: ${domain.evidence.length} file(s)`);
      const topEvidence = domain.evidence
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, 2);
      
      for (const evidence of topEvidence) {
        console.log(`     - ${evidence.filePath} (relevance: ${(evidence.relevanceScore * 100).toFixed(0)}%)`);
      }
    }
    
    // Show sub-domains if any
    if (domain.subDomains && domain.subDomains.length > 0) {
      console.log(`   Sub-domains: ${domain.subDomains.length}`);
      for (const subDomain of domain.subDomains) {
        console.log(`     - ${subDomain.name} (confidence: ${(subDomain.confidence * 100).toFixed(1)}%)`);
      }
    }
  }
  
  console.log('\n' + '─'.repeat(80));
  console.log('\n📊 Analysis:');
  console.log('This Laravel e-commerce application has been analyzed and the following');
  console.log('architectural domains have been identified:');
  console.log();
  console.log('1. Laravel Core - The framework foundation');
  console.log('2. Authentication - User login/registration (Laravel Passport)');
  console.log('3. Payment Processing - Stripe integration for payments');
  console.log('4. Admin Panel - Administrative interface');
  console.log('5. Product Catalog - Product management');
  console.log('6. API Layer - RESTful API endpoints');
  console.log();
  console.log('All domains are tagged as DEEP for comprehensive analysis.');
  console.log('No domains were automatically excluded.');
  console.log();
  console.log('✅ Discovery complete! Ready for domain-aware analysis.');
}

// Run example
if (require.main === module) {
  examplePhpMonolithDiscovery()
    .then(() => {
      console.log('\n✅ Example completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Example failed:', error);
      process.exit(1);
    });
}

export { examplePhpMonolithDiscovery };
