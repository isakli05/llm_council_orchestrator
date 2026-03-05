// packages/shared-observability/src/__tests__/metrics.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsRegistry } from '../metrics';

describe('MetricsRegistry', () => {
  let registry: MetricsRegistry;

  beforeEach(() => {
    registry = new MetricsRegistry({
      serviceName: 'test',
      prefix: 'test_prefix',
    });
  });

  it('should create counter metrics', () => {
    const counter = registry.createCounter('test_counter', 'Test counter');
    counter.inc();
    expect(counter).toBeDefined();
  });

  it('should create histogram metrics', () => {
    const histogram = registry.createHistogram('test_histogram', 'Test histogram', [], [0.1, 0.5, 1, 5]);
    histogram.observe(0.5);
    expect(histogram).toBeDefined();
  });

  it('should generate Prometheus output', async () => {
    registry.httpRequestsTotal.labels('GET', '/test', '200').inc();
    
    const output = await registry.getMetrics();
    expect(output).toContain('http_requests_total');
  });

  it('should apply prefix to metric names', async () => {
    registry.httpRequestsTotal.labels('GET', '/test', '200').inc();
    
    const output = await registry.getMetrics();
    expect(output).toContain('test_prefix_http_requests_total');
  });

  it('should track LLM metrics', () => {
    registry.llmCallsTotal.labels('openai', 'gpt-4', 'success').inc();
    registry.llmCallDuration.labels('openai', 'gpt-4').observe(1.5);
    registry.llmTokensTotal.labels('openai', 'gpt-4', 'prompt').inc(100);
    
    expect(registry.llmCallsTotal).toBeDefined();
    expect(registry.llmCallDuration).toBeDefined();
    expect(registry.llmTokensTotal).toBeDefined();
  });

  it('should track pipeline metrics', () => {
    registry.pipelineRunsTotal.labels('sequential', 'success').inc();
    registry.pipelineDuration.labels('sequential').observe(30);
    
    expect(registry.pipelineRunsTotal).toBeDefined();
    expect(registry.pipelineDuration).toBeDefined();
  });

  it('should track indexer metrics', () => {
    registry.indexerOperationsTotal.labels('index', 'success').inc();
    registry.indexerDocumentsTotal.set(1000);
    registry.indexerEmbeddingsTotal.inc(50);
    
    expect(registry.indexerOperationsTotal).toBeDefined();
    expect(registry.indexerDocumentsTotal).toBeDefined();
    expect(registry.indexerEmbeddingsTotal).toBeDefined();
  });
});
