// apps/orchestrator/src/middleware/tracing.ts

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  trace,
  context,
  SpanStatusCode,
  Span,
  Context,
} from '@opentelemetry/api';
import { initializeTracing } from '@llm/shared-observability';

const tracer = trace.getTracer('orchestrator', '1.0.0');

export async function setupTracing(fastify: FastifyInstance) {
  // Initialize OpenTelemetry
  initializeTracing({
    serviceName: 'orchestrator',
    serviceVersion: process.env.npm_package_version || '0.1.0',
    enabled: process.env.OTEL_ENABLED === 'true',
  });

  // Add tracing middleware
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const spanName = `${request.method} ${request.routeOptions?.url || request.url}`;
    
    const span = tracer.startSpan(spanName, {
      attributes: {
        'http.method': request.method,
        'http.url': request.url,
        'http.route': request.routeOptions?.url,
        'http.target': request.url,
        'http.host': request.headers.host,
        'http.scheme': request.protocol,
        'http.user_agent': request.headers['user-agent'],
        'net.peer.ip': request.ip,
      },
    });

    // Store span in request context
    (request as any).span = span;
    (request as any).tracingContext = context.active();
  });

  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const span = (request as any).span as Span;
    if (span) {
      span.setAttributes({
        'http.status_code': reply.statusCode,
        'http.response_content_length': (reply as any).payload?.length || 0,
      });
      span.end();
    }
  });

  fastify.addHook('onError', async (request: FastifyRequest, reply: FastifyReply, error: Error) => {
    const span = (request as any).span as Span;
    if (span) {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
    }
  });

  fastify.log.info('Tracing middleware configured');
}

// Extend Fastify types
declare module 'fastify' {
  interface FastifyRequest {
    span?: Span;
    tracingContext?: Context;
  }
}

/**
 * Helper to create child spans
 */
export function createChildSpan(
  name: string,
  parentSpan: Span,
  attributes?: Record<string, any>
): Span {
  const ctx = trace.setSpan(context.active(), parentSpan);
  return tracer.startSpan(name, { attributes }, ctx);
}

/**
 * Trace async function execution
 */
export async function traceAsync<T>(
  name: string,
  fn: () => Promise<T>,
  parentSpan?: Span,
  attributes?: Record<string, any>
): Promise<T> {
  const ctx = parentSpan ? trace.setSpan(context.active(), parentSpan) : context.active();
  const span = tracer.startSpan(name, { attributes }, ctx);

  try {
    const result = await fn();
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error: any) {
    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
    throw error;
  } finally {
    span.end();
  }
}
