/**
 * Manual test for DomainSpecWriter
 * 
 * This script tests the spec file generation functionality
 * by creating mock domains and writing spec files.
 */

import * as fs from 'fs';
import * as path from 'path';
import { DomainSpecWriter } from './DomainSpecWriter';
import { Domain } from './types';

// Create mock domains for testing
const mockDeepDomain: Domain = {
  id: 'auth_domain',
  name: 'Authentication',
  confidence: 0.87,
  analysisDepth: 'DEEP',
  signals: [
    {
      type: 'file_pattern',
      value: '/auth',
      weight: 0.9,
      source: 'directory_structure',
    },
    {
      type: 'dependency',
      value: 'passport',
      weight: 0.9,
      source: 'package.json',
    },
    {
      type: 'dependency',
      value: 'jsonwebtoken',
      weight: 0.85,
      source: 'package.json',
    },
  ],
  evidence: [
    {
      filePath: 'src/auth/AuthController.ts',
      relevanceScore: 0.95,
      lineRange: { start: 1, end: 50 },
      snippet: 'export class AuthController { login() { ... } }',
    },
    {
      filePath: 'src/auth/middleware/authenticate.ts',
      relevanceScore: 0.88,
    },
    {
      filePath: 'src/auth/models/User.ts',
      relevanceScore: 0.82,
      lineRange: { start: 10, end: 30 },
    },
  ],
};

const mockDomainWithSubDomains: Domain = {
  id: 'api_domain',
  name: 'API Layer',
  confidence: 0.92,
  analysisDepth: 'DEEP',
  signals: [
    {
      type: 'file_pattern',
      value: '/api',
      weight: 0.7,
      source: 'directory_structure',
    },
    {
      type: 'framework',
      value: 'express',
      weight: 0.8,
      source: 'framework_detection',
    },
  ],
  evidence: [
    {
      filePath: 'src/api/routes.ts',
      relevanceScore: 0.9,
    },
  ],
  subDomains: [
    {
      id: 'api_auth_domain',
      name: 'API Authentication',
      confidence: 0.85,
      analysisDepth: 'DEEP',
      signals: [],
      evidence: [],
    },
    {
      id: 'api_rest_domain',
      name: 'REST API',
      confidence: 0.88,
      analysisDepth: 'DEEP',
      signals: [],
      evidence: [],
    },
  ],
};

const mockExcludedDomain: Domain = {
  id: 'payment_domain',
  name: 'Payment Processing',
  confidence: 0.78,
  analysisDepth: 'EXCLUDED',
  signals: [
    {
      type: 'dependency',
      value: 'stripe',
      weight: 0.95,
      source: 'package.json',
    },
  ],
  evidence: [
    {
      filePath: 'src/payment/StripeService.ts',
      relevanceScore: 0.92,
    },
  ],
  exclusionMetadata: {
    excludedAt: new Date().toISOString(),
    justification: 'Legacy payment system being replaced',
  },
};

const mockDomainWithSpecialChars: Domain = {
  id: 'special_chars_domain',
  name: 'Domain with "Quotes" and \\Backslashes\\',
  confidence: 0.65,
  analysisDepth: 'DEEP',
  signals: [
    {
      type: 'file_pattern',
      value: '/path/with/special\\chars',
      weight: 0.6,
      source: 'directory_structure',
    },
  ],
  evidence: [
    {
      filePath: 'src/special/file.ts',
      relevanceScore: 0.7,
      snippet: 'const str = "test with \\"quotes\\" and \\n newlines";',
    },
  ],
};

async function testWriteSingleDeepDomain() {
  console.log('=== Test 1: Write Single DEEP Domain ===\n');
  
  const outputDir = path.join(process.cwd(), 'test-output', 'specs');
  const writer = new DomainSpecWriter({ outputDir });
  
  const result = await writer.writeDomainSpec(mockDeepDomain);
  
  console.log('Write Result:');
  console.log(`- Success: ${result.success}`);
  console.log(`- File Path: ${result.filePath}`);
  
  if (result.success && result.filePath) {
    console.log('\nGenerated Spec Content:');
    console.log('---');
    const content = fs.readFileSync(result.filePath, 'utf-8');
    console.log(content);
    console.log('---');
  }
  
  console.log('\n');
}

