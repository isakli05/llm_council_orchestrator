#!/bin/bash

# Observability Verification Script
# Verifies that all observability endpoints are working

set -e

echo "========================================="
echo "Observability Verification"
echo "========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if services are running
echo "1. Checking if services are running..."
echo ""

check_endpoint() {
    local name=$1
    local url=$2
    
    if curl -s -f "$url" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} $name is running"
        return 0
    else
        echo -e "${RED}✗${NC} $name is NOT running"
        return 1
    fi
}

# Check orchestrator
check_endpoint "Orchestrator" "http://localhost:7001/health"

# Check indexer
check_endpoint "Indexer" "http://localhost:9001/health"

echo ""
echo "2. Checking observability endpoints..."
echo ""

# Check metrics endpoints
check_endpoint "Orchestrator /metrics" "http://localhost:7001/metrics"
check_endpoint "Indexer /metrics" "http://localhost:9001/metrics"

# Check health endpoints
check_endpoint "Orchestrator /health/liveness" "http://localhost:7001/health/liveness"
check_endpoint "Orchestrator /health/readiness" "http://localhost:7001/health/readiness"
check_endpoint "Orchestrator /health/detailed" "http://localhost:7001/health/detailed"

echo ""
echo "3. Checking observability stack (if running)..."
echo ""

# Check Prometheus
if check_endpoint "Prometheus" "http://localhost:9090/-/healthy"; then
    echo "   Prometheus UI: http://localhost:9090"
fi

# Check Grafana
if check_endpoint "Grafana" "http://localhost:3000/api/health"; then
    echo "   Grafana UI: http://localhost:3000 (admin/admin)"
fi

# Check Jaeger
if check_endpoint "Jaeger" "http://localhost:16686"; then
    echo "   Jaeger UI: http://localhost:16686"
fi

# Check Loki
if check_endpoint "Loki" "http://localhost:3100/ready"; then
    echo "   Loki API: http://localhost:3100"
fi

echo ""
echo "4. Sample metrics from orchestrator..."
echo ""

# Get sample metrics
METRICS=$(curl -s http://localhost:7001/metrics 2>/dev/null || echo "")

if [ -n "$METRICS" ]; then
    echo "Sample metrics found:"
    echo "$METRICS" | grep -E "^llm_council_" | head -5
    echo "..."
    echo ""
    echo -e "${GREEN}✓${NC} Metrics are being collected"
else
    echo -e "${RED}✗${NC} Could not retrieve metrics"
fi

echo ""
echo "========================================="
echo "Verification Complete"
echo "========================================="
echo ""
echo "To start the observability stack:"
echo "  docker network create llm-council"
echo "  docker-compose -f docker-compose.observability.yml up -d"
echo ""
echo "To enable tracing:"
echo "  export OTEL_ENABLED=true"
echo ""
