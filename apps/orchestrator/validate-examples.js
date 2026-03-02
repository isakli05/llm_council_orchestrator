/**
 * Simple validation script to verify examples are correctly structured
 * This runs without needing to execute the full TypeScript code
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Validating Domain Discovery Examples...\n');

const exampleFiles = [
  'src/discovery/example-php-monolith.ts',
  'src/discovery/example-nodejs-microservices.ts',
  'src/discovery/example-hybrid-cms.ts',
  'src/discovery/example-user-exclusion.ts',
  'src/discovery/run-all-examples.ts',
  'src/discovery/test-examples.ts',
];

const docFiles = [
  'src/discovery/EXAMPLES.md',
  'src/discovery/EXAMPLES_SUMMARY.md',
];

let allValid = true;

// Check example files exist and have content
console.log('📄 Checking Example Files:');
for (const file of exampleFiles) {
  const filePath = path.join(__dirname, file);
  try {
    const stats = fs.statSync(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Basic validation
    const hasImports = content.includes('import');
    const hasFunction = content.includes('async function') || content.includes('function');
    const hasExport = content.includes('export');
    const lineCount = content.split('\n').length;
    
    console.log(`  ✅ ${path.basename(file)}`);
    console.log(`     - Size: ${stats.size} bytes`);
    console.log(`     - Lines: ${lineCount}`);
    console.log(`     - Has imports: ${hasImports ? '✓' : '✗'}`);
    console.log(`     - Has functions: ${hasFunction ? '✓' : '✗'}`);
    console.log(`     - Has exports: ${hasExport ? '✓' : '✗'}`);
    
    if (!hasImports || !hasFunction) {
      console.log(`     ⚠️  Warning: File may be incomplete`);
      allValid = false;
    }
  } catch (err) {
    console.log(`  ❌ ${path.basename(file)} - NOT FOUND`);
    allValid = false;
  }
  console.log();
}

// Check documentation files
console.log('📚 Checking Documentation Files:');
for (const file of docFiles) {
  const filePath = path.join(__dirname, file);
  try {
    const stats = fs.statSync(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    const lineCount = content.split('\n').length;
    
    console.log(`  ✅ ${path.basename(file)}`);
    console.log(`     - Size: ${stats.size} bytes`);
    console.log(`     - Lines: ${lineCount}`);
    
    // Check for key sections
    if (file.includes('EXAMPLES.md')) {
      const hasUsage = content.includes('Run:') || content.includes('Usage');
      const hasExamples = content.includes('Example');
      console.log(`     - Has usage instructions: ${hasUsage ? '✓' : '✗'}`);
      console.log(`     - Has examples: ${hasExamples ? '✓' : '✗'}`);
    }
  } catch (err) {
    console.log(`  ❌ ${path.basename(file)} - NOT FOUND`);
    allValid = false;
  }
  console.log();
}

// Check TypeScript compilation
console.log('🔨 Checking TypeScript Compilation:');
const distFiles = exampleFiles.map(f => f.replace('src/', 'dist/').replace('.ts', '.js'));
let compiledCount = 0;
for (const file of distFiles) {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    compiledCount++;
  }
}
console.log(`  Compiled files: ${compiledCount}/${distFiles.length}`);
if (compiledCount === distFiles.length) {
  console.log(`  ✅ All examples compiled successfully\n`);
} else {
  console.log(`  ⚠️  Some examples not compiled\n`);
}

// Summary
console.log('═'.repeat(60));
if (allValid && compiledCount === distFiles.length) {
  console.log('✅ All validations passed!');
  console.log('\n📊 Summary:');
  console.log(`   - Example files: ${exampleFiles.length}`);
  console.log(`   - Documentation files: ${docFiles.length}`);
  console.log(`   - Total files created: ${exampleFiles.length + docFiles.length}`);
  console.log('\n✨ Examples are ready to use!');
  console.log('\nNote: To run examples, you would need ts-node or tsx:');
  console.log('  npm install -g tsx');
  console.log('  tsx src/discovery/example-php-monolith.ts');
  process.exit(0);
} else {
  console.log('❌ Some validations failed!');
  process.exit(1);
}