async function testWriteDomainWithSubDomains() {
  console.log('=== Test 2: Write Domain with Sub-Domains ===\n');
  
  const outputDir = path.join(process.cwd(), 'test-output', 'specs');
  const writer = new DomainSpecWriter({ outputDir });
  
  const result = await writer.writeDomainSpec(mockDomainWithSubDomains);
  
  console.log('Write Result:');
  console.log(`- Success: ${result.success}`);
  console.log(`- File Path: ${result.filePath}`);
  
  if (result.success && result.filePath) {
    console.log('\nGenerated Spec Content (excerpt):');
    console.log('---');
    const content = fs.readFileSync(result.filePath, 'utf-8');
    // Show just the sub_domains section
    const lines = content.split('\n');
    const subDomainsIndex = lines.findIndex(l => l.startsWith('sub_domains:'));
    if (subDomainsIndex >= 0) {
      console.log(lines.slice(subDomainsIndex).join('\n'));
    }
    console.log('---');
  }
  
  console.log('\n');
}

async function testWriteExcludedDomain() {
  console.log('=== Test 3: Attempt to Write EXCLUDED Domain as Spec (Should Fail) ===\n');
  
  const outputDir = path.join(process.cwd(), 'test-output', 'specs');
  const writer = new DomainSpecWriter({ outputDir });
  
  const result = await writer.writeDomainSpec(mockExcludedDomain);
  
  console.log('Write Result:');
  console.log(`- Success: ${result.success}`);
  
  if (!result.success && result.error) {
    console.log(`- Error Code: ${result.error.code}`);
    console.log(`- Error Message: ${result.error.message}`);
  }
  
  console.log('\n');
}

async function testWriteExclusionRecord() {
  console.log('=== Test 3b: Write Exclusion Record for EXCLUDED Domain ===\n');
  
  const outputDir = path.join(process.cwd(), 'test-output', 'specs');
  const writer = new DomainSpecWriter({ outputDir });
  
  const result = await writer.writeExclusionRecord(mockExcludedDomain);
  
  console.log('Write Result:');
  console.log(`- Success: ${result.success}`);
  console.log(`- File Path: ${result.filePath}`);
  
  if (result.success && result.filePath) {
    console.log('\nGenerated Exclusion Record Content:');
    console.log('---');
    const content = fs.readFileSync(result.filePath, 'utf-8');
    console.log(content);
    console.log('---');
  }
  
  console.log('\n');
}

async function testWriteExclusionRecordForDeepDomain() {
  console.log('=== Test 3c: Attempt to Write Exclusion Record for DEEP Domain (Should Fail) ===\n');
  
  const outputDir = path.join(process.cwd(), 'test-output', 'specs');
  const writer = new DomainSpecWriter({ outputDir });
  
  const result = await writer.writeExclusionRecord(mockDeepDomain);
  
  console.log('Write Result:');
  console.log(`- Success: ${result.success}`);
  
  if (!result.success && result.error) {
    console.log(`- Error Code: ${result.error.code}`);
    console.log(`- Error Message: ${result.error.message}`);
  }
  
  console.log('\n');
}

