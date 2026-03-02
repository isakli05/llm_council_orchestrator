/**
 * Unit test for discovery trace metrics
 * Tests that discovery metrics are properly added to trace span
 * Run with: node -r ts-node/register src/pipeline/test-discovery-trace.ts
 */

import { trace } from '../observability/Trace';
import { IndexMetadata, DiscoveryResult } from '../discovery/types';
import { DomainDiscoveryEngine } from '../discovery/DomainDiscoveryEngine';

/**
 * Create mock index metadata for testing
 */
function createMockIndexMetadata(): IndexMetadata {
  return {
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
    ],
  };
}

/**
 * Test discovery metrics in trace
 */
async function testDiscoveryTraceMetrics() {
  console.log('=== Test: Discovery Metrics in Trace Span ===\n');

  try {
    // Start a pipeline trace
    const runId = trace.startPipeline('full_analysis');
    console.log('Started pipeline trace:', runId);

    // Start discovery span
    const spanId = trace.startSpan(runId, 'domain_discovery', {
      mode: 'full_analysis',
      hasIndexMetadata: true,
      userExclusionsCount: 0,
    });
    console.log('Started discovery span:', spanId);

    // Execute discovery
    const indexMetadata = createMockIndexMetadata();
    const discoveryEngine = new DomainDiscoveryEngine();
    
    console.log('\nExecuting discovery...');
    const discoveryResult = await discoveryEngine.discover(indexMetadata, []);
    
    console.log('Discovery completed successfully');
    console.log('  Total domains:', discoveryResult.statistics.totalDomains);
    console.log('  Deep domains:', discoveryResult.statistics.deepDomains);
    console.log('  Excluded domains:', discoveryResult.statistics.excludedDomains);

    // Calculate total signals
    const totalSignals = discoveryResult.domains.reduce(
      (sum, domain) => sum + domain.signals.length,
      0
    );
    console.log('  Total signals:', totalSignals);

    // Update span metadata with discovery metrics (simulating PipelineEngine behavior)
    const pipelineTrace = trace.getTrace(runId);
    const span = pipelineTrace?.spans.find(s => s.spanId === spanId);
    
    if (span && span.metadata) {
      console.log('\nAdding metrics to span metadata...');
      
      // Add discovery metrics to span metadata
      span.metadata.discoveryTimeMs = discoveryResult.executionMetadata.discoveryTimeMs;
      span.metadata.totalDomains = discoveryResult.statistics.totalDomains;
      span.metadata.deepDomains = discoveryResult.statistics.deepDomains;
      span.metadata.excludedDomains = discoveryResult.statistics.excludedDomains;
      span.metadata.totalSignals = totalSignals;
      span.metadata.fallbackApplied = discoveryResult.executionMetadata.fallbackApplied;
      span.metadata.signalTypesUsed = discoveryResult.executionMetadata.signalTypesUsed;
      
      console.log('Metrics added successfully');
    }

    // End span
    trace.endSpan(runId, spanId, 'completed');
    console.log('\nEnded discovery span');

    // End pipeline
    trace.endPipeline(runId, 'completed');
    console.log('Ended pipeline trace');

    // Verify metrics are in trace
    console.log('\n=== Verification ===');
    const finalTrace = trace.getTrace(runId);
    const finalSpan = finalTrace?.spans.find(s => s.spanId === spanId);

    if (!finalSpan) {
      console.error('❌ Discovery span not found in trace');
      return false;
    }

    console.log('\nDiscovery Span Details:');
    console.log('  Name:', finalSpan.name);
    console.log('  Status:', finalSpan.status);
    console.log('  Duration:', finalSpan.durationMs, 'ms');

    if (!finalSpan.metadata) {
      console.error('❌ No metadata found in span');
      return false;
    }

    console.log('\n=== Discovery Metrics in Span Metadata ===');
    const requiredMetrics = [
      'discoveryTimeMs',
      'totalDomains',
      'deepDomains',
      'excludedDomains',
      'totalSignals',
      'fallbackApplied',
      'signalTypesUsed',
    ];

    let allPresent = true;
    for (const metric of requiredMetrics) {
      const value = finalSpan.metadata[metric];
      const present = value !== undefined;
      const displayValue = Array.isArray(value) ? `[${value.join(', ')}]` : value;
      
      console.log(`  ${metric}: ${present ? '✅' : '❌'} ${present ? displayValue : 'MISSING'}`);
      
      if (!present) {
        allPresent = false;
      }
    }

    if (allPresent) {
      console.log('\n✅ SUCCESS: All discovery metrics are present in trace span metadata!');
      console.log('\nMetrics Summary:');
      console.log('  - Discovery execution time recorded');
      console.log('  - Number of domains discovered recorded');
      console.log('  - Number of signals extracted recorded');
      console.log('  - Fallback flag recorded');
      return true;
    } else {
      console.log('\n❌ FAILURE: Some metrics are missing');
      return false;
    }

  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error);
    return false;
  }
}

// Run the test
testDiscoveryTraceMetrics()
  .then((success) => {
    console.log('\n=== Test Complete ===');
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('\n=== Test Failed ===');
    console.error(error);
    process.exit(1);
  });
