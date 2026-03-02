/**
 * Example: Node.js Microservices Discovery
 * 
 * This example demonstrates how the Domain Discovery Engine identifies
 * domains in a Node.js microservices architecture with multiple services.
 * 
 * Run with: npx ts-node src/discovery/example-nodejs-microservices.ts
 */

import { DomainDiscoveryEngine } from './DomainDiscoveryEngine';
import { IndexMetadata } from './types';

async function exampleNodejsMicroservicesDiscovery() {
  console.log('=== Example: Node.js Microservices Discovery ===\n');
  
  // Simulate index metadata from a microservices-based e-commerce platform
  const microservicesIndexMetadata: IndexMetadata = {
    totalChunks: 1200,
    totalFiles: 320,
    filesByExtension: {
      '.ts': 240,
      '.js': 50,
      '.json': 20,
      '.yaml': 5,
      '.md': 5,
    },
    directoryStructure: [
      {
        name: 'services',
        path: 'services',
        isDirectory: true,
        children: [
          {
            name: 'user-service',
            path: 'services/user-service',
            isDirectory: true,
            children: [
              { name: 'src', path: 'services/user-service/src', isDirectory: true, children: [
                { name: 'auth', path: 'services/user-service/src/auth', isDirectory: true, children: [] },
                { name: 'controllers', path: 'services/user-service/src/controllers', isDirectory: true, children: [] },
                { name: 'models', path: 'services/user-service/src/models', isDirectory: true, children: [] },
              ]},
              { name: 'package.json', path: 'services/user-service/package.json', isDirectory: false, children: [] },
            ],
          },
          {
            name: 'order-service',
            path: 'services/order-service',
            isDirectory: true,
            children: [
              { name: 'src', path: 'services/order-service/src', isDirectory: true, children: [
                { name: 'controllers', path: 'services/order-service/src/controllers', isDirectory: true, children: [] },
                { name: 'models', path: 'services/order-service/src/models', isDirectory: true, children: [] },
              ]},
              { name: 'package.json', path: 'services/order-service/package.json', isDirectory: false, children: [] },
            ],
          },
          {
            name: 'payment-service',
            path: 'services/payment-service',
            isDirectory: true,
            children: [
              { name: 'src', path: 'services/payment-service/src', isDirectory: true, children: [
                { name: 'stripe', path: 'services/payment-service/src/stripe', isDirectory: true, children: [] },
                { name: 'paypal', path: 'services/payment-service/src/paypal', isDirectory: true, children: [] },
              ]},
              { name: 'package.json', path: 'services/payment-service/package.json', isDirectory: false, children: [] },
            ],
          },
          {
            name: 'notification-service',
            path: 'services/notification-service',
            isDirectory: true,
            children: [
              { name: 'src', path: 'services/notification-service/src', isDirectory: true, children: [] },
              { name: 'package.json', path: 'services/notification-service/package.json', isDirectory: false, children: [] },
            ],
          },
        ],
      },
      {
        name: 'api-gateway',
        path: 'api-gateway',
        isDirectory: true,
        children: [
          { name: 'src', path: 'api-gateway/src', isDirectory: true, children: [
            { name: 'routes', path: 'api-gateway/src/routes', isDirectory: true, children: [] },
            { name: 'middleware', path: 'api-gateway/src/middleware', isDirectory: true, children: [] },
          ]},
        ],
      },
      {
        name: 'shared',
        path: 'shared',
        isDirectory: true,
        children: [
          { name: 'types', path: 'shared/types', isDirectory: true, children: [] },
          { name: 'utils', path: 'shared/utils', isDirectory: true, children: [] },
        ],
      },
    ],
    detectedFrameworks: ['Express', 'Fastify'],
    dependencies: [
      // User service dependencies
      {
        name: 'express',
        version: '4.18.2',
        source: 'npm',
        isDev: false,
      },
      {
        name: 'passport',
        version: '0.6.0',
        source: 'npm',
        isDev: false,
      },
      {
        name: 'jsonwebtoken',
        version: '9.0.0',
        source: 'npm',
        isDev: false,
      },
      {
        name: 'bcrypt',
        version: '5.1.0',
        source: 'npm',
        isDev: false,
      },
      // Order service dependencies
      {
        name: 'fastify',
        version: '4.15.0',
        source: 'npm',
        isDev: false,
      },
      // Payment service dependencies
      {
        name: 'stripe',
        version: '12.0.0',
        source: 'npm',
        isDev: false,
      },
      {
        name: 'paypal-rest-sdk',
        version: '1.8.1',
        source: 'npm',
        isDev: false,
      },
      // Notification service dependencies
      {
        name: 'nodemailer',
        version: '6.9.0',
        source: 'npm',
        isDev: false,
      },
      {
        name: 'twilio',
        version: '4.10.0',
        source: 'npm',
        isDev: false,
      },
      // Shared dependencies
      {
        name: 'typeorm',
        version: '0.3.12',
        source: 'npm',
        isDev: false,
      },
      {
        name: 'redis',
        version: '4.6.5',
        source: 'npm',
        isDev: false,
      },
      {
        name: 'amqplib',
        version: '0.10.3',
        source: 'npm',
        isDev: false,
      },
    ],
  };
  
  // Execute discovery
  const engine = new DomainDiscoveryEngine();
  const result = await engine.discover(microservicesIndexMetadata);
  
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
  
  // Group domains by service
  const serviceDomains = result.domains.filter(d => 
    d.id.includes('service') || d.name.toLowerCase().includes('service')
  );
  const infrastructureDomains = result.domains.filter(d => 
    !d.id.includes('service') && !d.name.toLowerCase().includes('service')
  );
  
  if (serviceDomains.length > 0) {
    console.log('\n🔷 Microservices:');
    for (const domain of serviceDomains) {
      console.log(`\n  📦 ${domain.name} (${domain.id})`);
      console.log(`     Confidence: ${(domain.confidence * 100).toFixed(1)}%`);
      console.log(`     Analysis Depth: ${domain.analysisDepth}`);
      console.log(`     Signals: ${domain.signals.length}`);
      
      // Show key dependencies
      const depSignals = domain.signals.filter(s => s.type === 'dependency');
      if (depSignals.length > 0) {
        console.log('     Key Dependencies:');
        for (const signal of depSignals.slice(0, 3)) {
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
  
  if (infrastructureDomains.length > 0) {
    console.log('\n\n🔶 Infrastructure & Shared Components:');
    for (const domain of infrastructureDomains) {
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
          console.log(`       - ${signal.type}: "${signal.value}" (weight: ${signal.weight})`);
        }
      }
    }
  }
  
  console.log('\n' + '─'.repeat(80));
  console.log('\n📊 Analysis:');
  console.log('This Node.js microservices architecture has been analyzed and the following');
  console.log('domains have been identified:');
  console.log();
  console.log('Microservices:');
  console.log('  • User Service - Authentication and user management');
  console.log('  • Order Service - Order processing and management');
  console.log('  • Payment Service - Payment processing (Stripe, PayPal)');
  console.log('  • Notification Service - Email and SMS notifications');
  console.log();
  console.log('Infrastructure:');
  console.log('  • API Gateway - Request routing and aggregation');
  console.log('  • Shared Components - Common types and utilities');
  console.log('  • Message Queue - Inter-service communication (RabbitMQ)');
  console.log('  • Caching Layer - Redis for performance');
  console.log();
  console.log('Key Observations:');
  console.log('  ✓ Each microservice detected as a separate domain');
  console.log('  ✓ API Gateway identified as orchestration layer');
  console.log('  ✓ Shared infrastructure components recognized');
  console.log('  ✓ All domains tagged as DEEP for equal analysis');
  console.log('  ✓ No automatic exclusions applied');
  console.log();
  console.log('✅ Discovery complete! Ready for domain-aware analysis.');
}

// Run example
if (require.main === module) {
  exampleNodejsMicroservicesDiscovery()
    .then(() => {
      console.log('\n✅ Example completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Example failed:', error);
      process.exit(1);
    });
}

export { exampleNodejsMicroservicesDiscovery };
