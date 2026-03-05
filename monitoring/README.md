# Observability Stack

This directory contains configuration files for the LLM Council Orchestrator observability stack.

## Components

### Prometheus
- **Port:** 9090
- **Purpose:** Metrics collection and storage
- **Config:** `prometheus.yml`
- **Alert Rules:** `alert_rules.yml`

### Grafana
- **Port:** 3000
- **Purpose:** Visualization and dashboards
- **Default Credentials:** admin/admin
- **Data Sources:** Prometheus, Loki

### Loki
- **Port:** 3100
- **Purpose:** Log aggregation
- **Config:** `loki.yml`

### Promtail
- **Purpose:** Log shipping to Loki
- **Config:** `promtail.yml`

### Jaeger
- **Port:** 16686 (UI), 4317 (OTLP gRPC), 4318 (OTLP HTTP)
- **Purpose:** Distributed tracing
- **Protocol:** OpenTelemetry

### Alertmanager
- **Port:** 9093
- **Purpose:** Alert routing and management
- **Config:** `alertmanager.yml`

## Quick Start

### Start the Observability Stack

```bash
# Create network if it doesn't exist
docker network create llm-council

# Start all observability services
docker-compose -f docker-compose.observability.yml up -d
```

### Access UIs

- **Grafana:** http://localhost:3000 (admin/admin)
- **Prometheus:** http://localhost:9090
- **Jaeger:** http://localhost:16686
- **Alertmanager:** http://localhost:9093

### Check Metrics

```bash
# Orchestrator metrics
curl http://localhost:7001/metrics

# Indexer metrics
curl http://localhost:9001/metrics
```

### Check Health

```bash
# Basic health
curl http://localhost:7001/health

# Liveness probe
curl http://localhost:7001/health/liveness

# Readiness probe
curl http://localhost:7001/health/readiness

# Detailed health with metrics
curl http://localhost:7001/health/detailed
```

## Environment Variables

### OpenTelemetry Configuration

```bash
# Enable OpenTelemetry tracing
export OTEL_ENABLED=true

# OTLP endpoint (default: http://localhost:4317)
export OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4317

# Sampling ratio (0.0 to 1.0, default: 1.0)
export OTEL_TRACES_SAMPLER_ARG=1.0
```

### Logging Configuration

```bash
# Log level (trace, debug, info, warn, error, fatal)
export LOG_LEVEL=info

# Pretty print logs in development (default: true in dev, false in prod)
export NODE_ENV=development
```

## Metrics

### HTTP Metrics
- `llm_council_http_requests_total` - Total HTTP requests
- `llm_council_http_request_duration_seconds` - Request duration histogram
- `llm_council_http_requests_in_progress` - Current in-flight requests

### LLM Metrics
- `llm_council_llm_calls_total` - Total LLM API calls
- `llm_council_llm_call_duration_seconds` - LLM call duration
- `llm_council_llm_tokens_total` - Total tokens used
- `llm_council_llm_errors_total` - Total LLM errors

### Pipeline Metrics
- `llm_council_pipeline_runs_total` - Total pipeline runs
- `llm_council_pipeline_duration_seconds` - Pipeline execution duration
- `llm_council_pipeline_steps_total` - Total pipeline steps
- `llm_council_pipeline_step_duration_seconds` - Step duration

### Indexer Metrics
- `llm_council_indexer_operations_total` - Total indexer operations
- `llm_council_indexer_operation_duration_seconds` - Operation duration
- `llm_council_indexer_documents_total` - Total indexed documents
- `llm_council_indexer_embeddings_total` - Total embeddings generated

## Alerts

### Critical Alerts
- **HighErrorRate:** Error rate > 0.1 requests/s for 5 minutes
- **LLMProviderUnavailable:** Orchestrator down for 1 minute
- **HighMemoryUsage:** Memory usage > 90% for 5 minutes

### Warning Alerts
- **HighLatency:** 95th percentile latency > 2s for 5 minutes
- **PipelineFailures:** Pipeline failure rate > 0.05 runs/s for 5 minutes
- **IndexerQueueBackup:** > 100 operations in progress for 5 minutes

## Troubleshooting

### Logs Not Appearing in Loki

1. Check Promtail is running:
   ```bash
   docker logs llm_council_promtail
   ```

2. Verify log file paths in `promtail.yml`

3. Check Loki connectivity:
   ```bash
   curl http://localhost:3100/ready
   ```

### Metrics Not Showing in Prometheus

1. Check Prometheus targets:
   ```bash
   curl http://localhost:9090/api/v1/targets
   ```

2. Verify services are exposing `/metrics` endpoint

3. Check Prometheus logs:
   ```bash
   docker logs llm_council_prometheus
   ```

### Traces Not Appearing in Jaeger

1. Verify OTEL_ENABLED=true

2. Check Jaeger is receiving traces:
   ```bash
   curl http://localhost:16686/api/services
   ```

3. Verify OTLP endpoint is correct

## Grafana Dashboards

### Creating Dashboards

1. Log in to Grafana (http://localhost:3000)
2. Go to Dashboards → New Dashboard
3. Add panels with PromQL queries

### Example Queries

**Request Rate:**
```promql
rate(llm_council_http_requests_total[5m])
```

**Error Rate:**
```promql
rate(llm_council_http_requests_total{status=~"5.."}[5m])
```

**95th Percentile Latency:**
```promql
histogram_quantile(0.95, rate(llm_council_http_request_duration_seconds_bucket[5m]))
```

**LLM Token Usage:**
```promql
sum(rate(llm_council_llm_tokens_total[5m])) by (provider, model, type)
```

## Production Considerations

1. **Data Retention:** Configure appropriate retention periods in Prometheus and Loki
2. **Storage:** Use persistent volumes for production data
3. **Security:** Enable authentication and TLS for all services
4. **Alerting:** Configure proper alert receivers (email, Slack, PagerDuty)
5. **Backup:** Regular backups of Prometheus and Grafana data
6. **Scaling:** Consider using Thanos or Cortex for Prometheus scaling
