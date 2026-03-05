// apps/orchestrator/src/middleware/metrics.ts

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getOrchestratorMetrics } from '@llm/shared-observability';

export async function setupMetrics(fastify: FastifyInstance) {
  const metrics = getOrchestratorMetrics();

  // Track HTTP requests
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const path = request.routeOptions?.url || request.url;
    metrics.httpRequestsInProgress.labels(request.method, path).inc();
  });

  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const path = request.routeOptions?.url || request.url;
    const statusCode = reply.statusCode.toString();

    metrics.httpRequestsTotal.labels(request.method, path, statusCode).inc();
    metrics.httpRequestDuration.labels(request.method, path).observe(reply.elapsedTime / 1000);
    metrics.httpRequestsInProgress.labels(request.method, path).dec();
  });

  // Expose metrics endpoint
  fastify.get('/metrics', async (request, reply) => {
    const metricsOutput = await metrics.getMetrics();
    reply.type(metrics.getContentType());
    return metricsOutput;
  });

  fastify.log.info('Metrics middleware configured');
}

/**
 * Helper to track LLM calls
 */
export function trackLlmCall(
  provider: string,
  model: string,
  durationMs: number,
  tokens: { prompt: number; completion: number },
  success: boolean
) {
  const metrics = getOrchestratorMetrics();

  metrics.llmCallsTotal.labels(provider, model, success ? 'success' : 'error').inc();
  metrics.llmCallDuration.labels(provider, model).observe(durationMs / 1000);
  metrics.llmTokensTotal.labels(provider, model, 'prompt').inc(tokens.prompt);
  metrics.llmTokensTotal.labels(provider, model, 'completion').inc(tokens.completion);
}

/**
 * Helper to track pipeline runs
 */
export function trackPipelineRun(
  mode: string,
  durationMs: number,
  success: boolean
) {
  const metrics = getOrchestratorMetrics();

  metrics.pipelineRunsTotal.labels(mode, success ? 'success' : 'error').inc();
  metrics.pipelineDuration.labels(mode).observe(durationMs / 1000);
}

/**
 * Helper to track pipeline steps
 */
export function trackPipelineStep(
  step: string,
  durationMs: number,
  success: boolean
) {
  const metrics = getOrchestratorMetrics();

  metrics.pipelineStepsTotal.labels(step, success ? 'success' : 'error').inc();
  metrics.pipelineStepDuration.labels(step).observe(durationMs / 1000);
}
