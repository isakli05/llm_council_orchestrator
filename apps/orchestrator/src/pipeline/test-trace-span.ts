/**
 * Manual test for PipelineEngine trace span functionality
 * 
 * This script tests that the discovery step creates and manages
 * trace spans correctly.
 */

import { PipelineEngine } from './PipelineEngine';
import { PIPELINE_MODES } from '@llm/shared-config';
import { trace } from '../observability/Trace';
import { IndexMetadata } from '../discovery/types';

// Create mock index metadata
const mockIndexMetadata: IndexMetadata = {
  totalChunks: 100,
  totalFiles: 30,
  filesByExtension: {
    '.ts': 25,
    '.js': 5,
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
      ],
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
  ],
};

async function testTraceSpan() {
  console.log('=== Test: Discovery Trace Span ===\n');
  
  const engine = new PipelineEngine();
  
  // Create a context with index metadata to test the discover step directly
  const context: any = {
    mode: PIPELINE_MODES.FULL,
    prompt: 'Analyze this codebase',
    config: {},
    startedAt: new Date().toISOString(),
    runId: trace.startPipeline(PIPELINE_MODES.FULL),
    indexMetadata: mockIndexMetadata,
    indexReady: true,
  };
  
  // Execute the discover step directly using reflection
  const executeDiscoveryStep = (engine as any).executeDiscoveryStep.bind(engine);
  const result = await executeDiscoveryStep(context);
  
  console.log('Discover Step Result:');
  console.log(`- Success: ${result.success}`);
  console.log(`- Step Name: ${result.stepName}`);
  console.log(`- Executed At: ${result.executedAt}`);
  
  if (result.success && result.data) {
    const discoveryResult = result.data as any;
    console.log(`- Discovery Time: ${discoveryResult.executionMetadata?.discoveryTimeMs}ms`);
    console.log(`- Total Domains: ${discoveryResult.statistics?.totalDomains}`);
    console.log(`- Deep Domains: ${discoveryResult.statistics?.deepDomains}`);
    console.log(`- Excluded Domains: ${discoveryResult.statistics?.excludedDomains}`);
  }
  
  // End the pipeline trace
  trace.endPipeline(context.runId, 'completed');
  
  // Get all traces to verify span was created
  const allTraces = trace.getAllTraces();
  console.log(`\nTotal Traces: ${allTraces.length}`);
  
  if (allTraces.length > 0) {
    const latestTrace = allTraces[allTraces.length - 1];
    console.log(`\nLatest Trace:`);
    console.log(`- Run ID: ${latestTrace.runId}`);
    console.log(`- Mode: ${latestTrace.mode}`);
    console.log(`- Status: ${latestTrace.status}`);
    console.log(`- Total Duration: ${latestTrace.totalDurationMs}ms`);
    console.log(`- Spans: ${latestTrace.spans.length}`);
    
    // Find the domain_discovery span
    const discoverySpan = latestTrace.spans.find(s => s.name === 'domain_discovery');
    
    if (discoverySpan) {
      console.log(`\nDomain Discovery Span:`);
      console.log(`- Span ID: ${discoverySpan.spanId}`);
      console.log(`- Name: ${discoverySpan.name}`);
      console.log(`- Status: ${discoverySpan.status}`);
      console.log(`- Duration: ${discoverySpan.durationMs}ms`);
      console.log(`- Metadata:`, discoverySpan.metadata);
      
      console.log('\n✅ Trace span created successfully!');
    } else {
      console.log('\n❌ Domain discovery span not found!');
      process.exit(1);
    }
  } else {
    console.log('\n❌ No traces found!');
    process.exit(1);
  }
}

// Run test
async function runTest() {
  try {
    await testTraceSpan();
    console.log('\n✅ Test completed successfully!');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

runTest();
