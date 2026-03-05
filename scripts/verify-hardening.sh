#!/bin/bash

# Production Hardening Verification Script
# Tests rate limiting, security headers, and circuit breaker status

echo "=== Production Hardening Verification ==="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ORCHESTRATOR_URL="${ORCHESTRATOR_URL:-http://localhost:7001}"
INDEXER_URL="${INDEXER_URL:-http://localhost:9001}"

echo "Testing Orchestrator at: $ORCHESTRATOR_URL"
echo "Testing Indexer at: $INDEXER_URL"
echo ""

# Test 1: Security Headers
echo "1. Testing Security Headers..."
HEADERS=$(curl -sI "$ORCHESTRATOR_URL/health" 2>/dev/null)

if echo "$HEADERS" | grep -q "x-content-type-options"; then
    echo -e "${GREEN}✓${NC} X-Content-Type-Options header present"
else
    echo -e "${RED}✗${NC} X-Content-Type-Options header missing"
fi

if echo "$HEADERS" | grep -q "x-frame-options"; then
    echo -e "${GREEN}✓${NC} X-Frame-Options header present"
else
    echo -e "${RED}✗${NC} X-Frame-Options header missing"
fi

if echo "$HEADERS" | grep -q "strict-transport-security"; then
    echo -e "${GREEN}✓${NC} Strict-Transport-Security header present"
else
    echo -e "${RED}✗${NC} Strict-Transport-Security header missing"
fi

echo ""

# Test 2: Rate Limiting Headers
echo "2. Testing Rate Limiting..."
RATE_HEADERS=$(curl -sI "$ORCHESTRATOR_URL/health" 2>/dev/null)

if echo "$RATE_HEADERS" | grep -q "x-ratelimit-limit"; then
    echo -e "${GREEN}✓${NC} Rate limit headers present"
    LIMIT=$(echo "$RATE_HEADERS" | grep -i "x-ratelimit-limit" | cut -d' ' -f2 | tr -d '\r')
    REMAINING=$(echo "$RATE_HEADERS" | grep -i "x-ratelimit-remaining" | cut -d' ' -f2 | tr -d '\r')
    echo "  Limit: $LIMIT, Remaining: $REMAINING"
else
    echo -e "${YELLOW}⚠${NC} Rate limit headers not found (may be disabled for health endpoint)"
fi

echo ""

# Test 3: Rate Limiting Enforcement
echo "3. Testing Rate Limiting Enforcement..."
echo "Making 15 rapid requests to test rate limiting..."

SUCCESS_COUNT=0
RATE_LIMITED_COUNT=0

for i in {1..15}; do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$ORCHESTRATOR_URL/health" 2>/dev/null)
    if [ "$STATUS" = "200" ]; then
        ((SUCCESS_COUNT++))
    elif [ "$STATUS" = "429" ]; then
        ((RATE_LIMITED_COUNT++))
    fi
done

echo "  Successful requests: $SUCCESS_COUNT"
echo "  Rate limited requests: $RATE_LIMITED_COUNT"

if [ $RATE_LIMITED_COUNT -gt 0 ]; then
    echo -e "${GREEN}✓${NC} Rate limiting is working"
else
    echo -e "${YELLOW}⚠${NC} No rate limiting detected (may be configured with high limits)"
fi

echo ""

# Test 4: Circuit Breaker Status
echo "4. Testing Circuit Breaker Status Endpoint..."
DETAILED_HEALTH=$(curl -s "$ORCHESTRATOR_URL/health/detailed" 2>/dev/null)

if [ $? -eq 0 ] && [ -n "$DETAILED_HEALTH" ]; then
    echo -e "${GREEN}✓${NC} /health/detailed endpoint accessible"
    
    # Check if response contains expected fields
    if echo "$DETAILED_HEALTH" | grep -q "degradation"; then
        echo -e "${GREEN}✓${NC} Degradation level information present"
        LEVEL=$(echo "$DETAILED_HEALTH" | grep -o '"level":"[^"]*"' | cut -d'"' -f4)
        echo "  Current level: $LEVEL"
    fi
    
    if echo "$DETAILED_HEALTH" | grep -q "circuits"; then
        echo -e "${GREEN}✓${NC} Circuit breaker information present"
    fi
else
    echo -e "${RED}✗${NC} /health/detailed endpoint not accessible"
fi

echo ""

# Test 5: Indexer Security
echo "5. Testing Indexer Security..."
INDEXER_HEADERS=$(curl -sI "$INDEXER_URL/health" 2>/dev/null)

if [ $? -eq 0 ]; then
    if echo "$INDEXER_HEADERS" | grep -q "x-content-type-options"; then
        echo -e "${GREEN}✓${NC} Indexer security headers present"
    else
        echo -e "${RED}✗${NC} Indexer security headers missing"
    fi
    
    if echo "$INDEXER_HEADERS" | grep -q "x-ratelimit-limit"; then
        echo -e "${GREEN}✓${NC} Indexer rate limiting enabled"
    else
        echo -e "${YELLOW}⚠${NC} Indexer rate limiting headers not found"
    fi
else
    echo -e "${YELLOW}⚠${NC} Indexer not accessible at $INDEXER_URL"
fi

echo ""
echo "=== Verification Complete ==="
echo ""
echo "Note: Some tests may show warnings if services are not running."
echo "Start services with: pnpm dev"
