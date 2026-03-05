// packages/shared-observability/src/metrics.ts

import client, { Registry, Counter, Histogram, Gauge, Summary } from 'prom-client';

export interface MetricsConfig {
  serviceName: string;
  prefix?: string;
  defaultLabels?: Record<string, string>;
}

export class MetricsRegistry {
  private registry: Registry;
  private prefix: string;
  private defaultLabels: Record<string, string>;

  // Common metrics
  public httpRequestsTotal: Counter<string>;
  public httpRequestDuration: Histogram<string>;
  public httpRequestsInProgress: Gauge<string>;

  // LLM metrics
  public llmCallsTotal: Counter<string>;
  public llmCallDuration: Histogram<string>;
  public llmTokensTotal: Counter<string>;
  public llmErrorsTotal: Counter<string>;

  // Pipeline metrics
  public pipelineRunsTotal: Counter<string>;
  public pipelineDuration: Histogram<string>;
  public pipelineStepsTotal: Counter<string>;
  public pipelineStepDuration: Histogram<string>;

  // Indexer metrics
  public indexerOperationsTotal: Counter<string>;
  public indexerOperationDuration: Histogram<string>;
  public indexerDocumentsTotal: Gauge<string>;
  public indexerEmbeddingsTotal: Counter<string>;

  // Custom metrics storage
  private customMetrics: Map<string, client.Metric<string>> = new Map();

  constructor(config: MetricsConfig) {
    this.registry = new Registry();
    this.prefix = config.prefix || '';
    this.defaultLabels = config.defaultLabels || {
      service: config.serviceName,
    };

    // Apply default labels
    this.registry.setDefaultLabels(this.defaultLabels);

    // Initialize common metrics
    this.httpRequestsTotal = this.createCounter('http_requests_total', 'Total HTTP requests', ['method', 'path', 'status']);
    this.httpRequestDuration = this.createHistogram('http_request_duration_seconds', 'HTTP request duration', ['method', 'path'], [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10]);
    this.httpRequestsInProgress = this.createGauge('http_requests_in_progress', 'HTTP requests in progress', ['method', 'path']);

    // LLM metrics
    this.llmCallsTotal = this.createCounter('llm_calls_total', 'Total LLM API calls', ['provider', 'model', 'status']);
    this.llmCallDuration = this.createHistogram('llm_call_duration_seconds', 'LLM API call duration', ['provider', 'model'], [0.5, 1, 2, 5, 10, 30, 60, 120]);
    this.llmTokensTotal = this.createCounter('llm_tokens_total', 'Total LLM tokens used', ['provider', 'model', 'type']);
    this.llmErrorsTotal = this.createCounter('llm_errors_total', 'Total LLM errors', ['provider', 'error_type']);

    // Pipeline metrics
    this.pipelineRunsTotal = this.createCounter('pipeline_runs_total', 'Total pipeline runs', ['mode', 'status']);
    this.pipelineDuration = this.createHistogram('pipeline_duration_seconds', 'Pipeline execution duration', ['mode'], [5, 10, 30, 60, 120, 300]);
    this.pipelineStepsTotal = this.createCounter('pipeline_steps_total', 'Total pipeline steps executed', ['step', 'status']);
    this.pipelineStepDuration = this.createHistogram('pipeline_step_duration_seconds', 'Pipeline step duration', ['step'], [0.1, 0.5, 1, 5, 10, 30]);

    // Indexer metrics
    this.indexerOperationsTotal = this.createCounter('indexer_operations_total', 'Total indexer operations', ['operation', 'status']);
    this.indexerOperationDuration = this.createHistogram('indexer_operation_duration_seconds', 'Indexer operation duration', ['operation'], [0.1, 0.5, 1, 5, 10, 30]);
    this.indexerDocumentsTotal = this.createGauge('indexer_documents_total', 'Total indexed documents', []);
    this.indexerEmbeddingsTotal = this.createCounter('indexer_embeddings_total', 'Total embeddings generated', []);

    // Register default metrics
    client.collectDefaultMetrics({ register: this.registry });
  }

  // Factory methods
  createCounter(name: string, help: string, labelNames: string[] = []): Counter<string> {
    const metricName = this.getMetricName(name);
    const counter = new client.Counter({
      name: metricName,
      help,
      labelNames,
      registers: [this.registry],
    });
    this.customMetrics.set(metricName, counter);
    return counter;
  }

  createHistogram(name: string, help: string, labelNames: string[] = [], buckets?: number[]): Histogram<string> {
    const metricName = this.getMetricName(name);
    const histogram = new client.Histogram({
      name: metricName,
      help,
      labelNames,
      buckets,
      registers: [this.registry],
    });
    this.customMetrics.set(metricName, histogram);
    return histogram;
  }

  createGauge(name: string, help: string, labelNames: string[] = []): Gauge<string> {
    const metricName = this.getMetricName(name);
    const gauge = new client.Gauge({
      name: metricName,
      help,
      labelNames,
      registers: [this.registry],
    });
    this.customMetrics.set(metricName, gauge);
    return gauge;
  }

  createSummary(name: string, help: string, labelNames: string[] = []): Summary<string> {
    const metricName = this.getMetricName(name);
    const summary = new client.Summary({
      name: metricName,
      help,
      labelNames,
      registers: [this.registry],
    });
    this.customMetrics.set(metricName, summary);
    return summary;
  }

  private getMetricName(name: string): string {
    return this.prefix ? `${this.prefix}_${name}` : name;
  }

  /**
   * Get metrics output for Prometheus scraping
   */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /**
   * Get content type
   */
  getContentType(): string {
    return this.registry.contentType;
  }

  /**
   * Clear all metrics (for testing)
   */
  clear(): void {
    this.registry.clear();
  }
}

// Singleton instances
let orchestratorMetrics: MetricsRegistry | null = null;
let indexerMetrics: MetricsRegistry | null = null;

export function getOrchestratorMetrics(): MetricsRegistry {
  if (!orchestratorMetrics) {
    orchestratorMetrics = new MetricsRegistry({
      serviceName: 'orchestrator',
      prefix: 'llm_council',
    });
  }
  return orchestratorMetrics;
}

export function getIndexerMetrics(): MetricsRegistry {
  if (!indexerMetrics) {
    indexerMetrics = new MetricsRegistry({
      serviceName: 'indexer',
      prefix: 'llm_council',
    });
  }
  return indexerMetrics;
}
