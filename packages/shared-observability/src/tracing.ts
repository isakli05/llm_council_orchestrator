// packages/shared-observability/src/tracing.ts

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

export interface TracingConfig {
  serviceName: string;
  serviceVersion: string;
  otlpEndpoint?: string;
  samplingRatio?: number;
  enabled?: boolean;
}

let sdk: NodeSDK | null = null;

export function initializeTracing(config: TracingConfig): NodeSDK | null {
  const {
    serviceName,
    serviceVersion,
    otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317',
    samplingRatio = parseFloat(process.env.OTEL_TRACES_SAMPLER_ARG || '1.0'),
    enabled = process.env.OTEL_ENABLED === 'true',
  } = config;

  if (!enabled) {
    console.info('OpenTelemetry tracing disabled');
    return null;
  }

  // Resource attributes
  const resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    [SemanticResourceAttributes.SERVICE_VERSION]: serviceVersion,
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
  });

  // Trace exporter
  const traceExporter = new OTLPTraceExporter({
    url: otlpEndpoint,
  });

  // Metric exporter
  const metricExporter = new OTLPMetricExporter({
    url: otlpEndpoint,
  });

  // Initialize SDK
  sdk = new NodeSDK({
    resource,
    spanProcessor: new BatchSpanProcessor(traceExporter) as any,
    metricReader: new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 60000,
    }) as any,
  });

  // Start SDK
  sdk.start();

  console.info(`OpenTelemetry initialized for ${serviceName}`);

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    if (sdk) {
      await sdk.shutdown();
      console.info('OpenTelemetry terminated');
    }
  });

  return sdk;
}

/**
 * Shutdown tracing
 */
export async function shutdownTracing(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    sdk = null;
  }
}