async function testWriteMultipleDomains() {
  console.log('=== Test 4: Write Multiple Domains (Specs) ===\n');
  
  const outputDir = path.join(process.cwd(), 'test-output', 'specs');
  const writer = new DomainSpecWriter({ outputDir });
  
  const domains = [
    mockDeepDomain,
    mockDomainWithSubDomains,
    mockExcludedDomain, // Should be skipped
    mockDomainWithSpecialChars,
  ];
  
  const results = await writer.writeDomainSpecs(domains);
  
  console.log('Write Results:');
  console.log(`- Total Processed: ${results.length}`);
  console.log(`- Successful: ${results.filter(r => r.success).length}`);
  console.log(`- Failed: ${results.filter(r => !r.success).length}`);
  
  console.log('\nIndividual Results:');
  for (const result of results) {
    if (result.success) {
      console.log(`  ✅ ${path.basename(result.filePath!)}`);
    } else {
      console.log(`  ❌ ${result.error?.code}: ${result.error?.message}`);
    }
  }
  
  console.log('\n');
}

async function testWriteMultipleExclusionRecords() {
  console.log('=== Test 4b: Write Multiple Exclusion Records ===\n');
  
  const outputDir = path.join(process.cwd(), 'test-output', 'specs');
  const writer = new DomainSpecWriter({ outputDir });
  
  // Create another excluded domain for testing
  const anotherExcludedDomain: Domain = {
    id: 'legacy_admin_domain',
    name: 'Legacy Admin Panel',
    confidence: 0.65,
    analysisDepth: 'EXCLUDED',
    signals: [
      {
        type: 'file_pattern',
        value: '/admin',
        weight: 0.8,
        source: 'directory_structure',
      },
    ],
    evidence: [
      {
        filePath: 'src/admin/AdminController.ts',
        relevanceScore: 0.75,
      },
    ],
    exclusionMetadata: {
      excludedAt: new Date().toISOString(),
      justification: 'Admin panel being rewritten in new framework',
    },
  };
  
  const domains = [
    mockDeepDomain, // Should be skipped
    mockExcludedDomain,
    anotherExcludedDomain,
  ];
  
  const results = await writer.writeExclusionRecords(domains);
  
  console.log('Write Results:');
  console.log(`- Total Processed: ${results.length}`);
  console.log(`- Successful: ${results.filter(r => r.success).length}`);
  console.log(`- Failed: ${results.filter(r => !r.success).length}`);
  
  console.log('\nIndividual Results:');
  for (const result of results) {
    if (result.success) {
      console.log(`  ✅ ${path.basename(result.filePath!)}`);
    } else {
      console.log(`  ❌ ${result.error?.code}: ${result.error?.message}`);
    }
  }
  
  console.log('\n');
}

async function testSpecialCharacterEscaping() {
  console.log('=== Test 5: Special Character Escaping ===\n');
  
  const outputDir = path.join(process.cwd(), 'test-output', 'specs');
  const writer = new DomainSpecWriter({ outputDir });
  
  const result = await writer.writeDomainSpec(mockDomainWithSpecialChars);
  
  console.log('Write Result:');
  console.log(`- Success: ${result.success}`);
  
  if (result.success && result.filePath) {
    console.log('\nGenerated Spec Content:');
    console.log('---');
    const content = fs.readFileSync(result.filePath, 'utf-8');
    console.log(content);
    console.log('---');
  }
  
  console.log('\n');
}

async function testWriteMasterIndex() {
  console.log('=== Test 6: Write Master Index File ===\n');
  
  const outputDir = path.join(process.cwd(), 'test-output', 'specs');
  const writer = new DomainSpecWriter({ outputDir });
  
  // Create another excluded domain for testing
  const anotherExcludedDomain: Domain = {
    id: 'legacy_admin_domain',
    name: 'Legacy Admin Panel',
    confidence: 0.65,
    analysisDepth: 'EXCLUDED',
    signals: [
      {
        type: 'file_pattern',
        value: '/admin',
        weight: 0.8,
        source: 'directory_structure',
      },
    ],
    evidence: [
      {
        filePath: 'src/admin/AdminController.ts',
        relevanceScore: 0.75,
      },
    ],
    exclusionMetadata: {
      excludedAt: new Date().toISOString(),
      justification: 'Admin panel being rewritten in new framework',
    },
  };
  
  const allDomains = [
    mockDeepDomain,
    mockDomainWithSubDomains,
    mockDomainWithSpecialChars,
    mockExcludedDomain,
    anotherExcludedDomain,
  ];
  
  // Write specs and exclusion records first
  const specResults = await writer.writeDomainSpecs(allDomains);
  const exclusionResults = await writer.writeExclusionRecords(allDomains);
  
  // Write master index
  const indexResult = await writer.writeMasterIndex(
    allDomains,
    specResults,
    exclusionResults
  );
  
  console.log('Master Index Write Result:');
  console.log(`- Success: ${indexResult.success}`);
  console.log(`- File Path: ${indexResult.filePath}`);
  
  if (indexResult.success && indexResult.filePath) {
    console.log('\nGenerated Master Index Content:');
    console.log('---');
    const content = fs.readFileSync(indexResult.filePath, 'utf-8');
    console.log(content);
    console.log('---');
  }
  
  console.log('\n');
}

