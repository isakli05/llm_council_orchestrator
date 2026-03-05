#!/bin/bash

# Test script for Indexer API endpoints
# Usage: ./test-api.sh [API_KEY]

BASE_URL="http://localhost:9001"
API_KEY="${1:-}"

echo "=== Testing Indexer API ==="
echo "Base URL: $BASE_URL"
echo ""

# Test 1: Health check (no auth required)
echo "1. Testing GET /health"
curl -s "$BASE_URL/health" | jq '.'
echo ""

# Test 2: Readiness check (no auth required)
echo "2. Testing GET /health/ready"
curl -s "$BASE_URL/health/ready" | jq '.'
echo ""

# If no API key provided, skip authenticated tests
if [ -z "$API_KEY" ]; then
  echo "No API key provided. Skipping authenticated tests."
  echo "Usage: ./test-api.sh YOUR_API_KEY"
  exit 0
fi

# Test 3: Index ensure (requires auth)
echo "3. Testing POST /api/v1/index/ensure"
curl -s -X POST "$BASE_URL/api/v1/index/ensure" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{
    "project_root": "/tmp/test-project",
    "force_rebuild": false
  }' | jq '.'
echo ""

# Test 4: Search (requires auth)
echo "4. Testing POST /api/v1/search"
curl -s -X POST "$BASE_URL/api/v1/search" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{
    "query": "test function",
    "limit": 5
  }' | jq '.'
echo ""

# Test 5: Context (requires auth)
echo "5. Testing POST /api/v1/context"
curl -s -X POST "$BASE_URL/api/v1/context" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{
    "path": "src/main.ts",
    "options": {
      "maxChunks": 5,
      "includeRelated": true
    }
  }' | jq '.'
echo ""

# Test 6: Validation error (path traversal)
echo "6. Testing validation - path traversal rejection"
curl -s -X POST "$BASE_URL/api/v1/index/ensure" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{
    "project_root": "../../../etc/passwd"
  }' | jq '.'
echo ""

# Test 7: Validation error (SQL injection)
echo "7. Testing validation - SQL injection rejection"
curl -s -X POST "$BASE_URL/api/v1/search" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{"query": "DROP TABLE users"}' | jq '.'
echo ""

# Test 8: Auth error (no API key)
echo "8. Testing authentication - no API key"
curl -s -X POST "$BASE_URL/api/v1/search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "test"
  }' | jq '.'
echo ""

# Test 9: Auth error (invalid API key)
echo "9. Testing authentication - invalid API key"
curl -s -X POST "$BASE_URL/api/v1/search" \
  -H "Content-Type: application/json" \
  -H "x-api-key: invalid-key" \
  -d '{
    "query": "test"
  }' | jq '.'
echo ""

echo "=== Tests Complete ==="
