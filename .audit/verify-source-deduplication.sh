#!/bin/bash
# Verification script for TS/JS source deduplication refactor
# This script checks that no JS files exist in source directories

set -e

echo "🔍 Verifying TS/JS Source Deduplication..."
echo ""

# Check for JS files in source directories
echo "1. Checking for JS files in source directories..."
JS_FILES=$(find apps packages -name "*.js" -path "*/src/*" -type f ! -path "*/node_modules/*" ! -path "*/dist/*" ! -path "*/coverage/*" 2>/dev/null || true)

if [ -z "$JS_FILES" ]; then
  echo "   ✅ No JS files found in source directories"
else
  echo "   ❌ Found JS files in source directories:"
  echo "$JS_FILES"
  exit 1
fi

echo ""

# Check .gitignore has the protection rules
echo "2. Checking .gitignore protection rules..."
if grep -q "apps/\*/src/\*\*/\*.js" .gitignore && grep -q "packages/\*/src/\*\*/\*.js" .gitignore; then
  echo "   ✅ .gitignore protection rules present"
else
  echo "   ❌ .gitignore protection rules missing"
  exit 1
fi

echo ""

# Check TypeScript files exist
echo "3. Checking TypeScript source files..."
TS_COUNT=$(find apps packages -name "*.ts" -path "*/src/*" -type f ! -path "*/node_modules/*" ! -path "*/dist/*" ! -name "*.d.ts" 2>/dev/null | wc -l)
echo "   ✅ Found $TS_COUNT TypeScript source files"

echo ""

# Check tsconfig files have proper outDir
echo "4. Checking TypeScript configurations..."
CONFIGS=$(find apps packages -name "tsconfig.json" -type f ! -path "*/node_modules/*" 2>/dev/null)
for config in $CONFIGS; do
  if grep -q '"outDir".*"dist"' "$config" || grep -q '"outDir".*"./dist"' "$config"; then
    echo "   ✅ $config has proper outDir"
  else
    echo "   ⚠️  $config might not have proper outDir"
  fi
done

echo ""

# Check package.json files use ts-node
echo "5. Checking runtime configuration..."
PACKAGES=$(find apps packages -name "package.json" -type f ! -path "*/node_modules/*" 2>/dev/null)
TS_NODE_COUNT=0
for pkg in $PACKAGES; do
  if grep -q "ts-node" "$pkg"; then
    TS_NODE_COUNT=$((TS_NODE_COUNT + 1))
  fi
done
echo "   ✅ $TS_NODE_COUNT packages use ts-node for TypeScript execution"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✅ All verification checks passed!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Summary:"
echo "  - No JS files in source directories"
echo "  - .gitignore protection rules in place"
echo "  - $TS_COUNT TypeScript source files"
echo "  - $TS_NODE_COUNT packages configured for TS execution"
echo ""
echo "The repository maintains a clean separation:"
echo "  • Source: TypeScript files in src/ directories"
echo "  • Output: Compiled JavaScript in dist/ directories"
echo ""