async function testMasterIndexWithFailures() {
  console.log('=== Test 7: Master Index with Spec Generation Failures ===\n');
  
  const outputDir = path.join(process.cwd(), 'test-output', 'specs-with-failures');
  const writer = new DomainSpecWriter({ outputDir });
  
  const allDomains = [
    mockDeepDomain,
    mockDomainWithSubDomains,
    mockExcludedDomain,
  ];
  
  // Write specs and exclusion records
  const specResults = await writer.writeDomainSpecs(allDomains);
  const exclusionResults = await writer.writeExclusionRecords(allDomains);
  
  // Simulate a failure by manually creating a failed result
  // In real scenarios, this would happen due to file system errors, permission issues, etc.
  const simulatedFailedResult = {
    success: false,
    error: {
      code: 'DISK_FULL',
      message: 'No space left on device',
    },
  };
  
  // Replace one successful result with a failure
  if (specResults.length > 0) {
    specResults[0] = simulatedFailedResult;
  }
  
  // Write master index with the simulated failure
  const indexResult = await writer.writeMasterIndex(
    allDomains,
    specResults,
    exclusionResults
  );
  
  console.log('Master Index Write Result:');
  console.log(`- Success: ${indexResult.success}`);
  console.log(`- File Path: ${indexResult.filePath}`);
  
  if (indexResult.success && indexResult.filePath) {
    console.log('\nGenerated Master Index Content (with failure notice):');
    console.log('---');
    const content = fs.readFileSync(indexResult.filePath, 'utf-8');
    console.log(content);
    console.log('---');
    
    // Verify failure notice is present
    if (content.includes('generation_failed: true') && content.includes('DISK_FULL')) {
      console.log('\n✅ Failure notice correctly included in master index');
    } else {
      console.log('\n❌ Failure notice NOT found in master index');
    }
  }
  
  console.log('\n');
}

async function cleanup() {
  console.log('=== Cleanup ===\n');
  
  const testOutputDir = path.join(process.cwd(), 'test-output');
  
  if (fs.existsSync(testOutputDir)) {
    console.log('Removing test output directory...');
    fs.rmSync(testOutputDir, { recursive: true, force: true });
    console.log('✅ Cleanup complete');
  } else {
    console.log('No cleanup needed');
  }
  
  console.log('\n');
}

// Run all tests
async function runTests() {
  try {
    await testWriteSingleDeepDomain();
    await testWriteDomainWithSubDomains();
    await testWriteExcludedDomain();
    await testWriteExclusionRecord();
    await testWriteExclusionRecordForDeepDomain();
    await testWriteMultipleDomains();
    await testWriteMultipleExclusionRecords();
    await testSpecialCharacterEscaping();
    await testWriteMasterIndex();
    await testMasterIndexWithFailures();
    
    console.log('✅ All tests completed successfully!');
    console.log('\nNote: Test files were written to test-output/specs/');
    console.log('Run cleanup to remove test files.');
    
    // Optionally cleanup
    // await cleanup();
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

runTests();
