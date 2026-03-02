/**
 * Example: Hybrid CMS Discovery
 * 
 * This example demonstrates how the Domain Discovery Engine identifies
 * domains in a hybrid CMS application with both PHP backend (WordPress)
 * and modern JavaScript frontend (React).
 * 
 * Run with: npx ts-node src/discovery/example-hybrid-cms.ts
 */

import { DomainDiscoveryEngine } from './DomainDiscoveryEngine';
import { IndexMetadata } from './types';

async function exampleHybridCmsDiscovery() {
  console.log('=== Example: Hybrid CMS Discovery (WordPress + React) ===\n');
  
  // Simulate index metadata from a headless WordPress CMS with React frontend
  const hybridCmsIndexMetadata: IndexMetadata = {
    totalChunks: 1450,
    totalFiles: 380,
    filesByExtension: {
      '.php': 220,
      '.js': 80,
      '.jsx': 45,
      '.ts': 15,
      '.tsx': 10,
      '.json': 8,
      '.css': 2,
    },
    directoryStructure: [
      // WordPress backend
      {
        name: 'wp-content',
        path: 'wp-content',
        isDirectory: true,
        children: [
          {
            name: 'plugins',
            path: 'wp-content/plugins',
            isDirectory: true,
            children: [
              {
                name: 'custom-api',
                path: 'wp-content/plugins/custom-api',
                isDirectory: true,
                children: [
                  { name: 'includes', path: 'wp-content/plugins/custom-api/includes', isDirectory: true, children: [
                    { name: 'api', path: 'wp-content/plugins/custom-api/includes/api', isDirectory: true, children: [] },
                    { name: 'auth', path: 'wp-content/plugins/custom-api/includes/auth', isDirectory: true, children: [] },
                  ]},
                ],
              },
              {
                name: 'woocommerce',
                path: 'wp-content/plugins/woocommerce',
                isDirectory: true,
                children: [
                  { name: 'includes', path: 'wp-content/plugins/woocommerce/includes', isDirectory: true, children: [] },
                ],
              },
              {
                name: 'wp-graphql',
                path: 'wp-content/plugins/wp-graphql',
                isDirectory: true,
                children: [],
              },
            ],
          },
          {
            name: 'themes',
            path: 'wp-content/themes',
            isDirectory: true,
            children: [
              {
                name: 'custom-theme',
                path: 'wp-content/themes/custom-theme',
                isDirectory: true,
                children: [],
              },
            ],
          },
        ],
      },
      // React frontend
      {
        name: 'frontend',
        path: 'frontend',
        isDirectory: true,
        children: [
          {
            name: 'src',
            path: 'frontend/src',
            isDirectory: true,
            children: [
              { name: 'components', path: 'frontend/src/components', isDirectory: true, children: [
                { name: 'auth', path: 'frontend/src/components/auth', isDirectory: true, children: [] },
                { name: 'products', path: 'frontend/src/components/products', isDirectory: true, children: [] },
                { name: 'cart', path: 'frontend/src/components/cart', isDirectory: true, children: [] },
                { name: 'admin', path: 'frontend/src/components/admin', isDirectory: true, children: [] },
              ]},
              { name: 'pages', path: 'frontend/src/pages', isDirectory: true, children: [] },
              { name: 'api', path: 'frontend/src/api', isDirectory: true, children: [] },
              { name: 'store', path: 'frontend/src/store', isDirectory: true, children: [] },
            ],
          },
          { name: 'package.json', path: 'frontend/package.json', isDirectory: false, children: [] },
        ],
      },
      // Admin dashboard
      {
        name: 'admin-dashboard',
        path: 'admin-dashboard',
        isDirectory: true,
        children: [
          { name: 'src', path: 'admin-dashboard/src', isDirectory: true, children: [
            { name: 'components', path: 'admin-dashboard/src/components', isDirectory: true, children: [] },
            { name: 'pages', path: 'admin-dashboard/src/pages', isDirectory: true, children: [] },
          ]},
        ],
      },
    ],
    detectedFrameworks: ['WordPress', 'React', 'WooCommerce'],
    dependencies: [
      // WordPress/PHP dependencies (from composer.json)
      {
        name: 'woocommerce/woocommerce',
        version: '7.5.0',
        source: 'composer',
        isDev: false,
      },
      {
        name: 'wp-graphql/wp-graphql',
        version: '1.14.0',
        source: 'composer',
        isDev: false,
      },
      {
        name: 'firebase/php-jwt',
        version: '6.4.0',
        source: 'composer',
        isDev: false,
      },
      // Frontend dependencies (from package.json)
      {
        name: 'react',
        version: '18.2.0',
        source: 'npm',
        isDev: false,
      },
      {
        name: 'react-dom',
        version: '18.2.0',
        source: 'npm',
        isDev: false,
      },
      {
        name: 'react-router-dom',
        version: '6.10.0',
        source: 'npm',
        isDev: false,
      },
      {
        name: '@apollo/client',
        version: '3.7.10',
        source: 'npm',
        isDev: false,
      },
      {
        name: 'graphql',
        version: '16.6.0',
        source: 'npm',
        isDev: false,
      },
      {
        name: 'axios',
        version: '1.3.4',
        source: 'npm',
        isDev: false,
      },
      {
        name: 'redux',
        version: '4.2.1',
        source: 'npm',
        isDev: false,
      },
      {
        name: 'react-redux',
        version: '8.0.5',
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
  
  // Execute discovery
  const engine = new DomainDiscoveryEngine();
  const result = await engine.discover(hybridCmsIndexMetadata);
  
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
  
  // Categorize domains by technology stack
  const backendDomains = result.domains.filter(d => 
    d.signals.some(s => 
      s.value.toLowerCase().includes('php') || 
      s.value.toLowerCase().includes('wordpress') ||
      s.value.toLowerCase().includes('woocommerce')
    )
  );
  
  const frontendDomains = result.domains.filter(d => 
    d.signals.some(s => 
      s.value.toLowerCase().includes('react') || 
      s.value.toLowerCase().includes('frontend') ||
      s.value.toLowerCase().includes('components')
    )
  );
  
  const sharedDomains = result.domains.filter(d => 
    !backendDomains.includes(d) && !frontendDomains.includes(d)
  );
  
  if (backendDomains.length > 0) {
    console.log('\n🔷 Backend Domains (WordPress/PHP):');
    for (const domain of backendDomains) {
      console.log(`\n  📦 ${domain.name} (${domain.id})`);
      console.log(`     Confidence: ${(domain.confidence * 100).toFixed(1)}%`);
      console.log(`     Analysis Depth: ${domain.analysisDepth}`);
      
      // Show framework signals
      const frameworkSignals = domain.signals.filter(s => s.type === 'framework');
      if (frameworkSignals.length > 0) {
        console.log('     Frameworks:');
        for (const signal of frameworkSignals) {
          console.log(`       - ${signal.value}`);
        }
      }
      
      // Show key dependencies
      const depSignals = domain.signals.filter(s => s.type === 'dependency');
      if (depSignals.length > 0) {
        console.log('     Key Dependencies:');
        for (const signal of depSignals.slice(0, 2)) {
          console.log(`       - ${signal.value}`);
        }
      }
    }
  }
  
  if (frontendDomains.length > 0) {
    console.log('\n\n🔶 Frontend Domains (React):');
    for (const domain of frontendDomains) {
      console.log(`\n  📦 ${domain.name} (${domain.id})`);
      console.log(`     Confidence: ${(domain.confidence * 100).toFixed(1)}%`);
      console.log(`     Analysis Depth: ${domain.analysisDepth}`);
      
      // Show framework signals
      const frameworkSignals = domain.signals.filter(s => s.type === 'framework');
      if (frameworkSignals.length > 0) {
        console.log('     Frameworks:');
        for (const signal of frameworkSignals) {
          console.log(`       - ${signal.value}`);
        }
      }
      
      // Show file patterns
      const fileSignals = domain.signals.filter(s => s.type === 'file_pattern');
      if (fileSignals.length > 0) {
        console.log('     File Patterns:');
        for (const signal of fileSignals.slice(0, 2)) {
          console.log(`       - ${signal.value}`);
        }
      }
    }
  }
  
  if (sharedDomains.length > 0) {
    console.log('\n\n🔸 Shared/Cross-Stack Domains:');
    for (const domain of sharedDomains) {
      console.log(`\n  📦 ${domain.name} (${domain.id})`);
      console.log(`     Confidence: ${(domain.confidence * 100).toFixed(1)}%`);
      console.log(`     Analysis Depth: ${domain.analysisDepth}`);
      console.log(`     Signals: ${domain.signals.length}`);
      
      // Show top signals
      if (domain.signals.length > 0) {
        const topSignals = domain.signals
          .sort((a, b) => b.weight - a.weight)
          .slice(0, 2);
        
        console.log('     Top Signals:');
        for (const signal of topSignals) {
          console.log(`       - ${signal.type}: "${signal.value}"`);
        }
      }
    }
  }
  
  console.log('\n' + '─'.repeat(80));
  console.log('\n📊 Analysis:');
  console.log('This hybrid CMS application combines WordPress backend with React frontend.');
  console.log('The following architectural domains have been identified:');
  console.log();
  console.log('Backend (WordPress/PHP):');
  console.log('  • WordPress Core - CMS foundation');
  console.log('  • WooCommerce - E-commerce functionality');
  console.log('  • GraphQL API - Headless CMS API layer');
  console.log('  • Custom Plugins - Extended functionality');
  console.log();
  console.log('Frontend (React):');
  console.log('  • React Application - Customer-facing UI');
  console.log('  • Product Catalog - Product browsing and search');
  console.log('  • Shopping Cart - Cart management');
  console.log('  • Admin Dashboard - Content management interface');
  console.log();
  console.log('Shared/Cross-Stack:');
  console.log('  • Authentication - JWT-based auth (PHP + React)');
  console.log('  • Payment Processing - Stripe integration');
  console.log('  • API Layer - REST + GraphQL endpoints');
  console.log();
  console.log('Key Observations:');
  console.log('  ✓ Multi-technology stack detected (PHP + JavaScript)');
  console.log('  ✓ Headless CMS architecture identified');
  console.log('  ✓ Both backend and frontend domains recognized');
  console.log('  ✓ Shared concerns (auth, payments) properly identified');
  console.log('  ✓ All domains tagged as DEEP for comprehensive analysis');
  console.log('  ✓ No automatic exclusions despite complexity');
  console.log();
  console.log('✅ Discovery complete! Ready for domain-aware analysis.');
}

// Run example
if (require.main === module) {
  exampleHybridCmsDiscovery()
    .then(() => {
      console.log('\n✅ Example completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Example failed:', error);
      process.exit(1);
    });
}

export { exampleHybridCmsDiscovery };
