/**
 * Manual test script for verifying discovery metrics are added to trace
 * Run with: npx ts-node src/pipeline/test-trace-metrics.ts
 */

import { PipelineEngine } from './PipelineEngine';
import { PIPELINE_MODES } from '@llm/shared-config';
import { trace } from '../observability/Trace';
import { IndexMetadata, DiscoveryResult } from '../discovery/types';

/**
 * Mock index metadata for testing
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
 * Test that discovery metrics are added to trace
 */
async function testDiscoveryMetrics() {
  console.log('=== Test: Discovery Metrics in Trace ===\n');

  try {
    // Create pipeline engine
    const engine = new PipelineEngine();

    // Execute pipeline with FULL mode (includes DISCOVER step)
    console.log('Executing pipeline with FULL mode...');
    
    // Note: This will fail because we don't have a real index,
    // but we can check if the trace structure is correct
    const result = await engine.execute(
      PIPELINE_MODES.FULL,
      'Analyze this codebase',
      {},
      undefined,
      undefined as any
    );

    console.log('\nPipeline execution completed');
    console.log('Success:', result.success);

    // Get the trace
    const traces = trace.getAllTraces();
    if (traces.length === 0) {
      console.error('❌ No traces found');
      return;
    }

    const pipelineTrace = traces[traces.length - 1];
    console.log('\n=== Trace Information ===');
    console.log('Run ID:', pipelineTrace.runId);
    console.log('Mode:', pipelineTrace.mode);
    console.log('Status:', pipelineTrace.status);
    console.log('Total Duration:', pipelineTrace.totalDurationMs, 'ms');
    console.log('Total Spans:', pipelineTrace.spans.length);

    // Find the discovery span
    const discoverySpan = pipelineTrace.spans.find(
      (span) => span.name === 'domain_discovery'
    );

    if (!discoverySpan) {
      console.log('\n⚠️  No discovery span found (expected if INDEX step failed)');
      console.log('Available spans:', pipelineTrace.spans.map(s => s.name));
      return;
    }

    console.log('\n=== Discovery Span ===');
    console.log('Span ID:', discoverySpan.spanId);
    console.log('Status:', discoverySpan.status);
    console.log('Duration:', discoverySpan.durationMs, 'ms');
    console.log('Start Time:', discoverySpan.startTime);
    console.log('End Time:', discoverySpan.endTime);

    // Check if metrics are present in metadata
    console.log('\n=== Discovery Metrics in Span Metadata ===');
    if (discoverySpan.metadata) {
      const metrics = [
        'discoveryTimeMs',
        'totalDomains',
        'deepDomains',
        'excludedDomains',
        'totalSignals',
        'fallbackApplied',
        'signalTypesUsed',
      ];

      let allMetricsPresent = true;
      for (const metric of metrics) {
        const value = discoverySpan.metadata[metric];
        const present = value !== undefined;
        console.log(`  ${metric}: ${present ? '✅' : '❌'} ${present ? JSON.stringify(value) : 'MISSING'}`);
        if (!present) {
          allMetricsPresent = false;
        }
      }

      if (allMetricsPresent) {
        console.log('\n✅ All discovery metrics are present in trace span metadata!');
      } else {
        console.log('\n❌ Some discovery metrics are missing from trace span metadata');
      }
    } else {
      console.log('❌ No metadata found in discovery span');
    }

  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    
    // Still try to check the trace
    const traces = trace.getAllTraces();
    if (traces.length > 0) {
      const pipelineTrace = traces[traces.length - 1];
      console.log('\n=== Trace Information (After Error) ===');
      console.log('Run ID:', pipelineTrace.runId);
      console.log('Status:', pipelineTrace.status);
      console.log('Spans:', pipelineTrace.spans.map(s => ({
        name: s.name,
        status: s.status,
        hasMetadata: !!s.metadata,
      })));
    }
  }
}

// Run the test
testDiscoveryMetrics()
  .then(() => {
    console.log('\n=== Test Complete ===');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n=== Test Failed ===');
    console.error(error);
    process.exit(1);
  });
